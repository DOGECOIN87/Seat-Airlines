/**
 * The daily post of the day's top pilots: its words, its day, and posting
 * as the airline against a fake X — only the airline's own account kept,
 * the refresh token rotated as X requires.
 *
 *   npm test
 */
import { dailyText, utcDay, shortAddress } from '../dist-test/daily.js';
import { airlineName, finishAirlineConnect, postAsAirline, startAirlineConnect } from '../dist-test/xshare.js';

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, m };
};
const env = { X_CLIENT_ID: 'id', X_CLIENT_SECRET: 'secret', X_API_BASE: 'https://x.test', X_AUTHORIZE_URL: 'https://x.test/authorize' };

/** A fake X: who signs in, what it has posted, and how many refreshes. */
const fakeX = (username) => {
  const x = { posts: [], refreshes: 0, refreshTokens: ['r0'] };
  x.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/2/oauth2/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'refresh_token') {
        if (p.get('refresh_token') !== x.refreshTokens.at(-1)) return new Response('{"error_description":"stale"}', { status: 400 });
        x.refreshes++;
        x.refreshTokens.push(`r${x.refreshes}`);
      }
      return Response.json({ access_token: `a${x.refreshes}`, refresh_token: x.refreshTokens.at(-1), expires_in: 7200 });
    }
    if (u.pathname === '/2/users/me') return Response.json({ data: { username } });
    if (u.pathname === '/2/tweets') {
      x.posts.push(JSON.parse(init.body).text);
      return Response.json({ data: { id: String(100 + x.posts.length) } });
    }
    return new Response('not found', { status: 404 });
  };
  return x;
};

console.log('\nthe daily post');

await check('the words: medals, short wallets, scores, and the way to the site', () => {
  const day = utcDay(Date.UTC(2026, 9, 4, 15));
  const text = dailyText([
    { address: 'Hn1i7bLb7oHpAL5AoyGvkn7YgwmWrVTbVsjXA1LYnELo', score: 18234 },
    { address: 'Bkuddk94i6Y5rRJ94pNzpdDxzvW7CczLPyq4MfN1pump', score: 9050 },
  ], day.start, 'seat-airlines.space');
  assert(text.includes('Top 2 pilots · Oct 4'), text);
  assert(text.includes('🥇 Hn1i…nELo · 18,234') && text.includes('🥈 Bkud…pump · 9,050'), text);
  assert(text.endsWith('seat-airlines.space'), text);
  assert(text.length <= 280, `${text.length} characters`);
  assert(dailyText([], day.start, 'x') === null, 'posted for a day nobody flew');
  const five = dailyText(Array.from({ length: 5 }, (_, i) => ({ address: 'A'.repeat(44), score: 999999 - i })), day.start, 'seat-airlines.space');
  assert(five.length <= 280, `five pilots run to ${five.length} characters`);
  assert(shortAddress('abc') === 'abc', 'a short address was cut');
});

await check('the day is the UTC day, start to end', () => {
  const d = utcDay(Date.UTC(2026, 9, 4, 23, 50));
  assert(d.key === '2026-10-04' && d.start === Date.UTC(2026, 9, 4) && d.end === Date.UTC(2026, 9, 5), JSON.stringify(d));
});

await check('only the airline\'s own account is kept', async () => {
  const store = kv();
  const x = fakeX('SomebodyElse');
  const to = new URL(await startAirlineConnect(env, store, 'https://w.test'));
  assert(to.searchParams.get('redirect_uri') === 'https://w.test/x/airline/callback', 'wrong way back');
  let threw = false;
  try { await finishAirlineConnect(env, store, x.fetch, 'https://w.test', to.searchParams.get('state'), 'code', 'SeatAirlines'); }
  catch (e) { threw = /not @SeatAirlines/.test(e.message); }
  assert(threw, 'another account was accepted');
  assert((await airlineName(store)) === null, 'another account was kept');
});

await check('connected, it posts as the airline, refreshing and keeping the rotated token', async () => {
  const store = kv();
  const x = fakeX('seatairlines');
  const to = new URL(await startAirlineConnect(env, store, 'https://w.test'));
  const as = await finishAirlineConnect(env, store, x.fetch, 'https://w.test', to.searchParams.get('state'), 'code', '@SeatAirlines');
  assert(as === 'seatairlines' && (await airlineName(store)) === 'seatairlines', 'not kept');
  const url = await postAsAirline(env, store, x.fetch, 'hello');
  assert(url === 'https://x.com/seatairlines/status/101' && x.posts[0] === 'hello', url);
  // Expire it, twice: each refresh must use the token the last one handed back.
  for (let i = 0; i < 2; i++) {
    const held = JSON.parse(store.m.get('xairline'));
    store.m.set('xairline', JSON.stringify({ ...held, expires: 0 }));
    await postAsAirline(env, store, x.fetch, `again ${i}`);
  }
  assert(x.refreshes === 2 && x.posts.length === 3, `${x.refreshes} refreshes, ${x.posts.length} posts`);
});

await check('not connected, it says so rather than posting', async () => {
  let msg = '';
  try { await postAsAirline(env, kv(), fakeX('seatairlines').fetch, 'hello'); } catch (e) { msg = e.message; }
  assert(/not connected/.test(msg), msg);
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
