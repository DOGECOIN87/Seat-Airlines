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
import { xLink } from './xPost';

export interface BoardEntry {
  address: string;
  score: number;
  survived: number;
  climb: number;
  postedAt: number;
  /** The X account the pilot was connected to when they posted, if any. */
  x?: { username: string; avatar: string | null };
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

/**
 * The board as last read, and when. The landing reads it on the way in, so
 * the high scores opened a minute later need not ask the Worker again.
 */
let lastBoard: { rows: BoardEntry[]; at: number } | null = null;

/** The board, best first; null when there is none to be had. */
export async function fetchBoard(signal?: AbortSignal): Promise<BoardEntry[] | null> {
  if (!hasBoard) return null;
  try {
    const res = await fetch(`${WORKER_API}/scores`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { scores?: BoardEntry[] };
    if (!Array.isArray(body.scores)) return null;
    lastBoard = { rows: body.scores, at: Date.now() };
    return body.scores;
  } catch {
    return null;
  }
}

/** The board as last read, when that was recent enough to show as it stands. */
export function recentBoard(maxAge = 60_000): BoardEntry[] | null {
  return lastBoard && Date.now() - lastBoard.at < maxAge ? lastBoard.rows : null;
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
  // Connected to X? Its handle goes along, and the board shows the account beside the score.
  const x = xLink();
  const res = await fetch(`${WORKER_API}/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(x ? { authorization: `Bearer ${x.handle}` } : {}) },
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

/**
 * This browser's own best, kept whether or not it is ever posted.
 *
 * Here rather than in the landing because the landing is not the only place
 * that reads it: the high scores open from inside the site too.
 */
const BEST_KEY = 'sa.game.best';
export const readBest = (): number => {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
export const keepBest = (score: number) => {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* Nowhere to keep it. */
  }
};
