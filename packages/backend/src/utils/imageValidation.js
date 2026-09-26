const path = require('path');
const ApiError = require('./ApiError');

// Only these picture formats are accepted for report photos.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Reject absurdly large images (decompression-bomb / resource protection).
const MAX_IMAGE_DIMENSION = 12000; // pixels, per side

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

/**
 * Confirm the file looks like a *complete* image, not an image header glued
 * onto other content. PNG must end with the IEND chunk and JPEG with the EOI
 * marker. WebP has no reliable trailing marker, so it is not checked here.
 */
const isCompleteImage = (buffer, type) => {
    try {
        if (type === 'image/png') {
            return buffer.subarray(buffer.length - 8, buffer.length - 4).toString('ascii') === 'IEND';
        }
        if (type === 'image/jpeg') {
            return buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
        }
        return true; // webp: not checked
    } catch {
        return false;
    }
};

/**
 * Best-effort read of an image's pixel dimensions. Returns { width, height }
 * when it can parse them, or null when it cannot (in which case the caller
 * simply skips the dimension cap rather than rejecting a valid file).
 */
const getImageDimensions = (buffer, type) => {
    try {
        if (type === 'image/png') {
            // IHDR width/height sit right after the 8-byte signature + 8-byte chunk header.
            return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }

        if (type === 'image/jpeg') {
            let off = 2;
            while (off + 9 < buffer.length) {
                if (buffer[off] !== 0xff) { off++; continue; }
                const marker = buffer[off + 1];
                // Start-Of-Frame markers carry the dimensions.
                const isSOF =
                    marker >= 0xc0 && marker <= 0xcf &&
                    marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
                if (isSOF) {
                    return { height: buffer.readUInt16BE(off + 5), width: buffer.readUInt16BE(off + 7) };
                }
                if (marker === 0xd8 || marker === 0xd9) { off += 2; continue; }
                off += 2 + buffer.readUInt16BE(off + 2); // skip this segment
            }
            return null;
        }

        if (type === 'image/webp') {
            const fourCC = buffer.toString('ascii', 12, 16);
            if (fourCC === 'VP8 ') {
                return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
            }
            if (fourCC === 'VP8L') {
                const bits = buffer.readUInt32LE(21);
                return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
            }
            if (fourCC === 'VP8X') {
                return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
            }
            return null;
        }

        return null;
    } catch {
        return null;
    }
};

/** Remove an optional "data:image/png;base64," prefix and any whitespace. */
const stripDataUriPrefix = (data) => String(data).replace(DATA_URI_PREFIX, '').replace(/\s/g, '');

/**
 * Validate an uploaded base64 image. Throws a 400 error unless the bytes are
 * really a JPEG/PNG/WebP, agree with the client's label, form a complete file,
 * and are within the allowed pixel dimensions.
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

    const buffer = Buffer.from(base64, 'base64');

    const detectedType = detectImageType(buffer);
    if (!detectedType) {
        throw ApiError.badRequest('File is not a valid image. Allowed types: JPEG, PNG, WebP');
    }

    const claimed = String(claimedType || '').toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : String(claimedType || '').toLowerCase();
    if (claimed !== detectedType) {
        throw ApiError.badRequest('contentType does not match the actual image contents');
    }

    if (!isCompleteImage(buffer, detectedType)) {
        throw ApiError.badRequest('Image file appears to be incomplete or corrupted');
    }

    const dims = getImageDimensions(buffer, detectedType);
    if (dims && (dims.width < 1 || dims.height < 1 || dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)) {
        throw ApiError.badRequest(`Image dimensions must be between 1 and ${MAX_IMAGE_DIMENSION} pixels per side`);
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
    MAX_IMAGE_DIMENSION,
    detectImageType,
    isCompleteImage,
    getImageDimensions,
    stripDataUriPrefix,
    decodeAndValidateImage,
    sanitizeFilename,
};
