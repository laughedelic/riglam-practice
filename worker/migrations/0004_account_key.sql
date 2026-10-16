-- An account that has shown the Magic Key (a request with a valid proof, signed in) carries it: any device that signs in to the
-- account can ask for the key (GET /api/account/key), also after the key was changed. 1 = carries it.
ALTER TABLE users ADD COLUMN has_key INTEGER NOT NULL DEFAULT 0;
