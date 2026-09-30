import * as THREE from 'three';
import { PASSENGER_MESH } from './passengerMesh';
import {
  PART,
  Builder,
  addPalettes,
  blob,
  cavity,
  figureMaterial,
  strandTexture,
  touchPalettes,
  tube,
  v3,
  writePalette,
  type Occluder,
  type Palette,
  type V3,
  type Wall,
} from './figures';

/**
 * The passengers: a hundred and eighty people from one seated body.
 *
 * The body is a real model — a man sitting with his hands on his knees,
 * lifted out of his wheelchair by `scripts/passenger-mesh.py` and sat back in
 * an airline seat. Here it is smoothed (Loop subdivision, more of it for the
 * rows near the viewer), dressed — short sleeves or long, in whatever colours
 * the passenger is wearing — and finished: eyes, brows and lips painted on
 * the sculpted face, and one of seven haircuts fitted over the skull.
 * Everybody wears their own palette, turns their head their own way and is a
 * little bigger or smaller than the next person, so the cabin reads as a
 * crowd rather than a mould.
 */

/* ── The body, unpacked ──────────────────────────────────────────────── */

const KIND = { shirt: 0, trousers: 1, shoes: 2, skin: 3, vest: 4, buttons: 5, head: 6 } as const;

interface Piece {
  kind: number;
  pos: number[];
  /** Distance to the fingertips on that side, for telling a hand from a sleeve. */
  tip: number[];
  index: number[];
}

let unpacked: Piece[] | null = null;

function unpack(): Piece[] {
  if (unpacked) return unpacked;
  const m = PASSENGER_MESH;
  const bin = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0));
  const dv = new DataView(bin.buffer);
  const n = m.vertices;
  const at = (i: number, k: number) => m.min[k] + (dv.getUint16((i * 3 + k) * 2, true) / 65535) * m.span[k];
  const faces = n * 7;
  unpacked = m.parts.map(([kind, first, count, triangles], p) => {
    const firstTri = m.parts.slice(0, p).reduce((s, q) => s + q[3], 0);
    const pos: number[] = [];
    const tip: number[] = [];
    for (let i = 0; i < count; i++) {
      pos.push(at(first + i, 0), at(first + i, 1), at(first + i, 2));
      tip.push(bin[n * 6 + first + i] * 0.004);
    }
    const index: number[] = [];
    for (let t = 0; t < triangles * 3; t++) index.push(dv.getUint16(faces + (firstTri * 3 + t) * 2, true) - first);
    return weld({ kind, pos, tip, index });
  });
  return unpacked;
}

/** Merge vertices that sit on top of each other, so smoothing does not open seams. */
function weld(p: Piece): Piece {
  const key = new Map<string, number>();
  const map: number[] = [];
  const pos: number[] = [];
  const tip: number[] = [];
  for (let i = 0; i < p.pos.length / 3; i++) {
    const k = `${Math.round(p.pos[i * 3] * 1e5)},${Math.round(p.pos[i * 3 + 1] * 1e5)},${Math.round(p.pos[i * 3 + 2] * 1e5)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      key.set(k, j);
      pos.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      tip.push(p.tip[i]);
    }
    map.push(j);
  }
  const index: number[] = [];
  for (let t = 0; t < p.index.length; t += 3) {
    const a = map[p.index[t]], b = map[p.index[t + 1]], c = map[p.index[t + 2]];
    if (a !== b && b !== c && a !== c) index.push(a, b, c);
  }
  return { kind: p.kind, pos, tip, index };
}

/**
 * One round of Loop subdivision: every triangle into four, every vertex
 * pulled toward its neighbours. The model is faceted — built to be seen
 * across a room — and this is what makes a shoulder round and a knuckle a
 * knuckle. Open edges (a sleeve's hem, a collar) are kept as creases so they
 * do not shrink away.
 */
function subdivide(p: Piece): Piece {
  const n = p.pos.length / 3;
  const edges = new Map<number, { v: number; opp: number[] }>();
  const nbrs: Set<number>[] = Array.from({ length: n }, () => new Set());
  const pos = p.pos.slice();
  const tip = p.tip.slice();
  const edge = (a: number, b: number, opp: number) => {
    const k = Math.min(a, b) * n + Math.max(a, b);
    let e = edges.get(k);
    if (!e) {
      e = { v: -1, opp: [] };
      edges.set(k, e);
    }
    e.opp.push(opp);
    nbrs[a].add(b);
    nbrs[b].add(a);
    return k;
  };
  const tris: number[][] = [];
  for (let t = 0; t < p.index.length; t += 3) {
    const [a, b, c] = [p.index[t], p.index[t + 1], p.index[t + 2]];
    tris.push([a, b, c, edge(a, b, c), edge(b, c, a), edge(c, a, b)]);
  }
  // Where the open edges are: those with only one triangle on them.
  const rim: number[][] = Array.from({ length: n }, () => []);
  for (const [k, e] of edges) {
    if (e.opp.length === 1) {
      const a = Math.floor(k / n), b = k % n;
      rim[a].push(b);
      rim[b].push(a);
    }
  }
  // New points on the edges.
  for (const [k, e] of edges) {
    const a = Math.floor(k / n), b = k % n;
    const w = e.opp.length === 2 ? [0.375, 0.375, 0.125, 0.125] : [0.5, 0.5, 0, 0];
    const src = e.opp.length === 2 ? [a, b, e.opp[0], e.opp[1]] : [a, b, a, b];
    e.v = pos.length / 3;
    for (let d = 0; d < 3; d++) pos.push(src.reduce((s, v, i) => s + p.pos[v * 3 + d] * w[i], 0));
    tip.push((p.tip[a] + p.tip[b]) / 2);
  }
  // And the old points, moved.
  for (let v = 0; v < n; v++) {
    if (rim[v].length >= 2) {
      const [a, b] = rim[v];
      for (let d = 0; d < 3; d++) pos[v * 3 + d] = 0.75 * p.pos[v * 3 + d] + 0.125 * (p.pos[a * 3 + d] + p.pos[b * 3 + d]);
      continue;
    }
    if (rim[v].length === 1) continue;
    const k = nbrs[v].size;
    if (k < 3) continue;
    const beta = k > 3 ? 3 / (8 * k) : 3 / 16;
    for (let d = 0; d < 3; d++) {
      let sum = 0;
      for (const u of nbrs[v]) sum += p.pos[u * 3 + d];
      pos[v * 3 + d] = (1 - k * beta) * p.pos[v * 3 + d] + beta * sum;
    }
  }
  const index: number[] = [];
  for (const [a, b, c, ab, bc, ca] of tris) {
    const eab = edges.get(ab)!.v, ebc = edges.get(bc)!.v, eca = edges.get(ca)!.v;
    index.push(a, eab, eca, b, ebc, eab, c, eca, ebc, eab, ebc, eca);
  }
  return { kind: p.kind, pos, tip, index };
}

function normals(pos: number[], index: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const out = Array.from(g.getAttribute('normal').array as Float32Array);
  g.dispose();
  return out;
}

/* ── Levels of detail, and builds ────────────────────────────────────── */

/**
 * How finely each distance is drawn. The row a passenger sits in and the
 * row ahead of it are close enough to count eyelashes, so they get the body
 * and head smoothed and hair with strand cards; everyone else is the model
 * as it came with a plain shell of hair — which from a few rows back, over a
 * seat back, is all anyone sees, and on a phone is the difference between a
 * cabin that turns smoothly and one that stutters. (The middle level is
 * kept in the table for the lookup's sake and never built.)
 */
const DETAIL = [
  { head: 1, body: 1, cols: 48, rows: 14, cards: 170 },
  { head: 0, body: 0, cols: 20, rows: 7, cards: 0 },
  { head: 0, body: 0, cols: 16, rows: 6, cards: 0 },
] as const;
type Detail = 0 | 1 | 2;

/** Two builds from one man: his own, and narrower through the shoulders and waist, fuller at the chest and hips. */
export type Build = 'm' | 'f';

const bump = (v: number, c: number, w: number) => Math.exp(-(((v - c) / w) ** 2));

/**
 * Reshape the base body for the second build. Everything is moved about his
 * middle; the hands stay where they are, on the knees.
 */
function feminise(p: Piece): Piece {
  const pos = p.pos.slice();
  const nrm = normals(p.pos, p.index);
  const torso = p.kind === KIND.shirt || p.kind === KIND.vest || p.kind === KIND.buttons;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const tip = p.tip[i / 3];
    let sx = 1;
    // Shoulders and upper arms in, fading out down the arm toward the hands.
    const arm = p.kind === KIND.skin ? THREE.MathUtils.smoothstep(tip, 0.25, 0.5) : 1;
    sx *= 1 - 0.1 * THREE.MathUtils.smoothstep(y, 0.3, 0.5) * arm;
    // The waist in, the hips out.
    if (p.kind !== KIND.skin) {
      sx *= 1 - 0.08 * bump(y, 0.27, 0.07);
      if (z > -0.2) sx *= 1 + 0.05 * bump(y, 0.06, 0.07);
    }
    pos[i] = x * sx;
    if (torso) {
      // A bust, on the front of the shirt.
      const front = Math.max(0, -nrm[i + 2]);
      pos[i + 2] = z - 0.026 * front * bump(y, 0.41, 0.055) * bump(Math.abs(x), 0.058, 0.045);
    }
    if (p.kind === KIND.head) {
      const ry = y - HEAD_AT.y, rz = z - HEAD_AT.z;
      // A narrower jaw, a softer brow, a smaller nose, a slimmer neck.
      pos[i] = x * (1 - 0.1 * THREE.MathUtils.smoothstep(-ry, 0.03, 0.1));
      if (rz < -0.06) pos[i + 2] = z + 0.004 * bump(ry, 0.017, 0.012);
      const nose = bump(x, 0, 0.018) * bump(ry, -0.022, 0.02) * THREE.MathUtils.smoothstep(-rz, 0.085, 0.11);
      pos[i + 2] += 0.006 * nose;
      if (y < NECK.y + 0.03) {
        const k = 1 - 0.1 * THREE.MathUtils.smoothstep(NECK.y + 0.03 - y, 0, 0.04);
        pos[i] = NECK.x + (pos[i] - NECK.x) * k;
        pos[i + 2] = NECK.z + (pos[i + 2] - NECK.z) * k;
      }
    }
  }
  return { ...p, pos };
}

const pieceCache = new Map<string, Piece[]>();

/** The body's pieces, in a build, smoothed `level` times. */
function pieces(build: Build, level: number): Piece[] {
  const key = `${build}${level}`;
  let out = pieceCache.get(key);
  if (!out) {
    out = unpack().map((p) => {
      let q = build === 'f' ? feminise(p) : p;
      for (let k = 0; k < level; k++) q = subdivide(q);
      return q;
    });
    pieceCache.set(key, out);
  }
  return out;
}

/* ── Where things are on him ─────────────────────────────────────────── */

const EYES = PASSENGER_MESH.eyes;
/**
 * The head's own origin, in the body's frame: level with the eyes, midway
 * between them, and halfway back through the skull. Haircuts are drawn
 * about it and the face is painted from it.
 */
const HEAD_AT = v3((EYES[0][0] + EYES[1][0]) / 2, (EYES[0][1] + EYES[1][1]) / 2, PASSENGER_MESH.head[2]);
/** The head turns about the base of the neck, where it meets the collar. */
const NECK = v3(HEAD_AT.x, 0.56, -0.075);
const HEAD_FROM_NECK = HEAD_AT.clone().sub(NECK);
/** The face is painted for eyes 62 mm apart and a mouth 70 mm under them; this head's are 54 and 57. */
const FACE_SCALE = v3(0.031 / (Math.abs(EYES[1][0] - EYES[0][0]) / 2), 0.0705 / 0.057, 1);

const GROUP = { torso: 0, armL: 1, armR: 2, legL: 3, legR: 4, feet: 5, head: 6 } as const;

/* Stand-ins for the body, for the occlusion. Measured off the model. */
const BODY_OCCLUDERS: Occluder[] = [
  { a: v3(0, 0.12, 0.03), b: v3(0, 0.4, 0.05), r: 0.15, group: GROUP.torso },
  { a: v3(0, 0.62, -0.1), b: v3(0, 0.72, -0.1), r: 0.09, group: GROUP.head },
  ...([-1, 1] as const).flatMap((s) => [
    { a: v3(s * 0.19, 0.45, 0.06), b: v3(s * 0.22, 0.22, 0.02), r: 0.05, group: s > 0 ? GROUP.armL : GROUP.armR },
    { a: v3(s * 0.22, 0.22, 0.02), b: v3(s * 0.16, 0.17, -0.3), r: 0.042, group: s > 0 ? GROUP.armL : GROUP.armR },
    { a: v3(s * 0.1, 0.08, 0.0), b: v3(s * 0.13, 0.1, -0.42), r: 0.075, group: s > 0 ? GROUP.legL : GROUP.legR },
    { a: v3(s * 0.13, 0.05, -0.46), b: v3(s * 0.13, -0.4, -0.5), r: 0.055, group: s > 0 ? GROUP.legL : GROUP.legR },
  ]),
];

/** The seat he is in: the cushion under him and the back behind him. */
const SEAT_WALLS: Wall[] = [
  { point: v3(0, 0, 0), normal: v3(0, 1, 0), reach: 0.12, strength: 0.5 },
  { point: v3(0, 0.25, 0.13), normal: v3(0, 0.12, -0.99).normalize(), reach: 0.18, strength: 0.55 },
  { point: v3(0, -0.5, 0), normal: v3(0, 1, 0), reach: 0.08, strength: 0.6 },
];

export type Sleeves = 'short' | 'long';

/**
 * The body in one of its outfits. Long sleeves are the arms, dressed: a
 * little fuller than the skin under them, and ending in a cuff at the wrist.
 */
function bodyGeometry(build: Build, sleeves: Sleeves, detail: Detail): THREE.BufferGeometry {
  const b = new Builder();
  for (const smooth of pieces(build, DETAIL[detail].body)) {
    if (smooth.kind === KIND.head) continue;
    const source = smooth;
    const piece = { ...smooth, pos: smooth.pos.slice() };
    let nrm = normals(piece.pos, piece.index);
    const nv = piece.pos.length / 3;
    if (source.kind === KIND.skin && sleeves === 'long') {
      // Cloth stands off the arm, and more so the further up it goes, until
      // it meets the shirt's own sleeve at the shoulder.
      for (let i = 0; i < nv; i++) {
        const t = THREE.MathUtils.smoothstep(piece.tip[i], 0.19, 0.24);
        const up = THREE.MathUtils.smoothstep(piece.tip[i], 0.4, 0.62);
        for (let d = 0; d < 3; d++) piece.pos[i * 3 + d] += nrm[i * 3 + d] * (0.006 + 0.012 * up) * t;
      }
      nrm = normals(piece.pos, piece.index);
    }
    const partOf = (i: number): [number, number, number] => {
      switch (source.kind) {
        case KIND.shirt: return [PART.top, PART.top, 0];
        case KIND.trousers: return [PART.bottom, PART.bottom, 0];
        case KIND.shoes: return [PART.shoes, PART.shoes, 0];
        case KIND.vest: return [PART.inner, PART.inner, 0];
        case KIND.buttons: return [PART.accent, PART.accent, 0];
        default:
          // Skin, or a sleeve over it: the mask crosses a half at the wrist.
          return sleeves === 'long' ? [PART.skin, PART.top, 0.5 + (piece.tip[i] - 0.19) * 60] : [PART.skin, PART.skin, 0];
      }
    };
    const groupOf = (i: number) => {
      const x = piece.pos[i * 3];
      if (source.kind === KIND.skin) return x > 0 ? GROUP.armL : GROUP.armR;
      if (source.kind === KIND.trousers) return x > 0 ? GROUP.legL : GROUP.legR;
      if (source.kind === KIND.shoes) return GROUP.feet;
      return GROUP.torso;
    };
    b.mesh(piece.pos, nrm, piece.index, partOf, groupOf, cavity(piece.pos, piece.index, nrm));
  }
  b.occlude(BODY_OCCLUDERS, SEAT_WALLS);
  return b.geometry();
}

/* ── The head ────────────────────────────────────────────────────────── */

function headGeometry(build: Build, detail: Detail): THREE.BufferGeometry {
  const b = new Builder();
  const piece = pieces(build, DETAIL[detail].head).find((p) => p.kind === KIND.head)!;
  const nrm = normals(piece.pos, piece.index);
  const ao = cavity(piece.pos, piece.index, nrm, 3);
  // Into the neck's frame, so the head turns about the base of the neck.
  const pos = piece.pos.map((v, i) => v - NECK.getComponent(i % 3));
  b.mesh(pos, nrm, piece.index, () => [PART.face, PART.face, 0], () => GROUP.head, ao);
  /* The model's neck stops at his collar. This carries it on down inside
     the shirt, so a head turned to look out of the window never opens a gap. */
  tube(b, [v3(0, 0.0, -0.012), v3(0, -0.06, 0.0), v3(0, -0.12, 0.02)], () => [0.047, 0.05], { part: PART.skin, group: GROUP.head }, {
    seg: 12,
    steps: 4,
    up: v3(0, 0, -1),
  });
  const shoulders: Occluder = { a: v3(-0.15, -0.03, 0.03), b: v3(0.15, -0.03, 0.03), r: 0.07, group: GROUP.torso };
  b.occlude([shoulders]);
  return b.geometry();
}

/**
 * The skull, as a radius by direction from the head's origin, for fitting
 * hair to. Read once by casting rays at the model's head and kept as a map,
 * so that seven haircuts at two levels of detail cost a lookup a point.
 */
class Skull {
  private readonly cols = 96;
  private readonly rows = 48;
  private readonly r: Float32Array;
  private readonly n: Float32Array;

  constructor() {
    const source = unpack().find((p) => p.kind === KIND.head)!;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(source.pos.map((v, i) => v - HEAD_AT.getComponent(i % 3)), 3));
    g.setIndex(source.index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const tri = new THREE.Triangle();
    const bary = v3();
    const na = v3(), nb = v3(), nc = v3();
    this.r = new Float32Array((this.rows + 1) * this.cols);
    this.n = new Float32Array((this.rows + 1) * this.cols * 3);
    const d = v3();
    for (let i = 0; i <= this.rows; i++) {
      const lat = -Math.PI / 2 + (i / this.rows) * Math.PI;
      for (let j = 0; j < this.cols; j++) {
        const lon = -Math.PI + (j / this.cols) * Math.PI * 2;
        d.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat));
        ray.set(v3(), d);
        const hit = ray.intersectObject(mesh)[0];
        const k = i * this.cols + j;
        if (!hit?.face) {
          // Straight down the neck: nothing there, and no hair goes there.
          this.r[k] = 0.06;
          this.n.set([d.x, d.y, d.z], k * 3);
          continue;
        }
        this.r[k] = hit.distance;
        const { a, b, c } = hit.face;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        tri.set(v3().fromBufferAttribute(pos, a), v3().fromBufferAttribute(pos, b), v3().fromBufferAttribute(pos, c));
        tri.getBarycoord(hit.point, bary);
        na.fromBufferAttribute(nrm, a).multiplyScalar(bary.x);
        nb.fromBufferAttribute(nrm, b).multiplyScalar(bary.y);
        nc.fromBufferAttribute(nrm, c).multiplyScalar(bary.z);
        const n = na.add(nb).add(nc).normalize();
        // From inside, the normal can come back facing in: face it out.
        if (n.dot(d) < 0) n.negate();
        this.n.set([n.x, n.y, n.z], k * 3);
      }
    }
    g.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  /** The surface point in direction `d`, and its normal. */
  at(d: V3) {
    const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const lon = Math.atan2(d.x, -d.z);
    const fi = THREE.MathUtils.clamp(((lat + Math.PI / 2) / Math.PI) * this.rows, 0, this.rows - 1e-6);
    const fj = ((lon + Math.PI) / (Math.PI * 2)) * this.cols;
    const i0 = Math.floor(fi), ti = fi - i0;
    const j0 = Math.floor(fj), tj = fj - j0;
    let r = 0;
    const n = v3();
    for (const [di, dj, w] of [[0, 0, (1 - ti) * (1 - tj)], [0, 1, (1 - ti) * tj], [1, 0, ti * (1 - tj)], [1, 1, ti * tj]]) {
      const k = Math.min(this.rows, i0 + di) * this.cols + ((j0 + dj) % this.cols + this.cols) % this.cols;
      r += this.r[k] * w;
      n.x += this.n[k * 3] * w;
      n.y += this.n[k * 3 + 1] * w;
      n.z += this.n[k * 3 + 2] * w;
    }
    return { p: d.clone().multiplyScalar(r), n: n.normalize() };
  }
}

let skull: Skull | null = null;

/* ── Hair ────────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;

/** A smooth curve through (azimuth in degrees, value) pairs, by |azimuth|; values in `unit`s. */
const table = (pts: [number, number][], unit = DEG) => (az: number) => {
  const a = Math.abs(az) / DEG;
  for (let i = 1; i < pts.length; i++) {
    if (a <= pts[i][0]) {
      const [a0, v0] = pts[i - 1];
      const [a1, v1] = pts[i];
      const t = (a - a0) / (a1 - a0);
      return (v0 + (v1 - v0) * (t * t * (3 - 2 * t))) * unit;
    }
  }
  return pts[pts.length - 1][1] * unit;
};

export type Surface = (d: V3) => { p: V3; n: V3 };

export interface HairStyle {
  /** Where the strands radiate from: the crown, the front, a bun. */
  pole: V3;
  /** The lowest the hair comes, as an elevation, by azimuth (0 is the face). */
  hairline: (az: number) => number;
  /** The highest, for a crown that has gone. */
  top?: (az: number) => number;
  thick: (el: number, az: number) => number;
  /** How far below eye level hair hangs, in metres, where it does. */
  hang?: (az: number) => number;
  bun?: boolean;
  /** Cloth rather than hair: no locks, no ragged ends. */
  smooth?: boolean;
  /** How far the edge round the face is brought forward past it — a hood's brim. */
  brim?: number;
}

const SHORT_LINE = table([
  [0, 36], [30, 33], [50, 24], [68, 4], [80, -14], [88, -6], [95, 8], [110, 6], [125, -14], [150, -32], [180, -40],
]);
const FACE_OPENING = table([[0, 33], [34, 29], [50, 8], [62, -90], [180, -90]]);
const BUN_DIR = v3(0, Math.sin(26 * DEG), Math.cos(26 * DEG));

export const HAIR_STYLES = {
  crop: {
    pole: v3(0, 0.93, 0.36),
    hairline: SHORT_LINE,
    thick: (el: number, az: number) => 0.006 + 0.011 * THREE.MathUtils.smoothstep(el, 0, 1.2) * (1 + 0.18 * Math.sin(az * 5 + el * 3)),
  },
  buzz: {
    pole: v3(0, 0.93, 0.36),
    hairline: SHORT_LINE,
    thick: () => 0.0032,
  },
  slick: {
    pole: v3(0, 0.62, -0.78),
    hairline: SHORT_LINE,
    thick: (el: number, az: number) => 0.005 + 0.012 * THREE.MathUtils.smoothstep(el, 0.2, 1.2) * THREE.MathUtils.smoothstep(Math.cos(az), -0.6, 0.8),
  },
  receding: {
    pole: v3(0, 1, 0),
    hairline: SHORT_LINE,
    top: table([[0, -90], [62, -90], [78, 6], [95, 20], [130, 30], [180, 34]]),
    thick: () => 0.005,
  },
  bun: {
    pole: BUN_DIR,
    hairline: table([[0, 38], [35, 30], [60, 12], [80, -2], [95, 4], [120, -10], [150, -28], [180, -34]]),
    thick: () => 0.0055,
    bun: true,
  },
  bob: {
    pole: v3(0, 0.93, 0.36),
    hairline: table([[0, 16], [28, 18], [46, 8], [60, -90], [180, -90]]),
    thick: (el: number) => 0.01 + 0.006 * THREE.MathUtils.smoothstep(el, -0.4, 0.8),
    hang: table([[0, 90], [60, 90], [90, 94], [180, 104]], 0.001),
  },
  long: {
    pole: v3(0, 0.93, 0.36),
    hairline: FACE_OPENING,
    thick: () => 0.011,
    hang: table([[0, 170], [60, 170], [100, 175], [180, 185]], 0.001),
  },
} satisfies Record<string, HairStyle>;

export type HairName = keyof typeof HAIR_STYLES;

function hairGeometry(style: HairStyle, detail: Detail): THREE.BufferGeometry {
  const b = new Builder();
  const map = (skull ??= new Skull());
  const { cols, rows, cards } = DETAIL[detail];
  hairLayer(b, (d) => map.at(d), style, { cols, rows, cards, part: PART.hair });
  for (let i = 0; i < b.pos.length; i += 3) {
    b.pos[i] += HEAD_FROM_NECK.x;
    b.pos[i + 1] += HEAD_FROM_NECK.y;
    b.pos[i + 2] += HEAD_FROM_NECK.z;
  }
  return b.geometry();
}

/**
 * Lay a haircut — or a hood — over a head. Lines run out from the style's
 * pole across `surface` until they reach its hairline, then, where the style
 * hangs, straight down from where the head turns under. Built in the head's
 * own frame: eyes at y = 0, face toward −z.
 */
export function hairLayer(
  b: Builder,
  surface: Surface,
  style: HairStyle,
  o: { cols: number; rows: number; cards: number; part: number },
) {
  const { cols, rows, cards } = o;
  const P = style.pole.clone().normalize();
  const F = v3(0, 0, -1).addScaledVector(P, P.z).normalize();
  if (F.lengthSq() < 0.5) F.set(0, 1, 0).addScaledVector(P, -P.y).normalize();
  const S = v3().crossVectors(P, F);
  const dir = (phi: number, psi: number) =>
    P.clone().multiplyScalar(Math.cos(phi))
      .addScaledVector(F, Math.sin(phi) * Math.cos(psi))
      .addScaledVector(S, Math.sin(phi) * Math.sin(psi));
  const elev = (d: V3) => Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  const azim = (d: V3) => Math.atan2(d.x, -d.z);
  const covered = (d: V3) => {
    const el = elev(d), az = azim(d);
    return el > style.hairline(az) && (!style.top || el < style.top(az));
  };

  const pts: V3[][] = [];
  const nrm: V3[][] = [];
  for (let j = 0; j < cols; j++) {
    const psi = (j / cols) * Math.PI * 2;
    // Where this line of hair starts and stops.
    const STEPS = 160;
    let start = -1, end = Math.PI;
    for (let k = 0; k <= STEPS; k++) {
      const phi = (k / STEPS) * Math.PI;
      const on = covered(dir(phi, psi));
      if (on && start < 0) start = phi;
      if (!on && start >= 0) { end = phi; break; }
    }
    const path: { p: V3; n: V3 }[] = [];
    if (start < 0) {
      // No hair on this line at all: a thread of zero width at the crown.
      const at = surface(dir(0, psi));
      for (let k = 0; k <= rows; k++) path.push(at);
    } else {
      const SAMPLES = 48;
      let drop: { p: V3; n: V3; az: number } | null = null;
      for (let k = 0; k <= SAMPLES; k++) {
        const phi = start + ((end - start) * k) / SAMPLES;
        const d = dir(phi, psi);
        const { p: s, n } = surface(d);
        const el = elev(d), az = azim(d);
        // Thin to nothing at the edges, so a hairline is a hairline and not a helmet's rim.
        const u = k / SAMPLES;
        const fade = Math.min(1, u / 0.1 + (style.top ? 0 : 1), (1 - u) / 0.14);
        // Locks: the surface rises and falls across the strands, so it is
        // hair and not a helmet.
        const lock = style.smooth ? 1 : 1 + 0.22 * Math.sin(psi * 19 + phi * 2.3) + 0.12 * Math.sin(psi * 43 + 1.7);
        const t = style.thick(el, az) * lock * Math.max(0.12, THREE.MathUtils.smoothstep(fade, 0, 1));
        const p = s.clone().addScaledVector(n, t + 0.0012);
        path.push({ p, n: n.clone() });
        // Long hair leaves the skull where the skull turns under.
        if (style.hang && n.y < 0.12 && style.hang(az) > 0 && el < 0.3) {
          drop = { p, n: n.clone(), az };
          break;
        }
      }
      if (drop && style.hang) {
        // Uneven ends: no two locks are cut to quite the same length.
        const tipY = -style.hang(drop.az) + (style.smooth ? 0 : 0.012 * Math.sin(psi * 17) + 0.008 * Math.sin(psi * 41 + 2));
        const out = v3(drop.p.x, 0, drop.p.z).normalize();
        const HANG = 16;
        for (let k = 1; k <= HANG; k++) {
          const t = k / HANG;
          const y = THREE.MathUtils.lerp(drop.p.y, tipY, t);
          const fall = drop.p.y - y;
          // Straight down, easing in under the jaw and out again at the ends.
          const p = v3(drop.p.x, y, drop.p.z).addScaledVector(
            out,
            style.smooth ? fall * 0.55 * t : fall * (0.14 * t * t - 0.05 * Math.sin(t * Math.PI)) + 0.003 * Math.sin(t * 7 + psi * 3),
          );
          path.push({ p, n: out.clone().setY(0.2).normalize() });
        }
      }
    }
    if (style.brim && path.length > 1) {
      const face = Math.max(0, Math.cos(azim(path[path.length - 1].p)));
      for (let k = 0; k < path.length; k++) {
        const t = k / (path.length - 1);
        path[k].p.z -= style.brim * face * THREE.MathUtils.smoothstep(t, 0.6, 1) ** 1.5;
      }
    }
    // Even out the rows along the line.
    const len: number[] = [0];
    for (let k = 1; k < path.length; k++) len.push(len[k - 1] + path[k].p.distanceTo(path[k - 1].p));
    const total = len[len.length - 1] || 1;
    const col: V3[] = [];
    const cn: V3[] = [];
    let k = 0;
    for (let r = 0; r <= rows; r++) {
      const want = (r / rows) * total;
      while (k < len.length - 2 && len[k + 1] < want) k++;
      const t = THREE.MathUtils.clamp((want - len[k]) / Math.max(1e-9, len[k + 1] - len[k]), 0, 1);
      const a = path[k], c = path[Math.min(k + 1, path.length - 1)];
      col.push(a.p.clone().lerp(c.p, t));
      cn.push(a.n.clone().lerp(c.n, t).normalize());
    }
    pts.push(col);
    nrm.push(cn);
  }
  // Columns round the pole are the sheet's rows here; transpose to rows along the hair.
  const grid: V3[][] = [];
  const gridN: V3[][] = [];
  for (let r = 0; r <= rows; r++) {
    grid.push(pts.map((c) => c[r]));
    gridN.push(nrm.map((c) => c[r]));
  }
  b.sheet(grid, { part: o.part, group: GROUP.head }, {
    wrap: true,
    normals: gridN,
    inside: () => v3(),
    uvs: (i, j) => [j / cols, i / rows],
  });

  /* Strand cards: ribbons laid along the shell the way the hair runs, each
     lifting a little off it toward its tip and cut into strands by the
     texture. They are what turns a shell into hair — a broken outline, ends
     that are ends, light getting between the locks. */
  let seed = 11 + cols;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const across = v3();
  const along = v3();
  for (let c = 0; c < cards; c++) {
    const jf = rand() * cols;
    const j = Math.floor(jf), f = jf - j;
    const j2 = (j + 1) % cols;
    // Not from the crown itself, where every line meets and a card has no width to lie along.
    const start = 2 + Math.floor(rand() * rows * 0.42);
    const end = Math.min(rows, start + Math.max(3, Math.round((rows - start) * (0.55 + rand() * 0.45))));
    if (pts[j][start].distanceTo(pts[j][end]) < 0.01) continue;
    const width = 0.007 + rand() * 0.007;
    const lift = 0.0015 + rand() * 0.004;
    const u0 = rand();
    const strip: V3[][] = [];
    const stripN: V3[][] = [];
    for (let r = start; r <= end; r++) {
      const t = (r - start) / (end - start);
      const p = pts[j][r].clone().lerp(pts[j2][r], f);
      const n = nrm[j][r].clone().lerp(nrm[j2][r], f).normalize();
      along.copy(pts[j][Math.min(end, r + 1)]).sub(pts[j][Math.max(start, r - 1)]).normalize();
      across.crossVectors(n, along).normalize();
      p.addScaledVector(n, lift * (0.4 + t));
      const half = (width / 2) * (1 - 0.55 * t);
      strip.push([p.clone().addScaledVector(across, -half), p.clone().addScaledVector(across, half)]);
      stripN.push([n, n]);
    }
    b.sheet(strip, { part: PART.strands, group: GROUP.head }, {
      normals: stripN,
      inside: () => v3(),
      uvs: (i, k) => [u0 + k * 0.22, i / (strip.length - 1)],
    });
  }
  if (style.bun) {
    const s = surface(BUN_DIR).p;
    blob(b, s.addScaledVector(BUN_DIR, 0.026), v3(0.034, 0.028, 0.031), { part: o.part, group: GROUP.head }, {
      seg: cols > 30 ? 22 : 10,
      rings: cols > 30 ? 14 : 6,
      axis: BUN_DIR,
      twist: 0.6,
    });
  }
}

/* ── Who is wearing what ─────────────────────────────────────────────── */

const SKIN = [0xe2b896, 0xd4a07a, 0xc28a62, 0xa8714a, 0x8d5a3a, 0x6b4128, 0x4e2e1c, 0xdcae8c];
const HAIR = [0x16100c, 0x221812, 0x3a2716, 0x5a3a20, 0x7a5230, 0xb08850, 0xd6bd8a, 0x8f8a84, 0xcfcac4, 0x0c0a09];
const SUIT = [0x2a2f38, 0x1d2536, 0x3c4048, 0x5c5f66, 0xa89c86, 0x2f4058, 0x4a5a78, 0x8f969e];
const SHIRT = [0xf2f0ea, 0xdfe8f2, 0xf3e6e4, 0xe9e2d0, 0xffffff];
const KNIT = [0x6b2f35, 0x2f4a3a, 0x1f2a3c, 0xb88a3c, 0x7c7f86, 0x2c2c30, 0xd8cfbf, 0x8a4a2a];
const TIE = [0x6a1c24, 0x1c2c5a, 0x2c4a3a, 0x3a3a44, 0x7a5a2a];
const TROUSERS = [0x23272e, 0x2e3440, 0x3d3f44, 0x5a5448, 0x31465e, 0x8a7d66];
const SHOES = [0x1a1512, 0x3a2418, 0x5a3a22, 0x222326, 0x6b6660];
const IRIS = [0x3a2616, 0x251810, 0x4a6a8a, 0x5a6a3a, 0x6a4a2a];

/** A number from 0 to 1 for this seat and this question. */
const pick = (seed: number, salt: number) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const choose = <T,>(list: readonly T[], seed: number, salt: number) => list[Math.floor(pick(seed, salt) * list.length) % list.length];

const lipsFor = (skin: number, seed: number) => {
  const c = new THREE.Color(skin);
  const lip = new THREE.Color().setRGB(c.r * 0.86, c.g * 0.6, c.b * 0.6);
  if (pick(seed, 91) < 0.35) lip.lerp(new THREE.Color(choose([0x9a2a3a, 0xb04a4a, 0x8a3a4a], seed, 92)), 0.6);
  return lip.getHex();
};

export interface Passenger {
  build: Build;
  sleeves: Sleeves;
  hair: HairName | null;
  palette: Palette;
  scale: number;
  lean: number;
  turn: number;
  nod: number;
  tilt: number;
}

/** Everything about the person in a seat, from nothing but where it is. */
export function passengerFor(row: number, seat: number): Passenger {
  const seed = row * 7.31 + seat * 13.17 + 1;
  const femme = pick(seed, 1) < 0.5;
  const suited = pick(seed, 2) < 0.55;
  const skin = choose(SKIN, seed, 3);
  const older = pick(seed, 4) < 0.18;
  const hair = older ? choose([0x8f8a84, 0xcfcac4, 0xa8a29a], seed, 5) : choose(HAIR, seed, 5);
  const suit = choose(SUIT, seed, 6);
  const top = suited ? suit : choose(KNIT, seed, 7);
  const shirt = choose(SHIRT, seed, 8);
  const hairName: HairName | null = femme
    ? choose(['bun', 'bob', 'long', 'bun', 'bob'] as const, seed, 9)
    : older
      ? choose(['receding', 'crop', null, 'slick'] as const, seed, 9)
      : choose(['crop', 'slick', 'buzz', 'crop', null] as const, seed, 9);
  // Where a seat is, which way its occupant is likely to be looking.
  const window = seat === 0 ? -1 : seat === 5 ? 1 : 0;
  const lookOut = window !== 0 && pick(seed, 10) < 0.35;
  return {
    build: femme ? 'f' : 'm',
    sleeves: suited || pick(seed, 11) < 0.6 ? 'long' : 'short',
    hair: hairName,
    palette: {
      skin,
      hair,
      top,
      inner: suited ? shirt : pick(seed, 12) < 0.5 ? shirt : top,
      bottom: suited ? suit : choose(TROUSERS, seed, 13),
      shoes: choose(SHOES, seed, 14),
      accent: suited && !femme && pick(seed, 15) < 0.7 ? choose(TIE, seed, 16) : shirt,
      legwear: 0x1c1c20,
      lips: lipsFor(skin, seed),
      iris: choose(IRIS, seed, 17),
      stubble: !femme && pick(seed, 18) < 0.4 ? 0.4 + pick(seed, 19) * 0.6 : 0,
    },
    scale: (femme ? 0.95 : 0.99) + pick(seed, 20) * 0.06,
    lean: (pick(seed, 21) - 0.5) * 0.06,
    // A positive turn swings the face toward -x, which is port: seat A's window.
    turn: lookOut ? -window * (0.35 + pick(seed, 22) * 0.3) : (pick(seed, 23) - 0.5) * 0.5,
    // Mostly a little down — at a screen, a book, a lap — and now and then up.
    nod: (0.35 - pick(seed, 24)) * 0.22,
    tilt: (pick(seed, 25) - 0.5) * 0.12,
  };
}

/* ── The cabin's worth ───────────────────────────────────────────────── */

export interface SeatLayout {
  rows: number;
  seatX: readonly number[];
  floorY: number;
  rowZ: (row: number) => number;
}

export interface PassengerHandles {
  group: THREE.Group;
  /**
   * Seat everyone who has a seat. `viewer` is the seat the camera is in —
   * left empty, since it is somebody's own — and `skip` any other seat to
   * leave for someone else.
   */
  place: (sold: ReadonlySet<string>, viewer: string, skip?: string) => void;
  dispose: () => void;
}

/**
 * How finely a row is drawn, by where it is from the viewer's: their own and
 * the one ahead finest, then the two ahead of that and the one behind, then
 * everyone else. Rows ahead have lower numbers.
 */
const detailFor = (row: number, viewerRow: number): Detail =>
  row === viewerRow || row === viewerRow - 1 ? 0 : 2;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** The cushion's top, above the floor: where he sits. */
export const SEAT_HEIGHT = 0.5;

export function createPassengers(layout: SeatLayout): PassengerHandles {
  const group = new THREE.Group();
  group.name = 'passengers';
  const capacity = layout.rows * layout.seatX.length;
  const strands = strandTexture();
  const { material } = figureMaterial({ headCentre: HEAD_FROM_NECK, faceScale: FACE_SCALE });
  const { material: hairMaterial } = figureMaterial({ headCentre: HEAD_FROM_NECK, faceScale: FACE_SCALE, side: THREE.DoubleSide, strands });
  hairMaterial.name = 'passenger-two-sided';

  const make = (g: THREE.BufferGeometry, m: THREE.Material) => {
    addPalettes(g, capacity);
    const mesh = new THREE.InstancedMesh(g, m, capacity);
    mesh.count = 0;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  };
  const builds: Build[] = ['m', 'f'];
  interface Lod {
    body: Record<Build, Record<Sleeves, THREE.InstancedMesh>>;
    head: Record<Build, THREE.InstancedMesh>;
    hair: Record<HairName, THREE.InstancedMesh>;
  }
  const buildLod = (detail: Detail): Lod => ({
    /* Close up, both sides of the clothes, since the model was made to be
       seen from the front: from behind, the gap between a sleeve and the arm
       in it would otherwise show the seat through the shirt. Further off
       nobody can see into a sleeve, and one side is half the work. */
    body: Object.fromEntries(builds.map((build) => [build, {
      short: make(bodyGeometry(build, 'short', detail), detail === 0 ? hairMaterial : material),
      long: make(bodyGeometry(build, 'long', detail), detail === 0 ? hairMaterial : material),
    }])) as Record<Build, Record<Sleeves, THREE.InstancedMesh>>,
    head: Object.fromEntries(builds.map((build) => [build, make(headGeometry(build, detail), material)])) as Record<Build, THREE.InstancedMesh>,
    hair: Object.fromEntries(
      (Object.keys(HAIR_STYLES) as HairName[]).map((name) => [name, make(hairGeometry(HAIR_STYLES[name], detail), hairMaterial)]),
    ) as Record<HairName, THREE.InstancedMesh>,
  });
  /* The far detail is built at once, since it is what most seats show; the
     finer two follow when the page has a moment, a level at a time, and the
     cabin is re-seated as each arrives. Nobody waits on the close-ups. */
  const lods: (Lod | null)[] = [null, null, buildLod(2)];
  let disposed = false;
  let lastPlace: Parameters<PassengerHandles['place']> | null = null;
  const later = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 60);
  const queue: Detail[] = [0];
  const buildNext = () => {
    const detail = queue.shift();
    if (detail === undefined || disposed) return;
    lods[detail] = buildLod(detail);
    if (lastPlace) place(...lastPlace);
    later(buildNext);
  };
  later(buildNext);
  const meshes = group.children as THREE.InstancedMesh[];

  const body = new THREE.Object3D();
  const neck = new THREE.Object3D();
  body.add(neck);
  neck.position.copy(NECK);
  const m = new THREE.Matrix4();

  const put = (mesh: THREE.InstancedMesh, matrix: THREE.Matrix4, palette: Palette) => {
    const i = mesh.count++;
    mesh.setMatrixAt(i, matrix);
    writePalette(mesh.geometry, i, palette);
  };

  const place = (sold: ReadonlySet<string>, viewer: string, skip = '') => {
    lastPlace = [sold, viewer, skip];
    for (const mesh of meshes) mesh.count = 0;
    const viewerRow = Number(viewer.replace(/\D/g, '')) || -99;
    for (let row = 1; row <= layout.rows; row++) {
      const want = detailFor(row, viewerRow);
      const lod = lods[want] ?? lods[want + 1] ?? lods[2]!;
      for (let s = 0; s < layout.seatX.length; s++) {
        const id = `${row}${LETTERS[s]}`;
        if (id === viewer || id === skip || !sold.has(id)) continue;
        const who = passengerFor(row, s);
        body.position.set(layout.seatX[s], layout.floorY + SEAT_HEIGHT, layout.rowZ(row));
        body.rotation.set(0, who.lean * 1.5, who.lean);
        body.scale.setScalar(who.scale);
        neck.rotation.set(who.nod, who.turn, who.tilt, 'YXZ');
        body.updateMatrixWorld(true);
        put(lod.body[who.build][who.sleeves], body.matrixWorld, who.palette);
        m.copy(neck.matrixWorld);
        put(lod.head[who.build], m, who.palette);
        if (who.hair) put(lod.hair[who.hair], m, who.palette);
      }
    }
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      touchPalettes(mesh.geometry);
      if (mesh.count > 0) mesh.computeBoundingSphere();
    }
  };

  const dispose = () => {
    disposed = true;
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
    hairMaterial.dispose();
    strands.dispose();
  };

  return { group, place, dispose };
}

export { HEAD_FROM_NECK, NECK, HEAD_AT, FACE_SCALE, pieces as passengerPieces, subdivide, normals as meshNormals, GROUP as FIGURE_GROUP, KIND as PIECE, table as azimuthTable, BODY_OCCLUDERS, SEAT_WALLS };
