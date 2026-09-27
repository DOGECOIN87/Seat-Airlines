import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { bandHeight, createWorld, type ViewPose, type WorldHandles } from '../three/WorldScene';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude, type Attitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import { clampUnit, GAME, scheduleFailure, speedAt, type FlightGame } from '../lib/landingGame';

/**
 * The landing page's aeroplane: the exterior scene, full screen, and — when
 * somebody takes the controls — flown by hand.
 *
 * Its own chunk, because it is the one that brings three.js with it; the
 * page around it, with the way in, is up before it arrives.
 *
 * At rest it is the site's exterior view exactly: the market flies it. Once
 * the controls are taken it dives onto the deck while the camera swings round
 * behind the tail, and from then on the pitch, the bank and the heading are
 * the player's, the height is whatever they make it, and the ground under
 * the nose is checked every frame.
 *
 * Sometimes an engine explodes (see `landingGame`), and the flying changes
 * character entirely — see `fly` below.
 */

export interface LandingHud {
  timer: RefObject<HTMLSpanElement | null>;
  bar: RefObject<HTMLSpanElement | null>;
  alt: RefObject<HTMLSpanElement | null>;
  warn: RefObject<HTMLParagraphElement | null>;
  stall: RefObject<HTMLParagraphElement | null>;
}

/** The two sound effects, made on the gesture that started the game so they are allowed to play. */
export interface LandingSounds {
  blast: HTMLAudioElement;
  wasted: HTMLAudioElement;
}

interface LandingSceneProps {
  feed: FlightFeed;
  sky: SkyState;
  band: BandState;
  controls: ManualControls;
  taken: ReadonlySet<string>;
  /** Somebody has taken the controls. */
  playing: boolean;
  game: MutableRefObject<FlightGame>;
  hud: LandingHud;
  sounds: MutableRefObject<LandingSounds | null>;
  /** The scene is drawing; the controls can be offered. */
  onReady: () => void;
  /** It will not draw here: no WebGL. */
  onFail: () => void;
  /** The dive is over and the controls are the player's. */
  onFlying: () => void;
  /** An engine has just exploded: -1 the port one, 1 the starboard. */
  onFailure: (side: -1 | 1) => void;
  /** The minute is up, or the aeroplane is down. */
  onEnd: (why: 'crash' | 'time', metres: number) => void;
}

const DEG = Math.PI / 180;
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Band-limited noise: a random target, followed at a rate. */
const drift = (v: number, rate: number, dt: number) => v + (Math.random() * 2 - 1 - v) * (1 - Math.exp(-rate * dt));

/**
 * One frame of flying, both ways.
 *
 * With both engines it is the arcade model the landing always had: the
 * stick sets a pitch and a bank, the bank turns it, the pitch climbs it.
 *
 * With one gone it is the real thing, simplified. The good engine's thrust,
 * off to one side of the centreline, yaws the nose toward the dead one; the
 * sideslip that makes rolls it that way too, the wing on the good side
 * flying faster and lifting more. Nothing but the stick stops the roll, and
 * the ailerons are a hydraulic system short and getting weaker as the fire
 * spreads, so the roll has momentum here — the stick changes how fast it is
 * rolling, not where it is. A bank, once it has started, wants to go on
 * (the spiral), and costs lift, so the nose falls in it. Half the thrust
 * cannot hold both height and speed: the aeroplane sinks, and pulling up to
 * stop it bleeds speed until the wing stalls, the nose drops, and the dead
 * side's wing drops with it. On top of all of it, the airframe shakes. The
 * way to fly it is the way pilots are taught: bank a little toward the good
 * engine, and keep the nose down for speed.
 */
function fly(g: FlightGame, ix: number, iy: number, dt: number): { vs: number; stall: number } {
  if (g.failed === 0) {
    g.pitch += (iy * GAME.maxPitch - g.pitch) * (1 - Math.exp(-3.2 * dt));
    // At the ceiling the nose will not come up any further.
    if (g.alt >= GAME.ceiling && g.pitch > 0) g.pitch *= 1 - Math.min(1, dt * 6);
    g.bank += (ix * GAME.maxBank - g.bank) * (1 - Math.exp(-3.5 * dt));
    g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
    g.speed = speedAt(g.alt);
    g.rollRate = 0;
    return { vs: Math.sin(g.pitch * DEG) * g.speed * GAME.climbGain, stall: 0 };
  }

  const dead = g.failed;
  g.damage = Math.min(1, g.damage + dt / 40);
  const k = g.damage;
  g.surge = drift(g.surge, 0.8, dt);
  g.buffetRoll = drift(g.buffetRoll, 10, dt);
  g.buffetPitch = drift(g.buffetPitch, 8, dt);

  const stall = smoothstep(GAME.stallSpeed + 6, GAME.stallSpeed - 4, g.speed);
  const authority = (0.6 - 0.25 * k) * (1 - 0.75 * stall);
  // Roll: the stick drives the roll rate; the dead engine, the spiral, the buffet and a stall push it.
  const commanded = ix * 80 * authority;
  const push = dead * (18 + 24 * k) * (1 + 0.45 * g.surge);
  g.rollRate += ((commanded - g.rollRate) * 2.6 + push + Math.sin(g.bank * DEG) * 30
    + g.buffetRoll * (26 + 34 * k) + dead * stall * 70) * dt;
  g.bank = wrap180(g.bank + g.rollRate * dt);
  const lift = Math.cos(g.bank * DEG);
  // Pitch: softer elevator; the nose falls in a bank, and drops outright in a stall.
  const aim = iy * GAME.maxPitch * (0.85 - 0.25 * k) - (1 - lift) * 14 - stall * 18 + g.buffetPitch * (2 + 3 * k);
  g.pitch += (aim - g.pitch) * (1 - Math.exp(-2.4 * dt));
  // Heading: the bank turns it while the wing still lifts, and the good engine yaws it toward the dead one.
  g.heading = (g.heading + (g.bank * GAME.turnRate * Math.max(0, lift) + dead * (5 + 5 * k)) * dt + 360) % 360;
  // Speed: half the thrust. Climbing costs speed, a bank costs more, diving buys it back.
  const trim = speedAt(g.alt) * (0.88 - 0.14 * k);
  g.speed += ((trim - g.speed) * 0.22 - 9.81 * Math.sin(g.pitch * DEG) * 0.9 - Math.abs(Math.sin(g.bank * DEG)) * 2.2) * dt;
  g.speed = Math.max(45, g.speed);
  // Height: what the pitch buys at this speed, less what one engine cannot hold, less what the bank spills.
  const vs = Math.sin(g.pitch * DEG) * g.speed - (3.5 + 5.5 * k) - (1 - lift) * g.speed * 0.3;
  return { vs, stall };
}

const LandingScene = ({
  feed, sky, band, controls, taken, playing, game, hud, sounds, onReady, onFail, onFlying, onFailure, onEnd,
}: LandingSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandles | null>(null);
  const latest = useRef({ sky, band });
  latest.current = { sky, band };
  const calls = useRef({ onReady, onFail, onFlying, onFailure, onEnd });
  calls.current = { onReady, onFail, onFlying, onFailure, onEnd };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: WorldHandles;
    try {
      handles = createWorld(canvas, { damage: true });
    } catch {
      calls.current.onFail();
      return;
    }
    world.current = handles;
    // Dev only: the game and the ground under it, for the headless checks,
    // which run far too slowly to fly into a hill for real.
    if (import.meta.env.DEV) {
      Object.assign(window, { __saGame: game.current, __saGround: handles.groundAt });
      Object.defineProperty(window, '__saSounds', { get: () => sounds.current, configurable: true });
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      handles.resize(Math.max(1, r.width), Math.max(1, r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    calls.current.onReady();
    return () => {
      ro.disconnect();
      handles.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setOccupancy(taken);
  }, [taken]);

  /* The operator's switches are for the aeroplane the market flies. Once
     somebody has the controls, an inverted aeroplane or a camera on a
     turntable is the last thing they need. */
  useEffect(() => {
    world.current?.setControls(playing ? HANDS_OFF : controls);
  }, [controls, playing]);

  /* The game is flown in the weather, whatever the market says: that is
     where there is ground to fly over, and to hit. */
  const low = useMemo<BandState>(
    () => ({ ...band, band: 'atmosphere', progress: 0.3, label: 'In the weather' }),
    [band],
  );
  const lowRef = useRef(low);
  lowRef.current = low;

  const pose = useRef<ViewPose>({ seatIndex: 0, row: 1, yaw: 0, id: '1A', exterior: true, orbit: 0 });
  const flown = useRef<Attitude>({ pitch: 0, bank: 0, speed: 240, alt: 0, vs: 0, heading: 0, roll: 0 });
  const shown = useRef({ second: -1, feet: -1, warn: false, stall: false });

  useAttitude(feed, (a) => {
    const w = world.current;
    if (!w) return;
    const g = game.current;
    const now = performance.now();
    const dt = Math.min(0.1, g.last ? (now - g.last) / 1000 : 0);
    g.last = now;
    const { sky: skyState, band: bandState } = latest.current;
    const p = pose.current;

    if (g.phase === 'crashed') return; // The last frame holds: the aeroplane is down.

    /* At rest the aeroplane moves up out of the words at the foot of the
       screen, and over to the right where there is room: up and right on
       a wide screen, straight up on a tall one. */
    const wide = window.innerWidth > window.innerHeight * 1.15;
    p.frame = wide ? { x: 0.05, y: 0.15 } : { x: 0, y: 0.2 };

    if (g.phase === 'idle') {
      p.chase = 0;
      p.height = undefined;
      w.render(a, skyState, bandState, p);
      // Where the dive will start from, if the controls are taken now.
      g.heading = a.heading;
      g.pitch = a.pitch;
      g.bank = a.bank;
      g.from = bandState.band === 'atmosphere' ? bandHeight(bandState) : 2400;
      return;
    }

    const f = flown.current;
    f.alt = a.alt;
    let stall = 0;

    if (g.phase === 'intro') {
      /* The dive onto the deck: down to the start height, the nose down
         and back up again on the way, the camera swinging round behind. */
      const t = Math.min(1, (now - g.phaseAt) / 1000 / GAME.introSeconds);
      const e = smooth(t);
      g.alt = g.from + (GAME.startAlt - g.from) * e;
      g.pitch = -7 * Math.sin(Math.PI * t);
      g.bank *= 1 - Math.min(1, dt * 3);
      g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
      p.chase = e;
      if (t >= 1) {
        g.phase = 'flying';
        g.phaseAt = now;
        g.distance = 0;
        g.speed = speedAt(g.alt);
        g.failAt = scheduleFailure();
        calls.current.onFlying();
      }
    } else {
      /* Flying, or flying on once the minute is up with the stick let go. */
      const live = g.phase === 'flying';
      const t = (now - g.phaseAt) / 1000;

      if (live && g.failed === 0) {
        /* The warning is a clip that ends in a bang, so it starts that long
           before the engine is due to go — and the engine then goes on the
           clip's own clock, however late the audio started, so the fireball
           lands on the bang. Without the audio, it goes on time regardless. */
        const clip = sounds.current?.blast ?? null;
        if (!g.warned && t >= g.failAt - GAME.blastAt) {
          g.warned = true;
          g.warnedAt = now;
          if (clip) {
            clip.currentTime = 0;
            void clip.play().catch(() => {});
          }
        }
        if (g.warned) {
          const heard = clip && !clip.paused && clip.currentTime > 0 ? clip.currentTime : null;
          const waited = (now - g.warnedAt) / 1000;
          if ((heard !== null && heard >= GAME.blastAt) || waited >= GAME.blastAt + (heard !== null ? 1.2 : 0)) {
            g.failed = Math.random() < 0.5 ? -1 : 1;
            g.failedAt = now;
            g.damage = 0.5;
            // The blast itself: a violent roll toward the dead engine, and the nose knocked down.
            g.rollRate = g.failed * 60;
            g.pitch -= 5;
            calls.current.onFailure(g.failed);
          }
        }
      }

      const ix = live ? clampUnit(g.keys.x + g.stick.x) : 0;
      const iy = live ? clampUnit(g.keys.y + g.stick.y) : 0;
      const step = fly(g, ix, iy, dt);
      stall = step.stall;
      g.alt = Math.min(GAME.ceiling, g.alt + step.vs * dt);
      if (live) g.distance += g.speed * dt;
      p.chase = 1;
    }

    f.pitch = g.pitch;
    f.bank = g.bank;
    f.heading = g.heading;
    p.height = g.alt;
    p.failed = g.failed;
    p.fury = g.damage;
    p.speed = g.failed ? g.speed : undefined;
    p.slip = g.failed ? g.failed * (3 + 4 * g.damage) : 0;
    /* After the blast the camera eases round over the burning engine's
       shoulder and up a little, so the smoke streams away across the frame. */
    const side = g.failed ? g.failed * 38 : 0;
    p.chaseSide = (p.chaseSide ?? 0) + (side - (p.chaseSide ?? 0)) * (1 - Math.exp(-1.2 * dt));
    p.chaseLift = (p.chaseLift ?? 0) + ((g.failed ? 9 : 0) - (p.chaseLift ?? 0)) * (1 - Math.exp(-1.2 * dt));
    w.render(f, skyState, lowRef.current, p);

    const agl = g.alt - w.groundAt();
    if (g.phase === 'flying') {
      if (agl < GAME.clearance) {
        g.phase = 'crashed';
        g.phaseAt = now;
        calls.current.onEnd('crash', g.distance);
        return;
      }
      /* The minute runs out only for an aeroplane with both engines. Once
         the warning has started, the flight is over when it hits the ground. */
      const left = GAME.seconds - (now - g.phaseAt) / 1000;
      if (!g.warned) {
        if (left <= 0) {
          g.phase = 'timeup';
          g.phaseAt = now;
          calls.current.onEnd('time', g.distance);
        }
        // The readouts, written straight to the page: no React render a frame.
        const second = Math.min(GAME.seconds, Math.max(0, Math.ceil(left)));
        if (second !== shown.current.second && hud.timer.current) {
          shown.current.second = second;
          hud.timer.current.textContent = `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`;
        }
        if (hud.bar.current) hud.bar.current.style.transform = `scaleX(${Math.max(0, left / GAME.seconds)})`;
      }
    }
    const feet = Math.max(0, Math.round((agl * 3.281) / 10) * 10);
    if (feet !== shown.current.feet && hud.alt.current) {
      shown.current.feet = feet;
      hud.alt.current.textContent = feet.toLocaleString('en-US');
    }
    // Low and sinking, or simply very low: the terrain warning.
    const warn = g.phase === 'flying' && (agl < 70 || (agl < 140 && g.pitch < -3));
    if (warn !== shown.current.warn && hud.warn.current) {
      shown.current.warn = warn;
      hud.warn.current.classList.toggle('is-on', warn);
    }
    const stalling = g.phase === 'flying' && stall > 0.5 && !warn;
    if (stalling !== shown.current.stall && hud.stall.current) {
      shown.current.stall = stalling;
      hud.stall.current.classList.toggle('is-on', stalling);
    }
  }, controls);

  return <canvas ref={canvasRef} className="sa-landing__canvas" aria-hidden />;
};

export default LandingScene;
