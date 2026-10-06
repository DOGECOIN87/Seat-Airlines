/**
 * Posting a flight to X for the player, with their say-so.
 *
 * X will not let a link put a video on a post, so the only way a desktop
 * player's post carries the flight's video is for this service to upload it
 * and make the post through the X API, as them. That needs their permission,
 * once (OAuth 2.0 with PKCE), and then one post per press of Post, never more.
 *
 *   GET    /x/status     whether this deployment can post at all, and with what
 *   GET    /x/connect    off to X to ask the player's permission
 *   GET    /x/callback   back from X: keep the permission, send them to the site
 *   POST   /x/post       upload the flight and post it, as the player
 *   DELETE /x/session    forget the permission, and tell X to as well
 *
 * ── What it falls back to ─────────────────────────────────────────────────
 * X bills per call and caps them, and a video costs more calls than a
 * picture. So a post tries the video, then the card, and if X will take
 * neither (out of credit, over a cap, the player's token gone) it says so,
 * and the page sends the player to X's own compose box with the card's link
 * instead — which costs nothing and has always worked. `X_MEDIA` can also
 * pin it to pictures, or switch API posting off, without a deploy of code.
 *
 * ── What is kept ──────────────────────────────────────────────────────────
 * The page holds a random handle; this side keeps, under the handle's hash,
 * the player's X tokens encrypted with a key derived from the server-held
 * X_TOKEN_ENCRYPTION_KEY secret. The handle is an identifier, not a key.
 *
 * Nothing Cloudflare-shaped in here beyond a KV namespace, and the network
 * is a parameter, so the whole flow runs in a test against a fake X.
 */

export const X_SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
/** How long a trip to X to ask permission may take. */
export const CONNECT_TTL_SECONDS = 10 * 60;
/** How long an unused permission is kept. Each post renews it. */
export const LINK_TTL_SECONDS = 180 * 24 * 60 * 60;
/** Posts one player may make in an hour: far more than anybody shares. */
export const POSTS_PER_HOUR = 6;
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT = 1000;
/** Bytes per append: X takes up to 5 MB, and smaller keeps each request quick. */
const CHUNK = 2 * 1024 * 1024;
/** How long to wait for X to finish with a video before settling for the picture. */
const PROCESSING_BUDGET_MS = 25_000;

export type MediaMode = 'video' | 'image' | 'off';

export interface XEnv {
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  /** Random server-held secret used to encrypt OAuth tokens at rest. */
  X_TOKEN_ENCRYPTION_KEY?: string;
  /** 'video' (default), 'image' to post pictures only, 'off' for no API posting. */
  X_MEDIA?: string;
  /** For tests: where the X API and its consent page are. */
  X_API_BASE?: string;
  X_AUTHORIZE_URL?: string;
}

export const mediaMode = (env: XEnv): MediaMode => {
  const m = (env.X_MEDIA ?? '').trim().toLowerCase();
  return m === 'image' || m === 'off' ? m : 'video';
};
export const xConfigured = (env: XEnv): boolean => Boolean(
  env.X_CLIENT_ID?.trim() && env.X_CLIENT_SECRET?.trim() && env.X_TOKEN_ENCRYPTION_KEY?.trim(),
);
const apiBase = (env: XEnv) => (env.X_API_BASE?.trim() || 'https://api.x.com').replace(/\/+$/, '');
const authorizeUrl = (env: XEnv) => env.X_AUTHORIZE_URL?.trim() || 'https://x.com/i/oauth2/authorize';

/* ── Small crypto ──────────────────────────────────────────────────────── */

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** A handle: what the page keeps. 64 hex characters. */
export const isHandle = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
/** A page's nonce, to tie the trip back to the tab that started it. */
export const isNonce = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-Za-z_-]{16,64}$/.test(v);

const linkKey = async (handle: string) => `xlink:${hex(await sha256(`x-link:${handle}`))}`;
const tokenKey = async (env: XEnv) =>
  crypto.subtle.importKey('raw', await sha256(`x-token-key:${env.X_TOKEN_ENCRYPTION_KEY!.trim()}`), 'AES-GCM', false, ['encrypt', 'decrypt']);

export interface Tokens { access: string; refresh: string | null; expires: number }
interface StoredLink { u: string; iv: string; ct: string; posts: number[] }

async function seal(env: XEnv, t: Tokens): Promise<{ iv: string; ct: string }> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), new TextEncoder().encode(JSON.stringify(t))));
  return { iv: hex(iv), ct: btoa(String.fromCharCode(...ct)) };
}
async function open(env: XEnv, link: StoredLink): Promise<Tokens | null> {
  try {
    const iv = new Uint8Array(link.iv.match(/../g)!.map((h) => parseInt(h, 16)));
    const ct = Uint8Array.from(atob(link.ct), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await tokenKey(env), ct);
    return JSON.parse(new TextDecoder().decode(pt)) as Tokens;
  } catch {
    return null;
  }
}

/* ── Talking to X ──────────────────────────────────────────────────────── */

export type Fetch = typeof fetch;

/** An X refusal, with what it means for the fallback. */
export class XError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
  /** The player's permission is gone: connecting again is the only fix. */
  get unauthorised() { return this.status === 401; }
}

async function xFail(res: Response, what: string): Promise<never> {
  let detail = '';
  try {
    const body = (await res.json()) as { detail?: string; title?: string; error_description?: string; errors?: { message?: string }[] };
    detail = body.detail ?? body.error_description ?? body.title ?? body.errors?.[0]?.message ?? '';
  } catch {
    // Not JSON: the status is the message.
  }
  throw new XError(`${what}: ${res.status}${detail ? ` ${detail}` : ''}`, res.status);
}

const basic = (env: XEnv) => `Basic ${btoa(`${env.X_CLIENT_ID!.trim()}:${env.X_CLIENT_SECRET!.trim()}`)}`;

async function tokenRequest(env: XEnv, f: Fetch, params: Record<string, string>): Promise<Tokens> {
  const res = await f(`${apiBase(env)}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic(env) },
    body: new URLSearchParams({ ...params, client_id: env.X_CLIENT_ID!.trim() }),
  });
  if (!res.ok) await xFail(res, 'X would not grant access');
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!body.access_token) throw new XError('X sent no access token', 502);
  return { access: body.access_token, refresh: body.refresh_token ?? null, expires: Date.now() + (body.expires_in ?? 7200) * 1000 };
}

/** Where X is to send the player back to: this Worker, at whichever address it was reached. */
export const callbackUrl = (origin: string) => `${origin}/x/callback`;

/** The trip to X: where to send the player, and what to remember until they are back. */
export async function startConnect(env: XEnv, kv: KVNamespace, origin: string, nonce: string): Promise<string> {
  const state = b64url(random(24));
  const verifier = b64url(random(48));
  const challenge = b64url(await sha256(verifier));
  await kv.put(`xstate:${state}`, JSON.stringify({ verifier, nonce }), { expirationTtl: CONNECT_TTL_SECONDS });
  const to = new URL(authorizeUrl(env));
  to.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.X_CLIENT_ID!.trim(),
    redirect_uri: callbackUrl(origin),
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return to.toString();
}

/** Back from X: the permission, kept, and the handle and name for the page. */
export async function finishConnect(
  env: XEnv, kv: KVNamespace, f: Fetch, origin: string, state: string, code: string,
): Promise<{ handle: string; username: string; nonce: string }> {
  const raw = await kv.get(`xstate:${state}`);
  if (!raw) throw new XError('That trip to X has expired. Try connecting again.', 400);
  await kv.delete(`xstate:${state}`);
  const { verifier, nonce } = JSON.parse(raw) as { verifier: string; nonce: string };
  const tokens = await tokenRequest(env, f, {
    grant_type: 'authorization_code', code, redirect_uri: callbackUrl(origin), code_verifier: verifier,
  });
  const me = await f(`${apiBase(env)}/2/users/me`, { headers: { authorization: `Bearer ${tokens.access}` } });
  if (!me.ok) await xFail(me, 'X would not say who you are');
  const username = ((await me.json()) as { data?: { username?: string } }).data?.username ?? '';
  const handle = hex(random(32));
  const link: StoredLink = { u: username, ...(await seal(env, tokens)), posts: [] };
  await kv.put(await linkKey(handle), JSON.stringify(link), { expirationTtl: LINK_TTL_SECONDS });
  return { handle, username, nonce };
}

/** The player's permission, refreshed if it is about to run out. Null when there is none. */
async function readLink(env: XEnv, kv: KVNamespace, f: Fetch, handle: string): Promise<{ link: StoredLink; tokens: Tokens } | null> {
  const raw = await kv.get(await linkKey(handle));
  if (!raw) return null;
  const link = JSON.parse(raw) as StoredLink;
  let tokens = await open(env, link);
  if (!tokens) return null;
  if (tokens.expires - Date.now() < 60_000) {
    if (!tokens.refresh) return null;
    try {
      tokens = await tokenRequest(env, f, { grant_type: 'refresh_token', refresh_token: tokens.refresh });
    } catch (e) {
      if (e instanceof XError && (e.status === 400 || e.status === 401)) {
        await kv.delete(await linkKey(handle));
        return null;
      }
      throw e;
    }
    Object.assign(link, await seal(env, tokens));
    await kv.put(await linkKey(handle), JSON.stringify(link), { expirationTtl: LINK_TTL_SECONDS });
  }
  return { link, tokens };
}

export async function disconnect(env: XEnv, kv: KVNamespace, f: Fetch, handle: string): Promise<void> {
  const raw = await kv.get(await linkKey(handle));
  if (!raw) return;
  const tokens = await open(env, JSON.parse(raw) as StoredLink);
  await kv.delete(await linkKey(handle));
  if (!tokens || !xConfigured(env)) return;
  // Best effort: the permission is already forgotten here whatever X says.
  for (const [token, hint] of [[tokens.refresh, 'refresh_token'], [tokens.access, 'access_token']] as const) {
    if (!token) continue;
    try {
      await f(`${apiBase(env)}/2/oauth2/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic(env) },
        body: new URLSearchParams({ token, token_type_hint: hint, client_id: env.X_CLIENT_ID!.trim() }),
      });
    } catch {
      // Unreachable: the player can still revoke it in X's settings.
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload one file, in chunks, and wait until X can post it. Returns its media id. */
export async function uploadMedia(env: XEnv, f: Fetch, access: string, bytes: Uint8Array, type: string, video: boolean): Promise<string> {
  const base = `${apiBase(env)}/2/media/upload`;
  const auth = { authorization: `Bearer ${access}` };
  const init = await f(`${base}/initialize`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ media_type: type, total_bytes: bytes.byteLength, media_category: video ? 'tweet_video' : 'tweet_image' }),
  });
  if (!init.ok) await xFail(init, 'X would not start the upload');
  const id = ((await init.json()) as { data?: { id?: string } }).data?.id;
  if (!id) throw new XError('X gave the upload no id', 502);

  for (let i = 0, at = 0; at < bytes.byteLength; i++, at += CHUNK) {
    const form = new FormData();
    form.append('segment_index', String(i));
    form.append('media', new Blob([bytes.subarray(at, at + CHUNK)], { type: 'application/octet-stream' }), 'chunk');
    const res = await f(`${base}/${id}/append`, { method: 'POST', headers: auth, body: form });
    if (!res.ok) await xFail(res, 'X would not take the upload');
  }

  const fin = await f(`${base}/${id}/finalize`, { method: 'POST', headers: auth });
  if (!fin.ok) await xFail(fin, 'X would not finish the upload');
  let info = ((await fin.json()) as { data?: { processing_info?: Processing } }).data?.processing_info;
  const until = Date.now() + PROCESSING_BUDGET_MS;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') throw new XError(`X could not process the media${info.error?.message ? `: ${info.error.message}` : ''}`, 422);
    if (Date.now() > until) throw new XError('X took too long with the media', 504);
    await sleep(Math.min(5, Math.max(1, info.check_after_secs ?? 1)) * 1000);
    const st = await f(`${base}?command=STATUS&media_id=${encodeURIComponent(id)}`, { headers: auth });
    if (!st.ok) await xFail(st, 'X would not say how the upload went');
    info = ((await st.json()) as { data?: { processing_info?: Processing } }).data?.processing_info;
  }
  return id;
}
interface Processing { state: 'pending' | 'in_progress' | 'succeeded' | 'failed'; check_after_secs?: number; error?: { message?: string } }

async function createPost(env: XEnv, f: Fetch, access: string, text: string, mediaId: string): Promise<string> {
  const res = await f(`${apiBase(env)}/2/tweets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  if (!res.ok) await xFail(res, 'X would not make the post');
  const id = ((await res.json()) as { data?: { id?: string } }).data?.id;
  if (!id) throw new XError('X gave the post no id', 502);
  return id;
}

export interface PostInput { text: string; video: Uint8Array | null; image: Uint8Array | null }

/** What a post came to. `fallback: 'link'` asks the page to open X's own compose box instead. */
export type PostResult =
  | { posted: true; url: string; media: 'video' | 'image'; note?: string }
  | { posted: false; fallback: 'link'; reconnect?: boolean; reason: string };

/** Reads a post's form: the words, and the video, the card, or both. A string is what is wrong with it. */
export async function readPostForm(request: Request): Promise<PostInput | string> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return 'That request was not a form.';
  }
  const text = form.get('text');
  if (typeof text !== 'string' || !text.trim()) return 'A post needs words.';
  if (text.length > MAX_TEXT) return 'Those words are too long for a post.';
  const bytes = async (name: string, max: number, type: RegExp): Promise<Uint8Array | null | string> => {
    const v = form.get(name);
    if (v === null) return null;
    if (typeof v === 'string') return `The ${name} was not a file.`;
    if (v.size > max) return `The ${name} is too large.`;
    if (!type.test(v.type)) return `The ${name} is not a kind X takes.`;
    return new Uint8Array(await v.arrayBuffer());
  };
  const video = await bytes('video', MAX_VIDEO_BYTES, /^video\/mp4\b/);
  if (typeof video === 'string') return video;
  const image = await bytes('image', MAX_IMAGE_BYTES, /^image\/jpeg$/);
  if (typeof image === 'string') return image;
  if (!video && !image) return 'A post needs the video or the card.';
  return { text: text.trim(), video, image };
}

/**
 * The post: the video if X will take it, the card if it will not, and the
 * compose box if it will take neither. One post at most, whichever way.
 */
export async function postFlight(env: XEnv, kv: KVNamespace, f: Fetch, handle: string, input: PostInput): Promise<PostResult> {
  const mode = mediaMode(env);
  if (!xConfigured(env) || mode === 'off') return { posted: false, fallback: 'link', reason: 'Posting through X is switched off.' };
  const held = await readLink(env, kv, f, handle);
  if (!held) return { posted: false, fallback: 'link', reconnect: true, reason: 'Your X connection has ended. Connect again to post directly.' };
  const { link, tokens } = held;

  const now = Date.now();
  link.posts = link.posts.filter((t) => now - t < 60 * 60 * 1000);
  if (link.posts.length >= POSTS_PER_HOUR) return { posted: false, fallback: 'link', reason: 'That is a lot of posts for one hour.' };

  let mediaId: string | null = null;
  let media: 'video' | 'image' = 'image';
  let note: string | undefined;
  if (input.video && mode === 'video') {
    try {
      mediaId = await uploadMedia(env, f, tokens.access, input.video, 'video/mp4', true);
      media = 'video';
    } catch (e) {
      if (e instanceof XError && e.unauthorised) return gone(kv, handle);
      note = `Posted the picture: ${e instanceof Error ? e.message : 'the video did not upload'}.`;
    }
  }
  if (!mediaId && input.image) {
    try {
      mediaId = await uploadMedia(env, f, tokens.access, input.image, 'image/jpeg', false);
      media = 'image';
    } catch (e) {
      if (e instanceof XError && e.unauthorised) return gone(kv, handle);
      return { posted: false, fallback: 'link', reason: e instanceof Error ? e.message : 'X would not take the picture.' };
    }
  }
  if (!mediaId) return { posted: false, fallback: 'link', reason: 'X would not take the video, and there was no picture to send instead.' };

  let id: string;
  try {
    id = await createPost(env, f, tokens.access, input.text, mediaId);
  } catch (e) {
    if (e instanceof XError && e.unauthorised) return gone(kv, handle);
    return { posted: false, fallback: 'link', reason: e instanceof Error ? e.message : 'X would not make the post.' };
  }
  link.posts.push(now);
  await kv.put(await linkKey(handle), JSON.stringify(link), { expirationTtl: LINK_TTL_SECONDS });
  return { posted: true, url: `https://x.com/${link.u || 'i/web'}/status/${id}`, media, ...(note ? { note } : {}) };
}

async function gone(kv: KVNamespace, handle: string): Promise<PostResult> {
  await kv.delete(await linkKey(handle));
  return { posted: false, fallback: 'link', reconnect: true, reason: 'X has ended this connection. Connect again to post directly.' };
}

/** Is there a permission behind this handle? For the page to show who it posts as. */
export async function linkedName(kv: KVNamespace, handle: string): Promise<string | null> {
  const raw = await kv.get(await linkKey(handle));
  return raw ? (JSON.parse(raw) as StoredLink).u : null;
}

/* ── The airline's own account ─────────────────────────────────────────────
   For the daily post of the day's top pilots (see daily.ts). Connected once,
   by whoever runs the airline's X account, through the same app and the
   same consent page as a player; only the account named in
   `X_AIRLINE_USERNAME` is kept, so nobody else's permission can end up
   posting as the airline. Its tokens are kept in KV under one key and the
   refresh token is rotated on every use, as X requires. */

const AIRLINE_KEY = 'xairline';
export const airlineCallbackUrl = (origin: string) => `${origin}/x/airline/callback`;
const sameName = (a: string, b: string) => a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();

export async function startAirlineConnect(env: XEnv, kv: KVNamespace, origin: string): Promise<string> {
  const state = b64url(random(24));
  const verifier = b64url(random(48));
  await kv.put(`xairstate:${state}`, verifier, { expirationTtl: CONNECT_TTL_SECONDS });
  const to = new URL(authorizeUrl(env));
  to.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.X_CLIENT_ID!.trim(),
    redirect_uri: airlineCallbackUrl(origin),
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: b64url(await sha256(verifier)),
    code_challenge_method: 'S256',
  }).toString();
  return to.toString();
}

/** Back from X: keep the permission if it is the airline's account. Returns the username kept. */
export async function finishAirlineConnect(
  env: XEnv, kv: KVNamespace, f: Fetch, origin: string, state: string, code: string, airline: string,
): Promise<string> {
  const verifier = await kv.get(`xairstate:${state}`);
  if (!verifier) throw new XError('That trip to X has expired. Start again.', 400);
  await kv.delete(`xairstate:${state}`);
  const tokens = await tokenRequest(env, f, {
    grant_type: 'authorization_code', code, redirect_uri: airlineCallbackUrl(origin), code_verifier: verifier,
  });
  const me = await f(`${apiBase(env)}/2/users/me`, { headers: { authorization: `Bearer ${tokens.access}` } });
  if (!me.ok) await xFail(me, 'X would not say who you are');
  const username = ((await me.json()) as { data?: { username?: string } }).data?.username ?? '';
  if (!sameName(username, airline)) throw new XError(`That was @${username || '?'}, not @${airline.replace(/^@/, '')}. Nothing was kept.`, 403);
  if (!tokens.refresh) throw new XError('X gave no lasting permission (offline access). Nothing was kept.', 502);
  await kv.put(AIRLINE_KEY, JSON.stringify({ u: username, ...(await seal(env, tokens)) }));
  return username;
}

/** Whether the airline's account is connected, and as whom. */
export async function airlineName(kv: KVNamespace): Promise<string | null> {
  const raw = await kv.get(AIRLINE_KEY);
  return raw ? (JSON.parse(raw) as { u?: string }).u ?? '' : null;
}

/** A post as the airline. Returns its URL. */
export async function postAsAirline(env: XEnv, kv: KVNamespace, f: Fetch, text: string): Promise<string> {
  if (!xConfigured(env)) throw new XError('The X app is not set up on this Worker.', 503);
  const raw = await kv.get(AIRLINE_KEY);
  if (!raw) throw new XError('The airline\'s X account is not connected. Visit /x/airline/connect.', 409);
  const stored = JSON.parse(raw) as StoredLink;
  const tokens = await open(env, stored);
  if (!tokens) throw new XError('The airline\'s X permission cannot be opened. Connect it again.', 401);
  let held = { u: stored.u, ...tokens };
  if (held.expires - Date.now() < 60_000) {
    if (!held.refresh) throw new XError('The airline\'s X permission has lapsed. Connect it again.', 401);
    const fresh = await tokenRequest(env, f, { grant_type: 'refresh_token', refresh_token: held.refresh });
    // X rotates the refresh token: keep the new one, or the next refresh fails.
    held = { ...held, ...fresh, refresh: fresh.refresh ?? held.refresh };
    await kv.put(AIRLINE_KEY, JSON.stringify({ u: held.u, ...(await seal(env, held)) }));
  }
  const res = await f(`${apiBase(env)}/2/tweets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${held.access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) await xFail(res, 'X would not make the post');
  const id = ((await res.json()) as { data?: { id?: string } }).data?.id;
  if (!id) throw new XError('X gave the post no id', 502);
  return `https://x.com/${held.u}/status/${id}`;
}
