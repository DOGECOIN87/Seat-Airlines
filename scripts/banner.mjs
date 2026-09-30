/**
 * The 1500 × 500 banner: the whole aircraft laid on its side, every seat
 * drawn and every one of them empty, with the mark and the name at the
 * centre.
 *
 * Drawn as SVG from the same layout the Wall uses (src/content/cabin.ts):
 * the flight deck, First in rows 1–2 at four across, Business 3–7, Economy
 * 8–15, the Exit Row at 16–17 and Economy again to row 30. The nose is on the
 * left, so looking down on it the port side — seats A, B, C — is at the
 * bottom and the starboard side at the top.
 *
 * Rendered through Chromium so the type is the site's own and the edges are
 * exactly what a browser draws:
 *
 *   node scripts/banner.mjs            # writes banner/ next to this repo's root
 *
 * Out come banner.png (1500 × 500), banner@2x.png (3000 × 1000) and
 * banner.svg, the source of both.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'banner');
const W = 1500;
const H = 500;
const CY = H / 2;

/* ── The brand ─────────────────────────────────────────────────────────── */
const NAVY = '#002663';
const INK = '#1B2233';
const FACE = '#E8E9ED';
const LINE = 'rgba(163,167,180,0.55)';
const MONO = "'IBM Plex Mono', 'DejaVu Sans Mono', monospace";
const SANS = "Montserrat, 'DejaVu Sans', sans-serif";

/* Each cabin's tint, the same one its header wears on the Wall. */
const TINT = {
  deck: ['#FFD6E7', '#FFF2F7'],
  first: ['#FFE1EF', '#FFF5FA'],
  business: ['#E2DCFF', '#F6F3FF'],
  exit: ['#D3F7FA', '#EFFBFE'],
  economy: ['#DBF7F9', '#F3FCFD'],
};
const LABEL = { deck: 'FLIGHT DECK', first: 'FIRST', business: 'BUSINESS', exit: 'EXIT ROW', economy: 'ECONOMY' };

/* ── The cabin, front to back ──────────────────────────────────────────── */
const SIX = { top: ['F', 'E', 'D'], bottom: ['C', 'B', 'A'] };
const FOUR = { top: ['F', 'E'], bottom: ['B', 'A'] };
const zoneOf = (n) => (n <= 2 ? 'first' : n <= 7 ? 'business' : n === 16 || n === 17 ? 'exit' : 'economy');

/* Where each row stands along the fuselage. The pitch is the cabin's: the
   suites up front are deep, the exit rows have their legroom, and the rest
   of the aeroplane is packed at the pitch of an aeroplane. */
const rows = [];
let x = 272;
for (let n = 1; n <= 30; n++) {
  const zone = zoneOf(n);
  if (n > 1) {
    const prev = zoneOf(n - 1);
    x += prev === 'first' ? 50 : prev === 'business' ? 37 : prev === 'exit' ? 44 : 33.5;
    if (zone !== prev) x += 12; // a bulkhead between cabins
  }
  rows.push({ n, zone, x, size: zone === 'first' ? 33 : 26 });
}
const lastX = rows[rows.length - 1].x;

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** One empty seat, seen from above, facing the nose: the back is on the right. */
function seat(cx, cy, s, id, zone) {
  const exit = zone === 'exit';
  const fill = exit ? 'url(#seat-exit)' : 'url(#seat-open)';
  const stroke = exit ? 'rgba(0,168,209,0.45)' : 'rgba(163,167,180,0.55)';
  const r = s * 0.24;
  const x0 = cx - s / 2;
  const y0 = cy - s / 2;
  const fs = s >= 30 ? 9.5 : id.length > 2 ? 7.6 : 8.4;
  return `
    <g>
      <rect x="${x0 + 0.6}" y="${y0 + 1.4}" width="${s}" height="${s}" rx="${r}" fill="rgba(20,30,60,0.10)"/>
      <rect x="${x0}" y="${y0}" width="${s}" height="${s}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>
      <rect x="${x0 + s - s * 0.2}" y="${y0 + s * 0.16}" width="${s * 0.1}" height="${s * 0.68}" rx="${s * 0.05}" fill="${exit ? 'rgba(0,135,170,0.28)' : 'rgba(120,126,142,0.32)'}"/>
      <text x="${cx - s * 0.06}" y="${cy + fs * 0.36}" text-anchor="middle" font-family="${MONO}" font-size="${fs}" font-weight="500" fill="${exit ? '#2C8FA3' : '#8A90A0'}" letter-spacing="0.2">${id}</text>
    </g>`;
}

/** A row: its seats across the aircraft, and its number above and below. */
function row({ n, x: cx, size, zone }) {
  const layout = zone === 'first' ? FOUR : SIX;
  const gap = 4;
  const aisle = zone === 'first' ? 30 : 24;
  const sideH = layout.top.length * size + (layout.top.length - 1) * gap;
  const out = [];
  layout.top.forEach((c, i) => {
    const cy = CY - aisle / 2 - sideH + size / 2 + i * (size + gap);
    out.push(seat(cx, cy, size, `${n}${c}`, zone));
  });
  layout.bottom.forEach((c, i) => {
    const cy = CY + aisle / 2 + size / 2 + i * (size + gap);
    out.push(seat(cx, cy, size, `${n}${c}`, zone));
  });
  const edge = CY - aisle / 2 - sideH;
  out.push(`<text x="${cx}" y="${edge - 9}" text-anchor="middle" font-family="${MONO}" font-size="8.5" fill="#9AA0AE">${n}</text>`);
  out.push(`<text x="${cx}" y="${CY + (CY - edge) + 16}" text-anchor="middle" font-family="${MONO}" font-size="8.5" fill="#9AA0AE">${n}</text>`);
  return out.join('');
}

/* The fuselage outline: a rounded nose on the left, the tail cone on the
   right, and a straight barrel between them. */
const TOP = 104;
const BOT = H - 104;
const NOSE = 36;
const BARREL0 = 196;
const BARREL1 = lastX + 60;
const TAIL = W - 6;
const fuselage = `
  M ${NOSE} ${CY}
  C ${NOSE} ${CY - 70}, ${BARREL0 - 110} ${TOP}, ${BARREL0} ${TOP}
  L ${BARREL1} ${TOP}
  C ${BARREL1 + 70} ${TOP}, ${TAIL - 40} ${CY - 34}, ${TAIL} ${CY - 12}
  L ${TAIL} ${CY + 12}
  C ${TAIL - 40} ${CY + 34}, ${BARREL1 + 70} ${BOT}, ${BARREL1} ${BOT}
  L ${BARREL0} ${BOT}
  C ${BARREL0 - 110} ${BOT}, ${NOSE} ${CY + 70}, ${NOSE} ${CY} Z`;

/* Wings and tailplane, under the fuselage, swept back and running off the
   edges of the banner. The wing box sits under rows 12–19. */
const wingRoot0 = rows[11].x - 20;
const wingRoot1 = rows[19].x + 10;
const wing = (dir) => {
  const rootY = dir < 0 ? TOP + 6 : BOT - 6;
  const tipY = dir < 0 ? -40 : H + 40;
  return `M ${wingRoot0} ${rootY} L ${wingRoot0 + 330} ${tipY} L ${wingRoot0 + 400} ${tipY} L ${wingRoot1} ${rootY} Z`;
};
const tailRoot = BARREL1 - 10;
const stab = (dir) => {
  const rootY = dir < 0 ? CY - 90 : CY + 90;
  const tipY = dir < 0 ? CY - 205 : CY + 205;
  return `M ${tailRoot} ${rootY} L ${tailRoot + 105} ${tipY} L ${tailRoot + 145} ${tipY} L ${tailRoot + 118} ${rootY} Z`;
};
/* An engine hung under each wing, a third of the way out. */
const engine = (dir) => {
  const ey = dir < 0 ? CY - 176 : CY + 176;
  const ex = wingRoot0 + 58;
  return `
    <rect x="${ex - 70}" y="${ey - 19}" width="118" height="38" rx="19" fill="url(#nacelle)" stroke="rgba(255,255,255,0.10)"/>
    <ellipse cx="${ex - 66}" cy="${ey}" rx="6" ry="15" fill="#2A3346"/>
    <ellipse cx="${ex - 64}" cy="${ey}" rx="3" ry="9" fill="#5B667C"/>`;
};

/* Cabin tints, each running the height of the cabin behind its rows. */
const bands = [];
const zoneSpan = (zone) => {
  const rs = rows.filter((r) => r.zone === zone);
  return [rs[0].x - rs[0].size / 2 - 11, rs[rs.length - 1].x + rs[rs.length - 1].size / 2 + 11];
};
const spans = [
  ['deck', [BARREL0 - 52, rows[0].x - 34]],
  ['first', zoneSpan('first')],
  ['business', zoneSpan('business')],
  ['economy', [zoneSpan('economy')[0], rows[14].x + 24]],
  ['exit', zoneSpan('exit')],
  ['economy', [rows[17].x - 24, lastX + 24]],
];
for (const [zone, [a, b]] of spans) {
  bands.push(`<rect x="${a}" y="${TOP + 12}" width="${b - a}" height="${BOT - TOP - 24}" rx="10" fill="url(#tint-${zone})"/>`);
  bands.push(`<text x="${(a + b) / 2}" y="${TOP + 25}" text-anchor="middle" font-family="${MONO}" font-size="7.5" font-weight="600" letter-spacing="2.2" fill="rgba(0,38,99,0.34)">${LABEL[zone]}</text>`);
}

/* Exit doors on both sides at the Exit Row, and the main doors fore and aft. */
const door = (dx, w, color) =>
  `<rect x="${dx - w / 2}" y="${TOP - 2}" width="${w}" height="5" rx="2" fill="${color}"/>` +
  `<rect x="${dx - w / 2}" y="${BOT - 3}" width="${w}" height="5" rx="2" fill="${color}"/>`;

/* The flight deck: two seats and the windshield ahead of them. */
const deckX = BARREL0 - 8;
const deck = [
  seat(deckX, CY - 30, 34, 'FO', 'deck'),
  seat(deckX, CY + 30, 34, 'CPT', 'deck'),
  `<g fill="#14223F" stroke="#3B4A6B" stroke-width="1">
     <path d="M ${NOSE + 40} ${CY - 5} Q ${NOSE + 38} ${CY - 26} ${NOSE + 50} ${CY - 44} L ${NOSE + 72} ${CY - 38} Q ${NOSE + 62} ${CY - 22} ${NOSE + 62} ${CY - 5} Z"/>
     <path d="M ${NOSE + 40} ${CY + 5} Q ${NOSE + 38} ${CY + 26} ${NOSE + 50} ${CY + 44} L ${NOSE + 72} ${CY + 38} Q ${NOSE + 62} ${CY + 22} ${NOSE + 62} ${CY + 5} Z"/>
     <path d="M ${NOSE + 54} ${CY - 50} L ${NOSE + 80} ${CY - 60} L ${NOSE + 90} ${CY - 44} L ${NOSE + 74} ${CY - 39} Z"/>
     <path d="M ${NOSE + 54} ${CY + 50} L ${NOSE + 80} ${CY + 60} L ${NOSE + 90} ${CY + 44} L ${NOSE + 74} ${CY + 39} Z"/>
   </g>`,
  `<path d="M ${NOSE + 43} ${CY - 30} Q ${NOSE + 46} ${CY - 38} ${NOSE + 52} ${CY - 41}" stroke="#FFFFFF" stroke-width="1.5" opacity="0.35" fill="none"/>`,
];

/* Galleys and lavatories: forward, and at the very back past row 30. */
const block = (bx, by, bw, bh) => `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="#D9DBE2" stroke="${LINE}" stroke-width="0.8"/>`;
const service = [
  block(rows[0].x - 30, TOP + 30, 14, 58),
  block(rows[0].x - 30, BOT - 88, 14, 58),
  block(lastX + 30, TOP + 30, 26, 70),
  block(lastX + 30, BOT - 100, 26, 70),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0C1B3A"/>
      <stop offset="1" stop-color="#060E20"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#2A64B0" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#1E4C8C" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#1E4C8C" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="#FFFFFF" opacity="0.06"/>
    </pattern>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7F8FA"/>
      <stop offset="0.5" stop-color="${FACE}"/>
      <stop offset="1" stop-color="#D5D8DF"/>
    </linearGradient>
    <linearGradient id="wing" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8E9BB4"/>
      <stop offset="0.5" stop-color="#6F7E9C"/>
      <stop offset="1" stop-color="#55637F"/>
    </linearGradient>
    <linearGradient id="nacelle" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D9DDE6"/>
      <stop offset="0.5" stop-color="#B4BBCA"/>
      <stop offset="1" stop-color="#8691A6"/>
    </linearGradient>
    <linearGradient id="seat-open" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4F5F8"/>
      <stop offset="1" stop-color="#DCDEE4"/>
    </linearGradient>
    <linearGradient id="seat-exit" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F2FDFE"/>
      <stop offset="1" stop-color="#CDEFF4"/>
    </linearGradient>
    ${Object.entries(TINT).map(([k, [a, b]]) => `
    <linearGradient id="tint-${k}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${b}" stop-opacity="0.55"/>
    </linearGradient>`).join('')}
    <filter id="lift" x="-10%" y="-40%" width="120%" height="180%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000814" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <ellipse cx="${W / 2}" cy="${CY}" rx="${W * 0.72}" ry="${H * 0.95}" fill="url(#glow)"/>

  <g filter="url(#lift)">
    <path d="${wing(-1)}" fill="url(#wing)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <path d="${wing(1)}" fill="url(#wing)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <path d="${stab(-1)}" fill="url(#wing)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <path d="${stab(1)}" fill="url(#wing)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <path d="M ${wingRoot0} ${TOP + 6} L ${wingRoot0 + 330} -40" stroke="#E9EDF4" stroke-width="3" opacity="0.7"/>
    <path d="M ${wingRoot0} ${BOT - 6} L ${wingRoot0 + 330} ${H + 40}" stroke="#E9EDF4" stroke-width="3" opacity="0.7"/>
    ${engine(-1)}${engine(1)}
  </g>

  <path d="${fuselage}" fill="url(#body)" stroke="${LINE}" stroke-width="1.2" filter="url(#lift)"/>
  <path d="M ${BARREL0} ${TOP + 3} L ${BARREL1} ${TOP + 3}" stroke="#FFFFFF" stroke-width="2" opacity="0.8"/>

  ${bands.join('')}
  ${service.join('')}
  ${door(BARREL0 + 26, 22, 'rgba(0,38,99,0.35)')}
  ${door(rows[15].x - 22, 18, '#E0567A')}
  ${door(rows[16].x + 22, 18, '#E0567A')}
  ${door(lastX + 72, 22, 'rgba(0,38,99,0.35)')}
  ${deck.join('')}
  ${rows.map(row).join('')}
</svg>`;

/* ── The page it is rendered in: the aircraft, and the mark over its middle ─ */
const logo = readFileSync(join(ROOT, 'public', 'seat-airlines-logo.svg'), 'utf8')
  .replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const logoUri = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`;

/* The site's own type, embedded rather than linked: a page rendered where
   Google Fonts cannot be reached would otherwise fall back without a word,
   and the banner would ship in DejaVu. Both are under the SIL Open Font
   Licence. */
const font = (family, weight, file) => `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal;
  src: url(data:font/woff2;base64,${readFileSync(join(ROOT, 'scripts', 'banner-fonts', file)).toString('base64')}) format('woff2'); }`;
const fontFaces = [
  font('Montserrat', 800, 'Montserrat-800.woff2'),
  font('IBM Plex Mono', 500, 'IBMPlexMono-500.woff2'),
  font('IBM Plex Mono', 600, 'IBMPlexMono-600.woff2'),
].join('\n');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
${fontFaces}
  html, body { margin: 0; background: #060E20; }
  .banner { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  .banner > svg { display: block; }
  /* Frosted, so the seats under the middle of the aircraft still read
     through it and the cabin runs unbroken from nose to tail. */
  .plate {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    display: flex; align-items: center; gap: 22px;
    padding: 22px 38px 22px 26px;
    border-radius: 999px;
    background: rgba(248, 249, 252, 0.62);
    -webkit-backdrop-filter: blur(7px) saturate(1.15);
    backdrop-filter: blur(7px) saturate(1.15);
    box-shadow: 0 18px 40px rgba(0, 8, 20, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.55);
  }
  .plate img { width: 88px; height: 88px; display: block; filter: drop-shadow(0 3px 6px rgba(0, 38, 99, 0.25)); }
  .plate span {
    font-family: ${SANS}; font-weight: 800; font-size: 62px; line-height: 1;
    letter-spacing: 0.02em; color: ${NAVY}; white-space: nowrap;
  }
</style></head>
<body><div class="banner">${svg}<div class="plate"><img src="${logoUri}" alt=""><span>SEAT AIRLINES</span></div></div></body></html>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'banner.svg'), svg.replace('<defs>', `<defs><style>${fontFaces}</style>`));
writeFileSync(join(OUT, 'banner.html'), html);

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const browser = await playwright.chromium.launch();
for (const [scale, name] of [[1, 'banner.png'], [2, 'banner@2x.png']]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'load' });
  const loaded = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load("800 62px Montserrat", 'SEAT AIRLINES'),
      document.fonts.load("500 9px 'IBM Plex Mono'", '0123456789ABCDEF'),
      document.fonts.load("600 9px 'IBM Plex Mono'", 'ECONOMY'),
    ]);
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`);
  });
  if (loaded.length < 3) throw new Error(`fonts did not load: ${loaded.join(', ') || 'none'}`);
  await page.locator('.banner').screenshot({ path: join(OUT, name) });
  await page.close();
}
await browser.close();
console.log(`wrote ${OUT}/banner.png, banner@2x.png, banner.svg`);
