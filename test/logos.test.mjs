/**
 * The logos: that they turn up ahead, go by as the aeroplane flies, are
 * taken when it flies through them and not when it misses, and that the
 * leaderboard's ceiling has room for every one there could have been.
 *
 *   npm test
 */
import { LOGOS, newLogos, stepLogos } from '../dist-test/logos.js';
import { scoreCeiling, SCORING } from '../dist-test/scoring.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let seed = 5;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

console.log('\nthe logos');

check('they turn up ahead of the nose, and never too many at once', () => {
  for (const heading of [0, 90, 225]) {
    const f = newLogos();
    let most = 0;
    for (let t = 0; t < 60; t += 0.05) {
      const before = f.list.length;
      stepLogos(f, 0.05, 0, heading, 1000, 0, 0);
      most = Math.max(most, f.list.length);
      if (f.list.length > before) {
        const l = f.list[f.list.length - 1];
        const bearing = ((Math.atan2(l.x, -l.z) * 180) / Math.PI + 360) % 360;
        const off = ((bearing - heading + 540) % 360) - 180;
        assert(Math.abs(off) <= LOGOS.spread + 0.01, `one turned up ${off.toFixed(0)}° off the nose`);
      }
    }
    assert(most <= LOGOS.most, `${most} at once`);
  }
});

check('one passed near is pulled in and taken; one passed wide is left', () => {
  const f = newLogos();
  f.next = Infinity;
  f.list.push({ x: 120, y: 1040, z: -700, age: 0, taken: -1 }, { x: 320, y: 1000, z: -700, age: 0, taken: -1 });
  let got = 0;
  let pulled = false;
  for (let t = 0; t < 6; t += 1 / 60) {
    got += stepLogos(f, 1 / 60, 150, 0, 1000, 0, 0);
    if (f.list.some((l) => (l.pull ?? 0) > 0.3)) pulled = true;
  }
  assert(pulled, 'the near one was never drawn in');
  assert(got === 1 && f.count === 1, `${got} taken`);
  assert(LOGOS.magnet < 320, 'the wide one should be out of reach of the pull');
});

check('flown straight at, one is taken; flown past, it is not', () => {
  const f = newLogos();
  f.next = Infinity;
  f.list.push({ x: 0, y: 1000, z: -600, age: 0, taken: -1 }, { x: 300, y: 1000, z: -600, age: 0, taken: -1 });
  let got = 0;
  for (let t = 0; t < 6; t += 1 / 60) got += stepLogos(f, 1 / 60, 150, 0, 1000, 0, 0);
  assert(got === 1 && f.count === 1, `${got} taken`);
});

check('they are placed where the climb will have taken the aeroplane, and never below the floor', () => {
  const f = newLogos();
  for (let t = 0; t < 30; t += 0.1) stepLogos(f, 0.1, 150, 0, 500, 60, 480);
  assert(f.list.every((l) => l.y >= 480), 'one was below the floor');
  assert(f.list.some((l) => l.y > 700), 'none were placed up the climb');
});

check('the leaderboard has room for every logo there could have been', () => {
  for (const s of [4, 30, 120]) {
    const most = (Math.floor(s / LOGOS.gap[0]) + 1) * LOGOS.points;
    assert(scoreCeiling(s * 1000) >= most + SCORING.maxHeightPoints, `${s} s of logos would not fit under the ceiling`);
  }
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
