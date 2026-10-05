import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

/**
 * "New on Seat Airlines": a 19.5 s, 4:5 cut for X. Text-led (X plays muted),
 * with the real UI as large cropped cards. Same palette, type and sounds as
 * the main commercial. Every card is a real screenshot of the site, filmed by
 * capture/features/*.mjs: the wallet picker, the email and passkey sign-in
 * sheet (stand-in network answers, a made-up address, no account created), the
 * landing, the crash screen with Play again and its countdown, the tour, and
 * the "?" in the contract bar.
 */
export const NF_FPS = 30;
export const NF_W = 1080;
export const NF_H = 1350;
export const NF_SECONDS = 19.5;

const NAVY = '#0F1725';
const CYAN = '#00C9F1';
const INK = '#F4F8FC';
const SANS = 'Montserrat, sans-serif';
const MONO = '"IBM Plex Mono", monospace';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** A crop of a phone still (390×844 css px, saved at 2.5×) as a rounded card. */
const Crop: React.FC<{ src: string; y0: number; y1: number; width: number; x0?: number; x1?: number }> = ({ src, y0, y1, width, x0 = 0, x1 = 390 }) => {
  const k = width / (x1 - x0);
  return (
    <div style={{ width, height: (y1 - y0) * k, overflow: 'hidden', borderRadius: 36, position: 'relative', boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.1)' }}>
      <Img src={staticFile(`features/${src}.png`)} style={{ position: 'absolute', left: -x0 * k, top: -y0 * k, width: 390 * k, height: 844 * k }} />
    </div>
  );
};

const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, #1B2A47 0%, ${NAVY} 70%)` }}>
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile('brand/seat-airlines-mark-pattern.svg')})`, backgroundSize: '240px 240px', backgroundPosition: `${-f * 0.4}px ${-f * 0.2}px`, opacity: 0.06 }} />
    </AbsoluteFill>
  );
};

/** Words slam in one by one. */
const Slam: React.FC<{ lines: { text: string; color?: string }[]; size: number; delay?: number }> = ({ lines, size, delay = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  let n = 0;
  return (
    <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.01em', textAlign: 'center', color: INK, textShadow: '0 6px 40px rgba(0,0,0,0.45)' }}>
      {lines.map((l) => (
        <div key={l.text} style={{ color: l.color ?? INK }}>
          {l.text.split(' ').map((w) => {
            const s = spring({ frame: f - delay - 3 * n++, fps, config: { damping: 14, mass: 0.6 } });
            return <span key={w + n} style={{ display: 'inline-block', marginRight: '0.26em', opacity: s, transform: `translateY(${(1 - s) * 50}px) scale(${0.9 + 0.1 * s})` }}>{w}</span>;
          })}
        </div>
      ))}
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode; color?: string; size?: number }> = ({ children, color = CYAN, size = 34 }) => (
  <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: size, letterSpacing: '0.18em', color, textTransform: 'uppercase', textAlign: 'center' }}>{children}</div>
);

/** A scene's fade in/out with a small rise. */
const Scene: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 6, frames - 6, frames], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity: o, justifyContent: 'center', alignItems: 'center' }}>{children}</AbsoluteFill>;
};

const Rise: React.FC<{ delay?: number; children: React.ReactNode }> = ({ delay = 0, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 16, mass: 0.8 } });
  return <div style={{ transform: `translateY(${(1 - s) * 120}px) scale(${0.94 + 0.06 * s})`, opacity: interpolate(s, [0, 0.4], [0, 1], clamp) }}>{children}</div>;
};

/* ── The scenes ─────────────────────────────────────────────────────── */

/** A pulsing ring, drawn over a card, around the thing being pointed at. */
const Ring: React.FC<{ left: number; top: number; width: number; height: number; radius?: number }> = ({ left, top, width, height, radius = 28 }) => {
  const f = useCurrentFrame();
  const glow = interpolate(f % 40, [0, 20, 40], [0.45, 1, 0.45], clamp);
  return <div style={{ position: 'absolute', left, top, width, height, borderRadius: radius, boxShadow: `0 0 0 5px ${CYAN}, 0 0 56px ${CYAN}`, opacity: glow, pointerEvents: 'none' }} />;
};

const Hook: React.FC = () => (
  <div style={{ display: 'grid', gap: 36, justifyItems: 'center' }}>
    <Label>New on Seat Airlines</Label>
    <Slam size={150} lines={[{ text: 'NO' }, { text: 'WALLET?' }, { text: 'NO', color: CYAN }, { text: 'PROBLEM.', color: CYAN }]} delay={4} />
  </div>
);

/** The wallet picker, where Email or passkey sits beside the wallet apps. */
const Pick: React.FC = () => (
  <div style={{ display: 'grid', gap: 44, justifyItems: 'center' }}>
    <Slam size={104} lines={[{ text: 'JUST PICK' }, { text: 'EMAIL OR PASSKEY.', color: CYAN }]} />
    <Rise delay={8}>
      <div style={{ position: 'relative' }}>
        <Crop src="picker" y0={288} y1={556} x0={10} x1={380} width={880} />
        <Ring left={18} top={358} width={844} height={158} />
      </div>
    </Rise>
  </div>
);

/** The real sign-in sheet: the choices, an email typed in, the one-time code. */
const Sheet: React.FC = () => {
  const f = useCurrentFrame();
  const step = f < 38 ? 0 : f < 80 ? 1 : 2;
  const within = f - [0, 38, 80][step];
  const o = interpolate(within, [0, 6], [0, 1], clamp);
  const prev = Math.max(0, step - 1);
  const label = ['Email · Passkey · Phone', 'Type your email', 'Get a 6-digit code'][step];
  return (
    <div style={{ display: 'grid', gap: 36, justifyItems: 'center' }}>
      <Slam size={112} lines={[{ text: 'SIGN IN.' }, { text: 'GET A WALLET.', color: CYAN }]} />
      <Rise delay={6}>
        <div style={{ position: 'relative', width: 660, height: 870 }}>
          {step > 0 && <div style={{ position: 'absolute', inset: 0 }}><Crop src={`signin-${prev + 1}`} y0={330} y1={844} width={660} /></div>}
          <div style={{ position: 'absolute', inset: 0, opacity: step === 0 ? 1 : o }}><Crop src={`signin-${step + 1}`} y0={330} y1={844} width={660} /></div>
        </div>
      </Rise>
      <Label color="rgba(244,248,252,0.85)" size={32}>{label}</Label>
      <Label color="rgba(244,248,252,0.6)" size={24}>Your own Solana wallet · Powered by Helius</Label>
    </div>
  );
};

const Fly: React.FC = () => (
  <div style={{ display: 'grid', gap: 40, justifyItems: 'center' }}>
    <Slam size={96} lines={[{ text: 'CONNECT & FLY.', color: CYAN }]} />
    <Rise delay={8}>
      <div style={{ position: 'relative' }}>
        <Crop src="landing" y0={380} y1={720} x0={10} x1={380} width={800} />
        <Ring left={14} top={516} width={382} height={108} radius={54} />
      </div>
    </Rise>
    <Label color="rgba(244,248,252,0.85)" size={30}>Post your score with your new wallet</Label>
  </div>
);

/** The real crash screen, with Play again and the count to boarding ticking down. */
const Again: React.FC = () => {
  const f = useCurrentFrame();
  const shot = f < 30 ? 'crash-a' : f < 60 ? 'crash-b' : 'crash-c';
  const press = interpolate(f, [74, 78, 84], [1, 0.96, 1], clamp);
  return (
    <div style={{ display: 'grid', gap: 36, justifyItems: 'center' }}>
      <Slam size={112} lines={[{ text: 'CRASHED?' }, { text: 'PLAY AGAIN.', color: CYAN }]} />
      <Rise delay={6}>
        <div style={{ position: 'relative', transform: `scale(${press})` }}>
          <Crop src={shot} y0={AGAIN_CROP.y0} y1={AGAIN_CROP.y1} width={760} />
        </div>
      </Rise>
      <Label color="rgba(244,248,252,0.85)" size={30}>Then it boards you into the site</Label>
    </div>
  );
};

/** Which part of the crash screenshots (css px of 390×844) to show. */
const AGAIN_CROP = { y0: 190, y1: 790 };

const TOUR_PAGES = ['What it is', 'How seats work', 'Connect a wallet', 'How to buy'];
const TOUR_FRAMES = 72; // four pages, 0.6 s each

/** The tour, page by page. */
const TourPages: React.FC = () => {
  const f = useCurrentFrame();
  const page = Math.min(3, Math.floor(f / 18));
  const within = f - page * 18;
  const o = interpolate(within, [0, 5], [0, 1], clamp);
  return (
    <div style={{ display: 'grid', gap: 36, justifyItems: 'center' }}>
      <Slam size={112} lines={[{ text: 'TAKE THE TOUR.', color: CYAN }]} />
      <Rise delay={6}>
        <div style={{ opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
          <Crop src={`tour${page + 1}`} y0={150} y1={700} x0={8} x1={382} width={700} />
        </div>
      </Rise>
      <Label color="rgba(244,248,252,0.85)" size={32}>{`First visit · ${TOUR_PAGES[page]}`}</Label>
    </div>
  );
};

/** The way back: the real top of the site, the ? tapped, and the tour opening beneath it. */
const Replay: React.FC = () => {
  const f = useCurrentFrame();
  const k = 800 / 390; // the strip is the site's top 150 css px, shown 800 wide
  const cx = 345 * k;
  const cy = 52 * k;
  const ripple = interpolate(f, [16, 40], [0, 1], clamp);
  return (
    <div style={{ display: 'grid', gap: 36, justifyItems: 'center' }}>
      <Slam size={104} lines={[{ text: 'REPLAY IT' }, { text: 'ANYTIME.', color: CYAN }]} />
      <div style={{ position: 'relative' }}>
        <Crop src="site" y0={0} y1={150} x0={0} x1={390} width={800} />
        <Ring left={cx - 50} top={cy - 50} width={100} height={100} radius={50} />
        {ripple > 0 && ripple < 1 && (
          <div style={{ position: 'absolute', left: cx - 70, top: cy - 70, width: 140, height: 140, borderRadius: '50%', border: `6px solid ${CYAN}`, opacity: 1 - ripple, transform: `scale(${0.3 + ripple * 1.5})` }} />
        )}
      </div>
      <Rise delay={30}><Crop src="tour1" y0={215} y1={648} x0={8} x1={382} width={480} /></Rise>
      <Label color="rgba(244,248,252,0.85)" size={32}>Tap ? and the tour opens</Label>
    </div>
  );
};

const Tour: React.FC = () => (
  <>
    <Sequence durationInFrames={TOUR_FRAMES}><Scene frames={TOUR_FRAMES}><TourPages /></Scene></Sequence>
    <Sequence from={TOUR_FRAMES}><Scene frames={48}><Replay /></Scene></Sequence>
  </>
);

const End: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 18 } });
  return (
    <div style={{ display: 'grid', gap: 34, justifyItems: 'center', transform: `scale(${0.94 + 0.06 * s})`, opacity: s }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <Img src={staticFile('brand/seat-airlines-logo.svg')} style={{ width: 120, height: 120 }} />
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 88, letterSpacing: '0.04em', color: INK }}>SEAT AIRLINES</div>
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 58, color: CYAN, letterSpacing: '0.06em' }}>SEAT-AIRLINES.SPACE</div>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 36, color: 'rgba(244,248,252,0.85)' }}>Your bag is your seat.</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: 'rgba(244,248,252,0.6)', textAlign: 'center', maxWidth: 900, lineHeight: 1.5, marginTop: 20 }}>
        Google, Apple, Discord and X sign-in coming soon.<br />Not financial advice. Only buy what you can afford to lose.
      </div>
    </div>
  );
};

/* ── The cut ────────────────────────────────────────────────────────── */

const PLAN: { id: string; at: number; seconds: number; node: React.ReactNode; whoosh?: boolean }[] = [
  { id: 'hook', at: 0, seconds: 2, node: <Hook /> },
  { id: 'pick', at: 2, seconds: 2, node: <Pick />, whoosh: true },
  { id: 'sheet', at: 4, seconds: 4, node: <Sheet />, whoosh: true },
  { id: 'fly', at: 8, seconds: 2.5, node: <Fly />, whoosh: true },
  { id: 'again', at: 10.5, seconds: 3, node: <Again />, whoosh: true },
  { id: 'tour', at: 13.5, seconds: 4, node: <Tour />, whoosh: true },
  { id: 'end', at: 17.5, seconds: 2, node: <End />, whoosh: true },
];

const sfx = (file: string, at: number, volume: number, key: string) => (
  <Sequence key={key} from={Math.max(0, Math.round(at * NF_FPS))} layout="none"><Audio src={staticFile(file)} volume={volume} /></Sequence>
);

export const NewFeatures: React.FC = () => (
  <AbsoluteFill style={{ background: NAVY }}>
    <Backdrop />
    {PLAN.map((p) => (
      <Sequence key={p.id} from={Math.round(p.at * NF_FPS)} durationInFrames={Math.round(p.seconds * NF_FPS)}>
        <Scene frames={Math.round(p.seconds * NF_FPS)}>{p.node}</Scene>
      </Sequence>
    ))}
    {sfx('audio/chime.wav', 0.05, 0.8, 'chime')}
    {sfx('audio/impact.wav', 0.3, 0.7, 'hit')}
    {PLAN.filter((p) => p.whoosh).map((p) => sfx('audio/whoosh.wav', p.at - 0.15, 0.45, `w-${p.id}`))}
    {/* The count ticking down on the crash screen, once a second (the shots change every second). */}
    {[0, 1, 2].map((i) => sfx('audio/tick.wav', 10.5 + 0.6 + i * 1.0, 0.4, `tick${i}`))}
    {sfx('audio/riser.wav', 17.5 - 1.0, 0.4, 'riser')}
    {[0, 4.5, 9, 13.5, 18].map((startSec, i) => {
      const start = Math.round(startSec * NF_FPS);
      const dur = Math.min(NF_SECONDS * NF_FPS - start, Math.round(5.5 * NF_FPS));
      return (
        <Sequence key={`hum${i}`} from={start} durationInFrames={dur} layout="none">
          <Audio src={staticFile('audio/hum.wav')} volume={(f: number) => Math.min(interpolate(f, [0, 8], [0, 0.2], clamp), interpolate(f, [dur - 12, dur], [0.2, 0], clamp))} />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
