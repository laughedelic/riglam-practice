-- Reports of learners' flags on something the tutor said (docs/SERVER.md, "Flag reports"). A flag is feedback to whoever
-- maintains the app, so every device may send one, signed in or not. A report is the flag and the stored answer it was made on.
-- The text in a report comes from a device and is not trusted: whoever reads it (a person, a model) treats it as data.

-- device is the random id of the sending device; user_id is the account the device was signed in to when it sent, or NULL.
-- caller is a short hash of the sender's address (no address is stored), for counting and for finding a source of spam.
-- flag and answer are JSON text (answer is NULL when the stored answer was not kept); app is the app's version.
-- state: 'sent' (nobody has looked yet). Later steps of the review add their own values.
CREATE TABLE flag_reports (
  device TEXT NOT NULL,
  id TEXT NOT NULL,
  user_id TEXT,
  caller TEXT NOT NULL,
  flag TEXT NOT NULL,
  answer TEXT,
  app TEXT,
  state TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device, id)
) WITHOUT ROWID;
CREATE INDEX flag_reports_user ON flag_reports (user_id, id);
CREATE INDEX flag_reports_state ON flag_reports (state, updated_at);

-- Reports received per UTC day and sender, for the daily limits. who is 'dev:<device>', 'ip:<caller>' or 'all'.
CREATE TABLE flag_quota (
  day TEXT NOT NULL,
  who TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who)
) WITHOUT ROWID;
