/**
 * The saucer's hazard: a Seat Airlines airliner that comes for it.
 *
 * In UFO mode the roles turn round. Nothing comes for an airliner's wing;
 * instead, every so often, one of the airline's own aeroplanes turns up a
 * couple of kilometres out and flies straight at the saucer. It steers for
 * it all the way in, but it is an airliner: it turns slowly, and inside the
 * last few hundred metres it is committed to the line it is on. A saucer
 * that is still where it was aimed at gets hit. One that is somewhere else
 * — a dash to one side, straight up or straight down, at the last moment —
 * is not, and that pays.
 *
 * Positions are metres from the saucer on the world's axes, as the logos
 * and thermals keep theirs: x east, z south (the nose points along
 * (sin h, −cos h) at heading h), y up. Velocities are the world's, so the
 * saucer's own movement, a dash above all, changes where it is from the
 * airliner, which is what a dodge is.
 *
 * A hit does not bring the saucer down. It scrambles the field that flies
 * it: for several seconds the stick stops meaning what it says (see
 * `scramble` in landingGame.ts), which near the ground is as good as.
 */

export interface Rammer {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since it turned up. */
  age: number;
  /** The closest it has come, metres. */
  closest: number;
  /** It has been called out: the warning is up. */
  warned: boolean;
  /** Settled: it hit, or it went past. */
  done: boolean;
}

export interface RamField {
  list: Rammer[];
  /** Seconds until the next one turns up. */
  next: number;
  /** How many have come so far: each comes sooner after the last, and faster. */
  count: number;
}

export const RAMMER = {
  /** When the first one turns up, seconds after the controls are handed over. */
  first: [5, 8] as const,
  /** Seconds between one and the next, coming down with each one to the floor. */
  gap: [7, 12] as const,
  gapFloor: 3,
  /** How far out it turns up, metres. */
  spawn: [1900, 2500] as const,
  /** Metres a second it closes at — more with every one, to the cap. */
  closing: 430,
  closingStep: 22,
  closingCap: 760,
  /** Radians a second it can turn to keep the saucer on its nose, and how near before it stops. */
  homing: 0.85,
  commit: 320,
  /** Within this, it hits. An airliner's half-span and a saucer's radius, near enough. */
  hitRadius: 30,
  /** Past within this without hitting — or past at all, once it was called out: a dodge, which pays. */
  nearMiss: 180,
  bonus: 1000,
  /** Seconds of warning before it arrives. */
  warnAt: 2.6,
  /** How hard a hit scrambles the controls, and how long that takes to wear off. */
  scramble: 0.8,
  scrambleSeconds: 7,
} as const;

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const DEG = Math.PI / 180;

export const newRams = (): RamField => ({ list: [], next: between(...RAMMER.first), count: 0 });

/** What happened this step: at most one of each. */
export interface RamEvents {
  /** One is close enough to call out: which way it is, in degrees off the nose (clockwise). */
  warn: number | null;
  /** It hit: from which side, -1 port, 1 starboard. */
  hit: -1 | 1 | null;
  /** It went past, close. */
  dodged: boolean;
}

/** Degrees off the nose, clockwise, of a point `x`, `z` from the saucer. */
export function bearing(x: number, z: number, heading: number): number {
  const b = Math.atan2(x, -z) / DEG - heading;
  return ((((b + 180) % 360) + 360) % 360) - 180;
}

/**
 * Where a new one turns up: usually ahead and to one side, now and then
 * abeam, now and then from a little above or below — and aimed at where
 * the saucer is going to be, if it carries on as it is.
 */
export function spawnRammer(field: RamField, heading: number, v: { x: number; y: number; z: number }): Rammer {
  const roll = Math.random();
  const off = roll < 0.6 ? between(-35, 35) : roll < 0.9 ? between(55, 100) * (Math.random() < 0.5 ? -1 : 1) : between(140, 180) * (Math.random() < 0.5 ? -1 : 1);
  const b = (heading + off) * DEG;
  const d = between(...RAMMER.spawn);
  const x = d * Math.sin(b);
  const z = -d * Math.cos(b);
  const y = between(-160, 220);
  const closing = Math.min(RAMMER.closingCap, RAMMER.closing + field.count * RAMMER.closingStep);
  const r = Math.hypot(x, y, z);
  // Its own velocity: the saucer's, and straight at it on top.
  const r0: Rammer = {
    x, y, z,
    vx: v.x - (x / r) * closing,
    vy: v.y - (y / r) * closing,
    vz: v.z - (z / r) * closing,
    age: 0,
    closest: r,
    warned: false,
    done: false,
  };
  field.count++;
  return r0;
}

/**
 * One step. `v` is the saucer's velocity over the ground, m/s on the
 * world's axes, `heading` its nose. Moves every airliner about, steers the
 * ones still steering, settles the ones that have hit or gone past, and
 * brings the next one on.
 */
export function stepRams(
  field: RamField, dt: number, v: { x: number; y: number; z: number }, heading: number, live = true,
): RamEvents {
  const out: RamEvents = { warn: null, hit: null, dodged: false };
  for (const r of field.list) {
    r.age += dt;
    // Where it is from the saucer, and how fast that is changing.
    const rx = r.vx - v.x;
    const ry = r.vy - v.y;
    const rz = r.vz - v.z;
    const d0 = Math.hypot(r.x, r.y, r.z);
    if (!r.done && d0 > RAMMER.commit) {
      /* Steering for it: the closing velocity turned toward the saucer,
         by no more than an airliner can turn in the time. */
      const closing = Math.max(1, Math.hypot(rx, ry, rz));
      const wx = (-r.x / d0) * closing;
      const wy = (-r.y / d0) * closing;
      const wz = (-r.z / d0) * closing;
      const k = 1 - Math.exp(-RAMMER.homing * dt);
      r.vx += (wx - rx) * k;
      r.vy += (wy - ry) * k;
      r.vz += (wz - rz) * k;
    }
    const sx = (r.vx - v.x) * dt;
    const sy = (r.vy - v.y) * dt;
    const sz = (r.vz - v.z) * dt;
    // The closest point of this step's line to the saucer: a dash can cover a hundred metres a frame.
    const len2 = sx * sx + sy * sy + sz * sz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(r.x * sx + r.y * sy + r.z * sz) / len2)) : 0;
    const near = Math.hypot(r.x + sx * t, r.y + sy * t, r.z + sz * t);
    r.x += sx;
    r.y += sy;
    r.z += sz;
    r.closest = Math.min(r.closest, near);
    if (r.done || !live) continue;
    if (near < RAMMER.hitRadius) {
      r.done = true;
      out.hit = bearing(r.x - sx * (1 - t), r.z - sz * (1 - t), heading) < 0 ? -1 : 1;
      continue;
    }
    const d = Math.hypot(r.x, r.y, r.z);
    // Going away now: settled, one way or the other.
    if (r.x * (r.vx - v.x) + r.y * (r.vy - v.y) + r.z * (r.vz - v.z) > 0 && r.age > 0.5) {
      r.done = true;
      // Called out — so it was on its way in — or close: got out of the way.
      if (r.warned || r.closest < RAMMER.nearMiss) out.dodged = true;
      continue;
    }
    const closing = Math.max(1, Math.hypot(r.vx - v.x, r.vy - v.y, r.vz - v.z));
    if (!r.warned && d / closing < RAMMER.warnAt) {
      r.warned = true;
      out.warn = bearing(r.x, r.z, heading);
    }
  }
  // Gone well past, or too long about: off the scene.
  field.list = field.list.filter((r) => !(r.done && Math.hypot(r.x, r.y, r.z) > 2600) && r.age < 25);
  if (live) {
    field.next -= dt;
    if (field.next <= 0) {
      field.list.push(spawnRammer(field, heading, v));
      const shrink = Math.max(0.35, 1 - field.count * 0.08);
      field.next = Math.max(RAMMER.gapFloor, between(...RAMMER.gap) * shrink);
    }
  }
  return out;
}
