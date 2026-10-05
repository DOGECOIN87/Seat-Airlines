/**
 * The embedded-wallet routes: the key stays here, and only this site may
 * spend it. Run with:
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { handleHelius, trustedOrigin, MAX_HELIUS_BODY } from '../dist-test/helius.js';

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

const KEY = 'test-key';
const env = { HELIUS_API_KEY: KEY };
const cors = { 'access-control-allow-origin': 'https://seat-airlines.space' };

/** A fake upstream that records what it was asked and answers `answer`. */
const upstream = (answer = { ok: true }, status = 200) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
};
const req = (path, init) => new Request(`https://worker.test/helius/${path}`, init);

console.log('\nembedded wallets');

await check('only the listed origins are trusted, and a missing origin never is', () => {
  const list = 'https://seat-airlines.space,https://www.seat-airlines.space';
  assert.equal(trustedOrigin(list, 'https://seat-airlines.space'), true);
  assert.equal(trustedOrigin(list, 'https://evil.example'), false);
  assert.equal(trustedOrigin(list, null), false);
  assert.equal(trustedOrigin('', 'http://localhost:3000'), true);
});

await check('status says whether a key is set, to anybody, without saying the key', async () => {
  const on = await handleHelius(req('status'), env, cors, false, upstream());
  assert.deepEqual(await on.json(), { ready: true });
  const off = await handleHelius(req('status'), {}, cors, false, upstream());
  assert.deepEqual(await off.json(), { ready: false });
});

await check('without a key every other route is 503 and nothing goes upstream', async () => {
  const up = upstream();
  const res = await handleHelius(req('waas/config'), {}, cors, true, up);
  assert.equal(res.status, 503);
  assert.equal(up.calls.length, 0);
});

await check('another site is refused before anything is spent', async () => {
  const up = upstream();
  for (const [path, init] of [['waas/config'], ['rpc', { method: 'POST', body: '{}' }], ['send', { method: 'POST', body: '{}' }]]) {
    const res = await handleHelius(req(path, init), env, cors, false, up);
    assert.equal(res.status, 403);
  }
  assert.equal(up.calls.length, 0);
});

await check('the bootstrap is fetched with the key in a header, and the key is not in the answer', async () => {
  const up = upstream({ organizationId: 'o', authProxyConfigId: 'a' });
  const res = await handleHelius(req('waas/config'), env, cors, true, up);
  assert.equal(res.status, 200);
  assert.equal(up.calls[0].url, 'https://dev-api.helius.xyz/v0/waas/config');
  assert.equal(up.calls[0].init.headers['x-api-key'], KEY);
  assert.ok(!(await res.text()).includes(KEY));
});

await check('registration is forwarded as sent', async () => {
  const up = upstream({});
  const body = JSON.stringify({ address: 'abc' });
  await handleHelius(req('waas/wallets', { method: 'POST', body }), env, cors, true, up);
  assert.equal(up.calls[0].url, 'https://dev-api.helius.xyz/v0/waas/wallets');
  assert.equal(up.calls[0].init.body, body);
});

await check('rpc is mainnet only, and an oversized body is refused', async () => {
  const up = upstream({ result: 1 });
  const dev = await handleHelius(req('rpc?cluster=devnet', { method: 'POST', body: '{}' }), env, cors, true, up);
  assert.equal(dev.status, 400);
  const big = await handleHelius(req('rpc', { method: 'POST', body: 'x'.repeat(MAX_HELIUS_BODY + 1) }), env, cors, true, up);
  assert.equal(big.status, 413);
  assert.equal(up.calls.length, 0);
  const ok = await handleHelius(req('rpc?cluster=mainnet-beta', { method: 'POST', body: '{"method":"getSlot"}' }), env, cors, true, up);
  assert.equal(ok.status, 200);
  assert.ok(up.calls[0].url.startsWith('https://mainnet.helius-rpc.com/'));
});

await check('send goes through Sender and answers the signature', async () => {
  const up = upstream({ result: 'sig' });
  const res = await handleHelius(req('send', { method: 'POST', body: JSON.stringify({ transaction: 'AQ==' }) }), env, cors, true, up);
  assert.deepEqual(await res.json(), { signature: 'sig' });
  assert.ok(up.calls[0].url.startsWith('https://sender.helius-rpc.com/fast'));
  const none = await handleHelius(req('send', { method: 'POST', body: '{}' }), env, cors, true, up);
  assert.equal(none.status, 400);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
