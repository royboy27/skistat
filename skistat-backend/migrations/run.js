const express = require('express');
const { body, param, query: queryParam, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');
const { success, error, paginated, NotFoundError } = require('../utils/helpers');

const router = express.Router();

// ============================================
// POST /v1/runs — Upload a run
// ============================================
router.post('/', authenticate,
  [
    body('id').isUUID().withMessage('Valid run ID required'),
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').optional().isISO8601(),
    body('runName').optional().isLength({ max: 255 }).trim(),
    body('resortName').optional().isLength({ max: 255 }).trim(),
    body('distance').isNumeric().withMessage('distance must be a number'),
    body('maxSpeed').isNumeric().withMessage('maxSpeed must be a number'),
    body('averageSpeed').isNumeric().withMessage('averageSpeed must be a number'),
    body('elevationDrop').isNumeric().withMessage('elevationDrop must be a number'),
    body('startElevation').isNumeric().withMessage('startElevation must be a number'),
    body('endElevation').isNumeric().withMessage('endElevation must be a number'),
    body('duration').isNumeric().withMessage('duration must be a number'),
    body('points').isNumeric().withMessage('points must be a number'),
    body('difficulty').optional().isString(),
    body('calories').optional().isNumeric(),
    body('avgHeartRate').optional().isNumeric(),
    body('maxHeartRate').optional().isNumeric(),
    body('routeData').optional(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return error(res, errors.array()[0].msg, 400);

      const {
        id, startTime, endTime, runName, resortName, resortLatitude, resortLongitude,
        distance, maxSpeed, averageSpeed, elevationDrop, startElevation, endElevation,
        duration, points, difficulty, calories, avgHeartRate, maxHeartRate, routeData,
      } = req.body;

      // Upsert — allow re-uploading same run (idempotent)
      await query(
        `INSERT INTO runs (
          id, user_id, run_name, resort_name, resort_latitude, resort_longitude,
          start_time, end_time, distance, max_speed, average_speed,
          elevation_drop, start_elevation, end_elevation, duration,
          points, difficulty, calories, avg_heart_rate, max_heart_rate, route_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (id) DO UPDATE SET
          run_name = EXCLUDED.run_name,
          resort_name = EXCLUDED.resort_name,
          end_time = EXCLUDED.end_time,
          distance = EXCLUDED.distance,
          max_speed = EXCLUDED.max_speed,
          average_speed = EXCLUDED.average_speed,
          elevation_drop = EXCLUDED.elevation_drop,
          points = EXCLUDED.points,
          difficulty = EXCLUDED.difficulty,
          calories = EXCLUDED.calories,
          avg_heart_rate = EXCLUDED.avg_heart_rate,
          max_heart_rate = EXCLUDED.max_heart_rate,
          route_data = EXCLUDED.route_data,
          updated_at = NOW()`,
        [
          id, req.user.id, runName, resortName, resortLatitude || null, resortLongitude || null,
          startTime, endTime || null, distance, maxSpeed, averageSpeed,
          elevationDrop, startElevation, endElevation, duration,
          points, difficulty || 'Blue', calories || 0, avgHeartRate || 0, maxHeartRate || 0,
          routeData ? JSON.stringify(routeData) : null,
        ]
      );

      return success(res, { id, synced: true }, 201);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// POST /v1/runs/batch — Upload multiple runs
// ============================================
router.post('/batch', authenticate, async (req, res, next) => {
  try {
    const { runs } = req.body;
    if (!Array.isArray(runs) || runs.length === 0) {
      return error(res, 'Runs array required', 400);
    }

    if (runs.length > 50) {
      return error(res, 'Maximum 50 runs per batch', 400);
    }

    const synced = [];
    const failed = [];

    for (const run of runs) {
      try {
        await query(
          `INSERT INTO runs (
            id, user_id, run_name, resort_name, resort_latitude, resort_longitude,
            start_time, end_time, distance, max_speed, average_speed,
            elevation_drop, start_elevation, end_elevation, duration,
            points, difficulty, calories, avg_heart_rate, max_heart_rate, route_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          ON CONFLICT (id) DO UPDATE SET
            run_name = EXCLUDED.run_name, points = EXCLUDED.points, updated_at = NOW()`,
          [
            run.id, req.user.id, run.runName, run.resortName,
            run.resortLatitude || null, run.resortLongitude || null,
            run.startTime, run.endTime || null, run.distance || 0,
            run.maxSpeed || 0, run.averageSpeed || 0, run.elevationDrop || 0,
            run.startElevation || 0, run.endElevation || 0, run.duration || 0,
            run.points || 0, run.difficulty || 'Blue', run.calories || 0,
            run.avgHeartRate || 0, run.maxHeartRate || 0,
            run.routeData ? JSON.stringify(run.routeData) : null,
          ]
        );
        synced.push(run.id);
      } catch (err) {
        failed.push({ id: run.id, error: err.message });
      }
    }

    return success(res, { synced, failed });
  } catch (err) {
    next(err);
  }
});

// ============================================
// GET /v1/runs — Get my runs (paginated)
// ============================================
router.get('/', authenticate,
  [
    queryParam('page').optional().isInt({ min: 1 }).toInt(),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    queryParam('resort').optional().isString(),
    queryParam('since').optional().isISO8601(),
  ],
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const resort = req.query.resort;
      const since = req.query.since;

      let whereClause = 'user_id = $1 AND is_deleted = false';
      const params = [req.user.id];
      let paramIdx = 2;

      if (resort) {
        whereClause += ` AND resort_name = $${paramIdx++}`;
        params.push(resort);
      }
      if (since) {
        whereClause += ` AND start_time > $${paramIdx++}`;
        params.push(since);
      }

      const countResult = await query(`SELECT COUNT(*) FROM runs WHERE ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count);

      const runsResult = await query(
        `SELECT id, run_name, resort_name, resort_latitude, resort_longitude,
                start_time, end_time, distance, max_speed, average_speed,
                elevation_drop, start_elevation, end_elevation, duration,
                points, difficulty, calories, avg_heart_rate, max_heart_rate,
                created_at, updated_at
         FROM runs
         WHERE ${whereClause}
         ORDER BY start_time DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...params, limit, offset]
      );

      const runs = runsResult.rows.map(formatRun);
      return paginated(res, runs, total, page, limit);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// GET /v1/runs/:id — Get a specific run
// ============================================
router.get('/:id', authenticate,
  [param('id').isUUID()],
  async (req, res, next) => {
    try {
      const result = await query(
        `SELECT * FROM runs WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) throw new NotFoundError('Run');

      const run = result.rows[0];
      return success(res, {
        ...formatRun(run),
        routeData: run.route_data,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// DELETE /v1/runs/:id — Soft delete a run
// ============================================
router.delete('/:id', authenticate,
  [param('id').isUUID()],
  async (req, res, next) => {
    try {
      const result = await query(
        `UPDATE runs SET is_deleted = true, deleted_at = NOW()
         WHERE id = $1 AND user_id = $2 AND is_deleted = false
         RETURNING id`,
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) throw new NotFoundError('Run');

      return success(res, { message: 'Run deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// GET /v1/runs/sync/status — Get sync status
// Returns runs updated after a given timestamp
// ============================================
router.get('/sync/status', authenticate, async (req, res, next) => {
  try {
    const since = req.query.since || '1970-01-01T00:00:00Z';

    const result = await query(
      `SELECT id, updated_at FROM runs
       WHERE user_id = $1 AND is_deleted = false AND updated_at > $2
       ORDER BY updated_at DESC`,
      [req.user.id, since]
    );

    return success(res, {
      updatedRuns: result.rows.map(r => ({ id: r.id, updatedAt: r.updated_at })),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Format run for API response
// ============================================
function formatRun(row) {
  return {
    id: row.id,
    runName: row.run_name,
    resortName: row.resort_name,
    resortLatitude: row.resort_latitude,
    resortLongitude: row.resort_longitude,
    startTime: row.start_time,
    endTime: row.end_time,
    distance: parseFloat(row.distance),
    maxSpeed: parseFloat(row.max_speed),
    averageSpeed: parseFloat(row.average_speed),
    elevationDrop: parseFloat(row.elevation_drop),
    startElevation: parseFloat(row.start_elevation),
    endElevation: parseFloat(row.end_elevation),
    duration: parseFloat(row.duration),
    points: parseInt(row.points),
    difficulty: row.difficulty,
    calories: parseFloat(row.calories),
    avgHeartRate: parseFloat(row.avg_heart_rate),
    maxHeartRate: parseFloat(row.max_heart_rate),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
