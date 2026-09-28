/**
 * The UFO: that it shows as often as it should, moves the way nothing with
 * wings can — dead stops, and dashes along one axis at a time, fast — comes
 * for a wing when it does, and that losing the wing is felt.
 *
 *   npm test
 */
import { UFO, WINGTIP, planUfo, slowAt, ufoAt } from '../dist-test/ufo.js';
import { GAME, fly, newGame } from '../dist-test/landingGame.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let seed = 7;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

console.log('\nthe UFO');

check('it shows on about 45% of flights, and hits on about 12%', () => {
  let seen = 0, hit = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const p = planUfo();
    if (p) seen++;
    if (p?.strike) hit++;
  }
  assert(Math.abs(seen / n - UFO.seenOdds) < 0.03, `${((seen / n) * 100).toFixed(1)}% showed`);
  assert(Math.abs(hit / n - UFO.hitOdds) < 0.02, `${((hit / n) * 100).toFixed(1)}% hit`);
});

check('every move is a dash along one axis, and never the same one twice running', () => {
  for (let i = 0; i < 300; i++) {
    const p = planUfo('seen');
    let last = null;
    for (let k = 1; k < p.keys.length - 1; k++) {
      const a = p.keys[k - 1];
      const b = p.keys[k];
      if (b.move !== 'dash') continue;
      const moved = ['right', 'up', 'ahead'].filter((ax) => Math.abs(b[ax] - a[ax]) > 1e-6);
      assert(moved.length === 1, `a dash moved along ${moved.join(' and ')}`);
      assert(moved[0] !== last, `two dashes running along ${moved[0]}`);
      last = moved[0];
    }
  }
});

check('the dashes are fast: hundreds of metres in a fraction of a second', () => {
  let slowest = Infinity;
  for (let i = 0; i < 300; i++) {
    const p = planUfo('seen');
    for (let k = 1; k < p.keys.length - 1; k++) {
      const a = p.keys[k - 1];
      const b = p.keys[k];
      if (b.move !== 'dash') continue;
      const d = Math.hypot(b.right - a.right, b.up - a.up, b.ahead - a.ahead);
      slowest = Math.min(slowest, d / (b.t - a.t));
    }
  }
  assert(slowest > 300, `a dash at only ${slowest.toFixed(0)} m/s`);
});

check('it keeps to its patch of sky ahead, until it leaves', () => {
  for (let i = 0; i < 300; i++) {
    const p = planUfo('seen');
    for (let t = p.at; t < p.keys[p.keys.length - 2].t; t += 0.05) {
      const u = ufoAt(p, t);
      assert(u.visible, 'it blinked out mid-flight');
      for (const ax of ['right', 'ahead']) {
        const [lo, hi] = UFO.box[ax];
        assert(u[ax] >= lo - 1 && u[ax] <= hi + 1, `${ax} ${u[ax].toFixed(0)} outside ${lo}–${hi}`);
      }
    }
    assert(!ufoAt(p, p.at - 0.01).visible && !ufoAt(p, p.end + 0.01).visible, 'visible outside its time');
  }
});

check('when it comes for a wing, it gets there on time', () => {
  for (let i = 0; i < 100; i++) {
    const p = planUfo('hit');
    assert(p.strike === 1 || p.strike === -1, 'no wing chosen');
    const just = ufoAt(p, p.hitAt - 1e-4);
    assert(just.strike && just.strike.side === p.strike && just.strike.p > 0.99, 'not at the end of its run');
    assert(Math.abs(just.right - p.strike * WINGTIP.right) < 1 && Math.abs(just.ahead - WINGTIP.ahead) < 1, 'not at the wingtip');
    const start = ufoAt(p, p.strikeFrom + 1e-4);
    const run = Math.hypot(start.right - just.right, start.up - just.up, start.ahead - just.ahead);
    assert(run / UFO.strikeFor > 500, `the run at the wing is only ${(run / UFO.strikeFor).toFixed(0)} m/s`);
  }
});

check('the slow motion is around the hit and nowhere else, and eases in and out', () => {
  const p = planUfo('hit');
  assert(Math.abs(slowAt(p, p.hitAt) - UFO.slow) < 1e-9, `at the hit: ${slowAt(p, p.hitAt)}`);
  assert(slowAt(p, p.hitAt - 1) === 1 && slowAt(p, p.hitAt + 1) === 1, 'slow away from the hit');
  let prev = slowAt(p, p.hitAt - 0.5);
  for (let t = p.hitAt - 0.5; t < p.hitAt + 0.5; t += 0.005) {
    const s = slowAt(p, t);
    assert(Math.abs(s - prev) < 0.15, `jumped from ${prev.toFixed(2)} to ${s.toFixed(2)}`);
    prev = s;
  }
  assert(slowAt(planUfo('seen'), 20) === 1 && slowAt(null, 20) === 1, 'slow with no hit');
});

check('with a wingtip gone, hands off, it banks toward the short side', () => {
  for (const side of [-1, 1]) {
    const g = newGame();
    g.phase = 'flying';
    g.alt = 1500;
    g.wingLost = side;
    for (let i = 0; i < 180; i++) fly(g, 0, 0, 1 / 60);
    assert(g.bank * side > 12, `banked ${g.bank.toFixed(1)}° with the ${side > 0 ? 'right' : 'left'} tip gone`);
  }
});

check('on one engine, the missing tip is a push the roll never loses', () => {
  const run = (lost) => {
    seed = 99;
    const g = newGame();
    g.phase = 'flying';
    g.failed = 1;
    g.damage = 0.5;
    g.speed = GAME.failSpeed;
    g.alt = 3000;
    g.draftIn = Infinity;
    g.wingLost = lost;
    for (let i = 0; i < 60; i++) fly(g, 0, 0, 1 / 60);
    return g.rollRate;
  };
  assert(run(1) > run(0) + 5, `starboard tip gone: ${run(1).toFixed(1)} vs ${run(0).toFixed(1)} °/s`);
  assert(run(-1) < run(0) - 5, `port tip gone: ${run(-1).toFixed(1)} vs ${run(0).toFixed(1)} °/s`);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
