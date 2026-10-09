/** The public fields we use from the community Fomo wallet index. */
export interface FomoProfile {
  address: string;
  id: string;
  handle: string;
  name: string | null;
  image: string | null;
}

export const FOMO_PROFILE_API = 'https://fomo-public.pootracker.app';
export const FOMO_PROFILE_BATCH = 12;
export const FOMO_PROFILE_CONCURRENCY = 3;
export const FOMO_PROFILE_LOOKUP_MS = 3500;
// A complete batch can take four waves of lookups, plus network transit.
export const FOMO_PROFILE_BATCH_MS = Math.ceil(FOMO_PROFILE_BATCH / FOMO_PROFILE_CONCURRENCY) * FOMO_PROFILE_LOOKUP_MS + 3000;

export function profileImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Never attach another wallet's picture, even if the index returns it. */
export function readFomoUser(value: unknown, address: string): FomoProfile | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  if (user.solanaAddress !== address || typeof user.id !== 'string' || !user.id ||
      typeof user.handle !== 'string' || !user.handle.trim()) return null;
  return {
    address, id: user.id.slice(0, 128), handle: user.handle.trim().slice(0, 80),
    name: typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0, 100) : null,
    image: profileImage(user.profilePicture),
  };
}

export function readFomoProfile(value: unknown, address: string): FomoProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  return readFomoUser({ ...profile, solanaAddress: profile.address, profilePicture: profile.image }, address);
}
