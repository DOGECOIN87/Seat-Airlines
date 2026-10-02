// Renders every sound-design stem into public/sfx. Usage: node sfx/synth.mjs
import fs from 'node:fs';
import { renderIntro } from './intro.mjs';

const out = new URL('../public/sfx', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
renderIntro(out);
const explainer = new URL('./explainer.mjs', import.meta.url);
if (fs.existsSync(explainer)) (await import(explainer)).renderExplainer(out);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
