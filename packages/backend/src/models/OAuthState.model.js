const mongoose = require('mongoose');

/**
 * Pending OAuth authorization requests.
 *
 * Every redirect to Discord gets a random, single-use "state" value. Only its
 * SHA-256 hash is stored. The callback must present the same value both in
 * the query string and in the httpOnly cookie set when the flow started,
 * which defeats login CSRF / authorization-code injection.
 */
const oauthStateSchema = new mongoose.Schema({
    stateHash: {
        type: String,
        required: true,
        unique: true,
    },
    provider: {
        type: String,
        enum: ['discord'],
        required: true,
    },
    // "login" = sign in / sign up, "link" = attach Discord to an existing account
    mode: {
        type: String,
        enum: ['login', 'link'],
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
});

// MongoDB TTL index removes abandoned requests automatically
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OAuthState = mongoose.model('OAuthState', oauthStateSchema);

module.exports = OAuthState;
