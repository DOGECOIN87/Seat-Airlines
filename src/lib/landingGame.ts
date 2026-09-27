/**
 * The landing page's turn at the controls.
 *
 * The aeroplane on the rest of the site flies the market and nobody steers
 * it. On the way in, somebody can: the arrow keys (or a drag on a touch
 * screen) put the nose up and down and bank it round, over the same country
 * the cabin windows look out on. The brief is to climb to 10,000 ft.
 *
 * At 10,000 ft it goes wrong. A voice outside shouts, the door goes in, and
 * one engine explodes: from then on the aeroplane yaws and rolls toward the
 * dead engine, sinks on half its thrust, shakes, and answers the stick less
 * and less as the fire spreads. There is no clock. It ends when it meets
 * the ground.
 *
 * This module is the state the page and the scene share, and the numbers
 * the flying is tuned by. It has no three.js in it, so the page can hold it
 * — and take keys and touches into it — before the scene has loaded.
 */

export type Phase = 'idle' | 'intro' | 'flying' | 'crashed';

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
  /** Metres above the ground at which the engine goes. */
  blastAlt: number;
  /** Metres above the ground, and climbing at, as of the last frame. */
  agl: number;
  vs: number;
  /** The warning — the clip that ends in the bang — has started. */
  warned: boolean;
  /** When it started, on `performance.now()`. */
  warnedAt: number;
  /** Which engine went: -1 port, 1 starboard, 0 neither (yet). */
  failed: -1 | 0 | 1;
  /** When it went, on `performance.now()`. */
  failedAt: number;
  /** 0.5 at the blast to 1 as the fire takes hold: how badly it flies. */
  damage: number;
  /** Airspeed, m/s: held by the engines until one of them is gone. */
  speed: number;
  /** Degrees a second of roll: once an engine is out, the roll has momentum. */
  rollRate: number;
  /** Band-limited noise, -1 to 1: the buffet in roll and pitch, and the fire surging. */
  buffetRoll: number;
  buffetPitch: number;
  surge: number;
}

export const GAME = {
  /** The dive from cruise down to the deck before the controls are handed over. */
  introSeconds: 2.4,
  /** Where the dive levels out: low enough that the hills are a hazard. */
  startAlt: 430,
  /** No higher than this: well past the 10,000 ft the flight is about, up through the cloud deck at 2,400 m. */
  ceiling: 4600,
  /** Closer to the ground than this and the engines are in the trees. */
  clearance: 12,
  /** Degrees of nose-up or nose-down at full stick. */
  maxPitch: 14,
  /** Degrees of bank at full stick. */
  maxBank: 38,
  /** Degrees of heading a second, per degree of bank. */
  turnRate: 0.42,
  /** Climb and sink faster than the real thing would, so the climb to 10,000 ft is half a minute. */
  climbGain: 1.7,
  /** Metres a second, up or down, however fast the ground is going by. */
  maxClimb: 130,
  /** Where the engine goes, feet above the ground — as the altimeter reads. */
  blastFeet: 10_000,
  /**
   * Seconds into the warning clip that the bang lands. The engine goes on
   * the clip's own clock, so the fireball and the bang are the same moment.
   */
  blastAt: 2.36,
  /** One engine flies it at an airliner's speed, not at whatever the height would make it look like. */
  failSpeed: 150,
  /** Below this airspeed, on one engine, the wing quits. */
  stallSpeed: 95,
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
  blastAlt: GAME.blastFeet / FEET,
  agl: 0,
  vs: 0,
  warned: false,
  warnedAt: 0,
  failed: 0,
  failedAt: 0,
  damage: 0,
  speed: 120,
  rollRate: 0,
  buffetRoll: 0,
  buffetPitch: 0,
  surge: 0,
});

/** Feet in a metre. */
export const FEET = 3.281;

/**
 * Seconds after the crash that WASTED lands: on the big hit in the crash
 * sound. The red, the word and the dolly zoom all start here (the page's
 * stylesheet times the first two to it as well).
 */
export const WASTED_AT = 1.25;

/**
 * Where this flight's engine goes, metres above the ground: 10,000 ft, or
 * 1,500 with `?mayday` on the address, for anybody who wants to get to it
 * without the climb.
 */
export function blastAltitude(): number {
  const soon = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mayday');
  return (soon ? 1_500 : GAME.blastFeet) / FEET;
}

/** Ground speed at a height, as the scene flies it: v/h held constant, floored and capped. */
export const speedAt = (height: number): number => Math.min(2200, Math.max(120, height * 0.15));

export const clampUnit = (v: number): number => Math.max(-1, Math.min(1, v));
