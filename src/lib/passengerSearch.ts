import { OFFERINGS, type Offering } from '../content/offerings';
import type { ManifestEntry } from './manifest';

export function matchesPassenger(
  entry: ManifestEntry,
  profile: { displayName?: string; categories?: Offering[] } | undefined,
  query: string,
  offering: Offering | '',
): boolean {
  if (offering && !profile?.categories?.includes(offering)) return false;
  const text = [entry.address, entry.seat.id, profile?.displayName ?? '',
    ...OFFERINGS.filter((option) => profile?.categories?.includes(option.key)).map((option) => option.label),
  ].join(' ').toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every((word) => text.includes(word));
}
