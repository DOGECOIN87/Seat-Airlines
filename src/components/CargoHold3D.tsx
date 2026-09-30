import { useEffect, useRef, useState } from 'react';
import { CAPTURE, captureState } from '../capture/flag';
import { createCargoHold, type CargoHoldHandles } from '../three/cargoHold';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import { formatCap } from '../lib/flightModel';
import { useAttitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';
import { CARGO_HOLD } from '../content/cabin';
import CargoHold from './CargoHold';

/**
 * The cargo hold, rendered: a room to stand in rather than a picture of one.
 *
 * The scene is in `three/cargoHold.ts`. This holds its canvas, lets the
 * viewer look around it by dragging, and keeps the stencilled lines the
 * drawing had — the hold's name, how many are riding down here, and the
 * altitude — over the top of it as text. Without WebGL it falls back to the
 * drawing, which says the same things.
 */

/** How cold it is in here, 0–1, by how far from the ground the flight is. */
const frostFor = (band: BandState) =>
  band.band === 'moon' || band.band === 'mars' ? 1 : band.band === 'space' ? 0.72 : band.band === 'above-clouds' ? 0.38 : 0.12;

interface CargoHold3DProps {
  feed: FlightFeed;
  band: BandState;
  /** How many seats are sold, so the hold can say how many rode down here. */
  belowCutoff: number;
  /** Hand-flying, if anybody is. This room is inside the aeroplane. */
  controls?: ManualControls;
}

const CargoHold3D = ({ feed, band, belowCutoff, controls = HANDS_OFF }: CargoHold3DProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hold = useRef<CargoHoldHandles | null>(null);
  const [noGl, setNoGl] = useState(false);
  const look = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef({ active: false, x: 0, y: 0 });
  const capRead = useRef<HTMLSpanElement>(null);
  const frost = frostFor(band);
  const frostRef = useRef(frost);
  frostRef.current = frost;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: CargoHoldHandles;
    try {
      handles = createCargoHold(canvas);
    } catch {
      setNoGl(true);
      return;
    }
    hold.current = handles;
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
      hold.current = null;
    };
  }, []);

  useAttitude(feed, (a, tick) => {
    if (CAPTURE && captureState.yaw !== null) look.current.yaw = captureState.yaw;
    hold.current?.render(a, frostRef.current, look.current, performance.now());
    if (tick && capRead.current) capRead.current.textContent = formatCap(tick.marketCap);
  }, controls);

  if (noGl) return <CargoHold feed={feed} band={band} belowCutoff={belowCutoff} controls={controls} />;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { active: true, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    // A quarter of a degree per pixel, the same as the cabin's.
    look.current.yaw = Math.max(-75, Math.min(75, look.current.yaw + (e.clientX - drag.current.x) * -0.25));
    look.current.pitch = Math.max(-25, Math.min(20, look.current.pitch + (e.clientY - drag.current.y) * -0.2));
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <div
      className="sd-view sd-frame relative w-full cursor-grab overflow-hidden bg-[#07090E] active:cursor-grabbing"
      role="img"
      aria-label={`The cargo hold: unpressurized, below the cabin floor, and the biggest room on the aircraft. ${belowCutoff} passengers are riding below the seat cutoff. Drag to look around.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Stencilled on the bulkhead, as the drawing had it. */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] bg-[#05070C]/65 px-3 py-2 font-mono backdrop-blur-[2px] sm:left-4 sm:top-4 sm:px-4 sm:py-3">
        <p className="text-[15px] tracking-[0.22em] text-[#E8EDF5] sm:text-[20px]">CARGO HOLD</p>
        <p className="mt-1 text-[10px] tracking-[0.14em] text-[#B7C0D0] sm:text-[11px]">
          UNPRESSURIZED · NO SMOKING · {belowCutoff.toLocaleString('en-US')} BELOW THE CUTOFF
        </p>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-right font-mono sm:right-4 sm:top-4">
        <p className="text-[10px] tracking-[0.16em] text-[#3FD8E8]/80 sm:text-[11px]">{band.label.toUpperCase()}</p>
        <p className="mt-1 text-[18px] font-bold text-[#E8EDF5] sm:text-[20px]"><span ref={capRead} /></p>
        {frost > 0.5 && (
          <p className="mt-1 text-[10px] tracking-[0.12em] text-[#BFD8F0]/85 sm:text-[11px]">SKIN TEMPERATURE CRITICAL</p>
        )}
      </div>
      <p className="pointer-events-none absolute bottom-3 right-3 hidden text-[11px] uppercase tracking-[0.18em] text-white/45 min-[420px]:block sm:bottom-4 sm:right-4">
        Drag to look
      </p>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(130% 110% at 50% 45%, transparent 55%, rgba(3,5,10,0.7) 100%)' }}
      />
      <p className="sr-only">{CARGO_HOLD.body}</p>
    </div>
  );
};

export default CargoHold3D;
