const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');
const { errorResponse, successResponse } = require('../utils/helpers');

const router = express.Router();

// Helper: get friend IDs + self
async function getFriendIds(userId) {
  const result = await query(
    `SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as friend_id
     FROM friendships
     WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
    [userId]
  );
  return [userId, ...result.rows.map(r => r.friend_id)];
}

// ==========================================
// GET /v1/leaderboard/season — Season points
// ==========================================
router.get('/season', authenticate, async (req, res) => {
  try {
    const userIds = await getFriendIds(req.user.id);
    const seasonStart = getSeasonStart();

    const result = await query(
      `SELECT u.id, u.display_name,
              COUNT(r.id) as run_count,
              COALESCE(SUM(r.points), 0) as total_points
       FROM users u
       LEFT JOIN runs r ON r.user_id = u.id AND r.is_deleted = false AND r.start_time >= $2
       WHERE u.id = ANY($1)
       GROUP BY u.id, u.display_name
       ORDER BY total_points DESC`,
      [userIds, seasonStart]
    );

    return successResponse(res, {
      leaderboard: result.rows.map((r, i) => ({
        rank: i + 1,
        userId: r.id,
        displayName: r.display_name,
        isYou: r.id === req.user.id,
        value: parseInt(r.total_points),
        displayValue: `${parseInt(r.total_points)} pts`,
        detail: `${parseInt(r.run_count)} runs`,
      })),
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return errorResponse(res, 500, 'Failed to fetch leaderboard');
  }
});

// ==========================================
// GET /v1/leaderboard/speed — Top speed (individual runs)
// ==========================================
router.get('/speed', authenticate, async (req, res) => {
  try {
    const userIds = await getFriendIds(req.user.id);

    const result = await query(
      `SELECT r.id as run_id, r.run_name, r.resort_name, r.max_speed, r.start_time,
              u.id as user_id, u.display_name
       FROM runs r
       JOIN users u ON r.user_id = u.id
       WHERE u.id = ANY($1) AND r.is_deleted = false
       ORDER BY r.max_speed DESC
       LIMIT 20`,
      [userIds]
    );

    return successResponse(res, {
      leaderboard: result.rows.map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        displayName: r.display_name,
        isYou: r.user_id === req.user.id,
        value: r.max_speed,
        detail: `${r.run_name || 'Run'} · ${r.resort_name || ''}`,
      })),
    });
  } catch (err) {
    console.error('Speed leaderboard error:', err);
    return errorResponse(res, 500, 'Failed to fetch leaderboard');
  }
});

// ==========================================
// GET /v1/leaderboard/vert — Total season vertical
// ==========================================
router.get('/vert', authenticate, async (req, res) => {
  try {
    const userIds = await getFriendIds(req.user.id);
    const seasonStart = getSeasonStart();

    const result = await query(
      `SELECT u.id, u.display_name,
              COALESCE(SUM(r.elevation_drop), 0) as total_vert,
              COUNT(r.id) as run_count
       FROM users u
       LEFT JOIN runs r ON r.user_id = u.id AND r.is_deleted = false AND r.start_time >= $2
       WHERE u.id = ANY($1)
       GROUP BY u.id, u.display_name
       ORDER BY total_vert DESC`,
      [userIds, seasonStart]
    );

    return successResponse(res, {
      leaderboard: result.rows.map((r, i) => ({
        rank: i + 1,
        userId: r.id,
        displayName: r.display_name,
        isYou: r.id === req.user.id,
        value: parseFloat(r.total_vert),
        detail: `${parseInt(r.run_count)} runs`,
      })),
    });
  } catch (err) {
    console.error('Vert leaderboard error:', err);
    return errorResponse(res, 500, 'Failed to fetch leaderboard');
  }
});

// ==========================================
// GET /v1/leaderboard/distance — Total season distance
// ==========================================
router.get('/distance', authenticate, async (req, res) => {
  try {
    const userIds = await getFriendIds(req.user.id);
    const seasonStart = getSeasonStart();

    const result = await query(
      `SELECT u.id, u.display_name,
              COALESCE(SUM(r.distance), 0) as total_distance,
              COUNT(r.id) as run_count
       FROM users u
       LEFT JOIN runs r ON r.user_id = u.id AND r.is_deleted = false AND r.start_time >= $2
       WHERE u.id = ANY($1)
       GROUP BY u.id, u.display_name
       ORDER BY total_distance DESC`,
      [userIds, seasonStart]
    );

    return successResponse(res, {
      leaderboard: result.rows.map((r, i) => ({
        rank: i + 1,
        userId: r.id,
        displayName: r.display_name,
        isYou: r.id === req.user.id,
        value: parseFloat(r.total_distance),
        detail: `${parseInt(r.run_count)} runs`,
      })),
    });
  } catch (err) {
    console.error('Distance leaderboard error:', err);
    return errorResponse(res, 500, 'Failed to fetch leaderboard');
  }
});

// ==========================================
// HELPERS
// ==========================================

function getSeasonStart() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = month >= 11 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 10, 1); // November 1
}

module.exports = router;
