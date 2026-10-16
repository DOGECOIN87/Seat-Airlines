import AircraftModelPreview from './AircraftModelPreview';
import CraftSheet from './CraftSheet';
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CRAFT_SPECS } from '../lib/craftSpecs';
import { RIDES, RIDE_PASS, passShort, type PlayMode } from '../lib/rides';

interface AircraftCarouselProps {
  /** The ride the launch takes off in: always one this wallet flies. */
  mode: PlayMode;
  /** The bay the hangar is showing, flyable or not. */
  focus: PlayMode;
  /** Point the hangar at a bay. A ride this wallet flies becomes the ride too (Landing's focusRide). */
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
const BAYS: readonly { ride: PlayMode; name: string; line: string }[] = [
  { ride: 'airliner', name: 'SA350', line: 'Seat Airlines flagship' },
  { ride: 'jet', name: 'F35', line: 'Two guided missiles' },
  { ride: 'ufo', name: 'UFO', line: 'Experimental interceptor' },
];
const count = (n: number) => Math.floor(n).toLocaleString('en-US');
const two = (n: number) => String(n).padStart(2, '0');

const LockMark = () => (
  <svg className="sa-aircraft-picker__lock" viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
const Play = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden><path d={back ? 'M16 5.5v13L5.5 12z' : 'M8 5.5v13L18.5 12z'} /></svg>
);

/**
 * The patch leads from the bays to the selector: one per bay, the one in
 * focus lit. Drawn twice, once for each way the bench is laid out — the
 * bays in a row above the selector on a phone, in a column beside it on a
 * wide screen — and CSS shows the one that fits.
 */
function Leads({ lit }: { lit: number }) {
  const lead = (d: string, i: number) => (
    <g key={i} className={i === lit ? 'is-lit' : undefined}>
      <path className="sa-aircraft-picker__lead-sheath" d={d} />
      <path className="sa-aircraft-picker__lead-core" d={d} />
    </g>
  );
  return (
    <>
      <svg className="sa-aircraft-picker__leads sa-aircraft-picker__leads--down" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden>
        {['M50 0 C50 36 150 22 150 60', 'M150 0 L150 60', 'M250 0 C250 36 150 22 150 60'].map(lead)}
      </svg>
      <svg className="sa-aircraft-picker__leads sa-aircraft-picker__leads--across" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden>
        {['M0 50 C60 50 40 150 100 150', 'M0 150 L100 150', 'M0 250 C60 250 40 150 100 150'].map(lead)}
      </svg>
    </>
  );
}

/**
 * The hangar's bench: the three bays as cartridges on a drilled board, patched
 * into the selector — a hardware unit whose screen turns the craft in focus
 * and reads out what it is and what it takes to fly — and, on a wide screen,
 * a rack of its specs beside it.
 *
 * Every playable ride shares the same selector and launch flow. The F35 and
 * the UFO are the holders' fleet: the selector can be pointed at a bay this
 * wallet cannot fly — that is how a visitor finds out what it takes — but
 * only one it flies becomes the ride. The one key between the arrows is the
 * way on: launch, verify, or the pass still missing.
 *
 * One craft turns at a time, on the selector's screen: a phone in a wallet's
 * browser has few WebGL contexts to spare, and the landing's own scene holds
 * one already.
 */
export default function AircraftCarousel({
  mode, focus, onFocusChange, flyable, tokenBalance, balanceLoading, walletConnected, onConnect,
  onLaunch, launchLabel = 'Launch flight →',
}: AircraftCarouselProps) {
  const [sheet, setSheet] = useState<PlayMode | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const step = (direction: number) => onFocusChange(RIDES[(RIDES.indexOf(focus) + direction + RIDES.length) % RIDES.length]);

  /* A swipe across the screen steps along, as the arrows do. */
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => { swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.5) step(dx < 0 ? 1 : -1);
  };

  const index = RIDES.indexOf(focus);
  const bay = BAYS[index] ?? BAYS[0];
  const open = flyable[focus];
  const pass = RIDE_PASS[focus];
  const verifying = balanceLoading && !open;
  const lamp = verifying ? 'Verifying' : open ? 'Ready' : 'Locked';
  const status = verifying
    ? 'Verifying your $SEAT balance…'
    : open
      ? CRAFT_SPECS[focus].abilities.join(' · ')
      : walletConnected
        ? `Hold ${count(pass)} $SEAT to unlock · you hold ${count(tokenBalance ?? 0)}`
        : `Hold ${count(pass)} $SEAT to unlock`;
  /* The pass meter: how much of the pass the wallet holds. An open ride's is full. */
  const held = pass <= 0 ? 1 : walletConnected && tokenBalance !== null ? Math.min(1, tokenBalance / pass) : 0;
  /* The one way on from here. A bay in focus that flies is the ride (focusRide), so launching flies it. */
  const action = open
    ? { label: launchLabel, kind: 'go', onClick: mode === focus ? onLaunch : undefined }
    : !walletConnected
      ? { label: 'Connect to verify', kind: 'verify', onClick: onConnect }
      : { label: verifying ? 'Verifying…' : `Hold ${passShort(pass)} $SEAT`, kind: 'short', onClick: undefined };

  return (
    <section className="sa-aircraft-picker" aria-label="Aircraft selector">
      <div className={`sa-aircraft-picker__bench sa-aircraft-picker__bench--${focus}`}>
        <div className="sa-aircraft-picker__rack" role="group" aria-label="Aircraft bays">
          {BAYS.map(({ ride, name, line }, i) => {
            const flies = flyable[ride];
            return (
              <button
                key={ride}
                type="button"
                className={`sa-aircraft-picker__slot sa-aircraft-picker__slot--${ride}${focus === ride ? ' is-selected' : ''}${flies ? '' : ' is-locked'}`}
                onClick={() => onFocusChange(ride)}
                aria-pressed={focus === ride}
                aria-label={flies ? `${name}, ${line}` : `${name}, ${line}, locked: hold ${count(RIDE_PASS[ride])} $SEAT to fly it`}
              >
                <span className="sa-aircraft-picker__slot-check" aria-hidden />
                <span className="sa-aircraft-picker__slot-name">{name}</span>
                <span className="sa-aircraft-picker__slot-bay" aria-hidden>bay {two(i + 1)}</span>
                <span className="sa-aircraft-picker__slot-leds" aria-hidden>
                  {flies ? <><i /><i /></> : <LockMark />}
                </span>
              </button>
            );
          })}
        </div>

        <Leads lit={index} />

        <div className="sa-aircraft-picker__unit">
          <div
            className="sa-aircraft-picker__screen"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipe.current = null; }}
          >
            <div className="sa-aircraft-picker__screen-top">
              <span className={`sa-aircraft-picker__chip is-${lamp.toLowerCase()}`}>{lamp}</span>
              <span className="sa-aircraft-picker__count" aria-label={`Bay ${index + 1} of ${RIDES.length}`}>{two(index + 1)}/{two(RIDES.length)}</span>
            </div>
            <div className="sa-aircraft-picker__view" aria-hidden>
              <AircraftModelPreview model={focus} active />
            </div>
            <div className="sa-aircraft-picker__readout" aria-live="polite">
              <p className="sa-aircraft-picker__name">{bay.name}<small>{two(index + 1)}</small></p>
              <div className="sa-aircraft-picker__fields">
                <span className="sa-aircraft-picker__field">{bay.line}</span>
                <span className="sa-aircraft-picker__field sa-aircraft-picker__field--pass">{pass > 0 ? `P: ${passShort(pass)}` : 'P: open'}</span>
              </div>
              <p className="sa-aircraft-picker__status">{status}</p>
              <div className="sa-aircraft-picker__meter" aria-hidden>
                <span>0</span>
                <span className="sa-aircraft-picker__meter-track"><i style={{ width: `${held * 100}%` }} /></span>
                <span>{pass > 0 ? passShort(pass) : 'open'}</span>
              </div>
            </div>
          </div>
          <div className="sa-aircraft-picker__controls">
            <button type="button" className="sa-aircraft-picker__arrow" onClick={() => step(-1)} aria-label="Previous aircraft"><Play back /></button>
            <button
              type="button"
              className={`sa-aircraft-picker__action is-${action.kind}`}
              onClick={action.onClick}
              disabled={!action.onClick}
            >
              {action.label}
            </button>
            <button type="button" className="sa-aircraft-picker__arrow" onClick={() => step(1)} aria-label="Next aircraft"><Play /></button>
          </div>
          <button type="button" className="sa-aircraft-picker__sheet-link" onClick={() => setSheet(focus)}>
            {bay.name} spec sheet
          </button>
        </div>

        <div className="sa-aircraft-picker__specs" aria-label={`${bay.name} specs`}>
          <div className="sa-aircraft-picker__tag" aria-hidden><span>Flight {bay.name}</span><i /></div>
          {CRAFT_SPECS[focus].specs.slice(0, 3).map(([label, value]) => (
            <div key={label} className="sa-aircraft-picker__spec">
              <span>{label}</span>
              <strong>{value}</strong>
              <i aria-hidden />
            </div>
          ))}
        </div>
      </div>
      {/* Outside the bench: nothing between it and the hangar may carry a
          transform or filter, which would become the box this fixed sheet is laid out in. */}
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
