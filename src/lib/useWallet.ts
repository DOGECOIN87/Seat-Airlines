/**
 * Wallet connect, without a wallet library.
 *
 * The page needs two things from a wallet — the public key, and a signature
 * on a plain-text message — so it talks to the wallets directly rather than
 * pulling in an adapter stack an order of magnitude larger than the rest of
 * the app. `wallets.ts` finds them, whichever they are: Phantom, Solflare,
 * Backpack, Nightly, and any other Solana wallet that registers itself.
 *
 * With one wallet in the browser, connecting goes straight to it. With more,
 * the page asks which (`picking`, answered by `choose`), and remembers the
 * answer: that wallet signs everything after, and is the one reconnected
 * quietly on the next visit.
 *
 * If no wallet is installed, `connect` reports that plainly instead of
 * failing silently, and the page stays fully usable without one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listWallets, onWalletsChange, walletError, type WalletAdapter } from './wallets';

/** The wallet a person chose last, by name, so a return visit reconnects to it. */
const CHOSEN_KEY = 'sa.wallet';
const readChosen = (): string | null => {
  try {
    return window.localStorage.getItem(CHOSEN_KEY);
  } catch {
    return null;
  }
};
const keepChosen = (name: string | null) => {
  try {
    if (name) window.localStorage.setItem(CHOSEN_KEY, name);
    else window.localStorage.removeItem(CHOSEN_KEY);
  } catch {
    /* Nowhere to keep it: the next visit asks again. */
  }
};

/** A wallet as the picker shows it. */
export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
}

export interface WalletState {
  address: string | null;
  walletName: string | null;
  connecting: boolean;
  /** Null unless something went wrong the person needs to know about. */
  error: string | null;
  /** True when no wallet extension is present at all. */
  unavailable: boolean;
  /** Every wallet in this browser, in the order the picker offers them. */
  wallets: WalletOption[];
  /** True while the page is asking which wallet to connect. */
  picking: boolean;
  /** The answer to `picking`: a wallet's id, or null for none. */
  choose: (id: string | null) => void;
  /**
   * Resolves to the address once connected, or null if it did not connect —
   * refused, no wallet, or none chosen. With more than one wallet, asks which.
   */
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  /**
   * Sign a plain-text challenge, returning the signature as base58.
   *
   * Connecting a wallet proves nothing — the address is public and anyone can
   * claim it. A signature is the proof, so every write to the wall carries
   * one. Throws if the wallet refuses or cannot sign; the caller reports that
   * rather than publishing anyway.
   */
  signMessage: (message: string) => Promise<string>;
}

/** Solana addresses and signatures are base58, so encoding one is on us. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function toBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<WalletAdapter[]>(() => (typeof window === 'undefined' ? [] : listWallets()));
  const [picking, setPicking] = useState(false);
  /** The wallet that is connected: it signs, and it is the one disconnected. */
  const active = useRef<WalletAdapter | null>(null);
  const unfollow = useRef<(() => void) | null>(null);
  const answer = useRef<((wallet: WalletAdapter | null) => void) | null>(null);

  /* The wallet that signs is the one being followed. Switching account inside
     it moves the page to the new address (and with it the seat, and a fresh
     directory session, which is kept per address); an account the site has
     not been trusted with reads as disconnected, rather than leaving the old
     address on screen for a signature the new key could never make. */
  const follow = useCallback((wallet: WalletAdapter | null) => {
    unfollow.current?.();
    unfollow.current = null;
    active.current = wallet;
    if (!wallet) return;
    unfollow.current = wallet.onAccountChange((next) => {
      if (active.current !== wallet) return;
      setAddress(next);
      if (!next) setWalletName(null);
    });
  }, []);
  useEffect(() => () => unfollow.current?.(), []);

  // Wallets register as they load, so the list is kept current rather than read once.
  useEffect(() => {
    const update = () => setFound(listWallets());
    update();
    return onWalletsChange(update);
  }, []);

  // Reconnect quietly if this browser has already trusted the site, so a
  // returning holder is seated without being asked again: the wallet they
  // chose last, or the only one there is.
  const triedQuietly = useRef(false);
  /* The quiet attempt, while it is still out. Some wallets refuse a second
     connect while one is pending, without saying why, so a tap on Connect
     waits for it (briefly) and uses its answer if it brought one. */
  const quiet = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    if (triedQuietly.current || address) return;
    const chosen = readChosen();
    const wallet = chosen
      ? found.find((w) => w.name === chosen)
      : found.length === 1 ? found[0] : undefined;
    if (!wallet) return;
    triedQuietly.current = true;
    const attempt = wallet
      .connect(true)
      .then((key) => {
        if (!key) return null;
        follow(wallet);
        setWalletName(wallet.name);
        setAddress(key);
        return key;
      })
      .catch(() => null /* not previously trusted — wait to be asked */)
      .finally(() => {
        if (quiet.current === attempt) quiet.current = null;
      });
    quiet.current = attempt;
  }, [found, address, follow]);

  const choose = useCallback((id: string | null) => {
    setPicking(false);
    const resolve = answer.current;
    answer.current = null;
    resolve?.(id ? listWallets().find((w) => w.id === id) ?? null : null);
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    const wallets = listWallets();
    if (!wallets.length) {
      setError('No Solana wallet found. Install Phantom, Solflare, Backpack or Nightly, then try again.');
      return null;
    }
    // One wallet goes straight to it; more, and the person picks.
    answer.current?.(null);
    const wallet = wallets.length === 1
      ? wallets[0]
      : await new Promise<WalletAdapter | null>((resolve) => {
        answer.current = resolve;
        setPicking(true);
      });
    if (!wallet) return null;
    setConnecting(true);
    setError(null);
    try {
      if (quiet.current) {
        const already = await Promise.race([quiet.current, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
        if (already && active.current === wallet) return already;
      }
      const key = await wallet.connect(false);
      if (!key) throw new Error('The wallet connected but did not return an address.');
      follow(wallet);
      keepChosen(wallet.name);
      setWalletName(wallet.name);
      setAddress(key);
      return key;
    } catch (e) {
      const message = walletError(e).message;
      // A refused prompt is a choice, not a failure worth shouting about.
      setError(/reject|denied|cancel/i.test(message) ? null : message);
      return null;
    } finally {
      setConnecting(false);
    }
  }, [follow]);

  const disconnect = useCallback(async () => {
    const wallet = active.current;
    follow(null);
    keepChosen(null);
    try {
      await wallet?.disconnect();
    } catch {
      /* disconnecting is best-effort; drop the address either way */
    }
    setAddress(null);
  }, [follow]);

  const signMessage = useCallback(async (message: string) => {
    const wallet = active.current;
    if (!wallet) throw new Error('No wallet to sign with.');
    const sig = await wallet.signMessage(new TextEncoder().encode(message));
    return toBase58(sig);
  }, []);

  const wallets = found.map(({ id, name, icon }) => ({ id, name, icon }));
  return {
    address, walletName, connecting, error, unavailable: found.length === 0,
    wallets, picking, choose, connect, disconnect, signMessage,
  };
}
