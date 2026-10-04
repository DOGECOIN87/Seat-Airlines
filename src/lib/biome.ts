/**
 * What kind of country is under the aircraft.
 *
 * The flight leaves the farmland every few minutes: for open water and for
 * snow, and back to the fields between each. The rhythm is read off the wall
 * clock rather than off any one view's own timer, so the cockpit, the cabin
 * windows and the exterior camera all cross the same coastline at the same
 * moment — and so does a second tab.
 *
 * The cycle is deliberately mostly land. The fields are what carry the sense
 * of motion (they have boundaries to measure speed against; open water has
 * far fewer), so the sea is an event, not the default.
 */

export type Biome = 'land' | 'ocean' | 'snow';

export interface BiomeState {
  /** What the ground mostly is right now. */
  biome: Biome;
  /** 0 over land, 1 over open water, in between while crossing the coast. */
  ocean: number;
  /** 0 over land, 1 over the snowfields, in between as the snow comes in. */
  snow: number;
  /** When the next change of any kind begins or completes, in ms epoch. */
  changesAt: number;
}

/* The legs, in seconds, each followed by a crossing of FADE_S into the next.
   Farmland between every excursion, so each one arrives as an event. */
const FADE_S = 14;
const LEGS: readonly { biome: Biome; s: number }[] = [
  { biome: 'land', s: 150 },
  { biome: 'ocean', s: 90 },
  { biome: 'land', s: 110 },
  { biome: 'snow', s: 100 },
];
const CYCLE_S = LEGS.reduce((sum, leg) => sum + leg.s + FADE_S, 0);

/** Smooth, so the coast arrives as an approach rather than a cut. */
const ease = (t: number) => t * t * (3 - 2 * t);

const state = (biome: Biome, from: Biome, t: number, changesAt: number): BiomeState => {
  // How much of each non-land country there is: fading in toward `biome`, out of `from`.
  const share = (b: Biome) => (b === 'land' ? 0 : (biome === b ? ease(t) : 0) + (from === b ? 1 - ease(t) : 0));
  return {
    biome: t < 0.5 ? from : biome,
    ocean: share('ocean'),
    snow: share('snow'),
    changesAt,
  };
};

export function biomeAt(nowMs: number): BiomeState {
  let s = ((nowMs / 1000) % CYCLE_S + CYCLE_S) % CYCLE_S;
  for (let i = 0; i < LEGS.length; i++) {
    const leg = LEGS[i];
    if (s < leg.s) return state(leg.biome, leg.biome, 1, nowMs + (leg.s - s) * 1000);
    s -= leg.s;
    if (s < FADE_S) {
      const next = LEGS[(i + 1) % LEGS.length];
      return state(next.biome, leg.biome, s / FADE_S, nowMs + (FADE_S - s) * 1000);
    }
    s -= FADE_S;
  }
  return state('land', 'land', 1, nowMs + 1000);
}

export const BIOME_CYCLE_S = CYCLE_S;
