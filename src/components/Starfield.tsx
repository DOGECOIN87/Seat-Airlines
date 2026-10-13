import { useEffect, useRef } from 'react';

/**
 * The splash's night, flying past: stars streaming out of a point ahead of
 * the aeroplane, behind the departure board, the way they would through the
 * flight deck's windows.
 *
 * Each star has a place across the sky and a distance ahead. Every frame it
 * comes nearer, so its place on the screen runs outward from the vanishing
 * point and quickens as it does; a streak back to where it was a moment ago
 * gives it its speed, short and faint far off and long and bright close by.
 * One that passes the edge of the screen, or the aeroplane, starts again
 * far ahead. The field is as dense on a phone as on a wide screen: the
 * number of stars follows the screen's area.
 *
 * A canvas rather than CSS, because a field of stars that never repeats is
 * a few hundred points of arithmetic and nothing else. It stops in a hidden
 * tab and when the splash goes. Anybody who has asked for less motion — a
 * phone with Reduce Motion on, as many are — still flies, but at a drift:
 * a sixth of the speed and no streaks, the sense of going forward without
 * the rush.
 */

/** Stars per square pixel of screen, and the fewest and most there are. */
const DENSITY = 1 / 1800;
const FEWEST = 260;
const MOST = 900;
/** How much nearer every star comes in a second, as a share of the farthest. */
const SPEED = 0.42;
/** The first moments ease up to speed, rather than starting at a rush. */
const SPOOL = 0.5;
/** How far back a star's streak reaches, as distance ahead. */
const TRAIL = 0.035;
/** With reduced motion: the share of the speed kept, and no streaks. */
const DRIFT = 1 / 6;
/** Where ahead is: the middle of the screen, a little above centre, behind the board. */
const AHEAD = { x: 0.5, y: 0.45 };
/** Nearest a star comes before it is behind us. */
const NEAR = 0.04;

interface Star {
  x: number;
  y: number;
  z: number;
  tint: string;
  bright: number;
}

const ahead = (anywhere: boolean): Star => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z: anywhere ? NEAR + Math.random() * (1 - NEAR) : 1,
  tint: Math.random() < 0.3 ? '205, 235, 255' : '255, 255, 255',
  bright: 0.6 + Math.random() * 0.4,
});

export default function Starfield({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars: Star[] = [];
    let width = 0;
    let height = 0;
    /* How far the streaks reach: none until the field is moving. */
    let trail = 0;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(MOST, Math.max(FEWEST, width * height * DENSITY)));
      while (stars.length < count) stars.push(ahead(true));
      stars.length = count;
    };

    const draw = (advance: number) => {
      const cx = width * AHEAD.x;
      const cy = height * AHEAD.y;
      /* How far out a star at the far plane sits: the field already reaches
         past the board when stars are far off, and fills the screen as they
         come in. */
      const spread = Math.max(width, height) * 0.5;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      for (let i = 0; i < stars.length; i++) {
        let star = stars[i];
        star.z -= advance;
        let x = cx + (star.x / star.z) * spread;
        let y = cy + (star.y / star.z) * spread;
        if (star.z <= NEAR || x < -20 || x > width + 20 || y < -20 || y > height + 20) {
          star = stars[i] = ahead(false);
          x = cx + (star.x / star.z) * spread;
          y = cy + (star.y / star.z) * spread;
        }
        /* Far stars are faint and fine, and fade in rather than appearing. */
        const near = 1 - star.z;
        const alpha = Math.min(1, 0.15 + near * 2.2) * star.bright;
        /* The streak: back to where the star was a moment ago. */
        const back = Math.min(1, star.z + trail * (0.4 + near));
        const fromX = cx + (star.x / back) * spread;
        const fromY = cy + (star.y / back) * spread;
        ctx.strokeStyle = `rgba(${star.tint}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.7 + near * 2.1;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(x + 0.01, y + 0.01);
        ctx.stroke();
      }
    };

    size();
    const observer = 'ResizeObserver' in window ? new ResizeObserver(size) : null;
    observer?.observe(canvas);

    let frame = 0;
    let last = 0;
    let flown = 0;
    const tick = (now: number) => {
      /* A long gap — a hidden tab coming back — is not a lurch forward. */
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      flown += dt;
      const spool = Math.min(1, flown / SPOOL);
      const ease = spool * spool * (3 - 2 * spool);
      trail = still ? 0 : TRAIL * ease;
      draw(SPEED * (still ? DRIFT : 1) * dt * ease);
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
