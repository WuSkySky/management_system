ALTER TABLE users RENAME COLUMN password_hash TO password;

INSERT INTO users (id, username, display_name, password, role, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', '17755237903', '吴彦奇', '17755237903', 'admin', unixepoch())
ON CONFLICT(username) DO NOTHING;
