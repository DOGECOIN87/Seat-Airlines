// Scenes 7-8 (c, d): real gameplay on a fixed seed with the capture autopilot, through to the score screen.
// The dull stretches are flown at a tiny viewport (cheap to draw); only the moments used are filmed at 1080p.
import { open } from '../lib/session.mjs';
const seed = Number(process.env.SEED || 350);
const s = await open({ query: `&seed=${seed}` });
const small = () => s.page.setViewportSize({ width: 480, height: 270 });
const big = async () => { await s.page.setViewportSize({ width: 1920, height: 1080 }); await s.step(2); };
const game = () => s.page.evaluate(() => { const g = window.__saGame; return { phase: g.phase, feet: g.alt * 3.281, failed: g.failed, blastFeet: g.blastAlt * 3.281, agl: g.agl }; });
await small();
await s.goto();
await s.untilReady();
await s.step(35, 200);
await s.api((api, seed) => { api.setHighScore(12480); api.startGame(seed, { autopilot: true, crashAfter: 7 }); }, seed);
// Fly the climb cheaply until ~2 s short of the engine going.
for (let i = 0; i < 2000; i++) {
  const g = await game();
  if (g.failed || g.feet > g.blastFeet - 900) break;
  await s.step(1, 100);
}
await big();
await s.record('game_take1', 45); // the blast (3 s)
await small();
for (let i = 0; i < 2000; i++) { if ((await game()).phase === 'crashed') break; await s.step(1, 100); }
await big();
await s.record('highscore_take1', 75); // the crash and the score screen (5 s)
await s.close();
