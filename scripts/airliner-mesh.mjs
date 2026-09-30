/*
 * Build the airliner's body and engines from the faces scripts/skp-faces.py
 * reads out of the SketchUp model, and write them to src/three/airlinerMesh.ts.
 *
 *   python3 scripts/skp-faces.py model.skp > faces.json
 *   node scripts/airliner-mesh.mjs faces.json
 *
 * The model is an A320 in another airline's livery. What is kept is its
 * fuselage — nose, flight-deck glass, doors, belly fairing, tail cone — and
 * its engines, nacelle, core and pylon; the wings, tail surfaces and gear are
 * left, since the airframe's own animated panels fly those. Everything kept
 * is repainted into this airline's scheme: the other livery's titles and
 * marks are cut into the skin as faces of their own, so they are painted
 * over rather than removed, which would leave holes.
 *
 * It is turned into the airframe's frame (y up, nose toward -z, starboard +x),
 * scaled so its cabin is the airframe's tube, and slid along so its wing root
 * sits where the airframe's wing does.
 */
import fs from 'node:fs';
import * as THREE from 'three';

const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const INCH = 0.0254;

// Measured off the model: the cabin's axis, its radius, and the wing's leading
// edge seven metres out.
const AXIS_X = 17.27, AXIS_Z = 3.945, RADIUS = 1.9775;
const SCALE = 1.85 / RADIUS;
const WING_LE_Y = 17.81, WING_LE_AT = 10.08;
const toFrame = ([x, y, z]) => new THREE.Vector3(
  (AXIS_X - x * INCH) * SCALE,
  (z * INCH - AXIS_Z) * SCALE,
  (y * INCH - WING_LE_Y) * SCALE + WING_LE_AT,
);

/** What each part is painted: its index in the airframe's own materials. */
const PART = { skin: 0, glass: 1, seam: 2, cowl: 3, lip: 4, intake: 5, core: 6, pylon: 7 };

const materialName = (m) => (m < 0 ? 'default' : m === 19 ? 'snapshot' : src.materials[m - 21]?.name ?? 'default');

function partOf(face, centre) {
  const name = materialName(face.mat);
  const path = face.path;
  if (path === '/Group#276') {
    if (name === '[Color_006]') return PART.seam;
    // Flight-deck glass up at the nose; the cabin windows are the airframe's
    // own, one a row, lit by who has booked it — so these are painted over.
    if ((name === '<Gray Glass>' || name === '<Black>') && centre.z < -1.2 && centre.y > 0.2) return PART.glass;
    return PART.skin;
  }
  if (path.endsWith('/Group#197')) {
    if (name === 'jean blue1') return PART.cowl;
    if (name === '<Silver>') return PART.lip;
    return PART.intake;
  }
  if (path.endsWith('/Group#199')) return PART.core;
  if (path.endsWith('/Group#198') || path.endsWith('/Group#200')) return PART.pylon;
  return -1;
}

// ── Triangulate ────────────────────────────────────────────────────────
const tris = [];
for (const face of src.faces) {
  const loops = face.loops.map((l) => l.map(toFrame)).filter((l) => l.length >= 3);
  if (!loops.length) continue;
  const outer = loops[0];
  const n = new THREE.Vector3();
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], c = outer[(i + 1) % outer.length];
    n.x += (a.y - c.y) * (a.z + c.z);
    n.y += (a.z - c.z) * (a.x + c.x);
    n.z += (a.x - c.x) * (a.y + c.y);
  }
  if (n.lengthSq() < 1e-12) continue;
  n.normalize();
  const centre = outer.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / outer.length);
  const part = partOf(face, centre);
  if (part < 0) continue;
  const u = new THREE.Vector3().crossVectors(Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const flat = (p) => new THREE.Vector2(p.dot(u), p.dot(v));
  const all = loops.flat();
  let out;
  try {
    out = THREE.ShapeUtils.triangulateShape(outer.map(flat), loops.slice(1).map((l) => l.map(flat)));
  } catch {
    continue;
  }
  for (const t of out) {
    const [a, c, d] = t.map((k) => all[k]);
    // Wind each triangle to face the way its polygon does.
    const tn = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, a));
    if (tn.lengthSq() < 1e-14) continue;
    tris.push(tn.dot(n) >= 0 ? { p: [a, c, d], n, part } : { p: [a, d, c], n, part });
  }
}

// ── Normals: smooth across soft edges, sharp across creases ────────────
const CREASE = Math.cos(THREE.MathUtils.degToRad(32));
const key = (p) => `${Math.round(p.x * 2000)},${Math.round(p.y * 2000)},${Math.round(p.z * 2000)}`;
const around = new Map();
for (const t of tris) for (const p of t.p) {
  const k = key(p);
  if (!around.has(k)) around.set(k, []);
  around.get(k).push(t);
}
const vertices = [];
const index = [];
const seen = new Map();
for (const t of tris) {
  for (const p of t.p) {
    const nn = new THREE.Vector3();
    for (const o of around.get(key(p))) if (o.part === t.part && o.n.dot(t.n) > CREASE) nn.add(o.n);
    nn.normalize();
    const k = `${key(p)}|${Math.round(nn.x * 60)},${Math.round(nn.y * 60)},${Math.round(nn.z * 60)}|${t.part}`;
    let i = seen.get(k);
    if (i === undefined) {
      i = vertices.length;
      seen.set(k, i);
      vertices.push({ p, n: nn, part: t.part });
    }
    index.push(i);
  }
}

// ── Measure what the airframe needs to know ─────────────────────────────
const skin = vertices.filter((v) => v.part === PART.skin);
const zs = skin.map((v) => v.p.z);
const noseZ = Math.min(...zs), tailZ = Math.max(...zs);
/* The fuselage by station, sliced: every skin triangle that crosses the
   station contributes the segment where it does, so the section is whole
   however the faces happen to be cut. Radius is the half-width; the axis is
   a radius down from the crown, which follows the tail's upsweep and is not
   pulled about by the belly fairing. */
const skinTris = tris.filter((t) => t.part === PART.skin);
const section = (z) => {
  const pts = [];
  for (const t of skinTris) {
    for (let k = 0; k < 3; k++) {
      const a = t.p[k], c = t.p[(k + 1) % 3];
      if ((a.z - z) * (c.z - z) > 0 || a.z === c.z) continue;
      const u = (z - a.z) / (c.z - a.z);
      pts.push(new THREE.Vector3().lerpVectors(a, c, u));
    }
  }
  return pts;
};
const raw = [];
for (let z = Math.ceil(noseZ * 4) / 4 + 0.25; z < tailZ; z += 0.5) {
  const pts = section(z);
  if (pts.length < 6) continue;
  const r = Math.max(...pts.map((p) => Math.abs(p.x)));
  const crown = pts.filter((p) => Math.abs(p.x) < r * 0.35);
  if (!crown.length) continue;
  const top = Math.max(...crown.map((p) => p.y));
  raw.push([z, r, top - r]);
}
// A three-station median, against any slice that caught a door edge or an aerial.
const median = (a, b, c) => [a, b, c].sort((x, y) => x - y)[1];
const profile = raw.map((row, i) => {
  const lo = raw[Math.max(0, i - 1)], hi = raw[Math.min(raw.length - 1, i + 1)];
  return [+row[0].toFixed(2), +median(lo[1], row[1], hi[1]).toFixed(3), +median(lo[2], row[2], hi[2]).toFixed(3)];
});
const starboard = vertices.filter((v) => v.part === PART.cowl && v.p.x > 0);
const bounds = (vs) => {
  const b = new THREE.Box3();
  for (const v of vs) b.expandByPoint(v.p);
  return b;
};
const cowl = bounds(starboard);
const intake = bounds(vertices.filter((v) => (v.part === PART.intake || v.part === PART.lip) && v.p.x > 0));
const engine = {
  x: +((cowl.min.x + cowl.max.x) / 2).toFixed(3),
  y: +((cowl.min.y + cowl.max.y) / 2).toFixed(3),
  z: +((cowl.min.z + cowl.max.z) / 2).toFixed(3),
  front: +cowl.min.z.toFixed(3),
  back: +bounds(vertices.filter((v) => v.part === PART.core && v.p.x > 0)).max.z.toFixed(3),
  radius: +((cowl.max.y - cowl.min.y) / 2).toFixed(3),
  intake: +intake.min.z.toFixed(3),
};

// ── Pack ───────────────────────────────────────────────────────────────
const box = bounds(vertices);
const span = box.getSize(new THREE.Vector3());
const n = vertices.length;
const buf = Buffer.alloc(n * 6 + n * 3 + n + index.length * 2);
let o = 0;
for (const v of vertices) {
  for (const k of ['x', 'y', 'z']) { buf.writeUInt16LE(Math.round(((v.p[k] - box.min[k]) / span[k]) * 65535), o); o += 2; }
}
for (const v of vertices) for (const k of ['x', 'y', 'z']) buf.writeInt8(Math.round(v.n[k] * 127), o++);
for (const v of vertices) buf.writeUInt8(v.part, o++);
for (const i of index) { buf.writeUInt16LE(i, o); o += 2; }
if (n > 65535) throw new Error('too many vertices for 16-bit indices');
const b64 = buf.toString('base64');
const lines = b64.match(/.{1,100}/g);
const f3 = (v) => `[${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)}]`;
fs.writeFileSync('src/three/airlinerMesh.ts', `/* Generated by scripts/airliner-mesh.mjs from the A320 model; do not edit. */

/**
 * The airliner's fuselage and engines, in the airframe's frame: metres, y up,
 * the nose toward -z, starboard +x. Parts: ${Object.entries(PART).map(([k, v]) => `${v} ${k}`).join(', ')}.
 */
export const AIRLINER_MESH = {
  vertices: ${n},
  triangles: ${index.length / 3},
  min: ${f3(box.min)},
  span: ${f3(span)},
  noseZ: ${noseZ.toFixed(3)},
  tailZ: ${tailZ.toFixed(3)},
  /** The starboard engine: its centre, the front and back of it, its radius, and the fan face. */
  engine: ${JSON.stringify(engine)},
  /** The fuselage by station: z, radius, and how far its axis sits above the cabin's. */
  profile: ${JSON.stringify(profile)},
  /** Uint16 x3 positions, Int8 x3 normals, a Uint8 part each, then Uint16 x3 triangles. */
  data:
${lines.map((l) => `    '${l}'`).join(' +\n')},
} as const;
`);
console.log(`${n} vertices, ${index.length / 3} triangles, ${buf.length} bytes; nose ${noseZ.toFixed(2)}, tail ${tailZ.toFixed(2)}`);
console.log('engine', engine);
console.log('profile', profile.length, 'stations');
