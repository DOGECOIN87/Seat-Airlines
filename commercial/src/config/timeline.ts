/**
 * The whole edit, as data. Scene ORDER is one array per cut: reorder a line
 * to reorder the commercial. Times are seconds; every slot sits on the
 * 0.5 s grid (120 BPM half-beats) so a music track dropped in lines up.
 *
 * VO lines belong to a scene and are placed relative to its start, so they
 * travel with it when the order changes.
 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type TransitionKind = 'none' | 'fade' | 'wipeUp' | 'slideUp' | 'flash';

export interface VoCue {
  file: string;
  /** Seconds from the scene's start (may be negative: starts in the scene before). */
  at: number;
  /** Measured length, seconds (ffprobe). */
  seconds: number;
  /** Caption cards: text and its start/end, relative to the line. Empty for kinetic headlines. */
  captions: { text: string; from: number; to: number }[];
}

export interface Scene {
  id: 'intro' | 'splash' | 'hero' | 'seats' | 'advert' | 'game' | 'highscore' | 'climb' | 'endcard';
  seconds: number;
  /** How this scene comes in, and over how many frames. */
  transitionIn: { kind: TransitionKind; frames: number };
  /** Source clip in public/clips and the second of it the scene starts on. */
  clip?: { src: string; from: number };
  /** Slow push-in for UI screen captures (3D and game footage are left alone). */
  push?: boolean;
  vo?: VoCue[];
}

const VO = {
  welcome: {
    file: 'vo/01.wav', at: 0.3, seconds: 3.22,
    captions: [{ text: 'Ladies and gentlemen, welcome aboard flight SA350.', from: 0, to: 3.22 }],
  },
  onePlane: { file: 'vo/02.wav', at: -0.2, seconds: 3.47, captions: [] },
  altitude: {
    file: 'vo/03.wav', at: -0.45, seconds: 1.62,
    captions: [{ text: 'Market cap is altitude.', from: 0, to: 1.62 }],
  },
  boarding: {
    file: 'vo/04.wav', at: -0.6, seconds: 1.83,
    // Said on the end card, which carries the words itself (SEAT AIRLINES, NOW BOARDING): no caption card over the fine print.
    captions: [],
  },
} satisfies Record<string, VoCue>;

const S: Record<Scene['id'], Omit<Scene, 'seconds' | 'transitionIn'>> = {
  /* The intro is the supplied animation (assets/source/user-plane.mp4, 21.0–25.5 s): no text in it, audio muted. */
  intro: { id: 'intro', clip: { src: 'clips/intro.mp4', from: 0 }, vo: [VO.welcome] },
  splash: { id: 'splash', clip: { src: 'clips/splash.mp4', from: 0 }, push: true },
  hero: { id: 'hero', clip: { src: 'clips/hero.mp4', from: 0.5 }, push: true, vo: [VO.onePlane] },
  seats: { id: 'seats', clip: { src: 'clips/seats.mp4', from: 0.2 }, push: true },
  advert: { id: 'advert', clip: { src: 'clips/advert.mp4', from: 0.5 } },
  game: { id: 'game', clip: { src: 'clips/game.mp4', from: 0.5 } },
  highscore: { id: 'highscore', clip: { src: 'clips/highscore.mp4', from: 3.0 } },
  climb: { id: 'climb', clip: { src: 'clips/climb.mp4', from: 0.5 }, vo: [VO.altitude] },
  endcard: { id: 'endcard', vo: [VO.boarding] },
};

/** Order A (primary): intro → board → sit → play → climb. 15.0 s. */
export const ORDER_A: Scene[] = [
  { ...S.intro, seconds: 4.5, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.splash, seconds: 1.5, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.hero, seconds: 1.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.seats, seconds: 1.0, transitionIn: { kind: 'slideUp', frames: 8 } },
  { ...S.advert, seconds: 1.0, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.game, seconds: 1.5, transitionIn: { kind: 'flash', frames: 4 } },
  { ...S.highscore, seconds: 1.0, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.climb, seconds: 2.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.endcard, seconds: 1.5, transitionIn: { kind: 'fade', frames: 8 } },
];

/** Order B (comparison): the game before the cabin. Same clips, same VO per scene. 15.0 s. */
export const ORDER_B: Scene[] = [
  { ...S.intro, seconds: 4.5, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.splash, seconds: 1.5, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.game, seconds: 1.5, transitionIn: { kind: 'flash', frames: 4 } },
  { ...S.highscore, seconds: 1.0, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.hero, seconds: 1.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.seats, seconds: 1.0, transitionIn: { kind: 'slideUp', frames: 8 } },
  { ...S.advert, seconds: 1.0, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.climb, seconds: 2.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.endcard, seconds: 1.5, transitionIn: { kind: 'fade', frames: 8 } },
];

/** Start frame of every scene on the final timeline. */
export function starts(order: Scene[]): number[] {
  let at = 0;
  return order.map((s) => {
    const f = at;
    at += Math.round(s.seconds * FPS);
    return f;
  });
}

export function totalFrames(order: Scene[]): number {
  const total = order.reduce((n, s) => n + Math.round(s.seconds * FPS), 0);
  // Build-time guard: longer than 10 s and shorter than 29.5 s.
  if (total < 301 || total > 885) throw new Error(`Timeline is ${total} frames; it must be 301–885.`);
  for (const s of order) {
    if (Math.abs(s.seconds * 2 - Math.round(s.seconds * 2)) > 1e-6) throw new Error(`${s.id} is off the 0.5 s grid.`);
  }
  return total;
}
