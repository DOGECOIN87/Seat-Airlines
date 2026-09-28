import * as THREE from 'three';
import { presence, type Thermal } from '../lib/thermals';

/**
 * Thermals, drawn (see lib/thermals.ts for the air itself).
 *
 * Each is what a pilot looks for over warm country: a cumulus cloud sitting
 * on top of the rising air, and — nearer — the air itself, a faint column of
 * heat shimmer streaming upward from the ground with specks of dust and
 * chaff carried up in it. The column is brightest at its rim, where you look
 * through the most of it, so from outside it reads as a pillar; from inside
 * it is a haze all round. Everything fades with the thermal as it builds
 * and dies.
 *
 * A handful at most, so each is a few draws: the cloud a cluster of soft
 * billboards, the column one open cylinder, the dust one point cloud.
 */

export interface ThermalsCraft {
  group: THREE.Group;
  /** Every frame, with the thermals about (positions relative to the aeroplane) and how dark it is, 0 day to 1 night. */
  update(dt: number, list: readonly Thermal[] | undefined, night: number): void;
  dispose(): void;
}

const MOST = 3;
const PUFFS = 9;
const MOTES = 90;

/** A soft round puff for the cloud, lumpy at the edge; and a small clean dot for the dust. */
function puffTexture(lumpy: boolean): THREE.CanvasTexture {
  const n = lumpy ? 128 : 32;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = 0x2545f491;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const blob = (x: number, y: number, r: number, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  if (lumpy) {
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * n * 0.18;
      blob(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d * 0.7, n * (0.18 + rand() * 0.16), 0.5);
    }
  } else {
    blob(n / 2, n / 2, n / 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* The column: streaks of shimmer rising up an open cylinder, strongest at
   its rim and fading out at the ground and under the cloud. Written with the
   scene's logarithmic depth, like everything else drawn by hand here. */
const COLUMN_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying float vRim;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vec3 toEye = normalize( cameraPosition - world.xyz );
  vec3 n = normalize( mat3( modelMatrix ) * normal );
  vRim = 1.0 - abs( dot( n, toEye ) );
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;
const COLUMN_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uLevel;
uniform vec3 uTint;
varying vec2 vUv;
varying float vRim;
void main() {
  #include <logdepthbuf_fragment>
  float y = vUv.y;
  float rise = y * 6.0 - uTime * 0.35;
  float streak = 0.5 + 0.5 * sin( vUv.x * 80.0 + sin( rise * 3.1 ) * 1.6 + rise * 2.0 );
  streak *= 0.55 + 0.45 * sin( vUv.x * 23.0 - rise * 4.7 );
  float ends = smoothstep( 0.0, 0.12, y ) * ( 1.0 - smoothstep( 0.72, 1.0, y ) );
  float a = uLevel * ends * ( 0.35 + 0.65 * pow( vRim, 1.6 ) ) * ( 0.35 + 0.65 * streak ) * 0.16;
  gl_FragColor = vec4( uTint * a, a );
}
`;

export function createThermalsCraft(): ThermalsCraft {
  const group = new THREE.Group();
  const puffTex = puffTexture(true);
  const dotTex = puffTexture(false);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  cylinder.translate(0, 0.5, 0);
  const owned: { dispose(): void }[] = [puffTex, dotTex, cylinder];

  const slots = Array.from({ length: MOST }, (_, s) => {
    const slot = new THREE.Group();
    slot.visible = false;
    group.add(slot);

    const columnMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uTint: { value: new THREE.Color(1, 0.94, 0.82) } },
      vertexShader: COLUMN_VS,
      fragmentShader: COLUMN_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const column = new THREE.Mesh(cylinder, columnMat);
    column.frustumCulled = false;
    column.renderOrder = 2;
    slot.add(column);

    const puffs = Array.from({ length: PUFFS }, (_, i) => {
      const mat = new THREE.SpriteMaterial({ map: puffTex, color: 0xffffff, transparent: true, depthWrite: false, fog: true });
      const sprite = new THREE.Sprite(mat);
      // Where in the cloud, as a share of its width, and how big: a cumulus is a heap, tallest in the middle.
      const a = (i / PUFFS) * Math.PI * 2 + s;
      const d = i === 0 ? 0 : 0.35 + 0.35 * ((i * 0.618) % 1);
      sprite.userData = { dx: Math.cos(a) * d, dz: Math.sin(a) * d, dy: (1 - d) * 0.45 + ((i * 0.37) % 0.2), size: 1.05 - d * 0.55 };
      slot.add(sprite);
      owned.push(mat);
      return sprite;
    });

    const positions = new Float32Array(MOTES * 3);
    const seeds = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      seeds[i * 3] = Math.random() * Math.PI * 2;
      seeds[i * 3 + 1] = Math.sqrt(Math.random());
      seeds[i * 3 + 2] = Math.random();
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const moteMat = new THREE.PointsMaterial({
      map: dotTex, color: 0xffe8b8, size: 7, sizeAttenuation: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    slot.add(motes);
    owned.push(columnMat, moteGeo, moteMat);
    return { slot, column, columnMat, puffs, motes, positions, seeds, moteGeo, moteMat };
  });

  let clock = 0;
  const update: ThermalsCraft['update'] = (dt, list, night) => {
    clock += dt;
    const shade = 1 - 0.72 * night;
    slots.forEach((s, i) => {
      const t = list?.[i];
      if (!t) {
        s.slot.visible = false;
        return;
      }
      const level = presence(t);
      s.slot.visible = level > 0.01;
      if (!s.slot.visible) return;
      s.slot.position.set(t.x, 0, t.z);
      // The column, ground to the cloud's base.
      const top = t.cap;
      s.column.scale.set(t.r, top, t.r);
      s.columnMat.uniforms.uTime.value = clock;
      s.columnMat.uniforms.uLevel.value = level * (0.55 + 0.45 * shade);
      // The cloud: a heap of puffs as wide as the rising air under it.
      const width = t.r * 1.5;
      for (const p of s.puffs) {
        const u = p.userData as { dx: number; dz: number; dy: number; size: number };
        p.position.set(u.dx * width, top + u.dy * width * 0.5, u.dz * width);
        p.scale.setScalar(width * u.size);
        const m = p.material as THREE.SpriteMaterial;
        m.opacity = 0.92 * level;
        m.color.setScalar(shade);
      }
      // The dust, carried up and round, and back to the ground when it reaches the cloud.
      for (let k = 0; k < MOTES; k++) {
        const ang = s.seeds[k * 3] + clock * 0.08;
        const rr = s.seeds[k * 3 + 1] * t.r * 0.95;
        const y = ((s.seeds[k * 3 + 2] + clock * 0.035) % 1) * top;
        s.positions[k * 3] = Math.cos(ang) * rr;
        s.positions[k * 3 + 1] = y;
        s.positions[k * 3 + 2] = Math.sin(ang) * rr;
      }
      (s.moteGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      s.moteMat.opacity = 0.75 * level * (0.4 + 0.6 * shade);
      s.moteMat.size = 7;
    });
  };

  return {
    group,
    update,
    dispose: () => owned.forEach((d) => d.dispose()),
  };
}
