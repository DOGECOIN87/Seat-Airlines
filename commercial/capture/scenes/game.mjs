// Scenes 7-8 (c, d): real gameplay on a fixed seed with the capture autopilot, through to the score screen.
import { open, preview, stillPath } from '../lib/session.mjs';
const seed = Number(process.env.SEED || 350);
const s = await open({ query: `&seed=${seed}`, ...(preview ? { width: 960, height: 540 } : {}) });
await s.goto();
await s.untilReady();
await s.step(35, 200);
await s.api((api, seed) => { api.setHighScore(12480); api.startGame(seed, { autopilot: true, crashAfter: 12 }); }, seed);
if (preview) {
  for (let i = 0; i < 16; i++) { await s.step(90); await s.shot(stillPath(`game_${String(i).padStart(2, '0')}`)); }
} else {
  await s.record(`game_seed${seed}`, 1500);
}
await s.close();
