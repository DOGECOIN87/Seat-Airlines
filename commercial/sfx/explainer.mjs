/**
 * Sound design for the looping explainer: a cabin bed that loops on the
 * film's exact length (public/sfx/explainer-bed.wav), and one stem per
 * chapter (explainer-<chapter>.wav) with every click, flip and chime on the
 * frame config/explainer.json gives the picture.
 */
import fs from 'node:fs';
import {
  S, SR, Stem, bell, boom, brown, clamp01, env, filt, flapClick, mix, osc, pad, pink, pip, reverse, rng, whoosh, white,
} from './dsp.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const cfg = read('../config/explainer.json');
const voPath = new URL('../config/vo-explainer.json', import.meta.url);
const VO = fs.existsSync(voPath) ? read(voPath) : {};
const FPS = cfg.fps;
const T = (frames) => frames / FPS;

/** Chapter lengths, as src/explainer/timing.ts computes them. */
const CHAPTERS = (() => {
  let at = 0;
  return cfg.chapters.map((c) => {
    const line = VO[c.vo];
    const frames = Math.max(c.frames, line ? Math.ceil((c.voAt + line.seconds + cfg.tail) * FPS) : 0);
    const out = { ...c, from: at, frames };
    at += frames;
    return out;
  });
})();
const TOTAL = CHAPTERS.reduce((n, c) => n + c.frames, 0);

const click = (seed) => mix([env(filt(white(S(0.03), seed), 'bp', 3800, 1.5), (t) => Math.exp(-t / 0.003)), 1], [env(osc(S(0.03), 1900), (t) => Math.exp(-t / 0.006)), 0.25]);
const mouse = (st, at, pan = 0.4) => st.put(at, click('m' + at), 0.5, pan).put(at + 0.07, click('n' + at), 0.32, pan);
const success = (st, at, base = 1046.5, pan = 0.4) => [0, 4, 7, 12].forEach((s, i) => st.put(at + i * 0.055, pip(base * Math.pow(2, s / 12), 0.35, 0.09), 0.16, pan));
const sparkle = (st, at, sec, count, seed, gain = 0.1) => {
  const r = rng(seed);
  for (let i = 0; i < count; i++) st.put(at + (i / count) * sec, bell(0.8, 2093 * Math.pow(2, [0, 2, 4, 7, 9, 12][Math.floor(r() * 6)] / 12), [[1, 1, 0.3], [2.01, 0.3, 0.12]]), gain, -0.6 + (1.2 * i) / count);
};
const slide = (st, at = 0) => st.put(at, whoosh(0.55, 0.16, { seed: 'sl' + at, lo: 400, hi: 3200 }), 0.3, 0.2);
const glide = (from, to, sec) => env(osc(S(sec), (t) => from * Math.pow(to / from, t / sec), 'tri'), (t) => clamp01(t / 0.03) * clamp01((sec - t) / 0.08));

const VIEWS = {
  title(st, c) {
    sparkle(st, T(c.cues.shine), 1, 9, 'x-title', 0.12);
    st.put(T(c.cues.shine) - 0.1, whoosh(1.1, 0.5, { seed: 'x-tair', lo: 3000, hi: 9000 }), 0.12, 0);
  },
  token(st, c) {
    slide(st);
    st.put(T(c.cues.strip), whoosh(0.4, 0.12, { seed: 'x-strip', lo: 800, hi: 5000 }), 0.3, 0.3);
    mouse(st, T(c.cues.click));
    success(st, T(c.cues.toast));
  },
  checkin(st, c) {
    slide(st);
    mouse(st, T(c.cues.connect));
    for (let i = 0; i < 4; i++) st.put(T(c.cues.list + i * 4), pip(784 * Math.pow(2, i * 2 / 12), 0.12, 0.04), 0.12, 0.3);
    mouse(st, T(c.cues.pick));
    st.put(T(c.cues.pass) - 0.05, whoosh(0.7, 0.25, { seed: 'x-flip', lo: 500, hi: 4000 }), 0.45, 0.3);
    st.put(T(c.cues.pass + 16), bell(1.8, 1318.5), 0.25, 0.3).put(T(c.cues.pass + 16) + 0.12, bell(1.8, 1760), 0.2, 0.3);
  },
  seat(st, c) {
    slide(st);
    for (let r = 0; r < 178; r += 2) st.put(T(c.cues.fill + r * 0.4), pip(660 * Math.pow(2, Math.floor(r / 20) * 2 / 12), 0.05, 0.015), 0.06, -0.3 + (r / 178) * 1.0);
    st.put(T(c.cues.you), mix([glide(1400, 700, 0.18), 1]), 0.12, 0.3);
    st.put(T(c.cues.you + 10), bell(1.6, 1567.98), 0.28, 0.3);
    st.put(T(c.cues.hold), boom(0.8, { from: 90, to: 50, seed: 'x-hold', click: 0.2 }), 0.3, 0.3);
  },
  moveup(st, c) {
    slide(st);
    st.put(T(c.cues.grow), env(glide(330, 660, T(c.cues.pass - c.cues.grow)), () => 0.6), 0.08, 0.3);
    st.put(T(c.cues.pass), whoosh(0.6, 0.22, { seed: 'x-swap', lo: 600, hi: 4000 }), 0.4, 0.3);
    st.put(T(c.cues.chime), bell(2.2, 1174.66), 0.32, 0).put(T(c.cues.chime) + 0.45, bell(2.2, 880), 0.32, 0);
  },
  altitude(st, c) {
    slide(st);
    c.cues.bands.forEach((b, i) => {
      st.put(T(b), flapClick(`x-b${i}`, { land: true }), 0.35, 0.1);
      st.put(T(b) + 0.02, pip(523.25 * Math.pow(2, [0, 4, 7, 12, 16][i] / 12), 0.4, 0.12), 0.16, 0.1);
      if (i) st.put(T(b) - 0.5, whoosh(0.7, 0.48, { seed: `x-bw${i}`, lo: 300, hi: 2200 }), 0.2, 0);
    });
    st.put(T(c.cues.pitchUp), glide(300, 600, 0.4), 0.1, 0.4);
    st.put(T(c.cues.pitchDown), glide(600, 260, 0.45), 0.1, 0.4);
  },
  billboard(st, c) {
    slide(st);
    for (let i = 0; i < 18; i++) st.put(T(c.cues.grid + i), click(`x-g${i}`), 0.12, -0.2 + i * 0.05);
    for (let f = c.cues.upload; f < c.cues.drop - 12; f += 3) st.put(T(f), pip(1200 + (f - c.cues.upload) * 18, 0.03, 0.01), 0.05, 0.4);
    st.put(T(c.cues.drop), boom(0.5, { from: 160, to: 90, seed: 'x-drop', click: 0.3 }), 0.3, 0.2);
    sparkle(st, T(c.cues.drop), 0.4, 5, 'x-ad', 0.1);
    st.put(T(c.cues.move), whoosh(0.9, 0.4, { seed: 'x-move', lo: 400, hi: 3000 }), 0.35, 0.3);
    st.put(T(c.cues.land), boom(0.4, { from: 140, to: 80, seed: 'x-land', click: 0.25 }), 0.25, 0.3);
  },
  fly(st, c) {
    slide(st);
    const len = T(c.frames) + 0.4, n = S(len), fire = T(c.cues.fire), tenK = T(c.cues.tenK);
    const roar = env(filt(brown(n, 'x-roar'), 'lp', (t) => 300 + 600 * clamp01(t / tenK)), (t) => clamp01(t / 0.4) * clamp01((len - t) / 0.4) * (t > fire ? 0.75 : 1));
    st.put(0, roar, 0.6, 0);
    st.put(0, env(osc(n, (t) => 500 + 600 * clamp01(t / tenK) - (t > fire ? 120 : 0)), (t) => 0.5 * clamp01(t / 0.4) * clamp01((len - t) / 0.4)), 0.05, 0);
    c.cues.keys.forEach((kf, i) => st.put(T(kf), click(`x-k${i}`), 0.4, -0.6));
    st.put(tenK, bell(1.4, 1567.98), 0.22, 0.6);
    st.put(fire, boom(1.6, { from: 110, to: 40, seed: 'x-fire', click: 0.4 }), 0.6, -0.3);
    st.put(fire, env(filt(white(S(1.2), 'x-crack'), 'lp', 3000), (t) => Math.exp(-t / 0.25)), 0.25, -0.3);
    // Master caution: two tones, alternating, until the score.
    for (let t = fire + 0.1, i = 0; t < T(c.cues.score) - 0.1; t += 0.2, i++) st.put(t, env(filt(osc(S(0.18), i % 2 ? 660 : 880, 'square'), 'lp', 2500), (x) => clamp01(x / 0.01) * clamp01((0.18 - x) / 0.02)), 0.07, -0.4);
    success(st, T(c.cues.score), 1046.5, 0.5);
  },
  safety(st, c) {
    slide(st);
    st.put(T(c.cues.card), whoosh(0.5, 0.15, { seed: 'x-card', lo: 500, hi: 3500 }), 0.25, 0.3);
    for (const at of [c.cues.cross, c.cues.cross + 8]) st.put(T(at), env(filt(osc(S(0.22), 140, 'square'), 'lp', 900), (t) => clamp01(t / 0.01) * clamp01((0.22 - t) / 0.03)), 0.1, 0.3);
    success(st, T(c.cues.check), 1318.5, 0.3);
  },
  outro(st, c) {
    st.put(T(c.cues.badge), boom(1.8, { from: 90, to: 40, seed: 'x-out', click: 0.15 }), 0.5, 0);
    for (const [i, f] of [587.33, 739.99, 880, 1174.66].entries()) st.put(T(c.cues.badge) + i * 0.02, bell(2.6, f), 0.14, -0.3 + i * 0.2);
    sparkle(st, T(14), 0.9, 8, 'x-oshine', 0.1);
    [...'SEAT-AIRLINES.SPACE'].forEach((ch, i) => {
      const land = c.cues.url + i * 0.8;
      for (let f = land - 10; f < land; f += 2) st.put(T(f), flapClick(`x-u${i}${f}`), 0.12, -0.5 + i / 18);
      st.put(T(land), flapClick(`x-u${i}L`, { land: true }), 0.22, -0.5 + i / 18);
    });
    // Back to the top: a soft reversed swell into the title.
    st.put(T(c.frames) - 0.9, reverse(whoosh(0.9, 0.1, { seed: 'x-seam', lo: 2000, hi: 8000 })), 0.18, 0);
  },
};

/** The bed: cabin hum, air, and a quiet chord, every movement a whole number of cycles per loop, crossfaded at the seam. */
function bed() {
  const L = T(TOTAL), X = 2, n = S(L + X);
  const st = new Stem(L + X);
  const cyc = (k) => (2 * Math.PI * k) / L;
  st.putStereo(0, filt(brown(n, 'bed-hl'), 'lp', 180), filt(brown(n, 'bed-hr'), 'lp', 180), 0.5);
  st.putStereo(0, env(filt(pink(n, 'bed-al'), 'lp', 1400), (t) => 0.7 + 0.3 * Math.sin(cyc(3) * t)), env(filt(pink(n, 'bed-ar'), 'lp', 1400), (t) => 0.7 + 0.3 * Math.cos(cyc(3) * t)), 0.12);
  st.put(0, pad(L + X, [146.83, 220, 293.66, 329.63, 440], { seed: 'bed-pad', cutoff: 800, amp: (t) => 0.75 + 0.25 * Math.sin(cyc(2) * t) }), 0.16, 0);
  // Seam: fold the extra X seconds back over the head.
  const k = S(X), m = S(L);
  for (const ch of [st.L, st.R]) for (let i = 0; i < k; i++) { const a = i / k; ch[i] = ch[i] * Math.sqrt(a) + ch[m + i] * Math.sqrt(1 - a); }
  const out = new Stem(L);
  out.L.set(st.L.subarray(0, out.n)); out.R.set(st.R.subarray(0, out.n));
  return out;
}

export function renderExplainer(outDir) {
  bed().write(`${outDir}/explainer-bed.wav`, -6);
  console.log(`${outDir}/explainer-bed.wav  ${T(TOTAL).toFixed(2)} s (loops)`);
  for (const c of CHAPTERS) {
    const st = new Stem(T(c.frames) + 3);
    VIEWS[c.id](st, c);
    st.reverb({ wet: 0.18 });
    if (c.id === 'outro') st.fadeOut(3.05);
    st.write(`${outDir}/explainer-${c.id}.wav`, -4);
    console.log(`${outDir}/explainer-${c.id}.wav`);
  }
}
