import { DEXSCREENER_URL, LOCK_URL, TELEGRAM_URL, X_URL, partnerLogo } from '../lib/social';

/**
 * The airline's X and Telegram, the token's chart on DexScreener, and the
 * lock on the team's tokens.
 *
 * Shown on the landing (on the night, in glass, like the docs link) and in
 * the footer. X and Telegram are Simple Icons' (CC0), traced from each
 * brand's own artwork and drawn inline in the link's colour. DexScreener and
 * Jupiter are their owners' own logo files, in their own colours.
 */
const X_MARK =
  'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z';
const TELEGRAM_MARK =
  'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';


const Mark = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="sa-docs__mark" aria-hidden focusable="false">
    <path d={d} />
  </svg>
);

/** A partner's logo file, at the size of the inline marks. */
const Logo = ({ file }: { file: string }) => (
  <img src={partnerLogo(file)} alt="" className="sa-docs__mark sa-partner-mark" width={24} height={24} />
);

const SocialLinks = ({ night = false, className = '' }: { night?: boolean; className?: string }) => {
  const chip = night ? 'sa-docs sa-docs--night sa-social__chip' : 'sa-docs sa-social__chip';
  /* Four chips of one size, mark and name each, on one row at every width. */
  return (
    <nav className={`sa-social ${className}`} aria-label="Seat Airlines elsewhere">
      <a href={X_URL} target="_blank" rel="noopener noreferrer" className={chip} aria-label="Seat Airlines on X" title="X">
        <Mark d={X_MARK} />
        <span className="sa-docs__label">X</span>
      </a>
      <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={chip} aria-label="Seat Airlines on Telegram" title="Telegram">
        <Mark d={TELEGRAM_MARK} />
        <span className="sa-docs__label">Telegram</span>
      </a>
      <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer" className={chip} aria-label="The token's chart on DexScreener" title="DexScreener">
        <Logo file="dexscreener.png" />
        <span className="sa-docs__label">
          Dex<span className="sa-social__long">Screener</span>
        </span>
      </a>
      <a href={LOCK_URL} target="_blank" rel="noopener noreferrer" className={chip} aria-label="The team's tokens, locked on Jupiter Lock" title="The team's tokens, locked on Jupiter Lock">
        <Logo file="jupiter.svg" />
        <span className="sa-docs__label">
          Jup<span className="sa-social__long">iter</span> Lock
        </span>
      </a>
    </nav>
  );
};

export default SocialLinks;
