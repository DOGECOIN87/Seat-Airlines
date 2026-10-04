/**
 * What stands on the ground, as data.
 *
 * The texture painters in `terrain.ts` decide where every wood, town, farm and
 * ship is as they paint it, and write the same decisions down here — so the
 * three-dimensional trees, houses and boats `scenery.ts` builds from them
 * stand exactly on the woods, roofs and ship lights already painted on the
 * ground, and carry on as paint past the distance where they stop being
 * drawn in the round.
 *
 * Positions are in the tile's own coordinates: `s` across and `t` down it,
 * 0–1, exactly as the ground canvas is painted, so a spot and the pixel
 * under it can never disagree.
 */

export type TreeKind = 'conifer' | 'broadleaf' | 'birch' | 'poplar' | 'orchard';

export interface TreeSpot {
  s: number;
  t: number;
  kind: TreeKind;
  /** Metres to the top. */
  height: number;
  /** Metres across the crown. */
  width: number;
  /** 0–1: where in its kind's run of greens this one falls. */
  shade: number;
}

export interface BuildingSpot {
  s: number;
  t: number;
  /** Metres across and along, on its own axes, and to the eaves. */
  width: number;
  depth: number;
  height: number;
  /** Radians: its street grid's turn on the ground, as painted. */
  angle: number;
  roof: 'flat' | 'gable';
  roofColour: string;
  wallColour: string;
  /** 0–1: how much of it is lit after dark. */
  lit: number;
}

export type BoatKind = 'cargo' | 'tanker' | 'ferry' | 'trawler' | 'yacht';

export interface BoatSpot {
  s: number;
  t: number;
  /** Radians: the way it is going, measured like the canvas, from +s towards +t. */
  heading: number;
  kind: BoatKind;
  /** 0–1, fixed per boat: which copies of the tile it turns up in (see `scenery.ts`). */
  seed: number;
  /** 0–1: a second draw, for its colours. */
  paint: number;
}

/** A transmission tower, on the tile: its place, and the way its line runs (radians, from +s towards +t). */
export interface PylonSpot {
  s: number;
  t: number;
  angle: number;
}

export interface LandProps {
  trees: TreeSpot[];
  buildings: BuildingSpot[];
  pylons: PylonSpot[];
  /** The wires: each a pair of pylons, by index, strung from the first to the second. */
  spans: [number, number][];
}

/** A seeded xorshift, the same generator the painters use, for draws kept apart from theirs. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Whether a point is inside a polygon given as flat [x, y] pairs. */
export function insidePolygon(x: number, y: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
