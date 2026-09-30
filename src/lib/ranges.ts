/**
 * The mountains and valleys on the horizon: which country stands where, and
 * how tall it is when you see it.
 *
 * The farmland under the aircraft is one repeating tile, so it has nowhere to
 * put a mountain. These are laid over it instead, on a coarse lattice of
 * square cells that drifts past far more slowly than the fields do — the way
 * anything tens of kilometres off does. Each cell is empty, or holds one of
 * two scanned landscapes (see scripts/build-ranges.mjs) turned and scaled by
 * a hash of its own address, so the same cell is the same country every time
 * it comes round and neighbouring ones do not repeat one another.
 *
 * Kept free of three.js so it can be tested.
 */

export type RangeKind = 'montana' | 'spain';

/** Metres across one cell. */
export const CELL = 32000;
/** Cells kept in play each way: enough that the lattice always covers the horizon (see `REACH`). */
export const POOL = 5;
/**
 * How much of the ground's own speed the ranges drift at. A quarter: enough
 * that the skyline changes over a visit, slow enough that a range takes a
 * couple of minutes to cross the band it rises and sets in — too slow to see
 * it happen — and slow the way anything far off is.
 */
export const DRIFT = 0.25;

/**
 * Distances from the aircraft, in metres, over which the relief rises out of
 * the ground, and over which it settles back to the horizon line again.
 *
 * The settling is long and gentle, and goes with the haze: a range further
 * off stands lower and paler, the way distant ranges do past the curve of the
 * Earth, and it reaches the horizon line just as it is lost in the haze. A
 * range faded to the fog's colour at full height would stand as a flat grey
 * shape against whatever sky is behind it; this way nothing is left to see.
 */
export const RISE: readonly [number, number] = [22000, 31000];
export const SET: readonly [number, number] = [42000, 59500];
/** Distances over which a range fades into the haze. */
export const HAZE: readonly [number, number] = [36000, 59500];
/**
 * The furthest any relief stands: the lattice has to cover this far all round.
 * It is inside the ground plate (60 km out along each axis), so everything
 * sunk short of it has the plate above it.
 */
export const REACH = SET[1];

export interface Cell {
  kind: RangeKind | null;
  /** Quarter turns, 0–3. */
  turns: number;
  mirror: boolean;
  /** Multiplies the range's height: 0.75–1.15. */
  height: number;
}

function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i * 374761393 + j * 668265263 + salt * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What stands in the cell at lattice address (i, j). */
export function cellAt(i: number, j: number): Cell {
  const pick = hash(i, j, 1);
  return {
    kind: pick < 0.5 ? 'montana' : pick < 0.8 ? 'spain' : null,
    turns: Math.floor(hash(i, j, 2) * 4),
    mirror: hash(i, j, 3) < 0.5,
    height: 0.75 + hash(i, j, 4) * 0.4,
  };
}

export interface Placement {
  /** Lattice address of the cell this slot holds right now. */
  i: number;
  j: number;
  /** Where its centre is, relative to the aircraft, in metres. */
  x: number;
  z: number;
}

/**
 * Where slot (a, b) of the pool is when the ground has shifted by (shiftX,
 * shiftZ): the cell of its residue nearest the aircraft. Features move by
 * −shiftX in x and +shiftZ in z, as the ground's texture does.
 */
export function place(a: number, b: number, shiftX: number, shiftZ: number): Placement {
  const u = shiftX * DRIFT;
  const v = shiftZ * DRIFT;
  const i = a + POOL * Math.round((u / CELL - 0.5 - a) / POOL);
  const j = b + POOL * Math.round((-v / CELL - 0.5 - b) / POOL);
  return { i, j, x: (i + 0.5) * CELL - u, z: (j + 0.5) * CELL + v };
}

/**
 * Whether any of a cell centred at (x, z) relative to the aircraft lies
 * where relief stands — between the rise and the set. A cell wholly inside
 * the rise is flat under the ground, and one wholly past the set is sunk.
 */
export function inBand(x: number, z: number): boolean {
  const h = CELL / 2;
  const nx = Math.max(0, Math.abs(x) - h);
  const nz = Math.max(0, Math.abs(z) - h);
  const near = Math.hypot(nx, nz);
  const far = Math.hypot(Math.abs(x) + h, Math.abs(z) + h);
  return near < SET[1] && far > RISE[0];
}

/** 0–1: how much of its height a range has at this distance from the aircraft. */
export function rise(distance: number): number {
  const s = (t: number, a: number, b: number) => {
    const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return s(distance, RISE[0], RISE[1]) * (1 - s(distance, SET[0], SET[1]));
}

/**
 * Heights in 0–1 from a raw 16-bit height field: the lowest `floor` of the
 * ground is the plain the range stands on (0), the highest point is 1, and
 * the tile's edge is pulled down to the plain so neighbouring cells meet
 * flush. Returns a square grid of the same size.
 */
export function shapeHeights(raw: Uint16Array, size: number, floor = 0.15, edge = 0.2): Float32Array {
  const hist = new Uint32Array(1024);
  for (const v of raw) hist[v >> 6]++;
  const at = (q: number) => {
    let n = 0;
    for (let k = 0; k < hist.length; k++) {
      n += hist[k];
      if (n >= q * raw.length) return (k + 0.5) * 64;
    }
    return 65535;
  };
  const lo = at(floor);
  const hi = at(0.999);
  const out = new Float32Array(size * size);
  const s = (t: number) => {
    const k = Math.min(1, Math.max(0, t));
    return k * k * (3 - 2 * k);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = Math.min(1, Math.max(0, (raw[y * size + x] - lo) / (hi - lo || 1)));
      const d = Math.min(x, y, size - 1 - x, size - 1 - y) / (size - 1);
      out[y * size + x] = h * s(d / edge);
    }
  }
  return out;
}
