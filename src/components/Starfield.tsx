import { useEffect, useRef } from 'react';

/**
 * The splash's night, flying past: stars streaming out of a point ahead of
 * the aeroplane, behind the departure board, the way they would through the
 * flight deck's windows.
 *
 * Each star has a place across the sky and a distance ahead. Every frame it
 * comes nearer, so its place on the screen runs outward from the vanishing
 * point and quickens as it does; a streak from where it was drawn last
 * frame to where it is now gives it its speed. One that passes the edge of
 * the screen, or the aeroplane, starts again far ahead.
 *
 * A canvas rather than CSS, because a field of stars that never repeats is
 * a few hundred points of arithmetic and nothing else. It stops in a hidden
 * tab and when the splash goes, and anybody who has asked for less motion
 * gets the same sky standing still.
 */

const STARS = 240;
/** How much nearer every star comes in a second, as a share of the farthest. */
const SPEED = 0.28;
/** The first moments ease up to speed, rather than starting at a rush. */
const SPOOL = 1.2;
/** Where ahead is: the middle of the screen, a little above centre, behind the board. */
const AHEAD = { x: 0.5, y: 0.45 };
/** Nearest a star comes before it is behind us. */
const NEAR = 0.04;

interface Star {
  x: number;
  y: number;
  z: number;
  /** Where it was drawn last frame, so its streak runs from there. */
  sx: number;
  sy: number;
  tint: string;
  bright: number;
}

const ahead = (anywhere: boolean): Star => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z: anywhere ? NEAR + Math.random() * (1 - NEAR) : 1,
  sx: NaN,
  sy: NaN,
  tint: Math.random() < 0.3 ? '205, 235, 255' : '255, 255, 255',
  bright: 0.45 + Math.random() * 0.55,
});

export default function Starfield({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = Array.from({ length: STARS }, () => ahead(true));
    let width = 0;
    let height = 0;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const star of stars) star.sx = NaN;
    };

    const draw = (advance: number) => {
      const cx = width * AHEAD.x;
      const cy = height * AHEAD.y;
      /* How far out a star at the far plane sits: the field fills the
         screen by the time stars are halfway here. */
      const spread = Math.max(width, height) * 0.32;
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
        const alpha = Math.min(1, near * 2.4) * star.bright;
        const fromX = Number.isNaN(star.sx) ? x : star.sx;
        const fromY = Number.isNaN(star.sy) ? y : star.sy;
        ctx.strokeStyle = `rgba(${star.tint}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.5 + near * 1.6;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(x + 0.01, y + 0.01);
        ctx.stroke();
        star.sx = x;
        star.sy = y;
      }
    };

    size();
    const observer = 'ResizeObserver' in window ? new ResizeObserver(size) : null;
    observer?.observe(canvas);

    if (still) {
      draw(0);
      return () => observer?.disconnect();
    }

    let frame = 0;
    let last = 0;
    let flown = 0;
    const tick = (now: number) => {
      /* A long gap — a hidden tab coming back — is not a lurch forward. */
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      flown += dt;
      const spool = Math.min(1, flown / SPOOL);
      draw(SPEED * dt * spool * spool * (3 - 2 * spool));
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
