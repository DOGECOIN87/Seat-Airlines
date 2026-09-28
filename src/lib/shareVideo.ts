/**
 * A flight, shared as a video: the card, and then the airline.
 *
 * Ten and a half seconds that loop without a seam. The card (see
 * shareCard.ts) with the airline's pattern drifting behind the words the
 * way it drifts behind the site; then the departure board from the splash,
 * turning up the line and then the call to board, flap by flap, on the
 * splash's own ground; then the logo and the name; then the card again,
 * where it started.
 *
 * Recorded from a canvas as it plays, as H.264 in MP4, because that is what
 * X takes — and made only where the browser can write it (Chrome from 126,
 * Safari), which covers the phones a video is shared from. Anywhere else
 * there is no video, and the card goes as a picture.
 */

import { LOGO_FRAME } from '../components/Mark';
import { SPLASH_FIRST, SPLASH_LAST } from '../content/cabin';
import { CARD, paintCard, type CardLayers } from './shareCard';

const W = CARD.width;
const H = CARD.height;
const SANS = 'Montserrat, ui-sans-serif, system-ui, sans-serif';
const FLAP = "'PT Sans Narrow', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";

/* ── The timeline, in seconds ──────────────────────────────────────────── */
const FADE = 0.45;
/** The card alone, from the first frame. */
const CARD_UNTIL = 3.4;
/** The board's two phrases start turning at these. */
const TURN_1 = CARD_UNTIL + FADE;
const TURN_2 = TURN_1 + 2.0;
/** The board goes, the logo comes and goes, and the card comes back. */
const BOARD_OUT = TURN_2 + 2.0;
const BRAND_IN = BOARD_OUT + FADE;
const BRAND_OUT = BRAND_IN + FADE + 1.1;
const CARD_BACK = BRAND_OUT + FADE;
export const VIDEO_SECONDS = CARD_BACK + FADE;

/** The splash board's mechanism: the drum, how long a flap takes, how the columns stagger (see SplitFlapBoard). */
const DRUM = ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-/:()%.,!?&$'`;
const FLIP = 0.095;
const STAGGER = 0.035;

/** The format to record in: H.264 in MP4, or null where the browser cannot write it. */
export function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.4D401F', 'video/mp4;codecs=avc1', 'video/mp4;codecs=h264']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  // Safari's MP4 is H.264 whether or not it will say so.
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  return safari && MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : null;
}

/** A seeded shuffle of small numbers, so a cell turns the same way every time the frame is drawn. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ── The board ─────────────────────────────────────────────────────────── */

const ROWS = 2;
const COLS = Math.max(...[SPLASH_FIRST, SPLASH_LAST].flatMap((p) => p.map((l) => l.length)));
const cells = (phrase: readonly string[]) => {
  const out: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    const line = (phrase[r] ?? '').toUpperCase();
    for (let c = 0; c < COLS; c++) out.push(Math.max(0, DRUM.indexOf(line[c] ?? ' ')));
  }
  return out;
};
const BLANKS = new Array<number>(ROWS * COLS).fill(0);
const PHRASE_1 = cells(SPLASH_FIRST);
const PHRASE_2 = cells(SPLASH_LAST);

/** The board's measures, from its width, as the splash's stylesheet makes them. */
const BOARD_W = 760;
const PAD = BOARD_W * 0.02;
const GAP = BOARD_W * 0.0075;
const FLAP_W = (BOARD_W - 2 * PAD - (COLS - 1) * GAP) / COLS;
const FLAP_H = FLAP_W / 0.78;
const ROW_GAP = GAP * 1.6;
const BOARD_H = 2 * PAD + ROWS * FLAP_H + (ROWS - 1) * ROW_GAP;
const FRAME = Math.max(1, FLAP_W * 0.035);
const SPLIT = Math.max(1, FLAP_H * 0.017);
const HALF = (FLAP_H - 2 * FRAME - SPLIT) / 2;
const R = FLAP_W * 0.1;

/**
 * What cell `i` shows at `t`, turning from `from` to `to` starting at
 * `start`: the flap before and after the one falling, and how far it has
 * fallen (0–1), or just the one showing.
 */
function cellAt(i: number, from: number, to: number, start: number, t: number): { prev: number; next: number; p: number } {
  if (from === to) return { prev: to, next: to, p: 0 };
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const delay = col * STAGGER + row * STAGGER * 1.5 + hash(i + to * 31) * 0.07;
  const flips = 3 + Math.floor(hash(i * 7 + to) * 5);
  const rate = FLIP * (0.9 + hash(i * 13 + 5) * 0.2);
  const n = (t - start - delay) / rate;
  if (n < 0) return { prev: from, next: from, p: 0 };
  if (n >= flips) return { prev: to, next: to, p: 0 };
  // The last few flaps before the wanted one, counting up to it.
  const seq = (k: number) => (k === 0 ? from : (to - flips + k + DRUM.length) % DRUM.length);
  const k = Math.floor(n);
  return { prev: seq(k), next: k + 1 >= flips ? to : seq(k + 1), p: n - k };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** One half of a flap, with its half of the letter; `squash` folds it about the hinge, `shade` darkens it. */
function half(
  ctx: CanvasRenderingContext2D, x: number, y: number, which: 'upper' | 'lower', at: number, squash = 1, shade = 0,
) {
  const hinge = y + FRAME + HALF + SPLIT / 2;
  const top = which === 'upper' ? y + FRAME : hinge + SPLIT / 2;
  const left = x + FRAME;
  const w = FLAP_W - 2 * FRAME;
  ctx.save();
  if (squash !== 1) {
    ctx.translate(0, hinge);
    ctx.scale(1, squash);
    ctx.translate(0, -hinge);
  }
  roundRect(ctx, left, top, w, HALF, which === 'upper' ? [R * 0.7, R * 0.7, 0, 0] : [0, 0, R * 0.7, R * 0.7]);
  ctx.clip();
  const paint = ctx.createLinearGradient(0, top, 0, top + HALF);
  if (which === 'upper') {
    paint.addColorStop(0, '#25344C');
    paint.addColorStop(0.45, '#1E2B41');
    paint.addColorStop(1, '#1A2539');
  } else {
    paint.addColorStop(0, '#2B3B56');
    paint.addColorStop(0.4, '#24334C');
    paint.addColorStop(1, '#1E2B42');
  }
  ctx.fillStyle = paint;
  ctx.fillRect(left, top, w, HALF);
  // The rim: a hairline of light along the top of each half.
  ctx.fillStyle = which === 'upper' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(127, 227, 247, 0.12)';
  ctx.fillRect(left, top, w, 1);
  const glyph = DRUM[at];
  if (glyph && glyph !== ' ') {
    ctx.fillStyle = '#F5F8FC';
    ctx.font = `700 ${FLAP_H * 0.92}px ${FLAP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Centred on the whole face, so the two halves of a letter meet across the split.
    ctx.fillText(glyph, x + FLAP_W / 2, y + FLAP_H / 2 + FLAP_H * 0.04);
  }
  if (shade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
    ctx.fillRect(left, top, w, HALF);
  }
  ctx.restore();
}

/** One character cell, at `t` through its turn. */
function flap(ctx: CanvasRenderingContext2D, x: number, y: number, s: { prev: number; next: number; p: number }) {
  roundRect(ctx, x, y, FLAP_W, FLAP_H, R);
  ctx.fillStyle = '#070C15';
  ctx.fill();
  if (s.prev === s.next) {
    half(ctx, x, y, 'upper', s.next);
    half(ctx, x, y, 'lower', s.next);
  } else {
    // Behind the flap: the next letter's top, and the old one's bottom until the leaf covers it.
    half(ctx, x, y, 'upper', s.next);
    half(ctx, x, y, 'lower', s.prev, 1, s.p < 0.5 ? s.p * 0.5 : 0);
    if (s.p < 0.5) half(ctx, x, y, 'upper', s.prev, Math.cos(s.p * Math.PI), s.p * 0.9);
    else half(ctx, x, y, 'lower', s.next, -Math.cos(s.p * Math.PI), (1 - s.p) * 0.9);
  }
  // The hinge pins, at either end of the split.
  const pinW = Math.max(2, FLAP_W * 0.08);
  const pinH = FLAP_H * 0.22;
  const pin = ctx.createLinearGradient(x, 0, x + pinW, 0);
  pin.addColorStop(0, '#03070D');
  pin.addColorStop(0.38, '#3B5876');
  pin.addColorStop(0.62, '#10213A');
  pin.addColorStop(1, '#03070D');
  ctx.fillStyle = pin;
  for (const px of [x, x + FLAP_W - pinW]) {
    roundRect(ctx, px, y + FLAP_H / 2 - pinH / 2, pinW, pinH, Math.max(1, FLAP_W * 0.02));
    ctx.fill();
  }
}

/** The splash's ground: night, lit a little in the middle. */
function ground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#05070F';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.46);
  ctx.scale(1, 36 / 56);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.62);
  glow.addColorStop(0, 'rgba(26, 42, 70, 0.85)');
  glow.addColorStop(0.72, 'rgba(26, 42, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-W, -H * 2, W * 2, H * 4);
  ctx.restore();
}

/** The departure board, at `t` seconds into the video. */
function board(ctx: CanvasRenderingContext2D, t: number) {
  const bx = (W - BOARD_W) / 2;
  const by = H * 0.46 - BOARD_H / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
  ctx.shadowBlur = 64;
  ctx.shadowOffsetY = 26;
  roundRect(ctx, bx, by, BOARD_W, BOARD_H, PAD + FLAP_W * 0.08);
  const housing = ctx.createLinearGradient(0, by, 0, by + BOARD_H);
  housing.addColorStop(0, '#1A2638');
  housing.addColorStop(1, '#111A28');
  ctx.fillStyle = housing;
  ctx.fill();
  ctx.restore();
  // The live edge along the top, clipped to the housing's corners.
  ctx.save();
  roundRect(ctx, bx, by, BOARD_W, BOARD_H, PAD + FLAP_W * 0.08);
  ctx.clip();
  const live = ctx.createLinearGradient(bx, by, bx + BOARD_W * 0.3, by + BOARD_W * 0.6);
  live.addColorStop(0, '#00C9F1');
  live.addColorStop(1, '#0087EA');
  ctx.fillStyle = live;
  ctx.fillRect(bx, by, BOARD_W, Math.max(2, PAD * 0.2));
  ctx.restore();

  for (let i = 0; i < ROWS * COLS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = bx + PAD + col * (FLAP_W + GAP);
    const y = by + PAD + row * (FLAP_H + ROW_GAP);
    const s = t < TURN_2 ? cellAt(i, BLANKS[i], PHRASE_1[i], TURN_1, t) : cellAt(i, PHRASE_1[i], PHRASE_2[i], TURN_2, t);
    flap(ctx, x, y, s);
  }
}

/** The logo and the name, as the site sets them, centred. */
function brand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  const mark = 104;
  ctx.font = `800 ${Math.round(mark * 0.714)}px ${SANS}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${mark * 0.714 * 0.02}px`;
  const name = ctx.measureText('SEAT AIRLINES');
  const nameW = name.actualBoundingBoxLeft + name.actualBoundingBoxRight;
  const gap = logo ? mark * 0.32 : 0;
  const total = (logo ? mark : 0) + gap + nameW;
  const x = (W - total) / 2;
  const mid = H * 0.48;
  if (logo) {
    const [sx, sy, sw, sh] = LOGO_FRAME.split(' ').map(Number);
    ctx.drawImage(logo, sx, sy, sw, sh, x, mid - mark / 2, mark, mark);
  }
  const cap = ctx.measureText('H').actualBoundingBoxAscent;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('SEAT AIRLINES', x + (logo ? mark + gap : 0) + name.actualBoundingBoxLeft, mid + cap / 2);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** Frame `t` of the video. */
export function paintVideoFrame(ctx: CanvasRenderingContext2D, card: CardLayers, logo: HTMLImageElement | null, t: number): void {
  // The pattern slides one seamless period over the whole loop, so the last frame is the first.
  const drift = t / VIDEO_SECONDS;
  const cardIn = t < CARD_UNTIL ? 1 : t < CARD_UNTIL + FADE ? 1 - ease((t - CARD_UNTIL) / FADE) : ease((t - CARD_BACK) / FADE);
  const boardIn = t < CARD_UNTIL || t > BOARD_OUT + FADE ? 0 : Math.min(ease((t - CARD_UNTIL) / FADE), 1 - ease((t - BOARD_OUT) / FADE));
  const brandIn = t < BRAND_IN || t > BRAND_OUT + FADE ? 0 : Math.min(ease((t - BRAND_IN) / FADE), 1 - ease((t - BRAND_OUT) / FADE));

  ctx.globalAlpha = 1;
  if (cardIn >= 1) {
    paintCard(ctx, card, drift);
    return;
  }
  ground(ctx);
  if (boardIn > 0) {
    ctx.globalAlpha = boardIn;
    board(ctx, t);
  }
  if (brandIn > 0) {
    ctx.globalAlpha = brandIn;
    brand(ctx, logo);
  }
  if (cardIn > 0) {
    ctx.globalAlpha = cardIn;
    paintCard(ctx, card, drift);
  }
  ctx.globalAlpha = 1;
}

/**
 * Records the video, in real time, and resolves with it — or null where it
 * cannot be made, or if it was stopped. `progress` hears how far it has got.
 */
export async function recordVideo(
  card: CardLayers,
  logo: HTMLImageElement | null,
  { signal, progress }: { signal?: AbortSignal; progress?: (share: number) => void } = {},
): Promise<Blob | null> {
  const type = videoType();
  if (!type) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // In the page, out of sight: some browsers only capture a canvas they are drawing.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return null;
  }
  paintVideoFrame(ctx, card, logo, 0);
  const stream = canvas.captureStream(30);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  } catch {
    canvas.remove();
    return null;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(500);
  const began = performance.now();
  const finished = await new Promise<boolean>((resolve) => {
    const tick = () => {
      if (signal?.aborted || document.visibilityState === 'hidden') {
        resolve(false);
        return;
      }
      const t = (performance.now() - began) / 1000;
      paintVideoFrame(ctx, card, logo, Math.min(t, VIDEO_SECONDS));
      progress?.(Math.min(1, t / VIDEO_SECONDS));
      if (t >= VIDEO_SECONDS + 0.1) resolve(true);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  canvas.remove();
  if (!finished || !chunks.length) return null;
  return new Blob(chunks, { type: type.split(';')[0] });
}
