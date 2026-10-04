/**
 * DexScreener boosts: that the count of boosts running is read off the pair
 * endpoint's answer, and that anything else reads as none.
 *
 *   npm test
 */
import { activeBoosts } from '../dist-test/dexBoost.js';

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

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
