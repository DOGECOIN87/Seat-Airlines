/**
 * The crash screen with PLAY AGAIN and the countdown to boarding, as phone
 * stills. Capture mode: the autopilot flies a fixed seed into the ground on
 * the virtual clock. The long climb is flown in a tiny viewport (cheap to
 * draw in software); only the moments filmed are drawn at phone size.
 *
 * Serve a capture-mode build of the site on port 3000 (a build, not the dev
 * server, so editing files in the repo cannot reload the page mid-take):
 *   VITE_CAPTURE_MODE=1 npx vite build --outDir <dir> && npx vite preview --outDir <dir> --port 3000
 * Usage: node capture/features/crash.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { open, ROOT } from '../lib/session.mjs';

const OUT = path.join(ROOT, 'public/features');
fs.mkdirSync(OUT, { recursive: true });
const seed = Number(process.env.SEED || 350);
const s = await open({ query: `&seed=${seed}`, width: 160, height: 346, scale: 2, mobile: true });
const game = () => s.page.evaluate(() => { const g = window.__saGame; return g ? { phase: g.phase, feet: g.alt * 3.281, failed: g.failed, blastFeet: g.blastAlt * 3.281 } : null; });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

await s.goto();
await s.untilReady();
await s.step(35, 200); // past the splash, in big steps (virtual time)
await s.api((api, seed) => { api.setHighScore(12480); api.startGame(seed, { autopilot: true, crashAfter: 6 }); }, seed);
log('flying');
let steps = 0;
for (; steps < 6000; steps++) {
  const g = await game();
  if (g?.phase === 'crashed') break;
  await s.step(1, 100);
  if (steps % 100 === 0) log(`step ${steps}: ${JSON.stringify(g)}`);
}
log(`crashed after ${steps} steps`);

// Phone size for the verdict.
await s.page.setViewportSize({ width: 390, height: 844 });
await s.step(2, 100);
const still = async (name) => {
  const { data } = await s.cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  const note = (await s.page.locator('.sa-landing__countdown').textContent().catch(() => ''))?.trim();
  const board = (await s.page.locator('.sa-landing__enter').last().textContent().catch(() => ''))?.trim();
  log(`wrote ${name}: ${board} | ${note}`);
};
// Wait for the buttons, then film the count at three points.
for (let i = 0; i < 60 && !(await s.page.locator('.sa-landing__again').count()); i++) await s.step(2, 100);
await s.step(6, 100);
await still('crash-a');
await s.step(30, 100);
await still('crash-b');
await s.step(30, 100);
await still('crash-c');
await s.close();
log('done');
