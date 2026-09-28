-- A card's social links: X, Telegram, Discord, Linktree, Instagram, TikTok,
-- YouTube and GitHub, as one JSON object of handles per wallet.
--
-- A table of its own rather than a column on `profiles`, so the Worker can
-- make it on first use with `IF NOT EXISTS` (see `ensureProfileLinks` in
-- src/index.ts) and no deploy has to run a migration. This file is the same
-- schema, for a database set up by hand.

CREATE TABLE IF NOT EXISTS profile_links (
  address TEXT PRIMARY KEY,
  links   TEXT NOT NULL DEFAULT '{}'
);
