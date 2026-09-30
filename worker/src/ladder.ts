/**
 * Who sits where, as the server needs to know it.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 * This service spent its whole life refusing to learn the seat ladder, and
 * the refusal was right: a second copy of that logic would drift from the
 * page's the first time either changed, and adverts never needed it — the
 * page knows which seat a wallet is in, so the wall can be keyed by wallet
 * and stay honest.
 *
 * The directory is not the wall. "Your own section and everything behind it"
 * is a rule about who may read somebody's email address and somebody else's
 * conversation, and a rule like that enforced only in the browser is not a
 * rule — it is a suggestion the network tab ignores. So the ladder is
 * computed here too.
 *
 * What makes that safe is that it is not a second copy: the seating itself
 * comes from `src/lib/seating.ts`, the same file the page imports, so there
 * is one definition of rank, one zone order, and one place to change them.
 * What is here is only the part that is this side's own business — fetching
 * the holder list, caching it, and answering "which cabin is this wallet in".
 */

import { FULL_CABIN, seatHolders, zoneRank, type Holder } from '../../src/lib/seating';
import { readHolderList } from '../../src/lib/holderList';
import type { ZoneKey } from '../../src/content/cabin';

/**
 * How long a holder list is reused before it is read again.
 *
 * Two minutes: every read is a sweep of the indexer plus a check of the top
 * wallets, metered per call, and the page itself only asks every ninety
 * seconds. A holder who has just bought waits up to two minutes for the seat
 * that comes with it, which is the price of reading the chain half as often.
 */
const DEFAULT_CACHE_MS = 120_000;
/** After a failed read, how long before trying again, rather than on every request. */
const RETRY_MS = 15_000;
/** The oldest shared seating worth falling back on when a fresh read fails. */
const STALE_LIMIT_MS = 60 * 60_000;

/**
 * Where to read the chain when nobody has said where.
 *
 * ── Why there is a default at all ─────────────────────────────────────────
 * `RPC_URL` is a secret rather than a var, because a paid endpoint carries
 * its key in the URL, and a secret is set out of band — by hand, once, on the
 * dashboard. CI cannot push it (an unset repository secret would write an
 * empty string on every deploy and silently turn the gate off), so a deploy
 * that is correct in every other respect can land with no way to read the
 * chain. That is not a loud failure. It is a directory that opens, lists
 * everybody, and withholds every contact detail from everybody, because it
 * cannot tell one cabin from another — and `sections: false` on `/health` is
 * the only place it says so.
 *
 * A deployment should not depend on somebody having remembered. Solana's own
 * public endpoint is the answer of last resort: rate-limited, unsuitable for
 * real traffic, and enormously better than not knowing who is aboard. Every
 * path that uses it already treats a refusal as "could not be asked" and
 * keeps whatever it had, so the failure mode of it being busy is the failure
 * mode that was already handled.
 *
 * Set `RPC_URL` to your own endpoint. This is what happens when you have not.
 */
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * The endpoint this deployment reads the chain with.
 *
 * Exported because `holdsToken` in `index.ts` must ask the same one: a
 * deployment where the directory can see the seating but the door cannot
 * check the token is a room with a guest list and no doorman.
 */
export function rpcUrl(env: LadderEnv): string | undefined {
  // No mint means no token to read, so there is nothing to point an RPC at.
  return env.RPC_URL || (env.TOKEN_MINT ? PUBLIC_RPC : undefined);
}

/**
 * Whether this deployment is *configured* to tell one cabin from another.
 *
 * Reported by `/health` as `configured`, and deliberately no longer as
 * `sections`. This answers "was a feed or a mint ever set", which is a
 * question about the deployment. `sections` answers "was the seating
 * actually read", which is a question about right now. They were the same
 * field until the chain scan arrived and pulled them apart: with a mint set
 * and an endpoint that refuses the scan, this returns true while the cabin
 * seats nobody. Answering the first when an operator asked the second is how
 * a silent failure stays silent, so `/health` reports both, and they mean
 * different things on purpose.
 */
export function canSeat(env: LadderEnv): boolean {
  return Boolean(env.HOLDERS_URL || env.TOKEN_MINT);
}

/**
 * The whole aircraft, read from the shared seating rather than written down.
 *
 * The page defaults to the same constant from the same file, so the two agree
 * without anybody keeping two numbers in step. Setting `MANIFEST_SIZE` here
 * means setting `VITE_MANIFEST_SIZE` there.
 */
const DEFAULT_MANIFEST_SIZE = FULL_CABIN;

/** The manifest size this deployment asks for, sane or not. */
function requestedSize(env: LadderEnv): number {
  return Math.max(2, Number(env.MANIFEST_SIZE || DEFAULT_MANIFEST_SIZE));
}

/**
 * How many seats this deployment can fill, which is how many `/health`
 * reports `seated` out of.
 *
 * A cabin quietly filling to twenty of a hundred and seventy-eight is the
 * failure that survived every other fix in this file, because twenty seated
 * holders and a working directory look exactly like success from outside.
 * Reported as a number so it is something an operator reads rather than
 * something they have to already suspect.
 *
 * Capped at the aircraft because `seatHolders` caps there too: a
 * `MANIFEST_SIZE` above the seat count buys no extra seats, and reporting
 * one would invent an aeroplane the page does not draw.
 */
export function cabinSize(env: LadderEnv): number {
  return Math.min(requestedSize(env), FULL_CABIN);
}

export interface LadderEnv {
  /** An indexer, as the page's `VITE_HOLDERS_URL`. The uncapped source. */
  HOLDERS_URL?: string;
  /**
   * Solana JSON-RPC. Unset, Solana's public endpoint is used — see
   * `PUBLIC_RPC` on why a deployment should not need this to have been
   * remembered, and why you should still set it.
   */
  RPC_URL?: string;
  TOKEN_MINT?: string;
  MANIFEST_SIZE?: string;
  /** How long seating is cached, in milliseconds. Defaults to two minutes. */
  LADDER_CACHE_MS?: string;
  /**
   * Where one copy of this Worker leaves the seating for the others. Optional:
   * without it every copy reads the chain for itself, as it always did.
   */
  DIRECTORY?: D1Database;
}

export interface Ladder {
  /** False when no holder feed is configured, so nothing can be judged. */
  live: boolean;
  /**
   * The list this seating was built from, in the shape an indexer gives.
   *
   * Kept so `GET /holders` can hand it straight back. The page needs the
   * same list this side is using — one feed is what keeps one seating chart
   * — and reading it from here means the chain is scanned once a minute for
   * the whole site rather than once every ninety seconds per visitor.
   */
  holders: readonly Holder[];
  /**
   * Total supply, in whole tokens, as the same read established it.
   *
   * Here so that "what share is this bag" can be answered without a second
   * `getTokenSupply` per asking. Zero when nothing could be read.
   */
  supply: number;
  /** The cabin a wallet is in, or null when it is in the hold. */
  zoneOf(address: string): ZoneKey | null;
  /**
   * A wallet's balance as this seating read it, or null when it is not on
   * the list — which is not the same as holding nothing: the list is the
   * top of the aircraft, not everybody.
   */
  balanceOf(address: string): number | null;
  /** Everybody with a seat, which is everybody the page draws. */
  seated(): readonly string[];
}

/** A ladder that knows nothing, and therefore permits nothing. */
const NO_LADDER: Ladder = {
  live: false, holders: [], supply: 0, zoneOf: () => null, balanceOf: () => null, seated: () => [],
};

let snapshot: { value: Ladder; expiresAt: number } | undefined;
/** The read already under way in this isolate, shared by every request that arrives while it runs. */
let reading: Promise<Ladder> | null = null;

function cacheMs(env: LadderEnv): number {
  const ttl = Number(env.LADDER_CACHE_MS || DEFAULT_CACHE_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_MS;
}

/** Seating built from a holder list: pure arithmetic, no calls. */
function build(holders: readonly Holder[], supply: number, size: number): Ladder {
  const manifest = seatHolders(holders, supply, true, size);
  const zones = new Map(manifest.entries.map((e) => [e.address, e.seat.zone] as const));
  const balances = new Map(holders.map((h) => [h.address, h.balance] as const));
  return {
    live: true,
    holders,
    supply,
    zoneOf: (address) => zones.get(address) ?? null,
    balanceOf: (address) => balances.get(address) ?? null,
    seated: () => manifest.entries.map((e) => e.address),
  };
}

function keep(value: Ladder, expiresAt: number): Ladder {
  snapshot = { value, expiresAt };
  return value;
}

/**
 * The current seating: cached in this isolate, shared between isolates, and
 * read from the chain at most once per cache period for the whole Worker.
 *
 * Cloudflare runs many copies of this Worker at once, one per isolate, and a
 * cache in each one's memory meant each one read the chain for itself — as
 * many reads a period as there were busy copies, plus one for every copy that
 * had just started. So the first copy to read leaves the list in D1, and the
 * others take it from there until it is due; and inside one copy, requests
 * that arrive while a read is under way wait for that read rather than each
 * starting their own.
 *
 * A stale ladder is the failure worth having here. The alternative is reading
 * the indexer on every request to the directory, which would put somebody
 * else's rate limit in the path of reading your own inbox. A holder who has
 * just moved up a cabin waits up to one cache period for the view that comes
 * with it.
 */
export async function readLadder(env: LadderEnv): Promise<Ladder> {
  // Nothing to read holders with at all: an indexer, or the chain.
  if (!canSeat(env)) return NO_LADDER;
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot.value;
  reading ??= refresh(env).finally(() => { reading = null; });
  return reading;
}

async function refresh(env: LadderEnv): Promise<Ladder> {
  const ttl = cacheMs(env);
  const size = requestedSize(env);
  const shared = await readShared(env.DIRECTORY);
  // Another copy read it recently enough: take its word, and expire with it.
  if (shared && Date.now() - shared.readAt < ttl) {
    return keep(build(shared.holders, shared.supply, size), shared.readAt + ttl);
  }

  const list = await readHolderList({
    holdersUrl: env.HOLDERS_URL,
    rpcUrl: rpcUrl(env),
    mint: env.TOKEN_MINT,
    manifestSize: size,
  });
  if (!list) {
    /* An unreachable indexer is not evidence that anybody has moved. Keep the
       last good seating — this copy's, or failing that the shared one if it
       is not ancient; with neither, judge nobody rather than judging
       everybody to be in the hold — the second would quietly hand every card
       to whoever asked first. And try again shortly, not on every request:
       an endpoint that is refusing is not helped by being asked harder. */
    const fallback = snapshot?.value
      ?? (shared && Date.now() - shared.readAt < STALE_LIMIT_MS ? build(shared.holders, shared.supply, size) : NO_LADDER);
    return keep(fallback, Date.now() + Math.min(ttl, RETRY_MS));
  }

  const readAt = Date.now();
  await writeShared(env.DIRECTORY, list.holders, list.supply, readAt);
  return keep(build(list.holders, list.supply, size), readAt + ttl);
}

/* ── The shared seating ─────────────────────────────────────────────────
   One row in the directory's database: the holder list as last read, and
   when. Read on a copy's first request and whenever its own copy is due;
   written only after a real read of the chain, so at most once per cache
   period per copy that finds the row stale.

   The table is made on the first write, not on a read: a read of a missing
   table is simply no shared seating yet, so no request that only reads ever
   runs DDL. `migrations/0005_seating_cache.sql` is the same schema, for the
   record and for a database set up by hand. Any failure here is ignored —
   sharing is an economy, and the seating works without it exactly as it did
   before it existed. */
interface Shared { holders: Holder[]; supply: number; readAt: number }

async function readShared(db: D1Database | undefined): Promise<Shared | null> {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT body, read_at FROM seating_cache WHERE id = 1').first<{ body: string; read_at: number }>();
    if (!row) return null;
    const body = JSON.parse(row.body) as { holders?: unknown; supply?: unknown };
    if (!Array.isArray(body.holders) || typeof body.supply !== 'number') return null;
    const holders = body.holders.filter(
      (h): h is Holder => !!h && typeof (h as Holder).address === 'string' && Number.isFinite((h as Holder).balance),
    );
    return { holders, supply: body.supply, readAt: Number(row.read_at) };
  } catch {
    return null;
  }
}

async function writeShared(db: D1Database | undefined, holders: readonly Holder[], supply: number, readAt: number): Promise<void> {
  if (!db) return;
  const body = JSON.stringify({ holders, supply });
  const upsert = () => db
    .prepare(`INSERT INTO seating_cache (id, body, read_at) VALUES (1, ?1, ?2)
      ON CONFLICT(id) DO UPDATE SET body = excluded.body, read_at = excluded.read_at`)
    .bind(body, readAt)
    .run();
  try {
    await upsert();
  } catch {
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS seating_cache (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        body    TEXT NOT NULL,
        read_at INTEGER NOT NULL
      )`).run();
      await upsert();
    } catch {
      // Not shared this time; this copy still has its own.
    }
  }
}

/** Only for tests: forget the cached seating. */
export function forgetLadder(): void {
  snapshot = undefined;
  reading = null;
}

export { zoneRank };
