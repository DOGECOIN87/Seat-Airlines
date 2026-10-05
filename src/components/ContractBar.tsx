import { useCallback, useEffect, useRef, useState } from 'react';
import { PUMP_URL, TOKEN_MINT, hasToken } from '../lib/token';
import { DEXSCREENER_URL } from '../lib/social';
import { GOLDEN_TICKER } from '../lib/dexBoost';

/**
 * The contract address, across the top of the page.
 *
 * It is the first thing somebody arriving from a link looks for and the one
 * string they need to copy exactly, so it sits above everything else and is
 * copyable in one press rather than one careful drag across 44 characters.
 * The way to buy sits next to it, because that is what they were going to do
 * with the address anyway.
 *
 * The address is shown whole wherever there is room. It is only ever
 * abbreviated on a narrow screen, and even then the full value stays in the
 * DOM — a truncated address that cannot be copied in full is worse than no
 * address at all, because it looks like one.
 */

/** Stands in until the deployment is pointed at a token. */
const PLACEHOLDER = 'Announced at launch';

const PumpMark = () => (
  <img src="/pump-logomark.svg" alt="" aria-hidden className="sa-pump__mark" />
);

/** A rising chart, for DexScreener. */
const ChartMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="sa-pump__mark sa-pump__glyph">
    <path d="M3 3h2v16h16v2H3V3zm4 11.6 4-4.6 3 3 5.3-6.3 1.5 1.3-6.7 8-3-3-2.6 3L7 14.6z" />
  </svg>
);
const FlameMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="sa-pump__mark sa-pump__glyph">
    <path d="M13.5 1.5s1 3.2-1.6 6.1C9.6 10.2 7 12 7 15.6A5 5 0 0 0 12 21a5 5 0 0 0 5-5.3c0-2.4-1.3-4-1.3-4s-.4 2.1-2 2.7c0 0 1.4-4.5-.2-9.4z" />
  </svg>
);

/** Boosts running on DexScreener, for the Boost pill: lit while there are any. */
const ContractBar = ({ boosts = 0, onHelp }: { boosts?: number; onHelp?: () => void }) => {
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
        <code className="sa-ca__value" title={address}>{address}</code>

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

        {/* The chart, and the way to boost it: DexScreener's Boost button is
            on the same page. A boost running puts the plane on afterburner. */}
        <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer" className="sa-pump" aria-label="DexScreener chart">
          <ChartMark />
          <span className="sa-pump__text">dexscreener</span>
        </a>
        <a
          href={DEXSCREENER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`sa-pump sa-pump--boost${boosts > 0 ? ' is-on' : ''}${boosts >= GOLDEN_TICKER ? ' is-golden' : ''}`}
          title={boosts > 0 ? `${boosts.toLocaleString('en-US')} Boosts running on DexScreener` : 'Boost on DexScreener (the yellow Boost button) and the plane goes on afterburner'}
        >
          <FlameMark />
          <span className="sa-pump__text">{boosts > 0 ? `boosted ×${boosts.toLocaleString('en-US')}` : 'boost'}</span>
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
