// Scene 9 (j): the real hero view, its market-cap input overridden by the simulated ramp in config/climb.json.
import { open, board, preview, stillPath, ROOT, FPS } from '../lib/session.mjs';
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync(`${ROOT}/config/climb.json`, 'utf8'));
const capAt = (t) => { const u = Math.min(1, Math.max(0, t / c.rampSeconds)); return c.from + (c.to - c.from) * u * u; };
const s = await open();
await board(s);
await s.api((api) => { api.app.setCamera('exterior'); api.setPlate('view'); });
// Build the cloud sea once, off camera, then start low.
await s.api((api, v) => api.setMarketCap(v), c.to); await s.step(30);
await s.api((api, v) => api.setMarketCap(v), c.from); await s.step(60);
const head = Math.round(c.headSeconds * FPS);
const frames = head + Math.round((c.sceneSeconds + 1) * FPS);
if (preview) {
  for (const t of [0, 2.4, 2.6, 4.4]) { await s.api((api, v) => api.setMarketCap(v), capAt(t)); await s.step(3); await s.shot(stillPath(`climb_${t}`)); }
} else {
  await s.record('climb_take1', frames, async (i) => { await s.api((api, v) => api.setMarketCap(v), capAt((i - head) / FPS)); });
}
await s.close();
