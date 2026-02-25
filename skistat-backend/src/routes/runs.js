const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../../config/database');

const router = express.Router();

function ok(res, data, status = 200) {
  return res.status(status).json({ error: false, ...data });
}
function fail(res, message, status = 400) {
  return res.status(status).json({ error: true, message });
}

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { id, clientId, startTime, endTime, runName, resortName, resortLatitude, resortLongitude, distance, maxSpeed, averageSpeed, elevationDrop, startElevation, endElevation, duration, points, difficulty, calories, avgHeartRate, maxHeartRate, routeData } = req.body;
    const runId = id || clientId;
    if (!runId) return fail(res, 'Run ID required');
    if (!startTime) return fail(res, 'startTime required');
    await query(
      `INSERT INTO runs (id, client_id, user_id, run_name, resort_name, resort_latitude, resort_longitude, start_time, end_time, distance, max_speed, average_speed, elevation_drop, start_elevation, end_elevation, duration, points, difficulty, calories, avg_heart_rate, max_heart_rate, route_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (id) DO UPDATE SET run_name=EXCLUDED.run_name, resort_name=EXCLUDED.resort_name, distance=EXCLUDED.distance, max_speed=EXCLUDED.max_speed, average_speed=EXCLUDED.average_speed, elevation_drop=EXCLUDED.elevation_drop, points=EXCLUDED.points, difficulty=EXCLUDED.difficulty, calories=EXCLUDED.calories, avg_heart_rate=EXCLUDED.avg_heart_rate, max_heart_rate=EXCLUDED.max_heart_rate, route_data=EXCLUDED.route_data, updated_at=NOW()`,
      [runId, runId, req.user.id, runName||null, resortName||null, resortLatitude||null, resortLongitude||null, startTime, endTime||null, distance||0, maxSpeed||0, averageSpeed||0, elevationDrop||0, startElevation||0, endElevation||0, duration||0, points||0, difficulty||'blue', calories||0, avgHeartRate||0, maxHeartRate||0, routeData?JSON.stringify(routeData):null]
    );
    return ok(res, { runId, synced: true }, 201);
  } catch (err) { console.error('Run upload error:', err.message); next(err); }
});

router.post('/bulk', authenticate, async (req, res, next) => {
  try {
    const { runs } = req.body;
    if (!Array.isArray(runs) || !runs.length) return fail(res, 'Runs array required');
    const results = [];
    for (const run of runs) {
      try {
        const runId = run.id || run.clientId;
        if (!runId) { results.push({ clientId: 'unknown', status: 'error', error: 'No ID' }); continue; }
        await query(
          `INSERT INTO runs (id, client_id, user_id, run_name, resort_name, resort_latitude, resort_longitude, start_time, end_time, distance, max_speed, average_speed, elevation_drop, start_elevation, end_elevation, duration, points, difficulty, calories, avg_heart_rate, max_heart_rate, route_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
           ON CONFLICT (id) DO UPDATE SET run_name=EXCLUDED.run_name, resort_name=EXCLUDED.resort_name, points=EXCLUDED.points, distance=EXCLUDED.distance, max_speed=EXCLUDED.max_speed, elevation_drop=EXCLUDED.elevation_drop, updated_at=NOW()`,
          [runId, runId, req.user.id, run.runName||null, run.resortName||null, run.resortLatitude||null, run.resortLongitude||null, run.startTime, run.endTime||null, run.distance||0, run.maxSpeed||0, run.averageSpeed||0, run.elevationDrop||0, run.startElevation||0, run.endElevation||0, run.duration||0, run.points||0, run.difficulty||'blue', run.calories||0, run.avgHeartRate||0, run.maxHeartRate||0, run.routeData?JSON.stringify(run.routeData):null]
        );
        results.push({ clientId: runId, status: 'created' });
      } catch (err) { results.push({ clientId: run.id||'unknown', status: 'error', error: err.message }); }
    }
    return ok(res, { results });
  } catch (err) { next(err); }
});

router.post('/batch', authenticate, async (req, res, next) => { req.url = '/bulk'; router.handle(req, res, next); });

router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page)||1, limit = Math.min(parseInt(req.query.limit)||20,100), offset = (page-1)*limit;
    let where = 'user_id=$1 AND is_deleted=false', params = [req.user.id], idx = 2;
    if (req.query.resort) { where += ` AND resort_name=$${idx++}`; params.push(req.query.resort); }
    if (req.query.since) { where += ` AND start_time>$${idx++}`; params.push(req.query.since); }
    const countR = await query(`SELECT COUNT(*) FROM runs WHERE ${where}`, params);
    const total = parseInt(countR.rows[0].count);
    const runsR = await query(`SELECT id,run_name,resort_name,resort_latitude,resort_longitude,start_time,end_time,distance,max_speed,average_speed,elevation_drop,start_elevation,end_elevation,duration,points,difficulty,calories,avg_heart_rate,max_heart_rate,created_at,updated_at FROM runs WHERE ${where} ORDER BY start_time DESC LIMIT $${idx++} OFFSET $${idx}`, [...params, limit, offset]);
    return res.json({ error:false, data: runsR.rows.map(formatRun), pagination:{page,limit,total,pages:Math.ceil(total/limit)} });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM runs WHERE id=$1 AND user_id=$2 AND is_deleted=false', [req.params.id, req.user.id]);
    if (!r.rows.length) return fail(res, 'Run not found', 404);
    return ok(res, formatRun(r.rows[0]));
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const r = await query('UPDATE runs SET is_deleted=true,deleted_at=NOW() WHERE id=$1 AND user_id=$2 AND is_deleted=false RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return fail(res, 'Run not found', 404);
    return ok(res, { message: 'Run deleted' });
  } catch (err) { next(err); }
});

function formatRun(row) {
  return { id:row.id, runName:row.run_name, resortName:row.resort_name, resortLatitude:row.resort_latitude, resortLongitude:row.resort_longitude, startTime:row.start_time, endTime:row.end_time, distance:parseFloat(row.distance), maxSpeed:parseFloat(row.max_speed), averageSpeed:parseFloat(row.average_speed), elevationDrop:parseFloat(row.elevation_drop), startElevation:parseFloat(row.start_elevation), endElevation:parseFloat(row.end_elevation), duration:parseFloat(row.duration), points:parseInt(row.points), difficulty:row.difficulty, calories:parseFloat(row.calories), avgHeartRate:parseFloat(row.avg_heart_rate), maxHeartRate:parseFloat(row.max_heart_rate), createdAt:row.created_at, updatedAt:row.updated_at };
}

module.exports = router;
