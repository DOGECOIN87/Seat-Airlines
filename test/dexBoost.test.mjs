/**
 * DexScreener boosts: that the count of boosts running is read off the pair
 * endpoint's answer, and that anything else reads as none.
 *
 *   npm test
 */
import { GOLDEN_TICKER, activeBoosts, boostStrength, cruiseSpeed } from '../dist-test/dexBoost.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\ndexscreener boosts');

check('boosts running on the pair are counted', () => {
  assert(activeBoosts({ pairs: [{ boosts: { active: 3 } }] }) === 3, 'pairs[0].boosts.active');
  assert(activeBoosts({ pair: { boosts: { active: 1 } } }) === 1, 'pair.boosts.active');
});

check('no boosts, or an answer it does not know, is none', () => {
  for (const body of [null, {}, { pairs: [] }, { pairs: [{}] }, { pairs: [{ boosts: {} }] },
    { pairs: [{ boosts: { active: 0 } }] }, { pairs: [{ boosts: { active: -2 } }] }, { pairs: [{ boosts: { active: 'x' } }] }, 'nonsense']) {
    assert(activeBoosts(body) === 0, `read ${JSON.stringify(body)} as boosted`);
  }
});

check('no Boosts, no burn; one, a clear one; more, harder, full at the Golden Ticker', () => {
  assert(boostStrength(0) === 0 && cruiseSpeed(0) === undefined, 'burning with none');
  const one = boostStrength(1);
  assert(one >= 0.35 && one < 0.5, `one Boost burns at ${one}`);
  let last = one;
  for (const n of [2, 10, 50, 200, 499]) {
    const s = boostStrength(n);
    assert(s > last && s < 1, `${n} Boosts at ${s}`);
    last = s;
  }
  assert(boostStrength(GOLDEN_TICKER) === 1 && boostStrength(5000) === 1, 'not full at the Golden Ticker');
  assert(cruiseSpeed(1) > 2 && cruiseSpeed(1) < 2.5, `full speed ${cruiseSpeed(1)}`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
