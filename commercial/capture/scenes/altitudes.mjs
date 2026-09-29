// Scene: altitude band showcase — exterior view at each altitude band.
// 5 bands × 12 frames each at 15 fps → after blend: 5 × 0.8 s = 4.0 s clip.
// In the edit only 2.5 s of the clip is used (last band, Mars, is the hold).
import { open, board, ROOT, FPS } from '../lib/session.mjs';

const BANDS = [
  { cap: 500_000 },       // WEATHER  — below cloud deck
  { cap: 1_500_000 },     // CLOUDS   — just broke through
  { cap: 15_000_000 },    // SPACE    — low Earth orbit
  { cap: 65_000_000 },    // MOON     — lunar surface
  { cap: 150_000_000 },   // MARS     — red planet
];
const SETTLE = 20; // virtual frames to let the 3D world rebuild (not recorded)
const HOLD = 12;   // recorded frames per band (= 0.8 s after blend to 30 fps)

const s = await open();
await board(s);
await s.api((api) => { api.app.setCamera('exterior'); api.setPlate('view'); });

// Prime every band once so the geometry is in the GPU cache.
for (const b of BANDS) {
  await s.api((api, v) => api.setMarketCap(v), b.cap);
  await s.step(SETTLE);
}

// Record: jump to each band, settle, then capture HOLD frames.
await s.record('altitudes_take1', BANDS.length * HOLD, async (i) => {
  if (i % HOLD === 0) {
    const b = BANDS[Math.floor(i / HOLD)];
    await s.api((api, v) => api.setMarketCap(v), b.cap);
    await s.step(SETTLE);
  }
});

await s.close();
