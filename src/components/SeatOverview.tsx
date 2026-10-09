import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner } from '../lib/banners';
import { shortAddress, type Manifest } from '../lib/manifest';
import { useFomoProfiles } from '../hooks/useFomoProfiles';
import ProfilePicture from './ProfilePicture';

/**
 * Actual holders on the aircraft, largest balance first from the nose.
 * The overview uses the same manifest and profile cache as the Seats panel.
 */

const CABIN_NAME = Object.fromEntries(CABIN_ZONES.map((z) => [z.key, z.name])) as Record<ZoneKey, string>;

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
  /** Boosted on DexScreener: the engines burn and the cloud goes by faster. */
  boosted?: boolean;
  /**
   * 'wall': the same chart, full width in the site's wall rather than a card
   * over the landing — no counts of its own (the wall has them), and a seat
   * opens its seat window instead of the plane going in.
   */
  variant?: 'landing' | 'wall';
  /** Open a seat's window. With it, every seat click opens one. */
  onSeat?: (id: string) => void;
  /** Seats a search matches; the rest fade back. Absent, none fade. */
  highlight?: ReadonlySet<string> | null;
}

const SeatOverview = memo(function SeatOverview({
  manifest, banners, onClaim, onBrowse, boosted = false, variant = 'landing', onSeat, highlight = null,
}: SeatOverviewProps) {
  const card = useRef<HTMLElement>(null);
  const profiles = useFomoProfiles(manifest.entries.map(entry => entry.address));
  const [peek, setPeek] = useState<Peek | null>(null);
  const touch = useRef(false);
  /* The wall's chart is drawn at a fixed size, wide enough that a desk at
     100% sees the whole cabin; narrower, it slides sideways — by finger, by
     wheel, or by dragging with the mouse. It opens on the nose, where the
     best seats are. */
  const pan = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  /* Which edges have more cabin past them: each one fades. */
  const edges = useCallback(() => {
    const el = pan.current;
    if (!el) return;
    const more = el.scrollWidth - el.clientWidth;
    el.classList.toggle('has-left', more > 1 && el.scrollLeft > 1);
    el.classList.toggle('has-right', more > 1 && el.scrollLeft < more - 1);
  }, []);
  useEffect(() => {
    if (variant !== 'wall') return;
    const el = pan.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    edges();
    if (!('ResizeObserver' in window)) return;
    const watch = new ResizeObserver(edges);
    watch.observe(el);
    return () => watch.disconnect();
  }, [variant, edges]);
  const onPan = useCallback(() => { setPeek(null); edges(); }, [edges]);
  const dragPan = variant !== 'wall' ? {} : {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      dragged.current = false;
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const el = e.currentTarget;
      const from = e.clientX;
      const left = el.scrollLeft;
      const move = (m: PointerEvent) => {
        const dx = m.clientX - from;
        if (Math.abs(dx) > 5) { dragged.current = true; el.classList.add('is-dragging'); }
        if (dragged.current) el.scrollLeft = left - dx;
      };
      const up = () => {
        el.classList.remove('is-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    /* A drag that ends on a seat is a drag, not a click on it. */
    onClickCapture: (e: React.MouseEvent) => {
      if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; }
    },
  };
  const seated = useCountUp(manifest.entries.length);

  /* Lift a seat's advert out of the cabin: above the seat, or below it if
     there is no room above, never past either side of the card. */
  const show = useCallback((id: string, el: HTMLElement) => {
    const box = card.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const half = PEEK_W / 2 + 6;
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, half), box.width - half);
    /* The site's gate sign stays stuck to the top of the screen: a preview
       that would open behind it opens below the seat instead. */
    const ceiling = document.querySelector('.sa-topbar')?.getBoundingClientRect().bottom ?? 0;
    const below = r.top - PEEK_H - 12 < Math.max(0, ceiling);
    setPeek({ id, x, y: below ? r.bottom - box.top : r.top - box.top, below });
  }, []);
  const hide = useCallback((id: string) => setPeek((p) => (p?.id === id ? null : p)), []);

  const seat = (id: string, i: number) => {
    const entry = manifest.bySeat.get(id);
    if (!entry) return null;
    const banner = banners[id];
    const image = banner && !banner.house ? banner.image : undefined;
    const state = image ? 'is-ad' : 'is-held';
    return (
      <button
        type="button"
        key={entry.address}
        data-seat={id}
        data-rank={entry.rank}
        aria-label={`Seat ${id}, rank ${entry.rank}, ${shortAddress(entry.address)}`}
        className={`sa-ov__seat ${state}${peek?.id === id ? ' is-peeked' : ''}${highlight && !highlight.has(id) ? ' is-dim' : ''}`}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(id, e.currentTarget); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide(id); }}
        onFocus={e => show(id, e.currentTarget)}
        onBlur={() => hide(id)}
        onClick={(e) => {
          e.stopPropagation();
          if (touch.current && e.detail !== 0 && peek?.id !== id) {
            show(id, e.currentTarget);
            return;
          }
          setPeek(null);
          if (onSeat) onSeat(id);
          else onBrowse();
        }}
        style={{
          '--pop': `${i * 14}ms`,
          '--tw': `${(scatter(id) * 9).toFixed(2)}s`,
          backgroundImage: image ? `url("${image.replace(/"/g, '%22')}")` : undefined,
        } as CSSProperties}
      >
        {!image && <ProfilePicture profile={profiles[entry.address]} className="sa-ov__profile" fallback={<span className="sa-ov__rank">{entry.rank}</span>} />}
      </button>
    );
  };

  const peekEntry = peek ? manifest.bySeat.get(peek.id) ?? null : null;
  const peekBanner = peek && peekEntry ? banners[peek.id] ?? null : null;
  const peekOwn = peekBanner && !peekBanner.house ? peekBanner : null;
  const peekLink = safeHref(peekOwn?.href);

  return (
    <aside ref={card} className={`sa-ov${variant === 'wall' ? ' sa-ov--wall' : ''}${boosted ? ' is-boosted' : ''}`} aria-label="Holders ranked by balance">
      <div className="sa-ov__head">
        <p className="sa-ov__eyebrow">
          <span className="sa-live" aria-hidden /> Live seating
        </p>
        <p className="sa-ov__count tabular-nums">
          <strong>{seated}</strong> holders
        </p>
      </div>

      <div ref={pan} className="sa-ov__pan" onScroll={onPan} {...dragPan}><div className="sa-ov__track">
      <div
        className="sa-ov__plane"
        onClick={variant === 'wall' ? undefined : onBrowse}
        onPointerDown={(e) => { touch.current = e.pointerType !== 'mouse'; }}
        role="group"
        aria-label="Holders, highest balance first from the nose"
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
              <linearGradient id="sa-ov-flame" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="0.12" stopColor="#9FE8FF" />
                <stop offset="0.35" stopColor="#FFB23A" />
                <stop offset="0.75" stopColor="#FF4A12" stopOpacity="0.7" />
                <stop offset="1" stopColor="#FF2A00" stopOpacity="0" />
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
                  {boosted && (
                    <g className="sa-ov__burn">
                      <path className="sa-ov__flame" d={`M${NACELLE.x - 4} ${NACELLE.y + 8} C${NACELLE.x - 50} ${NACELLE.y + 12} ${NACELLE.x - 110} ${NACELLE.y + 20} ${NACELLE.x - 190} ${NACELLE.y + NACELLE.h / 2} C${NACELLE.x - 110} ${NACELLE.y + NACELLE.h - 20} ${NACELLE.x - 50} ${NACELLE.y + NACELLE.h - 12} ${NACELLE.x - 4} ${NACELLE.y + NACELLE.h - 8} Z`} />
                      <path className="sa-ov__flame sa-ov__flame--core" d={`M${NACELLE.x - 4} ${NACELLE.y + 16} C${NACELLE.x - 40} ${NACELLE.y + 20} ${NACELLE.x - 70} ${NACELLE.y + 24} ${NACELLE.x - 100} ${NACELLE.y + NACELLE.h / 2} C${NACELLE.x - 70} ${NACELLE.y + NACELLE.h - 24} ${NACELLE.x - 40} ${NACELLE.y + NACELLE.h - 20} ${NACELLE.x - 4} ${NACELLE.y + NACELLE.h - 16} Z`} />
                    </g>
                  )}
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

          <span className="sa-ov__cabin sa-ov__cabin--ranked">
            {manifest.entries.map((entry, i) => seat(entry.seat.id, i))}
          </span>
        </span>
      </div>
      </div></div>

      {/* The seat under the pointer, big enough to read its advert. */}
      {peek && (
        <div
          key={peek.id}
          className={`sa-ov__peek${peek.below ? ' is-below' : ''}`}
          style={{ left: peek.x, top: peek.y }}
          role="status"
        >
          <div className="sa-ov__peek-art">
            {peekOwn ? (
              <img src={peekOwn.image} alt="" />
            ) : (
              <ProfilePicture profile={peekEntry ? profiles[peekEntry.address] : null} className="sa-ov__profile" fallback={<span className="sa-ov__peek-empty">{peekEntry ? `#${peekEntry.rank}` : ''}</span>} />
            )}
            <span className="sa-ov__peek-seat">
              {peek.id}
              {peekEntry && <span className="sa-ov__peek-rank">#{peekEntry.rank}</span>}
            </span>
          </div>
          <p className="sa-ov__peek-cabin">{CABIN_NAME[peekEntry?.seat.zone ?? 'economy']}</p>
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

      <button type="button" className="sa-ov__claim" onClick={onClaim}>
        <span className="sa-ov__claim-label">Claim your Seat</span>
        <span aria-hidden>→</span>
      </button>
    </aside>
  );
});

export default SeatOverview;
