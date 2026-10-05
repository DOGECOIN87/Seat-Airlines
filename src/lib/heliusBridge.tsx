/**
 * The Helius kit, mounted on its own and driven like any other wallet.
 *
 * Loaded only from `embeddedWallet.ts`, the first time somebody needs it.
 *
 * The kit is a React provider and a hook, written for an app that wraps
 * itself in the provider. This app's wallets are plain objects with
 * `connect` and `signMessage` (`wallets.ts`), so the provider gets a root of
 * its own, outside the page's tree, and a component inside it reports the
 * hook's state out to the functions below. The kit's sign-in modal portals
 * to the document body, so it shows over the page all the same.
 *
 * ── Where its server routes go ────────────────────────────────────────────
 * Run without an API key in the browser, the kit fetches `/api/helius/…` on
 * the page's own origin, which on a static host is nothing. Those requests,
 * and only those, are sent to the Worker's `/helius/…` instead.
 */
import { Buffer } from 'buffer';
import type { HeliusWallet } from 'helius-wallet-kit';
import { HELIUS_API } from './embeddedWallet';

/* The kit reaches for Node's Buffer as a global. It has to exist before the
   kit's modules run, which is why they are imported below rather than above. */
const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;

/* ── Requests ─────────────────────────────────────────────────────────── */

const LOCAL = '/api/helius/';
const original = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let url: URL | null = null;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    /* Not a URL this cares about. */
  }
  if (url && url.origin === window.location.origin && url.pathname.startsWith(LOCAL)) {
    const route = url.pathname.slice(LOCAL.length);
    const target = `${HELIUS_API}/${route}${url.search}`;
    const sent = original(input instanceof Request ? new Request(target, input) : target, init);
    /* The kit only logs a failed bootstrap and then never leaves "loading",
       so the failure is noticed here, where the answer goes past. */
    if (route === 'waas/config') {
      sent.then((res) => { if (!res.ok) unavailable(); }, unavailable);
    }
    return sent;
  }
  return original(input, init);
};

/* ── State, reported out of React ─────────────────────────────────────── */

/** Set when the bootstrap failed: sign-in cannot work until the page is reloaded. */
let broken = false;
const unavailable = () => {
  broken = true;
  changed();
};

let wallet: HeliusWallet | null = null;
/** Whether the kit's sign-in modal is showing. */
let modalOpen = false;
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((fn) => fn());

/** Resolves the first time `test` holds, rechecked whenever the kit's state moves. */
function until<T>(test: () => T | undefined, ms: number, timeout: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      let out: T | undefined;
      try {
        out = test();
      } catch (e) {
        done();
        reject(e);
        return;
      }
      if (out === undefined) return;
      done();
      resolve(out);
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error(timeout));
    }, ms);
    const done = () => {
      window.clearTimeout(timer);
      watchers.delete(check);
    };
    watchers.add(check);
    check();
  });
}

/* ── The mount ────────────────────────────────────────────────────────── */

const mounted = (async () => {
  const [{ createRoot }, kit, { useModal }, { useEffect }] = await Promise.all([
    import('react-dom/client'),
    import('helius-wallet-kit'),
    import('@turnkey/react-wallet-kit'),
    import('react'),
    import('helius-wallet-kit/ui/styles.css'),
  ]);

  function Report() {
    const state = kit.useHeliusWallet();
    const { modalStack } = useModal();
    useEffect(() => {
      wallet = state;
      modalOpen = modalStack.length > 0;
      changed();
    });
    return null;
  }

  const host = document.createElement('div');
  host.id = 'sa-embedded-wallet';
  // The landing scene creates its own stacking contexts while crashed and on
  // mobile. Keep Helius's login/sign-message sheets above those layers.
  host.style.position = 'relative';
  host.style.zIndex = '2147483647';
  host.style.isolation = 'isolate';
  document.body.appendChild(host);
  createRoot(host).render(
    <kit.HeliusWalletProvider
      config={{
        cluster: 'mainnet-beta',
        theme: { darkMode: true, primaryColor: '#E84125', logoLight: '/seat-airlines-logo.svg', logoDark: '/seat-airlines-logo.svg' },
        onError: (e) => console.warn('[embedded wallet]', e.message),
      }}
    >
      <Report />
    </kit.HeliusWalletProvider>,
  );
})();

/** The kit, once it has worked out whether this browser is already signed in. */
const settled = async () => {
  await mounted;
  return until(
    () => {
      if (broken) throw new Error('Email and passkey sign-in is not available right now. Try again later, or use a wallet app.');
      return wallet && wallet.status !== 'loading' ? wallet : undefined;
    },
    20_000,
    'The email and passkey sign-in did not load. Check your connection and try again.',
  );
};

/** The address, once signed in and the wallet has been made. */
const addressOf = (w: HeliusWallet | null) => (w?.status === 'authenticated' && w.address ? w.address : undefined);

/**
 * Silent: the address if this browser is still signed in, else null.
 * Otherwise opens the sign-in and resolves when it finishes, or throws a
 * refusal if the person closes it.
 */
export async function connect(silent: boolean): Promise<string | null> {
  const w = await settled();
  const already = addressOf(w);
  if (already || silent) return already ?? null;
  await w.login();
  let opened = false;
  return until(() => {
    const address = addressOf(wallet);
    if (address) return address;
    if (modalOpen) opened = true;
    else if (opened) throw new Error('User cancelled sign-in.');
    return undefined;
  }, 10 * 60_000, 'Sign-in took too long. Try again.');
}

export async function signMessage(message: string): Promise<string> {
  const w = await settled();
  if (!addressOf(w)) throw new Error('Email or passkey wallet is not connected.');
  return w.signMessage(message);
}

export async function disconnect(): Promise<void> {
  const w = await settled();
  if (w.status === 'authenticated') await w.logout();
}

/** Told when the signed-in address changes, or goes (signed out, session expired). */
export function onAccountChange(fn: (address: string | null) => void): () => void {
  let last = addressOf(wallet) ?? null;
  const check = () => {
    if (!wallet || wallet.status === 'loading') return;
    const next = addressOf(wallet) ?? null;
    if (next === last) return;
    last = next;
    fn(next);
  };
  watchers.add(check);
  return () => watchers.delete(check);
}
