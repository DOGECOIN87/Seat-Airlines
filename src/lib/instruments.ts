/**
 * The landing game's dials, as numbers: where a needle points for a
 * reading. Shared by the dials that are drawn (FlightInstruments) and the
 * scene that turns their needles (LandingScene), and kept apart from both
 * so the page can draw the dials without the chunk three.js comes in.
 */

/** Knots in a metre a second, and feet a minute. */
export const KNOTS = 1.944;
export const FPM = 196.85;

/** The airspeed dial: 0 to 400 kt round 270°, from the bottom left. */
export const SPEED_DIAL = { max: 400, from: -135, sweep: 270 } as const;
export const speedAngle = (kt: number): number =>
  SPEED_DIAL.from + SPEED_DIAL.sweep * Math.min(1, Math.max(0, kt / SPEED_DIAL.max));

/** The vertical speed dial: level at nine o'clock, up to 120° either way, squeezed so both a glide and a full climb read. */
export const varioAngle = (fpm: number): number => -90 + Math.sign(fpm) * 120 * (1 - Math.exp(-Math.abs(fpm) / 2600));
