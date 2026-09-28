/**
 * The UFO.
 *
 * On some flights something is out there. It blinks into being a kilometre
 * or so ahead, hangs perfectly still, and then moves the way nothing with
 * wings can: a dead stop, a dash of hundreds of metres in a fraction of a
 * second along one axis, a dead stop, a dash along another — every turn a
 * right angle, and no slowing into any of them. Then it goes straight up
 * and is gone.
 *
 * Now and then it comes for the aeroplane instead: one last dash, at the
 * better part of a thousand metres a second, straight at a wingtip. The
 * game drops into slow motion for the moment it hits (see `slowAt`), the
 * outer wing shears off and tumbles away, and the UFO carries on past and
 * up and out of sight. The aeroplane flies on, rolling hard toward the
 * side that lost its tip.
 *
 * This is the plan and the path, in plain numbers — metres right, up and
 * ahead of the aeroplane, against the flight's own clock — so the page can
 * hold it and the tests can fly it. The scene draws it (see WorldScene),
 * and where the dash at the wing ends is the wingtip the scene draws.
 */

/** Metres right, up and ahead of the aeroplane. */
export interface Offset {
  right: number;
  up: number;
  ahead: number;
}

interface Key extends Offset {
  /** Seconds on the flight's clock. */
  t: number;
  /** How it got here from the key before: sat still, or dashed. */
  move: 'hover' | 'dash';
}

export interface UfoPlan {
  /** When it blinks in, on the flight's clock. */
  at: number;
  /** The wing it comes for: -1 port, 1 starboard, 0 neither. */
  strike: -1 | 0 | 1;
  /** When the dash at the wing begins, and when it hits: Infinity if it never does. */
  strikeFrom: number;
  hitAt: number;
  /** When it is gone. */
  end: number;
  keys: Key[];
}

export interface UfoNow extends Offset {
  visible: boolean;
  /** 0–1 as it blinks in, 1 after. */
  scale: number;
  /** Dashing, or dashing at the wing: how far into it, 0–1. */
  dash: number;
  /** The dash at the wing, while it is on: which wing, and how far in. */
  strike?: { side: -1 | 1; p: number };
}

export const UFO = {
  /** How often it shows, and how often it hits (of all flights). */
  seenOdds: 0.45,
  hitOdds: 0.12,
  /** When it can show, seconds after the controls are handed over. */
  from: 8,
  to: 45,
  /** How long the dash at the wing takes, and how long it is stopped in the air before. */
  strikeFor: 0.85,
  /** Slow motion: this fast, from this long before the hit to this long after. */
  slow: 0.15,
  slowBefore: 0.12,
  slowAfter: 0.18,
  /** Where it keeps to, relative to the aeroplane. */
  box: { right: [-700, 700], up: [-120, 350], ahead: [500, 1700] } as Record<keyof Offset, readonly [number, number]>,
} as const;

/** Where the dash at the wing is aimed, before the scene puts it on the real wingtip. */
export const WINGTIP: Offset = { right: 16.2, up: 0.5, ahead: -4 };

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const AXES: (keyof Offset)[] = ['right', 'up', 'ahead'];

/**
 * This flight's UFO, or null if it has none. `?ufo` on the address makes it
 * show, and `?ufohit` makes it come for the wing — `force` says which.
 */
export function planUfo(force: 'none' | 'seen' | 'hit' = 'none'): UfoPlan | null {
  const roll = Math.random();
  const hit = force === 'hit' || (force === 'none' && roll < UFO.hitOdds);
  if (!hit && force !== 'seen' && roll >= UFO.seenOdds) return null;
  const at = force === 'none' ? between(UFO.from, UFO.to) : between(4, 7);
  const box = UFO.box;
  let p: Offset = {
    right: (Math.random() < 0.5 ? -1 : 1) * between(150, 600),
    up: between(60, 300),
    ahead: between(900, 1500),
  };
  const keys: Key[] = [{ t: at, ...p, move: 'hover' }];
  let t = at;
  let last: keyof Offset | null = null;
  const legs = hit ? 3 + Math.floor(Math.random() * 2) : 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < legs; i++) {
    // Stopped dead in the air, then gone along one axis — never the one it just used.
    t += between(0.3, 0.75);
    keys.push({ t, ...p, move: 'hover' });
    const axis = AXES.filter((a) => a !== last)[Math.floor(Math.random() * 2)];
    last = axis;
    const next = { ...p };
    const reach = axis === 'up' ? between(180, 320) : between(300, 650);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const there = clamp(p[axis] + dir * reach, box[axis]);
    // Against an edge it would fall short: whichever way goes further.
    const back = clamp(p[axis] - dir * reach, box[axis]);
    next[axis] = Math.abs(there - p[axis]) >= reach * 0.8 || Math.abs(there - p[axis]) >= Math.abs(back - p[axis]) ? there : back;
    t += between(0.14, 0.3);
    p = next;
    keys.push({ t, ...p, move: 'dash' });
  }
  t += between(0.35, 0.6);
  keys.push({ t, ...p, move: 'hover' });
  if (hit) {
    const side: -1 | 1 = p.right < 0 ? -1 : 1;
    const strikeFrom = t;
    const hitAt = t + UFO.strikeFor;
    // Past the wing, and up and away.
    keys.push({ t: hitAt, right: side * WINGTIP.right, up: WINGTIP.up, ahead: WINGTIP.ahead, move: 'dash' });
    keys.push({ t: hitAt + 0.5, right: side * 160, up: 420, ahead: -500, move: 'dash' });
    return { at, strike: side, strikeFrom, hitAt, end: hitAt + 0.5, keys };
  }
  keys.push({ t: t + 0.45, ...p, up: p.up + 1800, move: 'dash' });
  return { at, strike: 0, strikeFrom: Infinity, hitAt: Infinity, end: t + 0.45, keys };
}

/** A dash: no slowing into it or out of it to speak of — it is simply there. */
const dashEase = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Where the UFO is at `t` on the flight's clock. */
export function ufoAt(plan: UfoPlan | null, t: number): UfoNow {
  const none: UfoNow = { visible: false, scale: 0, dash: 0, right: 0, up: 0, ahead: 0 };
  if (!plan || t < plan.at || t >= plan.end) return none;
  const keys = plan.keys;
  let i = 1;
  while (i < keys.length - 1 && keys[i].t <= t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const f = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t)));
  const scale = Math.min(1, (t - plan.at) / 0.12);
  if (plan.strike && t >= plan.strikeFrom && t < plan.hitAt) {
    // The dash at the wing: the scene aims it at the real wingtip.
    const p = (t - plan.strikeFrom) / (plan.hitAt - plan.strikeFrom);
    const s = p * p;
    return {
      visible: true, scale, dash: p, strike: { side: plan.strike, p },
      right: a.right + (b.right - a.right) * s, up: a.up + (b.up - a.up) * s, ahead: a.ahead + (b.ahead - a.ahead) * s,
    };
  }
  if (b.move === 'hover') {
    // Holding still — perfectly, but for the faintest bob.
    return { visible: true, scale, dash: 0, right: a.right, up: a.up + Math.sin(t * 5.3) * 1.5, ahead: a.ahead };
  }
  const e = dashEase(f);
  return {
    visible: true, scale, dash: f,
    right: a.right + (b.right - a.right) * e, up: a.up + (b.up - a.up) * e, ahead: a.ahead + (b.ahead - a.ahead) * e,
  };
}

/** How fast the game's time runs at `t`: slow motion around the moment it hits, and 1 otherwise. */
export function slowAt(plan: UfoPlan | null, t: number): number {
  if (!plan || !Number.isFinite(plan.hitAt)) return 1;
  const d = t - plan.hitAt;
  const ramp = 0.08;
  if (d < -UFO.slowBefore - ramp || d > UFO.slowAfter + ramp) return 1;
  const into = d < -UFO.slowBefore ? (d + UFO.slowBefore + ramp) / ramp : d > UFO.slowAfter ? 1 - (d - UFO.slowAfter) / ramp : 1;
  return 1 + (UFO.slow - 1) * Math.min(1, Math.max(0, into));
}
