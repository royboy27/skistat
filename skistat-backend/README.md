# SkiStat Backend

Node.js + Express API server for the SkiStat ski tracking app.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your database URL, JWT secrets, and Apple credentials
```

### 3. Set up PostgreSQL
```bash
# Create a database called 'skistat'
createdb skistat

# Run migrations
npm run migrate
```

### 4. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Deploy to Railway

1. Push this repo to GitHub
2. Create a new project on [Railway](https://railway.app)
3. Add a PostgreSQL plugin
4. Connect your GitHub repo
5. Set environment variables:
   - `JWT_SECRET` — random 64+ char string
   - `JWT_REFRESH_SECRET` — different random 64+ char string
   - `APPLE_CLIENT_ID` — your app's bundle ID
   - `APPLE_TEAM_ID` — your Apple Developer Team ID
   - `NODE_ENV` — `production`
6. Railway auto-sets `DATABASE_URL` and `PORT`
7. Run the migration: `npm run migrate`

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/auth/apple` | No | Sign In with Apple |
| POST | `/v1/auth/register` | No | Email + password register |
| POST | `/v1/auth/login` | No | Email + password login |
| POST | `/v1/auth/refresh` | No | Refresh JWT token |
| POST | `/v1/auth/logout` | Yes | Logout |
| DELETE | `/v1/auth/account` | Yes | Delete account |
| GET | `/v1/profile` | Yes | Get profile + stats |
| PUT | `/v1/profile` | Yes | Update profile |
| POST | `/v1/runs` | Yes | Upload a run |
| POST | `/v1/runs/bulk` | Yes | Bulk upload runs |
| GET | `/v1/runs` | Yes | List my runs |
| GET | `/v1/runs/:id` | Yes | Run detail |
| DELETE | `/v1/runs/:id` | Yes | Delete run |
| GET | `/v1/friends` | Yes | List friends |
| POST | `/v1/friends/invite/:code` | Yes | Add friend by code |
| DELETE | `/v1/friends/:id` | Yes | Remove friend |
| GET | `/v1/friends/:id/runs` | Yes | Friend's runs |
| GET | `/v1/leaderboard/season` | Yes | Points leaderboard |
| GET | `/v1/leaderboard/speed` | Yes | Speed leaderboard |
| GET | `/v1/leaderboard/vert` | Yes | Vertical leaderboard |
| GET | `/v1/leaderboard/distance` | Yes | Distance leaderboard |

## Architecture

```
src/
├── index.js              # Express server entry point
├── routes/
│   ├── auth.js           # Authentication endpoints
│   ├── profile.js        # User profile CRUD
│   ├── runs.js           # Run upload/fetch/delete
│   ├── friends.js        # Friend system
│   ├── leaderboard.js    # Leaderboard queries
│   └── general.js        # Health check, invite links
├── middleware/
│   ├── auth.js           # JWT verification
│   └── validate.js       # Request validation
├── services/
│   └── authService.js    # Auth business logic
└── utils/
    └── helpers.js        # Utilities (invite codes, etc.)
config/
└── database.js           # PostgreSQL connection pool
migrations/
└── run.js                # Database schema migration
```
