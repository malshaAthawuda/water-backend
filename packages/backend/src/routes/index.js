const express = require('express');
const mongoose = require('mongoose');
const os = require('os');
const ApiResponse = require('../utils/ApiResponse');

// Import route modules
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const adminRoutes = require('./admin.routes');
const moderationRoutes = require('./moderation.routes');
const waterSourceRoutes = require('./waterSource.routes');
const publicReportRoutes = require('./publicReport.routes');
const publicReportAdminRoutes = require('./publicReportAdmin.routes');
const labStaffRoutes = require('./labStaff.routes');
const laboratoryRoutes = require('./laboratory.routes');


const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Core]
 *     responses:
 *       200:
 *         description: Server is healthy
 */
router.get('/health', (req, res) => {
    return ApiResponse.success(res, {
        status: 'healthy'
    }, 'Server is healthy');
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root information
 *     tags: [Core]
 *     responses:
 *       200:
 *         description: API version and available endpoints
 */
router.get('/', (req, res) => {
    return ApiResponse.success(res, {
        name: 'Water Quality Report API',
        version: '1.0.0',
        description: 'Crowdsourced water quality report system API',
        documentation: '/api/v1/docs',
        endpoints: {
            auth: '/api/v1/auth',
            users: '/api/v1/users',
            admin: '/api/v1/admin',
            moderation: '/api/v1/moderation',
            waterSources: '/api/v1/water-sources',
            publicReports: '/api/v1/public-reports',
            publicReportsAdmin: '/api/v1/public-reports-admin',
            labStaff: '/api/v1/lab-staff',
            laboratories: '/api/v1/laboratories',
            health: '/api/v1/health',
        },
    }, 'Welcome to Water Quality Report API');
});

const mapConfigRoutes = require('./mapConfig.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/moderation', moderationRoutes);
router.use('/water-sources', waterSourceRoutes);
router.use('/public-reports', publicReportRoutes);
router.use('/public-reports-admin', publicReportAdminRoutes);
router.use('/lab-staff', labStaffRoutes);
router.use('/laboratories', laboratoryRoutes);
router.use('/config', mapConfigRoutes);

module.exports = router;
