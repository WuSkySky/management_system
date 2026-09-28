CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  disabled_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  blocked_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX login_attempts_updated_at_idx ON login_attempts(updated_at);
