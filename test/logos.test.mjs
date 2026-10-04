/**
 * The airline's floating medallions: where they turn up, how they are
 * flown through, and what it pays.
 *
 *   npm test
 */
import { GAME, FEET, dealFailures, fireBoost, fly, newGame } from '../dist-test/landingGame.js';
import { LOGOS, collectLogos, newLogos, startLogos, stepLogos } from '../dist-test/logos.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* The spawns are random; the same seeds every time. */
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

check('medallions turn up ahead after they start, and no more than a couple at once', () => {
  seed = 7;
  const air = newLogos();
  assert(air.next === Infinity, 'none turn up before they start');
  startLogos(air);
  for (let t = 0; t < 300; t += 0.5) {
    stepLogos(air, 0.5, 130, 0, 2000);
    for (const l of air.list) {
      if (l.age > 0.6) continue; // only the newly turned up
      assert(l.z < 0, 'one turned up behind the aeroplane');
      assert(Math.hypot(l.x, l.z) >= LOGOS.ahead[0] * 0.9, 'one turned up too close');
      assert(l.alt >= LOGOS.floor, 'one hangs under the floor');
      assert(!l.taken, 'a fresh one is taken');
    }
  }
  assert(air.list.length > 0, 'none ever turned up');
  assert(air.list.length <= LOGOS.most, `${air.list.length} at once`);
});

check('they go by as the aeroplane flies, and fade out with age', () => {
  seed = 11;
  const air = newLogos();
  startLogos(air);
  for (let t = 0; t < 30 && air.list.length === 0; t += 0.5) stepLogos(air, 0.5, 130, 0, 2000);
  assert(air.list.length > 0, 'none turned up to watch');
  const l = air.list[0];
  const z0 = l.z;
  stepLogos(air, 1, 130, 0, 2000);
  assert(Math.abs(l.z - (z0 + 130)) < 1, 'it did not go by with the flight');
  const spin0 = l.spin;
  stepLogos(air, 1, 130, 0, 2000);
  assert(l.spin > spin0, 'it is not spinning');
  for (let t = 0; t < 120; t += 1) stepLogos(air, 1, 130, 0, 2000);
  assert(air.list.length === 0 || air.list.every((m) => m !== l), 'it never aged out');
});

check('flying through one takes it, and only close ones', () => {
  const air = newLogos();
  air.list.push(
    { x: 0, z: 0, alt: 2000, r: LOGOS.collect, spin: 0, bob: 0, taken: false, age: 5, life: 40 },
    { x: 500, z: 0, alt: 2000, r: LOGOS.collect, spin: 0, bob: 0, taken: false, age: 5, life: 40 },
    { x: 0, z: 0, alt: 2300, r: LOGOS.collect, spin: 0, bob: 0, taken: false, age: 5, life: 40 },
  );
  assert(collectLogos(air, 2000) === 1, 'the one under the nose was not taken');
  assert(air.list[0].taken && !air.list[1].taken && !air.list[2].taken, 'the wrong ones went');
  assert(collectLogos(air, 2000) === 0, 'a taken one paid twice');
});

check('a flight starts with its boosts, and lighting one spends a charge', () => {
  const g = newGame();
  g.phase = 'flying';
  g.failed = 1;
  assert(g.boostCharges === GAME.boostCharges, 'not dealt its charges');
  assert(fireBoost(g) === true, 'would not light');
  assert(g.boostCharges === GAME.boostCharges - 1, 'no charge spent');
  assert(Math.abs(g.boostLeft - GAME.boostSeconds) < 0.01, 'not burning its seconds');
  assert(fireBoost(g) === false, 'lit twice at once');
  // Burn it out.
  for (let t = 0; t < GAME.boostSeconds + 1; t += 1 / 60) fly(g, 0, 0, 1 / 60);
  assert(g.boostLeft === 0, 'never burned out');
  assert(g.boostLevel < 0.05, 'the level never eased back');
  assert(fireBoost(g) === true, 'would not light again');
  assert(fireBoost(g) === false, 'a fourth boost lit');
});

check('nothing lights with both engines gone, or before the flight', () => {
  const g = newGame();
  assert(fireBoost(g) === false, 'lit while idle');
  g.phase = 'flying';
  g.both = true;
  assert(fireBoost(g) === false, 'lit with no engines left');
});

check('a boost pushes it forward and buys it lift again', () => {
  const setup = () => {
    const g = newGame();
    Object.assign(g, { phase: 'flying', failed: 1, damage: 0.5, speed: 120, alt: 2000, pitch: 0, bank: 0, rollRate: 0 });
    return g;
  };
  seed = 99;
  const calm = setup();
  seed = 99;
  const lit = setup();
  assert(fireBoost(lit), 'would not light');
  let vsC = 0, vsL = 0, midC = 0, midL = 0;
  // Six seconds, the wings held level throughout: the only difference is the boost.
  for (let i = 0; i < 360; i++) {
    for (const g of [calm, lit]) { g.bank = 0; g.rollRate = 0; }
    vsC = fly(calm, 0, 0.2, 1 / 60).vs;
    vsL = fly(lit, 0, 0.2, 1 / 60).vs;
    // Three seconds in, mid-burn.
    if (i === 180) { midC = vsC; midL = vsL; }
    calm.alt += vsC / 60;
    lit.alt += vsL / 60;
  }
  assert(lit.speed > calm.speed + 15, `no push forward: ${lit.speed.toFixed(0)} vs ${calm.speed.toFixed(0)} m/s`);
  assert(midL > midC + 5, `no lift bought: ${midL.toFixed(1)} vs ${midC.toFixed(1)} m/s`);
  assert(lit.alt > calm.alt + 40, `no height kept: ${(lit.alt - calm.alt).toFixed(0)} m`);
});

check('dealFailures deals the boosts and the medallions back', () => {
  const g = newGame();
  g.boostCharges = 0;
  g.logos.list.push({ x: 0, z: 0, alt: 0, r: 1, spin: 0, bob: 0, taken: true, age: 0, life: 1 });
  dealFailures(g);
  assert(g.boostCharges === GAME.boostCharges, 'charges not dealt back');
  assert(g.boostLeft === 0 && g.boostLevel === 0, 'a boost carried over');
  assert(g.logos.list.length === 0, 'medallions carried over');
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
