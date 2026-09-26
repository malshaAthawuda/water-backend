const mongoose = require('mongoose');

/**
 * Short-lived, single-use tickets used around the OAuth redirect.
 *
 * - purpose "login": issued after a successful Discord callback. The browser
 *   receives it in the URL fragment and swaps it for the application JWT via
 *   POST /auth/discord/exchange, so the JWT itself never appears in a URL,
 *   server log, browser history or Referer header.
 * - purpose "link": issued to an already signed-in user so that a plain
 *   browser navigation (which cannot carry the Bearer header) can start the
 *   "link my Discord account" flow on their behalf.
 *
 * Only the SHA-256 hash of the ticket is stored.
 */
const oauthTicketSchema = new mongoose.Schema({
    ticketHash: {
        type: String,
        required: true,
        unique: true,
    },
    purpose: {
        type: String,
        enum: ['login', 'link'],
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
});

oauthTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OAuthTicket = mongoose.model('OAuthTicket', oauthTicketSchema);

module.exports = OAuthTicket;
