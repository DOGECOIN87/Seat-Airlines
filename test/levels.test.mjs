/**
 * The game's levels: that the height picks the site's bands in order, that
 * the ground bends tightly enough that its edge is always over the horizon,
 * that the climb adds up across worlds, and that a saucer can actually get
 * to space in a sensible time.
 *
 *   npm test
 */
import { ABOVE_CLOUDS, ARRIVE, LEVELS, SPACE, bandAt, climbed, globeRadius, nextMark } from '../dist-test/levels.js';
import { fly, newGame } from '../dist-test/landingGame.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nlevels');

check('the height picks the site’s bands, in order', () => {
  assert(bandAt('earth', 500).band === 'atmosphere', 'low is in the weather');
  assert(bandAt('earth', ABOVE_CLOUDS + 10).band === 'above-clouds', 'then above the clouds');
  assert(bandAt('earth', SPACE + 10).band === 'space', 'then space');
  assert(bandAt('moon', 3000).band === 'moon' && bandAt('mars', 3000).band === 'mars', 'the other worlds are their own');
  const p1 = bandAt('earth', 20000).progress;
  const p2 = bandAt('earth', 60000).progress;
  assert(p2 > p1 && p2 <= 1, `space progress climbs (${p1.toFixed(2)} → ${p2.toFixed(2)})`);
});

check('the edge of the ground is always over the horizon', () => {
  for (let h = 2600; h <= 200000; h += 500) {
    const horizon = Math.sqrt(2 * globeRadius(h) * h);
    assert(horizon <= 60000, `at ${h} m the horizon is ${Math.round(horizon)} m out`);
  }
  assert(globeRadius(300) === 6371000, 'down low it is the real Earth');
});

check('the climb adds up across worlds', () => {
  assert(climbed('earth', 1000) === 1000, 'earth');
  assert(climbed('moon', ARRIVE) === LEVELS.earth.top + ARRIVE, 'the moon starts where Earth ended');
  assert(climbed('mars', 0) === LEVELS.earth.top + LEVELS.moon.top, 'Mars after the moon');
});

check('the next goal is the next band, then the next world', () => {
  assert(nextMark('earth', 100).name === 'Above the clouds', 'clouds first');
  assert(nextMark('earth', 5000).name === 'Space', 'then space');
  assert(nextMark('earth', 20000).name === 'The moon', 'then the moon');
  assert(nextMark('moon', 5000).name === 'Mars', 'then Mars');
  assert(nextMark('mars', 5000) === null, 'Mars is the last');
});

check('a saucer held straight up gets to space inside a minute and a half', () => {
  const g = newGame('ufo');
  g.phase = 'flying';
  g.drive = 'vertical';
  g.alt = 3000;
  const dt = 1 / 30;
  let t = 0;
  while (g.alt < SPACE && t < 300) {
    g.agl = g.alt;
    g.alt += fly(g, 0, 1, dt).vs * dt;
    g.clock += dt;
    t += dt;
  }
  assert(t < 90, `took ${t.toFixed(0)} s`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
