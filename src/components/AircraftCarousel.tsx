import AircraftModelPreview from './AircraftModelPreview';
import CraftSheet from './CraftSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CRAFT_SPECS } from '../lib/craftSpecs';
import { RIDES, RIDE_PASS, passShort, type PlayMode } from '../lib/rides';

interface AircraftCarouselProps {
  /** The ride the launch takes off in: always one this wallet flies. */
  mode: PlayMode;
  /** The bay the console is showing, flyable or not. */
  focus: PlayMode;
  /** Point the console at a bay. A ride this wallet flies becomes the ride too (Landing's focusRide). */
  onFocusChange: (ride: PlayMode) => void;
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

/** The three bays, in the order they stand, and what each says about itself. */
const BAYS: readonly { ride: PlayMode; name: string; line: string; title: string; badge: string }[] = [
  { ride: 'airliner', name: 'SA350', line: 'Seat Airlines flagship', title: 'SA350 flagship', badge: 'Available now' },
  { ride: 'jet', name: 'F35', line: 'Two guided missiles', title: 'F35 fighter', badge: 'Mach 1 boost' },
  { ride: 'ufo', name: 'UFO', line: 'Experimental interceptor', title: 'UFO interceptor', badge: 'Dash any way' },
];
const count = (n: number) => Math.floor(n).toLocaleString('en-US');

const LockMark = () => (
  <svg className="sa-aircraft-picker__lock" viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
const Chevron = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden><path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
);

/**
 * The hangar's console: three bays behind a steel rim, and a status strip
 * along its foot that says what the bay in focus is, what it takes to fly it,
 * and the one way on — launch, verify, or the pass still missing.
 *
 * Every playable ride shares the same selector and launch flow. The F35 and
 * the UFO are the holders' fleet: the console can be pointed at a bay this
 * wallet cannot fly — that is how a visitor finds out what it takes — but
 * only one it flies becomes the ride. Picking the bay already in focus opens
 * its spec sheet.
 */
export default function AircraftCarousel({
  mode, focus, onFocusChange, flyable, tokenBalance, balanceLoading, walletConnected, onConnect,
  onLaunch, launchLabel = 'Launch flight →',
}: AircraftCarouselProps) {
  const track = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<PlayMode | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const pick = (ride: PlayMode) => {
    if (ride === focus) setSheet(ride);
    else onFocusChange(ride);
  };
  const step = (direction: number) => onFocusChange(RIDES[(RIDES.indexOf(focus) + direction + RIDES.length) % RIDES.length]);

  /* On a phone the bays scroll: keep the one in focus in the middle. */
  useEffect(() => {
    const element = track.current;
    const selected = element?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!element || !selected || element.scrollWidth <= element.clientWidth) return;
    element.scrollTo({ left: selected.offsetLeft - element.offsetLeft - (element.clientWidth - selected.offsetWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [focus]);

  const index = RIDES.indexOf(focus);
  const bay = BAYS.find((b) => b.ride === focus) ?? BAYS[0];
  const open = flyable[focus];
  const pass = RIDE_PASS[focus];
  const status = balanceLoading && !open
    ? 'Verifying your $SEAT balance…'
    : open
      ? CRAFT_SPECS[focus].abilities.join(' · ')
      : walletConnected
        ? `Hold ${count(pass)} $SEAT to unlock · you hold ${count(tokenBalance ?? 0)}`
        : `Hold ${count(pass)} $SEAT to unlock`;
  /* The one way on from here. A bay in focus that flies is the ride (focusRide), so launching flies it. */
  const action = open
    ? { label: launchLabel, go: true, onClick: mode === focus ? onLaunch : undefined }
    : !walletConnected
      ? { label: 'Connect to verify', go: false, onClick: onConnect }
      : { label: balanceLoading ? 'Verifying…' : `Hold ${passShort(pass)} $SEAT to unlock`, go: false, onClick: undefined };

  return (
    <section className="sa-aircraft-picker" aria-label="Aircraft selector">
      <div className="sa-aircraft-picker__frame">
        <div className="sa-aircraft-picker__rim">
          <div className="sa-aircraft-picker__panel">
            <div className="sa-aircraft-picker__head">
              <h2 className="sa-aircraft-picker__title">Choose your ride</h2>
              <span className="sa-aircraft-picker__grille" aria-hidden />
              <span className="sa-aircraft-picker__count" aria-label={`Bay ${index + 1} of ${RIDES.length}`}>
                {String(index + 1).padStart(2, '0')} / {String(RIDES.length).padStart(2, '0')}
              </span>
            </div>

            <div className="sa-aircraft-picker__row">
              <button type="button" className="sa-aircraft-picker__arrow" onClick={() => step(-1)} aria-label="Previous aircraft">
                <Chevron back />
              </button>
              <div ref={track} className="sa-aircraft-picker__track" aria-label="Available rides">
                {BAYS.map(({ ride, name, line, badge }) => {
                  const flies = flyable[ride];
                  return (
                    <button
                      key={ride}
                      type="button"
                      className={`sa-aircraft-picker__bay sa-aircraft-picker__bay--${ride}${focus === ride ? ' is-selected' : ''}${flies ? '' : ' is-locked'}`}
                      onClick={() => pick(ride)}
                      aria-pressed={focus === ride}
                      aria-label={flies ? `${name}, ${line}` : `${name}, ${line}, locked: hold ${count(RIDE_PASS[ride])} $SEAT to fly it`}
                    >
                      <span className="sa-aircraft-picker__bay-frame">
                        <span className="sa-aircraft-picker__screen">
                          <span className="sa-aircraft-picker__beams" aria-hidden />
                          <span className="sa-aircraft-picker__pad" aria-hidden />
                          <span className="sa-aircraft-picker__model" aria-hidden>
                            <AircraftModelPreview model={ride} active={focus === ride} />
                          </span>
                          <span className="sa-aircraft-picker__badge" aria-hidden>
                            {!flies && <LockMark />}
                            {flies ? badge : `Hold ${passShort(RIDE_PASS[ride])} $SEAT`}
                          </span>
                          <span className="sa-aircraft-picker__lamp" aria-hidden />
                        </span>
                        <span className="sa-aircraft-picker__plate" aria-hidden>
                          <strong>{name}</strong>
                          <span>{line}</span>
                          <i className="sa-aircraft-picker__plate-lamp" />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="sa-aircraft-picker__arrow" onClick={() => step(1)} aria-label="Next aircraft">
                <Chevron />
              </button>
            </div>

            <div className={`sa-aircraft-picker__status sa-aircraft-picker__status--${focus}${open ? '' : ' is-locked'}`} aria-live="polite">
              <span className="sa-aircraft-picker__status-lamp" aria-hidden />
              <p className="sa-aircraft-picker__status-text">
                <strong>{bay.title}</strong>
                <span>{status}</span>
              </p>
              <span className="sa-aircraft-picker__grille sa-aircraft-picker__grille--wide" aria-hidden />
              <div className="sa-aircraft-picker__actions">
                <button type="button" className="sa-aircraft-picker__specs" onClick={() => setSheet(focus)}>Specs</button>
                <button
                  type="button"
                  className={`sa-aircraft-picker__action${action.go ? ' is-go' : ''}`}
                  onClick={action.onClick}
                  disabled={!action.onClick}
                >
                  {action.label}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Outside the frame: its drop shadow is a filter, which would otherwise
          become the box this fixed-position sheet is laid out in. */}
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
