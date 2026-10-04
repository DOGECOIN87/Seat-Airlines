// The adverts recording: The Wall's cabins opened one by one, a scroll through every seat, then seat 3A
// opened to show its advert (the fictional Nimbus creative). Run with the app in capture mode; see README.
import { open, board, ROOT } from '../lib/session.mjs';
import fs from 'node:fs';
const AD = 'data:image/png;base64,' + fs.readFileSync(ROOT + '/public/brand/advert-nimbus.png').toString('base64');
const s = await open();
await board(s, { size: [1920, 1080] });
await s.api((api, ad) => { api.setAdvert(ad, '3A'); }, AD);
await s.page.getByRole('button', { name: /^Seats$/i }).first().click();
await s.step(8, 100);
// A pointer, since capture mode hides the real one.
await s.page.evaluate(() => {
  const c = document.createElement('div');
  c.id = 'fake-cursor';
  c.style.cssText = 'position:fixed;left:1700px;top:900px;z-index:2147483647;pointer-events:none;width:30px;height:36px;transition:none';
  c.innerHTML = '<svg width="30" height="36" viewBox="0 0 22 26"><path d="M1 1 L1 20 L6 15.5 L9.6 24 L13 22.6 L9.5 14.4 L16 14.4 Z" fill="#fff" stroke="#0B1324" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  const r = document.createElement('div');
  r.id = 'fake-ripple';
  r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #0087EA;border-radius:50%;opacity:0';
  document.body.appendChild(r);
});
const page = s.page;
const target = (code) => page.evaluate((code) => {
  const b = [...document.querySelectorAll('button')].find((x) => code === '3A' ? /^Seat 3A,/.test(x.getAttribute('aria-label') ?? '') : x.textContent.trim().startsWith(code) && /Show|Hide/.test(x.textContent));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return code === '3A' ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: r.right - 50, y: r.y + r.height / 2 };
}, code);
const press = (code) => page.evaluate((code) => {
  const b = [...document.querySelectorAll('button')].find((x) => code === '3A' ? /^Seat 3A,/.test(x.getAttribute('aria-label') ?? '') : x.textContent.trim().startsWith(code) && /Show|Hide/.test(x.textContent));
  b?.click();
}, code);
const scroller = () => page.evaluate(() => {
  const seat = [...document.querySelectorAll('button')].find((x) => /^Seat /.test(x.getAttribute('aria-label') ?? '')) ?? [...document.querySelectorAll('button')].find((x) => /^FDK/.test(x.textContent.trim()));
  let p = seat; while (p && !(p.scrollHeight > p.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
  if (p) p.dataset.capScroll = '1';
  return p ? p.scrollHeight - p.clientHeight : 0;
});
const setScroll = (y) => page.evaluate((y) => { const p = document.querySelector('[data-cap-scroll]'); if (p) p.scrollTop = y; }, y);
let cur = { x: 1700, y: 900 };
let from = cur, to = cur, t0 = 0, t1 = 1;
const moveTo = (p, i, frames) => { from = cur; to = p; t0 = i; t1 = i + frames; };
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const ripple = (p) => page.evaluate(({ x, y }) => { const r = document.getElementById('fake-ripple'); r.dataset.at = String(performance.now()); r.dataset.x = x; r.dataset.y = y; }, p);
const drawRipple = () => page.evaluate(() => {
  const r = document.getElementById('fake-ripple'); const at = Number(r.dataset.at || -1e9); const k = (performance.now() - at) / 450;
  if (k < 0 || k > 1) { r.style.opacity = '0'; return; }
  const d = 16 + 60 * k; r.style.width = r.style.height = d + 'px'; r.style.left = (r.dataset.x - d / 2) + 'px'; r.style.top = (r.dataset.y - d / 2) + 'px'; r.style.opacity = String(1 - k);
});
const CODES = ['FDK', 'FST', 'BUS', 'EXR', 'ECO'];
let maxScroll = 0;
const plan = async (i) => {
  // Open the cabins one by one.
  for (const [n, code] of CODES.entries()) {
    const at = 12 + n * 9;
    if (i === at - 6) { const p = await target(code); if (p) moveTo(p, i, 6); }
    if (i === at) { const p = await target(code); if (p) await ripple(p); await press(code); }
  }
  if (i === 58) { maxScroll = await scroller(); await setScroll(0); moveTo({ x: 1780, y: 640 }, i, 10); }
  if (i >= 60 && i <= 112) await setScroll(maxScroll * ease((i - 60) / 52));
  if (i > 112 && i <= 132) await setScroll(maxScroll * (1 - ease((i - 112) / 20)));
  if (i === 134) { const p = await target('3A'); if (p) moveTo(p, i, 10); }
  if (i === 146) { const p = await target('3A'); if (p) await ripple(p); await press('3A'); }
  const k = Math.min(1, Math.max(0, (i - t0) / (t1 - t0)));
  cur = { x: from.x + (to.x - from.x) * ease(k), y: from.y + (to.y - from.y) * ease(k) };
  await page.evaluate(({ x, y }) => { const c = document.getElementById('fake-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; }, cur);
  await drawRipple();
};
await s.record('adverts_wall_take1', 200, plan);
await s.close();
