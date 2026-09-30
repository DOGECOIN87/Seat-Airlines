import * as THREE from 'three';

/**
 * The city: nothing but skyscrapers, block after block, to the horizon.
 *
 * Two layers, the same trick the farmland plays. The ground itself is
 * painted as a street grid of roofs (`cityTextures`), which carries the city
 * out to the haze for nothing; the towers stand on it in the round
 * (`createSkyline`) for the few kilometres round the aircraft where you can
 * see that they are towers.
 *
 * The towers cost nothing on the CPU. They are one instanced box, a slot per
 * block of a square lattice centred under the aircraft; the vertex shader
 * slides the lattice with the ground and, as a block leaves one edge and
 * re-enters at the other, reads which block of the endless city it now is
 * from the block's own coordinates, so a tower keeps its height, footprint
 * and windows for as long as it is in view and the city never visibly
 * repeats. Toward the rim of the lattice the towers sink into the painted
 * roofs, so there is no edge to it.
 */

/** Metres from one street to the next, both ways. */
export const CITY_BLOCK = 160;
/** Metres: the tallest tower. Well under the lowest the aircraft flies. */
export const CITY_TOP = 460;
/** Blocks on a side of one tile of the painted city. */
const TILE_BLOCKS = 8;
/** Metres across one tile of the painted city. */
export const CITY_TILE = CITY_BLOCK * TILE_BLOCKS;
/** The block pattern repeats this many blocks along each axis: more than the lattice is wide, so never twice in view. */
const PERIOD = 97;

export interface CityTextures {
  day: THREE.CanvasTexture;
  night: THREE.CanvasTexture;
}

/** A seeded generator, so the painted city is the same city every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One tile of the city from above: asphalt streets on the block lines, and a
 * roof on every block. By night the streets are strings of sodium lamps and
 * the roofs are dark but for what is lit inside.
 */
export function cityTextures(size = 1024): CityTextures {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const dayC = make();
  const nightC = make();
  const d = dayC.getContext('2d')!;
  const n = nightC.getContext('2d')!;
  const cell = size / TILE_BLOCKS;
  const street = Math.round(cell * 0.14);
  const rand = rng(0x5ea7c17e);

  d.fillStyle = '#34373c';
  d.fillRect(0, 0, size, size);
  n.fillStyle = '#000';
  n.fillRect(0, 0, size, size);

  // Lane markings down the middle of every street.
  d.strokeStyle = 'rgba(214, 206, 170, 0.35)';
  d.lineWidth = 1;
  d.setLineDash([4, 5]);
  for (let k = 0; k <= TILE_BLOCKS; k++) {
    const at = k * cell + 0.5;
    d.beginPath(); d.moveTo(at, 0); d.lineTo(at, size); d.stroke();
    d.beginPath(); d.moveTo(0, at); d.lineTo(size, at); d.stroke();
  }
  d.setLineDash([]);

  // Street lamps: a warm string along both kerbs of every street.
  n.fillStyle = 'rgba(255, 176, 92, 0.95)';
  for (let k = 0; k <= TILE_BLOCKS; k++) {
    const mid = k * cell;
    for (let s = 0; s < size; s += 9) {
      for (const kerb of [-street / 2 + 1, street / 2 - 2]) {
        n.fillRect(mid + kerb, s, 1.6, 1.6);
        n.fillRect(s, mid + kerb, 1.6, 1.6);
      }
    }
  }
  // Traffic: white heads one way, red tails the other.
  for (let i = 0; i < 700; i++) {
    const along = rand() * size;
    const k = Math.floor(rand() * (TILE_BLOCKS + 1)) * cell;
    const side = rand() < 0.5 ? -1 : 1;
    const x = rand() < 0.5;
    n.fillStyle = side < 0 ? 'rgba(255, 246, 225, 0.9)' : 'rgba(255, 60, 40, 0.85)';
    if (x) n.fillRect(along, k + side * street * 0.2, 1.4, 1.4);
    else n.fillRect(k + side * street * 0.2, along, 1.4, 1.4);
  }

  // Roofs.
  const roofs = ['#6f747c', '#5b6068', '#81868e', '#4c5159', '#8a8378', '#6a6560', '#3f444c', '#767c86'];
  for (let i = 0; i < TILE_BLOCKS; i++) {
    for (let j = 0; j < TILE_BLOCKS; j++) {
      const x0 = i * cell + street / 2;
      const y0 = j * cell + street / 2;
      const w = cell - street;
      d.fillStyle = roofs[Math.floor(rand() * roofs.length)];
      d.fillRect(x0, y0, w, w);
      // A tower's own shadow, and a lighter parapet round the edge.
      d.fillStyle = 'rgba(0, 0, 0, 0.28)';
      d.fillRect(x0 + w * 0.55, y0 + w * 0.1, w * 0.45, w * 0.9);
      d.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      d.lineWidth = 2;
      d.strokeRect(x0 + 1, y0 + 1, w - 2, w - 2);
      // Plant on the roof: a few boxes, a helipad now and then.
      for (let k = 0; k < 4; k++) {
        d.fillStyle = rand() < 0.5 ? '#9aa0a8' : '#50555c';
        d.fillRect(x0 + rand() * w * 0.7, y0 + rand() * w * 0.7, 4 + rand() * w * 0.18, 4 + rand() * w * 0.18);
      }
      if (rand() < 0.12) {
        d.strokeStyle = 'rgba(240, 240, 240, 0.7)';
        d.beginPath();
        d.arc(x0 + w / 2, y0 + w / 2, w * 0.2, 0, Math.PI * 2);
        d.stroke();
      }
      // By night, whatever is lit on the top floors, and a red warning lamp.
      for (let k = 0; k < 26; k++) {
        n.fillStyle = rand() < 0.8 ? 'rgba(255, 214, 150, 0.8)' : 'rgba(170, 210, 255, 0.75)';
        n.fillRect(x0 + rand() * w, y0 + rand() * w, 1.6, 1.6);
      }
      n.fillStyle = 'rgba(255, 40, 30, 1)';
      n.fillRect(x0 + w / 2 - 1, y0 + w / 2 - 1, 3, 3);
    }
  }

  const tex = (c: HTMLCanvasElement, colour: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { day: tex(dayC, true), night: tex(nightC, true) };
}

const fract = (v: number) => v - Math.floor(v);
/** `skHash` in the shader, on the CPU. */
function hash(x: number, y: number): number {
  let qx = fract(x * 0.1031), qy = fract(y * 0.103), qz = fract(x * 0.0973);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract((qx + qy) * qz);
}

/**
 * The top of whatever tower stands at (x, z) this frame, metres above the
 * datum, or 0 on the street: the same block, height and footprint the vertex
 * shader draws there, for anything that has to hit what it sees. Towers are
 * at full height near the aircraft, so the lattice's rim does not come into it.
 */
export function towerTopAt(x: number, z: number, shiftX: number, shiftZ: number, rise: number): number {
  if (rise <= 0) return 0;
  const gx = Math.floor((x + shiftX) / CITY_BLOCK);
  const gz = Math.floor((z - shiftZ) / CITY_BLOCK);
  const bx = ((gx % PERIOD) + PERIOD) % PERIOD;
  const bz = ((gz % PERIOD) + PERIOD) % PERIOD;
  const r1 = hash(bx, bz);
  const r2 = hash(bx + 17.13, bz + 17.13);
  const r3 = hash(bx + 41.71, bz + 41.71);
  const fx = (0.5 + 0.3 * r2) * CITY_BLOCK;
  const fz = (0.5 + 0.3 * r3) * CITY_BLOCK;
  const cx = (gx + 0.5) * CITY_BLOCK - shiftX + (r3 - 0.5) * (CITY_BLOCK * 0.8 - fx);
  const cz = (gz + 0.5) * CITY_BLOCK + shiftZ + (r2 - 0.5) * (CITY_BLOCK * 0.8 - fz);
  if (Math.abs(x - cx) > fx / 2 || Math.abs(z - cz) > fz / 2) return 0;
  const tall = 60 + (CITY_TOP - 60) * Math.pow(r1, 2.6);
  return Math.max(0, tall * rise - 3);
}

export interface SkylineFrame {
  /** Metres the ground has slid since the view opened (WorldScene's `shift`). */
  shiftX: number;
  shiftZ: number;
  /** 0–1: how far the towers have risen out of the ground. */
  rise: number;
  /** 0–1: how dark it has got, for the windows. */
  night: number;
}

export interface SkylineHandles {
  mesh: THREE.Mesh;
  update: (f: SkylineFrame) => void;
  dispose: () => void;
}

const VERTEX_PARS = /* glsl */ `
attribute vec2 cell;
attribute float tier;
uniform vec2 skBase;
uniform vec2 skSlide;
uniform float skRise;
uniform float skHalf;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying float vSkSeed;
float skHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
`;

/* Which block this slot is, and so what stands on it: a footprint, a height
   weighted hard toward the ordinary with the odd supertall, and for some a
   setback crown on top. Then slid with the ground, and sunk toward the rim. */
const VERTEX = /* glsl */ `
vec2 block = mod( cell + skBase, ${PERIOD.toFixed(1)} );
float r1 = skHash( block );
float r2 = skHash( block + 17.13 );
float r3 = skHash( block + 41.71 );
float r4 = skHash( block + 73.37 );
vec2 centre = ( cell - skHalf + 0.5 ) * ${CITY_BLOCK.toFixed(1)} + skSlide;
float rim = 1.0 - smoothstep( 0.6, 0.97, length( centre ) / ( skHalf * ${CITY_BLOCK.toFixed(1)} ) );
float tall = mix( 60.0, ${CITY_TOP.toFixed(1)}, pow( r1, 2.6 ) );
float height = tall * skRise * rim;
vec2 foot = vec2( mix( 0.5, 0.8, r2 ), mix( 0.5, 0.8, r3 ) ) * ${CITY_BLOCK.toFixed(1)};
// Setback: the crown is narrower on the towers that have one.
float crown = r4 < 0.55 ? mix( 0.55, 0.8, r4 / 0.55 ) : 1.0;
foot *= mix( 1.0, crown, tier );
vec3 transformed = vec3( position.x * foot.x, position.y * height, position.z * foot.y );
transformed.xz += centre + ( vec2( r3, r2 ) - 0.5 ) * ( ${CITY_BLOCK.toFixed(1)} * 0.8 - foot );
transformed.y -= 3.0;
vSkAt = vec3( position.x * foot.x, position.y * height, position.z * foot.y );
vSkNormal = normal;
vSkSeed = r1 + r2 * 7.0;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float skNight;
varying vec3 vSkAt;
varying vec3 vSkNormal;
varying float vSkSeed;
float skHash2( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
`;

/* A curtain wall: a window every 3.4 m along, a floor every 3.8 m up. Past
   the point where a window is under a pixel it fades to the wall's average,
   so a tower three kilometres off is a tone rather than a moiré. */
const FRAGMENT = /* glsl */ `
float skWall = 1.0 - step( 0.5, abs( vSkNormal.y ) );
float skAlong = abs( vSkNormal.x ) > 0.5 ? vSkAt.z : vSkAt.x;
vec2 skWc = vec2( skAlong / 3.4, vSkAt.y / 3.8 );
vec2 skId = floor( skWc );
vec2 skF = fract( skWc );
float skPane = step( 0.14, skF.x ) * step( skF.x, 0.86 ) * step( 0.2, skF.y ) * step( skF.y, 0.86 );
float skBlur = smoothstep( 0.3, 0.8, max( fwidth( skWc.x ), fwidth( skWc.y ) ) );
float skGlass = mix( skPane, 0.53, skBlur ) * skWall;
float skStyle = fract( vSkSeed * 3.1 );
vec3 skFrame = skStyle < 0.4 ? vec3( 0.62, 0.64, 0.67 ) : skStyle < 0.7 ? vec3( 0.52, 0.46, 0.40 ) : vec3( 0.30, 0.33, 0.37 );
vec3 skPaneCol = skStyle < 0.7 ? vec3( 0.10, 0.16, 0.22 ) : vec3( 0.16, 0.26, 0.30 );
diffuseColor.rgb = skWall > 0.5 ? mix( skFrame, skPaneCol, skGlass ) : vec3( 0.26, 0.27, 0.29 );
float skLit = step( 0.58, skHash2( skId + vec2( vSkSeed * 91.0, floor( vSkSeed * 13.0 ) ) ) );
float skGlow = mix( skLit * skPane, 0.42 * 0.53, skBlur ) * skWall;
`;

/**
 * The towers, a lattice `blocks` wide round the aircraft. Hidden until the
 * city comes in.
 */
export function createSkyline(o: { blocks: number; envMap?: THREE.Texture }): SkylineHandles {
  const n = o.blocks;
  // Two stacked boxes, base on the ground: the shaft, and a crown that some towers set back.
  const shaft = new THREE.BoxGeometry(1, 0.72, 1).translate(0, 0.36, 0);
  const crown = new THREE.BoxGeometry(1, 0.28, 1).translate(0, 0.86, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  {
    const parts = [shaft, crown];
    const pos: number[] = [];
    const nor: number[] = [];
    const tier: number[] = [];
    const index: number[] = [];
    parts.forEach((g, k) => {
      const base = pos.length / 3;
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) tier.push(k);
      for (const i of g.index!.array) index.push(base + i);
      // The crown has no floor to show; the shaft has no roof under it.
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute('tier', new THREE.Float32BufferAttribute(tier, 1));
    geometry.setIndex(index);
    shaft.dispose();
    crown.dispose();
  }
  const cells = new Float32Array(n * n * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells[(i * n + j) * 2] = i;
      cells[(i * n + j) * 2 + 1] = j;
    }
  }
  geometry.setAttribute('cell', new THREE.InstancedBufferAttribute(cells, 2));
  geometry.instanceCount = n * n;

  const uniforms = {
    skBase: { value: new THREE.Vector2() },
    skSlide: { value: new THREE.Vector2() },
    skRise: { value: 0 },
    skHalf: { value: n / 2 },
    skNight: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.25,
    envMap: o.envMap ?? null,
    envMapIntensity: 0.8,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.75, 0.12, skGlass );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( 0.05, 0.6, skGlass );')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3( 1.0, 0.8, 0.52 ) * skGlow * skNight * 1.6;',
      );
  };
  material.customProgramCacheKey = () => 'skyline';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const mod = (v: number, m: number) => ((v % m) + m) % m;
  const update = (f: SkylineFrame) => {
    mesh.visible = f.rise > 0.002;
    if (!mesh.visible) return;
    /* A tower on block (gx, gz) of the endless city stands at
       x = (gx + ½)·B − shiftX, z = (gz + ½)·B + shiftZ: on the same street
       lines the painted ground draws, and carried the same way. */
    const bx = Math.floor(f.shiftX / CITY_BLOCK);
    const bz = Math.floor(f.shiftZ / CITY_BLOCK);
    uniforms.skBase.value.set(mod(bx - n / 2, PERIOD), mod(-bz - n / 2, PERIOD));
    uniforms.skSlide.value.set(-(f.shiftX - bx * CITY_BLOCK), f.shiftZ - bz * CITY_BLOCK);
    uniforms.skRise.value = f.rise;
    uniforms.skNight.value = f.night;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  return { mesh, update, dispose };
}
