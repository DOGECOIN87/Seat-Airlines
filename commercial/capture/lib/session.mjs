// Shared capture harness: headless Chromium on SwiftShader, a virtual clock,
// local fonts, every off-site request refused, one CDP screenshot per frame.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const APP = process.env.SA_APP_URL || 'http://127.0.0.1:3000/';
export const FPS = 15; // captured at 15 fps, blended up to 30 in the edit (no GPU here)
const FONTS = path.join(ROOT, 'node_modules/@fontsource');
const fontCss = [
  ['Montserrat', 'montserrat', [400, 500, 600, 700, 800]],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500, 600]],
  ['PT Sans Narrow', 'pt-sans-narrow', [700]],
].flatMap(([family, dir, weights]) => weights.map((w) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/local/${dir}/${dir}-latin-${w}-normal.woff2) format('woff2');}`)).join('\n');

export async function open({ query = '', width = 1920, height = 1080, epoch, scale = 1, mobile = false } = {}) {
  // SA_GL=gpu renders on the machine's own GPU through ANGLE's GL backend;
  // the default, SwiftShader, needs no GPU and is what the first cut was shot on.
  const gl = process.env.SA_GL === 'gpu' ? ['--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({
    args: [...gl, '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, timezoneId: 'UTC', locale: 'en-US' });
  await context.addInitScript(`window.__VCLOCK_EPOCH__=${epoch ?? Date.UTC(2026, 5, 21, 15, 0, 0)};`
    + `Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>16});`
    + fs.readFileSync(path.join(here, 'virtualClock.js'), 'utf8'));
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
    if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: fontCss });
    if (u.hostname === 'fonts.gstatic.com' && u.pathname.startsWith('/local/')) {
      const [, , dir, file] = u.pathname.split('/');
      return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(FONTS, dir, 'files', file)) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  const s = {
    browser, page, cdp,
    async goto() {
      await page.goto(`${APP}?capture=1${query}`, { waitUntil: 'load' });
      console.log('renderer:', await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const e = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(e.UNMASKED_RENDERER_WEBGL);
      }));
    },
    api: (fn, ...args) => page.evaluate(([f, a]) => {
      const api = window.__SA_CAPTURE__;
      // eslint-disable-next-line no-new-func
      return new Function('api', 'args', `return (${f})(api, ...args)`)(api, a);
    }, [fn.toString(), args]),
    step: (n = 1, ms = 1000 / FPS) => page.evaluate(async ([n, ms]) => { for (let i = 0; i < n; i++) await window.__vclock.step(ms); }, [n, ms]),
    async shot(file) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    /** Records `frames` frames; `each(i)` runs before frame i is stepped. Returns the mp4 path. */
    async record(name, frames, each) {
      const dir = path.join(ROOT, 'capture/raw', `${name}_frames`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      for (let i = 0; i < frames; i++) {
        if (each) await each(i);
        await s.step(1);
        await s.shot(path.join(dir, `${String(i).padStart(5, '0')}.jpg`));
        if (i % 30 === 0) console.log(`${name}: frame ${i}/${frames} (${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/frame)`);
      }
      const out = path.join(ROOT, 'capture/raw', `${name}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'),
        '-c:v', 'libx264', '-crf', '13', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-g', '15', out]);
      console.log('wrote', out);
      return out;
    },
    /** Steps the page while giving real time to what does not run on the virtual clock: chunk loads and the driver's shader compiles. */
    async settle(rounds = 8, realMs = 700) {
      for (let i = 0; i < rounds; i++) { await s.step(5, 100); await page.waitForTimeout(realMs); }
    },
    async untilReady(maxFrames = 600) {
      for (let i = 0; i < maxFrames; i++) {
        if (await page.evaluate(() => window.__SA_CAPTURE__?.ready)) return i;
        await s.step(1);
      }
      throw new Error('capture never became ready');
    },
    close: () => browser.close(),
  };
  return s;
}

/** Into the site proper, seated (the fake wallet is ranked into 16A), with the view as a clean plate. */
export async function board(s, { size = [1920, 1080] } = {}) {
  await s.page.setViewportSize({ width: 480, height: 270 }); // warm up cheaply
  await s.goto();
  await s.untilReady();
  await s.step(35, 200); // past the splash, in big steps (virtual time)
  await s.api((api) => api.app.leave());
  await s.step(12, 100);
  await s.page.setViewportSize({ width: size[0], height: size[1] });
  await s.step(3, 100);
}

export const preview = process.argv.includes('--preview');
export const stillPath = (name) => path.join(ROOT, 'capture/raw', `${name}_preview.jpg`);
