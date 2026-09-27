-- The landing's leaderboard. The Worker makes these on first use (see
-- ensureLeaderboard in src/index.ts), so applying this is optional: it is
-- the same schema, for a database set up by hand, and harmless to re-run.

CREATE TABLE IF NOT EXISTS game_runs (
  id         TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ip         TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS game_runs_by_ip ON game_runs (ip, started_at);

CREATE TABLE IF NOT EXISTS game_scores (
  address   TEXT PRIMARY KEY,
  score     INTEGER NOT NULL,
  survived  REAL NOT NULL,
  climb     REAL NOT NULL,
  posted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS game_scores_by_score ON game_scores (score DESC);
