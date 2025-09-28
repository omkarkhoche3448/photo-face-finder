const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation result handler
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      errors: errors.array(),
    });
  }

  next();
}

/**
 * Session creation validation
 */
const validateSessionCreation = [
  body('creatorName')
    .trim()
    .notEmpty()
    .withMessage('Creator name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Creator name must be between 2 and 100 characters'),

  body('creatorEmail')
    .trim()
    .notEmpty()
    .withMessage('Creator email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  validate,
];

/**
 * Scan start validation
 */
const validateScanStart = [
  body('sessionId')
    .trim()
    .notEmpty()
    .withMessage('Session ID is required')
    .isUUID()
    .withMessage('Invalid session ID format'),

  body('authCode')
    .trim()
    .notEmpty()
    .withMessage('Authorization code is required'),

  validate,
];

/**
 * Session ID validation (for params)
 */
const validateSessionId = [
  param('sessionId')
    .trim()
    .notEmpty()
    .withMessage('Session ID is required')
    .isUUID()
    .withMessage('Invalid session ID format'),

  validate,
];

/**
 * Scan ID validation (for params)
 */
const validateScanId = [
  param('scanId')
    .trim()
    .notEmpty()
    .withMessage('Scan ID is required')
    .isUUID()
    .withMessage('Invalid scan ID format'),

  validate,
];

/**
 * Job ID validation (for params)
 */
const validateJobId = [
  param('jobId')
    .trim()
    .notEmpty()
    .withMessage('Job ID is required')
    .isUUID()
    .withMessage('Invalid job ID format'),

  validate,
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer')
    .toInt(),

  validate,
];

/**
 * Email validation (for query params)
 */
const validateEmail = [
  query('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  validate,
];

module.exports = {
  validate,
  validateSessionCreation,
  validateScanStart,
  validateSessionId,
  validateScanId,
  validateJobId,
  validatePagination,
  validateEmail,
};
