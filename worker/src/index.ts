/**
 * The advert server, and the cabin directory.
 *
 * The wall, keyed by wallet:
 *
 *   GET  /banners   the published wall, keyed by wallet
 *   POST /banner    put an advert up, if you can prove the wallet is yours
 *   GET  /holders   who is aboard, and the supply their bags are shares of
 *   GET  /holding   one wallet's balance, so no page has to carry an RPC key
 *   GET  /flight    what the aeroplane is being told to do, if anything
 *   PUT  /flight    tell it — the flight deck only
 *
 * Embedded wallets (email, passkey, social sign-in), with the Helius key
 * held here rather than in the page — see `helius.ts`:
 *
 *   GET/POST /helius/…
 *
 * The directory, behind a session that same wallet signature opens:
 *
 *   POST   /session    prove the key, get a bearer token for a day
 *   DELETE /session    hand it back
 *   GET    /directory  every published card
 *   PUT    /profile    publish or amend your own
 *   GET    /messages   your introductions, both directions
 *   POST   /messages   send one, to your own section or one behind it
 *
 * And one route that is nobody's but the operator's:
 *
 *   GET/POST/PATCH/DELETE /logbook   one wallet's private notes
 *
 * It answers 404 to everybody else — the same 404 as a misspelt path, byte
 * for byte — because a 403 tells whoever asked that there is something there
 * to be refused. See its own section below.
 *
 * ── What this service knows about seats ───────────────────────────────────
 * For the wall, nothing, and it needs nothing: an advert is stored against
 * the wallet that published it and the page decides where it hangs. That
 * leaves the wall exactly one question — is this request really from the
 * wallet it names? — and the first half of this file answers it.
 *
 * For the directory that is not enough. "Your own section and everything
 * behind it" is a rule about who may read somebody's email address and who
 * may write into their inbox, and a rule enforced in the browser is a
 * suggestion the network tab ignores. So this side works the seating out as
 * well. Not a second copy of it — the drift that would cause is what the
 * refusal was always about — but the page's own module, imported from
 * `src/lib/seating.ts` and fed the page's own holder feed by `ladder.ts`.
 */

import {
  advertTextProblem, challenge, decodeDataUrl, imageType, legacyChallenge, readStoredBanner, sha256Hex, takedownChallenge, verifySignature,
  MAX_AGE_MS, MAX_IMAGE_BYTES, COOLDOWN_SECONDS, type StoredBanner,
} from './verify';
import { storedOfferings } from '../../src/content/offerings';
import {
  bearerToken, isAddress, messageId, mintToken, parseStoredLinks, readMessageBody, readProfileInput,
  signInChallenge, tokenHash,
  ANNOUNCEMENTS_PER_DAY, ANNOUNCEMENT_PAGE,
  MESSAGES_PER_HOUR, MESSAGE_PAGE, SESSION_TTL_MS, SIGNIN_MAX_AGE_MS,
} from './networking';
import {
  entryId, isAdmin, packTags, readLogbookInput, readLogbookPatch, unpackTags,
  LOGBOOK_PAGE, type LogEntry, type LogStatus,
} from './logbook';
import { cabinSize, canSeat, readLadder, rpcUrl } from './ladder';
import { HANDS_OFF, clamped, handsOff, type ManualControls } from '../../src/lib/manualControls';
import { scoreChallenge } from '../../src/lib/scoring';
import { BOARD_SIZE, RUN_TTL_MS, RUNS_PER_HOUR, implausible, newRunId, readScorePost } from './leaderboard';
import { CARD_TTL_SECONDS, cardId, cardPage, cardProblem, isCardId, seatCardChallenge, seatCardId } from './cards';
import {
  disconnect, finishConnect, isHandle, isNonce, linkedName, mediaMode, postFlight, readPostForm, startConnect, xConfigured,
  MAX_IMAGE_BYTES as X_MAX_IMAGE_BYTES, MAX_VIDEO_BYTES as X_MAX_VIDEO_BYTES, type XEnv,
} from './xshare';
import { airlineName, finishAirlineConnect, postAsAirline, startAirlineConnect, XError } from './xshare';
import { dailyText, dayTop, utcDay } from './daily';
import { handleHelius, heliusConfigured, isHeliusPath, trustedOrigin, type HeliusEnv } from './helius';
import {
  ANNOUNCEMENT, canAnnounce, canMessage, canPostToChannel, canViewContact,
  channelFor, zoneOfChannel,
} from '../../src/lib/seating';

export interface Env extends XEnv, HeliusEnv {
  BANNERS: KVNamespace;
  /** The airline's own X account, without the @: the only one the daily post may be connected as. */
  X_AIRLINE_USERNAME?: string;
  /**
   * The cabin directory: profiles, introductions, sessions. Optional.
   *
   * Unbound, the wall works exactly as before and the directory routes say
   * plainly that this deployment has none rather than failing as if the
   * request were wrong. Bind it and apply `migrations/` to turn it on.
   */
  DIRECTORY?: D1Database;
  /**
   * Object storage for the artwork. Optional.
   *
   * Bound, images go to R2 and are served straight from it, which keeps the
   * Worker off the read path entirely — the right answer once there is any
   * traffic. Unbound, they go into KV instead and the Worker serves them.
   *
   * That fallback is not a compromise on correctness, it is a compromise on
   * serving cost, and it exists because enabling R2 requires a payment method
   * even on the free tier. A 384px JPEG is about 30 KB against KV's 25 MB
   * value limit — three orders of magnitude of headroom — so the artwork fits
   * either way and the choice can be deferred.
   *
   * Adding the binding later moves new uploads to R2 with no code change.
   */
  IMAGES?: R2Bucket;
  /** Public base URL images are served from. Only needed with R2. */
  PUBLIC_IMAGE_BASE?: string;
  /**
   * The holder list, as JSON: `[{ address, balance }, …]`.
   *
   * The same feed the page reads, and pointing both at one URL is what keeps
   * the two seating charts identical. Optional in the same way it is optional
   * for the page: without it the ladder falls back to the twenty largest
   * accounts from `RPC_URL`, which fills the front of the aircraft and leaves
   * the rest empty. With neither, the directory cannot tell one cabin from
   * another and withholds everything but your own card.
   */
  HOLDERS_URL?: string;
  /**
   * Must match the page's `VITE_MANIFEST_SIZE`. Unset, both sides default to
   * the whole aircraft out of the shared seating, which is the one way they
   * cannot disagree.
   */
  MANIFEST_SIZE?: string;
  /** How long seating is cached, in milliseconds. Defaults to a minute. */
  LADDER_CACHE_MS?: string;
  /** Solana RPC, used only to check the publisher holds the token at all. */
  RPC_URL?: string;
  /** The token this aircraft is flying. */
  TOKEN_MINT?: string;
  /** How long a holder check is cached, in milliseconds. Defaults to 45s. */
  OWNER_CACHE_MS?: string;
  /** Comma-separated origins allowed to call this. */
  ALLOWED_ORIGINS?: string;
  /**
   * The one wallet the logbook belongs to. Unset, there is no logbook.
   *
   * Not a secret, and not treated as one: it is a public key, on the chain,
   * and drawn on the seat map if the operator holds the token. What guards
   * those notes is the signature that opens a session — which needs the
   * private key — and the route's refusal to admit it exists to anybody else.
   *
   * Unset means *nobody*, rather than everybody. A deployment that never
   * named an operator has no logbook at all, which is the safe direction to
   * fail in for a route whose answer is somebody's private notes.
   */
  ADMIN_WALLET?: string;
  /**
   * Caps how often one address may make `GET /holding` ask the chain, which
   * costs a metered RPC call per wallet not on the holder list. Unbound, no cap.
   */
  HOLDING_LIMIT?: RateLimit;
  /** Caps Helius relay calls by Cloudflare source IP and route. */
  HELIUS_LIMIT?: RateLimit;
}


/** Where the artwork lives, and how to address it. */
const usingR2 = (env: Env) => Boolean(env.IMAGES && env.PUBLIC_IMAGE_BASE);

/** Put the bytes somewhere, and return the URL they will be read back from. */
async function storeImage(
  env: Env,
  request: Request,
  key: string,
  bytes: Uint8Array,
  type: string,
  updated: string,
): Promise<string> {
  if (usingR2(env)) {
    await env.IMAGES!.put(key, bytes as BufferSource, {
      httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
    });
  } else {
    // KV holds the bytes, and the content type rides along as metadata so the
    // read path does not have to sniff them again.
    await env.BANNERS.put(`image:${key}`, bytes as unknown as ArrayBuffer, { metadata: { type } });
  }
  return imageUrl(env, request, key, updated);
}

/**
 * The URL an already-stored image is served from.
 *
 * ── Why the key is the hash of the bytes ──────────────────────────────────
 * Keyed by wallet, replacing an advert overwrote it in place and the URL
 * never changed. The bytes are cached, so a holder who put up a second
 * advert was handed the URL their browser had cached for the first: the page
 * showed the *old* picture immediately after a publish they had just signed
 * for. Nothing had failed, and there was no way for the browser to know.
 * They would try again, hit the cooldown, and be told to slow down.
 *
 * Addressing an image by its own content settles that at the storage layer
 * rather than with a query string bolted on the end. Different artwork is a
 * different URL because it is a different image; the same artwork is the
 * same URL, so a re-upload costs nothing and there is no cache to bust. It
 * is also what makes `immutable` honest on the read path: that URL cannot
 * ever mean different bytes.
 *
 * `updated` therefore only reaches records written before this — keys that
 * are not hash-shaped, which still need the version to be re-read.
 */
function imageUrl(env: Env, request: Request, key: string, updated?: string): string {
  const base = usingR2(env)
    ? `${env.PUBLIC_IMAGE_BASE!.replace(/\/$/, '')}/${key}`
    : new URL(`/images/${key}`, request.url).toString();
  const hashKeyed = /^banners\/[0-9a-f]{32}\./.test(key);
  const version = !hashKeyed && updated ? Date.parse(updated) : NaN;
  return Number.isFinite(version) ? `${base}?v=${version}` : base;
}

/**
 * Does this wallet hold the token at all? Storage is not free.
 *
 * Every way of *not getting an answer* is treated as "do not know", and a
 * wallet this cannot judge is let through. That is not laxity, it is the
 * only reading that survives a public RPC: one 429 used to become
 * "That wallet does not hold the token", told to a holder who does, with no
 * way to tell the difference from the page. The check rests on the RPC being
 * both reachable and truthful, so the moment it is neither the honest answer
 * is to stand aside.
 *
 * What this costs if it is wrong is one signed upload of at most half a
 * megabyte from a wallet that proved it owns its own key. What it saves is
 * the wall staying writable through a rate limit. And an advert from a
 * non-holder still never appears: the page hangs adverts off the manifest,
 * so a wallet with no seat has nowhere to hang one.
 */
async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T | null> {
  const url = rpcUrl(env);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    // Rate limited, out of credit, misconfigured, down: not an answer.
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T; error?: unknown };
    // A JSON-RPC error carries no `result` at all.
    if (body.error || body.result === undefined) return null;
    return body.result;
  } catch {
    return null;
  }
}

interface TokenAmount { amount: string; decimals: number; uiAmount: number | null }

/** What a wallet holds, and what share of the aircraft that is. */
interface Holding { balance: number; supply: number; share: number }

/**
 * What a wallet holds of the token, in whole tokens.
 *
 * Null is "could not ask", and it is a different answer from zero — which is
 * the whole reason this returns a number or nothing rather than a number that
 * might be a shrug. Telling a holder they hold nothing because an RPC was
 * busy is the failure this shape exists to make impossible.
 *
 * A wallet can hold the same mint across several token accounts, so they are
 * summed: a person with two bags has one bag, of the total size.
 */
async function readBalance(env: Env, owner: string): Promise<number | null> {
  if (!env.TOKEN_MINT) return null;
  const accounts = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: TokenAmount } } } } }[] }>(
    env, 'getTokenAccountsByOwner', [owner, { mint: env.TOKEN_MINT }, { encoding: 'jsonParsed' }],
  );
  if (!accounts || !Array.isArray(accounts.value)) return null;
  return accounts.value.reduce((sum, a) => {
    const t = a.account.data.parsed.info.tokenAmount;
    return sum + (t.uiAmount ?? Number(t.amount) / 10 ** t.decimals);
  }, 0);
}

async function holdsToken(env: Env, owner: string): Promise<boolean> {
  /* Unconfigured means "do not check" rather than "refuse everybody", so the
     service is usable before a mint exists.

     That used to cover a second and much less deliberate case: a deployment
     with a mint but no `RPC_URL`, because the secret is set by hand and
     nobody had. The door stood open and nothing said so. `rpcUrl` answers
     with the public endpoint now, so this reads as it always claimed to —
     there is no token yet. */
  const url = rpcUrl(env);
  if (!url || !env.TOKEN_MINT) return true;
  const cachedUntil = ownerCache.get(owner) ?? 0;
  if (cachedUntil > Date.now()) return true;

  const balance = await readBalance(env, owner);
  /* Null is every way of not getting an answer — a 429, an outage, a JSON-RPC
     error — and a wallet this cannot judge is let through. An empty result is
     a real answer, and means no. */
  if (balance === null) return true;
  if (balance > 0) ownerCache.set(owner, Date.now() + ownerTtl(env));
  return balance > 0;
}

/* ── CORS ───────────────────────────────────────────────────────────────── */

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const ok = Boolean(origin && allowed.includes(origin));
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-sa-issued,x-sa-signature',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  // Never echo arbitrary origins and never fall back to wildcard CORS. Same-origin
  // requests do not need this header; cross-origin requests must match the explicit
  // deployment allowlist.
  if (ok && origin) headers['access-control-allow-origin'] = origin;
  return headers;
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/* ── The wall ───────────────────────────────────────────────────────────── */

/* Every published advert, in one record.

   GET /banners used to list() the namespace and read each record, on every
   page view. KV's free plan allows 1,000 list() calls a day, and launch
   traffic spent them: from then on the handler threw "KV list() limit
   exceeded for the day", the response went out as Cloudflare's CORS-less
   1101 page, and every visitor saw house adverts. A page view is now one
   get(), against a limit of 100,000.

   Uploads update the index directly; the warm Worker isolate keeps a short
   snapshot so repeated reads do not hit KV. Entries go through
   readStoredBanner on the way out, so one malformed entry costs one advert,
   as it did before. */
const WALL_KEY = 'wall';
type Wall = Record<string, StoredBanner>;
const MAX_REQUEST_BYTES = 1_500_000;
const WALL_CACHE_MS = 30_000;
/**
 * How long one wallet's balance is reused.
 *
 * The page re-reads a connected wallet every two minutes, so this is not
 * about staleness — it is about a reload, a second tab, or a wallet switched
 * back and forth not each costing a call.
 */
const HOLDING_CACHE_MS = 20_000;
const holdingCache = new Map<string, { value: Holding; expiresAt: number }>();
/**
 * How long a wallet stays believed to hold the token.
 *
 * Also how long a wallet that has sold everything keeps a session it already
 * opened, which is why it is settable: the route suite has to watch a holder
 * stop being one without sitting through three quarters of a minute.
 */
const OWNER_CACHE_MS = 45_000;
const ownerTtl = (env: Env) => Number(env.OWNER_CACHE_MS || OWNER_CACHE_MS) || OWNER_CACHE_MS;
let wallSnapshot: { value: Wall; expiresAt: number } | undefined;
const ownerCache = new Map<string, number>();

/* ── Where the wall is kept ──────────────────────────────────────────────
   One row per wallet in the directory's database when there is one, and
   the single KV record above only when there is not.

   The KV record was read, changed and written back whole, from a snapshot
   up to half a minute old, in a store that takes up to a minute to agree
   with itself between locations. Two holders publishing within that minute
   through different copies of the Worker each wrote back a wall without
   the other's advert, and the one written second won: the first advert
   stayed stored under `banner:<wallet>` and simply never showed, with no
   error anywhere and nothing but a republish to bring it back. A row per
   wallet is one upsert and one delete, and nobody's write touches anybody
   else's.

   The table is made on the first write (never on a read, as with the other
   tables here) and filled once from the KV record, so the adverts already
   up carry over. Reads fall back to the KV record while the table does not
   exist. Writes still go to the KV record too, best effort, so rolling this
   back loses nothing written since. `migrations/0006_adverts.sql` is the
   same schema, for the record and for a database set up by hand. */
let advertsTable: Promise<unknown> | null = null;

async function readKvWall(env: Env): Promise<Wall> {
  const raw = await env.BANNERS.get(WALL_KEY).catch(() => null);
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const wall: Wall = {};
  if (!parsed || typeof parsed !== 'object') return wall;
  for (const [owner, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const stored = readStoredBanner(JSON.stringify(entry));
    if (stored) wall[owner] = stored;
  }
  return wall;
}

/** The table, made and seeded from the KV record the first time it is missing. */
function ensureAdverts(env: Env, db: D1Database): Promise<unknown> {
  advertsTable ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS adverts (
      owner   TEXT PRIMARY KEY,
      body    TEXT NOT NULL,
      updated TEXT NOT NULL
    )`).run();
    /* Seeded only while the table is empty — whether this copy made it or a
       migration run by hand did — so the adverts already up carry over. The
       KV record mirrors every takedown since (see writeKvWall), so it cannot
       bring back one that was taken down. */
    if (await db.prepare('SELECT 1 FROM adverts LIMIT 1').first()) return;
    const seed = Object.entries(await readKvWall(env)).map(([owner, stored]) => db
      .prepare('INSERT OR IGNORE INTO adverts (owner, body, updated) VALUES (?, ?, ?)')
      .bind(owner, JSON.stringify(stored), stored.updated));
    for (let i = 0; i < seed.length; i += 50) await db.batch(seed.slice(i, i + 50));
  })().catch((e) => {
    advertsTable = null;
    throw e;
  });
  return advertsTable;
}

async function readWall(env: Env): Promise<Wall> {
  if (wallSnapshot && wallSnapshot.expiresAt > Date.now()) return wallSnapshot.value;
  let wall: Wall | null = null;
  if (env.DIRECTORY) {
    try {
      const { results } = await env.DIRECTORY
        .prepare('SELECT owner, body FROM adverts')
        .all<{ owner: string; body: string }>();
      // Empty is a table nothing has been written to since it was made, and the KV record still the wall.
      if (results?.length) {
        wall = {};
        // One malformed row costs one advert, never the wall.
        for (const row of results) {
          const stored = readStoredBanner(row.body);
          if (stored) wall[row.owner] = stored;
        }
      }
    } catch {
      // No table yet: nothing has been published since the move. The KV record is the wall.
      wall = null;
    }
  }
  wall ??= await readKvWall(env);
  wallSnapshot = { value: wall, expiresAt: Date.now() + WALL_CACHE_MS };
  return wall;
}

/** The old record, kept current as far as it can be, so a rollback loses nothing. */
async function writeKvWall(env: Env, change: (wall: Wall) => void): Promise<void> {
  try {
    const wall = await readKvWall(env);
    change(wall);
    await env.BANNERS.put(WALL_KEY, JSON.stringify(wall));
  } catch {
    /* best effort */
  }
}

async function addToWall(env: Env, owner: string, stored: StoredBanner): Promise<void> {
  if (env.DIRECTORY) {
    const db = env.DIRECTORY;
    await ensureAdverts(env, db);
    await db
      .prepare('INSERT INTO adverts (owner, body, updated) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET body = excluded.body, updated = excluded.updated')
      .bind(owner, JSON.stringify(stored), stored.updated)
      .run();
    await writeKvWall(env, (wall) => { wall[owner] = stored; });
  } else {
    const wall = await readKvWall(env);
    wall[owner] = stored;
    await env.BANNERS.put(WALL_KEY, JSON.stringify(wall));
  }
  // This copy's snapshot is dropped rather than patched: patching a stale one is how the old wall lost adverts.
  wallSnapshot = undefined;
}

async function removeFromWall(env: Env, owner: string): Promise<void> {
  if (env.DIRECTORY) {
    const db = env.DIRECTORY;
    await ensureAdverts(env, db);
    await db.prepare('DELETE FROM adverts WHERE owner = ?').bind(owner).run();
    await writeKvWall(env, (wall) => { delete wall[owner]; });
  } else {
    const wall = await readKvWall(env);
    if (owner in wall) {
      delete wall[owner];
      await env.BANNERS.put(WALL_KEY, JSON.stringify(wall));
    }
  }
  wallSnapshot = undefined;
}

function wallEtag(wall: Wall): string {
  const newest = Object.values(wall).reduce((max, item) => Math.max(max, Date.parse(item.updated) || 0), 0);
  return `"${Object.keys(wall).length}-${newest}"`;
}

/* ── The logbook's table ─────────────────────────────────────────────────
   Made here, by the Worker, rather than by a migration in CI — and that is a
   concession rather than a preference, so it is worth saying why.

   `wrangler d1 migrations apply` needs an API token with *D1: Edit*. The
   token this repository deploys with has Workers, KV and R2 and not that, so
   the migration step failed with a 7403 and took the deploy down with it:
   schema before code works only when you can write the schema. Granting the
   token D1 costs a trip to the Cloudflare dashboard, which the operator of
   this deployment does not currently have.

   A *binding* is not an API token. At runtime `env.DIRECTORY` speaks to the
   database directly with no token in the path at all, so the one thing CI
   cannot do, the Worker can — and `migrations/0002_logbook.sql` stays as the
   schema's written record and as what `--local` applies for the route suite.

   Once per isolate, on the operator's first logbook request and never on
   anybody else's: the call sits after the admin check, so a stranger's 404
   costs nothing and no unauthenticated request can make this service write
   DDL. A failure clears the latch rather than caching itself, because a
   database that was briefly unreachable should not leave the logbook broken
   until the next deploy.

   This does not generalise. One table, two statements, both `IF NOT EXISTS`.
   A schema with anything to migrate — a column to add, a row to backfill —
   belongs in `migrations/` and wants the token fixed. */
let logbookTable: Promise<unknown> | null = null;

function ensureLogbook(db: D1Database): Promise<unknown> {
  logbookTable ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS logbook (
      id         TEXT PRIMARY KEY,
      body       TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT '',
      tags       TEXT NOT NULL DEFAULT '',
      conviction INTEGER NOT NULL DEFAULT 0,
      status     TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS logbook_by_time ON logbook (created_at DESC)'),
  ]).catch((e) => {
    logbookTable = null;
    throw e;
  });
  return logbookTable;
}

/* ── The leaderboard ─────────────────────────────────────────────────────
   Two tables with nothing to migrate, so like the logbook's they are made
   on first use and need no step on deploy (`migrations/0003_leaderboard.sql`
   is the same schema, for a database set up by hand). The first write to
   either is a run starting — the one leaderboard write that needs no
   signature, because it records nothing but the time, and is rate-limited
   per address. */
let leaderboardTables: Promise<unknown> | null = null;

function ensureLeaderboard(db: D1Database): Promise<unknown> {
  leaderboardTables ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS game_runs (
      id         TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ip         TEXT NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS game_runs_by_ip ON game_runs (ip, started_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS game_scores (
      address   TEXT PRIMARY KEY,
      score     INTEGER NOT NULL,
      survived  REAL NOT NULL,
      climb     REAL NOT NULL,
      posted_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS game_scores_by_score ON game_scores (score DESC)'),
    // Every score posted, not only bests: what the day's top pilots are read from.
    db.prepare(`CREATE TABLE IF NOT EXISTS game_posts (
      address   TEXT NOT NULL,
      score     INTEGER NOT NULL,
      posted_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS game_posts_by_time ON game_posts (posted_at)'),
  ]).catch((e) => {
    leaderboardTables = null;
    throw e;
  });
  return leaderboardTables;
}

/* ── A card's social links ───────────────────────────────────────────────
   A table of their own rather than a column on `profiles`, because a column
   is a migration and a migration is a step this deploy cannot run (see the
   workflow: the token has no D1). A new table is one `IF NOT EXISTS`, made
   on first use like the leaderboard's, and a card saved before it existed
   simply has no row here — which reads as no links. Both routes that touch
   it create tables behind a signed-in session, so public reads never write DDL.
   (`migrations/0004_profile_links.sql` is the same, for a database set up
   by hand.) */
let profileLinksTable: Promise<unknown> | null = null;

function ensureProfileLinks(db: D1Database): Promise<unknown> {
  profileLinksTable ??= db.batch([db.prepare(`CREATE TABLE IF NOT EXISTS profile_links (
      address TEXT PRIMARY KEY,
      links   TEXT NOT NULL DEFAULT '{}'
    )`), db.prepare(`CREATE TABLE IF NOT EXISTS public_seat_profiles (
      address TEXT PRIMARY KEY
    )`), db.prepare(`CREATE TABLE IF NOT EXISTS profile_categories (
      address TEXT PRIMARY KEY,
      categories TEXT NOT NULL DEFAULT '[]'
    )`)]).catch((e) => {
    profileLinksTable = null;
    throw e;
  });
  return profileLinksTable;
}

/* ── The flight controls ─────────────────────────────────────────────────
   One small record, read by every visitor and written by one wallet.

   In KV rather than SQL because it is exactly one key with no history and no
   relations, and behind a short warm-isolate snapshot for the same reason the
   wall has one: this is the hottest read on the service — everybody's page
   asks it, repeatedly, for as long as they have the tab open — and it changes
   when somebody presses a button, which is rarely. */
const FLIGHT_KEY = 'flight';
const FLIGHT_CACHE_MS = 5_000;
let flightCache: { value: ManualControls; expiresAt: number } | null = null;

async function readFlight(env: Env): Promise<ManualControls> {
  if (flightCache && flightCache.expiresAt > Date.now()) return flightCache.value;
  let value = HANDS_OFF;
  try {
    const stored = await env.BANNERS.get(FLIGHT_KEY, 'json');
    // Clamped on the way out as well as in. The way in is this deployment's
    // own code; the way out is whatever is in the namespace today.
    if (stored && typeof stored === 'object') value = clamped(stored as Partial<ManualControls>);
  } catch {
    /* An unreadable record is an aeroplane flying the market, which is what
       it does when nobody has touched anything. Never a failed page. */
  }
  flightCache = { value, expiresAt: Date.now() + FLIGHT_CACHE_MS };
  return value;
}

/* ── The cabin directory ────────────────────────────────────────────────────
   Profiles and introductions, in SQL, because they are rows: one card per
   wallet, and messages read back by recipient and by sender.

   This service used not to know which seat anybody was in, and this comment
   used to say so: the page decided that, as it does for adverts, and the
   section perks were the page's reading of a manifest it already held. That
   is no longer true, because a perk that is only the page's reading is one
   the network tab helps itself to. The seating is worked out on this side as
   well — from the page's own module rather than a second copy of it — and
   the perks are decided where the rows are.

   The lines this service draws:

     · Nothing here is readable without a session, and a session is only
       opened by a wallet that proved its key *and* holds the token. The
       directory is a room for holders because a non-holder never gets a
       token to ask with. (`holdsToken` stands aside when it cannot reach the
       RPC to find out — see its own note on why that is the honest failure.)
     · Inside that room the cabin decides the rest, and it is transparent
       looking aft and opaque looking forward: contact details go to your own
       section and everything behind it, conversations are readable by the
       two wallets on them and by any section ahead of both. `ladder.ts` says
       how this side comes to know which is which without keeping a second
       copy of the seating.
     · An introduction goes wherever a card can be read — your own section
       and every seated one behind it — and nowhere forward. So a card you can
       read is a card you can answer, and the further forward somebody sits
       the fewer people can write to them at all. The flight deck's inbox
       reaches only the flight deck. */

interface ProfileRow {
  address: string;
  display_name: string;
  role: string;
  email: string;
  website: string;
  linkedin: string;
  updated_at: string;
  /** From `profile_links`, and null for a card saved before it existed. */
  links: string | null;
  public_links: number | null;
  categories: string | null;
}

interface MessageRow {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  sent_at: string;
}

/**
 * A logbook entry, as the column names have it.
 *
 * No `address` column, and that absence is the design: the logbook has one
 * owner, named in the deployment rather than stored per row, so there is no
 * ownership here for a query to get wrong. See `logbook.ts`.
 */
interface LogRow {
  id: string;
  body: string;
  source: string;
  tags: string;
  conviction: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * A card as the asking wallet is allowed to see it.
 *
 * Name and role are the roster, and the roster is the whole cabin's. The
 * contact details are the perk, and they go no further forward than the
 * person asking: your own section and everything behind it. `readable` says
 * which of the two this is, so the page can tell "nothing to show" from
 * "not yours to see".
 */
const asProfile = (row: ProfileRow, readable: boolean) => ({
  address: row.address,
  displayName: row.display_name,
  role: row.role,
  email: readable ? row.email : '',
  website: readable ? row.website : '',
  linkedin: readable ? row.linkedin : '',
  links: readable ? parseStoredLinks(row.links) : {},
  publicLinks: row.public_links === 1,
  categories: storedOfferings(row.categories),
  readable,
  updated: row.updated_at,
});

const asMessage = (row: MessageRow) => ({
  id: row.id,
  from: row.sender,
  to: row.recipient,
  body: row.body,
  sentAt: row.sent_at,
});

/** The wallet a bearer token stands for, or null if it stands for nobody. */
async function sessionAddress(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?')
    .bind(await tokenHash(token))
    .first<{ address: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.address;
}

/* ── Routes ─────────────────────────────────────────────────────────────── */

export default {
  /* An uncaught exception goes out as Cloudflare's error page, which carries
     no CORS headers, so the browser reports a CORS failure and the real cause
     is invisible from the site. Answer with JSON and CORS instead. */
  async fetch(request: Request, env: Env): Promise<Response> {
    let res: Response;
    try {
      res = await handle(request, env);
    } catch (e) {
      console.error(e);
      res = json({ error: 'Something went wrong on our side.' }, 500, corsHeaders(env, request.headers.get('origin')));
    }
    /* Nothing this service answers belongs in a search engine: the site is
       the place to be found. A header rather than robots.txt, because a
       robots.txt rule would also stop X fetching the flight cards' pages. */
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    return out;
  },
  /* The cron (wrangler.toml): the day's top pilots, posted as the airline. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(postDailyTop(env, event.scheduledTime));
  },
};

/** Post the top pilots of the UTC day `at` falls in, once. */
async function postDailyTop(env: Env, at: number): Promise<void> {
  const db = env.DIRECTORY;
  if (!db || !xConfigured(env)) return;
  const day = utcDay(at);
  const done = `xdaily:${day.key}`;
  if (await env.BANNERS.get(done)) return;
  await ensureLeaderboard(db);
  const site = ((env.ALLOWED_ORIGINS ?? '').split(',')[0]?.trim() || 'https://seat-airlines.space').replace(/^https?:\/\//, '');
  const text = dailyText(await dayTop(db, day.start, day.end), day.start, site);
  if (!text) {
    console.log(`daily post ${day.key}: nobody flew`);
    return;
  }
  try {
    const url = await postAsAirline(env, env.BANNERS, fetch, text);
    await env.BANNERS.put(done, url, { expirationTtl: 60 * 60 * 24 * 30 });
    console.log(`daily post ${day.key}: ${url}`);
  } catch (e) {
    console.error(`daily post ${day.key} failed:`, e);
  }
}

async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request.headers.get('origin'));

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Keep oversized bodies out of parsing and signature verification. The
    // client sends a compressed 384px image, so this is intentionally well
    // above the 512 KiB stored-image limit while still bounding an abuse case.
    const contentLength = Number(request.headers.get('content-length'));
    const writes = request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE';
    // A flight's video is the one thing bigger than that; its route has its own cap.
    const limit = url.pathname === '/x/post' ? X_MAX_VIDEO_BYTES + X_MAX_IMAGE_BYTES + 64 * 1024 : MAX_REQUEST_BYTES;
    if (writes && Number.isFinite(contentLength) && contentLength > limit) {
      return json({ error: 'That request is too large.' }, 413, cors);
    }

    if (isHeliusPath(url.pathname)) {
      if (url.pathname !== '/helius/status' && env.HELIUS_LIMIT) {
        const source = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const result = await env.HELIUS_LIMIT.limit({ key: `${source}:${url.pathname}` });
        if (!result.success) return json({ error: 'Helius relay rate limit exceeded.' }, 429, cors);
      }
      return handleHelius(request, env, cors, trustedOrigin(env.ALLOWED_ORIGINS, request.headers.get('origin')));
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      /* `sections` is the field somebody curls this route to read, and it
         used to answer a different question than the one being asked.
         `canSeat` is true the moment a mint is set, so a deployment whose
         endpoint refuses the holder scan reported `sections: true` while
         withholding every contact detail from everybody and refusing every
         introduction with a 503. A health check that reports the healthy
         answer during precisely the failure it exists to surface is worse
         than not having one, because it is believed.

         So the seating is read here rather than assumed. `readLadder` is the
         same cached call the directory already makes on every request: a warm
         isolate answers from memory, and a cold one pays for one read per
         `LADDER_CACHE_MS` — the read the next visitor would have paid for
         anyway. If that read is slow then the directory is slow, which is a
         thing to learn from a health check rather than have hidden by one.

         `ok` stays a statement about the Worker itself, so "up but seating
         nobody" and "down" remain different answers to different questions. */
      const ladder = await readLadder(env);
      return json({
        ok: true,
        service: 'seat-airlines-banners',
        storage: usingR2(env) ? 'r2' : 'kv',
        directory: Boolean(env.DIRECTORY),
        embeddedWallets: heliusConfigured(env),
        // Whether the cabins can be told apart *right now* — the thing that
        // decides whether a card shows contact details or an introduction
        // sends, asked of the ladder that decides it.
        sections: ladder.live,
        // And whether anything was ever configured to tell them apart, which
        // is what separates "nobody set a mint or a feed" from "the endpoint
        // refused". Two causes, two fixes, so they are two fields.
        configured: canSeat(env),
        /* How much of the aircraft actually filled. `sections: true` with
           `seated: 20` out of `cabin: 178` is the quiet failure this pair
           exists to make loud: a directory that works perfectly for the
           twenty largest holders and does not exist for anybody else. It is
           what a deployment falling back to `getTokenLargestAccounts` looks
           like, which is what an unset `RPC_URL` looks like. */
        seated: ladder.seated().length,
        cabin: cabinSize(env),
      }, 200, { ...cors, 'cache-control': 'no-store' });
    }

    /* Who is aboard, as an indexer would put it.

       The page reads the same list this side seats people from, which is the
       thing that has mattered most all along: two readings of "who is aboard"
       are two aircraft, and this one decides who may read whose card.

       It is also what keeps the chain scan affordable. Getting the whole
       holder list out of a plain RPC means asking the token program for every
       account it owns for this mint — not capped at twenty, and not cheap —
       and doing that in the page would mean one scan per visitor every ninety
       seconds. Done here it is one scan a minute for everybody, already
       cached, already filtered of contracts.

       Public, and nothing is given away by it: these are the wallets the seat
       map draws on screen. Empty when this deployment cannot read holders at
       all, which the page reads as "no indexer" and falls back to its own RPC
       for, exactly as it did before there was one. */
    if (request.method === 'GET' && url.pathname === '/holders') {
      const ladder = await readLadder(env);
      if (!ladder.live) return json({ error: 'Seat occupancy is temporarily unavailable.' }, 503, { ...cors, 'cache-control': 'no-store' });
      /* The supply rides along because the page needs both in the same breath
         — a bag is only interesting as a share of something — and because it
         is the second thing the page used to open an RPC of its own for. */
      return json({ holders: ladder.holders, supply: ladder.supply, coverage: 'complete' }, 200, {
        ...cors,
        'cache-control': 'public, max-age=30, stale-while-revalidate=120',
      });
    }

    /* One wallet's balance.

       ── Why the page does not read this itself ────────────────────────────
       It used to, and that is why a browser RPC variable existed. Vite inlines every
       VITE_ value into the bundle it ships, so an endpoint carrying an API
       key — which is what a paid RPC is — was readable by anyone who opened
       the site. The documented defence was to restrict the key by domain at
       the provider, and that defence is the `Origin` header: a string anybody
       with curl can type. It stops a copy-paste, not a script.

       The key lives here instead, where it is a Worker secret and never
       leaves. What the browser gets is this: a balance, a supply, and a
       share, all of them public on-chain facts about a wallet the page is
       already drawing on a seat map.

       It is also cheaper by the same argument as `/holders`. One reload of
       the page is no longer one RPC call; a hundred visitors are not a
       hundred callers of somebody's metered endpoint.

       A failure answers 503 rather than a zero balance. Telling a holder
       they hold nothing because an endpoint was busy would reseat them into
       the hold, announce it over the PA, and close every card in the cabin
       to them — all of it wrong, and all of it silent. */
    if (request.method === 'GET' && url.pathname === '/holding') {
      const address = url.searchParams.get('address') ?? '';
      if (!isAddress(address)) return json({ error: 'That is not a wallet address.' }, 400, cors);

      const cached = holdingCache.get(address);
      if (cached && cached.expiresAt > Date.now()) {
        return json(cached.value, 200, { ...cors, 'cache-control': 'public, max-age=20' });
      }

      /* Somebody with a seat is on the list the seating was read from, with
         their balance on it: answered from that, at no cost, and in step with
         the seat it puts them in. Only a wallet not on the list — a small
         holder, or nobody — costs a call to the chain. */
      const ladder = await readLadder(env);
      let balance = ladder.balanceOf(address);
      if (balance === null) {
        /* Only this costs anything: a call to the chain on the operator's
           metered key, for a wallet nobody may be seated in. Anybody could
           ask about a thousand made-up wallets a minute and spend the key's
           credit that way, so one address gets so many of these a minute. A
           person checks one wallet every couple of minutes; the seated are
           answered above, from the list, and never count. */
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        const allowed = env.HOLDING_LIMIT ? (await env.HOLDING_LIMIT.limit({ key: ip }).catch(() => ({ success: true }))).success : true;
        if (!allowed) {
          return json({ error: 'Too many lookups from here. Try again in a minute.' }, 429, {
            ...cors, 'cache-control': 'no-store', 'retry-after': '60',
          });
        }
        balance = await readBalance(env, address);
      }
      if (balance === null) {
        return json({ error: 'The chain could not be asked just now.' }, 503, { ...cors, 'cache-control': 'no-store' });
      }

      /* The supply the seating was read with, rather than a second call for a
         number that changes about as often as the mint does. */
      const supply = ladder.supply
        || (await rpc<{ value: TokenAmount }>(env, 'getTokenSupply', [env.TOKEN_MINT]))?.value.uiAmount
        || 0;

      const value: Holding = { balance, supply, share: supply > 0 ? balance / supply : 0 };
      holdingCache.set(address, { value, expiresAt: Date.now() + HOLDING_CACHE_MS });
      return json(value, 200, { ...cors, 'cache-control': 'public, max-age=20' });
    }

    /* ── The flight controls ────────────────────────────────────────────
       What the aeroplane is doing, when somebody is flying it by hand.

       The aircraft flies the market: pitch, bank, speed and altitude are all
       read off the chart, on every visitor's page, from the same number.
       These are the switches that take hold of it — invert, barrel roll, a
       camera turntable, flaps, the hour, the weather — and they are read by
       *everybody*, which is the entire reason they live here rather than in
       one browser's storage. An aeroplane only one person can see upside
       down is a screensaver. This is a flight everybody is on.

       So `GET` is public and unauthenticated, like the wall and the holder
       list, and `PUT` belongs to the wallet named in `ADMIN_WALLET` — the
       same one the logbook belongs to. That one refuses with a 403 rather
       than the logbook's 404, and the difference is deliberate: the logbook
       is hidden, and this is not. Every visitor watching the aeroplane roll
       already knows somebody rolled it.

       Nothing in here can hurt anybody. It is an attitude, a camera rate and
       a sky — no balances, no addresses, nothing written anywhere else — and
       every field is clamped on the way in by the same function the page
       clamps with, because the alternative is a stored NaN that becomes a
       rotation of NaN on a hundred and seventy-eight people's screens. */
    if (url.pathname === '/flight') {
      if (request.method === 'GET') {
        const flight = await readFlight(env);
        return json(flight, 200, {
          ...cors,
          /* Short, because the point of a switch is that it does something
             now. `stale-while-revalidate` lets the edge keep answering while
             it refreshes, so a page polling this costs a revalidation rather
             than a round trip most of the time. */
          'cache-control': 'public, max-age=10, stale-while-revalidate=50',
        });
      }

      if (request.method === 'PUT') {
        const priv = { ...cors, 'cache-control': 'no-store' };
        const db = env.DIRECTORY;
        if (!db) return json({ error: 'This deployment has no cabin directory configured.' }, 503, priv);

        const token = bearerToken(request.headers.get('authorization'));
        const who = token ? await sessionAddress(db, token) : null;
        if (!isAdmin(env.ADMIN_WALLET, who)) {
          return json({ error: 'The flight controls belong to the flight deck.' }, 403, priv);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }
        if (!body || typeof body !== 'object') {
          return json({ error: 'That was not a set of controls.' }, 400, priv);
        }

        const flight = clamped(body as Partial<ManualControls>);
        /* Hands off is stored as an absence rather than as a record of zeroes,
           so the common case — nobody flying — is a missing key that reads
           back as the default, and giving the aeroplane back to the market
           leaves nothing behind to go stale. */
        if (handsOff(flight)) await env.BANNERS.delete(FLIGHT_KEY);
        else await env.BANNERS.put(FLIGHT_KEY, JSON.stringify(flight));
        flightCache = { value: flight, expiresAt: Date.now() + FLIGHT_CACHE_MS };
        return json(flight, 200, priv);
      }

      return json({ error: `${request.method} is not allowed on ${url.pathname}.` }, 405, cors);
    }

    /* ── The logbook ────────────────────────────────────────────────────
       One wallet's private notes: the things worth remembering out of a
       cabin full of conversations.

       Everything else in this service is a rule about cabins — your section
       and every one behind it, decided from the holder list, true of whoever
       is sitting there this minute. This is not that. It belongs to the
       operator, named once in `ADMIN_WALLET`, and to nobody else at any
       balance.

       **It 404s rather than 403s**, and the 404 is the fallthrough's own,
       byte for byte, headers and all. A 403 is an answer: it says there is
       something here, it is worth guarding, and you have found the right
       path. Against a route whose whole value is that nobody knows it is
       there, that is the wrong thing to say to somebody who guessed — so a
       request without the key gets what a misspelt path gets.

       Order matters for the same reason. No database, no configured
       operator, no token, an expired token, somebody else's token: one
       refusal for all five, written once, so the shape of the failure never
       tells the difference. And because the answer is the fallthrough's,
       this block sits outside the directory's — inheriting its 401s and
       503s would undo the whole thing. */
    if (url.pathname === '/logbook') {
      const db = env.DIRECTORY;
      const nowhere = () => json({ error: 'No such route.' }, 404, cors);
      if (!db || !env.ADMIN_WALLET) return nowhere();

      const token = bearerToken(request.headers.get('authorization'));
      const who = token ? await sessionAddress(db, token) : null;
      if (!isAdmin(env.ADMIN_WALLET, who)) return nowhere();

      // After the gate, so a stranger's 404 costs nothing and no
      // unauthenticated request can make this service write DDL.
      await ensureLogbook(db);

      const priv = { ...cors, 'cache-control': 'no-store' };
      const asEntry = (row: LogRow): LogEntry => ({
        id: row.id,
        body: row.body,
        source: row.source,
        tags: unpackTags(row.tags),
        conviction: row.conviction,
        status: row.status as LogStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });

      if (request.method === 'GET') {
        /* The whole notebook, newest first, capped. One person's notes are
           not a feed — there is no pagination here because there is nobody
           to page past you, and the page filters what it has rather than
           asking again per keystroke. */
        const rows = await db
          .prepare('SELECT * FROM logbook ORDER BY created_at DESC LIMIT ?')
          .bind(LOGBOOK_PAGE)
          .all<LogRow>();
        return json({ entries: (rows.results ?? []).map(asEntry) }, 200, priv);
      }

      if (request.method === 'POST') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }
        const read = readLogbookInput(body);
        if ('error' in read) return json({ error: read.error }, 400, priv);

        const now = new Date().toISOString();
        const row: LogRow = {
          id: entryId(),
          body: read.entry.body,
          source: read.entry.source,
          tags: packTags(read.entry.tags),
          conviction: read.entry.conviction,
          status: read.entry.status,
          created_at: now,
          updated_at: now,
        };
        await db
          .prepare(`INSERT INTO logbook (id, body, source, tags, conviction, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(row.id, row.body, row.source, row.tags, row.conviction, row.status, row.created_at, row.updated_at)
          .run();
        return json(asEntry(row), 200, priv);
      }

      if (request.method === 'PATCH') {
        let body: { id?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) return json({ error: 'Which entry?' }, 400, priv);

        const read = readLogbookPatch(body);
        if ('error' in read) return json({ error: read.error }, 400, priv);

        /* Written as columns rather than a built-up string: the fields are
           known at compile time, so there is no reason for the set of things
           this can write to depend on what arrived in the request. */
        const patch = read.patch;
        const sets: string[] = [];
        const values: unknown[] = [];
        if (patch.body !== undefined) { sets.push('body = ?'); values.push(patch.body); }
        if (patch.source !== undefined) { sets.push('source = ?'); values.push(patch.source); }
        if (patch.tags !== undefined) { sets.push('tags = ?'); values.push(packTags(patch.tags)); }
        if (patch.conviction !== undefined) { sets.push('conviction = ?'); values.push(patch.conviction); }
        if (patch.status !== undefined) { sets.push('status = ?'); values.push(patch.status); }
        sets.push('updated_at = ?');
        values.push(new Date().toISOString());

        const updated = await db
          .prepare(`UPDATE logbook SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
          .bind(...values, id)
          .first<LogRow>();
        if (!updated) return json({ error: 'No such entry.' }, 404, priv);
        return json(asEntry(updated), 200, priv);
      }

      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id') ?? '';
        if (!id) return json({ error: 'Which entry?' }, 400, priv);
        const gone = await db.prepare('DELETE FROM logbook WHERE id = ?').bind(id).run();
        if (!gone.meta.changes) return json({ error: 'No such entry.' }, 404, priv);
        return json({ ok: true }, 200, priv);
      }

      return json({ error: `${request.method} is not allowed on ${url.pathname}.` }, 405, priv);
    }

    /* ── The leaderboard ────────────────────────────────────────────────
       The landing's game. The board is public; starting a run needs
       nothing; posting a score needs the wallet's signature over it (a
       message, never a transaction), a run this server started, and a
       score that run could have earned in the time since. Each wallet
       keeps its best; each run posts once. */
    if (url.pathname === '/scores' || url.pathname === '/scores/today' || url.pathname === '/runs') {
      const db = env.DIRECTORY;
      if (!db) return json({ error: 'This deployment has no leaderboard configured.' }, 503, cors);
      const priv = { ...cors, 'cache-control': 'no-store' };

      // The UTC day's best flight per wallet: what the daily post on X names.
      if (request.method === 'GET' && url.pathname === '/scores/today') {
        const day = utcDay(Date.now());
        try {
          const scores = await dayTop(db, day.start, day.end, BOARD_SIZE);
          return json({ day: day.key, scores }, 200, { ...cors, 'cache-control': 'public, max-age=30' });
        } catch {
          return json({ day: day.key, scores: [] }, 200, { ...cors, 'cache-control': 'public, max-age=30' });
        }
      }
      if (request.method === 'GET' && url.pathname === '/scores') {
        try {
          const { results } = await db
            .prepare('SELECT address, score, survived, climb, posted_at FROM game_scores ORDER BY score DESC, posted_at ASC LIMIT ?')
            .bind(BOARD_SIZE)
            .all<{ address: string; score: number; survived: number; climb: number; posted_at: number }>();
          const scores = results.map((r) => ({ address: r.address, score: r.score, survived: r.survived, climb: r.climb, postedAt: r.posted_at }));
          return json({ scores }, 200, { ...cors, 'cache-control': 'public, max-age=15' });
        } catch {
          // No table yet: nobody has flown. Reading makes no schema.
          return json({ scores: [] }, 200, { ...cors, 'cache-control': 'public, max-age=15' });
        }
      }

      if (request.method === 'POST' && url.pathname === '/runs') {
        await ensureLeaderboard(db);
        const now = Date.now();
        const ip = await sha256Hex(new TextEncoder().encode(request.headers.get('cf-connecting-ip') ?? 'unknown'));
        const recent = await db
          .prepare('SELECT COUNT(*) AS n FROM game_runs WHERE ip = ? AND started_at > ?')
          .bind(ip, now - 60 * 60 * 1000)
          .first<{ n: number }>();
        if ((recent?.n ?? 0) >= RUNS_PER_HOUR) {
          return json({ error: 'That is a lot of flights from here. Try again in a while.' }, 429, priv);
        }
        const run = newRunId();
        await db.batch([
          db.prepare('INSERT INTO game_runs (id, started_at, ip, used) VALUES (?, ?, ?, 0)').bind(run, now, ip),
          // Nothing else sweeps these up, and starting one is already a write.
          db.prepare('DELETE FROM game_runs WHERE started_at < ?').bind(now - 24 * 60 * 60 * 1000),
        ]);
        return json({ run, started: now }, 200, priv);
      }

      if (request.method === 'POST' && url.pathname === '/scores') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }
        const post = readScorePost(body);
        if (typeof post === 'string') return json({ error: post }, 400, priv);
        const at = Date.parse(post.issued);
        if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) {
          return json({ error: 'That signature has expired. Try again.' }, 400, priv);
        }
        if (!(await verifySignature(post.address, scoreChallenge(post.address, post.run, post.score, post.issued), post.signature))) {
          return json({ error: 'That signature does not match the wallet.' }, 401, priv);
        }
        await ensureLeaderboard(db);
        const run = await db
          .prepare('SELECT started_at, used FROM game_runs WHERE id = ?')
          .bind(post.run)
          .first<{ started_at: number; used: number }>();
        if (!run) return json({ error: 'That flight is not one this server started.' }, 400, priv);
        if (run.used) return json({ error: 'That flight has already been posted.' }, 409, priv);
        const now = Date.now();
        if (now - run.started_at > RUN_TTL_MS) return json({ error: 'That flight is too long ago to post.' }, 400, priv);
        const wrong = implausible(post, run.started_at, now);
        if (wrong) return json({ error: wrong }, 422, priv);
        // Spend the run first: the same flight posted twice, however fast, finds it used.
        const spent = await db.prepare('UPDATE game_runs SET used = 1 WHERE id = ? AND used = 0').bind(post.run).run();
        if (!spent.meta.changes) return json({ error: 'That flight has already been posted.' }, 409, priv);
        await db
          .prepare(`INSERT INTO game_scores (address, score, survived, climb, posted_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(address) DO UPDATE SET
              score = excluded.score, survived = excluded.survived, climb = excluded.climb, posted_at = excluded.posted_at
            WHERE excluded.score > game_scores.score`)
          .bind(post.address, post.score, post.survived, post.climb, now)
          .run();
        await db.prepare('INSERT INTO game_posts (address, score, posted_at) VALUES (?, ?, ?)').bind(post.address, post.score, now).run();
        const best = (await db.prepare('SELECT score FROM game_scores WHERE address = ?').bind(post.address).first<{ score: number }>())?.score ?? post.score;
        const rank = (await db.prepare('SELECT COUNT(*) + 1 AS rank FROM game_scores WHERE score > ?').bind(best).first<{ rank: number }>())?.rank ?? null;
        return json({ best, rank, improved: best === post.score }, 200, priv);
      }

      return json({ error: 'Not found.' }, 404, priv);
    }

    /* ── Posting to X for the player ────────────────────────────────────
       See xshare.ts. The page keeps a handle; the player's X permission is
       kept here, sealed with it. Every way this cannot post ends with the
       page opening X's own compose box instead, which costs nothing. */
    if (url.pathname.startsWith('/x/')) {
      const priv = { ...cors, 'cache-control': 'no-store' };
      const site = (env.ALLOWED_ORIGINS ?? '').split(',')[0]?.trim() || 'https://seat-airlines.space';
      const back = (fragment: Record<string, string>) =>
        new Response(null, { status: 302, headers: { location: `${site}/x-connected/#${new URLSearchParams(fragment)}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
      const handle = bearerToken(request.headers.get('authorization'));

      /* The airline's own account, for the daily post of the day's top
         pilots: connected once, by whoever runs it; and what today's post
         would say, to look at before it goes. */
      if (request.method === 'GET' && url.pathname === '/x/airline/connect') {
        const airline = env.X_AIRLINE_USERNAME?.trim();
        if (!xConfigured(env) || !airline) return json({ error: 'The X app or X_AIRLINE_USERNAME is not set on this Worker.' }, 503, priv);
        return new Response(null, { status: 302, headers: { location: await startAirlineConnect(env, env.BANNERS, url.origin), 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/x/airline/callback') {
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        const airline = env.X_AIRLINE_USERNAME?.trim();
        const page = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
        if (!state || !code || !airline || !xConfigured(env)) return page('X did not finish connecting. Nothing was kept.', 400);
        try {
          const as = await finishAirlineConnect(env, env.BANNERS, fetch, url.origin, state, code, airline);
          return page(`Connected as @${as}. The day's top pilots will be posted from this account each day.`, 200);
        } catch (e) {
          console.error(e);
          return page(e instanceof Error ? e.message : 'X did not finish connecting.', e instanceof XError ? e.status : 500);
        }
      }
      if (request.method === 'GET' && url.pathname === '/x/daily') {
        const db = env.DIRECTORY;
        if (!db) return json({ error: 'This deployment has no leaderboard configured.' }, 503, priv);
        const day = utcDay(Date.now());
        await ensureLeaderboard(db);
        const rows = await dayTop(db, day.start, day.end);
        return json({
          day: day.key, connectedAs: await airlineName(env.BANNERS), alreadyPosted: await env.BANNERS.get(`xdaily:${day.key}`),
          text: dailyText(rows, day.start, site.replace(/^https?:\/\//, '')),
        }, 200, priv);
      }
      if (request.method === 'GET' && url.pathname === '/x/status') {
        const available = xConfigured(env) && mediaMode(env) !== 'off';
        const as = available && isHandle(handle) ? await linkedName(env.BANNERS, handle) : null;
        return json({ available, media: mediaMode(env), connected: as !== null, username: as || null }, 200, priv);
      }
      if (request.method === 'GET' && url.pathname === '/x/connect') {
        const nonce = url.searchParams.get('n');
        if (!isNonce(nonce)) return back({ error: 'That link was not from the site.' });
        if (!xConfigured(env) || mediaMode(env) === 'off') return back({ error: 'Posting through X is not set up here.', n: nonce });
        return new Response(null, { status: 302, headers: { location: await startConnect(env, env.BANNERS, url.origin, nonce), 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/x/callback') {
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (!state || !code || !xConfigured(env)) {
          return back({ error: url.searchParams.get('error') === 'access_denied' ? 'You did not allow it. Nothing was connected.' : 'X did not finish connecting.' });
        }
        try {
          const done = await finishConnect(env, env.BANNERS, fetch, url.origin, state, code);
          return back({ x: done.handle, u: done.username, n: done.nonce });
        } catch (e) {
          console.error(e);
          return back({ error: e instanceof Error ? e.message : 'X did not finish connecting.' });
        }
      }
      if (request.method === 'POST' && url.pathname === '/x/post') {
        if (!isHandle(handle)) return json({ posted: false, fallback: 'link', reconnect: true, reason: 'Not connected to X.' }, 401, priv);
        const input = await readPostForm(request);
        if (typeof input === 'string') return json({ error: input }, 400, priv);
        const result = await postFlight(env, env.BANNERS, fetch, handle, input);
        if (!result.posted) console.warn(`x/post fell back: ${result.reason}`);
        return json(result, 200, priv);
      }
      if (request.method === 'DELETE' && url.pathname === '/x/session') {
        if (isHandle(handle)) await disconnect(env, env.BANNERS, fetch, handle);
        return new Response(null, { status: 204, headers: priv });
      }
      return json({ error: 'Not found.' }, 404, priv);
    }

    /* ── Shared flights ─────────────────────────────────────────────────
       The card a flight is shared on (see cards.ts): left by the page for a
       run this server started, then served as a picture and as the page X
       reads it from. First card wins; each is kept ninety days. */
    const cardUpload = url.pathname.match(/^\/cards\/([0-9a-f]{32})$/);
    if (request.method === 'PUT' && cardUpload) {
      const priv = { ...cors, 'cache-control': 'no-store' };
      const db = env.DIRECTORY;
      if (!db) return json({ error: 'This deployment has no leaderboard configured.' }, 503, priv);
      const run = cardUpload[1];
      let started: { started_at: number } | null = null;
      try {
        started = await db.prepare('SELECT started_at FROM game_runs WHERE id = ?').bind(run).first<{ started_at: number }>();
      } catch {
        // No table yet: no flight has started, so this is not one.
      }
      if (!started) return json({ error: 'That flight is not one this server started.' }, 404, priv);
      const id = await cardId(run);
      const key = `card:${id}`;
      const link = `${url.origin}/c/${id}`;
      if (await env.BANNERS.get(key, 'arrayBuffer')) return json({ id, url: link }, 200, priv);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const wrong = cardProblem(bytes);
      if (wrong) return json({ error: wrong }, wrong.includes('large') ? 413 : 400, priv);
      await env.BANNERS.put(key, bytes, { expirationTtl: CARD_TTL_SECONDS });
      return json({ id, url: link }, 200, priv);
    }
    const shared = url.pathname.match(/^\/c\/([0-9a-f]+)(\.jpg)?$/);
    if ((request.method === 'GET' || request.method === 'HEAD') && shared && isCardId(shared[1])) {
      const [, id, jpg] = shared;
      const card = await env.BANNERS.get(`card:${id}`, 'arrayBuffer');
      const site = (env.ALLOWED_ORIGINS ?? '').split(',')[0]?.trim() || 'https://seat-airlines.space';
      if (!card) {
        // Gone, or never was: the site, rather than an error nobody asked for.
        return new Response(null, { status: 302, headers: { location: site } });
      }
      if (jpg) {
        return new Response(request.method === 'HEAD' ? null : card, {
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(card.byteLength),
            'cache-control': 'public, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
            'access-control-allow-origin': '*',
          },
        });
      }
      const page = `${url.origin}/c/${id}`;
      return new Response(request.method === 'HEAD' ? null : cardPage({ image: `${page}.jpg`, page, site: `${site}/` }), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
          'referrer-policy': 'no-referrer',
        },
      });
    }

    /* ── Seat cards ─────────────────────────────────────────────────────
       A holder shares their advert to X on a card the page draws (see
       src/lib/seatCard.ts). The page reads the advert's bytes from here,
       with CORS, because the bucket it lives in sends none and a canvas
       drawn from it could not be read back. The card is left signed by the
       wallet whose seat it is, and only while that wallet has an advert up;
       it is served, like a flight's, as a picture and as a page X reads. */
    const advertOf = url.pathname.match(/^\/advert\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if ((request.method === 'GET' || request.method === 'HEAD') && advertOf) {
      const stored = (await readWall(env))[advertOf[1]];
      if (!stored) return json({ error: 'That wallet has no advert up.' }, 404, cors);
      let bytes: ArrayBuffer | null = null;
      let type = 'image/jpeg';
      if (usingR2(env)) {
        const obj = await env.IMAGES!.get(stored.key);
        if (obj) {
          bytes = await obj.arrayBuffer();
          type = obj.httpMetadata?.contentType ?? type;
        }
      }
      if (!bytes) {
        const hit = await env.BANNERS.getWithMetadata<{ type: string }>(`image:${stored.key}`, 'arrayBuffer');
        if (hit.value) {
          bytes = hit.value;
          type = hit.metadata?.type ?? type;
        }
      }
      if (!bytes) return json({ error: 'That advert\'s image is missing.' }, 404, cors);
      return new Response(request.method === 'HEAD' ? null : bytes, {
        headers: {
          'content-type': /^image\/(png|webp|jpeg)$/.test(type) ? type : 'image/jpeg',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': '*',
        },
      });
    }
    const seatUpload = url.pathname.match(/^\/seatcards\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (request.method === 'PUT' && seatUpload) {
      const priv = { ...cors, 'cache-control': 'no-store' };
      const owner = seatUpload[1];
      const issued = request.headers.get('x-sa-issued') ?? '';
      const signature = request.headers.get('x-sa-signature') ?? '';
      const at = Date.parse(issued);
      if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) {
        return json({ error: 'That signature has expired. Try again.' }, 400, priv);
      }
      const bytes = new Uint8Array(await request.arrayBuffer());
      const wrong = cardProblem(bytes);
      if (wrong) return json({ error: wrong }, wrong.includes('large') ? 413 : 400, priv);
      const hash = await sha256Hex(bytes);
      if (!(await verifySignature(owner, seatCardChallenge(owner, hash, issued), signature))) {
        return json({ error: 'That signature does not match the wallet.' }, 401, priv);
      }
      if (!(await readWall(env))[owner]) return json({ error: 'Put an advert on your seat first.' }, 403, priv);
      const id = await seatCardId(owner);
      const version = hash.slice(0, 10);
      await env.BANNERS.put(`seatcard:${id}`, bytes, { expirationTtl: CARD_TTL_SECONDS, metadata: { v: version } });
      // Versioned, so X reads a changed card afresh rather than from its own cache of the last.
      return json({ id, url: `${url.origin}/s/${id}?v=${version}` }, 200, priv);
    }
    const seatShared = url.pathname.match(/^\/s\/([0-9a-f]+)(\.jpg)?$/);
    if ((request.method === 'GET' || request.method === 'HEAD') && seatShared && isCardId(seatShared[1])) {
      const [, id, jpg] = seatShared;
      const hit = await env.BANNERS.getWithMetadata<{ v?: string }>(`seatcard:${id}`, 'arrayBuffer');
      const site = (env.ALLOWED_ORIGINS ?? '').split(',')[0]?.trim() || 'https://seat-airlines.space';
      if (!hit.value) return new Response(null, { status: 302, headers: { location: site } });
      if (jpg) {
        return new Response(request.method === 'HEAD' ? null : hit.value, {
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(hit.value.byteLength),
            // A holder can share again with a new advert, so not immutable: the page names a version.
            'cache-control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
            'x-content-type-options': 'nosniff',
            'access-control-allow-origin': '*',
          },
        });
      }
      const page = `${url.origin}/s/${id}`;
      const v = hit.metadata?.v ? `?v=${hit.metadata.v}` : '';
      return new Response(request.method === 'HEAD' ? null : cardPage({ image: `${page}.jpg${v}`, page, site: `${site}/#wall`, kind: 'seat' }), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
          'referrer-policy': 'no-referrer',
        },
      });
    }

    /* Public seat cards show offering tags and links opted in by the owner.
       No session, email, or cabin contact permissions are exposed here. */
    if (request.method === 'GET' && ['/seat-profile', '/seat-profiles'].includes(url.pathname)) {
      const collection = url.pathname === '/seat-profiles';
      /* One holder's card is never cached, so turning links off takes effect
         on the next read. The list every visitor's wall loads is held for 30
         seconds: a revocation reaches it within half a minute, and the
         directory is not queried once per page view. */
      const headers = { ...cors, 'cache-control': collection ? 'public, max-age=30' : 'no-store' };
      const address = url.searchParams.get('address');
      if (!collection && !isAddress(address)) return json({ error: 'That wallet address is not valid.' }, 400, headers);
      if (!env.DIRECTORY) return json(collection ? {} : null, 200, headers);
      try {
        const seated = collection ? await readLadder(env) : null;
        if (seated && !seated.live) return json({ error: 'The passenger list is temporarily unavailable.' }, 503, headers);
        const { results } = await env.DIRECTORY.prepare(
          'SELECT p.address, p.display_name, p.website, p.linkedin, l.links, c.categories,' +
          ' CASE WHEN s.address IS NULL THEN 0 ELSE 1 END AS public_links FROM profiles p' +
          ' LEFT JOIN public_seat_profiles s ON s.address = p.address' +
          ' LEFT JOIN profile_links l ON l.address = p.address' +
          ' LEFT JOIN profile_categories c ON c.address = p.address' +
          (collection ? ' WHERE p.address IN (SELECT value FROM json_each(?))' : ' WHERE p.address = ?') +
          " AND (s.address IS NOT NULL OR c.categories <> '[]')",
        ).bind(collection ? JSON.stringify(seated!.seated()) : address).all<ProfileRow>();
        const publicCard = (row: ProfileRow) => ({
          displayName: row.public_links ? row.display_name : '',
          website: row.public_links ? row.website : '', linkedin: row.public_links ? row.linkedin : '',
          links: row.public_links ? parseStoredLinks(row.links) : {}, categories: storedOfferings(row.categories),
        });
        return json(collection ? Object.fromEntries((results ?? []).map((row) => [row.address, publicCard(row)]))
          : results?.[0] ? publicCard(results[0]) : null, 200, headers);
      } catch (error) {
        // Before the first authenticated profile visit there is no opt-in table.
        if (String(error).includes('no such table')) return json(collection ? {} : null, 200, headers);
        throw error;
      }
    }

    /* ── The directory ──────────────────────────────────────────────────
       Nothing below is cacheable: every response is either a credential or
       somebody's private correspondence. */
    const directoryRoute = ['/session', '/directory', '/profile', '/messages'].includes(url.pathname);
    if (directoryRoute) {
      const db = env.DIRECTORY;
      if (!db) {
        return json({ error: 'This deployment has no cabin directory configured.' }, 503, cors);
      }
      const priv = { ...cors, 'cache-control': 'no-store' };

      /* Opening a session. The one route here that a signature reaches; every
         other one is the token it hands back. */
      if (request.method === 'POST' && url.pathname === '/session') {
        let body: { address?: unknown; issued?: unknown; signature?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }

        const address = isAddress(body.address) ? body.address : '';
        const issued = typeof body.issued === 'string' ? body.issued : '';
        const signature = typeof body.signature === 'string' ? body.signature : '';
        if (!address || !issued || !signature) {
          return json({ error: 'That sign-in was missing something.' }, 400, priv);
        }

        const at = Date.parse(issued);
        if (!Number.isFinite(at) || Math.abs(Date.now() - at) > SIGNIN_MAX_AGE_MS) {
          return json({ error: 'That signature has expired. Try again.' }, 400, priv);
        }

        if (!(await verifySignature(address, signInChallenge(address, issued), signature))) {
          return json({ error: 'That signature does not match the wallet.' }, 401, priv);
        }

        /* Spend the signature. It stays valid for five minutes, so without
           this a captured one is a second token for somebody else. */
        const spent = await db
          .prepare('INSERT OR IGNORE INTO signins (address, issued, expires_at) VALUES (?, ?, ?)')
          .bind(address, issued, at + SIGNIN_MAX_AGE_MS)
          .run();
        if (!spent.meta.changes) {
          return json({ error: 'That sign-in has already been used. Try again.' }, 401, priv);
        }

        /* The door: a session is for holders, because the directory is a room
           for holders and a non-holder never gets a token to ask with.

           The operator is the one exception, and it is not a privilege — it
           is the difference between a rule about cabins and a name written in
           the deployment. The logbook belongs to a wallet, not to a balance,
           and an operator locked out of their own notes because a bag dipped
           under the cutoff would be a failure with no error in it and no way
           to read it off the page. What they hold still decides everything
           else: the ladder seats them where their bag puts them, which for a
           wallet holding nothing is the hold. */
        if (!(await holdsToken(env, address)) && !isAdmin(env.ADMIN_WALLET, address)) {
          return json({ error: 'That wallet does not hold the token.' }, 403, priv);
        }

        const token = mintToken();
        const expires = Date.now() + SESSION_TTL_MS;
        await db.batch([
          db.prepare('INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)')
            .bind(await tokenHash(token), address, expires),
          // Nothing else sweeps these up, and a sign-in is the moment there is
          // already a write in flight.
          db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
          db.prepare('DELETE FROM signins WHERE expires_at < ?').bind(Date.now()),
        ]);

        return json({ token, address, expires }, 200, priv);
      }

      if (request.method === 'DELETE' && url.pathname === '/session') {
        const token = bearerToken(request.headers.get('authorization'));
        if (token) {
          await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await tokenHash(token)).run();
        }
        return json({ ok: true }, 200, priv);
      }

      const token = bearerToken(request.headers.get('authorization'));
      const me = token ? await sessionAddress(db, token) : null;
      if (!token || !me) return json({ error: 'Sign in to read the cabin directory.' }, 401, priv);

      /* Still aboard?

         A session lasts a day, and a bag can be gone in a minute. Most of
         what selling up should cost somebody the seating already takes care
         of: drop off the manifest and the ladder puts you in the hold within
         its cache, so contact details close, conversations stop carrying,
         and no introduction will send. But the door itself was checked once,
         at sign-in, and never again — so a wallet that sold everything kept
         the roster for up to twenty-four hours, and the roster is most of
         what the room is for.

         So the door's own check is made again here, against the same cache
         that keeps it from being an RPC call per request. It stands aside
         when the chain cannot answer, exactly as it does at sign-in — an
         outage should not empty the cabin — and when it does answer no, the
         session row goes too, so the page is told to sign in again rather
         than left retrying a token that will never work again.

         Being out-held is not selling. A holder who still holds anything
         keeps their session, their card, and their inbox; they are in the
         hold, which is part of this aeroplane.

         And the operator keeps theirs at any balance, for the reason the door
         gives above: the logbook is a wallet's, not a bag's. */
      if (!(await holdsToken(env, me)) && !isAdmin(env.ADMIN_WALLET, me)) {
        await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await tokenHash(token)).run();
        return json({ error: 'That wallet no longer holds the token.' }, 401, priv);
      }

      if (request.method === 'GET' && url.pathname === '/directory') {
        const ladder = await readLadder(env);
        const mine = ladder.zoneOf(me);

        /* Only the aircraft, and only ever the aircraft.

           The roster the page draws is the manifest, so a card belonging to a
           wallet that has dropped off it is one nobody can see — and a row
           nobody can see is a row not worth reading out of the database. This
           used to be the last 500 cards written, which fetched the hold's
           and then quietly declined to show them. Your own card is always in
           the list, seated or not, because you are allowed to edit it after
           being out-held. */
        const wanted = [...new Set([...ladder.seated(), me])];
        await ensureProfileLinks(db);
        /* The wallets go in as one JSON parameter, not one `?` each. D1 takes
           at most 100 bound parameters a statement, and a full aircraft is
           178 seats — so the old `IN (?, ?, …)` failed the whole roster the
           day the hundredth holder was seated. */
        const { results } = await db
          .prepare(
            'SELECT p.address, p.display_name, p.role, p.email, p.website, p.linkedin, p.updated_at, l.links,' +
            ' CASE WHEN s.address IS NULL THEN 0 ELSE 1 END AS public_links, c.categories' +
            ' FROM profiles p LEFT JOIN profile_links l ON l.address = p.address' +
            ' LEFT JOIN public_seat_profiles s ON s.address = p.address' +
            ' LEFT JOIN profile_categories c ON c.address = p.address' +
            ' WHERE p.address IN (SELECT value FROM json_each(?)) ORDER BY p.updated_at DESC',
          )
          .bind(JSON.stringify(wanted))
          .all<ProfileRow>();

        const out: Record<string, ReturnType<typeof asProfile>> = {};
        for (const row of results ?? []) {
          const readable = row.address === me
            || (ladder.live && canViewContact(mine, ladder.zoneOf(row.address)));
          out[row.address] = asProfile(row, readable);
        }
        return json(out, 200, priv);
      }

      if (request.method === 'PUT' && url.pathname === '/profile') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }
        const parsed = readProfileInput(body);
        if ('error' in parsed) return json({ error: parsed.error }, 400, priv);

        const updated = new Date().toISOString();
        const { profile } = parsed;
        /* Only a save that sends links writes them. A page from before the
           links sends none, and saving its card must not wipe the ones a
           newer page put there. */
        const sentLinks = typeof body === 'object' && body !== null && 'links' in body;
        const sentVisibility = typeof body === 'object' && body !== null && 'publicLinks' in body;
        const sentCategories = typeof body === 'object' && body !== null && 'categories' in body;
        await ensureProfileLinks(db);
        await db.batch([
          db
            .prepare(
              'INSERT INTO profiles (address, display_name, role, email, website, linkedin, updated_at)' +
              ' VALUES (?, ?, ?, ?, ?, ?, ?)' +
              ' ON CONFLICT(address) DO UPDATE SET display_name = excluded.display_name,' +
              ' role = excluded.role, email = excluded.email, website = excluded.website,' +
              ' linkedin = excluded.linkedin, updated_at = excluded.updated_at',
            )
            .bind(me, profile.displayName, profile.role, profile.email, profile.website, profile.linkedin, updated),
          ...(sentLinks
            ? [db
              .prepare('INSERT INTO profile_links (address, links) VALUES (?, ?) ON CONFLICT(address) DO UPDATE SET links = excluded.links')
              .bind(me, JSON.stringify(profile.links))]
            : []),
          ...(sentVisibility ? [profile.publicLinks
            ? db.prepare('INSERT OR IGNORE INTO public_seat_profiles (address) VALUES (?)').bind(me)
            : db.prepare('DELETE FROM public_seat_profiles WHERE address = ?').bind(me)] : []),
          ...(sentCategories ? [db.prepare(
            'INSERT INTO profile_categories (address, categories) VALUES (?, ?)' +
            ' ON CONFLICT(address) DO UPDATE SET categories = excluded.categories',
          ).bind(me, JSON.stringify(profile.categories))] : []),
        ]);

        const visibility = await db.prepare('SELECT address FROM public_seat_profiles WHERE address = ?').bind(me).first();
        const categories = await db.prepare('SELECT categories FROM profile_categories WHERE address = ?').bind(me).first<{ categories: string }>();
        return json({ ...profile, categories: storedOfferings(categories?.categories ?? null), publicLinks: Boolean(visibility), address: me, updated }, 200, priv);
      }

      if (request.method === 'GET' && url.pathname === '/messages') {
        const columns = 'SELECT id, sender, recipient, body, sent_at FROM messages';
        /* `sent` is the outbox of *introductions*, so the rooms are kept out
           of it: a line said in your own section is not a letter you wrote,
           and it comes back in `channels` already, with everyone else's. */
        const [inbox, sent] = await db.batch<MessageRow>([
          db.prepare(`${columns} WHERE recipient = ? ORDER BY sent_at DESC LIMIT ?`).bind(me, MESSAGE_PAGE),
          db.prepare(
            `${columns} WHERE sender = ? AND recipient NOT LIKE 'section:%' AND recipient <> ?` +
            ' ORDER BY sent_at DESC LIMIT ?',
          ).bind(me, ANNOUNCEMENT, MESSAGE_PAGE),
        ]);

        /* Your own cabin's room, and nobody else's.

           Each cabin hears only itself. The forward cabins used to read every
           room behind them, and every introduction between two seats behind
           them ("overheard"); both went with the rest of the view aft.
           `overheard` is still sent, empty, so a page from before this change
           draws nothing rather than failing, and `?rooms=all` is ignored for
           the same reason.

           The PA is not a room: it is one line from the flight deck that the
           whole aeroplane hears, the hold included. Being aboard is the only
           qualification for hearing it. */
        const ladder = await readLadder(env);
        const mine = ladder.live ? ladder.zoneOf(me) : null;
        const readable = mine ? [mine] : [];
        const roomRows = readable.length
          ? await db.batch<MessageRow>(readable.map((zone) => db
            .prepare(`${columns} WHERE recipient = ? ORDER BY sent_at DESC LIMIT ?`)
            .bind(channelFor(zone), MESSAGE_PAGE)))
          : [];
        const channels: Record<string, ReturnType<typeof asMessage>[]> = {};
        readable.forEach((zone, i) => {
          channels[zone] = (roomRows[i]?.results ?? []).map(asMessage);
        });

        const pa = await db
          .prepare(`${columns} WHERE recipient = ? ORDER BY sent_at DESC LIMIT ?`)
          .bind(ANNOUNCEMENT, ANNOUNCEMENT_PAGE)
          .all<MessageRow>();

        return json({
          inbox: (inbox.results ?? []).map(asMessage),
          sent: (sent.results ?? []).map(asMessage),
          overheard: [],
          channels,
          announcements: (pa.results ?? []).map(asMessage),
        }, 200, priv);
      }

      if (request.method === 'POST' && url.pathname === '/messages') {
        let body: { to?: unknown; body?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: 'That request was not JSON.' }, 400, priv);
        }

        /* Three things can be written to: a person, a section's room, and the
           PA. They share this route because they share a table and a rule —
           the seating decides all three — and splitting them into three
           routes would be three places for that rule to drift. */
        const to = typeof body.to === 'string' ? body.to : '';
        const room = zoneOfChannel(to);
        const announcing = to === ANNOUNCEMENT;
        if (!room && !announcing) {
          if (!isAddress(to)) return json({ error: 'That is not a wallet address or a cabin.' }, 400, priv);
          if (to === me) return json({ error: 'That message is addressed to you.' }, 400, priv);
        }

        const parsed = readMessageBody(body.body);
        if ('error' in parsed) return json({ error: parsed.error }, 400, priv);

        /* Who may say this, asked of the seating rather than of the composer.

           The page hides a composer it knows would be refused, and for a
           while that was the whole of the rule: this route took an
           introduction from anybody holding a session, so one fetch wrote a
           note into an inbox the sender could not otherwise reach. Reads were
           enforced here; writes were on trust.

           Every one of these is a function out of the file both sides import,
           so what the composer offers and what this accepts cannot come
           apart. Asked after the message has been read and before the rate
           limit, which is the first thing here that costs a query. */
        const ladder = await readLadder(env);
        if (!ladder.live) {
          /* With no holder feed every wallet reads as unseated, so the rules
             below would refuse everybody — correctly, but for a reason that
             is about this deployment rather than about them. Say the true
             one. It fails closed, as the rest of the directory does when it
             cannot tell the cabins apart: `HOLDERS_URL`, or `RPC_URL` with
             `TOKEN_MINT`, is what turns any of this on. */
          return json({ error: 'The cabin cannot tell which section you are in right now.' }, 503, priv);
        }
        const mine = ladder.zoneOf(me);

        if (announcing && !canAnnounce(mine)) {
          return json({ error: 'The PA belongs to the flight deck.' }, 403, priv);
        }
        if (room && !canPostToChannel(mine, room)) {
          return json({ error: 'That is another cabin. You can only talk in your own.' }, 403, priv);
        }
        if (!room && !announcing && !canMessage(mine, ladder.zoneOf(to), me, to)) {
          return json({ error: 'That holder is in another cabin. Introductions stay within your own.' }, 403, priv);
        }

        /* Quotas live inside the INSERT rather than a preceding SELECT COUNT.
           D1 serializes the write, so concurrent requests cannot all observe
           the same pre-quota count and then insert. */
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const message = { id: messageId(), from: me, to, body: parsed.body, sentAt: new Date().toISOString() };
        const announcementQuota = announcing
          ? ' AND (SELECT COUNT(*) FROM messages WHERE sender = ? AND recipient = ? AND sent_at > ?) < ?'
          : '';
        const binds = announcing
          ? [message.id, message.from, message.to, message.body, message.sentAt, message.from, hourAgo, MESSAGES_PER_HOUR, message.from, ANNOUNCEMENT, dayAgo, ANNOUNCEMENTS_PER_DAY]
          : [message.id, message.from, message.to, message.body, message.sentAt, message.from, hourAgo, MESSAGES_PER_HOUR];
        const inserted = await db
          .prepare(
            `INSERT INTO messages (id, sender, recipient, body, sent_at)
             SELECT ?, ?, ?, ?, ?
             WHERE (SELECT COUNT(*) FROM messages WHERE sender = ? AND sent_at > ?) < ?${announcementQuota}`,
          )
          .bind(...binds)
          .run();
        if (!inserted.meta.changes) {
          return json({ error: announcing ? 'One announcement a day. Use it well.' : 'That is enough for one hour.' }, 429, priv);
        }

        return json(message, 200, priv);
      }

      return json({ error: `${request.method} is not allowed on ${url.pathname}.` }, 405, priv);
    }

    if (request.method === 'GET' && url.pathname === '/banners') {
      const wall = await readWall(env);
      const etag = wallEtag(wall);
      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304, headers: { ...cors, etag, 'cache-control': 'public, max-age=30, stale-while-revalidate=120' } });
      }
      const out: Record<string, { image: string; alt: string; href?: string }> = {};
      for (const [owner, stored] of Object.entries(wall)) {
        out[owner] = {
          image: imageUrl(env, request, stored.key, stored.updated),
          alt: stored.alt,
          ...(stored.href ? { href: stored.href } : {}),
        };
      }
      return json(out, 200, {
        ...cors,
        // The wall is read constantly and written rarely.
        etag,
        'cache-control': 'public, max-age=30, stale-while-revalidate=120',
      });
    }

    if (request.method === 'POST' && url.pathname === '/banner') {
      let body: {
        owner?: unknown; image?: unknown; alt?: unknown;
        href?: unknown; issued?: unknown; signature?: unknown;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'That request was not JSON.' }, 400, cors);
      }

      const owner = typeof body.owner === 'string' ? body.owner : '';
      const image = typeof body.image === 'string' ? body.image : '';
      const issued = typeof body.issued === 'string' ? body.issued : '';
      const signature = typeof body.signature === 'string' ? body.signature : '';
      const alt = typeof body.alt === 'string' ? body.alt : '';
      const href = typeof body.href === 'string' && body.href ? body.href : undefined;

      if (!owner || !image || !issued || !signature) {
        return json({ error: 'That request was missing something.' }, 400, cors);
      }
      // Refused rather than trimmed: what is stored has to be exactly what was signed.
      const textProblem = advertTextProblem(alt, href);
      if (textProblem) return json({ error: textProblem }, 400, cors);

      // Time first: it is the cheapest check and it bounds replay.
      const at = Date.parse(issued);
      if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) {
        return json({ error: 'That signature has expired. Try again.' }, 400, cors);
      }

      const bytes = decodeDataUrl(image);
      if (!bytes) return json({ error: 'That image could not be decoded.' }, 400, cors);
      if (bytes.length > MAX_IMAGE_BYTES) {
        return json({ error: 'That image is too large.' }, 413, cors);
      }
      const type = imageType(bytes);
      if (!type) return json({ error: 'Adverts must be JPEG, PNG, or WebP.' }, 415, cors);

      // The signature authorises *this* advert — image, caption and link — not merely this wallet.
      const hash = await sha256Hex(bytes);
      if (!(await verifySignature(owner, challenge(owner, hash, issued, alt, href), signature))) {
        /* A page from before the caption and link were signed signs the old
           text. With neither, it says everything the new one would; with
           either, the words were never signed, so they are not stored, and
           the holder is told the one thing that fixes it. */
        const legacy = await verifySignature(owner, legacyChallenge(owner, hash, issued), signature);
        if (!legacy) return json({ error: 'That signature does not match the wallet.' }, 401, cors);
        if (alt || href) {
          return json({ error: 'This page is out of date. Reload it, then publish again.' }, 409, cors);
        }
      }

      const cooldownKey = `cooldown:${owner}`;
      if (await env.BANNERS.get(cooldownKey)) {
        return json({ error: 'Slow down a moment, then try again.' }, 429, cors);
      }

      if (!(await holdsToken(env, owner))) {
        return json({ error: 'That wallet does not hold the token.' }, 403, cors);
      }

      const key = `banners/${hash.slice(0, 32)}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
      // One timestamp, used for both the record and the URL's version, so
      // what the publisher is handed back is the same URL the wall will serve.
      const updated = new Date().toISOString();
      const image_url = await storeImage(env, request, key, bytes, type, updated);
      const stored: StoredBanner = { key, alt, href, updated };
      await env.BANNERS.put(`banner:${owner}`, JSON.stringify(stored));
      await addToWall(env, owner, stored);
      await env.BANNERS.put(cooldownKey, '1', { expirationTtl: COOLDOWN_SECONDS });
      try { await caches.default.delete(new Request(new URL('/banners', request.url).toString())); } catch { /* best effort */ }

      return json({ image: image_url }, 200, cors);
    }

    /* Taking an advert down.

       Signed like a publish, over text that names the wallet and the exact
       advert — the key its artwork is stored under — so a signature takes
       down the one advert it was made for, and replayed after the holder has
       put up another it matches nothing. The time bound is the publish's.

       No holder check, because taking your own advert down costs nobody any
       storage, and no cooldown, so a holder can take one down and put the
       next one up straight away. The artwork stays where it is: it is
       addressed by its own bytes, another wallet may be showing the same
       picture, and a URL that stops resolving is a broken image in some
       browser that still has the wall cached. */
    if (request.method === 'DELETE' && url.pathname === '/banner') {
      let body: { owner?: unknown; key?: unknown; issued?: unknown; signature?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'That request was not JSON.' }, 400, cors);
      }

      const owner = typeof body.owner === 'string' ? body.owner : '';
      const key = typeof body.key === 'string' ? body.key : '';
      const issued = typeof body.issued === 'string' ? body.issued : '';
      const signature = typeof body.signature === 'string' ? body.signature : '';
      if (!owner || !key || !issued || !signature) {
        return json({ error: 'That request was missing something.' }, 400, cors);
      }

      const at = Date.parse(issued);
      if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) {
        return json({ error: 'That signature has expired. Try again.' }, 400, cors);
      }
      if (!(await verifySignature(owner, takedownChallenge(owner, key, issued), signature))) {
        return json({ error: 'That signature does not match the wallet.' }, 401, cors);
      }

      /* `gone` is what tells this 404 from the fallthrough's: a Worker from
         before this route answers the same DELETE with "No such route.",
         and a page that took any 404 as done would tell the holder their
         advert was down while it was still on the wall. */
      const stored = readStoredBanner(await env.BANNERS.get(`banner:${owner}`));
      if (!stored) {
        return json({ error: 'There is no advert up for this wallet.', gone: true }, 404, cors);
      }
      if (stored.key !== key) {
        return json({ error: 'That advert has already been replaced.' }, 409, cors);
      }

      await env.BANNERS.delete(`banner:${owner}`);
      await removeFromWall(env, owner);
      try { await caches.default.delete(new Request(new URL('/banners', request.url).toString())); } catch { /* best effort */ }

      return json({ ok: true }, 200, cors);
    }

    /* Serving the artwork. Only reachable without R2 — with it, images are
       read straight from the bucket and never touch the Worker.

       This used to send no CORS header at all, on the reasoning that an
       <img> source is not an API and does not need one. That is true of the
       seat map, and false of the cabin: the adverts on the seat-back screens
       are WebGL textures, and three.js asks for every texture with
       crossOrigin="anonymous". A cross-origin image answered without
       access-control-allow-origin is discarded by the browser, so every
       screen in the aeroplane fell back to the airline's mark and nothing
       said why — TextureLoader's failures are silent.

       Wide open rather than the allowlist above, and deliberately so. These
       are public bytes served with no cookies and no credentials, and `*` is
       the header that says exactly that; echoing a single allowed origin
       would hand a cached response to the wrong one. The content type is
       still the one sniffed from the bytes at upload rather than anything a
       request can influence, with nosniff on top.

       HEAD is answered too, because link unfurlers and CDN health checks use
       it, and a 404 to HEAD on a URL that GETs fine reads as a broken image. */
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/images/')) {
      const key = decodeURIComponent(url.pathname.slice('/images/'.length));
      const hit = await env.BANNERS.getWithMetadata<{ type: string }>(`image:${key}`, 'arrayBuffer');
      if (!hit.value) return json({ error: 'No such image.' }, 404, cors);
      const type = hit.metadata?.type === 'image/png' ? 'image/png' : hit.metadata?.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      return new Response(request.method === 'HEAD' ? null : hit.value, {
        headers: {
          'content-type': type,
          'content-length': String(hit.value.byteLength),
          'cache-control': /^banners\/[0-9a-f]{32}\./.test(key) ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': '*',
        },
      });
    }

    return json({ error: 'No such route.' }, 404, cors);
}
