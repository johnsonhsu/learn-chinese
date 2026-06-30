-- D1 migration for the SILOED feedback database (binding: FEEDBACK_DB).
-- Apply once against the dedicated `feedback` D1 database — NOT the app's data:
--   npx wrangler d1 execute feedback --remote --file=platform/functions/migrations/0001_init.sql
--
-- This database holds ONLY feedback. It shares nothing with platform.db /
-- content.db / the user store. Screenshots live in the dedicated R2 bucket
-- (FEEDBACK_R2); the row stores only the R2 object key (screenshot_key).

CREATE TABLE IF NOT EXISTS feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  category       TEXT NOT NULL,
  option         TEXT DEFAULT '',
  message        TEXT NOT NULL,
  screen         TEXT DEFAULT '',
  context_json   TEXT DEFAULT '',
  screenshot_key TEXT,                       -- R2 object key, or NULL
  ua             TEXT DEFAULT '',
  app_version    TEXT DEFAULT '',
  profile_id     INTEGER,                    -- numeric profile id only (no PII)
  status         TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_feedback_status  ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

-- Per-IP rate-limit ledger (60s sliding window, swept on each POST).
CREATE TABLE IF NOT EXISTS rate_hits (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_hits_ip ON rate_hits(ip);
CREATE INDEX IF NOT EXISTS idx_rate_hits_ts ON rate_hits(ts);
