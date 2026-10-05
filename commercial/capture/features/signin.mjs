/**
 * The real "Email or passkey" sign-in sheet, as phone stills.
 *
 * The sheet is Turnkey's own component, run by the site exactly as in
 * production. Nothing real is reached from here: the Worker's status and
 * bootstrap, and Turnkey's auth-proxy config, are answered with plain
 * stand-ins so the sheet has what it needs to draw. No account is created,
 * and the email shown is made up.
 *
 * Runs against a built preview of the site (default http://localhost:4173/).
 * Usage: node capture/features/signin.mjs [outDir]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? new URL('../../public/features/', import.meta.url).pathname;
const BASE = process.env.SA_URL ?? 'http://localhost:4173/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
// UI only: no 3D scene to draw in software.
await ctx.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/i.test(String(type)) ? null : get.call(this, type, ...rest);
  };
  try { localStorage.setItem('sa.tour', '1'); } catch {}
});
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const ORG = '11111111-1111-4111-8111-111111111111';
const PROXY = '22222222-2222-4222-8222-222222222222';
const seen = [];
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  seen.push(`${req.method()} ${u.host}${u.pathname}`);
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const json = (body, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (u.pathname.endsWith('/helius/status')) return json({ ready: true });
  if (u.pathname.endsWith('/helius/waas/config')) return json({ organizationId: ORG, authProxyConfigId: PROXY, projectId: 'seat-airlines', authMethods: { passkey: true, email: true, sms: true, wallet: false } });
  if (u.pathname.endsWith('/helius/waas/wallets')) return route.fulfill({ status: 204, headers: cors });
  if (u.pathname.endsWith('/v1/wallet_kit_config')) return json({ enabledProviders: ['email', 'sms', 'passkey'], oauthClientIds: {}, oauthRedirectUrl: '', sessionExpirationSeconds: '900', otpAlphanumeric: true, otpLength: '6' });
  if (u.pathname.endsWith('/v1/otp_init')) return json({ otpId: 'demo-otp-id', otpEncryptionTargetBundle: '' });
  if (u.host.endsWith('turnkey.com')) return json({});
  if (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com') return route.abort();
  return route.abort();
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (!/dexscreener|WebGLRenderer/i.test(m.text())) console.log('console:', m.type(), m.text().slice(0, 300)); });
const shot = async (name) => {
  const cdp = await ctx.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('wrote', name);
};

await page.goto(`${BASE}#check-in`, { waitUntil: 'domcontentloaded' });
const connect = page.getByRole('button', { name: /^Connect wallet$/ }).first();
await connect.waitFor({ timeout: 90000 });
await page.waitForTimeout(1500);
await connect.evaluate((b) => b.click());
// With no wallet app in the browser, Connect goes straight to the email and passkey sheet.
await page.getByPlaceholder('Enter your email').waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
console.log('requests so far:', [...new Set(seen)]);
await shot('signin-1');
// An email address, typed (made up), then on to the one-time code.
await page.getByPlaceholder('Enter your email').fill('pilot@seat-airlines.space');
await page.waitForTimeout(600);
await shot('signin-2');
await page.getByPlaceholder('Enter your email').press('Enter');
await page.waitForTimeout(5000);
console.log('page text:', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(-500)));
await shot('signin-3');
await browser.close();
