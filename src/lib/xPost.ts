/**
 * Posting a flight to X through the Worker, as the player (see
 * worker/src/xshare.ts).
 *
 * A player connects once: a tab goes to X, X asks them, and they come back
 * to /x-connected/, which leaves a handle in local storage for this tab to
 * pick up. From then on Post sends the video and the card to the Worker,
 * which posts the video, or the card if X will not take the video. Whenever
 * it cannot post at all, the answer says so and the page falls back to X's
 * own compose box, which is how sharing worked before any of this.
 */

import { WORKER_API } from './networkingApi';

const HANDLE = 'sa.x.handle';
const USER = 'sa.x.user';
const PENDING = 'sa.x.pending';

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    // Storage blocked: the player simply is not connected.
  }
};

export interface XLink { handle: string; username: string }

export function xLink(): XLink | null {
  const handle = read(HANDLE);
  return handle && /^[0-9a-f]{64}$/.test(handle) ? { handle, username: read(USER) ?? '' } : null;
}

const forget = () => {
  write(HANDLE, null);
  write(USER, null);
};

/** Calls back whenever the connection changes in another tab — the one X sent the player back to. */
export function onXLinkChange(fn: (link: XLink | null) => void): () => void {
  const listen = (e: StorageEvent) => {
    if (e.key === HANDLE || e.key === null) fn(xLink());
  };
  window.addEventListener('storage', listen);
  return () => window.removeEventListener('storage', listen);
}

export interface XStatus { available: boolean; media: 'video' | 'image' | 'off'; username: string | null }

/** Whether this deployment posts through X, and whether the stored connection is still good. */
export async function xStatus(): Promise<XStatus> {
  const none: XStatus = { available: false, media: 'off', username: null };
  if (!WORKER_API) return none;
  const link = xLink();
  try {
    const res = await fetch(`${WORKER_API}/x/status`, { headers: link ? { authorization: `Bearer ${link.handle}` } : {} });
    if (!res.ok) return none;
    const body = (await res.json()) as { available?: boolean; media?: XStatus['media']; connected?: boolean; username?: string | null };
    if (link && body.available && !body.connected) forget();
    return { available: Boolean(body.available), media: body.media ?? 'off', username: body.connected ? body.username ?? link?.username ?? '' : null };
  } catch {
    return none;
  }
}

/** Off to X to connect, in a new tab, so the flight on this one is not lost. */
export function connectX(): void {
  if (!WORKER_API) return;
  const nonce = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
  write(PENDING, nonce);
  const to = `${WORKER_API}/x/connect?n=${nonce}`;
  const tab = window.open(to, '_blank');
  if (tab) tab.opener = null;
  else window.location.href = to;
}

export async function disconnectX(): Promise<void> {
  const link = xLink();
  forget();
  if (!link || !WORKER_API) return;
  try {
    await fetch(`${WORKER_API}/x/session`, { method: 'DELETE', headers: { authorization: `Bearer ${link.handle}` } });
  } catch {
    // Forgotten here either way; the player can revoke it in X's settings too.
  }
}

export type XPostResult =
  | { posted: true; url: string; media: 'video' | 'image'; note?: string }
  | { posted: false; reason: string; reconnect?: boolean };

/** Post the flight: the video if there is one, and the card, which X gets if the video will not go. */
export async function postToX(text: string, video: Blob | null, image: Blob | null): Promise<XPostResult> {
  const link = xLink();
  if (!link || !WORKER_API) return { posted: false, reason: 'Not connected to X.', reconnect: true };
  const form = new FormData();
  form.append('text', text);
  if (video) form.append('video', video, 'flight.mp4');
  if (image) form.append('image', image, 'flight.jpg');
  try {
    const res = await fetch(`${WORKER_API}/x/post`, { method: 'POST', headers: { authorization: `Bearer ${link.handle}` }, body: form });
    const body = (await res.json()) as Partial<{ posted: boolean; url: string; media: 'video' | 'image'; note: string; reason: string; error: string; reconnect: boolean }>;
    if (body.posted && body.url) return { posted: true, url: body.url, media: body.media ?? 'image', ...(body.note ? { note: body.note } : {}) };
    if (body.reconnect) forget();
    return { posted: false, reason: body.reason ?? body.error ?? 'X did not take the post.', reconnect: body.reconnect };
  } catch {
    return { posted: false, reason: 'Could not reach the server.' };
  }
}
