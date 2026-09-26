const ApiError = require('../utils/ApiError');

const MAX_DEPTH = 20;

/**
 * Return the path of the first key that starts with "$" (a MongoDB query
 * operator such as $ne, $gt, $where, $regex) or null if there is none.
 */
const findOperatorKey = (value, path = '', depth = 0) => {
    if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) {
        return null;
    }

    for (const key of Object.keys(value)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (key.startsWith('$')) {
            return keyPath;
        }
        const nested = findOperatorKey(value[key], keyPath, depth + 1);
        if (nested) return nested;
    }
    return null;
};

/**
 * Reject requests whose JSON body contains MongoDB operator keys.
 * Without this, a field the code expects to be a string can be sent as an
 * object like {"$ne": null} and change the meaning of the query it is used
 * in (e.g. BannedUser.findOne({ type, value }) in unbanUser).
 *
 * Route params and query strings are always plain strings (or arrays of
 * strings) with Express 5's default "simple" query parser, so the JSON
 * body is the only place an attacker can smuggle an object in.
 *
 * The request is rejected rather than silently stripped so the attempt is
 * visible in the logs and the client gets a clear 400.
 */
const rejectMongoOperators = (req, res, next) => {
    const offending = findOperatorKey(req.body);
    if (offending) {
        return next(ApiError.badRequest(
            `Invalid input: keys starting with "$" are not allowed (body.${offending})`
        ));
    }
    next();
};

module.exports = {
    rejectMongoOperators,
    findOperatorKey,
};
