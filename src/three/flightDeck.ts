import * as THREE from 'three';
import type { Attitude } from '../lib/useAttitude';
import type { Annunciators } from '../lib/flightModel';
import { formatCap, formatChange, formatFeet, formatFeetShort, formatVerticalSpeed, phaseFor } from '../lib/flightModel';

/**
 * The flight deck, as geometry.
 *
 * It used to be a drawing: a windshield with the sky painted into it and a
 * panel of flat rectangles under it, the same picture wherever the viewer
 * looked. It is built now, inside the same aeroplane and the same world as
 * the cabin, so the windshield is simply a hole in the nose and what is
 * outside it is what is outside: the real sky, the real ground, the weather
 * and the time of day, banking over as the aeroplane banks.
 *
 * Seen from the captain's seat: the glareshield and the mode control panel
 * along its edge, the main panel with both pilots' primary flight and
 * navigation displays and the engine display between them, the overhead
 * panel with the cabin signs lit off the real annunciators, the pedestal and
 * its throttles, both control columns turning with the bank, and the first
 * officer's seat across the aisle. Every screen is drawn live from the same
 * numbers the drawing used: the 5m change sets the pitch, its derivative the
 * bank, market cap is the altitude.
 *
 * Built around the captain's eye at the origin, in the aircraft's frame:
 * +x right, +y up, -z forward. `WorldScene` puts the group where the eye is.
 */

/** The centreline of the aeroplane, from the captain's eye. */
const C = 0.52;
const FLOOR = -1.2;
const DEG = Math.PI / 180;

export interface DeckReadout {
  marketCap: number;
  change5m: number;
  holders: number;
  lamps: Annunciators;
}

export interface FlightDeckHandles {
  group: THREE.Group;
  /** Looking a little down from level, so the panel and the sky share the frame. */
  restPitch: number;
  setReadout: (r: DeckReadout) => void;
  /** One frame. `night` runs 0 by day to 1 after dark, and brings up the panel lights. */
  update: (a: Attitude, nowMs: number, night: number) => void;
  dispose: () => void;
}

/* ────────────────────────────────────────────────────────────────────────
   The glass: each screen is a canvas, redrawn a dozen times a second
   ──────────────────────────────────────────────────────────────────────── */

const CYAN = '#3FD8E8';
const AMBER = '#FFB300';
const MAGENTA = '#FF57C8';
const GREEN = '#5BE86B';
const RED = '#FF4438';
const WHITE = '#E8EDF5';
const MONO = "600 {s}px 'IBM Plex Mono', 'JetBrains Mono', monospace";
const font = (s: number) => MONO.replace('{s}', String(s));

function screen(size = 320) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g, tex };
}

/** The primary flight display: attitude, speed and altitude tapes, heading. */
function drawPfd(g: CanvasRenderingContext2D, a: Attitude) {
  const S = 320;
  g.fillStyle = '#05070C';
  g.fillRect(0, 0, S, S);
  const cx = 160;
  const cy = 142;
  const k = 4.6; // px per degree of pitch
  const over = a.bank + a.roll;

  // The attitude indicator, clipped to its window.
  g.save();
  g.beginPath();
  g.rect(62, 38, 196, 204);
  g.clip();
  g.translate(cx, cy);
  g.rotate(over * DEG);
  g.translate(0, a.pitch * k);
  g.fillStyle = '#2E7FD8';
  g.fillRect(-400, -600, 800, 600);
  g.fillStyle = '#8A5A2B';
  g.fillRect(-400, 0, 800, 600);
  g.strokeStyle = WHITE;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-400, 0); g.lineTo(400, 0); g.stroke();
  g.fillStyle = WHITE;
  g.font = font(10);
  g.textAlign = 'right';
  for (let p = -30; p <= 30; p += 5) {
    if (p === 0) continue;
    const y = -p * k;
    const w = p % 10 === 0 ? 34 : 16;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
    if (p % 10 === 0) {
      g.fillText(String(Math.abs(p)), -w - 4, y + 4);
      g.textAlign = 'left';
      g.fillText(String(Math.abs(p)), w + 4, y + 4);
      g.textAlign = 'right';
    }
  }
  g.restore();

  // Bank scale and pointer.
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = WHITE;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 92, -Math.PI / 2 - 60 * DEG, -Math.PI / 2 + 60 * DEG); g.stroke();
  for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const r0 = 92;
    const r1 = d % 30 === 0 ? 102 : 97;
    const ang = -Math.PI / 2 + d * DEG;
    g.beginPath(); g.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0); g.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1); g.stroke();
  }
  g.rotate(over * DEG);
  g.fillStyle = MAGENTA;
  g.beginPath(); g.moveTo(0, -90); g.lineTo(-6, -80); g.lineTo(6, -80); g.fill();
  g.restore();

  // The aircraft symbol, fixed.
  g.strokeStyle = '#111';
  g.fillStyle = AMBER;
  g.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + side * 22, cy); g.lineTo(cx + side * 60, cy); g.lineTo(cx + side * 60, cy + 6); g.lineTo(cx + side * 28, cy + 6); g.lineTo(cx + side * 28, cy + 14); g.lineTo(cx + side * 22, cy + 14);
    g.closePath(); g.fill(); g.stroke();
  }
  g.fillRect(cx - 4, cy - 4, 8, 8);

  // Speed and altitude tapes.
  const tape = (x: number, w: number, value: number, step: number, label: (n: number) => string) => {
    g.fillStyle = 'rgba(40,46,58,0.92)';
    g.fillRect(x, 38, w, 204);
    g.save();
    g.beginPath(); g.rect(x, 38, w, 204); g.clip();
    g.fillStyle = WHITE;
    g.strokeStyle = WHITE;
    g.font = font(11);
    g.textAlign = 'center';
    const px = 34 / step;
    const base = Math.floor(value / step) * step;
    for (let n = base - step * 4; n <= base + step * 4; n += step) {
      const y = cy - (n - value) * px;
      g.beginPath(); g.moveTo(x + (x < cx ? w - 8 : 0), y); g.lineTo(x + (x < cx ? w : 8), y); g.stroke();
      if (n >= 0) g.fillText(label(n), x + w / 2 + (x < cx ? -4 : 4), y + 4);
    }
    g.restore();
    // The readout box.
    g.fillStyle = '#000';
    g.strokeStyle = WHITE;
    g.lineWidth = 1.5;
    g.fillRect(x - 2, cy - 12, w + 4, 24);
    g.strokeRect(x - 2, cy - 12, w + 4, 24);
    g.fillStyle = WHITE;
    g.font = font(13);
    g.fillText(label(Math.round(value)), x + w / 2, cy + 5);
  };
  tape(10, 48, a.speed, 10, (n) => String(n));
  const altStep = Math.max(100, 10 ** Math.floor(Math.log10(Math.max(1000, a.alt))) / 20);
  tape(262, 50, a.alt, altStep, (n) => formatFeetShort(n));

  // Heading, bottom.
  g.fillStyle = '#000';
  g.strokeStyle = WHITE;
  g.fillRect(126, 262, 68, 26);
  g.strokeRect(126, 262, 68, 26);
  g.fillStyle = WHITE;
  g.font = font(15);
  g.textAlign = 'center';
  g.fillText(String(Math.round(a.heading)).padStart(3, '0'), 160, 281);

  // Top line: mode annunciations and the vertical speed.
  g.font = font(11);
  g.fillStyle = GREEN;
  g.fillText('SPD', 94, 24);
  g.fillText('HDG SEL', 160, 24);
  g.fillText('ALT', 226, 24);
  g.fillStyle = WHITE;
  g.textAlign = 'right';
  g.fillText(formatVerticalSpeed(a.vs), 312, 306);
  g.textAlign = 'left';
  g.fillStyle = CYAN;
  g.fillText(`${Math.round(a.speed)} KT`, 10, 306);
}

/** The navigation display: a compass arc turning under the aeroplane. */
function drawNd(g: CanvasRenderingContext2D, a: Attitude, r: DeckReadout | null) {
  const S = 320;
  g.fillStyle = '#05070C';
  g.fillRect(0, 0, S, S);
  const cx = 160;
  const cy = 262;
  const R = 200;
  g.save();
  g.beginPath(); g.rect(0, 30, S, S - 30); g.clip();
  g.translate(cx, cy);
  g.rotate(-a.heading * DEG);
  g.strokeStyle = WHITE;
  g.fillStyle = WHITE;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
  g.font = font(12);
  g.textAlign = 'center';
  for (let d = 0; d < 360; d += 5) {
    const ang = d * DEG;
    const r1 = d % 10 === 0 ? R - 12 : R - 6;
    g.beginPath(); g.moveTo(Math.sin(ang) * R, -Math.cos(ang) * R); g.lineTo(Math.sin(ang) * r1, -Math.cos(ang) * r1); g.stroke();
    if (d % 30 === 0) {
      g.save();
      g.rotate(ang);
      g.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, -R + 26);
      g.restore();
    }
  }
  // Range rings.
  g.strokeStyle = 'rgba(232,237,245,0.35)';
  g.setLineDash([4, 6]);
  g.beginPath(); g.arc(0, 0, R / 2, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.restore();

  // The route: a magenta line straight ahead, the way the flight is going.
  g.strokeStyle = MAGENTA;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin((a.bank * 0.4) * DEG) * 180, cy - 180); g.stroke();
  g.fillStyle = MAGENTA;
  g.font = font(11);
  g.textAlign = 'left';
  g.fillText('MARS', cx + 8, cy - 170);

  // The aeroplane.
  g.strokeStyle = WHITE;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx, cy + 12); g.moveTo(cx - 12, cy - 2); g.lineTo(cx + 12, cy - 2); g.moveTo(cx - 6, cy + 10); g.lineTo(cx + 6, cy + 10); g.stroke();

  // Heading box and data in the corners.
  g.fillStyle = '#000';
  g.fillRect(132, 4, 56, 24);
  g.strokeStyle = WHITE;
  g.strokeRect(132, 4, 56, 24);
  g.fillStyle = WHITE;
  g.font = font(15);
  g.textAlign = 'center';
  g.fillText(String(Math.round(a.heading)).padStart(3, '0'), 160, 22);
  g.font = font(11);
  g.textAlign = 'left';
  g.fillStyle = WHITE;
  g.fillText(`GS ${Math.round(a.speed * 1.08)}`, 8, 20);
  g.fillStyle = CYAN;
  g.fillText('SA350 · NONSTOP', 8, 310);
  g.textAlign = 'right';
  g.fillStyle = WHITE;
  g.fillText(`SOULS ${r ? r.holders.toLocaleString('en-US') : '—'}`, 312, 20);
}

/** The engine display: N1 dials off the airspeed, and the market. */
function drawEicas(g: CanvasRenderingContext2D, a: Attitude, r: DeckReadout | null) {
  const S = 320;
  g.fillStyle = '#05070C';
  g.fillRect(0, 0, S, S);
  const n1 = Math.min(104, Math.max(22, 60 + (a.speed - 250) / 6));
  for (const [i, x] of [[0, 92], [1, 228]] as const) {
    const cy = 78;
    g.strokeStyle = 'rgba(232,237,245,0.55)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, cy, 44, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    g.strokeStyle = n1 > 100 ? RED : WHITE;
    g.lineWidth = 6;
    g.beginPath(); g.arc(x, cy, 44, Math.PI * 0.75, Math.PI * 0.75 + (n1 / 110) * Math.PI * 1.5); g.stroke();
    g.fillStyle = WHITE;
    g.font = font(15);
    g.textAlign = 'center';
    g.fillText((n1 + i * 0.3).toFixed(1), x, cy + 6);
    g.font = font(10);
    g.fillStyle = CYAN;
    g.fillText('N1', x, cy + 62);
  }
  g.textAlign = 'left';
  g.font = font(11);
  g.fillStyle = CYAN;
  g.fillText('MKT CAP', 16, 180);
  g.fillText('5M', 16, 214);
  g.fillText('PHASE', 16, 248);
  g.font = font(18);
  g.fillStyle = WHITE;
  g.textAlign = 'right';
  g.fillText(r ? formatCap(r.marketCap) : '—', 304, 182);
  g.fillStyle = r && r.change5m < 0 ? RED : GREEN;
  g.fillText(r ? formatChange(r.change5m) : '—', 304, 216);
  g.fillStyle = WHITE;
  g.font = font(13);
  g.fillText(r ? phaseFor(r.change5m).toUpperCase() : '—', 304, 250);
  g.font = font(11);
  g.fillStyle = AMBER;
  g.textAlign = 'left';
  const lit = r ? [r.lamps.seatbelt && 'SEAT BELT', r.lamps.oxygen && 'OXYGEN', r.lamps.brace && 'BRACE'].filter(Boolean) : [];
  g.fillText(lit.length ? lit.join(' · ') : 'NO MESSAGES', 16, 292);
  g.fillStyle = WHITE;
  g.textAlign = 'right';
  g.fillText(`ALT ${formatFeet(a.alt)}`, 304, 312);
}

/** The mode control panel on the glareshield: speed, heading and altitude windows. */
function drawMcp(g: CanvasRenderingContext2D, a: Attitude) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  g.fillStyle = '#2B3038';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(0, 0, W, 8);
  const windows: [string, string, number][] = [
    ['IAS/MACH', String(Math.round(a.speed)), 120],
    ['HEADING', String(Math.round(a.heading)).padStart(3, '0'), 400],
    ['ALTITUDE', formatFeet(a.alt).replace(/\s*ft$/i, ''), 700],
    ['V/S', formatVerticalSpeed(a.vs), 930],
  ];
  for (const [label, value, x] of windows) {
    g.fillStyle = '#9AA3B2';
    g.font = font(15);
    g.textAlign = 'center';
    g.fillText(label, x, 32);
    g.fillStyle = '#0A0C10';
    g.fillRect(x - 80, 42, 160, 44);
    g.fillStyle = AMBER;
    g.font = font(30);
    g.fillText(value, x, 76);
    // A knob beside each window.
    g.fillStyle = '#15181D';
    g.beginPath(); g.arc(x + 108, 64, 18, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4A505B';
    g.lineWidth = 2;
    g.stroke();
  }
}

/** The overhead panel: rows of switches, and the four cabin signs. */
function drawOverhead(g: CanvasRenderingContext2D, lamps: Annunciators | null) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  g.fillStyle = '#3A4049';
  g.fillRect(0, 0, W, H);
  // Panel modules.
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 3;
  for (let x = 0; x < W; x += 170) g.strokeRect(x + 4, 4, 162, H - 8);
  // Switches, in rows, with their guards and legends.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 24; col++) {
      const x = 22 + col * 42;
      const y = 150 + row * 64;
      g.fillStyle = '#1E2228';
      g.fillRect(x - 8, y - 14, 16, 28);
      g.fillStyle = '#C9CED8';
      const up = rand() > 0.45;
      g.fillRect(x - 3, up ? y - 12 : y, 6, 12);
      g.fillStyle = 'rgba(210,215,225,0.55)';
      g.fillRect(x - 12, y + 20, 24, 3);
    }
  }
  // The cabin signs, lit off the real annunciators.
  const signs: [string, boolean, string][] = [
    ['FASTEN SEAT BELT', lamps?.seatbelt ?? false, AMBER],
    ['BEVERAGE SERVICE', lamps?.service ?? false, CYAN],
    ['OXYGEN', lamps?.oxygen ?? false, AMBER],
    ['BRACE', lamps?.brace ?? false, RED],
  ];
  signs.forEach(([label, on, colour], i) => {
    const x = 40 + i * 250;
    g.fillStyle = on ? colour : '#14171C';
    g.globalAlpha = on ? 0.95 : 1;
    g.fillRect(x, 30, 210, 76);
    g.globalAlpha = 1;
    g.strokeStyle = on ? colour : '#4A505B';
    g.lineWidth = 3;
    g.strokeRect(x, 30, 210, 76);
    g.fillStyle = on ? '#0A0C10' : '#5A606B';
    g.font = font(19);
    g.textAlign = 'center';
    g.fillText(label, x + 105, 76);
  });
}

/* ────────────────────────────────────────────────────────────────────────
   Surfaces
   ──────────────────────────────────────────────────────────────────────── */

function speckle(base: string, size = 128, amount = 0.06): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size * 0.25; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * amount})`;
    g.fillRect(rand() * size, rand() * size, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ────────────────────────────────────────────────────────────────────────
   Panels: the switchgear, drawn once
   ──────────────────────────────────────────────────────────────────────── */

const LEGENDS = ['APU', 'BLEED', 'PACK', 'FUEL', 'HYD', 'ELEC', 'GEN', 'BUS', 'XFEED', 'IGN', 'ENG', 'ANTI-ICE', 'WINDOW', 'PROBE', 'EMER', 'LTS', 'TAXI', 'LAND', 'STROBE', 'BEACON', 'NAV', 'LOGO', 'WING', 'PRESS', 'ALT', 'TRIM', 'YAW DMPR', 'STBY', 'BATT', 'CAB', 'TEMP', 'XPNDR', 'VHF', 'HF', 'ADF', 'NAV 1', 'COM 1', 'COM 2', 'WX', 'TERR', 'EFIS', 'BARO', 'MINS', 'CTR', 'RANGE', 'MODE'];

/**
 * A panel of switchgear: modules separated by seams, each with a legend and a
 * mix of toggles, knobs, lit push-buttons and small digit windows. Seeded, so
 * the same panel is the same panel every time.
 */
function controlPanel(w: number, h: number, seed: number, modules: number, base = '#373C45'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const mw = w / modules;
  for (let m = 0; m < modules; m++) {
    const x0 = m * mw;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 3;
    g.strokeRect(x0 + 3, 3, mw - 6, h - 6);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x0 + 4, 4, mw - 8, 3);
    g.fillStyle = '#C9CED8';
    g.font = `600 ${Math.max(9, Math.round(h * 0.07))}px monospace`;
    g.textAlign = 'center';
    g.fillText(LEGENDS[Math.floor(rand() * LEGENDS.length)], x0 + mw / 2, h * 0.14);
    const cols = Math.max(1, Math.round(mw / (h * 0.3)));
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < cols; k++) {
        const cx = x0 + (mw / cols) * (k + 0.5);
        const cy = h * (0.42 + r * 0.34);
        const kind = rand();
        const u = h * 0.09;
        if (kind < 0.32) {
          // Toggle switch in its bezel.
          g.fillStyle = '#1B1E24';
          g.fillRect(cx - u * 0.6, cy - u, u * 1.2, u * 2);
          g.fillStyle = '#D5D9E1';
          const up = rand() > 0.4;
          g.fillRect(cx - u * 0.22, up ? cy - u * 0.95 : cy, u * 0.44, u * 0.95);
        } else if (kind < 0.58) {
          // A rotary knob with its pointer.
          g.fillStyle = '#15181D';
          g.beginPath(); g.arc(cx, cy, u * 1.05, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#555C68'; g.lineWidth = 2; g.stroke();
          const ang = rand() * Math.PI * 2;
          g.strokeStyle = '#E8EDF5';
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * u * 0.9, cy + Math.sin(ang) * u * 0.9); g.stroke();
        } else if (kind < 0.82) {
          // A push-button, some of them lit.
          const lit = rand();
          g.fillStyle = lit > 0.72 ? (lit > 0.9 ? '#FFB300' : '#3FD8E8') : '#22262D';
          g.fillRect(cx - u * 1.2, cy - u * 0.8, u * 2.4, u * 1.6);
          g.strokeStyle = '#0B0D10'; g.lineWidth = 2;
          g.strokeRect(cx - u * 1.2, cy - u * 0.8, u * 2.4, u * 1.6);
          g.fillStyle = lit > 0.72 ? '#0B0D10' : '#6A717D';
          g.font = `700 ${Math.round(u * 0.7)}px monospace`;
          g.fillText(lit > 0.72 ? 'ON' : 'OFF', cx, cy + u * 0.25);
        } else {
          // A digit window.
          g.fillStyle = '#07090C';
          g.fillRect(cx - u * 1.6, cy - u * 0.7, u * 3.2, u * 1.4);
          g.fillStyle = rand() > 0.5 ? '#FFB300' : '#5BE86B';
          g.font = `600 ${Math.round(u * 1.0)}px monospace`;
          g.fillText((100 + Math.floor(rand() * 899)).toString(), cx, cy + u * 0.36);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flight management computer's control display unit: the LEGS page, and its keys. */
function cduTexture(side: 'L' | 'R'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#2C3038';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#05070A';
  g.fillRect(28, 14, 200, 128);
  g.font = '600 12px monospace';
  g.textAlign = 'left';
  g.fillStyle = '#E8EDF5';
  g.fillText(side === 'L' ? '  ACT RTE 1 LEGS' : '    PROGRESS', 36, 32);
  const lines = side === 'L'
    ? [['CLOUDS', '1,000,000'], ['SPACE', '10,000,000'], ['MOON', '50,000,000'], ['MARS', '100,000,000'], ['BEYOND', '---------']]
    : [['TO MARS', 'ETA  ----'], ['FUEL', 'HOLD MORE'], ['SOULS', 'ON BOARD'], ['SEATS', '178'], ['WIND', '000/00']];
  lines.forEach(([a, b], i) => {
    g.fillStyle = i === 0 ? '#FF57C8' : '#5BE86B';
    g.fillText(a, 36, 54 + i * 18);
    g.textAlign = 'right';
    g.fillStyle = '#E8EDF5';
    g.fillText(b, 220, 54 + i * 18);
    g.textAlign = 'left';
  });
  // Line select keys either side of the screen.
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#1A1D22';
    g.fillRect(6, 20 + i * 20, 16, 12);
    g.fillRect(234, 20 + i * 20, 16, 12);
  }
  // The keypad.
  const keys = 'INIT RTE CLB CRZ DES MENU LEGS DEP HOLD PROG EXEC N1 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z 1 2 3 4 5 6 7 8 9 0'.split(' ');
  g.font = '600 9px monospace';
  g.textAlign = 'center';
  keys.forEach((k, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const x = 18 + col * 28;
    const y = 156 + row * 26;
    g.fillStyle = k === 'EXEC' ? '#3D4452' : '#4A515D';
    g.fillRect(x, y, 24, 20);
    g.fillStyle = k === 'EXEC' ? '#5BE86B' : '#E8EDF5';
    g.fillText(k, x + 12, y + 13);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A trim wheel's rim: black, with the white stripes that show it turning. */
function trimTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#121418';
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = '#E8EDF5';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 10, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The aft bulkhead: circuit breaker panels either side of the flight deck door. */
function bulkheadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#343941';
  g.fillRect(0, 0, 1024, 512);
  for (const x0 of [30, 700]) {
    g.fillStyle = '#23272E';
    g.fillRect(x0, 60, 294, 300);
    for (let r = 0; r < 12; r++) {
      for (let k = 0; k < 14; k++) {
        g.fillStyle = '#0D0F12';
        g.beginPath(); g.arc(x0 + 14 + k * 20, 78 + r * 24, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9AA1AD';
        g.fillRect(x0 + 10 + k * 20, 88 + r * 24, 8, 2);
      }
    }
  }
  // The door, with its viewer and handle.
  g.fillStyle = '#4A505B';
  g.fillRect(380, 30, 264, 482);
  g.strokeStyle = '#1C1F25';
  g.lineWidth = 6;
  g.strokeRect(380, 30, 264, 482);
  g.fillStyle = '#0D0F12';
  g.beginPath(); g.arc(512, 170, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9AA1AD';
  g.fillRect(600, 280, 26, 60);
  g.fillStyle = '#E8EDF5';
  g.font = '700 22px monospace';
  g.textAlign = 'center';
  g.fillText('FLIGHT DECK', 512, 110);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ────────────────────────────────────────────────────────────────────────
   The room
   ──────────────────────────────────────────────────────────────────────── */

/** The side walls, seen from inside: fore of the eye is +u, and the side window is a hole. */
const WALL = { aft: 0.92, fwd: 1.18, top: 0.68 } as const;
const SIDE_WINDOW = { aft: 0.36, fwd: 1.0, bottom: -0.2, top: 0.3 } as const;
const HALF = 1.06;

export function createFlightDeck(): FlightDeckHandles {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { owned.push(x); return x; };

  const grain = keep(speckle('#2E333B', 128, 0.08));
  grain.repeat.set(3, 3);
  const panelMat = keep(new THREE.MeshStandardMaterial({ color: '#3A3F48', map: grain, roughness: 0.82, metalness: 0.15 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: '#1C1F25', map: grain, roughness: 0.9, metalness: 0.1 }));
  const shellMat = keep(new THREE.MeshStandardMaterial({ color: '#4B515B', map: grain, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }));
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: '#4A505A', roughness: 0.6, metalness: 0.35 }));
  const trimMat = keep(new THREE.MeshStandardMaterial({ color: '#8A919E', roughness: 0.35, metalness: 0.8 }));
  const blackMat = keep(new THREE.MeshStandardMaterial({ color: '#101216', roughness: 0.55, metalness: 0.2 }));
  const seatMat = keep(new THREE.MeshStandardMaterial({ color: '#C8B99A', roughness: 0.95 }));
  const carpetMat = keep(new THREE.MeshStandardMaterial({ color: '#23272E', roughness: 1, side: THREE.DoubleSide }));
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  /** A textured plate: a plane with its own panel texture, facing +z before rotation. */
  const plate = (w: number, h: number, tex: THREE.Texture, x: number, y: number, z: number, rx = 0, ry = 0, emissive = 0.12, parent: THREE.Object3D = group) => {
    keep(tex);
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: '#FFFFFF', emissiveIntensity: emissive, roughness: 0.75, metalness: 0.1,
    })));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    parent.add(m);
    return m;
  };

  /* ── The shell: closed everywhere but the glass ──────────────────────────
     The first build had walls in pieces, and the world showed through the
     gaps between them — under the side windows, over them and behind the
     seats. This is one skin: side walls with the window cut out of them,
     a ceiling, a floor, an aft bulkhead, and panels round the windshield. */
  const wallShape = new THREE.Shape([
    new THREE.Vector2(-WALL.aft, FLOOR), new THREE.Vector2(WALL.fwd, FLOOR),
    new THREE.Vector2(WALL.fwd, WALL.top), new THREE.Vector2(-WALL.aft, WALL.top),
  ]);
  wallShape.holes.push(new THREE.Path([
    new THREE.Vector2(SIDE_WINDOW.aft, SIDE_WINDOW.bottom), new THREE.Vector2(SIDE_WINDOW.fwd, SIDE_WINDOW.bottom + 0.03),
    new THREE.Vector2(SIDE_WINDOW.fwd - 0.04, SIDE_WINDOW.top), new THREE.Vector2(SIDE_WINDOW.aft + 0.05, SIDE_WINDOW.top - 0.02),
  ]));
  const wallGeo = keep(new THREE.ShapeGeometry(wallShape));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallGeo, shellMat);
    wall.rotation.y = Math.PI / 2; // shape x → -z, so +u is forward
    wall.position.x = C + side * HALF;
    group.add(wall);
  }
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(HALF * 2, WALL.aft + WALL.fwd)), carpetMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(C, FLOOR, (WALL.aft - WALL.fwd) / 2);
  group.add(floor);
  box(HALF * 2 + 0.04, 0.04, WALL.aft + WALL.fwd, shellMat, C, WALL.top + 0.02, (WALL.aft - WALL.fwd) / 2);
  // Aft bulkhead: circuit breakers and the door.
  const aftWall = plate(HALF * 2, WALL.top - FLOOR, bulkheadTexture(), C, (WALL.top + FLOOR) / 2, WALL.aft, 0, Math.PI, 0.06);
  aftWall.material.side = THREE.DoubleSide;
  // Forward, below the glareshield and behind the panel, down to the floor.
  box(HALF * 2, -0.2 - FLOOR, 0.04, shellMat, C, (FLOOR - 0.2) / 2, -WALL.fwd);
  // Above the windshield, up to the ceiling.
  box(HALF * 2, WALL.top - 0.34, 0.04, shellMat, C, (WALL.top + 0.34) / 2, -1.06);
  // The corners between the windshield and the side windows.
  for (const side of [-1, 1]) {
    box(0.16, 0.62, 0.2, shellMat, C + side * 0.99, 0.06, -1.05);
  }

  /* ── The windshield frame, the side window frames, and the glass ── */
  box(2.0, 0.12, 0.12, frameMat, C, 0.36, -1.02);
  box(2.0, 0.05, 0.14, frameMat, C, -0.23, -1.12);
  box(0.07, 0.62, 0.07, frameMat, C, 0.06, -1.08, 0.16);
  for (const side of [-1, 1]) {
    box(0.09, 0.66, 0.09, frameMat, C + side * 0.93, 0.06, -1.0, 0.16, 0, side * -0.08);
    const wx = C + side * (HALF - 0.035);
    box(0.07, 0.07, SIDE_WINDOW.fwd - SIDE_WINDOW.aft + 0.06, frameMat, wx, SIDE_WINDOW.bottom - 0.01, -(SIDE_WINDOW.aft + SIDE_WINDOW.fwd) / 2);
    box(0.07, 0.07, SIDE_WINDOW.fwd - SIDE_WINDOW.aft + 0.06, frameMat, wx, SIDE_WINDOW.top + 0.01, -(SIDE_WINDOW.aft + SIDE_WINDOW.fwd) / 2);
    box(0.07, SIDE_WINDOW.top - SIDE_WINDOW.bottom + 0.08, 0.07, frameMat, wx, 0.05, -SIDE_WINDOW.aft);
    // The side window's crank handle, and a sun visor folded up at the header.
    box(0.03, 0.03, 0.12, trimMat, wx - 0.03, SIDE_WINDOW.bottom - 0.08, -0.5);
    box(0.42, 0.2, 0.012, keep(new THREE.MeshStandardMaterial({ color: '#3B2F22', transparent: true, opacity: 0.8, roughness: 0.3 })), C + side * 0.5, 0.26, -0.98, 0.5);
  }
  const glassMat = keep(new THREE.MeshPhysicalMaterial({
    color: '#CFE3FF', transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.92, 0.6)), glassMat);
    pane.position.set(C + side * 0.47, 0.06, -1.09);
    pane.rotation.x = 0.16;
    group.add(pane);
    const sidePane = new THREE.Mesh(keep(new THREE.PlaneGeometry(SIDE_WINDOW.fwd - SIDE_WINDOW.aft, SIDE_WINDOW.top - SIDE_WINDOW.bottom)), glassMat);
    sidePane.rotation.y = Math.PI / 2;
    sidePane.position.set(C + side * (HALF - 0.02), (SIDE_WINDOW.top + SIDE_WINDOW.bottom) / 2, -(SIDE_WINDOW.aft + SIDE_WINDOW.fwd) / 2);
    group.add(sidePane);
    // A wiper parked along the bottom of each windshield, outside the glass.
    box(0.5, 0.014, 0.014, blackMat, C + side * 0.42, -0.19, -1.16, 0, 0, side * 0.12);
  }
  // The standby compass, on the centre post.
  box(0.1, 0.07, 0.07, blackMat, C, 0.27, -0.98);

  /* ── Glareshield: the MCP, both EFIS panels, master caution and warning ── */
  const glare = new THREE.Mesh(keep(new THREE.BoxGeometry(1.92, 0.06, 0.36)), darkMat);
  glare.position.set(C, -0.27, -0.96);
  group.add(glare);
  box(1.92, 0.12, 0.06, darkMat, C, -0.34, -0.8);
  const mcp = screen(1024);
  mcp.c.height = 100;
  keep(mcp.tex);
  const mcpMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.1, 0.1)), keep(new THREE.MeshBasicMaterial({ map: mcp.tex, toneMapped: false })));
  mcpMesh.position.set(C, -0.35, -0.767);
  mcpMesh.rotation.x = -0.12;
  group.add(mcpMesh);
  for (const side of [-1, 1]) {
    plate(0.26, 0.1, controlPanel(512, 200, side < 0 ? 31 : 37, 3, '#2B3038'), C + side * 0.72, -0.35, -0.767, -0.12, 0, 0.15);
    // Master warning (red) and master caution (amber), at each pilot's eye line.
    const warn = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.03, 0.02)), keep(new THREE.MeshBasicMaterial({ color: '#5A1410' })));
    warn.position.set(C + side * 0.9, -0.31, -0.77);
    group.add(warn);
    const caut = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.03, 0.02)), keep(new THREE.MeshBasicMaterial({ color: '#5A3E08' })));
    caut.position.set(C + side * 0.9, -0.36, -0.77);
    group.add(caut);
  }

  /* ── The main panel, raked back toward the crew ── */
  const panel = new THREE.Group();
  panel.position.set(C, -0.4, -0.81);
  panel.rotation.x = -0.28;
  group.add(panel);
  plate(1.92, 0.52, controlPanel(1536, 416, 53, 12, '#353A43'), 0, -0.26, 0, 0, 0, 0.1, panel);
  const pfd = screen();
  const nd = screen();
  const eicas = screen();
  keep(pfd.tex); keep(nd.tex); keep(eicas.tex);
  const screenGeo = keep(new THREE.PlaneGeometry(0.2, 0.2));
  const bezelGeo = keep(new THREE.BoxGeometry(0.235, 0.235, 0.02));
  const placeScreen = (tex: THREE.Texture, x: number, y = -0.15) => {
    const bezel = new THREE.Mesh(bezelGeo, darkMat);
    bezel.position.set(x, y, 0.008);
    panel.add(bezel);
    const s = new THREE.Mesh(screenGeo, keep(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    s.position.set(x, y, 0.02);
    panel.add(s);
  };
  placeScreen(pfd.tex, -0.64);
  placeScreen(nd.tex, -0.39);
  placeScreen(eicas.tex, 0);
  placeScreen(nd.tex, 0.39);
  placeScreen(pfd.tex, 0.64);
  // The lower display, under the engines, showing the systems page.
  const lower = controlPanel(320, 320, 91, 2, '#05070C');
  placeScreen(keep(lower), 0, -0.4);
  // Clocks at the outboard ends, and the standby instruments.
  for (const x of [-0.88, 0.88]) {
    const clock = new THREE.Mesh(keep(new THREE.CircleGeometry(0.035, 24)), keep(new THREE.MeshBasicMaterial({ color: '#0A0C10' })));
    clock.position.set(x, -0.12, 0.02);
    panel.add(clock);
    box(0.01, 0.028, 0.004, keep(new THREE.MeshBasicMaterial({ color: '#E8EDF5' })), x, -0.11, 0.024, 0, 0, 0.6, panel);
  }
  for (const [x, y] of [[-0.21, -0.1], [-0.21, -0.22]] as const) {
    const sb = new THREE.Mesh(keep(new THREE.CircleGeometry(0.04, 24)), keep(new THREE.MeshBasicMaterial({ color: '#10141C' })));
    sb.position.set(x, y, 0.02);
    panel.add(sb);
  }
  // The landing gear lever with its wheel-shaped knob, and the autobrake knob.
  const gear = new THREE.Group();
  gear.position.set(0.2, -0.2, 0.03);
  box(0.016, 0.1, 0.016, trimMat, 0, 0.05, 0.02, -0.5, 0, 0, gear);
  const gearKnob = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 20)), keep(new THREE.MeshStandardMaterial({ color: '#E8E4DC', roughness: 0.6 })));
  gearKnob.position.set(0, 0.1, 0.05);
  gearKnob.rotation.z = Math.PI / 2;
  gear.add(gearKnob);
  panel.add(gear);
  const autobrake = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 16)), blackMat);
  autobrake.position.set(0.2, -0.38, 0.02);
  autobrake.rotation.x = Math.PI / 2;
  panel.add(autobrake);
  // The panel's lower face, down into the footwell.
  box(1.92, 0.5, 0.05, darkMat, C, -0.96, -0.7, 0.1);

  /* ── The overhead panel ── */
  const overhead = screen(1024);
  overhead.c.height = 480;
  keep(overhead.tex);
  const ohMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 0.95)), keep(new THREE.MeshStandardMaterial({
    map: overhead.tex, emissiveMap: overhead.tex, emissive: '#FFFFFF', emissiveIntensity: 0.18, roughness: 0.7, side: THREE.DoubleSide,
  })));
  ohMesh.position.set(C, 0.52, -0.52);
  ohMesh.rotation.x = Math.PI / 2 + 0.22;
  group.add(ohMesh);
  // Its frame, and the aft overhead panel behind it.
  box(1.26, 0.06, 1.0, frameMat, C, 0.6, -0.5, 0.22);
  plate(1.2, 0.5, controlPanel(1024, 420, 71, 6), C, 0.64, 0.2, Math.PI / 2 + 0.05, 0, 0.12).material.side = THREE.DoubleSide;

  /* ── The pedestal ──────────────────────────────────────────────────────
     Forward: the two FMS keyboards either side of the throttle quadrant.
     The quadrant: thrust levers, speedbrake on the left, flaps on the right,
     fuel cutoffs behind, and a trim wheel on each side. Aft: radios. */
  box(0.46, 0.46, 1.05, panelMat, C, -0.97, -0.25);
  const fwdPed = new THREE.Group();
  fwdPed.position.set(C, -0.72, -0.72);
  fwdPed.rotation.x = -0.9;
  group.add(fwdPed);
  box(0.46, 0.3, 0.04, darkMat, 0, 0, -0.02, 0, 0, 0, fwdPed);
  plate(0.13, 0.17, cduTexture('L'), -0.12, 0, 0.002, 0, 0, 0.35, fwdPed);
  plate(0.13, 0.17, cduTexture('R'), 0.12, 0, 0.002, 0, 0, 0.35, fwdPed);
  // The quadrant, raised in the middle of the pedestal.
  box(0.2, 0.1, 0.3, darkMat, C, -0.69, -0.42);
  plate(0.22, 0.28, controlPanel(256, 320, 83, 1, '#2B3038'), C, -0.739 + 0.001, -0.08, -Math.PI / 2, 0, 0.12);
  plate(0.22, 0.2, controlPanel(256, 240, 89, 2, '#2B3038'), C, -0.739 + 0.001, 0.2, -Math.PI / 2, 0, 0.12);
  const throttles: THREE.Group[] = [];
  for (const dx of [-0.035, 0.035]) {
    const pivot = new THREE.Group();
    pivot.position.set(C + dx, -0.64, -0.42);
    const lever = new THREE.Mesh(keep(new THREE.BoxGeometry(0.014, 0.18, 0.014)), trimMat);
    lever.position.y = 0.09;
    const knob = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12)), blackMat);
    knob.rotation.z = Math.PI / 2;
    knob.position.y = 0.18;
    pivot.add(lever, knob);
    group.add(pivot);
    throttles.push(pivot);
  }
  // Speedbrake (left) and flaps (right), each with its own knob.
  for (const [dx, colour] of [[-0.085, '#1A1D22'], [0.085, '#DDD7CC']] as const) {
    const lever = new THREE.Group();
    lever.position.set(C + dx, -0.64, -0.46);
    box(0.012, 0.13, 0.012, trimMat, 0, 0.065, 0, 0, 0, 0, lever);
    box(0.04, 0.03, 0.035, keep(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 })), 0, 0.14, 0, 0, 0, 0, lever);
    lever.rotation.x = 0.25;
    group.add(lever);
  }
  // Fuel cutoffs, red-tipped, behind the thrust levers.
  for (const dx of [-0.035, 0.035]) {
    box(0.01, 0.05, 0.01, trimMat, C + dx, -0.62, -0.3);
    box(0.02, 0.02, 0.02, keep(new THREE.MeshStandardMaterial({ color: '#8A1C18', roughness: 0.5 })), C + dx, -0.59, -0.3);
  }
  // Trim wheels, one on each side of the quadrant.
  const trimTex = keep(trimTexture());
  const trimRim = keep(new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.5 }));
  const trims: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 32)), [trimRim, blackMat, blackMat]);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(C + side * 0.25, -0.8, -0.42);
    group.add(wheel);
    trims.push(wheel);
  }

  /* ── The side consoles: tiller, oxygen mask, map light ── */
  for (const side of [-1, 1]) {
    const x = C + side * (HALF - 0.13);
    box(0.24, 0.62, 1.1, panelMat, x, FLOOR + 0.31 + 0.08, -0.35);
    plate(0.22, 1.05, controlPanel(256, 1024, side < 0 ? 97 : 101, 1, '#2E333B'), x, FLOOR + 0.7 + 0.001, -0.35, -Math.PI / 2, 0, 0.1);
    // Oxygen mask stowage, forward on the console.
    box(0.14, 0.09, 0.14, keep(new THREE.MeshStandardMaterial({ color: '#2A4A36', roughness: 0.7 })), x, FLOOR + 0.76, -0.78);
    // The captain's nosewheel tiller, on the left only.
    if (side < 0) {
      const tiller = new THREE.Mesh(keep(new THREE.TorusGeometry(0.06, 0.012, 8, 20)), blackMat);
      tiller.rotation.x = -Math.PI / 2 + 0.2;
      tiller.position.set(x + 0.02, FLOOR + 0.74, -0.5);
      group.add(tiller);
    }
    // The map light on its arm.
    box(0.02, 0.02, 0.12, blackMat, C + side * (HALF - 0.05), 0.42, -0.2);
  }

  /* ── Both control columns: ram's-horn yokes that turn with the bank ── */
  const yokes: THREE.Group[] = [];
  for (const x of [0, 2 * C]) {
    const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.028, 0.034, 0.66, 10)), blackMat);
    column.position.set(x, FLOOR + 0.52, -0.64);
    column.rotation.x = -0.2;
    group.add(column);
    // The rubber boot where it meets the floor.
    box(0.12, 0.08, 0.14, darkMat, x, FLOOR + 0.04, -0.72);
    const wheel = new THREE.Group();
    wheel.position.set(x, -0.6, -0.55);
    wheel.rotation.x = -0.2;
    const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16)), trimMat);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    box(0.24, 0.045, 0.035, blackMat, 0, -0.005, 0, 0, 0, 0, wheel);
    // A checklist clip on the hub, and the horns sweeping up and out.
    box(0.08, 0.06, 0.006, keep(new THREE.MeshStandardMaterial({ color: '#E8E4DC', roughness: 0.9 })), 0, 0.02, 0.03, 0, 0, 0, wheel);
    for (const side of [-1, 1]) {
      box(0.04, 0.14, 0.04, blackMat, side * 0.135, 0.05, 0, 0, 0, side * -0.25, wheel);
      // The trim and push-to-talk switches on each grip.
      box(0.014, 0.014, 0.014, keep(new THREE.MeshStandardMaterial({ color: '#8A1C18' })), side * 0.15, 0.12, 0.02, 0, 0, 0, wheel);
    }
    group.add(wheel);
    yokes.push(wheel);
    // Rudder pedals.
    for (const dx of [-0.1, 0.1]) {
      box(0.08, 0.16, 0.025, trimMat, x + dx, FLOOR + 0.14, -0.86, -0.5);
    }
  }

  /* ── The first officer's seat, across the pedestal ── */
  box(0.5, 0.12, 0.5, seatMat, 2 * C, FLOOR + 0.5, 0.25);
  box(0.5, 0.75, 0.12, seatMat, 2 * C, FLOOR + 0.92, 0.5, -0.12);
  box(0.28, 0.2, 0.1, seatMat, 2 * C, FLOOR + 1.42, 0.56, -0.12);
  box(0.06, 0.08, 0.4, darkMat, 2 * C - 0.27, FLOOR + 0.72, 0.28);
  box(0.06, 0.08, 0.4, darkMat, 2 * C + 0.27, FLOOR + 0.72, 0.28);
  box(0.08, 0.35, 0.08, blackMat, 2 * C, FLOOR + 0.25, 0.25);

  /* ── Light of its own ─────────────────────────────────────────────────
     Short-ranged, so they light the deck and not the world through the
     glass: a flood over the panel, a dome light above the pedestal, and
     the glow the screens throw back. */
  const flood = new THREE.PointLight('#FFD9A8', 0, 3, 2);
  flood.position.set(C, 0.3, -0.45);
  group.add(flood);
  const dome = new THREE.PointLight('#E8EEF8', 0, 2.6, 2);
  dome.position.set(C, 0.55, 0.05);
  group.add(dome);
  const glass = new THREE.PointLight('#9FD4FF', 0, 1.6, 2);
  glass.position.set(C, -0.4, -0.55);
  group.add(glass);

  /* ── Frame by frame ── */
  let readout: DeckReadout | null = null;
  let lastDraw = -Infinity;
  let lampsKey = '';
  drawOverhead(overhead.g, null);
  overhead.tex.needsUpdate = true;

  const setReadout = (r: DeckReadout) => {
    readout = r;
    const key = `${r.lamps.seatbelt}${r.lamps.service}${r.lamps.oxygen}${r.lamps.brace}`;
    if (key !== lampsKey) {
      lampsKey = key;
      drawOverhead(overhead.g, r.lamps);
      overhead.tex.needsUpdate = true;
    }
  };

  const update = (a: Attitude, nowMs: number, night: number) => {
    const over = a.bank + a.roll;
    for (const y of yokes) y.rotation.z = -over * DEG * 0.6;
    const thrust = Math.min(1, Math.max(0, (a.speed - 212) / 260));
    for (const t of throttles) t.rotation.x = -0.5 + thrust * 0.9;
    // The trim wheels run while the nose is being trimmed up or down.
    for (const w of trims) w.rotation.x += a.pitch * 0.004;
    flood.intensity = THREE.MathUtils.lerp(1.2, 5.5, night);
    dome.intensity = THREE.MathUtils.lerp(0.8, 3.2, night);
    glass.intensity = THREE.MathUtils.lerp(0.2, 1.4, night);
    // The glass redraws a dozen times a second: plenty for tapes that move
    // with a market, and a fraction of the cost of every frame.
    if (nowMs - lastDraw < 80) return;
    lastDraw = nowMs;
    drawPfd(pfd.g, a);
    drawNd(nd.g, a, readout);
    drawEicas(eicas.g, a, readout);
    drawMcp(mcp.g, a);
    pfd.tex.needsUpdate = true;
    nd.tex.needsUpdate = true;
    eicas.tex.needsUpdate = true;
    mcp.tex.needsUpdate = true;
  };

  const dispose = () => owned.forEach((o) => o.dispose());

  return { group, restPitch: -17, setReadout, update, dispose };
}
