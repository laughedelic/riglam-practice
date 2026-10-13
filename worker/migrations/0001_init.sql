-- Spend counters, one row per UTC day and scope. micro = millionths of a US dollar spent (or held back for a running question).
-- scope is 'global' or 'dev:<device id>'.
CREATE TABLE budget (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  micro INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
) WITHOUT ROWID;

-- One row per finished question: what it cost and how it ended. No text of any question or answer is kept.
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  device TEXT NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  micro INTEGER NOT NULL,
  outcome TEXT NOT NULL
);
CREATE INDEX usage_log_day ON usage_log (day);

-- Switches an operator sets by hand (the Cloudflare dashboard's D1 console): UPDATE/INSERT settings (key, value).
-- 'tutor' = 'off' stops every tutor request at once; no row, or any other value, leaves it on.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
