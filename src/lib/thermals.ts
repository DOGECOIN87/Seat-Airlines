/**
 * Rising air you can see, and fly to.
 *
 * Once an engine has gone, thermals turn up ahead: columns of warm air most of a
 * kilometre across, each marked the way real ones are — by the
 * cumulus cloud that forms on top of it — and by a faint shimmer rising
 * under it. Fly under one with the wings level and it lifts the aeroplane,
 * most strongly at its middle; miss it and it does nothing. They come and
 * go: each builds for a few seconds, stands for half a minute, and fades.
 *
 * This is the air, in plain numbers — where each column is relative to the
 * aeroplane, and how much lift there is where the aeroplane is — so the
 * flight model, the scene and the tests all read the same sky. The scene
 * draws them (see three/thermalsCraft.ts).
 */

export interface Thermal {
  /** Where its middle is, metres from the aeroplane: x across the world, z along it (the nose points along -z at heading 0). */
  x: number;
  z: number;
  /** How wide, metres, and how strong at its middle, about 1. */
  r: number;
  peak: number;
  /** Seconds since it began, and how long it lasts. */
  age: number;
  life: number;
  /** Where its cloud sits, metres up. */
  cap: number;
}

export interface Air {
  list: Thermal[];
  /** Seconds until the next one turns up; Infinity while there are none to come. */
  next: number;
}

export const AIR = {
  /** The first after the engine goes, and between them after. */
  first: [3, 6] as readonly [number, number],
  gap: [7, 12] as readonly [number, number],
  /** Where they turn up: this far ahead, this far either side of the nose. */
  ahead: [600, 1300] as readonly [number, number],
  spread: 25,
  radius: [400, 650] as readonly [number, number],
  peak: [0.8, 1.15] as readonly [number, number],
  life: [26, 36] as readonly [number, number],
  /** Seconds to build, and to fade. */
  fade: 3,
  /** No more than this many at once. */
  most: 3,
} as const;

const DEG = Math.PI / 180;
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const smooth = (t: number) => t * t * (3 - 2 * t);

export const newAir = (): Air => ({ list: [], next: Infinity });

/** The thermals start turning up. */
export function startAir(air: Air): void {
  air.next = between(...AIR.first);
}

/** How strongly a thermal is there, 0–1, as it builds and fades. */
export const presence = (t: Thermal): number =>
  smooth(Math.min(1, t.age / AIR.fade)) * smooth(Math.min(1, Math.max(0, t.life - t.age) / AIR.fade));

/** How much it lifts at `d` metres from its middle: all of its peak there, none at its edge. */
export const liftFrom = (t: Thermal, d: number): number => {
  const k = d / t.r;
  return k >= 1 ? 0 : t.peak * presence(t) * (1 - k * k);
};

/**
 * One step of the air: the thermals go by as the aeroplane flies at
 * `speed` on `heading`, age, and a new one turns up ahead when it is due.
 * Returns the lift where the aeroplane is: 0 in still air, about 1 in the
 * middle of a strong one. `alt` is the aeroplane's height, for where a new
 * one's cloud sits.
 */
export function stepAir(air: Air, dt: number, speed: number, heading: number, alt: number): number {
  const h = heading * DEG;
  const dx = speed * Math.sin(h) * dt;
  const dz = -speed * Math.cos(h) * dt;
  for (const t of air.list) {
    t.x -= dx;
    t.z -= dz;
    t.age += dt;
  }
  air.list = air.list.filter((t) => t.age < t.life && Math.hypot(t.x, t.z) < 8000);
  air.next -= dt;
  if (air.next <= 0 && air.list.length < AIR.most) {
    const b = h + between(-AIR.spread, AIR.spread) * DEG;
    const d = between(...AIR.ahead);
    air.list.push({
      x: d * Math.sin(b),
      z: -d * Math.cos(b),
      r: between(...AIR.radius),
      peak: between(...AIR.peak),
      age: 0,
      life: between(...AIR.life),
      cap: Math.max(900, alt + between(280, 420)),
    });
    air.next = between(...AIR.gap);
  } else if (air.next <= 0) {
    air.next = 1;
  }
  let u = 0;
  for (const t of air.list) u = Math.max(u, liftFrom(t, Math.hypot(t.x, t.z)));
  return u;
}

/** The bearing, in degrees like a heading, from the aeroplane to a thermal's middle. */
export const bearingTo = (t: Thermal): number => ((Math.atan2(t.x, -t.z) / DEG) + 360) % 360;
