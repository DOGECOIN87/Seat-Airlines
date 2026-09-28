/**
 * The leaderboard's rules, exercised directly: what a post has to look like,
 * what a run's time allows, and that the message a wallet signs is the one
 * the server checks. A real ed25519 keypair signs a real score. Run with:
 *
 *   npm test
 */
import { webcrypto as crypto } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  climbBonus, implausible, newRunId, readScorePost, scoreCeiling, scoreChallenge, survivalRate, RUN_TTL_MS, SCORING,
} from '../dist-test/leaderboard.js';
import { verifySignature } from '../dist-test/verify.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const toBase58 = (bytes) => {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => B58[d]).join('');
};

let pass = 0;
let fail = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail++;
  }
};

const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const address = toBase58(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
const sign = async (message) =>
  toBase58(new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(message))));

const run = newRunId();
const post = (over = {}) => ({
  address, run, score: 4200, survived: 20, climb: 30, issued: new Date().toISOString(), signature: 'x', ...over,
});

console.log('leaderboard');

await check('a run id is 32 hex characters, and fresh each time', () => {
  assert.match(run, /^[0-9a-f]{32}$/);
  assert.notEqual(newRunId(), run);
});

await check('a well-formed post reads back as itself', () => {
  const p = readScorePost(post());
  assert.equal(typeof p, 'object');
  assert.equal(p.score, 4200);
});

await check('what is not a post is refused, and says why', () => {
  for (const bad of [
    null, 'x', {}, post({ address: 'not-base58!' }), post({ run: 'abc' }), post({ score: -1 }),
    post({ score: 1.5 }), post({ score: Number.NaN }), post({ survived: 'long' }), post({ signature: '' }),
  ]) assert.equal(typeof readScorePost(bad), 'string');
});

await check('the message signed is the message checked', async () => {
  const p = post();
  const message = scoreChallenge(p.address, p.run, p.score, p.issued);
  const signature = await sign(message);
  assert.equal(await verifySignature(address, message, signature), true);
  // The same signature over a bigger score is worthless.
  assert.equal(await verifySignature(address, scoreChallenge(p.address, p.run, 99999, p.issued), signature), false);
  // So is it for another run.
  assert.equal(await verifySignature(address, scoreChallenge(p.address, newRunId(), p.score, p.issued), signature), false);
});

await check('the message says it is not a transaction', () => {
  assert.match(scoreChallenge(address, run, 1, 'now'), /not a transaction/);
});

await check('a score the run had time for is kept', () => {
  const started = 1_000_000;
  // A thirty-second climb and twenty seconds on one engine: fifty-odd seconds in.
  assert.equal(implausible(post(), started, started + 55_000), null);
});

await check('a score the run had no time for is refused', () => {
  const started = 1_000_000;
  assert.match(implausible(post({ score: 50_000 }), started, started + 40_000), /more than the flight could have scored/);
  assert.match(implausible(post({ survived: 120 }), started, started + 60_000), /longer than the run/);
  assert.match(implausible(post({ climb: 3 }), started, started + 60_000), /that fast/);
});

await check('an engine that went early, low and fast, is believed', () => {
  const started = 1_000_000;
  // Gone at 4,000 ft after a nine-second climb, then forty seconds down.
  assert.equal(implausible(post({ climb: 9, survived: 40, score: 6000 }), started, started + 50_000), null);
});

await check('the ceiling only rises with time, and starts above an honest short flight', () => {
  let last = 0;
  for (let s = 0; s <= 900; s += 15) {
    const c = scoreCeiling(s * 1000);
    assert.ok(c >= last);
    last = c;
  }
  assert.ok(scoreCeiling(0) > 0);
});

await check('the climb bonus pays for speed and stops at par', () => {
  assert.equal(climbBonus(SCORING.climbPar + 10), 0);
  assert.ok(climbBonus(30) > climbBonus(60));
  // No faster than the floor, however fast it is claimed.
  assert.equal(climbBonus(1), climbBonus(SCORING.climbFloor));
  // An engine gone at half the height pays half as much for the same pace.
  assert.equal(climbBonus(15, 0.5), Math.round(climbBonus(30) / 2));
  assert.ok(climbBonus(1, 0.4) <= climbBonus(SCORING.climbFloor));
});

await check('level and low both pay, and together pay most', () => {
  const plain = survivalRate(45, 3000);
  const level = survivalRate(5, 3000);
  const low = survivalRate(45, 200);
  const both = survivalRate(5, 200);
  assert.ok(level > plain && low > plain && both > level && both > low);
});

await check('a run expires', () => {
  assert.ok(RUN_TTL_MS >= 10 * 60 * 1000);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
