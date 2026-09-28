/**
 * Who moved, between two readings of the manifest.
 *
 * Seats go strictly by rank, so one holder climbing ten places moves ten
 * others back one each — and a feed that reported all eleven would be noise.
 * What the cabin wants to hear is the cause: the holder whose bag grew and
 * who climbed past somebody for it. The rest were carried along.
 *
 * What you want to hear about yourself is different: every change to your
 * seat, whoever caused it, who went past you, and exactly what it would take
 * to win your old seat back.
 *
 * Pure, and in terms of the shared seating types only, so it runs in a test.
 */
import type { Manifest, ManifestEntry } from './seating';

/** A holder who climbed past somebody by holding more. */
export interface Headline {
  address: string;
  /** The seat they climbed from, or null from the hold. */
  from: string | null;
  /** The seat they are in now. */
  to: string;
  /** Whoever held that seat before them. */
  took: string;
  /** Places climbed. */
  climbed: number;
}

/** A change to one wallet's own seat. */
export interface PersonalMove {
  /** The seat before, or null from the hold. */
  from: string | null;
  /** The seat now, or null to the hold. */
  to: string | null;
  /** Forward in the aircraft. */
  up: boolean;
  /** Going back: who went past. Going forward: who was passed. */
  passed: string[];
  /** Going back because this wallet's own bag got smaller. */
  sold: boolean;
  /** Going back: tokens more to win the old seat back (or get aboard again). Null going forward. */
  winBack: number | null;
}

const byAddress = (m: Manifest) => new Map(m.entries.map((e) => [e.address, e] as const));

/**
 * The holders who climbed by holding more, biggest climb first.
 *
 * Nothing on a first reading: an aircraft going from empty to boarded is not
 * a hundred and seventy-eight people each taking somebody's seat.
 */
export function headlines(before: Manifest, after: Manifest, limit = 3): Headline[] {
  if (!before.entries.length || !after.entries.length) return [];
  const was = byAddress(before);
  const outside = before.entries.length + 1;
  const out: Headline[] = [];
  for (const now of after.entries) {
    const prev = was.get(now.address);
    const climbed = (prev?.rank ?? outside) - now.rank;
    if (climbed <= 0) continue;
    // Carried forward by somebody else falling back is not taking a seat. From
    // the hold there is no earlier balance to compare, but a bag that would
    // not have beaten the last seat before was let aboard, not bought aboard.
    if (prev ? now.balance <= prev.balance : now.balance <= before.cutoff) continue;
    const took = before.bySeat.get(now.seat.id)?.address;
    if (!took || took === now.address) continue;
    out.push({ address: now.address, from: prev?.seat.id ?? null, to: now.seat.id, took, climbed });
  }
  return out.sort((a, b) => b.climbed - a.climbed).slice(0, limit);
}

/**
 * What happened to `me`, or null when my seat did not change.
 *
 * `balance` is my bag as the page knows it, for when the manifest has no
 * entry for me — in the hold, it is the only place my balance is.
 */
export function personalMove(before: Manifest, after: Manifest, me: string, balance: number): PersonalMove | null {
  const was: ManifestEntry | undefined = before.entries.find((e) => e.address === me);
  const now: ManifestEntry | undefined = after.entries.find((e) => e.address === me);
  const from = was?.seat.id ?? null;
  const to = now?.seat.id ?? null;
  if (from === to) return null;

  const rankBefore = was?.rank ?? Infinity;
  const rankAfter = now?.rank ?? Infinity;
  const up = rankAfter < rankBefore;
  const prior = byAddress(before);
  const later = byAddress(after);
  const rank = (m: Map<string, ManifestEntry>, a: string) => m.get(a)?.rank ?? Infinity;

  const passed = up
    // Ahead of me before, behind me now.
    ? before.entries.filter((e) => e.address !== me && e.rank < rankBefore && rank(later, e.address) > rankAfter).map((e) => e.address)
    // Behind me (or aboard from the hold) before, ahead of me now.
    : after.entries.filter((e) => e.address !== me && e.rank < rankAfter && rank(prior, e.address) > rankBefore).map((e) => e.address);

  const mine = now?.balance ?? balance;
  const sold = !up && was !== undefined && mine < was.balance;
  let winBack: number | null = null;
  if (!up && from) {
    // Whoever sits in my old seat now is who I have to out-hold to get it back.
    const holder = after.bySeat.get(from);
    const target = holder && holder.address !== me ? holder.balance : after.cutoff;
    winBack = Math.max(0, target - mine);
  }
  return { from, to, up, passed, sold, winBack };
}
