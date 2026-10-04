import { useEffect, useState } from 'react';
import { DEX_PAIR } from './social';
import { visibilityAwareInterval } from './visibility';

/**
 * Whether the token is boosted on DexScreener right now.
 *
 * Anybody can buy the pair a boost on DexScreener (the Boost button on its
 * page). While one is running the aeroplane lights its afterburners and goes
 * faster — so a boost is something the whole site can see, not just the
 * trending list. Read off DexScreener's public pair endpoint, which answers
 * any origin, every few minutes: boosts last hours, not seconds.
 */

/** How much faster the ground goes by, cruising on a boost. */
export const BOOST_CRUISE = 1.9;
/** How hard the afterburners burn on a boosted cruise, 0–1: steady, with a flicker. */
export const cruiseFlicker = (now: number) => 0.55 + 0.08 * Math.sin(now / 70) + 0.05 * Math.sin(now / 23);

const ENDPOINT = `https://api.dexscreener.com/latest/dex/pairs/solana/${DEX_PAIR}`;
const REFRESH = 5 * 60_000;

/** The number of boosts running on the pair, from DexScreener's answer; 0 for anything else. */
export function activeBoosts(body: unknown): number {
  const pairs = (body as { pairs?: unknown; pair?: unknown } | null);
  const list = Array.isArray(pairs?.pairs) ? pairs.pairs : pairs?.pair ? [pairs.pair] : [];
  const n = Number((list[0] as { boosts?: { active?: unknown } } | undefined)?.boosts?.active);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Boosts running now. `?boost` in the address forces one on, to see the
 * effect without paying for it.
 */
export function useDexBoost(): number {
  const [forced] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('boost'));
  const [boosts, setBoosts] = useState(0);
  useEffect(() => {
    if (forced) return;
    let live = true;
    const stop = visibilityAwareInterval(async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!res.ok) return;
        const n = activeBoosts(await res.json());
        if (live) setBoosts(n);
      } catch {
        /* Unreachable: keep what we had. */
      }
    }, REFRESH);
    return () => { live = false; stop(); };
  }, [forced]);
  return forced ? 1 : boosts;
}
