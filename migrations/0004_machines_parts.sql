CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  expected_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE parts (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  route TEXT NOT NULL CHECK (route IN ('procurement', 'production')),
  assignee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('not_purchased', 'purchased_unpaid', 'paid_unstocked', 'missing_materials', 'producing', 'stocked')),
  created_at INTEGER NOT NULL,
  UNIQUE (machine_id, name)
);

CREATE INDEX parts_machine_id_idx ON parts(machine_id);
CREATE INDEX parts_assignee_id_idx ON parts(assignee_id);
