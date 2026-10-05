import React from 'react';
import { Composition } from 'remotion';
import { Commercial } from './Commercial';
import { NewFeatures, NF_FPS, NF_H, NF_SECONDS, NF_W } from './NewFeatures';
import { FPS, HEIGHT, ORDER_A, ORDER_B, WIDTH, totalFrames } from './config/timeline';

export const Root: React.FC = () => (
  <>
    <Composition id="SeatAirlines-A" component={Commercial} durationInFrames={totalFrames(ORDER_A)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ order: ORDER_A }} />
    <Composition id="SeatAirlines-B" component={Commercial} durationInFrames={totalFrames(ORDER_B)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ order: ORDER_B }} />
    <Composition id="NewFeatures" component={NewFeatures} durationInFrames={NF_SECONDS * NF_FPS} fps={NF_FPS} width={NF_W} height={NF_H} />
  </>
);
