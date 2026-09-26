const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { PublicReport } = require('../models/PublicReport.model');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const BannedUser = require('../models/BannedUser.model');
const { decodeAndValidateImage, sanitizeFilename } = require('../utils/imageValidation');

/**
 * Generate a citizen-friendly random tracking code (e.g. WR-A1B2-C3D4)
 */
function generateTrackingCode() {
    const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `WR-${p1}-${p2}`;
}

/**
 * Generate a high-entropy secret access token for the report creator
 */
function generateAccessToken() {
    return crypto.randomBytes(24).toString('hex');
}

/**
 * Verify whether requester is authorized to view or edit this specific report
 */
function verifyReportAccess(req, report) {
    if (!report) return false;

    // Check x-report-token header or query parameter
    const clientToken = req.headers['x-report-token'] || req.query.token;
    if (clientToken && report.accessToken && clientToken === report.accessToken) {
        return true;
    }

    // Check authenticated system staff (ADMIN, MODERATOR, LAB_STAFF)
    if (req.user && ['ADMIN', 'MODERATOR', 'LAB_STAFF'].includes(req.user.role)) {
        return true;
    }

    // Check Bearer tracking token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, config.jwt.secret);
            if (decoded.scope === 'TRACKING_ACCESS' && decoded.nic.toLowerCase() === report.nic.toLowerCase()) {
                return true;
            }
            if (['ADMIN', 'MODERATOR'].includes(decoded.role)) {
                return true;
            }
        } catch {}
    }

    // Allow legacy reports without accessToken if created before this patch
    if (!report.accessToken) {
        return true;
    }

    return false;
}

/**
 * @desc    Create a new public report (wizard start)
 * @route   POST /api/v1/public-reports
 * @access  Public
 */
const createReport = asyncHandler(async (req, res) => {
    const { nic } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;

    // Check if user is banned
    const isBanned = await BannedUser.findOne({
        $or: [
            { type: 'nic', value: nic },
            { type: 'ip', value: ipAddress }
        ]
    });

    if (isBanned) {
        throw ApiError.forbidden('You are banned from submitting public reports.');
    }

    const trackingCode = generateTrackingCode();
    const accessToken = generateAccessToken();

    const report = await PublicReport.create({
        nic,
        ipAddress,
        trackingCode,
        accessToken,
        currentStep: 1,
    });

    return ApiResponse.created(res, {
        report,
        trackingCode,
        accessToken,
    }, 'Report created successfully');
});

/**
 * @desc    Get a report by ID (Requires creator accessToken or staff authorization)
 * @route   GET /api/v1/public-reports/:id
 * @access  Protected
 */
const getReport = asyncHandler(async (req, res) => {
    const report = await PublicReport.findById(req.params.id);

    if (!report) {
        throw ApiError.notFound('Report not found');
    }

    if (!verifyReportAccess(req, report)) {
        throw ApiError.forbidden('Access denied: You do not have permission to view this report without a valid access token.');
    }

    return ApiResponse.success(res, { report }, 'Report retrieved successfully');
});

/**
 * @desc    Update a report (auto-save wizard step)
 * @route   PATCH /api/v1/public-reports/:id
 * @access  Protected (Requires accessToken or staff)
 */
const updateReport = asyncHandler(async (req, res) => {
    const report = await PublicReport.findById(req.params.id);

    if (!report) {
        throw ApiError.notFound('Report not found');
    }

    if (!verifyReportAccess(req, report)) {
        throw ApiError.forbidden('Access denied: You do not have permission to update this report without a valid access token.');
    }

    if (report.wizardCompleted) {
        throw ApiError.badRequest('Cannot update a completed report');
    }

    // Deep merge the updates
    const allowedFields = [
        'waterSource', 'waterSourceOther', 'location',
        'appearance', 'smell', 'taste', 'turbidity', 'sediment',
        'oilGrease', 'foamBubbles', 'algae', 'trashDebris',
        'mudSilt', 'insectsLarvae', 'plantMatter', 'deadWildlife',
        'pipeCondition', 'waterFlow', 'temperature',
        'testingMethod', 'advancedTests', 'currentStep',
        'email', 'phone',
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            if (typeof req.body[field] === 'object' && req.body[field] !== null && !Array.isArray(req.body[field])) {
                // Merge nested objects instead of replacing entirely
                report[field] = { ...report[field]?.toObject?.() || report[field] || {}, ...req.body[field] };
            } else {
                report[field] = req.body[field];
            }
        }
    }

    report.markModified('location');
    report.markModified('appearance');
    report.markModified('smell');
    report.markModified('taste');
    report.markModified('turbidity');
    report.markModified('sediment');
    report.markModified('oilGrease');
    report.markModified('foamBubbles');
    report.markModified('algae');
    report.markModified('trashDebris');
    report.markModified('mudSilt');
    report.markModified('insectsLarvae');
    report.markModified('plantMatter');
    report.markModified('deadWildlife');
    report.markModified('pipeCondition');
    report.markModified('advancedTests');

    await report.save();

    return ApiResponse.success(res, { report }, 'Report updated successfully');
});

/**
 * @desc    Get in-progress reports by NIC (Requires verified email tracking session or staff role)
 * @route   GET /api/v1/public-reports/by-nic/:nic
 * @access  Protected
 */
const getByNic = asyncHandler(async (req, res) => {
    const { nic } = req.params;

    // Check authorization:
    // Requires either:
    // 1) Bearer token with scope 'TRACKING_ACCESS' for matching nic, OR
    // 2) Logged-in staff (ADMIN or MODERATOR)
    const authHeader = req.headers.authorization;
    let isAuthorized = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            if (decoded.scope === 'TRACKING_ACCESS' && decoded.nic.toLowerCase() === nic.toLowerCase()) {
                isAuthorized = true;
            } else if (['ADMIN', 'MODERATOR'].includes(decoded.role)) {
                isAuthorized = true;
            }
        } catch {}
    }

    if (!isAuthorized && req.user && ['ADMIN', 'MODERATOR'].includes(req.user.role)) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        throw ApiError.unauthorized(
            'Access denied: Direct public lookup by raw NIC is disabled for citizen privacy. Please verify via email OTP or track using your secure Tracking Code.'
        );
    }

    const reports = await PublicReport.find({ nic })
        .sort({ updatedAt: -1 })
        .select('_id trackingCode nic waterSource currentStep wizardCompleted mod_status createdAt updatedAt completedAt');

    return ApiResponse.success(res, { reports }, 'Reports retrieved successfully');
});

/**
 * @desc    Track a report using public Tracking Code
 * @route   GET /api/v1/public-reports/track/:trackingCode
 * @access  Public
 */
const trackByCode = asyncHandler(async (req, res) => {
    const { trackingCode } = req.params;

    const report = await PublicReport.findOne({ 
        trackingCode: trackingCode.toUpperCase() 
    }).select('_id trackingCode nic waterSource location appearance smell taste turbidity sediment currentStep wizardCompleted mod_status rejection_reason createdAt updatedAt completedAt');

    if (!report) {
        throw ApiError.notFound('Report not found with the provided tracking code');
    }

    const reportObj = report.toObject();
    // Mask NIC for citizen privacy
    if (reportObj.nic) {
        reportObj.maskedNic = reportObj.nic.length > 5
            ? reportObj.nic.slice(0, 3) + '*****' + reportObj.nic.slice(-2)
            : '*****';
        delete reportObj.nic;
    }

    // Sanitize detailed private location to city/district level only
    if (reportObj.location) {
        reportObj.location = {
            district: reportObj.location.district || null,
            city: reportObj.location.city || null,
        };
    }

    return ApiResponse.success(res, { report: reportObj }, 'Report status retrieved successfully');
});

/**
 * @desc    Request email OTP for tracking reports by NIC
 * @route   POST /api/v1/public-reports/tracking/request-code
 * @access  Public
 */
const requestTrackingCode = asyncHandler(async (req, res) => {
    const { nic, email } = req.body;

    const reports = await PublicReport.find({
        nic: nic.trim(),
        email: email.toLowerCase().trim(),
    }).select('+trackingOtp +trackingOtpExpires');

    // To prevent account/NIC enumeration, return generic success even if no reports exist
    if (!reports || reports.length === 0) {
        return ApiResponse.success(
            res,
            null,
            'If matching reports are found, a verification code has been sent to your email.'
        );
    }

    // Generate 6-digit cryptographic OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    for (const r of reports) {
        r.trackingOtp = otp;
        r.trackingOtpExpires = expires;
        await r.save();
    }

    logger.info(`[SECURITY] Generated tracking OTP for NIC ${nic} (${email}): ${otp}`);

    return ApiResponse.success(
        res,
        {
            ...(config.env !== 'production' ? { debugOtp: otp } : {})
        },
        'A 6-digit verification code has been sent to your email. It will expire in 10 minutes.'
    );
});

/**
 * @desc    Verify OTP and issue scoped tracking token
 * @route   POST /api/v1/public-reports/tracking/verify-code
 * @access  Public
 */
const verifyTrackingCode = asyncHandler(async (req, res) => {
    const { nic, email, code } = req.body;

    const report = await PublicReport.findOne({
        nic: nic.trim(),
        email: email.toLowerCase().trim(),
        trackingOtp: code.trim(),
        trackingOtpExpires: { $gt: new Date() },
    }).select('+trackingOtp +trackingOtpExpires');

    if (!report) {
        throw ApiError.badRequest('Invalid or expired verification code');
    }

    // Clear OTP on all matching reports
    await PublicReport.updateMany(
        { nic: nic.trim(), email: email.toLowerCase().trim() },
        { $set: { trackingOtp: null, trackingOtpExpires: null } }
    );

    // Issue short-lived tracking token (1 hour)
    const trackingToken = jwt.sign(
        {
            nic: nic.trim(),
            email: email.toLowerCase().trim(),
            scope: 'TRACKING_ACCESS',
        },
        config.jwt.secret,
        { expiresIn: '1h' }
    );

    return ApiResponse.success(
        res,
        { trackingToken },
        'Verification successful. You may now access your report history.'
    );
});

/**
 * @desc    Upload images for a report
 * @route   POST /api/v1/public-reports/:id/images
 * @access  Protected (Requires accessToken or staff)
 */
const uploadImages = asyncHandler(async (req, res) => {
    const report = await PublicReport.findById(req.params.id);

    if (!report) {
        throw ApiError.notFound('Report not found');
    }

    if (!verifyReportAccess(req, report)) {
        throw ApiError.forbidden('Access denied: You do not have permission to upload images for this report.');
    }

    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
        throw ApiError.badRequest('Please provide at least one image');
    }

    // Limit total images per report
    const currentCount = report.images ? report.images.length : 0;
    if (currentCount + images.length > 10) {
        throw ApiError.badRequest('Maximum 10 images per report');
    }

    // Check every photo before saving any of them, so a batch is all-or-nothing
    // and the user is told exactly which photos were rejected.
    const accepted = [];
    const rejected = [];

    images.forEach((img, index) => {
        const filename = sanitizeFilename(img && img.filename);
        const label = filename || `Photo ${index + 1}`;
        try {
            if (!img || !img.data || !img.contentType || !img.imageType) {
                throw ApiError.badRequest('Each image must have data, contentType, and imageType');
            }

            // ~5MB limit per image (base64 inflates ~33%)
            if (typeof img.data === 'string' && img.data.length > 7 * 1024 * 1024) {
                throw ApiError.badRequest('Each image must be under 5MB');
            }

            // Never trust the client's label: check the real bytes are a JPEG/PNG/WebP
            // and store the type the server detected, not the one the client claimed.
            const { base64, detectedType } = decodeAndValidateImage(img.data, img.contentType);

            accepted.push({
                imageType: img.imageType,
                data: base64,
                contentType: detectedType,
                filename,
            });
        } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            rejected.push({ field: `images[${index}]`, filename: label, message: err.message });
        }
    });

    if (rejected.length > 0) {
        // Lead with the first problem; list every rejected photo in errors[]
        throw ApiError.badRequest(rejected[0].message, rejected);
    }

    report.images.push(...accepted);

    await report.save();

    // Return count only, not the actual base64 data
    return ApiResponse.success(res, {
        imageCount: report.images.length,
    }, 'Images uploaded successfully');
});

/**
 * @desc    Get a completed report with full data (Requires creator accessToken or staff)
 * @route   GET /api/v1/public-reports/:id/full
 * @access  Protected
 */
const getReportFull = asyncHandler(async (req, res) => {
    const report = await PublicReport.findById(req.params.id);

    if (!report) {
        throw ApiError.notFound('Report not found');
    }

    if (!verifyReportAccess(req, report)) {
        throw ApiError.forbidden('Access denied: You do not have permission to view full details of this report.');
    }

    // Return images without actual data, just metadata
    const reportObj = report.toObject();
    if (reportObj.images) {
        reportObj.images = reportObj.images.map(img => ({
            _id: img._id,
            imageType: img.imageType,
            contentType: img.contentType,
            filename: img.filename,
            uploadedAt: img.uploadedAt,
        }));
    }

    return ApiResponse.success(res, { report: reportObj }, 'Report retrieved successfully');
});

/**
 * @desc    Submit a report (mark wizard as complete)
 * @route   POST /api/v1/public-reports/:id/submit
 * @access  Protected (Requires accessToken or staff)
 */
const submitReport = asyncHandler(async (req, res) => {
    const report = await PublicReport.findById(req.params.id);

    if (!report) {
        throw ApiError.notFound('Report not found');
    }

    if (!verifyReportAccess(req, report)) {
        throw ApiError.forbidden('Access denied: You do not have permission to submit this report.');
    }

    if (report.wizardCompleted) {
        throw ApiError.badRequest('Report has already been submitted');
    }

    report.wizardCompleted = true;
    report.completedAt = new Date();
    report.mod_status = 'pending';

    await report.save();

    return ApiResponse.success(res, { report }, 'Report submitted successfully');
});

module.exports = {
    createReport,
    getReport,
    updateReport,
    getByNic,
    trackByCode,
    requestTrackingCode,
    verifyTrackingCode,
    submitReport,
    uploadImages,
    getReportFull,
};
