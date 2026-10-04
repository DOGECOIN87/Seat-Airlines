import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CABIN_SECTIONS, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import SeatDialog from './SeatDialog';
import AircraftRow from './AircraftRow';
import PassengerFilters from './PassengerFilters';
import { fetchSeatProfiles, type PublicSeatProfile } from '../lib/networkingApi';
import { matchesPassenger } from '../lib/passengerSearch';
import type { Offering } from '../content/offerings';

/**
 * Who is on board: every seat in its physical row, and the advert on it.
 *
 * This is what the site is for. Every held seat is a billboard, and a
 * billboard only works if everybody walking past can see it — so the wall is
 * on the page itself, straight under the aeroplane, with no wallet, no tab
 * and no cabin to unfold first. The seat map in the Seats panel is the same
 * aircraft drawn as a seating plan; this is it drawn as a wall of adverts,
 * cabin by cabin, the best placements largest and first.
 */

/** The widest a cabin's row is drawn, so two flight-deck seats are big but not a wall each. */
const ROW_MAX: Record<ZoneKey, string> = {
  deck: '30rem',
  first: '46rem',
  business: '60rem',
  exit: '60rem',
  economy: '60rem',
};

interface TileProps {
  id: string;
  entry: ManifestEntry | null;
  banner: Banner | null;
  mine: boolean;
  onOpen: (id: string) => void;
  dimmed: boolean;
  displayName?: string;
}

const Tile = ({ id, entry, banner, mine, onOpen, dimmed, displayName }: TileProps) => {
  /* A picture that will not load is drawn as the seat without one, rather
     than as the browser's broken-image icon. Keyed to the URL, so a replaced
     advert gets a fresh try. */
  const [failed, setFailed] = useState<string | null>(null);
  /* Only real holder adverts get artwork. Every other seat keeps its
     sculpted empty surface, with the rank of its holder when occupied. */
  const own = entry && banner && !banner.house && failed !== banner.image ? banner : null;
  const picture = own;
  const link = safeHref(own?.href);
  const holderName = displayName?.trim() || (entry ? shortAddress(entry.address) : 'Open seat');
  return (
    <li className={`sa-adwall__tile${mine ? ' is-mine' : ''}${dimmed ? ' is-filtered' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-haspopup="dialog"
        aria-label={entry ? `Seat ${id}, rank ${entry.rank}, ${shortAddress(entry.address)}${own ? `. Advert: ${own.alt}` : ''}` : `Seat ${id}, open`}
        data-seat={id}
        className={`sa-adwall__art${picture ? ' has-ad' : ' is-empty'}${!entry ? ' is-open' : ''}`}
      >
        {picture ? (
          <img src={picture.image} alt="" loading="lazy" onError={() => setFailed(picture.image)} />
        ) : (
          <span className="sa-adwall__space" aria-hidden>
            <span className="sa-adwall__space-id">{id}</span>
            {entry && <span className="sa-adwall__space-rank">#{entry.rank}</span>}
            <span className="sa-adwall__space-note">{entry ? 'No advert yet' : 'Open'}</span>
          </span>
        )}
      </button>
      <span className="sa-adwall__position" aria-hidden>
        {id}
        {entry && <span className="sa-adwall__rank">#{entry.rank}</span>}
      </span>
      <p className="sa-adwall__caption">
        {own ? (
          link ? (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" title={holderName}>{holderName}</a>
          ) : (
            <span title={holderName}>{holderName}</span>
          )
        ) : (
          <span className="sa-adwall__holder">{mine ? 'Your seat' : holderName}</span>
        )}
      </p>
    </li>
  );
};

interface AdvertWallProps {
  manifest: Manifest;
  banners: BannerSet;
  /** The visitor's own seat, if they hold one. */
  mine: string | null;
  /** The seat this visitor may advertise on, if any. */
  canAdvertise: string | null;
  onAdvertise: (seat: string) => void;
  /** The connected wallet and its signer, for sharing your seat's card to X. */
  owner?: string | null;
  sign?: (message: string) => Promise<string>;
}

const AdvertWall = memo(function AdvertWall({ manifest, banners, mine, canAdvertise, onAdvertise, owner, sign }: AdvertWallProps) {
  const [open, setOpen] = useState<{ id: string; zone: ZoneKey } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [offeringFilter, setOfferingFilter] = useState<Offering | ''>('');
  const [profiles, setProfiles] = useState<Record<string, PublicSeatProfile>>({});
  const [profileSearch, setProfileSearch] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const holderKey = manifest.entries.map((entry) => entry.address).join(',');
  useEffect(() => {
    if (!holderKey) return;
    let controller: AbortController;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void fetchSeatProfiles(signal).then((next) => {
        if (!signal.aborted) { setProfiles(next); setProfileSearch('ready'); }
      }).catch(() => { if (!signal.aborted) setProfileSearch('unavailable'); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('seat-airlines:profile-saved', refresh);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('seat-airlines:profile-saved', refresh);
    };
  }, [holderKey]);
  const filtering = Boolean(searchQuery.trim() || offeringFilter);
  const matchingSeats = new Set(manifest.entries.filter((entry) => matchesPassenger(entry, profiles[entry.address], searchQuery, offeringFilter)).map((entry) => entry.seat.id));
  const openSeat = useCallback((id: string) => {
    const seat = findSeat(id);
    if (seat) setOpen({ id, zone: seat.zone });
  }, []);
  const closeSeat = useCallback(() => setOpen(null), []);

  /* Empty slots stay in place; boarding rank never changes the seat plan. */
  const cabins = useMemo(() => CABIN_SECTIONS.map(({ zone, rows, id, note }) => ({
    zone,
    rows,
    id,
    note,
    held: rows.reduce((n, row) => n + [...row.left, ...row.right].filter((c) => manifest.bySeat.has(row.n === null ? c : `${row.n}${c}`)).length, 0),
    total: rows.reduce((n, row) => n + row.left.length + row.right.length, 0),
  })), [manifest.bySeat]);

  return (
    <section id="on-board" className="sa-adwall" aria-labelledby="sa-adwall-title">
      <header className="sa-adwall__head">
        <div className="min-w-0">
          <p className="sa-adwall__eyebrow">Every seat is a billboard</p>
          <h2 id="sa-adwall-title" className="sa-adwall__title">Who’s on board</h2>
        </div>
        <p className="sa-adwall__count tabular-nums">
          <strong>{manifest.entries.length}</strong> seated · {manifest.open} open
        </p>
      </header>
      <PassengerFilters query={searchQuery} offering={offeringFilter} onQuery={setSearchQuery} onOffering={setOfferingFilter}
        offeringsDisabled={profileSearch !== 'ready'} />
      {filtering && <p className="sa-passenger-results" role="status">{matchingSeats.size} matching {matchingSeats.size === 1 ? 'holder' : 'holders'}. {matchingSeats.size ? 'Matching seats are highlighted.' : 'Try another search or clear the filters.'}</p>}
      {profileSearch === 'unavailable' && <p className="sa-passenger-results">Profile search is unavailable. You can still search by wallet or seat.</p>}

      {manifest.entries.length === 0 ? (
        <p className="sa-adwall__empty" role="status">
          Boarding. The passenger list is on its way.
        </p>
      ) : (
        cabins.map(({ zone, rows, id, note, held, total }) => (
          <div key={id} className={`sa-adwall__cabin sa-adwall__cabin--${zone.key}`}>
            <h3 id={`sa-adwall-${id}`} className="sa-adwall__cabin-head">
              <span className="sa-adwall__cabin-name">{zone.name}</span>
              <span className="sa-adwall__cabin-count tabular-nums">{held} of {total}</span>
              {zone.key === 'economy' && <span className="sa-adwall__cabin-rows">{note}</span>}
            </h3>
            <div className="sa-adwall__scroll" role="region" aria-labelledby={`sa-adwall-${id}`} tabIndex={0}>
              <div
                className="sa-adwall__rows"
                style={{
                  '--row-max': ROW_MAX[zone.key],
                  '--row-min': zone.key === 'deck' ? '12rem' : zone.key === 'first' ? '20rem' : '29rem',
                } as CSSProperties}
              >
                {rows.map((row) => (
                  <AircraftRow key={row.n ?? 'deck'} row={row} renderSeat={(seat) => (
                    <Tile
                      key={seat}
                      id={seat}
                      entry={manifest.bySeat.get(seat) ?? null}
                      banner={banners[seat] ?? null}
                      mine={mine === seat}
                      onOpen={openSeat}
                      dimmed={filtering && !matchingSeats.has(seat)}
                      displayName={profiles[manifest.bySeat.get(seat)?.address ?? '']?.displayName}
                    />
                  )} />
                ))}
              </div>
            </div>
          </div>
        ))
      )}

      {open && (
        <SeatDialog
          id={open.id}
          zone={open.zone}
          entry={manifest.bySeat.get(open.id) ?? null}
          banner={banners[open.id] ?? null}
          mine={mine === open.id}
          canAdvertise={canAdvertise === open.id}
          seated={manifest.entries.length}
          onAdvertise={() => { setOpen(null); onAdvertise(open.id); }}
          onClose={closeSeat}
          owner={owner}
          sign={sign}
        />
      )}
    </section>
  );
});

export default AdvertWall;
