const express = require('express');
const validate = require('../middlewares/validate.middleware');
const {
    createReportSchema,
    updateReportSchema,
    nicParamSchema,
    requestCodeSchema,
    verifyCodeSchema,
    trackingCodeParamSchema,
} = require('../validations/publicReport.validation');
const {
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
} = require('../controllers/publicReport.controller');

const router = express.Router();

/**
 * @swagger
 * /public-reports:
 *   post:
 *     summary: Create a new public report
 *     tags: [Public Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', validate(createReportSchema), createReport);

/**
 * @swagger
 * /public-reports/track/{trackingCode}:
 *   get:
 *     summary: Track a report using secure Tracking Code
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: trackingCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sanitized report tracking status
 */
router.get('/track/:trackingCode', validate(trackingCodeParamSchema, 'params'), trackByCode);

/**
 * @swagger
 * /public-reports/tracking/request-code:
 *   post:
 *     summary: Request email verification code for tracking by NIC
 *     tags: [Public Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nic, email]
 *     responses:
 *       200:
 *         description: OTP generated and sent
 */
router.post('/tracking/request-code', validate(requestCodeSchema), requestTrackingCode);

/**
 * @swagger
 * /public-reports/tracking/verify-code:
 *   post:
 *     summary: Verify code and obtain tracking session token
 *     tags: [Public Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nic, email, code]
 *     responses:
 *       200:
 *         description: Scoped tracking JWT token issued
 */
router.post('/tracking/verify-code', validate(verifyCodeSchema), verifyTrackingCode);

/**
 * @swagger
 * /public-reports/by-nic/{nic}:
 *   get:
 *     summary: Get reports by NIC (Requires verified email tracking session or staff role)
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: nic
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returned list of reports
 *       401:
 *         description: Unauthorized without verification
 */
router.get('/by-nic/:nic', validate(nicParamSchema, 'params'), getByNic);

/**
 * @swagger
 * /public-reports/{id}/full:
 *   get:
 *     summary: Get full report
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full report data
 */
router.get('/:id/full', getReportFull);

/**
 * @swagger
 * /public-reports/{id}:
 *   get:
 *     summary: Get a report by ID
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report data
 */
router.get('/:id', getReport);

/**
 * @swagger
 * /public-reports/{id}:
 *   patch:
 *     summary: Update report (Auto-save)
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successfully saved
 */
router.patch('/:id', validate(updateReportSchema), updateReport);

/**
 * @swagger
 * /public-reports/{id}/submit:
 *   post:
 *     summary: Submit the report
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submitted
 */
router.post('/:id/submit', submitReport);

/**
 * @swagger
 * /public-reports/{id}/images:
 *   post:
 *     summary: Upload images
 *     tags: [Public Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Images uploaded
 */
router.post('/:id/images', uploadImages);

module.exports = router;
