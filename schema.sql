CREATE TABLE IF NOT EXISTS election_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL CHECK (json_valid(body))
);

CREATE TABLE IF NOT EXISTS candidate_photo_chunks (
  path TEXT NOT NULL,
  part INTEGER NOT NULL,
  type TEXT NOT NULL,
  file BLOB NOT NULL,
  PRIMARY KEY (path, part)
);
