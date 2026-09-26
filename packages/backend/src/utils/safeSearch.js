const ApiError = require('./ApiError');

const MAX_SEARCH_LENGTH = 100;

/**
 * Escape every character that has a special meaning in a regular
 * expression so user input is matched literally.
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a case-insensitive "contains" filter for MongoDB from untrusted input.
 *
 * Passing raw user input to $regex lets the caller run arbitrary regular
 * expressions on the database server (ReDoS, pattern-based data probing).
 * This helper:
 *  - only accepts a single string (repeated query params arrive as arrays)
 *  - caps the length
 *  - escapes all regex metacharacters so the value is a literal substring
 *
 * @param {*} value - raw query value
 * @param {string} field - parameter name, used in the error message
 * @returns {{ $regex: string, $options: string }}
 */
const containsFilter = (value, field = 'search') => {
    if (typeof value !== 'string') {
        throw ApiError.badRequest(`${field} must be a single text value`);
    }

    const trimmed = value.trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
        throw ApiError.badRequest(`${field} cannot exceed ${MAX_SEARCH_LENGTH} characters`);
    }

    return { $regex: escapeRegex(trimmed), $options: 'i' };
};

module.exports = {
    escapeRegex,
    containsFilter,
    MAX_SEARCH_LENGTH,
};
