import { FOMO_PROFILE_API, readFomoProfile, readFomoUser, type FomoProfile } from '../../src/lib/fomoProfile';

type Store = Pick<KVNamespace, 'get' | 'put'>;
interface Cached { profile: FomoProfile | null; until: number }
interface Result { profile: FomoProfile | null; available: boolean }
const memory = new Map<string, Cached>();
const pending = new Map<string, Promise<Result>>();
let retryAt = 0;
const HOUR = 60 * 60 * 1000;

function remember(address: string, cached: Cached) {
  if (memory.size >= 512) memory.delete(memory.keys().next().value!);
  memory.set(address, cached);
}

async function resolve(address: string, store?: Store): Promise<Result> {
  let cached = memory.get(address);
  if (!cached && store) {
    try {
      const raw = await store.get(`fomo:wallet:${address}`);
      const parsed = raw ? JSON.parse(raw) as Cached : null;
      if (parsed && typeof parsed.until === 'number') {
        const profile = readFomoProfile(parsed.profile, address);
        if (profile || parsed.profile === null) {
          cached = { profile, until: parsed.until };
          remember(address, cached);
        }
      }
    } catch { /* Profile decoration still works without KV. */ }
  }
  if (cached && cached.until + 30 * 24 * HOUR - HOUR < Date.now()) {
    memory.delete(address);
    cached = undefined;
  }
  if (cached && cached.until > Date.now()) return { profile: cached.profile, available: true };
  if (retryAt > Date.now()) return { profile: cached?.profile ?? null, available: false };

  try {
    const response = await fetch(`${FOMO_PROFILE_API}/v2/users/wallet/${encodeURIComponent(address)}`, {
      headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(3500),
    });
    if (!response.ok && response.status !== 404) {
      const seconds = Number(response.headers.get('retry-after'));
      retryAt = Date.now() + Math.max(60_000, Number.isFinite(seconds) ? Math.min(seconds * 1000, HOUR) : 0);
      return { profile: cached?.profile ?? null, available: false };
    }
    const profile = response.status === 404 ? null : readFomoUser(await response.json(), address);
    if (response.status !== 404 && !profile) return { profile: cached?.profile ?? null, available: false };
    const next = { profile, until: Date.now() + (profile ? HOUR : 15 * 60 * 1000) };
    remember(address, next);
    if (store) {
      try {
        await store.put(`fomo:wallet:${address}`, JSON.stringify(next), { expirationTtl: profile ? 30 * 24 * 60 * 60 : 900 });
      } catch { /* Memory cache remains useful if persistent caching fails. */ }
    }
    return { profile, available: true };
  } catch {
    retryAt = Date.now() + 60_000;
    return { profile: cached?.profile ?? null, available: false };
  }
}

function profileFor(address: string, store?: Store): Promise<Result> {
  const existing = pending.get(address);
  if (existing) return existing;
  const work = resolve(address, store).finally(() => pending.delete(address));
  pending.set(address, work);
  return work;
}

/** Bounded parallel reads; the caller caps each request at 12 wallets. */
export async function readFomoProfiles(addresses: string[], store?: Store) {
  const profiles: Record<string, FomoProfile | null> = {};
  let available = true;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, addresses.length) }, async () => {
    while (cursor < addresses.length) {
      const address = addresses[cursor++];
      const result = await profileFor(address, store);
      profiles[address] = result.profile;
      available &&= result.available;
    }
  }));
  return { profiles, available };
}
