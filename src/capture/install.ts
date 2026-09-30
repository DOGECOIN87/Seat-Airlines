/**
 * Capture mode, installed. Loaded only when `CAPTURE` is true (see ./flag),
 * before the app renders; a production build never emits this chunk.
 *
 * It does four things, all of them for filming the commercial:
 *
 *  1. Stands in for the outside world. Every request to the site's Worker is
 *     answered here with invented data (fictional holders, a fictional
 *     leaderboard, a fixed sky), and every other off-site request is refused,
 *     so nothing real — no live address, no live balance — can reach the
 *     screen.
 *  2. Installs a pretend wallet that is "connected" to an obviously fake
 *     address. It cannot sign anything: every signature request is refused.
 *  3. Hides the cursor and anything a film should not show, and can pose the
 *     page as a clean plate.
 *  4. Exposes `window.__SA_CAPTURE__`, the handful of controls the capture
 *     scripts drive the app with (see commercial/capture/).
 */
import { INITIAL_TICK, type FlightFeed, type FlightTick } from '../lib/flightFeed';
import { DEFAULT_WORKER_API } from '../lib/workerBase';
import { captureChanged, captureState } from './flag';
import type { FlightGame } from '../lib/landingGame';

/* ── Invented data ─────────────────────────────────────────────────────── */

/** The fake passenger. Reads FAKE…DEMO wherever the app shortens it. */
export const FAKE_WALLET = 'FAKEcapture1111111111111111111111111111DEMO';

/** Fictional holders, each address plainly not a real one. */
const fakeAddress = (i: number) => `FAKE${String(i).padStart(4, '0')}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx${String(i).padStart(4, '0')}`;
const HOLDERS = Array.from({ length: 182 }, (_, i) => ({
  address: fakeAddress(i + 1),
  // A smooth, invented curve: rank 1 holds most.
  balance: Math.round(40_000_000 / (1 + i * 0.35)),
}));
/* The passenger slots in at rank 41, which is seat 16A: the exit row, by
   the window on the left. */
const MY_BALANCE = Math.round((HOLDERS[39].balance + HOLDERS[40].balance) / 2);

/** The leaderboard, with plainly fictional pilots. */
const BOARD = [
  { name: 'PILOT_07', score: 12_480 },
  { name: 'WINGS_22', score: 11_905 },
  { name: 'CAPT_ACE', score: 10_730 },
  { name: 'NAV_0042', score: 9_860 },
  { name: 'JETS_031', score: 8_215 },
].map((row, i) => ({
  // shortWallet() shows the first four and last four: PILO…T_07 and so on.
  address: `${row.name.slice(0, 4)}xxxxxxxxxxxxxxxxxxxxxxxxxxxxx${row.name.slice(-4)}`,
  score: row.score,
  survived: 40 + i * 3,
  climb: 24 + i,
  postedAt: Date.now() - (i + 1) * 3_600_000,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The sky the film is shot in: set by `setSky`, served as the aircraft's own switches. */
const sky = { hour: 15 as number | null, weather: 'cloudy' as string | null };

function mockWorker(url: URL, init?: RequestInit): Response {
  const path = url.pathname;
  if (path.endsWith('/holders')) return json({ holders: HOLDERS, supply: 1_000_000_000 });
  if (path.endsWith('/holding')) return json({ balance: MY_BALANCE, supply: 1_000_000_000 });
  if (path.endsWith('/scores') && (!init?.method || init.method === 'GET')) return json({ scores: BOARD });
  if (path.endsWith('/runs')) return json({ id: 'capture-run' });
  if (path.endsWith('/banners')) return json({ banners: {} });
  if (path.endsWith('/flight')) {
    return json({ halfRolls: 0, spin: 0, flaps: null, hour: sky.hour, weather: sky.weather });
  }
  // Anything that would write — a banner, a score, a message — is refused.
  return json({ error: 'Capture mode: nothing is sent.' }, 403);
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.href);
  if (url.origin === window.location.origin) return realFetch(input, init);
  if (url.href.startsWith(DEFAULT_WORKER_API) || /workers\.dev$/.test(url.hostname)) return mockWorker(url, init);
  // Market data, weather, RPC: nothing live in a capture.
  throw new TypeError(`Capture mode: ${url.hostname} is not contacted.`);
};

/* ── A wallet that is connected and can do nothing ─────────────────────── */

const fakeKey = { toString: () => FAKE_WALLET, toBase58: () => FAKE_WALLET };
const provider = {
  isPhantom: true,
  publicKey: fakeKey,
  isConnected: true,
  async connect() { return { publicKey: fakeKey }; },
  async disconnect() {},
  async signMessage(): Promise<never> { throw new Error('Capture mode: signing is disabled.'); },
  async signTransaction(): Promise<never> { throw new Error('Capture mode: signing is disabled.'); },
  async signAllTransactions(): Promise<never> { throw new Error('Capture mode: signing is disabled.'); },
  on() {},
  off() {},
  removeListener() {},
};
Object.assign(window, { phantom: { solana: provider } });

/* ── Nothing on screen that a film should not show ─────────────────────── */

document.documentElement.classList.add('sa-capture');
const style = document.createElement('style');
style.textContent = `
  html.sa-capture, html.sa-capture * { cursor: none !important; caret-color: transparent !important; }
  html.sa-capture ::-webkit-scrollbar { display: none; }
  html.sa-capture { scrollbar-width: none; }
  html.sa-capture :focus-visible { outline: none !important; }
  /* A clean plate: the view alone, filling the screen. */
  html.sa-capture[data-plate="view"] body { overflow: hidden; }
  html.sa-capture[data-plate="view"] .sa-viewport {
    position: fixed !important; inset: 0 !important; z-index: 1000 !important;
    width: 100vw !important; height: 100vh !important; margin: 0 !important;
  }
  html.sa-capture[data-plate="view"] .sa-viewport .sd-frame,
  html.sa-capture[data-plate="view"] .sa-viewport .sd-view {
    width: 100% !important; height: 100% !important; aspect-ratio: auto !important;
    max-height: none !important; border-radius: 0 !important; border: 0 !important;
  }
  html.sa-capture[data-plate="view"] .sa-viewport > * > :not(.sd-view):not(:has(.sd-view)) { display: none !important; }
  html.sa-capture[data-plate="view"] .sa-viewport .sd-view > :not(canvas) { display: none !important; }
  /* The frame round the view, its badge, and the dock of tabs along the foot of the page. */
  html.sa-capture[data-plate="view"] .sa-viewport .sd-viewframe,
  html.sa-capture[data-plate="view"] .sa-viewport .sd-glass,
  html.sa-capture[data-plate="view"] .sa-viewport .sd-glass > * {
    width: 100% !important; height: 100% !important; padding: 0 !important; border-radius: 0 !important; background: none !important; box-shadow: none !important;
  }
  html.sa-capture[data-plate="view"] .sa-viewport .sd-badge,
  html.sa-capture[data-plate="view"] .sa-dock { display: none !important; }
  /* The brand plate: the landing's wordmark, with the airliner crossing it, alone and large. */
  html.sa-capture[data-plate="brand"] .sa-landing { background: #0F1725 !important; }
  html.sa-capture[data-plate="brand"] .sa-landing > :not(.sa-landing__top) { display: none !important; }
  html.sa-capture[data-plate="brand"] .sa-landing__top > :not(.sa-landing__brandbox) { visibility: hidden !important; }
  html.sa-capture[data-plate="brand"] .sa-landing__brandbox {
    position: fixed !important; left: 50% !important; top: 50% !important; zoom: 3; translate: -50% -50%;
  }
`;
document.head.appendChild(style);

/* ── The feed the capture writes market caps into ───────────────────────── */

let tick: FlightTick = { ...INITIAL_TICK, holders: 4_812 };
const tickListeners = new Set<(t: FlightTick) => void>();
const feed: FlightFeed = {
  subscribe(fn) {
    tickListeners.add(fn);
    fn(tick);
    return () => tickListeners.delete(fn);
  },
};
const emit = (next: Partial<FlightTick>) => {
  tick = { ...tick, ...next };
  tickListeners.forEach((fn) => fn(tick));
};
captureState.feed = feed;

/* ── Seeded randomness, so a take can be repeated ──────────────────────── */

const nativeRandom = Math.random;
function seedRandom(seed: number | null) {
  if (seed === null) {
    Math.random = nativeRandom;
    return;
  }
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedParam = new URLSearchParams(window.location.search).get('seed');
seedRandom(seedParam === null ? 350 : Number(seedParam));

/* ── Tweens on the page's own frame clock ──────────────────────────────── */

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};
function tween(ms: number, easing: string, step: (k: number) => void): Promise<void> {
  const ease = EASINGS[easing] ?? EASINGS.easeInOutCubic;
  const from = performance.now();
  return new Promise((done) => {
    const frame = () => {
      const t = Math.min(1, (performance.now() - from) / Math.max(1, ms));
      step(ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
}

/* ── The autopilot, for the game ───────────────────────────────────────── */

let autopilot: { crashAfter: number } | null = null;
captureState.onGameFrame = (g: FlightGame) => {
  if (!autopilot || (g.phase !== 'flying' && g.phase !== 'intro')) return;
  const t = g.clock;
  if (!g.failed) {
    // The climb: stick back, with a lazy weave so the horizon moves.
    g.keys = { x: 0.45 * Math.sin(t * 0.7), y: 1 };
    return;
  }
  const since = (performance.now() - g.failedAt) / 1000;
  if (since > autopilot.crashAfter) {
    // Enough: nose down into the ground for the ending.
    g.keys = { x: 0, y: -1 };
    return;
  }
  // One engine: wings level against the pull, nose down for speed, low for points.
  const x = Math.max(-1, Math.min(1, -(g.bank * 0.06 + g.rollRate * 0.03)));
  const slow = g.speed < 112;
  const high = g.agl > 260;
  g.keys = { x, y: slow ? -0.6 : high ? -0.25 : g.agl < 120 ? 0.5 : 0.05 };
};

/* ── The API the capture scripts drive ──────────────────────────────────── */

const PRESETS = {
  exitRowForward: { yaw: 0 },
  exitRowLeft: { yaw: -64 },
} as const;
type Preset = keyof typeof PRESETS;

const api = {
  ready: false,
  fakeWallet: FAKE_WALLET,
  mock: { holders: HOLDERS, board: BOARD },
  setMarketCap(n: number) {
    emit({ marketCap: n });
  },
  setChange(pct: number) {
    emit({ change5m: pct });
  },
  playMarketCapRamp(from: number, to: number, ms: number, easing = 'easeInQuad') {
    emit({ marketCap: from });
    return tween(ms, easing, (k) => emit({ marketCap: from + (to - from) * k }));
  },
  setSky(hour: number | null, weather: string | null) {
    sky.hour = hour;
    sky.weather = weather;
  },
  /** Sits in the exit row's window seat, head turned to the preset. */
  setCamera(preset: Preset) {
    const a = captureState.app;
    a.walkTo?.('exit');
    a.setViewPosition?.('window');
    a.setFacing?.('forward');
    captureState.yaw = PRESETS[preset].yaw;
  },
  animateCamera(from: Preset, to: Preset, ms: number, easing = 'easeInOutCubic') {
    const a = PRESETS[from].yaw;
    const b = PRESETS[to].yaw;
    return tween(ms, easing, (k) => { captureState.yaw = a + (b - a) * k; });
  },
  /** Goes to the flight deck or the cargo hold, looking straight ahead. */
  goTo(room: 'deck' | 'hold') {
    captureState.yaw = 0;
    captureState.app.setCamera?.(room);
  },
  /** Turns the head in the deck or the hold, degrees (negative left); null hands it back to the drag. */
  setLook(yaw: number | null) {
    captureState.yaw = yaw;
  },
  panLook(from: number, to: number, ms: number, easing = 'easeInOutCubic') {
    return tween(ms, easing, (k) => { captureState.yaw = from + (to - from) * k; });
  },
  /** The plate: 'view' is the 3D view alone, full screen; 'brand' the wordmark and its flyover on navy; null the page. */
  setPlate(plate: 'view' | 'brand' | null) {
    if (plate) document.documentElement.dataset.plate = plate;
    else delete document.documentElement.dataset.plate;
    window.dispatchEvent(new Event('resize'));
  },
  selectSeat(id: string | null) {
    captureState.seat = id;
    captureChanged();
  },
  startGame(seed: number | null = 350, opts: { autopilot?: boolean; crashAfter?: number } = {}) {
    seedRandom(seed);
    autopilot = opts.autopilot === false ? null : { crashAfter: opts.crashAfter ?? 14 };
    captureState.app.fly?.();
  },
  setAutopilot(on: boolean, crashAfter = 14) {
    autopilot = on ? { crashAfter } : null;
  },
  setHighScore(n: number | null) {
    captureState.highScore = n;
  },
  setAdvert(creativeUrl: string | null, seat = '15A') {
    const next = { ...captureState.adverts };
    if (creativeUrl) next[seat] = creativeUrl;
    else delete next[seat];
    captureState.adverts = next;
    captureChanged();
  },
  get app() {
    return captureState.app;
  },
};
Object.assign(window, { __SA_CAPTURE__: api });

/* Ready once the fonts are in and a 3D world has drawn a second of frames:
   long enough for its textures to be made. */
void document.fonts.ready.then(() => {
  let frames = 0;
  const wait = () => {
    if (document.querySelector('canvas') && ++frames > 30) {
      api.ready = true;
      return;
    }
    requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
});
