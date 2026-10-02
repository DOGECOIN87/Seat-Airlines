/**
 * The launch intro's scenes, each drawn in code on the 1920×1080 stage.
 * `frames` is the scene's own length; anything timed to a sound reads its
 * frame from timing.ts (config/intro.json), which the synth reads too.
 */
import React from 'react';
import { Easing, Img, interpolate, interpolateColors, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { CABIN_ZONES } from '../../../src/content/cabin';
import { SEAT_ORDER } from '../../../src/lib/seating';
import { Badge, C, Cloud, FlapTile, H, Layer, MONO, Motes, PlaneTop, Rays, Rise, SANS, W, clamp } from './kit';
import { BANDS, BOARD_COLS, BOARD_ROWS, FPS, IGN, bandAt, capAt, climbKeysOf, climbU, phrasesIn, seatLitAt, tileLands, type CutId, type VoCue } from './timing';

export type SceneProps = { frames: number; cut: CutId; vo: VoCue[] };
const easeOut = Easing.out(Easing.cubic);
const easeIn = Easing.in(Easing.cubic);

/* ── 1. Ignition: the badge slams in, the name tracks in, then the camera dives through it ── */

export const Ignition: React.FC<SceneProps> = ({ frames }) => {
  const f = useCurrentFrame();
  const { badgeIn, land, shineFrom, shineFrames, wordFrom } = IGN;
  const bx = 960, by = 400, size = 460;
  const p = interpolate(f, [badgeIn, land], [0, 1], { ...clamp, easing: easeIn });
  const settle = f > land ? 1 + 0.05 * Math.exp(-(f - land) / 5) * Math.cos((f - land) * 0.9) : 1;
  const scale = interpolate(p, [0, 1], [3.2, 1]) * settle;
  const rot = interpolate(p, [0, 1], [-28, 0]);
  const shine = (f - shineFrom) / shineFrames;
  const glow = f < land ? 0 : 0.55 + 0.45 * Math.exp(-(f - land) / 10);
  const flare = interpolate(f, [land, land + 6, land + 40], [0, 1, 0], clamp);
  // The exit: the camera pushes through the badge and whites out.
  const dive = interpolate(f, [frames - 18, frames], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const white = interpolate(f, [frames - 10, frames], [0, 1], clamp);
  const name = 'SEAT AIRLINES';
  const tracking = interpolate(f, [wordFrom, wordFrom + 40], [0.55, 0.14], { ...clamp, easing: easeOut });
  return (
    <Layer style={{ background: 'radial-gradient(circle at 50% 40%, #16305e 0%, #0b1a38 38%, #050A14 80%)' }}>
      <Layer style={{ transform: `scale(${1 + dive * 7})`, transformOrigin: `${bx}px ${by}px` }}>
        <Rays x={bx} y={by} opacity={interpolate(f, [land - 2, land + 24], [0, 0.9], clamp)} />
        <Motes count={80} seed="ign" opacity={interpolate(f, [0, 20], [0.2, 1], clamp)} />
        {/* Shockwave from the landing. */}
        {f >= land && [0, 5].map((lag) => {
          const k = interpolate(f - lag, [land, land + 34], [0, 1], { ...clamp, easing: easeOut });
          const r = 230 + k * 900;
          return (
            <div key={lag} style={{
              position: 'absolute', left: bx - r, top: by - r, width: r * 2, height: r * 2, borderRadius: '50%', opacity: (1 - k) * (lag ? 0.45 : 0.9),
              border: `${2 + 5 * (1 - k)}px solid rgba(120,220,255,0.9)`, boxSizing: 'border-box', boxShadow: '0 0 40px rgba(0,201,241,0.45), inset 0 0 40px rgba(0,201,241,0.3)',
            }} />
          );
        })}
        {/* Anamorphic flare across the frame. */}
        <div style={{
          position: 'absolute', left: 0, top: by - 3, width: W, height: 6, opacity: flare, transform: `scaleX(${0.3 + flare * 0.7})`,
          background: 'linear-gradient(90deg, rgba(0,201,241,0) 0%, rgba(120,220,255,0.9) 35%, rgba(255,255,255,1) 50%, rgba(120,220,255,0.9) 65%, rgba(0,201,241,0) 100%)',
          filter: 'blur(1.5px)',
        }} />
        <div style={{
          position: 'absolute', left: bx - size / 2, top: by - size / 2 + Math.sin(f * 0.06) * 4 * (f > land ? 1 : 0), opacity: interpolate(f, [badgeIn, badgeIn + 6], [0, 1], clamp),
          transform: `scale(${scale}) rotate(${rot}deg)`,
        }}>
          <Badge size={size} shine={shine} glow={glow} />
        </div>
        {/* The name, tracking in letter by letter. */}
        <div style={{ position: 'absolute', left: 0, width: W, top: 690, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 116, letterSpacing: `${tracking}em`, paddingLeft: `${tracking}em` }}>
          {name.split('').map((ch, i) => {
            const k = interpolate(f, [wordFrom + i * 1.6, wordFrom + i * 1.6 + 12], [0, 1], { ...clamp, easing: easeOut });
            return (
              <span key={i} style={{
                display: 'inline-block', opacity: k, transform: `translateY(${(1 - k) * 36}px)`,
                backgroundImage: 'linear-gradient(180deg, #FFFFFF 30%, #BFE6FF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.5))',
              }}>{ch === ' ' ? ' ' : ch}</span>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, width: W, top: 850, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22 }}>
          <div style={{ height: 2, width: interpolate(f, [wordFrom + 10, wordFrom + 30], [0, 160], { ...clamp, easing: easeOut }), background: 'linear-gradient(90deg, rgba(0,201,241,0), #00C9F1)' }} />
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 28, letterSpacing: '0.3em', color: C.cyan, opacity: interpolate(f, [wordFrom + 12, wordFrom + 22], [0, 1], clamp) }}>WELCOME ABOARD</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {'SA350'.split('').map((ch, i) => <FlapTile key={i} ch={ch} land={wordFrom + 22 + i * 1.5} size={34} seed={`ign${i}`} />)}
          </div>
          <div style={{ height: 2, width: interpolate(f, [wordFrom + 10, wordFrom + 30], [0, 160], { ...clamp, easing: easeOut }), background: 'linear-gradient(90deg, #00C9F1, rgba(0,201,241,0))' }} />
        </div>
      </Layer>
      <Layer style={{ background: '#fff', opacity: white }} />
    </Layer>
  );
};

/* ── 2. Sky: above the clouds, the airliner cruising, the world streaming past ── */

const SKY_CLOUDS = (layer: number, n: number) => Array.from({ length: n }, (_, i) => ({
  seed: `c${layer}-${i}`,
  x: random(`cx${layer}${i}`) * 2600,
  y: random(`cy${layer}${i}`) * (H + 300) - 250,
  w: [240, 440, 900][layer] * (0.7 + random(`cw${layer}${i}`) * 0.6),
}));
const CLOUD_LAYERS = [SKY_CLOUDS(0, 22), SKY_CLOUDS(1, 12), SKY_CLOUDS(2, 4)];

export const Sky: React.FC<SceneProps> = ({ frames, vo }) => {
  const f = useCurrentFrame();
  const [p1, p2] = phrasesIn(vo, '02-one-plane', [12, 34]);
  const speeds = [2.4, 5.2, 13];
  const out = interpolate(f, [frames - 24, frames + 10], [0, 1], { ...clamp, easing: easeIn });
  const px = interpolate(f, [0, frames - 24], [560, 980], { ...clamp, easing: Easing.inOut(Easing.sin) }) + out * 1500;
  const py = 430 + Math.sin(f * 0.05) * 10;
  const field = (layer: number, f0: number) => CLOUD_LAYERS[layer].map((c) => {
    const x = ((c.x - f0 * speeds[layer]) % 2600 + 2600) % 2600 - 600;
    return <Cloud key={c.seed} seed={c.seed} x={x} y={c.y} w={c.w} shade={layer === 0 ? 1 : 0} opacity={[0.75, 0.9, 0.82][layer]} />;
  });
  return (
    <Layer style={{ background: 'linear-gradient(180deg, #2a6aa8 0%, #3f86c4 45%, #5c9fd6 100%)', overflow: 'hidden' }}>
      <Layer style={{ transform: `scale(${1.04 + f * 0.0004})`, transformOrigin: '50% 50%' }}>
        {/* The sea and land far below, through the haze. */}
        <Layer style={{
          opacity: 0.55,
          background: `radial-gradient(ellipse 40% 30% at ${70 - f * 0.05}% 70%, rgba(80,140,90,0.55), rgba(80,140,90,0) 70%), radial-gradient(ellipse 30% 22% at ${25 - f * 0.05}% 25%, rgba(120,150,95,0.45), rgba(120,150,95,0) 70%)`,
        }} />
        {field(0, f)}
        <Layer style={{ background: 'linear-gradient(180deg, rgba(220,236,255,0.18), rgba(220,236,255,0.05))' }} />
        {field(1, f)}
        <div style={{ position: 'absolute', left: px - 200, top: py - 180, transform: `rotate(${interpolate(f, [0, frames], [-4, 3])}deg)` }}>
          <PlaneTop size={360} trailLength={1700} shadow={0.32} />
        </div>
        {field(2, f)}
      </Layer>
      {/* Sun glare. */}
      <Layer style={{ background: 'radial-gradient(circle at 88% 6%, rgba(255,246,220,0.85) 0%, rgba(255,240,210,0.25) 18%, rgba(255,240,210,0) 42%)', mixBlendMode: 'screen' }} />
      <Layer style={{ background: 'linear-gradient(20deg, rgba(5,12,28,0.62) 0%, rgba(5,12,28,0.2) 34%, rgba(5,12,28,0) 55%)' }} />
      <div style={{ position: 'absolute', left: 120, top: 760, textShadow: '0 6px 30px rgba(0,0,0,0.45)' }}>
        <Rise text="ONE PLANE." from={p1} size={110} />
        <Rise text="EVERYONE'S IN IT." from={p2 - 2} size={110} color="#CFEFFF" />
      </div>
    </Layer>
  );
};

/* ── 3. Seats: the cabin from above, filling rank by rank ── */

export const ZONE_COLOR: Record<string, string> = { deck: C.gold, first: C.cerise, business: C.violet, exit: '#5EF0FF', economy: C.cyan };
const PITCH: Record<string, number> = { first: 46, business: 40, exit: 46, economy: 33 };
const SIZE: Record<string, number> = { deck: 36, first: 36, business: 32, exit: 28, economy: 27 };
const CY = 560;

export const SEAT_LAYOUT = (() => {
  const rowX = new Map<number, number>();
  const rows = CABIN_ZONES.flatMap((z) => z.rows.filter((r) => r.n !== null).map((r) => ({ n: r.n as number, zone: z.key }))).sort((a, b) => a.n - b.n);
  let x = 380;
  let prev = '';
  for (const r of rows) {
    if (prev && prev !== r.zone) x += 12;
    rowX.set(r.n, x);
    x += PITCH[r.zone];
    prev = r.zone;
  }
  const rank = new Map(SEAT_ORDER.map((s, i) => [s.id, i]));
  return CABIN_ZONES.flatMap((z) => z.rows.flatMap((row) => {
    const s = SIZE[z.key];
    const aisle = z.key === 'first' || z.key === 'business' || z.key === 'deck' ? 26 : 22;
    const sx = row.n === null ? 292 : rowX.get(row.n)!;
    const left = row.left.map((id, i) => ({ id: row.n === null ? id : `${row.n}${id}`, x: sx, y: CY - aisle - (row.left.length - i - 0.5) * (s + 4), s, zone: z.key }));
    const right = row.right.map((id, i) => ({ id: row.n === null ? id : `${row.n}${id}`, x: sx, y: CY + aisle + (i + 0.5) * (s + 4), s, zone: z.key }));
    return [...left, ...right];
  })).map((seat) => ({ ...seat, rank: rank.get(seat.id) ?? 0 }));
})();

const CALLOUTS = (() => {
  const by = (zone: string) => SEAT_LAYOUT.filter((s) => s.zone === zone);
  const first = (zone: string) => Math.min(...by(zone).map((s) => s.rank));
  const span = (zone: string, rows?: (id: string) => boolean) => {
    const xs = by(zone).filter((s) => !rows || rows(s.id)).map((s) => s.x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };
  return [
    { zone: 'deck', name: 'FLIGHT DECK', note: 'TOP 2 HOLDERS', x: span('deck'), tier: 0 },
    { zone: 'first', name: 'FIRST', note: 'ROWS 1–2', x: span('first'), tier: 1 },
    { zone: 'business', name: 'BUSINESS', note: 'ROWS 3–7', x: span('business'), tier: 0 },
    { zone: 'exit', name: 'EXIT ROW', note: 'ROWS 16–17', x: span('exit'), tier: 1 },
    { zone: 'economy', name: 'ECONOMY', note: '126 SEATS', x: span('economy', (id) => parseInt(id, 10) >= 18), tier: 0 },
  ].map((c) => ({ ...c, at: seatLitAt(first(c.zone)) }));
})();

export const FUSELAGE = 'M 400 410 L 1600 410 C 1700 410 1800 470 1872 540 L 1872 580 C 1800 650 1700 710 1600 710 L 400 710 C 280 710 196 640 188 560 C 196 480 280 410 400 410 Z';

export const Seats: React.FC<SceneProps> = ({ frames, vo }) => {
  const f = useCurrentFrame();
  const [p1, , p3] = phrasesIn(vo, '03-your-bag', [4, 40, 80, 120]);
  const lit = SEAT_LAYOUT.filter((s) => f >= seatLitAt(s.rank)).length;
  const head = SEAT_LAYOUT.find((s) => s.rank === Math.max(0, lit - 1));
  const filling = lit > 0 && lit < SEAT_LAYOUT.length;
  const done = interpolate(f, [seatLitAt(SEAT_LAYOUT.length - 1), seatLitAt(SEAT_LAYOUT.length - 1) + 14], [0, 1], clamp);
  const cam = interpolate(f, [0, frames], [1.0, 1.05]);
  return (
    <Layer style={{ background: '#08101F' }}>
      <Layer style={{
        backgroundImage: 'linear-gradient(rgba(0,201,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,201,241,0.07) 1px, transparent 1px), linear-gradient(rgba(0,201,241,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,201,241,0.035) 1px, transparent 1px)',
        backgroundSize: '200px 200px, 200px 200px, 40px 40px, 40px 40px', backgroundPosition: `${-f * 0.4}px 0, ${-f * 0.4}px 0, ${-f * 0.4}px 0, ${-f * 0.4}px 0`,
      }} />
      <Layer style={{ background: 'radial-gradient(ellipse at 55% 55%, rgba(18,58,143,0.45) 0%, rgba(8,16,31,0) 60%)' }} />
      <Layer style={{ transform: `scale(${cam})`, transformOrigin: '1030px 600px' }}>
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
          <defs>
            <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(160,215,255,0.10)" />
              <stop offset="0.5" stopColor="rgba(160,215,255,0.03)" />
              <stop offset="1" stopColor="rgba(160,215,255,0.10)" />
            </linearGradient>
          </defs>
          {/* Wings and tailplane, faint, behind the hull. */}
          {[1, -1].map((s) => (
            <g key={s} fill="rgba(0,201,241,0.035)" stroke="rgba(0,201,241,0.28)" strokeWidth={1.5}>
              <path d={`M 860 ${CY - s * 150} L 1110 ${CY - s * 150} L 1340 ${CY - s * 470} L 1262 ${CY - s * 470} Z`} />
              <path d={`M 1700 ${CY - s * 120} L 1782 ${CY - s * 110} L 1852 ${CY - s * 250} L 1812 ${CY - s * 250} Z`} />
              <rect x={1000} y={s > 0 ? CY - 290 : CY + 250} width={90} height={40} rx={18} />
            </g>
          ))}
          <path d={FUSELAGE} fill="url(#hull)" stroke="rgba(120,220,255,0.65)" strokeWidth={2.5} />
          <path d={FUSELAGE} fill="none" stroke="rgba(0,201,241,0.25)" strokeWidth={10} style={{ filter: 'blur(6px)' }} />
          {/* Cabin windows. */}
          {Array.from({ length: 40 }, (_, i) => 420 + i * 30).map((x) => [418, 702].map((y) => <rect key={`${x}${y}`} x={x} y={y - 3} width={14} height={6} rx={3} fill="rgba(160,215,255,0.35)" />))}
          {/* Bulkhead between the flight deck and the cabin. */}
          <line x1={336} y1={428} x2={336} y2={692} stroke="rgba(120,220,255,0.35)" strokeWidth={2} strokeDasharray="6 6" />
        </svg>
        {/* The scanner: a band of light that follows the newest seat. */}
        {head && (
          <div style={{
            position: 'absolute', left: head.x - 90, top: 400, width: 180, height: 320, opacity: filling ? 1 : 0,
            background: 'radial-gradient(ellipse at center, rgba(0,201,241,0.32) 0%, rgba(0,201,241,0) 65%)',
          }} />
        )}
        {SEAT_LAYOUT.map((s) => {
          const at = seatLitAt(s.rank);
          const k = f - at;
          const on = k >= 0;
          const pop = on ? interpolate(k, [0, 3, 9], [1.7, 0.9, 1], clamp) : 1;
          const col = ZONE_COLOR[s.zone];
          return (
            <div key={s.id} style={{
              position: 'absolute', left: s.x - s.s / 2, top: s.y - s.s / 2, width: s.s, height: s.s, borderRadius: s.s * 0.26,
              transform: `scale(${pop})`, background: on ? col : 'rgba(255,255,255,0.035)',
              border: on ? 'none' : '1.5px solid rgba(160,215,255,0.25)', boxSizing: 'border-box',
              boxShadow: on ? `0 0 ${interpolate(k, [0, 10], [26, 10], clamp)}px ${col}` : 'none',
            }}>
              <div style={{ position: 'absolute', right: s.s * 0.1, top: s.s * 0.12, bottom: s.s * 0.12, width: s.s * 0.2, borderRadius: s.s * 0.1, background: on ? 'rgba(0,0,0,0.28)' : 'rgba(160,215,255,0.18)' }} />
            </div>
          );
        })}
        {CALLOUTS.map((c) => {
          const k = interpolate(f, [c.at, c.at + 10], [0, 1], { ...clamp, easing: easeOut });
          const top = c.tier ? 860 : 768;
          return (
            <div key={c.zone} style={{ position: 'absolute', left: c.x, top: 712, opacity: k }}>
              <div style={{ position: 'absolute', left: -1, top: 0, width: 2, height: (top - 712) * k, background: `linear-gradient(180deg, rgba(255,255,255,0), ${ZONE_COLOR[c.zone]})` }} />
              <div style={{
                position: 'absolute', top: top - 712, transform: `translate(-50%, ${(1 - k) * 12}px)`, whiteSpace: 'nowrap', textAlign: 'center',
                background: 'rgba(8,16,31,0.82)', border: `1px solid ${ZONE_COLOR[c.zone]}55`, borderRadius: 10, padding: '8px 16px',
              }}>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, color: ZONE_COLOR[c.zone], letterSpacing: '0.06em' }}>{c.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 19, color: 'rgba(244,248,252,0.75)', letterSpacing: '0.12em' }}>{c.note}</div>
              </div>
            </div>
          );
        })}
        <div style={{
          position: 'absolute', left: 400, top: 970, width: 1200, height: 52, borderRadius: 12, border: '1.5px dashed rgba(244,248,252,0.3)', opacity: done * 0.9,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: MONO, fontSize: 20, letterSpacing: '0.18em', color: 'rgba(244,248,252,0.75)',
        }}>
          <span style={{ color: C.gold }}>CARGO HOLD</span>
          <span>EVERYONE BELOW THE CUTOFF RIDES DOWN HERE</span>
        </div>
      </Layer>
      <div style={{ position: 'absolute', left: 110, top: 84 }}>
        <Rise text="YOUR BAG IS YOUR SEAT." from={p1} size={86} />
        <div style={{ marginTop: 14, fontFamily: MONO, fontWeight: 500, fontSize: 25, letterSpacing: '0.16em', color: C.cyan, opacity: interpolate(f, [p1 + 14, p1 + 26], [0, 1], clamp) }}>
          178 SEATS · RANKED BY HOLDINGS
        </div>
        <div style={{ marginTop: 10, fontFamily: MONO, fontWeight: 600, fontSize: 25, letterSpacing: '0.16em', color: C.gold, opacity: interpolate(f, [p3, p3 + 10], [0, 1], clamp), transform: `translateX(${interpolate(f, [p3, p3 + 14], [-20, 0], { ...clamp, easing: easeOut })}px)` }}>
          THE BIGGER THE BAG, THE BETTER THE SEAT
        </div>
      </div>
      <div style={{ position: 'absolute', right: 110, top: 88, textAlign: 'right', fontFamily: MONO, opacity: interpolate(f, [8, 18], [0, 1], clamp) }}>
        <div style={{ fontSize: 20, letterSpacing: '0.24em', color: 'rgba(244,248,252,0.6)' }}>SEATS FILLED</div>
        <div style={{ fontSize: 76, fontWeight: 600, color: C.ink, lineHeight: 1.05 }}>
          {String(lit).padStart(3, '0')}<span style={{ color: 'rgba(244,248,252,0.4)' }}>/178</span>
        </div>
      </div>
    </Layer>
  );
};

/* ── 4. Climb: market cap is altitude — weather, clouds, space, the moon, Mars ── */

const SKY_KEYS = [0, 0.16, 0.3, 0.44, 0.56, 0.72, 0.88, 1];
const SKY_TOP = ['#3d86d6', '#2f74c9', '#1d58b0', '#0d2a66', '#040a1f', '#02040c', '#0b0306', '#170608'];
const SKY_BOT = ['#a9d6ff', '#d8ecff', '#8fc2f5', '#2c5ea8', '#0b1d46', '#070c1c', '#1d0a08', '#33120b'];
const BAND_COLOR = ['#7EC8E3', '#E0ECF8', '#8EA9FF', '#D8D8D8', '#FF7A45'];
const S = 9000; // screen pixels per unit of climb progress
const DECK = Array.from({ length: 34 }, (_, i) => ({
  seed: `deck${i}`, u: 0.12 + random(`du${i}`) * 0.2, x: random(`dx${i}`) * 2200 - 300, w: 420 + random(`dw${i}`) * 520, near: random(`dn${i}`) > 0.7,
}));
const STARS = Array.from({ length: 160 }, (_, i) => ({ x: random(`sx${i}`) * W, y: random(`sy${i}`) * H * 2, s: 1 + random(`ss${i}`) * 2.6, t: random(`st${i}`) * 6 }));
const STREAKS = Array.from({ length: 26 }, (_, i) => ({ x: random(`kx${i}`) * W, y: random(`ky${i}`), l: 120 + random(`kl${i}`) * 260 }));

export const formatCap = (n: number) => (n >= 999_500 ? `$${(n / 1_000_000).toFixed(n >= 99_950_000 ? 0 : n >= 9_995_000 ? 1 : 2)}M` : `$${Math.round(n / 1_000)}K`);

export const Climb: React.FC<SceneProps> = ({ frames, cut, vo }) => {
  const f = useCurrentFrame();
  const keys = climbKeysOf(cut);
  const u = climbU(keys, f / FPS);
  const v = (climbU(keys, (f + 1) / FPS) - u) * frames; // progress per scene-length: the speed
  const [h1] = phrasesIn(vo, '04-altitude', [4]);
  const headlineOut = Math.round(keys[1][0] * FPS) - 22;
  const band = bandAt(u);
  const cap = capAt(u);
  const top = interpolateColors(u, SKY_KEYS, SKY_TOP);
  const bot = interpolateColors(u, SKY_KEYS, SKY_BOT);
  const whiteout = Math.max(0, 1 - Math.abs(u - BANDS[1].u) / 0.03) * 0.85;
  const shakeAmt = interpolate(u, [0.08, 0.22, 0.4, 0.55], [1, 5, 2.5, 0.4], clamp);
  const sx = (random(`shx${f}`) - 0.5) * shakeAmt * 2;
  const sy = (random(`shy${f}`) - 0.5) * shakeAmt * 2;
  const space = interpolate(u, [0.44, 0.58], [0, 1], clamp);
  const bandFlash = (i: number) => interpolate(u, [BANDS[i].u, BANDS[i].u + 0.04], [1, 0], clamp) * (u >= BANDS[i].u ? 1 : 0);
  const moonY = H * 0.36 + (u - 0.76) * S * 0.45;
  const marsR = interpolate(u, [0.82, 1], [30, 250], { ...clamp, easing: easeOut });
  const marsY = interpolate(u, [0.82, 1], [-120, 300], { ...clamp, easing: easeOut });
  const headline = interpolate(f, [headlineOut, headlineOut + 10], [1, 0], clamp);
  return (
    <Layer style={{ background: `linear-gradient(180deg, ${top} 0%, ${bot} 100%)`, overflow: 'hidden' }}>
      <Layer style={{ transform: `translate(${sx}px, ${sy}px)` }}>
        {/* Stars, and the Earth's limb falling away below. */}
        <Layer style={{ opacity: space }}>
          {STARS.map((s, i) => (
            <div key={i} style={{
              position: 'absolute', left: s.x, top: ((s.y + u * 260) % (H * 1.2)) - 60, width: s.s, height: s.s, borderRadius: '50%', background: '#fff',
              opacity: 0.45 + 0.55 * Math.abs(Math.sin(f * 0.07 + s.t)), boxShadow: s.s > 2.6 ? '0 0 6px rgba(200,230,255,0.9)' : 'none',
            }} />
          ))}
        </Layer>
        <div style={{
          position: 'absolute', left: W / 2 - 2600, top: H - 260 + (u - 0.44) * S * 0.55, width: 5200, height: 5200, borderRadius: '50%',
          opacity: interpolate(u, [0.36, 0.46, 0.66, 0.74], [0, 1, 1, 0], clamp),
          background: 'radial-gradient(circle at 50% 0%, #2f7fd6 0%, #144a97 4%, #0b2d5e 10%, #06142b 22%)',
          boxShadow: '0 0 60px 18px rgba(90,180,255,0.75), 0 0 180px 60px rgba(60,140,255,0.35)',
        }} />
        {/* Ground and weather, left behind fast. */}
        <div style={{
          position: 'absolute', left: -200, width: W + 400, top: H - 240 + u * S * 0.45, height: 900,
          background: 'linear-gradient(180deg, rgba(190,225,255,0.9) 0%, #6f9f78 8%, #4f7d5a 30%, #3a5f45 100%)', borderRadius: '50% 50% 0 0 / 60px 60px 0 0',
        }} />
        {/* The cloud deck: crossed at $1M. */}
        {DECK.filter((c) => !c.near).map((c) => (
          <Cloud key={c.seed} seed={c.seed} x={c.x} y={H * 0.45 + (u - c.u) * S - c.w * 0.3} w={c.w} />
        ))}
        {/* The Moon. */}
        <div style={{
          position: 'absolute', left: 1240, top: moonY - 230, width: 460, height: 460, borderRadius: '50%', opacity: interpolate(u, [0.6, 0.66], [0, 1], clamp),
          background: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.18) 0 6%, transparent 7%), radial-gradient(circle at 62% 58%, rgba(0,0,0,0.16) 0 9%, transparent 10%), radial-gradient(circle at 45% 75%, rgba(0,0,0,0.12) 0 5%, transparent 6%), radial-gradient(circle at 70% 28%, rgba(0,0,0,0.1) 0 4%, transparent 5%), radial-gradient(circle at 38% 38%, #f2f2ee 0%, #cfcfc8 45%, #8d8d88 80%, #5c5c58 100%)',
          boxShadow: '0 0 80px 10px rgba(230,230,220,0.25), inset -60px -40px 90px rgba(0,0,0,0.55)',
        }} />
        {/* Mars, the destination. */}
        <div style={{
          position: 'absolute', left: 1240 - marsR, top: marsY - marsR, width: marsR * 2, height: marsR * 2, borderRadius: '50%', opacity: interpolate(u, [0.82, 0.88], [0, 1], clamp),
          background: 'radial-gradient(circle at 34% 30%, rgba(255,220,180,0.25) 0 5%, transparent 6%), radial-gradient(ellipse 40% 12% at 50% 46%, rgba(90,30,15,0.35), transparent 70%), radial-gradient(circle at 36% 34%, #ff9a5c 0%, #d9582c 40%, #8f2c12 78%, #4a1308 100%)',
          boxShadow: '0 0 90px 20px rgba(255,110,60,0.35), inset -40px -30px 80px rgba(0,0,0,0.5)',
        }} />
        {/* Speed streaks. */}
        <Layer style={{ opacity: Math.min(1, v * 0.9) * (1 - space * 0.4) }}>
          {STREAKS.map((s, i) => (
            <div key={i} style={{
              position: 'absolute', left: s.x, top: ((s.y * H + f * 60 * Math.max(0.3, v)) % (H + 400)) - 300, width: 2, height: s.l,
              background: `linear-gradient(180deg, rgba(255,255,255,0), rgba(${space > 0.5 ? '160,210,255' : '255,255,255'},0.5))`,
            }} />
          ))}
        </Layer>
        {/* The airliner, nose up. In space its contrails become plumes. */}
        <div style={{ position: 'absolute', left: 960, top: 620 + Math.sin(f * 0.11) * 8, transform: `rotate(${-90 + Math.sin(f * 0.05) * 2}deg)` }}>
          {[37.1, 62.9].map((y) => (
            <div key={y} style={{
              position: 'absolute', left: -330 * 0.55 - 260, top: -165 + (y / 100) * 330 - 22, width: 300, height: 44, opacity: space,
              background: 'radial-gradient(ellipse at 100% 50%, rgba(255,255,255,0.95) 0%, rgba(120,220,255,0.75) 18%, rgba(0,201,241,0.25) 50%, rgba(0,201,241,0) 75%)',
            }} />
          ))}
          <PlaneTop size={330} trails={1 - space} trailLength={1400} shadow={0.3 * (1 - space)} style={{ left: -330 * 0.55, top: -165 }} />
        </div>
        {DECK.filter((c) => c.near).map((c) => (
          <Cloud key={c.seed} seed={c.seed} x={c.x - 200} y={H * 0.45 + (u - c.u) * S * 1.7 - c.w * 0.6} w={c.w * 1.9} opacity={0.95} />
        ))}
      </Layer>
      <Layer style={{ background: '#fff', opacity: whiteout }} />

      {/* HUD: the market cap, the band. */}
      <div style={{
        position: 'absolute', left: 90, top: 330, fontFamily: MONO, color: C.ink, background: 'rgba(5,9,20,0.66)', border: '1px solid rgba(255,255,255,0.14)',
        borderLeft: `5px solid ${BAND_COLOR[band]}`, borderRadius: 14, padding: '22px 30px', minWidth: 380, opacity: interpolate(f, [4, 14], [0, 1], clamp),
      }}>
        <div style={{ fontSize: 19, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.6)' }}>MARKET CAP</div>
        <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.05 }}>{formatCap(cap)}</div>
        <div style={{ marginTop: 18, fontSize: 19, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.6)' }}>ALTITUDE BAND</div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, color: BAND_COLOR[band], letterSpacing: '0.04em', textShadow: `0 0 ${24 * bandFlash(band)}px ${BAND_COLOR[band]}` }}>{BANDS[band].name}</div>
      </div>
      {/* The altitude tape. */}
      <div style={{ position: 'absolute', left: 1700, top: 150, width: 140, height: 780, opacity: interpolate(f, [4, 14], [0, 1], clamp) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.5))', borderRadius: 2 }} />
        {BANDS.map((b, i) => (
          <div key={b.name} style={{ position: 'absolute', left: 0, top: 780 - b.u * 780, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 18, height: 3, background: u >= b.u ? BAND_COLOR[i] : 'rgba(255,255,255,0.4)' }} />
            <div style={{ fontFamily: MONO, fontSize: 17, lineHeight: 1.15, color: u >= b.u ? BAND_COLOR[i] : 'rgba(255,255,255,0.5)' }}>
              {b.name}<br /><span style={{ opacity: 0.75 }}>{i === 0 ? '<$1M' : formatCap(b.cap) + '+'}</span>
            </div>
          </div>
        ))}
        <div style={{ position: 'absolute', left: -26, top: 780 - u * 780, transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: `18px solid ${C.cyan}`, filter: 'drop-shadow(0 0 8px #00C9F1)' }} />
      </div>
      <Layer style={{ height: 300, opacity: headline, background: 'linear-gradient(180deg, rgba(4,10,26,0.55), rgba(4,10,26,0))' }} />
      <div style={{ position: 'absolute', left: 0, width: W, top: 90, textAlign: 'center', opacity: headline, textShadow: '0 4px 24px rgba(0,10,40,0.6)' }}>
        <Rise text="MARKET CAP IS ALTITUDE." from={h1} size={92} style={{ display: 'inline-block' }} />
      </div>
      <div style={{ position: 'absolute', right: 70, bottom: 44, fontFamily: MONO, fontSize: 20, color: 'rgba(255,255,255,0.8)', background: 'rgba(5,7,15,0.5)', padding: '5px 12px', borderRadius: 6 }}>
        Simulated flight. Not financial advice.
      </div>
    </Layer>
  );
};

/* ── 5. Departures: the board flips to the destinations ── */

const BOKEH = Array.from({ length: 22 }, (_, i) => ({ x: random(`bx${i}`) * W, y: random(`by${i}`) * H, r: 60 + random(`br${i}`) * 160, warm: random(`bw${i}`) > 0.55 }));

export const Board: React.FC<SceneProps> = ({ vo }) => {
  const f = useCurrentFrame();
  const [p1, p2] = phrasesIn(vo, '06-fly-higher', [2, 22]);
  const tile = 52;
  const pad = (s: string, n: number) => s.padEnd(n, ' ').slice(0, n);
  const STATUS_COLOR: Record<string, string> = { DEPARTED: 'rgba(244,248,252,0.55)', BOARDING: C.cyan, 'ON TIME': '#4ADE80' };
  return (
    <Layer style={{ background: 'linear-gradient(180deg, #0b1220 0%, #070b14 100%)' }}>
      {BOKEH.map((b, i) => (
        <div key={i} style={{
          position: 'absolute', left: b.x - b.r + Math.sin(f * 0.02 + i) * 20, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: '50%', opacity: 0.35,
          background: `radial-gradient(circle, ${b.warm ? 'rgba(255,190,110,0.35)' : 'rgba(80,170,255,0.32)'} 0%, rgba(0,0,0,0) 68%)`,
        }} />
      ))}
      <div style={{ position: 'absolute', left: 0, width: W, top: 96, display: 'flex', justifyContent: 'center' }}>
        <Rise text="HOLD MORE." from={p1} size={100} />
        <Rise text="FLY HIGHER." from={p2 - 2} size={100} color="#CFEFFF" />
      </div>
      <div style={{
        position: 'absolute', left: 300, top: 300, width: 1320, padding: '30px 44px 36px', borderRadius: 22,
        background: 'linear-gradient(180deg, #0d131e, #080c14)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        transform: `translateY(${interpolate(f, [0, 12], [40, 0], { ...clamp, easing: easeOut })}px)`, opacity: interpolate(f, [0, 8], [0, 1], clamp),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: SANS, fontWeight: 800, fontSize: 36, letterSpacing: '0.12em', color: C.gold }}>
            <Img src={staticFile('brand/plane-top.svg')} style={{ width: 54, height: 49, transform: 'rotate(-30deg)', filter: 'brightness(0) invert(0.85) sepia(1) saturate(4) hue-rotate(5deg)' }} />
            DEPARTURES
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.5)' }}>SEAT AIRLINES · GATE 178</div>
        </div>
        <div style={{ display: 'flex', gap: 40, fontFamily: MONO, fontSize: 18, letterSpacing: '0.2em', color: 'rgba(244,248,252,0.5)', marginBottom: 12 }}>
          {['FLIGHT', 'DESTINATION', 'MARKET CAP', 'STATUS'].map((h, c) => <div key={h} style={{ width: BOARD_COLS[c] * (tile * 0.7 + 4) }}>{h}</div>)}
        </div>
        {BOARD_ROWS.map((row, r) => {
          const cells = [pad(row.flight, 5), pad(row.dest, 8), pad(row.cap, 5), pad(row.status, 8)];
          let i = 0;
          const statusLanded = f >= tileLands(r, 25);
          const blink = row.status === 'BOARDING' && statusLanded ? (Math.floor(f / 12) % 2 ? 0.45 : 1) : 1;
          return (
            <div key={row.flight} style={{ display: 'flex', gap: 40, marginTop: 14 }}>
              {cells.map((text, c) => (
                <div key={c} style={{ display: 'flex', gap: 4, opacity: c === 3 ? blink : 1 }}>
                  {text.split('').map((ch) => {
                    const at = tileLands(r, i);
                    const key = i++;
                    return <FlapTile key={key} ch={ch} land={at} size={tile} seed={`b${r}-${key}`} color={c === 3 ? STATUS_COLOR[row.status] : c === 0 ? C.gold : C.ink} />;
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Layer>
  );
};

/* ── 6. End card ── */

export const EndCard: React.FC<SceneProps> = ({ frames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 2, fps, config: { damping: 11, stiffness: 120, mass: 0.9 } });
  const tracking = interpolate(f, [8, 40], [0.4, 0.1], { ...clamp, easing: easeOut });
  const name = interpolate(f, [8, 22], [0, 1], { ...clamp, easing: easeOut });
  const fly = interpolate(f, [12, 50], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const fadeOut = interpolate(f, [frames - 14, frames], [0, 1], clamp);
  return (
    <Layer style={{ background: 'radial-gradient(circle at 50% 36%, #2153c4 0%, #123A8F 30%, #071433 72%, #030814 100%)' }}>
      <Layer style={{
        backgroundImage: `url(${staticFile('brand/seat-airlines-mark-pattern.svg')})`, backgroundSize: '220px 220px',
        backgroundPosition: `${-f * 0.6}px ${-f * 0.3}px`, opacity: 0.06,
      }} />
      <Rays x={960} y={300} opacity={0.75} speed={0.18} />
      <Motes count={60} seed="end" />
      <div style={{ position: 'absolute', left: 960 - 190, top: 110, transform: `scale(${0.55 + 0.45 * s})`, opacity: Math.min(1, s * 1.5) }}>
        <Badge size={380} shine={(f - 14) / 28} glow={0.85} />
      </div>
      {/* The airliner crosses the name, as it does on the site. */}
      <div style={{ position: 'absolute', left: interpolate(fly, [0, 1], [-260, W + 120]), top: 560 + (0.5 - fly) * 60, transform: `rotate(${(0.5 - fly) * -6}deg)`, opacity: fly > 0 && fly < 1 ? 1 : 0 }}>
        <PlaneTop size={130} trailLength={1500} shadow={0.25} />
      </div>
      <div style={{
        position: 'absolute', left: 0, width: W, top: 540, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 124,
        letterSpacing: `${tracking}em`, paddingLeft: `${tracking}em`, opacity: name, transform: `translateY(${(1 - name) * 20}px)`,
        backgroundImage: 'linear-gradient(180deg, #FFFFFF 35%, #BFE6FF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.45))',
      }}>SEAT AIRLINES</div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 696, textAlign: 'center', fontFamily: SANS, fontWeight: 600, fontSize: 42, color: 'rgba(244,248,252,0.88)', opacity: interpolate(f, [22, 34], [0, 1], clamp) }}>
        Hold more. Fly higher.
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 778, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {'SEAT-AIRLINES.SPACE'.split('').map((ch, i) => <FlapTile key={i} ch={ch} land={28 + i * 0.8} size={44} seed={`url${i}`} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 880, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: '0.28em', color: C.cyan, opacity: interpolate(f, [40, 50], [0, 1], clamp) }}>
        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: C.cyan, marginRight: 16, verticalAlign: 'middle', opacity: Math.floor(f / 10) % 2 ? 0.35 : 1, boxShadow: '0 0 12px #00C9F1' }} />
        NOW BOARDING · BUILT ON SOLANA
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 1022, textAlign: 'center', fontFamily: MONO, fontSize: 18, color: 'rgba(244,248,252,0.55)' }}>
        Not affiliated with or endorsed by Solana Labs or the Solana Foundation.
      </div>
      <Layer style={{ background: '#000', opacity: fadeOut }} />
    </Layer>
  );
};

export const SCENES = { ignition: Ignition, sky: Sky, seats: Seats, climb: Climb, board: Board, end: EndCard } as const;
