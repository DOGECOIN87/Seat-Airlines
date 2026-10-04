import { useEffect, useState } from 'react';
import { DEX_PAIR } from './social';
import { visibilityAwareInterval } from './visibility';

/**
 * Whether the token is boosted on DexScreener right now.
 *
 * Anybody can buy the token Boosts on DexScreener: on its page, the yellow
 * Boost button (there is no link straight to it). A Boost pack lasts 12 to
 * 24 hours, the count of Boosts running is shown beside the token, and at
 * 500 or more it gets DexScreener's Golden Ticker (docs.dexscreener.com/boosting).
 *
 * While any are running the aeroplane lights its afterburners and goes
 * faster — harder and faster the more there are, so a boost is something
 * the whole site can see, not just the trending list. Read off DexScreener's
 * public pair endpoint (`boosts.active` on the pair, 300 requests a minute,
 * any origin) every few minutes: Boosts last hours, not seconds.
 */

/** Boosts that earn the Golden Ticker on DexScreener. */
export const GOLDEN_TICKER = 500;

/**
 * How boosted, 0–1, from the Boosts running: nothing with none, a clear
 * burn with one, and growing on a log scale to full at the Golden Ticker.
 */
export function boostStrength(boosts: number): number {
  if (!(boosts > 0)) return 0;
  return 0.35 + 0.65 * Math.min(1, Math.log(1 + boosts) / Math.log(1 + GOLDEN_TICKER));
}

/** How hard the afterburners burn, 0–1, at a strength: steady, with a flicker. */
export const cruiseBurn = (now: number, strength: number) =>
  strength > 0 ? Math.min(1, strength * (0.85 + 0.1 * Math.sin(now / 70) + 0.06 * Math.sin(now / 23))) : 0;

/** How much faster the ground goes by at a strength: about 1.5× on one Boost, 2.3× at the Golden Ticker. */
export const cruiseSpeed = (strength: number): number | undefined => (strength > 0 ? 1 + 1.3 * strength : undefined);

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
 * Boosts running now. `?boost` in the address forces one on, and
 * `?boost=600` that many, to see the effect without paying for it.
 */
export function useDexBoost(): number {
  const [forced] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const q = new URLSearchParams(window.location.search);
    if (!q.has('boost')) return 0;
    const n = Math.floor(Number(q.get('boost')));
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
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
  return forced || boosts;
}
