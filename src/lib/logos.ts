/**
 * Floating bonus logos, and flying through them.
 *
 * Once an engine has gone, the airline's medallions turn up ahead: gold
 * coins hanging in the air where the flight is going, spinning in place and
 * bobbing gently, each lit with the seat mark. Fly through one and it pays
 * extra points on the spot — a little reward for going where the flight is
 * going anyway. They come and go like the thermals: each hangs about for
 * under a minute, and no more than a couple are ever out at once.
 *
 * This is the air, in plain numbers — where each medallion is relative to
 * the aeroplane, and which ones have been taken — so the flight model, the
 * scene and the tests all read the same sky. The scene draws them (see
 * three/logosCraft.ts).
 */

export interface LogoPickup {
  /** Where its middle is, metres from the aeroplane: x across the world, z along it (the nose points along -z at heading 0). */
  x: number;
  z: number;
  /** How high it hangs, metres above the ground's datum. */
  alt: number;
  /** How far away, metres, still counts as flying through it. */
  r: number;
  /** Its spin, radians, and the phase of its bob. */
  spin: number;
  bob: number;
  /** Taken: flown through, paid out, and on its way out. */
  taken: boolean;
  /** Seconds since it turned up, and how long it hangs about. */
  age: number;
  life: number;
}

export interface LogoAir {
  list: LogoPickup[];
  /** Seconds until the next one turns up; Infinity while there are none to come. */
  next: number;
}

export const LOGOS = {
  /** The first after the engine goes, and between them after. */
  first: [2, 5] as readonly [number, number],
  gap: [8, 15] as readonly [number, number],
  /** Where they turn up: this far ahead, this far either side of the nose. */
  ahead: [500, 1100] as readonly [number, number],
  spread: 30,
  /** How far above or below the aeroplane's height they hang. */
  height: [-140, 180] as readonly [number, number],
  /** Never lower than this, metres above the datum. */
  floor: 60,
  life: [35, 55] as readonly [number, number],
  /** Seconds to fade in, and to fade out once taken or dying. */
  fade: 1.5,
  /** No more than this many at once. */
  most: 2,
  /** What flying through one pays. */
  bonus: 500,
  /** How far off its middle still counts, metres. */
  collect: 60,
  /** How far it bobs up and down, metres. */
  bobAmp: 8,
  /** Radians a second it spins. */
  spinRate: 1.6,
} as const;

const DEG = Math.PI / 180;
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const smooth = (t: number) => t * t * (3 - 2 * t);

export const newLogos = (): LogoAir => ({ list: [], next: Infinity });

/** The medallions start turning up. */
export function startLogos(air: LogoAir): void {
  air.next = between(...LOGOS.first);
}

/** How strongly a medallion is there, 0–1, as it fades in and out. */
export const logoPresence = (l: LogoPickup): number =>
  smooth(Math.min(1, l.age / LOGOS.fade)) * smooth(Math.min(1, Math.max(0, l.life - l.age) / LOGOS.fade));

/**
 * One step of the medallions: they go by as the aeroplane flies at `speed`
 * on `heading`, spin and bob in place, age, and a new one turns up ahead
 * when it is due. `alt` is the aeroplane's height, for where a new one hangs.
 */
export function stepLogos(air: LogoAir, dt: number, speed: number, heading: number, alt: number): void {
  const h = heading * DEG;
  const dx = speed * Math.sin(h) * dt;
  const dz = -speed * Math.cos(h) * dt;
  for (const l of air.list) {
    l.x -= dx;
    l.z -= dz;
    l.age += dt;
    l.spin += LOGOS.spinRate * dt;
    l.bob += dt;
  }
  air.list = air.list.filter((l) => !l.taken && l.age < l.life && Math.hypot(l.x, l.z) < 8000);
  air.next -= dt;
  if (air.next <= 0 && air.list.length < LOGOS.most) {
    const b = h + between(-LOGOS.spread, LOGOS.spread) * DEG;
    const d = between(...LOGOS.ahead);
    air.list.push({
      x: d * Math.sin(b),
      z: -d * Math.cos(b),
      alt: Math.max(LOGOS.floor, alt + between(...LOGOS.height)),
      r: LOGOS.collect,
      spin: between(0, Math.PI * 2),
      bob: between(0, Math.PI * 2),
      taken: false,
      age: 0,
      life: between(...LOGOS.life),
    });
    air.next = between(...LOGOS.gap);
  } else if (air.next <= 0) {
    air.next = 1;
  }
}

/**
 * Fly through them: every medallion close enough to the aeroplane's middle
 * is taken, and how many went is returned. `alt` is the aeroplane's height.
 */
export function collectLogos(air: LogoAir, alt: number): number {
  let got = 0;
  for (const l of air.list) {
    if (l.taken) continue;
    const d = Math.hypot(l.x, l.z, l.alt - alt);
    if (d < l.r) {
      l.taken = true;
      got++;
    }
  }
  return got;
}
