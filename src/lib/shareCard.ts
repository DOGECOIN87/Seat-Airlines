/**
 * A flight, shared.
 *
 * When the landing's game is over the score can go to X on a card made for
 * it: the moment the engine went — the fireball, or the bolt — as the
 * scene drew it, the score across it in the airline's type, what happened
 * and where, and WASTED stamped in the corner. 1200 by 630, the shape X
 * shows a link's picture at.
 *
 * X will not take a picture from a link to compose a post with, only from a
 * page it reads, so the card is handed to the Worker, which keeps it and
 * serves a page for it that says so (see `worker/src/cards.ts`); the post
 * links to that page, and the card is what shows. Where the Worker cannot
 * take it, the post links to the site instead. On a phone, the card itself
 * can also go to any app the phone shares with, X included.
 */

import { LOGO_FRAME, MARK_PATH, logoUrl } from '../components/Mark';
import { WASTED_PATH } from '../components/Wasted';
import type { Cause } from './landingGame';
import { WORKER_API } from './networkingApi';

/** Who a post names, and what it is filed under. Add the airline's own account here once it has one. */
export const SHARE_TAGS = '@solana @pumpdotfun #Solana';
/** Where the site is. */
export const SITE_URL = 'https://seat-airlines.space/';

export const CARD = { width: 1200, height: 630 } as const;
/** Where the aeroplane goes on the card, 0–1: the middle of the right-hand side, clear of the words. */
const FOCUS = { x: 0.76, y: 0.5 } as const;

export interface SharedFlight {
  score: number;
  /** A new best, on this device. */
  best: boolean;
  /** Seconds in the air after the first engine went; null if it never did. */
  survived: number | null;
  /** Kilometres flown, for a flight that met the ground with both engines. */
  km: string;
  /** What took the first engine, and which it was (1 port, 2 starboard). */
  cause: Cause | null;
  engine: 1 | 2 | null;
  /** The other engine went as well, and what took it. */
  both: boolean;
  secondCause: Cause | null;
  /** The height the first engine went at, feet. */
  feet: number | null;
  /** A UFO took a wing. */
  ufo: boolean;
}

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = 'Montserrat, ui-sans-serif, system-ui, sans-serif';
/** The departure board's type. */
const FLAP = "'PT Sans Narrow', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";
const INK = 'rgba(3, 6, 16, 1)';
const CYAN = '#7FE3F7';

const fmt = (n: number) => n.toLocaleString('en-US');

/** The line that says what happened, for the card and for the post. */
export function whatHappened(f: SharedFlight): string {
  const s = Math.round(f.survived ?? 0);
  const ufo = f.ufo ? 'A UFO took a wing · ' : '';
  if (!f.cause) return `${ufo}Flew ${f.km} km, into the ground`;
  if (f.ufo) return `${ufo}${f.both ? 'then both engines' : `then ENG ${f.engine}`} · ${s} s in the air`;
  if (f.both) return `Lost both engines · ${s} s in the air`;
  const at = f.feet ? ` at ${fmt(f.feet)} ft` : '';
  return f.cause === 'lightning'
    ? `Lightning took ENG ${f.engine}${at} · ${s} s on one engine`
    : `ENG ${f.engine} blew${at} · ${s} s on one engine`;
}

/** The post: what happened, the score, the dare, and the tags. The link goes on after it. */
export function shareText(f: SharedFlight): string {
  const s = Math.round(f.survived ?? 0);
  const at = f.feet ? ` at ${fmt(f.feet)} ft` : '';
  let line: string;
  if (f.ufo) line = `👽 A UFO took my wing off${f.cause ? ` — then ${f.both ? 'both engines went' : `ENG ${f.engine} went`}` : ''}. Kept her in the air ${s}s.`;
  else if (!f.cause) line = `Flew it straight into the ground.`;
  else if (f.both) {
    line = `${f.cause === 'lightning' || f.secondCause === 'lightning' ? '⚡🔥' : '🔥🔥'} Lost BOTH engines and kept her in the air ${s}s.`;
  } else if (f.cause === 'lightning') line = `⚡ Lightning hit ENG ${f.engine}${at}. Kept her in the air ${s}s.`;
  else line = `🔥 ENG ${f.engine} blew${at}. Kept her in the air ${s}s.`;
  return `${line}\n\n${fmt(f.score)} points on Seat Airlines ✈️ Can you beat it?\n\n${SHARE_TAGS}`;
}

/** A post to X, ready to send: the text, and the link its card comes from. */
export const intentUrl = (text: string, link: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Text with its letters spread, on browsers that can; plain elsewhere. */
function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** A rounded pill. */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The airline's pattern (public/seat-airlines-mark-pattern.svg, as the site
 * lays it): the mark at 28% of a tile, in two layers half a tile apart, at
 * about the site's strength, and faded out from the left third to the
 * middle, so it is texture behind the words and never on the aeroplane.
 *
 * Made once — the tiles, a tile's-width larger than the card, and the mask
 * that fades them — so a video can slide the tiles under the mask every
 * frame the way the site's pattern drifts. Half a tile along both axes puts
 * the two staggered layers exactly on each other, so a drift of that much
 * over a loop has no seam.
 */
export interface PatternLayers {
  tiles: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  tile: number;
}

const PATTERN_ALPHA = 0.09;

function patternLayers(W: number, H: number): PatternLayers | null {
  const tile = 220;
  const make = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const tiles = make(W + tile, H + tile);
  const mask = make(W, H);
  const scratch = make(W, H);
  const t = tiles.getContext('2d');
  const m = mask.getContext('2d');
  if (!t || !m) return null;
  const mark = new Path2D(MARK_PATH);
  t.fillStyle = '#fff';
  for (const offset of [0, tile / 2]) {
    for (let y = offset - tile; y < H + tile; y += tile) {
      for (let x = offset - tile; x < W + tile; x += tile) {
        t.save();
        t.translate(x, y);
        t.scale(tile / 1536, tile / 1536);
        t.translate(555, 558);
        t.scale(0.28, 0.28);
        t.fill(mark, 'evenodd');
        t.restore();
      }
    }
  }
  const fade = m.createLinearGradient(0, 0, W * 0.6, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = fade;
  m.fillRect(0, 0, W, H);
  return { tiles, mask, scratch, tile };
}

/** The pattern, `drift` of the way (0–1) through one seamless period of its slide. */
function paintPattern(ctx: CanvasRenderingContext2D, p: PatternLayers, drift: number) {
  const s = p.scratch.getContext('2d');
  if (!s) return;
  const u = (((drift % 1) + 1) % 1) * (p.tile / 2);
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, p.scratch.width, p.scratch.height);
  s.drawImage(p.tiles, -u, -u);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(p.mask, 0, 0);
  ctx.save();
  // Of whatever the card itself is drawn at, so it fades with it.
  ctx.globalAlpha *= PATTERN_ALPHA;
  ctx.drawImage(p.scratch, 0, 0);
  ctx.restore();
}

/** A saucer: the badge's icon for a UFO, in a 24-square. */
const SAUCER = new Path2D('M12 5.5c-2.6 0-4.6 1.9-4.9 4.3C3.9 10.5 1.5 11.9 1.5 13.6c0 2.3 4.7 4.1 10.5 4.1s10.5-1.8 10.5-4.1c0-1.7-2.4-3.1-5.6-3.8-.3-2.4-2.3-4.3-4.9-4.3zM6 13.6a1.1 1.1 0 1 1 0 .1zm5 .9a1.1 1.1 0 1 1 2 0 1.1 1.1 0 1 1-2 0zm6-.9a1.1 1.1 0 1 1 0 .1z');
/** A bolt, and a flame: the badge's icon, in a 24-square. */
const BOLT = new Path2D('M13.5 1.5 4 13.2h6.2L8.8 22.5 20 9.6h-6.4z');
const FLAME = new Path2D('M12 1.8c.9 3.4 4.9 5.6 4.9 10.5a4.9 4.9 0 0 1-9.8 0c0-2 .9-3.4 2-4.5.2 1.7 1 2.8 2.2 3.2-.6-3.4.2-6.3.7-9.2zM12 22.4c-3.9 0-7-2.8-7-6.6 0-1.3.3-2.5 1-3.6.3 3.3 2.9 5.6 6 5.6s5.7-2.3 6-5.6c.7 1.1 1 2.3 1 3.6 0 3.8-3.1 6.6-7 6.6z');

/** A card in its three layers: what is behind the pattern, the pattern, and the type over it. */
export interface CardLayers {
  bg: HTMLCanvasElement;
  pattern: PatternLayers | null;
  type: HTMLCanvasElement;
}

/** Fonts and the logo, loaded once for everything drawn here. */
export async function cardAssets(): Promise<{ logo: HTMLImageElement | null }> {
  const [logo] = await Promise.all([
    loadImage(logoUrl()),
    document.fonts?.load(`800 160px ${SANS}`).catch(() => null),
    document.fonts?.load(`700 36px ${SANS}`).catch(() => null),
    document.fonts?.load(`600 24px ${MONO}`).catch(() => null),
    document.fonts?.load(`700 64px ${FLAP}`).catch(() => null),
  ]);
  return { logo };
}

/**
 * Builds the card. `shot` is the scene's picture of the moment (see
 * LandingScene's SHOT), with where the aeroplane is in it, 0–1, on its
 * dataset; without one the card is drawn on a dusk sky instead.
 */
export async function composeCard(shot: HTMLCanvasElement | null, f: SharedFlight): Promise<CardLayers | null> {
  const W = CARD.width;
  const H = CARD.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { logo } = await cardAssets();

  // Blue-white for a lightning strike; red for fire, and for losing both, whatever took them; green for a UFO.
  const struck = !f.ufo && !f.both && f.cause === 'lightning';
  const glow = struck ? 'rgba(120, 140, 255, 0.55)' : 'rgba(255, 110, 40, 0.5)';

  /* The sky behind everything: dusk, for the edges the picture leaves bare
     and for a card with no picture at all. */
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#081226');
  sky.addColorStop(0.55, '#1b2b55');
  sky.addColorStop(1, struck ? '#2a2f6b' : '#6b3322');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (shot) {
    /* The picture, the aeroplane put in the middle of the right-hand side,
       clear of the words, faded in from the left where the words go. */
    const px = Number(shot.dataset.x ?? 0.5) * shot.width;
    const py = Number(shot.dataset.y ?? 0.55) * shot.height;
    const scale = H / shot.height;
    const dx = FOCUS.x * W - px * scale;
    const dy = FOCUS.y * H - py * scale;
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const l = layer.getContext('2d');
    const sharp = document.createElement('canvas');
    sharp.width = W;
    sharp.height = H;
    const k = sharp.getContext('2d');
    if (l && k) {
      /* Depth: the picture a little out of focus, and the aeroplane in it
         sharp, the focus falling away from it — as a long lens would. */
      l.filter = 'blur(5px)';
      l.drawImage(shot, dx, dy, shot.width * scale, shot.height * scale);
      l.filter = 'none';
      k.drawImage(shot, dx, dy, shot.width * scale, shot.height * scale);
      k.globalCompositeOperation = 'destination-in';
      const focus = k.createRadialGradient(FOCUS.x * W, FOCUS.y * H, W * 0.13, FOCUS.x * W, FOCUS.y * H, W * 0.33);
      focus.addColorStop(0, 'rgba(0,0,0,1)');
      focus.addColorStop(1, 'rgba(0,0,0,0)');
      k.fillStyle = focus;
      k.fillRect(0, 0, W, H);
      l.drawImage(sharp, 0, 0);
      l.globalCompositeOperation = 'destination-in';
      const fade = l.createLinearGradient(Math.max(0, dx), 0, Math.max(0, dx) + 320, 0);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      l.fillStyle = fade;
      l.fillRect(0, 0, W, H);
      ctx.drawImage(layer, 0, 0);
    }
  } else {
    // No picture: the mark, big and faint, where the aeroplane would be.
    ctx.save();
    ctx.globalAlpha = 0.18;
    if (logo) ctx.drawImage(logo, ...LOGO_FRAME.split(' ').map(Number) as [number, number, number, number], 640, 60, 500, 500);
    ctx.restore();
  }

  /* The light the fire, or the bolt, throws, low behind the words; then the
     dark the words sit on, from the left and along the foot. */
  const bloom = ctx.createRadialGradient(FOCUS.x * W, FOCUS.y * H, 0, FOCUS.x * W, FOCUS.y * H, W * 0.5);
  bloom.addColorStop(0, glow.replace(/[\d.]+\)$/, '0.18)'));
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const left = ctx.createLinearGradient(0, 0, W * 0.62, 0);
  left.addColorStop(0, 'rgba(3, 6, 16, 0.95)');
  left.addColorStop(0.62, 'rgba(3, 6, 16, 0.82)');
  left.addColorStop(1, 'rgba(3, 6, 16, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, W, H);
  const foot = ctx.createLinearGradient(0, H * 0.62, 0, H);
  foot.addColorStop(0, 'rgba(3, 6, 16, 0)');
  foot.addColorStop(1, 'rgba(3, 6, 16, 0.8)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, W, H);
  // The corners, darkened: a lens, not a screen.
  const lens = ctx.createRadialGradient(W * 0.6, H * 0.5, H * 0.45, W * 0.6, H * 0.5, W * 0.78);
  lens.addColorStop(0, 'rgba(3, 6, 16, 0)');
  lens.addColorStop(1, 'rgba(3, 6, 16, 0.6)');
  ctx.fillStyle = lens;
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, 140);
  top.addColorStop(0, 'rgba(3, 6, 16, 0.55)');
  top.addColorStop(1, 'rgba(3, 6, 16, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 140);

  const type = document.createElement('canvas');
  type.width = W;
  type.height = H;
  const typeCtx = type.getContext('2d');
  if (!typeCtx) return null;
  ((ctx: CanvasRenderingContext2D) => {
  /* One grid: 64 at the sides, 56 at the top and foot. A header row —
     the wordmark left, what happened right, on one centre line; a footer
     row on the bottom margin — the dare left, WASTED right; and between
     them, in a column 480 wide and centred in the height left, the score.
     Every line is placed by the ink it draws — the top of its capitals and
     its first stroke — not by the box the font reserves. */
  const M = 64;
  const T = 56;
  const B = 56;
  const COL = 480;
  ctx.textBaseline = 'alphabetic';
  const set = (font: string, tracking: number) => {
    ctx.font = font;
    spaced(ctx, tracking);
  };
  const ink = (text: string) => {
    const m = ctx.measureText(text);
    return { left: m.actualBoundingBoxLeft, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent };
  };
  /** Draws `text` with its first stroke at `x` and the top of its capitals at `top`. */
  const write = (text: string, x: number, top: number, cap = capOf()) => {
    ctx.fillText(text, x + ink(text).left, top + cap);
  };
  /** The height of the current font's capitals, as drawn. */
  const capOf = () => ctx.measureText('H').actualBoundingBoxAscent;

  // ── The header: the wordmark as the site sets it, the name's capitals half the mark's height.
  const mark = 52;
  const headMid = T + mark / 2;
  if (logo) {
    const [sx, sy, sw, sh] = LOGO_FRAME.split(' ').map(Number);
    ctx.drawImage(logo, sx, sy, sw, sh, M, T, mark, mark);
  }
  set(`800 ${Math.round(mark * 0.714)}px ${SANS}`, mark * 0.714 * 0.02);
  ctx.fillStyle = '#fff';
  write('SEAT AIRLINES', M + (logo ? mark * 1.32 : 0), headMid - capOf() / 2);

  // What happened, as a badge on the right margin: blue-white for lightning, red for fire.
  if (f.cause || f.ufo) {
    const label = f.ufo ? 'UFO STRIKE' : f.both ? 'BOTH ENGINES OUT' : struck ? 'LIGHTNING STRIKE' : `ENG ${f.engine} FIRE`;
    const h = 40;
    const icon = 20;
    const pad = 16;
    const gap = 10;
    set(`600 17px ${MONO}`, 3);
    const w = pad + icon + gap + ink(label).width + pad;
    const x = W - M - w;
    const y = headMid - h / 2;
    pill(ctx, x, y, w, h);
    ctx.fillStyle = f.ufo ? 'rgba(30, 190, 120, 0.3)' : struck ? 'rgba(96, 118, 255, 0.3)' : 'rgba(255, 64, 44, 0.32)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = f.ufo ? 'rgba(110, 250, 180, 0.85)' : struck ? 'rgba(186, 198, 255, 0.85)' : 'rgba(255, 128, 104, 0.85)';
    ctx.stroke();
    ctx.save();
    ctx.translate(x + pad, headMid - icon / 2);
    ctx.scale(icon / 24, icon / 24);
    ctx.fillStyle = f.ufo ? '#B8FFD9' : struck ? '#E4E9FF' : '#FFB08A';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.fill(f.ufo ? SAUCER : struck ? BOLT : FLAME);
    ctx.restore();
    ctx.fillStyle = '#fff';
    write(label, x + pad + icon + gap, headMid - capOf() / 2);
  }

  // ── The footer: the address's foot on the bottom margin, the dare over it.
  set(`600 18px ${MONO}`, 4);
  const urlCap = capOf();
  const urlTop = H - B - urlCap;
  ctx.fillStyle = CYAN;
  write('SEAT-AIRLINES.SPACE', M, urlTop, urlCap);
  set(`800 34px ${SANS}`, 0);
  const dare = ink('Can you beat it?');
  const dareTop = urlTop - 16 - dare.down - capOf();
  ctx.fillStyle = '#fff';
  write('Can you beat it?', M, dareTop);

  // WASTED, stamped on the right margin, its foot on the bottom one.
  ctx.save();
  const stampW = 250;
  const k = stampW / 2384;
  const stampH = 672 * k;
  ctx.translate(W - M - stampW / 2 - 4, H - B - stampH / 2 + 2);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.translate(-2384 / 2 + 40, -672 / 2 + 40);
  const wasted = new Path2D(WASTED_PATH);
  // Shadows are measured on the canvas, not in the path's own units.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowOffsetY = 4;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 40;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.stroke(wasted);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#C8221E';
  ctx.fill(wasted, 'evenodd');
  ctx.restore();

  // ── The score, centred in the height between the two rows.
  const points = fmt(f.score);
  let size = 150;
  set(`800 ${size}px ${SANS}`, -2);
  while (ink(points).width > COL && size > 80) {
    size -= 4;
    set(`800 ${size}px ${SANS}`, -2);
  }
  const digits = ink(points);
  const lines = whatHappened(f).split(' · ');
  set(`600 21px ${MONO}`, 0.3);
  let lineCap = capOf();
  let lineSize = 21;
  while (lines.some((l) => ink(l).width > COL) && lineSize > 16) {
    lineSize -= 1;
    set(`600 ${lineSize}px ${MONO}`, 0.3);
    lineCap = capOf();
  }
  const lineStep = lineCap + 14;
  set(`600 20px ${MONO}`, 6);
  const labelCap = capOf();
  const block = labelCap + 22 + digits.up + digits.down + 26 + lineCap + lineStep * (lines.length - 1);
  const room = { top: T + mark, bottom: dareTop };
  let y = room.top + (room.bottom - room.top - block) / 2;

  ctx.fillStyle = CYAN;
  write('SCORE', M, y, labelCap);
  if (f.best && f.score > 0) {
    const labelRight = M + ink('SCORE').width;
    const mid = y + labelCap / 2;
    set(`700 14px ${MONO}`, 2.5);
    const bw = ink('NEW BEST').width + 24;
    const bx = labelRight + 16;
    pill(ctx, bx, mid - 13, bw, 26);
    ctx.fillStyle = '#FFC93C';
    ctx.fill();
    ctx.fillStyle = INK;
    write('NEW BEST', bx + 12, mid - capOf() / 2);
  }
  y += labelCap + 22;

  set(`800 ${size}px ${SANS}`, -2);
  const face = ctx.createLinearGradient(0, y, 0, y + digits.up);
  face.addColorStop(0, '#FFFFFF');
  face.addColorStop(1, '#BFE9FF');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = face;
  ctx.fillText(points, M + digits.left, y + digits.up);
  ctx.restore();
  y += digits.up + digits.down + 26;

  set(`600 ${lineSize}px ${MONO}`, 0.3);
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? 'rgba(255, 255, 255, 0.94)' : 'rgba(255, 255, 255, 0.66)';
    write(l, M, y + i * lineStep, lineCap);
  });
  })(typeCtx);

  return { bg: canvas, pattern: patternLayers(W, H), type };
}

/** One frame of the card: the pattern `drift` of the way through its slide. */
export function paintCard(ctx: CanvasRenderingContext2D, card: CardLayers, drift: number): void {
  ctx.drawImage(card.bg, 0, 0);
  if (card.pattern) paintPattern(ctx, card.pattern, drift);
  ctx.drawImage(card.type, 0, 0);
}

/** The card as a picture: the JPEG a link to it shows. */
export async function drawCard(shot: HTMLCanvasElement | null, f: SharedFlight): Promise<Blob | null> {
  const card = await composeCard(shot, f);
  return card ? cardJpeg(card) : null;
}

/** A composed card, flattened to the JPEG. */
export function cardJpeg(card: CardLayers): Promise<Blob | null> {
  const out = document.createElement('canvas');
  out.width = CARD.width;
  out.height = CARD.height;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  paintCard(ctx, card, 0);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}

/**
 * Where a card's own page is served, on the site's own domain: the Worker
 * answers there as well as at its own address (a custom domain on the
 * Worker, see worker/src/cards.ts). A post never links to the Worker's own
 * address — nobody should see that. `VITE_SHARE_ORIGIN` points a fork at
 * its own.
 */
const SHARE_ORIGIN = ((import.meta.env.VITE_SHARE_ORIGIN as string | undefined) || 'https://share.seat-airlines.space')
  .replace(/\/+$/, '');

/**
 * Hands the card to the Worker, which keeps it, and gives back its page on
 * the site's domain: the link a post carries. Null when the domain does not
 * serve cards, or there is no flight the Worker started, or it would not
 * take it.
 */
export async function hostCard(card: Blob, run: string | null): Promise<string | null> {
  if (!SHARE_ORIGIN || !WORKER_API || !run) return null;
  try {
    const res = await fetch(`${WORKER_API}/cards/${encodeURIComponent(run)}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: card,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === 'string' && /^[0-9a-f]{24}$/.test(body.id) ? `${SHARE_ORIGIN}/c/${body.id}` : null;
  } catch {
    return null;
  }
}

/** Whether posts can carry their own card's page, or link to the site. */
export const hostsCards = Boolean(SHARE_ORIGIN && WORKER_API);

/** The card, or the video, as a file with a name worth keeping. */
export const asFile = (blob: Blob): File =>
  new File([blob], blob.type.startsWith('video/') ? 'seat-airlines-flight.mp4' : 'seat-airlines-score.jpg', { type: blob.type });

/**
 * Whether this is a phone that can hand this file to another app — its
 * share sheet, X among them. A desktop's share sheet is no way to post to
 * X, so a desktop is sent to X directly instead.
 */
export function canShareFile(blob: Blob): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches
      && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [asFile(blob)] });
  } catch {
    return false;
  }
}

/** The file, to the share sheet, with the post's words. */
export async function shareFile(blob: Blob, text: string): Promise<'sent' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [asFile(blob)], text: `${text}\n${SITE_URL}` });
    return 'sent';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** The file, saved: for a post that has to have it added by hand. */
export function saveFile(blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = asFile(blob).name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
