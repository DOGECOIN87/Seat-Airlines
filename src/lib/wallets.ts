/**
 * Every Solana wallet in this browser, whichever it is.
 *
 * A wallet makes itself known one of two ways. The Wallet Standard is the one
 * they share now: each installed wallet registers itself with the page — its
 * name, its icon, and how to connect and sign — so Phantom, Solflare,
 * Backpack, Nightly and whatever comes next are all found the same way and
 * listed by their own names. Nightly is only found this way; it puts no
 * Phantom-shaped provider on `window` at all.
 *
 * The older way is a provider object on `window` (`solana`, `solflare`,
 * `backpack`), kept for a wallet or an in-app browser that has not
 * registered, and dropped for any wallet that has, so nothing is listed
 * twice.
 */

/** One wallet, whichever way it was found. */
export interface WalletAdapter {
  /** Stable for the page's life: `std:` or `legacy:` and the wallet's name. */
  id: string;
  name: string;
  /** The wallet's own icon, as a data: URL; null for a provider that has none. */
  icon: string | null;
  /**
   * Resolves to the address. Silent asks only for an address the wallet has
   * already trusted this site with, and resolves null when there is none.
   * Throws when the person refuses.
   */
  connect: (silent: boolean) => Promise<string | null>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  disconnect: () => Promise<void>;
  /**
   * Told when the person switches account inside the wallet, with the new
   * address, or null when the wallet no longer offers this site one (it
   * disconnected, or the account switched to has not trusted the site).
   * Returns the unsubscribe. A wallet that reports nothing never calls it.
   */
  onAccountChange: (fn: (address: string | null) => void) => () => void;
}

/* ── The Wallet Standard ─────────────────────────────────────────────────
   The parts of it this page uses, typed here rather than installed: the
   registration handshake is two events, and a wallet is an object with
   `features` keyed by name. */

interface StdAccount {
  address: string;
  chains?: readonly string[];
}

interface StdWallet {
  name: string;
  icon?: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, unknown>;
}

interface StdConnect {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly StdAccount[] }>;
}
interface StdDisconnect {
  disconnect: () => Promise<void>;
}
interface StdEvents {
  on: (event: 'change', listener: (properties: { accounts?: readonly StdAccount[] }) => void) => () => void;
}
interface StdSignMessage {
  signMessage: (...inputs: { account: StdAccount; message: Uint8Array }[]) => Promise<readonly { signature: Uint8Array }[]>;
}

const isSolana = (w: StdWallet) =>
  Array.isArray(w.chains) && w.chains.some((c) => typeof c === 'string' && c.startsWith('solana:'))
  && Boolean(w.features?.['standard:connect']) && Boolean(w.features?.['solana:signMessage']);

const solanaAccount = (accounts: readonly StdAccount[]) =>
  accounts.find((a) => !a.chains || a.chains.some((c) => c.startsWith('solana:'))) ?? null;

function fromStandard(w: StdWallet): WalletAdapter {
  let account: StdAccount | null = null;
  return {
    id: `std:${w.name}`,
    name: w.name,
    icon: typeof w.icon === 'string' && w.icon.startsWith('data:image/') ? w.icon : null,
    async connect(silent) {
      const { accounts } = await (w.features['standard:connect'] as StdConnect).connect(silent ? { silent: true } : undefined);
      account = solanaAccount(accounts?.length ? accounts : w.accounts);
      return account?.address ?? null;
    },
    async signMessage(message) {
      const signer = account ?? solanaAccount(w.accounts);
      if (!signer) throw new Error(`${w.name} is not connected.`);
      const [out] = await (w.features['solana:signMessage'] as StdSignMessage).signMessage({ account: signer, message });
      if (!out?.signature?.length) throw new Error('The wallet returned no signature.');
      return out.signature;
    },
    async disconnect() {
      account = null;
      await (w.features['standard:disconnect'] as StdDisconnect | undefined)?.disconnect();
    },
    onAccountChange(fn) {
      const events = w.features['standard:events'] as StdEvents | undefined;
      if (typeof events?.on !== 'function') return () => {};
      return events.on('change', ({ accounts }) => {
        // A change that does not name the accounts is about something else (chains, features).
        if (!accounts) return;
        const next = solanaAccount(accounts);
        if (next?.address === account?.address) return;
        account = next;
        fn(next?.address ?? null);
      });
    },
  };
}

/* ── The older providers on `window` ───────────────────────────────────── */

interface InjectedProvider {
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | undefined>;
  signMessage?: (data: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString(): string } | null;
  isPhantom?: boolean;
  on?: (event: string, listener: (arg?: unknown) => void) => void;
  off?: (event: string, listener: (arg?: unknown) => void) => void;
  removeListener?: (event: string, listener: (arg?: unknown) => void) => void;
}

type Injected = {
  phantom?: { solana?: InjectedProvider };
  solana?: InjectedProvider;
  solflare?: InjectedProvider;
  backpack?: InjectedProvider;
};

function fromInjected(name: string, provider: InjectedProvider): WalletAdapter {
  return {
    id: `legacy:${name}`,
    name,
    icon: null,
    async connect(silent) {
      const res = await provider.connect(silent ? { onlyIfTrusted: true } : undefined);
      const key = res?.publicKey ?? provider.publicKey;
      return key ? key.toString() : null;
    },
    async signMessage(message) {
      if (!provider.signMessage) throw new Error(`${name} cannot sign messages.`);
      const res = await provider.signMessage(message, 'utf8');
      // Phantom returns { signature }; some others return the bytes themselves.
      const sig = res instanceof Uint8Array ? res : res?.signature;
      if (!sig?.length) throw new Error('The wallet returned no signature.');
      return sig;
    },
    async disconnect() {
      await provider.disconnect?.();
    },
    onAccountChange(fn) {
      if (typeof provider.on !== 'function') return () => {};
      /* Phantom's shape, which Solflare and Backpack follow: the new public key,
         or null for an account that has not trusted this site yet. */
      const changed = (key?: unknown) => {
        const next = key && typeof (key as { toString?: unknown }).toString === 'function' ? String(key) : null;
        fn(next);
      };
      const gone = () => fn(null);
      provider.on('accountChanged', changed);
      provider.on('disconnect', gone);
      return () => {
        const off = provider.off ?? provider.removeListener;
        off?.call(provider, 'accountChanged', changed);
        off?.call(provider, 'disconnect', gone);
      };
    },
  };
}

function injected(): [string, InjectedProvider][] {
  if (typeof window === 'undefined') return [];
  const w = window as unknown as Injected;
  const out: [string, InjectedProvider][] = [];
  const phantom = w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined);
  if (phantom) out.push(['Phantom', phantom]);
  if (w.solflare) out.push(['Solflare', w.solflare]);
  if (w.backpack) out.push(['Backpack', w.backpack]);
  // Some in-app browser's own provider, with no name to go by.
  if (w.solana && !w.solana.isPhantom && !out.some(([, p]) => p === w.solana)) out.push(['Wallet', w.solana]);
  return out;
}

/* ── The registry ─────────────────────────────────────────────────────── */

const standard = new Map<string, StdWallet>();
const adapters = new Map<string, WalletAdapter>();
const listeners = new Set<() => void>();
let listening = false;

const notify = () => listeners.forEach((fn) => fn());

/** Starts listening for wallets, and asks the ones already loaded to register. Once. */
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const api = {
    register(...wallets: StdWallet[]) {
      const added = wallets.filter((w) => w && typeof w.name === 'string' && isSolana(w));
      added.forEach((w) => standard.set(w.name, w));
      if (added.length) notify();
      return () => {
        added.forEach((w) => standard.get(w.name) === w && standard.delete(w.name));
        notify();
      };
    },
  };
  window.addEventListener('wallet-standard:register-wallet', (event) => {
    const callback = (event as CustomEvent<(api: unknown) => void>).detail;
    if (typeof callback === 'function') callback(api);
  });
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    /* No CustomEvent: nothing registers, and the older providers still work. */
  }
  // A provider injected late shows up once the page has loaded.
  window.addEventListener('load', notify, { once: true });
}

/** The first four by name, then the rest in alphabetical order. */
const ORDER = ['phantom', 'solflare', 'backpack', 'nightly'];
const rank = (name: string) => {
  const i = ORDER.indexOf(name.toLowerCase());
  return i === -1 ? ORDER.length : i;
};

/** Every wallet this browser has, each once, in the order they are offered. */
export function listWallets(): WalletAdapter[] {
  listen();
  const out: WalletAdapter[] = [];
  const names = new Set<string>();
  const adapter = (id: string, make: () => WalletAdapter) => {
    let a = adapters.get(id);
    if (!a) adapters.set(id, (a = make()));
    return a;
  };
  for (const w of standard.values()) {
    out.push(adapter(`std:${w.name}`, () => fromStandard(w)));
    names.add(w.name.toLowerCase());
  }
  for (const [name, provider] of injected()) {
    if (names.has(name.toLowerCase())) continue;
    out.push(adapter(`legacy:${name}`, () => fromInjected(name, provider)));
    names.add(name.toLowerCase());
  }
  return out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Told whenever a wallet registers or leaves. Returns the unsubscribe. */
export function onWalletsChange(fn: () => void): () => void {
  listen();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
