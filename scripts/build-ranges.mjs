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
 *
 * The meshes are finer than the grid, so they are rasterised at four times its
 * resolution and box-filtered down: sampled straight onto the grid, their
 * triangles alias into a washboard of ribs across every slope.
 */
import fs from 'node:fs';

const [, , src, out, resArg] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/build-ranges.mjs <model.obj> <out.bin> [resolution]');
  process.exit(1);
}
const N = Number(resArg) || 256;
/** Samples per output cell each way. */
const SS = 4;
const R = N * SS;

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

const grid = new Float32Array(R * R).fill(NaN);
// Sample (i, j) is the centre of its pixel on the fine grid.
const gx = (x) => ((x - cx) / side) * R - 0.5;
const gy = (y) => ((y - cy) / side) * R - 0.5;

for (let t = 0; t < tris.length; t += 3) {
  const a = tris[t], b = tris[t + 1], c = tris[t + 2];
  const ax = gx(xs[a]), ay = gy(ys[a]), bx = gx(xs[b]), by = gy(ys[b]), cx2 = gx(xs[c]), cy2 = gy(ys[c]);
  const lo = { x: Math.max(0, Math.floor(Math.min(ax, bx, cx2))), y: Math.max(0, Math.floor(Math.min(ay, by, cy2))) };
  const hi = { x: Math.min(R - 1, Math.ceil(Math.max(ax, bx, cx2))), y: Math.min(R - 1, Math.ceil(Math.max(ay, by, cy2))) };
  const d = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2);
  if (Math.abs(d) < 1e-9) continue;
  for (let j = lo.y; j <= hi.y; j++) {
    for (let i = lo.x; i <= hi.x; i++) {
      const l1 = ((by - cy2) * (i - cx2) + (cx2 - bx) * (j - cy2)) / d;
      const l2 = ((cy2 - ay) * (i - cx2) + (ax - cx2) * (j - cy2)) / d;
      const l3 = 1 - l1 - l2;
      // Inside the triangle, or on its edge — never extrapolated past it.
      const e = -1e-9;
      if (l1 < e || l2 < e || l3 < e) continue;
      const z = l1 * zs[a] + l2 * zs[b] + l3 * zs[c];
      const k = j * R + i;
      // The mesh is a surface, not a volume: where it folds over, the top wins.
      if (!(grid[k] >= z)) grid[k] = z;
    }
  }
}

// Fill any sample no triangle reached from the ones around it, widening until none is left.
for (let ring = 1; ring < 16; ring++) {
  const next = grid.slice();
  let holes = 0;
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      if (!Number.isNaN(grid[j * R + i])) continue;
      let sum = 0, n = 0;
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          const jj = j + dj, ii = i + di;
          if (jj < 0 || jj >= R || ii < 0 || ii >= R) continue;
          const v = grid[jj * R + ii];
          if (!Number.isNaN(v)) { sum += v; n++; }
        }
      }
      if (n) next[j * R + i] = sum / n; else holes++;
    }
  }
  grid.set(next);
  if (!holes) break;
}

// Down to the output grid, each cell the mean of its SS × SS samples.
const fine = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let dj = 0; dj < SS; dj++) for (let di = 0; di < SS; di++) sum += grid[(j * SS + dj) * R + i * SS + di];
    fine[j * N + i] = sum / (SS * SS);
  }
}

let lo = Infinity, hi = -Infinity;
for (const v of fine) { if (v < lo) lo = v; if (v > hi) hi = v; }
const bytes = Buffer.alloc(N * N * 2);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    // Rows run south to north in the model; the file runs north to south, as an image does.
    const v = fine[(N - 1 - j) * N + i];
    bytes.writeUInt16LE(Math.round(((v - lo) / (hi - lo || 1)) * 65535), (j * N + i) * 2);
  }
}
fs.writeFileSync(out, bytes);
console.log(`${src}: ${xs.length} vertices, ${tris.length / 3} triangles -> ${out} (${N}x${N}, z ${z0.toFixed(0)}..${z1.toFixed(0)})`);
