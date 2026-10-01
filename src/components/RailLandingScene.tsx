import { useEffect, useRef } from 'react';
import { createRailWorld, type RailHandles } from '../three/RailWorld';
import type { ViewPose } from '../three/WorldScene';
import type { FlightFeed } from '../lib/flightFeed';
import type { BandState } from '../lib/flightModel';
import type { SkyState } from '../lib/sky';
import { useAttitude } from '../lib/useAttitude';
import { HANDS_OFF, type ManualControls } from '../lib/manualControls';

/**
 * The landing page's train: the exterior scene, full screen, at rest.
 *
 * Its own chunk, because it brings three.js with it. The camera drifts
 * slowly round the front of the train, so the length of it — the market
 * cap, a carriage per milestone — comes into view and goes again; and the
 * train sits up and to the right of the words laid over it.
 */
interface RailLandingSceneProps {
  feed: FlightFeed;
  sky: SkyState;
  band: BandState;
  taken: ReadonlySet<string>;
  controls?: ManualControls;
  onReady: () => void;
  onFail: () => void;
}

const RailLandingScene = ({ feed, sky, band, taken, controls = HANDS_OFF, onReady, onFail }: RailLandingSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<RailHandles | null>(null);
  const latest = useRef({ sky, band });
  latest.current = { sky, band };
  const calls = useRef({ onReady, onFail });
  calls.current = { onReady, onFail };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handles: RailHandles;
    try {
      handles = createRailWorld(canvas);
    } catch {
      calls.current.onFail();
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

  const pose = useRef<ViewPose>({ seatIndex: 0, row: 1, yaw: 0, id: '1A', exterior: true, orbit: 0 });
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useAttitude(feed, (a, tick) => {
    if (tick) world.current?.setMarket(tick.marketCap, tick.change5m);
    const p = pose.current;
    const wide = window.innerWidth > window.innerHeight * 1.15;
    p.frame = wide ? { x: 0.12, y: 0.14 } : { x: 0, y: 0.2 };
    // A slow drift from the nose round toward the flank, and back.
    p.orbit = still ? 0 : Math.sin(performance.now() / 26000) * 34 + 6;
    world.current?.render(a, latest.current.sky, latest.current.band, p);
  }, controls);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />;
};

export default RailLandingScene;
