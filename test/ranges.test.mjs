/**
 * The ranges on the horizon: that the lattice always covers the aircraft's
 * surroundings, that a cell is the same country every time it comes round,
 * that relief rises out at the horizon and is gone before it is overhead, and
 * that a baked height field comes out flush at its edges.
 *
 *   npm test
 */
import { CELL, POOL, REACH, RISE, SET, cellAt, inBand, place, rise, shapeHeights } from '../dist-test/ranges.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nthe ranges');

check('a cell is the same country every time', () => {
  for (let i = -5; i < 5; i++) for (let j = -5; j < 5; j++) {
    assert(JSON.stringify(cellAt(i, j)) === JSON.stringify(cellAt(i, j)), `cell ${i},${j} changed`);
  }
});

check('half open horizon, the rest mountains and some hill country', () => {
  const counts = { montana: 0, spain: 0, none: 0 };
  for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) counts[cellAt(i, j).kind ?? 'none']++;
  const n = 3600;
  assert(counts.none / n > 0.42 && counts.none / n < 0.58, `empty ${counts.none / n}`);
  assert(counts.montana / n > 0.22 && counts.montana / n < 0.38, `montana ${counts.montana / n}`);
  assert(counts.spain / n > 0.13 && counts.spain / n < 0.27, `spain ${counts.spain / n}`);
});

check('turns, mirrors and heights vary but stay in range', () => {
  const turns = new Set();
  for (let i = 0; i < 40; i++) {
    const c = cellAt(i, 3);
    turns.add(c.turns);
    assert(c.height >= 0.75 && c.height <= 1.15, `height ${c.height}`);
  }
  assert(turns.size === 4, `only turns ${[...turns]}`);
});

check('every slot holds a distinct cell, all within reach of the aircraft', () => {
  for (const [sx, sz] of [[0, 0], [123456, -98765], [-4e6, 7e6]]) {
    const seen = new Set();
    for (let a = 0; a < POOL; a++) for (let b = 0; b < POOL; b++) {
      const p = place(a, b, sx, sz);
      seen.add(`${p.i},${p.j}`);
      assert(Math.abs(p.x) <= (POOL / 2) * CELL && Math.abs(p.z) <= (POOL / 2) * CELL, `slot ${a},${b} at ${p.x},${p.z}`);
    }
    assert(seen.size === POOL * POOL, 'two slots hold one cell');
  }
});

check('the lattice covers everywhere relief can stand, whatever the shift', () => {
  for (const [sx, sz] of [[0, 0], [123456, -98765], [-4e6, 7e6], [CELL * 2.5 / 0.25, -CELL * 1.5 / 0.25]]) {
    const cells = [];
    for (let a = 0; a < POOL; a++) for (let b = 0; b < POOL; b++) cells.push(place(a, b, sx, sz));
    for (let ang = 0; ang < 360; ang += 7.5) for (const r of [RISE[0], (RISE[0] + REACH) / 2, REACH]) {
      const x = r * Math.cos(ang * Math.PI / 180), z = r * Math.sin(ang * Math.PI / 180);
      assert(cells.some((c) => Math.abs(x - c.x) <= CELL / 2 && Math.abs(z - c.z) <= CELL / 2), `nothing at ${x.toFixed(0)},${z.toFixed(0)} for shift ${sx},${sz}`);
    }
  }
});

check('only cells that reach the band are drawn', () => {
  assert(inBand(CELL, 0), 'the next cell over should show');
  assert(!inBand(0, 0) || CELL / 2 * Math.SQRT2 > RISE[0], 'a cell under the aircraft wholly inside the rise should not');
  assert(!inBand(SET[1] + CELL, 0), 'a cell wholly past the set should not');
  assert(!inBand((SET[1] + CELL) / Math.SQRT2 + CELL / 2, (SET[1] + CELL) / Math.SQRT2 + CELL / 2), 'a far corner cell should not');
  // Wherever rise() is above zero, the cell holding that point is drawn.
  for (let x = -70000; x <= 70000; x += 2500) for (let z = -70000; z <= 70000; z += 2500) {
    if (rise(Math.hypot(x, z)) === 0) continue;
    const cx = Math.round(x / CELL) * CELL, cz = Math.round(z / CELL) * CELL;
    assert(inBand(cx, cz), `cell at ${cx},${cz} dropped though ${x},${z} stands`);
  }
});

check('the ranges drift the way the ground does, and a cell keeps its address as it goes', () => {
  const a = place(1, 1, 0, 0);
  const b = place(1, 1, 1000, 500);
  assert(b.x < a.x, 'x should decrease with shiftX');
  assert(b.z > a.z, 'z should increase with shiftZ');
  const c = place(1, 1, 10, 5);
  assert(c.i === a.i && c.j === a.j, 'a small step changed the cell');
});

check('relief is down overhead, up out toward the horizon, and down again past the plate', () => {
  assert(rise(0) === 0 && rise(RISE[0] - 1) === 0, 'not flat close in');
  assert(rise((RISE[1] + SET[0]) / 2) === 1, 'not at full height mid-distance');
  assert(rise(70000) === 0, 'still standing past the plate');
  let last = 0;
  for (let d = RISE[0]; d <= RISE[1]; d += 500) { const r = rise(d); assert(r >= last, 'not monotonic'); last = r; }
});

check('a height field is 0–1, tops out at 1 and meets the plain at its edge', () => {
  const N = 64;
  const raw = new Uint16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) raw[y * N + x] = Math.round((Math.hypot(x - 32, y - 32) < 20 ? 1 - Math.hypot(x - 32, y - 32) / 20 : 0.05) * 65535);
  const h = shapeHeights(raw, N);
  let max = 0;
  for (const v of h) { assert(v >= 0 && v <= 1, `out of range ${v}`); max = Math.max(max, v); }
  assert(max > 0.9, `peak only ${max}`);
  for (let k = 0; k < N; k++) assert(h[k] === 0 && h[k * N] === 0 && h[N * N - 1 - k] === 0 && h[k * N + N - 1] === 0, 'edge not flush');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
