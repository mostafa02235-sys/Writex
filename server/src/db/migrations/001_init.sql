-- Writex AI: initial schema
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  ip_hash       TEXT,
  platform      TEXT,
  app_version   TEXT,
  blocked       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES devices(id),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('text', 'image')),
  mime        TEXT,
  size        INTEGER NOT NULL,
  text        TEXT,            -- extracted text (documents, PDFs)
  data        TEXT,            -- data URL (images)
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_device ON files(device_id, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES devices(id),
  type            TEXT NOT NULL,
  title           TEXT,
  status          TEXT NOT NULL CHECK (status IN ('waiting', 'processing', 'analyzing', 'generating', 'completed', 'failed', 'cancelled')),
  stage           TEXT,
  progress_done   INTEGER NOT NULL DEFAULT 0,
  progress_total  INTEGER NOT NULL DEFAULT 0,
  input_json      TEXT NOT NULL,
  result_text     TEXT,
  result_json     TEXT,
  error           TEXT,
  error_code      TEXT,
  model           TEXT,
  attempt         INTEGER NOT NULL DEFAULT 1,
  parent_id       TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  started_at      INTEGER,
  finished_at     INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_device ON jobs(device_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  job_id        TEXT,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_chars   INTEGER NOT NULL DEFAULT 0,
  output_chars  INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  ok            INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_device_day ON usage(device_id, created_at);

CREATE TABLE IF NOT EXISTS rate_events (
  bucket      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_bucket ON rate_events(bucket, created_at);
