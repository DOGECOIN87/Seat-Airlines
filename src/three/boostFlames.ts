import * as THREE from 'three';
import { ENGINE_AT } from './airframe';

/**
 * The boost: fire out of the turbines.
 *
 * When the button goes down, the engines still turning — the one that is
 * left, or both if none has gone — light a gout of flame out of each
 * exhaust: a cone of it streaming aft, white-yellow at the nozzle and
 * dying orange down its length, flickering as it burns, with a soft glow
 * where it leaves the metal. It rides the airframe, so it banks and pitches
 * with the aeroplane, and it is unlit and additive throughout — no light
 * arrives mid-flight, which would recompile every lit material in the scene
 * at the worst moment.
 */

export interface BoostFlames {
  group: THREE.Group;
  /** Every frame: 0–1 how much boost is on, and which engines are lighting it. */
  update(dt: number, boost?: { level: number; port: boolean; starboard: boolean }): void;
  dispose(): void;
}

/** Where the flame starts: just out of the nozzle, in the airframe's frame. */
const AT = { x: ENGINE_AT.x, y: ENGINE_AT.y, z: ENGINE_AT.z + 2.6 } as const;
const LENGTH = 13;
const RADIUS = 0.95;

/* The flame: a cone, wide at the nozzle and tapering aft, hottest at the
   metal. Written with the scene's logarithmic depth, like everything else
   drawn by hand here. */
const FLAME_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #include <logdepthbuf_vertex>
}
`;
const FLAME_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uLevel;
uniform float uFlicker;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  // v goes 0 at the nozzle to 1 at the tip.
  float v = vUv.y;
  vec3 hot = vec3(1.0, 0.96, 0.72);
  vec3 mid = vec3(1.0, 0.45, 0.08);
  vec3 col = mix(hot, mid, smoothstep(0.0, 0.55, v));
  float body = pow(1.0 - v, 1.6);
  float streaks = 0.72 + 0.28 * sin(vUv.x * 40.0 + uFlicker * 31.0 + sin(v * 9.0 - uFlicker * 17.0) * 2.0);
  float a = uLevel * body * streaks;
  gl_FragColor = vec4(col * a * 2.2, a);
}
`;

function glowTexture(): THREE.CanvasTexture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, 'rgba(255,220,150,1)');
  grd.addColorStop(0.35, 'rgba(255,150,60,0.55)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBoostFlames(): BoostFlames {
  const group = new THREE.Group();
  const glowTex = glowTexture();
  const owned: { dispose(): void }[] = [glowTex];

  const coneGeo = new THREE.ConeGeometry(RADIUS, LENGTH, 20, 1, true);
  // Apex aft: the cone's +y becomes +z, then the base sits at the nozzle.
  coneGeo.rotateX(Math.PI / 2);
  coneGeo.translate(0, 0, LENGTH / 2);
  owned.push(coneGeo);

  const sides = [-1, 1].map((side) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uLevel: { value: 0 }, uFlicker: { value: Math.random() * 100 } },
      vertexShader: FLAME_VS,
      fragmentShader: FLAME_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(coneGeo, mat);
    flame.frustumCulled = false;
    flame.renderOrder = 3;
    const holder = new THREE.Group();
    holder.position.set(AT.x * side, AT.y, AT.z);
    holder.add(flame);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffb060, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(4.2);
    glow.position.set(AT.x * side, AT.y, AT.z - 0.4);
    holder.add(glow);
    holder.visible = false;
    group.add(holder);
    owned.push(mat, glowMat);
    return { holder, mat, glowMat, flame, seed: Math.random() * 100 };
  });

  let clock = 0;
  // The level eases toward the button, so the fire lights and dies in a breath rather than a cut.
  let level = 0;

  const update: BoostFlames['update'] = (dt, boost) => {
    clock += dt;
    const want = boost?.level ?? 0;
    level += (want - level) * (1 - Math.exp(-9 * dt));
    if (level < 0.01 && want === 0) {
      for (const s of sides) s.holder.visible = false;
      return;
    }
    const port = boost?.port ?? false;
    const starboard = boost?.starboard ?? false;
    sides.forEach((s, i) => {
      const on = (i === 0 ? port : starboard) && level > 0.01;
      s.holder.visible = on;
      if (!on) return;
      const flick = 0.82 + 0.18 * Math.sin(clock * 43 + s.seed) * Math.sin(clock * 27 + s.seed * 2);
      s.mat.uniforms.uLevel.value = level * flick;
      s.mat.uniforms.uFlicker.value = clock;
      // The flame stretches and breathes as it burns.
      s.flame.scale.set(1, 1, (0.85 + 0.3 * flick) * (0.6 + 0.4 * level));
      s.glowMat.opacity = 0.85 * level * flick;
    });
  };

  return {
    group,
    update,
    dispose: () => owned.forEach((d) => d.dispose()),
  };
}
