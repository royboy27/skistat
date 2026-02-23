const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');
const { errorResponse, successResponse } = require('../utils/helpers');

const router = express.Router();

const MAX_FRIENDS = 50;

// ==========================================
// GET /v1/friends — List my friends
// ==========================================
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.display_name, u.invite_code, u.created_at,
              f.status, f.created_at as friendship_date,
              CASE WHEN f.user_id = $1 THEN 'sent' ELSE 'received' END as direction
       FROM friendships f
       JOIN users u ON (
         CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END = u.id
       )
       WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       ORDER BY u.display_name`,
      [req.user.id]
    );

    // Get stats for each friend
    const friends = await Promise.all(result.rows.map(async (row) => {
      const stats = await query(
        `SELECT COUNT(*) as runs, COALESCE(SUM(points), 0) as points,
                COALESCE(MAX(max_speed), 0) as top_speed,
                COALESCE(SUM(elevation_drop), 0) as total_vert
         FROM runs WHERE user_id = $1 AND is_deleted = false`,
        [row.id]
      );
      return {
        id: row.id,
        displayName: row.display_name,
        inviteCode: row.invite_code,
        joinedAt: row.created_at,
        friendSince: row.friendship_date,
        stats: {
          runs: parseInt(stats.rows[0].runs),
          points: parseInt(stats.rows[0].points),
          topSpeed: parseFloat(stats.rows[0].top_speed),
          totalVert: parseFloat(stats.rows[0].total_vert),
        },
      };
    }));

    return successResponse(res, { friends });
  } catch (err) {
    console.error('Friends list error:', err);
    return errorResponse(res, 500, 'Failed to fetch friends');
  }
});

// ==========================================
// GET /v1/friends/pending — List pending requests
// ==========================================
router.get('/pending', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.display_name, u.invite_code, f.created_at as requested_at,
              CASE WHEN f.user_id = $1 THEN 'sent' ELSE 'received' END as direction
       FROM friendships f
       JOIN users u ON (
         CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END = u.id
       )
       WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    return successResponse(res, {
      pending: result.rows.map(r => ({
        id: r.id,
        displayName: r.display_name,
        inviteCode: r.invite_code,
        requestedAt: r.requested_at,
        direction: r.direction,
      })),
    });
  } catch (err) {
    console.error('Pending friends error:', err);
    return errorResponse(res, 500, 'Failed to fetch pending requests');
  }
});

// ==========================================
// POST /v1/friends/invite/:code — Send friend request by invite code
// ==========================================
router.post('/invite/:code', authenticate, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();

    // Find user by invite code
    const userResult = await query('SELECT id, display_name FROM users WHERE invite_code = $1', [code]);
    if (userResult.rows.length === 0) {
      return errorResponse(res, 404, 'No user found with that invite code');
    }

    const friendId = userResult.rows[0].id;

    // Can't friend yourself
    if (friendId === req.user.id) {
      return errorResponse(res, 400, "That's your own invite code!");
    }

    // Check friend limit
    const countResult = await query(
      `SELECT COUNT(*) as count FROM friendships 
       WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
      [req.user.id]
    );
    if (parseInt(countResult.rows[0].count) >= MAX_FRIENDS) {
      return errorResponse(res, 400, `Friend limit reached (${MAX_FRIENDS})`);
    }

    // Check if friendship already exists
    const existing = await query(
      `SELECT status FROM friendships 
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, friendId]
    );

    if (existing.rows.length > 0) {
      const status = existing.rows[0].status;
      if (status === 'accepted') return errorResponse(res, 400, 'Already friends');
      if (status === 'pending') return errorResponse(res, 400, 'Friend request already pending');
      if (status === 'blocked') return errorResponse(res, 400, 'Unable to send request');
    }

    // Create friendship (auto-accept for now — can add pending flow later)
    await query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')`,
      [req.user.id, friendId]
    );

    return successResponse(res, {
      message: 'Friend added!',
      friend: {
        id: friendId,
        displayName: userResult.rows[0].display_name,
      },
    }, 201);
  } catch (err) {
    console.error('Friend invite error:', err);
    return errorResponse(res, 500, 'Failed to add friend');
  }
});

// ==========================================
// DELETE /v1/friends/:id — Remove friend
// ==========================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM friendships 
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       AND status != 'blocked'`,
      [req.user.id, req.params.id]
    );

    if (result.rowCount === 0) {
      return errorResponse(res, 404, 'Friendship not found');
    }

    return successResponse(res, { message: 'Friend removed' });
  } catch (err) {
    console.error('Friend remove error:', err);
    return errorResponse(res, 500, 'Failed to remove friend');
  }
});

// ==========================================
// GET /v1/friends/:id/runs — Get a friend's runs
// ==========================================
router.get('/:id/runs', authenticate, async (req, res) => {
  try {
    // Verify friendship
    const friendship = await query(
      `SELECT id FROM friendships 
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       AND status = 'accepted'`,
      [req.user.id, req.params.id]
    );

    if (friendship.rows.length === 0) {
      return errorResponse(res, 403, 'Not friends with this user');
    }

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await query(
      `SELECT id, run_name, resort_name, start_time, distance, max_speed,
              elevation_drop, duration, points, difficulty
       FROM runs 
       WHERE user_id = $1 AND is_deleted = false
       ORDER BY start_time DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    return successResponse(res, {
      runs: result.rows.map(r => ({
        id: r.id,
        runName: r.run_name,
        resortName: r.resort_name,
        startTime: r.start_time,
        distance: r.distance,
        maxSpeed: r.max_speed,
        elevationDrop: r.elevation_drop,
        duration: r.duration,
        points: r.points,
        difficulty: r.difficulty,
      })),
    });
  } catch (err) {
    console.error('Friend runs error:', err);
    return errorResponse(res, 500, 'Failed to fetch friend runs');
  }
});

module.exports = router;
