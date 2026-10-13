import assert from 'node:assert/strict';
import { RIDES, RIDE_PASS, canFly, flyableRides, passShort } from '../dist-test/rides.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok   ${name}`); };

test('the airliner is everybody’s; the F35 takes 500,000 $SEAT and the UFO 1,000,000', () => {
  assert.equal(RIDE_PASS.airliner, 0);
  assert.equal(RIDE_PASS.jet, 500_000);
  assert.equal(RIDE_PASS.ufo, 1_000_000);
});

test('no balance — no wallet, or not read yet — flies only the airliner', () => {
  for (const balance of [null, undefined, 0]) {
    assert.deepEqual(flyableRides(balance), { airliner: true, jet: false, ufo: false });
  }
});

test('the F35 opens at exactly 500,000 and not a token short of it', () => {
  assert.equal(canFly('jet', 499_999), false);
  assert.equal(canFly('jet', 499_999.99), false);
  assert.equal(canFly('jet', 500_000), true);
  assert.deepEqual(flyableRides(500_000), { airliner: true, jet: true, ufo: false });
});

test('the UFO opens at exactly 1,000,000, and with it everything', () => {
  assert.equal(canFly('ufo', 999_999), false);
  assert.deepEqual(flyableRides(1_000_000), { airliner: true, jet: true, ufo: true });
});

test('every ride is covered, and passes read short on a button', () => {
  assert.deepEqual(Object.keys(flyableRides(0)).sort(), [...RIDES].sort());
  assert.equal(passShort(500_000), '500K');
  assert.equal(passShort(1_000_000), '1M');
});

console.log(`  ${passed} passed, 0 failed`);
