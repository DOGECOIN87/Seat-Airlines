import * as THREE from 'three';

/**
 * The tools the people on board are made with.
 *
 * Everybody in the cabin is built the same way: bodies are lofted — rings of
 * points swept along a limb or stacked up a torso, so a shoulder slopes and
 * an arm tapers instead of being a row of primitives — and heads are carved
 * out of a signed distance field, a few dozen soft shapes blended together
 * and then read off along rays from the middle of the skull. That gives a
 * brow, a nose and a jaw for the cost of one sphere's worth of vertices, and
 * normals straight from the field, so the face shades smoothly however
 * coarse the mesh under it is.
 *
 * Colour is not in the mesh. Each vertex says what it is made of — skin,
 * hair, jacket, shirt — and each passenger carries a palette, so one mesh
 * dresses a hundred and eighty people differently and still draws in one
 * call. The shader does the rest: strands in the hair, eyes, brows and lips
 * on the face, and the darkening where one part of a body shades another.
 */

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** What a vertex is made of. Its colour is the wearer's, looked up per instance. */
export const PART = {
  skin: 0,
  hair: 1,
  top: 2,
  inner: 3,
  bottom: 4,
  shoes: 5,
  accent: 6,
  legwear: 7,
  /** Skin that carries the face: eyes, brows and lips are painted on it. */
  face: 8,
  /** Lit from inside. Nobody on the passenger list has any. */
  glow: 9,
  /** Hair as cards of strands over the shell: cut out by the strand texture. */
  strands: 10,
} as const;

export interface Look {
  part: number;
  /** A second material, shown wherever `mask` is over a half — the shirt in a jacket's V. */
  part2?: number;
  mask?: (p: V3) => number;
  /** Which piece of the body this is, so a piece does not shade itself. */
  group: number;
}

/** A capsule that darkens whatever faces it: an arm against a ribcage, a chin over a collar. */
export interface Occluder {
  a: V3;
  b: V3;
  r: number;
  group: number;
}

/** A flat surface nearby — the seat back, the cushion, the floor. */
export interface Wall {
  point: V3;
  /** Pointing out of the wall, toward the body. */
  normal: V3;
  reach: number;
  strength: number;
}

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Builder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  /** part, second part, mask, occlusion — four per vertex. */
  readonly look: number[] = [];
  readonly group: number[] = [];
  readonly index: number[] = [];

  get count() {
    return this.pos.length / 3;
  }

  /**
   * A grid of points — rows along the piece, columns round it — stitched into
   * triangles. Normals come from the grid unless they are given, and are
   * turned to face away from `inside`, which is also what decides the winding.
   */
  sheet(
    rows: V3[][],
    look: Look,
    o: {
      wrap?: boolean;
      inside?: (i: number) => V3;
      normals?: V3[][];
      uvs?: (i: number, j: number) => [number, number];
      ao?: number[][];
    } = {},
  ) {
    const nI = rows.length;
    const nJ = rows[0].length;
    const wrap = o.wrap ?? false;
    const base = this.count;
    const centre = (i: number) => {
      if (o.inside) return o.inside(i);
      const c = v3();
      for (const p of rows[i]) c.add(p);
      return c.multiplyScalar(1 / nJ);
    };
    /* Normals from the grid, all one way round — then turned, all together,
       to face away from the inside. Deciding vertex by vertex goes wrong on
       a lid or a shoulder, where the surface runs across the outward line. */
    const normalsOut: V3[] = [];
    let vote = 0;
    for (let i = 0; i < nI; i++) {
      const c = centre(i);
      for (let j = 0; j < nJ; j++) {
        const p = rows[i][j];
        const n = v3();
        if (o.normals) n.copy(o.normals[i][j]);
        else {
          const jp = wrap ? (j + 1) % nJ : Math.min(j + 1, nJ - 1);
          const jm = wrap ? (j - 1 + nJ) % nJ : Math.max(j - 1, 0);
          const ip = Math.min(i + 1, nI - 1);
          const im = Math.max(i - 1, 0);
          tmp.subVectors(rows[i][jp], rows[i][jm]);
          tmpB.subVectors(rows[ip][j], rows[im][j]);
          n.crossVectors(tmp, tmpB);
          const out = tmp.subVectors(p, c);
          if (n.lengthSq() < 1e-14) n.copy(out).multiplyScalar(-1e-6);
          else vote += Math.sign(n.dot(out));
        }
        normalsOut.push(n);
      }
    }
    const turn = !o.normals && vote < 0 ? -1 : 1;
    for (let i = 0; i < nI; i++) {
      for (let j = 0; j < nJ; j++) {
        const p = rows[i][j];
        const n = normalsOut[i * nJ + j];
        if (n.lengthSq() < 1e-20) n.subVectors(p, centre(i));
        n.multiplyScalar(turn).normalize();
        this.pos.push(p.x, p.y, p.z);
        this.nrm.push(n.x, n.y, n.z);
        const [u, v] = o.uvs ? o.uvs(i, j) : [j / nJ, i / Math.max(1, nI - 1)];
        this.uv.push(u, v);
        const m = look.mask ? look.mask(p) : 0;
        this.look.push(look.part, look.part2 ?? look.part, m, o.ao ? o.ao[i][j] : 1);
        this.group.push(look.group);
      }
    }
    /* Wind every triangle the same way, and that way the way its normals
       point: find one with some area and see which side it faces. */
    let flip = false;
    search: for (let i = 0; i < nI - 1; i++) {
      for (let j = 0; j < nJ - 1; j++) {
        const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j];
        tmp.subVectors(c, a).cross(tmpB.subVectors(b, a));
        if (tmp.lengthSq() < 1e-12) continue;
        const k = (base + i * nJ + j) * 3;
        flip = tmp.x * this.nrm[k] + tmp.y * this.nrm[k + 1] + tmp.z * this.nrm[k + 2] < 0;
        break search;
      }
    }
    const cols = wrap ? nJ : nJ - 1;
    for (let i = 0; i < nI - 1; i++) {
      for (let j = 0; j < cols; j++) {
        const a = base + i * nJ + j;
        const b = base + i * nJ + ((j + 1) % nJ);
        const c = base + (i + 1) * nJ + j;
        const d = base + (i + 1) * nJ + ((j + 1) % nJ);
        if (flip) this.index.push(a, b, c, b, d, c);
        else this.index.push(a, c, b, b, c, d);
      }
    }
  }

  /**
   * Any indexed triangle mesh, with a normal per vertex. `look(i)` says what
   * vertex i is made of: [part, second part, mask].
   */
  mesh(
    pos: ArrayLike<number>,
    nrm: ArrayLike<number>,
    index: ArrayLike<number>,
    look: (i: number) => [number, number, number],
    group: (i: number) => number,
    ao?: ArrayLike<number>,
  ) {
    const base = this.count;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      this.pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      this.nrm.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      this.uv.push(0, 0);
      const [a, b, m] = look(i);
      this.look.push(a, b, m, ao ? ao[i] : 1);
      this.group.push(group(i));
    }
    for (let i = 0; i < index.length; i++) this.index.push(base + index[i]);
  }

  /**
   * Bake the occlusion: how much of the sky each vertex can see past the
   * rest of the body and the seat. Spheres and capsules stand in for the
   * body; the seat is a few planes.
   */
  occlude(occluders: Occluder[], walls: Wall[] = [], strength = 0.85) {
    const p = v3();
    const n = v3();
    const c = v3();
    const ab = v3();
    for (let v = 0; v < this.count; v++) {
      p.fromArray(this.pos, v * 3);
      n.fromArray(this.nrm, v * 3);
      let ao = 1;
      for (const o of occluders) {
        if (o.group === this.group[v]) continue;
        ab.subVectors(o.b, o.a);
        const t = THREE.MathUtils.clamp(c.subVectors(p, o.a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
        c.copy(o.a).addScaledVector(ab, t).sub(p);
        const d = c.length();
        if (d < 1e-6) continue;
        const cos = n.dot(c) / d;
        if (cos <= 0) continue;
        const cover = Math.min(1, (o.r * o.r) / (d * d));
        ao *= 1 - strength * cover * cos;
      }
      for (const w of walls) {
        const h = c.subVectors(p, w.point).dot(w.normal);
        const facing = -n.dot(w.normal);
        if (facing <= 0 || h > w.reach) continue;
        ao *= 1 - w.strength * facing * (1 - Math.max(0, h) / w.reach);
      }
      this.look[v * 4 + 3] *= Math.max(0.28, ao);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('look', new THREE.Float32BufferAttribute(this.look, 4));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

/* ── Lofting ─────────────────────────────────────────────────────────── */

/** The radius of a superellipse of exponent `n` at angle `a`, for a unit circle's. */
export const superellipse = (a: number, n: number) =>
  Math.pow(Math.pow(Math.abs(Math.cos(a)), n) + Math.pow(Math.abs(Math.sin(a)), n), -1 / n);

export interface TubeOptions {
  /** Points round the ring. */
  seg: number;
  /** Rings along the length. */
  steps: number;
  /** Which way the ring's second radius points at the start. */
  up: V3;
  /** Round the ends off, by this share of the end radius. 0 leaves them open. */
  capStart?: number;
  capEnd?: number;
  /** Multiplies the radius round the ring: a flat sole, a fold in a sleeve. */
  shape?: (a: number, t: number) => number;
}

/**
 * Sweep a ring along a smooth curve through `pts`. `radius(t)` gives the
 * ring's two radii — across, and toward `up` — from 0 at the first point to
 * 1 at the last. Returns the ring centres and frames, for anything that
 * wants to hang off the tube.
 */
export function tube(
  b: Builder,
  pts: V3[],
  radius: (t: number) => [number, number],
  look: Look,
  o: TubeOptions,
) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const centres: V3[] = [];
  const tangents: V3[] = [];
  const normals: V3[] = [];
  for (let k = 0; k <= o.steps; k++) {
    const t = k / o.steps;
    centres.push(curve.getPointAt(t));
    tangents.push(curve.getTangentAt(t).normalize());
  }
  // Parallel transport: each frame is the last one turned only as much as
  // the curve turns, so a ring never twists on its way round a knee.
  let nPrev = o.up.clone().addScaledVector(tangents[0], -o.up.dot(tangents[0])).normalize();
  for (let k = 0; k <= o.steps; k++) {
    const t = tangents[k];
    const nk = nPrev.clone().addScaledVector(t, -nPrev.dot(t)).normalize();
    normals.push(nk);
    nPrev = nk;
  }
  const ring = (c: V3, t: V3, nn: V3, rx: number, ry: number, tt: number) => {
    const bb = v3().crossVectors(t, nn).normalize();
    const out: V3[] = [];
    for (let j = 0; j < o.seg; j++) {
      const a = (j / o.seg) * Math.PI * 2;
      const m = o.shape ? o.shape(a, tt) : 1;
      out.push(
        c.clone()
          .addScaledVector(bb, Math.cos(a) * rx * m)
          .addScaledVector(nn, Math.sin(a) * ry * m),
      );
    }
    return out;
  };
  const rows: V3[][] = [];
  const mids: V3[] = [];
  const CAP = 4;
  const cap = (end: boolean, share: number) => {
    const k = end ? o.steps : 0;
    const [rx, ry] = radius(end ? 1 : 0);
    const dir = tangents[k].clone().multiplyScalar(end ? 1 : -1);
    const order = end ? [...Array(CAP).keys()].map((q) => q + 1) : [...Array(CAP).keys()].map((q) => CAP - q);
    for (const q of order) {
      const beta = (q / CAP) * (Math.PI / 2);
      const c = centres[k].clone().addScaledVector(dir, Math.sin(beta) * Math.max(rx, ry) * share);
      const s = Math.max(0.02, Math.cos(beta));
      rows.push(ring(c, tangents[k], normals[k], rx * s, ry * s, end ? 1 : 0));
      mids.push(centres[k].clone());
    }
  };
  if (o.capStart) cap(false, o.capStart);
  for (let k = 0; k <= o.steps; k++) {
    const t = k / o.steps;
    const [rx, ry] = radius(t);
    rows.push(ring(centres[k], tangents[k], normals[k], rx, ry, t));
    mids.push(centres[k]);
  }
  if (o.capEnd) cap(true, o.capEnd);
  b.sheet(rows, look, { wrap: true, inside: (i) => mids[i] });
  return { centres, tangents, normals, curve };
}

/** One horizontal slice of a torso: its height, half-width, depth either side of its centre, and squareness. */
export interface Slice {
  y: number;
  xh: number;
  zf: number;
  zb: number;
  zc: number;
  n: number;
}

/** A smooth value through evenly spaced keys, by Catmull–Rom. */
function through(keys: number[], s: number) {
  const n = keys.length - 1;
  const i = Math.min(n - 1, Math.max(0, Math.floor(s)));
  const t = s - i;
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Stack horizontal slices into a closed body — a torso, a robe. Keys are
 * interpolated smoothly, `sub` rings to each gap between them. `push`
 * moves a finished point, for lapels and folds.
 */
export function stack(
  b: Builder,
  keys: Slice[],
  look: Look,
  o: { seg: number; sub: number; capTop?: boolean; capBottom?: boolean; push?: (p: V3, a: number) => void },
) {
  const field = (f: keyof Slice) => keys.map((k) => k[f]);
  const cols = { y: field('y'), xh: field('xh'), zf: field('zf'), zb: field('zb'), zc: field('zc'), n: field('n') };
  const rows: V3[][] = [];
  const mids: V3[] = [];
  const total = (keys.length - 1) * o.sub;
  const slice = (s: number) => ({
    y: through(cols.y, s), xh: through(cols.xh, s), zf: through(cols.zf, s),
    zb: through(cols.zb, s), zc: through(cols.zc, s), n: through(cols.n, s),
  });
  const ring = (k: Slice, scale = 1) => {
    const out: V3[] = [];
    for (let j = 0; j < o.seg; j++) {
      const a = (j / o.seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const e = 2 / k.n;
      const x = k.xh * Math.sign(c) * Math.pow(Math.abs(c), e) * scale;
      const z = k.zc + (s > 0 ? k.zb : k.zf) * Math.sign(s) * Math.pow(Math.abs(s), e) * scale;
      const p = v3(x, k.y, z);
      o.push?.(p, a);
      out.push(p);
    }
    return out;
  };
  if (o.capBottom) {
    const k = slice(0);
    rows.push(ring({ ...k, y: k.y - 0.004 }, 0.02));
    mids.push(v3(0, k.y, k.zc));
  }
  for (let q = 0; q <= total; q++) {
    const k = slice(q / o.sub);
    rows.push(ring(k));
    mids.push(v3(0, k.y, k.zc));
  }
  if (o.capTop) {
    const k = slice(total / o.sub);
    rows.push(ring({ ...k, y: k.y + 0.006 }, 0.55));
    mids.push(v3(0, k.y, k.zc));
    rows.push(ring({ ...k, y: k.y + 0.008 }, 0.02));
    mids.push(v3(0, k.y, k.zc));
  }
  b.sheet(rows, look, { wrap: true, inside: (i) => mids[i] });
  return slice;
}

/** A squashed sphere, pointing its pole along `axis`. */
export function blob(
  b: Builder,
  centre: V3,
  radii: V3,
  look: Look,
  o: { seg: number; rings: number; axis?: V3; dent?: (p: V3) => number; twist?: number },
) {
  const axis = (o.axis ?? v3(0, 1, 0)).clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), axis);
  const rows: V3[][] = [];
  for (let i = 0; i <= o.rings; i++) {
    const lat = -Math.PI / 2 + (i / o.rings) * Math.PI;
    const row: V3[] = [];
    for (let j = 0; j < o.seg; j++) {
      const lon = (j / o.seg) * Math.PI * 2;
      const p = v3(Math.cos(lat) * Math.cos(lon) * radii.x, Math.sin(lat) * radii.y, Math.cos(lat) * Math.sin(lon) * radii.z);
      if (o.dent) p.multiplyScalar(1 - o.dent(p));
      row.push(p.applyQuaternion(q).add(centre));
    }
    rows.push(row);
  }
  b.sheet(rows, look, {
    wrap: true,
    inside: () => centre,
    uvs: (i, j) => [j / o.seg + (i / o.rings) * (o.twist ?? 0), i / o.rings],
  });
}

/**
 * Occlusion from the shape of a mesh alone: a vertex whose neighbours stand
 * out past it along its normal is in a hollow — the corner of an eye, a
 * nostril, the fold of a sleeve — and gets less light.
 */
export function cavity(pos: ArrayLike<number>, index: ArrayLike<number>, nrm: ArrayLike<number>, gain = 2.4) {
  const n = pos.length / 3;
  const sum = new Float64Array(n * 3);
  const count = new Float64Array(n);
  const reachOf = new Float64Array(n);
  const add = (a: number, b: number) => {
    for (let d = 0; d < 3; d++) sum[a * 3 + d] += pos[b * 3 + d];
    count[a]++;
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    reachOf[a] += Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    add(a, b); add(b, a); add(b, c); add(c, b); add(c, a); add(a, c);
  }
  const ao = new Array<number>(n).fill(1);
  for (let v = 0; v < n; v++) {
    if (!count[v]) continue;
    let dot = 0;
    for (let d = 0; d < 3; d++) dot += (sum[v * 3 + d] / count[v] - pos[v * 3 + d]) * nrm[v * 3 + d];
    const c = dot / (reachOf[v] / count[v]);
    ao[v] = 1 - Math.min(0.55, Math.max(0, (c - 0.015) * gain));
  }
  return ao;
}

/* ── Signed distance fields ──────────────────────────────────────────── */

export type Field = (x: number, y: number, z: number) => number;

/** An ellipsoid — Quilez's bound, which is close enough near the surface. */
export function ellipsoid(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/** A capsule from a to b whose radius runs from r1 to r2. */
export function capsule(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2 = r1,
) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = THREE.MathUtils.clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}

/** Blend two shapes into one, softly over `k`. */
export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Carve `b` out of `a`, softly. Pass the carving shape's distance negated. */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

export function fieldNormal(f: Field, p: V3, out = v3()) {
  const h = 4e-4;
  out.set(
    f(p.x + h, p.y, p.z) - f(p.x - h, p.y, p.z),
    f(p.x, p.y + h, p.z) - f(p.x, p.y - h, p.z),
    f(p.x, p.y, p.z + h) - f(p.x, p.y, p.z - h),
  );
  return out.normalize();
}

/**
 * Where a ray from the origin along `dir` last leaves the field: march in
 * from outside, a sphere at a time, so the first surface met is the outer one.
 */
export function reach(f: Field, dir: V3, far = 0.3) {
  let r = far;
  for (let k = 0; k < 160; k++) {
    const d = f(dir.x * r, dir.y * r, dir.z * r);
    if (d < 5e-5) break;
    r -= Math.max(d * 0.85, 1e-4);
    if (r <= 0) return 0;
  }
  return r;
}

/**
 * How shut in a point is, from the field itself — the corner of an eye, the
 * crease under a lip. Samples outward along the normal and counts how much
 * nearer the surface is than open space would put it.
 */
export function fieldOcclusion(f: Field, p: V3, n: V3, step = 0.004, gain = 22) {
  let occ = 0;
  let w = 1;
  for (let i = 1; i <= 5; i++) {
    const h = step * i;
    occ += (h - Math.max(0, f(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h))) * w;
    w *= 0.72;
  }
  return THREE.MathUtils.clamp(1 - occ * gain * (0.004 / step), 0.12, 1);
}

/**
 * Mesh a field that is star-shaped about the origin — a head is, bar the
 * ears — on a sphere of `cols` × `rows`. The grid is packed toward the face
 * (−z) and toward eye level, where a head has all its detail, and thinned
 * over the back of the skull, which is smooth.
 */
export function carve(b: Builder, f: Field, look: Look, o: { cols: number; rows: number; far?: number; aoStep?: number; aoGain?: number }) {
  const pts: V3[][] = [];
  const nrm: V3[][] = [];
  const ao: number[][] = [];
  const dir = v3();
  for (let i = 0; i <= o.rows; i++) {
    const s = -Math.PI / 2 + (i / o.rows) * Math.PI;
    const lat = s - 0.22 * Math.sin(2 * s);
    const row: V3[] = [];
    const nr: V3[] = [];
    const ar: number[] = [];
    for (let j = 0; j < o.cols; j++) {
      const t = (j / o.cols) * Math.PI * 2 - Math.PI;
      const lon = t - 0.55 * Math.sin(t);
      // lon 0 faces −z: the face sits in the middle of the texture, away from the seam.
      dir.set(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat));
      const r = reach(f, dir, o.far);
      const p = dir.clone().multiplyScalar(r);
      const n = fieldNormal(f, p);
      row.push(p);
      nr.push(n);
      ar.push(fieldOcclusion(f, p, n, o.aoStep, o.aoGain));
    }
    pts.push(row);
    nrm.push(nr);
    ao.push(ar);
  }
  b.sheet(pts, look, {
    wrap: true,
    normals: nrm,
    ao,
    inside: () => v3(),
    uvs: (i, j) => [j / o.cols, i / o.rows],
  });
}

/**
 * Strands, for hair cards: pale lines on nothing, root at the top, each its
 * own shade and length, tapering to a tip. The colour is only brightness —
 * what colour hair is comes from the passenger — and the alpha is what cuts
 * a card into strands.
 */
export function strandTexture(): THREE.CanvasTexture {
  const w = 256, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const len = h * (0.55 + rand() * 0.45);
    const shade = Math.round(140 + rand() * 115);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(${shade},${shade},${shade},1)`);
    grad.addColorStop(0.75, `rgba(${shade},${shade},${shade},1)`);
    grad.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.strokeStyle = grad;
    g.lineWidth = 2 + rand() * 3.5;
    g.beginPath();
    g.moveTo(x, 0);
    const wave = rand() * 6;
    for (let y = 0; y <= len; y += 12) g.lineTo(x + Math.sin(y / 70 + i) * wave, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Mesh any field, whatever its shape — an open mouth, teeth, sockets deeper
 * than they are wide — by surface nets: one vertex in every small cube the
 * surface passes through, at the average of where it crosses the cube's
 * edges, and a quad across every edge it crosses. Searched coarse to fine,
 * so the field is only sampled finely near its surface.
 */
export function nets(
  b: Builder,
  f: Field,
  look: Look,
  o: { min: V3; max: V3; cell: number; aoStep?: number; aoGain?: number },
) {
  const COARSE = 4;
  const nx = Math.ceil((o.max.x - o.min.x) / o.cell / COARSE) * COARSE;
  const ny = Math.ceil((o.max.y - o.min.y) / o.cell / COARSE) * COARSE;
  const nz = Math.ceil((o.max.z - o.min.z) / o.cell / COARSE) * COARSE;
  const sx = nx + 1, sy = ny + 1;
  const val = new Float32Array(sx * sy * (nz + 1)).fill(NaN);
  const at = (i: number, j: number, k: number) => {
    const id = i + sx * (j + sy * k);
    let v = val[id];
    if (Number.isNaN(v)) {
      v = f(o.min.x + i * o.cell, o.min.y + j * o.cell, o.min.z + k * o.cell);
      val[id] = v;
    }
    return v;
  };
  // Which coarse blocks come near enough to the surface to be worth a closer look.
  const near = o.cell * COARSE * 1.8;
  const active = new Uint8Array(nx * ny * nz);
  for (let K = 0; K < nz; K += COARSE) {
    for (let J = 0; J < ny; J += COARSE) {
      for (let I = 0; I < nx; I += COARSE) {
        const h = COARSE / 2;
        if (Math.abs(at(I + h, J + h, K + h)) > near) continue;
        for (let k = K; k < K + COARSE; k++) for (let j = J; j < J + COARSE; j++) for (let i = I; i < I + COARSE; i++) active[i + nx * (j + ny * k)] = 1;
      }
    }
  }
  const vertexOf = new Int32Array(nx * ny * nz).fill(-1);
  const pts: V3[] = [];
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = i + nx * (j + ny * k);
        if (!active[id]) continue;
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2]);
          if (cv[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        const p = v3();
        let n = 0;
        for (const [a, c] of EDGES) {
          if (cv[a] < 0 === cv[c] < 0) continue;
          const t = cv[a] / (cv[a] - cv[c]);
          p.x += CORNERS[a][0] + (CORNERS[c][0] - CORNERS[a][0]) * t;
          p.y += CORNERS[a][1] + (CORNERS[c][1] - CORNERS[a][1]) * t;
          p.z += CORNERS[a][2] + (CORNERS[c][2] - CORNERS[a][2]) * t;
          n++;
        }
        p.multiplyScalar(1 / n).add(v3(i, j, k)).multiplyScalar(o.cell).add(o.min);
        vertexOf[id] = pts.length;
        pts.push(p);
      }
    }
  }
  // Settle each vertex onto the surface.
  const nrm: V3[] = pts.map((p) => {
    const g = fieldNormal(f, p);
    p.addScaledVector(g, -f(p.x, p.y, p.z));
    return fieldNormal(f, p);
  });
  const base = b.count;
  for (let v = 0; v < pts.length; v++) {
    const p = pts[v], n = nrm[v];
    b.pos.push(p.x, p.y, p.z);
    b.nrm.push(n.x, n.y, n.z);
    b.uv.push(0, 0);
    b.look.push(look.part, look.part2 ?? look.part, look.mask ? look.mask(p) : 0, fieldOcclusion(f, p, n, o.aoStep, o.aoGain));
    b.group.push(look.group);
  }
  // A quad across every grid edge the surface crosses, joining the four cells round it.
  const cell = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : vertexOf[i + nx * (j + ny * k)]);
  const quad = (a: number, c: number, d: number, e: number, flip: boolean) => {
    if (a < 0 || c < 0 || d < 0 || e < 0) return;
    if (flip) b.index.push(base + a, base + c, base + d, base + c, base + e, base + d);
    else b.index.push(base + a, base + d, base + c, base + c, base + d, base + e);
  };
  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        if (vertexOf[i + nx * (j + ny * k)] < 0) continue;
        const v0 = at(i, j, k);
        // The edges leaving this grid point along +x, +y and +z.
        const vx = at(i + 1, j, k), vy = at(i, j + 1, k), vz = at(i, j, k + 1);
        if (v0 < 0 !== vx < 0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j - 1, k), cell(i, j, k), v0 < 0);
        if (v0 < 0 !== vy < 0) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k - 1), cell(i, j, k), v0 < 0);
        if (v0 < 0 !== vz < 0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i - 1, j, k), cell(i, j, k), v0 < 0);
      }
    }
  }
}

/* ── Material ────────────────────────────────────────────────────────── */

/**
 * A colour for the palette: the hex itself. Every 24-bit integer is exact in
 * a float, so a whole colour rides in one channel of an instance attribute
 * and the shader takes it apart again.
 */
export const INSTANCE_ATTRIBUTES = ['palA', 'palB', 'palC'] as const;

/** Give an instanced geometry room for `count` palettes. */
export function addPalettes(g: THREE.BufferGeometry, count: number) {
  for (const name of INSTANCE_ATTRIBUTES) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, attr);
  }
}

/**
 * The palette a figure wears. `a` is skin, hair, top, inner; `b` is bottom,
 * shoes, accent, legwear; `c` is lips, eyes, stubble (0–1).
 */
export interface Palette {
  skin: number;
  hair: number;
  top: number;
  inner: number;
  bottom: number;
  shoes: number;
  accent: number;
  legwear: number;
  lips: number;
  iris: number;
  stubble: number;
}

export function writePalette(g: THREE.BufferGeometry, i: number, p: Palette) {
  (g.getAttribute('palA') as THREE.InstancedBufferAttribute).setXYZW(i, p.skin, p.hair, p.top, p.inner);
  (g.getAttribute('palB') as THREE.InstancedBufferAttribute).setXYZW(i, p.bottom, p.shoes, p.accent, p.legwear);
  (g.getAttribute('palC') as THREE.InstancedBufferAttribute).setXYZW(i, p.lips, p.iris, p.stubble, 0);
}

export function touchPalettes(g: THREE.BufferGeometry) {
  for (const name of INSTANCE_ATTRIBUTES) g.getAttribute(name).needsUpdate = true;
}

const VERTEX_PARS = /* glsl */ `
attribute vec4 look;
attribute vec4 palA;
attribute vec4 palB;
attribute vec4 palC;
varying vec4 vLook;
varying vec3 vTintA;
varying vec3 vTintB;
varying vec3 vHairTint;
varying vec3 vLipTint;
varying vec3 vIrisTint;
varying float vStubble;
varying vec3 vObj;
varying vec2 vFigUv;
vec3 figUnpack(float f) {
  float r = floor(f / 65536.0);
  float g = floor((f - r * 65536.0) / 256.0);
  float b = f - r * 65536.0 - g * 256.0;
  vec3 c = vec3(r, g, b) / 255.0;
  return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, c));
}
float figPacked(float i) {
  if (i < 0.5) return palA.x;
  if (i < 1.5) return palA.y;
  if (i < 2.5) return palA.z;
  if (i < 3.5) return palA.w;
  if (i < 4.5) return palB.x;
  if (i < 5.5) return palB.y;
  if (i < 6.5) return palB.z;
  if (i < 7.5) return palB.w;
  if (i < 8.5) return palA.x;
  if (i < 9.5) return palB.z;
  return palA.y;
}
`;

const VERTEX_MAIN = /* glsl */ `
vLook = look;
vObj = position;
vFigUv = uv;
vTintA = figUnpack(figPacked(look.x));
vTintB = figUnpack(figPacked(look.y));
vHairTint = figUnpack(palA.y);
vLipTint = figUnpack(palC.x);
vIrisTint = figUnpack(palC.y);
vStubble = palC.z;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform vec3 figHeadCentre;
uniform vec3 figFaceScale;
uniform float figGlow;
uniform sampler2D figStrands;
varying vec4 vLook;
varying vec3 vTintA;
varying vec3 vTintB;
varying vec3 vHairTint;
varying vec3 vLipTint;
varying vec3 vIrisTint;
varying float vStubble;
varying vec3 vObj;
varying vec2 vFigUv;
float figHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float figNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(figHash(i), figHash(i + 1.0), f);
}
float figHash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float figNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(figHash3(i), figHash3(i + vec3(1, 0, 0)), f.x), mix(figHash3(i + vec3(0, 1, 0)), figHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(figHash3(i + vec3(0, 0, 1)), figHash3(i + vec3(1, 0, 1)), f.x), mix(figHash3(i + vec3(0, 1, 1)), figHash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
/* 1 inside an ellipse of half-sizes r round c, 0 outside, with the edge a pixel soft. */
float figEllipse(vec2 p, vec2 c, vec2 r) {
  float d = length((p - c) / r);
  float w = fwidth(d) + 0.02;
  return 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
}
`;

/* The face, painted in the head's own space: metres from the middle of the
   skull, eye level at y = 0, the face toward −z. */
const FACE = /* glsl */ `
{
  vec3 hp = (vObj - figHeadCentre) * figFaceScale;
  float front = smoothstep(-0.045, -0.068, hp.z);
  float sx = abs(hp.x);
  // Stubble first, so the lips and the eyes sit on top of it.
  float jaw = smoothstep(-0.046, -0.058, hp.y) * smoothstep(-0.132, -0.112, hp.y) * smoothstep(0.035, 0.0, hp.z);
  figTint = mix(figTint, figTint * 0.62 + vHairTint * 0.18, vStubble * jaw * 0.75);
  // Eyes: an almond of white, the iris in it, and the lash line along the top.
  vec2 e = vec2(sx - 0.031, hp.y - 0.0005);
  vec2 almond = vec2(e.x, e.y / max(0.25, 1.0 - 0.45 * (e.x / 0.0145) * (e.x / 0.0145)));
  float eye = figEllipse(almond, vec2(0.0), vec2(0.0145, 0.0066)) * front;
  float iris = figEllipse(vec2(sx, hp.y), vec2(0.0305, -0.0002), vec2(0.0056)) * eye;
  float pupil = figEllipse(vec2(sx, hp.y), vec2(0.0305, -0.0002), vec2(0.0022)) * eye;
  // The window in the eye: a catchlight, up and to one side, the same side in both.
  figGlint = figEllipse(hp.xy, vec2(sign(hp.x) * 0.0305 - 0.0017, 0.0019), vec2(0.00115)) * eye;
  float lid = figEllipse(almond, vec2(0.0, 0.0014), vec2(0.016, 0.0074)) * (1.0 - eye) * step(0.0, e.y + 0.001) * front;
  figTint = mix(figTint, mix(figTint, vec3(0.72, 0.69, 0.66), 0.7), eye);
  figTint = mix(figTint, vIrisTint, iris);
  figTint = mix(figTint, vec3(0.012), pupil * 0.9);
  figTint = mix(figTint, vHairTint * 0.3 + vec3(0.008), lid * 0.9);
  // Brows, over the eyes and arched, thinning to the outside.
  float bx = (sx - 0.011) / 0.04;
  float by = hp.y - (0.0205 + 0.0045 * sin(clamp(bx, 0.0, 1.0) * 2.6));
  float bw = mix(0.0032, 0.0013, clamp(bx, 0.0, 1.0));
  float brow = (1.0 - smoothstep(bw * 0.55, bw, abs(by))) * step(0.0, bx) * step(bx, 1.0) * front;
  figTint = mix(figTint, vHairTint * 0.6, brow * 0.92);
  // Lips, and the line between them.
  vec2 lp = vec2(hp.x / 0.0235, (hp.y + 0.0705) / 0.0118);
  float lips = figEllipse(vec2(lp.x, lp.y * (1.0 + 0.9 * lp.x * lp.x)), vec2(0.0, -0.08), vec2(1.0, 0.95)) * front;
  figTint = mix(figTint, vLipTint, lips * 0.85);
  float mouth = (1.0 - smoothstep(0.0005, 0.0013, abs(hp.y + 0.0705))) * step(abs(lp.x), 0.92) * front;
  figTint *= 1.0 - 0.5 * mouth;
  // A little warmth in the cheeks, which is most of what makes skin look alive.
  float cheek = figEllipse(vec2(sx, hp.y), vec2(0.042, -0.032), vec2(0.022, 0.016)) * front;
  figTint *= mix(vec3(1.0), vec3(1.05, 0.93, 0.92), cheek * 0.6);
}
`;

const HAIR = /* glsl */ `
{
  float hx = vFigUv.x * 900.0 + figNoise(vFigUv.y * 6.0 + vFigUv.x * 40.0) * 3.0;
  float hw = fwidth(hx);
  float strand = figNoise(hx) * 0.6 + figNoise(hx * 2.7 + 7.0) * 0.4;
  strand = mix(strand, 0.5, smoothstep(0.3, 1.0, hw));
  float lock = figNoise(vFigUv.x * 70.0 + figNoise(vFigUv.y * 5.0) * 2.5);
  figSheen = strand * (0.5 + 0.5 * lock);
  figTint *= 0.5 + 0.8 * strand * (0.65 + 0.7 * lock);
  // A little darker at the crown, where the strands part and the scalp shades them.
  figTint *= mix(0.88, 1.0, smoothstep(0.0, 0.2, vFigUv.y));
}
`;

/**
 * The material every figure is drawn with: standard PBR, with its colour,
 * roughness and occlusion taken from the vertex's part and the instance's
 * palette. `headCentre` is where the eyes' level meets the middle of the
 * skull, in the head mesh's own space, and `faceScale` stretches the painted
 * face to fit the head it is painted on: it is drawn for eyes 62 mm apart and
 * a mouth 70 mm under them.
 */
let blankStrands: THREE.DataTexture | null = null;

export function figureMaterial(o: { headCentre: V3; faceScale?: V3; side?: THREE.Side; strands?: THREE.Texture }) {
  const glow = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, side: o.side ?? THREE.FrontSide });
  material.onBeforeCompile = (s) => {
    s.uniforms.figHeadCentre = { value: o.headCentre };
    s.uniforms.figFaceScale = { value: o.faceScale ?? v3(1, 1, 1) };
    if (!o.strands && !blankStrands) {
      blankStrands = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      blankStrands.needsUpdate = true;
    }
    s.uniforms.figStrands = { value: o.strands ?? blankStrands };
    s.uniforms.figGlow = glow;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_MAIN}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float figPart = floor(vLook.x + 0.5);
        float figShown = step(0.5, vLook.z) > 0.5 ? floor(vLook.y + 0.5) : figPart;
        vec3 figTint = mix(vTintA, vTintB, step(0.5, vLook.z));
        float figSheen = 0.0;
        float figGlint = 0.0;
        if (figPart == 1.0) ${HAIR}
        else if (figPart == 8.0) ${FACE}
        else if (figPart == 9.0) figTint = vec3(0.02);
        else if (figPart == 10.0) {
          vec4 st = texture2D(figStrands, vFigUv);
          if (st.a < 0.5) discard;
          figTint *= 0.5 + 0.7 * st.r;
          figSheen = st.r;
        }
        if (figShown == 0.0 || figShown == 8.0) {
          // Skin is never one flat colour: a fine mottle, faded out before it can shimmer.
          float sk = figNoise3(vObj * 700.0) * 0.6 + figNoise3(vObj * 180.0) * 0.4;
          float skw = fwidth(vObj.x * 700.0) + fwidth(vObj.y * 700.0);
          figTint *= 1.0 + (sk - 0.5) * 0.12 * (1.0 - smoothstep(0.4, 1.2, skw));
        } else if (figShown == 2.0 || figShown == 3.0 || figShown == 4.0 || figShown == 7.0) {
          // Cloth: a twill, too fine to see as more than a texture, gone before it can alias.
          float tw = (vObj.x + vObj.y * 0.7 + vObj.z * 0.3) * 1800.0;
          float tww = fwidth(tw);
          figTint *= 1.0 + 0.07 * sin(tw) * (1.0 - smoothstep(0.35, 1.0, tww));
          figTint *= 0.96 + 0.08 * figNoise3(vObj * 90.0);
        }
        // The inside of a hood, or of a curtain of hair: out of the light.
        if (!gl_FrontFacing) figTint *= 0.3;
        // Skin and hair a shade down: the cabin is lit bright, and pale skin went white under it.
        if (figShown == 0.0 || figShown == 8.0 || figShown == 1.0 || figPart == 10.0) figTint *= 0.84;
        diffuseColor.rgb *= figTint;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor =
          figShown == 0.0 || figShown == 8.0 ? 0.62 :
          figShown == 1.0 ? mix(0.72, 0.5, figSheen) :
          figShown == 5.0 ? 0.36 :
          figShown == 6.0 ? 0.45 :
          figShown == 3.0 ? 0.74 :
          figShown == 7.0 ? 0.55 : 0.86;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (figPart == 9.0) totalEmissiveRadiance += vTintA * figGlow;
        totalEmissiveRadiance += vec3(figGlint) * 0.55;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        /* The cabin's lamps are points, and a point a few centimetres from a
           head lights it without limit: a middle-seat passenger sits right
           under the wash lamp beneath the bins. A real lamp is a panel, not a
           point, so cap what any figure can take from them directly. */
        reflectedLight.directDiffuse = min(reflectedLight.directDiffuse, diffuseColor.rgb * 1.25);
        reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.07));
        float figAo = vLook.w;
        // Skin darkens warm, not grey: light that goes into a crease comes out red.
        vec3 figAoTint = (figShown == 0.0 || figShown == 8.0) ? pow(vec3(figAo), vec3(0.75, 1.1, 1.25)) : vec3(figAo);
        reflectedLight.indirectDiffuse *= figAoTint;
        reflectedLight.indirectSpecular *= figAo;
        reflectedLight.directDiffuse *= mix(vec3(1.0), figAoTint, 0.7);
        reflectedLight.directSpecular *= figAo;
        if (figShown == 2.0 || figShown == 3.0 || figShown == 4.0 || figShown == 7.0) {
          // Cloth's sheen: fibres catch the light edge-on, so a sleeve's outline glows a little.
          float figRim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * figRim * 0.45 * figAo;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'seat-airlines-figure';
  return { material, glow };
}
