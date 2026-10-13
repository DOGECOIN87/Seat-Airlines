import type { FlightMode } from './landingGame';

export type PlayMode = FlightMode;
export const RIDES: readonly PlayMode[] = ['airliner', 'jet', 'ufo'];

/**
 * The $SEAT a wallet must hold to fly each ride. The airliner is everybody's;
 * the F35 and the UFO are the holders' fleet, checked against the wallet's
 * verified balance — an entitlement, not a development or demo flag.
 */
export const RIDE_PASS: Readonly<Record<PlayMode, number>> = { airliner: 0, jet: 500_000, ufo: 1_000_000 };

/** Whether a balance flies a ride. No balance (no wallet, or not yet read) flies only the open ones. */
export const canFly = (ride: PlayMode, balance: number | null | undefined): boolean =>
  RIDE_PASS[ride] <= 0 || (balance ?? 0) >= RIDE_PASS[ride];

/** Which rides a balance flies, ride by ride. */
export const flyableRides = (balance: number | null | undefined): Record<PlayMode, boolean> =>
  Object.fromEntries(RIDES.map((ride) => [ride, canFly(ride, balance)])) as Record<PlayMode, boolean>;

/** A pass, said short, as a button has room for: 500K, 1M. */
export const passShort = (amount: number): string =>
  amount >= 1_000_000 ? `${amount / 1_000_000}M` : `${amount / 1_000}K`;
