/**
 * "How it works": the looping explainer. Chapters slide through over a
 * background that runs on the loop's own period, and the outro dissolves into
 * the title's first frame, so the last frame leads straight back to frame 0.
 */
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { C, Grain, H, Layer, MONO, SANS, Stage, W, clamp } from '../intro/kit';
import { CHAPTER_VIEWS, Title } from './chapters';
import { CHAPTERS, FPS, SEAM, STEPS, TOTAL, type ChapterId } from './timing';

const XF = 16;
const TAU = Math.PI * 2;

/** Background: navy, a blueprint grid and the seat-mark pattern drifting exactly one tile per loop, motes on closed orbits. */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const p = f / TOTAL;
  return (
    <Layer style={{ background: 'radial-gradient(ellipse at 60% 40%, #13284f 0%, #0a1630 45%, #050A14 100%)' }}>
      <Layer style={{
        backgroundImage: 'linear-gradient(rgba(0,201,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,201,241,0.06) 1px, transparent 1px)',
        backgroundSize: '120px 120px', backgroundPosition: `${-p * 240}px ${-p * 120}px`,
      }} />
      <Layer style={{ backgroundImage: `url(${staticFile('brand/seat-airlines-mark-pattern.svg')})`, backgroundSize: '220px 220px', backgroundPosition: `${-p * 440}px ${p * 220}px`, opacity: 0.045 }} />
      {Array.from({ length: 46 }, (_, i) => {
        const z = 0.3 + random(`em${i}`) * 0.7;
        const n = 1 + Math.floor(random(`en${i}`) * 2);
        const x = random(`ex${i}`) * W + Math.sin(TAU * n * p + i) * 60 * z;
        const y = random(`ey${i}`) * H + Math.cos(TAU * n * p + i * 1.7) * 40 * z;
        const s = 3 + z * 6;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: s * 4, height: s * 4, borderRadius: '50%', opacity: z * (0.5 + 0.5 * Math.sin(TAU * 3 * p + i)), background: 'radial-gradient(circle, rgba(200,235,255,0.9) 0%, rgba(200,235,255,0.3) 18%, rgba(200,235,255,0) 50%)' }} />;
      })}
    </Layer>
  );
};

/** The header and the step tracker, shown while the steps run. */
const Chrome: React.FC = () => {
  const f = useCurrentFrame();
  const first = STEPS[0], last = STEPS[STEPS.length - 1];
  const show = interpolate(f, [first.from, first.from + 14, last.from + last.frames, last.from + last.frames + 14], [0, 1, 1, 0], clamp);
  return (
    <Layer style={{ opacity: show }}>
      <div style={{ position: 'absolute', left: 130, top: 70, display: 'flex', alignItems: 'center', gap: 18 }}>
        <Img src={staticFile('brand/seat-airlines-badge.png')} style={{ width: 64, height: 64 }} />
        <div>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, letterSpacing: '0.08em', color: C.ink }}>SEAT AIRLINES</div>
          <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: '0.3em', color: 'rgba(244,248,252,0.55)' }}>PRE-FLIGHT BRIEFING</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 130, right: 120, top: 930, display: 'flex', gap: 14 }}>
        {STEPS.map((s, i) => {
          const fill = interpolate(f, [s.from, s.from + s.frames], [0, 1], clamp);
          const now = f >= s.from && f < s.from + s.frames;
          return (
            <div key={s.id} style={{ flex: 1 }}>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <div style={{ width: `${fill * 100}%`, height: '100%', background: now ? C.cyan : 'rgba(0,201,241,0.55)' }} />
              </div>
              <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 16, letterSpacing: '0.12em', color: now ? C.ink : 'rgba(244,248,252,0.4)' }}>
                {String(i + 1).padStart(2, '0')} {LABEL[s.id]}
              </div>
            </div>
          );
        })}
      </div>
    </Layer>
  );
};

const LABEL: Partial<Record<ChapterId, string>> = { token: 'TOKEN', checkin: 'CHECK IN', seat: 'SEAT', moveup: 'MOVE UP', altitude: 'ALTITUDE', billboard: 'BILLBOARD', fly: 'FLY', safety: 'SAFETY' };

/** A chapter in its slot: slides in over XF frames, and out over the XF frames after its end. */
const Slot: React.FC<{ id: ChapterId; frames: number; children: (f: number) => React.ReactNode; enter: boolean }> = ({ frames, children, enter }) => {
  const f = useCurrentFrame();
  const a = enter ? interpolate(f, [0, XF], [0, 1], clamp) : 1;
  const b = interpolate(f, [frames, frames + XF], [0, 1], clamp);
  return <Layer style={{ opacity: a * (1 - b), transform: `translateX(${(1 - a) * 60 - b * 60}px)` }}>{children(f)}</Layer>;
};

export const ExplainerFilm: React.FC = () => {
  const title = CHAPTERS[0];
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Stage>
        <Backdrop />
        {CHAPTERS.map((ch, i) => {
          const last = i === CHAPTERS.length - 1;
          const View = ch.id === 'title' ? null : CHAPTER_VIEWS[ch.id as Exclude<ChapterId, 'title'>];
          return (
            <Sequence key={ch.id} from={ch.from} durationInFrames={ch.frames + (last ? 0 : XF)} layout="none">
              <Slot id={ch.id} frames={last ? ch.frames + XF : ch.frames} enter={i > 0}>
                {(f) => (View ? <View f={f} ch={ch} /> : <Title f={f} ch={ch} />)}
              </Slot>
            </Sequence>
          );
        })}
        {/* The seam: frame 0 itself (backdrop and title), dissolving in over the outro's last frames. */}
        <Sequence from={TOTAL - SEAM} durationInFrames={SEAM} layout="none">
          <Seam><Backdrop /><Title f={0} ch={title} /></Seam>
        </Sequence>
        <Chrome />
        <Grain amount={0.03} />
      </Stage>
      {CHAPTERS.filter((c) => c.vo).map((c) => (
        <Sequence key={c.id} from={c.vo!.from} durationInFrames={c.vo!.frames + 6} layout="none">
          <Audio src={staticFile(`vo/explainer/${c.vo!.file}.wav`)} />
        </Sequence>
      ))}
      <ExplainerSound />
    </AbsoluteFill>
  );
};

const Seam: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return <Layer style={{ opacity: interpolate(f, [0, SEAM - 1], [0, 1], clamp) }}>{children}</Layer>;
};

/** Sound: a bed that loops on the film's period, and one stem per chapter (sfx/explainer.mjs), ducked under the voice. */
const ExplainerSound: React.FC = () => {
  const duck = (g: number) => {
    let d = 1;
    for (const c of CHAPTERS) if (c.vo) {
      const into = g - (c.vo.from - 6), out = c.vo.from + c.vo.frames + 6 - g;
      d = Math.min(d, 1 - 0.45 * Math.min(1, Math.max(0, Math.min(into, out) / 6)));
    }
    return d;
  };
  return (
    <>
      <Audio src={staticFile('sfx/explainer-bed.wav')} volume={(f) => 0.55 * (0.7 + 0.3 * duck(f))} />
      {CHAPTERS.map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={Math.min(TOTAL - c.from, c.frames + 3 * FPS)} layout="none">
          <Audio src={staticFile(`sfx/explainer-${c.id}.wav`)} volume={(f) => 0.8 * duck(c.from + f)} />
        </Sequence>
      ))}
    </>
  );
};
