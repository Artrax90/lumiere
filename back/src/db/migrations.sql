-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar VARCHAR(500) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type VARCHAR(10) NOT NULL DEFAULT 'movie',
  title_name VARCHAR(500) NOT NULL,
  poster VARCHAR(500) DEFAULT '',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tmdb_id, media_type)
);

-- Watchlist ("Буду смотреть") table
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type VARCHAR(10) NOT NULL DEFAULT 'movie',
  title_name VARCHAR(500) NOT NULL,
  poster VARCHAR(500) DEFAULT '',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tmdb_id, media_type)
);

-- Watch history table
CREATE TABLE IF NOT EXISTS watch_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type VARCHAR(10) NOT NULL DEFAULT 'movie',
  title_name VARCHAR(500) NOT NULL,
  poster VARCHAR(500) DEFAULT '',
  progress INTEGER DEFAULT 0,
  timestamp BIGINT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tmdb_id, media_type)
);

-- Migrate timestamp column to BIGINT if it exists as INTEGER
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'watch_history' 
    AND column_name = 'timestamp' 
    AND data_type = 'integer'
  ) THEN
    ALTER TABLE watch_history ALTER COLUMN timestamp TYPE BIGINT;
  END IF;
END $$;

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IPTV playlists table
CREATE TABLE IF NOT EXISTS iptv_playlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  epg_url VARCHAR(1000) DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, url)
);

-- App settings table (runtime config like TMDB token, proxy URL)
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Migration: Add role, pin, is_kids to users table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pin') THEN
    ALTER TABLE users ADD COLUMN pin VARCHAR(10) DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_kids') THEN
    ALTER TABLE users ADD COLUMN is_kids BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Clean up any legacy default test user
DELETE FROM users WHERE email IN ('local@lumiere', 'local') AND id = 1;

-- User preferences table (home shelves, layout, UI preferences)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  media_type VARCHAR(50) DEFAULT 'tv',
  media_id INTEGER NOT NULL,
  poster VARCHAR(500) DEFAULT '',
  action_data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Series subscriptions (tracking new episodes)
CREATE TABLE IF NOT EXISTS series_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  poster VARCHAR(500) DEFAULT '',
  last_season INTEGER DEFAULT 0,
  last_episode INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tmdb_id)
);
CREATE INDEX IF NOT EXISTS idx_series_subscriptions_user_id ON series_subscriptions(user_id);

-- EPG Reminders / Auto-switch
CREATE TABLE IF NOT EXISTS epg_reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id VARCHAR(255) NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  program_title VARCHAR(500) NOT NULL,
  start_ms BIGINT NOT NULL,
  stop_ms BIGINT NOT NULL,
  auto_switch BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_epg_reminders_user_id ON epg_reminders(user_id);

-- Jellyfin-style Active Playback Sessions
CREATE TABLE IF NOT EXISTS playback_sessions (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER,
  device_type VARCHAR(50) DEFAULT 'web',
  device_name VARCHAR(255) DEFAULT '',
  client_ip VARCHAR(100) DEFAULT '',
  media_type VARCHAR(50) DEFAULT 'movie',
  media_id VARCHAR(255) DEFAULT '',
  media_title VARCHAR(500) NOT NULL,
  media_poster VARCHAR(500) DEFAULT '',
  season INTEGER DEFAULT 0,
  episode INTEGER DEFAULT 0,
  current_time NUMERIC DEFAULT 0,
  duration NUMERIC DEFAULT 0,
  is_paused BOOLEAN DEFAULT FALSE,
  terminate_requested BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_playback_sessions_user_id ON playback_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_playback_sessions_last_heartbeat ON playback_sessions(last_heartbeat);

-- Unified Playback History
CREATE TABLE IF NOT EXISTS playback_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  device_type VARCHAR(50) DEFAULT 'web',
  device_name VARCHAR(255) DEFAULT '',
  media_type VARCHAR(50) DEFAULT 'movie',
  media_id VARCHAR(255) DEFAULT '',
  media_title VARCHAR(500) NOT NULL,
  media_poster VARCHAR(500) DEFAULT '',
  season INTEGER DEFAULT 0,
  episode INTEGER DEFAULT 0,
  watched_seconds NUMERIC DEFAULT 0,
  duration NUMERIC DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_playback_history_user_id ON playback_history(user_id);
CREATE INDEX IF NOT EXISTS idx_playback_history_ended_at ON playback_history(ended_at);

-- Allow nullable user_id for Smart TV, Guest or Device playback sessions
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'playback_sessions' AND column_name = 'user_id' AND is_nullable = 'NO') THEN
    ALTER TABLE playback_sessions ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'playback_history' AND column_name = 'user_id' AND is_nullable = 'NO') THEN
    ALTER TABLE playback_history ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'playback_sessions_user_id_fkey') THEN
    ALTER TABLE playback_sessions DROP CONSTRAINT playback_sessions_user_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'playback_history_user_id_fkey') THEN
    ALTER TABLE playback_history DROP CONSTRAINT playback_history_user_id_fkey;
  END IF;
END $$;


