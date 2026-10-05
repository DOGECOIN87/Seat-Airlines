/**
 * Phone-sized stills of the October features, for the X post cut:
 * the landing's Connect & fly, the wallet picker with Email or passkey,
 * the four tour pages, and the "how it works" button in the contract bar.
 *
 * Runs against a built preview of the site (`npm run build && npx vite preview --port 4173`).
 * The Worker is not reached: /helius/status is answered here, as "on".
 * Usage: node capture/features/stills.mjs [outDir]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? new URL('../../public/features/', import.meta.url).pathname;
const BASE = process.env.SA_URL ?? 'http://localhost:4173/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true };

/** Screenshot through CDP: Playwright's own waits for an idle frame, which the 3D scene never gives. */
const shot = async (page, name) => {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('wrote', name);
};
/** UI-only shots: no WebGL, so the page is not held up drawing a 3D scene in software. The cards are cropped in the edit. */
const noGL = (ctx) => ctx.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/i.test(String(type)) ? null : get.call(this, type, ...rest);
  };
});
const helius = async (ctx) => ctx.route('**/helius/status', (r) => r.fulfill({ json: { ready: true }, headers: { 'access-control-allow-origin': '*' } }));
const clearSplash = async (page) => {
  await page.waitForTimeout(2500);
  await page.mouse.click(195, 300);
  await page.waitForTimeout(4000);
};

// 1. The landing, nobody connected: Connect & fly. (Skipped when already filmed: it is the slow one.)
if (!fs.existsSync(`${OUT}/landing.png`)) {
  const ctx = await browser.newContext(phone);
  await helius(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await clearSplash(page);
  await page.locator('.sa-landing__fly').waitFor({ timeout: 90000 });
  await page.waitForTimeout(6000);
  await shot(page, 'landing');
  await ctx.close();
}

// 2. The picker: a wallet app in the browser, and Email or passkey beside it,
//    opened from the site's Check-in panel (the landing needs WebGL to offer Fly).
{
  const ctx = await browser.newContext(phone);
  await helius(ctx);
  await noGL(ctx);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('sa.tour', '1'); } catch {}
    window.phantom = { solana: { isPhantom: true, connect: () => new Promise(() => {}), signMessage: async () => ({ signature: new Uint8Array(64) }) } };
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#check-in`, { waitUntil: 'domcontentloaded' });
  const connect = page.getByRole('button', { name: /^Connect wallet$/ }).first();
  await connect.waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  await connect.evaluate((b) => b.click());
  await page.getByText('Email or passkey').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, 'picker');
  await ctx.close();
}

// 3. The tour, on a first visit to the site, then the bar's "?" that brings it back.
{
  const ctx = await browser.newContext(phone);
  await helius(ctx);
  await noGL(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}#wall`, { waitUntil: 'domcontentloaded' });
  await page.getByText('One plane. Everyone’s in it.').waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  for (let i = 1; i <= 4; i++) {
    await shot(page, `tour${i}`);
    if (i < 4) {
      await page.getByRole('button', { name: /^Next$/ }).evaluate((b) => b.click());
      await page.waitForTimeout(700);
    }
  }
  await page.getByRole('button', { name: /Got it/ }).evaluate((b) => b.click());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  await shot(page, 'site');
  await ctx.close();
}

await browser.close();
