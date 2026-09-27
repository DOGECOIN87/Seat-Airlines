import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_METRES } from './terrain';
import { seededRandom, type BoatKind, type BoatSpot, type BuildingSpot, type TreeKind, type TreeSpot } from './props';

/**
 * What stands on the ground, in the round.
 *
 * The farmland was a painting: woods were dark blots, towns were roofs laid
 * flat, and nothing had a height but the hills. This raises it. Every tree,
 * building and boat is one of a handful of shapes drawn many times over in a
 * single call — a spruce is a cone, an oak a rounded knob, a poplar a spindle,
 * a house a box under a pitched roof — placed from the same records the
 * ground was painted from (see `props.ts`), so each stands exactly on the
 * wood, roof or ship's light already painted under it.
 *
 * The world does not move here; the ground's texture slides under the
 * aircraft (see `shift` in WorldScene). So the placing is done on the
 * graphics card, every frame, from the same shift: each prop is carried
 * along with the paint, wrapped to whichever copy of the three-kilometre
 * tile is nearest, and stood on the relief — not on the smooth height field
 * but on the very triangles the ground mesh makes of it, read at the same
 * three corners, so a tree's foot is exactly where the hillside is drawn.
 * Out past a few kilometres the props shrink away into the ground, where the
 * painting below them carries on at a size nobody could tell apart.
 *
 * One mesh per shape per copy of the tile: the copies are culled whole
 * when they are out of shot, which is most of them.
 */

export interface SceneryFrame {
  /** Metres the ground has slid since the view opened (WorldScene's `shift`). */
  shiftX: number;
  shiftZ: number;
  /** The relief map's offset this frame, so the props read it exactly as the ground mesh does. */
  heightOffset: THREE.Vector2;
  /** Metres from the relief's lowest point to its highest this frame: 0 when it has sunk. */
  relief: number;
  /** 0–1: how much of the land is standing — 0 over the sea. */
  land: number;
  /** 0–1: how much of the sea is in — 0 over land. */
  sea: number;
  /** Metres: where the water's surface is drawn this frame. */
  seaLevel: number;
  /** 0–1: how dark it has got, for lit windows and ships' lights. */
  night: number;
  /** 0–1: how much daylight there is, for the wakes' white. */
  day: number;
}

export interface SceneryHandles {
  group: THREE.Group;
  update: (f: SceneryFrame) => void;
  dispose: () => void;
}

interface SceneryOptions {
  trees: TreeSpot[];
  buildings: BuildingSpot[];
  boats: BoatSpot[];
  /** The farmland's relief map, which the ground mesh is displaced by. */
  height: THREE.Texture;
  /** The ground mesh: metres across, and segments along each side. */
  near: { size: number; segments: number };
  lowPower: boolean;
  /** Where see-through ground layers draw: before the clouds, after the sea. */
  overlayOrder: number;
}

const TILE = TILE_METRES;

/* ── The placing, in GLSL ────────────────────────────────────────────────
   Shared by every prop material and the lights. `scSpot` is the prop's
   place on the tile (s, t), its turn, and a fixed random number; the mesh's
   own position says which copy of the tile it is standing in. */
const PLACE_COMMON = /* glsl */ `
#define SC_TILE ${TILE.toFixed(1)}
uniform vec2 scShift;
uniform vec2 scTile;
uniform vec2 scReach;
uniform float scShow;
uniform float scLevel;
uniform float scNight;
float scHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
#ifdef SC_GROUNDED
uniform sampler2D scHeight;
uniform vec2 scHeightOffset;
uniform float scRelief;
uniform vec2 scGrid;
// One corner of the ground mesh, displaced exactly as its vertex shader does it.
float scCorner( vec2 xz ) {
  vec2 uv = vec2( xz.x, - xz.y ) / SC_TILE + scHeightOffset;
  float rim = 1.0 - smoothstep( 0.55, 0.95, length( xz ) / ( 0.5 * scGrid.x ) );
  return textureLod( scHeight, uv, 0.0 ).x * scRelief * rim;
}
// The ground mesh's own surface here: its triangle, not the smooth field.
float scGround( vec2 xz ) {
  float cell = scGrid.x / scGrid.y;
  vec2 g = ( xz + 0.5 * scGrid.x ) / cell;
  vec2 i = floor( g );
  vec2 f = g - i;
  vec2 o = i * cell - 0.5 * scGrid.x;
  float hb = scCorner( o + vec2( 0.0, cell ) );
  float hd = scCorner( o + vec2( cell, 0.0 ) );
  if ( f.x + f.y <= 1.0 ) {
    float ha = scCorner( o );
    return ha + f.x * ( hd - ha ) + f.y * ( hb - ha );
  }
  float hc = scCorner( o + vec2( cell ) );
  return hc + ( 1.0 - f.x ) * ( hb - hc ) + ( 1.0 - f.y ) * ( hd - hc );
}
#endif
`;

// A meshed prop's own: its size, its two colours, and which faces can light up.
const PLACE_PARS = /* glsl */ `
${PLACE_COMMON}
attribute vec4 scSpot;
attribute vec3 scSize;
attribute vec3 scColA;
attribute vec3 scColB;
attribute vec2 scExtra;
attribute float scPart;
attribute float scGlass;
varying vec3 vScWall;
varying float vScLit;
varying float vScSeed;
`;

const PLACE = /* glsl */ `
// Carried with the paint, then wrapped to the copy of the tile this mesh stands for.
vec2 scXZ = vec2( scSpot.x * SC_TILE - scShift.x, scSpot.y * SC_TILE + scShift.y );
vec2 scWrap = floor( scXZ / SC_TILE + 0.5 );
scXZ += ( floor( modelMatrix[ 3 ].xz / SC_TILE + 0.5 ) - scWrap ) * SC_TILE;
float scAlive = scShow * ( 1.0 - smoothstep( scReach.x, scReach.y, length( scXZ ) ) );
#ifdef SC_PER_TILE
  /* Which copies of the tile it turns up in, drawn per world tile rather
     than per copy slot, so it never changes as the aircraft crosses a
     tile's edge — and so the same fleet is not moored every three km. */
  vec2 scTileId = scTile + floor( modelMatrix[ 3 ].xz / SC_TILE + 0.5 ) - scWrap;
  scAlive *= step( scHash( scTileId + scSpot.w * 97.31 ), scExtra.y );
#endif
float scCos = cos( scSpot.z );
float scSin = sin( scSpot.z );
`;

const PLACE_NORMAL = /* glsl */ `
vec3 objectNormal = normalize( normal / scSize );
objectNormal = vec3( objectNormal.x * scCos - objectNormal.z * scSin, objectNormal.y, objectNormal.x * scSin + objectNormal.z * scCos );
`;

const PLACE_VERTEX = /* glsl */ `
vec3 scLocal = position * scSize;
#ifdef SC_SINK
  // Walls carry on down into the slope, so a house on a hillside has no gap under it.
  if ( position.y < 0.001 ) scLocal.y -= SC_SINK;
#endif
vScWall = vec3( abs( normal.x ) > 0.5 ? scLocal.z : scLocal.x, scLocal.y, 0.0 );
#ifdef SC_STERN
  // A wake starts at its boat's stern: half a hull back, in the boat's own frame.
  scLocal.z -= scExtra.x;
#endif
scLocal *= scAlive;
#ifdef SC_GROUNDED
  float scBase = scGround( scXZ );
#else
  float scBase = scLevel;
#endif
vec3 transformed = vec3(
  scXZ.x + scLocal.x * scCos - scLocal.z * scSin,
  scBase + scLocal.y,
  scXZ.y + scLocal.x * scSin + scLocal.z * scCos
) - modelMatrix[ 3 ].xyz;
vScLit = scExtra.x * scGlass;
vScSeed = scSpot.w;
`;

const PLACE_COLOUR = /* glsl */ `
#include <color_vertex>
vColor.rgb *= scPart < 0.5 ? scColA : scPart < 1.5 ? scColB : vec3( 1.0 );
`;

/* Lit windows after dark. Each window is a cell of the wall with its own
   draw against the building's share of lit rooms; once the cells shrink
   toward a pixel the pattern gives way to its own average, since a pattern
   finer than a pixel is not a pattern, it is shimmer. */
const WINDOWS_PARS = /* glsl */ `
varying vec3 vScWall;
varying float vScLit;
varying float vScSeed;
float scHashF( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
`;

const WINDOWS = /* glsl */ `
#ifdef SC_WINDOWS
  if ( vScLit > 0.0 && scNightLevel > 0.0 ) {
    vec2 scCell = vec2( vScWall.x / SC_BAY, vScWall.y / SC_STOREY );
    vec2 scW = fwidth( scCell );
    vec2 scF = fract( scCell );
    vec2 scPane = smoothstep( vec2( 0.22 ) - scW, vec2( 0.22 ) + scW, scF )
      * ( 1.0 - smoothstep( vec2( 0.74 ) - scW, vec2( 0.74 ) + scW, scF ) );
    float scOn = step( scHashF( floor( scCell ) + vScSeed * 131.7 ), vScLit );
    float scFine = 1.0 - smoothstep( 0.3, 0.6, max( scW.x, scW.y ) );
    // Far off, only a warm cast: the window lights themselves are points (see lampMaterial).
    float scGlow = mix( vScLit * 0.1, scPane.x * scPane.y * scOn, scFine );
    // A lit window is the brightest thing in a dark street.
    totalEmissiveRadiance += SC_LAMP * ( 2.4 * scGlow * scNightLevel * step( 0.5, vScWall.y ) );
  }
#endif
`;

/* Lights as points: a window, a ship's masthead. A point keeps its few
   pixels however far off it is, which is what a light at night does, and
   a soft one does not shimmer the way a sub-pixel window pattern would.
   Each carries its prop's place in `scSpot` and its own offset from it,
   in metres, as its position; `scLamp` is its size and its prop's odds. */
const LAMP_PARS = /* glsl */ `
${PLACE_COMMON}
attribute vec4 scSpot;
attribute vec2 scLamp;
vec2 scExtra;
`;

const LAMP_VERTEX = /* glsl */ `
scExtra = vec2( 0.0, scLamp.y );
${PLACE}
#ifdef SC_GROUNDED
  float scBase = scGround( scXZ );
#else
  float scBase = scLevel;
#endif
vec3 transformed = vec3(
  scXZ.x + position.x * scCos - position.z * scSin,
  scBase + position.y,
  scXZ.y + position.x * scSin + position.z * scCos
) - modelMatrix[ 3 ].xyz;
`;

function lampMaterial(uniforms: Record<string, THREE.IUniform>, map: THREE.Texture, defines: Record<string, string>): THREE.PointsMaterial {
  const mat = new THREE.PointsMaterial({
    map, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: false, size: 1,
  });
  mat.defines = defines;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${LAMP_PARS}`)
      .replace('#include <begin_vertex>', LAMP_VERTEX)
      // Only after dark, and shrinking with the rest of the scenery at the edge of its reach.
      .replace('gl_PointSize = size;', 'gl_PointSize = scLamp.x * scNight * step( 0.001, scAlive ) * max( scAlive, 0.35 );');
  };
  return mat;
}

/** A material that places each instance of its geometry as described above. */
function placedMaterial(
  uniforms: Record<string, THREE.IUniform>,
  defines: Record<string, string>,
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.defines = defines;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PLACE_PARS}`)
      .replace('#include <beginnormal_vertex>', `${PLACE}\n${PLACE_NORMAL}`)
      .replace('#include <begin_vertex>', PLACE_VERTEX)
      .replace('#include <color_vertex>', PLACE_COLOUR);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WINDOWS_PARS}\nuniform float scNightLevel;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WINDOWS}`);
  };
  return mat;
}

/* ── The shapes ──────────────────────────────────────────────────────────
   In unit sizes, standing on the origin, stretched per instance by
   `scSize`. Each carries `scPart` (which of its instance's two colours a
   face takes, or 2 for its own) and `scGlass` (whether it can light up). */
function finishShape(geo: THREE.BufferGeometry, part: (i: number) => number, glass: (i: number) => number, colour?: (i: number) => THREE.Color) {
  const count = geo.attributes.position.count;
  const parts = new Float32Array(count);
  const glasses = new Float32Array(count);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    parts[i] = part(i);
    glasses[i] = glass(i);
    const c = colour ? colour(i) : WHITE;
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('scPart', new THREE.BufferAttribute(parts, 1));
  geo.setAttribute('scGlass', new THREE.BufferAttribute(glasses, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}
const WHITE = new THREE.Color(1, 1, 1);

/* Trees are the many: thousands to a tile, never nearer than a kilometre
   or so. So each is as few faces as still has the right silhouette and
   takes the light on the right side — seven for a spruce, twelve for an
   oak — with normals smoothed so the facets shade as a curve. */

/** A spruce: a seven-sided cone, skirted to the ground. */
function coneShape(): THREE.BufferGeometry {
  const SIDES = 7;
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    const n = new THREE.Vector3(Math.cos(a), 0.5, Math.sin(a)).normalize();
    nrm.push(n.x, n.y, n.z);
  }
  pos.push(0, 1, 0);
  nrm.push(0, 1, 0);
  const idx: number[] = [];
  for (let k = 0; k < SIDES; k++) idx.push(k, SIDES, (k + 1) % SIDES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return finishShape(geo, () => 0, () => 0);
}

/** An oak, a birch or an apple tree: a six-sided double cone, rounded by its normals, starting low. */
function crownShape(): THREE.BufferGeometry {
  const SIDES = 6;
  const pos: number[] = [0, 0.08, 0];
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.5, 0.48, Math.sin(a) * 0.5);
  }
  pos.push(0, 1, 0);
  const top = SIDES + 1;
  const idx: number[] = [];
  for (let k = 0; k < SIDES; k++) {
    const a = 1 + k;
    const b = 1 + ((k + 1) % SIDES);
    idx.push(0, a, b, a, top, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return finishShape(geo, () => 0, () => 0);
}

/** A poplar: a tall spindle. */
function spindleShape(): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, 0.02), new THREE.Vector2(0.5, 0.3), new THREE.Vector2(0.36, 0.72), new THREE.Vector2(0, 1)];
  const geo = new THREE.LatheGeometry(pts, 5);
  geo.computeVertexNormals();
  return finishShape(geo, () => 0, () => 0);
}

/** A flat-roofed block: walls in its first colour, roof in its second. */
function blockShape(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  geo.translate(0, 0.5, 0);
  const n = geo.attributes.normal;
  // The lid takes the roof's colour; only the walls have windows.
  return finishShape(geo, (i) => (n.getY(i) > 0.5 ? 1 : 0), (i) => (Math.abs(n.getY(i)) < 0.5 ? 1 : 0));
}

/** A house: walls to the eaves at 1, a pitched roof along its length to 1.55. */
function houseShape(): THREE.BufferGeometry {
  const walls = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  walls.translate(0, 0.5, 0);
  const ridge = 1.55;
  // The roof: two slopes and the two gable ends, overhanging the walls a little.
  const o = 0.56;
  const l = 0.54;
  const roof = new THREE.BufferGeometry();
  const verts = [
    // slopes
    -o, 1, -l, -o, 1, l, 0, ridge, l,
    -o, 1, -l, 0, ridge, l, 0, ridge, -l,
    o, 1, l, o, 1, -l, 0, ridge, -l,
    o, 1, l, 0, ridge, -l, 0, ridge, l,
    // gables
    -0.5, 1, 0.5, 0.5, 1, 0.5, 0, ridge, 0.5,
    0.5, 1, -0.5, -0.5, 1, -0.5, 0, ridge, -0.5,
  ];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roof.computeVertexNormals();
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  // Keep only the box's walls: the slopes stand in for its lid, and nobody sees its floor.
  const keep = walls.attributes.normal;
  const idx: number[] = [];
  for (let i = 0; i < keep.count; i++) if (Math.abs(keep.getY(i)) < 0.5) idx.push(i);
  const shell = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const src = walls.attributes[name];
    const out = new Float32Array(idx.length * src.itemSize);
    idx.forEach((k, j) => {
      for (let c = 0; c < src.itemSize; c++) out[j * src.itemSize + c] = src.array[k * src.itemSize + c];
    });
    shell.setAttribute(name, new THREE.BufferAttribute(out, src.itemSize));
  }
  const geo = mergeGeometries([shell, roof]) as THREE.BufferGeometry;
  // Walls first, then the four slope triangles, then the two gable ends.
  const shellCount = shell.attributes.position.count;
  const gableStart = shellCount + 12;
  return finishShape(
    geo,
    (i) => (i >= shellCount && i < gableStart ? 1 : 0),
    (i) => (i < shellCount ? 1 : 0),
  );
}

/* Boats are drawn to size, in metres, with their bow toward +z and their
   waterline at 0; each carries its hull in its first colour and its trim in
   its second, and everything above the deck that could have a window in it
   marked as glass. */
function box(w: number, h: number, l: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
  g.translate(x, y + h / 2, z);
  return g;
}

/** A hull: a box whose bow comes to a point. */
function hull(beam: number, freeboard: number, draft: number, length: number, bow: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const half = length / 2;
  s.moveTo(-beam / 2, -half);
  s.lineTo(beam / 2, -half);
  s.lineTo(beam / 2, half - bow);
  s.lineTo(0, half);
  s.lineTo(-beam / 2, half - bow);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: freeboard + draft, bevelEnabled: false });
  /* Extruded along +z. A quarter turn about x lays the outline in x–z with
     the bow still toward +z, and sends the extrusion down from the deck. */
  g.rotateX(Math.PI / 2);
  g.translate(0, freeboard, 0);
  return g;
}

interface BoatShape {
  geometry: THREE.BufferGeometry;
  /** Metres, for the wake. */
  length: number;
  beam: number;
  /** Where its lights are: [x, y, z, r, g, b, size in pixels]. */
  lights: number[][];
  /** Hull and trim colours to choose between. */
  hulls: string[];
  trims: string[];
  /** Share of tile copies it turns up in. */
  odds: number;
  /** How fast it looks to be going: a longer wake. */
  wake: number;
}

function boatShape(kind: BoatKind): BoatShape {
  const parts: { g: THREE.BufferGeometry; part: number; glass: number; colour?: string }[] = [];
  const add = (g: THREE.BufferGeometry, part: number, glass = 0, colour?: string) => parts.push({ g, part, glass, colour });
  let length = 0;
  let beam = 0;
  let lights: number[][] = [];
  let hulls: string[] = [];
  let trims: string[] = [];
  let odds = 0.55;
  let wake = 4;
  const white = '#eeeae2';
  switch (kind) {
    case 'cargo': {
      length = 168; beam = 26;
      add(hull(beam, 9, 7, length, 22), 0);
      // Containers, in blocks of their own colours.
      const boxes = ['#b8432f', '#2f5f8f', '#d08a2a', '#3f7a4a', '#8a8f94', '#a33a4f'];
      for (let k = 0; k < 6; k++) add(box(beam - 3, 7 + (k % 3), 17, 0, 9, 52 - k * 19), 2, 0, boxes[k]);
      add(box(beam - 2, 14, 16, 0, 9, -66), 2, 1, white);
      add(box(beam - 8, 5, 12, 0, 23, -66), 2, 1, white);
      add(box(4, 7, 5, 0, 23, -76), 1);
      lights = [[0, 32, -64, 1, 0.95, 0.85, 3.2], [-13, 20, -58, 1, 0.2, 0.15, 2.4], [13, 20, -58, 0.2, 1, 0.3, 2.4], [0, 12, -84, 1, 1, 1, 2.2], [0, 18, 70, 1, 0.95, 0.85, 2.4], [0, 16, 20, 1, 0.8, 0.5, 2]];
      hulls = ['#7a1f1f', '#1e2f4f', '#26313a', '#2f4a3a', '#8a3a1a'];
      trims = ['#c8b04a', '#e0e0d8', '#b83a2a'];
      odds = 0.08; wake = 3.2;
      break;
    }
    case 'tanker': {
      length = 190; beam = 30;
      add(hull(beam, 7, 9, length, 26), 0);
      add(box(beam - 4, 1.2, length - 60, 0, 7, 10), 2, 0, '#7a3b2e');
      add(box(beam - 2, 15, 18, 0, 7, -76), 2, 1, white);
      add(box(beam - 10, 5, 12, 0, 22, -76), 2, 1, white);
      add(box(5, 8, 6, 0, 22, -87), 1);
      lights = [[0, 30, -74, 1, 0.95, 0.85, 3.2], [-15, 18, -70, 1, 0.2, 0.15, 2.4], [15, 18, -70, 0.2, 1, 0.3, 2.4], [0, 10, -95, 1, 1, 1, 2.2], [0, 12, 80, 1, 0.95, 0.85, 2.4]];
      hulls = ['#5a1a16', '#2a2a2a', '#3a2020', '#1f2a3a'];
      trims = ['#e0e0d8', '#c8b04a'];
      odds = 0.06; wake = 2.6;
      break;
    }
    case 'ferry': {
      length = 128; beam = 24;
      add(hull(beam, 8, 5, length, 20), 0);
      add(box(beam, 2.4, length - 22, 0, 5.6, -8), 1);
      add(box(beam - 2, 7, length - 34, 0, 8, -10), 2, 1, white);
      add(box(beam - 4, 6, length - 52, 0, 15, -14), 2, 1, white);
      add(box(beam - 8, 5, 26, 0, 21, -4), 2, 1, white);
      add(box(6, 7, 9, 0, 26, -22), 1);
      lights = [[0, 32, -4, 1, 0.95, 0.85, 3], [-12, 22, 6, 1, 0.2, 0.15, 2.4], [12, 22, 6, 0.2, 1, 0.3, 2.4], [0, 14, -64, 1, 1, 1, 2.2], [-12, 12, -20, 1, 0.85, 0.6, 2.2], [12, 12, -20, 1, 0.85, 0.6, 2.2]];
      hulls = ['#f2f0ea'];
      trims = ['#1f4f9a', '#b8322a', '#1f6f5a'];
      odds = 0.08; wake = 4.2;
      break;
    }
    case 'trawler': {
      length = 28; beam = 8;
      add(hull(beam, 2.6, 2, length, 6), 0);
      add(box(beam - 2, 4, 7, 0, 2.6, 6), 2, 1, white);
      add(box(beam - 3, 2.2, 3, 0, 6.6, 6), 1);
      add(box(beam - 2.5, 1.4, 10, 0, 2.6, -7), 2, 0, '#5a5f62');
      lights = [[0, 11, 5, 1, 0.97, 0.9, 2.8], [-4, 6, 8, 1, 0.2, 0.15, 1.8], [4, 6, 8, 0.2, 1, 0.3, 1.8], [0, 7, -8, 1, 1, 0.92, 3.2]];
      hulls = ['#1f5f8a', '#a8322a', '#2f7a4a', '#d8a020', '#26313a'];
      trims = ['#e0e0d8', '#c8b04a', '#b83a2a'];
      odds = 0.16; wake = 5;
      break;
    }
    case 'yacht': {
      length = 13; beam = 4;
      add(hull(beam, 1.4, 1.2, length, 4), 0);
      add(box(beam - 1.6, 1, 4, 0, 1.4, -0.5), 2, 1, white);
      // The sail: a triangle, both faces, so it reads from either side.
      const sail = new THREE.BufferGeometry();
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.2, 2.5, 0, 17, 2.3, 0, 2.2, -4.2, 0, 2.2, 2.5, 0, 2.2, -4.2, 0, 17, 2.3], 3));
      sail.computeVertexNormals();
      sail.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
      add(sail, 2, 0, '#f4f1e6');
      lights = [[0, 17.5, 2.3, 1, 1, 1, 2.2]];
      hulls = ['#f4f2ec', '#1f2f4f', '#e8e2d2'];
      trims = ['#1f4f9a', '#b8322a'];
      odds = 0.16; wake = 3;
      break;
    }
  }
  const pieces = parts.map(({ g, part, glass, colour }) => {
    const piece = g.index ? g.toNonIndexed() : g;
    if (!piece.attributes.uv) piece.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(piece.attributes.position.count * 2), 2));
    const tint = new THREE.Color(colour ?? '#ffffff');
    return finishShape(piece, () => part, () => glass, () => tint);
  });
  const geometry = mergeGeometries(pieces) as THREE.BufferGeometry;
  return { geometry, length, beam, lights, hulls, trims, odds, wake };
}

/** A wake: a widening V of foam behind the stern, fading as it spreads. */
function wakeShape(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const STEPS = 10;
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    const half = 0.18 + 0.82 * Math.sqrt(t);
    const alpha = (1 - t) ** 1.6;
    pos.push(-half, 0, -t, half, 0, -t);
    col.push(1, 1, 1, alpha * 0.85, 1, 1, 1, alpha * 0.85);
  }
  // Wound to face up, the only side anyone sees it from.
  const idx: number[] = [];
  for (let k = 0; k < STEPS; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const count = pos.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: count * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('scPart', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('scGlass', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  geo.setIndex(idx);
  return geo;
}

/* ── Instances ───────────────────────────────────────────────────────── */

interface Instances {
  spot: number[];
  size: number[];
  colA: number[];
  colB: number[];
  extra: number[];
}
const newInstances = (): Instances => ({ spot: [], size: [], colA: [], colB: [], extra: [] });

/** Lights, as a points geometry: one vertex per light, carrying its prop's place. */
function newLamps() {
  const pos: number[] = [];
  const spot: number[] = [];
  const col: number[] = [];
  const lamp: number[] = [];
  return {
    add(at: [number, number, number], prop: [number, number, number, number], tint: [number, number, number], px: number, odds: number) {
      pos.push(...at);
      spot.push(...prop);
      col.push(...tint);
      lamp.push(px, odds);
    },
    geometry() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('scSpot', new THREE.Float32BufferAttribute(spot, 4));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('scLamp', new THREE.Float32BufferAttribute(lamp, 2));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), TILE * 0.75 + 300);
      return geo;
    },
  };
}

function instanced(shape: THREE.BufferGeometry, inst: Instances): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = shape.index;
  for (const [name, attr] of Object.entries(shape.attributes)) geo.setAttribute(name, attr);
  geo.setAttribute('scSpot', new THREE.InstancedBufferAttribute(new Float32Array(inst.spot), 4));
  geo.setAttribute('scSize', new THREE.InstancedBufferAttribute(new Float32Array(inst.size), 3));
  geo.setAttribute('scColA', new THREE.InstancedBufferAttribute(new Float32Array(inst.colA), 3));
  geo.setAttribute('scColB', new THREE.InstancedBufferAttribute(new Float32Array(inst.colB), 3));
  geo.setAttribute('scExtra', new THREE.InstancedBufferAttribute(new Float32Array(inst.extra), 2));
  geo.instanceCount = inst.spot.length / 4;
  // Every copy of the tile is culled whole, by a sphere round the tile.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 120, 0), TILE * 0.75 + 300);
  return geo;
}

const colour = new THREE.Color();
const rgb = (hex: string, lighten = 0): [number, number, number] => {
  colour.set(hex);
  if (lighten) colour.offsetHSL(0, 0, lighten);
  return [colour.r, colour.g, colour.b];
};

/* Each kind's run of greens, dark to light, and how a tree of that kind is
   drawn. Kept a shade or two lighter than the painted wood floor, so the
   crowns stand out of their own shade. */
const TREE_GREENS: Record<TreeKind, [string, string]> = {
  conifer: ['#1c3522', '#2e4d2c'],
  broadleaf: ['#35512a', '#5b7334'],
  birch: ['#5b7a34', '#86994a'],
  poplar: ['#3f5e2c', '#5d7a37'],
  orchard: ['#40602c', '#5f7c38'],
};
const TREE_SHAPE: Record<TreeKind, 'cone' | 'crown' | 'spindle'> = {
  conifer: 'cone', broadleaf: 'crown', birch: 'crown', poplar: 'spindle', orchard: 'crown',
};

export function createScenery(o: SceneryOptions): SceneryHandles {
  const group = new THREE.Group();
  group.name = 'scenery';

  /* The reach of the round world. Trees give way to their paint by four and
     a half kilometres, where one is two or three pixels tall and there are
     thousands of them to a tile; buildings, a couple of hundred to a tile,
     carry on to six; ships, being the size of a street, stay in view as far
     again. */
  const TREE_REACH = o.lowPower ? new THREE.Vector2(2600, 3800) : new THREE.Vector2(3200, 4500);
  const HOUSE_REACH = o.lowPower ? new THREE.Vector2(3600, 4800) : new THREE.Vector2(4500, 6000);
  const SEA_REACH = new THREE.Vector2(7500, 9500);

  const shared = {
    scShift: { value: new THREE.Vector2() },
    scTile: { value: new THREE.Vector2() },
    scHeight: { value: o.height },
    scHeightOffset: { value: new THREE.Vector2() },
    scRelief: { value: 0 },
    scGrid: { value: new THREE.Vector2(o.near.size, o.near.segments) },
    scLevel: { value: 0 },
    scNight: { value: 0 },
    scNightLevel: { value: 0 },
  };
  const landShow = { value: 1 };
  const treeU = { ...shared, scShow: landShow, scReach: { value: TREE_REACH } };
  const houseU = { ...shared, scShow: landShow, scReach: { value: HOUSE_REACH } };
  const seaU = { ...shared, scShow: { value: 0 }, scReach: { value: SEA_REACH } };

  const LAMP = 'vec3( 1.0, 0.72, 0.42 )';
  const treeMat = placedMaterial(treeU, { SC_GROUNDED: '' });
  const houseMat = placedMaterial(houseU, {
    SC_GROUNDED: '', SC_SINK: '6.0', SC_WINDOWS: '', SC_BAY: '3.4', SC_STOREY: '3.1', SC_LAMP: LAMP,
  });
  const boatMat = placedMaterial(seaU, {
    SC_PER_TILE: '', SC_WINDOWS: '', SC_BAY: '2.6', SC_STOREY: '2.8', SC_LAMP: 'vec3( 1.0, 0.86, 0.62 )',
  });

  /* ── Trees ── */
  const treeSets: Record<'cone' | 'crown' | 'spindle', Instances> = { cone: newInstances(), crown: newInstances(), spindle: newInstances() };
  let kept = 0;
  for (const t of o.trees) {
    // A lighter device plants a third of the woods; the painted floor fills in.
    if (o.lowPower && t.kind !== 'poplar' && ((kept++ * 0.618034) % 1) > 0.35) continue;
    const set = treeSets[TREE_SHAPE[t.kind]];
    const [dark, light] = TREE_GREENS[t.kind];
    const c = new THREE.Color(dark).lerp(new THREE.Color(light), t.shade);
    set.spot.push(t.s, t.t, ((t.s * 91.7 + t.t * 57.3) % 1) * 6.283, t.shade);
    set.size.push(t.width, t.height, t.width);
    set.colA.push(c.r, c.g, c.b);
    set.colB.push(c.r, c.g, c.b);
    set.extra.push(0, 1);
  }

  /* ── Buildings ── */
  const blocks = newInstances();
  const houses = newInstances();
  const windows = newLamps();
  const windowDraw = seededRandom(0x3d11a5);
  /* A lit window is warm, mostly; a few are the cold blue of a screen. */
  const WINDOW_TINTS: [number, number, number][] = [[1.6, 1.18, 0.7], [1.6, 1.34, 0.96], [1.6, 1.06, 0.58], [1.15, 1.34, 1.6]];
  for (const b of o.buildings) {
    const set = b.roof === 'flat' ? blocks : houses;
    const seed = (b.s * 7.31 + b.t * 3.17) % 1;
    set.spot.push(b.s, b.t, b.angle, seed);
    set.size.push(b.width, b.height, b.depth);
    set.colA.push(...rgb(b.wallColour));
    set.colB.push(...rgb(b.roofColour));
    set.extra.push(b.lit, 1);
    /* Its lit windows, as points on its walls: more for a bigger, taller,
       busier building, set a little proud of the wall so it hides the ones
       on its far side. */
    const storeys = Math.max(1, Math.floor(b.height / 3.1));
    const count = Math.round(b.lit * Math.min(16, Math.max(2, ((b.width + b.depth) * storeys) / 6)));
    for (let k = 0; k < count; k++) {
      const wall = Math.floor(windowDraw() * 4);
      const along = (windowDraw() - 0.5) * 0.8;
      const y = Math.floor(windowDraw() * storeys) * 3.1 + 1.7;
      const x = wall === 0 ? -b.width / 2 - 0.4 : wall === 1 ? b.width / 2 + 0.4 : along * b.width;
      const z = wall === 2 ? -b.depth / 2 - 0.4 : wall === 3 ? b.depth / 2 + 0.4 : along * b.depth;
      const tint = WINDOW_TINTS[windowDraw() < 0.12 ? 3 : Math.floor(windowDraw() * 3)];
      windows.add([x, y, z], [b.s, b.t, b.angle, seed], tint, 2.2 + windowDraw() * 1.2, 1);
    }
  }

  /* ── Boats ── */
  const kinds: BoatKind[] = ['cargo', 'tanker', 'ferry', 'trawler', 'yacht'];
  const shapes = Object.fromEntries(kinds.map((k) => [k, boatShape(k)])) as Record<BoatKind, BoatShape>;
  const boatSets = Object.fromEntries(kinds.map((k) => [k, newInstances()])) as Record<BoatKind, Instances>;
  const wakes = newInstances();
  const shipLights = newLamps();
  for (const b of o.boats) {
    const shape = shapes[b.kind];
    const set = boatSets[b.kind];
    // The bow is +z; the canvas measures its heading from +s towards +t.
    const yaw = b.heading - Math.PI / 2;
    const scale = 0.88 + b.paint * 0.24;
    set.spot.push(b.s, b.t, yaw, b.seed);
    set.size.push(scale, scale, scale);
    set.colA.push(...rgb(shape.hulls[Math.floor(b.paint * shape.hulls.length) % shape.hulls.length]));
    set.colB.push(...rgb(shape.trims[Math.floor(b.paint * 7.3) % shape.trims.length]));
    set.extra.push(0.35 + b.paint * 0.4, shape.odds);
    /* The wake runs back several lengths from the stern. It shares its
       boat's place and draw exactly — only its own frame is set back half a
       hull — so the two can never part company at a tile's edge. */
    wakes.spot.push(b.s, b.t, yaw, b.seed);
    wakes.size.push(shape.beam * 1.6 * scale, 1, shape.length * shape.wake * scale);
    wakes.colA.push(1, 1, 1);
    wakes.colB.push(1, 1, 1);
    wakes.extra.push((shape.length / 2) * scale, shape.odds);
    for (const [x, y, z, r, g, bl, px] of shape.lights) {
      shipLights.add([x * scale, y * scale, z * scale], [b.s, b.t, yaw, b.seed], [r, g, bl], px, shape.odds);
    }
  }

  /* Foam: unlit, so it is dimmed by hand after dark, and half a metre over
     the water it lies on — far clear of any doubt about which is in front. */
  const wakeGeo = wakeShape();
  const wakeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const wakeU = { ...seaU, scWakeWhite: { value: 1 } };
  wakeMat.defines = { SC_PER_TILE: '', SC_STERN: '' };
  wakeMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wakeU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PLACE_PARS}\nuniform float scWakeWhite;`)
      // After the placing, since here the colour is worked out before the position is.
      .replace('#include <begin_vertex>', `${PLACE}\n${PLACE_VERTEX}\ntransformed.y += 0.5;\nvColor.rgb *= scWakeWhite;\nvColor.a *= step( 0.001, scAlive );`);
  };

  /* The lights: windows in the towns and farms, and on the ships red to
     port and green to starboard, white at the masthead and the stern, and
     the working lights of a trawler's deck. */
  const lightTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const shipLightMat = lampMaterial(seaU, lightTex, { SC_PER_TILE: '' });
  const windowMat = lampMaterial(houseU, lightTex, { SC_GROUNDED: '' });
  const shipLightGeo = shipLights.geometry();
  const windowGeo = windows.geometry();

  /* ── The copies ──────────────────────────────────────────────────────
     A mesh per shape for every copy of the tile within reach. The props
     wrap to the nearest copy themselves; these only say which copy. */
  const meshes: { mesh: THREE.Object3D; sea: boolean }[] = [];
  const copies = (reach: number) => {
    const out: [number, number][] = [];
    const k = Math.ceil(reach / TILE);
    for (let kz = -k; kz <= k; kz++) {
      for (let kx = -k; kx <= k; kx++) {
        const nx = Math.max(0, Math.abs(kx) * TILE - TILE / 2);
        const nz = Math.max(0, Math.abs(kz) * TILE - TILE / 2);
        if (Math.hypot(nx, nz) < reach) out.push([kx, kz]);
      }
    }
    return out;
  };
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, reach: THREE.Vector2, sea: boolean, points = false, order = 0) => {
    if ((geo as THREE.InstancedBufferGeometry).instanceCount === 0) return;
    for (const [kx, kz] of copies(reach.y)) {
      const mesh = points ? new THREE.Points(geo, mat) : new THREE.Mesh(geo, mat);
      mesh.position.set(kx * TILE, 0, kz * TILE);
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push({ mesh, sea });
    }
  };
  const geometries: THREE.BufferGeometry[] = [];
  const shapeOf = { cone: coneShape(), crown: crownShape(), spindle: spindleShape() };
  for (const key of ['cone', 'crown', 'spindle'] as const) {
    const geo = instanced(shapeOf[key], treeSets[key]);
    geometries.push(geo, shapeOf[key]);
    place(geo, treeMat, TREE_REACH, false);
  }
  const blockShapeGeo = blockShape();
  const houseShapeGeo = houseShape();
  const blockGeo = instanced(blockShapeGeo, blocks);
  const houseGeo = instanced(houseShapeGeo, houses);
  geometries.push(blockGeo, houseGeo, blockShapeGeo, houseShapeGeo);
  place(blockGeo, houseMat, HOUSE_REACH, false);
  place(houseGeo, houseMat, HOUSE_REACH, false);
  for (const k of kinds) {
    const geo = instanced(shapes[k].geometry, boatSets[k]);
    geometries.push(geo, shapes[k].geometry);
    place(geo, boatMat, SEA_REACH, true);
  }
  const wakeInst = instanced(wakeGeo, wakes);
  geometries.push(wakeInst, wakeGeo, shipLightGeo, windowGeo);
  place(wakeInst, wakeMat, SEA_REACH, true, false, o.overlayOrder + 0.02);
  place(shipLightGeo, shipLightMat, SEA_REACH, true, true, o.overlayOrder + 0.03);
  place(windowGeo, windowMat, HOUSE_REACH, false, true, o.overlayOrder + 0.03);

  const update = (f: SceneryFrame) => {
    const landOn = f.land > 0.001;
    const seaOn = f.sea > 0.001;
    group.visible = landOn || seaOn;
    if (!group.visible) return;
    for (const { mesh, sea } of meshes) mesh.visible = sea ? seaOn : landOn;
    // The shift, reduced to the tile in double precision, so the props never lose their place.
    const tx = Math.floor(f.shiftX / TILE);
    const tz = Math.floor(f.shiftZ / TILE);
    shared.scShift.value.set(f.shiftX - tx * TILE, f.shiftZ - tz * TILE);
    shared.scTile.value.set(tx, -tz);
    shared.scHeightOffset.value.set(f.heightOffset.x - Math.floor(f.heightOffset.x), f.heightOffset.y - Math.floor(f.heightOffset.y));
    shared.scRelief.value = f.relief;
    shared.scLevel.value = f.seaLevel;
    shared.scNight.value = f.night;
    shared.scNightLevel.value = f.night;
    landShow.value = f.land;
    seaU.scShow.value = f.sea;
    wakeU.scWakeWhite.value = 0.06 + 0.94 * f.day;
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of [treeMat, houseMat, boatMat, wakeMat, shipLightMat, windowMat]) m.dispose();
    lightTex.dispose();
  };

  return { group, update, dispose };
}
