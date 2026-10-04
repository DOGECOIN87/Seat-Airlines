import { useEffect, useId, useState } from 'react';
import { fetchSeatProfile, SOCIALS, type PublicSeatProfile } from '../lib/networkingApi';
import { shareSeatCard, type ShareOutcome } from '../lib/seatCard';
import { CABIN_ZONES, LAVATORY_NOTE, LAVATORY_SEATS, findSeat, type ZoneKey } from '../content/cabin';
import { safeHref, type Banner } from '../lib/banners';
import type { ManifestEntry } from '../lib/manifest';
import { formatShare, formatTokens } from '../lib/seatLadder';
import ModalWindow from './ModalWindow';
import AccountIcon from './AccountIcon';
import OfferingTags from './OfferingTags';

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
 * The manifest and advert are already on the page. Opening a held seat
 * reads its owner's opted-in public links once, without asking the chain.
 */
export default function SeatDialog({
  id, zone, entry, banner, mine, canAdvertise, seated, onAdvertise, onClose, owner, sign,
}: SeatDialogProps) {
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const title = useId();
  const [copied, setCopied] = useState(false);
  const [publicProfile, setPublicProfile] = useState<{ address: string; profile: PublicSeatProfile } | null>(null);
  const address = entry?.address;
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    void fetchSeatProfile(address, controller.signal).then((profile) => {
      if (!controller.signal.aborted) setPublicProfile(profile ? { address, profile } : null);
    }).catch(() => { /* The seat and advert still work if public links are unavailable. */ });
    return () => controller.abort();
  }, [address]);
  const profile = publicProfile && publicProfile.address === address ? publicProfile.profile : null;
  const contacts = [
    { label: 'Website', account: 'website' as const, href: safeHref(profile?.website) },
    { label: 'LinkedIn', account: 'linkedin' as const, href: safeHref(profile?.linkedin) },
    ...SOCIALS.map((social) => {
      const value = profile?.links?.[social.key];
      return { label: social.label, account: social.key, href: value ? safeHref(social.href(value) ?? undefined) : null,
        text: value && !social.href(value) ? `${social.label}: ${social.show(value)}` : null };
    }),
  ].filter((contact) => contact.href || ('text' in contact && contact.text));
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
              <OfferingTags categories={profile?.categories} />
              {contacts.length > 0 && (
                <section className="sa-seatwin__contacts" aria-label="Holder links">
                  <p className="sa-map__label">{profile?.displayName ? `${profile.displayName} · Links` : 'Holder links'}</p>
                  <div className="sa-seatwin__contacts-list">
                    {contacts.map((contact) => contact.href ? (
                      <a key={contact.label} href={contact.href} target="_blank" rel="noopener noreferrer nofollow"
                        className="sa-seatwin__contact" aria-label={`${contact.label} — ${profile?.displayName || 'holder'}`}>
                        <AccountIcon account={contact.account} /> {contact.label} <span aria-hidden>↗</span>
                      </a>
                    ) : <span key={contact.label} className="sa-seatwin__contact"><AccountIcon account={contact.account} />{'text' in contact ? contact.text : ''}</span>)}
                  </div>
                </section>
              )}
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
            <div className={`sa-seatwin__shared${shared.error ? ' is-error' : ''}`} role="status">
              <p>
                {shared.text}
                {shared.href && !shared.button && (
                  <>
                    {' · '}
                    <a href={shared.href} target="_blank" rel="noopener noreferrer">{shared.label}</a>
                  </>
                )}
              </p>
              {shared.href && shared.button && (
                <a href={shared.href} target="_blank" rel="noopener noreferrer" className="sa-seatwin__advertise sa-seatwin__share sa-seatwin__open-x">
                  <svg viewBox="0 0 24 24" aria-hidden className="sa-seatwin__x">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  {shared.label}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalWindow>
  );
}
