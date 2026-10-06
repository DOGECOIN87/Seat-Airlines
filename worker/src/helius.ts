/**
 * Helius embedded wallets, with the API key kept on this side.
 *
 * `helius-wallet-kit` signs people in by passkey, email or text message
 * and gives them a non-custodial Solana wallet. Run key-less — which is the
 * mode it recommends for production — it expects a small server alongside
 * the page holding `HELIUS_API_KEY` and answering a handful of routes under
 * `/api/helius/`. Its own server is a Next.js route handler, and this site
 * is static pages plus this Worker, so the Worker answers them instead, at
 * `/helius/…`, and the page sends them here (`src/lib/heliusFetch.ts`).
 *
 * ── Why not the kit's own handler ─────────────────────────────────────────
 * It is written for a server on the page's own origin, and leans on that: its
 * RPC route forwards any method to a keyed endpoint for whoever asks, and its
 * registration route checks `Origin` against `Host`, which a Worker on
 * another domain fails by design. So the same upstream calls are made here,
 * scoped to what this site needs:
 *
 *   GET  /helius/status         whether this deployment has embedded wallets at all
 *   GET  /helius/waas/config    the wallet's bootstrap (organisation, auth proxy)
 *   POST /helius/waas/wallets   register a new wallet, for the dashboard's counts
 *   POST /helius/rpc            JSON-RPC, mainnet only, from an allowed origin
 *
 * There is deliberately no transaction-sending relay here. Wallets submit
 * signed transactions through their own provider; this Worker is not a
 * public paid Sender proxy.
 *
 * The bootstrap answers the Secure RPC URL as well, so in practice the wallet
 * talks to the chain directly; `/rpc` is only a bounded read-only fallback.
 *
 * Unset, `HELIUS_API_KEY` means there are no embedded wallets: every route
 * answers 503 and the page leaves the option out of its picker.
 */

export interface HeliusEnv {
  /** A Helius API key from a paid plan with Wallet-as-a-Service on. A secret. */
  HELIUS_API_KEY?: string;
}

const API = 'https://dev-api.helius.xyz/v0';
const RPC = 'https://mainnet.helius-rpc.com/';

/**
 * The JSON-RPC methods a wallet needs from the chain, and no others.
 *
 * `Origin` is set by browsers and typed by anybody with curl, so it keeps
 * other *sites* off these routes but is not authorization. Cost is bounded by
 * the read-only allowlist, body limits, and the Worker rate-limit binding.
 */
const RPC_METHODS = new Set([
  'getLatestBlockhash', 'getBlockHeight', 'isBlockhashValid', 'getBalance', 'getAccountInfo',
  'getMultipleAccounts', 'getTokenAccountBalance', 'getTokenAccountsByOwner', 'getSignatureStatuses',
  'getFeeForMessage', 'getMinimumBalanceForRentExemption', 'getRecentPrioritizationFees',
  'getPriorityFeeEstimate',
]);

/** A registration or a JSON-RPC call is small; anything bigger is not one. */
export const MAX_HELIUS_BODY = 64 * 1024;

export const heliusConfigured = (env: HeliusEnv) => Boolean(env.HELIUS_API_KEY?.trim());

/** Whether a request names one of these routes. */
export const isHeliusPath = (path: string) => path.startsWith('/helius/');

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/** Whether `origin` is one this deployment serves, by the same list CORS uses. */
export function trustedOrigin(allowedOrigins: string | undefined, origin: string | null): boolean {
  const allowed = (allowedOrigins ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin) return false;
  return allowed.length === 0 || allowed.includes(origin);
}

/**
 * Answer one `/helius/…` request.
 *
 * `trusted` is whether the request names an origin this deployment serves.
 * Origin rejection is a browser UX/CORS control, not a credential; the route
 * limits and allowlists are the security boundary for this public fallback.
 */
export async function handleHelius(
  request: Request,
  env: HeliusEnv,
  cors: Record<string, string>,
  trusted: boolean,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname.slice('/helius/'.length);
  const key = env.HELIUS_API_KEY?.trim();
  /* Asked once per page view, so the picker offers the option only where it
     works. Public: it says whether a key is set, never what it is. */
  if (path === 'status' && request.method === 'GET') {
    return reply({ ready: Boolean(key) }, 200, { ...cors, 'cache-control': 'public, max-age=300' });
  }
  if (!key) return reply({ error: 'Embedded wallets are not set up on this deployment.' }, 503, cors);
  if (!trusted) return reply({ error: 'Not from this site.' }, 403, cors);

  if (path === 'waas/config') {
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, cors);
    const res = await upstream(`${API}/waas/config`, { headers: { 'x-api-key': key } });
    return reply(await res.text(), res.status, cors);
  }

  if (path === 'waas/wallets') {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, cors);
    const body = await boundedText(request);
    if (body === null) return reply({ error: 'That request is too large.' }, 413, cors);
    if (!validWalletRegistration(body)) return reply({ error: 'That wallet registration is not valid.' }, 400, cors);
    const res = await upstream(`${API}/waas/wallets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body,
    });
    if (res.status === 204) return new Response(null, { status: 204, headers: cors });
    return reply(await res.text(), res.status, cors);
  }

  if (path === 'rpc') {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, cors);
    /* This aircraft flies on mainnet, and a devnet request is somebody
       spending this key on something that is not this site. */
    const cluster = new URL(request.url).searchParams.get('cluster') ?? 'mainnet-beta';
    if (cluster !== 'mainnet-beta') return reply({ error: 'Mainnet only.' }, 400, cors);
    const body = await boundedText(request);
    if (body === null) return reply({ error: 'That request is too large.' }, 413, cors);
    if (!rpcAllowed(body)) return reply({ error: 'That call is not available here.' }, 403, cors);
    const res = await upstream(`${RPC}?api-key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return reply(await res.text(), res.status, cors);
  }

  return reply({ error: 'Not found' }, 404, cors);
}

/** Whether every call in a JSON-RPC body (one, or a batch) is one a wallet needs. */
export function rpcAllowed(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  return calls.length > 0 && calls.length <= 10
    && calls.every((c) => isRpcCall(c) && RPC_METHODS.has(c.method));
}

function isRpcCall(value: unknown): value is { method: string; params?: unknown; id?: unknown; jsonrpc?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const call = value as Record<string, unknown>;
  if (typeof call.method !== 'string' || call.method.length > 64) return false;
  if (call.jsonrpc !== undefined && call.jsonrpc !== '2.0') return false;
  if (call.id !== undefined && !['string', 'number'].includes(typeof call.id)) return false;
  if (call.params !== undefined && !Array.isArray(call.params) && (typeof call.params !== 'object' || call.params === null)) return false;
  return call.params === undefined || JSON.stringify(call.params).length <= 16 * 1024;
}

/** Accept the object shape used by Helius without forwarding arbitrary nested payloads. */
function validWalletRegistration(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0 || entries.length > 32) return false;
    return entries.every(([name, value]) => name.length <= 128 && ['string', 'number', 'boolean'].includes(typeof value)
      && (typeof value !== 'string' || value.length <= 2048));
  } catch {
    return false;
  }
}

/** The body as text, or null if it runs past the cap however it was sent. */
async function boundedText(request: Request): Promise<string | null> {
  const text = await request.text();
  return new TextEncoder().encode(text).length > MAX_HELIUS_BODY ? null : text;
}
