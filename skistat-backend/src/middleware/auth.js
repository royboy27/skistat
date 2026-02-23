const jwt = require('jsonwebtoken');
const { query } = require('../../config/database');
const { errorResponse } = require('../utils/helpers');

// Verify JWT and attach user to request
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 401, 'Token expired');
      }
      return errorResponse(res, 401, 'Invalid token');
    }

    // Fetch user
    const result = await query('SELECT id, email, display_name, invite_code, is_banned FROM users WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return errorResponse(res, 401, 'User not found');
    }

    const user = result.rows[0];
    
    if (user.is_banned) {
      return errorResponse(res, 403, 'Account suspended');
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return errorResponse(res, 500, 'Authentication error');
  }
};

// Optional auth — attaches user if token present, but doesn't require it
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, email, display_name, invite_code FROM users WHERE id = $1 AND is_banned = false', [decoded.userId]);
    
    if (result.rows.length > 0) {
      req.user = result.rows[0];
    }
  } catch (err) {
    // Token invalid, continue without user
  }
  next();
};

module.exports = { authenticate, optionalAuth };
