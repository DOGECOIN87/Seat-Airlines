/**
 * Bakes a scanned landscape mesh down to a height field the game can fly past.
 *
 *   node scripts/build-ranges.mjs <model.obj> <out.bin> [resolution]
 *
 * The two landscapes in public/terrain came from photogrammetry OBJ meshes of
 * 30–130 thousand vertices each. Nothing about them is worth shipping whole:
 * from the flight's heights only the shape of the relief reads, and the game
 * colours it itself (see src/three/ranges.ts). So each mesh is rasterised — every
 * triangle sampled at its own height — into a square grid, cropped to the
 * middle so a cell is the same size both ways, holes filled from their
 * neighbours, and written as 16-bit little-endian heights scaled between the
 * lowest and highest point of the model. The model's up axis is Z.
 */
import fs from 'node:fs';

const [, , src, out, resArg] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/build-ranges.mjs <model.obj> <out.bin> [resolution]');
  process.exit(1);
}
const N = Number(resArg) || 256;

const xs = [];
const ys = [];
const zs = [];
const tris = [];
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  if (line.startsWith('v ')) {
    const p = line.split(/\s+/);
    xs.push(+p[1]);
    ys.push(+p[2]);
    zs.push(+p[3]);
  } else if (line.startsWith('f ')) {
    const ids = line.split(/\s+/).slice(1).filter(Boolean).map((t) => {
      const i = parseInt(t, 10);
      return i < 0 ? xs.length + i : i - 1;
    });
    for (let k = 1; k + 1 < ids.length; k++) tris.push(ids[0], ids[k], ids[k + 1]);
  }
}

const min = (a) => a.reduce((m, v) => Math.min(m, v), Infinity);
const max = (a) => a.reduce((m, v) => Math.max(m, v), -Infinity);
const [x0, x1, y0, y1, z0, z1] = [min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)];
// The middle square, so a cell is as wide as it is long.
const side = Math.min(x1 - x0, y1 - y0);
const cx = (x0 + x1) / 2 - side / 2;
const cy = (y0 + y1) / 2 - side / 2;

const grid = new Float32Array(N * N).fill(NaN);
const gx = (x) => ((x - cx) / side) * (N - 1);
const gy = (y) => ((y - cy) / side) * (N - 1);

for (let t = 0; t < tris.length; t += 3) {
  const a = tris[t], b = tris[t + 1], c = tris[t + 2];
  const ax = gx(xs[a]), ay = gy(ys[a]), bx = gx(xs[b]), by = gy(ys[b]), cx2 = gx(xs[c]), cy2 = gy(ys[c]);
  const lo = { x: Math.max(0, Math.floor(Math.min(ax, bx, cx2))), y: Math.max(0, Math.floor(Math.min(ay, by, cy2))) };
  const hi = { x: Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx2))), y: Math.min(N - 1, Math.ceil(Math.max(ay, by, cy2))) };
  const d = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2);
  if (Math.abs(d) < 1e-9) continue;
  for (let j = lo.y; j <= hi.y; j++) {
    for (let i = lo.x; i <= hi.x; i++) {
      const l1 = ((by - cy2) * (i - cx2) + (cx2 - bx) * (j - cy2)) / d;
      const l2 = ((cy2 - ay) * (i - cx2) + (ax - cx2) * (j - cy2)) / d;
      const l3 = 1 - l1 - l2;
      const e = -0.02;
      if (l1 < e || l2 < e || l3 < e) continue;
      const z = l1 * zs[a] + l2 * zs[b] + l3 * zs[c];
      const k = j * N + i;
      // The mesh is a surface, not a volume: where it folds over, the top wins.
      if (!(grid[k] >= z)) grid[k] = z;
    }
  }
}

// Fill any cell no triangle reached from the ones around it, widening until none is left.
for (let ring = 1; ring < 8; ring++) {
  const next = grid.slice();
  let holes = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!Number.isNaN(grid[j * N + i])) continue;
      let sum = 0, n = 0;
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          const jj = j + dj, ii = i + di;
          if (jj < 0 || jj >= N || ii < 0 || ii >= N) continue;
          const v = grid[jj * N + ii];
          if (!Number.isNaN(v)) { sum += v; n++; }
        }
      }
      if (n) next[j * N + i] = sum / n; else holes++;
    }
  }
  grid.set(next);
  if (!holes) break;
}

let lo = Infinity, hi = -Infinity;
for (const v of grid) { if (v < lo) lo = v; if (v > hi) hi = v; }
const bytes = Buffer.alloc(N * N * 2);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    // Rows run south to north in the model; the file runs north to south, as an image does.
    const v = grid[(N - 1 - j) * N + i];
    bytes.writeUInt16LE(Math.round(((v - lo) / (hi - lo || 1)) * 65535), (j * N + i) * 2);
  }
}
fs.writeFileSync(out, bytes);
console.log(`${src}: ${xs.length} vertices, ${tris.length / 3} triangles -> ${out} (${N}x${N}, z ${z0.toFixed(0)}..${z1.toFixed(0)})`);
