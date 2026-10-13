/**
 * The in-flight radio's Audius client: which tracks it will play, which
 * hosts it asks and in what order, and how it fails.
 *
 * The cases lean on the shapes Audius really answers with — a trending track
 * carries `access`, `is_available` and `stream_conditions`, and a search
 * returns gated tracks alongside free ones — and on one bug the client this
 * was ported from had: `AbortSignal.any`, missing before Safari 17.4, made
 * every host look down on an older iPhone.
 *
 *   npm test
 */
import {
  AUDIUS_HOSTS, AudiusUnreachable, CHANNELS, LIST_SIZE, audiusUrl, clock, fetchTracks, playable, resetHosts, streamUrl,
} from '../dist-test/audius.js';

let pass = 0, fail = 0;
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const track = (over = {}) => ({
  id: 'GEG9ZWx',
  title: 'Clawn (Original Mix)',
  duration: 210,
  permalink: '/rowsfred/clawn-original-mix',
  is_streamable: true,
  is_stream_gated: false,
  stream_conditions: null,
  is_delete: false,
  is_available: true,
  access: { stream: true, download: true },
  user: { name: 'ROWSFRED', handle: 'ROWSFRED' },
  artwork: {
    '150x150': 'https://audius-03.staked.cloud/content/cid/150x150.jpg',
    '480x480': 'https://audius-03.staked.cloud/content/cid/480x480.jpg',
  },
  ...over,
});
const answer = (data) => ({ ok: true, json: async () => ({ data }) });
const realFetch = globalThis.fetch;
const trending = { kind: 'channel', channel: CHANNELS[0] };

console.log('\nthe in-flight radio');

await checkAsync('a free track is kept, and read the way the player shows it', async () => {
  const t = playable(track());
  assert(t, 'dropped');
  assert(t.title === 'Clawn (Original Mix)' && t.artist === 'ROWSFRED', `${t.title} / ${t.artist}`);
  assert(t.link === 'https://audius.co/rowsfred/clawn-original-mix', t.link);
  assert(t.artwork.endsWith('480x480.jpg'), t.artwork);
  assert(t.duration === 210, String(t.duration));
});

await checkAsync('gated, paid, deleted, withdrawn or unstreamable tracks are dropped', async () => {
  for (const over of [
    { is_stream_gated: true }, { is_premium: true }, { stream_conditions: { usdc_purchase: {} } },
    { is_streamable: false }, { is_delete: true }, { is_available: false }, { access: { stream: false } },
    { id: 7 }, { title: '   ' },
  ]) assert(playable(track(over)) === null, `kept ${JSON.stringify(over)}`);
  assert(playable(null) === null && playable('x') === null, 'kept a non-object');
});

await checkAsync('artwork that is not https, and a permalink that is not a path, are not trusted', async () => {
  const t = playable(track({ artwork: { '480x480': 'javascript:alert(1)' }, permalink: 'https://evil.example/x' }));
  assert(t.artwork === null, t.artwork);
  assert(t.link === null, t.link);
  const nameless = playable(track({ user: { handle: 'only_handle' } }));
  assert(nameless.artist === 'only_handle', nameless.artist);
});

await checkAsync('every request names the app; a channel asks for its genre, a search for its words', async () => {
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return answer([track()]); };
  resetHosts();
  await fetchTracks({ kind: 'channel', channel: CHANNELS.find((c) => c.genre === 'Hip-Hop/Rap') }, new AbortController().signal);
  await fetchTracks({ kind: 'search', query: 'lofi beats' }, new AbortController().signal);
  const [chart, search] = urls.map((u) => new URL(u));
  assert(chart.pathname === '/v1/tracks/trending', chart.pathname);
  assert(chart.searchParams.get('genre') === 'Hip-Hop/Rap', chart.search);
  assert(chart.searchParams.get('app_name'), 'no app_name');
  assert(chart.searchParams.get('api_key'), 'no api_key');
  assert(chart.searchParams.get('limit') === String(LIST_SIZE * 2), chart.search);
  assert(search.pathname === '/v1/tracks/search' && search.searchParams.get('query') === 'lofi beats', search.href);
  assert(!new URL(audiusUrl(AUDIUS_HOSTS[0], '/tracks/trending')).searchParams.has('genre'), 'the whole chart sent a genre');
});

await checkAsync('a dead host is passed over, and the one that answered is asked first next time', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url.startsWith(AUDIUS_HOSTS[0])) throw new TypeError('Failed to fetch');
    return answer([track()]);
  };
  resetHosts();
  const first = await fetchTracks(trending, new AbortController().signal);
  assert(first.host === AUDIUS_HOSTS[1], first.host);
  urls.length = 0;
  await fetchTracks(trending, new AbortController().signal);
  assert(urls.length === 1 && urls[0].startsWith(AUDIUS_HOSTS[1]), urls.join(' '));
});

await checkAsync('a host that hangs is given up on, not waited for', async () => {
  globalThis.fetch = (url, { signal }) => url.startsWith(AUDIUS_HOSTS[0])
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    : Promise.resolve(answer([track()]));
  resetHosts();
  const started = Date.now();
  const { host } = await fetchTracks(trending, new AbortController().signal, 50);
  assert(host === AUDIUS_HOSTS[1], host);
  assert(Date.now() - started < 1000, `${Date.now() - started}ms`);
});

await checkAsync('it works without AbortSignal.any, as on Safari before 17.4', async () => {
  const any = AbortSignal.any;
  try {
    AbortSignal.any = undefined;
    globalThis.fetch = async () => answer([track()]);
    resetHosts();
    const { tracks } = await fetchTracks(trending, new AbortController().signal);
    assert(tracks.length === 1, String(tracks.length));
  } finally { AbortSignal.any = any; }
});

await checkAsync('a search that finds nothing is an answer; a chart with nothing playable asks the next host', async () => {
  let asked = 0;
  globalThis.fetch = async () => { asked++; return answer([]); };
  resetHosts();
  const search = await fetchTracks({ kind: 'search', query: 'zzqqxx' }, new AbortController().signal);
  assert(search.tracks.length === 0 && asked === 1, `asked ${asked}`);
  asked = 0;
  globalThis.fetch = async (url) => { asked++; return answer(url.startsWith(AUDIUS_HOSTS[0]) ? [track({ is_stream_gated: true })] : [track()]); };
  resetHosts();
  const chart = await fetchTracks(trending, new AbortController().signal);
  assert(chart.tracks.length === 1 && chart.host === AUDIUS_HOSTS[1], `${chart.host} after ${asked}`);
});

await checkAsync('no host answering is AudiusUnreachable; cancelling is an AbortError', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  resetHosts();
  let error = null;
  try { await fetchTracks(trending, new AbortController().signal); } catch (e) { error = e; }
  assert(error instanceof AudiusUnreachable, String(error));
  const controller = new AbortController();
  controller.abort();
  error = null;
  try { await fetchTracks(trending, controller.signal); } catch (e) { error = e; }
  assert(error?.name === 'AbortError', String(error));
});

await checkAsync('the stream URL is on the answering host, escaped, with the app named', async () => {
  const url = new URL(streamUrl('https://api.audius.co/', 'a/b?c'));
  assert(url.href.startsWith('https://api.audius.co/v1/tracks/a%2Fb%3Fc/stream?'), url.href);
  assert(url.searchParams.get('app_name'), 'no app_name');
});

await checkAsync('times read like a player’s', async () => {
  for (const [s, want] of [[0, '0:00'], [7.9, '0:07'], [210, '3:30'], [3725, '1:02:05'], [NaN, '0:00'], [-3, '0:00']]) {
    assert(clock(s) === want, `${s} → ${clock(s)}`);
  }
});

globalThis.fetch = realFetch;
console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
