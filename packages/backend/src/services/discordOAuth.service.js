const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { User, UserRole } = require('../models/User.model');
const OAuthState = require('../models/OAuthState.model');
const OAuthTicket = require('../models/OAuthTicket.model');

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_API_URL = 'https://discord.com/api/v10';

const STATE_TTL_MS = 10 * 60 * 1000;       // user has 10 minutes to approve on Discord
const LOGIN_TICKET_TTL_MS = 60 * 1000;     // SPA swaps the login ticket immediately
const LINK_TICKET_TTL_MS = 2 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10 * 1000;

/**
 * Error with a stable, non-sensitive code that is safe to show the user
 * (it ends up in the frontend redirect as ?oauth_error=<code>).
 */
class OAuthError extends Error {
    constructor(code, message) {
        super(message || code);
        this.name = 'OAuthError';
        this.code = code;
    }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

const isConfigured = () => Boolean(config.discord.clientId && config.discord.clientSecret);

// ─── Authorization request / state ──────────────────────────────

/**
 * Create a single-use state value and the Discord authorization URL.
 * @param {{ mode: 'login'|'link', userId?: string }} options
 * @returns {Promise<{ state: string, url: string }>}
 */
const createAuthorizationRequest = async ({ mode, userId = null }) => {
    const state = randomToken();

    await OAuthState.create({
        stateHash: sha256(state),
        provider: 'discord',
        mode,
        user: userId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.discord.clientId,
        redirect_uri: config.discord.redirectUri,
        scope: config.discord.scopes.join(' '),
        state,
        prompt: 'consent',
    });

    return { state, url: `${DISCORD_AUTHORIZE_URL}?${params.toString()}` };
};

/**
 * Validate and consume a state value returned by Discord.
 * The value must match the one bound to this browser (cookie) and exist,
 * unexpired, in the database. It is deleted so it can never be replayed.
 */
const consumeState = async (stateFromQuery, stateFromCookie) => {
    if (typeof stateFromQuery !== 'string' || typeof stateFromCookie !== 'string') {
        throw new OAuthError('invalid_state', 'Missing OAuth state');
    }

    const a = Buffer.from(stateFromQuery);
    const b = Buffer.from(stateFromCookie);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new OAuthError('invalid_state', 'OAuth state does not match this browser session');
    }

    const record = await OAuthState.findOneAndDelete({
        stateHash: sha256(stateFromQuery),
        expiresAt: { $gt: new Date() },
    });

    if (!record) {
        throw new OAuthError('invalid_state', 'OAuth state is unknown, expired or already used');
    }
    return record;
};

// ─── Calls to Discord ───────────────────────────────────────────

/**
 * Exchange the authorization code for an access token (back-channel,
 * authenticated with the client secret).
 */
const exchangeCode = async (code) => {
    if (typeof code !== 'string' || !code) {
        throw new OAuthError('invalid_request', 'Missing authorization code');
    }

    const response = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.discord.redirectUri,
            client_id: config.discord.clientId,
            client_secret: config.discord.clientSecret,
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (!response.ok) {
        logger.warn(`Discord token exchange failed with HTTP ${response.status}`);
        throw new OAuthError('token_exchange_failed');
    }

    const token = await response.json();
    const granted = String(token.scope || '').split(' ');
    if (!token.access_token || !config.discord.scopes.every((s) => granted.includes(s))) {
        throw new OAuthError('insufficient_scope', 'Discord did not grant the required scopes');
    }
    return token;
};

/**
 * Fetch the Discord user that authorized the request.
 */
const fetchDiscordUser = async (accessToken) => {
    const response = await fetch(`${DISCORD_API_URL}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (!response.ok) {
        logger.warn(`Discord /users/@me failed with HTTP ${response.status}`);
        throw new OAuthError('profile_fetch_failed');
    }

    const profile = await response.json();
    if (!profile || typeof profile.id !== 'string') {
        throw new OAuthError('profile_fetch_failed');
    }
    return profile;
};

/**
 * We only need the Discord token once to read the profile, so revoke it
 * straight away instead of keeping a credential we do not use.
 */
const revokeAccessToken = async (accessToken) => {
    try {
        await fetch(`${DISCORD_API_URL}/oauth2/token/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                token: accessToken,
                token_type_hint: 'access_token',
                client_id: config.discord.clientId,
                client_secret: config.discord.clientSecret,
            }),
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
    } catch (err) {
        logger.warn(`Could not revoke Discord access token: ${err.message}`);
    }
};

/**
 * Full back-channel step: code -> token -> profile -> revoke token.
 */
const getProfileFromCode = async (code) => {
    const token = await exchangeCode(code);
    try {
        return await fetchDiscordUser(token.access_token);
    } finally {
        await revokeAccessToken(token.access_token);
    }
};

// ─── Mapping Discord identities to local accounts ───────────────

const displayName = (profile) =>
    String(profile.global_name || profile.username || 'Discord User').slice(0, 100).padEnd(2, '_');

/**
 * Find or create the local account for a Discord sign-in.
 *
 * Existing local accounts are NOT merged automatically by email: this app
 * does not verify emails at registration, so an attacker could pre-register
 * a victim's address and get access once the victim signs in with Discord
 * (pre-account takeover). Such users must sign in with their password and
 * link Discord explicitly.
 */
const findOrCreateUserForLogin = async (profile) => {
    const existingLink = await User.findOne({ discordId: profile.id });
    if (existingLink) {
        if (existingLink.discordUsername !== profile.username) {
            existingLink.discordUsername = profile.username;
            await existingLink.save({ validateBeforeSave: false });
        }
        return existingLink;
    }

    if (!profile.email || profile.verified !== true) {
        throw new OAuthError('discord_email_unverified', 'Discord account has no verified email');
    }

    const email = profile.email.toLowerCase();
    if (await User.findByEmail(email)) {
        throw new OAuthError('account_exists', 'An account with this email already exists');
    }

    const user = await User.create({
        name: displayName(profile),
        email,
        discordId: profile.id,
        discordUsername: profile.username,
        role: UserRole.USER,        // OAuth sign-up never grants privileges
        isEmailVerified: true,      // Discord verified the address
    });

    logger.info(`New user registered via Discord: ${email}`);
    return user;
};

/**
 * Attach a Discord identity to an existing, signed-in account.
 */
const linkDiscordAccount = async (userId, profile) => {
    const owner = await User.findOne({ discordId: profile.id });
    if (owner && owner._id.toString() !== userId.toString()) {
        throw new OAuthError('discord_already_linked', 'This Discord account is linked to another user');
    }

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
        throw new OAuthError('account_unavailable');
    }

    user.discordId = profile.id;
    user.discordUsername = profile.username;
    await user.save({ validateBeforeSave: false });

    logger.info(`Discord account linked for user ${user.email}`);
    return user;
};

/**
 * Remove the Discord link. Refused for Discord-only accounts, which would
 * otherwise be left with no way to sign in.
 */
const unlinkDiscordAccount = async (userId) => {
    const user = await User.findById(userId).select('+password');
    if (!user.discordId) {
        throw new OAuthError('not_linked', 'No Discord account is linked');
    }
    if (!user.password) {
        throw new OAuthError('password_required', 'Set a password before unlinking Discord');
    }
    user.discordId = undefined;
    user.discordUsername = undefined;
    await user.save({ validateBeforeSave: false });
    return user;
};

// ─── One-time tickets ──────────────────────────────────────────

const issueTicket = async (userId, purpose) => {
    const ticket = randomToken();
    await OAuthTicket.create({
        ticketHash: sha256(ticket),
        purpose,
        user: userId,
        expiresAt: new Date(Date.now() + (purpose === 'login' ? LOGIN_TICKET_TTL_MS : LINK_TICKET_TTL_MS)),
    });
    return ticket;
};

/**
 * Redeem (and delete) a ticket. Returns the user id or throws.
 */
const redeemTicket = async (ticket, purpose) => {
    if (typeof ticket !== 'string' || !ticket) {
        throw new OAuthError('invalid_ticket');
    }
    const record = await OAuthTicket.findOneAndDelete({
        ticketHash: sha256(ticket),
        purpose,
        expiresAt: { $gt: new Date() },
    });
    if (!record) {
        throw new OAuthError('invalid_ticket', 'Ticket is invalid, expired or already used');
    }
    return record.user;
};

module.exports = {
    OAuthError,
    isConfigured,
    createAuthorizationRequest,
    consumeState,
    getProfileFromCode,
    findOrCreateUserForLogin,
    linkDiscordAccount,
    unlinkDiscordAccount,
    issueTicket,
    redeemTicket,
};
