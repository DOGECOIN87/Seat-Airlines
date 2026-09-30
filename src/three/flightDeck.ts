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
   The room
   ──────────────────────────────────────────────────────────────────────── */

export function createFlightDeck(): FlightDeckHandles {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { owned.push(x); return x; };

  const grain = keep(speckle('#2E333B', 128, 0.08));
  grain.repeat.set(3, 3);
  const panelMat = keep(new THREE.MeshStandardMaterial({ color: '#3A3F48', map: grain, roughness: 0.82, metalness: 0.15 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: '#1C1F25', map: grain, roughness: 0.9, metalness: 0.1 }));
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: '#4A505A', roughness: 0.6, metalness: 0.35 }));
  const trimMat = keep(new THREE.MeshStandardMaterial({ color: '#8A919E', roughness: 0.35, metalness: 0.8 }));
  const seatMat = keep(new THREE.MeshStandardMaterial({ color: '#C8B99A', roughness: 0.95 }));
  const carpetMat = keep(new THREE.MeshStandardMaterial({ color: '#23272E', roughness: 1 }));
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };

  /* ── Floor, and the walls below the side windows ── */
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.3, 2.4)), carpetMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(C, FLOOR, -0.4);
  group.add(floor);
  for (const side of [-1, 1]) {
    // Sidewall and its console, below the side window.
    box(0.06, 1.0, 1.6, panelMat, C + side * 1.03, FLOOR + 0.5, -0.35);
    box(0.22, 0.12, 1.1, darkMat, C + side * 0.92, -0.62, -0.25);
    // Wall above the side window, up into the ceiling.
    box(0.06, 0.34, 1.6, panelMat, C + side * 1.0, 0.52, -0.35);
  }

  /* ── The windshield frame: header, sill, centre post and side pillars ── */
  box(2.0, 0.12, 0.12, frameMat, C, 0.36, -1.02);
  box(2.0, 0.05, 0.14, frameMat, C, -0.23, -1.12);
  box(0.07, 0.62, 0.07, frameMat, C, 0.06, -1.08, 0.16);
  for (const side of [-1, 1]) {
    // The corner pillar between front and side windows, raked back.
    box(0.09, 0.66, 0.09, frameMat, C + side * 0.93, 0.06, -1.0, 0.16, 0, side * -0.08);
    // The side window's aft frame.
    box(0.06, 0.6, 0.07, frameMat, C + side * 1.01, 0.06, -0.3);
    // Its sill.
    box(0.08, 0.05, 0.75, frameMat, C + side * 1.0, -0.23, -0.66);
  }

  /* ── Glareshield, and the mode control panel along its edge ── */
  const glare = new THREE.Mesh(keep(new THREE.BoxGeometry(1.92, 0.06, 0.36)), darkMat);
  glare.position.set(C, -0.27, -0.96);
  group.add(glare);
  const mcp = screen(1024);
  mcp.c.height = 100;
  keep(mcp.tex);
  const mcpMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.25, 0.1)), keep(new THREE.MeshBasicMaterial({ map: mcp.tex, toneMapped: false })));
  mcpMesh.position.set(C, -0.35, -0.775);
  mcpMesh.rotation.x = -0.12;
  group.add(mcpMesh);
  box(1.92, 0.12, 0.06, darkMat, C, -0.34, -0.8);

  /* ── The main panel, raked back toward the crew, and its five screens ── */
  const panel = new THREE.Group();
  panel.position.set(C, -0.4, -0.81);
  panel.rotation.x = -0.28;
  group.add(panel);
  const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.92, 0.5)), panelMat);
  face.position.set(0, -0.25, 0);
  panel.add(face);
  const pfd = screen();
  const nd = screen();
  const eicas = screen();
  keep(pfd.tex); keep(nd.tex); keep(eicas.tex);
  const screenGeo = keep(new THREE.PlaneGeometry(0.2, 0.2));
  const bezelGeo = keep(new THREE.BoxGeometry(0.235, 0.235, 0.02));
  const placeScreen = (tex: THREE.Texture, x: number) => {
    const bezel = new THREE.Mesh(bezelGeo, darkMat);
    bezel.position.set(x, -0.15, 0.008);
    panel.add(bezel);
    const s = new THREE.Mesh(screenGeo, keep(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    s.position.set(x, -0.15, 0.02);
    panel.add(s);
  };
  // Captain, the engines in the middle, then the first officer's, mirrored.
  placeScreen(pfd.tex, -0.64);
  placeScreen(nd.tex, -0.39);
  placeScreen(eicas.tex, 0);
  placeScreen(nd.tex, 0.39);
  placeScreen(pfd.tex, 0.64);
  // The standby instrument, between the captain's screens and the engines.
  const standby = new THREE.Mesh(keep(new THREE.CircleGeometry(0.04, 24)), keep(new THREE.MeshBasicMaterial({ color: '#10141C' })));
  standby.position.set(-0.19, -0.14, 0.02);
  panel.add(standby);
  // The panel's lower face, down into the footwell.
  box(1.92, 0.5, 0.05, darkMat, C, -0.96, -0.7, 0.1);

  /* ── The overhead panel, sloping up and back over the crew ── */
  const overhead = screen(1024);
  overhead.c.height = 480;
  keep(overhead.tex);
  const ohMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 0.95)), keep(new THREE.MeshStandardMaterial({
    map: overhead.tex, emissiveMap: overhead.tex, emissive: '#FFFFFF', emissiveIntensity: 0.18, roughness: 0.7, side: THREE.DoubleSide,
  })));
  ohMesh.position.set(C, 0.52, -0.52);
  ohMesh.rotation.x = Math.PI / 2 + 0.22;
  group.add(ohMesh);
  // The ceiling round it.
  box(2.1, 0.04, 1.8, darkMat, C, 0.66, -0.25);

  /* ── The pedestal and its throttles ── */
  box(0.34, 0.5, 0.95, panelMat, C, -0.95, -0.28);
  const pedTop = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.3, 0.9)), darkMat);
  pedTop.rotation.x = -Math.PI / 2;
  pedTop.position.set(C, -0.699, -0.28);
  group.add(pedTop);
  const throttles: THREE.Group[] = [];
  for (const dx of [-0.05, 0.05]) {
    const pivot = new THREE.Group();
    pivot.position.set(C + dx, -0.7, -0.42);
    const lever = new THREE.Mesh(keep(new THREE.BoxGeometry(0.018, 0.2, 0.018)), trimMat);
    lever.position.y = 0.1;
    const knob = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.035, 0.045)), darkMat);
    knob.position.y = 0.2;
    pivot.add(lever, knob);
    group.add(pivot);
    throttles.push(pivot);
  }

  /* ── Both control columns, the wheels turning with the bank ── */
  const yokes: THREE.Group[] = [];
  for (const x of [0, 2 * C]) {
    const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.03, 0.62, 10)), darkMat);
    column.position.set(x, FLOOR + 0.31 + 0.2, -0.62);
    column.rotation.x = -0.18;
    group.add(column);
    const wheel = new THREE.Group();
    wheel.position.set(x, -0.6, -0.55);
    wheel.rotation.x = -0.18;
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.035, 0.03)), darkMat);
    const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16)), trimMat);
    hub.rotation.x = Math.PI / 2;
    wheel.add(bar, hub);
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.035, 0.12, 0.035)), darkMat);
      grip.position.set(side * 0.15, 0.045, 0);
      wheel.add(grip);
    }
    group.add(wheel);
    yokes.push(wheel);
  }

  /* ── The first officer's seat, across the pedestal ── */
  box(0.5, 0.12, 0.5, seatMat, 2 * C, FLOOR + 0.5, 0.25);
  box(0.5, 0.75, 0.12, seatMat, 2 * C, FLOOR + 0.92, 0.5, -0.12);
  box(0.28, 0.2, 0.1, seatMat, 2 * C, FLOOR + 1.42, 0.56, -0.12);
  box(0.06, 0.08, 0.4, darkMat, 2 * C - 0.27, FLOOR + 0.72, 0.28);
  box(0.06, 0.08, 0.4, darkMat, 2 * C + 0.27, FLOOR + 0.72, 0.28);

  /* ── Light of its own: the panel flood and the glow of the glass ── */
  /* Short-ranged, so they light the deck and not the world through the
     glass: a flood over the panel and a dome light above the pedestal. */
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
