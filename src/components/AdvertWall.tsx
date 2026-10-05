import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import SeatDialog from './SeatDialog';
import SeatOverview from './SeatOverview';
import PassengerFilters from './PassengerFilters';
import { fetchSeatProfiles, type PublicSeatProfile } from '../lib/networkingApi';
import { matchesPassenger } from '../lib/passengerSearch';
import type { Offering } from '../content/offerings';

/**
 * Who is on board: the adverts, then everybody else in their seats.
 *
 * This is what the site is for. Every held seat is a billboard, and a
 * billboard only works if everybody walking past can see it — so the wall is
 * on the page itself, straight under the aeroplane, with no wallet, no tab
 * and no cabin to unfold first.
 *
 * First the cabin from above — the same chart the landing shows, at full
 * width: every seat in its place with its advert on it, a big preview on
 * hover, the seat window on a click. Then the adverts holders have put up,
 * every one the same size, in rank order, with their captions.
 */

/** The default caption the advert dialog fills in when the holder leaves it blank. */
const DEFAULT_CAPTION = /^Advert on seat /;

interface AdvertProps {
  entry: ManifestEntry;
  banner: Banner;
  mine: boolean;
  dimmed: boolean;
  displayName?: string;
  onOpen: (id: string) => void;
  /** The picture would not load: it is left off the list rather than shown broken. */
  onBroken: (image: string) => void;
}

const Advert = ({ entry, banner, mine, dimmed, displayName, onOpen, onBroken }: AdvertProps) => {
  const id = entry.seat.id;
  const link = safeHref(banner.href);
  const holder = displayName?.trim() || shortAddress(entry.address);
  /* The advertiser's own words are the caption: that is the advert's copy.
     Left at the default, which says nothing, the holder's name stands in. */
  const copy = banner.alt && !DEFAULT_CAPTION.test(banner.alt) ? banner.alt : holder;
  return (
    <li className={`sa-adwall__ad${mine ? ' is-mine' : ''}${dimmed ? ' is-filtered' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-haspopup="dialog"
        aria-label={`Seat ${id}, rank ${entry.rank}, ${holder}. Advert: ${banner.alt}`}
        data-seat={id}
        className="sa-adwall__ad-art"
      >
        <img src={banner.image} alt="" loading="lazy" onError={() => onBroken(banner.image)} />
      </button>
      {/* Under the picture, never on it: an advert's artwork is the advertiser's. */}
      <p className="sa-adwall__ad-seat" aria-hidden>
        {id}
        <span className="sa-adwall__ad-rank">#{entry.rank}</span>
      </p>
      <p className="sa-adwall__ad-copy">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer nofollow" title={copy}>{copy}</a>
        ) : (
          <span title={copy}>{copy}</span>
        )}
      </p>
      {copy !== holder && <p className="sa-adwall__ad-holder" title={holder}>{holder}</p>}
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
  /** Claim your Seat: connect a wallet and go to the seats. */
  onClaim: () => void;
  /** Boosted on DexScreener: the chart's engines burn. */
  boosted?: boolean;
  /** The connected wallet and its signer, for sharing your seat's card to X. */
  owner?: string | null;
  sign?: (message: string) => Promise<string>;
}

const AdvertWall = memo(function AdvertWall({ manifest, banners, mine, canAdvertise, onAdvertise, onClaim, boosted = false, owner, sign }: AdvertWallProps) {
  const [open, setOpen] = useState<{ id: string; zone: ZoneKey } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [offeringFilter, setOfferingFilter] = useState<Offering | ''>('');
  const [profiles, setProfiles] = useState<Record<string, PublicSeatProfile>>({});
  const [profileSearch, setProfileSearch] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  /* Advert pictures that would not load, by URL: those seats are listed with
     the labels instead of as a broken square. A replaced advert gets a fresh try. */
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const markBroken = useCallback((image: string) => {
    setBroken((current) => (current.has(image) ? current : new Set(current).add(image)));
  }, []);
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

  /** A holder's own advert on a seat, if there is one that loads. */
  const advertOn = useCallback((seat: string): Banner | null => {
    const banner = banners[seat];
    return banner && !banner.house && !broken.has(banner.image) ? banner : null;
  }, [banners, broken]);

  const filtering = Boolean(searchQuery.trim() || offeringFilter);
  const matchingSeats = new Set(manifest.entries
    .filter((entry) => matchesPassenger(entry, profiles[entry.address], searchQuery, offeringFilter, advertOn(entry.seat.id)?.alt))
    .map((entry) => entry.seat.id));
  const openSeat = useCallback((id: string) => {
    const seat = findSeat(id);
    if (seat) setOpen({ id, zone: seat.zone });
  }, []);
  const closeSeat = useCallback(() => setOpen(null), []);

  /* The manifest is in rank order, so both lists keep the biggest bag first. */
  const adverts = useMemo(
    () => manifest.entries.flatMap((entry) => {
      const banner = advertOn(entry.seat.id);
      return banner ? [{ entry, banner }] : [];
    }),
    [manifest.entries, advertOn],
  );

  return (
    <section id="on-board" className="sa-adwall" aria-labelledby="sa-adwall-title">
      <header className="sa-adwall__head">
        <div className="min-w-0">
          <p className="sa-adwall__eyebrow">Every seat is a billboard</p>
          <h2 id="sa-adwall-title" className="sa-adwall__title">Who’s on board</h2>
        </div>
        <p className="sa-adwall__count tabular-nums">
          <strong>{manifest.entries.length}</strong> seated · <strong>{adverts.length}</strong> {adverts.length === 1 ? 'advert' : 'adverts'} · {manifest.open} open
        </p>
      </header>

      {manifest.entries.length === 0 ? (
        <p className="sa-adwall__empty" role="status">
          Boarding. The passenger list is on its way.
        </p>
      ) : (
        <>
          <PassengerFilters query={searchQuery} offering={offeringFilter} onQuery={setSearchQuery} onOffering={setOfferingFilter}
            offeringsDisabled={profileSearch !== 'ready'} />
          {filtering && (
            <p className="sa-passenger-results" role="status">
              {matchingSeats.size} matching {matchingSeats.size === 1 ? 'holder' : 'holders'}.{' '}
              {matchingSeats.size ? 'Matches are highlighted.' : 'Try another search or clear the filters.'}
              {profileSearch === 'unavailable' && ' Names and offerings cannot be searched right now; wallets, seats and adverts can.'}
            </p>
          )}

          {/* ── The cabin from above: every seat, its advert on it ── */}
          <SeatOverview
            manifest={manifest}
            banners={banners}
            variant="wall"
            onSeat={openSeat}
            onClaim={onClaim}
            onBrowse={() => {}}
            boosted={boosted}
            highlight={filtering ? matchingSeats : null}
          />

          {/* ── The adverts ── */}
          <h3 className="sa-adwall__section">On display</h3>
          {adverts.length ? (
            <ul className="sa-adwall__ads">
              {adverts.map(({ entry, banner }) => (
                <Advert
                  key={entry.seat.id}
                  entry={entry}
                  banner={banner}
                  mine={mine === entry.seat.id}
                  dimmed={filtering && !matchingSeats.has(entry.seat.id)}
                  displayName={profiles[entry.address]?.displayName}
                  onOpen={openSeat}
                  onBroken={markBroken}
                />
              ))}
            </ul>
          ) : (
            <p className="sa-adwall__none">
              No adverts up yet. Every seated holder can put one on their seat, and it shows here for everybody.
            </p>
          )}

        </>
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
