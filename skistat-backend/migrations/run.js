require('dotenv').config();
const { pool } = require('../config/database');

const migration = `
-- ============================================
-- SkiStat Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE,
  password_hash   VARCHAR(255),
  apple_user_id   VARCHAR(255) UNIQUE,
  display_name    VARCHAR(100) NOT NULL DEFAULT 'Skier',
  home_resort     VARCHAR(255),
  avatar_url      VARCHAR(500),
  invite_code     VARCHAR(20) UNIQUE NOT NULL,
  use_metric      BOOLEAN DEFAULT false,
  weight_kg       DOUBLE PRECISION DEFAULT 75.0,
  haptics_enabled BOOLEAN DEFAULT true,
  battery_mode    VARCHAR(20) DEFAULT 'precision',
  is_banned       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_apple_id ON users(apple_user_id);
CREATE INDEX idx_users_invite_code ON users(invite_code);

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(500) NOT NULL,
  device_info VARCHAR(255),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================
-- RUNS
-- ============================================
CREATE TABLE IF NOT EXISTS runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL,
  run_name        VARCHAR(255),
  resort_name     VARCHAR(255),
  resort_latitude DOUBLE PRECISION,
  resort_longitude DOUBLE PRECISION,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  distance        DOUBLE PRECISION DEFAULT 0,
  max_speed       DOUBLE PRECISION DEFAULT 0,
  average_speed   DOUBLE PRECISION DEFAULT 0,
  elevation_drop  DOUBLE PRECISION DEFAULT 0,
  start_elevation DOUBLE PRECISION DEFAULT 0,
  end_elevation   DOUBLE PRECISION DEFAULT 0,
  duration        DOUBLE PRECISION DEFAULT 0,
  points          INTEGER DEFAULT 0,
  calories        DOUBLE PRECISION DEFAULT 0,
  avg_heart_rate  DOUBLE PRECISION DEFAULT 0,
  max_heart_rate  DOUBLE PRECISION DEFAULT 0,
  difficulty      VARCHAR(50) DEFAULT 'Blue',
  route_data      JSONB,
  is_deleted      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_user ON runs(user_id);
CREATE INDEX idx_runs_user_time ON runs(user_id, start_time DESC);
CREATE INDEX idx_runs_client_id ON runs(user_id, client_id);
CREATE INDEX idx_runs_resort ON runs(resort_name);

-- ============================================
-- FRIENDSHIPS
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, blocked
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX idx_friendships_user ON friendships(user_id, status);
CREATE INDEX idx_friendships_friend ON friendships(friend_id, status);

-- ============================================
-- ACHIEVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  VARCHAR(100) NOT NULL,
  season          VARCHAR(20),
  unlocked_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_achievements_user ON achievements(user_id);

-- ============================================
-- DEVICE TOKENS (Push Notifications)
-- ============================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(500) NOT NULL,
  platform    VARCHAR(20) DEFAULT 'ios',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

async function runMigration() {
  console.log('🏔️  Running SkiStat database migration...');
  try {
    await pool.query(migration);
    console.log('✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

runMigration();
