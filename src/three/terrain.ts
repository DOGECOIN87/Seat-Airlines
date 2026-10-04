import * as THREE from 'three';
import { periodicNoise } from './noise';
import { insidePolygon, seededRandom, type BoatKind, type BoatSpot, type BuildingSpot, type LandProps, type PylonSpot, type TreeKind, type TreeSpot } from './props';

/**
 * The ground, as a texture rather than geometry.
 *
 * From a cruising altitude the interesting thing about land is its pattern —
 * field boundaries, a coastline, roads — not its relief. Painting that into a
 * repeating texture and laying it on a single large plane costs one draw call
 * and reads correctly from every altitude the flight reaches, where a
 * displaced mesh dense enough to hold up would cost hundreds of thousands of
 * vertices for detail nobody can see from 30,000 feet.
 */


/** Metres to one repeat of the ground tile: the plate is 120 km at 40 repeats. */
export const TILE_METRES = 3000;
/** Metres from the lowest valley floor to the highest hilltop. */
export const HILL_HEIGHT = 280;

const smooth01 = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};


/**
 * Farmland: irregular fields, woodland, water and the lanes between them.
 *
 * The fields are cut by recursive subdivision rather than laid on a grid. A
 * grid was the tell — from altitude it read as one tile repeated, because it
 * was, and the eye finds a regular lattice long before it finds a pattern in
 * field colour. Splitting a rectangle at a jittered line, again and again,
 * gives what enclosure actually produced: a few large fields, many small ones,
 * and boundaries that run for a while and then stop.
 */
export interface GroundTextures {
  /** What the land looks like lit. */
  day: THREE.CanvasTexture;
  /** What of it is still visible once the sun has gone: an emissive map. */
  night: THREE.CanvasTexture;
  /**
   * The lakes: their colour, and in alpha how much of the land they cover.
   * Not a surface of its own — the ground blends it in (see `lakeShader`).
   */
  water: THREE.CanvasTexture;
  /**
   * The relief: grey, 0 at the valley floors to 1 at the tops, scaled by
   * `HILL_HEIGHT`. Smooth enough to be sampled every hundred metres or so
   * by a displaced mesh without crawling as it scrolls.
   */
  height: THREE.CanvasTexture;
  /** The same relief, with finer detail, as a tangent-space normal map. */
  normal: THREE.CanvasTexture;
  /** The trees and buildings painted on it, for the scenery to raise (see `props.ts`). */
  props: LandProps;
}

export function farmlandTextures(size = 2048): GroundTextures {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;

  /* The night map is painted in the same pass, in the same coordinates, as
     the day one — which is the whole reason they are generated together: a
     town's lights have to be where the town is. Two passes over two
     independent random streams would put a city's glow in a field. */
  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  const n = nc.getContext('2d') as CanvasRenderingContext2D;
  n.fillStyle = '#000000';
  n.fillRect(0, 0, size, size);

  const wc = document.createElement('canvas');
  wc.width = wc.height = size;
  const w = wc.getContext('2d') as CanvasRenderingContext2D;

  g.fillStyle = '#4a5c3a';
  g.fillRect(0, 0, size, size);

  /* A working landscape is pasture next to plough next to rape in flower next
     to stubble. That variety is the only thing that makes the ground legible
     enough to see moving underneath you from six thousand feet. */
  const greens = [
    '#4c6b34', '#3d5a2b', '#628040', '#7d9048', // pasture and cereal
    '#8a6f42', '#6d5334', '#9c8354',            // ploughed and fallow
    '#c9bd52', '#b8a94a',                       // rape and stubble
    '#2f4a26', '#56743a', '#455f30',
  ];

  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };

  /* ── The lie of the land ────────────────────────────────────────────────
     One height field for the tile, shared by everything that should follow
     the relief: the displaced ground mesh, the normal map that lights its
     slopes, the lakes that settle in its hollows, the river that runs down
     its valley and the woods that climb its high ground. Two resolutions
     of it: `heights`, smooth enough for geometry, and `detail`, the finer
     undulation only the light is shown. */
  const HR = 256;
  /** The river's course, in tile units: v along the tile, for u across it. */
  const riverAt = (u: number) => 0.62 + Math.sin(u * Math.PI * 2) * 0.1;
  const heights = new Float32Array(HR * HR);
  const detail = new Float32Array(HR * HR);
  {
    const o1 = periodicNoise(HR, 4, 0x51ed);
    const o2 = periodicNoise(HR, 8, 0x2bd1);
    const o3 = periodicNoise(HR, 16, 0x7a3c);
    const o4 = periodicNoise(HR, 32, 0x1e97);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < heights.length; i++) {
      const v = o1[i] + o2[i] * 0.45;
      heights[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      detail[i] = (o3[i] - 0.5) * 0.2 + (o4[i] - 0.5) * 0.08;
    }
    for (let y = 0; y < HR; y++) {
      const v = y / HR;
      for (let x = 0; x < HR; x++) {
        const i = y * HR + x;
        // Normalised, then shaped: broad valley floors, rounded tops.
        const h = Math.pow((heights[i] - lo) / (hi - lo), 1.3);
        // The river owns its valley: the ground falls to it from ~600 m out.
        let d = Math.abs(v - riverAt(x / HR));
        d = Math.min(d, 1 - d);
        const valley = smooth01((d - 0.025) / 0.18);
        heights[i] = h * valley;
        detail[i] *= valley;
      }
    }
  }
  const heightAt = (u: number, v: number) => {
    const x = ((Math.floor(u * HR) % HR) + HR) % HR;
    const y = ((Math.floor(v * HR) % HR) + HR) % HR;
    return heights[y * HR + x];
  };

  /* Lakes settle where water would: in the hollows, clear of the river and
     of each other. No two alike: farm ponds a few dozen metres across,
     round lakes, long ribbon lakes curving down a valley, and lobed ones
     with bays and headlands — each turned its own way, with a shore made of
     several waves of different lengths, so it reads as water that found its
     level rather than a stamp. Each gets a flat basin carved well past its
     shore, following that shore — wide enough that a mesh sampling the
     ground every hundred metres still lays the lake bed flat, so the water
     painted on it lies level rather than up a slope. */
  interface Lake {
    u: number; v: number; r: number; aspect: number; rot: number; bend: number;
    waves: [number, number, number][];
  }
  const lakes: Lake[] = [];
  const wrapped = (a: number) => Math.min(Math.abs(a), 1 - Math.abs(a));
  /** The shore's distance from the middle at angle `a`, before stretching: tile units. */
  const shoreR = (l: Lake, a: number) => {
    let k = 1;
    for (const [n, amp, phase] of l.waves) k += amp * Math.cos(n * a + phase);
    return l.r * Math.max(0.35, k);
  };
  /** A point of the shore at angle `a`, in tile units. */
  const shoreAt = (l: Lake, a: number): [number, number] => {
    const rr = shoreR(l, a);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * l.aspect + (l.bend * x * x) / l.r;
    const c = Math.cos(l.rot);
    const sn = Math.sin(l.rot);
    return [l.u + x * c - y * sn, l.v + x * sn + y * c];
  };
  /** How far outside the shore a point is, roughly, in tile units: negative inside. */
  const outside = (l: Lake, du: number, dv: number) => {
    const c = Math.cos(-l.rot);
    const sn = Math.sin(-l.rot);
    const x = du * c - dv * sn;
    let y = du * sn + dv * c;
    y -= (l.bend * x * x) / l.r;
    const ys = y / l.aspect;
    const a = Math.atan2(ys, x);
    return (Math.hypot(x, ys) - shoreR(l, a)) * THREE.MathUtils.lerp(1, l.aspect, Math.abs(Math.sin(a)));
  };
  const KINDS = ['pond', 'pond', 'pond', 'round', 'round', 'ribbon', 'ribbon', 'lobed', 'lobed', 'large'] as const;
  for (let tries = 0; tries < 1400 && lakes.length < 14; tries++) {
    const u = rand();
    const v = rand();
    const kind = KINDS[Math.floor(rand() * KINDS.length)];
    const waves: [number, number, number][] = [];
    // Fine wobble on every shore: the coves and points.
    for (let n = 6; n <= 11; n += 1 + Math.floor(rand() * 2)) waves.push([n, 0.015 + rand() * 0.035, rand() * 6.283]);
    let r: number, aspect: number, bend = 0;
    if (kind === 'pond') {
      r = 0.004 + rand() * 0.006;
      aspect = 0.6 + rand() * 0.4;
      waves.push([2, rand() * 0.12, rand() * 6.283]);
    } else if (kind === 'large') {
      // A big lake, half a kilometre and more: bays, arms and a headland or two.
      r = 0.075 + rand() * 0.035;
      aspect = 0.55 + rand() * 0.35;
      bend = (rand() - 0.5) * 0.4;
      for (const n of [2, 3, 4, 5]) waves.push([n, 0.07 + rand() * 0.12, rand() * 6.283]);
    } else if (kind === 'round') {
      r = 0.016 + rand() * 0.022;
      aspect = 0.62 + rand() * 0.38;
      for (const n of [2, 3, 4, 5]) waves.push([n, 0.04 + rand() * 0.1, rand() * 6.283]);
    } else if (kind === 'ribbon') {
      r = 0.035 + rand() * 0.035;
      aspect = 0.16 + rand() * 0.16;
      bend = (rand() - 0.5) * 1.2;
      for (const n of [2, 3]) waves.push([n, 0.05 + rand() * 0.08, rand() * 6.283]);
    } else {
      r = 0.026 + rand() * 0.026;
      aspect = 0.7 + rand() * 0.3;
      waves.push([2 + Math.floor(rand() * 2), 0.24 + rand() * 0.16, rand() * 6.283]);
      waves.push([4 + Math.floor(rand() * 2), 0.08 + rand() * 0.08, rand() * 6.283]);
    }
    const reach = r * 1.5;
    if (heightAt(u, v) > (kind === 'pond' ? 0.3 : kind === 'large' ? 0.16 : 0.2)) continue;
    if (kind === 'large' && lakes.some((l) => l.r > 0.07)) continue;
    if (wrapped(v - riverAt(u)) < reach + 0.05) continue;
    if (lakes.some((l) => Math.hypot(wrapped(l.u - u), wrapped(l.v - v)) < (l.r + r) * 1.5 + 0.09)) continue;
    lakes.push({ u, v, r, aspect, rot: rand() * Math.PI, bend, waves });
  }
  for (const lake of lakes) {
    const margin = 0.05;
    const reach = lake.r * 1.6 + margin + 0.1;
    const span = Math.ceil(reach * HR);
    const cx = lake.u * HR;
    const cy = lake.v * HR;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const out = outside(lake, dx / HR, dy / HR);
        if (out > margin + 0.1) continue;
        const x = ((Math.round(cx + dx) % HR) + HR) % HR;
        const y = ((Math.round(cy + dy) % HR) + HR) % HR;
        const k = smooth01((out - margin) / 0.1);
        heights[y * HR + x] *= k;
        detail[y * HR + x] *= k;
      }
    }
  }

  interface Field { x: number; y: number; w: number; h: number }
  const fields: Field[] = [];

  /* Split until a rectangle is small enough to be a field. Splitting the
     longer side keeps them broadly squarish; the jitter keeps them from
     being halves. */
  const split = (f: Field, depth: number) => {
    const small = size / 22;
    if (depth > 7 || (f.w < small && f.h < small) || (f.w < small * 0.6 || f.h < small * 0.6)) {
      fields.push(f);
      return;
    }
    // Some fields simply stop dividing, which is where the big ones come from.
    if (depth > 3 && rand() < 0.28) {
      fields.push(f);
      return;
    }
    const cut = 0.32 + rand() * 0.36;
    if (f.w > f.h) {
      const w = f.w * cut;
      split({ x: f.x, y: f.y, w, h: f.h }, depth + 1);
      split({ x: f.x + w, y: f.y, w: f.w - w, h: f.h }, depth + 1);
    } else {
      const h = f.h * cut;
      split({ x: f.x, y: f.y, w: f.w, h }, depth + 1);
      split({ x: f.x, y: f.y + h, w: f.w, h: f.h - h }, depth + 1);
    }
  };
  split({ x: 0, y: 0, w: size, h: size }, 0);

  /* Trees the scenery will stand up where they are painted: orchard rows and
     hedgerow oaks, in canvas pixels (see `props.ts`). Recorded as drawn, off
     the same random stream, so the painting itself is unchanged. */
  const orchardTrees: [number, number][] = [];
  const hedgerowTrees: [number, number, number][] = [];
  // And the woods, as the outlines they are painted with.
  const uplandWoods: [number, number][][] = [];
  const lowlandWoods: [number, number][][] = [];

  for (const f of fields) {
    g.fillStyle = greens[Math.floor(rand() * greens.length)];
    g.fillRect(f.x, f.y, f.w + 1, f.h + 1);

    /* A field is not one flat colour: crops ripen unevenly, ground drains
       unevenly, and from altitude that reads as a soft gradient across each
       field rather than as noise. One corner-to-corner wash per field is the
       cheapest thing that stops the patchwork reading as printed. */
    const washed = g.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
    const wash = 0.05 + rand() * 0.07;
    if (rand() > 0.5) {
      washed.addColorStop(0, `rgba(255,244,214,${wash})`);
      washed.addColorStop(1, `rgba(24,32,18,${wash})`);
    } else {
      washed.addColorStop(0, `rgba(24,32,18,${wash})`);
      washed.addColorStop(1, `rgba(255,244,214,${wash})`);
    }
    g.fillStyle = washed;
    g.fillRect(f.x, f.y, f.w + 1, f.h + 1);

    // Plough lines: the corduroy that tells you which way a field was worked.
    if (rand() < 0.42) {
      const along = f.w > f.h;
      const step = 5 + rand() * 7;
      g.save();
      g.beginPath();
      g.rect(f.x, f.y, f.w, f.h);
      g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.10)';
      g.lineWidth = 1.4;
      g.beginPath();
      if (along) {
        for (let y = f.y; y < f.y + f.h; y += step) { g.moveTo(f.x, y); g.lineTo(f.x + f.w, y); }
      } else {
        for (let x = f.x; x < f.x + f.w; x += step) { g.moveTo(x, f.y); g.lineTo(x, f.y + f.h); }
      }
      g.stroke();
      g.restore();
    }

    // An orchard, occasionally: rows of trees on a grid, unmistakable from
    // the air and different in kind from any plough line.
    if (rand() < 0.05 && f.w > size / 40 && f.h > size / 40) {
      g.fillStyle = 'rgba(30,48,24,0.75)';
      const step = 8 + rand() * 4;
      for (let y = f.y + step / 2; y < f.y + f.h - 2; y += step) {
        for (let x = f.x + step / 2; x < f.x + f.w - 2; x += step) {
          const tx = x + (rand() - 0.5) * 1.5;
          const ty = y + (rand() - 0.5) * 1.5;
          g.beginPath();
          g.arc(tx, ty, 1.7, 0, Math.PI * 2);
          g.fill();
          orchardTrees.push([tx, ty]);
        }
      }
    }

    // Hedgerow along the boundary — what actually makes farmland read as farmland.
    g.strokeStyle = 'rgba(28,40,22,0.42)';
    g.lineWidth = 2;
    g.strokeRect(f.x, f.y, f.w, f.h);

    /* Hedgerow trees: the lone oaks that stand along old boundaries. Dotted
       down one side of a third of the fields, they give the lattice the
       irregular punctuation a real one has. */
    if (rand() < 0.34) {
      g.fillStyle = 'rgba(24,38,19,0.8)';
      const along = rand() > 0.5;
      const run = along ? f.w : f.h;
      for (let d = 4 + rand() * 10; d < run - 3; d += 9 + rand() * 16) {
        const x = along ? f.x + d : f.x + (rand() > 0.5 ? f.w : 0);
        const y = along ? f.y + (rand() > 0.5 ? f.h : 0) : f.y + d;
        const r = 1.3 + rand() * 1.6;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        hedgerowTrees.push([x, y, r]);
      }
    }
  }

  /* ── The land's shape, in its colours ─────────────────────────────────
     The tops read a shade paler and drier than the valleys under them, and
     woods climb the high ground, where the plough gives up first. Both come
     off the same height field the mesh is displaced by, so the woods really
     are on the hills and the lushest fields really are in the valleys. */
  {
    const tint = document.createElement('canvas');
    tint.width = tint.height = HR;
    const tg = tint.getContext('2d') as CanvasRenderingContext2D;
    const img = tg.createImageData(HR, HR);
    for (let i = 0; i < heights.length; i++) {
      const v = Math.round(Math.min(1, Math.max(0, 0.5 + (heights[i] + detail[i] - 0.3) * 0.9)) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    g.save();
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.36;
    g.drawImage(tint, 0, 0, size, size);
    g.restore();

    const GRID = 64;
    g.fillStyle = '#243d1d';
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const u = (gx + rand()) / GRID;
        const v = (gy + rand()) / GRID;
        if (rand() > smooth01((heightAt(u, v) - 0.45) / 0.3) * 0.8) continue;
        const r = size * (0.005 + rand() * 0.011);
        const poly: [number, number][] = [];
        g.beginPath();
        for (let a = 0; a < 9; a++) {
          const t = (a / 9) * Math.PI * 2;
          const rr = r * (0.65 + rand() * 0.7);
          const px = u * size + Math.cos(t) * rr;
          const py = v * size + Math.sin(t) * rr;
          if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
          poly.push([px, py]);
        }
        g.closePath();
        g.fill();
        uplandWoods.push(poly);
      }
    }
  }

  /* Water is a layer of its own, which the ground blends in, so it can
     disappear with altitude instead of staining the farmland when the
     aircraft climbs above the low-level detail range. Seeded basins keep
     every flight consistent while still breaking the regular field pattern
     with natural silhouettes. */
  const water = ['#2f7792', '#286b87', '#3b8ca0', '#245e7b'];
  const lakeShores: [number, number][][] = [];
  w.lineJoin = 'round';
  w.lineCap = 'round';
  for (const [i, lake] of lakes.entries()) {
    // Fine enough that a crenellated shore stays a curve; ponds need few.
    const points = lake.r < 0.012 ? 28 : 72;
    const base: [number, number][] = [];
    for (let p = 0; p < points; p++) {
      const [u, v] = shoreAt(lake, (p / points) * Math.PI * 2);
      base.push([u * size, v * size]);
    }
    const reach = lake.r * 1.8 * size;
    // Drawn again across any edge of the tile it reaches over, so the tiling never cuts a lake in half.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const x = size * lake.u + ox;
        const y = size * lake.v + oy;
        if (x + reach < 0 || x - reach > size || y + reach < 0 || y - reach > size) continue;
        const shore = base.map(([px, py]): [number, number] => [px + ox, py + oy]);
        w.beginPath();
        shore.forEach(([px, py], p) => (p === 0 ? w.moveTo(px, py) : w.lineTo(px, py)));
        lakeShores.push(shore);
        w.closePath();
        w.fillStyle = water[i % water.length];
        w.globalAlpha = 0.78;
        w.fill();
        w.globalAlpha = 1;
        w.strokeStyle = 'rgba(171,224,228,0.62)';
        w.lineWidth = Math.max(1.5, size / 900) * (lake.r < 0.012 ? 0.6 : 1);
        w.stroke();
        // A light ripple down the lake's long axis.
        if (lake.r >= 0.012) {
          const along = lake.r * size * 0.45;
          const c = Math.cos(lake.rot);
          const sn = Math.sin(lake.rot);
          w.strokeStyle = 'rgba(205,242,241,0.38)';
          w.lineWidth = Math.max(1, size / 1500);
          w.beginPath();
          w.moveTo(x - c * along, y - sn * along);
          w.quadraticCurveTo(x - sn * along * lake.aspect * 0.4, y + c * along * lake.aspect * 0.4, x + c * along, y + sn * along);
          w.stroke();
        }
      }
    }
  }

  // Woodland, in the corners the plough cannot reach.
  for (let i = 0; i < 54; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.006 + rand() * 0.016);
    const poly: [number, number][] = [];
    g.fillStyle = '#26401f';
    g.beginPath();
    for (let a = 0; a < 11; a++) {
      const t = (a / 11) * Math.PI * 2;
      const rr = r * (0.66 + rand() * 0.66);
      const px = x + Math.cos(t) * rr;
      const py = y + Math.sin(t) * rr;
      if (a === 0) g.moveTo(px, py); else g.lineTo(px, py);
      poly.push([px, py]);
    }
    g.closePath();
    g.fill();
    lowlandWoods.push(poly);
  }

  /* A river, and lanes that do not follow it. Both wrap at the tile edge, so
     they carry across the repeat instead of stopping dead at it. */
  g.strokeStyle = '#2d5f86';
  g.lineWidth = size / 150;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, size * 0.62);
  for (let x = 0; x <= size; x += size / 24) {
    g.lineTo(x, size * 0.62 + Math.sin((x / size) * Math.PI * 2) * size * 0.1);
  }
  g.stroke();

  /* Tributaries. A river with nothing feeding it is a canal; two thinner
     streams wandering in from up-tile, each ending exactly on the river's
     own curve, make the drainage read as a system. */
  g.lineWidth = size / 340;
  // Every line on the ground a tree or a farm must keep off: cubic curves.
  const streams: Cubic[] = [];
  const lanes: Cubic[] = [];
  for (const [x0, jitter] of [[0.31, 3], [0.79, 7]] as const) {
    const xEnd = size * x0;
    const yEnd = size * 0.62 + Math.sin(x0 * Math.PI * 2) * size * 0.1;
    const xStart = xEnd + size * (0.1 + rand() * 0.1) * (jitter > 4 ? -1 : 1);
    g.beginPath();
    g.moveTo(xStart, 0);
    const bend = size * (0.06 + rand() * 0.1);
    g.bezierCurveTo(
      xEnd + bend, yEnd * 0.3,
      xEnd - bend, yEnd * 0.72,
      xEnd, yEnd,
    );
    g.stroke();
    streams.push([xStart, 0, xEnd + bend, yEnd * 0.3, xEnd - bend, yEnd * 0.72, xEnd, yEnd]);
  }

  g.strokeStyle = 'rgba(206,198,178,0.5)';
  g.lineWidth = size / 420;
  for (const [x0, x1] of [[0.18, 0.34], [0.72, 0.58]] as const) {
    const lane: Cubic = [size * x0, 0, size * (x0 + 0.08), size * 0.4, size * (x1 - 0.06), size * 0.7, size * x1, size];
    g.beginPath();
    g.moveTo(lane[0], lane[1]);
    g.bezierCurveTo(lane[2], lane[3], lane[4], lane[5], lane[6], lane[7]);
    g.stroke();
    lanes.push(lane);
  }

  /* ── Settlements ──────────────────────────────────────────────────
     At the scale this tile is laid down — three kilometres across, so
     roughly a metre and a half to the pixel — a building is about eight
     pixels. Small, but not sub-pixel, which means the honest way to draw a
     town here is to draw its buildings rather than to suggest a grey smudge
     where one would be.

     Sizes are kept deliberately modest. The tile repeats every three
     kilometres, and a landmark city would announce that repeat far more
     loudly than any field boundary: one distinctive silhouette arriving
     over and over is exactly the tell the field generator above was written
     to avoid. A market town and a scatter of villages read as countryside.
     A skyline reads as wallpaper. */
  const settlements: { x: number; y: number; r: number; core: number }[] = [];

  // One market town, kept off the tile edges so it is not cut in half.
  settlements.push({
    x: size * (0.24 + rand() * 0.42),
    y: size * (0.2 + rand() * 0.4),
    r: size * (0.075 + rand() * 0.03),
    core: 0.42,
  });

  /* Two hamlets, and no more. Six settlements to a three-kilometre tile put
     a glowing shape every few hundred metres, and at that density the eye
     stops reading them as towns and starts reading the lattice they repeat
     on — the tile, advertised. Sparse is both truer to real countryside and
     the only way the repeat stays hidden. */
  for (let i = 0; i < 2; i++) {
    settlements.push({
      x: rand() * size,
      y: rand() * size,
      r: size * (0.014 + rand() * 0.016),
      core: 0.3,
    });
  }

  const towns = settlements.map((t) => {
    const painted: PaintedTown = { buildings: [], roads: [], outline: [] };
    drawSettlement(g, n, t, rand, size, painted);
    return { ...t, painted };
  });

  /* Rural light: farmsteads, and the odd vehicle on a lane. Scattered single
     points are what sells the dark between towns — an unlit countryside
     reads as a hole in the map rather than as land. */
  n.fillStyle = 'rgba(255,214,150,0.55)';
  for (let i = 0; i < 140; i++) {
    n.fillRect(rand() * size, rand() * size, 1.6, 1.6);
  }

  const props = landProps({
    size, g, n, fields, uplandWoods, lowlandWoods, lakeShores, streams, lanes, towns,
    hedgerowTrees, orchardTrees,
    riverY: (x) => size * riverAt(x / size),
  });

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;

  const nightTex = new THREE.CanvasTexture(nc);
  nightTex.wrapS = nightTex.wrapT = THREE.RepeatWrapping;
  nightTex.anisotropy = 16;
  nightTex.colorSpace = THREE.SRGBColorSpace;

  const waterTex = new THREE.CanvasTexture(wc);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.anisotropy = 16;
  waterTex.colorSpace = THREE.SRGBColorSpace;

  /* The relief, as textures. Grey for the displacement; for the light, a
     tangent-space normal map from central differences over the fine field.
     The canvas is uploaded flipped, so +v runs up the image: the green
     channel takes +dh/dy where the red takes −dh/dx. */
  const hc = document.createElement('canvas');
  hc.width = hc.height = HR;
  const hg = hc.getContext('2d') as CanvasRenderingContext2D;
  const himg = hg.createImageData(HR, HR);
  const ncv = document.createElement('canvas');
  ncv.width = ncv.height = HR;
  const ng = ncv.getContext('2d') as CanvasRenderingContext2D;
  const nimg = ng.createImageData(HR, HR);
  const slope = HILL_HEIGHT / (TILE_METRES / HR) / 2;
  const fine = (x: number, y: number) => {
    const i = ((y + HR) % HR) * HR + ((x + HR) % HR);
    return heights[i] + detail[i];
  };
  for (let y = 0; y < HR; y++) {
    for (let x = 0; x < HR; x++) {
      const i = y * HR + x;
      const hv = Math.round(Math.min(1, Math.max(0, heights[i])) * 255);
      himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = hv;
      himg.data[i * 4 + 3] = 255;
      const nx = -(fine(x + 1, y) - fine(x - 1, y)) * slope;
      const ny = (fine(x, y + 1) - fine(x, y - 1)) * slope;
      const len = Math.hypot(nx, ny, 1);
      nimg.data[i * 4] = Math.round((nx / len * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 3] = 255;
    }
  }
  hg.putImageData(himg, 0, 0);
  ng.putImageData(nimg, 0, 0);
  const heightTex = new THREE.CanvasTexture(hc);
  heightTex.wrapS = heightTex.wrapT = THREE.RepeatWrapping;
  heightTex.generateMipmaps = false;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.magFilter = THREE.LinearFilter;
  const normalTex = new THREE.CanvasTexture(ncv);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.anisotropy = 8;

  return { day: tex, night: nightTex, water: waterTex, height: heightTex, normal: normalTex, props };
}

type Cubic = [number, number, number, number, number, number, number, number];

/**
 * The trees and buildings of the farmland tile, stood up from its paint.
 *
 * Everything here keeps to what is already painted: woods are filled with
 * trees where the woods are, towns get their buildings back as the
 * footprints their roofs were painted with, and hedgerow oaks and orchard
 * rows stand on their own dots. What is new is painted as well as raised —
 * farmsteads, and rows of poplars along the river and the roads out of town
 * — so the ground still carries them past the distance where the scenery
 * stops drawing in the round.
 *
 * A separate random stream from the painters', so none of what was painted
 * before moves.
 */
function landProps(p: {
  size: number;
  g: CanvasRenderingContext2D;
  n: CanvasRenderingContext2D;
  fields: { x: number; y: number; w: number; h: number }[];
  uplandWoods: [number, number][][];
  lowlandWoods: [number, number][][];
  lakeShores: [number, number][][];
  streams: Cubic[];
  lanes: Cubic[];
  towns: { x: number; y: number; r: number; core: number; painted: PaintedTown }[];
  hedgerowTrees: [number, number, number][];
  orchardTrees: [number, number][];
  /** The river's centre line, in canvas pixels. */
  riverY: (x: number) => number;
}): LandProps {
  const { size, g, n } = p;
  const mpp = TILE_METRES / size;
  const rand = seededRandom(0x7ee5eed);
  const trees: TreeSpot[] = [];
  const buildings: BuildingSpot[] = [];

  /* A small map of the tile to ask questions of: woods in red (on the high
     ground) and green (in the low corners), and in blue everywhere nothing
     may stand — water, the river and its streams, lanes, roads and towns. */
  const MR = 512;
  const mc = document.createElement('canvas');
  mc.width = mc.height = MR;
  const m = mc.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  m.setTransform(MR / size, 0, 0, MR / size, 0, 0);
  m.globalCompositeOperation = 'lighter';
  m.lineCap = m.lineJoin = 'round';
  const fillShape = (poly: [number, number][], style: string) => {
    m.fillStyle = style;
    m.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? m.moveTo(x, y) : m.lineTo(x, y)));
    m.closePath();
    m.fill();
  };
  for (const poly of p.uplandWoods) fillShape(poly, 'rgb(255,0,0)');
  for (const poly of p.lowlandWoods) fillShape(poly, 'rgb(0,255,0)');
  const KEEP_OUT = 'rgb(0,0,255)';
  m.strokeStyle = KEEP_OUT;
  for (const shore of p.lakeShores) {
    fillShape(shore, KEEP_OUT);
    m.lineWidth = 6;
    m.stroke();
  }
  m.lineWidth = size / 150 + 8;
  m.beginPath();
  for (let x = 0; x <= size; x += size / 96) {
    if (x === 0) m.moveTo(x, p.riverY(x)); else m.lineTo(x, p.riverY(x));
  }
  m.stroke();
  const strokeCubic = (c: Cubic, width: number) => {
    m.lineWidth = width;
    m.beginPath();
    m.moveTo(c[0], c[1]);
    m.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
    m.stroke();
  };
  for (const c of p.streams) strokeCubic(c, size / 340 + 6);
  for (const c of p.lanes) strokeCubic(c, size / 420 + 4);
  for (const town of p.towns) {
    fillShape(town.painted.outline, KEEP_OUT);
    m.lineWidth = Math.max(1.2, town.r * 0.03) + 5;
    for (const [x0, y0, cx, cy, x1, y1] of town.painted.roads) {
      m.beginPath();
      m.moveTo(x0, y0);
      m.quadraticCurveTo(cx, cy, x1, y1);
      m.stroke();
    }
  }
  const md = m.getImageData(0, 0, MR, MR).data;
  const at = (x: number, y: number, channel: number) => {
    const mx = Math.floor((((x % size) + size) % size) * MR / size);
    const my = Math.floor((((y % size) + size) % size) * MR / size);
    return md[(my * MR + mx) * 4 + channel];
  };
  const blocked = (x: number, y: number) => at(x, y, 2) > 64;
  const wooded = (x: number, y: number) => at(x, y, 0) > 127 || at(x, y, 1) > 127;

  /* ── The power lines ──────────────────────────────────────────────────
     Three high-voltage lines march across the country in straight runs, as
     the real ones do: one along the tile, one across it and one on the
     diagonal, each spaced so it carries on seamlessly into the next copy of
     the tile. A tower that would stand in water, on a road or in a town
     steps along its line until it is clear, so the spans vary the way real
     ones do; and the woods are kept cut back along each corridor. */
  const lineRand = seededRandom(0x9a71e5);
  const pylons: PylonSpot[] = [];
  const spans: [number, number][] = [];
  const wrap01 = (a: number) => ((a % 1) + 1) % 1;
  const routes = [
    { from: [0, 0.18 + lineRand() * 0.14], dir: [1, 0], towers: 9 },
    { from: [0.2 + lineRand() * 0.15, 0], dir: [0, 1], towers: 9 },
    { from: [0, 0.7 + lineRand() * 0.2], dir: [1, 1], towers: 12 },
  ] as const;
  /** How far a point (tile units) is from each line's centre, for clearing the corridor. */
  const corridor: ((s: number, t: number) => number)[] = [];
  for (const route of routes) {
    const first = pylons.length;
    const [ds, dt] = route.dir;
    const angle = Math.atan2(dt, ds);
    for (let k = 0; k < route.towers; k++) {
      let f = k / route.towers;
      // Step along the line, either way, until clear of water, roads and towns.
      // Searching up to about half a span each way: far enough to get a tower out of a town.
      const planned = f;
      for (let tries = 0; tries < 24; tries++) {
        const sx = wrap01(route.from[0] + ds * f) * size;
        const ty = wrap01(route.from[1] + dt * f) * size;
        if (!blocked(sx, ty)) break;
        f = planned + (tries % 2 ? 1 : -1) * Math.ceil((tries + 1) / 2) * (0.5 / route.towers / 12);
      }
      f += (lineRand() - 0.5) * 0.008;
      pylons.push({ s: wrap01(route.from[0] + ds * f), t: wrap01(route.from[1] + dt * f), angle });
      if (k > 0) spans.push([pylons.length - 2, pylons.length - 1]);
    }
    // The last tower strings on to the first one's copy in the next tile.
    spans.push([pylons.length - 1, first]);
    const [s0, t0] = route.from;
    const len = Math.hypot(ds, dt);
    corridor.push((s, t) => {
      // Across the line: |(p - p0) × dir|, wrapped to the nearest copy.
      const cross = (s - s0) * dt - (t - t0) * ds;
      const w = ((cross % 1) + 1.5) % 1 - 0.5;
      return Math.abs(w) / len;
    });
  }
  const CLEARED = 22 / TILE_METRES;
  const underLines = (x: number, y: number) => corridor.some((d) => d(x / size, y / size) < CLEARED);

  const tree = (x: number, y: number, kind: TreeKind, height: number, width: number) => {
    if (underLines(x, y)) return;
    trees.push({ s: x / size, t: y / size, kind, height, width, shade: rand() });
  };
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const conifer = (x: number, y: number) => tree(x, y, 'conifer', between(15, 26), between(6.5, 9));
  const broadleaf = (x: number, y: number) => tree(x, y, 'broadleaf', between(12, 20), between(10, 15));
  const birch = (x: number, y: number) => tree(x, y, 'birch', between(10, 16), between(5, 8));
  const poplar = (x: number, y: number) => tree(x, y, 'poplar', between(20, 29), between(3.5, 5));

  /* The woods, one tree to every ten pixels — about fifteen metres, so
     neighbouring crowns just touch and the painted wood floor shows between
     them as shade. Plantations of spruce and fir on the high ground, a mixed
     broadleaf wood with birch at its edges in the low corners. */
  const STEP = 10;
  for (let gy = 0; gy < size / STEP; gy++) {
    for (let gx = 0; gx < size / STEP; gx++) {
      const x = (gx + 0.2 + rand() * 0.6) * STEP;
      const y = (gy + 0.2 + rand() * 0.6) * STEP;
      if (blocked(x, y)) continue;
      const upland = at(x, y, 0) > 127;
      if (!upland && at(x, y, 1) <= 127) continue;
      const pick = rand();
      if (upland) {
        if (pick < 0.72) conifer(x, y);
        else if (pick < 0.9) birch(x, y);
        else broadleaf(x, y);
      } else if (pick < 0.62) broadleaf(x, y);
      else if (pick < 0.82) conifer(x, y);
      else birch(x, y);
    }
  }

  // Hedgerow oaks, grown from their dots: the dot is the dense heart of the crown.
  for (const [x, y, r] of p.hedgerowTrees) {
    if (blocked(x, y)) continue;
    const width = Math.min(15, Math.max(8, r * 2 * mpp * 2.2));
    tree(x, y, 'broadleaf', width * between(1.1, 1.45), width);
  }
  // Every other orchard tree: at this size the rows read, the trees barely do.
  p.orchardTrees.forEach(([x, y], i) => {
    if (i % 2 === 0 && !blocked(x, y)) tree(x, y, 'orchard', between(4.5, 6.5), between(4.5, 6));
  });

  /* Rows of poplars: along stretches of the river bank, and down the roads
     out of town — the one tree planted in lines, and so the one that reads
     as somebody's doing rather than the land's. */
  const rows: [number, number][] = [];
  const bank = size / 300 + 6;
  for (let i = 0; i < 6; i++) {
    const x0 = rand() * size;
    const run = between(110, 260);
    const side = rand() < 0.5 ? -1 : 1;
    for (let x = x0; x < x0 + run; x += between(5.8, 7)) {
      const y = p.riverY(x);
      const slope = (p.riverY(x + 1) - p.riverY(x - 1)) / 2;
      const len = Math.hypot(1, slope);
      rows.push([x - (slope / len) * bank * side, y + (1 / len) * bank * side]);
    }
  }
  for (const town of p.towns) {
    for (const [x0, y0, cx, cy, x1, y1] of town.painted.roads) {
      if (rand() < 0.4) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const from = between(0.15, 0.4);
      const to = from + between(0.15, 0.35);
      const off = Math.max(1.2, town.r * 0.03) / 2 + 4.5;
      const point = (t: number): [number, number] => [
        (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1,
        (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1,
      ];
      const length = Math.hypot(x1 - x0, y1 - y0);
      for (let t = from; t < to; t += 6.5 / length) {
        const [ax, ay] = point(t);
        const [bx, by] = point(t + 0.002);
        const len = Math.hypot(bx - ax, by - ay) || 1;
        rows.push([ax - ((by - ay) / len) * off * side, ay + ((bx - ax) / len) * off * side]);
      }
    }
  }
  g.fillStyle = 'rgba(28,42,22,0.7)';
  for (const [x, y] of rows) {
    const xx = ((x % size) + size) % size;
    const yy = ((y % size) + size) % size;
    if (blocked(xx, yy) || wooded(xx, yy)) continue;
    g.beginPath();
    g.arc(xx, yy, 1.4, 0, Math.PI * 2);
    g.fill();
    poplar(xx, yy);
  }

  /* The towns' buildings, back up from the footprints their roofs were
     painted with: taller and flatter at the centre, pitched roofs toward the
     edge, and never smaller than a cottage. */
  const walls = ['#d6ccba', '#c8b89c', '#e2dace', '#b8a58a', '#a8876a', '#cfc3ad', '#9c8c7a'];
  const building = (b: BuildingSpot) => {
    // A pitched roof's ridge runs along the building's length.
    if (b.roof === 'gable' && b.width > b.depth) {
      buildings.push({ ...b, width: b.depth, depth: b.width, angle: b.angle + Math.PI / 2 });
    } else buildings.push(b);
  };
  for (const town of p.towns) {
    for (const pb of town.painted.buildings) {
      const flat = pb.central ? rand() < 0.6 : rand() < 0.15;
      building({
        s: pb.x / size,
        t: pb.y / size,
        width: Math.max(6, pb.w * mpp),
        depth: Math.max(6, pb.h * mpp),
        height: pb.central ? between(9, 16) : between(5, 8),
        angle: pb.angle,
        roof: flat ? 'flat' : 'gable',
        roofColour: pb.roof,
        wallColour: walls[Math.floor(rand() * walls.length)],
        lit: pb.lit ? between(0.6, 0.95) : between(0.25, 0.5),
      });
    }
  }

  /* Farmsteads: a yard in the corner of a field, a house, a barn and a few
     trees for shelter. Painted on the ground, lit at night, and stood up —
     the houses of the open country, between the towns. */
  const houseRoofs = ['#8c4b35', '#6b635a', '#7f5a45', '#5f584f'];
  const barnRoofs = ['#5a5f62', '#7a3b2b', '#6b6155', '#4f565a'];
  const houseWalls = ['#d9d0bf', '#cbbd9f', '#e0d7c6', '#b89a7a'];
  const barnWalls = ['#7a3b2b', '#8a8378', '#6f6a60', '#9a8a6a'];
  const pickOf = (list: string[]) => list[Math.floor(rand() * list.length)];
  let farms = 0;
  for (let tries = 0; tries < 400 && farms < 26; tries++) {
    const f = p.fields[Math.floor(rand() * p.fields.length)];
    if (f.w < 40 || f.h < 40) continue;
    const turned = rand() < 0.5;
    const yw = turned ? 16 : 22;
    const yh = turned ? 22 : 16;
    const cx = rand() < 0.5 ? f.x + yw / 2 + 4 : f.x + f.w - yw / 2 - 4;
    const cy = rand() < 0.5 ? f.y + yh / 2 + 4 : f.y + f.h - yh / 2 - 4;
    const corners: [number, number][] = [[cx, cy], [cx - yw / 2, cy - yh / 2], [cx + yw / 2, cy - yh / 2], [cx - yw / 2, cy + yh / 2], [cx + yw / 2, cy + yh / 2]];
    if (corners.some(([x, y]) => blocked(x, y) || wooded(x, y))) continue;
    farms++;
    // Along the yard's length: the house at one end, the barn at the other.
    const ax = turned ? 0 : 1;
    const ay = turned ? 1 : 0;
    const house: [number, number] = [cx - ax * 5, cy - ay * 5];
    const barn: [number, number] = [cx + ax * 4, cy + ay * 4];
    const houseRoof = pickOf(houseRoofs);
    const barnRoof = pickOf(barnRoofs);
    g.fillStyle = 'rgba(142,132,110,0.9)';
    g.fillRect(cx - yw / 2, cy - yh / 2, yw, yh);
    g.fillStyle = houseRoof;
    g.fillRect(house[0] - (turned ? 2.5 : 3.5), house[1] - (turned ? 3.5 : 2.5), turned ? 5 : 7, turned ? 7 : 5);
    g.fillStyle = barnRoof;
    g.fillRect(barn[0] - (turned ? 3.5 : 6.5), barn[1] - (turned ? 6.5 : 3.5), turned ? 7 : 13, turned ? 13 : 7);
    n.fillStyle = 'rgba(255,214,150,0.85)';
    n.fillRect(house[0] - 1, house[1] - 1, 2, 2);
    const glow = n.createRadialGradient(house[0], house[1], 0, house[0], house[1], 7);
    glow.addColorStop(0, 'rgba(255,190,110,0.16)');
    glow.addColorStop(1, 'rgba(255,190,110,0)');
    n.fillStyle = glow;
    n.fillRect(house[0] - 7, house[1] - 7, 14, 14);
    const angle = turned ? Math.PI / 2 : 0;
    building({
      s: house[0] / size, t: house[1] / size, width: 7 * mpp, depth: 5 * mpp,
      height: between(5.5, 6.5), angle, roof: 'gable', roofColour: houseRoof,
      wallColour: pickOf(houseWalls), lit: between(0.5, 0.9),
    });
    building({
      s: barn[0] / size, t: barn[1] / size, width: 13 * mpp, depth: 7 * mpp,
      height: between(6, 8), angle, roof: 'gable', roofColour: barnRoof,
      wallColour: pickOf(barnWalls), lit: 0,
    });
    // A shelter belt along the yard's far side.
    for (let k = -1; k <= 1; k++) {
      const x = cx + (turned ? (yw / 2 + 3) * (cx > f.x + f.w / 2 ? -1 : 1) : k * 7);
      const y = cy + (turned ? k * 7 : (yh / 2 + 3) * (cy > f.y + f.h / 2 ? -1 : 1));
      if (blocked(x, y)) continue;
      g.fillStyle = 'rgba(28,42,22,0.75)';
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
      if (rand() < 0.5) broadleaf(x, y); else conifer(x, y);
    }
  }

  return { trees, buildings, pylons, spans };
}

/**
 * Open water, for the legs of the flight that cross it.
 *
 * The sea's pattern is nothing like land's, which is exactly why it earns a
 * texture of its own rather than a blue filter over the farmland: no lattice,
 * no boundaries — instead depth (broad patches where the bottom falls away),
 * swell (long parallel bands, one direction, because wind has one), current
 * lines (the bright streaks where two bodies of water shear past each other)
 * and the odd fleck of white where a crest breaks.
 *
 * The glint map is the part that moves: a transparent field of elongated
 * sparkle laid over the plate on its own drifting offset, so the surface
 * shimmers against the water under it — two layers sliding at slightly
 * different rates being the entire optical recipe for "liquid".
 */
export interface OceanTextures {
  day: THREE.CanvasTexture;
  /** Ships' lights, for after dark. Almost all of it is honestly black. */
  night: THREE.CanvasTexture;
  /** Transparent sparkle, drifted at its own rate over the plate. */
  glint: THREE.CanvasTexture;
  /** The ships whose lights those are, and the small boats among them, for the scenery. */
  boats: BoatSpot[];
}

export function oceanTextures(size = 1024): OceanTextures {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;

  let seed = 0x1f83d9ab;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };

  g.fillStyle = '#16496b';
  g.fillRect(0, 0, size, size);

  /* Depth. Broad, soft, and darker — the sea's only "fields". Doubled at the
     edges so the patches carry across the tile join. */
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.09 + rand() * 0.22);
    const deep = rand() > 0.4;
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]] as const) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, deep ? 'rgba(8,38,58,0.42)' : 'rgba(58,126,150,0.3)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
  }

  /* Swell: one wind, one direction, many long soft bands. Drawn on a rotated
     frame big enough that every stroke crosses the whole tile, and stroked
     twice — a lit face and a shaded back — so each band reads as a wave and
     not as a scratch. */
  const SWELL = -0.42;
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(SWELL);
  const reach = size * 0.75;
  for (let y = -reach; y < reach; y += 9 + rand() * 14) {
    const wobble = (rand() - 0.5) * 4;
    g.strokeStyle = `rgba(196,232,240,${0.028 + rand() * 0.035})`;
    g.lineWidth = 1.6 + rand() * 1.8;
    g.beginPath(); g.moveTo(-reach, y); g.bezierCurveTo(-reach / 3, y + wobble, reach / 3, y - wobble, reach, y); g.stroke();
    g.strokeStyle = `rgba(4,22,36,${0.03 + rand() * 0.04})`;
    g.beginPath(); g.moveTo(-reach, y + 2.4); g.bezierCurveTo(-reach / 3, y + 2.4 - wobble, reach / 3, y + 2.4 + wobble, reach, y + 2.4); g.stroke();
  }
  g.restore();

  /* Current lines: a handful of brighter ribbons shearing across the swell. */
  for (let i = 0; i < 4; i++) {
    const y = rand() * size;
    g.strokeStyle = `rgba(158,214,224,${0.1 + rand() * 0.08})`;
    g.lineWidth = 2.4 + rand() * 3.2;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + (rand() - 0.5) * size * 0.24, size * 0.7, y + (rand() - 0.5) * size * 0.24, size, y);
    g.stroke();
  }

  /* Whitecaps. Sparse, tiny, aligned with the swell — a sea entirely covered
     in them is a gale, and this is an airline. */
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(SWELL);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineCap = 'round';
  for (let i = 0; i < 210; i++) {
    const x = (rand() - 0.5) * size * 1.4;
    const y = (rand() - 0.5) * size * 1.4;
    g.lineWidth = 0.8 + rand() * 1.1;
    g.globalAlpha = 0.25 + rand() * 0.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2 + rand() * 5, y); g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();

  /* ── Night: ships ─────────────────────────────────────────────────────
     A dozen for the whole tile, each a point with a fainter stern light and
     a short wake. The dark between them is the picture. */
  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  const n = nc.getContext('2d') as CanvasRenderingContext2D;
  n.fillStyle = '#000000';
  n.fillRect(0, 0, size, size);
  /* Each of these is a real ship now (see `scenery.ts`): the lights are
     painted where it sits, so past the distance it is drawn to, its lights
     carry on. What kind of ship it is comes off a stream of its own, so the
     sea looks exactly as it did. */
  const boats: BoatSpot[] = [];
  const shipyard = seededRandom(0x5eab0a7);
  // Running odds: the first kind whose number the draw falls under.
  const ships: [BoatKind, number][] = [['cargo', 0.38], ['tanker', 0.58], ['ferry', 0.72], ['trawler', 1]];
  const draft = (odds: [BoatKind, number][]) => {
    const roll = shipyard();
    return (odds.find(([, p]) => roll < p) ?? odds[odds.length - 1])[0];
  };
  for (let i = 0; i < 12; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    const wake = 8 + rand() * 18;
    boats.push({ s: x / size, t: y / size, heading: a, kind: draft(ships), seed: shipyard(), paint: shipyard() });
    const grd = n.createLinearGradient(x, y, x - Math.cos(a) * wake, y - Math.sin(a) * wake);
    grd.addColorStop(0, 'rgba(140,190,220,0.3)');
    grd.addColorStop(1, 'rgba(140,190,220,0)');
    n.strokeStyle = grd;
    n.lineWidth = 1.4;
    n.beginPath(); n.moveTo(x, y); n.lineTo(x - Math.cos(a) * wake, y - Math.sin(a) * wake); n.stroke();
    n.fillStyle = 'rgba(255,240,210,0.95)';
    n.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    n.fillStyle = 'rgba(180,220,255,0.6)';
    n.fillRect(x + Math.cos(a) * 2.6 - 0.6, y + Math.sin(a) * 2.6 - 0.6, 1.2, 1.2);
  }
  /* And the small craft the painted sea never had — fishing boats and
     yachts — with lights of their own, fainter than a ship's. */
  const craft: [BoatKind, number][] = [['trawler', 0.45], ['yacht', 1]];
  for (let i = 0; i < 10; i++) {
    const x = shipyard() * size;
    const y = shipyard() * size;
    const a = shipyard() * Math.PI * 2;
    boats.push({ s: x / size, t: y / size, heading: a, kind: draft(craft), seed: shipyard(), paint: shipyard() });
    n.fillStyle = 'rgba(255,236,200,0.7)';
    n.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
  }

  /* ── Glint ────────────────────────────────────────────────────────────
     Transparent elongated sparkle, denser in loose bands so the shimmer has
     structure. It rides over the plate on its own offset. */
  const wc = document.createElement('canvas');
  wc.width = wc.height = size;
  const w = wc.getContext('2d') as CanvasRenderingContext2D;
  w.save();
  w.translate(size / 2, size / 2);
  w.rotate(SWELL);
  w.lineCap = 'round';
  for (let i = 0; i < 620; i++) {
    const x = (rand() - 0.5) * size * 1.42;
    const y = (rand() - 0.5) * size * 1.42;
    // Banded: sparkle gathers along the swell every so often.
    const band = 0.5 + 0.5 * Math.sin(y * 0.055 + rand() * 0.8);
    if (rand() > 0.28 + band * 0.6) continue;
    w.strokeStyle = `rgba(255,255,255,${0.1 + rand() * 0.26})`;
    w.lineWidth = 0.8 + rand() * 1.3;
    w.beginPath(); w.moveTo(x, y); w.lineTo(x + 3 + rand() * 9, y); w.stroke();
  }
  w.restore();

  const finish = (canvas: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { day: finish(c), night: finish(nc), glint: finish(wc), boats };
}

/**
 * One town, painted into the day and night canvases at once.
 *
 * A town is its street plan first and its buildings second: cut a grid,
 * rotate it off the tile's axes so no two towns line up with each other or
 * with the field boundaries, then fill the blocks with footprints that grow
 * larger and denser toward the middle. Building *colour* does most of the
 * work at altitude — a town is warm grey-brown against green fields, and
 * that contrast is what makes it read long before any single roof does.
 *
 * The night pass lights the same streets and a fraction of the same
 * buildings. Only a fraction: a town with every window lit reads as a
 * stadium. Sodium along the streets, a colder white in the few big central
 * roofs, and a glow over the whole thing — which is most of what you
 * actually see of a distant town at night.
 */
interface PaintedBuilding {
  /** Centre, in canvas pixels. */
  x: number;
  y: number;
  /** Footprint in canvas pixels, along the town's own axes. */
  w: number;
  h: number;
  angle: number;
  roof: string;
  central: boolean;
  lit: boolean;
}

interface PaintedTown {
  buildings: PaintedBuilding[];
  /** The roads out, as quadratic curves in canvas pixels: from, control, to. */
  roads: [number, number, number, number, number, number][];
  /** The made ground, in canvas pixels. */
  outline: [number, number][];
}

function drawSettlement(
  g: CanvasRenderingContext2D,
  n: CanvasRenderingContext2D,
  t: { x: number; y: number; r: number; core: number },
  rand: () => number,
  size: number,
  out: PaintedTown,
) {
  const { r } = t;
  const angle = rand() * Math.PI;
  // From the town's own turned frame to the canvas, for what is written down.
  const toCanvas = (px: number, py: number): [number, number] => [
    t.x + px * Math.cos(angle) - py * Math.sin(angle),
    t.y + px * Math.sin(angle) + py * Math.cos(angle),
  ];
  /* Slate, tile, tar and the occasional pale industrial roof. Kept close in
     value so the town reads as one mass at altitude and only resolves into
     separate buildings when you are near it. */
  const roofs = ['#7f766b', '#6b635a', '#8a7d6e', '#5f584f', '#94856f', '#776b5f', '#a09384'];

  g.save();
  n.save();
  for (const ctx of [g, n]) {
    ctx.translate(t.x, t.y);
    ctx.rotate(angle);
  }

  /* The outline, worked out once and then used three times: as the made
     ground, as the clip the streets are cut to, and as the shape of the
     glow above it. Clipping the streets to a circle instead — which is what
     this did first — turned every village into a perfectly round disc of
     crosshatch, and a field of those reads as a textile print rather than
     as land. */
  const blob: [number, number][] = [];
  for (let a = 0; a < 14; a++) {
    const th = (a / 14) * Math.PI * 2;
    const rr = r * (0.72 + rand() * 0.56);
    blob.push([Math.cos(th) * rr, Math.sin(th) * rr]);
  }
  const tracePath = (ctx: CanvasRenderingContext2D, scale = 1) => {
    ctx.beginPath();
    blob.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px * scale, py * scale);
      else ctx.lineTo(px * scale, py * scale);
    });
    ctx.closePath();
  };

  g.fillStyle = 'rgba(104,97,86,0.62)';
  tracePath(g);
  g.fill();
  for (const [px, py] of blob) out.outline.push(toCanvas(px, py));

  const street = Math.max(6, r * 0.16);

  /* Streets, clipped to the blob, so the outline stays organic while the
     interior stays rectilinear — which is how a town that grew around a
     crossroads looks from the air. */
  g.save();
  n.save();
  for (const ctx of [g, n]) {
    tracePath(ctx);
    ctx.clip();
  }

  /* Narrow, and a warm grey rather than white. At six pixels of a
     twenty-nine pixel block the streets were a fifth of the town's area and
     it read as white netting over a field — roads are the gaps between
     buildings, not the subject. Asphalt, now the buildings stand up out of
     the blocks: a street reads as the dark lane between two rows of walls,
     where a pale one read as a gap in the paint. */
  g.strokeStyle = 'rgba(86,85,81,0.78)';
  g.lineWidth = Math.max(1.2, r * 0.024);
  n.strokeStyle = 'rgba(255,186,92,0.5)';
  n.lineWidth = Math.max(1, r * 0.03);
  for (let i = -7; i <= 7; i++) {
    const o = i * street;
    if (Math.abs(o) > r) continue;
    for (const ctx of [g, n]) {
      ctx.beginPath(); ctx.moveTo(-r, o); ctx.lineTo(r, o); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o, -r); ctx.lineTo(o, r); ctx.stroke();
    }
  }

  /* Buildings, block by block. Footprint and the chance of there being a
     building at all both fall off with distance from the centre, which is
     the difference between a town and a housing estate. */
  for (let i = -7; i <= 7; i++) {
    for (let j = -7; j <= 7; j++) {
      const bx = i * street;
      const by = j * street;
      const d = Math.hypot(bx, by) / r;
      if (d > 1) continue;
      if (rand() > 1.05 - d * 0.75) continue;

      const central = d < t.core;
      const pad = street * 0.16;
      const w = street * (central ? 0.54 + rand() * 0.28 : 0.3 + rand() * 0.3);
      const h = street * (central ? 0.54 + rand() * 0.28 : 0.3 + rand() * 0.3);
      const ox = bx + pad + rand() * Math.max(0, street - w - pad * 2) * 0.6;
      const oy = by + pad + rand() * Math.max(0, street - h - pad * 2) * 0.6;

      const roof = roofs[Math.floor(rand() * roofs.length)];
      g.fillStyle = roof;
      g.fillRect(ox, oy, w, h);

      const lit = rand() < (central ? 0.55 : 0.26);
      if (lit) {
        n.fillStyle = central ? 'rgba(255,236,200,0.92)' : 'rgba(255,206,140,0.7)';
        n.fillRect(ox, oy, Math.max(1, w * 0.8), Math.max(1, h * 0.8));
      }
      // Only what the clip to the outline actually left standing.
      const cx = ox + w / 2;
      const cy = oy + h / 2;
      if (insidePolygon(cx, cy, blob)) {
        const [x, y] = toCanvas(cx, cy);
        out.buildings.push({ x, y, w, h, angle, roof, central, lit });
      }
    }
  }
  g.restore();
  n.restore();

  /* The lit air over a town. Additive, so it stacks on the streets and
     windows already there rather than washing them out. */
  n.globalCompositeOperation = 'lighter';
  const glow = n.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
  glow.addColorStop(0, 'rgba(255,178,86,0.20)');
  glow.addColorStop(0.55, 'rgba(255,160,70,0.07)');
  glow.addColorStop(1, 'rgba(255,150,60,0)');
  n.fillStyle = glow;
  /* Poured into the town's own outline rather than a circle, and blurred,
     so the halo has the shape of the place under it. */
  n.filter = `blur(${Math.max(2, r * 0.18)}px)`;
  tracePath(n, 1.25);
  n.fill();
  n.filter = 'none';
  n.globalCompositeOperation = 'source-over';

  /* Roads out. A town nobody can reach is a model village, and a lit ribbon
     leaving one is the clearest thing in a night landscape. */
  const spokes = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < spokes; i++) {
    const a = rand() * Math.PI * 2;
    const len = size * (0.14 + rand() * 0.3);
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;
    const bend = (rand() - 0.5) * len * 0.4;
    const cpx = ex * 0.5 - bend;
    const cpy = ey * 0.5 + bend;

    // Metalled, like the streets it leads out of.
    g.strokeStyle = 'rgba(92,91,87,0.62)';
    g.lineWidth = Math.max(1.2, r * 0.03);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(cpx, cpy, ex, ey);
    g.stroke();
    out.roads.push([...toCanvas(0, 0), ...toCanvas(cpx, cpy), ...toCanvas(ex, ey)]);

    n.strokeStyle = 'rgba(255,170,80,0.16)';
    n.lineWidth = Math.max(0.8, r * 0.03);
    n.beginPath();
    n.moveTo(0, 0);
    n.quadraticCurveTo(cpx, cpy, ex, ey);
    n.stroke();
  }

  g.restore();
  n.restore();
}

/**
 * A cumulus lump, for the cloud billboards.
 *
 * A single radial gradient reads as a smoke puff, not a cloud: real cumulus is
 * a cluster of bulges with a cauliflower top and a base flat enough to make a
 * deck when a few hundred of them line up at one altitude. This composites
 * nine overlapping lobes into that silhouette, then bakes the lighting in —
 * bright along the top where the sun lands, blue-shadowed underneath, which is
 * the cue that tells you a cloud is solid and which way is up.
 *
 * Baking the shade into the texture rather than lighting the billboards keeps
 * them on an unlit material: five hundred of these cost one draw call, and the
 * sun's colour is applied to the whole deck as a tint instead.
 */
export function cloudTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;

  /* The lobes, in texture units: x, y, radius. Wider than tall, weighted to
     the upper half so the base stays flat and the crown piles up. */
  const lobes: [number, number, number][] = [
    [0.50, 0.46, 0.30],
    [0.30, 0.56, 0.23],
    [0.70, 0.56, 0.23],
    [0.40, 0.36, 0.21],
    [0.61, 0.38, 0.19],
    [0.50, 0.28, 0.16],
    [0.17, 0.62, 0.15],
    [0.83, 0.62, 0.15],
    [0.50, 0.62, 0.26],
  ];

  for (const [lx, ly, lr] of lobes) {
    const x = lx * size;
    const y = ly * size;
    const r = lr * size;
    // Each lobe is lit from above: the gradient's centre is offset upward, so
    // the bright core sits on the lobe's crown rather than in its middle.
    const grd = g.createRadialGradient(x, y - r * 0.35, r * 0.05, x, y, r);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.98)');
    grd.addColorStop(0.45, 'rgba(246,249,255,0.80)');
    grd.addColorStop(0.78, 'rgba(226,236,250,0.30)');
    grd.addColorStop(1.00, 'rgba(214,228,248,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  /* The underside. Cumulus bases are grey-blue and nearly flat — that shadow
     is most of what separates a cloud from a cotton ball. */
  g.globalCompositeOperation = 'source-atop';
  const base = g.createLinearGradient(0, size * 0.42, 0, size * 0.80);
  base.addColorStop(0, 'rgba(150,172,205,0)');
  base.addColorStop(1, 'rgba(96,120,158,0.62)');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);

  /* And the crown, catching the sun. */
  const crown = g.createLinearGradient(0, size * 0.10, 0, size * 0.46);
  crown.addColorStop(0, 'rgba(255,252,244,0.55)');
  crown.addColorStop(1, 'rgba(255,252,244,0)');
  g.fillStyle = crown;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A radial falloff, for the sun's disc and the bloom around it.
 *
 * `hardness` is where the gradient is still fully opaque: near 1 it is a disc
 * with a clean limb, near 0 it is all halo. A sprite with no map at all is a
 * square, which is a surprisingly easy way to put a box in the sky.
 */
export function radialTexture(hardness = 0.5, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(Math.min(0.96, hardness), 'rgba(255,255,255,1)');
  // A short shoulder past the hard edge keeps the limb from aliasing.
  grd.addColorStop(Math.min(0.98, hardness + (1 - hardness) * 0.35), 'rgba(255,255,255,0.42)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
