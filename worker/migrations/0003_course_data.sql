-- The course part of the term data, kept on the server instead of in the repository (docs/DATA.md).
-- kind is 'definitions' (sent to a device that has the Magic Key) or 'notes' (read only by the tutor, never sent out).
-- body is JSON text; updated_at is its version, so a device can ask whether what it kept is still current.
-- Loaded with `npm run data:publish`.
CREATE TABLE course_data (
  kind TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

-- Wrong Magic Keys per hour and caller, so that guessing the key is slow: who is a hash of the caller's address, hour is 'YYYY-MM-DDTHH' (UTC).
CREATE TABLE guesses (
  hour TEXT NOT NULL,
  who TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, who)
) WITHOUT ROWID;
