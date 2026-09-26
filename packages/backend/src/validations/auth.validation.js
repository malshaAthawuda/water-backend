const Joi = require('joi');

/**
 * Register validation schema
 */
const registerSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 2 characters',
            'string.max': 'Name cannot exceed 100 characters',
            'any.required': 'Name is required',
        }),
    email: Joi.string()
        .trim()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required',
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.empty': 'Password is required',
            'string.min': 'Password must be at least 8 characters',
            'string.max': 'Password cannot exceed 128 characters',
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
            'any.required': 'Password is required',
        }),
    // Roles are never accepted from the client. Every self-registered account
    // is a USER; privileged roles are granted only by an ADMIN through
    // PATCH /admin/users/:userId/role (or the create-admin bootstrap script).
    role: Joi.any()
        .forbidden()
        .messages({
            'any.unknown': 'Role cannot be set during registration',
        }),
});

/**
 * Login validation schema
 */
const loginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required',
        }),
    password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Password is required',
            'any.required': 'Password is required',
        }),
});

/**
 * Discord OAuth login ticket exchange schema
 */
const oauthTicketSchema = Joi.object({
    ticket: Joi.string()
        .trim()
        .max(128)
        .required()
        .messages({
            'any.required': 'Login ticket is required',
        }),
});

module.exports = {
    registerSchema,
    loginSchema,
    oauthTicketSchema,
};
