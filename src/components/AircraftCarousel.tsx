import { useState, type CSSProperties } from 'react';
import AircraftModelPreview from './AircraftModelPreview';

export type PlayMode = 'airliner' | 'ufo';

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

/**
 * The landing's small aircraft roster. The active SA350 is the only available
 * airframe; the other two bays stay intentionally empty until the fleet grows.
 * The saucer is a mode switch, not a fourth fleet slot, so the roster keeps
 * the two promised Coming Soon placeholders visible.
 */
export default function AircraftCarousel({
  mode, onModeChange, fullscreen = false, ufoUnlocked, tokenBalance, balanceLoading, walletConnected, onConnect,
}: AircraftCarouselProps) {
  const [angle, setAngle] = useState(0);
  const turn = (direction: -1 | 1) => setAngle((current) => (current + direction + 3) % 3);

  return (
    <section className={`sa-aircraft-picker${fullscreen ? ' sa-aircraft-picker--fullscreen' : ''}`} aria-label="Aircraft selector">
      <header className="sa-aircraft-picker__head">
        <div>
          <p className="sa-aircraft-picker__eyebrow">Fleet roster</p>
          <h2 className="sa-aircraft-picker__title">Choose your ride</h2>
        </div>
        <span className="sa-aircraft-picker__counter">01 / 03</span>
      </header>

      <div className="sa-aircraft-picker__stage">
        <button type="button" className="sa-aircraft-picker__arrow" onClick={() => turn(-1)} aria-label="Rotate fleet left">
          ‹
        </button>
        <div className="sa-aircraft-picker__track" style={{ '--picker-angle': `${angle * 7 - 7}deg` } as CSSProperties}>
          <article className="sa-aircraft-picker__slot sa-aircraft-picker__slot--ghost" aria-label="Fleet slot two coming soon">
            <span className="sa-aircraft-picker__slot-number">02</span>
            <span className="sa-aircraft-picker__slot-dots" aria-hidden>···</span>
            <strong>Coming soon</strong>
            <small>New aircraft bay</small>
          </article>

          <button
            type="button"
            className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active${mode === 'airliner' ? ' is-selected' : ''}`}
            onClick={() => onModeChange('airliner')}
            aria-pressed={mode === 'airliner'}
          >
            <span className="sa-aircraft-picker__slot-badge">Available now</span>
            <div className="sa-aircraft-picker__model" aria-hidden>
              <div className="sa-aircraft-picker__model-glow" />
              <AircraftModelPreview model={mode === 'ufo' ? 'ufo' : 'airliner'} />
            </div>
            <div className="sa-aircraft-picker__aircraft-meta">
              <span>
                <strong>SA350</strong>
                <small>Seat Airlines flagship</small>
              </span>
              <span className="sa-aircraft-picker__status-dot" />
            </div>
          </button>

          <article className="sa-aircraft-picker__slot sa-aircraft-picker__slot--ghost" aria-label="Fleet slot three coming soon">
            <span className="sa-aircraft-picker__slot-number">03</span>
            <span className="sa-aircraft-picker__slot-dots" aria-hidden>···</span>
            <strong>Coming soon</strong>
            <small>New aircraft bay</small>
          </article>
        </div>
        <button type="button" className="sa-aircraft-picker__arrow" onClick={() => turn(1)} aria-label="Rotate fleet right">
          ›
        </button>
      </div>

      <div className={`sa-aircraft-picker__mode${mode === 'ufo' ? ' is-armed' : ''}${!ufoUnlocked ? ' is-locked' : ''}`}>
        {mode === 'airliner' && <div className="sa-aircraft-picker__mode-model"><AircraftModelPreview model="ufo" /></div>}
        <div>
          <p className="sa-aircraft-picker__mode-kicker">Experimental mode</p>
          <strong>UFO interceptor</strong>
          <small>
            {balanceLoading
              ? 'Verifying $SEAT balance…'
              : !walletConnected
                ? 'Connect a wallet to verify your holder pass'
                : ufoUnlocked
                  ? 'Saucer controls armed · launch from the pad'
                  : `Hold 1,000,000 $SEAT to unlock · ${Math.floor(tokenBalance ?? 0).toLocaleString('en-US')} held`}
          </small>
        </div>
        <button
          type="button"
          disabled={!ufoUnlocked && walletConnected}
          onClick={() => {
            if (!ufoUnlocked) { onConnect?.(); return; }
            onModeChange(mode === 'ufo' ? 'airliner' : 'ufo');
          }}
          aria-pressed={mode === 'ufo'}
          aria-disabled={!ufoUnlocked}
        >
          <span aria-hidden>◉</span>
          {mode === 'ufo' ? 'Armed' : !walletConnected ? 'Connect to verify' : balanceLoading ? 'Checking…' : ufoUnlocked ? 'Try UFO' : 'Locked'}
        </button>
      </div>
    </section>
  );
}
