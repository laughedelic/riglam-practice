-- Optional accounts and the server copy of a person's documents (docs/SERVER.md, "Accounts and sync").
-- Nothing here identifies a person beyond a random id and the name they chose; there is no email address.

-- id is 16 random bytes, base64url; it is also the WebAuthn user handle.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;

-- One row per passkey. public_key is the COSE key, base64url. A passkey belongs to the host name it was made on.
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
) WITHOUT ROWID;
CREATE INDEX credentials_user ON credentials (user_id);

-- token_hash is the SHA-256 of the value in the cookie, so a copy of the database cannot be used to sign in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions (user_id);

-- The random value a passkey ceremony signs; used once, valid for a few minutes.
-- kind is 'register' (a new account: user_id and name are what to create), 'login' or 'passkey' (user_id is the account to add to).
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  user_id TEXT,
  name TEXT,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;

-- The documents. data is JSON text, or NULL for a deletion (the row stays so that other devices learn of it).
-- t is when the writing device made the change (ms since the epoch); seq counts the accepted changes of one user, so a device can ask for "everything after seq".
CREATE TABLE docs (
  user_id TEXT NOT NULL,
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  t INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, col, id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX docs_seq ON docs (user_id, seq);

-- Document writes per account and UTC day, for the daily limit.
CREATE TABLE sync_quota (
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  writes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
) WITHOUT ROWID;
