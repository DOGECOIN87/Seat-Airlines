/** Where the airline is, besides here. One place, so every link agrees. */
export const X_URL = 'https://x.com/SeatAirlines';
export const TELEGRAM_URL = 'https://t.me/SEATAIRLINES';
/** The team's tokens, locked on Jupiter Lock: public, so anybody can check it. */
export const LOCK_URL = 'https://lock.jup.ag/escrow/AtiAAu8kAtmwqQ8yiNakpsg3Rxg7UrFWUazCvhHXteFU';

/** The token's pair on DexScreener: its chart, and where anybody can boost it. */
export const DEX_PAIR = 'cgguntqrpqyrz7qxmcjchi6xxazurqszaawkaggzaoaj';
export const DEXSCREENER_URL = `https://dexscreener.com/solana/${DEX_PAIR}`;

/**
 * A partner's own logo, as its owner publishes it, served from
 * public/partners/: DexScreener's app icon (its web manifest), Jupiter's mark
 * (jup.ag), Helius's lockup (its brand kit). Files, not redrawings.
 */
export const partnerLogo = (file: string) => `${import.meta.env.BASE_URL}partners/${file}`;
