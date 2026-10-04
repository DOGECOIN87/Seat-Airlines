/**
 * The airline's logo, hung in the sky to be flown through.
 *
 * From the moment the controls are handed over, spinning AIRLINES badges
 * turn up ahead of the nose, at the height the aeroplane will be at when it
 * gets there. Fly through one and it pays points and tops the boost back up.
 *
 * Positions are relative to the aeroplane, like the thermals: x across the
 * world, z along it, y metres above the ground's datum. The scene draws them
 * (see three/logoCraft.ts).
 */

import { SCORING } from './scoring';

export interface Logo {
  x: number;
  y: number;
  z: number;
  /** Seconds since it turned up. */
  age: number;
  /** Seconds since it was flown through, or -1 while it is still there. */
  taken: number;
}

export interface LogoField {
  list: Logo[];
  /** Seconds until the next turns up. */
  next: number;
  /** How many have been flown through this flight. */
  count: number;
}

export const LOGOS = {
  /** The first after the controls are handed over, and between them after. */
  first: 1.2,
  gap: [SCORING.logoGap, 2.8] as readonly [number, number],
  /** Where they turn up: this far ahead, and this far either side of the nose. */
  ahead: [650, 1100] as readonly [number, number],
  spread: 14,
  /** How close the aeroplane has to come to collect one, metres. */
  reach: 42,
  /** Points for each. */
  points: SCORING.logo,
  /** No more than this many about at once. */
  most: 6,
  /** Seconds the burst lasts after one is taken. */
  burst: 0.6,
} as const;

const DEG = Math.PI / 180;
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export const newLogos = (): LogoField => ({ list: [], next: LOGOS.first, count: 0 });

/**
 * One step: the logos go by as the aeroplane flies at `speed` on `heading`,
 * a new one turns up ahead when it is due — placed where the aeroplane's
 * climb rate `vs` will have taken it, and never below `floor` — and any the
 * aeroplane at `alt` is close enough to are taken. Returns how many were
 * taken this step.
 */
export function stepLogos(
  field: LogoField, dt: number, speed: number, heading: number, alt: number, vs: number, floor: number,
): number {
  const h = heading * DEG;
  const dx = speed * Math.sin(h) * dt;
  const dz = -speed * Math.cos(h) * dt;
  let got = 0;
  for (const l of field.list) {
    l.x -= dx;
    l.z -= dz;
    l.age += dt;
    if (l.taken >= 0) {
      l.taken += dt;
      continue;
    }
    if (Math.hypot(l.x, l.y - alt, l.z) < LOGOS.reach) {
      l.taken = 0;
      got++;
    }
  }
  field.count += got;
  field.list = field.list.filter((l) => (l.taken < 0 ? Math.hypot(l.x, l.z) < 3000 : l.taken < LOGOS.burst));
  field.next -= dt;
  if (field.next <= 0) {
    if (field.list.length < LOGOS.most) {
      const b = h + between(-LOGOS.spread, LOGOS.spread) * DEG;
      const d = between(...LOGOS.ahead);
      const eta = d / Math.max(60, speed);
      const y = Math.max(floor, alt + Math.max(-40, Math.min(90, vs)) * eta * 0.85 + between(-35, 55));
      field.list.push({ x: d * Math.sin(b), y, z: -d * Math.cos(b), age: 0, taken: -1 });
    }
    field.next = between(...LOGOS.gap);
  }
  return got;
}
