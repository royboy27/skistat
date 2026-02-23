const express = require('express');
const { body, query: queryParam } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');
const { errorResponse, successResponse } = require('../utils/helpers');

const router = express.Router();

// ==========================================
// POST /v1/runs — Upload a run
// ==========================================
router.post('/', authenticate,
  body('clientId').isUUID().withMessage('Client UUID required'),
  body('startTime').isISO8601().withMessage('Valid start time required'),
  body('endTime').optional().isISO8601(),
  body('runName').optional().isString().trim().isLength({ max: 255 }),
  body('resortName').optional().isString().trim().isLength({ max: 255 }),
  body('distance').isFloat({ min: 0 }),
  body('maxSpeed').isFloat({ min: 0 }),
  body('averageSpeed').isFloat({ min: 0 }),
  body('elevationDrop').isFloat({ min: 0 }),
  body('startElevation').optional().isFloat(),
  body('endElevation').optional().isFloat(),
  body('duration').isFloat({ min: 0 }),
  body('points').isInt({ min: 0 }),
  body('difficulty').optional().isString(),
  body('calories').optional().isFloat({ min: 0 }),
  body('avgHeartRate').optional().isFloat({ min: 0 }),
  body('maxHeartRate').optional().isFloat({ min: 0 }),
  body('routeData').optional(),
  body('resortLatitude').optional().isFloat(),
  body('resortLongitude').optional().isFloat(),
  validate,
  async (req, res) => {
    try {
      const {
        clientId, startTime, endTime, runName, resortName,
        distance, maxSpeed, averageSpeed, elevationDrop, startElevation, endElevation,
        duration, points, difficulty, calories, avgHeartRate, maxHeartRate,
        routeData, resortLatitude, resortLongitude
      } = req.body;

      // Upsert — if client_id exists, update; otherwise insert
      const existing = await query(
        'SELECT id FROM runs WHERE user_id = $1 AND client_id = $2',
        [req.user.id, clientId]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing
        result = await query(
          `UPDATE runs SET
            run_name = $3, resort_name = $4, start_time = $5, end_time = $6,
            distance = $7, max_speed = $8, average_speed = $9, elevation_drop = $10,
            start_elevation = $11, end_elevation = $12, duration = $13, points = $14,
            difficulty = $15, calories = $16, avg_heart_rate = $17, max_heart_rate = $18,
            route_data = $19, resort_latitude = $20, resort_longitude = $21
           WHERE user_id = $1 AND client_id = $2
           RETURNING id`,
          [req.user.id, clientId, runName, resortName, startTime, endTime,
           distance, maxSpeed, averageSpeed, elevationDrop, startElevation || 0, endElevation || 0,
           duration, points, difficulty || 'Blue', calories || 0, avgHeartRate || 0, maxHeartRate || 0,
           routeData ? JSON.stringify(routeData) : null, resortLatitude, resortLongitude]
        );
      } else {
        // Insert new
        result = await query(
          `INSERT INTO runs (
            user_id, client_id, run_name, resort_name, start_time, end_time,
            distance, max_speed, average_speed, elevation_drop, start_elevation, end_elevation,
            duration, points, difficulty, calories, avg_heart_rate, max_heart_rate,
            route_data, resort_latitude, resort_longitude
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          RETURNING id`,
          [req.user.id, clientId, runName, resortName, startTime, endTime,
           distance, maxSpeed, averageSpeed, elevationDrop, startElevation || 0, endElevation || 0,
           duration, points, difficulty || 'Blue', calories || 0, avgHeartRate || 0, maxHeartRate || 0,
           routeData ? JSON.stringify(routeData) : null, resortLatitude, resortLongitude]
        );
      }

      return successResponse(res, {
        runId: result.rows[0].id,
        clientId,
        synced: true,
      }, existing.rows.length > 0 ? 200 : 201);
    } catch (err) {
      console.error('Run upload error:', err);
      return errorResponse(res, 500, 'Failed to upload run');
    }
  }
);

// ==========================================
// GET /v1/runs — Get my runs (paginated)
// ==========================================
router.get('/', authenticate,
  queryParam('limit').optional().isInt({ min: 1, max: 100 }),
  queryParam('offset').optional().isInt({ min: 0 }),
  queryParam('resort').optional().isString(),
  queryParam('since').optional().isISO8601(),
  validate,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const resort = req.query.resort;
      const since = req.query.since;

      let whereClause = 'WHERE user_id = $1 AND is_deleted = false';
      const params = [req.user.id];
      let paramIndex = 2;

      if (resort) {
        whereClause += ` AND resort_name = $${paramIndex}`;
        params.push(resort);
        paramIndex++;
      }
      if (since) {
        whereClause += ` AND start_time >= $${paramIndex}`;
        params.push(since);
        paramIndex++;
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT id, client_id, run_name, resort_name, start_time, end_time,
                distance, max_speed, average_speed, elevation_drop, start_elevation, end_elevation,
                duration, points, difficulty, calories, avg_heart_rate, max_heart_rate,
                resort_latitude, resort_longitude, created_at
         FROM runs ${whereClause}
         ORDER BY start_time DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) as total FROM runs ${whereClause}`,
        params.slice(0, paramIndex - 1)
      );

      return successResponse(res, {
        runs: result.rows.map(formatRun),
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
      });
    } catch (err) {
      console.error('Runs fetch error:', err);
      return errorResponse(res, 500, 'Failed to fetch runs');
    }
  }
);

// ==========================================
// GET /v1/runs/:id — Get single run with route data
// ==========================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM runs WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Run not found');
    }

    return successResponse(res, { run: formatRunFull(result.rows[0]) });
  } catch (err) {
    console.error('Run fetch error:', err);
    return errorResponse(res, 500, 'Failed to fetch run');
  }
});

// ==========================================
// DELETE /v1/runs/:id — Soft delete a run
// ==========================================
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'UPDATE runs SET is_deleted = true WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'Run not found');
    }

    return successResponse(res, { message: 'Run deleted' });
  } catch (err) {
    console.error('Run delete error:', err);
    return errorResponse(res, 500, 'Failed to delete run');
  }
});

// ==========================================
// POST /v1/runs/bulk — Upload multiple runs at once
// ==========================================
router.post('/bulk', authenticate,
  body('runs').isArray({ min: 1, max: 50 }).withMessage('Provide 1-50 runs'),
  validate,
  async (req, res) => {
    try {
      const results = [];
      for (const run of req.body.runs) {
        try {
          const existing = await query(
            'SELECT id FROM runs WHERE user_id = $1 AND client_id = $2',
            [req.user.id, run.clientId]
          );

          if (existing.rows.length > 0) {
            results.push({ clientId: run.clientId, status: 'exists', serverId: existing.rows[0].id });
            continue;
          }

          const result = await query(
            `INSERT INTO runs (
              user_id, client_id, run_name, resort_name, start_time, end_time,
              distance, max_speed, average_speed, elevation_drop, start_elevation, end_elevation,
              duration, points, difficulty, calories, avg_heart_rate, max_heart_rate,
              resort_latitude, resort_longitude
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING id`,
            [req.user.id, run.clientId, run.runName, run.resortName, run.startTime, run.endTime,
             run.distance || 0, run.maxSpeed || 0, run.averageSpeed || 0, run.elevationDrop || 0,
             run.startElevation || 0, run.endElevation || 0, run.duration || 0, run.points || 0,
             run.difficulty || 'Blue', run.calories || 0, run.avgHeartRate || 0, run.maxHeartRate || 0,
             run.resortLatitude, run.resortLongitude]
          );

          results.push({ clientId: run.clientId, status: 'created', serverId: result.rows[0].id });
        } catch (err) {
          results.push({ clientId: run.clientId, status: 'error', error: err.message });
        }
      }

      return successResponse(res, { results });
    } catch (err) {
      console.error('Bulk upload error:', err);
      return errorResponse(res, 500, 'Bulk upload failed');
    }
  }
);

// ==========================================
// HELPERS
// ==========================================

function formatRun(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    runName: row.run_name,
    resortName: row.resort_name,
    startTime: row.start_time,
    endTime: row.end_time,
    distance: row.distance,
    maxSpeed: row.max_speed,
    averageSpeed: row.average_speed,
    elevationDrop: row.elevation_drop,
    startElevation: row.start_elevation,
    endElevation: row.end_elevation,
    duration: row.duration,
    points: row.points,
    difficulty: row.difficulty,
    calories: row.calories,
    avgHeartRate: row.avg_heart_rate,
    maxHeartRate: row.max_heart_rate,
    resortLatitude: row.resort_latitude,
    resortLongitude: row.resort_longitude,
    createdAt: row.created_at,
  };
}

function formatRunFull(row) {
  return {
    ...formatRun(row),
    routeData: row.route_data,
  };
}

module.exports = router;
