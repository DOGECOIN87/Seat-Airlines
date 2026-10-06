/**
 * Tornadoes: that they touch down ahead and drift, that their wind pushes
 * an aeroplane round and up in the wall and down in the core, that nothing
 * reaches above the cloud base, and that threading one pays once.
 *
 *   npm test
 */
import { TWISTER, applyVortex, newTwisters, presenceOf, stepTwisters } from '../dist-test/tornado.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let seed = 5;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const DT = 1 / 30;

/** A grown funnel `d` metres east of the aeroplane, not moving. */
const one = (d) => ({
  list: [{ x: d, z: 0, vx: 0, vz: 0, core: 100, reach: 600, spin: 1, age: TWISTER.grow + 1, life: 999, threaded: false }],
  next: Infinity,
});

console.log('\ntornadoes');

check('they touch down ahead, a few at most, and grow in', () => {
  const f = newTwisters();
  let firstAt = null;
  for (let t = 0; t < 60; t += DT) {
    stepTwisters(f, DT, 0, 0, 300);
    if (f.list.length && firstAt === null) firstAt = t;
  }
  assert(firstAt !== null && firstAt <= TWISTER.first[1] + 0.1, `the first came at ${firstAt}`);
  assert(f.list.length <= TWISTER.most, `${f.list.length} at once`);
  const fresh = { ...f.list.at(-1), age: 0 };
  assert(presenceOf(fresh) === 0, 'a fresh one has not touched down yet');
});

check('in the wall it lifts; in the core it drops', () => {
  const wall = stepTwisters(one(130), DT, 0, 0, 300, false);
  const core = stepTwisters(one(20), DT, 0, 0, 300, false);
  assert(wall.lift > 15, `wall lift ${wall.lift.toFixed(1)} m/s`);
  assert(core.lift < -40, `core lift ${core.lift.toFixed(1)} m/s`);
  assert(core.core > 0.8, 'deep in the core');
});

check('it pushes round the vortex, and fades out at its reach', () => {
  const near = stepTwisters(one(200), DT, 0, 0, 300, false);
  const far = stepTwisters(one(900), DT, 0, 0, 300, false);
  assert(Math.abs(near.swirl) > 10, `near swirl ${near.swirl.toFixed(1)}°/s`);
  assert(far.wind === 0 && far.swirl === 0, 'nothing past its reach');
  const g = { heading: 0, bank: 0, pitch: 0, rollRate: 0, failed: 0, gustRoll: 0, gustLift: 0 };
  for (let t = 0; t < 2; t += DT) applyVortex(g, near, 0, DT);
  assert(Math.abs(((g.heading + 180) % 360) - 180) > 15, `turned ${g.heading.toFixed(1)}°`);
});

check('above the cloud base it is gone', () => {
  const high = stepTwisters(one(20), DT, 0, 0, TWISTER.top + 50, false);
  assert(high.wind === 0 && high.lift === 0, 'nothing up there');
});

check('threading one pays, once', () => {
  const f = one(400);
  let threaded = 0;
  // Flying east through it at 150 m/s.
  for (let t = 0; t < 8; t += DT) threaded += stepTwisters(f, DT, 150, 90, 300).threaded;
  assert(threaded === 1, `threaded ${threaded} times`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
