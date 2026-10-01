import { useEffect, useRef, useState } from 'react';
import type { ViewPose } from '../three/WorldScene';
import { createRailWorld, type RailHandles } from '../three/RailWorld';
import { carriagesFor, nextCarriageAt } from '../lib/consist';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import { formatCap, formatChange } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import type { CabinSeat } from '../content/cabin';
import Mark from './Mark';

/**
 * The whole train, from outside.
 *
 * One train, everyone on it, running through country that never repeats
 * (see three/RailWorld.ts). The market cap is the train's length — a
 * carriage for every 1-2-5 step from $10K — and the world it runs through;
 * the five-minute move is the grade the line ahead is laid at, so the track
 * behind it is the chart. Lit carriages are booked seats, front first, and
 * the billboards by the line carry the holders' adverts.
 */

interface ExteriorViewProps {
  feed: FlightFeed;
  sky: SkyState;
  band: BandState;
  taken: ReadonlySet<string>;
  /** The seat on the boarding pass, if one has been claimed. */
  claimed: CabinSeat | null;
  /** Where the walk-through camera is standing. */
  viewing: CabinSeat | null;
  /** Hand-flying, if anybody is. Left out, the aeroplane flies the market. */
  controls?: ManualControls;
  /** The holders' adverts, by seat, for the billboards along the line. */
  adverts?: Readonly<Record<string, string>>;
}

const NO_ADVERTS: Readonly<Record<string, string>> = {};

const ExteriorView = ({ feed, sky, band, taken, claimed, viewing, controls = HANDS_OFF, adverts = NO_ADVERTS }: ExteriorViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<RailHandles | null>(null);
  const carsRead = useRef<HTMLSpanElement>(null);
  const nextRead = useRef<HTMLSpanElement>(null);
  const capRead = useRef<HTMLSpanElement>(null);
  const chgRead = useRef<HTMLSpanElement>(null);
  const latest = useRef({ sky, band });
  latest.current = { sky, band };

  /** Dragging swings the camera around the aeroplane. */
  const orbit = useRef({ angle: 0, active: false, x: 0 });
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: RailHandles;
    try {
      handles = createRailWorld(canvas);
    } catch {
      setWebgl(false);
      return;
    }
    world.current = handles;
    // Dev only: the scene's odometer, so a headless test can prove the world
    // is actually going past without trying to read pixels off SwiftShader.
    if (import.meta.env.DEV) {
      (window as unknown as { __saTravelled?: () => number }).__saTravelled = handles.travelled;
    }
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      handles.resize(Math.max(1, r.width), Math.max(1, r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      handles.dispose();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setOccupancy(taken);
  }, [taken]);

  useEffect(() => {
    world.current?.setAdverts(adverts);
  }, [adverts]);

  /* Pushed in on change rather than on every frame: the scene holds it, eases
     toward it, and nothing here re-renders to make an aeroplane roll. */
  useEffect(() => {
    world.current?.setControls(controls);
  }, [controls]);

  const pose = useRef<ViewPose>({ seatIndex: 0, row: 1, yaw: 0, id: '1A', exterior: true, orbit: 0 });

  /* The turntable, advanced on the frame loop that is already running rather
     than on a timer of its own. Held in a ref so changing the rate does not
     restart the loop — and read through one, so the closure below is not
     rebuilt on every render either. */
  const spin = useRef(controls.spin);
  spin.current = controls.spin;
  const spunAt = useRef(0);

  useAttitude(feed, (a, tick) => {
    if (spin.current && !orbit.current.active) {
      const now = performance.now();
      // Bounded, so a tab left in the background does not come back to an
      // aeroplane that has whipped round forty times in one frame.
      const dt = Math.min(0.1, spunAt.current ? (now - spunAt.current) / 1000 : 0);
      spunAt.current = now;
      orbit.current.angle = (orbit.current.angle + spin.current * dt) % 360;
    } else {
      spunAt.current = 0;
    }
    pose.current.orbit = orbit.current.angle;
    world.current?.render(a, latest.current.sky, latest.current.band, pose.current);
    if (tick) {
      world.current?.setMarket(tick.marketCap, tick.change5m);
      if (carsRead.current) carsRead.current.textContent = String(carriagesFor(tick.marketCap));
      if (nextRead.current) {
        const next = nextCarriageAt(tick.marketCap);
        nextRead.current.textContent = next ? formatCap(next) : 'Full';
      }
      if (capRead.current) capRead.current.textContent = formatCap(tick.marketCap);
      if (chgRead.current) {
        chgRead.current.textContent = formatChange(tick.change5m);
        chgRead.current.style.color = tick.change5m >= 0 ? '#5BE86B' : '#FF5B4E';
      }
    }
  }, controls);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    orbit.current.active = true;
    orbit.current.x = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!orbit.current.active) return;
    orbit.current.angle += (e.clientX - orbit.current.x) * 0.3;
    orbit.current.x = e.clientX;
  };
  const endDrag = () => {
    orbit.current.active = false;
  };

  return (
    <div
      className="sd-view sd-frame sd-frame--wide relative w-full cursor-grab overflow-hidden active:cursor-grabbing"
      role="img"
      aria-label={`The SEAT RAILWAY train SR350 from outside, ${band.label.toLowerCase()}. Each carriage is a market-cap milestone, and lit carriages carry booked seats${
        claimed ? `; seat ${claimed.id} is yours` : ''
      }. Drag to walk around the train.`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Scrims: the overlay has to stay readable whether it is over a bright
          cloud top or a night ground, and dimming the whole frame to manage
          that would be worse than the problem. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: 'linear-gradient(180deg, rgba(4,7,14,0.62) 0%, rgba(4,7,14,0) 100%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(0deg, rgba(4,7,14,0.66) 0%, rgba(4,7,14,0) 100%)' }}
      />

      {!webgl && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-blue-100/60">
          WebGL is off in this browser. Readings are below.
        </p>
      )}

      {/* ── Aircraft plate ──────────────────────────────────────────────
          Identity, not a headline. The page's own headline is directly above
          this frame, and repeating it inside the frame said the same thing
          twice in two type sizes. What belongs here is what an aviation
          photograph is captioned with: which aeroplane, and who is on it. */}
      <div className="sd-plate pointer-events-none">
        <Mark size={22} />
        <span className="font-heading text-[15px] leading-none tracking-normal text-white/90">SR350</span>
        <span aria-hidden className="hidden h-3.5 w-px bg-white/25 md:block" />
        <span className="hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 md:inline">
          Souls on board <span className="tabular-nums text-white/80">{taken.size}</span>
        </span>
      </div>

      {/* ── Readout ──────────────────────────────────────────────────
          Both halves share one bottom row rather than being anchored to
          opposite corners. Anchored, they overlapped on a phone — the frame
          is simply not wide enough to hold the telemetry and the camera note
          side by side, and two absolutely positioned blocks have no way to
          find that out. In one wrapping row they stack instead.

          The two figures are a pair: labels on one line, figures the same
          size on the next. The level is not repeated here — the badge at the
          top says it — and under 480px the figures give the picture back
          altogether, since the gate sign just above says both. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
        <div className="hidden items-start gap-5 rounded-xl border border-white/12 bg-[#05070F]/75 px-3 py-2 backdrop-blur-sm min-[480px]:flex sm:gap-6 sm:px-4 sm:py-2.5">
          <div>
            <p className="whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-white/45">Market cap</p>
            <p className="mt-1.5 font-mono text-lg leading-none text-white sm:text-xl">
              <span ref={capRead} />
            </p>
          </div>
          <div>
            <p className="whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-white/45">Carriages</p>
            <p className="mt-1.5 font-mono text-lg leading-none text-white sm:text-xl">
              <span ref={carsRead} />
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-white/45">Next at</p>
            <p className="mt-1.5 font-mono text-lg leading-none text-[#00C9F1] sm:text-xl">
              <span ref={nextRead} />
            </p>
          </div>
          <div>
            <p className="whitespace-nowrap font-mono text-[11px] uppercase leading-none tracking-[0.16em] text-white/45">5m</p>
            <p className="mt-1.5 font-mono text-lg leading-none sm:text-xl">
              <span ref={chgRead} />
            </p>
          </div>
        </div>

        {/* Where your seat is, in words — the drawn view is aria-hidden. */}
        <div className="ml-auto text-right">
          {claimed && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00C9F1]">Your seat · {claimed.id}</p>
          )}
          {viewing && viewing.id !== claimed?.id && (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              Camera · {viewing.id}
            </p>
          )}
          <p className="mt-1 hidden font-mono text-[11px] uppercase tracking-[0.2em] text-white/35 sm:block">
            Drag to walk around
          </p>
        </div>
      </div>

    </div>
  );
};

export default ExteriorView;
