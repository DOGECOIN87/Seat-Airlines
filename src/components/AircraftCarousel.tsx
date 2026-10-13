import AircraftModelPreview from './AircraftModelPreview';
import CraftSheet from './CraftSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RIDES, RIDE_PASS, passShort, type PlayMode } from '../lib/rides';

interface AircraftCarouselProps {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  fullscreen?: boolean;
  /** Which rides this wallet's verified balance flies (see RIDE_PASS). */
  flyable: Record<PlayMode, boolean>;
  tokenBalance: number | null;
  balanceLoading: boolean;
  walletConnected: boolean;
  onConnect?: () => void;
  /** The hangar's launch, and what its button says: the spec sheet offers the same way on. */
  onLaunch?: () => void;
  launchLabel?: string;
}

/** The three bays, in the order they stand. */
const BAYS: readonly { ride: PlayMode; name: string }[] = [
  { ride: 'airliner', name: 'SA350' },
  { ride: 'jet', name: 'F35' },
  { ride: 'ufo', name: 'UFO' },
];
const count = (n: number) => Math.floor(n).toLocaleString('en-US');

const LockMark = () => (
  <svg className="sa-aircraft-picker__lock" viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

/**
 * Every playable ride shares the same selector and launch flow. The F35 and
 * the UFO are the holders' fleet: a bay this wallet cannot fly is dimmed and
 * padlocked, and picking it still opens its spec sheet — with the way to
 * verify, or the pass it takes, where the launch would be.
 */
export default function AircraftCarousel({
  mode, onModeChange, fullscreen = false, flyable, tokenBalance, balanceLoading, walletConnected, onConnect,
  onLaunch, launchLabel = 'Launch flight →',
}: AircraftCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  /* Picking a craft opens its spec sheet; only one this wallet flies becomes the ride. */
  const [sheet, setSheet] = useState<PlayMode | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const pick = (ride: PlayMode) => {
    if (flyable[ride]) onModeChange(ride);
    setSheet(ride);
  };
  useEffect(() => {
    const element = track.current;
    const selected = element?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!element || !selected || element.scrollWidth <= element.clientWidth) return;
    element.scrollTo({ left: selected.offsetLeft - element.offsetLeft - (element.clientWidth - selected.offsetWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [mode]);

  /* The holders' fleet, and what this wallet still needs for it. */
  const locked = RIDES.filter((ride) => !flyable[ride]);
  const needs = locked.map((ride, i) => `${count(RIDE_PASS[ride])}${i === 0 ? ' $SEAT' : ''} to fly the ${BAYS.find((b) => b.ride === ride)?.name}`).join(', ');
  const fleetLine = balanceLoading
    ? 'Verifying your $SEAT balance…'
    : !locked.length
      ? 'The F35 and the UFO are yours to fly.'
      : !walletConnected
        ? `Hold ${needs}. Connect a wallet to verify.`
        : `Hold ${needs}. You hold ${count(tokenBalance ?? 0)}.`;

  return (
    <section className={`sa-aircraft-picker${fullscreen ? ' sa-aircraft-picker--fullscreen' : ''}`} aria-label="Aircraft selector">
      <div className="sa-aircraft-picker__stage">
        <div ref={track} className="sa-aircraft-picker__track" aria-label="Available rides">
          {BAYS.map(({ ride, name }) => {
            const open = flyable[ride];
            return (
              <button
                key={ride}
                type="button"
                className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--active sa-aircraft-picker__slot--${ride}${mode === ride ? ' is-selected' : ''}${open ? '' : ' is-locked'}`}
                onClick={() => pick(ride)}
                aria-pressed={mode === ride}
                aria-label={open ? name : `${name}, locked: hold ${count(RIDE_PASS[ride])} $SEAT to fly it`}
              >
                <div className="sa-aircraft-picker__model" aria-hidden>
                  <div className={`sa-aircraft-picker__model-glow${ride === 'ufo' ? ' sa-aircraft-picker__model-glow--ufo' : ''}`} />
                  <AircraftModelPreview model={ride} active={mode === ride} />
                </div>
                <div className="sa-aircraft-picker__aircraft-meta"><strong>{name}</strong>{!open && <LockMark />}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`sa-aircraft-picker__mode${locked.length ? ' is-locked' : ''}`}>
        <p className="sa-aircraft-picker__mode-text">
          <strong>Holders’ fleet.</strong>{' '}{fleetLine}
        </p>
        {!walletConnected && locked.length > 0 && (
          <button type="button" className="sa-ghost" onClick={onConnect}>Connect to verify</button>
        )}
      </div>
      {sheet && (
        <CraftSheet
          model={sheet}
          locked={!flyable[sheet]}
          lockedLabel={walletConnected ? `Hold ${passShort(RIDE_PASS[sheet])} $SEAT to unlock` : 'Connect to verify'}
          onUnlock={walletConnected ? undefined : () => { setSheet(null); onConnect?.(); }}
          launchLabel={launchLabel}
          onLaunch={() => { setSheet(null); onLaunch?.(); }}
          onClose={closeSheet}
        />
      )}
    </section>
  );
}
