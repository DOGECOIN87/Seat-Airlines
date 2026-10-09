import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import { formatShare, formatTokens } from '../lib/seatLadder';
import SeatDialog from './SeatDialog';
import { reveal } from '../lib/reveal';
import { useFomoProfiles } from '../hooks/useFomoProfiles';
import type { FomoProfile } from '../lib/fomoProfile';
import ProfilePicture from './ProfilePicture';

/**
 * Actual holders, in balance rank order, grouped by their assigned cabin.
 * Vacant seats are omitted; the shared ladder still owns seat assignment.
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
  entry: ManifestEntry;
  banner: Banner | null;
  profile: FomoProfile | null;
  mine: boolean;
  /** Just found: pulsed while the map brings it into view. */
  found?: boolean;
  onOpen: (id: string) => void;
  onInspect: (id: string | null) => void;
}

const Seat = ({ entry, banner, profile, mine, found = false, onOpen, onInspect }: SeatProps) => {
  const id = entry.seat.id;
  /* An advert whose picture will not load is drawn as a held seat without
     one — its rank and number — rather than as the browser's broken-image
     icon, which is what the front of the wall showed when one went missing.
     Keyed to the URL, so a replaced advert gets a fresh try. */
  const [failed, setFailed] = useState<string | null>(null);
  const picture = banner && !banner.house && failed !== banner.image ? banner : null;

  /* Holder tiles are raised; the connected holder's tile is blue. */
  const state = mine
    ? 'sa-seat--mine'
    : picture ? 'sa-seat--advert' : 'sa-seat--sold';

  const label = `Seat ${id}, rank ${entry.rank}, ${shortAddress(entry.address)}${picture ? `. Advert: ${picture.alt}` : ''}`;

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
      data-rank={entry.rank}
      className={`sa-seat ${state}${found ? ' sa-seat--found' : ''}`}
    >
      {picture ? (
        <img
          src={picture.image}
          alt=""
          onError={() => setFailed(picture.image)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // No advert up yet, so the seat advertises itself: rank, then the
        // seat number under it, at a size somebody can actually read.
        <ProfilePicture profile={profile} className="sa-seat__profile" fallback={<span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="sa-seat__rank font-mono text-[length:clamp(12px,calc(var(--seat)*0.34),22px)] font-semibold">{entry.rank}</span>
          <span className="sa-seat__id mt-[0.15em] font-mono text-[length:clamp(11px,calc(var(--seat)*0.2),13px)]">{id}</span>
        </span>} />
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

const SeatMap = memo(function SeatMap({ manifest, banners, mine, canAdvertise, onAdvertise, owner, sign }: SeatMapProps) {
  const profiles = useFomoProfiles(manifest.entries.map(entry => entry.address));
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** The seat open in its own window, over the page. */
  const [open, setOpen] = useState<{ id: string; zone: ZoneKey } | null>(null);
  /* Occupied cabins start open; each can still be folded independently. */
  const [openZones, setOpenZones] = useState<ReadonlySet<string>>(() =>
    new Set(CABIN_ZONES.map(zone => zone.key)));
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
    const section = seat.zone;
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
  const heldSelection = [selected, inspecting, mine].find(id => id && manifest.bySeat.has(id));
  const shown = heldSelection ?? manifest.entries[0]?.seat.id ?? null;
  const entry = shown ? manifest.bySeat.get(shown) ?? null : null;
  const banner = shown ? banners[shown] ?? null : null;
  const link = safeHref(banner?.href);

  return (
    <div
      ref={mapRef}
      className="sa-map"
      /* Tiles scale with their panel; cabin grouping follows holder rank. */
      style={{ '--seat-base': 'clamp(26px, calc((100cqi - 9rem) / 6.2), 78px)', '--seat': 'var(--seat-base)', '--cabin-w': 'min(100%, 41rem)' } as CSSProperties}
    >
      <div className="sa-map__body">
        {!manifest.live && <p className="sa-map__availability" role="status">Loading holders…</p>}
        {manifest.live && !manifest.entries.length && <p className="sa-map__availability" role="status">No holders yet.</p>}
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
          {CABIN_ZONES.map(zone => {
            const holders = manifest.entries.filter(entry => entry.seat.zone === zone.key);
            if (!holders.length) return null;
            const sectionId = zone.key;
            const accent = ACCENT[zone.accent];
            const isOpen = openZones.has(sectionId);
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
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${zone.name}, ${holders.length} holders`}
                      className={`sa-zone-head sa-zone-toggle ${accent}`}
                    >
                      <span className="sa-zone-head__title">
                        <span className="sa-zone-head__name">{zone.name}</span>
                        <span className="sa-zone-head__visual">
                          {holders.length}
                        </span>
                      </span>
                      <span className="sa-zone-toggle__label" aria-hidden>
                        <svg viewBox="0 0 12 12" className="sa-zone-toggle__chev"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
                      </span>
                    </button>
                  </h3>

                {isOpen && (
                <div className="sa-zone__scroll">
                  <ol
                    id={`sa-zone-${sectionId}`}
                    className="sa-holder-grid"
                    aria-label={`${zone.name} holders, ranked by balance`}
                    start={holders[0].rank}
                    style={{ '--seat': `calc(var(--seat-base) * ${ZONE_SCALE[zone.key]})`, '--cols': Math.min(holders.length, zone.key === 'deck' ? 2 : zone.key === 'first' ? 4 : 6) } as CSSProperties}
                  >
                    {holders.map(entry => (
                        <li key={entry.address}>
                          <Seat
                            entry={entry}
                            banner={banners[entry.seat.id] ?? null}
                            profile={profiles[entry.address] ?? null}
                            mine={mine === entry.seat.id}
                            found={found === entry.seat.id}
                            onOpen={openSeat}
                            onInspect={setInspecting}
                          />
                        </li>
                    ))}
                  </ol>
                </div>
                )}
              </section>
            );
          })}
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
      {entry && <aside className="sa-map__side">
        <div className="sa-map__sticky">
        <div className="sa-map__card">
          <p className="sa-map__label">Holder</p>

          <div className="sa-map__preview">
            {banner && !banner.house ? (
              <img src={banner.image} alt={banner.alt} />
            ) : (
              <ProfilePicture profile={profiles[entry.address]} className="sa-map__profile" fallback={<span className="sa-map__preview-empty">#{entry.rank}</span>} />
            )}
          </div>

              <p className="sa-map__seat">
                <span>{entry.seat.id}</span>
                  <span className="sa-map__rank">#{entry.rank}</span>
              </p>
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

              {banner && !banner.house && (
                <p className="sa-map__alt">
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer nofollow">{banner.alt}</a>
                  ) : banner.alt}
                </p>
              )}

              {canAdvertise === entry.seat.id && (
                <button type="button" onClick={() => onAdvertise(entry.seat.id)} className="sa-map__advertise">
                  {banner && !banner.house ? 'Change your advert' : 'Advertise here'}
                </button>
              )}
        </div>

        </div>
      </aside>}

      {open && manifest.bySeat.has(open.id) && (
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
