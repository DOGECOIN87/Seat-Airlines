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
 * and less as the fire spreads — and once the fire has done its worst, it
 * starts on the wing. There is no clock. It ends when it meets the ground,
 * which for the best pilots is about a minute later.
 *
 * This module is the state the page and the scene share, the numbers the
 * flying is tuned by, and the flying itself. It has no three.js in it, so
 * the page can hold it — and take keys and touches into it — before the
 * scene has loaded, and the tests can fly it without a screen.
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
  /** How fast the climb rate is changing, m/s², smoothed. */
  accel: number;
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
  /** 0 until the fire has done its worst, then up to 1 as it takes the wing: the roll it cannot hold. */
  decay: number;
  /** Airspeed, m/s: held by the engines until one of them is gone. */
  speed: number;
  /** Degrees a second of roll: once an engine is out, the roll has momentum. */
  rollRate: number;
  /** Band-limited noise, -1 to 1: the buffet in roll and pitch, and the fire surging. */
  buffetRoll: number;
  buffetPitch: number;
  surge: number;
  /** Points so far (see scoring.ts), and what they are building at. */
  score: number;
  rate: number;
  /** The best height reached before the engine went, feet. */
  bestFeet: number;
  /** Seconds the climb to the blast altitude took, and what reaching it paid. */
  climbTime: number;
  bonus: number;
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
  /**
   * The airspeed the blast leaves it with, m/s: an airliner's, not whatever
   * the height made the ground look like it was doing. From here there is
   * only the height and this to spend.
   */
  failSpeed: 130,
  /** Below this airspeed, on one engine, the wing quits. */
  stallSpeed: 95,
  /**
   * The crowd clip: seconds into it that the screaming cuts off — the
   * moment of impact — and how long before that the screaming starts.
   */
  crowdEnd: 15.4,
  crowdLead: 14.5,
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
  accel: 0,
  warned: false,
  warnedAt: 0,
  failed: 0,
  failedAt: 0,
  damage: 0,
  decay: 0,
  speed: 120,
  rollRate: 0,
  buffetRoll: 0,
  buffetPitch: 0,
  surge: 0,
  score: 0,
  rate: 0,
  bestFeet: 0,
  climbTime: 0,
  bonus: 0,
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

const DEG = Math.PI / 180;
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Band-limited noise: a random target, followed at a rate. */
const drift = (v: number, rate: number, dt: number) => v + (Math.random() * 2 - 1 - v) * (1 - Math.exp(-rate * dt));

/**
 * One frame of flying, both ways.
 *
 * With both engines it is the arcade model the landing always had: the
 * stick sets a pitch and a bank, the bank turns it, the pitch climbs it.
 *
 * With one gone it is the real thing, simplified. The good engine's thrust,
 * off to one side of the centreline, yaws the nose toward the dead one; the
 * sideslip that makes rolls it that way too, the wing on the good side
 * flying faster and lifting more. Nothing but the stick stops the roll, and
 * the ailerons are a hydraulic system short and getting weaker as the fire
 * spreads, so the roll has momentum here — the stick changes how fast it is
 * rolling, not where it is. A bank, once it has started, wants to go on
 * (the spiral), and costs lift, so the nose falls in it.
 *
 * And it cannot stay up. Half the thrust holds neither height nor speed:
 * it sinks whatever the stick does, the drag takes speed off even with the
 * wings level, and the only thing that puts speed back is the nose going
 * down — so height is spent either way, and there is only so much of it.
 * Pull up to stop the sink and the speed goes until the wing stalls: it
 * drops like a stone, the nose falls, and the dead side's wing drops with
 * it. A bank spills lift and adds drag, so every wobble costs height too.
 *
 * The fire is at its worst twenty seconds in, and then it starts on the
 * wing: the ailerons fade, the roll toward the dead side grows, the sink
 * with it, until somewhere around a minute in nobody could hold it level.
 * On top of all of it, the airframe shakes. The way to make that minute is
 * the way pilots are taught: bank a little toward the good engine, keep the
 * wings as level as the fire allows, and hold the speed just above the
 * stall — nose down for it, never up.
 */
export function fly(g: FlightGame, ix: number, iy: number, dt: number): { vs: number; stall: number } {
  if (g.failed === 0) {
    g.pitch += (iy * GAME.maxPitch - g.pitch) * (1 - Math.exp(-3.2 * dt));
    // At the ceiling the nose will not come up any further.
    if (g.alt >= GAME.ceiling && g.pitch > 0) g.pitch *= 1 - Math.min(1, dt * 6);
    g.bank += (ix * GAME.maxBank - g.bank) * (1 - Math.exp(-3.5 * dt));
    g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
    g.speed = speedAt(g.alt);
    g.rollRate = 0;
    const vs = Math.sin(g.pitch * DEG) * g.speed * GAME.climbGain;
    return { vs: Math.max(-GAME.maxClimb, Math.min(GAME.maxClimb, vs)), stall: 0 };
  }

  const dead = g.failed;
  // The fire takes twenty seconds to do its worst, then fifty more to take the wing.
  g.damage = Math.min(1, g.damage + dt / 40);
  const k = g.damage;
  g.decay = k >= 1 ? Math.min(1, g.decay + dt / 50) : 0;
  const w = g.decay;
  g.surge = drift(g.surge, 0.8, dt);
  g.buffetRoll = drift(g.buffetRoll, 10, dt);
  g.buffetPitch = drift(g.buffetPitch, 8, dt);

  const stall = smoothstep(GAME.stallSpeed + 6, GAME.stallSpeed - 4, g.speed);
  // Roll: the stick drives the roll rate, with less to drive it as the fire
  // spreads and the wing goes; the dead engine, the spiral, the buffet and a
  // stall push it. Full stick outruns the push to begin with, only just
  // outruns it once the fire is at its worst, and loses to it as the wing goes.
  const authority = (0.7 - 0.3 * k) * (1 - 0.75 * stall) * (1 - 0.45 * w);
  const commanded = ix * 80 * authority;
  const push = dead * (32 + 10 * k + 30 * w) * (1 + 0.5 * g.surge);
  g.rollRate += ((commanded - g.rollRate) * 2.6 + push + Math.sin(g.bank * DEG) * 55
    + g.buffetRoll * (40 + 60 * k) + dead * stall * 80) * dt;
  g.bank = wrap180(g.bank + g.rollRate * dt);
  const lift = Math.cos(g.bank * DEG);
  // Pitch: softer elevator, heavier nose; it falls in a bank, and drops outright in a stall.
  const aim = iy * GAME.maxPitch * (0.8 - 0.3 * k) - (1 - lift) * 18 - stall * 20 - 4 * k - 10 * w
    + g.buffetPitch * (2 + 4 * k);
  g.pitch += (aim - g.pitch) * (1 - Math.exp(-2.4 * dt));
  g.pitch = Math.max(-60, Math.min(20, g.pitch));
  // Heading: the bank turns it while the wing still lifts, and the good engine yaws it toward the dead one.
  g.heading = (g.heading + (g.bank * GAME.turnRate * Math.max(0, lift) + dead * (5 + 5 * k)) * dt + 360) % 360;
  const v = g.speed;
  // Height: what the pitch buys at this speed, less what half the thrust and
  // a burning wing cannot hold — a stalled one holds nothing — less what a
  // bank spills.
  const sink = 10 + 18 * k + 24 * w + stall * 40;
  const vs = v * Math.sin(g.pitch * DEG) - sink - (1 - lift) * v * 0.4;
  // Speed: gravity along the flight path — the nose down is the only way to
  // buy it — against drag that grows with speed and with bank, and that no
  // thrust is left to cancel.
  const drag = (0.5 + 0.4 * k + 0.6 * w) * (0.6 + 0.4 * (v / 130) ** 2) + Math.abs(Math.sin(g.bank * DEG)) * 3.5;
  g.speed = Math.max(45, Math.min(260, v + (-9.81 * Math.sin(g.pitch * DEG) - drag) * dt));
  return { vs, stall };
}
