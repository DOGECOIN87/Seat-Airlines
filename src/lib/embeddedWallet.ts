/**
 * A wallet for people who do not have one: passkey, email or text-message sign-in.
 *
 * Helius Wallet-as-a-Service gives each person who signs in a non-custodial
 * Solana wallet of their own. Here it is one more entry in the picker,
 * "Email or passkey", next to whatever extensions the browser has — and on a
 * phone with no wallet app it is the only entry, so connecting goes straight
 * to it instead of telling the person to go and install something.
 *
 * Its kit is large (React UI, the signer, web3.js), so nothing of it loads
 * until somebody picks it, or until a returning visitor who picked it last
 * time is reconnected quietly. Everybody else never downloads a byte of it.
 *
 * The Helius API key never reaches the page. The Worker holds it and answers
 * the kit's server routes (`worker/src/helius.ts`); whether it has one is
 * asked once per page view, and without one the option is not offered.
 */
import { resolveWorkerApi } from './workerBase';
import type { WalletAdapter } from './wallets';

export const EMBEDDED_ID = 'embedded:helius';
export const EMBEDDED_NAME = 'Email or passkey';

/** The Worker the kit's server routes are answered by. */
export const HELIUS_API = `${resolveWorkerApi(
  import.meta.env.VITE_BANNERS_API as string | undefined,
)}/helius`;

/** A small mark for the picker: an envelope, in the page's own ink. */
const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E84125"/><path d="M8 11h16v10H8z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="m8 11 8 6 8-6" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
)}`;

/* Whether this deployment offers it. Off by build variable for a fork that
   wants no part of it; otherwise whatever the Worker says. */
const disabled = /^(0|false|off|no)$/i.test(String(import.meta.env.VITE_EMBEDDED_WALLETS ?? '').trim());
let ready = false;
let probe: Promise<void> | null = null;
let settled = disabled || typeof window === 'undefined';

/**
 * Asks the Worker once whether embedded wallets are set up, and calls `then`
 * once the answer is in (whichever it is), so the page can re-read its list.
 */
export function probeEmbedded(then: () => void): void {
  if (probe || disabled || typeof window === 'undefined') return;
  probe = fetch(`${HELIUS_API}/status`)
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { ready?: boolean } | null) => {
      ready = Boolean(body?.ready);
    })
    .catch(() => { /* No Worker, or no answer: the option is simply not offered. */ })
    .finally(() => {
      settled = true;
      then();
    });
}

/** Resolves once the Worker has answered, or failed to. Never rejects. */
export const embeddedProbed = (): Promise<void> => probe ?? Promise.resolve();

/** False until the Worker has answered, so "no wallet at all" is not declared before the last one is known. */
export const embeddedSettled = () => settled;

export const embeddedReady = () => ready;

type Bridge = typeof import('./heliusBridge');
let loading: Promise<Bridge> | null = null;
const bridge = () => (loading ??= import('./heliusBridge').catch((e) => {
  loading = null;
  throw e;
}));

/** Hex, as the kit returns a signature, to the bytes the Worker verifies. */
const fromHex = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

let adapter: WalletAdapter | null = null;

/** The picker's entry. One for the page's life, like every other wallet's. */
export function embeddedAdapter(): WalletAdapter {
  return (adapter ??= {
    id: EMBEDDED_ID,
    name: EMBEDDED_NAME,
    icon: ICON,
    connect: async (silent) => (await bridge()).connect(silent),
    signMessage: async (message) => {
      const hex = await (await bridge()).signMessage(new TextDecoder().decode(message));
      const sig = fromHex(hex);
      if (sig.length !== 64) throw new Error('The wallet returned no signature.');
      return sig;
    },
    disconnect: async () => {
      if (loading) await (await loading).disconnect();
    },
    onAccountChange: (fn) => {
      let off: (() => void) | null = null;
      let gone = false;
      bridge().then((b) => {
        if (!gone) off = b.onAccountChange(fn);
      }).catch(() => {});
      return () => {
        gone = true;
        off?.();
      };
    },
  });
}
