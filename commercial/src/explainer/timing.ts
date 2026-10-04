/**
 * The explainer's timeline: config/explainer.json, stretched where a recorded
 * line (config/vo-explainer.json) needs more room than its chapter's minimum.
 * sfx/explainer.mjs computes the same lengths from the same two files.
 */
import cfg from '../../config/explainer.json';
import voFiles from '../../config/vo-explainer.json';

export const FPS = cfg.fps;
export const SEAM = cfg.seam;
export type ChapterId = 'title' | 'token' | 'checkin' | 'seat' | 'moveup' | 'altitude' | 'billboard' | 'fly' | 'safety' | 'outro';
type Cues = Record<string, number | number[]>;

export interface Chapter {
  id: ChapterId;
  from: number;
  frames: number;
  cues: Cues;
  vo?: { file: string; from: number; local: number; frames: number; phrases: number[] };
}

const VO = voFiles as Record<string, { seconds: number; phrases: number[] }>;

export const CHAPTERS: Chapter[] = (() => {
  let at = 0;
  return cfg.chapters.map((c) => {
    const line = VO[c.vo];
    const need = line ? Math.ceil((c.voAt + line.seconds + cfg.tail) * FPS) : 0;
    const frames = Math.max(c.frames, need);
    const local = Math.round(c.voAt * FPS);
    const ch: Chapter = {
      id: c.id as ChapterId, from: at, frames, cues: c.cues as unknown as Cues,
      vo: line ? { file: c.vo, from: at + local, local, frames: Math.ceil(line.seconds * FPS), phrases: line.phrases.map((p) => local + Math.round(p * FPS)) } : undefined,
    };
    at += frames;
    return ch;
  });
})();

export const TOTAL = CHAPTERS.reduce((n, c) => n + c.frames, 0);
export const STEPS = CHAPTERS.filter((c) => c.id !== 'title' && c.id !== 'outro');
export const cue = (c: Chapter, key: string) => c.cues[key] as number;
export const cues = (c: Chapter, key: string) => c.cues[key] as number[];
