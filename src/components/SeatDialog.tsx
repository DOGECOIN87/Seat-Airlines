import { useId, useState } from 'react';
import { shareSeatCard, type ShareOutcome } from '../lib/seatCard';
import { CABIN_ZONES, LAVATORY_NOTE, LAVATORY_SEATS, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner } from '../lib/banners';
import type { ManifestEntry } from '../lib/manifest';
import { formatShare, formatTokens } from '../lib/seatLadder';
import ModalWindow from './ModalWindow';

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
  onAdvertise: () => void;
  onClose: () => void;
  /** The connected wallet and its signer, for sharing this seat's card to X. */
  owner?: string | null;
  sign?: (message: string) => Promise<string>;
}

const WHERE: Record<string, string> = { window: 'Window seat', middle: 'Middle seat', aisle: 'Aisle seat' };

/**
 * One seat, opened.
 *
 * Picking a seat on the wall used to put the camera in it and nothing else,
 * so the one thing somebody browsing the wall wanted — whose square is this,
 * and what are they running on it — was a hover away on a desk and nowhere
 * at all on a touch screen. Now a seat opens here: the advert at a size
 * worth looking at on the left, whoever holds the seat on the right.
 *
 * Everything in it is already on the page — the manifest, the wall — so
 * opening a seat asks nothing of the network. It used to read the holder's
 * recent transactions off an RPC, re-asked every half minute and on every
 * seat the pointer crossed; that is gone.
 */
export default function SeatDialog({
  id, zone, entry, banner, mine, canAdvertise, seated, onAdvertise, onClose, owner, sign,
}: SeatDialogProps) {
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const title = useId();
  const [copied, setCopied] = useState(false);
  const cabin = CABIN_ZONES.find((z) => z.key === zone) ?? CABIN_ZONES[0];
  const seat = findSeat(id);
  const where = zone === 'deck' ? (id === 'CPT' ? 'Captain' : 'First officer') : WHERE[seat?.position ?? ''] ?? 'Seat';
  const lavatory = (LAVATORY_SEATS as readonly string[]).includes(id);
  const link = safeHref(banner?.href);
  const own = banner && !banner.house ? banner : null;
  // Your own advert, on your own seat: yours to put on X.
  const canShare = Boolean(mine && own && owner && sign && entry?.address === owner);
  const share = () => {
    if (!canShare || sharing) return;
    setSharing(true);
    setShared(null);
    void shareSeatCard({
      owner: owner!, seat: id, cabin: cabin.name, rank: entry?.rank ?? null, alt: own!.alt, sign: sign!,
    }).then((outcome) => {
      setShared(outcome);
      setSharing(false);
    });
  };

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

          {canAdvertise && (
            <div className="sa-seatwin__actions">
              <button type="button" onClick={onAdvertise} className="sa-seatwin__advertise">
                {own ? 'Change your advert' : 'Advertise here'}
              </button>
              {canShare && (
                <button type="button" onClick={share} disabled={sharing} className="sa-seatwin__advertise sa-seatwin__share">
                  <svg viewBox="0 0 24 24" aria-hidden className="sa-seatwin__x">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  {sharing ? 'Making your card…' : 'Post on X'}
                </button>
              )}
            </div>
          )}
          {shared && (
            <p className={`sa-seatwin__shared${shared.error ? ' is-error' : ''}`} role="status">
              {shared.text}
              {shared.href && (
                <>
                  {' · '}
                  <a href={shared.href} target="_blank" rel="noopener noreferrer">{shared.label}</a>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </ModalWindow>
  );
}
