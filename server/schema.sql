CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  ip TEXT,
  locale TEXT,
  model TEXT,
  name TEXT,
  node TEXT,
  color TEXT,
  size_volume TEXT,
  capacity TEXT,
  weight TEXT,
  material TEXT,
  brand TEXT,
  title TEXT,
  bullets_json TEXT
);
