const config = require('../config');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const authService = require('../services/auth.service');
const discord = require('../services/discordOAuth.service');
const { User } = require('../models/User.model');

const STATE_COOKIE = 'wq_oauth_state';
const STATE_COOKIE_PATH = '/api/v1/auth/discord';

// httpOnly: not readable by page scripts; SameSite=Lax: sent on the top-level
// redirect back from Discord but not on cross-site sub-requests.
const stateCookieOptions = () => ({
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax',
    path: STATE_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
});

const readCookie = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) {
            try {
                return decodeURIComponent(rest.join('='));
            } catch {
                return undefined;
            }
        }
    }
    return undefined;
};

/**
 * Send the browser back to the SPA. Results go in the URL fragment (#...),
 * which browsers never send to servers or put in Referer headers.
 */
const redirectToFrontend = (res, fragment) =>
    res.redirect(302, `${config.frontendUrl}/oauth/callback#${new URLSearchParams(fragment)}`);

const ensureConfigured = () => {
    if (!discord.isConfigured()) {
        throw new ApiError(503, 'Discord login is not configured on this server');
    }
};

/**
 * @desc    Start "Sign in with Discord" (or, with ?link_ticket=, the link flow)
 * @route   GET /api/v1/auth/discord
 * @access  Public (browser navigation)
 */
const startDiscordAuth = asyncHandler(async (req, res) => {
    ensureConfigured();

    let mode = 'login';
    let userId = null;

    if (req.query.link_ticket !== undefined) {
        try {
            userId = await discord.redeemTicket(req.query.link_ticket, 'link');
            mode = 'link';
        } catch (err) {
            return redirectToFrontend(res, { error: 'invalid_ticket' });
        }
    }

    const { state, url } = await discord.createAuthorizationRequest({ mode, userId });
    res.cookie(STATE_COOKIE, state, stateCookieOptions());
    return res.redirect(302, url);
});

/**
 * @desc    Discord redirects here after the user approves (or denies) access
 * @route   GET /api/v1/auth/discord/callback
 * @access  Public (browser navigation)
 */
const discordCallback = asyncHandler(async (req, res) => {
    const cookieState = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });

    try {
        ensureConfigured();

        const stateRecord = await discord.consumeState(req.query.state, cookieState);

        // User pressed "Cancel" on Discord's consent screen
        if (req.query.error) {
            throw new discord.OAuthError('access_denied');
        }

        const profile = await discord.getProfileFromCode(req.query.code);

        if (stateRecord.mode === 'link') {
            await discord.linkDiscordAccount(stateRecord.user, profile);
            return redirectToFrontend(res, { linked: 'discord' });
        }

        const user = await discord.findOrCreateUserForLogin(profile);
        if (!user.isActive) {
            throw new discord.OAuthError('account_deactivated');
        }

        const ticket = await discord.issueTicket(user._id, 'login');
        return redirectToFrontend(res, { ticket });
    } catch (err) {
        const code = err instanceof discord.OAuthError ? err.code : 'server_error';
        if (!(err instanceof discord.OAuthError)) {
            logger.error(`Discord OAuth callback failed: ${err.message}`);
        } else {
            logger.warn(`Discord OAuth callback rejected: ${err.code}`);
        }
        return redirectToFrontend(res, { error: code });
    }
});

/**
 * @desc    Swap a one-time login ticket for the application JWT
 * @route   POST /api/v1/auth/discord/exchange
 * @access  Public
 */
const exchangeLoginTicket = asyncHandler(async (req, res) => {
    let userId;
    try {
        userId = await discord.redeemTicket(req.body.ticket, 'login');
    } catch (err) {
        throw ApiError.unauthorized('Invalid or expired login ticket');
    }

    const user = await User.findById(userId).select('+tokenVersion');
    if (!user || !user.isActive) {
        throw ApiError.unauthorized('Account is not available');
    }

    const result = await authService.startSession(user, 'discord');
    return ApiResponse.success(res, result, 'Login successful');
});

/**
 * @desc    Issue a short-lived ticket that lets the signed-in user start the
 *          "link Discord account" flow with a normal browser navigation
 * @route   POST /api/v1/auth/discord/link
 * @access  Private
 */
const createLinkTicket = asyncHandler(async (req, res) => {
    ensureConfigured();

    if (req.user.discordId) {
        throw ApiError.conflict('A Discord account is already linked');
    }

    const ticket = await discord.issueTicket(req.user._id, 'link');
    return ApiResponse.success(res, {
        path: `/auth/discord?link_ticket=${encodeURIComponent(ticket)}`,
    }, 'Link ticket created');
});

/**
 * @desc    Unlink the Discord account from the signed-in user
 * @route   DELETE /api/v1/auth/discord/link
 * @access  Private
 */
const unlinkDiscord = asyncHandler(async (req, res) => {
    try {
        await discord.unlinkDiscordAccount(req.user._id);
    } catch (err) {
        if (err instanceof discord.OAuthError) {
            throw ApiError.badRequest(err.message);
        }
        throw err;
    }
    return ApiResponse.success(res, null, 'Discord account unlinked');
});

module.exports = {
    startDiscordAuth,
    discordCallback,
    exchangeLoginTicket,
    createLinkTicket,
    unlinkDiscord,
    STATE_COOKIE,
};
