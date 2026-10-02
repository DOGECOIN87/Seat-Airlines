/**
 * A holder's advert, shared to X on a card.
 *
 * The card is the advert, square, beside the seat it hangs on — number,
 * cabin, rank — on the airline's night, at the size X shows a link's
 * picture (1200 by 630). How it reaches X, best first:
 *
 *  1. Connected to X here (see xPost.ts): the Worker posts it, as them.
 *  2. A phone: the card itself to the share sheet, and so to the X app.
 *  3. Anywhere else: the holder signs for the card, the Worker keeps it and
 *     serves it as a page X reads, and X opens with the post written and
 *     that page linked — so the card is the post's picture. The signature
 *     is what stops anybody leaving a picture under somebody else's seat.
 */

import { cardAssets, canShareFile, intentUrl, shareFile, SHARE_ORIGIN, SITE_URL } from './shareCard';
import { WORKER_API } from './networkingApi';
import { postToX, xLink } from './xPost';

const W = 1200;
const H = 630;
const SANS = 'Montserrat, ui-sans-serif, system-ui, sans-serif';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export interface SeatShare {
  owner: string;
  seat: string;
  cabin: string;
  rank: number | null;
  alt: string;
  sign: (message: string) => Promise<string>;
}

export interface ShareOutcome { text: string; href?: string; label?: string; error?: boolean; /** Show the link as the main button. */ button?: boolean }

const loadBlobImage = async (blob: Blob): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

/** The card, as a JPEG; null if the advert could not be read. */
export async function composeSeatCard(o: Omit<SeatShare, 'sign'>): Promise<Blob | null> {
  if (!WORKER_API) return null;
  // Through the Worker, with CORS: the bucket sends none, and a canvas drawn from it could not be read back.
  const res = await fetch(`${WORKER_API}/advert/${encodeURIComponent(o.owner)}`).catch(() => null);
  if (!res?.ok) return null;
  const [advert, { logo }] = await Promise.all([loadBlobImage(await res.blob()), cardAssets()]);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;

  // The night the site flies through.
  const sky = g.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, '#16233d');
  sky.addColorStop(1, '#05080f');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(330, 315, 40, 330, 315, 420);
  glow.addColorStop(0, 'rgba(0, 201, 241, 0.35)');
  glow.addColorStop(1, 'rgba(0, 201, 241, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // The advert, square, lit like a seat that is yours.
  const S = 530;
  const x = 60;
  const y = (H - S) / 2;
  g.save();
  g.shadowColor = 'rgba(0, 201, 241, 0.7)';
  g.shadowBlur = 40;
  roundRect(g, x - 6, y - 6, S + 12, S + 12, 34);
  g.fillStyle = '#00C9F1';
  g.fill();
  g.restore();
  roundRect(g, x - 3, y - 3, S + 6, S + 6, 31);
  g.fillStyle = '#fff';
  g.fill();
  g.save();
  roundRect(g, x, y, S, S, 28);
  g.clip();
  const side = Math.min(advert.naturalWidth, advert.naturalHeight);
  g.drawImage(advert, (advert.naturalWidth - side) / 2, (advert.naturalHeight - side) / 2, side, side, x, y, S, S);
  g.restore();

  // The seat it hangs on.
  const tx = 660;
  g.textBaseline = 'alphabetic';
  if (logo) g.drawImage(logo, tx, 70, 56, 56);
  g.fillStyle = '#fff';
  g.font = `800 30px ${SANS}`;
  g.fillText('SEAT AIRLINES', tx + (logo ? 72 : 0), 108);

  g.fillStyle = '#7FE3F7';
  g.font = `600 24px ${MONO}`;
  g.fillText('MY SEAT', tx, 222);
  g.fillStyle = '#fff';
  g.font = `800 150px ${SANS}`;
  g.fillText(o.seat, tx - 6, 360);
  g.fillStyle = '#d6e4f2';
  g.font = `700 34px ${SANS}`;
  g.fillText(`${o.cabin.toUpperCase()}${o.rank ? `  ·  RANK #${o.rank}` : ''}`, tx, 420);

  g.fillStyle = 'rgba(214, 228, 242, 0.75)';
  g.font = `600 22px ${MONO}`;
  g.fillText('YOUR BAG IS YOUR SEAT.', tx, 512);
  g.fillStyle = '#7FE3F7';
  g.fillText('SEAT-AIRLINES.SPACE', tx, 552);

  // Under the Worker's 450 KB for a card: a busy advert can need a second, plainer pass.
  for (const quality of [0.88, 0.78, 0.66]) {
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', quality));
    if (!blob || blob.size <= 440_000) return blob;
  }
  return null;
}

export const seatShareText = (o: Omit<SeatShare, 'sign'>) =>
  `💺 My seat on Seat Airlines: ${o.seat}, ${o.cabin}${o.rank ? ` · rank #${o.rank}` : ''}.\n\n`
  + `Every seat is a billboard, and this one's mine. Your bag is your seat ✈️\n\n@SeatAirlines`;

/** What the holder signs (see the Worker's seatCardChallenge). A message, never a transaction. */
const challenge = (owner: string, hash: string, issued: string) =>
  ['SEAT AIRLINES', 'Share my seat card.', '', `wallet: ${owner}`, `card:   sha256:${hash}`, `issued: ${issued}`].join('\n');

const sha256Hex = async (blob: Blob) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

/** Signs for the card and leaves it with the Worker; the link X is to read it from. */
async function hostSeatCard(owner: string, card: Blob, sign: SeatShare['sign']): Promise<string> {
  const issued = new Date().toISOString();
  const signature = await sign(challenge(owner, await sha256Hex(card), issued));
  const res = await fetch(`${WORKER_API}/seatcards/${encodeURIComponent(owner)}`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', 'x-sa-issued': issued, 'x-sa-signature': signature },
    body: card,
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? 'The card could not be saved.');
  const v = body.url ? new URL(body.url).search : '';
  return `${SHARE_ORIGIN}/s/${body.id}${v}`;
}

const refused = (e: unknown) => /reject|denied|cancel/i.test(e instanceof Error ? e.message : String(e));

/** Shares the holder's seat card by the best way open to them. Call it from the click itself. */
export async function shareSeatCard(o: SeatShare): Promise<ShareOutcome | null> {
  const text = seatShareText(o);
  const viaX = Boolean(xLink());
  const viaSheet = !viaX && canShareFile(new Blob([], { type: 'image/jpeg' }));
  /* A desktop's tab to X, opened now, inside the click, or the browser blocks
     it. Not on a phone: wallets' in-app browsers (Backpack, Nightly) swallow a
     tab opened from script without a word, so there the holder gets a button
     to tap instead, and a tapped x.com link opens the X app. */
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const tab = !viaX && !viaSheet && !touch ? window.open('about:blank', '_blank') : null;
  try {
    const card = await composeSeatCard(o);
    if (!card) throw new Error('Your advert could not be read. Try again in a moment.');
    if (viaX) {
      const done = await postToX(`${text}\n${SITE_URL}`, null, card);
      if (done.posted) return { text: 'Posted to X', href: done.url, label: 'View post' };
      // Not through X, then: the compose box, with the card's page linked.
      const link = await hostSeatCard(o.owner, card, o.sign);
      return { text: `Could not post it directly. ${done.reason}`, href: intentUrl(text, link), label: 'Post it on X yourself', error: true };
    }
    if (viaSheet) {
      const sent = await shareFile(card, text);
      return sent === 'failed' ? { text: 'Could not open the share sheet.', error: true } : null;
    }
    const link = await hostSeatCard(o.owner, card, o.sign);
    const to = intentUrl(text, link);
    if (tab && !tab.closed) {
      tab.opener = null;
      tab.location.href = to;
      return { text: 'Opened X with your seat card.', href: to, label: 'Open X again' };
    }
    return { text: 'Your seat card is ready.', href: to, label: 'Open X to post', button: true };
  } catch (e) {
    tab?.close();
    if (refused(e)) return null;
    return { text: e instanceof Error ? e.message : 'The card could not be shared.', error: true };
  }
}
