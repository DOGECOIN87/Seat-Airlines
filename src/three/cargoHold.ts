import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Attitude } from '../lib/useAttitude';
import { precompiler } from './precompile';

/**
 * The cargo hold, as geometry.
 *
 * It used to be a drawing: six rib outlines stepping away, two containers and
 * a pile of rounded rectangles, the same picture from wherever you stood. The
 * cabins upstairs were rooms by then, and the hold was the one compartment
 * that was still a poster of one. This builds the room.
 *
 * It is the lower lobe of the fuselage: the curve of the skin below the cabin
 * floor, lined with insulation blankets between the frames, stringers running
 * the length of it, and the floor beams of the cabin overhead. A roller floor,
 * LD3 containers loaded two abreast with their bevelled corners to the skin,
 * a bulk bay of everybody's bags under a strapped net, and caged work lights
 * on short cords that swing when the aeroplane banks.
 *
 * There is no window, so the altitude shows the way it would down here: as
 * frost. The higher the flight, the colder the skin, until at the moon the
 * blankets and the frames are white with it.
 *
 * Dimensions are a widebody's lower deck, in metres, with the tube's axis at
 * y = 0 and +z aft: the camera stands in the bulk bay near the aft end and
 * looks forward, down the length of the hold.
 */

const R = 2.9;
/** The underside of the cabin floor, which is this room's ceiling. */
const CEIL = -0.42;
const FLOOR = -2.35;
const Z_AFT = 8;
const Z_FWD = -13;
const LENGTH = Z_AFT - Z_FWD;
const Z_MID = (Z_AFT + Z_FWD) / 2;
/** Frame spacing, which is also the insulation blankets' pitch. */
const FRAME = 0.56;

const halfWidthAt = (y: number) => Math.sqrt(R * R - y * y);
const FLOOR_HALF = halfWidthAt(FLOOR);
const CEIL_HALF = halfWidthAt(CEIL);

/**
 * How the view is framed at rest, before anybody drags it: a longish lens,
 * turned a little toward the netted bags. Wide, the room was all ribs, beams
 * and netting at the edges of the frame; closer in it is the lamps, the bags
 * and the hold running away into the dark.
 */
const VIEW = (globalThis as { __holdView?: { fov: number; yaw: number; pitch: number } }).__holdView
  ?? { fov: 40, yaw: -12, pitch: -6 };

/** The camera: at the aft end, on the open port side of the bulk bay, looking down the hold. */
const EYE = new THREE.Vector3(-0.62, FLOOR + 1.34, 7.25);

export interface CargoHoldHandles {
  resize: (w: number, h: number) => void;
  /**
   * One frame. `frost` runs 0 on the ground to 1 at the moon; `look` is the
   * viewer's drag, in degrees.
   */
  render: (a: Attitude, frost: number, look: { yaw: number; pitch: number }, nowMs: number) => void;
  dispose: () => void;
}

/* ────────────────────────────────────────────────────────────────────────
   Textures, drawn once on canvases
   ──────────────────────────────────────────────────────────────────────── */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D] as const;
}

function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Insulation blankets: quilted, silver-grey, one per bay between frames,
 * stitched and taped at the seams. One tile is one bay wide (u, around the
 * skin) and one frame long (v, down the hold).
 */
function blanketTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rand = seeded(0x51ae);
  g.fillStyle = '#9097A3';
  g.fillRect(0, 0, 256, 256);
  // Each blanket puffs out between its stitch lines.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * 64;
      const y = j * 64;
      const grad = g.createRadialGradient(x + 32, y + 30, 4, x + 32, y + 32, 46);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = grad;
      g.fillRect(x, y, 64, 64);
    }
  }
  g.strokeStyle = 'rgba(40,44,52,0.35)';
  g.lineWidth = 1.2;
  g.setLineDash([3, 3]);
  for (let k = 64; k < 256; k += 64) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke();
    g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
  }
  g.setLineDash([]);
  // Tape along the edges of the blanket, where it meets the frames.
  g.fillStyle = 'rgba(70,74,82,0.55)';
  g.fillRect(0, 0, 256, 7);
  g.fillRect(0, 249, 256, 7);
  // Scuffs and a stencilled part number, here and there.
  for (let k = 0; k < 90; k++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rand() * 0.05})`;
    g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 14, 1 + rand() * 3);
  }
  g.fillStyle = 'rgba(30,34,40,0.35)';
  g.font = 'bold 9px monospace';
  g.fillText('INSUL BLKT 65B41-7', 70, 150);
  return texture(c);
}

/** The underside of the cabin floor: composite panels and their fasteners. */
function ceilingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4A505B';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.fillStyle = 'rgba(210,215,225,0.35)';
  for (let k = 12; k < 256; k += 24) {
    g.beginPath(); g.arc(k, 8, 1.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(k, 248, 1.6, 0, Math.PI * 2); g.fill();
  }
  return texture(c);
}

/**
 * The cargo floor: dark, worn aluminium plate, with ball-transfer units in a
 * grid across the doorway bay and the long scuffs of containers dragged
 * over it.
 */
function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rand = seeded(0xf100);
  g.fillStyle = '#2E333C';
  g.fillRect(0, 0, 512, 512);
  // Diamond tread.
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 512; y += 12) {
    for (let x = (y / 12) % 2 ? 6 : 0; x < 512; x += 12) {
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-1.5, -4, 3, 8); g.restore();
    }
  }
  // Drag marks, down the length of the hold.
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(200,205,215,${0.03 + rand() * 0.06})`;
    g.lineWidth = 1 + rand() * 3;
    const x = rand() * 512;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rand() - 0.5) * 20, 512); g.stroke();
  }
  // Panel seams.
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 510);
  return texture(c);
}

/** One face of an LD3: ribbed aluminium, rivets, the tag and the hazard corner. */
function containerTexture(label: string, face: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(512, 416);
  const grad = g.createLinearGradient(0, 0, 0, 416);
  grad.addColorStop(0, '#9AA2AF');
  grad.addColorStop(1, '#6C7482');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 416);
  // Corrugations.
  for (let x = 16; x < 512; x += 32) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, 0, 6, 416);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + 6, 0, 4, 416);
  }
  // Frame and rivets.
  g.strokeStyle = 'rgba(40,44,52,0.7)';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 406);
  g.fillStyle = 'rgba(220,225,232,0.6)';
  for (let x = 20; x < 512; x += 26) {
    g.beginPath(); g.arc(x, 14, 2.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, 402, 2.4, 0, Math.PI * 2); g.fill();
  }
  if (face) {
    // The door curtain's frame, the tag, and the yellow-and-black corner.
    g.strokeStyle = 'rgba(30,34,40,0.55)';
    g.lineWidth = 4;
    g.strokeRect(40, 40, 432, 300);
    g.fillStyle = '#E9EDF3';
    g.fillRect(56, 350, 250, 44);
    g.fillStyle = '#0E1A33';
    g.font = 'bold 26px monospace';
    g.fillText(label, 68, 381);
    g.fillStyle = '#FFB300';
    g.fillRect(330, 352, 150, 40);
    g.fillStyle = '#1B1F26';
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.moveTo(330 + k * 22, 392); g.lineTo(346 + k * 22, 352); g.lineTo(356 + k * 22, 352); g.lineTo(340 + k * 22, 392);
      g.fill();
    }
    g.fillStyle = 'rgba(20,24,30,0.7)';
    g.font = 'bold 15px monospace';
    g.fillText('MAX GROSS 1588 KG', 60, 70);
  }
  return texture(c);
}

/** A cargo door on the skin: grey, edged in hazard stripes, with its handle. */
function doorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6E7684';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#FFB300';
  g.fillRect(0, 0, 256, 14); g.fillRect(0, 242, 256, 14); g.fillRect(0, 0, 14, 256); g.fillRect(242, 0, 14, 256);
  g.fillStyle = '#1B1F26';
  for (let k = -256; k < 512; k += 22) {
    g.save(); g.beginPath(); g.rect(0, 0, 256, 256); g.rect(14, 14, 228, 228); g.clip('evenodd');
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 11, 0); g.lineTo(k + 11 - 256, 256); g.lineTo(k - 256, 256); g.fill();
    g.restore();
  }
  g.fillStyle = '#2A2F38';
  g.fillRect(100, 150, 56, 18);
  g.fillStyle = '#E8EDF5';
  g.font = 'bold 20px monospace';
  g.fillText('CARGO DOOR', 68, 110);
  g.font = '12px monospace';
  g.fillText('OPERATE FROM OUTSIDE', 58, 130);
  return texture(c);
}

/** Frost: bright crystalline blotches, heavier toward the bottom of the skin. */
function frostTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rand = seeded(0xf057);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 1500; k++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1.5 + rand() * 9;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.35 + rand() * 0.5})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return texture(c, false);
}

/** A soft vertical fall-off, for the beams of light under each lamp. */
function beamTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(8, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,214,150,0.9)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return texture(c);
}

/* ────────────────────────────────────────────────────────────────────────
   Geometry
   ──────────────────────────────────────────────────────────────────────── */

/**
 * A surface made by sweeping a 2D cross-section along the hold. u is the
 * distance round the profile and v the distance down the hold, both in
 * metres, so a texture's repeat is simply one over its size in metres.
 */
function sweep(profile: THREE.Vector2[], z0: number, z1: number, segs = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lens = [0];
  for (let i = 1; i < profile.length; i++) lens.push(lens[i - 1] + profile[i].distanceTo(profile[i - 1]));
  for (let s = 0; s <= segs; s++) {
    const z = z0 + ((z1 - z0) * s) / segs;
    profile.forEach((p, i) => {
      pos.push(p.x, p.y, z);
      uv.push(lens[i], z);
    });
  }
  const n = profile.length;
  for (let s = 0; s < segs; s++) {
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i;
      const b = a + n;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The skin from the ceiling down to the floor on one side, `inset` inside it. */
function wallProfile(side: -1 | 1, inset = 0, from = CEIL, to = FLOOR, steps = 18): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = from + ((to - from) * i) / steps;
    out.push(new THREE.Vector2(side * (halfWidthAt(y) - inset), y));
  }
  return out;
}

/** One frame: a channel following the skin up one side, extruded thin along z. */
function frameGeometry(side: -1 | 1): THREE.BufferGeometry {
  const outer = wallProfile(side, 0.0, CEIL, FLOOR, 14);
  const inner = wallProfile(side, 0.11, CEIL, FLOOR, 14).reverse();
  const shape = new THREE.Shape([...outer, ...inner]);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 1 });
}

/**
 * An LD3 — an AKE, in the ULD codes — as its cross-section extruded down the
 * hold: flat on the inboard side, bevelled at the bottom of the outboard one
 * so it follows the curve of the skin. Built with its outboard side at +x.
 */
function ld3Geometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1.53, 0);
  s.lineTo(2.0, 0.55);
  s.lineTo(2.0, 1.63);
  s.lineTo(0, 1.63);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.53, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  // The shape's own coordinates are the texture's, a 2 × 1.63 m face.
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.0, uv.getY(i) / 1.63);
  return geo;
}

/* ────────────────────────────────────────────────────────────────────────
   The room
   ──────────────────────────────────────────────────────────────────────── */

export function createCargoHold(canvasEl: HTMLCanvasElement): CargoHoldHandles {
  // The full hold on every device: antialiased, sharp to a retina screen, every lamp lit.
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  // The first frame waits for the shaders, compiled in parallel (see precompile.ts).
  const canDraw = precompiler(renderer);

  const scene = new THREE.Scene();
  /* Something for the metal to reflect. Without it a metallic surface has
     only the lamps' highlights to show, and every frame, beam and rail that
     was not catching one rendered black. A room's worth of soft light,
     turned right down, is what a hold lined in grey blankets would give. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.11;
  const fogColor = new THREE.Color('#07090E');
  scene.background = fogColor.clone();
  scene.fog = new THREE.FogExp2(fogColor.clone(), 0.085);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, 16 / 10, 0.05, 60);
  camera.position.copy(EYE);
  /* The camera rides in the aeroplane, so it leans with it: the room stays
     where it is around you and the lamps swing to show which way is down. */
  const rig = new THREE.Group();
  rig.position.copy(EYE);
  scene.add(rig);
  camera.position.set(0, 0, 0);
  rig.add(camera);

  const disposables: { dispose: () => void }[] = [envMap];
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

  /* ── The skin, the blankets, and the frost on them ── */
  const blanket = keep(blanketTexture());
  blanket.repeat.set(1 / 1.1, 1 / FRAME);
  const baseSkin = new THREE.Color('#A7AEBA');
  const frostSkin = new THREE.Color('#E6EEF8');
  const skinMat = keep(new THREE.MeshStandardMaterial({ map: blanket, color: baseSkin.clone(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  const walls = keep(mergeGeometries([
    sweep(wallProfile(-1), Z_FWD, Z_AFT),
    sweep(wallProfile(1).reverse(), Z_FWD, Z_AFT),
  ]));
  scene.add(new THREE.Mesh(walls, skinMat));

  const frostMap = keep(frostTexture());
  frostMap.repeat.set(1 / 0.9, 1 / 0.9);
  const frostMat = keep(new THREE.MeshStandardMaterial({
    color: '#F4F8FF', alphaMap: frostMap, transparent: true, opacity: 0, roughness: 0.3, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  const frostWalls = keep(mergeGeometries([
    sweep(wallProfile(-1, 0.012), Z_FWD, Z_AFT),
    sweep(wallProfile(1, 0.012).reverse(), Z_FWD, Z_AFT),
  ]));
  scene.add(new THREE.Mesh(frostWalls, frostMat));

  /* ── The ceiling: the cabin floor's underside, and its beams ── */
  const ceilTex = keep(ceilingTexture());
  ceilTex.repeat.set(1 / 1.2, 1 / FRAME);
  const ceilGeo = keep(new THREE.PlaneGeometry(CEIL_HALF * 2, LENGTH));
  const ceilUv = ceilGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < ceilUv.count; i++) ceilUv.setXY(i, ceilUv.getX(i) * CEIL_HALF * 2, ceilUv.getY(i) * LENGTH);
  const ceiling = new THREE.Mesh(ceilGeo, keep(new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide })));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL, Z_MID);
  scene.add(ceiling);

  /* ── Frames, floor beams and stringers, merged: one draw call each ── */
  const metal = keep(new THREE.MeshStandardMaterial({ color: '#5E6573', roughness: 0.5, metalness: 0.65 }));
  const baseMetal = new THREE.Color('#5E6573');
  const frostMetal = new THREE.Color('#D8E2EE');
  const frames: THREE.BufferGeometry[] = [];
  const beams: THREE.BufferGeometry[] = [];
  for (let z = Z_FWD + 0.2; z < Z_AFT; z += FRAME) {
    for (const side of [-1, 1] as const) {
      const f = frameGeometry(side);
      f.translate(0, 0, z);
      frames.push(f);
    }
    const beam = new THREE.BoxGeometry(CEIL_HALF * 2, 0.16, 0.06).toNonIndexed();
    beam.translate(0, CEIL - 0.08, z + 0.035);
    beams.push(beam);
  }
  const stringers: THREE.BufferGeometry[] = [];
  for (const y of [-0.8, -1.15, -1.5, -1.85, -2.15]) {
    for (const side of [-1, 1]) {
      const s = new THREE.BoxGeometry(0.035, 0.05, LENGTH).toNonIndexed();
      s.translate(side * (halfWidthAt(y) - 0.07), y, Z_MID);
      stringers.push(s);
    }
  }
  // Extruded frames carry no index, so the boxes are made the same way:
  // mergeGeometries refuses a mix and returns nothing at all.
  const structure = keep(mergeGeometries([...frames, ...beams, ...stringers]));
  [...frames, ...beams, ...stringers].forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(structure, metal));

  /* ── The floor, its side rails, and two lanes of rollers ── */
  const floorTex = keep(floorTexture());
  floorTex.repeat.set(1 / 1.6, 1 / 1.6);
  const floorGeo = keep(new THREE.PlaneGeometry(FLOOR_HALF * 2, LENGTH));
  const floorUv = floorGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < floorUv.count; i++) floorUv.setXY(i, floorUv.getX(i) * FLOOR_HALF * 2, floorUv.getY(i) * LENGTH);
  const floor = new THREE.Mesh(floorGeo, keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62, metalness: 0.55, side: THREE.DoubleSide })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR, Z_MID);
  scene.add(floor);

  const rails: THREE.BufferGeometry[] = [];
  for (const x of [-FLOOR_HALF + 0.12, -0.03, FLOOR_HALF - 0.12]) {
    const r = new THREE.BoxGeometry(0.07, 0.09, LENGTH);
    r.translate(x, FLOOR + 0.045, Z_MID);
    rails.push(r);
  }
  const railGeo = keep(mergeGeometries(rails));
  rails.forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(railGeo, keep(new THREE.MeshStandardMaterial({ color: '#8A919E', roughness: 0.35, metalness: 0.85 }))));

  const rollerGeo = keep(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10));
  rollerGeo.rotateZ(Math.PI / 2);
  const rollerMat = keep(new THREE.MeshStandardMaterial({ color: '#A3AAB6', roughness: 0.28, metalness: 0.9 }));
  const laneX = [-0.8, 0.8];
  const perLane = Math.floor(LENGTH / 0.3);
  const rollers = new THREE.InstancedMesh(rollerGeo, rollerMat, perLane * laneX.length);
  const m = new THREE.Matrix4();
  let ri = 0;
  for (const x of laneX) {
    for (let k = 0; k < perLane; k++) {
      m.makeTranslation(x, FLOOR + 0.03, Z_FWD + 0.2 + k * 0.3);
      rollers.setMatrixAt(ri++, m);
    }
  }
  scene.add(rollers);

  /* ── The containers, two abreast, bevel to the skin ── */
  const uldGeo = keep(ld3Geometry());
  const sideTex = keep(containerTexture('', false));
  const sideMat = keep(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.42, metalness: 0.62 }));
  const uldMats: THREE.MeshStandardMaterial[] = [];
  /* Loaded from forward, and not full: the starboard side is taken most of
     the way aft, and the port side is open floor for the first nine metres,
     so the room can be seen down its length rather than walled off at the
     first pair. */
  const positions: [number, 1 | -1][] = [
    [1.1, 1],
    [-0.6, 1],
    [-2.3, 1],
    [-4.0, -1], [-4.0, 1],
    [-5.7, -1], [-5.7, 1],
    [-7.4, -1],
    [-9.1, -1], [-9.1, 1],
    [-10.8, -1], [-10.8, 1],
  ];
  positions.forEach(([z, side], i) => {
    const label = `AKE ${40218 + i} SA`;
    const faceTex = keep(containerTexture(label, true));
    // A port-side container is the starboard one mirrored, so its face is
    // mirrored back again or the tag reads backwards.
    if (side === -1) {
      faceTex.repeat.x = -1;
      faceTex.offset.x = 1;
    }
    const faceMat = keep(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.42, metalness: 0.6 }));
    uldMats.push(faceMat);
    const uld = new THREE.Mesh(uldGeo, [faceMat, sideMat]);
    // Inboard edge on the centreline, bevel outboard, door facing aft.
    // On the rollers, which stand 6.5 cm proud of the floor.
    if (side === 1) uld.position.set(0.04, FLOOR + 0.065, z);
    else {
      uld.scale.x = -1;
      uld.position.set(-0.04, FLOOR + 0.065, z);
    }
    scene.add(uld);
  });
  uldMats.push(sideMat);

  /* ── The bulk bay: everybody's bags, under a net ── */
  const rand = seeded(0xba65);
  const bagGeo = keep(new RoundedBoxGeometry(1, 1, 1, 3, 0.16));
  const bagMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 }));
  const palette = ['#5A4636', '#3E4A63', '#7A3B3B', '#3B5545', '#4A4458', '#6E5A3A', '#2F3440', '#8A6A3A', '#5C2F4A', '#35506B'];
  const bagCount = 34;
  const bags = new THREE.InstancedMesh(bagGeo, bagMat, bagCount);
  const tagGeo = keep(new THREE.BoxGeometry(0.06, 0.09, 0.008));
  const tags = new THREE.InstancedMesh(tagGeo, keep(new THREE.MeshStandardMaterial({ color: '#E8EDF5', roughness: 0.6 })), bagCount);
  const handleGeo = keep(new THREE.BoxGeometry(0.16, 0.035, 0.03));
  const handles = new THREE.InstancedMesh(handleGeo, keep(new THREE.MeshStandardMaterial({ color: '#1C2028', roughness: 0.5 })), bagCount);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  // Stacked in rough layers across the bay, bigger at the bottom.
  const heights = new Map<string, number>();
  for (let i = 0; i < bagCount; i++) {
    const w = 0.42 + rand() * 0.34;
    const h = 0.2 + rand() * 0.16;
    const d = 0.3 + rand() * 0.18;
    const x = 0.2 + rand() * 1.3;
    const z = 3.1 + rand() * 1.6;
    const cell = `${Math.round(x / 0.45)},${Math.round(z / 0.45)}`;
    const base = heights.get(cell) ?? FLOOR;
    // A pile, not a tower: nothing goes on once a stack is about a metre up.
    if (base > FLOOR + 0.78) {
      bags.setMatrixAt(i, m.makeScale(0, 0, 0));
      tags.setMatrixAt(i, m);
      handles.setMatrixAt(i, m);
      continue;
    }
    heights.set(cell, base + h * 0.92);
    const yaw = (rand() - 0.5) * 1.1;
    e.set((rand() - 0.5) * 0.18, yaw, (rand() - 0.5) * 0.22);
    q.setFromEuler(e);
    p.set(x, base + h / 2, z);
    sc.set(w, h, d);
    m.compose(p, q, sc);
    bags.setMatrixAt(i, m);
    color.set(palette[Math.floor(rand() * palette.length)]);
    bags.setColorAt(i, color);
    // The tag on the aft face, and a handle on top.
    const tag = new THREE.Vector3(w * 0.3, 0, d / 2 + 0.006).applyQuaternion(q).add(p);
    m.compose(tag, q, new THREE.Vector3(1, 1, 1));
    tags.setMatrixAt(i, m);
    const handle = new THREE.Vector3(0, h / 2 + 0.012, 0).applyQuaternion(q).add(p);
    m.compose(handle, q, new THREE.Vector3(1, 1, 1));
    handles.setMatrixAt(i, m);
  }
  scene.add(bags, tags, handles);

  // The net: a diamond mesh strung across the bay, bellied out over the pile.
  const netZ = 5.05;
  const netTop = FLOOR + 1.12;
  const netPts: number[] = [];
  const netX = (x: number, y: number) => new THREE.Vector3(x, y, netZ + 0.12 * Math.sin(((y - FLOOR) / (netTop - FLOOR)) * Math.PI));
  // Across the starboard half only: from the centre rail to the skin.
  const netL = 0.02;
  const netR = FLOOR_HALF - 0.05;
  for (let k = -12; k <= 26; k++) {
    for (const dir of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let t = 0; t <= 12; t++) {
        const y = FLOOR + ((netTop - FLOOR) * t) / 12;
        const x = k * 0.14 + dir * (y - FLOOR) * 0.9;
        if (x >= netL && x <= netR) pts.push(netX(x, y));
      }
      for (let t = 1; t < pts.length; t++) netPts.push(...pts[t - 1].toArray(), ...pts[t].toArray());
    }
  }
  const netGeo = keep(new THREE.BufferGeometry());
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netPts, 3));
  const netMat = keep(new THREE.LineBasicMaterial({ color: '#A9B2C2', transparent: true, opacity: 0.3, fog: true }));
  scene.add(new THREE.LineSegments(netGeo, netMat));
  // Tie-down straps across it, cinched to the floor rails.
  const strapMat = keep(new THREE.MeshStandardMaterial({ color: '#9C6E1C', roughness: 0.8 }));
  for (const y of [FLOOR + 0.42, FLOOR + 0.86]) {
    const strap = new THREE.Mesh(keep(new THREE.BoxGeometry(netR - netL, 0.024, 0.01)), strapMat);
    strap.position.set((netL + netR) / 2, y, netZ + 0.12 * Math.sin(((y - FLOOR) / (netTop - FLOOR)) * Math.PI) + 0.02);
    scene.add(strap);
  }

  /* ── A cargo door on the port skin, beside the bulk bay ── */
  const doorTex = keep(doorTexture());
  const doorGeo = keep(sweep(wallProfile(-1, 0.02, -0.75, -2.2, 10), 4.4, 5.75));
  // Stretch the texture over the door rather than tiling it.
  const doorUv = doorGeo.getAttribute('uv') as THREE.BufferAttribute;
  let uMax = 0;
  for (let i = 0; i < doorUv.count; i++) uMax = Math.max(uMax, doorUv.getX(i));
  for (let i = 0; i < doorUv.count; i++) doorUv.setXY(i, 1 - (doorUv.getY(i) - 4.4) / 1.35, 1 - doorUv.getX(i) / uMax);
  scene.add(new THREE.Mesh(doorGeo, keep(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }))));

  /* ── The bulkheads, fore and aft ── */
  const bulkShape = new THREE.Shape([...wallProfile(-1, 0, CEIL, FLOOR, 16), ...wallProfile(1, 0, FLOOR, CEIL, 16)]);
  const bulkGeo = keep(new THREE.ShapeGeometry(bulkShape));
  const bulkMat = keep(new THREE.MeshStandardMaterial({ color: '#3A404B', roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }));
  const fwd = new THREE.Mesh(bulkGeo, bulkMat);
  fwd.position.z = Z_FWD;
  const aft = new THREE.Mesh(bulkGeo, bulkMat);
  aft.position.z = Z_AFT;
  scene.add(fwd, aft);

  /* ── Light ── */
  scene.add(new THREE.HemisphereLight('#7C8AA6', '#1A1D24', 0.5));
  const lampXs: [number, number][] = [[0.35, 5.6], [-0.5, 2.0], [0.3, -1.9], [-0.4, -6.0], [0.2, -10.2]];
  const cordLen = 0.26;
  const beamTex = keep(beamTexture());
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: '#FFE3B0' }));
  const bulbGeo = keep(new THREE.SphereGeometry(0.055, 16, 12));
  const cageGeo = keep(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.1, 1)));
  const cageMat = keep(new THREE.LineBasicMaterial({ color: '#2A2F38' }));
  const cordGeo = keep(new THREE.CylinderGeometry(0.006, 0.006, cordLen, 5));
  cordGeo.translate(0, -cordLen / 2, 0);
  const beamGeo = keep(new THREE.ConeGeometry(0.95, 1.7, 24, 1, true));
  beamGeo.translate(0, -0.85, 0);
  const beamMat = keep(new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  const lamps = lampXs.map(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, CEIL - 0.16, z);
    const cord = new THREE.Mesh(cordGeo, cageMat);
    const head = new THREE.Group();
    head.position.y = -cordLen;
    head.add(new THREE.Mesh(bulbGeo, bulbMat), new THREE.LineSegments(cageGeo, cageMat), new THREE.Mesh(beamGeo, beamMat));
    head.add(new THREE.PointLight('#FFC98A', 5.5, 9, 2));
    pivot.add(cord, head);
    scene.add(pivot);
    return { pivot, phase: i * 1.7 };
  });

  /* ── Dust, turning slowly in the light ── */
  const dustCount = 480;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  const drand = seeded(0xd057);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (drand() - 0.5) * 3.6;
    dustPos[i * 3 + 1] = FLOOR + 0.2 + drand() * 1.5;
    dustPos[i * 3 + 2] = Z_FWD + 3 + drand() * (LENGTH - 5);
    dustSeed[i] = drand() * 100;
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustGeo.setAttribute('position', dustAttr);
  const dustBase = dustPos.slice();
  const dustMat = keep(new THREE.PointsMaterial({
    color: '#FFE2B8', size: 0.014, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(new THREE.Points(dustGeo, dustMat));

  /* ── Frame by frame ── */
  const DEG = Math.PI / 180;
  let lastFrost = -1;
  let swing = 0;
  let swingV = 0;

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  /* Never more than 60 frames a second, as in the cabin (see WorldScene): a
     120 Hz phone otherwise draws the hold twice as often for nothing. */
  let lastDrawn = 0;
  const render: CargoHoldHandles['render'] = (a, frost, look, nowMs) => {
    if (nowMs - lastDrawn < 1000 / 60 - 4) return;
    lastDrawn = nowMs;
    const t = nowMs / 1000;
    /* The aeroplane's lean, felt down here more than in the cabin: half the
       bank — that lean is turbulence — and all of a hand-flown roll. The
       camera goes with the airframe; gravity does not. */
    const lean = a.bank * 0.5 + a.roll;
    rig.rotation.set(-a.pitch * 0.35 * DEG, 0, -lean * DEG * 0.35);
    camera.rotation.set((VIEW.pitch + look.pitch) * DEG, (VIEW.yaw + look.yaw) * DEG, 0, 'YXZ');

    // The lamps hang plumb, so against the room they swing the other way.
    const target = lean * DEG * 0.5;
    swingV += (target - swing) * 0.02 - swingV * 0.04;
    swing += swingV;
    for (const lamp of lamps) {
      lamp.pivot.rotation.z = swing + Math.sin(t * 1.3 + lamp.phase) * 0.035;
      lamp.pivot.rotation.x = a.pitch * DEG * 0.3 + Math.cos(t * 1.1 + lamp.phase) * 0.025;
    }

    for (let i = 0; i < dustCount; i++) {
      const s = dustSeed[i];
      dustAttr.setXYZ(
        i,
        dustBase[i * 3] + Math.sin(t * 0.17 + s) * 0.22,
        dustBase[i * 3 + 1] + Math.sin(t * 0.11 + s * 1.7) * 0.16,
        dustBase[i * 3 + 2] + Math.cos(t * 0.13 + s) * 0.22,
      );
    }
    dustAttr.needsUpdate = true;

    if (Math.abs(frost - lastFrost) > 0.001) {
      lastFrost = frost;
      skinMat.color.copy(baseSkin).lerp(frostSkin, frost * 0.75);
      frostMat.opacity = frost * 0.85;
      metal.color.copy(baseMetal).lerp(frostMetal, frost * 0.75);
      for (const mat of uldMats) mat.color.setScalar(1).lerp(frostSkin, frost * 0.25);
      const fog = new THREE.Color('#07090E').lerp(new THREE.Color('#1A2332'), frost * 0.6);
      (scene.fog as THREE.FogExp2).color.copy(fog);
      (scene.background as THREE.Color).copy(fog);
    }

    if (!canDraw(scene, camera)) return;
    renderer.render(scene, camera);
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    rollers.dispose();
    bags.dispose();
    tags.dispose();
    handles.dispose();
    renderer.dispose();
  };

  return { resize, render, dispose };
}
