/**
 * The thermals: that they turn up ahead where a pilot can turn to them, go
 * by as the aeroplane flies, build and fade, and lift most in their middle.
 *
 *   npm test
 */
import { AIR, bearingTo, liftFrom, newAir, presence, startAir, stepAir } from '../dist-test/thermals.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let seed = 11;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

console.log('\nthe thermals');

check('none until the engine goes, then the first within a few seconds', () => {
  const air = newAir();
  for (let t = 0; t < 30; t += 0.1) stepAir(air, 0.1, 120, 0, 3000);
  assert(air.list.length === 0, 'rising air before anything went wrong');
  startAir(air);
  let first = null;
  for (let t = 0; t < 10 && first === null; t += 0.1) {
    stepAir(air, 0.1, 120, 0, 3000);
    if (air.list.length) first = t;
  }
  assert(first !== null && first >= AIR.first[0] - 0.2 && first <= AIR.first[1] + 0.2, `the first came at ${first}`);
});

check('they turn up ahead, near enough the nose to turn to', () => {
  for (const heading of [0, 90, 200, 315]) {
    const air = newAir();
    startAir(air);
    for (let t = 0; t < 60; t += 0.1) {
      const before = air.list.length;
      stepAir(air, 0.1, 0, heading, 3000);
      if (air.list.length > before) {
        const th = air.list[air.list.length - 1];
        const off = ((bearingTo(th) - heading + 540) % 360) - 180;
        const d = Math.hypot(th.x, th.z);
        assert(Math.abs(off) <= AIR.spread + 0.01, `one turned up ${off.toFixed(0)}° off the nose`);
        assert(d >= AIR.ahead[0] - 1 && d <= AIR.ahead[1] + 1, `one turned up ${d.toFixed(0)} m away`);
      }
    }
  }
});

check('they go by as the aeroplane flies, and never more than a few at once', () => {
  const air = newAir();
  startAir(air);
  let most = 0;
  for (let t = 0; t < 120; t += 0.1) {
    stepAir(air, 0.1, 120, 45, 3000);
    most = Math.max(most, air.list.length);
  }
  assert(most <= AIR.most, `${most} at once`);
  const air2 = { list: [{ x: 0, z: -1000, r: 500, peak: 1, age: 10, life: 60, cap: 3000 }], next: Infinity };
  for (let i = 0; i < 50; i++) stepAir(air2, 0.1, 100, 0, 3000);
  assert(Math.abs(air2.list[0].z + 500) < 1, `flying at it for 5 s at 100 m/s left it at z ${air2.list[0].z.toFixed(0)}`);
});

check('they build, stand, and fade', () => {
  const t = { x: 0, z: 0, r: 500, peak: 1, age: 0, life: 30, cap: 3000 };
  assert(presence(t) === 0, 'there at once');
  t.age = 15;
  assert(presence(t) === 1, 'not all there in the middle of its life');
  t.age = 29.9;
  assert(presence(t) < 0.05, 'not fading at the end');
});

check('the lift is strongest in the middle and nothing past the edge', () => {
  const t = { x: 0, z: 0, r: 500, peak: 1, age: 15, life: 30, cap: 3000 };
  assert(liftFrom(t, 0) === 1, 'not all of it in the middle');
  assert(liftFrom(t, 250) > 0.7 && liftFrom(t, 250) < 0.8, `half way out: ${liftFrom(t, 250)}`);
  assert(liftFrom(t, 500) === 0 && liftFrom(t, 800) === 0, 'lift outside it');
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
