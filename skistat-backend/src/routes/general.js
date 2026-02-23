const express = require('express');
const { query } = require('../../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

const router = express.Router();

// ==========================================
// GET / — Health check
// ==========================================
router.get('/', (req, res) => {
  return successResponse(res, {
    service: 'SkiStat API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// GET /health — Detailed health check
// ==========================================
router.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    return successResponse(res, {
      status: 'healthy',
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (err) {
    return errorResponse(res, 503, 'Database unavailable');
  }
});

// ==========================================
// GET /invite/:code — Invite deep link handler
// Redirects to app or App Store
// ==========================================
router.get('/invite/:code', async (req, res) => {
  const code = req.params.code;
  
  // Check if user exists with this code
  const result = await query('SELECT display_name FROM users WHERE invite_code = $1', [code]);
  const name = result.rows.length > 0 ? result.rows[0].display_name : null;
  
  // Try deep link first, fall back to App Store
  const deepLink = `skistat://invite/${code}`;
  const appStoreLink = 'https://apps.apple.com/app/skistat/id0000000000'; // Replace with real ID
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SkiStat Invite</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, system-ui; text-align: center; padding: 60px 20px; background: #0a0a14; color: white; }
        h1 { font-size: 28px; }
        p { color: #888; font-size: 16px; }
        .btn { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #007AFF, #00BCD4); color: white; text-decoration: none; border-radius: 14px; font-size: 17px; font-weight: bold; margin-top: 20px; }
        .code { font-family: monospace; font-size: 20px; color: #00BCD4; background: rgba(0,188,212,0.1); padding: 8px 16px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <h1>⛷️ SkiStat</h1>
      ${name ? `<p><strong>${name}</strong> invited you to SkiStat!</p>` : '<p>You\'ve been invited to SkiStat!</p>'}
      <p class="code">${code}</p>
      <br>
      <a class="btn" href="${deepLink}" id="openApp">Open in SkiStat</a>
      <p style="margin-top: 30px; font-size: 13px; color: #555;">
        Don't have SkiStat? <a href="${appStoreLink}" style="color: #00BCD4;">Download on the App Store</a>
      </p>
      <script>
        setTimeout(() => { window.location = '${appStoreLink}'; }, 2000);
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
