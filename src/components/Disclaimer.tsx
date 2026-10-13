import { useCallback, useEffect, useId, useState } from 'react';
import ModalWindow from './ModalWindow';
import { LOCK_URL } from '../lib/social';

/**
 * The notice everybody reads once before they board: what the site is, and
 * what it is not.
 *
 * Every line is the Terms of Service's own (sections 2 to 5, 10 and 11), said
 * shorter, and none of it may say more than they do or drift from
 * compliance/token-regulatory-guardrails.md — change one, change the other.
 *
 * It opens once the splash has gone, or at once on a link straight into the
 * site, and stays until it is acknowledged. The acknowledgement is kept in
 * this browser against the notice's version, so rewording it asks again.
 * Closing it any other way only puts it away for this page load. The footer's
 * Disclaimer link opens it again (see DISCLAIMER_EVENT).
 */

/** Bumped whenever the notice's wording changes, so everybody reads the new one. */
const VERSION = '2026-10-13';
const ACK_KEY = 'sa.disclaimer';

/** Dispatched on `window` to open the notice from anywhere — the footer's link. */
export const DISCLAIMER_EVENT = 'sa:disclaimer';

const acknowledged = () => {
  try {
    return window.localStorage.getItem(ACK_KEY) === VERSION;
  } catch {
    return false;
  }
};

/* Put away without acknowledging: not again until the page is loaded again. */
let dismissed = false;

export default function Disclaimer() {
  const title = useId();
  const [open, setOpen] = useState(() => !acknowledged() && !dismissed);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(DISCLAIMER_EVENT, show);
    return () => window.removeEventListener(DISCLAIMER_EVENT, show);
  }, []);

  const accept = useCallback(() => {
    try {
      window.localStorage.setItem(ACK_KEY, VERSION);
    } catch {
      /* Storage blocked: it will ask again next time, which is the safe way to fail. */
    }
    dismissed = true;
    setOpen(false);
  }, []);
  const close = useCallback(() => {
    dismissed = true;
    setOpen(false);
  }, []);

  if (!open) return null;
  return (
    <ModalWindow labelledBy={title} onClose={close} className="sa-disclaimer">
      <header className="sa-modal__head">
        <div className="min-w-0">
          <p className="sa-modal__eyebrow">Important notice</p>
          <h2 id={title} className="sa-modal__title">Before you board</h2>
        </div>
        <button type="button" onClick={close} className="sa-modal__close" aria-label="Close the notice">
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="sa-modal__body">
        <p className="sa-disclaimer__lead">
          Seat Airlines is an entertainment website: a flight game flown by the public market data of the $SEAT
          token on Solana.
        </p>
        <ul className="sa-disclaimer__list">
          <li>
            <strong>Not financial advice.</strong> Nothing here is financial, investment, legal or tax advice, or a
            recommendation to buy, hold or sell anything.
          </li>
          <li>
            <strong>No financial services.</strong> We do not sell $SEAT or any other token, handle trades, hold your
            funds or offer any investment, brokerage, exchange or custody service. Links to buy go to third-party
            platforms whose own terms apply.
          </li>
          <li>
            <strong>No promises.</strong> Crypto tokens are highly volatile and can lose all of their value. We make
            no promise about the token’s value or any future feature. Holding $SEAT gives no share of fees, revenue or
            profits and no claim on Seat Airlines; seats, adverts and scores are site features, not rights, returns
            or rewards.
          </li>
          <li>
            <strong>Our interest.</strong> The team holds $SEAT, so it benefits if the price rises. Its launch tokens
            are <a href={LOCK_URL} target="_blank" rel="noopener noreferrer">locked on Jupiter Lock</a>, where anyone
            can check them.
          </li>
          <li>
            <strong>Your wallet, your keys.</strong> The site never asks for a transaction, a seed phrase or a private
            key — only for plain-text messages you can read before you sign. Anything asking for more is not us.
          </li>
          <li>
            <strong>Data can be wrong.</strong> Prices, market cap, balances and holders come from third parties and
            may be delayed, incomplete or wrong. The site is provided as is, without warranties.
          </li>
          <li>
            <strong>18 or older,</strong> and only where using it is lawful for you.
          </li>
        </ul>
        <p className="sa-disclaimer__fine">
          By continuing you agree to the <a href="./terms/">Terms of Service</a> and{' '}
          <a href="./privacy/">Privacy Policy</a>.
        </p>
        <button type="button" onClick={accept} className="sa-cta sa-disclaimer__accept" data-autofocus>
          I understand
        </button>
      </div>
    </ModalWindow>
  );
}
