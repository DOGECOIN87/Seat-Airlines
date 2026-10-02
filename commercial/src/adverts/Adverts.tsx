/**
 * "Every seat is a billboard": the adverts explainer. The real site, recorded
 * (capture/scenes/adverts-wall.mjs), captioned as it plays; then how to put an
 * advert up, and how it follows the wallet, drawn in the site's own soft-UI
 * kit. Its sound is sfx/adverts.mjs, on the frames in config/adverts.json.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Badge, FlapTile, Grain, Layer, MONO, Rise, SANS, Stage, W, clamp } from '../intro/kit';
import { Kicker, Panel, UI, popIn } from '../intro/scenes';
import cfg from '../../config/adverts.json';

export const ADVERTS_FRAMES = cfg.scenes.reduce((a, s) => a + s.frames, 0);
const XF = 10;
const eo = Easing.out(Easing.cubic);
const fadeIn = (f: number, at = 0, d = 12) => interpolate(f, [at, at + d], [0, 1], { ...clamp, easing: eo });
const AD = 'brand/advert-nimbus.png';

const Ground: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Layer style={{ background: `radial-gradient(ellipse at 50% 40%, #EDEEF1 0%, ${UI.bg} 60%, #D3D5DA 100%)` }}>{children}</Layer>
);

/* ── Title ── */
const Title: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <div style={{ position: 'absolute', left: 960 - 130, top: 170, transform: `scale(${0.7 + 0.3 * popIn(f, 2)})`, opacity: fadeIn(f, 0, 8) }}>
        <Badge size={260} shine={(f - 14) / 26} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 480, textAlign: 'center' }}>
        <Kicker style={{ opacity: fadeIn(f, 8), letterSpacing: '0.4em' }}>THE WALL</Kicker>
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 540, display: 'flex', justifyContent: 'center' }}>
        <Rise text="Every seat is a billboard." from={12} size={104} color={UI.ink} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 700, textAlign: 'center', fontFamily: SANS, fontWeight: 600, fontSize: 38, color: UI.soft, opacity: fadeIn(f, 30) }}>
        Here's how adverts work on Seat Airlines.
      </div>
    </Ground>
  );
};

/* ── The real site, captioned ── */
type Cap = { from: number; to: number; kicker: string; text: string };
const CAPTIONS: Cap[] = cfg.captions;

const Caption: React.FC<{ c: Cap }> = ({ c }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [c.from, c.from + 10, c.to - 8, c.to], [0, 1, 1, 0], clamp);
  return (
    <div style={{
      position: 'absolute', left: 70, bottom: 120, width: 860, padding: '26px 32px', borderRadius: 24, boxSizing: 'border-box',
      background: UI.face, boxShadow: '0 24px 60px rgba(5,10,20,0.45), -4px -4px 12px rgba(255,255,255,0.6)',
      opacity: k, transform: `translateY(${(1 - k) * 24}px)`,
    }}>
      <Kicker>{c.kicker}</Kicker>
      <div style={{ marginTop: 10, fontFamily: SANS, fontWeight: 700, fontSize: 34, lineHeight: 1.35, color: UI.ink }}>{c.text}</div>
    </div>
  );
};

const Recording: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  const push = interpolate(f, [cfg.dialogAt - 10, frames], [1, 1.06], { ...clamp, easing: Easing.inOut(Easing.sin) });
  return (
    <Layer style={{ background: '#0B1324' }}>
      <Layer style={{ transform: `scale(${push})`, transformOrigin: '50% 45%' }}>
        <OffthreadVideo src={staticFile('clips/adverts-wall.mp4')} style={{ width: W, height: 1080 }} />
      </Layer>
      {CAPTIONS.map((c) => <Caption key={c.from} c={c} />)}
    </Layer>
  );
};

/* ── How to put yours up ── */
const STEPS = [
  { title: 'Take your seat', text: 'Check in with your wallet. Seated holders can advertise, on their own seat.', chip: null },
  { title: 'Open your seat', text: 'On the wall, select your seat (it is lit blue) and press', chip: 'ghost:Advertise here' },
  { title: 'Add your image', text: 'Drop, paste or choose an image. Frame the square, then add a description and an optional link.', chip: null },
  { title: 'Sign & publish', text: 'Approve the message in your wallet. It is a signature, not a transaction: it moves no funds.', chip: 'cta:Sign & publish' },
];

const Steps: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <div style={{ position: 'absolute', left: 130, top: 330, width: 640 }}>
        <Kicker style={{ opacity: fadeIn(f) }}>HOW TO</Kicker>
        <div style={{ marginTop: 18 }}><Rise text="Put your advert up." from={4} size={88} color={UI.ink} /></div>
        <div style={{ marginTop: 22, fontFamily: SANS, fontWeight: 600, fontSize: 32, lineHeight: 1.4, color: UI.soft, opacity: fadeIn(f, 16) }}>
          Four steps. It costs nothing, and the PA announces it to the cabin.
        </div>
      </div>
      {STEPS.map((s, i) => {
        const at = cfg.stepAt[i];
        const k = fadeIn(f, at, 14);
        const [kind, label] = s.chip?.split(':') ?? [];
        return (
          <Panel key={s.title} style={{ left: 860, top: 110 + i * 222, width: 940, height: 196, opacity: k, transform: `translateX(${(1 - k) * 60}px)` }}>
            <div style={{ position: 'absolute', left: 34, top: 34, width: 72, height: 72, borderRadius: 36, background: UI.accentText, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 34, boxShadow: UI.eSm, transform: `scale(${popIn(f, at + 2) || 0})` }}>{i + 1}</div>
            <div style={{ position: 'absolute', left: 136, top: 32, right: 36, paddingRight: i === 2 ? 150 : 0 }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 36, color: UI.ink }}>{s.title}</div>
              <div style={{ marginTop: 8, fontFamily: SANS, fontWeight: 600, fontSize: 25, lineHeight: 1.4, color: UI.soft }}>
                {s.text}
                {kind === 'ghost' && <span style={{ display: 'inline-block', marginLeft: 12, padding: '6px 18px', borderRadius: 999, background: UI.face, boxShadow: UI.e, fontWeight: 800, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.deep, verticalAlign: 'middle', transform: `scale(${f >= at + 26 && f < at + 30 ? 0.94 : 1})` }}>{label}</span>}
              </div>
              {kind === 'cta' && <div style={{ position: 'absolute', right: 0, top: 0, padding: '12px 26px', borderRadius: 14, background: UI.accentText, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: UI.eSm, transform: `scale(${f >= at + 26 && f < at + 30 ? 0.94 : 1})` }}>{label}</div>}
              {i === 2 && (
                <Img src={staticFile(AD)} style={{ position: 'absolute', right: 0, top: -6, width: 120, height: 120, borderRadius: 16, boxShadow: UI.e, transform: `scale(${popIn(f, at + 20)})` }} />
              )}
            </div>
          </Panel>
        );
      })}
    </Ground>
  );
};

/* ── It follows the wallet ── */
const TILES = ['3A', '3F', '4A', '4C', '4D', '4F', '5A', '5C', '5D', '5F', '6A', '6F'];
const HOUSE = ['#0087EA', '#7C5CC4', '#00A3A3', '#D9457A', '#2F6FD6', '#F2994A'];

const Follows: React.FC = () => {
  const f = useCurrentFrame();
  const tile = 140, gap = 22, gx = 1010, gy = 300;
  const pos = (i: number) => ({ x: gx + (i % 4) * (tile + gap), y: gy + Math.floor(i / 4) * (tile + gap) });
  const from = 10, to = 3;
  const m = interpolate(f, [cfg.moveAt, cfg.moveAt + 22], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const a = pos(from), b = pos(to);
  return (
    <Ground>
      <div style={{ position: 'absolute', left: 130, top: 300, width: 780 }}>
        <Kicker style={{ opacity: fadeIn(f) }}>IT FOLLOWS YOUR WALLET</Kicker>
        <div style={{ marginTop: 18 }}><Rise text="Move up, and your advert comes with you." from={4} size={72} color={UI.ink} /></div>
        <div style={{ marginTop: 22, fontFamily: SANS, fontWeight: 600, fontSize: 30, lineHeight: 1.45, color: UI.soft, opacity: fadeIn(f, 18) }}>
          An advert belongs to the wallet, not the seat. Out-hold the seat ahead and it moves up. It also shows on the seatback screens in the 3D cabin.
        </div>
      </div>
      {TILES.map((id, i) => {
        const shift = i >= to && i < from ? m : 0;
        const p = pos(i), q = i >= to && i < from ? pos(i + 1) : p;
        const me = i === from;
        return (
          <div key={id} style={{
            position: 'absolute', left: p.x + (q.x - p.x) * shift, top: p.y + (q.y - p.y) * shift, width: tile, height: tile, borderRadius: 20,
            background: me ? UI.bg : `linear-gradient(145deg, ${HOUSE[i % 6]}, ${HOUSE[(i + 2) % 6]})`, boxShadow: me ? UI.well : UI.e,
            opacity: fadeIn(f, i, 8) * (me ? 1 - m : 1),
          }}>
            <div style={{ position: 'absolute', left: 12, bottom: 10, fontFamily: MONO, fontWeight: 600, fontSize: 18, color: me ? UI.faint : '#fff' }}>{id}</div>
          </div>
        );
      })}
      <div style={{
        position: 'absolute', left: a.x + (b.x - a.x) * m, top: a.y + (b.y - a.y) * m - Math.sin(m * Math.PI) * 80, width: tile, height: tile, borderRadius: 20, overflow: 'hidden',
        boxShadow: `0 0 0 5px #00C9F1, ${UI.e}`, opacity: fadeIn(f, 10, 8),
      }}>
        <Img src={staticFile(AD)} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ position: 'absolute', left: gx, top: gy + 3 * (tile + gap) + 10, fontFamily: MONO, fontWeight: 600, fontSize: 22, letterSpacing: '0.12em', color: UI.deep, opacity: fadeIn(f, cfg.moveAt + 16) }}>
        {TILES[from]} → {TILES[to]} · YOUR ADVERT MOVED UP
      </div>
    </Ground>
  );
};

/* ── End card ── */
const End: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <div style={{ position: 'absolute', left: 0, width: W, top: 190, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34, opacity: fadeIn(f) }}>
        <Badge size={150} />
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 104, letterSpacing: '0.04em', color: UI.ink }}>SEAT AIRLINES</div>
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 430, display: 'flex', justifyContent: 'center' }}>
        <Rise text="Your bag. Your seat. Your billboard." from={8} size={70} color={UI.ink} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 600, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {'SEAT-AIRLINES.SPACE'.split('').map((ch, i) => <FlapTile key={i} ch={ch} land={cfg.urlAt + i * 0.8} size={50} seed={`adv${i}`} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 740, textAlign: 'center', opacity: fadeIn(f, cfg.urlAt + 20) }}>
        <span style={{ display: 'inline-block', padding: '16px 40px', borderRadius: 16, background: UI.accentText, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.1em', boxShadow: UI.e }}>CLAIM A SEAT →</span>
      </div>
      <Layer style={{ background: '#000', opacity: interpolate(f, [frames - 12, frames], [0, 1], clamp) }} />
    </Ground>
  );
};

const VIEWS: Record<string, React.FC<{ frames: number }>> = { title: Title, recording: Recording, steps: Steps, follows: Follows, end: End };

const Fade: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useCurrentFrame();
  return <Layer style={{ opacity: first ? 1 : interpolate(f, [0, XF], [0, 1], clamp) }}>{children}</Layer>;
};

export const Adverts: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Stage>
        {cfg.scenes.map((s, i) => {
          const View = VIEWS[s.id];
          const from = at;
          at += s.frames;
          return (
            <Sequence key={s.id} from={from} durationInFrames={s.frames + (i < cfg.scenes.length - 1 ? XF : 0)} layout="none">
              <Fade first={i === 0}><View frames={s.frames} /></Fade>
            </Sequence>
          );
        })}
        <Grain amount={0.02} />
      </Stage>
      <Audio src={staticFile('sfx/adverts.wav')} />
    </AbsoluteFill>
  );
};
