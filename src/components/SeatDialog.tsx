import { useId, useState } from 'react';
import { CABIN_ZONES, LAVATORY_NOTE, LAVATORY_SEATS, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner } from '../lib/banners';
import type { ManifestEntry } from '../lib/manifest';
import { formatShare, formatTokens } from '../lib/seatLadder';
import type { WalletActivity as Activity } from '../lib/transactions';
import ModalWindow from './ModalWindow';
import WalletActivity from './WalletActivity';

interface SeatDialogProps {
  id: string;
  zone: ZoneKey;
  entry: ManifestEntry | null;
  banner: Banner | null;
  /** This visitor's own seat. */
  mine: boolean;
  /** This visitor may put an advert up here. */
  canAdvertise: boolean;
  /** How many holders are seated: what an open seat costs is out-holding the last of them. */
  seated: number;
  /** The seat map's own poll of this holder's wallet. */
  activity: Activity;
  /** Put the camera in this seat. */
  onLook: () => void;
  onAdvertise: () => void;
  onClose: () => void;
}

const WHERE: Record<string, string> = { window: 'Window seat', middle: 'Middle seat', aisle: 'Aisle seat' };

/**
 * One seat, opened.
 *
 * Picking a seat on the wall used to put the camera in it and nothing else,
 * so the one thing somebody browsing the wall wanted — whose square is this,
 * and what are they running on it — was a hover away on a desk and nowhere
 * at all on a touch screen. Now a seat opens here: the advert at a size
 * worth looking at on the left, whoever holds the seat on the right, and
 * looking from it one button away rather than the only thing a click did.
 */
export default function SeatDialog({
  id, zone, entry, banner, mine, canAdvertise, seated, activity, onLook, onAdvertise, onClose,
}: SeatDialogProps) {
  const title = useId();
  const [copied, setCopied] = useState(false);
  const cabin = CABIN_ZONES.find((z) => z.key === zone) ?? CABIN_ZONES[0];
  const seat = findSeat(id);
  const where = zone === 'deck' ? (id === 'CPT' ? 'Captain' : 'First officer') : WHERE[seat?.position ?? ''] ?? 'Seat';
  const lavatory = (LAVATORY_SEATS as readonly string[]).includes(id);
  const link = safeHref(banner?.href);
  const own = banner && !banner.house ? banner : null;

  const copy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* No clipboard here; the address is on screen to select by hand. */
    }
  };

  return (
    <ModalWindow labelledBy={title} onClose={onClose} className="sa-seatwin">
      <button type="button" onClick={onClose} className="sa-modal__close sa-seatwin__close" aria-label={`Close seat ${id}`} data-autofocus>
        <span aria-hidden>×</span>
      </button>
      <div className="sa-seatwin__body">
        {/* ── The square ── */}
        <div className="sa-seatwin__media">
          {banner ? (
            <img src={banner.image} alt={banner.alt} />
          ) : entry ? (
            <span className="sa-seatwin__tile">
              <span className="sa-seatwin__tile-rank">#{entry.rank}</span>
              <span className="sa-seatwin__tile-id">{id} · No advert yet</span>
            </span>
          ) : (
            <span className="sa-seatwin__socket">
              <span className="sa-seatwin__tile-id">{id}</span>
              Seat open
            </span>
          )}
        </div>

        {/* ── Who is in it ── */}
        <div className="sa-seatwin__info">
          <p className="sa-modal__eyebrow">{cabin.name} · {where}</p>
          <h2 id={title} className="sa-seatwin__title">
            Seat {id}
            {entry ? <span className="sa-map__rank">#{entry.rank}</span> : <span className="sa-map__unsold">Unsold</span>}
          </h2>
          {mine && <p className="sa-seatwin__yours">Your seat</p>}

          {entry ? (
            <>
              <div className="sa-seatwin__holder">
                <p className="sa-map__label">Holder</p>
                <p className="sa-seatwin__address">{entry.address}</p>
                <div className="sa-seatwin__holder-actions">
                  <button type="button" onClick={() => void copy()} className="sa-ca__copy" aria-live="polite">
                    {copied ? 'Copied' : 'Copy address'}
                  </button>
                  <a
                    href={`https://solscan.io/account/${entry.address}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="sa-seatwin__explorer"
                  >
                    Solscan <span aria-hidden>↗</span>
                  </a>
                </div>
              </div>
              <dl className="sa-map__facts">
                <div>
                  <dt>Rank</dt>
                  <dd className="tabular-nums">#{entry.rank} of {seated}</dd>
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
              Nobody holds this seat. Out-hold #{seated || 1} and it is yours.
            </p>
          )}
          {lavatory && <p className="sa-map__note">{LAVATORY_NOTE}</p>}

          {banner && (
            <div className="sa-seatwin__advert">
              <p className="sa-map__label">{banner.house ? 'House advert' : 'Advert'}</p>
              <p className="sa-map__alt">{banner.alt}</p>
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="sa-seatwin__link">
                  Visit {new URL(link).hostname.replace(/^www\./, '')} <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          )}

          {entry && <WalletActivity activity={activity} />}

          <div className="sa-seatwin__actions">
            {canAdvertise && (
              <button type="button" onClick={onAdvertise} className="sa-cta">
                {own ? 'Change your advert' : 'Advertise here'}
              </button>
            )}
            <button type="button" onClick={onLook} className={canAdvertise ? 'sa-ghost' : 'sa-cta'}>
              Look from this seat <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </ModalWindow>
  );
}
