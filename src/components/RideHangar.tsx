import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { MARK_PATH } from './Mark';

/* The selector turns the craft in WebGL: three.js loads with it, when the hangar opens. */
const AircraftCarousel = lazy(() => import('./AircraftCarousel'));

type RideHangarProps = ComponentProps<typeof AircraftCarousel> & {
  onClose: () => void;
  /** Said under the bench: a wallet that could not connect, and where to get one. */
  children?: ReactNode;
};

/**
 * The hangar: what the ride selector shows inside its dialog. The airline's
 * mark and the way out along the top, the bay's call sign over the heading,
 * the bench, anything the page has to say about the wallet, and the airline's
 * line at the foot. Landing owns the dialog round it — focus, Escape, the
 * arrow keys.
 */
export default function RideHangar({ onClose, children, ...carousel }: RideHangarProps) {
  return (
    <div className="sa-ride-modal__content">
      <div className="sa-ride-modal__topline">
        <span className="sa-ride-modal__brand">
          <svg viewBox="0 0 1536 1536" aria-hidden><path d={MARK_PATH} fillRule="evenodd" /></svg>
          <span><b>Seat</b> Airlines</span>
        </span>
        <button type="button" className="sa-ride-modal__close" onClick={onClose} aria-label="Close ride selector">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="sa-ride-modal__hero-copy">
        <span className="sa-ride-modal__callsign">Hangar 01 · Flight deck</span>
        <h1>Select your aircraft</h1>
        <span className="sa-ride-modal__lede">Configure your ride before entering the climb.</span>
      </div>
      <Suspense fallback={null}>
        <AircraftCarousel {...carousel} />
      </Suspense>
      {children}
      <p className="sa-ride-modal__motto">Market cap is altitude. Your bag is your seat.</p>
    </div>
  );
}
