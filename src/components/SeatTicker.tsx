import { useEffect } from 'react';

export interface TickerItem {
  id: number;
  text: string;
}

/** How long each seat taken stays up, in ms. `.sa-ticker` times its fade to it. */
const SHOWN = 6000;

/**
 * The seats being taken, as they are taken.
 *
 * One at a time, above the tab bar, for everybody on the page: a holder who
 * climbed by holding more, and whose seat they took. Only the cause — the
 * holders it bumped back one place are not news (see `seatMoves.ts`).
 */
export default function SeatTicker({ items, onShown }: { items: readonly TickerItem[]; onShown: (id: number) => void }) {
  const current = items[0];
  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => onShown(current.id), SHOWN);
    return () => window.clearTimeout(id);
  }, [current, onShown]);
  if (!current) return null;
  return (
    <div key={current.id} className="sa-ticker" role="status" aria-live="polite">
      <svg viewBox="0 0 12 12" className="sa-ticker__up" aria-hidden><path d="M6 2.5 10 8H2z" /></svg>
      <span>{current.text}</span>
    </div>
  );
}
