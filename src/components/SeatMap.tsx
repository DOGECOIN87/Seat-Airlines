import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CABIN_SECTIONS, CARGO_HOLD, LAVATORY_SEATS, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import { formatShare, formatTokens } from '../lib/seatLadder';
import SeatDialog from './SeatDialog';
import AircraftRow from './AircraftRow';
import { reveal } from '../lib/reveal';

/**
 * The cabin, from above.
 *
 * Two things are true of this map that are not true of a seat map anywhere
 * else. Every seat on it is sold by rank — the manifest seats the top holders
 * and stops, so the empty rows aft are not decoration, they are the seats
 * nobody has out-held anyone for yet. And every seat is a square, so every
 * sold seat is a billboard: the holder in it can put a 1:1 image on their
 * square, and the whole aircraft reads as a wall of them with the best
 * placements at the front.
 */

/* Zone rank used to be carried by three accent colours. With one blue in
   the kit it is carried by emphasis instead: the classes forward sit in the
   accent, the rest of the aeroplane in the quiet grey. Same information,
   one hue. */
const ACCENT: Record<'cerise' | 'cyan' | 'violet', string> = {
  cerise: '',
  cyan: '',
  violet: 'sa-zone-head--plain',
};

interface SeatProps {
  id: string;
  zone: ZoneKey;
  entry: ManifestEntry | null;
  occupancyKnown: boolean;
  banner: Banner | null;
  mine: boolean;
  /** Just found: pulsed while the map brings it into view. */
  found?: boolean;
  onOpen: (id: string) => void;
  onInspect: (id: string | null) => void;
}

const Seat = ({ id, zone, entry, occupancyKnown, banner, mine, found = false, onOpen, onInspect }: SeatProps) => {
  const lavatory = (LAVATORY_SEATS as readonly string[]).includes(id);
  const sold = entry !== null;
  /* An advert whose picture will not load is drawn as a held seat without
     one — its rank and number — rather than as the browser's broken-image
     icon, which is what the front of the wall showed when one went missing.
     Keyed to the URL, so a replaced advert gets a fresh try. */
  const [failed, setFailed] = useState<string | null>(null);
  const picture = sold && banner && !banner.house && failed !== banner.image ? banner : null;

  /* Raised means held, sunk means open, blue means yours. The whole legend
     is three shadows, which is why the map can be read without one. */
  const state = mine
    ? 'sa-seat--mine'
    : sold
      ? (picture ? 'sa-seat--advert' : 'sa-seat--sold')
      : !occupancyKnown
        ? 'sa-seat--unknown'
      : zone === 'exit'
        ? 'sa-seat--open sa-seat--exit'
        : lavatory
          ? 'sa-seat--open sa-seat--lav'
          : 'sa-seat--open';

  const label = sold
    ? `Seat ${id}, rank ${entry.rank}, ${shortAddress(entry.address)}${banner ? `. Advert: ${banner.alt}` : ''}`
    : !occupancyKnown ? `Seat ${id}, occupancy unavailable`
    : `Seat ${id}, open${lavatory ? ', middle seat by the lavatory, does not recline' : ''}`;

  return (
    <button
      type="button"
      aria-pressed={mine}
      aria-haspopup="dialog"
      aria-label={label}
      onClick={() => onOpen(id)}
      onMouseEnter={() => onInspect(id)}
      onFocus={() => onInspect(id)}
      onMouseLeave={() => onInspect(null)}
      onBlur={() => onInspect(null)}
      style={{ width: 'var(--seat)', height: 'var(--seat)' }}
      data-seat={id}
      className={`sa-seat ${state}${found ? ' sa-seat--found' : ''}`}
    >
      {picture ? (
        <img
          src={picture.image}
          alt=""
          onError={() => setFailed(picture.image)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : sold ? (
        // No advert up yet, so the seat advertises itself: rank, then the
        // seat number under it, at a size somebody can actually read.
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="sa-seat__rank font-mono text-[length:clamp(12px,calc(var(--seat)*0.34),22px)] font-semibold">{entry.rank}</span>
          <span className="sa-seat__id mt-[0.15em] font-mono text-[length:clamp(11px,calc(var(--seat)*0.2),13px)]">{id}</span>
        </span>
      ) : (
        <span className="sa-seat__id absolute inset-0 grid place-items-center font-mono text-[length:clamp(11px,calc(var(--seat)*0.2),13px)] opacity-70">
          {id}
        </span>
      )}

      {/* Headrest — the line that turns a square into a seat. */}
      <span aria-hidden className="sa-seat__rest" />
    </button>
  );
};

interface SeatMapProps {
  manifest: Manifest;
  banners: BannerSet;
  mine: string | null;
  /** The seat this visitor may advertise on, if any. */
  canAdvertise: string | null;
  onAdvertise: (seat: string) => void;
  /** The connected wallet and its signer, for sharing your seat's card to X. */
  owner?: string | null;
  sign?: (message: string) => Promise<string>;
}

/** The section a seat is drawn in. */
const sectionOf = (id: string): string | undefined => CABIN_SECTIONS.find(({ rows }) => rows.some((row) =>
  [...row.left, ...row.right].some((c) => (row.n === null ? c : `${row.n}${c}`) === id)))?.id;

const SeatMap = memo(function SeatMap({ manifest, banners, mine, canAdvertise, onAdvertise, owner, sign }: SeatMapProps) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** The seat open in its own window, over the page. */
  const [open, setOpen] = useState<{ id: string; zone: ZoneKey } | null>(null);
  /* Show the complete cabin beside the aircraft on wide screens.
     Phones start folded; each section can still be opened independently. */
  const [openZones, setOpenZones] = useState<ReadonlySet<string>>(() =>
    new Set(window.matchMedia('(min-width: 1024px)').matches ? CABIN_SECTIONS.map(section => section.id) : []));
  const toggleZone = useCallback((zone: string) => {
    setOpenZones((current) => {
      const next = new Set(current);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  }, []);
  /* A click opens the seat. It is also the selection, so the readout beside
     the map is still on it once the window closes. */
  const openSeat = useCallback((id: string) => {
    const seat = findSeat(id);
    if (!seat) return;
    setSelected(id);
    setOpen({ id, zone: seat.zone });
  }, []);
  const closeSeat = useCallback(() => setOpen(null), []);

  /* Your seat, found for you. Every cabin starts folded, so a holder used to
     have to know which cabin to open before their seat was even drawn. Now
     the map opens yours, brings the seat to the middle of the view and
     pulses it for a few seconds — when the map opens, and again when a seat
     arrives (checking in, or out-holding someone into a new one). */
  const mapRef = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    if (!mine) return;
    const seat = findSeat(mine);
    if (!seat) return;
    const section = sectionOf(mine);
    if (section) setOpenZones((current) => (current.has(section) ? current : new Set(current).add(section)));
    setFound(mine);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The cabin is drawn on the next render; look for the seat until it is there.
    let tries = 0;
    let raf = 0;
    const bring = () => {
      const el = mapRef.current?.querySelector<HTMLElement>(`[data-seat="${mine}"]`);
      if (el) reveal(el, { block: 'center', inline: 'center', behavior: calm ? 'auto' : 'smooth' });
      else if (++tries < 30) raf = requestAnimationFrame(bring);
    };
    raf = requestAnimationFrame(bring);
    const done = window.setTimeout(() => setFound(null), 4200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [mine]);

  /* How big a seat is drawn, by class.

     Every seat is the same square in the ladder's arithmetic, but they are
     emphatically not the same placement, and a map that draws rank 1 and rank
     40 at identical size is quietly arguing that they are. The front of the
     cabin is the front of the wall, so it is drawn that way. */
  const ZONE_SCALE: Record<ZoneKey, number> = {
    deck: 1.5, first: 1.22, business: 1, exit: 1, economy: 1,
  };

  /* With nothing under the cursor the panel falls back to the best seat on
     the aircraft rather than to an empty square: the front of the wall is
     what the section is selling, so that is what it shows at rest. */
  const shown = selected ?? inspecting ?? mine ?? manifest.entries[0]?.seat.id ?? null;
  const resting = !selected && !inspecting && !mine;
  const entry = shown ? manifest.bySeat.get(shown) ?? null : null;
  const banner = shown ? banners[shown] ?? null : null;
  const link = safeHref(banner?.href);

  return (
    <div
      ref={mapRef}
      className="sa-map"
      /* One knob sets the whole grid: the seat is a square and everything is
         measured off it, so the map scales from a phone to a desktop without
         a second layout. It is measured off the map's own well rather than
         the window, so it fits whatever it is opened in — a panel beside the
         view is a phone's width on the widest screen. Six seats and an
         aisle, the row numbers and the gaps between them come to six seats
         and nine rem. */
      style={{ '--seat-base': 'clamp(26px, calc((100cqi - 9rem) / 6.2), 78px)', '--seat': 'var(--seat-base)', '--cabin-w': 'min(100%, 41rem)' } as CSSProperties}
    >
      <div className="sa-map__body">
        {!manifest.live && <p className="sa-map__availability" role="status">Seat occupancy is unavailable. You can inspect seats while the holder list loads.</p>}
        {/* ── Nose ── */}
        <svg viewBox="0 0 320 54" preserveAspectRatio="none" className="mx-auto block h-11 w-full max-w-[var(--cabin-w)]" aria-hidden>
          <path
            d="M160 6 C202 6 244 25 258 53 L62 53 C76 25 118 6 160 6 Z"
            fill="#E8E9ED"
            stroke="rgba(163,167,180,0.55)"
            strokeWidth="1.25"
          />
          <path d="M132 34 h56" stroke="rgba(163,167,180,0.6)" strokeWidth="1.5" />
          <circle cx="160" cy="22" r="2.5" fill="#0087EA" />
        </svg>

        <div className="sa-map__cabin mx-auto max-w-[var(--cabin-w)]">
          {CABIN_SECTIONS.map(({ zone, rows, id: sectionId, note }) => {
            const accent = ACCENT[zone.accent];
            const isOpen = openZones.has(sectionId);
            const total = rows.reduce((n, row) => n + row.left.length + row.right.length, 0);
            const held = rows.reduce((n, row) => n + [...row.left, ...row.right]
              .filter((c) => manifest.seats.has(row.n === null ? c : `${row.n}${c}`)).length, 0);
            return (
                <section key={sectionId} className={`sa-zone sa-zone--${zone.key}`}>
                  {/* The whole header is the switch: a big target on a phone,
                      and the heading stays a heading for anybody navigating
                      by them. */}
                  <h3 className="m-0">
                    <button
                      type="button"
                      onClick={() => toggleZone(sectionId)}
                      aria-expanded={isOpen}
                      aria-controls={`sa-zone-${sectionId}`}
                      className={`sa-zone-head sa-zone-toggle ${accent}`}
                    >
                      <span className="sa-zone-head__mark" aria-hidden>{zone.code}</span>
                      <span className="sa-zone-head__title">
                        <span className="sa-zone-head__name">{zone.name}</span>
                        {/* How full it is, so a closed cabin still says whether it
                            is worth opening, then the cabin's own note. One line
                            under the name rather than a column beside it: with the
                            switch on the right there is no room on a phone for a
                            third column, and squeezing one in broke the name
                            letter by letter. The count is non-breaking; a dash
                            is followed by a word joiner so a range never splits. */}
                        <span className="sa-zone-head__visual">
                          {manifest.live ? `${held}\u00a0of\u00a0${total}\u00a0taken\u00a0` : 'Not verified'}
                          <span aria-hidden>· </span>
                          {note.replace(/–/g, '–\u2060')}
                        </span>
                      </span>
                      <span className="sa-zone-toggle__label" aria-hidden>
                        {isOpen ? 'Hide' : 'Show'}
                        <svg viewBox="0 0 12 12" className="sa-zone-toggle__chev"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
                      </span>
                    </button>
                  </h3>

                {isOpen && (
                <div className="sa-zone__scroll">
                  <div
                    id={`sa-zone-${sectionId}`}
                    className="sa-zone__rows"
                    style={{ '--seat': `calc(var(--seat-base) * ${ZONE_SCALE[zone.key]})` } as CSSProperties}
                  >
                    {rows.map((row) => (
                      <AircraftRow key={row.n ?? 'deck'} row={row} renderSeat={(id) => (
                        <li key={id}>
                          <Seat
                            id={id}
                            zone={zone.key}
                            entry={manifest.bySeat.get(id) ?? null}
                            occupancyKnown={manifest.live}
                            banner={banners[id] ?? null}
                            mine={mine === id}
                            found={found === id}
                            onOpen={openSeat}
                            onInspect={setInspecting}
                          />
                        </li>
                      )} />
                    ))}
                  </div>
                </div>
                )}
              </section>
            );
          })}

          {/* ── Cargo hold ── */}
          <section>
            <header className="sa-zone-head sa-zone-head--plain">
              <span className="sa-zone-head__mark" aria-hidden>CRG</span>
              <div className="sa-zone-head__title">
                <h3>{CARGO_HOLD.name}</h3>
                <span className="sa-zone-head__visual">Below the cutoff&nbsp;/ unpressurized</span>
              </div>
              <span className="sa-zone-head__note">{CARGO_HOLD.note}</span>
            </header>
            <p className="px-4 py-4 text-[12.5px] leading-relaxed text-ui-soft">{CARGO_HOLD.body}</p>
          </section>
        </div>

        {/* ── Tail ── */}
        <svg viewBox="0 0 320 64" preserveAspectRatio="none" className="mx-auto block h-12 w-full max-w-[var(--cabin-w)]" aria-hidden>
          <path
            d="M62 0 L258 0 C247 28 211 52 160 58 C109 52 73 28 62 0 Z"
            fill="#E8E9ED"
            stroke="rgba(163,167,180,0.55)"
            strokeWidth="1.25"
          />
          <path d="M160 10 L160 48" stroke="#0087EA" strokeWidth="2.5" opacity="0.7" />
        </svg>
      </div>

      {/* ── Who is in the seat under the cursor ────────────────────────────
          Beside the map rather than under it, and sticky, so the advert you
          are pointing at is shown at a size worth looking at while the map
          stays where it was. A popover on a tile would cover the three next
          to it, which is the whole reason this is a panel. */}
      <aside className="sa-map__side">
        <div className="sa-map__sticky">
        <div className="sa-map__card">
          <p className="sa-map__label">{resting ? 'Best placement on board' : 'Seat'}</p>

          <div className="sa-map__preview">
            {banner ? (
              <img src={banner.image} alt={banner.alt} />
            ) : (
              <span className="sa-map__preview-empty">{entry ? 'No advert yet' : 'Seat open'}</span>
            )}
          </div>

          {shown ? (
            <>
              <p className="sa-map__seat">
                <span>{shown}</span>
                {entry ? (
                  <span className="sa-map__rank">#{entry.rank}</span>
                ) : (
                  <span className="sa-map__unsold">{manifest.live ? 'Open' : 'Unverified'}</span>
                )}
              </p>
              {entry ? (
                <>
                <dl className="sa-map__facts">
                  <div>
                    <dt>Holder</dt>
                    <dd className="font-mono">{shortAddress(entry.address)}</dd>
                  </div>
                  <div>
                    <dt>Bag</dt>
                    <dd className="tabular-nums">{formatTokens(entry.balance)}</dd>
                  </div>
                  <div>
                    <dt>Share</dt>
                    <dd className="tabular-nums">{formatShare(entry.share)}</dd>
                  </div>
                </dl>
                </>
              ) : (
                <p className="sa-map__note">
                  {manifest.live ? `Nobody holds this seat. Out-hold #${manifest.entries.length || 1} and it is yours.` : 'Occupancy could not be verified. This seat may already be held.'}
                </p>
              )}

              {banner && (
                <p className="sa-map__alt">
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer nofollow">{banner.alt}</a>
                  ) : banner.alt}
                </p>
              )}

              {canAdvertise === shown && (
                <button type="button" onClick={() => onAdvertise(shown)} className="sa-map__advertise">
                  {banner ? 'Change your advert' : 'Advertise here'}
                </button>
              )}
              {resting && (
                <p className="sa-map__note">
                  Open any seat to see who holds it.
                </p>
              )}
            </>
          ) : (
            <p className="sa-map__note">
              Open any seat to see who holds it. Empty seats keep their position in each row.
            </p>
          )}
        </div>

        {/* ── Legend ── */}
        <ul className="sa-map__legend">
          <li><span aria-hidden className={`sa-key ${manifest.live ? 'sa-key--open' : 'sa-key--unknown'}`} /> {manifest.live ? 'Open' : 'Unverified'}</li>
          <li><span aria-hidden className="sa-key sa-key--held" /> Held</li>
          <li><span aria-hidden className="sa-key sa-key--mine" /> Yours</li>
          <li className="sa-map__count tabular-nums">{manifest.live ? `${manifest.entries.length} seated · ${manifest.open} open` : 'Occupancy unavailable'}</li>
        </ul>

        </div>
      </aside>

      {open && (
        <SeatDialog
          id={open.id}
          zone={open.zone}
          entry={manifest.bySeat.get(open.id) ?? null}
          banner={banners[open.id] ?? null}
          mine={mine === open.id}
          canAdvertise={canAdvertise === open.id}
          seated={manifest.entries.length}
          occupancyKnown={manifest.live}
          onAdvertise={() => { setOpen(null); onAdvertise(open.id); }}
          onClose={closeSeat}
          owner={owner}
          sign={sign}
        />
      )}
    </div>
  );
});

export default SeatMap;
