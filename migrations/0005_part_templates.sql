CREATE TABLE part_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  route TEXT NOT NULL CHECK (route IN ('procurement', 'production')),
  assignee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);
