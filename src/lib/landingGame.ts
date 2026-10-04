/**
 * The landing page's turn at the controls.
 *
 * The aeroplane on the rest of the site flies the market and nobody steers
 * it. On the way in, somebody can: the arrow keys (or a drag on a touch
 * screen) put the nose up and down and bank it round, over the same country
 * the cabin windows look out on. The brief is to climb to 10,000 ft.
 *
 * Somewhere on the way up it goes wrong: at 10,000 ft on half the flights,
 * and anywhere from 4,000 ft on the rest. A voice outside shouts, the door
 * goes in, and one engine explodes — or, one flight in three, a bolt of
 * lightning hits it. From then on the aeroplane yaws and rolls toward the
 * dead engine, sinks on half its thrust, shakes, and answers the stick less
 * and less as the fire spreads — and once the fire has done its worst, it
 * starts on the wing. On about a third of flights the other engine follows
 * it. Now and then it flies into rising air, which gives a pilot with the
 * wings level a few seconds of climb and a stick that bites again. The
 * pilot gets three boosts: the engines still turning light their
 * afterburners for a few seconds, pushing it forward and buying lift
 * again. And the airline hangs bonus medallions in the air ahead, spinning
 * gold coins worth flying through. There is
 * no clock. It ends when it meets the ground, which for the best pilots is
 * about a minute later.
 *
 * This module is the state the page and the scene share, the numbers the
 * flying is tuned by, and the flying itself. It has no three.js in it, so
 * the page can hold it — and take keys and touches into it — before the
 * scene has loaded, and the tests can fly it without a screen.
 */

import { planUfo, UFO, type DodgeLock, type UfoPlan } from './ufo';
import { newAir, stepAir, type Air } from './thermals';
import { newLogos, stepLogos, type LogoAir } from './logos';

export type Phase = 'idle' | 'intro' | 'flying' | 'crashed';

/** What takes an engine: it lets go on its own, or lightning hits it. */
export type Cause = 'blast' | 'lightning';

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
  /** How the first engine goes, and how the second does if it goes too. */
  causes: [Cause, Cause];
  /** Seconds after the first engine that the second one goes: Infinity if it holds. */
  secondAfter: number;
  /** The second engine has gone too. */
  both: boolean;
  /** When it went, on `performance.now()`. */
  bothAt: number;
  /** 1 while the good engine pulls, down to 0 as it spools down once it has gone as well. */
  thrust: number;
  /** 0 in still air, up to about 1 in the middle of a thermal. */
  updraft: number;
  /** Seconds of boost still burning, once the button has been hit. */
  boostLeft: number;
  /** Boosts still to spend this flight. */
  boostCharges: number;
  /** 0–1, eased: how much boost is actually on, for the model and the flames. */
  boostLevel: number;
  /** The bonus medallions about: where they hang, and when the next turns up (see logos.ts). */
  logos: LogoAir;
  /** The thermals about: where they are, and when the next turns up (see thermals.ts). */
  air: Air;
  /** How fast the game's time runs against the clock's: 1, or less in slow motion. */
  slow: number;
  /** Seconds of game time since the controls were handed over. */
  clock: number;
  /** This flight's UFO, if it has one (see ufo.ts). */
  ufo: UfoPlan | null;
  /** The outer wing it took: -1 port, 1 starboard, 0 neither. */
  wingLost: -1 | 0 | 1;
  /** Where the aeroplane was when the UFO locked on, while its run lasts. */
  dodgeLock: DodgeLock | null;
  /** How far off its line the wingtip was when it arrived, metres right and up, and whether that was enough. */
  ufoMiss: { right: number; up: number } | null;
  dodged: boolean;
  /** Points paid for things done along the way: getting out of the UFO's way. */
  extra: number;
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
  /** The brief: the climb to here, feet above the ground — as the altimeter reads. */
  blastFeet: 10_000,
  /** Half the time the engine goes early, anywhere from here up. */
  earliestFeet: 4_000,
  earlyOdds: 0.5,
  /** How often it is lightning that takes an engine, rather than the engine itself. */
  lightningOdds: 1 / 3,
  /** Seconds into the lightning clip that the crack lands. */
  strikeAt: 0.58,
  /** How often the second engine goes too, and how long after the first. */
  secondOdds: 0.35,
  secondFrom: 12,
  secondTo: 30,
  /**
   * The boost: how many a flight gets, and how long each burns. The button
   * lights the engines that are still turning — the one that is left, or
   * both if none has gone — and for those seconds the aeroplane has thrust
   * to spend again.
   */
  boostCharges: 3,
  boostSeconds: 5,
  /** What a boost does to the thrust: this share of a healthy engine's, so the sink and the drag both go with it. */
  boostThrust: 2.0,
  /** Metres a second of climb a boost buys outright, on top of what the nose is doing. */
  boostClimb: 9,
  /** Metres a second squared the lit engines push it forward by. */
  boostPush: 6,
  /** How much faster it goes with both engines lit before anything has gone: a shove, not a second flight model. */
  boostShove: 1.25,
  /** Metres a second a thermal at full strength lifts a wings-level aeroplane. */
  draftLift: 73,
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

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const cause = (): Cause => (Math.random() < GAME.lightningOdds ? 'lightning' : 'blast');

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
  causes: ['blast', 'blast'],
  secondAfter: Infinity,
  both: false,
  bothAt: 0,
  thrust: 1,
  boostLeft: 0,
  boostCharges: GAME.boostCharges,
  boostLevel: 0,
  logos: newLogos(),
  updraft: 0,
  air: newAir(),
  slow: 1,
  clock: 0,
  ufo: null,
  wingLost: 0,
  dodgeLock: null,
  ufoMiss: null,
  dodged: false,
  extra: 0,
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

const asked = (flag: string) => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(flag);

/**
 * The height the brief names, metres above the ground: 10,000 ft, or 1,500
 * with `?mayday` on the address, for anybody who wants to get to it without
 * the climb.
 */
export function blastAltitude(): number {
  return (asked('mayday') ? 1_500 : GAME.blastFeet) / FEET;
}

/**
 * Where this flight's engine actually goes, what takes it, and whether the
 * other one follows: dealt as the controls are handed over. Half the time
 * it is the height the brief names; the rest, anywhere from 4,000 ft up to
 * it. `?strike` makes it lightning and `?dual` loses both, for anybody who
 * wants to see either.
 */
export function dealFailures(g: FlightGame): void {
  const brief = blastAltitude();
  const earliest = Math.min(brief, GAME.earliestFeet / FEET);
  g.blastAlt = Math.random() < GAME.earlyOdds ? between(earliest, brief - 500 / FEET) : brief;
  if (g.blastAlt < earliest) g.blastAlt = brief;
  g.causes = [asked('strike') ? 'lightning' : cause(), cause()];
  g.secondAfter = asked('dual') || Math.random() < GAME.secondOdds ? between(GAME.secondFrom, GAME.secondTo) : Infinity;
  g.air = newAir();
  g.boostLeft = 0;
  g.boostCharges = GAME.boostCharges;
  g.boostLevel = 0;
  g.logos = newLogos();
  g.clock = 0;
  g.wingLost = 0;
  g.dodgeLock = null;
  g.ufoMiss = null;
  g.dodged = false;
  g.extra = 0;
  g.ufo = asked('noufo') ? null : planUfo(asked('ufohit') ? 'hit' : asked('ufo') ? 'seen' : 'none');
}

/** Seconds into its warning clip that an engine goes, for what takes it. */
export const leadFor = (c: Cause): number => (c === 'lightning' ? GAME.strikeAt : GAME.blastAt);

/** Whether the bonus medallions are on this flight: `?nologo` flies without them. */
export const logosOn = (): boolean => !asked('nologo');

/**
 * Light the boost. The engines still turning — the one that is left, or
 * both if none has gone — burn for `GAME.boostSeconds`, pushing the
 * aeroplane forward and buying it lift again. Nothing to light with both
 * gone, none left to spend, or one already burning.
 */
export function fireBoost(g: FlightGame): boolean {
  if (g.phase !== 'flying' || g.both || g.boostCharges <= 0 || g.boostLeft > 0) return false;
  g.boostCharges -= 1;
  g.boostLeft = GAME.boostSeconds;
  return true;
}

/**
 * What the climb is worked out from, at a height: it grows with the height
 * so the climb to 10,000 ft takes half a minute, not two. It is not how fast
 * the ground goes by — see `airspeedAt`.
 */
export const speedAt = (height: number): number => Math.min(2200, Math.max(120, height * 0.15));

/**
 * The airspeed with both engines, metres a second, at a height above the
 * ground: an airliner's, a little faster as it climbs. This is what the
 * ground goes by at and what the airspeed dial reads, so low down, where
 * the same speed is a great deal more of the height every second, the
 * ground rushes past — and at 10,000 ft it drifts.
 */
export const airspeedAt = (agl: number): number => Math.min(150, 122 + Math.max(0, agl) * 0.012);

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
 *
 * A UFO can take the outer wing off one side: from then on the aeroplane
 * wants to roll toward the side that lost it — with both engines, a bank
 * the stick has to hold off; on one, a push the roll never loses — and it
 * sinks a little more.
 *
 * Two things change it. When the other engine goes too, the pull to one
 * side goes with its thrust — it is suddenly easier to hold level — but
 * there is nothing left to hold height or speed at all, and it comes down
 * a good deal faster. And rising air, now and then, lifts it: only as much
 * as the wings are level, so it is worth most to whoever is flying best,
 * and the smoother air over the wing gives the stick back some of its bite.
 */
export function fly(g: FlightGame, ix: number, iy: number, dt: number): { vs: number; stall: number } {
  // The boost burns down, and eases in and out rather than cutting.
  if (g.boostLeft > 0) g.boostLeft = Math.max(0, g.boostLeft - dt);
  const bl = g.boostLevel + ((g.boostLeft > 0 ? 1 : 0) - g.boostLevel) * (1 - Math.exp(-6 * dt));
  g.boostLevel = bl;
  const lost = g.wingLost;
  // In the UFO's slow motion the aeroplane answers the stick sharply and steadily: 0 normally, 1 in it.
  const assist = Math.min(1, Math.max(0, (1 - g.slow) / (1 - UFO.slow)));
  if (g.failed === 0) {
    g.pitch += (iy * GAME.maxPitch - g.pitch) * (1 - Math.exp(-3.2 * (1 + 1.5 * assist) * dt));
    // At the ceiling the nose will not come up any further.
    if (g.alt >= GAME.ceiling && g.pitch > 0) g.pitch *= 1 - Math.min(1, dt * 6);
    // A wing short: it banks toward the short side unless the stick holds it off.
    g.bank += (ix * GAME.maxBank + lost * 18 - g.bank) * (1 - Math.exp(-3.5 * (1 + 1.5 * assist) * dt));
    g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
    g.speed = speedAt(g.alt) * (1 + (GAME.boostShove - 1) * bl);
    g.rollRate = 0;
    const vs = Math.sin(g.pitch * DEG) * g.speed * GAME.climbGain + bl * GAME.boostClimb * 0.5 - Math.abs(lost) * 6;
    return { vs: Math.max(-GAME.maxClimb, Math.min(GAME.maxClimb, vs)), stall: 0 };
  }

  const dead = g.failed;
  // Rising air, and how much of it the wing catches: all of it level, little in a bank.
  // The thermals go by; the lift is whatever the aeroplane is flying through.
  const u = stepAir(g.air, dt, g.speed, g.heading, g.alt);
  g.updraft = u;
  // The medallions go by with the air, spinning where they hang.
  stepLogos(g.logos, dt, g.speed, g.heading, g.alt);
  const caught = Math.max(0, Math.cos(g.bank * DEG)) ** 3;
  // The fire takes twenty seconds to do its worst, then fifty more to take
  // the wing — and while a level wing rides rising air, the cool air over it
  // holds the fire back, and that clock all but stops.
  const burn = dt * (1 - 0.85 * u * caught);
  g.damage = Math.min(1, g.damage + burn / 40);
  const k = g.damage;
  g.decay = k >= 1 ? Math.min(1, g.decay + burn / 50) : 0;
  const w = g.decay;
  g.surge = drift(g.surge, 0.8, dt);
  g.buffetRoll = drift(g.buffetRoll, 10, dt);
  g.buffetPitch = drift(g.buffetPitch, 8, dt);
  // The other engine gone as well: its thrust spools down over three seconds.
  if (g.both) g.thrust = Math.max(0, g.thrust - dt / 3);
  // A boost on: the engines still turning make more than a healthy engine's.
  // The sink and the drag go with the thrust — and so, fairly, does the
  // good engine's pull toward the dead one.
  const t = g.thrust + bl * (GAME.boostThrust - 1);
  const glide = 1 - t;

  const stall = smoothstep(GAME.stallSpeed + 6, GAME.stallSpeed - 4, g.speed);
  // Roll: the stick drives the roll rate, with less to drive it as the fire
  // spreads and the wing goes; the dead engine, the spiral, the buffet and a
  // stall push it. Full stick outruns the push to begin with, only just
  // outruns it once the fire is at its worst, and loses to it as the wing goes.
  const authority = (0.7 - 0.3 * k) * (1 - 0.75 * stall) * (1 - 0.45 * w) * (1 + 0.5 * u) * (lost ? 0.88 : 1) * (1 + 0.8 * assist)
    * (1 + 0.5 * bl);
  const commanded = ix * 80 * authority;
  // The good engine's pull goes with its thrust — a boost on it pulls half
  // again as hard, which is the price of the shove — the burning wing's
  // does not; nor does a missing wingtip's.
  const tPush = g.thrust + bl * (GAME.boostThrust - 1) * 0.5;
  const push = dead * ((32 + 10 * k) * tPush + 30 * w) * (1 + 0.5 * g.surge) + lost * 24;
  g.rollRate += ((commanded - g.rollRate) * 2.6 + push + Math.sin(g.bank * DEG) * 55
    + g.buffetRoll * (40 + 60 * k + 20 * glide) * (1 - 0.35 * u) * (1 - 0.6 * assist) + dead * stall * 80) * dt;
  g.bank = wrap180(g.bank + g.rollRate * dt);
  const lift = Math.cos(g.bank * DEG);
  // Pitch: softer elevator, heavier nose; it falls in a bank, and drops outright in a stall.
  const aim = iy * GAME.maxPitch * (0.8 - 0.3 * k) - (1 - lift) * 18 - stall * 20 - 4 * k - 10 * w
    + g.buffetPitch * (2 + 4 * k);
  g.pitch += (aim - g.pitch) * (1 - Math.exp(-2.4 * dt));
  g.pitch = Math.max(-60, Math.min(20, g.pitch));
  // Heading: the bank turns it while the wing still lifts, and the good engine yaws it toward the dead one.
  g.heading = (g.heading + (g.bank * GAME.turnRate * Math.max(0, lift) + dead * (5 + 5 * k) * t) * dt + 360) % 360;
  const v = g.speed;
  // Height: what the pitch buys at this speed, less what half the thrust (or
  // none) and a burning wing cannot hold — a stalled one holds nothing —
  // less what a bank spills, plus whatever rising air a level wing catches.
  const sink = 10 + 18 * k + 24 * w + 22 * glide + stall * 40 + Math.abs(lost) * 5;
  const vs = v * Math.sin(g.pitch * DEG) - sink - (1 - lift) * v * 0.4
    + u * GAME.draftLift * Math.max(0, lift) ** 3 * (1 - 0.4 * w)
    + bl * GAME.boostClimb;
  // Speed: gravity along the flight path — the nose down is the only way to
  // buy it — against drag that grows with speed and with bank, and that no
  // thrust is left to cancel. A boost on: the lit engines shove it forward.
  const drag = (0.5 + 0.4 * k + 0.6 * w + 1.6 * glide) * (0.6 + 0.4 * (v / 130) ** 2) + Math.abs(Math.sin(g.bank * DEG)) * 3.5;
  g.speed = Math.max(45, Math.min(260, v + (-9.81 * Math.sin(g.pitch * DEG) - drag + bl * GAME.boostPush) * dt));
  return { vs, stall };
}
