const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const authService = require('../services/authService');
const { errorResponse, successResponse } = require('../utils/helpers');

const router = express.Router();

// ==========================================
// POST /v1/auth/apple — Sign In with Apple
// ==========================================
router.post('/apple',
  body('identityToken').isString().notEmpty().withMessage('Identity token required'),
  body('fullName').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const { identityToken, fullName } = req.body;
      const result = await authService.appleSignIn(identityToken, fullName);
      return successResponse(res, result);
    } catch (err) {
      return errorResponse(res, 401, err.message);
    }
  }
);

// ==========================================
// POST /v1/auth/register — Email + Password
// ==========================================
router.post('/register',
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('displayName').optional().isString().trim().isLength({ max: 100 }),
  validate,
  async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      const result = await authService.register(email, password, displayName);
      return successResponse(res, result, 201);
    } catch (err) {
      const status = err.message === 'Email already registered' ? 409 : 400;
      return errorResponse(res, status, err.message);
    }
  }
);

// ==========================================
// POST /v1/auth/login — Email + Password
// ==========================================
router.post('/login',
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isString().notEmpty().withMessage('Password required'),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      return successResponse(res, result);
    } catch (err) {
      return errorResponse(res, 401, err.message);
    }
  }
);

// ==========================================
// POST /v1/auth/refresh — Refresh JWT
// ==========================================
router.post('/refresh',
  body('refreshToken').isString().notEmpty().withMessage('Refresh token required'),
  validate,
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      return successResponse(res, result);
    } catch (err) {
      return errorResponse(res, 401, err.message);
    }
  }
);

// ==========================================
// POST /v1/auth/logout
// ==========================================
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(req.user.id, refreshToken);
    return successResponse(res, { message: 'Logged out' });
  } catch (err) {
    return errorResponse(res, 500, 'Logout failed');
  }
});

// ==========================================
// DELETE /v1/auth/account — Delete account
// ==========================================
router.delete('/account', authenticate, async (req, res) => {
  try {
    await authService.deleteAccount(req.user.id);
    return successResponse(res, { message: 'Account deleted' });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete account');
  }
});

module.exports = router;
