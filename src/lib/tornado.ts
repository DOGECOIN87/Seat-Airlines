/**
 * Tornadoes: the extreme weather.
 *
 * Under a supercell the storm reaches the ground. A few funnels touch down
 * around the flight path, a couple of kilometres out, drift with the storm
 * and lift again after a minute or two. Each is a column of wind turning
 * about a core: out at its reach it pushes whatever flies there round the
 * vortex and rolls it, in the wall the air goes up hard, and in the core it
 * comes down — a downdraft that will put an airliner into the ground from
 * a few hundred feet. Above the cloud base there is nothing: the funnel
 * hangs from it.
 *
 * Positions are metres from the aeroplane on the world's axes, x east and
 * z south, as the thermals keep theirs; the aeroplane's own travel and the
 * funnel's drift both move them. The pull is worked out here and put on the
 * flight by `applyVortex`, after the flying, so the two flight models — the
 * airliner's and the saucer's — both feel it without either knowing.
 *
 * Threading one — passing close by the core and staying up — pays.
 */

export interface Twister {
  x: number;
  z: number;
  /** Its drift over the ground, m/s. */
  vx: number;
  vz: number;
  /** Metres: the core, and the reach of its wind. */
  core: number;
  reach: number;
  /** Which way it turns: 1 anticlockwise from above, as most do in the north. */
  spin: 1 | -1;
  age: number;
  life: number;
  /** Threaded already: it pays once. */
  threaded: boolean;
}

export interface TwisterField {
  list: Twister[];
  /** Seconds until the next touches down. */
  next: number;
}

export const TWISTER = {
  most: 3,
  /** When the first touches down, and between one and the next. */
  first: [2, 6] as const,
  gap: [9, 16] as const,
  /** Where: this far ahead, and this many degrees either side of the way it is going. */
  ahead: [1800, 3800] as const,
  spread: 45,
  core: [70, 130] as const,
  reach: [480, 720] as const,
  drift: [6, 20] as const,
  life: [70, 130] as const,
  /** Seconds it takes to touch down, and to lift. */
  grow: 6,
  /** Degrees a second it turns the aeroplane round the vortex at full reach, and degrees of bank a second it rolls it. */
  swirl: 34,
  roll: 46,
  /** Metres a second up in the wall, and down in the core. */
  lift: 38,
  sink: 75,
  /** Metres: the cloud base it hangs from. Above this nothing pulls. */
  top: 2400,
  /** Closer than this to the core, and still flying a few seconds later: threaded. */
  near: 260,
  bonus: 750,
} as const;

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const newTwisters = (): TwisterField => ({ list: [], next: between(...TWISTER.first) });

/** How grown it is, 0–1: touching down, and lifting again at the end of its life. */
export const presenceOf = (t: Twister): number =>
  Math.min(1, t.age / TWISTER.grow) * Math.min(1, Math.max(0, (t.life - t.age) / TWISTER.grow));

/** What the vortexes are doing to the aeroplane this frame. */
export interface Vortex {
  /** Degrees a second it is pushed round, signed (positive clockwise from above). */
  swirl: number;
  /** Degrees a second of roll it is given, signed. */
  roll: number;
  /** Metres a second up (or down). */
  lift: number;
  /** 0–1: how far into a core it is. */
  core: number;
  /** 0–1: how far into the wind at all. */
  wind: number;
}

/**
 * One step: every funnel moved by the aeroplane's travel (`speed` along
 * `heading`) and its own drift, the old ones lifted and gone, a new one
 * touching down when it is time; and the pull on an aeroplane at `alt`
 * metres above the ground. `threaded` is how many it has just threaded.
 */
export function stepTwisters(
  field: TwisterField, dt: number, speed: number, heading: number, agl: number, live = true,
): Vortex & { threaded: number } {
  const h = (heading * Math.PI) / 180;
  const dx = speed * Math.sin(h) * dt;
  const dz = -speed * Math.cos(h) * dt;
  const out = { swirl: 0, roll: 0, lift: 0, core: 0, wind: 0, threaded: 0 };
  // Up to the cloud base, fading in the last few hundred metres under it.
  const under = 1 - smooth(TWISTER.top - 500, TWISTER.top, agl);
  for (const t of field.list) {
    t.x += t.vx * dt - dx;
    t.z += t.vz * dt - dz;
    t.age += dt;
    const here = presenceOf(t) * under;
    if (here <= 0) continue;
    const d = Math.hypot(t.x, t.z);
    const wind = (1 - smooth(t.core, t.reach, d)) * here;
    const inner = (1 - smooth(t.core * 0.45, t.core, d)) * here;
    const wall = smooth(t.core * 0.6, t.core * 1.3, d) * (1 - smooth(t.core * 1.3, t.reach * 0.8, d)) * here;
    // Round the vortex: anticlockwise from above is a turn to the left for anything in it.
    out.swirl += -t.spin * wind * TWISTER.swirl;
    out.roll += -t.spin * wind * TWISTER.roll * (0.6 + 0.4 * Math.sin(t.age * 5.3 + t.x * 0.01));
    out.lift += wall * TWISTER.lift - inner * TWISTER.sink;
    out.core = Math.max(out.core, inner);
    out.wind = Math.max(out.wind, wind);
    if (live && !t.threaded && d < TWISTER.near) {
      t.threaded = true;
      out.threaded++;
    }
  }
  field.list = field.list.filter((t) => t.age < t.life && Math.hypot(t.x, t.z) < 12000);
  if (live) {
    field.next -= dt;
    if (field.next <= 0 && field.list.length < TWISTER.most) {
      const b = h + (between(-TWISTER.spread, TWISTER.spread) * Math.PI) / 180;
      const d = between(...TWISTER.ahead);
      const drift = between(...TWISTER.drift);
      const a = Math.random() * Math.PI * 2;
      field.list.push({
        x: d * Math.sin(b),
        z: -d * Math.cos(b),
        vx: drift * Math.cos(a),
        vz: drift * Math.sin(a),
        core: between(...TWISTER.core),
        reach: between(...TWISTER.reach),
        spin: Math.random() < 0.85 ? 1 : -1,
        age: 0,
        life: between(...TWISTER.life),
        threaded: false,
      });
      field.next = between(...TWISTER.gap);
    } else if (field.next <= 0) {
      field.next = 2;
    }
  }
  return out;
}

/** The parts of a flight a vortex pushes on. */
export interface Pushed {
  heading: number;
  bank: number;
  pitch: number;
  rollRate: number;
  failed: number;
  gustRoll: number;
  gustLift: number;
}

/**
 * Put a vortex's pull on a flight, after the flying: round, rolled, shaken
 * in the core; returns the climb rate with the wind's lift on it.
 */
export function applyVortex(g: Pushed, v: Vortex, vs: number, dt: number): number {
  if (v.wind <= 0) return vs;
  g.heading = (g.heading + v.swirl * dt + 360) % 360;
  // On one engine the roll has momentum: the wind adds to it. With both, it pushes the bank.
  if (g.failed) g.rollRate += v.roll * dt * 2;
  else g.bank += v.roll * dt;
  // The core shakes it about.
  if (v.core > 0) {
    g.gustRoll = Math.max(-1, Math.min(1, g.gustRoll + (Math.random() * 2 - 1) * v.core * 6 * dt));
    g.gustLift = Math.max(-1, Math.min(1, g.gustLift - v.core * 2 * dt));
    g.pitch -= v.core * 6 * dt;
  }
  return vs + v.lift;
}
