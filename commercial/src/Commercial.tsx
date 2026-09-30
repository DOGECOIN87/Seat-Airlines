import React from 'react';
import {
  AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Easing, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, random,
} from 'remotion';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import climb from '../config/climb.json';
import { type Scene, starts, totalFrames } from './config/timeline';

/* The app's own palette (src/index.css, tailwind.config.js). */
const NAVY = '#0F1725';
const CYAN = '#00C9F1';
const INK = '#F4F8FC';
const SANS = 'Montserrat, sans-serif';
const MONO = '"IBM Plex Mono", monospace';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* ── Pieces ─────────────────────────────────────────────────────────── */

const Clip: React.FC<{ src: string; from: number; push?: boolean; frames: number; focus?: Scene['focus']; focusEnd?: Scene['focus'] }> = ({ src, from, push, frames, focus, focusEnd }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = (focus?.scale ?? 1) * (push ? interpolate(f, [0, frames], [1, 1.04], clamp) : 1);
  // Animated focus: interpolate between focus and focusEnd for a camera pan.
  const prog = focusEnd ? interpolate(f, [0, frames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 0;
  const fx = focusEnd ? (focus?.x ?? 0.5) + prog * ((focusEnd.x ?? 0.5) - (focus?.x ?? 0.5)) : (focus?.x ?? 0.5);
  const fy = focusEnd ? (focus?.y ?? 0.5) + prog * ((focusEnd.y ?? 0.5) - (focus?.y ?? 0.5)) : (focus?.y ?? 0.5);
  // Bring the focus point to the centre, never so far that an edge shows.
  const room = 0.5 - 0.5 / scale;
  const dx = focus ? Math.max(-room, Math.min(room, 0.5 - fx)) : 0;
  const dy = focus ? Math.max(-room, Math.min(room, 0.5 - fy)) : 0;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale}) translate(${dx * 100}%, ${dy * 100}%)` }}>
      <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * fps)} muted />
    </AbsoluteFill>
  );
};

/** Captions: bottom centre, inside 5% title-safe, 48px. */
const Caption: React.FC<{ text: string; frames: number }> = ({ text, frames }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 4, frames - 4, frames], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 54 + 40 }}>
      <div style={{
        opacity: o, fontFamily: SANS, fontWeight: 600, fontSize: 48, color: INK, maxWidth: 1728, textAlign: 'center',
        background: 'rgba(8,12,22,0.62)', padding: '12px 28px', borderRadius: 10, letterSpacing: '0.01em',
      }}>{text}</div>
    </AbsoluteFill>
  );
};

/** A kinetic headline, word by word on a spring. */
const Headline: React.FC<{ lines: string[] }> = ({ lines }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  let w = 0;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(90deg, rgba(8,12,22,0.55), rgba(8,12,22,0.1))' }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 128, lineHeight: 1.02, color: INK, textAlign: 'center', letterSpacing: '-0.01em', textShadow: '0 6px 40px rgba(0,0,0,0.45)' }}>
        {lines.map((line) => (
          <div key={line}>
            {line.split(' ').map((word) => {
              const s = spring({ frame: f - 3 * w++, fps, config: { damping: 16, mass: 0.6 } });
              return (
                <span key={word + w} style={{ display: 'inline-block', marginRight: '0.28em', opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>{word}</span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Departure-board letters, each flipping through a few glyphs before landing. */
const SplitFlap: React.FC<{ text: string; size: number; delay?: number }> = ({ text, size, delay = 0 }) => {
  const f = useCurrentFrame() - delay;
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-';
  return (
    <div style={{ display: 'flex', gap: size * 0.08, fontFamily: MONO, fontWeight: 600, fontSize: size }}>
      {text.split('').map((ch, i) => {
        const land = 3 + i * 0.8;
        const shown = f >= land || ch === ' ' ? ch : f < 0 ? ' ' : glyphs[Math.floor(random(`${text}${i}${Math.floor(f / 2)}`) * glyphs.length)];
        return (
          <span key={i} style={{
            width: size * 0.72, textAlign: 'center', color: INK, background: ch === ' ' ? 'transparent' : '#141F33',
            borderRadius: size * 0.08, boxShadow: ch === ' ' ? 'none' : 'inset 0 -2px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            backgroundImage: ch === ' ' ? 'none' : 'linear-gradient(180deg, transparent 49%, rgba(0,0,0,0.55) 50%, transparent 51%)',
          }}>{shown}</span>
        );
      })}
    </div>
  );
};

/**
 * The altitude-band showcase overlay: 5 bands × 0.8 s each (24 frames at 30 fps).
 * Matches the capture schedule in capture/scenes/altitudes.mjs.
 */
const ALT_BANDS = [
  { name: 'WEATHER',  cap: '< $1M',   color: '#7EC8E3' }, // clear blue
  { name: 'CLOUDS',   cap: '$1M+',    color: '#E0ECF8' }, // bright white-blue
  { name: 'SPACE',    cap: '$10M+',   color: '#4B6FA5' }, // deep indigo
  { name: 'MOON',     cap: '$50M+',   color: '#C8C8C8' }, // lunar grey
  { name: 'MARS',     cap: '$100M+',  color: '#E06030' }, // rust
] as const;
const BAND_FRAMES = 24; // 0.8 s at 30 fps per band

const AltBandHud: React.FC = () => {
  const f = useCurrentFrame();
  const band = Math.min(ALT_BANDS.length - 1, Math.floor(f / BAND_FRAMES));
  const within = f - band * BAND_FRAMES;
  const o = interpolate(within, [0, 6, BAND_FRAMES - 6, BAND_FRAMES], [0, 1, 1, 0], clamp);
  const { name, cap, color } = ALT_BANDS[band];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: 80, top: 72,
        opacity: o, transform: `translateY(${(1 - o) * -14}px)`,
        fontFamily: MONO, color: INK,
        background: 'rgba(5,7,15,0.72)', border: '1px solid rgba(255,255,255,0.12)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 10, padding: '18px 28px', minWidth: 260,
      }}>
        <div style={{ fontSize: 18, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>ALTITUDE BAND</div>
        <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, letterSpacing: '0.02em', color }}>{name}</div>
        <div style={{ fontSize: 38, marginTop: 6, letterSpacing: '0.06em' }}>{cap}</div>
      </div>
    </AbsoluteFill>
  );
};

/** The market-cap readout for the climb, from the same ramp the capture used. Formatted as the app's formatCap. */
const formatCap = (n: number) => (n >= 999_500 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`);
const capAt = (t: number) => {
  const u = Math.min(1, Math.max(0, t / climb.rampSeconds));
  return climb.from + (climb.to - climb.from) * u * u;
};
const ClimbHud: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const cap = capAt(t);
  const crossed = Math.round(climb.crossAtSeconds * fps);
  const flag = spring({ frame: f - crossed, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 96, top: 80, fontFamily: MONO, color: INK, background: 'rgba(5,7,15,0.7)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '18px 28px' }}>
        <div style={{ fontSize: 22, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)' }}>MARKET CAP · ALTITUDE</div>
        <div style={{ fontSize: 72, fontWeight: 600, marginTop: 6 }}>{formatCap(cap)}</div>
        <div style={{ fontSize: 28, color: CYAN }}>{Math.round(cap).toLocaleString('en-US')} ft</div>
      </div>
      <div style={{ position: 'absolute', right: 96, top: 96, opacity: flag, transform: `translateY(${(1 - flag) * -30}px)`, fontFamily: SANS, fontWeight: 800, fontSize: 56, color: NAVY, background: CYAN, padding: '14px 30px', borderRadius: 10, letterSpacing: '0.04em' }}>
        ABOVE THE CLOUDS
      </div>
      <div style={{ position: 'absolute', right: 96, bottom: 60, fontFamily: MONO, fontSize: 28, color: 'rgba(255,255,255,0.85)', background: 'rgba(5,7,15,0.55)', padding: '6px 14px', borderRadius: 6 }}>
        Simulated flight. Not financial advice.
      </div>
    </AbsoluteFill>
  );
};

/**
 * The app's own top-down airliner (public/plane-top.svg), crossing the frame
 * with two contrails, the way it crosses the wordmark on the site.
 * `frames` is the whole crossing; `size` the plane's height in px.
 */
const PlaneFlyover: React.FC<{ frames: number; size?: number; y?: number; tilt?: number }> = ({ frames, size = 300, y = 0.5, tilt = -6 }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = interpolate(f, [0, frames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const w = size * 1.1034;
  const x = interpolate(k, [0, 1], [-w - 40, width + 40]);
  const trail = interpolate(k, [0, 0.5], [0.05, 1], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: x, top: height * y - size / 2 + (0.5 - k) * 60, width: w, height: size, transform: `rotate(${tilt * (1 - 2 * k) * 0.3}deg)` }}>
        {[37.1, 62.9].map((top) => (
          <div key={top} style={{
            position: 'absolute', right: '49%', top: `${top}%`, width: width * 1.2 * trail, height: Math.max(3, size * 0.045),
            transform: 'translateY(-50%)', borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 55%, rgba(255,255,255,0.95) 92%, rgba(255,255,255,0) 100%)',
          }} />
        ))}
        <Img src={staticFile('brand/plane-top.svg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: `drop-shadow(${size * 0.1}px ${size * 0.16}px ${size * 0.05}px rgba(10,26,50,0.35))` }} />
      </div>
    </AbsoluteFill>
  );
};

/** The airline's badge, small in the corner over the app footage. */
const LogoBug: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 0.9, 0.9, 0], clamp);
  return (
    <div style={{ position: 'absolute', right: 72, bottom: 64, width: 84, height: 84, opacity: o, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.45))' }}>
      <Img src={staticFile('brand/seat-airlines-logo.svg')} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ background: NAVY, justifyContent: 'center', alignItems: 'center', fontFamily: SANS, color: INK }}>
      {/* The site's seat-mark pattern, faint, drifting. */}
      <AbsoluteFill style={{
        backgroundImage: `url(${staticFile('brand/seat-airlines-mark-pattern.svg')})`, backgroundSize: '220px 220px',
        backgroundPosition: `${-f * 0.6}px ${-f * 0.3}px`, opacity: 0.07,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, transform: `scale(${0.94 + 0.06 * s})`, opacity: s }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <Img src={staticFile('brand/seat-airlines-logo.svg')} style={{ width: 132, height: 132 }} />
          <div style={{ fontWeight: 800, fontSize: 104, letterSpacing: '0.04em' }}>SEAT AIRLINES</div>
        </div>
        <SplitFlap text="SEAT-AIRLINES.SPACE" size={52} delay={4} />
        <div style={{ fontSize: 34, fontWeight: 600, color: 'rgba(244,248,252,0.8)' }}>One plane. Everyone&apos;s in it. Your bag is your seat.</div>
        <div style={{ fontFamily: MONO, fontSize: 30, letterSpacing: '0.2em', color: CYAN }}>NOW BOARDING · BUILT ON SOLANA</div>
      </div>
      <div style={{ position: 'absolute', bottom: 54, fontFamily: MONO, fontSize: 28, color: 'rgba(244,248,252,0.7)' }}>
        Not affiliated with or endorsed by Solana Labs or the Solana Foundation.
      </div>
      {/* The airliner crosses the name, as it does on the site. */}
      <Sequence from={6} layout="none"><PlaneFlyover frames={34} size={150} y={0.36} /></Sequence>
    </AbsoluteFill>
  );
};

/** Film grain (2.5%) and a whisper of vignette, both driven by the frame. */
const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const seed = f % 8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.025, mixBlendMode: 'overlay' }}>
        <filter id={`g${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} /></filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.22) 100%)' }} />
    </AbsoluteFill>
  );
};

/* ── A scene, with its way in ──────────────────────────────────────── */

const Enter: React.FC<{ kind: Scene['transitionIn']['kind']; frames: number; children: React.ReactNode }> = ({ kind, frames, children }) => {
  const f = useCurrentFrame();
  const k = frames ? interpolate(f, [0, frames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1;
  if (kind === 'fade') return <AbsoluteFill style={{ opacity: k }}>{children}</AbsoluteFill>;
  if (kind === 'wipeUp') return <AbsoluteFill style={{ clipPath: `inset(${(1 - k) * 100}% 0 0 0)` }}>{children}</AbsoluteFill>;
  if (kind === 'slideUp') return <AbsoluteFill style={{ transform: `translateY(${(1 - k) * 100}%)` }}>{children}</AbsoluteFill>;
  if (kind === 'flash') {
    return (
      <AbsoluteFill>
        {children}
        <AbsoluteFill style={{ background: '#fff', opacity: interpolate(f, [0, 2, frames], [0.9, 0.6, 0], clamp) }} />
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill>{children}</AbsoluteFill>;
};

const SceneBody: React.FC<{ scene: Scene; frames: number }> = ({ scene, frames }) => (
  <AbsoluteFill style={{ background: NAVY }}>
    {scene.clip && <Clip src={scene.clip.src} from={scene.clip.from} push={scene.push} frames={frames} focus={scene.focus} focusEnd={scene.focusEnd} />}
    {scene.id === 'intro' && (
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 84 }}>
        <Sequence from={20} layout="none"><SplitFlap text="FLIGHT SA350" size={52} /></Sequence>
      </AbsoluteFill>
    )}
    {scene.id === 'splash' && (
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: 64 }}>
        <SplitFlap text="SA350" size={40} delay={10} />
      </AbsoluteFill>
    )}
    {scene.id === 'hero' && <Headline lines={['NETWORK BUILD', 'TO THE MOON.']} />}
    {scene.id === 'seats' && <Headline lines={['YOUR BAG', 'IS YOUR SEAT.']} />}
    {scene.id === 'seats_scroll' && <Caption text="178 seats. One flight." frames={frames} />}
    {scene.id === 'altitudes' && <AltBandHud />}
    {scene.id === 'advert' && <Caption text="Your ad, on board." frames={frames} />}
    {scene.id === 'deck' && <Caption text="The top two holders fly it." frames={frames} />}
    {scene.id === 'hold' && <Caption text="Below the cutoff? You ride in the hold." frames={frames} />}
    {scene.id === 'climb' && <ClimbHud />}
    {(scene.id === 'endcard' || scene.id === 'brandopen') && <EndCard />}
    {scene.id !== 'intro' && scene.id !== 'endcard' && scene.id !== 'brandopen' && scene.id !== 'hero' && scene.id !== 'seats' && scene.id !== 'seats_scroll' && scene.id !== 'altitudes' && <LogoBug frames={frames} />}
  </AbsoluteFill>
);

/* ── The cut ───────────────────────────────────────────────────────── */

const sfx = (file: string, at: number, volume = 1, key = file + at) => (
  <Sequence key={key} from={Math.max(0, Math.round(at * 30))} layout="none">
    <Audio src={staticFile(file)} volume={volume} />
  </Sequence>
);

export const Commercial: React.FC<{ order: Scene[] }> = ({ order }) => {
  const { fps } = useVideoConfig();
  const at = starts(order);
  const total = totalFrames(order);
  const idx = (id: Scene['id']) => order.findIndex((s) => s.id === id);
  const t = (id: Scene['id']) => at[idx(id)] / fps;
  const climbAt = t('climb');
  const breakAt = climbAt + climb.crossAtSeconds;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {order.map((scene, i) => {
        const slot = Math.round(scene.seconds * fps);
        const tail = order[i + 1]?.transitionIn.frames ?? 0;
        return (
          <Sequence key={scene.id} from={at[i]} durationInFrames={slot + tail}>
            <Enter kind={i === 0 ? 'fade' : scene.transitionIn.kind} frames={scene.transitionIn.frames}>
              <SceneBody scene={scene} frames={slot + tail} />
            </Enter>
          </Sequence>
        );
      })}

      {/* Voice and captions, placed by scene. */}
      {order.flatMap((scene, i) => (scene.vo ?? []).map((cue) => {
        const from = at[i] + Math.round(cue.at * fps);
        return (
          <Sequence key={cue.file} from={from} durationInFrames={Math.ceil((cue.seconds + 0.3) * fps)}>
            <Audio src={staticFile(cue.file)} />
            {cue.captions.map((c) => (
              <Sequence key={c.text} from={Math.round(c.from * fps)} durationInFrames={Math.round((c.to - c.from) * fps)}>
                <Caption text={c.text} frames={Math.round((c.to - c.from) * fps)} />
              </Sequence>
            ))}
          </Sequence>
        );
      }))}

      {/* Sound design: all synthesized (see CREDITS.md). */}
      {sfx('audio/chime.wav', 0, 0.8)}
      {/* Background hum tiled across the whole cut: the 5 s clip placed every 4.5 s. */}
      {Array.from({ length: Math.ceil(total / fps / 4.5) }, (_, i) => i * 4.5).map((startSec, i) => {
        const startFrame = Math.round(startSec * fps);
        const dur = Math.min(total - startFrame, Math.round(5.5 * fps));
        if (dur <= 0) return null;
        return (
          <Sequence key={`hum${i}`} from={startFrame} durationInFrames={dur} layout="none">
            <Audio src={staticFile('audio/hum.wav')} volume={(f: number) => {
              const fadeIn = interpolate(f, [0, 8], [0, 0.28], clamp);
              const fadeOut = interpolate(f, [dur - 12, dur], [0.28, 0], clamp);
              return Math.min(fadeIn, fadeOut);
            }} />
          </Sequence>
        );
      })}
      {order.map((s, i) => (s.transitionIn.kind === 'wipeUp' || s.transitionIn.kind === 'slideUp' || s.transitionIn.kind === 'fade') && i > 0
        ? sfx('audio/whoosh.wav', at[i] / fps - 0.25, 0.45, `w${i}`) : null)}
      {sfx('audio/riser.wav', breakAt - 1.2, 0.5)}
      {sfx('audio/impact.wav', breakAt, 0.9)}
      {sfx('audio/tick.wav', t('endcard') + 0.2, 0.25)}

      {/* The app's airliner sweeps across the cut out of the intro, over the whole frame. */}
      <Sequence from={at[idx('splash')] - 12} durationInFrames={30} layout="none">
        <PlaneFlyover frames={30} size={380} y={0.52} />
      </Sequence>

      <Grain />
      {/* Guard: nothing past the cap. */}
      <Sequence from={total} layout="none"><AbsoluteFill style={{ background: NAVY }} /></Sequence>
    </AbsoluteFill>
  );
};
