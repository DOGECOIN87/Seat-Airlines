import { useEffect, useRef, useState } from 'react';
import { createWorld, type ViewPose, type WorldHandles } from '../three/WorldScene';
import type { FlightFeed, FlightTick } from '../lib/flightFeed';
import type { Annunciators, BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import FlightDeck from './FlightDeck';

/**
 * The flight deck, rendered: the captain's seat, in the same aeroplane and
 * the same world as every cabin.
 *
 * The room is `three/flightDeck.ts`; `WorldScene` puts it in the nose and the
 * camera in the left seat when the pose has no seat index. This keeps its
 * screens fed — market cap, the 5m change, souls on board and the cabin signs
 * — and lets the viewer look round the deck by dragging. Without WebGL it
 * falls back to the drawing, which reads the same numbers.
 */

interface FlightDeck3DProps {
  feed: FlightFeed;
  lamps: Annunciators;
  sky: SkyState;
  band: BandState;
  /** Hand-flying, if anybody is. The horizon out of the glass goes over with it. */
  controls?: ManualControls;
}

const FlightDeck3D = ({ feed, lamps, sky, band, controls = HANDS_OFF }: FlightDeck3DProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandles | null>(null);
  const [noGl, setNoGl] = useState(false);
  const pose = useRef<ViewPose>({ seatIndex: null, row: 1, yaw: 0, pitch: 0, id: 'CPT' });
  const drag = useRef({ active: false, x: 0, y: 0 });
  const latest = useRef({ sky, band, lamps, tick: null as FlightTick | null });
  latest.current = { ...latest.current, sky, band, lamps };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: WorldHandles;
    try {
      handles = createWorld(canvas);
    } catch {
      setNoGl(true);
      return;
    }
    world.current = handles;
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
    world.current?.setControls(controls);
  }, [controls]);

  /* The signs change with the market, not with the frame, so they are pushed
     when they change rather than every time the tapes move. */
  const push = () => {
    const { tick, lamps: l } = latest.current;
    world.current?.setDeckReadout({
      marketCap: tick?.marketCap ?? 0,
      change5m: tick?.change5m ?? 0,
      holders: tick?.holders ?? 0,
      lamps: l,
    });
  };
  useEffect(push, [lamps]);

  useAttitude(feed, (a, tick) => {
    if (tick && tick !== latest.current.tick) {
      latest.current.tick = tick;
      push();
    }
    world.current?.render(a, latest.current.sky, latest.current.band, pose.current);
  }, controls);

  if (noGl) return <FlightDeck feed={feed} lamps={lamps} sky={sky} band={band} controls={controls} />;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { active: true, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const p = pose.current;
    p.yaw = Math.max(-80, Math.min(80, p.yaw - (e.clientX - drag.current.x) * 0.25));
    p.pitch = Math.max(-25, Math.min(25, (p.pitch ?? 0) + (e.clientY - drag.current.y) * -0.2));
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <div
      className="sd-view sd-frame sa-flightdeck relative w-full cursor-grab overflow-hidden bg-[#05070F] active:cursor-grabbing"
      role="img"
      aria-label="The flight deck of SA350, from the captain's seat: the windshield onto the real sky, the glareshield, both pilots' flight and navigation displays, the overhead panel and the throttles. Every reading is driven by the token's 5-minute change, and the values are published as text below. Drag to look around."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <p className="pointer-events-none absolute bottom-3 left-3 border border-white/12 bg-[#05070F]/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-seat-amber backdrop-blur-sm sm:bottom-4 sm:left-4">
        CPT · Flight deck
      </p>
      <p className="pointer-events-none absolute bottom-3 right-3 hidden text-[11px] uppercase tracking-[0.18em] text-white/45 min-[420px]:block sm:bottom-4 sm:right-4">
        Drag to look
      </p>
    </div>
  );
};

export default FlightDeck3D;
