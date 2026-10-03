/**
 * The launch intro's timing, read from config/intro.json (scenes, schedules)
 * and config/vo-intro.json (the voice lines that vo/prep_intro.py found).
 * sfx/synth.mjs reads the same files, so a change in the JSON moves the
 * picture and the sound together.
 */
import cfg from '../../config/intro.json';
import voFiles from '../../config/vo-intro.json';

export const FPS = cfg.fps;
export type CutId = keyof typeof cfg.cuts;
export type SceneId = 'landing' | 'ignition' | 'sky' | 'seats' | 'billboard' | 'network' | 'climb' | 'board' | 'end';

export interface CutScene { id: SceneId; frames: number; from: number }

export function scenesOf(cut: CutId): CutScene[] {
  let at = 0;
  return cfg.cuts[cut].scenes.map((s) => {
    const out = { id: s.id as SceneId, frames: s.frames, from: at };
    at += s.frames;
    return out;
  });
}

export const totalOf = (cut: CutId) => cfg.cuts[cut].scenes.reduce((n, s) => n + s.frames, 0);

export const IGN = cfg.ignition;
export const SEATS = cfg.seats;
export const BOARD = cfg.board;
export const BANDS = cfg.climb.bands;
export const TOP_CAP = cfg.climb.topCap;

/* ── The climb ─────────────────────────────────────────────────────── */

export type ClimbKeys = readonly (readonly number[])[];
export const climbKeysOf = (cut: CutId): ClimbKeys => cfg.cuts[cut].climbKeys;

/**
 * Climb progress 0–1 at `sec` seconds into the climb: a monotone cubic
 * through the keys (Fritsch–Carlson), so it never runs backwards and the
 * speed changes smoothly through each band floor.
 */
export function climbU(keys: ClimbKeys, sec: number): number {
  const n = keys.length;
  if (sec <= keys[0][0]) return keys[0][1];
  if (sec >= keys[n - 1][0]) return keys[n - 1][1];
  const d = keys.slice(0, -1).map((k, i) => (keys[i + 1][1] - k[1]) / (keys[i + 1][0] - k[0]));
  const m = keys.map((_, i) => (i === 0 ? d[0] * 0.3 : i === n - 1 ? d[n - 2] * 0.5 : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  let i = 0;
  while (sec > keys[i + 1][0]) i++;
  const h = keys[i + 1][0] - keys[i][0];
  const t = (sec - keys[i][0]) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * keys[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * keys[i + 1][1] + (t3 - t2) * h * m[i + 1];
}

/** Market cap at progress u: log-interpolated between the band floors. */
export const capAt = (u: number) => {
  const keys = [...BANDS.map((b) => ({ u: b.u, cap: b.cap })), { u: 1, cap: TOP_CAP }];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (u <= b.u) {
      const k = (u - a.u) / (b.u - a.u);
      return Math.pow(10, Math.log10(a.cap) + k * (Math.log10(b.cap) - Math.log10(a.cap)));
    }
  }
  return TOP_CAP;
};

export const bandAt = (u: number) => {
  let i = 0;
  BANDS.forEach((b, j) => { if (u >= b.u) i = j; });
  return i;
};

/* ── The board and the seats ───────────────────────────────────────── */

export const BOARD_ROWS = [
  { flight: 'SA001', dest: 'CLOUDS', cap: '$1M', status: 'DEPARTED' },
  { flight: 'SA010', dest: 'SPACE', cap: '$10M', status: 'DEPARTED' },
  { flight: 'SA050', dest: 'THE MOON', cap: '$50M', status: 'BOARDING' },
  { flight: 'SA100', dest: 'MARS', cap: '$100M', status: 'ON TIME' },
] as const;
/** Column widths in tiles: flight, destination, cap, status. */
export const BOARD_COLS = [5, 8, 5, 8] as const;
export const BOARD_TILES = BOARD_COLS.reduce((a, b) => a + b, 0);

/** The frame a board tile lands on (row r, tile index i across the whole row). */
export const tileLands = (r: number, i: number) => BOARD.from + r * BOARD.rowGap + BOARD.settle + i * BOARD.perChar;

/** Seats light up rank by rank from this frame. */
export const seatLitAt = (rank: number) => SEATS.fillFrom + rank * SEATS.perRank;

/* ── The voice ─────────────────────────────────────────────────────── */

type VoFile = { seconds: number; phrases: number[] };
const VO_FILES = voFiles as Record<string, VoFile>;

export interface VoCue {
  file: string;
  scene: SceneId;
  /** Frame on the whole cut. */
  from: number;
  /** Frame within its scene. */
  local: number;
  frames: number;
  /** Phrase starts, frames within its scene. */
  phrases: number[];
}

/** The voice lines of a cut that are on disk, placed on its timeline. */
export function voOf(cut: CutId): VoCue[] {
  const scenes = scenesOf(cut);
  const keys = climbKeysOf(cut);
  return cfg.cuts[cut].vo.flatMap((c) => {
    const file = VO_FILES[c.file];
    const scene = scenes.find((s) => s.id === c.scene);
    if (!file || !scene) return [];
    const sec = 'band' in c && c.band !== undefined ? keys[c.band][0] - (c.lead ?? 0) : (c as { at: number }).at;
    const local = Math.round(sec * FPS);
    return [{
      file: c.file, scene: c.scene as SceneId, from: scene.from + local, local, frames: Math.ceil(file.seconds * FPS),
      phrases: file.phrases.map((p) => local + Math.round(p * FPS)),
    }];
  });
}

/** Phrase starts (scene frames) of the line `file` in a scene, or the fallbacks when the line is not on disk. */
export const phrasesIn = (vo: VoCue[], file: string, fallback: number[]) => vo.find((c) => c.file === file)?.phrases ?? fallback;
