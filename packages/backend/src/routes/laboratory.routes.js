const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validate.middleware');
const authorize = require('../middlewares/authorize.middleware');
const auth = require('../middlewares/auth.middleware');
const {
  createLaboratory,
  getAllLaboratories,
  getLaboratoryById,
  updateLaboratory,
  deleteLaboratory,
  permanentlyDeleteLaboratory,
  checkLaboratoryDependencies,
} = require('../controllers/laboratory.controller');

const router = express.Router();

// Validation schemas
const createLabSchema = Joi.object({
  name: Joi.string().required().trim(),
  location: Joi.string().required().trim(),
  email: Joi.string().email().required().lowercase(),
  phone: Joi.string().required().length(10).pattern(/^[0-9]+$/).messages({
    'string.length': 'Phone number must be exactly 10 digits',
    'string.pattern.base': 'Phone number must contain only digits',
  }),
  address: Joi.string().required().trim(),
  city: Joi.string().required().trim(),
  postalCode: Joi.string().required(),
  country: Joi.string().required().trim(),
  operatingHours: Joi.string().required(),
  capacity: Joi.number().required().min(1),
  certifications: Joi.array().items(Joi.string()).optional(),
  equipmentList: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().optional().allow(''),
  status: Joi.string().valid('active', 'inactive', 'suspended').default('active'),
});

const updateLabSchema = Joi.object({
  name: Joi.string().optional().trim(),
  location: Joi.string().optional().trim(),
  email: Joi.string().email().optional().lowercase(),
  phone: Joi.string().optional().length(10).pattern(/^[0-9]+$/).messages({
    'string.length': 'Phone number must be exactly 10 digits',
    'string.pattern.base': 'Phone number must contain only digits',
  }),
  address: Joi.string().optional().trim(),
  city: Joi.string().optional().trim(),
  postalCode: Joi.string().optional(),
  country: Joi.string().optional().trim(),
  operatingHours: Joi.string().optional(),
  capacity: Joi.number().optional().min(1),
  certifications: Joi.array().items(Joi.string()).optional(),
  equipmentList: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().optional().allow(''),
  status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
});

// All laboratory routes require authentication and admin authorization
router.use(auth);
router.use(authorize('ADMIN'));

/**
 * @swagger
 * /laboratories:
 *   post:
 *     summary: Create a new laboratory
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Laboratory created
 */
router.post(
  '/',
  (req, res, next) => validate(createLabSchema)(req, res, next),
  createLaboratory
);

/**
 * @swagger
 * /laboratories:
 *   get:
 *     summary: Get all laboratories
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Loaded labs
 */
router.get('/', getAllLaboratories);

/**
 * @swagger
 * /laboratories/{id}:
 *   get:
 *     summary: Get a laboratory by ID
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returned laboratory
 */
router.get('/:id', getLaboratoryById);

/**
 * @swagger
 * /laboratories/{id}:
 *   put:
 *     summary: Update a laboratory
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
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
 *         description: Updated lab
 */
router.put(
  '/:id',
  (req, res, next) => validate(updateLabSchema)(req, res, next),
  updateLaboratory
);

/**
 * @swagger
 * /laboratories/{id}:
 *   delete:
 *     summary: Soft delete laboratory
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', deleteLaboratory);

/**
 * @swagger
 * /laboratories/{id}/permanent:
 *   delete:
 *     summary: Permanently delete a laboratory (Admin only)
 *     description: >
 *       Permanently removes a laboratory from the database.
 *       SECURITY CONTROLS:
 *       1. Requires ?confirm=true query parameter as an intentional double-confirmation guard.
 *       2. Blocked if any active lab test requests (pending, accepted, in-progress, scheduled) reference this lab.
 *       3. Audit log is recorded with actor ID, timestamp, and historical reference count.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory MongoDB ObjectId
 *       - in: query
 *         name: confirm
 *         required: true
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Must be "true" to confirm intentional permanent deletion
 *     responses:
 *       200:
 *         description: Laboratory permanently deleted with audit summary
 *       400:
 *         description: Missing confirmation param or invalid ID
 *       404:
 *         description: Laboratory not found
 *       409:
 *         description: Cannot delete - active lab test requests exist
 */
/**
 * @swagger
 * /laboratories/{id}/dependencies:
 *   get:
 *     summary: Check laboratory dependencies before deletion (Admin only)
 *     description: >
 *       Checks whether any active or scheduled lab test requests reference this laboratory.
 *       Used by the frontend to verify safety before permanent deletion.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Laboratory dependency check results
 *       400:
 *         description: Invalid laboratory ID format
 *       404:
 *         description: Laboratory not found
 */
router.get('/:id/dependencies', checkLaboratoryDependencies);

router.delete('/:id/permanent', permanentlyDeleteLaboratory);

module.exports = router;
