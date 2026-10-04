import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, type ZoneKey } from '../content/cabin';
import { shortAddress, type Manifest } from '../lib/manifest';

/**
 * The whole aircraft, shrunk to fit beside the landing's aeroplane.
 *
 * A few seconds after the plane has been on the screen, a top-down plan of
 * it rises in: the outline draws itself, every one of the 178 seats pops in
 * nose to tail with the advert on it, and a "Claim your Seat" button blinks
 * under it. It is the premise in one picture — one plane, every seat a
 * billboard, and the empty ones yours for the out-holding.
 *
 * Rows are drawn in the order they sit in the fuselage, not the order the
 * ladder fills them: the exit rows are 16 and 17, between two blocks of
 * economy, and that is where they are drawn.
 */

interface Column {
  key: string;
  zone: ZoneKey;
  left: string[];
  right: string[];
}

const COLUMNS: readonly Column[] = CABIN_ZONES
  .flatMap((zone) => zone.rows.map((row) => ({
    n: row.n ?? 0,
    zone: zone.key,
    left: row.left.map((c) => (row.n === null ? c : `${row.n}${c}`)),
    right: row.right.map((c) => (row.n === null ? c : `${row.n}${c}`)),
  })))
  .sort((a, b) => a.n - b.n)
  .map(({ n, zone, left, right }) => ({ key: String(n), zone, left, right }));

/** How wide a row is drawn, against economy's: the front of the cabin has more room. */
const WIDTH: Record<ZoneKey, number> = { deck: 1.5, first: 1.35, business: 1.05, exit: 1, economy: 1 };

/** A stable scatter for the twinkle, so a re-render does not reshuffle it. */
const scatter = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

/** A number that counts up to its value when it first appears. */
function useCountUp(target: number, ms = 1400, delay = 900): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }
    let raf = 0;
    const from = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - from) / ms));
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return shown;
}

interface SeatOverviewProps {
  manifest: Manifest;
  /** Advert images, by seat id. */
  adverts: Readonly<Record<string, string>>;
  /** Connect and go to the seats. */
  onClaim: () => void;
  /** Go in, to the wall. */
  onBrowse: () => void;
}

const SeatOverview = memo(function SeatOverview({ manifest, adverts, onClaim, onBrowse }: SeatOverviewProps) {
  const [hover, setHover] = useState<string | null>(null);
  const seated = useCountUp(manifest.entries.length);
  const open = useCountUp(manifest.open);
  const total = useMemo(() => COLUMNS.reduce((n, c) => n + c.left.length + c.right.length, 0), []);

  const hovered = hover ? manifest.bySeat.get(hover) ?? null : null;

  const seat = (id: string, col: number, i: number) => {
    const entry = manifest.bySeat.get(id);
    const image = entry ? adverts[id] : undefined;
    const state = image ? 'is-ad' : entry ? 'is-held' : 'is-open';
    return (
      <span
        key={id}
        className={`sa-ov__seat ${state}`}
        onPointerEnter={() => setHover(id)}
        onPointerLeave={() => setHover((h) => (h === id ? null : h))}
        style={{
          '--pop': `${col * 38 + i * 14}ms`,
          '--tw': `${(scatter(id) * 9).toFixed(2)}s`,
          backgroundImage: image ? `url("${image.replace(/"/g, '%22')}")` : undefined,
        } as CSSProperties}
      />
    );
  };

  return (
    <aside className="sa-ov" aria-label="Every seat on board">
      <div className="sa-ov__head">
        <p className="sa-ov__eyebrow">
          <span className="sa-live" aria-hidden /> Live seating
        </p>
        <p className="sa-ov__count tabular-nums">
          <strong>{seated}</strong> seated · <strong className="sa-ov__open">{open}</strong> open
          <span className="sr-only"> of {total}</span>
        </p>
      </div>

      {/* The plan is a picture of the wall, not a way through it: one button
          for the whole thing, which goes in to the full-size one. */}
      <button type="button" className="sa-ov__plane" onClick={onBrowse} aria-label="See who is on board">
        <svg viewBox="0 0 1000 400" className="sa-ov__outline" aria-hidden preserveAspectRatio="none">
          {/* Wings, swept back, and the tailplane. */}
          <path className="sa-ov__wing" pathLength={1} d="M430 116 L560 8 L615 8 L590 116 Z" />
          <path className="sa-ov__wing" pathLength={1} d="M430 284 L560 392 L615 392 L590 284 Z" />
          <path className="sa-ov__wing" pathLength={1} d="M860 130 L925 62 L958 62 L945 136 Z" />
          <path className="sa-ov__wing" pathLength={1} d="M860 270 L925 338 L958 338 L945 264 Z" />
          {/* Engines under the wings. */}
          <rect className="sa-ov__engine" x="470" y="58" width="70" height="26" rx="13" />
          <rect className="sa-ov__engine" x="470" y="316" width="70" height="26" rx="13" />
          {/* The fuselage: round nose on the left, the cone to the tail. */}
          <path
            className="sa-ov__body"
            pathLength={1}
            d="M110 112 L860 112 C915 112 975 170 990 200 C975 230 915 288 860 288 L110 288 C40 288 10 240 10 200 C10 160 40 112 110 112 Z"
          />
          {/* Lights on the wingtips: red to port, green to starboard. */}
          <circle className="sa-ov__nav sa-ov__nav--port" cx="590" cy="10" r="7" />
          <circle className="sa-ov__nav sa-ov__nav--star" cx="590" cy="390" r="7" />
        </svg>

        <span className="sa-ov__cabin">
          {COLUMNS.map((c, col) => (
            <span
              key={c.key}
              className={`sa-ov__row sa-ov__row--${c.zone}`}
              style={{ flexGrow: WIDTH[c.zone] }}
            >
              <span className="sa-ov__bank">{c.left.map((id, i) => seat(id, col, i))}</span>
              <span className="sa-ov__bank">{c.right.map((id, i) => seat(id, col, i + 3))}</span>
            </span>
          ))}
          <span className="sa-ov__sweep" aria-hidden />
        </span>
      </button>

      <p className="sa-ov__readout" aria-live="polite">
        {hover ? (
          hovered ? (
            <><strong>{hover}</strong> · #{hovered.rank} · {shortAddress(hovered.address)}</>
          ) : (
            <><strong>{hover}</strong> · open — out-hold #{manifest.entries.length || 1} to take it</>
          )
        ) : (
          'Every seat is a billboard. Biggest holders up front.'
        )}
      </p>

      <button type="button" className="sa-ov__claim" onClick={onClaim}>
        <span className="sa-ov__claim-label">Claim your Seat</span>
        <span aria-hidden>→</span>
      </button>
    </aside>
  );
});

export default SeatOverview;
