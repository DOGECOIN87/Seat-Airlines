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
 *  3. Hides the cursor and anything a film should not show.
 *  4. Exposes `window.__SA_CAPTURE__`, the handful of controls the capture
 *     scripts drive the app with (see commercial/capture/).
 */
import * as THREE from 'three';
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
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
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

/* ── The easter egg: an invented house outside the left windows ─────────
   Built from primitives here and nowhere else. It is not anybody's house;
   the film labels it so. A little low-poly cabin with warm windows and a
   purple-to-green roof, perched on a puff of cloud of its own. */

function gradientRoofTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#9945FF');
  grad.addColorStop(1, '#14F195');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildHouse(): THREE.Group {
  const house = new THREE.Group();
  house.name = 'capture-house';
  const wall = new THREE.MeshStandardMaterial({ color: '#F3E6CF', roughness: 0.9, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: '#6B4A34', roughness: 0.8, flatShading: true });
  const roof = new THREE.MeshStandardMaterial({ map: gradientRoofTexture(), roughness: 0.6, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: '#FFC56B' });
  const cloud = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, flatShading: true });

  // The house: a box, a pitched roof, a chimney, a door and lit windows. Metres.
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 9), wall);
  body.position.y = 3.5;
  house.add(body);
  const roofGeo = new THREE.CylinderGeometry(0, 1, 1, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const roofMesh = new THREE.Mesh(roofGeo, roof);
  roofMesh.scale.set(10.6, 5.5, 8.2);
  roofMesh.position.y = 7 + 2.75;
  house.add(roofMesh);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 1.4), trim);
  chimney.position.set(3.2, 10.2, 1.2);
  house.add(chimney);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 0.2), trim);
  door.position.set(0, 1.6, 4.55);
  house.add(door);
  for (const [x, y, z, ry] of [
    [-3.6, 4.2, 4.56, 0], [3.6, 4.2, 4.56, 0], [-3.6, 4.2, -4.56, 0], [3.6, 4.2, -4.56, 0],
    [6.06, 4.2, -1.8, Math.PI / 2], [6.06, 4.2, 1.8, Math.PI / 2], [-6.06, 4.2, 0, Math.PI / 2],
  ] as const) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.8), glow);
    w.position.set(x, y, z);
    w.rotation.y = ry;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 0.1), trim);
    frame.position.set(x - Math.sign(x) * 0.02 * (ry ? 1 : 0), y, z - Math.sign(z) * 0.03 * (ry ? 0 : 1));
    frame.rotation.y = ry;
    house.add(frame, w);
    w.position.addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(Math.sign(ry ? x : z)), 0.06);
  }
  const light = new THREE.PointLight('#FFB35C', 60, 40, 2);
  light.position.set(0, 4, 6);
  house.add(light);

  // Its own cloud to sit on.
  const puffs: [number, number, number, number][] = [
    [0, -2.5, 0, 11], [-9, -3.5, 2, 8], [9, -3.2, -1, 8.5], [-4, -5, -6, 8], [5, -5, 6, 7.5],
    [-14, -6, -2, 6], [14, -6, 3, 6], [0, -6.5, 8, 7], [0, -6, -8, 7],
  ];
  for (const [x, y, z, r] of puffs) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloud);
    p.position.set(x, y, z);
    p.scale.y = 0.62;
    house.add(p);
  }
  house.traverse((o) => {
    // Never cut by the cabin's near plane or the scene's own sorting.
    o.frustumCulled = false;
  });
  return house;
}

const houses = new WeakMap<THREE.Scene, THREE.Group>();
const houseClock = { start: 0 };
captureState.onWorld = (scene) => {
  const house = buildHouse();
  house.visible = false;
  scene.add(house);
  houses.set(scene, house);
};
captureState.onRender = (scene, camera, exterior) => {
  const house = houses.get(scene);
  if (!house) return;
  house.visible = captureState.house && !exterior;
  if (!house.visible) return;
  /* Off the left side, a little forward of abeam and below the wing: where
     the exit row's window looks once the head is turned. It drifts slowly
     aft, the way anything outside does. Placed in the aircraft's own frame,
     from the camera, so it reads the same whatever the market is doing. */
  const t = (performance.now() - houseClock.start) / 1000;
  const back = Math.min(40, t * 4.5);
  const frame = camera.parent ?? scene;
  if (house.parent !== frame) frame.add(house);
  const eye = camera.position;
  house.position.set(eye.x - 150, eye.y - 36, eye.z - 88 + back);
  house.rotation.set(0, 0.95, 0);
  house.scale.setScalar(1.35);
};

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
  exitRowRight: { yaw: 64 },
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
  /** Walks to the exit row's window seat, facing forward, with the head free to be turned. */
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
  /** The plate: 'view' fills the screen with the 3D view alone; null is the page. */
  setPlate(plate: 'view' | null) {
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
  showEasterEggHouse(on: boolean) {
    captureState.house = on;
    houseClock.start = performance.now();
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
