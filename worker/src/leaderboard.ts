/**
 * The landing's leaderboard: what a posted score has to be before it is kept.
 *
 * Nothing Cloudflare-shaped in here, for the same reason `verify.ts` has
 * none: this decides what goes on a public board, so it should be testable
 * without a deployed service (see test/leaderboard.test.mjs).
 *
 * A post names a wallet, a run and a score, and carries the wallet's
 * signature over exactly those (see `scoreChallenge`): a message, never a
 * transaction. The signature proves who is posting. The run proves when the
 * flight started, because this server started it — and a score has to fit
 * the time since. See `src/lib/scoring.ts` for what that can and cannot stop.
 */
import { isAddress } from './networking';
import { SCORING, scoreCeiling } from '../../src/lib/scoring';

// The rules themselves, for the tests to hold the page's module to.
export { climbBonus, scoreChallenge, scoreCeiling, survivalRate, SCORING } from '../../src/lib/scoring';

/** How long after starting a run it can still be posted. */
export const RUN_TTL_MS = 30 * 60 * 1000;
/** Runs one address may start in an hour: far more than anybody plays. */
export const RUNS_PER_HOUR = 90;
/** How many the board shows. */
export const BOARD_SIZE = 20;

export interface ScorePost {
  address: string;
  run: string;
  score: number;
  /** Seconds in the air after the engine went; 0 if it never did. */
  survived: number;
  /** Seconds the climb to the blast altitude took; 0 if it was never reached. */
  climb: number;
  issued: string;
  signature: string;
}

/** A run id: 32 hex characters, from the server's own randomness. */
export function newRunId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isRunId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const finite = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** A post's shape, or what is wrong with it. */
export function readScorePost(body: unknown): ScorePost | string {
  if (!body || typeof body !== 'object') return 'That post was empty.';
  const b = body as Record<string, unknown>;
  if (!isAddress(b.address)) return 'That is not a Solana address.';
  if (!isRunId(b.run)) return 'That flight is not one this server started.';
  const score = finite(b.score, 0, 10_000_000);
  if (score === null || !Number.isInteger(score)) return 'That is not a score.';
  const survived = finite(b.survived, 0, SCORING.maxSurvival + 60);
  const climb = finite(b.climb, 0, 24 * 60 * 60);
  if (survived === null || climb === null) return 'That flight is missing its times.';
  if (typeof b.issued !== 'string' || typeof b.signature !== 'string' || !b.signature) {
    return 'That post is not signed.';
  }
  return { address: b.address, run: b.run, score, survived, climb, issued: b.issued, signature: b.signature };
}

/**
 * Whether a score could have been flown in the time the run has been going,
 * allowing for everything scoring.ts pays for — the UFO dodge's bonus among it —
 * or why not. `startedAt` and `now` are the server's own clock.
 */
export function implausible(post: ScorePost, startedAt: number, now: number): string | null {
  const elapsed = now - startedAt;
  if (elapsed < 0) return 'That flight has not started yet.';
  if (post.score > scoreCeiling(elapsed)) return 'That is more than the flight could have scored in the time it took.';
  const seconds = elapsed / 1000;
  // The engine can go as low as 4,000 ft, so as soon as the fastest climb to there.
  if (post.survived > Math.max(0, seconds - SCORING.firstFailure) + 5) return 'That flight lasted longer than the run did.';
  if (post.survived > 0 && post.climb < SCORING.firstFailure - 1) return 'Nobody climbs to the blast altitude that fast.';
  if (post.climb > seconds + 5) return 'That climb took longer than the run did.';
  return null;
}
