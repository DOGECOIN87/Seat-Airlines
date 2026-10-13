import AircraftModelPreview from './AircraftModelPreview';
import CraftSheet from './CraftSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayMode } from '../lib/rides';

interface AircraftCarouselProps {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  fullscreen?: boolean;
  ufoUnlocked: boolean;
  tokenBalance: number | null;
  balanceLoading: boolean;
  walletConnected: boolean;
  onConnect?: () => void;
  /** The hangar's launch, and what its button says: the spec sheet offers the same way on. */
  onLaunch?: () => void;
  launchLabel?: string;
}

/** Every playable ride shares the same selector and launch flow. */
export default function AircraftCarousel({
  mode, onModeChange, fullscreen = false, ufoUnlocked, tokenBalance, balanceLoading, walletConnected, onConnect,
  onLaunch, launchLabel = 'Launch flight →',
}: AircraftCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  /* Picking a craft opens its spec sheet. */
  const [sheet, setSheet] = useState<PlayMode | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const pick = (ride: PlayMode) => {
    onModeChange(ride);
    setSheet(ride);
  };
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
    pick('ufo');
  };

  return (
    <section className={`sa-aircraft-picker${fullscreen ? ' sa-aircraft-picker--fullscreen' : ''}`} aria-label="Aircraft selector">
      <div className="sa-aircraft-picker__stage">
        <div ref={track} className="sa-aircraft-picker__track" aria-label="Available rides">
          <button
            type="button"
            className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active${mode === 'airliner' ? ' is-selected' : ''}`}
            onClick={() => pick('airliner')}
            aria-pressed={mode === 'airliner'}
          >
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow" />
              <AircraftModelPreview model="airliner" active={mode === 'airliner'} />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta"><strong>SA350</strong></div>
          </button>

          <button type="button" className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active sa-aircraft-picker__slot--jet${mode === 'jet' ? ' is-selected' : ''}`}
            onClick={() => pick('jet')} aria-pressed={mode === 'jet'}>
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow" />
              <AircraftModelPreview model="jet" active={mode === 'jet'} />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta"><strong>F35</strong></div>
          </button>

          <button
            type="button"
            className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active sa-aircraft-picker__slot--ufo${mode === 'ufo' ? ' is-selected' : ''}${!ufoUnlocked ? ' is-locked' : ''}`}
            onClick={selectUfo}
            aria-pressed={mode === 'ufo'}
            disabled={!ufoUnlocked && walletConnected}
          >
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow sa-aircraft-picker__model-glow--ufo" />
              <AircraftModelPreview model="ufo" active={mode === 'ufo'} />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta"><strong>UFO</strong></div>
          </button>
        </div>
      </div>

      <div className={`sa-aircraft-picker__mode${mode === 'ufo' ? ' is-armed' : ''}${!ufoUnlocked ? ' is-locked' : ''}`}>
        <p className="sa-aircraft-picker__mode-text">
          <strong>UFO interceptor.</strong>{' '}
          {balanceLoading
            ? 'Verifying your $SEAT balance…'
            : ufoUnlocked
              ? 'Saucer controls armed: launch from the pad.'
              : !walletConnected
                ? 'Connect a wallet to verify. Hold 1,000,000 $SEAT to unlock.'
                : `Hold 1,000,000 $SEAT to unlock. You hold ${Math.floor(tokenBalance ?? 0).toLocaleString('en-US')}.`}
        </p>
        <button
          type="button"
          className="sa-ghost"
          disabled={!ufoUnlocked && walletConnected}
          onClick={selectUfo}
          aria-pressed={mode === 'ufo'}
        >
          {mode === 'ufo' ? 'Armed' : !walletConnected && !ufoUnlocked ? 'Connect to verify' : balanceLoading ? 'Checking…' : ufoUnlocked ? 'Try UFO' : 'Locked'}
        </button>
      </div>
      {sheet && (
        <CraftSheet
          model={sheet}
          locked={sheet === 'ufo' && !ufoUnlocked}
          launchLabel={launchLabel}
          onLaunch={() => { setSheet(null); onLaunch?.(); }}
          onClose={closeSheet}
        />
      )}
    </section>
  );
}
