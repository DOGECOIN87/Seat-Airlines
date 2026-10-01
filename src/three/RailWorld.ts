import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SkyState } from '../lib/sky';
import type { BandState, FlightBand } from '../lib/flightModel';
import { formatCap } from '../lib/flightModel';
import type { Attitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import { carriagesFor, gradeFor, MAX_CARRIAGES, nextCarriageAt, trainSpeedFor } from '../lib/consist';
import { MARK_PATH, MARK_NAVY } from '../components/Mark';
import { noise2 } from './noise';
import type { ViewPose, WorldHandles } from './WorldScene';

/**
 * The railway, rendered.
 *
 * One train on one line through country that never repeats. The train and
 * the track are the supplied models (public/models, converted from the
 * station scene): a metro cab car leading, the same car's body mirrored for
 * every carriage behind it, and the station's own rails and sleepers tiled
 * along the line near the camera. The station itself turns up every couple
 * of kilometres, signed in the line's colours, and trackside billboards
 * carry the holders' adverts.
 *
 * The market drives all of it:
 *
 *   Market cap     how long the train is — a carriage per 1-2-5 step from
 *                  $10K (see lib/consist.ts) — and, as on the airline, which
 *                  world the line runs through: country, then a viaduct over
 *                  the clouds at $1M, a guideway through space at $10M, the
 *                  moon at $50M and Mars at $100M.
 *   Five-minute    the grade the line ahead is laid at, so the track behind
 *   move           the train is the chart; and the speed, and the colour
 *                  the signals show.
 *   Holders        lit carriages, front first.
 *
 * Everything is placed relative to the train each frame (a floating
 * origin), so the line can run for hours without the world drifting into
 * float precision trouble.
 */

/* ── The line ─────────────────────────────────────────────────────────── */

/** Metres between samples of the line's centreline. */
const STEP = 4;
/** Length of one tile of the supplied track, in metres. */
const TILE = 14.7748;
/** One chunk of country: a whole number of track tiles, so tiles never straddle chunks. */
const CHUNK = TILE * 11;
const AHEAD = 10;
const BEHIND = 3;
const CHUNKS = AHEAD + BEHIND;
/** Chunks either side of the camera's that get the detailed track. */
const NEAR_TRACK = 1;
/** Half the width of the country either side of the line. */
const HALF_WIDTH = 1500;
const SEG_U = 22;
const SEG_X = 56;
/** Metres between billboards, alternating sides. */
const BILLBOARD_EVERY = CHUNK * 2.5;
/** A station every this many chunks. */
const STATION_EVERY = 16;
const STATION_SCALE = 1.75;
/** Platform edge from the track's centre, metres, and its height above rail. */
const PLATFORM_EDGE = 1.72;
const PLATFORM_Y = 0.83;

/** The car models' length and the gap between them. */
const CAR_LEN = 20.08;
const CAR_GAP = 0.7;
const CAR_PITCH = CAR_LEN + CAR_GAP;
/** Bogie centres from the middle of a car. */
const BOGIE = 7;

/* ── The brand ────────────────────────────────────────────────────────── */
const NAVY = new THREE.Color(MARK_NAVY);
const CYAN = new THREE.Color('#00C9F1');
const BLUE = new THREE.Color('#0087EA');
const PEARL = new THREE.Color('#EEF2F7');
const ROOF = new THREE.Color('#B9C0CA');

const MODEL = (name: string) => `${import.meta.env.BASE_URL}models/${name}`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth value noise, 0–1. */
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = noise2(xi, yi, seed);
  const b = noise2(xi + 1, yi, seed);
  const c = noise2(xi, yi + 1, seed);
  const d = noise2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, y, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}
/** A seeded random stream, for scattering a chunk the same way every time it is built. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ── The country ──────────────────────────────────────────────────────── */

type Biome = 'meadow' | 'forest' | 'alpine' | 'desert' | 'coast';
const BIOMES: Biome[] = ['meadow', 'forest', 'alpine', 'desert', 'coast'];
/** Metres of line each stretch of country runs for, and how long it takes to become the next. */
const BIOME_LEN = 1100;
const BIOME_BLEND = 260;

/** Which country a stretch of line runs through: never the same twice running. */
const biomeCache = new Map<number, Biome>();
function biomeAt(seg: number): Biome {
  let b = biomeCache.get(seg);
  if (!b) {
    // Iterative so a long run does not recurse thousands deep.
    let prev: Biome = 'meadow';
    for (let i = 1; i <= seg; i++) {
      const c = biomeCache.get(i);
      if (c) { prev = c; continue; }
      const pick = BIOMES[Math.floor(noise2(i, 3, 911) * BIOMES.length)];
      prev = pick === prev ? BIOMES[(BIOMES.indexOf(pick) + 1 + i % 3) % BIOMES.length] : pick;
      biomeCache.set(i, prev);
    }
    b = seg <= 0 ? 'meadow' : prev;
    biomeCache.set(seg, b);
  }
  return b;
}

/** The mix of country at a point on the line. */
function biomeMix(u: number): [Biome, Biome, number] {
  const seg = Math.floor(u / BIOME_LEN);
  const into = u - seg * BIOME_LEN;
  const t = smooth(BIOME_LEN - BIOME_BLEND, BIOME_LEN, into);
  return [biomeAt(seg), biomeAt(seg + 1), t];
}

interface BiomeLook {
  low: THREE.Color;
  high: THREE.Color;
  hills: number;
  mountains: number;
}
const LOOK: Record<Biome, BiomeLook> = {
  meadow: { low: new THREE.Color('#6E9C3E'), high: new THREE.Color('#4F7C2F'), hills: 22, mountains: 160 },
  forest: { low: new THREE.Color('#3E6A2C'), high: new THREE.Color('#2C5224'), hills: 34, mountains: 260 },
  alpine: { low: new THREE.Color('#7E8A6A'), high: new THREE.Color('#8D9297'), hills: 60, mountains: 620 },
  desert: { low: new THREE.Color('#D8B27A'), high: new THREE.Color('#B9774A'), hills: 26, mountains: 240 },
  coast: { low: new THREE.Color('#D9C796'), high: new THREE.Color('#6F9A45'), hills: 12, mountains: 120 },
};
const FIELDS = ['#83A84A', '#A7B65A', '#C8B36B', '#5F8C37', '#94A84E', '#B8A45C'].map((c) => new THREE.Color(c));
const SNOW = new THREE.Color('#F1F5F9');
const ROCK = new THREE.Color('#7D8086');
const MOON_LO = new THREE.Color('#77777A');
const MOON_HI = new THREE.Color('#BDBDBD');
const MARS_LO = new THREE.Color('#A4532E');
const MARS_HI = new THREE.Color('#D88E57');
const CLOUD_LO = new THREE.Color('#C9D6E6');
const CLOUD_HI = new THREE.Color('#FFFFFF');

/** The world the line runs through, from the market's band. */
type World = 'country' | 'clouds' | 'space' | 'moon' | 'mars';
const worldFor = (band: FlightBand): World =>
  band === 'atmosphere' ? 'country' : band === 'above-clouds' ? 'clouds' : band;

/* ── Handles ──────────────────────────────────────────────────────────── */

export interface RailOptions {
  /** Skip the detailed track and the station, for a low-power view. */
  light?: boolean;
}

export interface RailHandles extends WorldHandles {
  /** The market cap the train is sized for. */
  setMarket: (marketCap: number, change5m: number) => void;
}

interface Frame {
  x: number; y: number; z: number;
  /** Heading, radians: 0 runs toward -Z. */
  h: number;
}

interface Car {
  root: THREE.Group;
  /** Metres behind its slot, easing to 0 as it couples up. */
  extra: number;
  state: 'on' | 'off' | 'drift';
  u: number;
  v: number;
  glass: THREE.MeshStandardMaterial | null;
}

export function createRailWorld(canvas: HTMLCanvasElement, options: RailOptions = {}): RailHandles {
  const lowPower = options.light || (typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent));
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 90000);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(d: T): T => { disposables.push(d); return d; };

  /* ── Light ── */
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const headlamp = new THREE.SpotLight(0xfff1d6, 0, 260, 0.42, 0.55, 1.2);
  scene.add(headlamp, headlamp.target);

  /* ── Sky ── */
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uDisc: { value: 1 },
  };
  const skyDome = new THREE.Mesh(
    keep(new THREE.SphereGeometry(40000, 48, 24)),
    keep(new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGround, uSunCol, uGlow, uSunDir;
        uniform float uDisc;
        varying vec3 vDir;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
          c = mix(c, uTop, smoothstep(0.18, 0.75, h));
          c = mix(c, uGround, smoothstep(0.0, -0.08, h));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          c += uGlow * pow(s, 8.0) * 0.55 * smoothstep(-0.2, 0.05, h);
          c += uSunCol * smoothstep(0.9993, 0.9997, s) * uDisc;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })),
  );
  skyDome.renderOrder = -10;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  const starGeo = keep(new THREE.BufferGeometry());
  {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const r = rng(77);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const y = r() * 1.1 - 0.1;
      const k = Math.sqrt(Math.max(0, 1 - y * y));
      pos.set([Math.cos(th) * k * 30000, y * 30000, Math.sin(th) * k * 30000], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const starMat = keep(new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  /* A planet for the sky, or under the line in space. */
  const planetTex = (() => {
    const w = 512, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lat = Math.abs(y / h - 0.5) * 2;
        const land = fbm(x / 48, y / 48, 5, 5);
        const cloud = fbm(x / 30 + 9, y / 22, 8, 4);
        let r = 18, gg = 70, b = 150;
        if (land > 0.56) { r = 70 + land * 60; gg = 110 + land * 40; b = 60; }
        if (lat > 0.82) { r = gg = b = 235; }
        const cl = smooth(0.55, 0.75, cloud);
        r = lerp(r, 245, cl); gg = lerp(gg, 248, cl); b = lerp(b, 252, cl);
        const i = (y * w + x) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return keep(t);
  })();
  const planet = new THREE.Mesh(
    keep(new THREE.SphereGeometry(1, 64, 32)),
    keep(new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.9, emissive: 0x0a1630, emissiveIntensity: 0.4, fog: false })),
  );
  planet.frustumCulled = false;
  scene.add(planet);
  const halo = new THREE.Mesh(
    keep(new THREE.SphereGeometry(1.025, 64, 32)),
    keep(new THREE.MeshBasicMaterial({ color: 0x6fb8ff, transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false, depthWrite: false })),
  );
  planet.add(halo);
  const moonlets = new THREE.Group();
  for (const [r, x, y, z] of [[160, -9000, 5200, -14000], [90, 6000, 3500, -15000]]) {
    const m = new THREE.Mesh(keep(new THREE.DodecahedronGeometry(r, 1)), keep(new THREE.MeshStandardMaterial({ color: 0x9a8a7a, roughness: 1, fog: false })));
    m.position.set(x, y, z);
    moonlets.add(m);
  }
  scene.add(moonlets);

  /* ── Weather ── */
  const cloudGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const cloudMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
  const CLOUDS = 46;
  const PUFFS = 6;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUDS * PUFFS);
  clouds.frustumCulled = false;
  scene.add(clouds);
  const cloudAt: { x: number; z: number; y: number; s: number }[] = [];
  {
    const r = rng(3);
    for (let i = 0; i < CLOUDS; i++) cloudAt.push({ x: (r() - 0.5) * 5000, z: (r() - 0.5) * 5000, y: 280 + r() * 260, s: 30 + r() * 50 });
  }
  const puffOffsets: THREE.Vector3[] = [];
  {
    const r = rng(9);
    for (let i = 0; i < PUFFS; i++) puffOffsets.push(new THREE.Vector3((r() - 0.5) * 2.4, (r() - 0.3) * 0.6, (r() - 0.5) * 1.2));
  }

  const precip = (() => {
    const n = lowPower ? 2500 : 6000;
    const geo = keep(new THREE.BufferGeometry());
    const pos = new Float32Array(n * 3);
    const r = rng(12);
    for (let i = 0; i < n * 3; i++) pos[i] = r() * 120;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = keep(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSpeed: { value: 18 }, uSize: { value: 2 }, uColor: { value: new THREE.Color(0xaabbcc) }, uOpacity: { value: 0.6 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uSpeed, uSize;
        uniform vec3 uCam;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * uSpeed, 120.0);
          p.x += sin(uTime * 0.7 + position.z) * (uSpeed < 5.0 ? 1.5 : 0.0);
          vec3 base = floor(uCam / 120.0) * 120.0;
          vec3 w = base + p;
          w = w + 120.0 * step(w, uCam - 60.0) - 120.0 * step(uCam + 60.0, w);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * 60.0 / -mv.z;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }`,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, mat };
  })();

  /* ── The line's centreline ──────────────────────────────────────────
     Sampled every few metres and extended as the country ahead is built.
     The curve is the line's own, the same every run; the grade is the
     market's at the moment each stretch is laid. */
  const P0 = -900;
  let pStart = P0;
  const px: number[] = [0];
  const py: number[] = [0];
  const pz: number[] = [0];
  const ph: number[] = [0];
  let slope = 0;
  let slopeTarget = 0;
  const stationCentre = (m: number) => (m * STATION_EVERY + STATION_EVERY / 2) * CHUNK;
  /** 1 on a station's straight, 0 well away from it. */
  const stationMask = (u: number) => {
    const m = Math.round((u / CHUNK - STATION_EVERY / 2) / STATION_EVERY);
    const d = Math.abs(u - stationCentre(m));
    return 1 - smooth(110, 260, d);
  };
  const curvature = (u: number) =>
    ((Math.sin(u / 1250) * 0.65 + Math.sin(u / 3300 + 2) * 0.45) / 1600) * (1 - stationMask(u));
  const extendTo = (u: number) => {
    while ((pStart + px.length - 1) * STEP < u) {
      const i = px.length - 1;
      const uu = (pStart + i) * STEP;
      const level = stationMask(uu);
      slope += ((slopeTarget * (1 - level)) - slope) * 0.045;
      const h = ph[i] + curvature(uu) * STEP;
      px.push(px[i] + Math.sin(h) * STEP);
      pz.push(pz[i] - Math.cos(h) * STEP);
      py.push(py[i] + slope * STEP);
      ph.push(h);
    }
  };
  const trimBefore = (u: number) => {
    const drop = Math.floor(u / STEP) - pStart;
    if (drop > 4000) {
      px.splice(0, drop); py.splice(0, drop); pz.splice(0, drop); ph.splice(0, drop);
      pStart += drop;
    }
  };
  const frameAt = (u: number, out: Frame): Frame => {
    extendTo(u + STEP * 2);
    const f = u / STEP - pStart;
    const i = Math.max(0, Math.min(px.length - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - i));
    out.x = lerp(px[i], px[i + 1], t);
    out.y = lerp(py[i], py[i + 1], t);
    out.z = lerp(pz[i], pz[i + 1], t);
    out.h = lerp(ph[i], ph[i + 1], t);
    return out;
  };
  const trackY = (u: number) => frameAt(u, tmpF).y;
  const tmpF: Frame = { x: 0, y: 0, z: 0, h: 0 };

  /* ── Shared stock for the country ── */
  const flat = (hex: number) => keep(new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  const geoBase = <T extends THREE.BufferGeometry>(g: T, y0 = 0): T => { g.translate(0, y0, 0); return keep(g); };
  const STOCK = {
    trunk: { geo: geoBase(new THREE.CylinderGeometry(0.18, 0.28, 1, 5), 0.5), mat: flat(0x5b4330), cap: 520 },
    leafy: { geo: keep(new THREE.IcosahedronGeometry(1, 0)), mat: keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), cap: 300 },
    conifer: { geo: geoBase(new THREE.ConeGeometry(1, 1, 7), 0.5), mat: keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), cap: 520 },
    cactus: { geo: geoBase(new THREE.CylinderGeometry(0.32, 0.38, 1, 7), 0.5), mat: flat(0x4f7b3a), cap: 90 },
    rock: { geo: keep(new THREE.DodecahedronGeometry(1, 0)), mat: keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), cap: 140 },
    house: { geo: geoBase(new THREE.BoxGeometry(1, 1, 1), 0.5), mat: keep(new THREE.MeshLambertMaterial({ color: 0xffffff })), cap: 14 },
    roof: {
      geo: (() => { const g = new THREE.CylinderGeometry(0.62, 0.62, 1, 3); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 6); g.scale(1, 0.75, 1.15); return keep(g); })(),
      mat: flat(0x8c3b2e), cap: 14,
    },
  } as const;
  type Kind = keyof typeof STOCK;
  const KINDS = Object.keys(STOCK) as Kind[];

  const terrainMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const waterMat = keep(new THREE.MeshStandardMaterial({ color: 0x2d6f8f, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 }));
  const ballastMat = keep(new THREE.MeshLambertMaterial({ color: 0x7a7268, flatShading: true }));
  const railMat = keep(new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.35, metalness: 0.8, emissive: 0x000000 }));
  const sleeperMat = keep(new THREE.MeshLambertMaterial({ color: 0x6d655b }));
  const pierMat = keep(new THREE.MeshLambertMaterial({ color: 0xb8bcc2, flatShading: true }));
  const signalMat = keep(new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
  const sleeperGeo = keep(new THREE.BoxGeometry(2.5, 0.16, 0.26));
  const pierGeo = geoBase(new THREE.BoxGeometry(2.6, 1, 2.2), -0.5);
  const signalGeo = (() => {
    const mast = new THREE.CylinderGeometry(0.09, 0.11, 4.2, 6); mast.translate(0, 2.1, 0);
    const head = new THREE.BoxGeometry(0.42, 0.9, 0.3); head.translate(0, 4.2, 0);
    const g = mergeSimple([mast, head]);
    mast.dispose(); head.dispose();
    return keep(g);
  })();
  const lampGeo = keep(new THREE.SphereGeometry(0.13, 10, 8));
  const signalLamp = keep(new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false }));

  /* The terrain's columns: close together by the line, wide apart far off. */
  const XS: number[] = [];
  for (let i = 0; i <= SEG_X; i++) {
    const t = (i / SEG_X) * 2 - 1;
    XS.push(Math.sign(t) * Math.pow(Math.abs(t), 1.9) * HALF_WIDTH);
  }
  const SLEEPERS_PER_CHUNK = Math.round(CHUNK / 0.68);
  const RAIL_SAMPLES = Math.ceil(CHUNK / STEP) + 1;

  interface Chunk {
    k: number;
    group: THREE.Group;
    origin: Frame;
    terrain: THREE.Mesh;
    water: THREE.Mesh;
    ballast: THREE.Mesh;
    rails: THREE.Mesh;
    sleepers: THREE.InstancedMesh;
    piers: THREE.InstancedMesh;
    signal: THREE.Mesh;
    signalLamp: THREE.Mesh;
    scatter: Record<Kind, THREE.InstancedMesh>;
    world: World | null;
  }

  const ribbon = (cols: number, rows: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    g.setIndex(idx);
    return g;
  };
  /* The ballast's cross-section, and a deck's for the viaduct. */
  const BALLAST = [[-2.7, -0.95], [-1.75, -0.22], [1.75, -0.22], [2.7, -0.95]];
  const DECK = [[-2.6, -2.4], [-2.6, -0.22], [2.6, -0.22], [2.6, -2.4]];
  /* Two rails, each a little box tube: pairs of (x, y) round its section. */
  const RAIL_SECTION = [[-0.035, -0.17], [-0.035, 0], [0.035, 0], [0.035, -0.17]];
  const GAUGE_HALF = 0.7175 + 0.035;

  const chunks: Chunk[] = [];
  const chunkRoot = new THREE.Group();
  scene.add(chunkRoot);

  const makeChunk = (): Chunk => {
    const group = new THREE.Group();
    const terrainGeo = ribbon(SEG_X + 1, SEG_U + 1);
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((SEG_X + 1) * (SEG_U + 1) * 3), 3));
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = true;
    const water = new THREE.Mesh(ribbon(2, SEG_U + 1), waterMat);
    const ballast = new THREE.Mesh(ribbon(4, RAIL_SAMPLES), ballastMat);
    ballast.receiveShadow = true;
    const railsGeo = ribbon(4 * 2 + 1, RAIL_SAMPLES); // filled per rail below
    const rails = new THREE.Mesh(railsGeo, railMat);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, SLEEPERS_PER_CHUNK);
    sleepers.receiveShadow = true;
    const piers = new THREE.InstancedMesh(pierGeo, pierMat, 6);
    const signal = new THREE.Mesh(signalGeo, signalMat);
    const lamp = new THREE.Mesh(lampGeo, signalLamp);
    signal.add(lamp);
    lamp.position.set(0, 4.35, 0.16);
    const scatter = {} as Record<Kind, THREE.InstancedMesh>;
    for (const k of KINDS) {
      const m = new THREE.InstancedMesh(STOCK[k].geo, STOCK[k].mat, STOCK[k].cap);
      m.count = 0;
      if (k === 'house' || k === 'roof') m.castShadow = true;
      scatter[k] = m;
      group.add(m);
    }
    group.add(terrain, water, ballast, rails, sleepers, piers, signal);
    for (const o of [terrain, water, ballast, rails, sleepers, piers, ...Object.values(scatter)]) o.frustumCulled = false;
    return { k: -1, group, origin: { x: 0, y: 0, z: 0, h: 0 }, terrain, water, ballast, rails, sleepers, piers, signal, signalLamp: lamp, scatter, world: null };
  };

  /* Ground height at a point beside the line. */
  const heightAt = (u: number, x: number, ty: number, world: World): number => {
    const ax = Math.abs(x);
    const rise = smooth(6.5, 140, ax);
    const station = stationMask(u) * (1 - smooth(8, 40, ax));
    if (world === 'clouds') return ty - 115 + fbm(u / 140, x / 140, 31, 4) * 34 + smooth(150, 1400, ax) * 30;
    if (world === 'space') return ty - 4000;
    if (world === 'moon' || world === 'mars') {
      let h = (fbm(u / 260, x / 260, world === 'moon' ? 41 : 43, 5) - 0.45) * (world === 'moon' ? 38 : 70);
      if (world === 'mars') h += smooth(250, 1100, ax) * Math.max(0, fbm(u / 700, x / 700, 47, 3) - 0.45) * 900;
      // Craters: a bowl and a lip, on a lattice.
      const cu = Math.floor(u / 180), cx = Math.floor(x / 180);
      for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) {
        const i = cu + a, j = cx + b;
        const r = 14 + noise2(i, j, 51) * 70;
        const ccx = (j + noise2(i, j, 52)) * 180, ccu = (i + noise2(i, j, 53)) * 180;
        const d = Math.hypot(x - ccx, u - ccu) / r;
        if (d < 1.6) h += (d < 1 ? (d * d - 1) * r * 0.32 : Math.max(0, 1 - (d - 1) / 0.6) * r * 0.08);
      }
      return lerp(ty - 0.95 + rise * h, ty - 0.95, station);
    }
    const [a, b, t] = biomeMix(u);
    const hills = (fbm(u / 230, x / 230, 11, 4) - 0.42);
    const ridged = 1 - Math.abs(fbm(u / 650, x / 650, 13, 4) * 2 - 1);
    const look = (bm: Biome) => {
      let h = hills * LOOK[bm].hills * rise + smooth(180, 1100, ax) * Math.pow(ridged, 2.2) * LOOK[bm].mountains;
      if (bm === 'desert') h = Math.round(h / 16) * 16 * 0.7 + h * 0.3;
      if (bm === 'coast' && x > 0) h = lerp(h, -16 - smooth(60, 600, x) * 24, smooth(18, 70, x));
      return h;
    };
    const h = lerp(look(a), look(b), t);
    return lerp(ty - 0.95 + h, ty - 0.95, station);
  };
  const coastAt = (u: number) => {
    const [a, b, t] = biomeMix(u);
    return (a === 'coast' ? 1 - t : 0) + (b === 'coast' ? t : 0);
  };
  const colour = new THREE.Color();
  const colourAt = (u: number, x: number, h: number, ty: number, world: World, out: THREE.Color) => {
    const rel = h - ty;
    const n = vnoise(u / 37, x / 37, 61);
    if (world === 'clouds') return out.copy(CLOUD_LO).lerp(CLOUD_HI, smooth(-120, -90, rel) * 0.7 + n * 0.3);
    if (world === 'moon') return out.copy(MOON_LO).lerp(MOON_HI, n * 0.6 + smooth(-20, 20, rel) * 0.4);
    if (world === 'mars') return out.copy(MARS_LO).lerp(MARS_HI, n * 0.6 + smooth(-30, 120, rel) * 0.4);
    if (world === 'space') return out.set(0x000000);
    const [a, b, t] = biomeMix(u);
    const look = (bm: Biome, o: THREE.Color) => {
      const L = LOOK[bm];
      o.copy(L.low).lerp(L.high, smooth(0, 80, rel) * 0.7 + n * 0.3);
      if (bm === 'meadow' && Math.abs(x) > 14 && Math.abs(x) < 700) {
        const cell = noise2(Math.floor(u / 70), Math.floor(x / 55), 71);
        o.lerp(FIELDS[Math.floor(cell * FIELDS.length)], 0.75 * (1 - smooth(10, 40, rel)));
      }
      if (bm === 'alpine') {
        o.lerp(ROCK, smooth(30, 90, rel) * 0.8);
        o.lerp(SNOW, smooth(70, 160, rel + n * 40));
      }
      if (bm === 'desert') o.lerp(new THREE.Color('#C98B57'), (Math.sin(rel * 0.5) * 0.5 + 0.5) * smooth(8, 30, rel) * 0.6);
      if (bm === 'coast' && x > 0) o.lerp(new THREE.Color('#E3D3A2'), smooth(10, 30, x) * (1 - smooth(-7, -3, rel) * 0) );
      return o;
    };
    look(a, out);
    if (t > 0) out.lerp(look(b, colour.clone()), t);
    return out;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const fa: Frame = { x: 0, y: 0, z: 0, h: 0 };
  const fb: Frame = { x: 0, y: 0, z: 0, h: 0 };

  /** A point beside the line, in a chunk's own coordinates. */
  const local = (f: Frame, x: number, y: number, o: Frame, out: THREE.Vector3) =>
    out.set(f.x + Math.cos(f.h) * x - o.x, y - o.y, f.z + Math.sin(f.h) * x - o.z);

  let world: World = 'country';
  let currentBand: FlightBand = 'atmosphere';

  const buildChunk = (c: Chunk, k: number) => {
    c.k = k;
    c.world = world;
    const u0 = k * CHUNK;
    const o = frameAt(u0, c.origin);
    const origin = { ...o };
    c.origin = origin;

    /* Terrain */
    const tPos = c.terrain.geometry.attributes.position as THREE.BufferAttribute;
    const tCol = c.terrain.geometry.attributes.color as THREE.BufferAttribute;
    for (let j = 0; j <= SEG_U; j++) {
      const u = u0 + (j / SEG_U) * CHUNK;
      const f = frameAt(u, fa);
      for (let i = 0; i <= SEG_X; i++) {
        const x = XS[i];
        const h = heightAt(u, x, f.y, world);
        local(f, x, h, origin, v3);
        const n = j * (SEG_X + 1) + i;
        tPos.setXYZ(n, v3.x, v3.y, v3.z);
        colourAt(u, x, h, f.y, world, colour);
        tCol.setXYZ(n, colour.r, colour.g, colour.b);
      }
    }
    tPos.needsUpdate = true;
    tCol.needsUpdate = true;
    c.terrain.geometry.computeVertexNormals();
    c.terrain.geometry.computeBoundingSphere();
    c.terrain.visible = world !== 'space';

    /* Water, on the coast's seaward side */
    const coastAny = world === 'country' && (coastAt(u0) > 0 || coastAt(u0 + CHUNK) > 0);
    c.water.visible = coastAny;
    if (coastAny) {
      const wp = c.water.geometry.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j <= SEG_U; j++) {
        const u = u0 + (j / SEG_U) * CHUNK;
        const f = frameAt(u, fa);
        const sea = coastAt(u);
        const y = f.y - 5.5 - (1 - sea) * 60;
        local(f, 14, y, origin, v3); wp.setXYZ(j * 2, v3.x, v3.y, v3.z);
        local(f, HALF_WIDTH, y, origin, v3); wp.setXYZ(j * 2 + 1, v3.x, v3.y, v3.z);
      }
      wp.needsUpdate = true;
      c.water.geometry.computeVertexNormals();
    }

    /* Ballast, or the viaduct's deck */
    const deck = world === 'clouds' || world === 'space';
    const section = deck ? DECK : BALLAST;
    const bp = c.ballast.geometry.attributes.position as THREE.BufferAttribute;
    const rp = c.rails.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < RAIL_SAMPLES; j++) {
      const u = u0 + Math.min(CHUNK, j * STEP);
      const f = frameAt(u, fa);
      section.forEach(([x, y], i) => { local(f, x, f.y + y, origin, v3); bp.setXYZ(j * 4 + i, v3.x, v3.y, v3.z); });
      /* Both rails in one ribbon: the second rail's section follows the first's,
         joined by a degenerate column the ballast hides. */
      let col = 0;
      for (const side of [-1, 1]) {
        for (const [dx, dy] of RAIL_SECTION) {
          local(f, side * GAUGE_HALF + dx, f.y + dy, origin, v3);
          rp.setXYZ(j * 9 + col, v3.x, v3.y, v3.z);
          col++;
        }
        if (side < 0) { rp.setXYZ(j * 9 + col, v3.x, v3.y - 0.6, v3.z); col++; }
      }
    }
    bp.needsUpdate = true;
    rp.needsUpdate = true;
    c.ballast.geometry.computeVertexNormals();
    c.rails.geometry.computeVertexNormals();
    c.ballast.material = deck ? pierMat : ballastMat;
    c.ballast.visible = true;

    /* Sleepers */
    for (let i = 0; i < SLEEPERS_PER_CHUNK; i++) {
      const u = u0 + (i + 0.5) * (CHUNK / SLEEPERS_PER_CHUNK);
      const f = frameAt(u, fa);
      local(f, 0, f.y - 0.17, origin, v3);
      q.setFromAxisAngle(yAxis, -f.h);
      m4.compose(v3, q, s3.set(1, 1, 1));
      c.sleepers.setMatrixAt(i, m4);
    }
    c.sleepers.instanceMatrix.needsUpdate = true;
    c.sleepers.visible = world !== 'space';

    /* Piers, under the viaduct over the clouds */
    c.piers.visible = world === 'clouds';
    if (world === 'clouds') {
      for (let i = 0; i < 6; i++) {
        const u = u0 + (i + 0.5) * (CHUNK / 6);
        const f = frameAt(u, fa);
        local(f, 0, f.y - 2.4, origin, v3);
        q.setFromAxisAngle(yAxis, -f.h);
        m4.compose(v3, q, s3.set(1, 140, 1));
        c.piers.setMatrixAt(i, m4);
      }
      c.piers.instanceMatrix.needsUpdate = true;
    }

    /* A signal, every few chunks, its aspect the market's */
    c.signal.visible = k % 3 === 0 && world !== 'space';
    if (c.signal.visible) {
      const f = frameAt(u0 + 20, fa);
      local(f, -2.9, f.y - 0.2, origin, v3);
      c.signal.position.copy(v3);
      c.signal.rotation.set(0, -f.h, 0);
    }

    /* The country's furniture */
    for (const kind of KINDS) c.scatter[kind].count = 0;
    if (world !== 'clouds' && world !== 'space') scatter(c, u0, origin);
    for (const kind of KINDS) {
      c.scatter[kind].instanceMatrix.needsUpdate = true;
      if (c.scatter[kind].instanceColor) c.scatter[kind].instanceColor.needsUpdate = true;
    }
  };

  const put = (c: Chunk, kind: Kind, pos: THREE.Vector3, rotY: number, sx: number, sy: number, sz: number, col?: THREE.Color) => {
    const m = c.scatter[kind];
    if (m.count >= STOCK[kind].cap) return;
    q.setFromAxisAngle(yAxis, rotY);
    m4.compose(pos, q, s3.set(sx, sy, sz));
    m.setMatrixAt(m.count, m4);
    if (col) m.setColorAt(m.count, col);
    m.count++;
  };
  const LEAF = [new THREE.Color('#4E7F32'), new THREE.Color('#5E8F3A'), new THREE.Color('#3F6E2A'), new THREE.Color('#7C9A3A')];
  const PINE = [new THREE.Color('#2F5A2E'), new THREE.Color('#284F2A'), new THREE.Color('#3A6634')];
  const WALL = [new THREE.Color('#EDE6D6'), new THREE.Color('#D9CBB0'), new THREE.Color('#F4F1EA'), new THREE.Color('#C9B38E')];
  const tint = new THREE.Color();

  const scatter = (c: Chunk, u0: number, origin: Frame) => {
    const r = rng(c.k * 7919 + 17);
    const candidates = lowPower ? 520 : 900;
    for (let n = 0; n < candidates; n++) {
      const u = u0 + r() * CHUNK;
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (14 + Math.pow(r(), 1.7) * 900);
      if (stationMask(u) > 0.2 && Math.abs(x) < 30) continue;
      // Clear ground in front of each billboard.
      const bs = Math.round(u / BILLBOARD_EVERY - 0.5);
      const bu = (bs + 0.5) * BILLBOARD_EVERY;
      if (u > bu - 10 && u < bu + 90 && Math.sign(x) === (bs % 2 ? 1 : -1) && Math.abs(x) < 45) continue;
      const f = frameAt(u, fa);
      const h = heightAt(u, x, f.y, world);
      const pos = local(f, x, h, origin, v3);
      const roll = r();
      const yaw = r() * Math.PI * 2;
      if (world === 'moon' || world === 'mars') {
        if (roll < 0.16) {
          const s = 0.5 + Math.pow(r(), 3) * 9;
          tint.copy(world === 'moon' ? MOON_LO : MARS_LO).multiplyScalar(0.8 + r() * 0.4);
          put(c, 'rock', pos.setY(pos.y - s * 0.3), yaw, s * (0.8 + r() * 0.6), s * 0.6, s);
          c.scatter.rock.setColorAt(c.scatter.rock.count - 1, tint);
        }
        continue;
      }
      const [a, b, t] = biomeMix(u);
      const bm = r() < t ? b : a;
      if (bm === 'coast' && x > 12) continue; // the sea side
      const scale = 0.75 + r() * 0.6;
      const shift = (by: number) => { pos.y -= by; return pos; };
      if (bm === 'meadow') {
        if (roll < 0.22) {
          const ht = 6 * scale;
          put(c, 'trunk', pos, yaw, scale, ht * 0.45, scale);
          v3.y += ht * 0.62;
          put(c, 'leafy', v3, yaw, ht * 0.42, ht * 0.38, ht * 0.42, LEAF[Math.floor(r() * LEAF.length)]);
        } else if (roll < 0.235 && Math.abs(x) > 30 && Math.abs(x) < 380) {
          const w = 7 + r() * 5, d = 9 + r() * 6, hh = 4 + r() * 3;
          const rot = -f.h + (r() < 0.5 ? 0 : Math.PI / 2);
          put(c, 'house', shift(0.3), rot, w, hh, d, WALL[Math.floor(r() * WALL.length)]);
          v3.y += hh;
          put(c, 'roof', v3, rot, w * 1.05, hh * 0.55, d * 1.05);
        }
      } else if (bm === 'forest') {
        if (roll < 0.7) {
          const ht = 9 * scale + r() * 5;
          put(c, 'conifer', shift(0.2), yaw, ht * 0.28, ht, ht * 0.28, PINE[Math.floor(r() * PINE.length)]);
        } else if (roll < 0.78) {
          const ht = 7 * scale;
          put(c, 'trunk', pos, yaw, scale, ht * 0.45, scale);
          v3.y += ht * 0.62;
          put(c, 'leafy', v3, yaw, ht * 0.42, ht * 0.38, ht * 0.42, LEAF[Math.floor(r() * LEAF.length)]);
        }
      } else if (bm === 'alpine') {
        const rel = h - f.y;
        if (roll < 0.36 && rel < 90) {
          const ht = 8 * scale + r() * 4;
          tint.copy(PINE[Math.floor(r() * PINE.length)]).lerp(SNOW, 0.35 * smooth(10, 70, rel) + 0.1);
          put(c, 'conifer', shift(0.2), yaw, ht * 0.3, ht, ht * 0.3, tint);
        } else if (roll < 0.44) {
          const s = 1 + Math.pow(r(), 3) * 8;
          put(c, 'rock', shift(s * 0.3), yaw, s, s * 0.7, s * 1.2, ROCK);
        }
      } else if (bm === 'desert') {
        if (roll < 0.06) {
          const ht = 2.5 + r() * 4;
          put(c, 'cactus', pos, yaw, 1, ht, 1);
        } else if (roll < 0.12) {
          const s = 0.8 + Math.pow(r(), 3) * 7;
          tint.set('#B07A4E').multiplyScalar(0.85 + r() * 0.3);
          put(c, 'rock', shift(s * 0.3), yaw, s * 1.3, s * 0.7, s, tint);
        }
      } else if (bm === 'coast') {
        if (roll < 0.12) {
          const ht = 5 * scale;
          put(c, 'trunk', pos, yaw, scale, ht * 0.5, scale);
          v3.y += ht * 0.66;
          put(c, 'leafy', v3, yaw, ht * 0.4, ht * 0.32, ht * 0.4, LEAF[Math.floor(r() * LEAF.length)]);
        }
      }
    }
  };

  const ensureChunks = (s: number) => {
    const first = Math.floor(s / CHUNK) - BEHIND;
    if (!chunks.length) {
      for (let i = 0; i < CHUNKS; i++) {
        const c = makeChunk();
        chunks.push(c);
        chunkRoot.add(c.group);
        buildChunk(c, first + i);
      }
      return;
    }
    // Recycle the chunks that have fallen behind to the front, one a frame at most
    // beyond the first, so a long frame does not stall on a dozen rebuilds.
    let rebuilt = 0;
    for (const c of chunks) {
      if (c.k < first && rebuilt < 2) {
        const top = Math.max(...chunks.map((x) => x.k));
        buildChunk(c, top + 1);
        rebuilt++;
      }
    }
  };
  const rebuildAll = () => {
    for (const c of chunks) buildChunk(c, c.k);
    placeStations(true);
    placeBillboards(true);
  };

  /* ── The supplied models ─────────────────────────────────────────── */
  let lead: THREE.Group | null = null;
  let carriage: THREE.Group | null = null;
  let trackTile: THREE.Group | null = null;
  let stationModel: THREE.Group | null = null;
  let billboardModel: THREE.Group | null = null;
  let disposed = false;

  const loadAll = async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const get = (name: string) => loader.loadAsync(MODEL(name)).then((g: GLTF) => g.scene).catch(() => null);
    const [l, c] = await Promise.all([get('train-lead.glb'), get('train-carriage.glb')]);
    if (disposed) return;
    if (l && c) {
      lead = l; carriage = c;
      buildConsist();
    }
    const [t, st, bb] = await Promise.all([get('track.glb'), options.light ? null : get('station.glb'), get('billboard.glb')]);
    if (disposed) return;
    if (t) { trackTile = t; buildTrackTiles(); }
    if (st) { stationModel = st; buildStations(); }
    if (bb) { billboardModel = bb; buildBillboards(); }
  };

  /* ── Livery ──────────────────────────────────────────────────────────
     The car body is one material in the model, so the livery is painted by
     height on the car rather than by texture: navy skirt, a cyan line, pearl
     sides, a grey roof — the airline's colours, carried over. The name and
     the mark go on as decals drawn to a canvas, as the airliner's did. */
  const liveryMat = (() => {
    const m = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNavy = { value: NAVY };
      sh.uniforms.uCyan = { value: CYAN };
      sh.uniforms.uPearl = { value: PEARL };
      sh.uniforms.uRoof = { value: ROOF };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uNavy, uCyan, uPearl, uRoof;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float yy = vObj.y;
          vec3 liv = mix(uNavy, uPearl, smoothstep(0.54, 0.56, yy));
          liv = mix(liv, uCyan, step(0.56, yy) * (1.0 - step(0.66, yy)));
          liv = mix(liv, uRoof, smoothstep(3.02, 3.08, yy));
          diffuseColor.rgb = liv;`);
    };
    m.customProgramCacheKey = () => 'seat-livery';
    return m;
  })();
  const capMat = keep(new THREE.MeshPhysicalMaterial({ color: NAVY, roughness: 0.28, metalness: 0.2, clearcoat: 1 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.5 }));
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.4, metalness: 0.4 }));
  const lightsMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 }));
  const ledMat = keep(new THREE.MeshStandardMaterial({ color: 0x002a33, emissive: CYAN, emissiveIntensity: 1.6 }));
  const seatMat = keep(new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.8 }));
  const interiorMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: 0.6, metalness: 0.3 }));
  const glassBase = keep(new THREE.MeshStandardMaterial({ color: 0x0f1a26, roughness: 0.06, metalness: 0.6, transparent: true, opacity: 0.82, emissive: 0xffe2a8, emissiveIntensity: 0 }));

  const restyle = (root: THREE.Object3D, glass: THREE.MeshStandardMaterial) => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
      mesh.castShadow = name === 'Body';
      mesh.material =
        name === 'Body' ? liveryMat
        : name === 'Metal' ? capMat
        : name === 'GLASS' ? glass
        : name === 'Lights' ? lightsMat
        : name === 'speed_text' ? ledMat
        : name === 'frame' ? frameMat
        : name === 'seat' ? seatMat
        : name === 'None' ? interiorMat
        : darkMat;
    });
  };

  /* Canvas artwork: the mark, and type. */
  const fontFace = (size: number, weight = 800) => `${weight} ${size}px Montserrat, "Helvetica Neue", Arial, sans-serif`;
  const drawMark = (g: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string) => {
    g.save();
    g.translate(x, y);
    g.scale(size / 1536, size / 1536);
    g.fillStyle = fill;
    g.fill(new Path2D(MARK_PATH), 'evenodd');
    g.restore();
  };
  const spaced = (g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number, align: 'left' | 'center' = 'left') => {
    let w = 0;
    for (const ch of text) w += g.measureText(ch).width + track;
    let at = align === 'center' ? x - w / 2 : x;
    for (const ch of text) { g.fillText(ch, at, y); at += g.measureText(ch).width + track; }
    return w;
  };
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const redraw = () => { g.clearRect(0, 0, w, h); draw(g); tex.needsUpdate = true; };
    redraw();
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready?.then(redraw);
    return { tex, redraw, g, canvas: c };
  };

  /** `SEAT RAILWAY` with the mark, for the lead car's flanks. */
  const titleArt = canvasTex(2048, 256, (g) => {
    drawMark(g, 0, -10, 276, MARK_NAVY);
    g.fillStyle = MARK_NAVY;
    g.font = fontFace(150);
    g.textBaseline = 'middle';
    spaced(g, 'SEAT RAILWAY', 300, 136, 10);
  });
  /** The mark alone, for every carriage. */
  const markArt = canvasTex(256, 256, (g) => drawMark(g, 0, 0, 256, MARK_NAVY));
  const decalMat = (map: THREE.Texture) => keep(new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
  const titleMat = decalMat(titleArt.tex);
  const markMat = decalMat(markArt.tex);
  /** The cab's destination display: the market cap, in LEDs. */
  let shownCap = '';
  let shownNext = '';
  const ledArt = canvasTex(512, 128, (g) => {
    g.fillStyle = '#02080C';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#00C9F1';
    g.font = `700 84px "Courier New", ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(shownCap || '$—', 256, 68);
  });
  const ledFace = keep(new THREE.MeshBasicMaterial({ map: ledArt.tex, toneMapped: false }));

  const decalGeo = keep(new THREE.PlaneGeometry(1, 1));
  /** Body half-width at a height, from the model, so decals sit on the skin. */
  const skinAt = (root: THREE.Object3D, y0: number, y1: number) => {
    let max = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.material !== liveryMat) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > y0 && y < y1 && Math.abs(p.getZ(i)) < 6) max = Math.max(max, Math.abs(p.getX(i)));
      }
    });
    return max || 1.6;
  };

  const cars: Car[] = [];
  const consist = new THREE.Group();
  scene.add(consist);

  const addDecals = (root: THREE.Group, kind: 'lead' | 'car', skin: number, no: number) => {
    for (const side of [-1, 1]) {
      if (kind === 'lead') {
        const d = new THREE.Mesh(decalGeo, titleMat);
        d.scale.set(4.6, 0.575, 1);
        d.position.set(side * (skin + 0.012), 1.02, 1.6);
        d.rotation.y = side * Math.PI / 2;
        root.add(d);
      }
      const m = new THREE.Mesh(decalGeo, markMat);
      m.scale.set(0.62, 0.62, 1);
      m.position.set(side * (skin + 0.012), 1.02, kind === 'lead' ? -2.6 : -8.6);
      m.rotation.y = side * Math.PI / 2;
      root.add(m);
    }
    void no;
  };

  const buildConsist = () => {
    if (!lead || !carriage) return;
    const skin = Math.max(skinAt(lead, 0.8, 1.3), 1.625);
    for (let i = 0; i <= MAX_CARRIAGES; i++) {
      const glass = keep(glassBase.clone());
      const isLead = i === 0;
      const root = new THREE.Group();
      const body = (isLead ? lead : carriage).clone(true);
      restyle(body, glass);
      root.add(body);
      addDecals(root, isLead ? 'lead' : 'car', skin, i);
      if (isLead) {
        // The destination display, over the model's own LED panel.
        const led = new THREE.Mesh(decalGeo, ledFace);
        led.scale.set(0.40, 0.2, 1);
        led.position.set(0.015, 1.065, -9.765);
        led.rotation.y = Math.PI;
        root.add(led);
      }
      root.visible = false;
      consist.add(root);
      cars.push({ root, extra: 0, state: 'off', u: 0, v: 0, glass });
    }
    // The tail car: the lead car again, turned round, so the train ends in a cab.
    tailRoot = new THREE.Group();
    const tail = lead.clone(true);
    tailGlass = keep(glassBase.clone());
    restyle(tail, tailGlass);
    tail.rotation.y = Math.PI;
    tailRoot.add(tail);
    const tailLamps = keep(new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
    tail.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material === lightsMat) m.material = tailLamps; });
    addDecals(tailRoot, 'car', skin, 99);
    tailRoot.visible = false;
    consist.add(tailRoot);
    consistAt = performance.now();
    cars[0].state = 'on';
    cars[0].root.visible = true;
    placeholder.visible = false;
  };
  let consistAt = 0;
  let tailRoot: THREE.Group | null = null;
  let tailGlass: THREE.MeshStandardMaterial | null = null;
  let tailExtra = 0;

  /* Until the models arrive: a plain car in the livery, so the first frame is a train. */
  const placeholder = new THREE.Mesh(keep(new THREE.BoxGeometry(3.2, 3.1, CAR_LEN)), liveryMat);
  placeholder.geometry.translate(0, 1.65, 0);
  scene.add(placeholder);

  /* ── Detailed track near the camera ── */
  const tileParts: THREE.InstancedMesh[] = [];
  const TILES_NEAR = (NEAR_TRACK * 2 + 1) * 11;
  const buildTrackTiles = () => {
    if (!trackTile) return;
    trackTile.updateMatrixWorld(true);
    trackTile.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      keep(geo);
      const mat = name === 'None'
        ? keep(new THREE.MeshStandardMaterial({ color: 0x8d8780, roughness: 0.9 }))
        : railMat;
      const inst = new THREE.InstancedMesh(geo, mat, TILES_NEAR);
      inst.count = 0;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      scene.add(inst);
      tileParts.push(inst);
    });
  };

  /* ── Stations ── */
  interface StationSlot { root: THREE.Group; m: number; boards: { redraw: () => void }[] }
  const stationSlots: StationSlot[] = [];
  const boardArt = () => canvasTex(1024, 256, (g) => {
    g.fillStyle = MARK_NAVY;
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#00C9F1';
    g.fillRect(0, 222, 1024, 14);
    drawMark(g, 20, 14, 200, '#FFFFFF');
    g.fillStyle = '#FFFFFF';
    g.font = fontFace(72);
    g.textBaseline = 'middle';
    spaced(g, 'SEAT RAILWAY', 240, 78, 6);
    g.font = fontFace(46, 600);
    g.fillStyle = '#BFEFFF';
    spaced(g, shownNext ? `${shownCap} · next carriage ${shownNext}` : `${shownCap} · full length`, 242, 160, 2);
  });
  const buildStations = () => {
    if (!stationModel) return;
    stationModel.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (name === 'Roof_MAt') mesh.material = keep(new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.5, side: THREE.DoubleSide }));
      else if (name === 'Floor') mesh.material = keep(new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.9 }));
      else if (name === 'I_beam' || name === 'Sign_Post' || name === 'POLE') mesh.material = keep(new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.5, metalness: 0.4 }));
      else if (name === 'Light_Bar') mesh.material = lightsMat;
      else if (name === 'Material.004') mesh.material = keep(new THREE.MeshStandardMaterial({ color: CYAN, roughness: 0.6 }));
    });
    for (let i = 0; i < 2; i++) {
      const root = new THREE.Group();
      const inner = stationModel.clone(true);
      // Scaled up about the platform's edge, which stays where it is.
      const scaled = new THREE.Group();
      inner.position.set(-PLATFORM_EDGE, -PLATFORM_Y, 0);
      scaled.add(inner);
      scaled.scale.setScalar(STATION_SCALE);
      scaled.position.set(PLATFORM_EDGE, PLATFORM_Y, 0);
      root.add(scaled);
      const boards: { redraw: () => void }[] = [];
      for (const z of [-30, 0, 30]) {
        const art = boardArt();
        boards.push(art);
        const mat = keep(new THREE.MeshStandardMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.35 }));
        // Two faces back to back, so the sign reads the right way round from either side.
        for (const turn of [-Math.PI / 2, Math.PI / 2]) {
          const b = new THREE.Mesh(decalGeo, mat);
          b.scale.set(4.4, 1.1, 1);
          b.position.set(PLATFORM_EDGE + 2.4 + (turn > 0 ? 0.02 : 0), 3.5, z);
          b.rotation.y = turn;
          root.add(b);
        }
      }
      root.visible = false;
      scene.add(root);
      stationSlots.push({ root, m: -1, boards });
    }
    placeStations(true);
  };
  const placeStations = (force = false) => {
    if (!stationSlots.length) return;
    const near = Math.round((s / CHUNK - STATION_EVERY / 2) / STATION_EVERY);
    [near, near + 1].forEach((m, i) => {
      const slot = stationSlots[(m % 2 + 2) % 2] ?? stationSlots[i];
      if (slot.m === m && !force) return;
      slot.m = m;
      slot.root.visible = world === 'country' || world === 'moon' || world === 'mars';
    });
  };

  /* ── Billboards ── */
  interface Board { root: THREE.Group; panel: THREE.MeshStandardMaterial; art: ReturnType<typeof canvasTex>; slot: number; shows: string }
  const boards: Board[] = [];
  let adverts: string[] = [];
  const imageCache = new Map<string, HTMLImageElement | null>();
  const drawHouseAd = (g: CanvasRenderingContext2D, w: number, h: number, n: number) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, MARK_NAVY);
    grad.addColorStop(1, n % 2 ? '#0087EA' : '#003A8C');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    drawMark(g, 24, (h - 330) / 2, 330, '#FFFFFF');
    g.fillStyle = '#FFFFFF';
    g.textBaseline = 'middle';
    g.font = fontFace(60);
    spaced(g, 'SEAT RAILWAY', 372, h * 0.34, 4);
    g.font = fontFace(40, 600);
    g.fillStyle = '#BFEFFF';
    spaced(g, n % 2 ? 'Hold more. Ride longer.' : 'This billboard is a seat.', 374, h * 0.55, 0);
    g.font = fontFace(30, 600);
    g.fillStyle = '#FFFFFF';
    spaced(g, n % 2 ? `Market cap ${shownCap}` : 'Seated holders advertise here', 374, h * 0.72, 0);
  };
  const paintBoard = (b: Board) => {
    const src = adverts.length ? adverts[b.slot % adverts.length] : '';
    b.shows = src;
    const g = b.art.g;
    const w = b.art.canvas.width, h = b.art.canvas.height;
    g.clearRect(0, 0, w, h);
    if (!src) { drawHouseAd(g, w, h, b.slot); b.art.tex.needsUpdate = true; return; }
    const draw = (img: HTMLImageElement | null) => {
      if (b.shows !== src) return;
      if (!img) { drawHouseAd(g, w, h, b.slot); b.art.tex.needsUpdate = true; return; }
      g.fillStyle = MARK_NAVY;
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, h, h);
      drawMark(g, h + 40, 60, 160, '#FFFFFF');
      g.fillStyle = '#FFFFFF';
      g.font = fontFace(40);
      g.textBaseline = 'middle';
      spaced(g, 'SEAT RAILWAY', h + 40, h * 0.62, 3);
      g.font = fontFace(34, 600);
      g.fillStyle = '#BFEFFF';
      spaced(g, 'A holder’s advert', h + 42, h * 0.78, 1);
      try { b.art.tex.needsUpdate = true; } catch { /* tainted: left as it was */ }
    };
    const cached = imageCache.get(src);
    if (cached !== undefined) { draw(cached); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageCache.set(src, img); draw(img); };
    img.onerror = () => { imageCache.set(src, null); draw(null); };
    img.src = src;
  };
  const buildBillboards = () => {
    if (!billboardModel) return;
    for (let i = 0; i < 3; i++) {
      const root = new THREE.Group();
      const model = billboardModel.clone(true);
      // Repainted, not cleared, whenever the fonts arrive and the canvas is redrawn.
      const holder: { b?: Board } = {};
      const art = canvasTex(1024, 456, () => { if (holder.b) paintBoard(holder.b); });

      const backing = keep(new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.8 }));
      const panel = keep(new THREE.MeshStandardMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.25, roughness: 0.6 }));
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const swapped = mats.map((m) => {
          if (m.name === 'Material #89') return backing;
          // Metal with nothing to reflect reads as black; a painted steel instead.
          const st = m as THREE.MeshStandardMaterial;
          if (st.isMeshStandardMaterial) { st.metalness = Math.min(st.metalness, 0.35); st.roughness = Math.max(st.roughness, 0.55); }
          return m;
        });
        mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0];
      });
      // The advert on a plane of its own over the model's panel, whose UVs do not span it.
      const face = new THREE.Mesh(decalGeo, panel);
      face.scale.set(5.08, 2.27, 1);
      face.position.set(0.01, 4.905, 0.19);
      model.add(face);
      model.scale.setScalar(1.45);
      root.add(model);
      root.visible = false;
      scene.add(root);
      const b: Board = { root, panel, art, slot: -1, shows: '' };
      holder.b = b;
      boards.push(b);
    }
    placeBillboards(true);
  };
  const placeBillboards = (force = false) => {
    if (!boards.length) return;
    const first = Math.floor(s / BILLBOARD_EVERY);
    for (let i = 0; i < boards.length; i++) {
      const slot = first + i;
      const b = boards[((slot % boards.length) + boards.length) % boards.length];
      if (b.slot !== slot || force) {
        b.slot = slot;
        paintBoard(b);
      }
    }
  };

  /* ── State ── */
  let s = 0;
  let speed = 40;
  let lastT = 0;
  let manual: ManualControls = HANDS_OFF;
  let taken = 0;
  let cap = 163_000;
  let change = 0;
  let wantCars = carriagesFor(cap);
  let wheelTurn = 0;
  let w = 1, h = 1;
  let lastFrame = { x: 0, y: 0 };

  const setMarket = (marketCap: number, change5m: number) => {
    if (!Number.isFinite(marketCap)) return;
    cap = marketCap;
    change = Number.isFinite(change5m) ? change5m : 0;
    wantCars = carriagesFor(cap);
    const text = formatCap(cap);
    const next = nextCarriageAt(cap);
    const nextText = next ? formatCap(next) : '';
    if (text !== shownCap || nextText !== shownNext) {
      shownCap = text;
      shownNext = nextText;
      ledArt.redraw();
      for (const st of stationSlots) for (const bd of st.boards) bd.redraw();
      for (const b of boards) if (!b.shows) paintBoard(b);
    }
  };

  const placeAlong = (root: THREE.Object3D, u: number, origin: Frame, flip = false) => {
    const f1 = frameAt(u + BOGIE, fa);
    local(f1, 0, f1.y, origin, v3);
    const ax = v3.x, ay = v3.y, az = v3.z;
    const f2 = frameAt(u - BOGIE, fb);
    local(f2, 0, f2.y, origin, v3);
    root.position.set((ax + v3.x) / 2, (ay + v3.y) / 2, (az + v3.z) / 2);
    // Face from the rear bogie to the front one: the models run nose to -Z.
    const dx = ax - v3.x, dy = ay - v3.y, dz = az - v3.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    root.rotation.set(pitch, yaw + (flip ? 0 : 0), 0, 'YXZ');
  };

  const sunDir = new THREE.Vector3();
  const cTop = new THREE.Color(), cMid = new THREE.Color(), cHor = new THREE.Color(), cGround = new THREE.Color();
  const target = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  const render = (a: Attitude, sky: SkyState, band: BandState, pose: ViewPose) => {
    const now = performance.now();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    const time = now / 1000;

    if (import.meta.env.DEV) {
      const o = window as unknown as { __railBand?: FlightBand; __railCap?: number };
      if (o.__railBand) band = { ...band, band: o.__railBand };
      if (o.__railCap) setMarket(o.__railCap, change);
    }
    /* The world, from the market's band. */
    if (band.band !== currentBand) {
      currentBand = band.band;
      const next = worldFor(band.band);
      if (next !== world) {
        world = next;
        if (chunks.length) rebuildAll();
      }
    }

    /* The grade the line ahead is laid at, and the speed along it. */
    slopeTarget = Math.tan(THREE.MathUtils.degToRad(gradeFor(a.pitch)));
    const want = pose.speed ?? trainSpeedFor(a.speed);
    speed += (want - speed) * Math.min(1, dt * 0.6);
    if (!pose.freeze) s += speed * dt * (pose.timeScale ?? 1);
    if (import.meta.env.DEV) {
      const jump = (window as unknown as { __railJump?: number });
      if (jump.__railJump) { s += jump.__railJump; jump.__railJump = 0; }
    }
    ensureChunks(s);
    trimBefore(s - (BEHIND + 4) * CHUNK - CAR_PITCH * (MAX_CARRIAGES + 2));

    const origin = frameAt(s, { x: 0, y: 0, z: 0, h: 0 });
    for (const c of chunks) c.group.position.set(c.origin.x - origin.x, c.origin.y - origin.y, c.origin.z - origin.z);

    /* The train */
    wheelTurn += speed * dt;
    if (cars.length) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const slotU = s - i * CAR_PITCH;
        const wanted = i === 0 || i <= wantCars;
        if (wanted && car.state !== 'on') {
          // Couples up from behind — except for the train the page opens on.
          car.state = 'on';
          car.extra = now - consistAt > 4000 ? 80 : 0;
          car.root.visible = true;
        } else if (!wanted && car.state === 'on') {
          // Uncoupled: rolls on, slowing, and is left behind.
          car.state = 'drift';
          car.u = slotU - car.extra;
          car.v = speed;
        }
        if (car.state === 'on') {
          car.extra *= Math.exp(-dt * 0.9);
          if (car.extra < 0.01) car.extra = 0;
          placeAlong(car.root, slotU - car.extra, origin);
        } else if (car.state === 'drift') {
          car.v = Math.max(0, car.v - 3.5 * dt);
          car.u += car.v * dt;
          placeAlong(car.root, car.u, origin);
          if (s - car.u > 900) { car.state = 'off'; car.root.visible = false; }
        }
      }
      // The tail cab, behind the last carriage that is on.
      let last = 0;
      for (let i = 1; i < cars.length; i++) if (cars[i].state === 'on') last = i;
      if (tailRoot) {
        tailRoot.visible = last > 0;
        if (last > 0) {
          // The last carriage on the train wears the tail cab instead.
          cars[last].root.visible = false;
          for (let i = 1; i < last; i++) if (cars[i].state === 'on') cars[i].root.visible = true;
          tailExtra = cars[last].extra;
          placeAlong(tailRoot, s - last * CAR_PITCH - tailExtra, origin);
        }
        for (let i = last + 1; i < cars.length; i++) if (cars[i].state === 'drift') cars[i].root.visible = true;
      }
    } else {
      placeAlong(placeholder, s, origin);
    }

    /* The detailed track around the camera */
    if (tileParts.length) {
      const t0 = (Math.floor(s / CHUNK) - NEAR_TRACK) * 11;
      let n = 0;
      for (let t = t0; t < t0 + TILES_NEAR && n < TILES_NEAR; t++, n++) {
        const u0 = t * TILE, u1 = u0 + TILE;
        const f1 = frameAt(u1, fa);
        const f0 = frameAt(u0, fb);
        const mx = (f0.x + f1.x) / 2 - origin.x, my = (f0.y + f1.y) / 2 - origin.y, mz = (f0.z + f1.z) / 2 - origin.z;
        const dx = f0.x - f1.x, dy = f0.y - f1.y, dz = f0.z - f1.z;
        const obj = tmpObj;
        obj.position.set(mx, my, mz);
        obj.rotation.set(Math.atan2(-dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ');
        obj.updateMatrix();
        for (const p of tileParts) p.setMatrixAt(n, obj.matrix);
      }
      for (const p of tileParts) { p.count = n; p.instanceMatrix.needsUpdate = true; p.visible = world !== 'space'; }
      // Under the detailed track the simple rails and sleepers stand aside.
      const near = Math.floor(s / CHUNK);
      for (const c of chunks) {
        const hide = Math.abs(c.k - near) <= NEAR_TRACK && world !== 'space';
        c.rails.visible = !hide;
        c.sleepers.visible = !hide && world !== 'space';
      }
    }

    /* Stations and billboards, placed along the line */
    placeStations();
    for (const st of stationSlots) {
      if (st.m < 0 || !st.root.visible) continue;
      const u = stationCentre(st.m);
      const f = frameAt(u, fa);
      st.root.position.set(f.x - origin.x, f.y - origin.y, f.z - origin.z);
      st.root.rotation.set(0, -f.h, 0);
    }
    placeBillboards();
    for (const b of boards) {
      const u = (b.slot + 0.5) * BILLBOARD_EVERY;
      const side = b.slot % 2 ? 1 : -1;
      const f = frameAt(u, fa);
      const ground = world === 'clouds' || world === 'space' ? null : heightAt(u, side * 17, f.y, world);
      b.root.visible = ground !== null && stationMask(u) < 0.1;
      if (ground === null) continue;
      local(f, side * 17, ground - 0.3, origin, v3);
      b.root.position.copy(v3);
      b.root.rotation.set(0, -f.h - side * 0.55, 0);
    }

    /* Signals: green on a rising market, red on a falling one */
    signalLamp.color.set(change > 2 ? 0x30ff6a : change < -2 ? 0xff3030 : 0xffb020);

    /* ── Sky and light ── */
    const pal = sky.palette;
    const elev = sky.elevation;
    const day = smooth(-8, 12, elev);
    cTop.set(pal.top); cMid.set(pal.mid); cHor.set(pal.horizon); cGround.set(pal.groundFar);
    let starAmt = pal.stars;
    let fogNear = 220, fogFar = 1900;
    if (world === 'clouds') { cTop.lerp(new THREE.Color('#06204F'), 0.5 * day); cHor.lerp(new THREE.Color('#BFD9F2'), 0.3 * day); fogNear = 600; fogFar = 3400; }
    if (world === 'space' || world === 'moon') { cTop.set('#000000'); cMid.set('#01030a'); cHor.set(world === 'space' ? '#0c2147' : '#05070c'); starAmt = 1; fogNear = 1e5; fogFar = 2e5; }
    if (world === 'mars') { cTop.set('#4A3A33').lerp(new THREE.Color('#090606'), 1 - day); cMid.set('#B07A55').lerp(new THREE.Color('#120c0a'), 1 - day); cHor.set('#E2B98C').lerp(new THREE.Color('#2a1a12'), 1 - day); starAmt = 1 - day; fogNear = 400; fogFar = 2600; }
    if (world === 'country') {
      if (sky.weather === 'fog') { fogNear = 30; fogFar = 420; }
      else if (sky.weather === 'rain' || sky.weather === 'storm' || sky.weather === 'snow') { fogNear = 120; fogFar = 1100; }
      else if (sky.weather === 'overcast') { fogNear = 160; fogFar = 1500; }
    }
    skyUniforms.uTop.value.copy(cTop);
    skyUniforms.uMid.value.copy(cMid);
    skyUniforms.uHorizon.value.copy(cHor);
    skyUniforms.uGround.value.copy(world === 'space' ? cMid : cHor);
    skyUniforms.uSunCol.value.set(pal.disc);
    skyUniforms.uGlow.value.set(pal.glow);
    skyUniforms.uDisc.value = sky.weather === 'overcast' || sky.weather === 'fog' || sky.weather === 'rain' || sky.weather === 'storm' ? (world === 'country' ? 0 : 1) : 1;
    starMat.opacity = starAmt;
    stars.visible = starAmt > 0.02;
    scene.fog = fogFar < 1e5 ? (scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(0, 1, 2)) : null;
    if (scene.fog instanceof THREE.Fog) { scene.fog.color.copy(cHor); scene.fog.near = fogNear; scene.fog.far = fogFar; }

    // The sun: the visitor's own elevation, swung across the line by where it sits in the window.
    const az = origin.h + Math.PI / 2 + sky.sunX * 1.1;
    const el = THREE.MathUtils.degToRad(Math.max(elev, -10));
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    skyUniforms.uSunDir.value.copy(sunDir);
    const nightLight = world === 'space' || world === 'moon' ? 0.6 : 0.12;
    sun.intensity = lerp(nightLight, 2.6, day) * (sky.weather === 'overcast' || sky.weather === 'rain' || sky.weather === 'storm' ? 0.45 : 1);
    sun.color.set(pal.disc).lerp(new THREE.Color(0xffffff), 0.5);
    hemi.color.copy(cMid).lerp(new THREE.Color(0xffffff), 0.45);
    hemi.groundColor.set(world === 'mars' ? 0x6a3a22 : world === 'clouds' ? 0xdde6f0 : 0x4a4232);
    hemi.intensity = lerp(0.25, 1.15, day) + (world === 'space' ? 0.25 : 0);
    if (sky.weather === 'storm' && world === 'country' && Math.random() < dt * 0.25) hemi.intensity += 6;

    const night = 1 - day;
    headlamp.intensity = night * 260;
    const glow = night * 1.1 + 0.08;
    cars.forEach((car, i) => {
      if (!car.glass) return;
      const lit = i === 0 || i / Math.max(1, wantCars) <= taken / 178 + 0.05;
      car.glass.emissiveIntensity = lit ? glow : 0;
    });
    if (tailGlass) tailGlass.emissiveIntensity = glow;

    /* Planet, moons */
    planet.visible = world === 'space' || world === 'moon';
    moonlets.visible = world === 'mars';
    railMat.emissive.set(world === 'space' ? CYAN : 0x000000);
    railMat.emissiveIntensity = world === 'space' ? 1.2 : 0;

    /* Weather */
    const raining = world === 'country' && (sky.weather === 'rain' || sky.weather === 'storm');
    const snowing = world === 'country' && sky.weather === 'snow';
    precip.pts.visible = raining || snowing;
    precip.mat.uniforms.uTime.value = time;
    precip.mat.uniforms.uSpeed.value = snowing ? 2.2 : 26;
    precip.mat.uniforms.uSize.value = snowing ? 3.2 : 1.6;
    precip.mat.uniforms.uColor.value.set(snowing ? 0xffffff : 0x9fb3c8);
    precip.mat.uniforms.uOpacity.value = snowing ? 0.9 : 0.45;

    clouds.visible = world === 'country' && sky.cloudCover > 0.08;
    if (clouds.visible) {
      const shown = Math.round(CLOUDS * Math.min(1, sky.cloudCover * 1.1));
      const move = speed * dt;
      let n = 0;
      cloudMat.color.copy(cHor).lerp(new THREE.Color(0xffffff), sky.weather === 'overcast' || raining ? 0.25 : 0.7);
      for (let i = 0; i < CLOUDS; i++) {
        const cl = cloudAt[i];
        // Clouds hold still over the ground: the camera rides the train forward under them.
        cl.x -= Math.sin(origin.h) * move * 0.02;
        if (i >= shown) continue;
        const wx = ((((cl.x - origin.x * 0.98) % 5000) + 7500) % 5000) - 2500;
        const wz = ((((cl.z - origin.z * 0.98) % 5000) + 7500) % 5000) - 2500;
        for (let p = 0; p < PUFFS; p++) {
          const o = puffOffsets[p];
          tmpV.set(wx + o.x * cl.s, cl.y + o.y * cl.s, wz + o.z * cl.s);
          m4.compose(tmpV, q.identity(), s3.set(cl.s * 0.7, cl.s * 0.45, cl.s * 0.6));
          clouds.setMatrixAt(n++, m4);
        }
      }
      clouds.count = n;
      clouds.instanceMatrix.needsUpdate = true;
    }

    /* ── The camera ── */
    const dbg = import.meta.env.DEV ? (window as unknown as { __railCam?: { dist?: number; lift?: number; orbit?: number; back?: number } }).__railCam : undefined;
    const leadFrame = frameAt(s - 6 - (dbg?.back ?? 0), fa);
    target.set(leadFrame.x - origin.x, leadFrame.y - origin.y + 2.2, leadFrame.z - origin.z);
    const chase = pose.chase ?? 0;
    const orbit = THREE.MathUtils.degToRad(dbg?.orbit ?? (pose.orbit ?? 0) + 38);
    const dist = dbg?.dist ?? lerp(34, 40, chase) * (1 + (pose.dolly ?? 0) * 0.6);
    const lift = dbg?.lift ?? lerp(7.5, 10, chase);
    const hdg = origin.h;
    // Orbit measured from dead ahead, swinging round to starboard.
    const ox = Math.sin(hdg) * Math.cos(orbit) + Math.cos(hdg) * Math.sin(orbit);
    const oz = -Math.cos(hdg) * Math.cos(orbit) + Math.sin(hdg) * Math.sin(orbit);
    camPos.set(target.x + ox * dist, target.y + lift, target.z + oz * dist);
    // Never under the ground.
    const gu = s + (-oz * Math.cos(hdg) + ox * Math.sin(hdg)) * dist;
    const gx = ox * Math.cos(hdg) + oz * Math.sin(hdg);
    const groundY = heightAt(gu, gx * dist, trackY(gu), world) - origin.y;
    if (world !== 'clouds' && world !== 'space') camPos.y = Math.max(camPos.y, groundY + 2.5);
    camera.position.copy(camPos);
    camera.lookAt(target);
    const dbgBoard = import.meta.env.DEV ? (window as unknown as { __railBoard?: number }).__railBoard : undefined;
    if (dbgBoard !== undefined && boards[dbgBoard]) {
      const b = boards[dbgBoard].root;
      const n = new THREE.Vector3(Math.sin(b.rotation.y), 0, Math.cos(b.rotation.y));
      camera.position.copy(b.position).addScaledVector(n, 22).add(new THREE.Vector3(0, 7, 0));
      camera.lookAt(b.position.x, b.position.y + 7, b.position.z);
    }
    if (pose.frame) {
      // Offsets from the middle, as fractions of the frame: right and up.
      camera.setViewOffset(w, h, -pose.frame.x * w, pose.frame.y * h, w, h);
    } else if (camera.view) camera.clearViewOffset();

    skyDome.position.copy(camera.position);
    stars.position.copy(camera.position);
    if (world === 'space') {
      planet.scale.setScalar(26000);
      planet.position.set(camera.position.x + 4000, camera.position.y - 30500, camera.position.z - 9000);
    } else {
      planet.scale.setScalar(900);
      planet.position.set(camera.position.x - 9000, camera.position.y + 4200, camera.position.z - 16000);
    }
    planet.rotation.y += dt * 0.004;
    moonlets.position.copy(camera.position);
    precip.mat.uniforms.uCam.value.copy(camera.position);

    sun.position.copy(target).addScaledVector(sunDir, 150);
    sun.target.position.copy(target);
    const nose = frameAt(s + CAR_LEN / 2, fb);
    headlamp.position.set(nose.x - origin.x, nose.y - origin.y + 1.2, nose.z - origin.z);
    const ahead = frameAt(s + 80, fb);
    headlamp.target.position.set(ahead.x - origin.x, ahead.y - origin.y, ahead.z - origin.z);

    renderer.render(scene, camera);
    tmpV.copy(target).project(camera);
    lastFrame = { x: (tmpV.x + 1) / 2, y: (1 - tmpV.y) / 2 };
  };
  const tmpObj = new THREE.Object3D();

  const resize = (width: number, height: number) => {
    w = width; h = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 60 : 42;
    camera.updateProjectionMatrix();
  };

  const setOccupancy = (t: ReadonlySet<string>) => { taken = t.size; };
  const setAdverts = (bySeat: Readonly<Record<string, string>>) => {
    // Front of the train first: seats in ladder order.
    const order = Object.keys(bySeat).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
    adverts = order.map((k) => bySeat[k]).filter(Boolean);
    for (const b of boards) paintBoard(b);
  };
  const setControls = (c: ManualControls) => { manual = c; void manual; };
  const travelled = () => s;
  const groundAt = () => 0;
  const planeOnScreen = () => lastFrame;
  const setDeckReadout = () => {};

  ensureChunks(0);
  void loadAll();
  if (import.meta.env.DEV) {
    (window as unknown as { __railDebug?: () => unknown }).__railDebug = () => ({
      s, boards: boards.map((b) => ({ slot: b.slot, vis: b.root.visible, pos: b.root.position.toArray().map(Math.round), art: b.art.canvas.toDataURL().slice(0, 40), len: b.art.canvas.toDataURL().length, mapped: b.panel.map === b.art.tex })),
      stations: stationSlots.map((st) => ({ m: st.m, vis: st.root.visible })), cars: cars.length, tiles: tileParts.length,
    });
  }

  const dispose = () => {
    disposed = true;
    for (const c of chunks) {
      c.terrain.geometry.dispose();
      c.water.geometry.dispose();
      c.ballast.geometry.dispose();
      c.rails.geometry.dispose();
      c.sleepers.dispose();
      c.piers.dispose();
      for (const k of KINDS) c.scatter[k].dispose();
    }
    for (const p of tileParts) p.dispose();
    for (const d of disposables) d.dispose();
    const freed = new Set<unknown>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!freed.has(mesh.geometry)) { freed.add(mesh.geometry); mesh.geometry.dispose(); }
    });
    renderer.dispose();
  };

  return { render, resize, setOccupancy, setAdverts, setControls, travelled, groundAt, planeOnScreen, setDeckReadout, setMarket, dispose };
}

/** A few small geometries into one, positions and normals only. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g !== g0) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
