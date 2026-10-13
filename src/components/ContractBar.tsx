import { useCallback, useEffect, useRef, useState } from 'react';
import { PUMP_URL, TOKEN_MINT, hasToken } from '../lib/token';

/**
 * The contract address, across the top of the page.
 *
 * It is the first thing somebody arriving from a link looks for and the one
 * string they need to copy exactly, so it sits above everything else and is
 * copyable in one press rather than one careful drag across 44 characters.
 * The way to buy sits next to it, because that is what they were going to do
 * with the address anyway. The site's other links — the chart, the team's
 * lock, the socials — are in the footer, once.
 *
 * The address is shown whole wherever there is room. On a narrow screen it
 * is abbreviated the way a wallet shows one — its first and last characters,
 * the ones people check — so the strip stays one row; the full value stays in
 * the DOM for a screen reader, in the title, and in what Copy copies. A
 * truncated address that cannot be copied in full is worse than no address
 * at all, because it looks like one.
 */

/** Stands in until the deployment is pointed at a token. */
const PLACEHOLDER = 'Announced at launch';

const PumpMark = () => (
  <img src="/pump-logomark.svg" alt="" aria-hidden className="sa-pump__mark" />
);

const ContractBar = ({ onHelp }: { onHelp?: () => void }) => {
  const address = TOKEN_MINT || PLACEHOLDER;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* Clipboard refused — an insecure origin, or permission denied. The
         address is selectable text either way, so say nothing and let the
         person copy it the ordinary way. */
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, [address]);

  return (
    <div className="sa-ca">
      <div className="sa-ca__inner">
        <span className="sa-ca__label">CA</span>
        <code className={`sa-ca__value${hasToken ? ' has-abbr' : ''}`} title={address}>
          <span className="sa-ca__full">{address}</span>
          {hasToken && (
            /* First and last six, or four on the narrowest phones. */
            <span className="sa-ca__abbr" aria-hidden>
              {address.slice(0, 4)}<span className="sa-ca__more">{address.slice(4, 6)}</span>…<span className="sa-ca__more">{address.slice(-6, -4)}</span>{address.slice(-4)}
            </span>
          )}
        </code>

        {hasToken && (
          <button type="button" onClick={copy} className="sa-ca__copy">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}

        <a
          href={PUMP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="sa-pump"
        >
          <PumpMark />
          <span className="sa-pump__text">pump.fun</span>
        </a>

        {onHelp && (
          <button type="button" onClick={onHelp} className="sa-pump" aria-label="How it works">
            <span aria-hidden className="sa-pump__mark sa-help__q">?</span>
            <span className="sa-pump__text">how it works</span>
          </button>
        )}

        {/* Announced rather than shown twice: the button's own label already
            changes, and a screen reader should hear it confirmed once. */}
        <span aria-live="polite" className="sr-only">
          {copied ? 'Contract address copied' : ''}
        </span>
      </div>
    </div>
  );
};

export default ContractBar;
