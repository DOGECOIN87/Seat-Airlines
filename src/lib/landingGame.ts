/**
 * The landing page's minute at the controls.
 *
 * The aeroplane on the rest of the site flies the market and nobody steers
 * it. On the way in, for one minute, somebody can: the arrow keys (or a drag
 * on a touch screen) put the nose up and down and bank it round, over the
 * same country the cabin windows look out on. Fly it into the ground and the
 * minute is over early.
 *
 * This module is the state the page and the scene share, and the numbers
 * the flying is tuned by. It has no three.js in it, so the page can hold it
 * — and take keys and touches into it — before the scene has loaded.
 */

export type Phase = 'idle' | 'intro' | 'flying' | 'crashed' | 'timeup';

/** -1 to 1 on each axis: x banks right, y climbs. */
export interface Stick {
  x: number;
  y: number;
}

export interface FlightGame {
  phase: Phase;
  /** When the phase began, on `performance.now()`. */
  phaseAt: number;
  /** What the keys are asking for. */
  keys: Stick;
  /** What a drag on the screen is asking for. */
  stick: Stick;
  /** Metres above the ground's datum. */
  alt: number;
  /** Where the dive onto the deck starts from. */
  from: number;
  pitch: number;
  bank: number;
  heading: number;
  /** Metres flown since the controls were handed over. */
  distance: number;
  /** The last frame, on `performance.now()`. */
  last: number;
}

export const GAME = {
  /** How long the controls are yours. */
  seconds: 60,
  /** The dive from cruise down to the deck before the controls are handed over. */
  introSeconds: 2.4,
  /** Where the dive levels out: low enough that the hills are a hazard. */
  startAlt: 430,
  /** No higher than this: the cloud deck is at 2,400 m. */
  ceiling: 1900,
  /** Closer to the ground than this and the engines are in the trees. */
  clearance: 12,
  /** Degrees of nose-up or nose-down at full stick. */
  maxPitch: 12,
  /** Degrees of bank at full stick. */
  maxBank: 38,
  /** Degrees of heading a second, per degree of bank. */
  turnRate: 0.42,
  /** Climb and sink faster than the real thing would, so a minute is enough. */
  climbGain: 1.7,
} as const;

export const newGame = (): FlightGame => ({
  phase: 'idle',
  phaseAt: 0,
  keys: { x: 0, y: 0 },
  stick: { x: 0, y: 0 },
  alt: GAME.startAlt,
  from: GAME.startAlt,
  pitch: 0,
  bank: 0,
  heading: 0,
  distance: 0,
  last: 0,
});

/** Ground speed at a height, as the scene flies it: v/h held constant, floored and capped. */
export const speedAt = (height: number): number => Math.min(2200, Math.max(120, height * 0.15));

export const clampUnit = (v: number): number => Math.max(-1, Math.min(1, v));
