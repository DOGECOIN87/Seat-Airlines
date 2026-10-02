/**
 * The synthesized sound design (sfx/intro.mjs → public/sfx/<cut>-<scene>.wav):
 * one stem per scene, laid at the scene's first frame, ducked under the voice.
 */
import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { scenesOf, type CutId, type SceneId, type VoCue } from './timing';

/** Stem levels, set by ear against the VO at -18 LUFS. */
const GAIN: Record<SceneId, number> = { ignition: 0.85, sky: 0.8, seats: 0.7, climb: 0.9, board: 0.75, end: 0.85 };
const DUCK = 0.5; // gain while a line is being spoken
const RAMP = 6; // frames to duck and to recover

/** SFX gain at frame f of the cut: 1 in the clear, DUCK under a voice line, ramped either side. */
export const duckAt = (vo: VoCue[], f: number) => {
  let g = 1;
  for (const c of vo) {
    const into = f - (c.from - RAMP), out = c.from + c.frames + RAMP - f;
    const k = Math.min(1, Math.max(0, Math.min(into, out) / RAMP));
    g = Math.min(g, 1 - (1 - DUCK) * k);
  }
  return g;
};

export const SoundDesign: React.FC<{ cut: CutId; duck: (f: number) => number; total: number }> = ({ cut, duck, total }) => (
  <>
    {scenesOf(cut).map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={total - s.from} layout="none">
        <Audio src={staticFile(`sfx/${cut}-${s.id}.wav`)} volume={(f) => GAIN[s.id] * duck(s.from + f)} />
      </Sequence>
    ))}
  </>
);
