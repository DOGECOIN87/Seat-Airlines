/**
 * Sound for the adverts explainer (public/sfx/adverts.wav). The recording keeps
 * its own clicks; this scores the drawn scenes around it, on the frames in
 * config/adverts.json.
 */
import fs from 'node:fs';
import { S, Stem, bell, boom, clamp01, env, filt, flapClick, mix, osc, pink, pip, whoosh, white } from './dsp.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config/adverts.json', import.meta.url)));
const T = (f) => f / cfg.fps;
const click = (seed) => mix([env(filt(white(S(0.03), seed), 'bp', 3800, 1.5), (t) => Math.exp(-t / 0.003)), 1], [env(osc(S(0.03), 1900), (t) => Math.exp(-t / 0.006)), 0.25]);

export function renderAdverts(outDir) {
  const starts = {};
  let at = 0;
  for (const s of cfg.scenes) { starts[s.id] = at; at += s.frames; }
  const st = new Stem(T(at) + 0.2);
  const t = (id, f) => T(starts[id] + f);
  // A quiet room under the drawn scenes; the recording brings its own.
  const bed = filt(pink(st.n, 'adv-room'), 'lp', 700);
  const rec0 = t('recording', 0), rec1 = t('steps', 0);
  st.put(0, env(bed, (x) => (x < rec0 ? clamp01((rec0 - x) / 0.3) : x > rec1 ? clamp01((x - rec1) / 0.3) : 0)), 0.06, 0);
  // Title: the PA chime, the badge, its gloss.
  st.put(0.1, bell(2.2, 1174.66), 0.3, 0).put(0.55, bell(2.2, 880), 0.3, 0);
  st.put(t('title', 2), boom(1, { from: 110, to: 55, seed: 'adv-badge', click: 0.2 }), 0.4, 0);
  for (let i = 0; i < 7; i++) st.put(t('title', 14) + i * 0.1, bell(0.8, 2093 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14][i] / 12), [[1, 1, 0.3], [2.01, 0.3, 0.12]]), 0.08, -0.6 + i * 0.2);
  st.put(t('recording', 0) - 0.3, whoosh(0.7, 0.3, { seed: 'adv-in', lo: 400, hi: 3200 }), 0.3, 0);
  // Steps: each card arrives; the two buttons are pressed.
  st.put(t('steps', 0), whoosh(0.6, 0.2, { seed: 'adv-st', lo: 400, hi: 3000 }), 0.3, 0);
  cfg.stepAt.forEach((f, i) => {
    st.put(t('steps', f), whoosh(0.4, 0.12, { seed: `adv-s${i}`, lo: 800, hi: 4500 }), 0.2, 0.4);
    st.put(t('steps', f + 3), pip(784 * Math.pow(2, [0, 4, 7, 12][i] / 12), 0.25, 0.08), 0.18, 0.4);
    if (i === 1 || i === 3) st.put(t('steps', f + 26), click(`adv-c${i}`), 0.5, 0.4).put(t('steps', f + 26) + 0.07, click(`adv-d${i}`), 0.3, 0.4);
    if (i === 2) st.put(t('steps', f + 20), boom(0.5, { from: 170, to: 90, seed: 'adv-img', click: 0.3 }), 0.3, 0.6);
  });
  const pub = t('steps', cfg.stepAt[3] + 30);
  st.put(pub, bell(2, 1174.66), 0.25, 0.4).put(pub + 0.42, bell(2, 880), 0.25, 0.4);
  // Follows: the tiles, the move up, the landing.
  for (let i = 0; i < 12; i++) st.put(t('follows', i), pip(880 * Math.pow(2, (i % 6) / 12), 0.05, 0.015), 0.06, 0.4);
  st.put(t('follows', cfg.moveAt) - 0.05, whoosh(0.9, 0.4, { seed: 'adv-mv', lo: 400, hi: 3200 }), 0.45, 0.4);
  st.put(t('follows', cfg.moveAt + 22), boom(0.5, { from: 150, to: 80, seed: 'adv-land', click: 0.3 }), 0.35, 0.4);
  // End: the chord, the flaps, the PA.
  for (const [i, f] of [293.66, 440, 587.33, 739.99, 880].entries()) st.put(t('end', 0) + i * 0.02, bell(3.5, f, [[1, 1, 2.2], [2, 0.35, 1.2], [3.01, 0.15, 0.6]]), 0.14, -0.4 + i * 0.2);
  [...'SEAT-AIRLINES.SPACE'].forEach((ch, i) => {
    const land = cfg.urlAt + i * 0.8;
    for (let f = land - 10; f < land; f += 2) st.put(t('end', f), flapClick(`adv-u${i}${f}`), 0.12, -0.5 + i / 18);
    st.put(t('end', land), flapClick(`adv-u${i}L`, { land: true }), 0.22, -0.5 + i / 18);
  });
  st.reverb({ wet: 0.2 });
  st.fadeOut(0.5);
  st.write(`${outDir}/adverts.wav`, -4);
  console.log(`${outDir}/adverts.wav`);
}
