import { SCORING } from './scoring';
import { dodge, ufoAt, type UfoNow } from './ufo';
import type { FlightGame } from './landingGame';

/** Arcade speeds are measured in the same metres/second as the SA350. */
export const JET = {
  cruiseScale: 1.65,
  boostSeconds: 4.5,
  lockSeconds: 0.75,
  lockCone: 0.22,
  lockRange: 2600,
  fireCooldown: 0.45,
  missileSpeed: 820,
  missileTurn: 3.5,
  missileLife: 8,
} as const;
export const BLIMP = { altitude: 450, length: 68, radius: 10, points: SCORING.blimp } as const;
export type TargetId = 'blimp' | 'ufo';
export interface Point { x: number; y: number; z: number }
export interface Target extends Point { id: TargetId; name: string; radius: number }
export interface Blimp extends Point { alive: boolean; heading: number }
export interface Missile extends Point {
  id: number;
  side: -1 | 1;
  velocity: Point;
  target: TargetId;
  age: number;
}
export interface Explosion extends Point { id: number; age: number; size: number }
export interface AerialState {
  /** Horizontal positions are relative to the player; y is world altitude. */
  blimp: Blimp | null;
  ammo: [boolean, boolean];
  missiles: Missile[];
  explosions: Explosion[];
  target: Target | null;
  lock: number;
  cooldown: number;
  serial: number;
  previousUfo: Point | null;
  /** The scout's flight path is anchored in the world, so the jet can turn toward it. */
  scoutAnchor: (Point & { heading: number }) | null;
}
export const newAerial = (): AerialState => ({
  blimp: null, ammo: [true, true], missiles: [], explosions: [], target: null,
  lock: 0, cooldown: 0, serial: 0, previousUfo: null, scoutAnchor: null,
});
const RAD = Math.PI / 180;
const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));
const length = (p: Point) => Math.hypot(p.x, p.y, p.z);
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Speed of sound in dry air, using the standard tropospheric temperature lapse. */
export const soundSpeed = (altitude: number): number =>
  Math.sqrt(1.4 * 287.05 * Math.max(216.65, 288.15 - Math.max(0, altitude) * 0.0065));

export function aheadPoint(right: number, up: number, ahead: number, heading: number): Point {
  const h = heading * RAD;
  return { x: Math.cos(h) * right + Math.sin(h) * ahead, y: up, z: Math.sin(h) * right - Math.cos(h) * ahead };
}
export function noseDirection(g: FlightGame): Point {
  const p = g.pitch * RAD;
  return aheadPoint(0, Math.sin(p), Math.cos(p), g.heading);
}
export const flightVelocity = (g: FlightGame, speed: number): Point => {
  const h = g.heading * RAD;
  return { x: speed * Math.sin(h), y: g.vs, z: -speed * Math.cos(h) };
};

/** The model and the missiles use precisely the same scout pose. */
export function scoutPose(g: FlightGame): UfoNow {
  const u = ufoAt(g.ufo, g.clock);
  const miss = g.dodgeLock && g.ufo?.strike ? dodge(g.dodgeLock, g.ufo.strike, g.alt, g.bank) : g.ufoMiss;
  if (miss) { u.right -= miss.right; u.up -= miss.up; }
  if (u.strike) {
    const p = u.strike.p ** 2;
    u.right += (u.strike.side * 17 - u.right) * p;
    u.up += (0.4 - u.up) * p;
    u.ahead += (-2 - u.ahead) * p;
  }
  const anchor = g.mode === 'jet' ? g.aerial.scoutAnchor : null;
  if (anchor) {
    const at = aheadPoint(u.right, u.up, u.ahead, anchor.heading);
    const x = anchor.x + at.x, z = anchor.z + at.z, h = g.heading * RAD;
    u.right = x * Math.cos(h) + z * Math.sin(h);
    u.ahead = x * Math.sin(h) - z * Math.cos(h);
    u.up = anchor.y + at.y - g.alt;
  }
  return u;
}
export function aerialTargets(g: FlightGame): Target[] {
  const targets: Target[] = [];
  const b = g.aerial.blimp;
  if (b?.alive) targets.push({ ...b, id: 'blimp', name: 'SEAT blimp', radius: BLIMP.radius });
  if (g.mode !== 'ufo') {
    const u = scoutPose(g);
    if (u.visible) {
      const at = aheadPoint(u.right, u.up, u.ahead, g.heading);
      targets.push({ ...at, y: g.alt + at.y, id: 'ufo', name: 'UFO scout', radius: 6 });
    }
  }
  return targets;
}
export function startAerial(g: FlightGame, groundAhead: number): void {
  g.aerial = newAerial();
  const at = aheadPoint((Math.random() - 0.5) * 100, 0, 1000, g.heading);
  g.aerial.blimp = { ...at, y: groundAhead + BLIMP.altitude, alive: true, heading: g.heading };
  g.tailDamage = 0;
}

/** Distance of the closest point on a swept segment to the origin. */
export function sweptDistance(from: Point, to: Point): number {
  const d = subtract(to, from);
  const t = clamp(-dot(from, d) / Math.max(1e-9, dot(d, d)));
  return length({ x: from.x + d.x * t, y: from.y + d.y * t, z: from.z + d.z * t });
}
const award = (g: FlightGame, points: number) => {
  g.extra += points;
  if (g.failed) g.score += points;
};
function destroy(g: FlightGame, target: Target): void {
  const a = g.aerial;
  a.explosions.push({ ...target, id: ++a.serial, age: 0, size: target.id === 'blimp' ? 42 : 14 });
  if (target.id === 'blimp') {
    if (a.blimp) a.blimp.alive = false;
    award(g, BLIMP.points);
  } else {
    g.ufo = null;
    a.scoutAnchor = null;
    g.slow = 1;
    g.dodgeLock = null;
    g.ufoMiss = null;
    award(g, SCORING.missileTarget);
  }
  if (a.target?.id === target.id) { a.target = null; a.lock = 0; }
}

/** One press consumes exactly one wing-mounted missile, only on a completed lock. */
export function fireMissile(g: FlightGame): boolean {
  const a = g.aerial;
  if (g.mode !== 'jet' || g.phase !== 'flying' || a.cooldown > 0 || a.lock < 1 || !a.target) return false;
  const targets = aerialTargets(g);
  if (!targets.some(t => t.id === a.target?.id)) return false;
  const index = a.ammo.findIndex(Boolean);
  if (index < 0) return false;
  const side = index === 0 ? -1 : 1;
  const origin = aheadPoint(side * 3.3, -1, 0, g.heading);
  const direction = noseDirection(g);
  a.ammo[index] = false;
  a.missiles.push({ ...origin, y: g.alt + origin.y, id: ++a.serial, side, target: a.target.id, age: 0,
    velocity: { x: direction.x * JET.missileSpeed, y: direction.y * JET.missileSpeed, z: direction.z * JET.missileSpeed } });
  a.cooldown = JET.fireCooldown;
  return true;
}

export interface AerialEvents { blimpCollision: boolean; missileHits: TargetId[] }
/** Run on the flight clock; no timers can fire while the flight is paused or over. */
export function stepAerial(g: FlightGame, dt: number, speed: number): AerialEvents {
  const out: AerialEvents = { blimpCollision: false, missileHits: [] };
  if (g.phase !== 'flying' || !(dt > 0)) return out;
  const a = g.aerial;
  const velocity = flightVelocity(g, speed);
  if (g.mode === 'jet' && !a.scoutAnchor && ufoAt(g.ufo, g.clock).visible) {
    a.scoutAnchor = { x: 0, y: g.alt, z: 0, heading: g.heading };
  }
  if (a.scoutAnchor) {
    a.scoutAnchor.x -= velocity.x * dt; a.scoutAnchor.z -= velocity.z * dt;
  }
  a.cooldown = Math.max(0, a.cooldown - dt);
  for (const e of a.explosions) {
    e.age += dt; e.x -= velocity.x * dt; e.z -= velocity.z * dt;
  }
  a.explosions = a.explosions.filter(e => e.age < 2.5);
  const b = a.blimp;
  const oldB = b ? { ...b } : null;
  if (b?.alive) {
    const drift = aheadPoint(0, 0, 12, b.heading);
    b.x += (drift.x - velocity.x) * dt; b.z += (drift.z - velocity.z) * dt;
    // A horizontal ellipsoid aligned to the blimp; swept to prevent boost tunnelling.
    const span = g.mode === 'airliner' ? 18 : g.mode === 'jet' ? 5.4 : 7;
    const halfLength = g.mode === 'airliner' ? 17 : g.mode === 'jet' ? 8 : 7;
    const off = (g.heading - b.heading) * RAD;
    const across = span * Math.abs(Math.cos(off)) + halfLength * Math.abs(Math.sin(off));
    const along = span * Math.abs(Math.sin(off)) + halfLength * Math.abs(Math.cos(off));
    const relative = (p: Point, alt: number): Point => {
      const h = b.heading * RAD;
      return { x: (p.x * Math.cos(h) + p.z * Math.sin(h)) / (BLIMP.radius + across),
        y: (p.y - alt) / (BLIMP.radius + 3), z: (p.x * Math.sin(h) - p.z * Math.cos(h)) / (BLIMP.length / 2 + along) };
    };
    if (oldB && sweptDistance(relative(oldB, g.alt), relative(b, g.alt + velocity.y * dt)) <= 1) {
      destroy(g, { ...b, id: 'blimp', name: 'SEAT blimp', radius: BLIMP.radius });
      g.tailDamage = g.mode === 'ufo' ? 0 : 1;
      g.pitch -= 4; g.bank += Math.sign(b.x || 1) * 8;
      out.blimpCollision = true;
    }
  }
  let targets = aerialTargets(g);
  const ufo = targets.find(t => t.id === 'ufo');
  const oldUfo = a.previousUfo;
  for (const m of a.missiles) {
    const old = { x: m.x, y: m.y, z: m.z };
    const target = targets.find(t => t.id === m.target);
    if (target) {
      const dir = subtract(target, m);
      const d = Math.max(1, length(dir));
      const currentSpeed = Math.max(1, length(m.velocity));
      const current = { x: m.velocity.x / currentSpeed, y: m.velocity.y / currentSpeed, z: m.velocity.z / currentSpeed };
      const wanted = { x: dir.x / d, y: dir.y / d, z: dir.z / d };
      const angle = Math.acos(clamp(dot(current, wanted), -1, 1));
      const turn = Math.min(1, JET.missileTurn * dt / Math.max(0.001, angle));
      const next = { x: current.x + (wanted.x - current.x) * turn, y: current.y + (wanted.y - current.y) * turn, z: current.z + (wanted.z - current.z) * turn };
      const n = Math.max(0.001, length(next));
      m.velocity = { x: next.x / n * JET.missileSpeed, y: next.y / n * JET.missileSpeed, z: next.z / n * JET.missileSpeed };
    }
    m.x += (m.velocity.x - velocity.x) * dt;
    m.y += m.velocity.y * dt;
    m.z += (m.velocity.z - velocity.z) * dt;
    m.age += dt;
    for (const t of targets) {
      const previous = t.id === 'blimp' ? oldB ?? t : oldUfo ?? t;
      if (sweptDistance(subtract(old, previous), subtract(m, t)) <= t.radius + 2) {
        destroy(g, t);
        out.missileHits.push(t.id);
        m.age = JET.missileLife;
        targets = aerialTargets(g);
        break;
      }
    }
  }
  a.missiles = a.missiles.filter(m => m.age < JET.missileLife);
  a.previousUfo = ufo ? { x: ufo.x, y: ufo.y, z: ufo.z } : null;
  if (g.mode !== 'jet') { a.target = null; a.lock = 0; return out; }
  const forward = noseDirection(g);
  const eligible = targets.map(t => {
    const delta = { x: t.x, y: t.y - g.alt, z: t.z };
    const range = length(delta);
    const cosine = dot(delta, forward) / Math.max(1, range);
    return { t, range, cosine };
  }).filter(t => t.range < JET.lockRange && t.range > 25 && t.cosine >= Math.cos(JET.lockCone));
  // Keep a valid current lock stable when another target enters the cone.
  const selected = eligible.find(t => t.t.id === a.target?.id) ?? eligible.sort((l, r) => r.cosine - l.cosine)[0];
  if (!selected) { a.target = null; a.lock = 0; }
  else {
    if (a.target?.id !== selected.t.id) a.lock = 0;
    a.target = { ...selected.t };
    a.lock = Math.min(1, a.lock + dt / JET.lockSeconds);
  }
  return out;
}
