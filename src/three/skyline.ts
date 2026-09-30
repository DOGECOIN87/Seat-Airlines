import * as THREE from 'three';

/**
 * The city: Manhattan, or something that reads as it from the air, without
 * end.
 *
 * What makes New York New York from above is its grid and its mix. The grid
 * is long, narrow blocks: wide avenues every three hundred metres one way,
 * narrow cross streets every eighty the other, and the buildings built wall
 * to wall along them rather than standing apart. The mix is prewar brick and
 * limestone, most of it low, stepping back as it climbs, with wooden water
 * tanks on the roofs, and then whole districts where the glass towers and
 * the Art Deco spires crowd together; and a park, long and green, where
 * there is nothing at all.
 *
 * Two layers, the same trick the farmland plays. The ground itself is
 * painted as that street grid (`cityTextures`), which carries the city out
 * to the haze for nothing; the buildings stand on it in the round
 * (`createSkyline`) for the few kilometres round the aircraft where you can
 * see that they are buildings.
 *
 * The buildings cost nothing on the CPU. They are instanced boxes, a slot per
 * lot of a lattice centred under the aircraft; the vertex shader slides the
 * lattice with the ground and, as a lot leaves one edge and re-enters at the
 * other, reads which lot of the endless city it now is from the lot's own
 * coordinates, so a building keeps its height, shape and windows for as long
 * as it is in view. Toward the rim of the lattice the buildings sink into the
 * painted roofs, so there is no edge to it.
 *
 * Detail is spent where it can be seen. Round the aircraft each building is
 * built properly — the streetwall base, the tower set back on it, a crown,
 * the spire on the tallest, the water tank on the low ones — and further
 * out it is a single box with the same facade painted on it. The detailed
 * ring narrows as the aircraft climbs, since from higher up a crown is a
 * few pixels anyway; the facades themselves fade from windows to their
 * average tone as they shrink below a pixel.
 */

/** Metres: one lot along the cross streets. Three lots make an avenue block. */
const LOT_X = 100;
/** Metres: one block between cross streets. */
const LOT_Z = 80;
/** Metres: the width of an avenue and of a cross street. */
const AVENUE = 30;
const STREET = 18;
/** Metres: the tallest roof. Well under the lowest the aircraft flies. */
export const CITY_TOP = 380;
/**
 * The lot pattern repeats after this many lots each way: more than the
 * lattice is wide, so never twice in view. A whole number of avenue blocks
 * (3) and of districts (12 × 10) each way, so the repeat has no seam.
 */
const PERIOD_X = 132;
const PERIOD_Z = 170;
const DISTRICT_X = 12;
const DISTRICT_Z = 10;
/** The park, in lots of the repeating pattern: nine hundred metres by four kilometres, bounded by avenues. */
const PARK = { x0: 60, x1: 69, z0: 40, z1: 90 };
/** One tile of the painted city: four avenue blocks by eight cross-street blocks. */
export const CITY_TILE_X = LOT_X * 12;
export const CITY_TILE_Z = LOT_Z * 8;

export interface CityTextures {
  day: THREE.CanvasTexture;
  night: THREE.CanvasTexture;
}

/** A seeded generator, so the painted city is the same city every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const texture = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/**
 * One tile of the city from above: the avenues and cross streets, yellow
 * cabs, and the roofs of every lot wall to wall along them. By night the
 * avenues are rivers of headlights and tail lights under sodium lamps and
 * the roofs are dark but for what is lit inside.
 */
export function cityTextures(): CityTextures {
  const PX = 0.8; // pixels a metre
  const w = CITY_TILE_X * PX;
  const h = CITY_TILE_Z * PX;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const dayC = make();
  const nightC = make();
  const d = dayC.getContext('2d')!;
  const n = nightC.getContext('2d')!;
  const rand = rng(0x5ea7c17e);
  const ave = AVENUE * PX;
  const st = STREET * PX;
  const lotW = LOT_X * PX;
  const blockH = LOT_Z * PX;

  d.fillStyle = '#2f3237';
  d.fillRect(0, 0, w, h);
  n.fillStyle = '#000';
  n.fillRect(0, 0, w, h);

  // Avenues run along z (down the canvas) every three lots; cross streets along x every block.
  const avenues: number[] = [];
  for (let k = 0; k <= 12; k += 3) avenues.push(k * lotW);
  const streets: number[] = [];
  for (let k = 0; k <= 8; k++) streets.push(k * blockH);

  // Lane lines: a double yellow down the avenues, dashes on the streets.
  d.strokeStyle = 'rgba(226, 190, 90, 0.5)';
  d.lineWidth = 1;
  for (const x of avenues) {
    d.beginPath(); d.moveTo(x - 0.8, 0); d.lineTo(x - 0.8, h); d.stroke();
    d.beginPath(); d.moveTo(x + 0.8, 0); d.lineTo(x + 0.8, h); d.stroke();
  }
  d.strokeStyle = 'rgba(220, 220, 210, 0.3)';
  d.setLineDash([4, 5]);
  for (const y of streets) {
    d.beginPath(); d.moveTo(0, y); d.lineTo(w, y); d.stroke();
  }
  d.setLineDash([]);
  // Zebra crossings at every corner.
  d.fillStyle = 'rgba(235, 235, 230, 0.45)';
  for (const x of avenues) {
    for (const y of streets) {
      for (let k = -ave / 2; k < ave / 2; k += 2.2) {
        d.fillRect(x + k, y - st / 2 - 3, 1.1, 2.5);
        d.fillRect(x + k, y + st / 2 + 0.5, 1.1, 2.5);
      }
    }
  }

  /* The streets glow softly at night: sodium light pooled on the asphalt,
     brightest at the crossings and uneven from block to block. Soft, because
     from the air the buildings are the lights; an even orange grid to the
     horizon reads as a mesh rather than a city. */
  for (const x of avenues) {
    for (const y of streets) {
      const a = 0.05 + rand() * 0.1;
      n.fillStyle = `rgba(255, 158, 74, ${a.toFixed(3)})`;
      n.fillRect(x - ave / 2, y, ave, blockH);
      n.fillRect(x, y - st / 2, lotW * 3, st);
      const pool = n.createRadialGradient(x, y, 0, x, y, ave * 0.8);
      pool.addColorStop(0, `rgba(255, 196, 120, ${(0.15 + rand() * 0.2).toFixed(3)})`);
      pool.addColorStop(1, 'rgba(255, 170, 90, 0)');
      n.fillStyle = pool;
      n.fillRect(x - ave, y - ave, ave * 2, ave * 2);
    }
  }
  // Sodium lamps along both kerbs; the avenues busier and brighter.
  for (const x of avenues) {
    n.fillStyle = 'rgba(255, 180, 96, 0.45)';
    for (let y = 0; y < h; y += 11) {
      n.fillRect(x - ave / 2 + 1, y, 1.8, 1.8);
      n.fillRect(x + ave / 2 - 2.8, y, 1.8, 1.8);
    }
  }
  n.fillStyle = 'rgba(255, 170, 90, 0.35)';
  for (const y of streets) {
    for (let x = 0; x < w; x += 14) {
      n.fillRect(x, y - st / 2 + 1, 1.5, 1.5);
      n.fillRect(x, y + st / 2 - 2.5, 1.5, 1.5);
    }
  }
  // Traffic, most of it on the avenues: yellow cabs by day; head and tail lights by night.
  const car = (x: number, y: number, along: boolean) => {
    const cab = rand() < 0.45;
    d.fillStyle = cab ? '#e8b923' : ['#d9dce0', '#23262b', '#6c7480', '#8a2b26'][Math.floor(rand() * 4)];
    if (along) d.fillRect(x - 1, y - 2, 2, 3.8);
    else d.fillRect(x - 2, y - 1, 3.8, 2);
  };
  for (const x of avenues) {
    for (let i = 0; i < 90; i++) {
      const y = rand() * h;
      const lane = (rand() - 0.5) * (ave - 8);
      car(x + lane, y, true);
      n.fillStyle = lane < 0 ? 'rgba(255, 248, 228, 0.95)' : 'rgba(255, 50, 36, 0.9)';
      n.fillRect(x + lane - 1, y, 2, 2);
    }
  }
  for (const y of streets) {
    for (let i = 0; i < 14; i++) {
      const x = rand() * w;
      car(x, y + (rand() - 0.5) * (st - 6), false);
      n.fillStyle = rand() < 0.5 ? 'rgba(255, 248, 228, 0.85)' : 'rgba(255, 50, 36, 0.85)';
      n.fillRect(x, y + (rand() - 0.5) * (st - 6), 1.6, 1.6);
    }
  }

  // Roofs: every lot built out to the street line, the lots of a block touching.
  const roofs = ['#4a4e55', '#3d4148', '#55504a', '#4c3a33', '#5a534a', '#2e3238', '#50555c', '#6a4b3e'];
  for (let i = 0; i < 12; i++) {
    const k = i % 3;
    const x0 = i * lotW + (k === 0 ? ave / 2 : 0);
    const x1 = (i + 1) * lotW - (k === 2 ? ave / 2 : 0);
    for (let j = 0; j < 8; j++) {
      const y0 = j * blockH + st / 2;
      const y1 = (j + 1) * blockH - st / 2;
      d.fillStyle = roofs[Math.floor(rand() * roofs.length)];
      d.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Lot lines inside the block, and a few smaller buildings along it.
      d.fillStyle = 'rgba(0, 0, 0, 0.3)';
      d.fillRect(x1 - 1, y0, 1, y1 - y0);
      const split = y0 + (y1 - y0) * (0.3 + rand() * 0.4);
      d.fillRect(x0, split, x1 - x0, 1);
      // Tanks and plant on the roofs.
      for (let q = 0; q < 3; q++) {
        const tx = x0 + 4 + rand() * (x1 - x0 - 10);
        const ty = y0 + 4 + rand() * (y1 - y0 - 10);
        d.fillStyle = rand() < 0.5 ? '#5a4432' : '#8a8f96';
        d.beginPath();
        d.arc(tx, ty, 2.2 + rand() * 1.5, 0, Math.PI * 2);
        d.fill();
      }
      /* By night, the windows of the buildings too far off to be built:
         past the towers the painted city is a sea of lit windows, which is
         how a city runs to the horizon after dark. */
      const busy = 0.4 + rand() * 0.6;
      for (let q = 0; q < 140 * busy; q++) {
        const c = rand();
        n.fillStyle = c < 0.55 ? 'rgba(255, 214, 150, 0.9)' : c < 0.9 ? 'rgba(200, 222, 255, 0.9)' : 'rgba(255, 245, 225, 1)';
        n.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 1.4, 1.4);
      }
    }
  }
  return { day: texture(dayC), night: texture(nightC) };
}

/** The park from above: meadows, woods, paths, the reservoir, the lake. */
function parkTextures(): CityTextures {
  const w = 256;
  const h = 1024;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const dayC = make();
  const nightC = make();
  const d = dayC.getContext('2d')!;
  const n = nightC.getContext('2d')!;
  const rand = rng(0xc3a7a1);
  d.fillStyle = '#4d6b33';
  d.fillRect(0, 0, w, h);
  n.fillStyle = '#000';
  n.fillRect(0, 0, w, h);
  // Woods: clumps of darker crowns.
  for (let i = 0; i < 1400; i++) {
    const x = rand() * w;
    const y = rand() * h;
    d.fillStyle = ['#2f4a22', '#3b5a28', '#27401d', '#466a2c'][Math.floor(rand() * 4)];
    d.beginPath();
    d.arc(x, y, 2 + rand() * 4, 0, Math.PI * 2);
    d.fill();
  }
  // The Great Lawn and the Sheep Meadow, open grass.
  d.fillStyle = '#6f8f45';
  d.fillRect(w * 0.3, h * 0.46, w * 0.4, h * 0.08);
  d.fillRect(w * 0.2, h * 0.82, w * 0.45, h * 0.06);
  // The reservoir and the lake.
  d.fillStyle = '#2b4658';
  d.beginPath();
  d.ellipse(w * 0.5, h * 0.33, w * 0.4, h * 0.07, 0, 0, Math.PI * 2);
  d.fill();
  d.beginPath();
  d.ellipse(w * 0.45, h * 0.7, w * 0.22, h * 0.04, 0.3, 0, Math.PI * 2);
  d.fill();
  // Paths, and their lamps after dark.
  d.strokeStyle = 'rgba(200, 190, 160, 0.55)';
  n.fillStyle = 'rgba(255, 220, 160, 0.7)';
  d.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) {
    d.beginPath();
    let x = rand() * w;
    let y = rand() * h;
    d.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x = THREE.MathUtils.clamp(x + (rand() - 0.5) * 60, 4, w - 4);
      y = THREE.MathUtils.clamp(y + (rand() - 0.5) * 120, 4, h - 4);
      d.lineTo(x, y);
      n.fillRect(x, y, 1.5, 1.5);
    }
    d.stroke();
  }
  // The drive round the edge.
  d.strokeStyle = 'rgba(70, 72, 76, 0.9)';
  d.lineWidth = 3;
  d.strokeRect(10, 10, w - 20, h - 20);
  const day = texture(dayC);
  const night = texture(nightC);
  day.wrapS = day.wrapT = night.wrapS = night.wrapT = THREE.ClampToEdgeWrapping;
  return { day, night };
}

const fract = (v: number) => v - Math.floor(v);
const mod = (v: number, m: number) => ((v % m) + m) % m;
/** `skHash` in the shader, on the CPU. */
function hash(x: number, y: number): number {
  let qx = fract(x * 0.1031), qy = fract(y * 0.103), qz = fract(x * 0.0973);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract((qx + qy) * qz);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, v: number) => smooth(Math.min(1, Math.max(0, (v - a) / (b - a))));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** `skDistrict` in the shader: how much of a skyscraper district a lot is in, 0–1. */
function district(bx: number, bz: number): number {
  const nx = PERIOD_X / DISTRICT_X;
  const nz = PERIOD_Z / DISTRICT_Z;
  const cx = bx / DISTRICT_X;
  const cz = bz / DISTRICT_Z;
  const ix = Math.floor(cx), iz = Math.floor(cz);
  const fx = smooth(cx - ix), fz = smooth(cz - iz);
  const at = (i: number, j: number) => hash(mod(i, nx) * 3.7 + 101, mod(j, nz) * 5.3 + 7);
  const v = mix(mix(at(ix, iz), at(ix + 1, iz), fx), mix(at(ix, iz + 1), at(ix + 1, iz + 1), fx), fz);
  return smoothstep(0.42, 0.85, v);
}

/**
 * The top of whatever building stands at (x, z) this frame, metres above the
 * datum, or 0 on the street or in the park: the same lot, height and
 * footprint the vertex shader draws there, for anything that has to hit what
 * it sees. Buildings are at full height near the aircraft, so the lattice's
 * rim does not come into it.
 */
export function towerTopAt(x: number, z: number, shiftX: number, shiftZ: number, rise: number): number {
  if (rise <= 0) return 0;
  const gx = Math.floor((x + shiftX) / LOT_X);
  const gz = Math.floor((z - shiftZ) / LOT_Z);
  const bx = mod(gx, PERIOD_X);
  const bz = mod(gz, PERIOD_Z);
  if (bx >= PARK.x0 && bx < PARK.x1 && bz >= PARK.z0 && bz < PARK.z1) return 0;
  const r1 = hash(bx, bz);
  const r2 = hash(bx + 17.13, bz + 17.13);
  const r3 = hash(bx + 41.71, bz + 41.71);
  const r4 = hash(bx + 73.37, bz + 73.37);
  const r5 = hash(bx + 11.9, bz + 11.9);
  const tallness = district(bx, bz);
  const k = mod(bx, 3);
  const ax0 = k < 0.5 ? -LOT_X / 2 + AVENUE / 2 : -LOT_X / 2;
  const ax1 = k > 1.5 ? LOT_X / 2 - AVENUE / 2 : LOT_X / 2;
  const cx = (gx + 0.5) * LOT_X - shiftX + (ax0 + ax1) / 2;
  const cz = (gz + 0.5) * LOT_Z + shiftZ;
  const baseX = (ax1 - ax0) * mix(0.88, 1, r2);
  const baseZ = (LOT_Z - STREET) * mix(0.72, 1, r3);
  const low = 16 + 50 * r1;
  const high = mix(40, CITY_TOP, Math.pow(r1, 1.6));
  const h0 = mix(low, high, tallness);
  const glass = r4 < tallness * 0.7;
  const tall = h0 > 90;
  const baseTop = tall && !glass ? mix(24, 44, r5) : 0;
  const shaft = tall && !glass ? mix(0.62, 0.82, r4) : glass ? mix(0.7, 0.92, r5) : 1;
  const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
  if (dx <= (baseX * shaft) / 2 && dz <= (baseZ * shaft) / 2) return Math.max(0, h0 * rise - 3);
  if (dx <= baseX / 2 && dz <= baseZ / 2) return Math.max(0, baseTop * rise - 3);
  return 0;
}

export interface SkylineFrame {
  /** Metres the ground has slid since the view opened (WorldScene's `shift`). */
  shiftX: number;
  shiftZ: number;
  /** 0–1: how far the buildings have risen out of the ground. */
  rise: number;
  /** 0–1: how dark it has got, for the windows. */
  night: number;
  /** Metres: the camera's height, which decides how far out the buildings are built in detail. */
  height: number;
}

export interface SkylineHandles {
  group: THREE.Group;
  update: (f: SkylineFrame) => void;
  dispose: () => void;
}

const f1 = (v: number) => v.toFixed(1);
const LOT = `vec2( ${f1(LOT_X)}, ${f1(LOT_Z)} )`;

const VERTEX_PARS = /* glsl */ `
attribute vec2 cell;
attribute float tier;
uniform vec2 skBase;
uniform vec2 skSlide;
uniform float skRise;
uniform vec2 skHalf;
uniform float skNearR;
uniform float skNear;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying vec2 vSkFoot;
varying float vSkSeed;
varying float vSkTier;
varying float vSkTop;
varying float vSkStyle;
float skHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
float skDistrict( vec2 b ) {
  vec2 cells = vec2( ${f1(PERIOD_X / DISTRICT_X)}, ${f1(PERIOD_Z / DISTRICT_Z)} );
  vec2 c = b / vec2( ${f1(DISTRICT_X)}, ${f1(DISTRICT_Z)} );
  vec2 i = floor( c );
  vec2 f = c - i;
  f = f * f * ( 3.0 - 2.0 * f );
  vec2 i1 = mod( i + 1.0, cells );
  i = mod( i, cells );
  float a = skHash( vec2( i.x * 3.7 + 101.0, i.y * 5.3 + 7.0 ) );
  float bb = skHash( vec2( i1.x * 3.7 + 101.0, i.y * 5.3 + 7.0 ) );
  float c0 = skHash( vec2( i.x * 3.7 + 101.0, i1.y * 5.3 + 7.0 ) );
  float d = skHash( vec2( i1.x * 3.7 + 101.0, i1.y * 5.3 + 7.0 ) );
  float v = mix( mix( a, bb, f.x ), mix( c0, d, f.x ), f.y );
  return smoothstep( 0.42, 0.85, v );
}
`;

/* Which lot this slot is, and so what stands on it. Low brick and limestone
   almost everywhere, with districts of towers; in those, glass as often as
   not. A tall masonry building is a streetwall base out to the lot with its
   tower set back on it and a crown on top (the 1916 zoning, in one line);
   a glass one is a plain shaft on a plaza; a low one fills its lot and
   carries a water tank. The parts, each a unit box stretched between its
   own floor and roof: 0 the base, 1 the shaft, 2 the crown, 3 a spire on
   the tallest, 4 the tank. A far building is the shaft alone, the full
   height. Slid with the ground, sunk toward the rim, and left out on
   whichever side of the detail ring this mesh does not draw. */
const VERTEX = /* glsl */ `
vec2 lot = mod( cell + skBase, vec2( ${f1(PERIOD_X)}, ${f1(PERIOD_Z)} ) );
float r1 = skHash( lot );
float r2 = skHash( lot + 17.13 );
float r3 = skHash( lot + 41.71 );
float r4 = skHash( lot + 73.37 );
float r5 = skHash( lot + 11.9 );
vec2 centre = ( cell - skHalf + 0.5 ) * ${LOT} + skSlide;
float dist = length( centre );
float rim = 1.0 - smoothstep( 0.6, 0.97, length( centre / ( skHalf * ${LOT} ) ) );
float mine = skNear > 0.5 ? step( dist, skNearR ) : step( skNearR, dist );
float inPark = step( ${f1(PARK.x0)}, lot.x ) * step( lot.x, ${f1(PARK.x1 - 0.5)} ) * step( ${f1(PARK.z0)}, lot.y ) * step( lot.y, ${f1(PARK.z1 - 0.5)} );
float tallness = skDistrict( lot );
float k = mod( lot.x, 3.0 );
float ax0 = k < 0.5 ? ${f1(-LOT_X / 2 + AVENUE / 2)} : ${f1(-LOT_X / 2)};
float ax1 = k > 1.5 ? ${f1(LOT_X / 2 - AVENUE / 2)} : ${f1(LOT_X / 2)};
vec2 base = vec2( ( ax1 - ax0 ) * mix( 0.88, 1.0, r2 ), ${f1(LOT_Z - STREET)} * mix( 0.72, 1.0, r3 ) );
centre.x += ( ax0 + ax1 ) * 0.5;
float h0 = mix( 16.0 + 50.0 * r1, mix( 40.0, ${f1(CITY_TOP)}, pow( r1, 1.6 ) ), tallness );
bool glass = r4 < tallness * 0.7;
bool tall = h0 > 90.0;
float baseTop = tall && !glass && skNear > 0.5 ? mix( 24.0, 44.0, r5 ) : 0.0;
vec2 shaftS = base * ( tall && !glass ? mix( 0.62, 0.82, r4 ) : glass ? mix( 0.7, 0.92, r5 ) : 1.0 );
bool crowned = tall && !glass && skNear > 0.5;
float crownY = crowned ? h0 * mix( 0.72, 0.86, r5 ) : h0;
bool spired = h0 > 240.0 && skNear > 0.5;
bool tank = !tall && !glass && r5 > 0.35 && skNear > 0.5;
vec2 size = shaftS;
vec2 offset = vec2( 0.0 );
float y0 = 0.0;
float y1 = crownY;
if ( tier < 0.5 ) {
  size = base;
  y1 = baseTop;
} else if ( tier > 1.5 && tier < 2.5 ) {
  y0 = crownY;
  y1 = h0;
  size = shaftS * 0.66;
} else if ( tier > 2.5 && tier < 3.5 ) {
  y0 = h0;
  y1 = spired ? h0 * ( glass ? 1.1 : 1.16 ) : h0;
  size = vec2( glass ? 2.5 : 4.0 );
} else if ( tier > 3.5 ) {
  y0 = h0;
  y1 = tank ? h0 + 8.0 : h0;
  size = vec2( 6.0 );
  offset = ( vec2( r2, r3 ) - 0.5 ) * ( shaftS - 10.0 );
}
float grow = skRise * rim * ( 1.0 - inPark );
size *= mine * step( 0.001, grow );
vec3 local = vec3( position.x * size.x, mix( y0, y1, position.y ) * grow, position.z * size.y );
vec3 transformed = local + vec3( centre.x + offset.x, -3.0, centre.y + offset.y );
vSkAt = local;
vSkNormal = normal;
vSkFoot = size * 0.5;
vSkSeed = r1 + r2 * 7.0;
vSkTier = tier;
vSkTop = y1 * grow;
vSkStyle = glass ? floor( r2 * 3.0 ) : 3.0 + floor( r3 * 4.0 );
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float skNight;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying vec2 vSkFoot;
varying float vSkSeed;
varying float vSkTier;
varying float vSkTop;
varying float vSkStyle;
float skHash2( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
`;

/* The facade. Blue, green and black curtain-wall glass; limestone, tan
   brick, red brick, brownstone. A curtain wall is nearly all glass between
   thin mullions over a spandrel strip; masonry is punched windows in a
   solid wall. Every window has its blind at its own height; the corners
   are solid piers; every twelfth floor of a tall building is a plant floor
   with louvres; the street floors are shopfronts, darker by day and bright
   by night. Once a window is under a pixel the pattern fades to its
   average, so a far building is a tone rather than a moiré, and the plant
   floors, being coarser, last longer. */
const FRAGMENT = /* glsl */ `
float skWall = 1.0 - step( 0.5, abs( vSkNormal.y ) );
bool skSideX = abs( vSkNormal.x ) > 0.5;
float skAlong = skSideX ? vSkAt.z : vSkAt.x;
float skHalfW = skSideX ? vSkFoot.y : vSkFoot.x;
float skS2 = fract( vSkSeed * 7.7 );
bool skCurtain = vSkStyle < 2.5;
vec3 skFrame;
vec3 skPaneCol;
if ( vSkStyle < 0.5 ) { skFrame = vec3( 0.18, 0.21, 0.25 ); skPaneCol = vec3( 0.06, 0.11, 0.18 ); }
else if ( vSkStyle < 1.5 ) { skFrame = vec3( 0.2, 0.24, 0.24 ); skPaneCol = vec3( 0.07, 0.15, 0.16 ); }
else if ( vSkStyle < 2.5 ) { skFrame = vec3( 0.1, 0.1, 0.1 ); skPaneCol = vec3( 0.05, 0.05, 0.06 ); }
else if ( vSkStyle < 3.5 ) { skFrame = vec3( 0.56, 0.51, 0.43 ); skPaneCol = vec3( 0.08, 0.09, 0.1 ); }
else if ( vSkStyle < 4.5 ) { skFrame = vec3( 0.5, 0.4, 0.3 ); skPaneCol = vec3( 0.08, 0.08, 0.09 ); }
else if ( vSkStyle < 5.5 ) { skFrame = vec3( 0.4, 0.19, 0.13 ); skPaneCol = vec3( 0.08, 0.08, 0.09 ); }
else { skFrame = vec3( 0.28, 0.2, 0.16 ); skPaneCol = vec3( 0.07, 0.07, 0.08 ); }
vec2 skModule = vec2( skCurtain ? mix( 1.5, 2.4, skS2 ) : mix( 2.4, 3.4, skS2 ), skCurtain ? 3.9 : 3.4 );
vec2 skWc = vec2( skAlong / skModule.x, vSkAt.y / skModule.y );
vec2 skId = floor( skWc );
vec2 skF = fract( skWc );
vec4 skPaneBox = skCurtain ? vec4( 0.05, 0.95, 0.28, 0.97 ) : vec4( 0.24, 0.76, 0.28, 0.8 );
float skPane = step( skPaneBox.x, skF.x ) * step( skF.x, skPaneBox.y ) * step( skPaneBox.z, skF.y ) * step( skF.y, skPaneBox.w );
float skMean = ( skPaneBox.y - skPaneBox.x ) * ( skPaneBox.w - skPaneBox.z );
float skBlur = smoothstep( 0.3, 0.8, max( fwidth( skWc.x ), fwidth( skWc.y ) ) );
// Blinds: how far down each window's is, which is most of what makes glass look occupied.
float skBlind = skHash2( skId + vec2( vSkSeed * 57.0, 3.0 ) );
float skShade = mix( step( skF.y, mix( 0.97, 0.45, skBlind * skBlind ) ) * 0.55 + 0.45, 0.8, skBlur );
// Plant floors every twelfth on the tall ones, solid piers at the corners, shopfronts at the foot.
float skPlant = step( 10.5, mod( skId.y, 12.0 ) ) * step( 30.0, vSkAt.y ) * ( 1.0 - smoothstep( 0.1, 0.5, fwidth( vSkAt.y / 45.6 ) ) );
float skPier = step( skHalfW - ( skCurtain ? 0.8 : 1.6 ), abs( skAlong ) );
float skShop = 1.0 - step( 5.0, vSkAt.y );
float skGlass = mix( skPane, skMean, skBlur ) * ( 1.0 - skPlant ) * ( 1.0 - skPier ) * skWall;
skGlass = mix( skGlass, 0.7 * skWall, skShop );
vec3 skCol = mix( skFrame, skPaneCol * skShade * 1.4, skGlass );
skCol = mix( skCol, skFrame * 0.7 + vec3( 0.05 ), skPlant * skWall );
skCol *= 1.0 - skPlant * 0.25 * step( 0.5, fract( vSkAt.y * 1.6 ) );
// Grime and shade at street level.
skCol *= mix( 0.55, 1.0, smoothstep( 0.0, 24.0, vSkAt.y ) );
// Roofs: tar, a pale parapet, plant boxes in the middle.
if ( skWall < 0.5 ) {
  vec2 skR = abs( vSkAt.xz ) / max( vSkFoot, vec2( 0.01 ) );
  float skEdge = step( 0.9, max( skR.x, skR.y ) );
  float skBox = step( max( skR.x, skR.y ), 0.35 ) * step( 0.4, fract( vSkSeed * 13.0 ) );
  skCol = mix( vec3( 0.19, 0.2, 0.21 ), skFrame * 1.1, skEdge );
  skCol = mix( skCol, vec3( 0.44, 0.45, 0.46 ), skBox );
}
// Spires are steel; the water tanks are old cedar, banded.
if ( vSkTier > 2.5 && vSkTier < 3.5 ) skCol = vec3( 0.52, 0.54, 0.57 );
if ( vSkTier > 3.5 ) skCol = vec3( 0.33, 0.24, 0.16 ) * ( 0.85 + 0.15 * step( 0.5, fract( vSkAt.y * 0.8 ) ) );
bool skPlain = vSkTier > 2.5;
diffuseColor.rgb = skCol;
/* Offices are lit a floor at a time — whole bands on, whole bands off,
   with the odd desk lamp on a dark floor — and in cool white; flats are
   lit room by room, mostly warm. */
float skFloorOn = step( skCurtain ? 0.3 : 0.55, skHash2( vec2( skId.y * 1.7, vSkSeed * 31.0 ) ) );
float skWin = skHash2( skId + vec2( vSkSeed * 91.0, floor( vSkSeed * 13.0 ) ) );
float skLit = skCurtain ? mix( step( 0.93, skWin ), step( 0.1, skWin ), skFloorOn ) : mix( step( 0.72, skWin ), step( 0.35, skWin ), skFloorOn );
float skLitP = skCurtain ? 0.66 : 0.45;
float skWarm = skHash2( skId + 5.5 );
vec3 skLight = skCurtain
  ? mix( vec3( 0.78, 0.88, 1.0 ), vec3( 1.0, 0.95, 0.82 ), step( 0.8, skWarm ) )
  : mix( vec3( 1.0, 0.78, 0.5 ), vec3( 0.95, 0.93, 0.86 ), step( 0.65, skWarm ) );
skLight *= 0.75 + 0.5 * skHash2( skId + 9.1 );
/* Far off, where a window is under a pixel, the wall does not fade to an
   even glow — that turned every distant tower flat grey. It keeps a coarser
   pattern instead: patches a few rooms wide and a couple of floors tall,
   lit or dark, so a far tower is a dark shaft speckled with light, the way
   a city reads from a few kilometres off. Only past that scale too does it
   settle to a dim average. */
vec2 skCc = skWc / vec2( 3.0, 2.0 );
vec2 skCId = floor( skCc );
float skCoarse = step( 1.0 - skLitP * 0.8, skHash2( skCId + vec2( vSkSeed * 43.0, 7.0 ) ) );
vec2 skCF = fract( skCc );
skCoarse *= step( 0.12, skCF.x ) * step( skCF.x, 0.88 ) * step( 0.15, skCF.y ) * step( skCF.y, 0.85 );
float skBlurC = smoothstep( 0.35, 0.9, max( fwidth( skCc.x ), fwidth( skCc.y ) ) );
float skFar = mix( skCoarse * 0.85, skLitP * 0.35, skBlurC );
vec3 skGlow = skLight * mix( skLit * skPane * skShade, skFar, skBlur ) * ( 1.0 - skPlant ) * ( 1.0 - skPier ) * skWall;
// Glass towers glow pale blue all over, their lit interiors seen through the curtain wall.
if ( skCurtain ) skGlow += vec3( 0.22, 0.32, 0.5 ) * 0.15 * skWall * ( 1.0 - skPlant * 0.5 );
// Floodlit crowns: the top floors of the tall ones washed with light from the setbacks.
float skCrownWash = step( 90.0, vSkTop ) * smoothstep( vSkTop - 14.0, vSkTop - 1.0, vSkAt.y ) * skWall;
skGlow += ( skCurtain ? vec3( 0.7, 0.85, 1.0 ) : vec3( 1.0, 0.86, 0.62 ) ) * skCrownWash * 0.45;
// Streetlight thrown up the lowest floors, warm, fading within a few storeys.
skGlow += vec3( 1.0, 0.64, 0.32 ) * exp( -vSkAt.y / 14.0 ) * 0.22 * skWall;
// The shops stay lit all night.
skGlow = mix( skGlow, vec3( 1.0, 0.85, 0.62 ) * 0.9 * skWall, skShop );
if ( skPlain ) skGlow = vec3( 0.0 );
// The red aircraft-warning lamp at the very top of the spires.
float skBeacon = step( 2.5, vSkTier ) * step( vSkTier, 3.5 ) * step( vSkTop - 4.0, vSkAt.y ) * step( 1.0, vSkTop );
skGlow += vec3( 1.0, 0.08, 0.05 ) * skBeacon * 6.0;
`;

/** Unit boxes with their bases on the ground and no floors, tagged by part. */
function towerGeometry(tiers: readonly number[]): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const tag: number[] = [];
  const index: number[] = [];
  for (const t of tiers) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const base = pos.length / 3;
    pos.push(...box.attributes.position.array);
    nor.push(...box.attributes.normal.array);
    for (let i = 0; i < box.attributes.position.count; i++) tag.push(t);
    const idx = box.index!.array;
    // BoxGeometry's groups run +x, −x, +y, −y, +z, −z: skip −y, the floor nobody sees.
    for (let i = 0; i < idx.length; i++) if (Math.floor(i / 6) !== 3) index.push(base + idx[i]);
    box.dispose();
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('tier', new THREE.Float32BufferAttribute(tag, 1));
  geometry.setIndex(index);
  return geometry;
}

/**
 * The buildings, a lattice of `lotsX` × `lotsZ` lots round the aircraft, and
 * the park. Hidden until the city comes in.
 */
export function createSkyline(o: { lotsX: number; lotsZ: number; envMap?: THREE.Texture }): SkylineHandles {
  const nx = o.lotsX;
  const nz = o.lotsZ;
  const group = new THREE.Group();
  group.visible = false;

  /* Every slot of the lattice, nearest the middle first: the detailed mesh
     draws only as many of them as its ring needs. */
  const order: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) order.push([i, j]);
  const fromMiddle = ([i, j]: [number, number]) => Math.hypot((i - nx / 2 + 0.5) * LOT_X, (j - nz / 2 + 0.5) * LOT_Z);
  order.sort((a, b) => fromMiddle(a) - fromMiddle(b));
  const cells = new Float32Array(order.flat());
  const cellAttr = new THREE.InstancedBufferAttribute(cells, 2);

  const shared = {
    skBase: { value: new THREE.Vector2() },
    skSlide: { value: new THREE.Vector2() },
    skRise: { value: 0 },
    skHalf: { value: new THREE.Vector2(nx / 2, nz / 2) },
    skNearR: { value: 0 },
    skNight: { value: 0 },
  };
  const build = (near: boolean) => {
    const geometry = towerGeometry(near ? [0, 1, 2, 3, 4] : [1]);
    geometry.setAttribute('cell', cellAttr);
    geometry.instanceCount = nx * nz;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.1,
      envMap: o.envMap ?? null,
      envMapIntensity: 0.45,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, { skNear: { value: near ? 1 : 0 } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('#include <begin_vertex>', VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.85, skCurtain ? 0.14 : 0.25, skGlass );')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( 0.04, skCurtain ? 0.5 : 0.2, skGlass ) + ( vSkTier > 2.5 && vSkTier < 3.5 ? 0.6 : 0.0 );')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += skGlow * skNight * 3.0;',
        )
        /* After dark a city is its windows. The scene's skylight stays up at
           night so the fields and the aircraft stay legible, and on a
           building that lit every wall grey as if it were dusk; so once the
           sun is down the buildings take almost none of it, nor of the
           sky's reflection, and go black round their lit windows. */
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          // Not black, though: moonlit navy, as a real city's walls read against a night sky.
          reflectedLight.indirectDiffuse = mix( reflectedLight.indirectDiffuse, diffuseColor.rgb * vec3( 0.1, 0.13, 0.22 ), skNight );
          reflectedLight.indirectSpecular *= mix( 1.0, 0.06, skNight );
          reflectedLight.directDiffuse *= mix( 1.0, 0.15, skNight );
          reflectedLight.directSpecular *= mix( 1.0, 0.15, skNight );`,
        );
    };
    material.customProgramCacheKey = () => (near ? 'skyline-near' : 'skyline-far');
    const mesh = new THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const near = build(true);
  const far = build(false);
  let lastRing = NaN;

  /* The park: one plane, laid on the ground wherever the nearest copy of it
     is, a little above the streets so it wins against them. */
  const parkMaps = parkTextures();
  const parkW = (PARK.x1 - PARK.x0) * LOT_X - AVENUE;
  const parkL = (PARK.z1 - PARK.z0) * LOT_Z - STREET;
  const parkMat = new THREE.MeshStandardMaterial({
    map: parkMaps.day,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: parkMaps.night,
    emissiveIntensity: 0,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0,
  });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(parkW, parkL), parkMat);
  park.rotation.x = -Math.PI / 2;
  park.position.y = 4;
  park.renderOrder = -0.4;
  group.add(park);

  const update = (f: SkylineFrame) => {
    group.visible = f.rise > 0.002;
    if (!group.visible) return;
    /* The building on lot (gx, gz) of the endless city stands at
       x = (gx + ½)·LX − shiftX, z = (gz + ½)·LZ + shiftZ: on the same street
       lines the painted ground draws, and carried the same way. */
    const bx = Math.floor(f.shiftX / LOT_X);
    const bz = Math.floor(f.shiftZ / LOT_Z);
    shared.skBase.value.set(mod(bx - nx / 2, PERIOD_X), mod(-bz - nz / 2, PERIOD_Z));
    shared.skSlide.value.set(-(f.shiftX - bx * LOT_X), f.shiftZ - bz * LOT_Z);
    shared.skRise.value = f.rise;
    shared.skNight.value = f.night;
    /* The detailed ring: nearly two kilometres out at the bottom of the
       band, a few hundred metres at the top of it. */
    const ring = THREE.MathUtils.lerp(1900, 500, THREE.MathUtils.smoothstep(f.height, 900, 2600));
    shared.skNearR.value = ring;
    if (ring !== lastRing) {
      lastRing = ring;
      // Slots within a lot and a half of the ring, since the lattice slides by up to one.
      const reach = ring + 1.5 * LOT_X;
      let count = 0;
      while (count < order.length && fromMiddle(order[count]) <= reach) count++;
      near.geometry.instanceCount = count;
    }
    // The nearest copy of the park.
    const spanX = PERIOD_X * LOT_X;
    const spanZ = PERIOD_Z * LOT_Z;
    const px = ((PARK.x0 + PARK.x1) / 2) * LOT_X - f.shiftX;
    const pz = ((PARK.z0 + PARK.z1) / 2) * LOT_Z + f.shiftZ;
    park.position.x = px - Math.round(px / spanX) * spanX;
    park.position.z = pz - Math.round(pz / spanZ) * spanZ;
    parkMat.opacity = THREE.MathUtils.smoothstep(f.rise, 0.2, 0.8);
    parkMat.emissiveIntensity = f.night;
    parkMat.color.setScalar(1 - 0.85 * f.night);
  };

  const dispose = () => {
    for (const m of [near, far]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    park.geometry.dispose();
    parkMat.dispose();
    parkMaps.day.dispose();
    parkMaps.night.dispose();
  };
  return { group, update, dispose };
}
