const Joi = require('joi');

/**
 * Sri Lankan NIC pattern:
 *  - Old format: 9 digits + V or X  (e.g. 901234567V)
 *  - New format: 12 digits           (e.g. 200012345678)
 */
const nicPattern = /^([0-9]{9}[VvXx]|[0-9]{12})$/;

/**
 * Schema: create a new report (wizard start)
 */
const createReportSchema = Joi.object({
    nic: Joi.string()
        .trim()
        .pattern(nicPattern)
        .required()
        .messages({
            'string.empty': 'NIC number is required',
            'string.pattern.base': 'Please provide a valid Sri Lankan NIC number',
            'any.required': 'NIC number is required',
        }),
});

// ── Reusable sub-schemas ──────────────────────────────────────
const observationObj = Joi.object({
    detected: Joi.boolean().allow(null),
    type: Joi.string().allow(null, ''),
    severity: Joi.string().allow(null, ''),
    amount: Joi.string().allow(null, ''),
    notes: Joi.string().allow(null, ''),
});

const testValueObj = Joi.object({
    value: Joi.number().allow(null),
    unit: Joi.string().allow(null, ''),
});

/**
 * Schema: update / auto-save wizard step
 * All fields optional so we can patch one step at a time.
 */
const updateReportSchema = Joi.object({
    waterSource: Joi.string()
        .valid('well', 'river', 'lake', 'tap', 'tank', 'canal', 'spring', 'rainwater', 'borehole', 'other')
        .allow(null),
    waterSourceOther: Joi.string().allow(null, ''),

    location: Joi.object({
        district: Joi.string().allow(null, ''),
        city: Joi.string().allow(null, ''),
        address: Joi.string().allow(null, ''),
        coordinates: Joi.object({
            lat: Joi.number().allow(null),
            lng: Joi.number().allow(null),
        }),
    }),

    // Basic observations
    appearance: Joi.object({
        value: Joi.string().allow(null, ''),
        notes: Joi.string().allow(null, ''),
    }),
    smell: observationObj,
    taste: observationObj,
    turbidity: Joi.object({
        value: Joi.string().allow(null, ''),
    }),
    sediment: observationObj,
    oilGrease: observationObj,
    foamBubbles: observationObj,
    algae: Joi.object({
        detected: Joi.boolean().allow(null),
        color: Joi.string().allow(null, ''),
        coverage: Joi.string().allow(null, ''),
        notes: Joi.string().allow(null, ''),
    }),
    trashDebris: observationObj,
    mudSilt: observationObj,
    insectsLarvae: observationObj,
    plantMatter: observationObj,
    deadWildlife: observationObj,
    pipeCondition: observationObj,
    waterFlow: Joi.string().allow(null, ''),
    temperature: Joi.string().allow(null, ''),

    // Testing method
    testingMethod: Joi.string()
        .valid('observation', 'test_strips', 'lab_kit', 'professional_lab')
        .allow(null),

    // Advanced tests
    advancedTests: Joi.object({
        ph: testValueObj,
        hardness: testValueObj,
        chlorine: testValueObj,
        tds: testValueObj,
        cyanuricAcid: testValueObj,
        bromine: testValueObj,
        nitrate: testValueObj,
        nitrite: testValueObj,
        iron: testValueObj,
        chromium: testValueObj,
        lead: testValueObj,
        copper: testValueObj,
        mercury: testValueObj,
        fluoride: testValueObj,
        carbonate: testValueObj,
        totalAlkalinity: testValueObj,
    }),

    // Contact info
    email: Joi.string().email().allow(null, ''),
    phone: Joi.string().pattern(/^[0-9+\-\s()]{7,15}$/).allow(null, '').messages({
        'string.pattern.base': 'Please provide a valid phone number',
    }),

    // Wizard state
    currentStep: Joi.number().integer().min(0),
}).min(1); // at least one field must be provided

/**
 * Schema: upload images to a report
 * Validates the request shape early (before the controller). The controller
 * still verifies the real file bytes; this schema rejects obviously invalid
 * requests and caps the batch so oversized/spam payloads are stopped up front.
 */
const imageUploadSchema = Joi.object({
    images: Joi.array()
        .min(1)
        .max(10)
        .items(
            Joi.object({
                imageType: Joi.string()
                    .valid('water_source', 'water_sample', 'other')
                    .required(),
                // Only real image content types are accepted (image/jpg is a common
                // alias for image/jpeg). The controller confirms the actual bytes.
                contentType: Joi.string()
                    .valid('image/jpeg', 'image/jpg', 'image/png', 'image/webp')
                    .required()
                    .messages({
                        'any.only': 'Unsupported image type. Allowed: JPEG, PNG, WebP',
                    }),
                // ~5MB per image once base64-encoded (base64 inflates ~33%).
                data: Joi.string()
                    .min(1)
                    .max(7 * 1024 * 1024)
                    .required()
                    .messages({
                        'string.max': 'Each image must be under 5MB',
                    }),
                filename: Joi.string().max(120).allow(null, ''),
            })
        )
        .required()
        .messages({
            'array.min': 'Please provide at least one image',
            'array.max': 'Maximum 10 images per report',
            'any.required': 'Please provide at least one image',
        }),
});

/**
 * Schema: NIC param for lookup
 */
const nicParamSchema = Joi.object({
    nic: Joi.string()
        .trim()
        .pattern(nicPattern)
        .required()
        .messages({
            'string.pattern.base': 'Please provide a valid Sri Lankan NIC number',
        }),
});

/**
 * Schema: Request email verification code for tracking by NIC
 */
const requestCodeSchema = Joi.object({
    nic: Joi.string()
        .trim()
        .pattern(nicPattern)
        .required()
        .messages({
            'string.pattern.base': 'Please provide a valid Sri Lankan NIC number',
        }),
    email: Joi.string()
        .trim()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required',
        }),
});

/**
 * Schema: Verify code and obtain tracking session
 */
const verifyCodeSchema = Joi.object({
    nic: Joi.string()
        .trim()
        .pattern(nicPattern)
        .required(),
    email: Joi.string()
        .trim()
        .email()
        .required(),
    code: Joi.string()
        .trim()
        .length(6)
        .pattern(/^[0-9]+$/)
        .required()
        .messages({
            'string.length': 'Verification code must be 6 digits',
            'string.pattern.base': 'Verification code must consist of digits only',
        }),
});

/**
 * Schema: Tracking code lookup
 */
const trackingCodeParamSchema = Joi.object({
    trackingCode: Joi.string()
        .trim()
        .uppercase()
        .min(6)
        .max(30)
        .required(),
});

module.exports = {
    createReportSchema,
    updateReportSchema,
    imageUploadSchema,
    nicParamSchema,
    requestCodeSchema,
    verifyCodeSchema,
    trackingCodeParamSchema,
};
