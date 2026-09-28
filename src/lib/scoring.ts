/**
 * How the landing's flight is scored, and how far a score can be believed.
 *
 * Both sides import this, the way they share the seating: the page to add
 * the points up while somebody flies, the Worker to decide whether a score
 * posted to the leaderboard could have been flown at all. One set of numbers
 * in one place, so the two cannot drift apart about what is possible.
 *
 * ── The score ─────────────────────────────────────────────────────────────
 * Before the engine goes, a tenth of a point per foot of the best height
 * reached. Reaching the blast altitude is worth a flat bonus, and reaching
 * it quickly is worth more: forty points for every second under a par of
 * seventy-five — for the whole 10,000 ft, and in proportion when the engine
 * goes early, so a fast climb pays the same by the foot. After that, the points are for staying in the air — a
 * hundred a second, and more for doing it well or dangerously: half again
 * with the wings within twenty degrees of level (which, on one engine, is
 * the skill), and double with the ground under five hundred feet (which is
 * the nerve). Both at once is two and a half times.
 *
 * ── What can be believed ──────────────────────────────────────────────────
 * The game runs in the visitor's browser, so a score is a claim. The Worker
 * times every run itself, from the moment the controls are taken, and a
 * score cannot be more than that much time could have earned at the best
 * possible rate, after the fastest possible climb. That stops a made-up
 * number; it cannot stop somebody patient enough to wait out the time their
 * made-up number needs. It is a leaderboard for bragging, not for prizes.
 */

export const SCORING = {
  /** Points per foot of height reached before the engine goes. */
  perFoot: 0.1,
  /** The most those can come to: the game's ceiling is 4,600 m, a little over 15,000 ft. */
  maxHeightPoints: 1600,
  /** For reaching the blast altitude at all. */
  reached: 1000,
  /** The climb bonus runs out at this many seconds. */
  climbPar: 75,
  /** Points per second the climb beats par by. */
  climbPerSecond: 40,
  /** No climb to 10,000 ft can be faster than this, at the game's best climb rate. */
  climbFloor: 18,
  /**
   * And no engine can go sooner than this after the controls are handed
   * over: the fastest climb there is to the lowest it can go, 4,000 ft.
   */
  firstFailure: 6,
  /** Points a second, in the air on one engine. */
  perSecond: 100,
  /** Added to the rate while the wings are within `levelWithin` degrees of level. */
  level: 0.5,
  levelWithin: 20,
  /** Added to the rate while the ground is under `lowFeet`. */
  low: 1,
  lowFeet: 500,
  /** The dive from cruise to the deck before the controls are handed over, seconds. */
  intro: 2.4,
  /** Longer than any flight on one engine could last: it sinks the whole time. */
  maxSurvival: 900,
} as const;

/** The best rate there is: level and low at once. */
export const MAX_RATE = SCORING.perSecond * (1 + SCORING.level + SCORING.low);

/**
 * The bonus for reaching the blast altitude in this many seconds, when it
 * is `share` of the 10,000 ft brief: par and floor both come down with it.
 */
export function climbBonus(seconds: number, share = 1): number {
  const s = Math.min(1, Math.max(0, share));
  const t = Math.max(SCORING.climbFloor * s, seconds);
  return Math.max(0, Math.round((SCORING.climbPar * s - t) * SCORING.climbPerSecond));
}

/** The rate points build at on one engine: wings level and ground close both pay. */
export function survivalRate(bankDegrees: number, feetAboveGround: number): number {
  let rate = 1;
  if (Math.abs(bankDegrees) < SCORING.levelWithin) rate += SCORING.level;
  if (feetAboveGround < SCORING.lowFeet) rate += SCORING.low;
  return SCORING.perSecond * rate;
}

/**
 * The most a run could honestly score in `elapsedMs` of real time since the
 * controls were taken. Before the earliest an engine could go, only height
 * points; after it, those, the whole reach bonus, the best climb bonus, and
 * every second since at the best rate there is — each with ten per cent and
 * a few hundred points of slack for clocks and rounding.
 */
export function scoreCeiling(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs / 1000);
  const slack = (points: number) => Math.round(points * 1.1 + 300);
  if (seconds < SCORING.firstFailure) return slack(SCORING.maxHeightPoints);
  const flying = Math.min(SCORING.maxSurvival, seconds - SCORING.firstFailure);
  return slack(SCORING.maxHeightPoints + SCORING.reached + climbBonus(SCORING.climbFloor) + flying * MAX_RATE);
}

/** What the wallet signs to post a score. Readable on purpose: it is what the wallet shows. */
export function scoreChallenge(address: string, run: string, score: number, issued: string): string {
  return [
    'SEAT AIRLINES',
    'Post my score to the landing leaderboard.',
    '',
    `Score: ${score}`,
    `Run: ${run}`,
    `Wallet: ${address}`,
    `Issued: ${issued}`,
    '',
    'This is a message, not a transaction: it moves nothing and approves nothing.',
  ].join('\n');
}
