const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');
const { errorResponse, successResponse, sanitizeDisplayName } = require('../utils/helpers');

const router = express.Router();

// ==========================================
// GET /v1/profile — Get current user profile
// ==========================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, display_name, home_resort, avatar_url, invite_code,
              use_metric, weight_kg, haptics_enabled, battery_mode, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'User not found');
    }

    const user = result.rows[0];

    // Get stats
    const statsResult = await query(
      `SELECT 
         COUNT(*) as total_runs,
         COALESCE(SUM(points), 0) as total_points,
         COALESCE(MAX(max_speed), 0) as top_speed,
         COALESCE(SUM(elevation_drop), 0) as total_vert,
         COALESCE(SUM(distance), 0) as total_distance,
         COUNT(DISTINCT resort_name) as resort_count
       FROM runs 
       WHERE user_id = $1 AND is_deleted = false`,
      [req.user.id]
    );

    const friendCount = await query(
      `SELECT COUNT(*) as count FROM friendships 
       WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
      [req.user.id]
    );

    return successResponse(res, {
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        homeResort: user.home_resort,
        avatarUrl: user.avatar_url,
        inviteCode: user.invite_code,
        useMetric: user.use_metric,
        weightKg: user.weight_kg,
        hapticsEnabled: user.haptics_enabled,
        batteryMode: user.battery_mode,
        createdAt: user.created_at,
      },
      stats: {
        totalRuns: parseInt(statsResult.rows[0].total_runs),
        totalPoints: parseInt(statsResult.rows[0].total_points),
        topSpeed: parseFloat(statsResult.rows[0].top_speed),
        totalVert: parseFloat(statsResult.rows[0].total_vert),
        totalDistance: parseFloat(statsResult.rows[0].total_distance),
        resortCount: parseInt(statsResult.rows[0].resort_count),
        friendCount: parseInt(friendCount.rows[0].count),
      },
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return errorResponse(res, 500, 'Failed to fetch profile');
  }
});

// ==========================================
// PUT /v1/profile — Update profile
// ==========================================
router.put('/', authenticate,
  body('displayName').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('homeResort').optional().isString().trim().isLength({ max: 255 }),
  body('useMetric').optional().isBoolean(),
  body('weightKg').optional().isFloat({ min: 30, max: 200 }),
  body('hapticsEnabled').optional().isBoolean(),
  body('batteryMode').optional().isIn(['precision', 'fullDay']),
  validate,
  async (req, res) => {
    try {
      const updates = {};
      const allowed = ['displayName', 'homeResort', 'useMetric', 'weightKg', 'hapticsEnabled', 'batteryMode'];
      const dbFields = {
        displayName: 'display_name',
        homeResort: 'home_resort',
        useMetric: 'use_metric',
        weightKg: 'weight_kg',
        hapticsEnabled: 'haptics_enabled',
        batteryMode: 'battery_mode',
      };

      for (const field of allowed) {
        if (req.body[field] !== undefined) {
          const dbField = dbFields[field];
          let value = req.body[field];
          if (field === 'displayName') value = sanitizeDisplayName(value);
          updates[dbField] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        return errorResponse(res, 400, 'No fields to update');
      }

      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
      const values = [req.user.id, ...Object.values(updates)];

      await query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`,
        values
      );

      return successResponse(res, { message: 'Profile updated' });
    } catch (err) {
      console.error('Profile update error:', err);
      return errorResponse(res, 500, 'Failed to update profile');
    }
  }
);

module.exports = router;
