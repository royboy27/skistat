require('dotenv').config();
const { pool } = require('../config/database');

const migration = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE,
  password_hash   VARCHAR(255),
  apple_user_id   VARCHAR(255) UNIQUE,
  display_name    VARCHAR(100) NOT NULL DEFAULT 'Skier',
  home_resort     VARCHAR(255),
  invite_code     VARCHAR(20) UNIQUE NOT NULL,
  use_metric      BOOLEAN DEFAULT false,
  weight_kg       DOUBLE PRECISION DEFAULT 75.0,
  haptics_enabled BOOLEAN DEFAULT true,
  battery_mode    VARCHAR(20) DEFAULT 'precision',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  is_banned       BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_user_id);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(500) NOT NULL,
  device_info VARCHAR(255),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked     BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

CREATE TABLE IF NOT EXISTS runs (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  difficulty      VARCHAR(50) DEFAULT 'Blue',
  calories        DOUBLE PRECISION DEFAULT 0,
  avg_heart_rate  DOUBLE PRECISION DEFAULT 0,
  max_heart_rate  DOUBLE PRECISION DEFAULT 0,
  route_data      JSONB,
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_user_start ON runs(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_runs_resort ON runs(resort_name);
CREATE INDEX IF NOT EXISTS idx_runs_not_deleted ON runs(user_id) WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS friendships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

CREATE TABLE IF NOT EXISTS user_achievements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  VARCHAR(100) NOT NULL,
  unlocked_at     TIMESTAMPTZ DEFAULT NOW(),
  season          VARCHAR(20),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id);

CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(500) NOT NULL,
  platform    VARCHAR(20) DEFAULT 'ios',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

CREATE TABLE IF NOT EXISTS lift_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resort_name VARCHAR(255) NOT NULL,
  lift_name   VARCHAR(255) NOT NULL,
  wait_minutes INTEGER,
  status      VARCHAR(20),
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lift_reports_resort ON lift_reports(resort_name, reported_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER runs_updated_at BEFORE UPDATE ON runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function runMigration() {
  console.log('Running database migration...');
  try {
    await pool.query(migration);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
