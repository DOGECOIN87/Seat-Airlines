/**
 * Sound design for the launch intro and its short: one stereo stem per scene
 * (public/sfx/<cut>-<scene>.wav), every hit placed from config/intro.json and
 * the VO manifest, the same numbers the picture is timed from.
 */
import fs from 'node:fs';
import {
  S, SR, Stem, bell, boom, brown, clamp01, curve, drive, env, filt, flapClick, mix, osc, pad, pink, pip, reverse, riser, rng, whoosh, white,
} from './dsp.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const cfg = read('../config/intro.json');
const voFiles = fs.existsSync(new URL('../config/vo-intro.json', import.meta.url)) ? read('../config/vo-intro.json') : {};
const FPS = cfg.fps;
const IGN = cfg.ignition;

/** Where a cut's VO lines fall, in seconds within their scene, with their phrase starts. */
const voIn = (cut, scene) => cfg.cuts[cut].vo.filter((c) => c.scene === scene && voFiles[c.file]).map((c) => {
  const at = c.band !== undefined ? cfg.cuts[cut].climbKeys[c.band][0] - (c.lead ?? 0) : c.at;
  return { at, end: at + voFiles[c.file].seconds, phrases: voFiles[c.file].phrases.map((p) => at + p) };
});

/** A pentatonic pick, for pings that should sound like they belong together. */
const PENTA = [0, 2, 4, 7, 9];
const note = (base, step) => base * Math.pow(2, (PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

/** Clicks for a split-flap tile landing at frame `land` (flipping every 2 frames for the 10 before). */
function flaps(stem, land, seed, pan, gain = 1) {
  for (let f = land - 10, k = 0; f < land; f += 2, k++) stem.put(f / FPS, flapClick(`${seed}${k}`), 0.22 * gain, pan);
  stem.put(land / FPS, flapClick(`${seed}L`, { land: true }), 0.4 * gain, pan);
}

function sparkle(stem, from, sec, count, seed, gain = 0.12, panFrom = -0.6, panTo = 0.6) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const k = i / Math.max(1, count - 1);
    stem.put(from + k * sec + r() * 0.04, bell(0.9, note(2093, Math.floor(r() * 9)), [[1, 1, 0.35], [2.01, 0.3, 0.15], [3.9, 0.12, 0.08]]), gain * (0.6 + r() * 0.4), panFrom + (panTo - panFrom) * k);
  }
}

/* ── 1. Ignition ── */
function ignition(cut, frames) {
  const Fs = frames / FPS, land = IGN.land / FPS;
  const st = new Stem(Fs + 2.6);
  // A low pad that wakes with the badge and swells into the dive.
  st.put(0, pad(Fs + 0.05, [73.42, 110, 146.83, 185, 220], {
    seed: 'ign-pad',
    amp: (t) => (t < land ? 0.35 * clamp01(t / 0.9) : 0.6 + 0.4 * Math.exp(-(t - land) / 0.6) + 0.5 * clamp01((t - (Fs - 0.8)) / 0.8)) * clamp01((Fs + 0.05 - t) / 0.04),
  }), 0.85);
  filt(st.L, 'lp', (t) => (t < land ? 500 : t > Fs - 0.8 ? 1200 + 4000 * clamp01((t - (Fs - 0.8)) / 0.8) : 900 + 1400 * Math.exp(-(t - land) / 0.5)));
  filt(st.R, 'lp', (t) => (t < land ? 500 : t > Fs - 0.8 ? 1200 + 4000 * clamp01((t - (Fs - 0.8)) / 0.8) : 900 + 1400 * Math.exp(-(t - land) / 0.5)));
  // Reverse swell into the landing, then the slam.
  st.put(land - 0.95, riser(0.95, { seed: 'ign-rise', lo: 200, hi: 6000 }), 0.9, 0);
  st.put(land - 0.95, reverse(env(filt(pink(S(0.95), 'ign-rv'), 'hp', 1500), (t) => Math.exp(-t / 0.25))), 0.4, 0);
  st.put(land, boom(2.6, { seed: 'ign-boom' }), 1.15, 0);
  st.put(land, env(filt(white(S(1.4), 'ign-crash'), 'hp', 3500), (t) => Math.exp(-t / 0.35)), 0.22, 0);
  // The gloss sweeping across the badge, left to right.
  sparkle(st, IGN.shineFrom / FPS, IGN.shineFrames / FPS, 11, 'ign-shine', 0.16);
  st.put(IGN.shineFrom / FPS - 0.1, whoosh(1.1, 0.5, { lo: 3000, hi: 9000, seed: 'ign-air', q: 0.7 }), 0.12, (t) => -0.6 + t);
  // The name tracking in, a breath per letter; the flight number on the flaps.
  for (let i = 0; i < 13; i++) {
    if (i === 4) continue;
    st.put((IGN.wordFrom + i * 1.6) / FPS, env(filt(white(S(0.08), `ign-l${i}`), 'bp', 5000 + i * 200, 1.2), (t) => Math.exp(-t / 0.018)), 0.1, -0.5 + i / 12);
  }
  for (let i = 0; i < 5; i++) flaps(st, IGN.wordFrom + 22 + i * 1.5, `ign-f${i}`, 0.1 + i * 0.08, 0.8);
  // The dive through the badge, and the air on the far side.
  st.put(Fs - 0.75, whoosh(1.7, 0.75, { lo: 180, hi: 4200, seed: 'ign-dive', q: 0.6 }), 2.0, 0);
  st.put(Fs - 0.6, env(osc(S(0.6), (t) => 160 * Math.pow(10, t / 0.6), 'tri'), (t) => Math.pow(t / 0.6, 2)), 0.1, 0);
  st.put(Fs, env(filt(white(S(1.5), 'ign-burst'), 'lp', (t) => 9000 * Math.exp(-t / 0.4) + 600), (t) => Math.exp(-t / 0.45)), 0.7, 0);
  return st.reverb({ wet: 0.28, room: 0.86 });
}

/* ── 2. Sky ── */
function sky(cut, frames) {
  const Fs = frames / FPS, exit = (frames - 24) / FPS;
  const st = new Stem(Fs + 1.6);
  const n = S(Fs + 1.2);
  const wind = (seed) => env(filt(pink(n, seed), 'lp', (t) => 650 + 300 * Math.sin(t * 1.3 + seed.length)), (t) => (0.75 + 0.25 * Math.sin(t * 0.9 + seed.length)) * clamp01(t / 0.15) * clamp01((Fs + 1.2 - t) / 0.8));
  st.putStereo(0, wind('sky-wl'), wind('sky-wr'), 0.9);
  // The airliner: roar and turbine whine, panning with it, a Doppler drop as it accelerates away.
  const d = (t) => (t < exit ? 1 : 1 - 0.14 * clamp01((t - exit) / 0.7));
  const amp = (t) => curve([[0, 0.55], [exit, 0.62], [exit + 0.35, 1], [Fs + 0.4, 0]], t);
  const roar = env(mix([filt(brown(n, 'sky-roar'), 'lp', 800), 1], [filt(pink(n, 'sky-hiss'), 'bp', 2200, 0.8), 0.5]), amp);
  const whine = env(mix([osc(n, (t) => 2300 * d(t)), 0.5], [osc(n, (t) => 3460 * d(t)), 0.25], [osc(n, (t) => 1150 * d(t)), 0.35]), (t) => amp(t) * 0.12);
  const pan = (t) => curve([[0, -0.3], [exit, 0.15], [Fs, 0.95]], t);
  st.put(0, roar, 0.9, pan).put(0, whine, 1, pan);
  st.put(exit - 0.2, whoosh(1.4, 0.55, { seed: 'sky-pass', lo: 300, hi: 2600 }), 0.7, (t) => 0.1 + t * 0.7);
  // A soft weight under each headline line, on the words.
  for (const v of voIn(cut, 'sky')) for (const p of v.phrases) st.put(p - 0.02, boom(0.7, { from: 70, to: 45, seed: `sky-t${p}`, click: 0.1 }), 0.28, 0);
  return st.reverb({ wet: 0.14 });
}

/* ── 3. Seats ── */
const ZONES = [
  { key: 'deck', from: 0, chime: 1568, pan: -0.8 },
  { key: 'first', from: 2, chime: 1318.5, pan: -0.7 },
  { key: 'business', from: 10, chime: 1174.7, pan: -0.45 },
  { key: 'exit', from: 40, chime: 1760, pan: 0.1 },
  { key: 'economy', from: 52, chime: 987.8, pan: -0.25 },
];
function seats(cut, frames) {
  const Fs = frames / FPS;
  const st = new Stem(Fs + 2);
  const lit = (r) => (cfg.seats.fillFrom + r * cfg.seats.perRank) / FPS;
  // The blueprint powering up, and its hum.
  st.put(0, env(osc(S(0.55), (t) => 140 * Math.pow(9, t / 0.55), 'tri'), (t) => clamp01(t / 0.02) * Math.exp(-t / 0.3)), 0.14, 0);
  for (let i = 0; i < 5; i++) st.put(0.05 + i * 0.06, pip(note(1046.5, i)), 0.12, -0.4 + i * 0.2);
  const n = S(Fs + 0.5);
  st.put(0, env(mix([osc(n, 110), 0.6], [osc(n, 220.4), 0.25], [filt(pink(n, 'seat-air'), 'lp', 500), 0.6]), (t) => (0.8 + 0.2 * Math.sin(t * 9)) * clamp01(t / 0.3) * clamp01((Fs + 0.5 - t) / 0.6)), 0.12, 0);
  // A pip per seat, in rank order, climbing the scale; a chime as each cabin opens.
  for (let r = 0; r < 178; r++) {
    const z = [...ZONES].reverse().find((zz) => r >= zz.from);
    const pan = z.key === 'economy' ? -0.25 + ((r - 52) / 126) * 1.05 : z.pan + ((r - z.from) % 6) * 0.03;
    st.put(lit(r), pip(note(880, (r % 10) + 2 * Math.floor(r / 45)), 0.07, 0.028), 0.1, pan);
  }
  for (const z of ZONES) st.put(lit(z.from), bell(1.6, z.chime), 0.2, z.pan);
  const done = lit(177);
  for (const [i, f] of [587.3, 740, 880, 1174.7].entries()) st.put(done + 0.08 + i * 0.03, bell(2.4, f), 0.16, -0.3 + i * 0.2);
  st.put(done + 0.35, boom(0.9, { from: 90, to: 50, seed: 'seat-hold', click: 0.2 }), 0.35, 0);
  for (const v of voIn(cut, 'seats')) if (v.phrases[2] !== undefined) st.put(v.phrases[2] - 0.15, whoosh(0.6, 0.15, { seed: 'seat-gold', lo: 1500, hi: 7000 }), 0.25, -0.6);
  st.put(Fs - 0.55, whoosh(1.2, 0.55, { seed: 'seat-out', lo: 200, hi: 2500 }), 0.5, 0);
  return st.reverb({ wet: 0.22 });
}

/* ── 4. Climb ── */
function climb(cut, frames) {
  const Fs = frames / FPS, keys = cfg.cuts[cut].climbKeys;
  const k = keys.map((x) => x[0]);
  const st = new Stem(Fs + 3.5);
  const n = S(Fs + 0.3);
  const u = (t) => curve(keys, t);
  const jet = (t) => curve([[0, 0.45], [0.2, 1], [0.45, 1], [0.58, 0.03], [1, 0.02]], u(t)) * clamp01((Fs + 0.3 - t) / 0.3);
  // The engines spooling up the climb, gone quiet in vacuum.
  const roar = (seed) => env(filt(brown(n, seed), 'lp', (t) => 220 + 1000 * Math.min(1, u(t) / 0.5), 0.8), jet);
  st.putStereo(0, roar('cl-rl'), roar('cl-rr'), 1);
  st.put(0, env(mix([osc(n, (t) => 420 + 780 * Math.min(1, u(t) / 0.5)), 0.5], [osc(n, (t) => 2 * (420 + 780 * Math.min(1, u(t) / 0.5))), 0.25], [osc(n, (t) => 3.01 * (420 + 780 * Math.min(1, u(t) / 0.5))), 0.12]), (t) => jet(t) * 0.11), 1, 0);
  const shake = (t) => curve([[0, 0.3], [0.15, 0.8], [0.22, 1], [0.35, 0.4], [0.5, 0]], u(t));
  st.put(0, env(drive(filt(brown(n, 'cl-rumble'), 'lp', 90), 2), shake), 0.9, 0);
  const rush = (seed) => env(filt(pink(n, seed), 'bp', (t) => 700 + 500 * Math.sin(t * 2.1), 0.6), (t) => curve([[0, 0.15], [0.12, 0.5], [0.22, 1], [0.3, 0.55], [0.45, 0.15], [0.55, 0]], u(t)) * (0.8 + 0.2 * Math.sin(t * 13)));
  st.putStereo(0, rush('cl-wl'), rush('cl-wr'), 1.1);
  // Through the cloud deck: a riser, then the break.
  st.put(k[1] - 1.1, riser(1.1, { seed: 'cl-rise', lo: 400, hi: 7000 }), 0.55, 0);
  st.put(k[1], whoosh(1.6, 0.06, { seed: 'cl-break', lo: 900, hi: 7000, noise: white }), 0.7, 0);
  st.put(k[1], boom(1.4, { from: 85, to: 40, seed: 'cl-boom' }), 0.75, 0);
  // Each band floor ticks over on the altitude tape (right of frame).
  for (let b = 1; b <= 4; b++) {
    st.put(k[b], flapClick(`cl-tick${b}`, { land: true }), 0.5, 0.75);
    st.put(k[b] + 0.02, pip(note(1046.5, 3 + b), 0.5, 0.14), 0.22, 0.75);
  }
  // Space: the air drains away (a reversed rush), a cold chord opens, stars glint, the plumes hiss.
  st.put(k[2] - 0.9, reverse(whoosh(0.9, 0.08, { seed: 'cl-suck', lo: 400, hi: 5000 })), 0.55, 0);
  const sp = Fs + 0.3 - k[2];
  st.put(k[2], env(mix(...[110, 164.81, 220, 329.63, 440].map((f, i) => [osc(S(sp), f * (1 + (i % 2 ? 0.0015 : -0.001))), [0.5, 0.35, 0.3, 0.2, 0.12][i]])), (t) => clamp01(t / 1.1) * (0.85 + 0.15 * Math.sin(t * 2.4)) * clamp01((sp - t) / 0.3)), 0.2, 0);
  sparkle(st, k[2] + 0.2, Fs - k[2] - 0.3, Math.max(4, Math.round((Fs - k[2]) * 4)), 'cl-stars', 0.07, -0.8, 0.8);
  st.put(k[2], env(filt(white(S(sp), 'cl-plume'), 'lp', 2400), (t) => clamp01(t / 0.8) * clamp01((sp - t) / 0.3)), 0.08, 0);
  // The Moon: a deep struck tone. Mars: a sub hit and a dark swell to the end.
  st.put(k[3], bell(3.6, 98, [[1, 1, 2.2], [2.32, 0.5, 1.3], [4.1, 0.3, 0.8], [6.7, 0.15, 0.4]]), 0.5, 0.35);
  st.put(k[3], boom(1.6, { from: 70, to: 44, seed: 'cl-moon', click: 0.05 }), 0.4, 0);
  st.put(k[4], boom(3.2, { from: 62, to: 30, seed: 'cl-mars', click: 0.15 }), 1, 0);
  st.put(k[4], env(drive(filt(brown(S(2.4), 'cl-mrum'), 'lp', 150), 3), (t) => Math.exp(-t / 0.7)), 0.5, 0);
  st.put(k[4], pad(Fs - k[4] + 0.3, [73.42, 110, 174.61, 220], { seed: 'cl-mpad', cutoff: 700, amp: (t) => clamp01(t / 0.6) }), 0.35, 0);
  // The market-cap readout counting, faster as the climb runs.
  for (let t = 0.2, i = 0; t < Fs - 0.2; i++) {
    const v = (u(t + 0.05) - u(t)) / 0.05;
    st.put(t, pip(2637, 0.03, 0.008), 0.035, -0.75);
    t += Math.max(0.045, 0.16 - v * 0.25);
  }
  // Out: a quick swish into the dip.
  st.put(Fs - 0.35, whoosh(0.7, 0.32, { seed: 'cl-out', lo: 300, hi: 3500 }), 0.45, 0);
  return st.reverb({ wet: 0.2, room: 0.85 });
}

/* ── 5. Departures board ── */
const ROWS = [['SA001', 'CLOUDS', '$1M', 'DEPARTED'], ['SA010', 'SPACE', '$10M', 'DEPARTED'], ['SA050', 'THE MOON', '$50M', 'BOARDING'], ['SA100', 'MARS', '$100M', 'ON TIME']];
const COLS = [5, 8, 5, 8];
function board(cut, frames) {
  const Fs = frames / FPS, B = cfg.board;
  const st = new Stem(Fs + 1.5);
  const n = S(Fs + 0.3);
  st.putStereo(0, env(filt(pink(n, 'bd-rl'), 'lp', 380), () => 0.5), env(filt(pink(n, 'bd-rr'), 'lp', 380), () => 0.5), 0.35);
  st.put(0, whoosh(0.7, 0.22, { seed: 'bd-in', lo: 200, hi: 1800 }), 0.45, 0);
  ROWS.forEach((row, r) => {
    const text = row.map((s, c) => s.padEnd(COLS[c], ' ')).join('');
    [...text].forEach((ch, i) => {
      if (ch === ' ') return;
      flaps(st, B.from + r * B.rowGap + B.settle + i * B.perChar, `bd${r}-${i}`, -0.65 + (1.3 * i) / 25, 0.75);
    });
  });
  const boarding = (B.from + 2 * B.rowGap + B.settle + 25 * B.perChar) / FPS;
  st.put(boarding + 0.1, pip(1318.5, 0.3, 0.09), 0.18, 0.6).put(boarding + 0.26, pip(1046.5, 0.4, 0.12), 0.18, 0.6);
  for (const v of voIn(cut, 'board')) for (const p of v.phrases) st.put(p - 0.02, boom(0.8, { from: 75, to: 45, seed: `bd-t${p}`, click: 0.12 }), 0.32, 0);
  st.put(Fs - 1.0, riser(1.0, { seed: 'bd-rise', lo: 300, hi: 8000 }), 0.55, 0);
  return st.reverb({ wet: 0.16 });
}

/* ── 6. End card ── */
function end(cut, frames) {
  const Fs = frames / FPS;
  const st = new Stem(Fs);
  // The flash: an impact, a cymbal wash and a struck D-major chord that rings out.
  st.put(0, boom(3, { seed: 'end-boom', from: 100, to: 34 }), 1.2, 0);
  st.put(0, env(filt(white(S(2.6), 'end-crash'), 'hp', (t) => 2500 + 2500 * Math.exp(-t / 0.3)), (t) => Math.exp(-t / 0.7)), 0.3, 0);
  for (const [i, f] of [293.66, 440, 587.33, 739.99, 880, 1174.66].entries()) st.put(0.01 * i, bell(Fs, f, [[1, 1, 2.6], [2, 0.35, 1.4], [3.01, 0.18, 0.8], [5.2, 0.06, 0.3]]), 0.22, -0.5 + i * 0.2);
  st.put(0, pad(Fs, [146.83, 220, 293.66, 369.99, 440], { seed: 'end-pad', cutoff: 1100, amp: (t) => 0.4 + 0.6 * Math.exp(-t / 1.2) }), 0.4, 0);
  // The airliner crossing the name.
  st.put(12 / FPS, whoosh(1.7, 0.7, { seed: 'end-pass', lo: 300, hi: 2800 }), 0.55, (t) => -0.9 + t * 1.1);
  st.put(12 / FPS, env(mix([osc(S(1.7), (t) => 2300 * (t < 0.7 ? 1.05 : 0.95)), 1]), (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.7)), 2)), 0.05, (t) => -0.9 + t * 1.1);
  // The web address on the flaps.
  [...'SEAT-AIRLINES.SPACE'].forEach((ch, i) => flaps(st, 28 + i * 0.8, `end-u${i}`, -0.55 + (1.1 * i) / 18, 0.6));
  // The closing PA chime, once the voice is done.
  const vo = voIn(cut, 'end')[0];
  const chime = Math.max(Fs - 1.25, vo ? vo.end + 0.12 : 0);
  st.put(chime, bell(2, 1174.66), 0.32, 0).put(chime + 0.42, bell(2, 880), 0.32, 0);
  st.reverb({ wet: 0.34, room: 0.9 });
  return st.fadeOut(0.45);
}

const SCENES = { ignition, sky, seats, climb, board, end };

export function renderIntro(outDir) {
  for (const [cut, c] of Object.entries(cfg.cuts)) {
    for (const s of c.scenes) {
      const stem = SCENES[s.id](cut, s.frames);
      const file = `${outDir}/${cut}-${s.id}.wav`;
      stem.write(file, -3);
      console.log(`${file}  ${(stem.n / SR).toFixed(2)} s`);
    }
  }
}
