/**
 * Audius, for the in-flight radio.
 *
 * Audius is an open music catalogue with a public read API: trending charts,
 * search, and a stream URL per track that an ordinary <audio> element can
 * play. Nothing here is signed and nothing needs a Worker in front of it —
 * the browser asks Audius directly, and only once somebody opens the radio.
 *
 * ── Hosts ─────────────────────────────────────────────────────────────────
 * `api.audius.co` is the gateway Audius's own SDK points at, so it is asked
 * first. The discovery providers Audius runs itself are behind it, in case
 * the gateway is down. Hosts announced by a third party are never used: the
 * stream URL is handed to an <audio> element, and a host somebody else chose
 * would be choosing what plays.
 *
 * Whichever host last answered is asked first next time, so one dead host
 * costs a single timeout per session rather than one per channel change.
 *
 * ── Identifying the app ──────────────────────────────────────────────────
 * Every request carries `app_name` and Seat Airlines' API key, which is how
 * Audius tells apps apart and meters them. The key is Audius's public app
 * identifier, issued for browser code — like the Worker's address in
 * workerBase.ts, it is in the bundle either way, so it has a default here and
 * a fork overrides it with `VITE_AUDIUS_API_KEY`. The secret and the bearer
 * token Audius issues alongside it are private, and have no business
 * anywhere near this file or any VITE_ variable.
 */

const env = import.meta.env as Record<string, string | undefined>;

/** How this site introduces itself to Audius. */
export const APP_NAME = env.VITE_AUDIUS_APP_NAME?.trim() || 'SeatAirlines';
/** Seat Airlines' app on Audius ("Seat Airlines", registered by @mattrickbeats). */
const DEFAULT_API_KEY = 'd067e3b3d3933a2132191d0053d069c069219d62';
const API_KEY = env.VITE_AUDIUS_API_KEY?.trim() || DEFAULT_API_KEY;

export const AUDIUS_HOSTS: readonly string[] = [
  'https://api.audius.co',
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
];

/** How long one host gets to answer before the next is asked. */
const HOST_TIMEOUT_MS = 6000;

/** How many tracks a list holds. */
export const LIST_SIZE = 30;

/** A track the radio can play: everything the player shows, nothing it does not. */
export interface RadioTrack {
  id: string;
  title: string;
  artist: string;
  /** The track's page on audius.co, where the artist can be followed. */
  link: string | null;
  artwork: string | null;
  /** Seconds. Zero when Audius did not say. */
  duration: number;
}

/** The channels on the dial: Audius's trending chart, whole or by genre. */
export interface Channel {
  key: string;
  label: string;
  /** Audius's own genre name. Null is the whole chart. */
  genre: string | null;
}

export const CHANNELS: readonly Channel[] = [
  { key: 'trending', label: 'Trending', genre: null },
  { key: 'electronic', label: 'Electronic', genre: 'Electronic' },
  { key: 'hip-hop', label: 'Hip-hop', genre: 'Hip-Hop/Rap' },
  { key: 'lo-fi', label: 'Lo-fi', genre: 'Lo-Fi' },
  { key: 'ambient', label: 'Ambient', genre: 'Ambient' },
];

export type RadioSource =
  | { kind: 'channel'; channel: Channel }
  | { kind: 'search'; query: string };

/** No host answered at all — as distinct from one answering with nothing. */
export class AudiusUnreachable extends Error {
  constructor() {
    super('Audius is not answering right now.');
    this.name = 'AudiusUnreachable';
  }
}

/** A URL on an Audius host, with the app's name on it. */
export function audiusUrl(host: string, path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${host.replace(/\/$/, '')}/v1${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('app_name', APP_NAME);
  if (API_KEY) url.searchParams.set('api_key', API_KEY);
  return url.toString();
}

/** What an <audio> element is pointed at to play a track. Audius redirects it to the file. */
export const streamUrl = (host: string, id: string): string =>
  audiusUrl(host, `/tracks/${encodeURIComponent(id)}/stream`);

const https = (value: unknown): string | null =>
  typeof value === 'string' && /^https:\/\//.test(value) ? value : null;

/**
 * A track from Audius, if it is one the radio can play to anybody.
 *
 * Gated tracks — paid, or for holders of something — answer the stream URL
 * with a refusal, and a radio that stops on every third song is worse than
 * one with a shorter list. Deleted tracks linger in some answers too.
 */
export function playable(raw: unknown): RadioTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !t.id || typeof t.title !== 'string' || !t.title.trim()) return null;
  if (t.is_streamable === false || t.is_delete === true || t.is_available === false) return null;
  if (t.is_premium === true || t.is_stream_gated === true || t.stream_conditions) return null;
  const access = (t.access && typeof t.access === 'object' ? t.access : {}) as Record<string, unknown>;
  if (access.stream === false) return null;
  const user = (t.user && typeof t.user === 'object' ? t.user : {}) as Record<string, unknown>;
  const art = (t.artwork && typeof t.artwork === 'object' ? t.artwork : {}) as Record<string, unknown>;
  const permalink = typeof t.permalink === 'string' && t.permalink.startsWith('/') ? t.permalink : null;
  return {
    id: t.id,
    title: t.title.trim(),
    artist: (typeof user.name === 'string' && user.name.trim())
      || (typeof user.handle === 'string' && user.handle) || 'Unknown artist',
    link: permalink ? `https://audius.co${permalink}` : null,
    artwork: https(art['480x480']) ?? https(art['150x150']) ?? https(art['1000x1000']),
    duration: typeof t.duration === 'number' && t.duration > 0 ? t.duration : 0,
  };
}

/**
 * The caller's signal and a timeout, as one.
 *
 * `AbortSignal.any` would do this in a line, but Safari only has it from
 * 17.4: on an older iPhone it is undefined, every host "fails", and the
 * radio says the station is down when it is the phone.
 */
function withTimeout(signal: AbortSignal, ms: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    },
  };
}

const aborted = () => new DOMException('Aborted', 'AbortError');

let preferred: string | null = null;

/** The hosts in the order to try them: last good one first. */
const hostOrder = () =>
  preferred ? [preferred, ...AUDIUS_HOSTS.filter((h) => h !== preferred)] : [...AUDIUS_HOSTS];

/* Twice what the list shows, because gated tracks are dropped after: about
   half of a search's answers can be. */
const requestFor = (host: string, source: RadioSource) =>
  source.kind === 'search'
    ? audiusUrl(host, '/tracks/search', { query: source.query, limit: String(LIST_SIZE * 2) })
    : audiusUrl(host, '/tracks/trending', {
      limit: String(LIST_SIZE * 2),
      ...(source.channel.genre ? { genre: source.channel.genre } : {}),
    });

/**
 * A list of playable tracks, and the host that gave it (streams come from
 * the same one).
 *
 * A search that finds nothing is an answer, and is returned empty. A chart
 * that comes back with nothing playable is more likely a host having a bad
 * day, so the next is asked before giving up on it. Only when no host
 * answers at all is it an error.
 */
export async function fetchTracks(
  source: RadioSource,
  signal: AbortSignal,
  timeoutMs = HOST_TIMEOUT_MS,
): Promise<{ host: string; tracks: RadioTrack[] }> {
  let answered: string | null = null;
  for (const host of hostOrder()) {
    if (signal.aborted) throw aborted();
    const attempt = withTimeout(signal, timeoutMs);
    try {
      const response = await fetch(requestFor(host, source), { signal: attempt.signal });
      if (!response.ok) continue;
      const body = (await response.json()) as { data?: unknown };
      if (!Array.isArray(body?.data)) continue;
      const tracks = body.data.map(playable).filter((t): t is RadioTrack => t !== null).slice(0, LIST_SIZE);
      preferred = host;
      answered ??= host;
      if (tracks.length || source.kind === 'search') return { host, tracks };
    } catch {
      /* Down, slow or refusing: the next host, unless the caller gave up. */
    } finally {
      attempt.done();
    }
  }
  if (signal.aborted) throw aborted();
  if (answered) return { host: answered, tracks: [] };
  throw new AudiusUnreachable();
}

/** Forget which host answered last. For the tests. */
export const resetHosts = () => {
  preferred = null;
};

/** 3:07 — the length of a track, or how far into one. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}
