import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { CABIN_ZONES, findSeat, seatCount, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner, type BannerSet } from '../lib/banners';
import { shortAddress, type Manifest, type ManifestEntry } from '../lib/manifest';
import SeatDialog from './SeatDialog';

/**
 * Who is on board: every held seat, and the advert on it, for anybody.
 *
 * This is what the site is for. Every held seat is a billboard, and a
 * billboard only works if everybody walking past can see it — so the wall is
 * on the page itself, straight under the aeroplane, with no wallet, no tab
 * and no cabin to unfold first. The seat map in the Seats panel is the same
 * aircraft drawn as a seating plan; this is it drawn as a wall of adverts,
 * cabin by cabin, the best placements largest and first.
 */

/** How wide a tile is drawn, by cabin: the front of the aircraft is the front of the wall. */
const TILE: Record<ZoneKey, string> = {
  deck: '13rem',
  first: '10rem',
  business: '8rem',
  exit: '7rem',
  economy: '6.25rem',
};

interface TileProps {
  entry: ManifestEntry;
  banner: Banner | null;
  mine: boolean;
  onOpen: (id: string) => void;
}

const Tile = ({ entry, banner, mine, onOpen }: TileProps) => {
  const id = entry.seat.id;
  /* A picture that will not load is drawn as the seat without one, rather
     than as the browser's broken-image icon. Keyed to the URL, so a replaced
     advert gets a fresh try. */
  const [failed, setFailed] = useState<string | null>(null);
  const picture = banner && failed !== banner.image ? banner : null;
  const own = picture && !picture.house ? picture : null;
  const link = safeHref(own?.href);
  return (
    <li className={`sa-adwall__tile${mine ? ' is-mine' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-haspopup="dialog"
        aria-label={`Seat ${id}, rank ${entry.rank}, ${shortAddress(entry.address)}${own ? `. Advert: ${own.alt}` : ''}`}
        className="sa-adwall__art"
      >
        {picture ? (
          <img src={picture.image} alt="" loading="lazy" onError={() => setFailed(picture.image)} />
        ) : (
          <span className="sa-adwall__blank">No advert yet</span>
        )}
        <span className="sa-adwall__seat" aria-hidden>
          {id}
          <span className="sa-adwall__rank">#{entry.rank}</span>
        </span>
      </button>
      <p className="sa-adwall__caption">
        {own ? (
          link ? (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" title={own.alt}>{own.alt}</a>
          ) : (
            <span title={own.alt}>{own.alt}</span>
          )
        ) : (
          <span className="sa-adwall__holder">{mine ? 'Your seat' : shortAddress(entry.address)}</span>
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
  const openSeat = useCallback((id: string) => {
    const seat = findSeat(id);
    if (seat) setOpen({ id, zone: seat.zone });
  }, []);
  const closeSeat = useCallback(() => setOpen(null), []);

  /* The manifest is already in rank order, and the cabins are filled in that
     order, so grouping it keeps the biggest bag first in every cabin. */
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
              style={{ '--tile': TILE[zone.key] } as CSSProperties}
            >
              {held.map((entry) => (
                <Tile
                  key={entry.seat.id}
                  entry={entry}
                  banner={banners[entry.seat.id] ?? null}
                  mine={mine === entry.seat.id}
                  onOpen={openSeat}
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
