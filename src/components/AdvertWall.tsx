import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, findSeat, seatCount, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import SeatDialog from './SeatDialog';
import PassengerFilters from './PassengerFilters';
import { fetchSeatProfiles, type PublicSeatProfile } from '../lib/networkingApi';
import { matchesPassenger } from '../lib/passengerSearch';
import type { Offering } from '../content/offerings';

/**
 * Who is on board: every held seat, and the advert on it, for anybody.
 *
 * This is what the site is for. Every held seat is a billboard, and a
 * billboard only works if everybody walking past can see it — so the wall is
 * on the page itself, straight under the aeroplane, with no wallet, no tab
 * and no cabin to unfold first. The seat map in the Seats panel is the same
 * aircraft drawn as a seating plan; this is it drawn as a wall of adverts,
 * cabin by cabin, the best placements largest and first.
 *
 * Only held seats are drawn. With a few dozen holders an all-178 plan was
 * mostly "Open" squares, the adverts a few dots in it; the seating plan
 * with every seat in its place is the Seats panel's job.
 */

/* Each cabin is laid out with its own seats to a row — two on the flight
   deck, four in first, six behind — so the front of the aircraft is drawn
   largest. On a phone the six-across cabins go three to a row. */
const COLUMNS: Record<ZoneKey, { wide: number; narrow: number }> = {
  deck: { wide: 2, narrow: 2 },
  first: { wide: 4, narrow: 2 },
  business: { wide: 6, narrow: 3 },
  exit: { wide: 6, narrow: 3 },
  economy: { wide: 6, narrow: 3 },
};

/** The widest a cabin's row is drawn, so two flight-deck seats are big but not a wall each. */
const ROW_MAX: Record<ZoneKey, string> = {
  deck: '30rem',
  first: '46rem',
  business: '100%',
  exit: '100%',
  economy: '100%',
};

interface TileProps {
  entry: ManifestEntry;
  banner: Banner | null;
  mine: boolean;
  onOpen: (id: string) => void;
  dimmed: boolean;
  displayName?: string;
}

const Tile = ({ entry, banner, mine, onOpen, dimmed, displayName }: TileProps) => {
  const id = entry.seat.id;
  /* A picture that will not load is drawn as the seat without one, rather
     than as the browser's broken-image icon. Keyed to the URL, so a replaced
     advert gets a fresh try. */
  const [failed, setFailed] = useState<string | null>(null);
  /* Only real holder adverts get artwork. Every other seat keeps its
     sculpted empty surface, with the rank of its holder when occupied. */
  const own = banner && !banner.house && failed !== banner.image ? banner : null;
  const picture = own;
  const link = safeHref(own?.href);
  const holderName = displayName?.trim() || shortAddress(entry.address);
  /* The advertiser's own words are the caption: that is the advert's copy.
     The default the dialog fills in when they leave it blank says nothing,
     so the holder's name stands in for it. */
  const copy = own && !/^Advert on seat /.test(own.alt) ? own.alt : holderName;
  return (
    <li className={`sa-adwall__tile${mine ? ' is-mine' : ''}${dimmed ? ' is-filtered' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-haspopup="dialog"
        aria-label={`Seat ${id}, rank ${entry.rank}, ${holderName}${own ? `. Advert: ${own.alt}` : ''}`}
        data-seat={id}
        className={`sa-adwall__art${picture ? ' has-ad' : ' is-empty'}`}
      >
        {picture ? (
          <img src={picture.image} alt="" loading="lazy" onError={() => setFailed(picture.image)} />
        ) : (
          <span className="sa-adwall__space" aria-hidden>
            <span className="sa-adwall__space-id">{id}</span>
            <span className="sa-adwall__space-rank">#{entry.rank}</span>
            <span className="sa-adwall__space-note">{mine ? 'Add your advert' : 'Advert space'}</span>
          </span>
        )}
      </button>
      <span className="sa-adwall__position" aria-hidden>
        {id}
        <span className="sa-adwall__rank">#{entry.rank}</span>
      </span>
      <p className="sa-adwall__caption">
        {own ? (
          link ? (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" title={copy}>{copy}</a>
          ) : (
            <span title={copy}>{copy}</span>
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
    /* Coming back to the tab re-reads the cards, at most once a minute; a
       card you have just saved re-reads them straight away. */
    let lastFocus = Date.now();
    const onFocus = () => {
      if (Date.now() - lastFocus < 60_000) return;
      lastFocus = Date.now();
      refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('seat-airlines:profile-saved', refresh);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('seat-airlines:profile-saved', refresh);
    };
  }, [holderKey]);
  const filtering = Boolean(searchQuery.trim() || offeringFilter);
  const matchingSeats = new Set(manifest.entries.filter((entry) => matchesPassenger(entry, profiles[entry.address], searchQuery, offeringFilter, banners[entry.seat.id]?.house ? '' : banners[entry.seat.id]?.alt)).map((entry) => entry.seat.id));
  const openSeat = useCallback((id: string) => {
    const seat = findSeat(id);
    if (seat) setOpen({ id, zone: seat.zone });
  }, []);
  const closeSeat = useCallback(() => setOpen(null), []);

  /* The manifest is in rank order and the cabins fill in that order, so
     grouping it keeps the biggest bag first in every cabin. */
  const cabins = useMemo(() => CABIN_ZONES.map((zone) => ({
    zone,
    held: manifest.entries.filter((e) => e.seat.zone === zone.key),
    total: seatCount(zone),
  })), [manifest.entries]);

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
        cabins.map(({ zone, held, total }) => (held.length === 0 ? null : (
          <div key={zone.key} className={`sa-adwall__cabin sa-adwall__cabin--${zone.key}`}>
            <h3 className="sa-adwall__cabin-head">
              <span className="sa-adwall__cabin-name">{zone.name}</span>
              <span className="sa-adwall__cabin-count tabular-nums">{held.length} of {total}</span>
            </h3>
            <ul
              className="sa-adwall__grid"
              style={{
                '--cols': COLUMNS[zone.key].wide,
                '--cols-narrow': COLUMNS[zone.key].narrow,
                '--row-max': ROW_MAX[zone.key],
              } as CSSProperties}
            >
              {held.map((entry) => (
                <Tile
                  key={entry.seat.id}
                  entry={entry}
                  banner={banners[entry.seat.id] ?? null}
                  mine={mine === entry.seat.id}
                  onOpen={openSeat}
                  dimmed={filtering && !matchingSeats.has(entry.seat.id)}
                  displayName={profiles[entry.address]?.displayName}
                />
              ))}
            </ul>
          </div>
        )))
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
