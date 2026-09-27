import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { bandHeight, createWorld, type ViewPose, type WorldHandles } from '../three/WorldScene';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude, type Attitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import { clampUnit, GAME, speedAt, type FlightGame } from '../lib/landingGame';

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
 */

export interface LandingHud {
  timer: RefObject<HTMLSpanElement | null>;
  bar: RefObject<HTMLSpanElement | null>;
  alt: RefObject<HTMLSpanElement | null>;
  warn: RefObject<HTMLParagraphElement | null>;
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
  /** The scene is drawing; the controls can be offered. */
  onReady: () => void;
  /** It will not draw here: no WebGL. */
  onFail: () => void;
  /** The dive is over and the controls are the player's. */
  onFlying: () => void;
  /** The minute is up, or the aeroplane is down. */
  onEnd: (why: 'crash' | 'time', metres: number) => void;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

const LandingScene = ({ feed, sky, band, controls, taken, playing, game, hud, onReady, onFail, onFlying, onEnd }: LandingSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandles | null>(null);
  const latest = useRef({ sky, band });
  latest.current = { sky, band };
  const calls = useRef({ onReady, onFail, onFlying, onEnd });
  calls.current = { onReady, onFail, onFlying, onEnd };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: WorldHandles;
    try {
      handles = createWorld(canvas);
    } catch {
      calls.current.onFail();
      return;
    }
    world.current = handles;
    // Dev only: the game and the ground under it, for the headless checks,
    // which run far too slowly to fly into a hill for real.
    if (import.meta.env.DEV) {
      Object.assign(window, { __saGame: game.current, __saGround: handles.groundAt });
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
  const shown = useRef({ second: -1, feet: -1, warn: false });

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
        calls.current.onFlying();
      }
    } else {
      /* Flying, or flying on once the minute is up with the stick let go. */
      const live = g.phase === 'flying';
      const ix = live ? clampUnit(g.keys.x + g.stick.x) : 0;
      const iy = live ? clampUnit(g.keys.y + g.stick.y) : 0;
      g.pitch += (iy * GAME.maxPitch - g.pitch) * (1 - Math.exp(-3.2 * dt));
      // At the ceiling the nose will not come up any further.
      if (g.alt >= GAME.ceiling && g.pitch > 0) g.pitch *= 1 - Math.min(1, dt * 6);
      g.bank += (ix * GAME.maxBank - g.bank) * (1 - Math.exp(-3.5 * dt));
      g.heading = (g.heading + g.bank * GAME.turnRate * dt + 360) % 360;
      const speed = speedAt(g.alt);
      const vs = Math.sin((g.pitch * Math.PI) / 180) * speed * GAME.climbGain;
      g.alt = Math.min(GAME.ceiling, g.alt + vs * dt);
      if (live) g.distance += speed * dt;
      p.chase = 1;
    }

    f.pitch = g.pitch;
    f.bank = g.bank;
    f.heading = g.heading;
    p.height = g.alt;
    w.render(f, skyState, lowRef.current, p);

    const agl = g.alt - w.groundAt();
    if (g.phase === 'flying') {
      const left = GAME.seconds - (now - g.phaseAt) / 1000;
      if (agl < GAME.clearance) {
        g.phase = 'crashed';
        g.phaseAt = now;
        calls.current.onEnd('crash', g.distance);
        return;
      }
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
  }, controls);

  return <canvas ref={canvasRef} className="sa-landing__canvas" aria-hidden />;
};

export default LandingScene;
