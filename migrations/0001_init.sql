-- GeoTopo Pro — Cloudflare D1
-- Migration 0001: Schema complet

PRAGMA journal_mode=WAL;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  trial_ends_at TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  reset_token   TEXT UNIQUE,
  reset_expires TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_reset ON users(reset_token) WHERE reset_token IS NOT NULL;

-- ── SESSIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ip          TEXT,
  ua          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_token  ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- ── PROJECTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  crs         TEXT NOT NULL DEFAULT 'EPSG:4326',
  base_map    TEXT NOT NULL DEFAULT 'osm',
  center_lat  REAL DEFAULT 29.0,
  center_lon  REAL DEFAULT -10.0,
  zoom        INTEGER DEFAULT 10,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_user    ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- ── LAYERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS layers (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'geojson',
  r2_key      TEXT,
  geojson     TEXT,
  style       TEXT DEFAULT '{}',
  visible     INTEGER NOT NULL DEFAULT 1,
  z_index     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_layers_project ON layers(project_id);
CREATE INDEX IF NOT EXISTS idx_layers_user    ON layers(user_id);
