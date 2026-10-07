import manifest from './audioSprite.json';

/** The small media interface used by the game, with time relative to a clip. */
export interface AudioClip {
  currentTime: number;
  volume: number;
  playbackRate: number;
  loop: boolean;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
}

interface Region { offset: number; duration: number }

/** Separate source nodes let effects overlap, while sharing one decoded file. */
export class SpriteClip implements AudioClip {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  private position = 0;
  private startedAt = 0;
  private rate = 1;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private finished = false;
  private disposed = false;
  loop = false;

  constructor(
    private ctx: AudioContext,
    output: AudioNode,
    private load: () => Promise<AudioBuffer>,
    private region: Region,
    private enabled: () => boolean,
  ) {
    this.gain = ctx.createGain();
    this.gain.connect(output);
  }

  get paused() { return !this.source && !this.pending; }
  get ended() { return this.finished; }
  get volume() { return this.gain.gain.value; }
  set volume(value: number) {
    if (Number.isFinite(value)) this.gain.gain.value = Math.max(0, Math.min(1, value));
  }
  get currentTime() {
    const time = this.position + (this.source ? (this.ctx.currentTime - this.startedAt) * this.rate : 0);
    return this.loop ? time % this.region.duration : Math.min(time, this.region.duration);
  }
  set currentTime(value: number) {
    if (!Number.isFinite(value)) return;
    const playing = !this.paused;
    this.pause();
    this.position = Math.max(0, Math.min(this.region.duration, value));
    this.finished = !this.loop && this.position === this.region.duration;
    if (playing && !this.finished) void this.play().catch(() => {});
  }
  get playbackRate() { return this.rate; }
  set playbackRate(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    this.position = this.currentTime;
    this.startedAt = this.ctx.currentTime;
    this.rate = value;
    if (this.source) this.source.playbackRate.value = value;
  }

  play(): Promise<void> {
    if (this.disposed || !this.enabled()) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.source) return Promise.resolve();
    const generation = ++this.generation;
    const request = (async () => {
      // Resume starts synchronously on a gesture; decoding may finish later.
      const [, buffer] = await Promise.all([this.ctx.resume(), this.load()]);
      if (generation !== this.generation || this.disposed || !this.enabled()) return;
      if (this.position >= this.region.duration) this.position = 0;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.rate;
      source.loop = this.loop;
      source.loopStart = this.region.offset;
      source.loopEnd = this.region.offset + this.region.duration;
      source.connect(this.gain);
      this.source = source;
      this.startedAt = this.ctx.currentTime;
      this.finished = false;
      source.onended = () => {
        source.disconnect();
        if (this.source !== source) return;
        this.source = null;
        this.position = this.region.duration;
        this.finished = true;
      };
      const offset = this.region.offset + this.position;
      if (this.loop) source.start(0, offset);
      else source.start(0, offset, this.region.duration - this.position);
    })();
    this.pending = request;
    void request.finally(() => { if (this.pending === request) this.pending = null; }).catch(() => {});
    return request;
  }

  pause() {
    this.position = this.currentTime;
    this.generation++;
    this.pending = null;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
  }

  dispose() {
    this.pause();
    this.disposed = true;
    this.gain.disconnect();
  }
}

export type LandingSounds = Record<keyof typeof manifest.clips, AudioClip>;
export interface LandingAudio {
  ctx: AudioContext;
  sounds: LandingSounds;
  setEnabled(on: boolean): void;
  close(): void;
}

// AudioBuffers can be reused by successive game contexts. A replay neither
// downloads nor decodes the nine recordings again. Failed loads can retry.
let decoded: Promise<AudioBuffer> | null = null;
const loadSprite = (ctx: AudioContext) => {
  if (!decoded) {
    decoded = fetch(`${import.meta.env.BASE_URL}${manifest.file}`)
      .then(async response => {
        if (!response.ok) throw new Error('Game audio unavailable');
        return ctx.decodeAudioData(await response.arrayBuffer());
      })
      .catch(error => { decoded = null; throw error; });
  }
  return decoded;
};

/** Called on the game-start gesture, including when sound is currently off. */
export function createLandingAudio(on: boolean): LandingAudio | null {
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  let ctx: AudioContext;
  try { ctx = new Ctx(); } catch { return null; }
  const master = ctx.createGain();
  master.gain.value = on ? 1 : 0;
  master.connect(ctx.destination);
  let enabled = on;
  let closed = false;
  // A real buffer started within the gesture unlocks iOS playback as well.
  const unlock = ctx.createBufferSource();
  unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  unlock.connect(ctx.destination);
  unlock.onended = () => unlock.disconnect();
  unlock.start();
  void ctx.resume().catch(() => {});
  const sounds = {} as Record<keyof typeof manifest.clips, SpriteClip>;
  for (const name of Object.keys(manifest.clips) as Array<keyof typeof manifest.clips>) {
    sounds[name] = new SpriteClip(ctx, master, () => loadSprite(ctx), manifest.clips[name], () => enabled && !closed);
  }
  const entries = Object.entries(sounds);
  const volumes = { blast: 0.9, lightning: 1, ufo: 0.85, wind: 0, wasted: 1, fahh: 0.7, trombone: 0.9, wow: 0.9, crowd: 0.9 };
  for (const [name, clip] of entries) clip.volume = volumes[name as keyof LandingSounds];
  sounds.wind.loop = true;
  if (on) void loadSprite(ctx).catch(() => {});
  return {
    ctx,
    sounds,
    setEnabled(value) {
      if (closed) return;
      enabled = value;
      master.gain.value = value ? 1 : 0;
      if (!value) entries.forEach(([, clip]) => clip.pause());
      else void loadSprite(ctx).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      entries.forEach(([, clip]) => clip.dispose());
      master.disconnect();
      void ctx.close().catch(() => {});
    },
  };
}
