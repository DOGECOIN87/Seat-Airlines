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
  id: 'brandopen' | 'intro' | 'splash' | 'hero' | 'altitudes' | 'seats' | 'seats_scroll' | 'advert' | 'game' | 'highscore' | 'climb' | 'endcard';
  seconds: number;
  /** How this scene comes in, and over how many frames. */
  transitionIn: { kind: TransitionKind; frames: number };
  /** Source clip in public/clips and the second of it the scene starts on. */
  clip?: { src: string; from: number };
  /** Slow push-in for UI screen captures (3D and game footage are left alone). */
  push?: boolean;
  /** Frame the clip on part of the screen: centre as fractions of it, and the zoom. */
  focus?: { x: number; y: number; scale: number };
  /** End focus for an animated camera pan. Interpolates from focus → focusEnd over the scene. */
  focusEnd?: { x: number; y: number; scale: number };
  vo?: VoCue[];
}

const VO = {
  welcome: {
    file: 'vo/01.wav', at: 0.3, seconds: 2.32,
    captions: [{ text: 'Welcome aboard Seat Airlines.', from: 0, to: 2.0 }],
  },
  onePlane: { file: 'vo/02.wav', at: -0.2, seconds: 2.69, captions: [] },
  altitude: {
    file: 'vo/03.wav', at: -0.45, seconds: 6.13,
    captions: [{ text: 'Market cap is altitude.', from: 0.45, to: 2.0 }],
  },
  boarding: {
    file: 'vo/04.wav', at: -0.6, seconds: 1.65,
    // Said on the end card, which carries the words itself (SEAT AIRLINES, NOW BOARDING): no caption card over the fine print.
    captions: [],
  },
} satisfies Record<string, VoCue>;

const S: Record<Scene['id'], Omit<Scene, 'seconds' | 'transitionIn'>> = {
  /* Brand-open card: same EndCard component, no VO — used as the opening beat. */
  brandopen: { id: 'brandopen' },
  /* The intro is the supplied animation (assets/source/user-plane.mp4, 21.0–25.5 s): no text in it, audio muted. */
  intro: { id: 'intro', clip: { src: 'clips/intro.mp4', from: 0 }, vo: [VO.welcome] },
  splash: { id: 'splash', clip: { src: 'clips/splash.mp4', from: 3.0 }, push: true },
  hero: { id: 'hero', clip: { src: 'clips/hero.mp4', from: 0.5 }, push: true, vo: [VO.onePlane] },
  seats: { id: 'seats', clip: { src: 'clips/seats.mp4', from: 0.2 }, push: true, focus: { x: 0.705, y: 0.5, scale: 1.75 } },
  /* Slow pan top→bottom through the full 178-seat grid, same clip zoomed in tighter. */
  seats_scroll: { id: 'seats_scroll', clip: { src: 'clips/seats.mp4', from: 0.2 }, focus: { x: 0.705, y: 0.15, scale: 2.2 }, focusEnd: { x: 0.705, y: 0.82, scale: 2.2 } },
  advert: { id: 'advert', clip: { src: 'clips/advert.mp4', from: 0.5 }, focus: { x: 0.5, y: 0.8, scale: 2.2 } },
  /* Altitude band showcase: exterior at each of the five altitude bands (0.8 s each). */
  altitudes: { id: 'altitudes', clip: { src: 'clips/altitudes.mp4', from: 0 } },
  game: { id: 'game', clip: { src: 'clips/game.mp4', from: 0.6 } },
  highscore: { id: 'highscore', clip: { src: 'clips/highscore.mp4', from: 3.0 }, focus: { x: 0.5, y: 0.5, scale: 2.6 } },
  climb: { id: 'climb', clip: { src: 'clips/climb.mp4', from: 0.5 }, focus: { x: 0.5, y: 0.47, scale: 1.12 }, vo: [VO.altitude] },
  endcard: { id: 'endcard', vo: [VO.boarding] },
};

/** Order A (primary): brand open → intro → hero → seats → scroll → ad → climb → altitudes → end. 19.5 s. */
export const ORDER_A: Scene[] = [
  { ...S.brandopen, seconds: 1.5, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.intro, seconds: 4.5, transitionIn: { kind: 'fade', frames: 8 } },
  { ...S.splash, seconds: 1.5, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.hero, seconds: 1.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.seats, seconds: 1.0, transitionIn: { kind: 'slideUp', frames: 8 } },
  { ...S.seats_scroll, seconds: 3.0, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.advert, seconds: 1.0, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.climb, seconds: 2.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.altitudes, seconds: 4.0, transitionIn: { kind: 'fade', frames: 8 } },
  { ...S.endcard, seconds: 1.5, transitionIn: { kind: 'fade', frames: 8 } },
];

/** Order B (comparison): brand open → hero → seats → scroll → climb → altitudes → end. 19.5 s. */
export const ORDER_B: Scene[] = [
  { ...S.brandopen, seconds: 1.5, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.intro, seconds: 4.5, transitionIn: { kind: 'fade', frames: 8 } },
  { ...S.splash, seconds: 1.5, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.hero, seconds: 1.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.advert, seconds: 1.0, transitionIn: { kind: 'fade', frames: 6 } },
  { ...S.seats, seconds: 1.0, transitionIn: { kind: 'slideUp', frames: 8 } },
  { ...S.seats_scroll, seconds: 3.0, transitionIn: { kind: 'none', frames: 0 } },
  { ...S.climb, seconds: 2.0, transitionIn: { kind: 'wipeUp', frames: 8 } },
  { ...S.altitudes, seconds: 4.0, transitionIn: { kind: 'fade', frames: 8 } },
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
  // Build-time guard: longer than 10 s and shorter than 30 s.
  if (total < 301 || total > 885) throw new Error(`Timeline is ${total} frames; it must be 301–885.`);
  for (const s of order) {
    if (Math.abs(s.seconds * 2 - Math.round(s.seconds * 2)) > 1e-6) throw new Error(`${s.id} is off the 0.5 s grid.`);
  }
  return total;
}
