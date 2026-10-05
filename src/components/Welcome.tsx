import { useCallback, useEffect, useId, useRef, useState } from 'react';
import ModalWindow from './ModalWindow';
import { PUMP_URL, TOKEN_MINT, hasToken } from '../lib/token';
import { DEXSCREENER_URL } from '../lib/social';

/**
 * The first-visit tour: what this is, how a seat is earned, how to connect,
 * and how to get the token. Four short pages in the page's own window.
 *
 * It opens once, the first time somebody is in the site, and is remembered;
 * the "?" in the contract bar brings it back. Closing it any way counts as
 * having seen it, so nobody is greeted by it twice.
 */

const SEEN_KEY = 'sa.tour';

/** Whether this browser has been through the tour. Unreadable storage reads as seen: better never shown than shown on every visit. */
export const tourSeen = (): boolean => {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
};

export const keepTourSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* Nowhere to keep it. */
  }
};

export default function Welcome({ onClose }: { onClose: () => void }) {
  const title = useId();
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_MINT);
    } catch {
      return; // The address is selectable text either way.
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, []);

  const pages = [
    {
      eyebrow: 'Welcome aboard',
      heading: 'One plane. Everyone’s in it.',
      body: (
        <>
          <p>Seat Airlines is a flight simulator flown by one number. The aircraft’s altitude and tilt are read live from the token’s market, so the aeroplane on your screen <em>is</em> the chart.</p>
          <ul className="sa-tour__list">
            <li><strong>Market cap is altitude.</strong> $163K flies at 163,000 ft; $1M breaks out above the clouds.</li>
            <li><strong>A rising market pitches the nose up</strong>, a falling one pitches it down.</li>
          </ul>
        </>
      ),
    },
    {
      eyebrow: 'Your seat',
      heading: 'Your bag is your seat.',
      body: (
        <>
          <p>The 178 biggest holders of the token are seated by rank, flight deck first. Everyone else rides in the cargo hold.</p>
          <ul className="sa-tour__list">
            <li><strong>Out-hold the holder in front of you</strong> and you take their seat.</li>
            <li><strong>Every seat is a billboard.</strong> A seated holder can put a square image on theirs.</li>
            <li><strong>Your seat is your room.</strong> In the cabin directory you reach your own section, and nobody else’s.</li>
          </ul>
        </>
      ),
    },
    {
      eyebrow: 'Connect',
      heading: 'Connect a wallet.',
      body: (
        <>
          <p>Tap <strong>Connect wallet</strong>. Use a wallet app you already have (Phantom, Solflare, Backpack, Nightly), or choose <strong>Email or passkey</strong> and sign in without installing anything.</p>
          <p className="sa-tour__safe">Connecting shares your address only. Seat Airlines never asks you to approve a transaction; every signature is a plain-text message.</p>
        </>
      ),
    },
    {
      eyebrow: 'Get the token',
      heading: 'How to buy.',
      body: (
        <>
          <ol className="sa-tour__steps">
            <li>Get a Solana wallet app, such as Phantom, and put some SOL in it.</li>
            <li>
              Open the token on pump.fun, or paste the contract address into your wallet’s swap.
              {hasToken && (
                <span className="sa-tour__ca">
                  <code title={TOKEN_MINT}>{TOKEN_MINT}</code>
                  <button type="button" onClick={copy} className="sa-tour__copy">{copied ? 'Copied' : 'Copy'}</button>
                </span>
              )}
            </li>
            <li>Swap SOL for the token, then connect that same wallet here. Your seat appears within a minute or so.</li>
          </ol>
          <p className="sa-tour__links">
            <a href={PUMP_URL} target="_blank" rel="noopener noreferrer" className="sa-tour__buy">Buy on pump.fun</a>
            <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer">Chart</a>
          </p>
          <p className="sa-tour__safe">Check the address matches the one in the bar at the top of the page. Tokens are volatile: only buy what you can afford to lose.</p>
        </>
      ),
    },
  ];
  const last = page === pages.length - 1;
  const current = pages[page];

  return (
    <ModalWindow labelledBy={title} onClose={onClose} className="sa-tour">
      <header className="sa-modal__head">
        <div className="min-w-0">
          <p className="sa-modal__eyebrow">{current.eyebrow} · {page + 1} of {pages.length}</p>
          <h2 id={title} className="sa-modal__title">{current.heading}</h2>
        </div>
        <button type="button" onClick={onClose} className="sa-modal__close" aria-label="Close tour">
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="sa-modal__body sa-tour__body">
        {current.body}
        <div className="sa-tour__dots" aria-hidden>
          {pages.map((_, i) => <span key={i} className={i === page ? 'is-on' : undefined} />)}
        </div>
        <div className="sa-tour__actions">
          {page > 0
            ? <button type="button" onClick={() => setPage(page - 1)} className="sa-tour__back">Back</button>
            : <button type="button" onClick={onClose} className="sa-tour__back">Skip</button>}
          <button
            type="button"
            onClick={last ? onClose : () => setPage(page + 1)}
            className="sa-tour__next"
            data-autofocus
          >
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </ModalWindow>
  );
}
