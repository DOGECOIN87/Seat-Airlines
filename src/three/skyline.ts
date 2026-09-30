import * as THREE from 'three';

/**
 * The city: nothing but skyscrapers, block after block, to the horizon.
 *
 * Two layers, the same trick the farmland plays. The ground itself is
 * painted as a street grid of roofs (`cityTextures`), which carries the city
 * out to the haze for nothing; the towers stand on it in the round
 * (`createSkyline`) for the few kilometres round the aircraft where you can
 * see that they are towers.
 *
 * The towers cost nothing on the CPU. They are instanced boxes, a slot per
 * block of a square lattice centred under the aircraft; the vertex shader
 * slides the lattice with the ground and, as a block leaves one edge and
 * re-enters at the other, reads which block of the endless city it now is
 * from the block's own coordinates, so a tower keeps its height, footprint
 * and windows for as long as it is in view and the city never visibly
 * repeats. Toward the rim of the lattice the towers sink into the painted
 * roofs, so there is no edge to it.
 *
 * Detail is spent where it can be seen. Round the aircraft each tower is
 * built properly — a podium, the shaft, a setback crown, a spire on the
 * tallest — and further out it is a single box with the same facade painted
 * on it. The detailed ring narrows as the aircraft climbs, since from higher
 * up a crown is a few pixels anyway; the facades themselves fade from
 * windows to their average tone as they shrink below a pixel.
 */

/** Metres from one street to the next, both ways. Half the plate must be a whole number of them, so the painted streets and the towers agree. */
export const CITY_BLOCK = 100;
/** Metres: the tallest tower's roof. Well under the lowest the aircraft flies. */
export const CITY_TOP = 380;
/** Metres: the shortest. */
const CITY_LOW = 40;
/** Footprint, as a share of the block: 36 to 66 m, the size of a real tower. */
const FOOT_MIN = 0.36;
const FOOT_MAX = 0.66;
/** The share of the block a tower (or its podium) may wander over; the rest is street and pavement. */
const LOT = 0.8;
/** Blocks on a side of one tile of the painted city. */
const TILE_BLOCKS = 8;
/** Metres across one tile of the painted city. */
export const CITY_TILE = CITY_BLOCK * TILE_BLOCKS;
/** The block pattern repeats this many blocks along each axis: more than the lattice is wide, so never twice in view. */
const PERIOD = 131;

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

/**
 * One tile of the city from above: asphalt streets on the block lines, and a
 * roof on every block. By night the streets are strings of sodium lamps and
 * the roofs are dark but for what is lit inside.
 */
export function cityTextures(size = 1024): CityTextures {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const dayC = make();
  const nightC = make();
  const d = dayC.getContext('2d')!;
  const n = nightC.getContext('2d')!;
  const cell = size / TILE_BLOCKS;
  const street = Math.round(cell * 0.14);
  const rand = rng(0x5ea7c17e);

  d.fillStyle = '#34373c';
  d.fillRect(0, 0, size, size);
  n.fillStyle = '#000';
  n.fillRect(0, 0, size, size);

  // Lane markings down the middle of every street.
  d.strokeStyle = 'rgba(214, 206, 170, 0.35)';
  d.lineWidth = 1;
  d.setLineDash([4, 5]);
  for (let k = 0; k <= TILE_BLOCKS; k++) {
    const at = k * cell + 0.5;
    d.beginPath(); d.moveTo(at, 0); d.lineTo(at, size); d.stroke();
    d.beginPath(); d.moveTo(0, at); d.lineTo(size, at); d.stroke();
  }
  d.setLineDash([]);

  // Street lamps: a warm string along both kerbs of every street.
  n.fillStyle = 'rgba(255, 176, 92, 0.95)';
  for (let k = 0; k <= TILE_BLOCKS; k++) {
    const mid = k * cell;
    for (let s = 0; s < size; s += 9) {
      for (const kerb of [-street / 2 + 1, street / 2 - 2]) {
        n.fillRect(mid + kerb, s, 1.6, 1.6);
        n.fillRect(s, mid + kerb, 1.6, 1.6);
      }
    }
  }
  // Traffic: white heads one way, red tails the other.
  for (let i = 0; i < 700; i++) {
    const along = rand() * size;
    const k = Math.floor(rand() * (TILE_BLOCKS + 1)) * cell;
    const side = rand() < 0.5 ? -1 : 1;
    const x = rand() < 0.5;
    n.fillStyle = side < 0 ? 'rgba(255, 246, 225, 0.9)' : 'rgba(255, 60, 40, 0.85)';
    if (x) n.fillRect(along, k + side * street * 0.2, 1.4, 1.4);
    else n.fillRect(k + side * street * 0.2, along, 1.4, 1.4);
  }

  // Roofs.
  const roofs = ['#4a4e55', '#3d4148', '#575b62', '#33373d', '#5a534a', '#4a3a33', '#2e3238', '#50555c'];
  for (let i = 0; i < TILE_BLOCKS; i++) {
    for (let j = 0; j < TILE_BLOCKS; j++) {
      const x0 = i * cell + street / 2;
      const y0 = j * cell + street / 2;
      const w = cell - street;
      d.fillStyle = roofs[Math.floor(rand() * roofs.length)];
      d.fillRect(x0, y0, w, w);
      // A tower's own shadow, and a lighter parapet round the edge.
      d.fillStyle = 'rgba(0, 0, 0, 0.28)';
      d.fillRect(x0 + w * 0.55, y0 + w * 0.1, w * 0.45, w * 0.9);
      d.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      d.lineWidth = 2;
      d.strokeRect(x0 + 1, y0 + 1, w - 2, w - 2);
      // Plant on the roof: a few boxes, a helipad now and then.
      for (let k = 0; k < 4; k++) {
        d.fillStyle = rand() < 0.5 ? '#9aa0a8' : '#50555c';
        d.fillRect(x0 + rand() * w * 0.7, y0 + rand() * w * 0.7, 4 + rand() * w * 0.18, 4 + rand() * w * 0.18);
      }
      if (rand() < 0.12) {
        d.strokeStyle = 'rgba(240, 240, 240, 0.7)';
        d.beginPath();
        d.arc(x0 + w / 2, y0 + w / 2, w * 0.2, 0, Math.PI * 2);
        d.stroke();
      }
      // By night, whatever is lit on the top floors, and a red warning lamp.
      for (let k = 0; k < 26; k++) {
        n.fillStyle = rand() < 0.8 ? 'rgba(255, 214, 150, 0.8)' : 'rgba(170, 210, 255, 0.75)';
        n.fillRect(x0 + rand() * w, y0 + rand() * w, 1.6, 1.6);
      }
      n.fillStyle = 'rgba(255, 40, 30, 1)';
      n.fillRect(x0 + w / 2 - 1, y0 + w / 2 - 1, 3, 3);
    }
  }

  const tex = (c: HTMLCanvasElement, colour: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { day: tex(dayC, true), night: tex(nightC, true) };
}

const fract = (v: number) => v - Math.floor(v);
/** `skHash` in the shader, on the CPU. */
function hash(x: number, y: number): number {
  let qx = fract(x * 0.1031), qy = fract(y * 0.103), qz = fract(x * 0.0973);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract((qx + qy) * qz);
}

/**
 * The top of whatever tower stands at (x, z) this frame, metres above the
 * datum, or 0 on the street: the same block, height and footprint the vertex
 * shader draws there, for anything that has to hit what it sees. Towers are
 * at full height near the aircraft, so the lattice's rim does not come into it.
 */
export function towerTopAt(x: number, z: number, shiftX: number, shiftZ: number, rise: number): number {
  if (rise <= 0) return 0;
  const gx = Math.floor((x + shiftX) / CITY_BLOCK);
  const gz = Math.floor((z - shiftZ) / CITY_BLOCK);
  const bx = ((gx % PERIOD) + PERIOD) % PERIOD;
  const bz = ((gz % PERIOD) + PERIOD) % PERIOD;
  const r1 = hash(bx, bz);
  const r2 = hash(bx + 17.13, bz + 17.13);
  const r3 = hash(bx + 41.71, bz + 41.71);
  const fx = (FOOT_MIN + (FOOT_MAX - FOOT_MIN) * r2) * CITY_BLOCK;
  const fz = (FOOT_MIN + (FOOT_MAX - FOOT_MIN) * r3) * CITY_BLOCK;
  const cx = (gx + 0.5) * CITY_BLOCK - shiftX + (r3 - 0.5) * (CITY_BLOCK * LOT - fx);
  const cz = (gz + 0.5) * CITY_BLOCK + shiftZ + (r2 - 0.5) * (CITY_BLOCK * LOT - fz);
  if (Math.abs(x - cx) > fx / 2 || Math.abs(z - cz) > fz / 2) return 0;
  const tall = CITY_LOW + (CITY_TOP - CITY_LOW) * Math.pow(r1, 2.8);
  return Math.max(0, tall * rise - 3);
}

export interface SkylineFrame {
  /** Metres the ground has slid since the view opened (WorldScene's `shift`). */
  shiftX: number;
  shiftZ: number;
  /** 0–1: how far the towers have risen out of the ground. */
  rise: number;
  /** 0–1: how dark it has got, for the windows. */
  night: number;
  /** Metres: the camera's height, which decides how far out the towers are built in detail. */
  height: number;
}

export interface SkylineHandles {
  group: THREE.Group;
  update: (f: SkylineFrame) => void;
  dispose: () => void;
}

const B = CITY_BLOCK.toFixed(1);

const VERTEX_PARS = /* glsl */ `
attribute vec2 cell;
attribute float tier;
uniform vec2 skBase;
uniform vec2 skSlide;
uniform float skRise;
uniform float skHalf;
uniform float skNearR;
uniform float skNear;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying vec2 vSkFoot;
varying float vSkSeed;
varying float vSkTier;
varying float vSkTop;
float skHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
`;

/* Which block this slot is, and so what stands on it: a footprint, a height
   weighted hard toward the ordinary with the odd supertall, then its parts —
   tier 0 a podium, 1 the shaft, 2 a setback crown, 3 a spire — each a unit
   box stretched between its own floor and roof. A far tower is the shaft
   alone, the full height. Slid with the ground, sunk toward the rim, and
   left out (collapsed to a point) on whichever side of the detail ring this
   mesh does not draw. */
const VERTEX = /* glsl */ `
vec2 block = mod( cell + skBase, ${PERIOD.toFixed(1)} );
float r1 = skHash( block );
float r2 = skHash( block + 17.13 );
float r3 = skHash( block + 41.71 );
float r4 = skHash( block + 73.37 );
float r5 = skHash( block + 11.9 );
vec2 centre = ( cell - skHalf + 0.5 ) * ${B} + skSlide;
float dist = length( centre );
float rim = 1.0 - smoothstep( 0.6, 0.97, dist / ( skHalf * ${B} ) );
float mine = skNear > 0.5 ? step( dist, skNearR ) : step( skNearR, dist );
float height = mix( ${CITY_LOW.toFixed(1)}, ${CITY_TOP.toFixed(1)}, pow( r1, 2.8 ) ) * skRise * rim;
vec2 foot = vec2( mix( ${FOOT_MIN}, ${FOOT_MAX}, r2 ), mix( ${FOOT_MIN}, ${FOOT_MAX}, r3 ) ) * ${B};
vec2 lot = centre + ( vec2( r3, r2 ) - 0.5 ) * ( ${B} * ${LOT} - foot );
bool crowned = r4 < 0.55 && skNear > 0.5;
float shaftTop = crowned ? height * mix( 0.72, 0.88, r5 ) : height;
vec2 size = foot;
float y0 = 0.0;
float y1 = shaftTop;
if ( tier < 0.5 ) {
  // A podium on half of them: a few storeys of lobby and shops, out to the lot.
  y1 = r5 < 0.5 ? min( 16.0, height * 0.25 ) : 0.0;
  size = min( foot * 1.3, vec2( ${B} * ${LOT} ) );
} else if ( tier < 2.5 && tier > 1.5 ) {
  y0 = shaftTop;
  y1 = crowned ? height : shaftTop;
  size = foot * mix( 0.55, 0.82, r4 / 0.55 );
} else if ( tier > 2.5 ) {
  // A spire on the tallest: a mast of a few metres a side.
  y0 = height;
  y1 = r1 > 0.8 ? height * 1.16 : height;
  size = vec2( 3.0 );
}
size *= mine;
vec3 local = vec3( position.x * size.x, mix( y0, y1, position.y ), position.z * size.y );
vec3 transformed = local + vec3( lot.x, -3.0, lot.y );
vSkAt = local;
vSkNormal = normal;
vSkFoot = size * 0.5;
vSkSeed = r1 + r2 * 7.0;
vSkTier = tier;
vSkTop = y1;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float skNight;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying vec2 vSkFoot;
varying float vSkSeed;
varying float vSkTier;
varying float vSkTop;
float skHash2( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
`;

/* The facade. Six kinds of building — blue and green curtain-wall glass,
   dark bronze, limestone, brick, concrete — each with its own window
   module: a curtain wall is nearly all glass between thin mullions over a
   spandrel strip, masonry is punched windows in a solid wall. Every window
   has its blind at its own height; the corners are solid piers; every
   twelfth floor is a plant floor with louvres rather than windows; the
   street floors are darker with grime and shade. Once a window is under a
   pixel the pattern fades to its average, so a far tower is a tone rather
   than a moiré, and the plant floors, being coarser, last longer. */
const FRAGMENT = /* glsl */ `
float skWall = 1.0 - step( 0.5, abs( vSkNormal.y ) );
bool skSideX = abs( vSkNormal.x ) > 0.5;
float skAlong = skSideX ? vSkAt.z : vSkAt.x;
float skHalfW = skSideX ? vSkFoot.y : vSkFoot.x;
float skStyle = fract( vSkSeed * 3.1 );
float skS2 = fract( vSkSeed * 7.7 );
bool skCurtain = skStyle < 0.55;
vec3 skFrame;
vec3 skPaneCol;
if ( skStyle < 0.22 ) { skFrame = vec3( 0.2, 0.23, 0.27 ); skPaneCol = vec3( 0.06, 0.12, 0.2 ); }
else if ( skStyle < 0.4 ) { skFrame = vec3( 0.22, 0.26, 0.26 ); skPaneCol = vec3( 0.07, 0.16, 0.17 ); }
else if ( skStyle < 0.55 ) { skFrame = vec3( 0.12, 0.11, 0.1 ); skPaneCol = vec3( 0.09, 0.07, 0.05 ); }
else if ( skStyle < 0.75 ) { skFrame = vec3( 0.55, 0.5, 0.42 ); skPaneCol = vec3( 0.08, 0.09, 0.11 ); }
else if ( skStyle < 0.9 ) { skFrame = vec3( 0.4, 0.2, 0.14 ); skPaneCol = vec3( 0.08, 0.08, 0.09 ); }
else { skFrame = vec3( 0.43, 0.44, 0.44 ); skPaneCol = vec3( 0.07, 0.09, 0.11 ); }
vec2 skModule = vec2( skCurtain ? mix( 1.5, 2.4, skS2 ) : mix( 2.6, 3.6, skS2 ), 3.8 );
vec2 skWc = vec2( skAlong / skModule.x, vSkAt.y / skModule.y );
vec2 skId = floor( skWc );
vec2 skF = fract( skWc );
vec4 skPaneBox = skCurtain ? vec4( 0.05, 0.95, 0.28, 0.97 ) : vec4( 0.22, 0.78, 0.3, 0.82 );
float skPane = step( skPaneBox.x, skF.x ) * step( skF.x, skPaneBox.y ) * step( skPaneBox.z, skF.y ) * step( skF.y, skPaneBox.w );
float skMean = ( skPaneBox.y - skPaneBox.x ) * ( skPaneBox.w - skPaneBox.z );
float skBlur = smoothstep( 0.3, 0.8, max( fwidth( skWc.x ), fwidth( skWc.y ) ) );
// Blinds: how far down each window's is, which is most of what makes glass look occupied.
float skBlind = skHash2( skId + vec2( vSkSeed * 57.0, 3.0 ) );
float skShade = mix( step( skF.y, mix( 0.97, 0.45, skBlind * skBlind ) ) * 0.55 + 0.45, 0.8, skBlur );
// Plant floors every twelfth, and solid piers at the corners.
float skPlant = step( 10.5, mod( skId.y, 12.0 ) ) * step( 30.0, vSkAt.y );
float skPlantBlur = smoothstep( 0.1, 0.5, fwidth( vSkAt.y / 45.6 ) );
skPlant *= 1.0 - skPlantBlur;
float skPier = step( skHalfW - ( skCurtain ? 0.8 : 1.6 ), abs( skAlong ) );
float skGlass = mix( skPane, skMean, skBlur ) * ( 1.0 - skPlant ) * ( 1.0 - skPier ) * skWall;
vec3 skCol = mix( skFrame, skPaneCol * skShade * 1.4, skGlass );
skCol = mix( skCol, skFrame * 0.7 + vec3( 0.05 ), skPlant * skWall );
// Louvres on the plant floors: fine horizontal lines.
skCol *= 1.0 - skPlant * 0.25 * step( 0.5, fract( vSkAt.y * 1.6 ) );
// Grime and shade at street level.
skCol *= mix( 0.55, 1.0, smoothstep( 0.0, 24.0, vSkAt.y ) );
// Roofs: dark membrane, a pale parapet, plant boxes in the middle.
if ( skWall < 0.5 ) {
  vec2 skR = abs( vSkAt.xz ) / max( vSkFoot, vec2( 0.01 ) );
  float skEdge = step( 0.9, max( skR.x, skR.y ) );
  float skBox = step( max( skR.x, skR.y ), 0.35 ) * step( 0.4, fract( vSkSeed * 13.0 ) );
  skCol = mix( vec3( 0.2, 0.21, 0.22 ), skFrame * 1.1, skEdge );
  skCol = mix( skCol, vec3( 0.46, 0.47, 0.48 ), skBox );
}
// Spires are steel.
if ( vSkTier > 2.5 ) skCol = vec3( 0.5, 0.52, 0.55 );
diffuseColor.rgb = skCol;
float skLitP = mix( 0.4, 0.8, skS2 );
float skLit = step( 1.0 - skLitP, skHash2( skId + vec2( vSkSeed * 91.0, floor( vSkSeed * 13.0 ) ) ) );
float skWarm = skHash2( skId + 5.5 );
vec3 skLight = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.78, 0.5 ), step( 0.3, skWarm ) );
vec3 skGlow = skLight * mix( skLit * skPane * skShade, skLitP * skMean * 0.7, skBlur ) * ( 1.0 - skPlant ) * ( 1.0 - skPier ) * skWall;
// The red aircraft-warning lamp at the very top of the tall ones.
float skBeacon = step( 2.5, vSkTier ) * step( vSkTop - 4.0, vSkAt.y ) * step( 0.5, vSkTop - vSkAt.y + 0.5 );
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
 * The towers, a lattice `blocks` wide round the aircraft. Hidden until the
 * city comes in.
 */
export function createSkyline(o: { blocks: number; envMap?: THREE.Texture }): SkylineHandles {
  const n = o.blocks;
  const group = new THREE.Group();
  group.visible = false;

  /* Every slot of the lattice, nearest the middle first: the detailed mesh
     draws only as many of them as its ring needs. */
  const order: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) order.push([i, j]);
  const fromMiddle = ([i, j]: [number, number]) => Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5);
  order.sort((a, b) => fromMiddle(a) - fromMiddle(b));
  const cells = new Float32Array(order.flat());
  const cellAttr = new THREE.InstancedBufferAttribute(cells, 2);

  const shared = {
    skBase: { value: new THREE.Vector2() },
    skSlide: { value: new THREE.Vector2() },
    skRise: { value: 0 },
    skHalf: { value: n / 2 },
    skNearR: { value: 0 },
    skNight: { value: 0 },
  };
  const build = (near: boolean) => {
    const geometry = towerGeometry(near ? [0, 1, 2, 3] : [1]);
    geometry.setAttribute('cell', cellAttr);
    geometry.instanceCount = n * n;
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
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( 0.04, skCurtain ? 0.5 : 0.2, skGlass ) + ( vSkTier > 2.5 ? 0.6 : 0.0 );')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += skGlow * skNight * 3.0;',
        )
        /* After dark a city is its windows. The scene's skylight stays up at
           night so the fields and the aircraft stay legible, and on a tower
           that lit every wall grey as if it were dusk; so once the sun is
           down the towers take almost none of it, nor of the sky's
           reflection, and go black round their lit windows. */
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse *= mix( 1.0, 0.04, skNight );
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

  const mod = (v: number, m: number) => ((v % m) + m) % m;
  const update = (f: SkylineFrame) => {
    group.visible = f.rise > 0.002;
    if (!group.visible) return;
    /* A tower on block (gx, gz) of the endless city stands at
       x = (gx + ½)·B − shiftX, z = (gz + ½)·B + shiftZ: on the same street
       lines the painted ground draws, and carried the same way. */
    const bx = Math.floor(f.shiftX / CITY_BLOCK);
    const bz = Math.floor(f.shiftZ / CITY_BLOCK);
    shared.skBase.value.set(mod(bx - n / 2, PERIOD), mod(-bz - n / 2, PERIOD));
    shared.skSlide.value.set(-(f.shiftX - bx * CITY_BLOCK), f.shiftZ - bz * CITY_BLOCK);
    shared.skRise.value = f.rise;
    shared.skNight.value = f.night;
    /* The detailed ring: nearly two kilometres out at the bottom of the
       band, a few hundred metres at the top of it. */
    const ring = THREE.MathUtils.lerp(1900, 500, THREE.MathUtils.smoothstep(f.height, 900, 2600));
    shared.skNearR.value = ring;
    // Slots within a block and a half of the ring, since the lattice slides by up to one.
    if (ring !== lastRing) {
      lastRing = ring;
      const reach = ring / CITY_BLOCK + 1.5;
      let count = 0;
      while (count < order.length && fromMiddle(order[count]) <= reach) count++;
      near.geometry.instanceCount = count;
    }
  };

  const dispose = () => {
    for (const m of [near, far]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  };
  return { group, update, dispose };
}
