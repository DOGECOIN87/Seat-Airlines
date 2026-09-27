/**
 * How long the landing's aeroplane stays up once an engine has gone.
 *
 * It used to be possible to hold the nose up on one engine and keep flying
 * for minutes. These fly the real flight model, from 10,000 ft over flat
 * ground, with three pilots — nobody at the controls, somebody holding the
 * nose up (the old trick), and one flying it about as well as it can be
 * flown — and hold the model to the minute or so a great pilot should get,
 * and no more.
 *
 *   npm test
 */
import { FEET, GAME, fly, newGame } from '../dist-test/landingGame.js';

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
  /* Analog and instant: a little bank toward the good engine, and the speed just above the stall. */
  great: () => (g) => [
    clamp(0.12 * (-g.failed * 5 - g.bank) - 0.05 * g.rollRate, -1, 1),
    clamp(0.12 * (g.speed - 108), -1, 1),
  ],
};
const reaction = { nobody: 0, holdingUp: 0.4, great: 0 };

/** Seconds from the blast to the ground, for each of `runs` flights. */
function flights(name, runs = 24) {
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
    g.alt = GAME.blastFeet / FEET;
    const pilot = pilots[name]();
    const dt = 1 / 60;
    const lag = Math.round(reaction[name] / dt);
    const seen = [];
    let t = 0;
    while (g.alt > GAME.clearance && t < 600) {
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

check(`left to itself it is down inside half a minute (${show(nobody)})`, () => {
  assert(nobody[nobody.length - 1] < 30, 'an untouched aeroplane stayed up too long');
});

check(`holding the nose up no longer keeps it flying (${show(holdingUp)})`, () => {
  assert(holdingUp[holdingUp.length - 1] < 40, 'the nose-up trick still works');
});

check(`flown about as well as it can be, it lasts about a minute (${show(great)})`, () => {
  assert(median(great) > 50 && median(great) < 75, 'a great pilot should get about a minute');
});

check('nobody can glide it for minutes', () => {
  for (const xs of [nobody, holdingUp, great]) assert(xs[xs.length - 1] < 90, `a flight lasted ${xs[xs.length - 1].toFixed(0)} s`);
});

check('skill is worth something', () => {
  assert(median(great) > median(holdingUp) + 15, 'flying it well should buy a good deal more time than holding the nose up');
  assert(median(holdingUp) > median(nobody), 'trying should beat not trying');
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
