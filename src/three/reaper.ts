import * as THREE from 'three';
import {
  PART,
  Builder,
  addPalettes,
  blob,
  capsule,
  cavity,
  nets,
  tube,
  ellipsoid,
  figureMaterial,
  fieldNormal,
  reach,
  smax,
  smin,
  stack,
  touchPalettes,
  v3,
  writePalette,
  type Field,
  type Palette,
  type V3,
} from './figures';
import {
  BODY_OCCLUDERS,
  FIGURE_GROUP,
  HEAD_FROM_NECK,
  NECK,
  PIECE,
  SEAT_WALLS,
  azimuthTable,
  hairLayer,
  meshNormals,
  passengerPieces,
  type HairStyle,
} from './passengers';

/**
 * The passenger nobody booked.
 *
 * Whichever seat you look out from, the one beside it is taken: a hooded
 * figure in a long dark robe, sitting exactly as everybody else on board
 * sits — it is the same body under the cloth — with bone for hands and a
 * skull under the hood. Now and then it turns its head and looks at you.
 *
 * Everything here is built from the passengers' own pieces: the robe is
 * their shirt and trousers let out and hung to the floor, the sleeves are
 * their arms belled open at the wrist, the hands are their hands with the
 * flesh taken off, and the hood is laid over the skull the way a haircut is
 * laid over a head.
 */

const ROBE = 0x132730;
const LINING = 0x070e11;
const BONE = 0xd6cfbd;
const EMBER = 0xff5a2a;

const PALETTE: Palette = {
  skin: BONE,
  hair: ROBE,
  top: ROBE,
  inner: LINING,
  bottom: ROBE,
  shoes: ROBE,
  accent: EMBER,
  legwear: ROBE,
  lips: BONE,
  iris: 0,
  stubble: 0,
};

/** Cloth hangs in folds: a ripple round the body, stronger the lower it falls. */
const fold = (x: number, y: number, z: number, depth: number) =>
  depth * (Math.sin(Math.atan2(x, -z) * 13 + y * 6) * 0.6 + Math.sin(Math.atan2(x, -z) * 29 + y * 11) * 0.4);

/**
 * A hand of bones, laid where a passenger's hand rests on the knee: the two
 * forearm bones out of the sleeve, the wrist, a fan of metacarpals, and
 * three knuckled phalanges to each finger, drooping over the kneecap.
 */
function boneHand(b: Builder, side: 1 | -1) {
  const skin = passengerPieces('m', 0).find((p) => p.kind === PIECE.skin)!;
  const around = (lo: number, hi: number) => {
    const c = v3();
    let n = 0;
    for (let i = 0; i < skin.tip.length; i++) {
      if (skin.tip[i] < lo || skin.tip[i] > hi || skin.pos[i * 3] * side <= 0) continue;
      c.x += skin.pos[i * 3];
      c.y += skin.pos[i * 3 + 1];
      c.z += skin.pos[i * 3 + 2];
      n++;
    }
    return c.multiplyScalar(1 / Math.max(1, n));
  };
  // Up by as much as the robe was let out over the knees, so the bones lie on the cloth.
  const lift = v3(0, 0.022, 0);
  const wrist = around(0.165, 0.2).add(lift);
  const knuckles = around(0.075, 0.095).add(lift);
  const tips = around(0, 0.025).add(lift);
  const along = tips.clone().sub(wrist).setY(0).normalize();
  // Across the back of the hand; the thumb is on the side toward the body's middle.
  const across = v3().crossVectors(v3(0, 1, 0), along).normalize();
  if (across.x * side > 0) across.negate();
  const up = v3(0, 1, 0);
  const look = { part: PART.skin, group: side > 0 ? FIGURE_GROUP.armL : FIGURE_GROUP.armR };
  const bone = (pts: V3[], r: (t: number) => number, steps = 10) =>
    tube(b, pts, (t) => [r(t), r(t)], look, { seg: 7, steps, up: v3(0, 0, 1), capStart: 0.8, capEnd: 0.8 });
  // Knobbly: thick at the joints, thin between.
  const knuckled = (r: number, joints: number) => (t: number) => r * (0.72 + 0.34 * Math.cos(t * Math.PI * 2 * joints) ** 8);
  // Radius and ulna, out of the sleeve.
  for (const k of [-1, 1]) {
    const o = across.clone().multiplyScalar(k * 0.008);
    bone([wrist.clone().addScaledVector(along, -0.09).add(o).addScaledVector(up, 0.01), wrist.clone().add(o)], (t) => 0.0055 * (1 + 0.35 * t ** 4));
  }
  blob(b, wrist.clone().addScaledVector(along, 0.012).addScaledVector(up, 0.004), v3(0.017, 0.008, 0.013), look, { seg: 10, rings: 6 });
  const FINGERS = [
    { off: -0.021, len: [0.04, 0.026, 0.019] },
    { off: -0.007, len: [0.045, 0.029, 0.021] },
    { off: 0.007, len: [0.042, 0.027, 0.02] },
    { off: 0.02, len: [0.033, 0.021, 0.017] },
  ];
  for (const f of FINGERS) {
    const base = wrist.clone().addScaledVector(across, f.off * 0.45).addScaledVector(along, 0.018).addScaledVector(up, 0.006);
    const knuckle = knuckles.clone().addScaledVector(across, f.off).addScaledVector(up, 0.008);
    bone([base, knuckle], knuckled(0.0042, 1), 6);
    // Each joint bends a little further down, over the knee.
    const pts = [knuckle];
    let dir = along.clone().addScaledVector(up, 0.05).normalize();
    for (let k = 0; k < 3; k++) {
      dir.addScaledVector(up, -0.26).normalize();
      pts.push(pts[k].clone().addScaledVector(dir, f.len[k]));
    }
    bone(pts, (t) => 0.0042 * (1 - 0.35 * t) * (0.78 + 0.3 * Math.cos(t * Math.PI * 3) ** 8), 14);
  }
  // The thumb, from the side of the wrist, forward and in.
  const thumbBase = wrist.clone().addScaledVector(across, -0.02).addScaledVector(along, 0.015);
  const t1 = thumbBase.clone().addScaledVector(along, 0.035).addScaledVector(across, -0.01).addScaledVector(up, -0.004);
  const t2 = t1.clone().addScaledVector(along, 0.026).addScaledVector(across, -0.002).addScaledVector(up, -0.008);
  const t3 = t2.clone().addScaledVector(along, 0.02).addScaledVector(up, -0.008);
  bone([thumbBase, t1, t2, t3], (t) => 0.0046 * (1 - 0.3 * t) * (0.78 + 0.3 * Math.cos(t * Math.PI * 3) ** 8), 12);
}

function robeGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  for (const piece of passengerPieces('m', 1)) {
    if (piece.kind === PIECE.head || piece.kind === PIECE.vest || piece.kind === PIECE.buttons || piece.kind === PIECE.shoes) continue;
    const nrm = meshNormals(piece.pos, piece.index);
    const pos = piece.pos.slice();
    const n = pos.length / 3;
    if (piece.kind === PIECE.skin) {
      /* The arms split at the wrist: sleeve above, bone below. Faces go to
         whichever side most of their corners are on. */
      const sleeve = (i: number) => piece.tip[i] > 0.2;
      for (let i = 0; i < n; i++) {
        const t = piece.tip[i];
        if (t > 0.2) {
          // Belled: wide at the wrist, easing in to the shoulder.
          const bell = 0.012 + 0.04 * (1 - THREE.MathUtils.smoothstep(t, 0.2, 0.34));
          const out = bell + fold(pos[i * 3], pos[i * 3 + 1] * 3, pos[i * 3 + 2], 0.003);
          for (let d = 0; d < 3; d++) pos[i * 3 + d] += nrm[i * 3 + d] * out;
        } else {
          // The flesh off the hands: bone is thinner than a finger.
          const thin = 0.0025 * THREE.MathUtils.smoothstep(t, 0.21, 0.15);
          for (let d = 0; d < 3; d++) pos[i * 3 + d] -= nrm[i * 3 + d] * thin;
        }
      }
      for (const wantSleeve of [true]) {
        const index: number[] = [];
        for (let f = 0; f < piece.index.length; f += 3) {
          const corners = [0, 1, 2].map((k) => piece.index[f + k]);
          // A sleeve face is wholly above the wrist; a hand face reaches a little up inside it.
          const keep = wantSleeve ? corners.every(sleeve) : corners.some((i) => piece.tip[i] < 0.23);
          if (keep) index.push(piece.index[f], piece.index[f + 1], piece.index[f + 2]);
        }
        const ns = meshNormals(pos, index);
        b.mesh(pos, ns, index, () => (wantSleeve ? [PART.top, PART.top, 0] : [PART.skin, PART.skin, 0]),
          (i) => (pos[i * 3] > 0 ? FIGURE_GROUP.armL : FIGURE_GROUP.armR), cavity(pos, index, ns, 3));
      }
      continue;
    }
    // Shirt and trousers, let out into a robe.
    const out = piece.kind === PIECE.shirt ? 0.026 : 0.02;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const f = fold(x, y, z, piece.kind === PIECE.shirt ? 0.004 : 0.003);
      for (let d = 0; d < 3; d++) pos[i * 3 + d] += nrm[i * 3 + d] * (out + f);
    }
    const ns = meshNormals(pos, piece.index);
    b.mesh(pos, ns, piece.index, () => [PART.top, PART.top, 0], () => FIGURE_GROUP.torso, cavity(pos, piece.index, ns, 2));
  }

  for (const side of [1, -1] as const) boneHand(b, side);
  // The body shades itself; the skirt and cowl below are loose cloth and are left out of it.
  b.occlude(BODY_OCCLUDERS, SEAT_WALLS);

  /* The skirt of the robe, from the knees to the floor: it hides the legs
     and spreads a little where it meets the carpet. */
  stack(b, [
    { y: 0.1, xh: 0.19, zf: 0.06, zb: 0.1, zc: -0.37, n: 2.6 },
    { y: 0.0, xh: 0.22, zf: 0.09, zb: 0.11, zc: -0.4, n: 2.5 },
    { y: -0.2, xh: 0.24, zf: 0.12, zb: 0.12, zc: -0.43, n: 2.4 },
    { y: -0.42, xh: 0.27, zf: 0.16, zb: 0.13, zc: -0.45, n: 2.3 },
    { y: -0.5, xh: 0.29, zf: 0.19, zb: 0.14, zc: -0.46, n: 2.3 },
  ], { part: PART.top, group: FIGURE_GROUP.legL }, {
    seg: 72,
    sub: 4,
    capTop: true,
    push: (p) => {
      const drop = THREE.MathUtils.smoothstep(-p.y, -0.16, 0.5);
      const r = fold(p.x, p.y * 0.3, p.z + 0.43, 0.012 * (0.3 + drop));
      p.x += (p.x / Math.max(0.05, Math.hypot(p.x, p.z + 0.43))) * r;
      p.z += ((p.z + 0.43) / Math.max(0.05, Math.hypot(p.x, p.z + 0.43))) * r;
    },
  });

  /* A cowl over the shoulders, where the hood's cloth lies. */
  stack(b, [
    { y: 0.4, xh: 0.235, zf: 0.15, zb: 0.14, zc: 0.02, n: 2.2 },
    { y: 0.5, xh: 0.225, zf: 0.12, zb: 0.12, zc: 0.03, n: 2.2 },
    { y: 0.56, xh: 0.16, zf: 0.1, zb: 0.1, zc: 0.0, n: 2.1 },
    { y: 0.6, xh: 0.085, zf: 0.085, zb: 0.075, zc: -0.04, n: 2 },
  ], { part: PART.top, group: FIGURE_GROUP.torso }, {
    seg: 64,
    sub: 3,
    capTop: true,
    push: (p) => {
      const r = fold(p.x, p.y, p.z, 0.004);
      p.x += Math.sign(p.x) * r;
    },
  });

  return b.geometry();
}

/* ── The head: a skull, and the hood over it ─────────────────────────── */

/** Where the jaw hinges — just in front of the ear — and how far it hangs open. */
const HINGE = v3(0, -0.03, 0.004);
const GAPE = 0.13;
const GAPE_COS = Math.cos(-GAPE);
const GAPE_SIN = Math.sin(-GAPE);

/** Teeth along an arch: incisors at the front, molars round the sides. Worked out once. */
const TEETH = Array.from({ length: 7 }, (_, k) => {
  const t = (k + 0.5) / 7;
  const a = t * 1.25;
  return { x: Math.sin(a) * 0.027, dz: (1 - Math.cos(a)) * 0.036, w: 0.0034 + t * 0.0022, d: 0.004 + t * 0.002 };
});

function teeth(ax: number, y: number, z: number, top: number, drop: number, front: number, d: number) {
  // Only worth asking near the tooth row.
  if (Math.abs(y - top - drop * 0.5) > 0.02 || z > front + 0.06) return d;
  for (const t of TEETH) {
    d = smin(d, ellipsoid(ax, y, z, t.x, top + drop * 0.5, front + t.dz, t.w, Math.abs(drop) * 0.62, t.d), 0.0012);
  }
  return d;
}

/**
 * The lower jaw: a horseshoe of bone — the outside of one ellipsoid less the
 * inside of another, cut off behind — with a flat plate rising at each side
 * to the hinge, and the chin's point in front. Evaluated closed, at the point
 * turned back by the gape, so it hangs open.
 */
const mandible: Field = (x, y, z) => {
  if (y > 0.0 || z > 0.03) return 0.05;
  const py = y - HINGE.y, pz = z - HINGE.z;
  const ry = HINGE.y + py * GAPE_COS - pz * GAPE_SIN;
  const rz = HINGE.z + py * GAPE_SIN + pz * GAPE_COS;
  const ax = Math.abs(x);
  let d = ellipsoid(x, ry, rz, 0, -0.092, -0.022, 0.052, 0.016, 0.06);
  d = smax(d, -ellipsoid(x, ry, rz, 0, -0.088, -0.014, 0.043, 0.03, 0.054), 0.004);
  d = smax(d, rz - 0.01, 0.006);
  // The rami: flat plates up to the hinge, behind the cheekbones.
  d = smin(d, ellipsoid(ax, ry, rz, 0.052, -0.062, -0.002, 0.006, 0.032, 0.019), 0.01);
  // The chin's point.
  d = smin(d, ellipsoid(ax, ry, rz, 0.0, -0.1, -0.08, 0.015, 0.009, 0.007), 0.007);
  return teeth(ax, ry, rz, -0.083, 0.012, -0.081, d);
};

/**
 * A human skull: metres from between the eyes, face toward −z. Cranium and
 * forehead; brow ridges over deep round orbits; nasal bridge and the pear of
 * the nasal opening; cheekbones and the arches running back from them to the
 * ear; the upper jaw with its row of teeth; and the mandible, hanging open.
 */
const skull: Field = (x, y, z) => {
  const ax = Math.abs(x);
  // Cranium, with the forehead rising steeply from the brow.
  let d = ellipsoid(x, y, z, 0, 0.03, 0.016, 0.071, 0.076, 0.094);
  d = smin(d, ellipsoid(x, y, z, 0, 0.034, -0.03, 0.064, 0.064, 0.054), 0.02);
  // Brow ridges.
  d = smin(d, capsule(ax, y, z, 0.01, 0.017, -0.083, 0.047, 0.015, -0.07, 0.0075, 0.007), 0.01);
  // Cheekbones, and the zygomatic arches back to the ear.
  d = smin(d, ellipsoid(ax, y, z, 0.044, -0.021, -0.063, 0.011, 0.011, 0.013), 0.012);
  d = smin(d, capsule(ax, y, z, 0.051, -0.024, -0.052, 0.063, -0.023, 0.0, 0.005, 0.0045), 0.008);
  // The upper jaw, narrower than the cheekbones, and the bridge of the nose.
  d = smin(d, ellipsoid(x, y, z, 0, -0.046, -0.06, 0.033, 0.026, 0.03), 0.018);
  d = smin(d, capsule(x, y, z, 0, 0.006, -0.087, 0, -0.017, -0.093, 0.0055, 0.0045), 0.008);
  // Hollows: the temples, and under the cheekbones.
  d = smax(d, -ellipsoid(ax, y, z, 0.076, -0.004, -0.028, 0.013, 0.028, 0.034), 0.01);
  d = smax(d, -ellipsoid(ax, y, z, 0.044, -0.05, -0.052, 0.012, 0.012, 0.022), 0.008);
  // Orbits: round, deep, with sharp rims.
  d = smax(d, -ellipsoid(ax, y, z, 0.029, -0.001, -0.086, 0.0185, 0.0175, 0.036), 0.0035);
  // The nasal opening: a pear, narrow at the top.
  d = smax(d, -ellipsoid(x, y, z, 0, -0.036, -0.094, 0.0105, 0.0145, 0.03), 0.003);
  d = smax(d, -ellipsoid(x, y, z, 0, -0.022, -0.096, 0.005, 0.01, 0.03), 0.003);
  // The ear canal.
  d = smax(d, -ellipsoid(ax, y, z, 0.07, -0.028, 0.008, 0.008, 0.006, 0.006), 0.003);
  // Upper teeth, below the jaw's edge; then the dark of the open mouth behind them.
  d = teeth(ax, y, z, -0.061, -0.012, -0.083, d);
  d = smax(d, -ellipsoid(x, y, z, 0, -0.077, -0.052, 0.024, 0.01, 0.034), 0.003);
  d = smin(d, mandible(x, y, z), 0.007);
  // The top of the spine, down into the collar.
  d = smin(d, capsule(x, y, z, 0, -0.064, 0.03, 0, -0.2, 0.046, 0.017, 0.02), 0.016);
  return d;
};

/** The hood: a haircut, in cloth — down past the face and over the shoulders, peaked at the back. */
const HOOD: HairStyle = {
  pole: v3(0, 0.9, 0.44),
  hairline: azimuthTable([[0, 46], [30, 42], [50, 22], [62, 0], [72, -90], [180, -90]]),
  // Loose over the crown and fuller at the back, where the peak is.
  thick: (el: number, az: number) => 0.032 + 0.034 * THREE.MathUtils.smoothstep(Math.abs(az), 1.5, 3.1) * THREE.MathUtils.smoothstep(el, 0.1, 1.1),
  hang: azimuthTable([[0, 190], [56, 190], [100, 205], [180, 225]], 0.001),
  smooth: true,
  brim: 0.045,
};

function headGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  nets(b, skull, { part: PART.skin, group: FIGURE_GROUP.head }, {
    min: v3(-0.085, -0.215, -0.11),
    max: v3(0.085, 0.115, 0.12),
    cell: 0.0026,
    aoStep: 0.004,
    aoGain: 30,
  });
  /* Inside a hood there is less light the further back you go: the face
     catches some, the sides of the skull very little. And into the orbits,
     the nose and the mouth, none. */
  const hollow = (x: number, y: number, z: number, cx: number, cy: number, r: number) =>
    THREE.MathUtils.smoothstep(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r, 0.9, 1.15) * 0.9 + 0.1 + Math.max(0, -z - 0.09) * 14;
  for (let i = 0; i < b.count; i++) {
    const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2];
    const ax = Math.abs(x);
    let k = 0.45 + 0.55 * THREE.MathUtils.smoothstep(-z - ax * 0.6, -0.02, 0.07);
    if (z < -0.055) {
      k *= Math.min(1, hollow(ax, y, z, 0.029, -0.001, 0.018));
      k *= Math.min(1, hollow(x, y, z, 0, -0.035, 0.012));
    }
    b.look[i * 4 + 3] *= k;
  }
  // Embers, far back in the orbits.
  for (const s of [-1, 1]) {
    blob(b, v3(s * 0.029, -0.002, -0.066), v3(0.004, 0.004, 0.004), { part: PART.glow, group: FIGURE_GROUP.head }, { seg: 10, rings: 6 });
  }
  const surface = (d: V3) => {
    const p = d.clone().multiplyScalar(reach(skull, d));
    return { p, n: fieldNormal(skull, p) };
  };
  hairLayer(b, surface, HOOD, { cols: 72, rows: 26, cards: 0, part: PART.top });
  for (let i = 0; i < b.pos.length; i += 3) {
    b.pos[i] += HEAD_FROM_NECK.x;
    b.pos[i + 1] += HEAD_FROM_NECK.y;
    b.pos[i + 2] += HEAD_FROM_NECK.z;
  }
  return b.geometry();
}

/* ── The sickle ───────────────────────────────────────────────────────── */

/** Where each hand rests on its knee, from the passengers' own hands. */
function handAt(side: 1 | -1) {
  const skin = passengerPieces('m', 0).find((p) => p.kind === PIECE.skin)!;
  const c = v3();
  let n = 0;
  for (let i = 0; i < skin.tip.length; i++) {
    if (skin.tip[i] > 0.09 || skin.pos[i * 3] * side <= 0) continue;
    c.x += skin.pos[i * 3];
    c.y += skin.pos[i * 3 + 1];
    c.z += skin.pos[i * 3 + 2];
    n++;
  }
  return c.multiplyScalar(1 / Math.max(1, n));
}

/**
 * A sickle, in the hand on the knee: the handle lies along the thigh under
 * the palm and the blade comes up off its end in a crescent, curving back
 * toward whoever holds it — tall enough to rise past the shoulder, short
 * enough to clear the bins over a window seat.
 */
function sickle(side: 1 | -1) {
  const group = new THREE.Group();
  const hand = handAt(side);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc3cacf, metalness: 0.55, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x55595c, metalness: 0.5, roughness: 0.45 });
  // The handle, from behind the wrist to past the fingertips.
  const back = hand.clone().add(v3(0, 0.022, 0.07));
  const front = hand.clone().add(v3(0, 0.03, -0.11));
  const length = back.distanceTo(front);
  const handleGeo = new THREE.CylinderGeometry(0.0125, 0.0145, length, 14, 1);
  handleGeo.rotateX(Math.PI / 2);
  const handle = new THREE.Mesh(handleGeo, wood);
  handle.position.copy(back).lerp(front, 0.5);
  handle.lookAt(front.clone().add(group.position));
  group.add(handle);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.022, 14).rotateX(Math.PI / 2), iron);
  ferrule.position.copy(front);
  ferrule.lookAt(front.clone().add(front.clone().sub(back)));
  group.add(ferrule);
  // The blade: the outside of one arc less the inside of another, in the plane of the handle.
  const R = 0.165;
  const shape = new THREE.Shape();
  const STEPS = 40;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS;
    const a = t * Math.PI * 1.22;
    const w = 0.042 * (1 - t) ** 0.8;
    // s is forward from the ferrule, h is up from it.
    outer.push([Math.sin(a) * R, R - Math.cos(a) * R]);
    inner.push([Math.sin(a) * (R - w), R - Math.cos(a) * (R - w) + w * 0.15]);
  }
  shape.moveTo(outer[0][0], outer[0][1]);
  for (const [a, b] of outer.slice(1)) shape.lineTo(a, b);
  for (const [a, b] of inner.reverse()) shape.lineTo(a, b);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 4 });
  bladeGeo.translate(0, 0, -0.0015);
  // Shape x is forward (−z), shape y is up, extrusion is across (x).
  bladeGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  const blade = new THREE.Mesh(bladeGeo, steel);
  blade.position.copy(front).add(v3(0, 0.004, -0.008));
  group.add(blade);
  const dispose = () => {
    handleGeo.dispose();
    (ferrule.geometry as THREE.BufferGeometry).dispose();
    bladeGeo.dispose();
    wood.dispose();
    steel.dispose();
    iron.dispose();
  };
  return { group, dispose };
}

export interface ReaperHandles {
  group: THREE.Group;
  /** Turn its head: toward `eye`, a point in the world, now and then. */
  update: (nowMs: number, eye: THREE.Vector3 | null) => void;
  /** Which hand holds the sickle: +1 for the one at +x. */
  setSide: (side: 1 | -1) => void;
  dispose: () => void;
}

let shared: { robe: THREE.BufferGeometry; head: THREE.BufferGeometry } | null = null;

/**
 * One reaper. Its group's origin is the seat cushion under it, like any
 * passenger's: put it at the seat, and it sits. `setSide` puts the sickle in
 * the hand nearer the viewer: +1 for the hand at +x.
 */
export function createReaper(): ReaperHandles {
  const group = new THREE.Group();
  group.name = 'reaper';
  const { material, glow } = figureMaterial({ headCentre: HEAD_FROM_NECK, side: THREE.DoubleSide });
  const neck = new THREE.Group();
  neck.position.copy(NECK);
  neck.rotation.order = 'YXZ';
  group.add(neck);
  let side: 1 | -1 = 1;
  let blades: Record<1 | -1, ReturnType<typeof sickle>> | null = null;
  const setSide = (s: 1 | -1) => {
    side = s;
    if (!blades) return;
    blades[1].group.visible = side === 1;
    blades[-1].group.visible = side === -1;
  };
  /* Carving the skull is the slowest thing on board, so the reaper takes
     its seat a moment after the cabin appears rather than holding it up. */
  let disposed = false;
  const build = () => {
    if (disposed) return;
    shared ??= { robe: robeGeometry(), head: headGeometry() };
    const one = (g: THREE.BufferGeometry) => {
      const geo = g.clone();
      addPalettes(geo, 1);
      writePalette(geo, 0, PALETTE);
      touchPalettes(geo);
      const mesh = new THREE.InstancedMesh(geo, material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      mesh.frustumCulled = false;
      return mesh;
    };
    group.add(one(shared.robe));
    neck.add(one(shared.head));
    blades = { [1]: sickle(1), [-1]: sickle(-1) } as Record<1 | -1, ReturnType<typeof sickle>>;
    group.add(blades[1].group, blades[-1].group);
    setSide(side);
  };
  if (shared) build();
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: 1500 });
  else setTimeout(build, 80);

  const local = new THREE.Vector3();
  let yaw = 0;
  let last = 0;
  const update = (nowMs: number, eye: THREE.Vector3 | null) => {
    const dt = last ? Math.min(0.1, (nowMs - last) / 1000) : 0;
    last = nowMs;
    // It looks ahead, as a passenger would, and every so often turns to you.
    const cycle = (nowMs / 1000) % 16;
    const stare = THREE.MathUtils.smoothstep(cycle, 5, 6.5) * (1 - THREE.MathUtils.smoothstep(cycle, 11, 12.5));
    let want = Math.sin(nowMs / 3100) * 0.06;
    if (eye) {
      group.updateWorldMatrix(true, false);
      local.copy(eye);
      group.worldToLocal(local).sub(NECK).sub(HEAD_FROM_NECK);
      const toward = THREE.MathUtils.clamp(Math.atan2(-local.x, -local.z), -1.35, 1.35);
      want = THREE.MathUtils.lerp(want, toward, stare);
    }
    yaw += (want - yaw) * Math.min(1, dt * 2.2);
    neck.rotation.set(0.05 + stare * 0.08, yaw, stare * 0.1 * Math.sign(yaw), 'YXZ');
    glow.value = 1.2 + 0.8 * Math.sin(nowMs / 420) * Math.sin(nowMs / 1300);
  };

  const dispose = () => {
    disposed = true;
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.geometry.dispose();
    });
    material.dispose();
    blades?.[1].dispose();
    blades?.[-1].dispose();
  };

  return { group, update, setSide, dispose };
}
