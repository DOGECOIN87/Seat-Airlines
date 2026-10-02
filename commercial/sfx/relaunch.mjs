/**
 * Sound for the re-launch announcement (public/sfx/relaunch.wav): the PA,
 * a warning pulse, the board flipping, the badge slam, the SOON stamp, the
 * flyover and the sign-off. Timed from config/relaunch.json.
 */
import fs from 'node:fs';
import { S, Stem, bell, boom, brown, clamp01, env, filt, flapClick, osc, pad, pink, pip, riser, whoosh, white } from './dsp.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config/relaunch.json', import.meta.url)));
const T = (f) => f / cfg.fps;

function flaps(st, text, land, width, seed) {
  [...text.padEnd(width, ' ')].forEach((ch, i) => {
    if (ch === ' ') return;
    const at = land + i * 0.8;
    const pan = -0.5 + i / width;
    for (let f = at - 10; f < at; f += 2) st.put(T(f), flapClick(`${seed}${i}${f}`), 0.2, pan);
    st.put(T(at), flapClick(`${seed}${i}L`, { land: true }), 0.38, pan);
  });
}

export function renderRelaunch(outDir) {
  const [a, b, c] = cfg.scenes;
  const st = new Stem(T(cfg.total) + 0.2);
  // 1. The PA chime, then the warning: an amber pulse in time with the blinking triangles.
  st.put(0.05, bell(2.4, 1174.66), 0.4, 0).put(0.5, bell(2.4, 880), 0.4, 0);
  for (let f = 0; f < a; f += 16) st.put(T(f + 4), env(filt(osc(S(0.2), 440, 'square'), 'lp', 1400), (t) => clamp01(t / 0.01) * Math.exp(-t / 0.08)), 0.08, 0);
  st.put(0, env(filt(brown(S(T(a) + 0.3), 'rl-hum'), 'lp', 160), (t) => clamp01(t / 0.5)), 0.5, 0);
  st.put(T(20), boom(0.9, { from: 80, to: 45, seed: 'rl-att', click: 0.15 }), 0.4, 0);
  // 2. The board: DELAYED lands, then everything flips to RE-LAUNCHING, SOON.
  st.put(T(a), boom(1.2, { from: 120, to: 50, seed: 'rl-cut', click: 0.4 }), 0.55, 0);
  flaps(st, '$SEAT', a + 6, 12, 'f');
  flaps(st, 'DELAYED', a + 14, 12, 's');
  st.put(T(a + cfg.boardFlip - 14), riser(0.5, { seed: 'rl-flip', lo: 600, hi: 6000 }), 0.3, 0);
  flaps(st, 'RE-LAUNCHING', a + cfg.boardFlip, 12, 'r');
  flaps(st, 'SOON', a + cfg.boardFlip + 16, 12, 'd');
  st.put(T(a + cfg.boardFlip + 26), pip(1318.5, 0.3, 0.09), 0.2, 0.3).put(T(a + cfg.boardFlip + 30), pip(1760, 0.4, 0.12), 0.2, 0.3);
  // 3. The badge: a swell into the slam, a chord, then the SOON stamp.
  const bs = a + b;
  st.put(T(bs + cfg.badgeLand) - 0.8, riser(0.8, { seed: 'rl-rise', lo: 200, hi: 7000 }), 0.6, 0);
  st.put(T(bs + cfg.badgeLand), boom(2.6, { seed: 'rl-boom' }), 1.2, 0);
  st.put(T(bs + cfg.badgeLand), env(filt(white(S(1.2), 'rl-crash'), 'hp', 3500), (t) => Math.exp(-t / 0.35)), 0.25, 0);
  st.put(T(bs + cfg.badgeLand), pad(T(c - cfg.badgeLand) + 0.3, [146.83, 220, 293.66, 369.99, 440], { seed: 'rl-pad', cutoff: 1300, amp: (t) => clamp01(t / 0.2) * (0.7 + 0.3 * Math.exp(-t / 0.8)) }), 0.45, 0);
  st.put(T(bs + cfg.stamp), boom(1, { from: 140, to: 60, seed: 'rl-stamp', click: 0.6 }), 0.8, 0);
  st.put(T(bs + cfg.stamp), env(filt(white(S(0.3), 'rl-stp'), 'bp', 1800, 1), (t) => Math.exp(-t / 0.05)), 0.4, 0);
  // 4. The safety card ticks in, the plane crosses, and the sign-off chord rings out.
  const ss = a + b + c;
  st.put(T(ss), whoosh(0.7, 0.2, { seed: 'rl-in', lo: 400, hi: 4000 }), 0.4, 0);
  for (const i of [0, 1]) st.put(T(ss + 10 + i * 10), pip(1046.5 * (1 + i * 0.25), 0.25, 0.07), 0.18, -0.4);
  st.put(T(ss + 30), env(filt(osc(S(0.22), 150, 'square'), 'lp', 900), (t) => clamp01(t / 0.01) * clamp01((0.22 - t) / 0.03)), 0.12, -0.4);
  st.put(T(ss + cfg.flyover), whoosh(1.6, 0.7, { seed: 'rl-fly', lo: 300, hi: 2800 }), 0.55, (t) => -0.9 + t * 1.1);
  for (const [i, f] of [293.66, 440, 587.33, 739.99, 880].entries()) st.put(T(ss + cfg.lockup) + i * 0.02, bell(3, f, [[1, 1, 2.2], [2, 0.35, 1.2], [3.01, 0.15, 0.6]]), 0.16, -0.4 + i * 0.2);
  flaps(st, 'SEAT-AIRLINES.SPACE', ss + cfg.lockup + 8, 19, 'u');
  st.put(T(ss + cfg.lockup + 26), bell(2, 1174.66), 0.25, 0).put(T(ss + cfg.lockup + 26) + 0.42, bell(2, 880), 0.25, 0);
  st.put(0, filt(pink(st.n, 'rl-air'), 'lp', 900), 0.05, 0);
  st.reverb({ wet: 0.25 });
  st.fadeOut(0.5);
  st.write(`${outDir}/relaunch.wav`, -3);
  console.log(`${outDir}/relaunch.wav`);
}
