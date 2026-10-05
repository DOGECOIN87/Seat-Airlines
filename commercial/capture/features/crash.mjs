/**
 * The crash screen with PLAY AGAIN and the countdown to boarding, as phone
 * stills, plus a short clip of the count running down. Capture mode: the
 * autopilot flies a fixed seed into the ground on the virtual clock.
 *
 * Needs the app's dev server in capture mode:
 *   (cd .. && VITE_CAPTURE_MODE=1 npx vite --host 127.0.0.1 --port 3000)
 * Usage: node capture/features/crash.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { open, ROOT } from '../lib/session.mjs';

const OUT = path.join(ROOT, 'public/features');
fs.mkdirSync(OUT, { recursive: true });
const seed = Number(process.env.SEED || 350);
const s = await open({ query: `&seed=${seed}`, width: 390, height: 844, scale: 2.5, mobile: true });
const phase = () => s.page.evaluate(() => window.__saGame?.phase);
await s.goto();
await s.untilReady();
await s.settle(4, 500);
await s.step(35, 200); // past the splash
await s.api((api, seed) => { api.setHighScore(12480); api.startGame(seed, { autopilot: true, crashAfter: 7 }); }, seed);
for (let i = 0; i < 4000; i++) {
  if ((await phase()) === 'crashed') break;
  await s.step(1, 100);
}
console.log('phase:', await phase());
// Let WASTED land and the buttons come up.
await s.step(30, 100);
for (let i = 0; i < 40 && !(await s.page.locator('.sa-landing__again').count()); i++) await s.step(5, 100);
await s.settle(2, 400);
const still = async (name) => {
  const { data } = await s.cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('wrote', name, '·', (await s.page.locator('.sa-landing__countdown').textContent().catch(() => ''))?.trim());
};
await still('crash');
await s.step(30, 100); // three seconds on
await still('crash-later');
await s.close();
