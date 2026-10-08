import type { LandingSounds } from '../lib/audioSprite';
export type { LandingSounds } from '../lib/audioSprite';
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CAPTURE, captureState } from '../capture/flag';
import { bandHeight, createWorld, type ViewPose, type WorldHandles } from '../three/WorldScene';
import { cruiseBurn, cruiseSpeed } from '../lib/dexBoost';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude, type Attitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import {
  BOOST, clampUnit, DASH, dashVelocity, dealFailures, FEET, fly, GAME, groundSpeed, leadFor, speedAt, stepBoost, travel, TURBULENCE, WASTED_AT,
  type Cause, type FlightGame,
} from '../lib/landingGame';
import { RAMMER, stepRams } from '../lib/rammer';
import { applyVortex, stepTwisters, TWISTER, type Vortex } from '../lib/tornado';
import { ARRIVE, bandAt, climbed, globeRadius, LEVELS, nextMark, type Level } from '../lib/levels';
import { LOGOS, stepLogos } from '../lib/logos';
import { climbBonus, SCORING, survivalRate } from '../lib/scoring';
import { FPM, KNOTS, speedAngle, ufoLiftAngle, ufoSpeedAngle, varioAngle } from '../lib/instruments';
import { dodge, planeTimeScale, slowAt, ufoAt, UFO } from '../lib/ufo';
import { aerialTargets, fireMissile, noseDirection, scoutPose, soundSpeed, startAerial, stepAerial, type AerialEvents } from '../lib/aerialCombat';

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
 * On the way up an engine goes (see `landingGame`) — blown, or hit by
 * lightning — and the flying changes character entirely; on some flights
 * the other one follows. See `fly`.
 */

export interface LandingHud {
  /** How far up the climb to the blast altitude, as a bar. */
  bar: RefObject<HTMLSpanElement | null>;
  alt: RefObject<HTMLSpanElement | null>;
  warn: RefObject<HTMLParagraphElement | null>;
  stall: RefObject<HTMLParagraphElement | null>;
  /** Lit while a tornado's wind has hold of it. */
  vortex: RefObject<HTMLParagraphElement | null>;
  /** The running score, and the multiplier it is building at. */
  score: RefObject<HTMLSpanElement | null>;
  rate: RefObject<HTMLSpanElement | null>;
  /** The instruments: each needle turned, the horizon moved, and each readout written, every frame. */
  speedNeedle: RefObject<SVGGElement | null>;
  speedText: RefObject<SVGTextElement | null>;
  varioNeedle: RefObject<SVGGElement | null>;
  varioText: RefObject<SVGTextElement | null>;
  horizon: RefObject<SVGGElement | null>;
  /** Lit while the aeroplane is in rising air. */
  lift: RefObject<HTMLParagraphElement | null>;
  /** The boost button: its tank shown as `--charge`, lit while a burn is going. */
  boost: RefObject<HTMLButtonElement | null>;
  /** How many logos have been flown through. */
  logos: RefObject<HTMLSpanElement | null>;
  targetReticle: RefObject<HTMLDivElement | null>;
  targetAim: RefObject<HTMLDivElement | null>;
  targetName: RefObject<HTMLSpanElement | null>;
  targetLock: RefObject<HTMLSpanElement | null>;
  ammo: RefObject<HTMLSpanElement | null>;
  fire: RefObject<HTMLButtonElement | null>;
  mach: RefObject<HTMLSpanElement | null>;
}



/**
 * A picture of the moment the engine went — the fireball, or the bolt — or,
 * failing that, of the crash: 1200 by 630, for the card a score is shared on.
 */
export const SHOT = { width: 1200, height: 630 } as const;

/** The crowd plays under everything else: its own recording is already well below the other two. */
const CROWD_VOLUME = 0.9;
/** The UFO's music, over the engines but under a blast. */
const UFO_VOLUME = 0.85;
/** The wind in a thermal, at its strongest. */
const WIND_VOLUME = 0.8;

interface LandingSceneProps {
  feed: FlightFeed;
  sky: SkyState;
  band: BandState;
  controls: ManualControls;
  taken: ReadonlySet<string>;
  /** Somebody has taken the controls. */
  playing: boolean;
  /** Exterior camera orbit, driven by the right stick or right-mouse drag. */
  cameraLook: MutableRefObject<{ orbit: number }>;
  /** How boosted the token is on DexScreener, 0–1: cruising, it burns and goes faster for it. */
  boost?: number;
  game: MutableRefObject<FlightGame>;
  hud: LandingHud;
  sounds: MutableRefObject<LandingSounds | null>;
  /** Where the picture of the flight is left (see SHOT). */
  shot: MutableRefObject<HTMLCanvasElement | null>;
  /** The scene is drawing; the controls can be offered. */
  onReady: () => void;
  /** It will not draw here: no WebGL. */
  onFail: () => void;
  /** The dive is over and the controls are the player's. */
  onFlying: () => void;
  /** An engine has just gone: -1 the port one, 1 the starboard; how; and whether it is the second. */
  onFailure: (side: -1 | 1, cause: Cause, second: boolean) => void;
  /** The UFO has started its run at a wing: get out of the way. */
  onUfoWarn: () => void;
  /** It has taken the outer wing off one side. */
  onStrike: (side: -1 | 1) => void;
  /** It went past. */
  onDodge: () => void;
  /** The aeroplane is down. */
  onCrash: (metres: number) => void;
  /** A logo has been flown through: how many so far. */
  onLogo: (count: number) => void;
  /** Lightning, `metres` off: for the thunder. */
  onThunder: (metres: number) => void;
  /** UFO mode: an airliner is about to arrive, from this many degrees off the nose. */
  onRamWarn?: (bearing: number) => void;
  /** It hit the saucer, on this side. */
  onRamHit?: (side: -1 | 1) => void;
  /** It went past, close. */
  onRamDodge?: () => void;
  /** Tornado weather: flown close past a funnel's core, and paid for it. */
  onThreaded?: () => void;
  /** The saucer has climbed off the top of one world's level and arrived over the next. */
  onLevel?: (level: Level) => void;
  /** The saucer's next goal has changed: the next band, or world, it is climbing for. */
  onMark?: (name: string) => void;
  onAerialEvent?: (events: AerialEvents) => void;
  onMach?: () => void;
  onMissileFire?: () => void;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** 0–1: how far into a tornado's wind the aeroplane is, for the warning. */
const twisterWind = (g: FlightGame) => {
  let w = 0;
  for (const t of g.twisters.list) {
    const d = Math.hypot(t.x, t.z);
    w = Math.max(w, Math.min(1, Math.max(0, (t.reach - d) / (t.reach - t.core))));
  }
  return w;
};
/** The bit an engine has in `ViewPose.struck`. */
const bit = (side: number) => (side === -1 ? 1 : side === 1 ? 2 : 0);

/**
 * The picture: the largest 1200:630 window the canvas holds, as near
 * centred on the aeroplane as its edges allow. Read straight after the
 * frame is drawn, before the browser takes it away.
 */
function grab(canvas: HTMLCanvasElement, at: { x: number; y: number }): HTMLCanvasElement | null {
  const out = document.createElement('canvas');
  out.width = SHOT.width;
  out.height = SHOT.height;
  const ctx = out.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) return null;
  const cw = canvas.width;
  const ch = canvas.height;
  let sw = cw;
  let sh = (cw * SHOT.height) / SHOT.width;
  if (sh > ch) {
    sh = ch;
    sw = (ch * SHOT.width) / SHOT.height;
  }
  const sx = Math.min(cw - sw, Math.max(0, at.x * cw - sw / 2));
  const sy = Math.min(ch - sh, Math.max(0, at.y * ch - sh * 0.55));
  try {
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, SHOT.width, SHOT.height);
  } catch {
    return null;
  }
  // Where the aeroplane is in it, for the card to frame it by.
  out.dataset.x = String((at.x * cw - sx) / sw);
  out.dataset.y = String((at.y * ch - sy) / sh);
  return out;
}

/**
 * Seconds until the aeroplane meets the ground, if it is going to: its
 * height marched forward a quarter of a second at a time — at the climb
 * rate it has, bent by how that is changing over the next couple of
 * seconds — against the ground at each point along the way it is heading,
 * hills and all. Infinity if nothing is hit within the crowd clip's reach.
 */
function impactIn(g: FlightGame, ground: (ahead: number) => number): number {
  const accel = Math.max(-6, Math.min(4, g.accel));
  let lastT = 0;
  let lastGap = g.agl - GAME.clearance;
  if (lastGap <= 0) return 0;
  for (let t = 0.25; t <= GAME.crowdLead + 1.5; t += 0.25) {
    const bend = Math.min(t, 2.5);
    const alt = g.alt + g.vs * t + accel * bend * (t - bend / 2);
    const gap = alt - ground(Math.min(4000, g.speed * t)) - GAME.clearance;
    if (gap <= 0) return lastT + (t - lastT) * (lastGap / (lastGap - gap));
    lastT = t;
    lastGap = gap;
  }
  return Infinity;
}


const LandingScene = ({
  feed, sky, band, controls, taken, playing, cameraLook, boost = 0, game, hud, sounds, shot,
  onReady, onFail, onFlying, onFailure, onUfoWarn, onStrike, onDodge, onCrash, onLogo, onThunder, onRamWarn, onRamHit, onRamDodge, onThreaded, onLevel, onMark, onAerialEvent, onMach, onMissileFire,
}: LandingSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandles | null>(null);
  const latest = useRef({ sky, band });
  const boostNow = useRef(boost);
  boostNow.current = boost;
  latest.current = { sky, band };
  const calls = useRef({ onReady, onFail, onFlying, onFailure, onUfoWarn, onStrike, onDodge, onCrash, onLogo, onThunder, onRamWarn, onRamHit, onRamDodge, onThreaded, onLevel, onMark, onAerialEvent, onMach, onMissileFire });
  calls.current = { onReady, onFail, onFlying, onFailure, onUfoWarn, onStrike, onDodge, onCrash, onLogo, onThunder, onRamWarn, onRamHit, onRamDodge, onThreaded, onLevel, onMark, onAerialEvent, onMach, onMissileFire };
  const machReached = useRef(false);
  const padButtons = useRef({ fire: false });
  /** The last lightning flash already heard. */
  const heardFlash = useRef(0);

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
      Object.assign(window, { __saGame: game.current, __saGround: handles.groundAt, __saFlash: handles.flash });
      Object.defineProperty(window, '__saSounds', { get: () => sounds.current, configurable: true });
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      handles.resize(Math.max(1, r.width), Math.max(1, r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    /* iOS takes a page's GPU context away when it needs the memory — often
       on the way back from another app. The picture is gone for good then,
       so the landing is told, as it is when there is no WebGL at all. */
    const lost = () => calls.current.onFail();
    canvas.addEventListener('webglcontextlost', lost);
    calls.current.onReady();
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
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

  /* The game is flown over its own ground, whatever the market says: in
     the weather, and as high as it climbs, through the site's own bands
     above it — and for a saucer, on to the moon and Mars (see levels.ts). */
  const markShown = useRef<string | null>(null);

  const pose = useRef<ViewPose>({ seatIndex: 0, row: 1, yaw: 0, id: '1A', exterior: true, orbit: 0 });
  const flown = useRef<Attitude>({ pitch: 0, bank: 0, speed: 240, alt: 0, vs: 0, heading: 0, roll: 0 });
  const shown = useRef({ feet: -1, warn: false, stall: false, vortex: false, score: -1, rate: -1, kt: -1, fpm: NaN, lift: false, charge: -1, burning: false });
  const crowd = useRef({ on: false, gain: 0 });
  /** The wind in the thermals: how loud it is now. */
  const windGain = useRef(0);
  /** The UFO's music: which flight's UFO it has played for, and how loud it still is. */
  const ufoTune = useRef<{ plan: unknown; gain: number }>({ plan: null, gain: 1 });

  /* The crowd: a recording of a cabin screaming that cuts off at a precise
     point, and that point has to be the impact. Nobody can know when that
     will be, so it is predicted every frame (see impactIn), and the clip
     started as far into itself as puts its cut-off on the prediction. While
     it plays it is kept on it: a little faster or slower as the ground comes
     sooner or later, with smooth rate changes, and a jump only
     if the prediction moves by seconds. Pull out of the dive and it fades;
     start another and it comes back. */
  const syncCrowd = (g: FlightGame, tti: number, dt: number) => {
    const clip = sounds.current?.crowd;
    if (!clip) return;
    const c = crowd.current;
    const want = GAME.crowdEnd - tti;
    if (!c.on) {
      // A fall, not a dip: steeper before the engine goes, when a dive is a choice.
      const falling = g.vs < (g.failed ? -2 : -15);
      if (tti <= GAME.crowdLead && falling) {
        clip.currentTime = Math.max(0, want);
        clip.playbackRate = 1;
        clip.volume = 0;
        c.gain = 0;
        c.on = true;
        void clip.play().catch(() => { c.on = false; });
      }
      return;
    }
    if (clip.ended || clip.paused) {
      c.on = false;
      return;
    }
    if (!Number.isFinite(tti) || tti > GAME.crowdLead + 3) {
      c.gain = Math.max(0, c.gain - dt / 0.6);
      clip.volume = c.gain * CROWD_VOLUME;
      if (c.gain === 0) {
        clip.pause();
        c.on = false;
      }
      return;
    }
    c.gain = Math.min(1, c.gain + dt / 0.35);
    clip.volume = c.gain * CROWD_VOLUME;
    // Past its cut-off with the aeroplane still up: let it finish rather than chase it.
    if (want > GAME.crowdEnd + 0.3) return;
    const behind = want - clip.currentTime;
    if (Math.abs(behind) > 2) {
      clip.currentTime = Math.max(0, want);
      clip.playbackRate = 1;
    } else {
      const rate = Math.min(1.25, Math.max(0.8, 1 + behind * 0.5));
      if (Math.abs(rate - clip.playbackRate) > 0.01) clip.playbackRate += (rate - clip.playbackRate) * Math.min(1, dt * 4);
    }
  };

  useAttitude(feed, (a) => {
    const w = world.current;
    if (!w) return;
    const g = game.current;
    const now = performance.now();
    // Game time: the clock's, or less of it in slow motion — and the aeroplane's own, which slows less.
    const realDt = Math.min(0.1, g.last ? (now - g.last) / 1000 : 0);
    const dt = realDt * g.slow;
    const flyDt = realDt * planeTimeScale(g.slow);
    g.last = now;
    const { sky: skyState, band: bandState } = latest.current;
    const p = pose.current;
    p.playerUfo = g.mode === 'ufo' && g.phase !== 'idle';
    p.playerJet = g.mode === 'jet' && g.phase !== 'idle';

    if (g.phase === 'crashed') {
      /* Down. The world stops where it is — the smoke hanging, the flames
         still — and only the camera moves: as WASTED lands it makes a slow
         dolly zoom, backing away while the lens closes in, so the aeroplane
         holds its size and the ground behind it looms. */
      const since = (now - g.phaseAt) / 1000 - WASTED_AT;
      p.freeze = true;
      p.dolly = smooth(Math.min(1, Math.max(0, since / 2.8)));
      w.render(flown.current, skyState, bandAt(g.level, g.agl), p);
      return;
    }

    /* At rest the aeroplane moves up out of the words at the foot of the
       screen, and over to the right where there is room: up and right on
       a wide screen, straight up on a tall one. */
    const wide = window.innerWidth > window.innerHeight * 1.15;
    p.frame = wide ? { x: 0.05, y: 0.15 } : { x: 0, y: 0.2 };

    if (g.phase === 'idle') {
      p.chase = 0;
      p.height = undefined;
      p.globe = undefined;
      /* Boosted on DexScreener, and nobody flying it: cruise on afterburner,
         flickering, the ground going by nearly twice as fast. */
      const burn = cruiseBurn(now, boostNow.current);
      p.boost = [burn, burn];
      p.speedScale = cruiseSpeed(boostNow.current);
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
        dealFailures(g);
        startAerial(g, w.groundAt(1000));
        machReached.current = false;
        if (g.mode === 'jet') g.speed = groundSpeed(g);
        shot.current = null;
        calls.current.onFlying();
      }
    } else {
      const live = g.phase === 'flying';
      /** A tornado's wind on it this frame, if there is one about. */
      let vortex: Vortex | null = null;

      /* Which engine is next to go, if one is: the first, on the way up;
         then the second, on the flights that lose it, a while after. */
      const second = g.failed !== 0;
      if (live && (!second || (!g.both && Number.isFinite(g.secondAfter)))) {
        /* The warning is a clip that ends in the bang — or the crack — so it
           starts as far ahead of the moment as the bang is into it: worked
           out from the climb rate for the first, so the bang lands as the
           altimeter reaches the height, and from the clock for the second.
           The engine then goes on the clip's own clock, however late the
           audio started, so the fireball, or the bolt, lands on the bang.
           Without the audio it goes on time regardless. */
        const cause = g.causes[second ? 1 : 0];
        const lead = leadFor(cause);
        const clip = (cause === 'lightning' ? sounds.current?.lightning : sounds.current?.blast) ?? null;
        const coming = second
          ? (now - g.failedAt) / 1000 + lead >= g.secondAfter
          : g.agl + Math.max(0, g.vs) * lead >= g.blastAlt && (g.mode !== 'jet' || g.clock >= SCORING.firstFailure);
        if (!g.warned && coming) {
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
          if ((heard !== null && heard >= lead) || waited >= lead + (heard !== null ? 1.2 : 0)) {
            g.warned = false;
            if (!second) {
              g.failed = g.mode === 'jet' ? -1 : Math.random() < 0.5 ? -1 : 1;
              g.failedAt = now;
              g.damage = 0.5;
              g.decay = 0;
              // Made it: the reach bonus, and the climb bonus for how fast — by the foot.
              g.climbTime = (now - g.phaseAt) / 1000;
              g.bonus = SCORING.reached + climbBonus(g.climbTime, (g.blastAlt * FEET) / GAME.blastFeet);
              g.score = g.bestFeet * SCORING.perFoot + g.bonus + g.extra;
              // Half the thrust gone: from here it flies at an airliner's speed, not the height's.
              g.speed = g.mode === 'jet' ? groundSpeed(g) : GAME.failSpeed;
              // The blast itself: a violent roll toward the dead engine, and the nose knocked down.
              g.rollRate = g.failed * 60;
              g.pitch -= 5;
              calls.current.onFailure(g.failed, cause, false);
            } else {
              // The other one: a kick the other way, the nose down again, and no thrust left at all.
              g.both = true;
              g.bothAt = now;
              g.rollRate -= g.failed * 35;
              g.pitch -= 3;
              calls.current.onFailure(g.failed === -1 ? 1 : -1, cause, true);
            }
          }
        }
      }

      /* The UFO: where it is on the flight's own clock, the slow motion
         around the moment it hits, and the hit itself. */
      if (live) {
        const aerial = stepAerial(g, flyDt, travel(g).speed);
        if (aerial.blimpCollision || aerial.missileHits.length) calls.current.onAerialEvent?.(aerial);
      }
      const u = g.ufo;
      if (live) {
        g.clock += dt;
        if (u && Number.isFinite(u.hitAt)) g.slow = slowAt(u, g.clock);
        /* As the slow motion begins it locks on: from here it is coming for
           where the wingtip was going, and the aeroplane has the time it
           needs to be somewhere else. */
        if (u?.strike && !g.dodgeLock && !g.ufoMiss && g.clock >= u.hitAt - UFO.slowBefore) {
          g.dodgeLock = { alt: g.alt, heading: g.heading, bank: g.bank, lateral: 0 };
          calls.current.onUfoWarn();
        }
        if (g.dodgeLock) {
          const off = ((g.heading - g.dodgeLock.heading + 540) % 360) - 180;
          g.dodgeLock.lateral += groundSpeed(g) * Math.sin((off * Math.PI) / 180) * flyDt;
        }
        if (u?.strike && g.dodgeLock && g.clock >= u.hitAt) {
          const d = dodge(g.dodgeLock, u.strike, g.alt, g.bank);
          g.ufoMiss = { right: d.right, up: d.up };
          g.dodgeLock = null;
          if (d.miss < UFO.hitRadius) {
            g.wingLost = u.strike;
            // The blow: a lurch toward the short side, and the nose knocked down.
            g.rollRate += g.wingLost * 70;
            g.bank += g.wingLost * 8;
            g.pitch -= 3;
            calls.current.onStrike(g.wingLost);
          } else {
            g.dodged = true;
            g.extra += UFO.dodgeBonus;
            if (g.failed) g.score += UFO.dodgeBonus;
            calls.current.onDodge();
          }
        }
      }

      /* Its music, as it blinks into being — and if it comes for the wing,
         faded to nothing in the slow motion, so the moment it arrives is
         silent but for whatever happens next. */
      const tune = sounds.current?.ufo;
      if (tune && u && live) {
        const t = ufoTune.current;
        if (t.plan !== u && g.clock >= u.at) {
          t.plan = u;
          t.gain = 1;
          tune.currentTime = 0;
          tune.volume = UFO_VOLUME;
          void tune.play().catch(() => {});
        }
        if (t.plan === u && u.strike && g.clock >= u.hitAt - UFO.slowBefore && t.gain > 0) {
          t.gain = Math.max(0, t.gain - realDt / 1.0);
          tune.volume = t.gain * UFO_VOLUME;
          if (t.gain === 0) tune.pause();
        }
      }

      /* The wind, rising and falling with the lift: loudest in the middle of
         a thermal, gone outside one — so a pilot can hear the way in. */
      const wind = sounds.current?.wind;
      if (wind) {
        const want = live ? Math.min(1, g.updraft * 1.15) : 0;
        windGain.current += (want - windGain.current) * (1 - Math.exp(-realDt / 0.45));
        const level = windGain.current;
        if (level > 0.02) {
          wind.volume = level * WIND_VOLUME;
          wind.playbackRate = 0.9 + 0.2 * level;
          if (wind.paused) void wind.play().catch(() => {});
        } else if (!wind.paused) {
          wind.pause();
        }
      }

      if (live) {
        stepBoost(g, flyDt);
        const way = travel(g);
        /* The logos: flown through, they pay and put boost back in the tank. */
        const got = stepLogos(g.logos, flyDt, way.speed, way.heading, g.alt, g.vs, w.groundAt() + 45);
        if (got) {
          const points = got * LOGOS.points;
          g.extra += points;
          if (g.failed) g.score += points;
          g.boosts = Math.min(BOOST.charges, g.boosts + got * BOOST.perLogo);
          calls.current.onLogo(g.logos.count);
        }
        /* UFO mode: the airline's own aeroplanes, coming for the saucer. */
        if (g.mode === 'ufo') {
          const h = (way.heading * Math.PI) / 180;
          const ram = stepRams(g.rams, flyDt, { x: way.speed * Math.sin(h), y: g.vs, z: -way.speed * Math.cos(h) }, g.heading);
          if (ram.warn !== null) calls.current.onRamWarn?.(ram.warn);
          if (ram.hit) {
            g.scramble = Math.min(1, g.scramble + RAMMER.scramble);
            // The blow itself: thrown over and knocked down.
            g.bank += ram.hit * -40;
            g.pitch -= 8;
            g.boosts = Math.max(0, g.boosts - 1);
            calls.current.onRamHit?.(ram.hit);
          }
          if (ram.dodged) {
            g.extra += RAMMER.bonus;
            calls.current.onRamDodge?.();
          }
        }
        /* Tornadoes: where they are, and what their wind is doing to it. */
        if (g.weather === 'tornado') {
          const v = stepTwisters(g.twisters, flyDt, way.speed, way.heading, g.agl);
          vortex = v;
          if (v.threaded) {
            const points = v.threaded * TWISTER.bonus;
            g.extra += points;
            if (g.failed) g.score += points;
            calls.current.onThreaded?.();
          }
        }
        /* Thunder, and the shove of a close strike's air. */
        const flash = w.lastFlash();
        if (flash && flash.at !== heardFlash.current) {
          heardFlash.current = flash.at;
          calls.current.onThunder(flash.distance);
          if (flash.distance < 3500) {
            const kick = (Math.random() < 0.5 ? -1 : 1) * (1 - flash.distance / 3500);
            g.gustRoll = clampUnit(g.gustRoll + kick);
            g.gustLift = clampUnit(g.gustLift - Math.abs(kick) * 0.7);
            if (g.failed) g.rollRate += kick * 25;
          }
        }
      }
      if (CAPTURE) captureState.onGameFrame?.(g, realDt);
      const pad = typeof navigator.getGamepads === 'function'
        ? Array.from(navigator.getGamepads()).find((candidate) => candidate?.connected)
        : null;
      const dead = (value: number) => Math.abs(value) < 0.14 ? 0 : value;
      const leftX = dead(pad?.axes[0] ?? 0);
      const leftY = dead(pad?.axes[1] ?? 0);
      const rightX = dead(pad?.axes[2] ?? 0);
      const trigger = pad?.buttons[7]?.pressed ?? false;
      if (trigger && !padButtons.current.fire && fireMissile(g)) calls.current.onMissileFire?.();
      padButtons.current.fire = trigger;
      if (rightX) cameraLook.current.orbit = Math.max(-75, Math.min(75, cameraLook.current.orbit + rightX * 80 * realDt));
      p.orbit = cameraLook.current.orbit;
      const ix = live ? clampUnit(g.keys.x + g.stick.x + leftX) : 0;
      const iy = live ? clampUnit(g.keys.y + g.stick.y - leftY) : 0;
      const step = fly(g, ix, iy, flyDt);
      if (vortex) step.vs = applyVortex(g, vortex, step.vs, flyDt);
      stall = step.stall;
      if (flyDt > 0) g.accel += ((step.vs - g.vs) / flyDt - g.accel) * (1 - Math.exp(-2 * flyDt));
      g.vs = step.vs;
      // The ground under it, as of the last frame.
      const ground = g.alt - g.agl;
      g.alt += step.vs * flyDt;
      /* The top of this world's level: the saucer goes on to the next
         world, arriving a couple of kilometres up; anything else, or a
         saucer over Mars, goes no higher. */
      const top = Math.min(GAME.ceiling, LEVELS[g.level].top);
      const onward = LEVELS[g.level].next;
      if (g.alt - ground >= top) {
        if (live && g.mode === 'ufo' && onward) {
          g.level = onward;
          g.alt = ARRIVE;
          g.agl = ARRIVE;
          calls.current.onLevel?.(onward);
        } else {
          g.alt = ground + top;
        }
      }
      if (live) g.distance += travel(g).speed * flyDt;
      p.chase = 1;
    }

    f.pitch = g.pitch;
    f.bank = g.bank;
    f.heading = g.heading;
    p.height = g.alt;
    p.aerial = g.phase === 'flying' || g.phase === 'intro' ? g.aerial : undefined;
    p.tailDamage = g.tailDamage;
    p.timeScale = g.slow;
    p.thermals = g.phase === 'flying' ? g.air.list : undefined;
    p.logos = g.phase === 'flying' ? g.logos.list : undefined;
    // The world draws a tornado's sky as a storm's; the funnels are its own.
    p.weather = g.weather === 'tornado' ? 'storm' : g.weather;
    p.twisters = g.weather === 'tornado' && g.phase === 'flying' ? g.twisters.list : undefined;
    /* The afterburners: out of whichever engines still run — or, with both
       gone, both, relit for as long as the burn lasts. */
    const burn = g.phase === 'flying' ? g.boostPower : 0;
    const relit = g.failed === 0 || g.both;
    p.boost = g.mode === 'jet' ? [burn, 0]
      : [relit || g.failed !== -1 ? burn : 0, relit || g.failed !== 1 ? burn : 0];
    p.speedScale = undefined;
    p.shake = g.phase === 'flying' ? TURBULENCE[g.weather] * 0.55 + burn * 0.5 + g.scramble * 0.8 : 0;
    /* The flaps, as a crew would set them: a notch for the climb out of the
       dive, out further as the speed bleeds away on a dead engine — lift for
       less airspeed — and all the way in for a burn. */
    const slowing = g.failed ? Math.min(1, Math.max(0, (GAME.stallSpeed + 45 - g.speed) / 40)) : 0;
    const climbing = !g.failed && g.pitch > 6 ? 0.3 : 0;
    p.flaps = g.phase === 'intro'
      ? Math.max(0.35, g.flaps)
      : Math.max(g.flaps * (1 - burn), slowing * 0.85, climbing) * (1 - burn);
    if (g.phase === 'flying' || g.phase === 'intro') {
      if (g.mode === 'ufo') {
        /* The player's own saucer, where the airliner would be: three times
           the scout's size, so it fills the shot the airliner was framed for,
           and tipped the way it is flying — hard into a dash. */
        const d = dashVelocity(g);
        p.ufo = {
          visible: true,
          right: 0,
          up: 0,
          ahead: 0,
          scale: 1,
          size: 3,
          dash: Math.min(1, g.boostPower + Math.abs(Math.sin(g.clock * 2.35)) * 0.18),
          attitude: {
            pitch: g.pitch * 0.6 - (d.ahead / DASH.forward) * 18,
            bank: g.bank * 0.7 + (d.right / DASH.strafe) * 30 + (g.strafe / 220) * 12,
          },
        };
      } else {
        if (g.mode === 'jet') p.ufo = { ...scoutPose(g), strike: undefined };
        else {
          const saucer = ufoAt(g.ufo, g.clock);
          const miss = g.dodgeLock && g.ufo?.strike ? dodge(g.dodgeLock, g.ufo.strike, g.alt, g.bank) : g.ufoMiss;
          p.ufo = miss ? { ...saucer, dev: { right: miss.right, up: miss.up } } : saucer;
        }
      }
    } else {
      p.ufo = undefined;
    }
    /* The airliners coming for the saucer, on the world's axes from it. */
    p.rams = g.mode === 'ufo' && g.phase === 'flying' ? g.rams.list : undefined;
    p.wingLost = g.wingLost;
    p.failed = g.failed;
    p.both = g.both;
    p.struck = (g.causes[0] === 'lightning' ? bit(g.failed) : 0) | (g.both && g.causes[1] === 'lightning' ? bit(-g.failed) : 0);
    p.fury = g.damage;
    /* The ground goes by at the airspeed, not the height's speed, once the
       dive is over: so low down it rushes, and at 10,000 ft it drifts. */
    const way = travel(g);
    p.speed = g.failed || g.phase === 'flying' ? way.speed : undefined;
    p.track = way.heading;
    // The sideslip is the good engine's doing: none once it has gone too.
    p.slip = g.failed ? g.failed * (3 + 4 * g.damage) * g.thrust : 0;
    /* After the blast the camera eases round over the burning engine's
       shoulder and up a little, so the smoke streams away across the frame. */
    // In the slow motion, round to the wing it is coming for, to see it go.
    const side = g.slow < 0.9 && g.ufo?.strike ? g.ufo.strike * 30 : g.failed ? g.failed * 38 : 0;
    p.chaseSide = (p.chaseSide ?? 0) + (side - (p.chaseSide ?? 0)) * (1 - Math.exp(-1.2 * dt));
    p.chaseLift = (p.chaseLift ?? 0) + ((g.failed ? 9 : 0) - (p.chaseLift ?? 0)) * (1 - Math.exp(-1.2 * dt));
    /* The card's picture is read off the canvas straight after a frame, so
       while one is still to be taken — the engine has gone, or the ground is
       close — every frame is drawn rather than paced (see WorldScene). */
    p.mustDraw = !shot.current && (g.failed !== 0 || (g.phase === 'flying' && g.agl < 400));
    p.globe = globeRadius(Math.max(0, g.agl));
    w.render(f, skyState, bandAt(g.level, g.agl), p);

    if (g.mode === 'jet') {
      const a = g.aerial;
      if (a.target) a.target = aerialTargets(g).find(target => target.id === a.target?.id) ?? null;
      const locked = a.lock >= 1 && !!a.target;
      const ammo = a.ammo.filter(Boolean).length;
      if (hud.targetName.current) hud.targetName.current.textContent = a.target?.name ?? 'Find a target';
      if (hud.targetLock.current) hud.targetLock.current.textContent = locked ? 'LOCKED' : a.target ? `LOCK ${Math.round(a.lock * 100)}%` : 'Scan ahead';
      if (hud.ammo.current) hud.ammo.current.textContent = `${ammo} / 2`;
      if (hud.fire.current) {
        hud.fire.current.disabled = g.phase !== 'flying' || !locked || ammo === 0 || a.cooldown > 0;
        hud.fire.current.setAttribute('aria-label', ammo === 0 ? 'Missiles spent' : locked ? `Fire missile at ${a.target?.name}` : 'Acquire a target to fire a missile');
      }
      const marker = hud.targetReticle.current;
      if (marker) {
        const screen = a.target ? w.targetOnScreen(a.target) : null;
        marker.hidden = !screen?.visible;
        marker.classList.toggle('is-locked', locked);
        if (screen) { marker.style.left = `${screen.x * 100}%`; marker.style.top = `${screen.y * 100}%`; }
      }
      const aim = hud.targetAim.current;
      if (aim) {
        const nose = noseDirection(g);
        const screen = w.targetOnScreen({ x: nose.x * 2000, y: g.alt + nose.y * 2000, z: nose.z * 2000 });
        aim.hidden = !screen.visible;
        aim.style.left = `${screen.x * 100}%`; aim.style.top = `${screen.y * 100}%`;
      }
      const mach = groundSpeed(g) / soundSpeed(g.alt);
      if (hud.mach.current) {
        hud.mach.current.textContent = `MACH ${Math.min(1, mach).toFixed(2)}`;
        hud.mach.current.classList.toggle('is-sonic', mach >= 0.995);
      }
      if (mach >= 0.995 && !machReached.current) { machReached.current = true; calls.current.onMach?.(); }
      if (g.boost === 0 && mach < 0.85) machReached.current = false;
    }

    /* The picture for the card, straight after the frame it is of: the
       fireball at its biggest, or the bolt at its brightest. */
    if (g.failed && !shot.current && canvasRef.current
      && (now - g.failedAt) / 1000 >= (g.causes[0] === 'lightning' ? 0.1 : 0.42)) {
      shot.current = grab(canvasRef.current, w.planeOnScreen());
    }

    const agl = g.alt - w.groundAt();
    g.agl = agl;
    /* No clock: the flight is over when it meets the ground. */
    if (g.phase === 'flying' && agl < GAME.clearance) {
      // Down before anything went: the picture is of this.
      if (!shot.current && canvasRef.current) shot.current = grab(canvasRef.current, w.planeOnScreen());
      g.phase = 'crashed';
      g.phaseAt = now;
      sounds.current?.crowd.pause();
      sounds.current?.ufo.pause();
      sounds.current?.wind.pause();
      calls.current.onCrash(g.distance);
      return;
    }
    if (g.phase === 'flying') {
      syncCrowd(g, impactIn(g, w.groundAt), dt);
      /* The score: height before the engine goes; after, time in the air,
         paid more for wings kept level and for flying low. */
      const ft = climbed(g.level, agl) * FEET;
      if (!g.failed) {
        g.bestFeet = Math.max(g.bestFeet, ft);
        g.score = g.bestFeet * SCORING.perFoot + g.extra;
        g.rate = 0;
      } else {
        const rate = survivalRate(g.bank, ft, g.updraft > 0.2);
        g.rate = rate / SCORING.perSecond;
        g.score += rate * dt;
      }
      const points = Math.round(g.score);
      if (points !== shown.current.score && hud.score.current) {
        shown.current.score = points;
        hud.score.current.textContent = points.toLocaleString('en-US');
      }
      if (g.rate !== shown.current.rate && hud.rate.current) {
        shown.current.rate = g.rate;
        const el = hud.rate.current;
        el.textContent = g.rate ? `×${g.rate}` : '';
        el.classList.toggle('is-level', g.rate === 1.5 || g.rate === 2.5);
        el.classList.toggle('is-low', g.rate >= 2);
      }
    }
    // The readouts, written straight to the page: no React render a frame.
    /* The bar: the climb to the blast altitude — or, on the saucer, to the next world or band. */
    const mark = g.mode === 'ufo' ? nextMark(g.level, agl) : null;
    if (g.mode === 'ufo' && hud.bar.current) {
      hud.bar.current.style.transform = `scaleX(${mark ? Math.min(1, Math.max(0, (agl - mark.from) / (mark.at - mark.from))) : 1})`;
    } else if (!g.failed && hud.bar.current) {
      hud.bar.current.style.transform = `scaleX(${Math.min(1, Math.max(0, agl / g.blastAlt))})`;
    }
    const markName = mark?.name ?? (g.mode === 'ufo' ? 'Mars' : null);
    if (markName !== markShown.current) {
      markShown.current = markName;
      if (markName) calls.current.onMark?.(markName);
    }
    const feet = Math.max(0, Math.round((climbed(g.level, agl) * FEET) / 10) * 10);
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
    const inVortex = g.phase === 'flying' && g.weather === 'tornado' && twisterWind(g) > 0.35;
    if (inVortex !== shown.current.vortex && hud.vortex.current) {
      shown.current.vortex = inVortex;
      hud.vortex.current.classList.toggle('is-on', inVortex);
    }
    const stalling = g.phase === 'flying' && stall > 0.5 && !warn && !inVortex;
    if (stalling !== shown.current.stall && hud.stall.current) {
      shown.current.stall = stalling;
      hud.stall.current.classList.toggle('is-on', stalling);
    }

    /* The instruments: the airspeed the ground goes by at. */
    const ufoDials = g.mode === 'ufo';
    const kt = Math.round(way.speed * KNOTS);
    if (kt !== shown.current.kt) {
      shown.current.kt = kt;
      hud.speedNeedle.current?.setAttribute('transform', `rotate(${(ufoDials ? ufoSpeedAngle(kt) : speedAngle(kt, g.mode === 'jet' ? 800 : 400)).toFixed(1)} 50 50)`);
      if (hud.speedText.current) hud.speedText.current.textContent = String(kt);
    }
    const fpm = Math.round((g.vs * FPM) / 50) * 50;
    if (fpm !== shown.current.fpm) {
      shown.current.fpm = fpm;
      hud.varioNeedle.current?.setAttribute('transform', `rotate(${(ufoDials ? ufoLiftAngle(fpm) : varioAngle(fpm)).toFixed(1)} 50 50)`);
      if (hud.varioText.current) {
        hud.varioText.current.textContent = `${fpm > 0 ? '+' : fpm < 0 ? '−' : ''}${(Math.abs(fpm) / 1000).toFixed(1)}`;
      }
    }
    hud.horizon.current?.setAttribute(
      'transform',
      `rotate(${(-g.bank).toFixed(1)} 50 50) translate(0 ${(Math.max(-30, Math.min(30, g.pitch)) * 1.3).toFixed(1)})`,
    );
    const lifting = g.phase === 'flying' && g.updraft > 0.2;
    if (lifting !== shown.current.lift && hud.lift.current) {
      shown.current.lift = lifting;
      hud.lift.current.classList.toggle('is-on', lifting);
    }
    /* The boost button: the tank, and whether a burn is going. */
    const charge = Math.round(g.boosts * 20) / 20;
    const btn = hud.boost.current;
    if (btn && charge !== shown.current.charge) {
      shown.current.charge = charge;
      btn.style.setProperty('--charge', String(charge / BOOST.charges));
      btn.dataset.ready = String(Math.floor(g.boosts));
      btn.classList.toggle('is-empty', g.boosts < 1);
    }
    const burning = g.boost > 0;
    if (btn && burning !== shown.current.burning) {
      shown.current.burning = burning;
      btn.classList.toggle('is-burning', burning);
    }
  }, controls);

  return <canvas ref={canvasRef} className="sa-landing__canvas" aria-hidden />;
};

export default LandingScene;
