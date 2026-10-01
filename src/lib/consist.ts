/**
 * The train's consist, read off the market.
 *
 * Market cap is not altitude on the railway — it is length. The train couples
 * a carriage at every step of the 1-2-5 series from $10K up: $10K, $20K, $50K,
 * $100K, $200K, $500K, $1M and so on to $200M. Each carriage is therefore a
 * milestone with a round number on it, the train roughly doubles in length
 * every decade of market cap, and at a glance the length of the train *is*
 * the size of the market.
 *
 * Below $10K the locomotive runs light (no carriages). Past the last step the
 * train stops growing: fourteen carriages is already a quarter of a mile.
 *
 * The grade comes from the five-minute move instead, through the same pitch
 * the aeroplane used: the line ahead is laid at whatever grade the market is
 * at as it is laid, so the track the train has run over is the chart.
 *
 * Pure functions only, so both the scene and the tests can use them.
 */

/** Market caps at which a carriage is coupled on, in dollars. */
export const CARRIAGE_STEPS: readonly number[] = (() => {
  const steps: number[] = [];
  for (let decade = 10_000; steps.length < 14; decade *= 10) {
    for (const m of [1, 2, 5]) {
      if (steps.length < 14) steps.push(decade * m);
    }
  }
  return steps;
})();

/** The longest the train gets. */
export const MAX_CARRIAGES = CARRIAGE_STEPS.length;

/** How many carriages the market has earned. */
export function carriagesFor(marketCap: number): number {
  if (!Number.isFinite(marketCap)) return 0;
  let n = 0;
  while (n < CARRIAGE_STEPS.length && marketCap >= CARRIAGE_STEPS[n]) n++;
  return n;
}

/** The market cap the next carriage is coupled at, or null when the train is as long as it gets. */
export function nextCarriageAt(marketCap: number): number | null {
  const n = carriagesFor(marketCap);
  return n < CARRIAGE_STEPS.length ? CARRIAGE_STEPS[n] : null;
}

/**
 * 0–1 of the way from the last carriage's step to the next one, on a log
 * scale — for a coupling gauge, or how far the next carriage has rolled up.
 */
export function towardNextCarriage(marketCap: number): number {
  const n = carriagesFor(marketCap);
  if (n >= CARRIAGE_STEPS.length) return 1;
  const lo = n === 0 ? CARRIAGE_STEPS[0] / 2 : CARRIAGE_STEPS[n - 1];
  const hi = CARRIAGE_STEPS[n];
  if (marketCap <= lo) return 0;
  return Math.max(0, Math.min(1, Math.log(marketCap / lo) / Math.log(hi / lo)));
}

/** Most the line is ever graded, in degrees. Steep for a railway, plain on screen. */
export const MAX_GRADE = 4.5;

/**
 * Degrees of grade for the aeroplane's pitch — itself the five-minute move
 * on a log curve (see `pitchFor`). A rising market lays the line uphill.
 */
export function gradeFor(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(-MAX_GRADE, Math.min(MAX_GRADE, pitch * 0.2));
}

/** Track speed in metres a second, from the aeroplane's indicated knots. */
export function trainSpeedFor(knots: number): number {
  if (!Number.isFinite(knots)) return 40;
  // 212 kt (a quiet market) is a brisk 160 km/h; conviction either way runs to about 320.
  return Math.max(20, Math.min(95, 44 + (knots - 212) * 0.11));
}
