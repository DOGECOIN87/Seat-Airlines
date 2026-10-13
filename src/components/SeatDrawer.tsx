import { useCallback, useEffect, useRef, useState } from 'react';
import type { BannerSet } from '../lib/banners';
import type { Manifest } from '../lib/manifest';
import SeatOverview from './SeatOverview';

/**
 * The landing's seat chart, put away in a drawer on the right.
 *
 * It used to rise in over the landing on its own a few seconds after the
 * splash. Now a tab on the screen's right edge opens it: the panel slides
 * in with the tab riding on its edge, and the tab, the ×, Escape or a tap
 * outside put it away again. The chart draws itself afresh each time it
 * opens, and is not kept running while it is shut.
 */

/** The slide; `.sa-seatdrawer__panel` times its transition to it. */
const SLIDE = 450;

interface SeatDrawerProps {
  manifest: Manifest;
  banners: BannerSet;
  onClaim: () => void;
  onBrowse: () => void;
  boosted?: boolean;
}

export default function SeatDrawer({ manifest, banners, onClaim, onBrowse, boosted = false }: SeatDrawerProps) {
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  /* Each opening is a fresh chart, so it draws itself in again. */
  const [opens, setOpens] = useState(0);
  const tab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = state === 'open';

  const show = useCallback(() => {
    setOpens((n) => n + 1);
    setState('open');
  }, []);
  const hide = useCallback(() => setState((s) => (s === 'open' ? 'closing' : s)), []);
  useEffect(() => {
    if (state !== 'closing') return;
    const id = window.setTimeout(() => setState('closed'), SLIDE);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (panel.current?.contains(document.activeElement)) tab.current?.focus();
      hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  return (
    <div className={`sa-seatdrawer${open ? ' is-open' : ''}`}>
      <div className="sa-seatdrawer__scrim" aria-hidden onClick={hide} />
      <div ref={panel} className="sa-seatdrawer__panel">
        <button
          ref={tab}
          type="button"
          className="sa-seatdrawer__tab"
          aria-expanded={open}
          aria-controls="sa-seatdrawer-body"
          aria-label={open ? 'Close the seat chart' : 'Open the seat chart'}
          onClick={open ? hide : show}
        >
          <span className="sa-live" aria-hidden />
          <svg viewBox="0 0 24 24" aria-hidden className="sa-seatdrawer__icon">
            <rect x="4" y="3" width="6" height="5" rx="1.5" />
            <rect x="14" y="3" width="6" height="5" rx="1.5" />
            <rect x="4" y="10" width="6" height="5" rx="1.5" />
            <rect x="14" y="10" width="6" height="5" rx="1.5" />
            <rect x="4" y="17" width="6" height="5" rx="1.5" />
            <rect x="14" y="17" width="6" height="5" rx="1.5" />
          </svg>
          <span className="sa-seatdrawer__label" aria-hidden>Seat chart</span>
          <svg viewBox="0 0 24 24" aria-hidden className="sa-seatdrawer__chevron">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div id="sa-seatdrawer-body" className="sa-seatdrawer__body" inert={!open}>
          <header className="sa-seatdrawer__head">
            <div>
              <p className="sa-seatdrawer__eyebrow">Every seat is a billboard</p>
              <h2 className="sa-seatdrawer__title">Seat chart</h2>
            </div>
            <button type="button" className="sa-seatdrawer__close" onClick={hide} aria-label="Close the seat chart">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          {state !== 'closed' && (
            <SeatOverview key={opens} manifest={manifest} banners={banners} onClaim={onClaim} onBrowse={onBrowse} boosted={boosted} />
          )}
          <ul className="sa-seatdrawer__legend" aria-label="Key">
            <li><i className="is-ad" aria-hidden />Advert</li>
            <li><i className="is-held" aria-hidden />Held</li>
            <li><i className="is-open" aria-hidden />Open</li>
          </ul>
          <button type="button" className="sa-seatdrawer__browse" onClick={onBrowse}>
            See who’s on board <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
