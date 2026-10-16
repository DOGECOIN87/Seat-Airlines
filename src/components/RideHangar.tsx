import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { MARK_PATH } from './Mark';

/* The console turns the three craft in WebGL: three.js loads with it, when the hangar opens. */
const AircraftCarousel = lazy(() => import('./AircraftCarousel'));

type RideHangarProps = ComponentProps<typeof AircraftCarousel> & {
  onClose: () => void;
  /** Said under the console: a wallet that could not connect, and where to get one. */
  children?: ReactNode;
};

/**
 * The hangar: what the ride selector shows inside its dialog. The airline's
 * mark and the bay's call sign along the top, the heading, the console, and
 * anything the page has to say about the wallet under it. Landing owns the
 * dialog round it — focus, Escape, the arrow keys.
 */
export default function RideHangar({ onClose, children, ...carousel }: RideHangarProps) {
  return (
    <div className="sa-ride-modal__content">
      <div className="sa-ride-modal__topline">
        <span className="sa-ride-modal__brand">
          <svg viewBox="0 0 1536 1536" aria-hidden><path d={MARK_PATH} fillRule="evenodd" /></svg>
          <span><b>Seat</b> Airlines</span>
        </span>
        <span className="sa-ride-modal__callsign">Hangar 01 · Flight deck</span>
        <button type="button" className="sa-ride-modal__close" onClick={onClose} aria-label="Close ride selector">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="sa-ride-modal__hero-copy">
        <h1>Select your aircraft</h1>
        <span>Configure your ride before entering the climb.</span>
      </div>
      <Suspense fallback={null}>
        <AircraftCarousel {...carousel} />
      </Suspense>
      {children}
    </div>
  );
}
