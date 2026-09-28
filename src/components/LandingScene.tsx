import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { bandHeight, createWorld, type ViewPose, type WorldHandles } from '../three/WorldScene';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude, type Attitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import { airspeedAt, clampUnit, dealFailures, FEET, fly, GAME, leadFor, speedAt, WASTED_AT, type Cause, type FlightGame } from '../lib/landingGame';
import { climbBonus, SCORING, survivalRate } from '../lib/scoring';
import { FPM, KNOTS, speedAngle, varioAngle } from '../lib/instruments';

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
}


/** The sound effects, made on the gesture that started the game so they are allowed to play. */
export interface LandingSounds {
  blast: HTMLAudioElement;
  lightning: HTMLAudioElement;
  wasted: HTMLAudioElement;
  crowd: HTMLAudioElement;
}

/**
 * A picture of the moment the engine went — the fireball, or the bolt — or,
 * failing that, of the crash: 1200 by 630, for the card a score is shared on.
 */
export const SHOT = { width: 1200, height: 630 } as const;

/** The crowd plays under everything else: its own recording is already well below the other two. */
const CROWD_VOLUME = 0.9;

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
  /** The aeroplane is down. */
  onCrash: (metres: number) => void;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
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
  feed, sky, band, controls, taken, playing, game, hud, sounds, shot, onReady, onFail, onFlying, onFailure, onCrash,
}: LandingSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandles | null>(null);
  const latest = useRef({ sky, band });
  latest.current = { sky, band };
  const calls = useRef({ onReady, onFail, onFlying, onFailure, onCrash });
  calls.current = { onReady, onFail, onFlying, onFailure, onCrash };

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
  const shown = useRef({ feet: -1, warn: false, stall: false, score: -1, rate: -1, kt: -1, fpm: NaN, lift: false });
  const crowd = useRef({ on: false, gain: 0 });

  /* The crowd: a recording of a cabin screaming that cuts off at a precise
     point, and that point has to be the impact. Nobody can know when that
     will be, so it is predicted every frame (see impactIn), and the clip
     started as far into itself as puts its cut-off on the prediction. While
     it plays it is kept on it: a little faster or slower as the ground comes
     sooner or later — pitch held, so it is never audible — and a jump only
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
    if (clip.ended) {
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
    // Game time: the clock's, or less of it in slow motion.
    const dt = Math.min(0.1, g.last ? (now - g.last) / 1000 : 0) * g.slow;
    g.last = now;
    const { sky: skyState, band: bandState } = latest.current;
    const p = pose.current;

    if (g.phase === 'crashed') {
      /* Down. The world stops where it is — the smoke hanging, the flames
         still — and only the camera moves: as WASTED lands it makes a slow
         dolly zoom, backing away while the lens closes in, so the aeroplane
         holds its size and the ground behind it looms. */
      const since = (now - g.phaseAt) / 1000 - WASTED_AT;
      p.freeze = true;
      p.dolly = smooth(Math.min(1, Math.max(0, since / 2.8)));
      w.render(flown.current, skyState, lowRef.current, p);
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
        shot.current = null;
        calls.current.onFlying();
      }
    } else {
      const live = g.phase === 'flying';

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
          : g.agl + Math.max(0, g.vs) * lead >= g.blastAlt;
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
              g.failed = Math.random() < 0.5 ? -1 : 1;
              g.failedAt = now;
              g.damage = 0.5;
              g.decay = 0;
              // Made it: the reach bonus, and the climb bonus for how fast — by the foot.
              g.climbTime = (now - g.phaseAt) / 1000;
              g.bonus = SCORING.reached + climbBonus(g.climbTime, (g.blastAlt * FEET) / GAME.blastFeet);
              g.score = g.bestFeet * SCORING.perFoot + g.bonus;
              // Half the thrust gone: from here it flies at an airliner's speed, not the height's.
              g.speed = GAME.failSpeed;
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

      const ix = live ? clampUnit(g.keys.x + g.stick.x) : 0;
      const iy = live ? clampUnit(g.keys.y + g.stick.y) : 0;
      const step = fly(g, ix, iy, dt);
      stall = step.stall;
      if (dt > 0) g.accel += ((step.vs - g.vs) / dt - g.accel) * (1 - Math.exp(-2 * dt));
      g.vs = step.vs;
      g.alt = Math.min(GAME.ceiling, g.alt + step.vs * dt);
      if (live) g.distance += (g.failed ? g.speed : airspeedAt(g.agl)) * dt;
      p.chase = 1;
    }

    f.pitch = g.pitch;
    f.bank = g.bank;
    f.heading = g.heading;
    p.height = g.alt;
    p.timeScale = g.slow;
    p.failed = g.failed;
    p.both = g.both;
    p.struck = (g.causes[0] === 'lightning' ? bit(g.failed) : 0) | (g.both && g.causes[1] === 'lightning' ? bit(-g.failed) : 0);
    p.fury = g.damage;
    /* The ground goes by at the airspeed, not the height's speed, once the
       dive is over: so low down it rushes, and at 10,000 ft it drifts. */
    p.speed = g.failed ? g.speed : g.phase === 'flying' ? airspeedAt(g.agl) : undefined;
    // The sideslip is the good engine's doing: none once it has gone too.
    p.slip = g.failed ? g.failed * (3 + 4 * g.damage) * g.thrust : 0;
    /* After the blast the camera eases round over the burning engine's
       shoulder and up a little, so the smoke streams away across the frame. */
    const side = g.failed ? g.failed * 38 : 0;
    p.chaseSide = (p.chaseSide ?? 0) + (side - (p.chaseSide ?? 0)) * (1 - Math.exp(-1.2 * dt));
    p.chaseLift = (p.chaseLift ?? 0) + ((g.failed ? 9 : 0) - (p.chaseLift ?? 0)) * (1 - Math.exp(-1.2 * dt));
    w.render(f, skyState, lowRef.current, p);

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
      calls.current.onCrash(g.distance);
      return;
    }
    if (g.phase === 'flying') {
      syncCrowd(g, impactIn(g, w.groundAt), dt);
      /* The score: height before the engine goes; after, time in the air,
         paid more for wings kept level and for flying low. */
      const ft = agl * FEET;
      if (!g.failed) {
        g.bestFeet = Math.max(g.bestFeet, ft);
        g.score = g.bestFeet * SCORING.perFoot;
        g.rate = 0;
      } else {
        const rate = survivalRate(g.bank, ft);
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
    if (!g.failed && hud.bar.current) hud.bar.current.style.transform = `scaleX(${Math.min(1, Math.max(0, agl / g.blastAlt))})`;
    const feet = Math.max(0, Math.round((agl * FEET) / 10) * 10);
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

    /* The instruments: the airspeed the ground goes by at. */
    const kt = Math.round((g.failed ? g.speed : airspeedAt(g.agl)) * KNOTS);
    if (kt !== shown.current.kt) {
      shown.current.kt = kt;
      hud.speedNeedle.current?.setAttribute('transform', `rotate(${speedAngle(kt).toFixed(1)} 50 50)`);
      if (hud.speedText.current) hud.speedText.current.textContent = String(kt);
    }
    const fpm = Math.round((g.vs * FPM) / 50) * 50;
    if (fpm !== shown.current.fpm) {
      shown.current.fpm = fpm;
      hud.varioNeedle.current?.setAttribute('transform', `rotate(${varioAngle(fpm).toFixed(1)} 50 50)`);
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
  }, controls);

  return <canvas ref={canvasRef} className="sa-landing__canvas" aria-hidden />;
};

export default LandingScene;
