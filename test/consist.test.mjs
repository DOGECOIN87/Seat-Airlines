/**
 * The railway's consist: a carriage at every 1-2-5 step of market cap, the
 * grade bounded, and the speed sane for any reading.
 *
 *   npm test
 */
import { CARRIAGE_STEPS, MAX_CARRIAGES, MAX_GRADE, carriagesFor, gradeFor, nextCarriageAt, towardNextCarriage, trainSpeedFor } from '../dist-test/consist.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nthe consist');

check('steps run 1-2-5 from $10K to $200M', () => {
  assert(CARRIAGE_STEPS[0] === 10_000, `first ${CARRIAGE_STEPS[0]}`);
  assert(CARRIAGE_STEPS[6] === 1_000_000, `seventh ${CARRIAGE_STEPS[6]}`);
  assert(CARRIAGE_STEPS[MAX_CARRIAGES - 1] === 200_000_000, `last ${CARRIAGE_STEPS[MAX_CARRIAGES - 1]}`);
  for (let i = 1; i < CARRIAGE_STEPS.length; i++) assert(CARRIAGE_STEPS[i] > CARRIAGE_STEPS[i - 1], 'not rising');
});

check('a carriage is coupled exactly at its step', () => {
  assert(carriagesFor(9_999) === 0, 'light engine under $10K');
  assert(carriagesFor(10_000) === 1, '$10K');
  assert(carriagesFor(163_000) === 4, '$163K');
  assert(carriagesFor(1_000_000) === 7, '$1M');
  assert(carriagesFor(5e9) === MAX_CARRIAGES, 'capped');
  assert(carriagesFor(NaN) === 0, 'NaN');
});

check('the next step is the one after', () => {
  assert(nextCarriageAt(163_000) === 200_000, `${nextCarriageAt(163_000)}`);
  assert(nextCarriageAt(5e9) === null, 'none past the last');
});

check('progress to the next carriage is 0–1 and rising', () => {
  let last = -1;
  for (let c = 100_000; c < 200_000; c += 5_000) {
    const t = towardNextCarriage(c);
    assert(t >= 0 && t <= 1, `${c}: ${t}`);
    assert(t >= last, `${c} fell`);
    last = t;
  }
});

check('grade bounded, signed with the market', () => {
  assert(gradeFor(26) === MAX_GRADE && gradeFor(-26) === -MAX_GRADE, 'bounded');
  assert(gradeFor(5) > 0 && gradeFor(-5) < 0, 'signed');
  assert(gradeFor(NaN) === 0, 'NaN');
});

check('speed sane for any reading', () => {
  for (const kt of [0, 212, 400, 700, 1e6, NaN]) {
    const v = trainSpeedFor(kt);
    assert(v >= 20 && v <= 95, `${kt}: ${v}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
