import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner } from '../lib/banners';
import { shortAddress, type Manifest } from '../lib/manifest';

/**
 * The whole aircraft, shrunk to fit beside the landing's aeroplane.
 *
 * A few seconds after the plane has been on the screen, a top-down plan of
 * it rises in: the airframe draws itself and fills in white, every one of
 * the 178 seats pops in nose to tail with the advert on it, seen through
 * the roof as if it were glass, and a "Claim your Seat" button blinks under
 * it. It is the premise in one picture — one plane, every seat a billboard,
 * and the empty ones yours for the out-holding.
 *
 * The seats are small at this size, so pointing at one lifts its advert out
 * of the cabin as a large tile, with whose seat it is; on a touch screen the
 * first tap on a seat does that, and a tap anywhere else on the plane goes
 * in to the full-size wall.
 *
 * The nose points right, the way the aeroplane flies. Rows are drawn in the
 * order they sit in the fuselage, not the order the ladder fills them: the
 * exit rows are 16 and 17, between two blocks of economy, and that is where
 * they are drawn, with a galley between cabins.
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

/** How wide a row is drawn, against economy's: the front of the cabin has more legroom. */
const WIDTH: Record<ZoneKey, number> = { deck: 1.5, first: 1.45, business: 1.12, exit: 1.15, economy: 1 };

const CABIN_NAME = Object.fromEntries(CABIN_ZONES.map((z) => [z.key, z.name])) as Record<ZoneKey, string>;
const ZONE_OF: ReadonlyMap<string, ZoneKey> = new Map(
  COLUMNS.flatMap((c) => [...c.left, ...c.right].map((id) => [id, c.zone] as const)),
);

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

/* The airframe, nose to the right, in a 1000 × 420 box, traced off a
   Boeing 737-700's three-view and scaled off its length. One wing,
   tailplane and engine are drawn; the other side is the same mirrored
   about y = 210.

   The fuselage is drawn wider than a 737's, to fit six seats abreast
   that can be seen. The wings and tailplanes are moved out by the same
   amount rather than stretched, so everything outside the fuselage keeps
   the drawing's true shape: the wingspan a little over the length of the
   aeroplane, so the wings run off the top and bottom of the picture,
   which crops them. */
const BODY =
  'M290 122 L832 122 C910 122 960 170 974 210 C960 250 910 298 832 298 L290 298 '
  + 'C220 298 110 250 24 216 L24 204 C110 170 220 122 290 122 Z';
/** The cabin, seen through the roof: the body inset, short of the cockpit and the tail cone. */
const CABIN =
  'M261 134 L834 134 C886 134 918 168 926 210 C918 252 886 286 834 286 L261 286 '
  + 'C251 286 245 280 245 270 L245 150 C245 140 251 134 261 134 Z';
const WING = 'M646 122 L428 -315 L366 -315 L445 46 L450 122 Z';
/** The wing's leading edge, picked out darker. */
const LEADING = 'M646 122 L428 -315';
/** The flaps along the trailing edge, and the spoilers ahead of them. */
const FLAPS = 'M450 122 L445 46 L366 -315 M476 112 L470 46 L404 -260 M445 46 L470 46 M424 -60 L450 -60 M400 -170 L424 -170';
/** The tailplane: rooted on the tail cone, its square tip just past the tail. */
const TAILPLANE = 'M136 160 L47 4 L2 4 L26 206 Z';
/** The elevator's hinge, along the tailplane's trailing edge. */
const ELEVATOR = 'M19 10 L58 176';
/** The engine, hung forward of the wing a quarter of the way out. */
const NACELLE = { x: 579, y: 15, w: 100, h: 54 };
/** What the window shows: the whole height, but the tail section mostly
    off its left edge — the seats are the point, not the tail. */
const VIEW = '140 0 860 420';
const MIRROR = 'matrix(1 0 0 -1 0 420)';

/** Where the peek tile sits, in the card's own pixels. */
interface Peek { id: string; x: number; y: number; below: boolean }
/** The peek tile's size: keep in step with `.sa-ov__peek`. */
const PEEK_W = 168;
const PEEK_H = 236;

interface SeatOverviewProps {
  manifest: Manifest;
  /** Every advert, by seat id. */
  banners: Readonly<Record<string, Banner>>;
  /** Connect and go to the seats. */
  onClaim: () => void;
  /** Go in, to the wall. */
  onBrowse: () => void;
}

const SeatOverview = memo(function SeatOverview({ manifest, banners, onClaim, onBrowse }: SeatOverviewProps) {
  const card = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const touch = useRef(false);
  const seated = useCountUp(manifest.entries.length);
  const open = useCountUp(manifest.open);
  const total = useMemo(() => COLUMNS.reduce((n, c) => n + c.left.length + c.right.length, 0), []);

  /* Lift a seat's advert out of the cabin: above the seat, or below it if
     there is no room above, never past either side of the card. */
  const show = useCallback((id: string, el: HTMLElement) => {
    const box = card.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const half = PEEK_W / 2 + 6;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, half), box.width - half);
    const below = r.top - PEEK_H - 12 < 0;
    setPeek({ id, x, y: below ? r.bottom - box.top : r.top - box.top, below });
  }, []);
  const hide = useCallback((id: string) => setPeek((p) => (p?.id === id ? null : p)), []);

  const seat = (id: string, col: number, i: number) => {
    const entry = manifest.bySeat.get(id);
    const image = entry ? banners[id]?.image : undefined;
    const state = image ? 'is-ad' : entry ? 'is-held' : 'is-open';
    return (
      <span
        key={id}
        className={`sa-ov__seat ${state}${peek?.id === id ? ' is-peeked' : ''}`}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(id, e.currentTarget); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide(id); }}
        onClick={(e) => {
          /* On a touch screen the first tap on a seat shows it; the plane's
             own click — going in — waits for a tap on one already shown. */
          if (!touch.current || peek?.id === id) return;
          e.stopPropagation();
          show(id, e.currentTarget);
        }}
        style={{
          '--pop': `${col * 38 + i * 14}ms`,
          '--tw': `${(scatter(id) * 9).toFixed(2)}s`,
          backgroundImage: image ? `url("${image.replace(/"/g, '%22')}")` : undefined,
        } as CSSProperties}
      />
    );
  };

  const peekEntry = peek ? manifest.bySeat.get(peek.id) ?? null : null;
  const peekBanner = peek && peekEntry ? banners[peek.id] ?? null : null;
  const peekOwn = peekBanner && !peekBanner.house ? peekBanner : null;
  const peekLink = safeHref(peekOwn?.href);

  return (
    <aside ref={card} className="sa-ov" aria-label="Every seat on board">
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
      <button
        type="button"
        className="sa-ov__plane"
        onClick={onBrowse}
        onPointerDown={(e) => { touch.current = e.pointerType !== 'mouse'; }}
        aria-label="See who is on board"
      >
        {/* Cloud drifting by underneath, so it reads as flying. */}
        <span className="sa-ov__sky" aria-hidden />
        <span className="sa-ov__float">
          <svg viewBox={VIEW} className="sa-ov__art" aria-hidden preserveAspectRatio="none">
            <defs>
              {/* White paint, rounder in the middle than at the edges, with the sun along its spine. */}
              <linearGradient id="sa-ov-paint" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#AEB9C7" />
                <stop offset="0.16" stopColor="#E9EEF4" />
                <stop offset="0.42" stopColor="#FFFFFF" />
                <stop offset="0.7" stopColor="#E3E9F0" />
                <stop offset="1" stopColor="#97A4B5" />
              </linearGradient>
              <linearGradient id="sa-ov-wingpaint" x1="1" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#E6EBF1" />
                <stop offset="1" stopColor="#B7C2CF" />
              </linearGradient>
              <linearGradient id="sa-ov-cowl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8F9CAD" />
                <stop offset="0.45" stopColor="#F1F4F8" />
                <stop offset="1" stopColor="#7D8A9C" />
              </linearGradient>
              <linearGradient id="sa-ov-floor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#081428" />
                <stop offset="0.5" stopColor="#10284A" />
                <stop offset="1" stopColor="#081428" />
              </linearGradient>
              <linearGradient id="sa-ov-fin" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#0E2E5E" />
                <stop offset="1" stopColor="#1B4F95" />
              </linearGradient>
              <linearGradient id="sa-ov-trail" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0" stopColor="#F2FAFF" stopOpacity="0.6" />
                <stop offset="1" stopColor="#F2FAFF" stopOpacity="0" />
              </linearGradient>
              <filter id="sa-ov-soft" x="-10%" y="-20%" width="120%" height="140%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>

            {/* Contrails from the engines, streaming aft. */}
            <path className="sa-ov__trail" d="M572 42 L-60 42" />
            <path className="sa-ov__trail" d="M572 378 L-60 378" />

            {/* Its shadow, cast on the cloud below. */}
            <g className="sa-ov__shadow" filter="url(#sa-ov-soft)">
              <path d={BODY} />
              <path d={WING} />
              <path d={WING} transform={MIRROR} />
              <path d={TAILPLANE} />
              <path d={TAILPLANE} transform={MIRROR} />
            </g>

            {/* Wings, tailplane and engines, under the fuselage. */}
            {[0, 1].map((side) => (
              <g key={side} transform={side ? MIRROR : undefined}>
                <path className="sa-ov__draw sa-ov__wing" pathLength={1} d={WING} />
                <path className="sa-ov__leading" d={LEADING} />
                <path className="sa-ov__panel" d={FLAPS} />
                <path className="sa-ov__draw sa-ov__wing" pathLength={1} d={TAILPLANE} />
                <path className="sa-ov__panel" d={ELEVATOR} />
                <line className="sa-ov__panel" x1={NACELLE.x + 30} y1={NACELLE.y + NACELLE.h / 2} x2={NACELLE.x + 70} y2={NACELLE.y + NACELLE.h / 2} />
                <g className="sa-ov__engine">
                  <rect x={NACELLE.x} y={NACELLE.y} width={NACELLE.w} height={NACELLE.h} rx={NACELLE.h / 2} />
                  <ellipse className="sa-ov__intake" cx={NACELLE.x + NACELLE.w - 5} cy={NACELLE.y + NACELLE.h / 2} rx="6" ry={NACELLE.h / 2 - 4} />
                  <rect className="sa-ov__exhaust" x={NACELLE.x - 8} y={NACELLE.y + 9} width="14" height={NACELLE.h - 18} rx="5" />
                </g>
              </g>
            ))}

            {/* The fuselage: white paint, with the cabin under a glass roof. */}
            <path className="sa-ov__draw sa-ov__body" pathLength={1} d={BODY} />
            <path className="sa-ov__cabinfloor" d={CABIN} />
            {/* A blue cheatline along each side, the airline's colour. */}
            <path className="sa-ov__cheat" d="M290 128 L840 128 M290 292 L840 292" />
            {/* The window rows. */}
            <path className="sa-ov__windows" d="M262 129 L850 129 M262 291 L850 291" />
            {/* The fin, seen edge-on from above, in the tail's navy. */}
            <path className="sa-ov__fin" d="M28 210 C80 201 190 199 250 203 C258 205 258 215 250 217 C190 221 80 219 28 210 Z" />
            {/* The APU's exhaust, in the blunt end of the cone. */}
            <rect className="sa-ov__apu" x="20" y="205" width="8" height="10" rx="3" />
            {/* The cockpit glazing. */}
            <path className="sa-ov__glass" d="M936 180 C950 190 957 200 959 210 C957 220 950 230 936 240 L929 226 C936 221 940 216 941 210 C940 204 936 199 929 194 Z" />
            {/* Doors: forward, over the wing, aft. */}
            {[843, 545, 262].map((x) => (
              <g key={x} className="sa-ov__door">
                <rect x={x} y="119" width="16" height="6" rx="2" />
                <rect x={x} y="295" width="16" height="6" rx="2" />
              </g>
            ))}

            {/* The beacon on the tail; the wingtip lights are out of the picture. */}
            <circle className="sa-ov__nav sa-ov__nav--tail" cx="120" cy="210" r="6" />
          </svg>

          <span className="sa-ov__cabin">
            {COLUMNS.map((c, col) => (
              <Fragment key={c.key}>
                {/* A galley between cabins, and a pair of doors at the exit rows. */}
                {col > 0 && COLUMNS[col - 1].zone !== c.zone && (
                  <span className={`sa-ov__galley${c.zone === 'exit' || COLUMNS[col - 1].zone === 'exit' ? ' sa-ov__galley--exit' : ''}`} aria-hidden />
                )}
                <span className={`sa-ov__row sa-ov__row--${c.zone}`} style={{ flexGrow: WIDTH[c.zone] }}>
                  <span className="sa-ov__bank">{c.left.map((id, i) => seat(id, col, i))}</span>
                  <span className="sa-ov__bank">{c.right.map((id, i) => seat(id, col, i + 3))}</span>
                </span>
              </Fragment>
            ))}
            <span className="sa-ov__sweep" aria-hidden />
          </span>
        </span>
      </button>

      {/* The seat under the pointer, big enough to read its advert. */}
      {peek && (
        <div
          key={peek.id}
          className={`sa-ov__peek${peek.below ? ' is-below' : ''}`}
          style={{ left: peek.x, top: peek.y }}
          role="status"
        >
          <div className="sa-ov__peek-art">
            {peekBanner ? (
              <img src={peekBanner.image} alt="" />
            ) : (
              <span className="sa-ov__peek-empty">{peekEntry ? 'No advert yet' : 'Open seat'}</span>
            )}
            <span className="sa-ov__peek-seat">
              {peek.id}
              {peekEntry && <span className="sa-ov__peek-rank">#{peekEntry.rank}</span>}
            </span>
          </div>
          <p className="sa-ov__peek-cabin">{CABIN_NAME[ZONE_OF.get(peek.id) ?? 'economy']}</p>
          <p className="sa-ov__peek-line">
            {peekOwn ? (
              peekLink ? <a href={peekLink} target="_blank" rel="noopener noreferrer nofollow">{peekOwn.alt}</a> : peekOwn.alt
            ) : peekEntry ? (
              <span className="sa-ov__peek-addr">{shortAddress(peekEntry.address)}</span>
            ) : (
              `Out-hold #${manifest.entries.length || 1} to take it`
            )}
          </p>
        </div>
      )}

      <p className="sa-ov__readout">
        Point at any seat to see its advert. Biggest holders up front.
      </p>

      <button type="button" className="sa-ov__claim" onClick={onClaim}>
        <span className="sa-ov__claim-label">Claim your Seat</span>
        <span aria-hidden>→</span>
      </button>
    </aside>
  );
});

export default SeatOverview;
