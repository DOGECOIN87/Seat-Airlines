/**
 * Pieces shared by the launch intro's scenes. Every scene is drawn on a
 * 1920×1080 stage; the Stage zooms it to the composition (×2 for 4K), so
 * text, SVG and gradients are painted at the full output resolution.
 */
import React from 'react';
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

export const C = {
  navy: '#0F1725',
  night: '#050A14',
  brand: '#123A8F', // the badge's blue
  brandDeep: '#071433',
  cyan: '#00C9F1',
  blue: '#0087EA',
  ink: '#F4F8FC',
  gold: '#FFC845',
  cerise: '#FF4FA3',
  violet: '#A78BFA',
};
export const SANS = 'Montserrat, sans-serif';
export const MONO = '"IBM Plex Mono", monospace';
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const W = 1920;
export const H = 1080;

export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width } = useVideoConfig();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: C.night }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, zoom: width / W, overflow: 'hidden' }}>{children}</div>
    </AbsoluteFill>
  );
};

/** A full-stage layer (AbsoluteFill sized to the 1920×1080 stage). */
export const Layer: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, ...style }}>{children}</div>
);

const BADGE = 'brand/seat-airlines-badge.png';

/**
 * The glossy AIRLINES badge (the site's logo, public/seat-airlines-logo.svg's
 * own raster). `shine` 0→1 runs a light sweep across its face, masked to it.
 */
export const Badge: React.FC<{ size: number; shine?: number; glow?: number; style?: React.CSSProperties }> = ({ size, shine = -1, glow = 0, style }) => {
  const url = staticFile(BADGE);
  const mask: React.CSSProperties = {
    WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
    WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      {glow > 0 && (
        <div style={{
          position: 'absolute', left: -size * 0.45, top: -size * 0.45, width: size * 1.9, height: size * 1.9, opacity: glow,
          background: 'radial-gradient(circle, rgba(0,201,241,0.42) 0%, rgba(0,135,234,0.18) 32%, rgba(0,135,234,0) 62%)',
        }} />
      )}
      <Img src={url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: `drop-shadow(0 ${size * 0.05}px ${size * 0.06}px rgba(0,0,0,0.55))` }} />
      {shine > -0.5 && shine < 1.5 && (
        <div style={{
          position: 'absolute', inset: 0, ...mask, mixBlendMode: 'screen',
          background: `linear-gradient(115deg, rgba(255,255,255,0) ${shine * 160 - 40}%, rgba(255,255,255,0.85) ${shine * 160 - 25}%, rgba(255,255,255,0) ${shine * 160 - 10}%)`,
        }} />
      )}
    </div>
  );
};

/** Drifting motes of light, depth-sorted; deterministic per seed. */
export const Motes: React.FC<{ count?: number; seed?: string; color?: string; rise?: number; opacity?: number }> = ({ count = 70, seed = 'm', color = '200,235,255', rise = 0.6, opacity = 1 }) => {
  const f = useCurrentFrame();
  return (
    <Layer style={{ opacity }}>
      {Array.from({ length: count }, (_, i) => {
        const z = 0.25 + random(`${seed}z${i}`) * 0.75;
        const x = (random(`${seed}x${i}`) * (W + 200) + f * (random(`${seed}d${i}`) - 0.5) * 0.8 * z) % (W + 200) - 100;
        const y = ((random(`${seed}y${i}`) * (H + 200) - f * rise * z * 1.6) % (H + 200) + H + 200) % (H + 200) - 100;
        const s = 2 + z * 7;
        const tw = 0.5 + 0.5 * Math.sin(f * (0.08 + random(`${seed}t${i}`) * 0.1) + i);
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: s * 4, height: s * 4, marginLeft: -s * 2, marginTop: -s * 2, borderRadius: '50%',
            opacity: (0.25 + 0.75 * tw) * z,
            background: `radial-gradient(circle, rgba(${color},0.95) 0%, rgba(${color},0.35) 18%, rgba(${color},0) 50%)`,
          }} />
        );
      })}
    </Layer>
  );
};

/** Soft rotating light rays from a point. */
export const Rays: React.FC<{ x: number; y: number; opacity: number; color?: string; speed?: number }> = ({ x, y, opacity, color = '120,200,255', speed = 0.12 }) => {
  const f = useCurrentFrame();
  const R = 1500;
  return (
    <div style={{
      position: 'absolute', left: x - R, top: y - R, width: R * 2, height: R * 2, opacity, borderRadius: '50%',
      background: `repeating-conic-gradient(from ${f * speed}deg, rgba(${color},0.13) 0deg 4deg, rgba(${color},0) 9deg 18deg)`,
      WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 8%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0) 62%)',
      maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 8%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0) 62%)',
    }} />
  );
};

/** A top-down cumulus: a cluster of soft puffs, deterministic per seed. */
export const Cloud: React.FC<{ seed: string; x: number; y: number; w: number; shade?: number; opacity?: number }> = ({ seed, x, y, w, shade = 0, opacity = 1 }) => {
  const n = 9;
  const lit = 255 - shade * 40;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: w * 0.6, opacity }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + random(`${seed}a${i}`);
        const r = (0.12 + random(`${seed}r${i}`) * 0.22) * w;
        const s = (0.28 + random(`${seed}s${i}`) * 0.3) * w;
        const cx = w / 2 + Math.cos(a) * r - s / 2;
        const cy = w * 0.3 + Math.sin(a) * r * 0.6 - s / 2;
        return (
          <div key={i} style={{
            position: 'absolute', left: cx, top: cy, width: s, height: s, borderRadius: '50%',
            background: `radial-gradient(circle at 38% 34%, rgba(${lit},${lit},${lit},1) 0%, rgba(${lit - 8},${lit - 4},${lit},0.92) 34%, rgba(${lit - 30},${lit - 20},${lit},0.45) 56%, rgba(${lit - 40},${lit - 30},${lit},0) 71%)`,
          }} />
        );
      })}
      <div style={{
        position: 'absolute', left: w * 0.2, top: w * 0.12, width: w * 0.6, height: w * 0.36, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(${lit},${lit},${lit},0.95) 0%, rgba(${lit},${lit},${lit},0) 70%)`,
      }} />
    </div>
  );
};

/** The app's own top-down airliner (public/plane-top.svg, nose right). `size` is its height. */
export const PlaneTop: React.FC<{ size: number; trails?: number; trailLength?: number; shadow?: number; style?: React.CSSProperties }> = ({ size, trails = 1, trailLength = 1400, shadow = 0.35, style }) => {
  const w = size * (1280 / 1160);
  return (
    <div style={{ position: 'absolute', width: w, height: size, ...style }}>
      {trails > 0 && [37.1, 62.9].map((top) => (
        <div key={top} style={{
          position: 'absolute', right: '49%', top: `${top}%`, width: trailLength, height: Math.max(3, size * 0.05),
          transform: 'translateY(-50%)', borderRadius: 999, opacity: trails,
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 55%, rgba(255,255,255,0.95) 94%, rgba(255,255,255,0) 100%)',
        }} />
      ))}
      <Img src={staticFile('brand/plane-top.svg')} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        filter: shadow ? `drop-shadow(${size * 0.12}px ${size * 0.2}px ${size * 0.05}px rgba(10,26,50,${shadow}))` : undefined,
      }} />
    </div>
  );
};

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.-';

/** One split-flap tile: flips through glyphs every `flip` frames until it lands. */
export const FlapTile: React.FC<{ ch: string; land: number; size: number; flip?: number; seed: string; color?: string; dim?: boolean }> = ({ ch, land, size, flip = 2, seed, color = C.ink, dim }) => {
  const f = useCurrentFrame();
  const blank = ch === ' ';
  const started = f >= land - 10;
  const shown = f >= land || blank ? ch : started ? GLYPHS[Math.floor(random(`${seed}${Math.floor(f / flip)}`) * GLYPHS.length)] : ' ';
  const flipping = !blank && started && f < land;
  const k = flipping ? (f % flip) / flip : 0;
  return (
    <span style={{
      position: 'relative', display: 'inline-block', width: size * 0.7, height: size * 1.18, lineHeight: `${size * 1.18}px`,
      textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: size, color: dim ? 'rgba(244,248,252,0.5)' : color,
      opacity: interpolate(f, [land - 12, land - 8], [0, 1], clamp),
      background: 'linear-gradient(180deg, #1B2638 0%, #141D2C 49.5%, #0B111B 50.5%, #121A28 100%)',
      borderRadius: size * 0.09, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 4px rgba(0,0,0,0.6)', overflow: 'hidden',
    }}>
      <span style={{ display: 'inline-block', transform: flipping ? `scaleY(${1 - 0.6 * Math.sin(k * Math.PI)})` : undefined }}>{shown}</span>
      <span style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: Math.max(1, size * 0.03), background: 'rgba(0,0,0,0.7)' }} />
    </span>
  );
};

/** Film grain and a vignette, frame-driven. */
export const Grain: React.FC<{ amount?: number }> = ({ amount = 0.035 }) => {
  const f = useCurrentFrame();
  const seed = f % 8;
  return (
    <Layer style={{ pointerEvents: 'none' }}>
      <svg width={W} height={H} style={{ position: 'absolute', opacity: amount, mixBlendMode: 'overlay' }}>
        <filter id={`ig${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} /></filter>
        <rect width={W} height={H} filter={`url(#ig${seed})`} />
      </svg>
      <Layer style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.32) 100%)' }} />
    </Layer>
  );
};

/** Words that rise in on a stagger. */
export const Rise: React.FC<{ text: string; from: number; size: number; weight?: number; color?: string; stagger?: number; style?: React.CSSProperties; spacing?: string }> = ({ text, from, size, weight = 800, color = C.ink, stagger = 3, style, spacing = '-0.01em' }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: SANS, fontWeight: weight, fontSize: size, color, letterSpacing: spacing, lineHeight: 1.04, ...style }}>
      {text.split(' ').map((word, i) => {
        const k = interpolate(f - from - i * stagger, [0, 12], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.08 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - k) * 105}%)`, opacity: k, marginRight: '0.26em' }}>{word}</span>
          </span>
        );
      })}
    </div>
  );
};
