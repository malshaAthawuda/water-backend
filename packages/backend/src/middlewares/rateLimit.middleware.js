const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Strict per-IP limiter for credential endpoints (login / register).
 *
 * The global /api limiter is sized for normal browsing and is far too
 * generous for password guessing. This limiter only counts failed
 * requests (skipSuccessfulRequests), so a real user who logs in
 * successfully is never throttled, while an IP that keeps failing is
 * blocked for the rest of the window.
 *
 * Works alongside the per-account lockout in auth.service.login:
 *  - lockout stops many IPs attacking one account
 *  - this limiter stops one IP spraying passwords across many accounts
 */
const createAuthLimiter = (overrides = {}) => rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            statusCode: options.statusCode,
            message: 'Too many authentication attempts from this IP, please try again later.',
            timestamp: new Date().toISOString(),
        });
    },
    ...overrides,
});

// The API test suites log in hundreds of times from 127.0.0.1, so the shared
// limiter is disabled there; the limiter itself is tested via createAuthLimiter.
const authLimiter = config.env === 'test'
    ? (req, res, next) => next()
    : createAuthLimiter();

module.exports = {
    authLimiter,
    createAuthLimiter,
};
