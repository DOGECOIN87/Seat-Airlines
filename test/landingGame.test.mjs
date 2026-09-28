/**
 * How long the landing's aeroplane stays up once an engine has gone.
 *
 * It used to be possible to hold the nose up on one engine and keep flying
 * for minutes. These fly the real flight model, from 10,000 ft over flat
 * ground, with three pilots — nobody at the controls, somebody holding the
 * nose up (the old trick), and one flying it about as well as it can be
 * flown — and hold the model to the minute or so a great pilot should get
 * in still air, a good deal more for riding the updrafts well, and no more
 * than that. Then the rest of what can happen: the engine going early, and
 * the other one following it.
 *
 *   npm test
 */
import { FEET, GAME, dealFailures, fly, newGame } from '../dist-test/landingGame.js';
import { bearingTo, presence, startAir } from '../dist-test/thermals.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* The buffet is random; the same seeds every time. */
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const pilots = {
  nobody: () => () => [0, 0],
  /* Levels the wings with the arrow keys, late, and holds the nose up. */
  holdingUp: () => {
    let x = 0;
    return (g) => {
      if (Math.abs(g.bank) > 20) x = -Math.sign(g.bank); else if (Math.abs(g.bank) < 5) x = 0;
      return [x, 1];
    };
  },
  /*
   * Analog and instant: a little bank toward the good engine (while there
   * is one), the speed just above the stall — and a turn toward the
   * nearest thermal in sight, rolling level again as it gets there.
   */
  great: () => (g) => {
    let steer = 0;
    const near = g.air.list
      .filter((t) => presence(t) > 0.2)
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (near && Math.hypot(near.x, near.z) > near.r * 0.3) {
      const off = ((bearingTo(near) - g.heading + 540) % 360) - 180;
      steer = clamp(off * 0.8, -14, 14);
    }
    return [
      clamp(0.12 * (-g.failed * 5 * g.thrust + steer - g.bank) - 0.05 * g.rollRate, -1, 1),
      clamp(0.12 * (g.speed - 108), -1, 1),
    ];
  },
};
const reaction = { nobody: 0, holdingUp: 0.4, great: 0 };

/**
 * Seconds from the blast to the ground, for each of `runs` flights: from
 * `feet`, in still air or with the updrafts, and losing the other engine
 * `bothAfter` seconds in.
 */
function flights(name, { runs = 24, feet = GAME.blastFeet, still = false, bothAfter = Infinity } = {}) {
  const times = [];
  for (let r = 0; r < runs; r++) {
    seed = 1000 + r * 7919;
    const g = newGame();
    g.phase = 'flying';
    g.failed = r % 2 ? 1 : -1;
    g.damage = 0.5;
    g.speed = GAME.failSpeed;
    g.pitch = -5;
    g.rollRate = g.failed * 60;
    g.alt = feet / FEET;
    if (!still) startAir(g.air);
    const pilot = pilots[name]();
    const dt = 1 / 60;
    const lag = Math.round(reaction[name] / dt);
    const seen = [];
    let t = 0;
    while (g.alt > GAME.clearance && t < 600) {
      if (t >= bothAfter) g.both = true;
      seen.push({ ...g });
      const [ix, iy] = pilot(seen[Math.max(0, seen.length - 1 - lag)]);
      const { vs } = fly(g, ix, iy, dt);
      g.vs = vs;
      g.alt += vs * dt;
      t += dt;
    }
    times.push(t);
  }
  return times.sort((a, b) => a - b);
}
const median = (xs) => xs[Math.floor(xs.length / 2)];
const show = (xs) => `${xs[0].toFixed(1)}–${xs[xs.length - 1].toFixed(1)} s, median ${median(xs).toFixed(1)} s`;

console.log('\nthe landing, on one engine');

const nobody = flights('nobody');
const holdingUp = flights('holdingUp');
const great = flights('great');
const greatStill = flights('great', { still: true });
const holdingUpStill = flights('holdingUp', { still: true });

check(`left to itself it is down inside half a minute (${show(nobody)})`, () => {
  assert(nobody[nobody.length - 1] < 30, 'an untouched aeroplane stayed up too long');
});

check(`holding the nose up no longer keeps it flying (${show(holdingUp)})`, () => {
  assert(holdingUp[holdingUp.length - 1] < 40, 'the nose-up trick still works');
});

check(`flown about as well as it can be, in still air, it lasts about a minute (${show(greatStill)})`, () => {
  assert(median(greatStill) > 50 && median(greatStill) < 75, 'a great pilot should get about a minute');
});

check(`riding the updrafts well buys a good deal more (${show(great)})`, () => {
  assert(median(great) > median(greatStill) + 8, 'the updrafts should be worth real time to a pilot who flies them level');
  assert(median(great) - median(greatStill) > median(holdingUp) - median(holdingUpStill) + 5,
    'they should be worth more to a pilot who flies well than to one who does not');
});

check('nobody can glide it for minutes', () => {
  for (const xs of [nobody, holdingUp, great]) assert(xs[xs.length - 1] < 100, `a flight lasted ${xs[xs.length - 1].toFixed(0)} s`);
});

check('skill is worth something', () => {
  assert(median(great) > median(holdingUp) + 15, 'flying it well should buy a good deal more time than holding the nose up');
  assert(median(holdingUp) > median(nobody), 'trying should beat not trying');
});

const early = flights('great', { feet: GAME.earliestFeet });
check(`an engine going at ${GAME.earliestFeet.toLocaleString('en-US')} ft can still be flown (${show(early)})`, () => {
  assert(median(early) > 35, 'the earliest failure should still leave a great pilot something to fly');
  assert(median(early) < median(great), 'less height should mean less time');
});

const dual = flights('great', { bothAfter: GAME.secondFrom });
check(`losing the other engine brings it down sooner (${show(dual)})`, () => {
  assert(median(dual) < median(great) - 5, 'no thrust at all should cost time');
  assert(median(dual) > 30, 'but it should still be worth flying');
});

check('the failures are dealt as described', () => {
  const heights = [], causes = [], seconds = [];
  for (let i = 0; i < 3000; i++) {
    const g = newGame();
    dealFailures(g);
    heights.push(g.blastAlt * FEET);
    causes.push(g.causes[0]);
    seconds.push(g.secondAfter);
  }
  assert(heights.every((f) => f >= GAME.earliestFeet - 1 && f <= GAME.blastFeet + 1), 'an engine went outside 4,000–10,000 ft');
  const atBrief = heights.filter((f) => Math.abs(f - GAME.blastFeet) < 1).length / heights.length;
  assert(Math.abs(atBrief - (1 - GAME.earlyOdds)) < 0.05, `${(atBrief * 100).toFixed(0)}% went at the brief's height`);
  const struck = causes.filter((c) => c === 'lightning').length / causes.length;
  assert(Math.abs(struck - GAME.lightningOdds) < 0.05, `${(struck * 100).toFixed(0)}% were lightning`);
  const both = seconds.filter(Number.isFinite);
  assert(Math.abs(both.length / seconds.length - GAME.secondOdds) < 0.05, `${((both.length / seconds.length) * 100).toFixed(0)}% lost both`);
  assert(both.every((s) => s >= GAME.secondFrom && s <= GAME.secondTo), 'the second engine went outside its window');
});

check('a thermal lifts a level aeroplane in its middle, and hardly one in a steep bank or at its edge', () => {
  const climb = (bank, at = 0) => {
    const g = () => {
      const x = newGame();
      Object.assign(x, { phase: 'flying', failed: 1, damage: 0.5, speed: 110, alt: 2000, bank, rollRate: 0 });
      return x;
    };
    seed = 42;
    const calm = g();
    const still = fly(calm, 0, 0, 1 / 60).vs;
    seed = 42;
    const lifted = g();
    lifted.air.list.push({ x: at, z: 0, r: 250, peak: 1, age: 10, life: 30, cap: 2400 });
    return fly(lifted, 0, 0, 1 / 60).vs - still;
  };
  assert(climb(0) > GAME.draftLift * 0.8, `level, in the middle, it gained only ${climb(0).toFixed(1)} m/s`);
  assert(climb(60) < GAME.draftLift * 0.2, `banked 60°, it still gained ${climb(60).toFixed(1)} m/s`);
  assert(climb(0, 240) < GAME.draftLift * 0.1, `at the edge, it still gained ${climb(0, 240).toFixed(1)} m/s`);
  assert(climb(0, 400) === 0, 'outside it, it still gained');
});

check('with both engines, up still climbs', () => {
  const g = newGame();
  g.phase = 'flying';
  g.alt = 800;
  let vs = 0;
  for (let i = 0; i < 120; i++) vs = fly(g, 0, 1, 1 / 60).vs;
  assert(vs > 20, `climbing at ${vs.toFixed(1)} m/s`);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
