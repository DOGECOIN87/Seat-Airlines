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
 * wings level a few seconds of climb and a stick that bites again. There is
 * no clock. It ends when it meets the ground, which for the best pilots is
 * about a minute later.
 *
 * This module is the state the page and the scene share, the numbers the
 * flying is tuned by, and the flying itself. It has no three.js in it, so
 * the page can hold it — and take keys and touches into it — before the
 * scene has loaded, and the tests can fly it without a screen.
 */

import { planUfo, UFO, type DodgeLock, type UfoPlan } from './ufo';
import { newAir, startAir, stepAir, type Air } from './thermals';
import { newLogos, type LogoField } from './logos';
import { newRams, RAMMER, type RamField } from './rammer';
import { newTwisters, type TwisterField } from './tornado';

export type Phase = 'idle' | 'intro' | 'flying' | 'crashed';
export type FlightMode = 'airliner' | 'ufo';
/**
 * How the saucer's stick moves it, chosen on the selector that is the
 * airliner's flaps: flown like an aircraft, nose and bank; straight up and
 * down, turning where it hangs; or sliding sideways, the stick's up and
 * down for its speed.
 */
export type Drive = 'forward' | 'vertical' | 'strafe';
export const DRIVES: readonly Drive[] = ['forward', 'vertical', 'strafe'];
/** Which way a dash goes: the stick's way, snapped to one of five. */
export type DashDir = 'forward' | 'up' | 'down' | 'left' | 'right';

/** Feet in a metre. */
export const FEET = 3.281;
/** The ultimate ceiling: Mars is possible, but not a routine flight. */
export const MARS_FEET = 100_000_000;

/** What takes an engine: it lets go on its own, or lightning hits it. */
export type Cause = 'blast' | 'lightning';

/** The weather a flight is dealt: it decides how rough the air is, and how often lightning takes an engine. */
/** The weather a flight is dealt; a tornado is a storm that has reached the ground. */
export type GameWeather = 'clear' | 'rain' | 'storm' | 'tornado';

/** -1 to 1 on each axis: x banks right, y climbs. */
export interface Stick {
  x: number;
  y: number;
}

export interface FlightGame {
  phase: Phase;
  /** The aircraft loadout: the flagship or the experimental saucer. */
  mode: FlightMode;
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
  /** Trailing-edge flaps, in three useful detents: 0, half and full. */
  flaps: number;
  /** The saucer's drive mode (see Drive). */
  drive: Drive;
  /** The stick as `fly` last read it, gamepad and all: a dash goes its way. */
  input: Stick;
  /** The saucer's sideways speed, m/s, right positive, before any dash. */
  strafe: number;
  /** The saucer's climb rate in the vertical drive, m/s, eased toward the stick's. */
  lift: number;
  /** The way the dash under way is going, or the last one went. */
  dash: DashDir;
  /** 0–1: how scrambled the saucer's field is by an airliner hitting it. */
  scramble: number;
  /** The airliners coming for the saucer (see rammer.ts). */
  rams: RamField;
  /** In tornado weather, the funnels about (see tornado.ts). */
  twisters: TwisterField;
  /** Band-limited noise, -1 to 1: the buffet in roll and pitch, and the fire surging. */
  buffetRoll: number;
  buffetPitch: number;
  surge: number;
  /** Seconds of afterburner left in the burn under way: 0 when there is none. */
  boost: number;
  /** 0–1: how hard the afterburners are lit, eased in and out. */
  boostPower: number;
  /** Burns in the tank, up to BOOST.charges: it refills on its own, and with every logo. */
  boosts: number;
  /** The logos about (see logos.ts). */
  logos: LogoField;
  /** The weather this flight is flown in. */
  weather: GameWeather;
  /** Band-limited noise, -1 to 1: the gusts the weather throws at it. */
  gustRoll: number;
  gustLift: number;
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
  /** No higher than this: Mars is the hard ceiling, not the normal engine-out brief. */
  ceiling: MARS_FEET / FEET,
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
  /** Metres a second a thermal at full strength lifts a wings-level aeroplane. */
  draftLift: 90,
  /** And how much of that it gives before anything has gone wrong, when it only helps the climb. */
  draftClimb: 0.6,
  /** How often the weather is tornadoes, a storm, or rain; clear the rest of the time. */
  tornadoOdds: 0.12,
  stormOdds: 0.3,
  rainOdds: 0.25,
  /** In a storm, lightning takes the engine this often. */
  stormLightningOdds: 0.65,
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

/** The afterburners: what one press buys. */
export const BOOST = {
  /** Seconds a burn lasts. */
  seconds: 4.5,
  /** Burns in a full tank, and seconds to put one back on its own. */
  charges: 3,
  recharge: 9,
  /** What a logo puts back. */
  perLogo: 0.5,
  /** Metres a second the climb gains at full burn, with both engines and after. */
  climb: 85,
  lift: 95,
  /** Metres a second of ground speed added with both engines; m/s² of airspeed after. */
  dash: 140,
  accel: 55,
  /** The climb a burn allows past the usual limit. */
  extraClimb: 110,
} as const;

/**
 * The saucer's dash: what the boost is on it. Short, and faster than
 * anything with wings: the way it is going is the stick's, snapped to
 * straight ahead, straight up or down, or straight out to one side.
 */
export const DASH = {
  seconds: 0.8,
  /** Metres a second it adds, at full power, each way. */
  forward: 2600,
  vertical: 1000,
  strafe: 1500,
  /** Less stick than this, either way, and it goes straight ahead. */
  deadZone: 0.3,
  /** A dash down stops short of the ground: metres it holds off at. */
  floor: 30,
} as const;

/** How rough the air is, 0–1, in each weather. */
export const TURBULENCE: Record<GameWeather, number> = { clear: 0.12, rain: 0.5, storm: 1, tornado: 1.25 };

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const cause = (w: GameWeather = 'clear'): Cause =>
  Math.random() < (w === 'storm' || w === 'tornado' ? GAME.stormLightningOdds : GAME.lightningOdds) ? 'lightning' : 'blast';

export const newGame = (mode: FlightMode = 'airliner'): FlightGame => ({
  phase: 'idle',
  mode,
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
  flaps: 0,
  drive: 'forward',
  input: { x: 0, y: 0 },
  strafe: 0,
  lift: 0,
  dash: 'forward',
  scramble: 0,
  rams: newRams(),
  twisters: newTwisters(),
  buffetRoll: 0,
  buffetPitch: 0,
  surge: 0,
  boost: 0,
  boostPower: 0,
  boosts: BOOST.charges,
  logos: newLogos(),
  weather: 'clear',
  gustRoll: 0,
  gustLift: 0,
  score: 0,
  rate: 0,
  bestFeet: 0,
  climbTime: 0,
  bonus: 0,
});

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
  g.blastAlt = g.mode === 'ufo'
    ? GAME.ceiling
    : Math.random() < GAME.earlyOdds ? between(earliest, brief - 500 / FEET) : brief;
  if (g.blastAlt < earliest) g.blastAlt = brief;
  g.causes = [asked('strike') ? 'lightning' : cause(g.weather), cause(g.weather)];
  g.secondAfter = g.mode === 'ufo' ? Infinity : asked('dual') || Math.random() < GAME.secondOdds ? between(GAME.secondFrom, GAME.secondTo) : Infinity;
  g.air = newAir();
  // Rising air from the start: it helps the climb, and it is worth more once it matters.
  startAir(g.air);
  g.logos = newLogos();
  g.boost = 0;
  g.boostPower = 0;
  g.boosts = BOOST.charges;
  g.gustRoll = 0;
  g.gustLift = 0;
  g.clock = 0;
  g.wingLost = 0;
  g.dodgeLock = null;
  g.ufoMiss = null;
  g.dodged = false;
  g.extra = 0;
  g.ufo = g.mode === 'ufo' || asked('noufo') ? null : planUfo(asked('ufohit') ? 'hit' : asked('ufo') ? 'seen' : 'none');
  g.rams = newRams();
  g.twisters = newTwisters();
  // `?ram` on the address: the first airliner straight away, for anybody testing the saucer.
  if (asked('ram')) g.rams.next = 1;
  g.scramble = 0;
}

/**
 * The weather the flight is flown in, dealt as the controls are taken so the
 * dive is already in it: tornadoes, a storm, rain, or clear air. `?tornado`,
 * `?storm`, `?rain` and `?clear` pick one.
 */
export function dealWeather(g: FlightGame): void {
  const roll = Math.random();
  const t = GAME.tornadoOdds;
  g.weather = asked('tornado') ? 'tornado' : asked('storm') ? 'storm' : asked('rain') ? 'rain' : asked('clear') ? 'clear'
    : roll < t ? 'tornado' : roll < t + GAME.stormOdds ? 'storm' : roll < t + GAME.stormOdds + GAME.rainOdds ? 'rain' : 'clear';
}

/** Seconds into its warning clip that an engine goes, for what takes it. */
export const leadFor = (c: Cause): number => (c === 'lightning' ? GAME.strikeAt : GAME.blastAt);

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

/** The saucer's dash, as metres a second ahead, to the right and up, at the power it is at. */
export function dashVelocity(g: FlightGame): { ahead: number; right: number; up: number } {
  const p = g.mode === 'ufo' ? g.boostPower : 0;
  if (p < 1e-3) return { ahead: 0, right: 0, up: 0 };
  switch (g.dash) {
    case 'up': return { ahead: 0, right: 0, up: DASH.vertical * p };
    // Straight down, braking as the ground comes up: it holds off at DASH.floor.
    case 'down': return { ahead: 0, right: 0, up: -Math.min(DASH.vertical * p, Math.max(0, g.agl - DASH.floor) * 6) };
    case 'left': return { ahead: 0, right: -DASH.strafe * p, up: 0 };
    case 'right': return { ahead: 0, right: DASH.strafe * p, up: 0 };
    default: return { ahead: DASH.forward * p, right: 0, up: 0 };
  }
}

/** What the ground goes by at: the airspeed, and with both engines whatever a burn adds to it. */
export const groundSpeed = (g: FlightGame): number =>
  g.mode === 'ufo' ? g.speed + dashVelocity(g).ahead : g.failed ? g.speed : airspeedAt(g.agl) + BOOST.dash * g.boostPower;

/**
 * Over the ground: how fast, and which way. The same as the speed and the
 * heading for anything with wings; the saucer can slide sideways too.
 */
export function travel(g: FlightGame): { speed: number; heading: number } {
  const ahead = groundSpeed(g);
  const right = g.mode === 'ufo' ? g.strafe + dashVelocity(g).right : 0;
  if (Math.abs(right) < 1e-3) return { speed: ahead, heading: g.heading };
  return {
    speed: Math.hypot(ahead, right),
    heading: (g.heading + Math.atan2(right, ahead) / DEG + 360) % 360,
  };
}

/** Which way a dash fired now would go: the stick's way, snapped to an axis; no stick, straight ahead. */
export function dashFor(stick: Stick): DashDir {
  const ax = Math.abs(stick.x);
  const ay = Math.abs(stick.y);
  if (Math.max(ax, ay) < DASH.deadZone) return 'forward';
  if (ay >= ax) return stick.y > 0 ? 'up' : 'down';
  return stick.x > 0 ? 'right' : 'left';
}

/** The saucer's next drive mode, round the three. */
export function cycleDrive(g: FlightGame): Drive {
  g.drive = DRIVES[(DRIVES.indexOf(g.drive) + 1) % DRIVES.length];
  return g.drive;
}

/** Light the afterburners, if there is a burn in the tank and one is not already going. */
export function fireBoost(g: FlightGame): boolean {
  if (g.phase !== 'flying' || g.boost > 0 || g.boosts < 1) return false;
  g.boosts -= 1;
  if (g.mode === 'ufo') {
    g.dash = dashFor(g.input);
    g.boost = DASH.seconds;
  } else {
    g.boost = BOOST.seconds;
  }
  return true;
}

/** The burn running down, the tank filling, and the flames easing in fast and out slower. */
export function stepBoost(g: FlightGame, dt: number): void {
  g.boost = Math.max(0, g.boost - dt);
  if (g.boost === 0) g.boosts = Math.min(BOOST.charges, g.boosts + dt / BOOST.recharge);
  const want = g.boost > 0 ? 1 : 0;
  // The saucer's dash is on and off like a switch; an afterburner lights and dies down.
  const rate = g.mode === 'ufo' ? (want ? 22 : 7) : want ? 7 : 2.2;
  g.boostPower += (want - g.boostPower) * (1 - Math.exp(-rate * dt));
}

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
/**
 * The saucer, flown. Not an airliner with a different skin: its pulse field
 * constantly bends the flight line, so good pilots surf the pulse and timid
 * inputs get thrown about. The drive mode decides what the stick does (see
 * Drive); a dash, whichever way it goes, goes on top of all of it.
 *
 * An airliner hitting it scrambles the field: the stick turns away from the
 * way it is pushed, by up to most of a half-turn and back, it shakes, the
 * saucer spins and sinks, and the answer to the stick goes soft — wearing
 * off over several seconds.
 */
function flySaucer(g: FlightGame, ix0: number, iy0: number, dt: number, rough: number): { vs: number; stall: number } {
  const t = travel(g);
  const u = stepAir(g.air, dt, t.speed, t.heading, g.alt);
  g.updraft = u;
  g.scramble = Math.max(0, g.scramble - dt / RAMMER.scrambleSeconds);
  const sc = g.scramble;
  const twist = sc * Math.PI * 0.85 * Math.sin(g.clock * 1.7 + 0.6);
  const ix = clampUnit(ix0 * Math.cos(twist) - iy0 * Math.sin(twist) + sc * 0.55 * Math.sin(g.clock * 7.3));
  const iy = clampUnit(ix0 * Math.sin(twist) + iy0 * Math.cos(twist) + sc * 0.45 * Math.sin(g.clock * 5.1 + 1.9));
  const pulse = Math.sin(g.clock * 2.35) * 0.62 + Math.sin(g.clock * 5.8 + 1.1) * 0.28;
  const snap = Math.sin(g.clock * 8.7) * 0.1;
  const k = 1 - Math.exp(-5.6 * (1 - 0.6 * sc) * dt);
  const ease = 1 - Math.exp(-2.4 * dt);
  const shake = sc * 30 * Math.sin(g.clock * 6.1);
  const gust = g.gustRoll * 20 * rough;
  let vs: number;
  if (g.drive === 'vertical') {
    // Straight up and down, held level; sideways turns it where it hangs.
    g.pitch += ((pulse * 2 + snap) - g.pitch) * k;
    g.bank += ((ix * 14 + pulse * 6 + snap * 5 + gust + shake) - g.bank) * k;
    g.heading += ix * 75 * dt;
    g.speed += ((70 + pulse * 10) - g.speed) * ease;
    g.strafe += (0 - g.strafe) * ease;
    g.lift += ((iy * 190 + pulse * 14) - g.lift) * k;
    vs = g.lift;
  } else if (g.drive === 'strafe') {
    // Sideways, the nose held where it points; up and down on the stick is faster and slower.
    g.lift += (0 - g.lift) * ease;
    g.pitch += ((-iy * 6 + pulse * 2) - g.pitch) * k;
    g.bank += ((ix * 28 + pulse * 8 + snap * 6 + gust + shake) - g.bank) * k;
    g.heading += pulse * 4 * dt;
    g.speed += ((205 + iy * 130 + pulse * 18) - g.speed) * ease;
    g.strafe += ((ix * 220 + pulse * 12) - g.strafe) * k;
    vs = pulse * 14 + g.gustLift * 22 * rough;
  } else {
    // Flown like an aircraft: the nose and the bank, and the bank turns it.
    g.lift += (0 - g.lift) * ease;
    g.strafe += (0 - g.strafe) * ease;
    g.pitch += ((iy * GAME.maxPitch * 1.65 + pulse * 3.8 + snap * 2) - g.pitch) * k;
    g.bank += (ix * GAME.maxBank * 1.85 + pulse * 13 + snap * 11 + gust + shake - g.bank) * k;
    g.heading += g.bank * GAME.turnRate * 1.7 * dt;
    g.speed += ((205 + pulse * 18) - g.speed) * ease;
    vs = Math.sin(g.pitch * DEG) * g.speed * 2.4 + pulse * 16 + g.gustLift * 22 * rough;
  }
  // Scrambled, it spins and sinks.
  g.heading = (g.heading + sc * 85 * Math.sin(g.clock * 0.9) * dt + 360) % 360;
  const level = Math.max(0, Math.cos(g.bank * DEG));
  vs += u * GAME.draftLift * GAME.draftClimb * level - sc * 45;
  vs = Math.max(-GAME.maxClimb * 1.3, Math.min(GAME.maxClimb * 1.8, vs));
  return { vs: vs + dashVelocity(g).up, stall: 0 };
}

export function fly(g: FlightGame, ix: number, iy: number, dt: number): { vs: number; stall: number } {
  const lost = g.wingLost;
  // In the UFO's slow motion the aeroplane answers the stick sharply and steadily: 0 normally, 1 in it.
  const assist = Math.min(1, Math.max(0, (1 - g.slow) / (1 - UFO.slow)));
  const power = g.boostPower;
  // The weather's gusts: rougher in rain, and a storm throws it about.
  const rough = TURBULENCE[g.weather];
  g.gustRoll = drift(g.gustRoll, 1.8, dt);
  g.gustLift = drift(g.gustLift, 0.9, dt);
  g.input = { x: ix, y: iy };
  if (g.mode === 'ufo') return flySaucer(g, ix, iy, dt, rough);
  if (g.failed === 0) {
    const u0 = stepAir(g.air, dt, groundSpeed(g), g.heading, g.alt);
    g.updraft = u0;
    g.pitch += (iy * GAME.maxPitch + g.flaps * 1.5 - g.pitch) * (1 - Math.exp(-3.2 * (1 + 1.5 * assist) * dt));
    // At the ceiling the nose will not come up any further.
    if (g.alt >= GAME.ceiling && g.pitch > 0) g.pitch *= 1 - Math.min(1, dt * 6);
    // A wing short: it banks toward the short side unless the stick holds it off.
    g.bank += (ix * GAME.maxBank + lost * 18 + g.gustRoll * 9 * rough - g.bank) * (1 - Math.exp(-3.5 * (1 + 1.5 * assist) * dt));
    g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
    g.speed = speedAt(g.alt);
    g.rollRate = 0;
    const level0 = Math.max(0, Math.cos(g.bank * DEG)) ** 2;
    const vs = Math.sin(g.pitch * DEG) * g.speed * GAME.climbGain - Math.abs(lost) * 6
      + u0 * GAME.draftLift * GAME.draftClimb * level0
      + g.gustLift * 14 * rough + g.flaps * 7;
    const top = GAME.maxClimb + BOOST.extraClimb * power;
    return { vs: Math.max(-GAME.maxClimb, Math.min(top, vs + power * BOOST.climb)), stall: 0 };
  }

  const dead = g.failed;
  // Rising air, and how much of it the wing catches: all of it level, little in a bank.
  // The thermals go by; the lift is whatever the aeroplane is flying through.
  const u = stepAir(g.air, dt, g.speed, g.heading, g.alt);
  g.updraft = u;
  const caught = Math.max(0, Math.cos(g.bank * DEG)) ** 3;
  // The fire takes twenty seconds to do its worst, then fifty more to take
  // the wing — and while a level wing rides rising air, the cool air over it
  // holds the fire back, and that clock all but stops.
  // A burn blows the fire back too.
  const burn = dt * Math.max(0, 1 - 0.85 * u * caught) * (1 - 0.85 * power);
  g.damage = Math.min(1, g.damage + burn / 40);
  const k = g.damage;
  g.decay = k >= 1 ? Math.min(1, g.decay + burn / 50) : 0;
  const w = g.decay;
  g.surge = drift(g.surge, 0.8, dt);
  g.buffetRoll = drift(g.buffetRoll, 10, dt);
  g.buffetPitch = drift(g.buffetPitch, 8, dt);
  // The other engine gone as well: its thrust spools down over three seconds.
  if (g.both) g.thrust = Math.max(0, g.thrust - dt / 3);
  const t = g.thrust;
  // A burn relights whatever will light: the glide goes while it lasts.
  const glide = 1 - Math.max(t, power);

  const stall = smoothstep(GAME.stallSpeed + 6 - g.flaps * 10, GAME.stallSpeed - 4 - g.flaps * 8, g.speed);
  // Roll: the stick drives the roll rate, with less to drive it as the fire
  // spreads and the wing goes; the dead engine, the spiral, the buffet and a
  // stall push it. Full stick outruns the push to begin with, only just
  // outruns it once the fire is at its worst, and loses to it as the wing goes.
  const authority = (0.7 - 0.3 * k) * (1 - 0.75 * stall) * (1 - 0.45 * w) * (1 + 0.9 * u) * (lost ? 0.88 : 1) * (1 + 0.8 * assist) * (1 + 1.2 * power);
  const commanded = ix * 80 * authority;
  // The good engine's pull goes with its thrust; the burning wing's does not; nor does a missing wingtip's.
  const push = (dead * ((32 + 10 * k) * t + 30 * w) * (1 + 0.5 * g.surge) + lost * 24) * (1 - 0.6 * power) * (1 - 0.4 * u * caught)
    + g.gustRoll * 26 * rough;
  g.rollRate += ((commanded - g.rollRate) * 2.6 + push + Math.sin(g.bank * DEG) * 55
    + g.buffetRoll * (40 + 60 * k + 20 * glide) * (1 - 0.35 * u) * (1 - 0.6 * assist) + dead * stall * 80) * dt;
  g.bank = wrap180(g.bank + g.rollRate * dt);
  const lift = Math.cos(g.bank * DEG);
  // Pitch: softer elevator, heavier nose; it falls in a bank, and drops outright in a stall.
  const aim = iy * GAME.maxPitch * (0.8 - 0.3 * k + 0.4 * power) - (1 - lift) * 18 - stall * 20 - 4 * k - 10 * w
    + g.buffetPitch * (2 + 4 * k) + power * 7;
  g.pitch += (aim - g.pitch) * (1 - Math.exp(-2.4 * dt));
  g.pitch = Math.max(-60, Math.min(20, g.pitch));
  // Heading: the bank turns it while the wing still lifts, and the good engine yaws it toward the dead one.
  g.heading = (g.heading + (g.bank * GAME.turnRate * Math.max(0, lift) + dead * (5 + 5 * k) * t) * dt + 360) % 360;
  const v = g.speed;
  // Height: what the pitch buys at this speed, less what half the thrust (or
  // none) and a burning wing cannot hold — a stalled one holds nothing —
  // less what a bank spills, plus whatever rising air a level wing catches.
  const sink = 10 + 18 * k + 24 * w + 22 * glide + stall * 40 + Math.abs(lost) * 5;
  const vs = v * Math.sin(g.pitch * DEG) - sink * (1 - 0.5 * power) - (1 - lift) * v * 0.4
    + u * GAME.draftLift * Math.max(0, lift) ** 3 * (1 - 0.3 * w) * (1 - 0.75 * glide)
    + power * BOOST.lift * Math.max(0, lift) ** 2
    + g.gustLift * 16 * rough;
  // Speed: gravity along the flight path — the nose down is the only way to
  // buy it — against drag that grows with speed and with bank, and that no
  // thrust is left to cancel.
  const drag = (0.5 + 0.4 * k + 0.6 * w + 1.6 * glide + g.flaps * 0.9) * (0.6 + 0.4 * (v / 130) ** 2) + Math.abs(Math.sin(g.bank * DEG)) * 3.5;
  // A burn drives it on, and rising air carries a little speed in with it.
  const shove = power * BOOST.accel + u * caught * 6;
  g.speed = Math.max(45, Math.min(280, v + (-9.81 * Math.sin(g.pitch * DEG) - drag * (1 - 0.7 * power) + shove) * dt));
  return { vs, stall };
}
