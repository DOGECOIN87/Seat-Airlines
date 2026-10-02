import React from 'react';
import { Composition } from 'remotion';
import { Commercial } from './Commercial';
import { FPS, HEIGHT, ORDER_A, ORDER_B, WIDTH, totalFrames } from './config/timeline';
import { IntroFilm } from './intro/Film';
import { totalOf } from './intro/timing';
import { ExplainerFilm } from './explainer/Film';
import { TOTAL as EXPLAINER_TOTAL } from './explainer/timing';

export const Root: React.FC = () => (
  <>
    <Composition id="SeatAirlines-A" component={Commercial} durationInFrames={totalFrames(ORDER_A)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ order: ORDER_A }} />
    <Composition id="SeatAirlines-B" component={Commercial} durationInFrames={totalFrames(ORDER_B)} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ order: ORDER_B }} />
    {/* The launch intro and its short, drawn entirely in code (src/intro). 4K for delivery; 1080p for quick looks. */}
    <Composition id="Intro-4K" component={IntroFilm} durationInFrames={totalOf('intro')} fps={30} width={3840} height={2160} defaultProps={{ cut: 'intro' as const }} />
    <Composition id="Short-4K" component={IntroFilm} durationInFrames={totalOf('short')} fps={30} width={3840} height={2160} defaultProps={{ cut: 'short' as const }} />
    <Composition id="Intro-1080" component={IntroFilm} durationInFrames={totalOf('intro')} fps={30} width={1920} height={1080} defaultProps={{ cut: 'intro' as const }} />
    <Composition id="Short-1080" component={IntroFilm} durationInFrames={totalOf('short')} fps={30} width={1920} height={1080} defaultProps={{ cut: 'short' as const }} />
    {/* The looping "How it works" explainer (src/explainer). */}
    <Composition id="Explainer-4K" component={ExplainerFilm} durationInFrames={EXPLAINER_TOTAL} fps={30} width={3840} height={2160} />
    <Composition id="Explainer-1080" component={ExplainerFilm} durationInFrames={EXPLAINER_TOTAL} fps={30} width={1920} height={1080} />
  </>
);
