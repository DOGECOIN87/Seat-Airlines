/**
 * A small, dependency-free synth toolkit for the films' sound design:
 * seeded noise, oscillators, swept biquads, a Freeverb, stereo placement and
 * a WAV writer. Everything is deterministic: the same code renders the same
 * file, bit for bit.
 */
import fs from 'node:fs';

export const SR = 48000;
export const S = (sec) => Math.max(0, Math.round(sec * SR));
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Piecewise-linear lookup through [[x, y], ...]. */
export const curve = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return pts[pts.length - 1][1];
};

export function rng(seed) {
  let a = typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Sources ───────────────────────────────────────────────────────── */

export function white(n, seed) {
  const r = rng(seed), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Pink noise (Paul Kellet's filter), roughly unit peak. */
export function pink(n, seed) {
  const r = rng(seed), out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise, a leaky integral of white, roughly unit peak. */
export function brown(n, seed) {
  const r = rng(seed), out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = (y + (r() * 2 - 1) * 0.02) * 0.998; out[i] = y * 3.2; }
  return out;
}

/** An oscillator whose frequency is a function of time (seconds). shape: sine | saw | tri | square. */
export function osc(n, freq, shape = 'sine', phase0 = 0) {
  const out = new Float32Array(n);
  const f = typeof freq === 'function' ? freq : () => freq;
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    ph += f(i / SR) / SR;
    ph -= Math.floor(ph);
    out[i] = shape === 'sine' ? Math.sin(2 * Math.PI * ph) : shape === 'saw' ? 2 * ph - 1 : shape === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : ph < 0.5 ? 1 : -1;
  }
  return out;
}

/** A struck bell or chime: inharmonic partials, each with its own decay. */
export function bell(sec, f0, partials = [[1, 1, 1.6], [2, 0.5, 0.9], [2.76, 0.32, 0.6], [5.4, 0.14, 0.3], [8.93, 0.06, 0.18]]) {
  const n = S(sec), out = new Float32Array(n);
  for (const [ratio, amp, decay] of partials) {
    const w = (2 * Math.PI * f0 * ratio) / SR;
    for (let i = 0; i < n; i++) out[i] += Math.sin(w * i) * amp * Math.exp(-i / SR / decay);
  }
  for (let i = 0; i < Math.min(n, 96); i++) out[i] *= i / 96;
  return out;
}

/* ── Shaping ───────────────────────────────────────────────────────── */

/** Multiplies a signal by an envelope given as a function of time (seconds). */
export function env(sig, fn) {
  for (let i = 0; i < sig.length; i++) sig[i] *= fn(i / SR);
  return sig;
}
export const mix = (...sigs) => {
  const n = Math.max(...sigs.map(([s]) => s.length)), out = new Float32Array(n);
  for (const [s, g] of sigs) for (let i = 0; i < s.length; i++) out[i] += s[i] * g;
  return out;
};
export const drive = (sig, k = 2) => { for (let i = 0; i < sig.length; i++) sig[i] = Math.tanh(sig[i] * k) / Math.tanh(k); return sig; };
export const reverse = (sig) => sig.slice().reverse();

class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q) {
    const w = (2 * Math.PI * Math.min(Math.max(f, 10), SR * 0.45)) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Filters in place: type lp | hp | bp, cutoff a number or a function of time, q likewise. */
export function filt(sig, type, cutoff, q = 0.707) {
  const bq = new Biquad();
  const fc = typeof cutoff === 'function' ? cutoff : () => cutoff;
  const fq = typeof q === 'function' ? q : () => q;
  for (let i = 0; i < sig.length; i++) {
    if (i % 32 === 0) bq.set(type, fc(i / SR), fq(i / SR));
    sig[i] = bq.p(sig[i]);
  }
  return sig;
}

/* ── The stem: a stereo buffer things are placed into ──────────────── */

export class Stem {
  constructor(sec) { this.n = S(sec); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  /** Adds a mono signal at `at` seconds, with gain and a pan (−1…1, or a function of time from the signal's start). */
  put(at, sig, gain = 1, pan = 0) {
    const o = S(at), pf = typeof pan === 'function' ? pan : () => pan;
    let gl = 0, gr = 0;
    for (let i = 0; i < sig.length && o + i < this.n; i++) {
      if (i % 64 === 0) {
        const p = (Math.max(-1, Math.min(1, pf(i / SR))) + 1) * Math.PI / 4;
        gl = gain * Math.cos(p); gr = gain * Math.sin(p);
      }
      if (o + i < 0) continue;
      this.L[o + i] += sig[i] * gl;
      this.R[o + i] += sig[i] * gr;
    }
    return this;
  }
  /** Adds a stereo pair (two mono signals) at `at` seconds. */
  putStereo(at, l, r, gain = 1) {
    const o = S(at);
    for (let i = 0; i < l.length && o + i < this.n; i++) if (o + i >= 0) { this.L[o + i] += l[i] * gain; this.R[o + i] += r[i] * gain; }
    return this;
  }
  add(other, gain = 1) {
    for (let i = 0; i < Math.min(this.n, other.n); i++) { this.L[i] += other.L[i] * gain; this.R[i] += other.R[i] * gain; }
    return this;
  }
  /** Freeverb over the whole stem, mixed back in at `wet`. */
  reverb({ room = 0.82, damp = 0.35, wet = 0.25, width = 1 } = {}) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * SR / 44100));
    const aps = [556, 441, 341, 225].map((d) => Math.round(d * SR / 44100));
    const run = (spread) => {
      const cs = combs.map((d) => ({ b: new Float32Array(d + spread), i: 0, s: 0 }));
      const as = aps.map((d) => ({ b: new Float32Array(d + spread), i: 0 }));
      const out = new Float32Array(this.n);
      const fb = 0.28 + room * 0.7, dm = damp * 0.4;
      for (let i = 0; i < this.n; i++) {
        const x = (this.L[i] + this.R[i]) * 0.015;
        let y = 0;
        for (const c of cs) { const o = c.b[c.i]; c.s = o * (1 - dm) + c.s * dm; c.b[c.i] = x + c.s * fb; c.i = (c.i + 1) % c.b.length; y += o; }
        for (const a of as) { const o = a.b[a.i]; const z = -y + o; a.b[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.b.length; y = z; }
        out[i] = y;
      }
      return out;
    };
    const rl = run(0), rr = run(23);
    const w1 = wet * (width / 2 + 0.5), w2 = wet * ((1 - width) / 2);
    for (let i = 0; i < this.n; i++) {
      const l = rl[i] * w1 + rr[i] * w2, r = rr[i] * w1 + rl[i] * w2;
      this.L[i] += l * 3; this.R[i] += r * 3;
    }
    return this;
  }
  /** Fades the last `sec` seconds to silence. */
  fadeOut(sec) {
    const k = S(sec);
    for (let i = 0; i < k; i++) { const g = 1 - i / k; this.L[this.n - k + i] *= g; this.R[this.n - k + i] *= g; }
    return this;
  }
  /** Normalises to a peak (dBFS) and writes 16-bit stereo WAV. */
  write(path, peakDb = -3) {
    // Nothing below 28 Hz: it eats headroom and no speaker plays it.
    filt(filt(this.L, 'hp', 28), 'hp', 28); filt(filt(this.R, 'hp', 28), 'hp', 28);
    let peak = 1e-9;
    for (let i = 0; i < this.n; i++) peak = Math.max(peak, Math.abs(this.L[i]), Math.abs(this.R[i]));
    const g = Math.pow(10, peakDb / 20) / peak;
    const data = Buffer.alloc(44 + this.n * 4);
    data.write('RIFF', 0); data.writeUInt32LE(36 + this.n * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
    data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(this.n * 4, 40);
    for (let i = 0; i < this.n; i++) {
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.L[i] * g)) * 32767), 44 + i * 4);
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.R[i] * g)) * 32767), 46 + i * 4);
    }
    fs.writeFileSync(path, data);
    return this;
  }
}

/* ── Stock sounds ──────────────────────────────────────────────────── */

/** A sub boom: a pitch-dropping sine, a click and a thump. */
export function boom(sec = 2.6, { from = 95, to = 36, seed = 'boom', click = 0.35 } = {}) {
  const n = S(sec);
  const sub = env(osc(n, (t) => to + (from - to) * Math.exp(-t / 0.09)), (t) => Math.exp(-t / 0.75) * clamp01(t / 0.004));
  const thump = env(filt(brown(n, seed), 'lp', 180), (t) => Math.exp(-t / 0.18));
  const tick = env(filt(white(n, seed + 'c'), 'hp', 2500), (t) => Math.exp(-t / 0.006));
  return drive(mix([sub, 1], [thump, 0.7], [tick, click]), 1.4);
}

/** A whoosh: band-passed noise sweeping up then down, loudest at `peak` seconds. */
export function whoosh(sec, peak, { lo = 250, hi = 3200, seed = 'wh', q = 0.9, noise = pink } = {}) {
  const n = S(sec);
  const sig = noise(n, seed);
  filt(sig, 'bp', (t) => (t < peak ? lo * Math.pow(hi / lo, Math.pow(t / peak, 1.6)) : hi * Math.pow(lo / hi, Math.min(1, (t - peak) / (sec - peak)))), q);
  return env(sig, (t) => (t < peak ? Math.pow(t / peak, 2.4) : Math.exp(-(t - peak) / ((sec - peak) * 0.3))) * 3);
}

/** A riser: noise and a sine sweeping up to a cut at its end. */
export function riser(sec, { seed = 'rise', lo = 300, hi = 5000 } = {}) {
  const n = S(sec);
  const nz = filt(pink(n, seed), 'bp', (t) => lo * Math.pow(hi / lo, t / sec), 1.2);
  const tone = osc(n, (t) => 180 * Math.pow(6, t / sec), 'saw');
  filt(tone, 'lp', (t) => 400 + 3000 * (t / sec));
  return env(mix([nz, 2.2], [tone, 0.18]), (t) => Math.pow(t / sec, 2.6) * clamp01((sec - t) / 0.012));
}

/** One split-flap click: a snap of noise with a little resonant body. */
export function flapClick(seed, { bright = 1, land = false } = {}) {
  const r = rng(seed);
  const n = S(0.05);
  const snap = env(filt(white(n, seed), 'bp', 2200 + r() * 1800 * bright, 1.4), (t) => Math.exp(-t / 0.004));
  const body = env(osc(n, 520 + r() * 260), (t) => Math.exp(-t / (land ? 0.018 : 0.009)));
  return mix([snap, land ? 1.3 : 0.8], [body, land ? 0.45 : 0.2]);
}

/** A soft UI pip. */
export function pip(freq, sec = 0.09, decay = 0.035) {
  return env(mix([osc(S(sec), freq), 1], [osc(S(sec), freq * 2.01), 0.18]), (t) => clamp01(t / 0.0015) * Math.exp(-t / decay));
}

/** A pad chord: detuned saws through a low-pass, with its own amplitude function. */
export function pad(sec, freqs, { cutoff = 900, seed = 'pad', amp = () => 1 } = {}) {
  const n = S(sec), out = new Float32Array(n);
  const r = rng(seed);
  for (const f of freqs) for (const d of [-0.12, 0.11]) {
    const o = osc(n, f * (1 + d / 100 * (1 + r())), 'saw', r());
    for (let i = 0; i < n; i++) out[i] += o[i] / freqs.length / 2;
  }
  filt(out, 'lp', cutoff, 0.8);
  return env(out, amp);
}
