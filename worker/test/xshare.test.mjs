/**
 * Posting to X, end to end, against a fake X. Nothing here talks to x.com.
 *
 * Starts a fake X API on :8789, then drives a Worker running with
 * `wrangler dev --local` pointed at it (see `npm run test:x`, which starts
 * both): connect, the trip back, a video post, the fall back to the card when
 * X refuses the video, the fall back to the compose box when X refuses the
 * post, a token refresh, a revoked token, and disconnecting.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:3000';
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── The fake X ─────────────────────────────────────────────────────────── */

const calls = [];
const fakeX = {
  expiresIn: 7200,
  refuse: {},          // path prefix → status, for the next calls to it
  processing: 1,       // STATUS polls before a video is done
  tokens: new Map(),   // access token → true while valid
  codes: new Map(),    // code → challenge
};
let seq = 0;
const read = (req) => new Promise((resolve) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => resolve(Buffer.concat(b))); });
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await read(req);
  calls.push({ method: req.method, path: url.pathname, query: url.search, headers: req.headers, body });
  for (const [prefix, status] of Object.entries(fakeX.refuse)) {
    if (url.pathname.startsWith(prefix)) return send(res, status, { title: 'Refused', detail: `fake X refused ${prefix} with ${status}` });
  }
  if (url.pathname === '/2/oauth2/token') {
    if (req.headers.authorization !== `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`) return send(res, 401, { error: 'bad client' });
    const p = new URLSearchParams(body.toString());
    if (p.get('grant_type') === 'authorization_code') {
      const challenge = fakeX.codes.get(p.get('code'));
      if (!challenge || b64url(createHash('sha256').update(p.get('code_verifier')).digest()) !== challenge) return send(res, 400, { error: 'invalid_grant' });
      if (!p.get('redirect_uri')?.endsWith('/x/callback')) return send(res, 400, { error: 'bad redirect' });
    } else if (p.get('grant_type') !== 'refresh_token' || !p.get('refresh_token')?.startsWith('refresh-')) {
      return send(res, 400, { error: 'invalid_grant' });
    }
    const access = `access-${++seq}`;
    fakeX.tokens.set(access, true);
    return send(res, 200, { access_token: access, refresh_token: `refresh-${seq}`, expires_in: fakeX.expiresIn, token_type: 'bearer' });
  }
  if (url.pathname === '/2/oauth2/revoke') return send(res, 200, { revoked: true });
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!fakeX.tokens.get(token)) return send(res, 401, { title: 'Unauthorized' });
  if (url.pathname === '/2/users/me') return send(res, 200, { data: { id: '1', username: 'testpilot' } });
  if (url.pathname === '/2/media/upload/initialize') {
    const j = JSON.parse(body.toString());
    return send(res, 200, { data: { id: `m${++seq}`, media_key: `7_${seq}`, expires_after_secs: 86400, _category: j.media_category } });
  }
  if (/\/append$/.test(url.pathname)) return send(res, 200, {});
  if (/\/finalize$/.test(url.pathname)) {
    return send(res, 200, { data: { id: url.pathname.split('/')[4], processing_info: fakeX.processing ? { state: 'pending', check_after_secs: 1 } : undefined } });
  }
  if (url.pathname === '/2/media/upload' && url.searchParams.get('command') === 'STATUS') {
    return send(res, 200, { data: { processing_info: { state: 'succeeded' } } });
  }
  if (url.pathname === '/2/tweets') return send(res, 201, { data: { id: String(1000 + ++seq), text: JSON.parse(body.toString()).text } });
  send(res, 404, { title: 'Not found' });
});
await new Promise((r) => server.listen(8789, '127.0.0.1', r));

/* ── Helpers ────────────────────────────────────────────────────────────── */

const w = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init, headers: { origin: ORIGIN, ...(init.headers ?? {}) } });
const since = (n) => calls.slice(n);

async function connect() {
  const nonce = 'n'.repeat(8) + Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
  const go = await w(`/x/connect?n=${nonce}`);
  assert(go.status === 302, `connect: ${go.status}`);
  const to = new URL(go.headers.get('location'));
  const challenge = to.searchParams.get('code_challenge');
  const code = `code-${Math.random()}`;
  fakeX.codes.set(code, challenge);
  const back = await w(`/x/callback?state=${encodeURIComponent(to.searchParams.get('state'))}&code=${encodeURIComponent(code)}`);
  assert(back.status === 302, `callback: ${back.status}`);
  const loc = new URL(back.headers.get('location'));
  const frag = new URLSearchParams(loc.hash.slice(1));
  return { to, loc, frag, nonce, handle: frag.get('x') };
}

const video = new Uint8Array(5 * 1024 * 1024 + 7).fill(1); // three chunks
const image = new Uint8Array(40_000).fill(2);
function form({ withVideo = true, withImage = true, text = 'Kept her in the air 12s.\nhttps://seat-airlines.space/' } = {}) {
  const f = new FormData();
  f.append('text', text);
  if (withVideo) f.append('video', new Blob([video], { type: 'video/mp4' }), 'flight.mp4');
  if (withImage) f.append('image', new Blob([image], { type: 'image/jpeg' }), 'flight.jpg');
  return f;
}
const post = (handle, f = form()) => w('/x/post', { method: 'POST', headers: { authorization: `Bearer ${handle}` }, body: f });
const tweets = (from) => since(from).filter((c) => c.path === '/2/tweets');
const inits = (from) => since(from).filter((c) => c.path === '/2/media/upload/initialize').map((c) => JSON.parse(c.body.toString()).media_category);

/* ── The checks ─────────────────────────────────────────────────────────── */

console.log('X posting, against a fake X');
let me;

await check('status says it can post, and nobody is connected', async () => {
  const s = await (await w('/x/status')).json();
  assert(s.available === true && s.media === 'video' && s.connected === false, JSON.stringify(s));
});

await check('connect sends the player to X with PKCE, the right scopes and the callback', async () => {
  me = await connect();
  const q = me.to.searchParams;
  assert(q.get('client_id') === CLIENT_ID, 'client id');
  assert(q.get('code_challenge_method') === 'S256' && q.get('code_challenge')?.length >= 43, 'pkce');
  assert(q.get('scope') === 'tweet.read tweet.write users.read media.write offline.access', q.get('scope'));
  assert(q.get('redirect_uri') === `${BASE}/x/callback`, q.get('redirect_uri'));
});

await check('the trip back lands on the site with the handle, the name and the nonce', async () => {
  assert(me.loc.origin + me.loc.pathname === `${ORIGIN}/x-connected/`, me.loc.toString());
  assert(/^[0-9a-f]{64}$/.test(me.handle), 'handle');
  assert(me.frag.get('u') === 'testpilot', 'username');
  assert(me.frag.get('n') === me.nonce, 'nonce');
});

await check('a trip back cannot be replayed', async () => {
  const again = await w(`/x/callback?state=${encodeURIComponent(me.to.searchParams.get('state'))}&code=whatever`);
  const frag = new URLSearchParams(new URL(again.headers.get('location')).hash.slice(1));
  assert(frag.get('error') && !frag.get('x'), frag.toString());
});

await check('status knows the handle', async () => {
  const s = await (await w('/x/status', { headers: { authorization: `Bearer ${me.handle}` } })).json();
  assert(s.connected === true && s.username === 'testpilot', JSON.stringify(s));
});

await check('a post uploads the video in chunks, waits for it, and posts it', async () => {
  const from = calls.length;
  const r = await (await post(me.handle)).json();
  assert(r.posted === true && r.media === 'video' && /^https:\/\/x\.com\/testpilot\/status\/\d+$/.test(r.url), JSON.stringify(r));
  assert(since(from).filter((c) => c.path.endsWith('/append')).length === 3, 'three appends');
  assert(since(from).some((c) => c.query.includes('command=STATUS')), 'status polled');
  assert(JSON.stringify(inits(from)) === '["tweet_video"]', inits(from).join());
  const t = tweets(from);
  assert(t.length === 1, `${t.length} posts`);
  const sent = JSON.parse(t[0].body.toString());
  assert(sent.media.media_ids.length === 1 && sent.text.startsWith('Kept her'), JSON.stringify(sent));
});

await check('X refuses the video (over a limit): the card goes instead, as one post', async () => {
  const realInit = '/2/media/upload/initialize';
  const from = calls.length;
  // Refuse the first initialize only: the video's.
  let first = true;
  const orig = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (first && req.url === realInit) {
      first = false;
      calls.push({ method: req.method, path: req.url, query: '', headers: req.headers, body: Buffer.from('{"media_category":"tweet_video"}') });
      req.resume();
      return send(res, 429, { title: 'Too Many Requests', detail: 'Usage cap exceeded' });
    }
    orig(req, res);
  });
  const r = await (await post(me.handle)).json();
  server.removeAllListeners('request');
  server.on('request', orig);
  assert(r.posted === true && r.media === 'image', JSON.stringify(r));
  assert(/429/.test(r.note ?? ''), `note: ${r.note}`);
  assert(JSON.stringify(inits(from)) === '["tweet_video","tweet_image"]', inits(from).join());
  assert(tweets(from).length === 1, 'one post');
});

await check('X out of credit for posts: nothing is posted, and the page is told to use the compose box', async () => {
  fakeX.refuse = { '/2/tweets': 402 };
  const from = calls.length;
  const r = await (await post(me.handle)).json();
  fakeX.refuse = {};
  assert(r.posted === false && r.fallback === 'link' && !r.reconnect, JSON.stringify(r));
  assert(/402/.test(r.reason), r.reason);
  assert(tweets(from).length === 1 && since(from).filter((c) => c.path === '/2/tweets').length === 1, 'one attempt only');
});

await check('X refuses all uploads: the compose box, and no post attempted', async () => {
  fakeX.refuse = { '/2/media/upload': 403 };
  const from = calls.length;
  const r = await (await post(me.handle)).json();
  fakeX.refuse = {};
  assert(r.posted === false && r.fallback === 'link', JSON.stringify(r));
  assert(tweets(from).length === 0, 'no post');
});

await check('a card on its own posts as the card', async () => {
  const from = calls.length;
  const r = await (await post(me.handle, form({ withVideo: false }))).json();
  assert(r.posted === true && r.media === 'image', JSON.stringify(r));
  assert(JSON.stringify(inits(from)) === '["tweet_image"]', inits(from).join());
});

await check('a token about to expire is refreshed before posting', async () => {
  fakeX.expiresIn = 30;
  const short = await connect();
  fakeX.expiresIn = 7200;
  const from = calls.length;
  const r = await (await post(short.handle, form({ withVideo: false }))).json();
  assert(r.posted === true, JSON.stringify(r));
  const refresh = since(from).find((c) => c.path === '/2/oauth2/token');
  assert(refresh && new URLSearchParams(refresh.body.toString()).get('grant_type') === 'refresh_token', 'refreshed');
});

await check('a token X has revoked: the connection is forgotten and the page told to reconnect', async () => {
  const other = await connect();
  for (const k of fakeX.tokens.keys()) fakeX.tokens.set(k, false);
  const r = await (await post(other.handle, form({ withVideo: false }))).json();
  assert(r.posted === false && r.reconnect === true, JSON.stringify(r));
  const s = await (await w('/x/status', { headers: { authorization: `Bearer ${other.handle}` } })).json();
  assert(s.connected === false, 'forgotten');
});

await check('posts are capped per hour', async () => {
  const p = await connect();
  let last;
  for (let i = 0; i < 7; i++) last = await (await post(p.handle, form({ withVideo: false }))).json();
  assert(last.posted === false && /hour/.test(last.reason), JSON.stringify(last));
});

await check('no handle, a made-up handle, and a bad form are refused without calling X', async () => {
  assert((await w('/x/post', { method: 'POST', body: form() })).status === 401, 'no handle');
  const fake = (await (await post('a'.repeat(64))).json());
  assert(fake.posted === false && fake.reconnect === true, JSON.stringify(fake));
  const p = await connect();
  const before = calls.length;
  assert((await post(p.handle, form({ withVideo: false, withImage: false }))).status === 400, 'no media');
  assert((await post(p.handle, form({ text: '' }))).status === 400, 'no words');
  assert(since(before).length === 0, 'X was not called');
});

await check('a connect link not from the site is refused', async () => {
  const r = await w('/x/connect?n=<script>');
  const frag = new URLSearchParams(new URL(r.headers.get('location')).hash.slice(1));
  assert(frag.get('error'), frag.toString());
});

await check('disconnecting revokes at X and forgets the handle', async () => {
  const from = calls.length;
  const r = await w('/x/session', { method: 'DELETE', headers: { authorization: `Bearer ${me.handle}` } });
  assert(r.status === 204, `${r.status}`);
  assert(since(from).filter((c) => c.path === '/2/oauth2/revoke').length === 2, 'both tokens revoked');
  const s = await (await w('/x/status', { headers: { authorization: `Bearer ${me.handle}` } })).json();
  assert(s.connected === false, 'forgotten');
});

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
