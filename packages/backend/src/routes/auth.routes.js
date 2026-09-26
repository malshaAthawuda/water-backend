const express = require('express');
const authController = require('../controllers/auth.controller');
const oauthController = require('../controllers/oauth.controller');
const authenticate = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const { registerSchema, loginSchema, oauthTicketSchema } = require('../validations/auth.validation');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Successfully registered
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', authenticate, authController.logout);

// ─── OAuth 2.0: Sign in with Discord (Authorization Code grant) ──────

/**
 * @swagger
 * /auth/discord:
 *   get:
 *     summary: Start Discord OAuth 2.0 sign-in (browser redirect)
 *     description: >
 *       Creates a single-use state value (stored hashed and bound to the browser
 *       with an httpOnly cookie) and redirects to Discord's consent screen.
 *       With ?link_ticket= it starts the "link Discord to my account" flow instead.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: link_ticket
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to Discord
 *       503:
 *         description: Discord login is not configured
 */
router.get('/discord', authLimiter, oauthController.startDiscordAuth);

/**
 * @swagger
 * /auth/discord/callback:
 *   get:
 *     summary: Discord OAuth 2.0 redirect URI
 *     description: >
 *       Verifies state, exchanges the authorization code for an access token,
 *       reads the Discord profile, then redirects to the frontend with a
 *       one-time login ticket (or an error code) in the URL fragment.
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to the frontend /oauth/callback page
 */
router.get('/discord/callback', oauthController.discordCallback);

/**
 * @swagger
 * /auth/discord/exchange:
 *   post:
 *     summary: Exchange a one-time Discord login ticket for an API token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ticket]
 *             properties:
 *               ticket:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid or expired ticket
 */
router.post('/discord/exchange', authLimiter, validate(oauthTicketSchema), oauthController.exchangeLoginTicket);

/**
 * @swagger
 * /auth/discord/link:
 *   post:
 *     summary: Get a one-time ticket to link a Discord account to the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns the path to navigate to (relative to the API base)
 *   delete:
 *     summary: Unlink the Discord account from the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Discord account unlinked
 */
router.post('/discord/link', authenticate, oauthController.createLinkTicket);
router.delete('/discord/link', authenticate, oauthController.unlinkDiscord);

module.exports = router;
