/**
 * The game's levels: the site's altitude bands, flown into.
 *
 * On the rest of the site the market cap picks the scene — in the weather,
 * above the clouds, space, the moon, Mars. In the game the height does, on
 * the same scenes: climb out of the weather and the cloud sea is under you,
 * keep going and the sky goes black over a curving world, and at the top
 * of Earth's level the saucer crosses to the moon, and from the top of the
 * moon's to Mars, arriving a couple of kilometres up over each.
 *
 * The ground curves as it falls away: the flat country bends into a globe,
 * more the higher it is seen from (see `globeRadius`), so from up there it
 * is a world and not a square of map.
 *
 * Heights are metres above the ground of the world being flown over. Each
 * level starts where the last one ended, for the altimeter and the score:
 * `base` is how far that is, so the climb adds up all the way to Mars.
 */
import type { BandState, FlightBand } from './flightModel';

export type Level = 'earth' | 'moon' | 'mars';

export const LEVELS: Record<Level, { base: number; top: number; next: Level | null; name: string }> = {
  earth: { base: 0, top: 80_000, next: 'moon', name: 'Earth' },
  moon: { base: 80_000, top: 40_000, next: 'mars', name: 'The moon' },
  mars: { base: 120_000, top: 60_000, next: null, name: 'Mars' },
};

/** Metres over a new world's ground that the saucer arrives at. */
export const ARRIVE = 2_000;

/** Where Earth's sky changes, metres: out of the weather, and into space. */
export const ABOVE_CLOUDS = 3_000;
export const SPACE = 12_000;

const logProgress = (v: number, lo: number, hi: number) =>
  Math.max(0, Math.min(1, Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo)));

const LABEL: Record<FlightBand, string> = {
  atmosphere: 'In the weather',
  'above-clouds': 'Above the clouds',
  space: 'Space',
  moon: 'The moon',
  mars: 'Mars',
};

/** The site's band for a height on a level, for the scene to draw. */
export function bandAt(level: Level, agl: number): BandState {
  const state = (band: FlightBand, progress: number, next: string | null): BandState =>
    ({ band, progress, label: LABEL[band], next, toNext: progress });
  if (level !== 'earth') return state(level, 0.5, level === 'moon' ? 'Mars' : null);
  // In the weather the look the game has always had: partway up the band.
  if (agl < ABOVE_CLOUDS) return state('atmosphere', 0.3, 'Above the clouds');
  if (agl < SPACE) return state('above-clouds', logProgress(agl, ABOVE_CLOUDS, SPACE), 'Space');
  return state('space', logProgress(agl, SPACE, LEVELS.earth.top), 'The moon');
}

/** The next thing the climb reaches on this level, and the height it is at; null at the top of Mars. */
export function nextMark(level: Level, agl: number): { name: string; at: number; from: number } | null {
  if (level === 'earth') {
    if (agl < ABOVE_CLOUDS) return { name: 'Above the clouds', at: ABOVE_CLOUDS, from: 0 };
    if (agl < SPACE) return { name: 'Space', at: SPACE, from: ABOVE_CLOUDS };
    return { name: 'The moon', at: LEVELS.earth.top, from: SPACE };
  }
  if (level === 'moon') return { name: 'Mars', at: LEVELS.moon.top, from: 0 };
  return null;
}

/** Metres climbed all told: the levels below, and the height over this one. */
export const climbed = (level: Level, agl: number): number => LEVELS[level].base + Math.max(0, agl);

/** The real Earth's radius, and the height from which the bend has to hide the edge of the map. */
const EARTH_R = 6_371_000;
const EDGE_FROM = 2_600;
/** 2·R·h held at this, the horizon `sqrt(2·R·h)` stays 56 km out: inside the 60 km the ground reaches. */
const HORIZON_SQ = 3.2e9;

/**
 * The radius the ground is bent to, metres, seen from `agl` up: the real
 * Earth's down low, where nothing should look different, easing tighter
 * through the top of the weather, and from there tight enough that the edge
 * of the map is always over the horizon — so the higher it is seen from,
 * the more it is a globe.
 */
export function globeRadius(agl: number): number {
  const h = Math.max(1, agl);
  if (h >= EDGE_FROM) return HORIZON_SQ / (2 * h);
  if (h <= 1_000) return EARTH_R;
  const t = Math.min(1, Math.max(0, (h - 1_000) / (EDGE_FROM - 1_000)));
  const k = t * t * (3 - 2 * t);
  return Math.exp(Math.log(EARTH_R) + (Math.log(HORIZON_SQ / (2 * EDGE_FROM)) - Math.log(EARTH_R)) * k);
}
