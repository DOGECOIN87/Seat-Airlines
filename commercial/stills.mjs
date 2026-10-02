// Renders stills of a composition at the given frames, bundling once, and tiles them into a contact sheet.
// Usage: node stills.mjs <Composition> <frame> [<frame> ...]   (writes out/stills/<comp>-<frame>.png and out/contact-<comp>.jpg)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [id, ...frames] = process.argv.slice(2);
const dir = path.dirname(new URL(import.meta.url).pathname);
const shell = readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium_headless_shell-'));
const browserExecutable = shell && existsSync(`/opt/pw-browsers/${shell}/chrome-linux/headless_shell`) ? `/opt/pw-browsers/${shell}/chrome-linux/headless_shell` : null;
const serveUrl = await bundle({ entryPoint: path.join(dir, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id, browserExecutable });
mkdirSync(path.join(dir, 'out/stills'), { recursive: true });
const files = [];
for (const f of frames.map(Number)) {
  const output = path.join(dir, `out/stills/${id}-${String(f).padStart(4, '0')}.png`);
  await renderStill({ serveUrl, composition, frame: f, output, browserExecutable });
  files.push(output);
  console.log(output);
}
const cols = Math.min(4, files.length);
const rows = Math.ceil(files.length / cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex',
  `${files.map((_, i) => `[${i}]scale=960:-2,drawtext=text='${frames[i]}':x=10:y=10:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, () => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|')}${files.length < cols * rows ? ':fill=black' : ''}`,
  '-frames:v', '1', path.join(dir, `out/contact-${id}.jpg`)]);
console.log(`out/contact-${id}.jpg`);
