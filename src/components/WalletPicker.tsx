import { useId } from 'react';
import type { WalletState } from '../lib/useWallet';
import ModalWindow from './ModalWindow';
import { EMBEDDED_ID } from '../lib/embeddedWallet';

/**
 * Which wallet, when there is more than one.
 *
 * Opened by `wallet.connect()` itself, so every button that connects — the
 * landing's, check-in's, posting a score — asks the same way. Each wallet is
 * shown by its own name and its own icon, as it registered itself; one that
 * came with no icon wears its initial.
 */
export default function WalletPicker({ wallet }: { wallet: WalletState }) {
  const title = useId();
  if (!wallet.picking) return null;
  const close = () => wallet.choose(null);
  return (
    <ModalWindow labelledBy={title} onClose={close} className="sa-wallets">
      <header className="sa-modal__head">
        <div className="min-w-0">
          <p className="sa-modal__eyebrow">Wallet</p>
          <h2 id={title} className="sa-modal__title">Connect</h2>
        </div>
        <button type="button" onClick={close} className="sa-modal__close" aria-label="Close">
          <span aria-hidden>×</span>
        </button>
      </header>
      <div className="sa-modal__body">
        <ul className="sa-wallets__list">
          {wallet.wallets.map((w, i) => (
            <li key={w.id}>
              <button type="button" onClick={() => wallet.choose(w.id)} className="sa-wallets__btn" data-autofocus={i === 0 ? true : undefined}>
                {w.icon
                  ? <img src={w.icon} alt="" className="sa-wallets__icon" />
                  : <span className="sa-wallets__icon sa-wallets__icon--none" aria-hidden>{w.name.charAt(0)}</span>}
                <span className="sa-wallets__name">
                  <span>{w.name}</span>
                  {w.id === EMBEDDED_ID && (
                    <span className="sa-wallets__soon">Sign in with email or passkey</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="sa-wallets__fine">Shares your address only.</p>
      </div>
    </ModalWindow>
  );
}
