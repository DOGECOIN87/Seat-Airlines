/**
 * "$SEAT is re-launching soon": a 15 s announcement for X, drawn in code like
 * the intro. Four beats: the PA warning, the departures board flipping from
 * DELAYED to RE-LAUNCHING, the badge, and where the new contract address will
 * (and will not) be posted. Its sound is sfx/relaunch.mjs, timed from BEATS.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge, C, FlapTile, Grain, Layer, MONO, Motes, PlaneTop, Rays, Rise, SANS, Stage, W, clamp } from '../intro/kit';
import beats from '../../config/relaunch.json';

export const BEATS = beats;
export const RELAUNCH_FRAMES = beats.total;
const AMBER = '#FFB020';
const RED = '#FF5A5A';
const eo = Easing.out(Easing.cubic);

/** A warning triangle, drawn (no emoji font to rely on). */
const Warn: React.FC<{ size: number; on?: boolean }> = ({ size, on = true }) => (
  <svg width={size} height={size * 0.88} viewBox="0 0 100 88" style={{ filter: on ? `drop-shadow(0 0 ${size * 0.25}px ${AMBER})` : 'none' }}>
    <path d="M50 4 L96 84 L4 84 Z" fill={on ? AMBER : '#6b5a2a'} stroke="#0b0f18" strokeWidth={4} strokeLinejoin="round" />
    <rect x={45} y={30} width={10} height={30} rx={4} fill="#0b0f18" />
    <circle cx={50} cy={71} r={6} fill="#0b0f18" />
  </svg>
);

/* ── 1. Attention all passengers ── */
const Announce: React.FC = () => {
  const f = useCurrentFrame();
  const blink = Math.floor(f / 8) % 2 === 0;
  const stripes = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: eo });
  return (
    <Layer style={{ background: 'radial-gradient(circle at 50% 45%, #2a2008 0%, #0b0f18 60%, #05070d 100%)' }}>
      {[0, 1].map((i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, width: W, height: 46, top: i ? 1080 - 46 : 0, transform: `scaleX(${stripes})`,
          backgroundImage: `repeating-linear-gradient(-45deg, ${AMBER} 0 34px, #0b0f18 34px 68px)`, backgroundPosition: `${f * 3}px 0`, opacity: 0.9,
        }} />
      ))}
      <div style={{ position: 'absolute', left: 0, width: W, top: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34, opacity: interpolate(f, [4, 10], [0, 1], clamp) }}>
        <Warn size={110} on={blink} />
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 104, letterSpacing: '0.08em', color: AMBER, textShadow: `0 0 40px ${AMBER}66` }}>ANNOUNCEMENT</div>
        <Warn size={110} on={blink} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 520, display: 'flex', justifyContent: 'center' }}>
        <Rise text="ATTENTION ALL PASSENGERS" from={20} size={88} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 670, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 34, letterSpacing: '0.3em', color: 'rgba(244,248,252,0.75)', opacity: interpolate(f, [40, 52], [0, 1], clamp) }}>
        A MESSAGE FROM THE FLIGHT DECK
      </div>
    </Layer>
  );
};

/* ── 2. The board flips ── */
const Row: React.FC<{ label: string; text: string; land: number; color?: string; size?: number; seed: string; width: number }> = ({ label, text, land, color, size = 74, seed, width }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginTop: 30 }}>
    <div style={{ width: 300, textAlign: 'right', fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: '0.24em', color: 'rgba(244,248,252,0.55)' }}>{label}</div>
    <div style={{ display: 'flex', gap: 5 }}>
      {text.padEnd(width, ' ').split('').map((ch, i) => <FlapTile key={`${seed}${text}${i}`} ch={ch} land={land + i * 0.8} size={size} seed={`${seed}${text}${i}`} color={color} />)}
    </div>
  </div>
);

const BoardBeat: React.FC = () => {
  const f = useCurrentFrame();
  const flip = BEATS.boardFlip;
  const flipped = f >= flip - 10;
  const blink = f > flip + 24 ? (Math.floor(f / 12) % 2 ? 0.45 : 1) : 1;
  return (
    <Layer style={{ background: 'linear-gradient(180deg, #0b1220 0%, #070b14 100%)' }}>
      <div style={{ position: 'absolute', left: 0, width: W, top: 200, textAlign: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 46, letterSpacing: '0.24em', color: C.gold, paddingLeft: '0.24em' }}>DEPARTURES</div>
      <div style={{ position: 'absolute', left: 250, top: 330, transform: `translateY(${interpolate(f, [0, 12], [30, 0], { ...clamp, easing: eo })}px)`, opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
        <Row label="FLIGHT" text="$SEAT" land={6} seed="fl" width={12} />
        <Row label="STATUS" text={flipped ? 'RE-LAUNCHING' : 'DELAYED'} land={flipped ? flip : 14} color={flipped ? C.cyan : RED} seed="st" width={12} />
        <div style={{ opacity: blink }}><Row label="DEPARTS" text="SOON" land={flip + 16} color={C.gold} seed="dp" width={12} /></div>
      </div>
    </Layer>
  );
};

/* ── 3. The badge ── */
const BadgeBeat: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = BEATS.badgeLand;
  const p = interpolate(f, [0, land], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const scale = interpolate(p, [0, 1], [3, 1]) * (f > land ? 1 + 0.05 * Math.exp(-(f - land) / 5) * Math.cos((f - land) * 0.9) : 1);
  const stamp = spring({ frame: f - BEATS.stamp, fps, config: { damping: 9, stiffness: 160 } });
  return (
    <Layer style={{ background: 'radial-gradient(circle at 50% 36%, #2153c4 0%, #123A8F 30%, #071433 72%, #030814 100%)' }}>
      <Rays x={960} y={330} opacity={interpolate(f, [land, land + 20], [0, 0.8], clamp)} />
      <Motes count={60} seed="rl" />
      <div style={{ position: 'absolute', left: 960 - 190, top: 140, transform: `scale(${scale})`, opacity: interpolate(f, [0, 5], [0, 1], clamp) }}>
        <Badge size={380} shine={(f - land - 6) / 26} glow={f > land ? 0.85 : 0} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 590, display: 'flex', justifyContent: 'center' }}>
        <Rise text="$SEAT IS RE-LAUNCHING" from={land + 4} size={112} />
      </div>
      <div style={{
        position: 'absolute', left: 960 - 230, top: 760, width: 460, height: 140, borderRadius: 18, border: `8px solid ${C.cyan}`, color: C.cyan,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 100, letterSpacing: '0.12em', paddingLeft: '0.12em',
        transform: `rotate(-6deg) scale(${f < BEATS.stamp ? 0 : 2.2 - 1.2 * stamp})`, opacity: f < BEATS.stamp ? 0 : Math.min(1, stamp * 1.5),
        boxShadow: `0 0 40px ${C.cyan}55, inset 0 0 30px ${C.cyan}33`,
      }}>SOON</div>
    </Layer>
  );
};

/* ── 4. Where the new CA is posted, and the sign-off ── */
const SafetyBeat: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  const fly = interpolate(f, [BEATS.flyover, BEATS.flyover + 40], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const out = interpolate(f, [frames - 14, frames], [0, 1], clamp);
  const item = (i: number, ok: boolean, text: string) => {
    const k = interpolate(f, [10 + i * 10, 22 + i * 10], [0, 1], { ...clamp, easing: eo });
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginTop: 26, opacity: k, transform: `translateX(${(1 - k) * -30}px)` }}>
        <div style={{ width: 62, height: 62, borderRadius: 31, background: ok ? '#4ADE80' : RED, color: '#0b1324', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 900, fontSize: 38 }}>{ok ? '✓' : '✕'}</div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 46, color: C.ink }}>{text}</div>
      </div>
    );
  };
  return (
    <Layer style={{ background: 'radial-gradient(ellipse at 50% 30%, #13284f 0%, #0a1630 45%, #050A14 100%)' }}>
      <div style={{ position: 'absolute', left: 520, top: 120 }}>
        <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: '0.3em', color: C.cyan, opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>THE NEW CONTRACT ADDRESS</div>
        {item(0, true, 'Posted ONLY on seat-airlines.space')}
        {item(1, true, 'and our official X account')}
        {item(2, false, 'A CA in your DMs is a fake')}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 640, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, opacity: interpolate(f, [BEATS.lockup, BEATS.lockup + 10], [0, 1], clamp) }}>
        <Badge size={130} glow={0.6} />
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 92, letterSpacing: '0.06em', backgroundImage: 'linear-gradient(180deg, #FFFFFF 35%, #BFE6FF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>SEAT AIRLINES</div>
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 820, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {'SEAT-AIRLINES.SPACE'.split('').map((ch, i) => <FlapTile key={i} ch={ch} land={BEATS.lockup + 8 + i * 0.8} size={46} seed={`rlu${i}`} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 930, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: '0.3em', color: C.cyan, opacity: interpolate(f, [BEATS.lockup + 26, BEATS.lockup + 36], [0, 1], clamp) }}>
        NOW BOARDING · SOON
      </div>
      <div style={{ position: 'absolute', left: interpolate(fly, [0, 1], [-300, W + 150]), top: 560 + (0.5 - fly) * 50, transform: `rotate(${(0.5 - fly) * -6}deg)`, opacity: fly > 0 && fly < 1 ? 1 : 0 }}>
        <PlaneTop size={120} trailLength={1500} shadow={0.25} />
      </div>
      <Layer style={{ background: '#000', opacity: out }} />
    </Layer>
  );
};

const Flash: React.FC = () => {
  const f = useCurrentFrame();
  return <Layer style={{ background: '#fff', opacity: interpolate(f, [0, 2, 12], [0.85, 0.6, 0], clamp) }} />;
};

export const Relaunch: React.FC = () => {
  const [a, b, c, d] = BEATS.scenes;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Stage>
        <Sequence from={0} durationInFrames={a} layout="none"><Announce /></Sequence>
        <Sequence from={a} durationInFrames={b} layout="none"><BoardBeat /><Flash /></Sequence>
        <Sequence from={a + b} durationInFrames={c} layout="none"><BadgeBeat /></Sequence>
        <Sequence from={a + b + c} durationInFrames={d} layout="none"><SafetyBeat frames={d} /><Flash /></Sequence>
        <Grain />
      </Stage>
      <Audio src={staticFile('sfx/relaunch.wav')} />
    </AbsoluteFill>
  );
};
