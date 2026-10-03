/**
 * The launch intro (and its short cut): the scenes of config/intro.json in
 * order, each with its way in, the voice lines that are on disk, and the
 * synthesized sound design (sound.tsx).
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Grain, Layer, Stage, clamp } from './kit';
import { SCENES } from './scenes';
import { SoundDesign, duckAt } from './sound';
import { scenesOf, totalOf, voOf, type CutId, type SceneId } from './timing';

type Kind = 'cut' | 'white' | 'fade' | 'dip' | 'flash';
const XF = 14; // crossfade length
const DIP = 7; // each half of a dip through black

/** How a scene comes in, given the one before it. */
const transitionFor = (prev: SceneId | undefined, cur: SceneId): Kind => {
  if (!prev) return 'cut';
  if (prev === 'ignition') return 'white'; // the camera dived through the badge into white
  if (prev === 'landing') return 'dip'; // the camera dived into the browser window
  if (cur === 'board') return 'dip';
  if (cur === 'end') return 'flash';
  return 'fade';
};

const Shot: React.FC<{ kind: Kind; exit: Kind; frames: number; children: React.ReactNode }> = ({ kind, exit, frames, children }) => {
  const f = useCurrentFrame();
  const opacity = kind === 'fade' ? interpolate(f, [0, XF], [0, 1], clamp) : 1;
  const white = kind === 'white' ? interpolate(f, [0, 16], [1, 0], clamp) : kind === 'flash' ? interpolate(f, [0, 2, 14], [0.9, 0.7, 0], clamp) : 0;
  const black = Math.max(
    kind === 'dip' ? interpolate(f, [0, DIP], [1, 0], clamp) : 0,
    exit === 'dip' ? interpolate(f, [frames - DIP, frames], [0, 1], clamp) : 0,
  );
  return (
    <Layer style={{ opacity }}>
      {children}
      {white > 0 && <Layer style={{ background: '#fff', opacity: white }} />}
      {black > 0 && <Layer style={{ background: '#000', opacity: black }} />}
    </Layer>
  );
};

export const IntroFilm: React.FC<{ cut: CutId }> = ({ cut }) => {
  const scenes = scenesOf(cut);
  const vo = voOf(cut);
  const total = totalOf(cut);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Stage>
        {scenes.map((s, i) => {
          const kind = transitionFor(scenes[i - 1]?.id, s.id);
          const exit = scenes[i + 1] ? transitionFor(s.id, scenes[i + 1].id) : 'cut';
          const tail = exit === 'fade' ? XF : 0;
          const Scene = SCENES[s.id];
          const local = vo.filter((c) => c.scene === s.id);
          return (
            <Sequence key={s.id} from={s.from} durationInFrames={s.frames + tail} layout="none">
              <Shot kind={kind} exit={exit} frames={s.frames}>
                <Scene frames={s.frames} cut={cut} vo={local} />
              </Shot>
            </Sequence>
          );
        })}
        <Grain />
      </Stage>
      {vo.map((c) => (
        <Sequence key={c.file} from={c.from} durationInFrames={c.frames + 6} layout="none">
          <Audio src={staticFile(`vo/intro/${c.file}.wav`)} volume={1} />
        </Sequence>
      ))}
      <SoundDesign cut={cut} duck={(f) => duckAt(vo, f)} total={total} />
    </AbsoluteFill>
  );
};
