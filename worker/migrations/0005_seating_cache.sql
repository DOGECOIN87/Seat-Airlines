-- The seating as last read from the chain, shared by every copy of the Worker
-- so the chain is read once per cache period for all of them rather than once
-- per copy. One row. The Worker creates this table itself on its first write
-- (see `writeShared` in src/ladder.ts); this is the same schema, for the record
-- and for a database set up by hand.
CREATE TABLE IF NOT EXISTS seating_cache (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  body    TEXT NOT NULL,
  read_at INTEGER NOT NULL
);
