/**
 * UFO mode: the saucer's dash, its drive modes, and the airliners that come
 * for it — that one hits a saucer that holds its course, that a dash out of
 * the way at the last moment makes it miss and pays, and that a hit
 * scrambles the field for a while and then wears off.
 *
 *   npm test
 */
import { RAMMER, newRams, spawnRammer, stepRams, bearing } from '../dist-test/rammer.js';
import { DASH, cycleDrive, dashFor, dashVelocity, fireBoost, fly, newGame, stepBoost, travel } from '../dist-test/landingGame.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

let seed = 11;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const DT = 1 / 60;
/** A saucer flying north at `speed`, and a field with one airliner spawned at it. */
const setup = (speed = 205) => {
  const v = { x: 0, y: 0, z: -speed };
  const field = newRams();
  field.next = Infinity;
  field.list.push(spawnRammer(field, 0, v));
  return { v, field };
};

console.log('\nUFO mode');

check('a dash goes the stick’s way, snapped to one of five', () => {
  assert(dashFor({ x: 0, y: 0 }) === 'forward', 'no stick should be forward');
  assert(dashFor({ x: 0.1, y: -0.2 }) === 'forward', 'a resting thumb should be forward');
  assert(dashFor({ x: 0.2, y: 0.9 }) === 'up', 'up');
  assert(dashFor({ x: -0.3, y: -0.8 }) === 'down', 'down');
  assert(dashFor({ x: -0.9, y: 0.4 }) === 'left', 'left');
  assert(dashFor({ x: 0.7, y: -0.5 }) === 'right', 'right');
});

check('a dash is faster than anything with wings, and short', () => {
  const g = newGame('ufo');
  g.phase = 'flying';
  g.agl = 2000;
  g.input = { x: 0, y: 0 };
  assert(fireBoost(g), 'it should fire');
  let top = 0;
  for (let t = 0; t < 2; t += DT) {
    stepBoost(g, DT);
    top = Math.max(top, travel(g).speed);
  }
  assert(top > 2400, `top speed ${top.toFixed(0)} m/s`);
  assert(dashVelocity(g).ahead < 50, 'it should be over within two seconds');
});

check('a dash sideways moves it sideways, and down holds off the ground', () => {
  const g = newGame('ufo');
  g.phase = 'flying';
  g.agl = 2000;
  g.heading = 90;
  g.input = { x: -1, y: 0 };
  fireBoost(g);
  for (let t = 0; t < 0.4; t += DT) stepBoost(g, DT);
  const way = travel(g);
  assert(Math.abs(((way.heading - 0 + 540) % 360) - 180) < 20, `heading east and sliding left should travel north, went ${way.heading.toFixed(0)}`);
  const low = newGame('ufo');
  low.phase = 'flying';
  low.agl = DASH.floor + 10;
  low.input = { x: 0, y: -1 };
  fireBoost(low);
  for (let t = 0; t < 0.4; t += DT) stepBoost(low, DT);
  assert(dashVelocity(low).up > -80, `near the ground the dash down should brake, was ${dashVelocity(low).up.toFixed(0)} m/s`);
});

check('the drive modes go round, and each moves it its own way', () => {
  const g = newGame('ufo');
  assert(cycleDrive(g) === 'vertical' && cycleDrive(g) === 'strafe' && cycleDrive(g) === 'forward', 'forward, vertical, strafe, forward');
  const rise = newGame('ufo');
  rise.drive = 'vertical';
  rise.phase = 'flying';
  let vs = 0;
  for (let t = 0; t < 2; t += DT) vs = fly(rise, 0, 1, DT).vs;
  assert(vs > 120 && Math.abs(rise.pitch) < 6, `vertical: stick up rises level (vs ${vs.toFixed(0)}, pitch ${rise.pitch.toFixed(1)})`);
  const slide = newGame('ufo');
  slide.drive = 'strafe';
  slide.phase = 'flying';
  for (let t = 0; t < 2; t += DT) fly(slide, 1, 0, DT);
  assert(slide.strafe > 150, `strafe: stick right slides right (${slide.strafe.toFixed(0)} m/s)`);
  assert(Math.abs(((slide.heading + 540) % 360) - 180) < 20, `strafe: the nose stays put (${slide.heading.toFixed(0)}°)`);
});

check('an airliner hits a saucer that holds its course', () => {
  let hits = 0;
  for (let i = 0; i < 40; i++) {
    const { v, field } = setup();
    for (let t = 0; t < 12; t += DT) if (stepRams(field, DT, v, 0).hit) hits++;
  }
  assert(hits >= 38, `${hits} of 40 hit`);
});

check('a dash out of the way at the last moment makes it miss, and pays', () => {
  let dodged = 0, hits = 0;
  for (let i = 0; i < 40; i++) {
    const { v, field } = setup();
    const r = field.list[0];
    let dashing = 0;
    for (let t = 0; t < 12; t += DT) {
      const d = Math.hypot(r.x, r.y, r.z);
      const closing = Math.hypot(r.vx - v.x, r.vy - v.y, r.vz - v.z);
      // A second out: a dash straight up.
      if (!dashing && d / closing < 1) dashing = DASH.seconds;
      const up = dashing > 0 ? DASH.vertical : 0;
      dashing = Math.max(0, dashing - DT);
      const e = stepRams(field, DT, { x: v.x, y: up, z: v.z }, 0);
      if (e.hit) hits++;
      if (e.dodged) dodged++;
    }
  }
  assert(hits === 0, `${hits} hit anyway`);
  assert(dodged >= 30, `${dodged} of 40 counted as near misses`);
  assert(RAMMER.bonus > 0, 'a near miss pays');
});

check('it calls out where it is coming from', () => {
  assert(Math.abs(bearing(0, -100, 0)) < 1, 'dead ahead');
  assert(Math.abs(bearing(100, 0, 0) - 90) < 1, 'to the right');
  assert(Math.abs(bearing(-100, 0, 90) - 180) < 1 || Math.abs(bearing(-100, 0, 90) + 180) < 1, 'behind, heading east');
});

check('attacks keep their cooldown throughout the flight and never overlap', () => {
  const field = newRams();
  const v = { x: 0, y: 0, z: -205 };
  const times = [];
  let t = 0;
  while (times.length < 8 && t < 320) {
    const before = field.count;
    stepRams(field, DT, v, 0, true);
    assert(field.list.filter(r => !r.done).length <= RAMMER.maxActive, 'too many active attackers');
    if (field.count > before) times.push(t);
    t += DT;
  }
  const gaps = times.slice(1).map((x, i) => x - times[i]);
  assert(times[0] >= RAMMER.first[0] - 0.1 && times[0] <= RAMMER.first[1] + 0.1, `the first came at ${times[0]?.toFixed(1)} s`);
  assert(times.length >= 6, 'the cooldown must still allow encounters');
  assert(gaps.every(gap => gap >= RAMMER.gapFloor), `an attack skipped the cooldown: ${gaps}`);
});

check('a hit scrambles the field, and it wears off', () => {
  const g = newGame('ufo');
  g.phase = 'flying';
  g.scramble = RAMMER.scramble;
  // Scrambled, the stick held right does not simply bank it right.
  const clean = newGame('ufo');
  clean.phase = 'flying';
  let differ = 0;
  for (let t = 0; t < 3; t += DT) {
    fly(g, 1, 0, DT);
    fly(clean, 1, 0, DT);
    differ = Math.max(differ, Math.abs(g.bank - clean.bank));
    g.clock += DT;
    clean.clock += DT;
  }
  assert(differ > 15, `scrambled and clean flew within ${differ.toFixed(1)}° of each other`);
  for (let t = 0; t < RAMMER.scrambleSeconds + 1; t += DT) fly(g, 0, 0, DT);
  assert(g.scramble === 0, `still ${g.scramble.toFixed(2)} scrambled`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
