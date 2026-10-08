import { useEffect, useState } from 'react';
import { WORKER_API } from '../lib/networkingApi';
import { FOMO_PROFILE_BATCH, readFomoProfile, type FomoProfile } from '../lib/fomoProfile';

type Profiles = Record<string, FomoProfile | null>;
const cache = new Map<string, { profile: FomoProfile | null; until: number }>();
const pending = new Map<string, Promise<void>>();
let retryAt = 0;

function cached(addresses: string[]): Profiles {
  return Object.fromEntries(addresses.map(address => [address, cache.get(address)?.profile ?? null]));
}

async function load(addresses: string[]): Promise<Profiles> {
  if (!WORKER_API) return {};
  const waiting: Promise<void>[] = [];
  const missing = addresses.filter(address => {
    const work = pending.get(address);
    if (work) { waiting.push(work); return false; }
    return (cache.get(address)?.until ?? 0) <= Date.now();
  });
  // A provider outage must not turn every component into another lookup.
  for (let start = 0; start < missing.length && retryAt <= Date.now(); start += FOMO_PROFILE_BATCH) {
    const batch = missing.slice(start, start + FOMO_PROFILE_BATCH);
    const work = (async () => {
      try {
        const response = await fetch(`${WORKER_API}/fomo/profiles?wallets=${encodeURIComponent(batch.join(','))}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) { retryAt = Date.now() + 60_000; return; }
        const body = await response.json() as { profiles?: Record<string, unknown>; available?: boolean };
        if (!body.profiles) { retryAt = Date.now() + 60_000; return; }
        if (body.available === false) retryAt = Date.now() + 60_000;
        for (const address of batch) {
          if (!(address in body.profiles)) continue;
          const profile = readFomoProfile(body.profiles[address], address);
          // Keep a prior picture during a provider outage.
          cache.set(address, { profile: profile ?? (body.available === false ? cache.get(address)?.profile ?? null : null),
            until: Date.now() + (body.available === false ? 60_000 : 15 * 60 * 1000) });
        }
      } catch { retryAt = Date.now() + 60_000; }
    })().finally(() => batch.forEach(address => pending.delete(address)));
    batch.forEach(address => pending.set(address, work));
    waiting.push(work);
    // Keep the cabin's first load below the provider's shared rate limit.
    await work;
  }
  await Promise.all(waiting);
  return cached(addresses);
}

export function useFomoProfiles(wallets: readonly (string | null | undefined)[]): Profiles {
  const key = [...new Set(wallets.filter((wallet): wallet is string => Boolean(wallet)))].sort().join(',');
  const [profiles, setProfiles] = useState<Profiles>(() => cached(key ? key.split(',') : []));
  useEffect(() => {
    if (!key) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const addresses = key.split(',');
    setProfiles(cached(addresses));
    const refresh = () => {
      void load(addresses).then(next => {
        if (!active) return;
        setProfiles(next);
        timer = setTimeout(refresh, 60_000);
      });
    };
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [key]);
  return profiles;
}
