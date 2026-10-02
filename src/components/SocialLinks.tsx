import { LOCK_URL, TELEGRAM_URL, X_URL } from '../lib/social';

/**
 * The airline's X and Telegram, and the lock on the team's tokens.
 *
 * Shown on the landing (on the night, in glass, like the docs link) and in
 * the footer. The marks are Simple Icons' (CC0), drawn inline in the link's
 * colour so they cost no request.
 */
const X_MARK =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const TELEGRAM_MARK =
  'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';
const LOCK_MARK =
  'M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 5a3 3 0 1 1 6 0v3H9V6zm3 7a2 2 0 0 1 1 3.73V19h-2v-2.27A2 2 0 0 1 12 13z';

const Mark = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="sa-docs__mark" aria-hidden focusable="false">
    <path d={d} />
  </svg>
);

const SocialLinks = ({ night = false, className = '' }: { night?: boolean; className?: string }) => {
  const chip = night ? 'sa-docs sa-docs--night sa-social__chip' : 'sa-docs sa-social__chip';
  /* X and Telegram are their marks alone, round, so the row stays one row on
     a phone; the lock is the one that needs words. */
  return (
    <nav className={`sa-social ${className}`} aria-label="Seat Airlines elsewhere">
      <a href={X_URL} target="_blank" rel="noopener noreferrer" className={`${chip} sa-social__icon`} aria-label="Seat Airlines on X" title="X">
        <Mark d={X_MARK} />
      </a>
      <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={`${chip} sa-social__icon`} aria-label="Seat Airlines on Telegram" title="Telegram">
        <Mark d={TELEGRAM_MARK} />
      </a>
      <a href={LOCK_URL} target="_blank" rel="noopener noreferrer" className={chip} title="The team's tokens, locked on Jupiter Lock">
        <Mark d={LOCK_MARK} />
        <span className="sa-docs__label">
          Tokens locked<span className="sa-social__on"> · Jupiter Lock</span>
        </span>
      </a>
    </nav>
  );
};

export default SocialLinks;
