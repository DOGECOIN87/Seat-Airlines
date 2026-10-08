/**
 * The game's synthesised sounds: the afterburners' roar, the chime of a logo
 * flown through, and thunder. Made with Web Audio from noise and tones, so
 * they cost no download; the context is made inside the click or key that
 * starts the game, which is what a browser wants before it lets a page play.
 */

export interface Sfx {
  boost(seconds: number): void;
  chime(combo: number): void;
  /** Thunder from a flash `metres` off: it arrives late and low the further off it was. */
  thunder(metres: number): void;
  setEnabled(on: boolean): void;
  close(): void;
}

export function createSfx(sharedContext?: AudioContext): Sfx | null {
  const Ctx = typeof window !== 'undefined'
    ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;
  if (!Ctx) return null;
  let ctx: AudioContext;
  try {
    ctx = sharedContext ?? new Ctx();
  } catch {
    return null;
  }
  void ctx.resume().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Two seconds of white noise and of brown, shared by everything.
  const noise = (brown: boolean) => {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  };
  const white = noise(false);
  const brown = noise(true);
  const source = (buf: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  };

  const boost = (seconds: number) => {
    const t = ctx.currentTime;
    const end = t + seconds;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.8, t + 0.08);
    out.gain.setValueAtTime(0.8, end - 0.3);
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.9);
    out.connect(master);
    // The roar: noise through a filter that opens as it lights.
    const roar = source(white);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(280, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(1300, end);
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.55;
    roar.connect(lp).connect(roarGain).connect(out);
    // And the rumble under it.
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(48, t);
    rumble.frequency.linearRampToValueAtTime(72, t + 0.4);
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 180;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.35;
    rumble.connect(rlp).connect(rumbleGain).connect(out);
    roar.start(t);
    rumble.start(t);
    roar.stop(end + 1);
    rumble.stop(end + 1);
  };

  const chime = (combo: number) => {
    const t = ctx.currentTime;
    // Up a step each one in a row, so a run of them climbs.
    const base = 880 * 2 ** (Math.min(combo, 8) / 12);
    [1, 1.5, 2].forEach((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      const at = t + i * 0.055;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.32, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + 0.55);
    });
  };

  const thunder = (metres: number) => {
    const delay = Math.min(4, metres / 343);
    const near = Math.max(0, 1 - metres / 9000);
    const t = ctx.currentTime + delay;
    const out = ctx.createGain();
    const loud = 0.25 + 0.75 * near;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(loud, t + (near > 0.7 ? 0.02 : 0.25));
    out.gain.exponentialRampToValueAtTime(loud * 0.45, t + 1.2);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 3.8 + near);
    out.connect(master);
    const rumble = source(brown);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180 + 900 * near, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    rumble.connect(lp).connect(out);
    rumble.start(t, Math.random());
    rumble.stop(t + 5);
    // Close by, the crack before the roll.
    if (near > 0.55) {
      const crack = source(white);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.6 * near, t + 0.005);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      crack.connect(hp).connect(cg).connect(master);
      crack.start(t);
      crack.stop(t + 0.4);
    }
  };

  return {
    boost,
    chime,
    thunder,
    setEnabled: (on) => {
      master.gain.value = on ? 0.9 : 0;
    },
    close: () => {
      master.disconnect();
      if (!sharedContext) void ctx.close().catch(() => {});
    },
  };
}
