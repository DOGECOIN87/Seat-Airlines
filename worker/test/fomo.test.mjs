import assert from 'node:assert/strict';
import worker from '../dist-test/occupancyWorker.js';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = originalNow();
Date.now = () => clock;
const stored = new Map();
const env = { BANNERS: { get: async key => stored.get(key) ?? null,
  put: async (key, value) => stored.set(key, value) } };
const wallets = [
  '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
  '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR',
  'CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8',
  'GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq',
  'LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY',
  '11111111111111111111111111111111',
];
let calls = 0;
let online = true;
globalThis.fetch = async url => {
  calls++;
  assert(String(url).startsWith('https://fomo-public.pootracker.app/v2/users/wallet/'));
  if (!online) return new Response('{}', { status: 503 });
  const address = String(url).split('/').at(-1);
  if (address === wallets[5]) return new Response('{}', { status: 404 });
  return Response.json({ id: 'profile-id', handle: 'pilot', name: 'Pilot',
    solanaAddress: address === wallets[1] ? wallets[0] : address,
    profilePicture: address === wallets[2] ? 'javascript:alert(1)' : 'https://images.example.org/pilot.webp' });
};
const read = addresses => worker.fetch(new Request(`https://worker.test/fomo/profiles?wallets=${encodeURIComponent(addresses.join(','))}`), env);
try {
  assert.equal((await read(['bad-address'])).status, 400);
  assert.equal((await read(Array.from({ length: 13 }, (_, i) => `wallet-${i}`))).status, 400);
  assert.equal(calls, 0, 'invalid requests must not reach the provider');

  const first = await (await read([wallets[0], wallets[0]])).json();
  assert.equal(first.available, true);
  assert.equal(first.profiles[wallets[0]].image, 'https://images.example.org/pilot.webp');
  assert.equal(calls, 1, 'duplicate wallets should resolve once');
  await read([wallets[0]]);
  assert.equal(calls, 1, 'a cached picture should not be requested again');

  const wrong = await (await read([wallets[1]])).json();
  assert.equal(wrong.profiles[wallets[1]], null, 'another wallet’s image must never be attached');
  assert.equal(wrong.available, false);
  const unsafe = await (await read([wallets[2]])).json();
  assert.equal(unsafe.profiles[wallets[2]].image, null, 'unsafe image schemes must keep the local placeholder');

  const before = calls;
  await Promise.all([read([wallets[3]]), read([wallets[3]])]);
  assert.equal(calls, before + 1, 'simultaneous views should share a lookup');

  const absent = await (await read([wallets[5]])).json();
  assert.equal(absent.available, true);
  assert.equal(absent.profiles[wallets[5]], null, 'unindexed wallets should use the original placeholder');
  const afterMissing = calls;
  await read([wallets[5]]);
  assert.equal(calls, afterMissing, 'missing profiles should also be cached');

  clock += 61 * 60 * 1000;
  online = false;
  const staleResponse = await read([wallets[0]]);
  assert.equal(staleResponse.headers.get('cache-control'), 'no-store');
  const stale = await staleResponse.json();
  assert.equal(stale.available, false);
  assert.deepEqual(stale.profiles[wallets[0]], first.profiles[wallets[0]], 'an outage must preserve a previous picture');
  const afterFailure = calls;
  const unavailable = await (await read([wallets[4]])).json();
  assert.equal(unavailable.profiles[wallets[4]], null);
  assert.equal(calls, afterFailure, 'provider failures should back off across wallets');

  clock += 61_000;
  let inFlight = 0;
  let peak = 0;
  globalThis.fetch = async url => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 20));
    inFlight--;
    return Response.json({ id: 'batch-profile', handle: 'pilot', solanaAddress: String(url).split('/').at(-1),
      profilePicture: 'https://images.example.org/pilot.webp' });
  };
  const batch = '23456789ABCD'.split('').map(last => '1'.repeat(31) + last);
  const complete = await (await read(batch)).json();
  assert.equal(complete.available, true);
  assert.equal(Object.values(complete.profiles).filter(profile => profile?.image).length, 12,
    'A full profile batch must return all profiles after every lookup wave');
  assert.equal(peak, 3, 'A full batch must keep provider concurrency bounded');
  console.log('Fomo profiles: exact wallet matching, safe images, cache, deduplication, stale fallback, outage backoff and complete batches passed.');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
