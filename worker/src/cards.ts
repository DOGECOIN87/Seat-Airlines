/**
 * The cards flights are shared on.
 *
 * The landing's game draws a card when a flight is over (see
 * `src/lib/shareCard.ts`) and hands it here, because X only puts a picture
 * on a post from a page it can read: this keeps the card, and serves it
 * twice — as the picture, and as a page whose meta tags name the picture,
 * which is the link the post carries. Anybody who follows the link is sent
 * on to the site.
 *
 * Only a flight this server started may leave a card, one card each, and a
 * card is a 1200-by-630 JPEG and no bigger than it has to be; it is kept for
 * ninety days. Nothing a visitor typed is ever written into the page: the
 * score is in the picture, where it cannot be anything but a picture.
 */

import { sha256Hex } from './verify';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const MAX_CARD_BYTES = 450_000;
export const CARD_TTL_SECONDS = 90 * 24 * 60 * 60;

/** A card's id: 24 hex characters. */
export const isCardId = (v: string): boolean => /^[0-9a-f]{24}$/.test(v);

/**
 * A run's card id: derived from it, so each run has the one card, and
 * one-way, so a card's link cannot be walked back to the run it came from —
 * which could still be posted to the leaderboard by whoever held it.
 */
export async function cardId(run: string): Promise<string> {
  return (await sha256Hex(new TextEncoder().encode(`card:${run}`))).slice(0, 24);
}

/** A JPEG's size, from the header of its first frame; null for anything that is not a JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // Fill bytes, and the markers that stand alone.
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    // A start of frame: any of C0–CF but the three that are not (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** Why these bytes are not a card, or null if they are one. */
export function cardProblem(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_CARD_BYTES) return 'That card is too large.';
  const size = jpegSize(bytes);
  if (!size) return 'A card is a JPEG.';
  if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) return `A card is ${CARD_WIDTH} by ${CARD_HEIGHT}.`;
  return null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * The page a shared flight's link opens: meta tags for X (and anything
 * else that unfurls links) naming the card, and for a person, the site.
 */
export function cardPage({ image, page, site }: { image: string; page: string; site: string }): string {
  const img = escapeHtml(image);
  const here = escapeHtml(page);
  const to = escapeHtml(site);
  const title = 'Seat Airlines — can you beat my score?';
  const description = 'One engine gone at altitude. How long can you keep her in the air?';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Seat Airlines">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${here}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${CARD_WIDTH}">
<meta property="og:image:height" content="${CARD_HEIGHT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${to}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030610;color:#fff;font:600 16px/1.4 system-ui,sans-serif}a{color:#7FE3F7}img{max-width:min(92vw,600px);border-radius:12px;display:block;margin:0 auto 16px}</style>
</head>
<body><main><img src="${img}" alt="A flight on Seat Airlines" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><a href="${to}">Fly Seat Airlines →</a></main></body>
</html>
`;
}
