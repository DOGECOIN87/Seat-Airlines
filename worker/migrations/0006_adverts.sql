-- The advert wall: one row per wallet, the published advert as JSON. The Worker
-- creates this table itself on the first publish or takedown and, while it is
-- empty, fills it from the old single-record wall in KV (see `ensureAdverts` in src/index.ts);
-- this is the same schema, for the record and for a database set up by hand.
CREATE TABLE IF NOT EXISTS adverts (
  owner   TEXT PRIMARY KEY,
  body    TEXT NOT NULL,
  updated TEXT NOT NULL
);
