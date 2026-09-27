/**
 * The landing's leaderboard, on the Worker.
 *
 * Three calls: the board, starting a run, and posting a score. Starting a
 * run asks nothing of anybody — it is the server noting the time, which is
 * what lets it judge a score later (see `scoring.ts`). Posting asks the
 * wallet to sign a short message naming the score: a message, never a
 * transaction.
 */
import { WORKER_API } from './networkingApi';
import { scoreChallenge } from './scoring';

export interface BoardEntry {
  address: string;
  score: number;
  survived: number;
  climb: number;
  postedAt: number;
}

export interface Posted {
  /** The wallet's best, after this post. */
  best: number;
  /** Where that best stands on the board. */
  rank: number | null;
  /** This post was the wallet's new best. */
  improved: boolean;
}

/** True when this deployment has a Worker to keep a board on. */
export const hasBoard = Boolean(WORKER_API);

/** The board, best first; null when there is none to be had. */
export async function fetchBoard(signal?: AbortSignal): Promise<BoardEntry[] | null> {
  if (!hasBoard) return null;
  try {
    const res = await fetch(`${WORKER_API}/scores`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { scores?: BoardEntry[] };
    return Array.isArray(body.scores) ? body.scores : null;
  } catch {
    return null;
  }
}

/** Start a run on the server, which times it; null when the board is out of reach. */
export async function startRun(): Promise<string | null> {
  if (!hasBoard) return null;
  try {
    const res = await fetch(`${WORKER_API}/runs`, { method: 'POST' });
    if (!res.ok) return null;
    const body = (await res.json()) as { run?: string };
    return typeof body.run === 'string' ? body.run : null;
  } catch {
    return null;
  }
}

/**
 * Sign and post a score. Throws with the server's own words when it says no,
 * or with the wallet's when the signature is refused.
 */
export async function postScore(p: {
  address: string;
  run: string;
  score: number;
  survived: number;
  climb: number;
  sign: (message: string) => Promise<string>;
}): Promise<Posted> {
  const issued = new Date().toISOString();
  const signature = await p.sign(scoreChallenge(p.address, p.run, p.score, issued));
  const res = await fetch(`${WORKER_API}/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      address: p.address, run: p.run, score: p.score, survived: p.survived, climb: p.climb, issued, signature,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<Posted> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'The leaderboard could not take that score.');
  return { best: body.best ?? p.score, rank: body.rank ?? null, improved: Boolean(body.improved) };
}

/** A wallet as the board shows it: the ends, not the middle. */
export const shortWallet = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
