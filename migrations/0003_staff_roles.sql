ALTER TABLE users ADD COLUMN role_next TEXT NOT NULL DEFAULT 'production'
  CHECK (role_next IN ('admin', 'procurement', 'production'));

UPDATE users SET role_next = CASE role
  WHEN 'admin' THEN 'admin'
  ELSE 'production'
END;

ALTER TABLE users DROP COLUMN role;
ALTER TABLE users RENAME COLUMN role_next TO role;
