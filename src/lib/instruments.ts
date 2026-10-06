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

/**
 * The saucer's dials, which read further: its velocity from a hover to a
 * dash, most of a turn on a log scale; its lift, squeezed like the vario's
 * but out to a vertical dash.
 */
export const UFO_SPEED_DIAL = { max: 6000, from: -150, sweep: 300 } as const;
export const ufoSpeedAngle = (kt: number): number =>
  UFO_SPEED_DIAL.from + UFO_SPEED_DIAL.sweep * Math.min(1, Math.max(0, Math.log1p(kt / 40) / Math.log1p(UFO_SPEED_DIAL.max / 40)));
export const ufoLiftAngle = (fpm: number): number => -90 + Math.sign(fpm) * 120 * (1 - Math.exp(-Math.abs(fpm) / 40000));
