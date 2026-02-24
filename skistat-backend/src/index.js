require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — allow iOS app
app.use(cors({
  origin: '*', // In production, restrict to your app's domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' })); // Large for route data
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: true, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/v1/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 auth attempts per 15 min
  message: { error: true, message: 'Too many login attempts, please try again later' },
});
app.use('/v1/auth/', authLimiter);

// ==========================================
// ROUTES
// ==========================================

const generalRoutes = require('./routes/general');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const runsRoutes = require('./routes/runs');
const friendsRoutes = require('./routes/friends');
const leaderboardRoutes = require('./routes/leaderboard');

// Public routes
app.use('/', generalRoutes);

// API v1
app.use('/v1/auth', authRoutes);
app.use('/v1/profile', profileRoutes);
app.use('/v1/runs', runsRoutes);
app.use('/v1/friends', friendsRoutes);
app.use('/v1/leaderboard', leaderboardRoutes);

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`
  🏔️  SkiStat API Server
  ━━━━━━━━━━━━━━━━━━━━━━
  Port:        ${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  Database:    ${process.env.DATABASE_URL ? 'configured' : '⚠️  NOT SET'}
  ━━━━━━━━━━━━━━━━━━━━━━
  
  Endpoints:
  GET  /                          Health check
  GET  /health                    Detailed health
  GET  /invite/:code              Invite deep link
  
  POST /v1/auth/apple             Sign In with Apple
  POST /v1/auth/register          Email + password register
  POST /v1/auth/login             Email + password login
  POST /v1/auth/refresh           Refresh JWT
  POST /v1/auth/logout            Logout
  DEL  /v1/auth/account           Delete account
  
  GET  /v1/profile                Get profile
  PUT  /v1/profile                Update profile
  
  POST /v1/runs                   Upload run
  POST /v1/runs/bulk              Bulk upload runs
  GET  /v1/runs                   Get my runs
  GET  /v1/runs/:id               Get run detail
  DEL  /v1/runs/:id               Delete run
  
  GET  /v1/friends                List friends
  GET  /v1/friends/pending        Pending requests
  POST /v1/friends/invite/:code   Add by invite code
  DEL  /v1/friends/:id            Remove friend
  GET  /v1/friends/:id/runs       Friend's runs
  
  GET  /v1/leaderboard/season     Season points board
  GET  /v1/leaderboard/speed      Speed board
  GET  /v1/leaderboard/vert       Vertical board
  GET  /v1/leaderboard/distance   Distance board
  `);
});

module.exports = app;
