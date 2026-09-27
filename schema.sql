-- TurfOS D1 phase-1 schema.
-- The Worker also creates these tables automatically, so running this file manually is optional.
CREATE TABLE IF NOT EXISTS turfos_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_turfos_store_expires ON turfos_store(expires_at);
CREATE TABLE IF NOT EXISTS turfos_migrations (
  name TEXT PRIMARY KEY,
  completed_at TEXT,
  detail TEXT
);
