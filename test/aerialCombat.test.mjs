import assert from 'node:assert/strict';
import { aerialTargets, BLIMP, JET, fireMissile, soundSpeed, startAerial, stepAerial, sweptDistance } from '../dist-test/aerialCombat.js';
import { airspeedAt, fireBoost, fly, groundSpeed, newGame, stepBoost } from '../dist-test/landingGame.js';
import { scoreCeiling } from '../dist-test/scoring.js';

let passed = 0;
const check = (name, test) => { test(); passed++; console.log(`  ok   ${name}`); };
const setup = (mode = 'jet', ahead = 1500) => {
  const g = newGame(mode); g.phase = 'flying'; g.alt = g.agl = 450;
  startAerial(g, 0); g.aerial.blimp.x = 0; g.aerial.blimp.y = g.alt; g.aerial.blimp.z = -ahead;
  return g;
};
const lock = g => { for (let i = 0; i < 60; i++) stepAerial(g, 1 / 60, 0); };

console.log('\nblimp and fighter combat');
check('blimps cruise at a normal fixed low altitude above the local ground', () => {
  const g = newGame(); g.alt = 10000;
  startAerial(g, 90);
  assert.equal(g.aerial.blimp.y, 90 + BLIMP.altitude);
});
check('jet cruise is proportionally faster than the SA350', () => {
  const jet = setup(); const plane = setup('airliner');
  assert.equal(groundSpeed(jet), airspeedAt(jet.agl) * JET.cruiseScale);
  assert.ok(groundSpeed(jet) > groundSpeed(plane));
});
check('boost accelerates to local Mach 1, stays bounded, then returns to cruise', () => {
  for (const altitude of [450, 3000, 10000]) {
    const g = setup(); g.alt = g.agl = altitude;
    assert.ok(fireBoost(g));
    const top = soundSpeed(altitude);
    for (let i = 0; i < 180; i++) { stepBoost(g, 1 / 60); assert.ok(groundSpeed(g) <= top + 1e-6); }
    assert.ok(Math.abs(groundSpeed(g) - top) < 0.01);
    for (let i = 0; i < 400; i++) stepBoost(g, 1 / 60);
    assert.ok(Math.abs(groundSpeed(g) - airspeedAt(altitude) * JET.cruiseScale) < 0.1);
  }
});
check('blimp collision at speed pays exactly 5,000 once and leaves tail damage', () => {
  const g = setup('airliner', 100);
  assert.equal(stepAerial(g, 1, 300).blimpCollision, true);
  assert.equal(g.extra, 5000); assert.equal(g.tailDamage, 1); assert.equal(g.aerial.blimp.alive, false);
  assert.equal(g.aerial.explosions.length, 1);
  for (let i = 0; i < 120; i++) stepAerial(g, 1 / 60, 200);
  assert.equal(g.extra, 5000); assert.equal(g.tailDamage, 1);
});
check('a near miss neither damages the tail nor pays a collision bonus', () => {
  const g = setup('airliner', 50); g.aerial.blimp.x = 100;
  assert.equal(stepAerial(g, 1, 300).blimpCollision, false);
  assert.equal(g.extra, 0); assert.equal(g.tailDamage, 0);
});
check('collision accounts for the flagship wings and the smaller fighter footprint', () => {
  const plane = setup('airliner', 70); plane.aerial.blimp.x = 25;
  const jet = setup('jet', 70); jet.aerial.blimp.x = 25;
  assert.equal(stepAerial(plane, 1, 150).blimpCollision, true);
  assert.equal(stepAerial(jet, 1, 150).blimpCollision, false);
});
check('tail damage reduces elevator response in both aircraft', () => {
  for (const mode of ['airliner', 'jet']) {
    const clean = setup(mode); const damaged = setup(mode); damaged.tailDamage = 1;
    for (let i = 0; i < 60; i++) {
      clean.clock += 1 / 60; damaged.clock += 1 / 60;
      fly(clean, 0, 1, 1 / 60); fly(damaged, 0, 1, 1 / 60);
    }
    assert.ok(damaged.pitch < clean.pitch * 0.65, `${mode}: damage must cost pitch control`);
  }
});
check('a lock takes time and is lost when the target leaves the nose cone', () => {
  const g = setup(); stepAerial(g, 0.1, 0);
  assert.ok(g.aerial.lock > 0 && g.aerial.lock < 1);
  assert.equal(fireMissile(g), false);
  lock(g); assert.equal(g.aerial.lock, 1);
  g.heading = 180; stepAerial(g, 0.1, 0);
  assert.equal(g.aerial.lock, 0); assert.equal(g.aerial.target, null);
  assert.deepEqual(g.aerial.ammo, [true, true]);
});
check('each press releases just one missile, a cooldown blocks repeats, and the loadout is two', () => {
  const g = setup('jet', 2400); lock(g);
  assert.ok(fireMissile(g)); assert.deepEqual(g.aerial.ammo, [false, true]);
  assert.equal(g.aerial.missiles.length, 1); assert.equal(g.aerial.missiles[0].side, -1);
  assert.equal(fireMissile(g), false);
  stepAerial(g, JET.fireCooldown + 0.01, 0);
  assert.ok(fireMissile(g)); assert.deepEqual(g.aerial.ammo, [false, false]);
  assert.equal(g.aerial.missiles.length, 2); assert.equal(g.aerial.missiles[1].side, 1);
  stepAerial(g, JET.fireCooldown + 0.01, 0);
  assert.equal(fireMissile(g), false);
});
check('missiles home onto the blimp and explode it without damaging the player', () => {
  const g = setup('jet', 1000); lock(g); assert.ok(fireMissile(g));
  for (let i = 0; i < 240; i++) stepAerial(g, 1 / 60, 210);
  assert.equal(g.aerial.blimp.alive, false); assert.equal(g.extra, BLIMP.points);
  assert.equal(g.tailDamage, 0); assert.equal(g.aerial.missiles.length, 0);
});
check('a moving scout can be locked, hit, and removed before it attacks', () => {
  const g = setup(); g.aerial.blimp = null; g.clock = 1;
  g.ufo = { at: 0, end: 20, strike: 0, strikeFrom: Infinity, hitAt: Infinity,
    keys: [{ t: 0, move: 'hover', right: 0, up: 0, ahead: 800 }, { t: 20, move: 'hover', right: 0, up: 0, ahead: 800 }] };
  lock(g); assert.equal(g.aerial.target.id, 'ufo'); assert.ok(fireMissile(g));
  for (let i = 0; i < 120; i++) { g.clock += 1 / 60; stepAerial(g, 1 / 60, 0); }
  assert.equal(g.ufo, null); assert.equal(g.extra, 1000); assert.equal(g.slow, 1);
  assert.equal(g.aerial.target, null);
});
check('steering can bring a world-fixed UFO into the nose cone', () => {
  const g = setup(); g.aerial.blimp = null; g.clock = 1;
  g.ufo = { at: 0, end: 20, strike: 0, strikeFrom: Infinity, hitAt: Infinity,
    keys: [{ t: 0, move: 'hover', right: 250, up: 0, ahead: 800 }, { t: 20, move: 'hover', right: 250, up: 0, ahead: 800 }] };
  stepAerial(g, 0.1, 0); assert.equal(g.aerial.target, null);
  const before = aerialTargets(g)[0];
  g.heading = Math.atan2(250, 800) * 180 / Math.PI;
  lock(g);
  const after = aerialTargets(g)[0];
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.z - after.z) < 1e-6);
  assert.equal(g.aerial.target.id, 'ufo'); assert.equal(g.aerial.lock, 1);
  assert.ok(fireMissile(g));
});
check('a hovering scout keeps its altitude and closes as the player advances', () => {
  const g = setup(); g.aerial.blimp = null; g.clock = 1;
  g.ufo = { at: 0, end: 20, strike: 0, strikeFrom: Infinity, hitAt: Infinity,
    keys: [{ t: 0, move: 'hover', right: 0, up: 60, ahead: 800 }, { t: 20, move: 'hover', right: 0, up: 60, ahead: 800 }] };
  stepAerial(g, 0.1, 0); const before = aerialTargets(g)[0];
  g.alt += 100; stepAerial(g, 1, 200); const after = aerialTargets(g)[0];
  assert.equal(after.y, before.y); assert.equal(after.z, before.z + 200);
});
check('swept projectile collision cannot skip a target on a long frame', () => {
  assert.equal(sweptDistance({ x: 0, y: 0, z: -500 }, { x: 0, y: 0, z: 500 }), 0);
  const g = setup('jet', 750); lock(g); fireMissile(g);
  stepAerial(g, 1, 300);
  assert.equal(g.aerial.blimp.alive, false); assert.equal(g.tailDamage, 0);
});
check('leaving or crashing freezes combat; other rides cannot launch missiles', () => {
  for (const mode of ['airliner', 'ufo']) { const g = setup(mode); lock(g); assert.equal(fireMissile(g), false); }
  const g = setup(); lock(g); g.phase = 'crashed';
  const snapshot = JSON.stringify(g.aerial); assert.equal(fireMissile(g), false); stepAerial(g, 10, 300);
  assert.equal(JSON.stringify(g.aerial), snapshot);
});
check('a replay restores the elevator, both missiles, and encounter state', () => {
  const g = setup(); lock(g); fireMissile(g); g.tailDamage = 1;
  startAerial(g, 0); assert.equal(g.tailDamage, 0); assert.deepEqual(g.aerial.ammo, [true, true]);
  assert.equal(g.aerial.missiles.length, 0); assert.equal(g.aerial.lock, 0);
  assert.equal(g.aerial.scoutAnchor, null);
});
check('the shared leaderboard ceiling accepts the blimp bonus on a short flight', () => {
  assert.ok(scoreCeiling(3000) >= 5000 + 500);
});
console.log(`\n  ${passed} aerial combat checks passed\n`);
