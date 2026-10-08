import AircraftModelPreview from './AircraftModelPreview';
import { useEffect, useRef } from 'react';
import type { FlightMode } from '../lib/landingGame';

export type PlayMode = FlightMode;
export const RIDES: readonly PlayMode[] = ['airliner', 'jet', 'ufo'];

interface AircraftCarouselProps {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  fullscreen?: boolean;
  ufoUnlocked: boolean;
  tokenBalance: number | null;
  balanceLoading: boolean;
  walletConnected: boolean;
  onConnect?: () => void;
}

/** Every playable ride shares the same selector and launch flow. */
export default function AircraftCarousel({
  mode, onModeChange, fullscreen = false, ufoUnlocked, tokenBalance, balanceLoading, walletConnected, onConnect,
}: AircraftCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = track.current;
    const selected = element?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!element || !selected || element.scrollWidth <= element.clientWidth) return;
    element.scrollTo({ left: selected.offsetLeft - element.offsetLeft - (element.clientWidth - selected.offsetWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [mode]);
  const selectUfo = () => {
    if (!ufoUnlocked) {
      onConnect?.();
      return;
    }
    onModeChange('ufo');
  };
  const cycle = (direction: number) => {
    const available = ufoUnlocked ? RIDES : RIDES.filter(ride => ride !== 'ufo');
    const index = Math.max(0, available.indexOf(mode));
    onModeChange(available[(index + direction + available.length) % available.length]);
  };

  return (
    <section className={`sa-aircraft-picker${fullscreen ? ' sa-aircraft-picker--fullscreen' : ''}`} aria-label="Aircraft selector">
      <header className="sa-aircraft-picker__head">
        <div>
          <p className="sa-aircraft-picker__eyebrow">Fleet roster</p>
          <h2 className="sa-aircraft-picker__title">Choose your ride</h2>
        </div>
        <span className="sa-aircraft-picker__counter">0{RIDES.indexOf(mode) + 1} / 03</span>
      </header>

      <div className="sa-aircraft-picker__stage">
        <button type="button" className="sa-aircraft-picker__arrow" onClick={() => cycle(-1)} aria-label="Previous aircraft">
          ‹
        </button>
        <div ref={track} className="sa-aircraft-picker__track" aria-label="Available rides">
          <button
            type="button"
            className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active${mode === 'airliner' ? ' is-selected' : ''}`}
            onClick={() => onModeChange('airliner')}
            aria-pressed={mode === 'airliner'}
          >
            <span className="sa-aircraft-picker__slot-badge">Available now</span>
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow" />
              <AircraftModelPreview model="airliner" />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta">
              <span>
                <strong>SA350</strong>
                <small>Seat Airlines flagship</small>
              </span>
              <span className="sa-aircraft-picker__status-dot" />
            </div>
          </button>

          <button type="button" className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active sa-aircraft-picker__slot--jet${mode === 'jet' ? ' is-selected' : ''}`}
            onClick={() => onModeChange('jet')} aria-pressed={mode === 'jet'}>
            <span className="sa-aircraft-picker__slot-badge">Mach 1 boost</span>
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow" />
              <AircraftModelPreview model="jet" />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta"><span><strong>F35</strong><small>Two guided missiles</small></span>
              <span className="sa-aircraft-picker__status-dot" /></div>
          </button>

          <button
            type="button"
            className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active sa-aircraft-picker__slot--ufo${mode === 'ufo' ? ' is-selected' : ''}${!ufoUnlocked ? ' is-locked' : ''}`}
            onClick={selectUfo}
            aria-pressed={mode === 'ufo'}
            disabled={!ufoUnlocked && walletConnected}
          >
            <span className="sa-aircraft-picker__slot-badge sa-aircraft-picker__slot-badge--ufo">
              {ufoUnlocked ? 'Test flight ready' : 'Hold 1M $SEAT'}
            </span>
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow sa-aircraft-picker__model-glow--ufo" />
              <AircraftModelPreview model="ufo" />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta">
              <span>
                <strong>UFO</strong>
                <small>Experimental interceptor</small>
              </span>
              <span className="sa-aircraft-picker__status-dot sa-aircraft-picker__status-dot--ufo" />
            </div>
          </button>
        </div>
        <button type="button" className="sa-aircraft-picker__arrow" onClick={() => cycle(1)} aria-label="Next aircraft">
          ›
        </button>
      </div>

      <div className={`sa-aircraft-picker__mode${mode === 'ufo' ? ' is-armed' : ''}${!ufoUnlocked ? ' is-locked' : ''}`}>
        <div>
          <p className="sa-aircraft-picker__mode-kicker">Experimental mode</p>
          <strong>UFO interceptor</strong>
          <small>
            {balanceLoading
              ? 'Verifying $SEAT balance…'
              : ufoUnlocked
                ? 'Saucer controls armed · launch from the pad'
                : !walletConnected
                  ? 'Connect a wallet to verify · hold 1,000,000 $SEAT to unlock'
                  : `Hold 1,000,000 $SEAT to unlock · ${Math.floor(tokenBalance ?? 0).toLocaleString('en-US')} held`}
          </small>
        </div>
        <button
          type="button"
          disabled={!ufoUnlocked && walletConnected}
          onClick={selectUfo}
          aria-pressed={mode === 'ufo'}
        >
          <span aria-hidden>◉</span>
          {mode === 'ufo' ? 'Armed' : !walletConnected && !ufoUnlocked ? 'Connect to verify' : balanceLoading ? 'Checking…' : ufoUnlocked ? 'Try UFO' : 'Locked'}
        </button>
      </div>
    </section>
  );
}
