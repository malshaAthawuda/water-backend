const path = require('path');
const ApiError = require('./ApiError');

// Only these picture formats are accepted for report photos.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const DATA_URI_PREFIX = /^data:[\w/+.-]+;base64,/i;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Work out what a file really is from its first bytes ("magic numbers"),
 * ignoring whatever label the client claimed. Returns null if it is not
 * one of the allowed picture formats.
 */
const detectImageType = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    return null;
};

/** Remove an optional "data:image/png;base64," prefix and any whitespace. */
const stripDataUriPrefix = (data) => String(data).replace(DATA_URI_PREFIX, '').replace(/\s/g, '');

/**
 * Validate an uploaded base64 image. Throws a 400 error unless the bytes are
 * really a JPEG/PNG/WebP AND agree with the label the client sent.
 * Returns the clean base64 text and the file type decided by the server.
 */
const decodeAndValidateImage = (data, claimedType) => {
    if (typeof data !== 'string') {
        throw ApiError.badRequest('Image data must be a base64 string');
    }

    const base64 = stripDataUriPrefix(data);
    if (!BASE64_BODY.test(base64)) {
        throw ApiError.badRequest('Image data is not valid base64');
    }

    const detectedType = detectImageType(Buffer.from(base64, 'base64'));
    if (!detectedType) {
        throw ApiError.badRequest('File is not a valid image. Allowed types: JPEG, PNG, WebP');
    }

    const claimed = String(claimedType || '').toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : String(claimedType || '').toLowerCase();
    if (claimed !== detectedType) {
        throw ApiError.badRequest('contentType does not match the actual image contents');
    }

    return { base64, detectedType };
};

/** Keep only a short, harmless file name (no folders, no odd characters). */
const sanitizeFilename = (name) => {
    if (typeof name !== 'string') return null;
    const base = path.basename(name.replace(/\\/g, '/'));
    const clean = base.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 100).trim();
    return clean || null;
};

module.exports = {
    ALLOWED_IMAGE_TYPES,
    detectImageType,
    stripDataUriPrefix,
    decodeAndValidateImage,
    sanitizeFilename,
};
