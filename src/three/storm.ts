import * as THREE from 'three';
import { createLightning } from './lightning';

/**
 * Rain and thunderstorms, in the weather band.
 *
 * Rain is streaks in a box of air that travels with the camera: each drop
 * falls and is swept back past the aeroplane by its own airspeed, so at
 * speed the rain comes at the lens nearly level, and the streak is as long
 * as the drop moves in a sixtieth of a second. The whole field lives on the
 * GPU; the CPU only moves one offset a frame.
 *
 * A storm adds lightning: every few seconds, somewhere out to the horizon,
 * a bolt from the cloud base to the ground — or a flash inside the cloud
 * that lights the whole sky and shows no channel at all. How bright the sky
 * is from it is handed back each frame, for the scene to light the clouds,
 * the haze and the aeroplane by; and when it happened and how far off, for
 * whoever is playing the thunder.
 */

export interface StormFrame {
  /** The camera's position in the world. */
  eye: THREE.Vector3;
  camera: THREE.Camera;
  /** The world going past the aeroplane, m/s: the flow world-fixed things are moved by. */
  flowX: number;
  flowZ: number;
  dt: number;
  /** 0–1: how hard it is raining. */
  rain: number;
  /** A thunderstorm is going on. */
  storm: boolean;
  /** Where the cloud base is, metres up. */
  cloudBase: number;
  /** 0 by day to 1 at night: rain catches less light after dark. */
  night: number;
}

export interface Storm {
  group: THREE.Group;
  /** Every frame. Returns how bright the sky is from lightning, 0–1. */
  update(f: StormFrame): number;
  /** The last flash: `performance.now()` when it went, and metres off. Null before the first. */
  readonly lastFlash: { at: number; distance: number } | null;
  /** Make a flash now, near or far: for the game to call one down where it wants. */
  flash(distance?: number): void;
  dispose(): void;
}

const BOX = new THREE.Vector3(260, 200, 260);

const RAIN_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 seed;
attribute float tip;
uniform vec3 uEye;
uniform vec3 uBox;
uniform vec3 uOffset;
uniform vec3 uVel;
uniform float uLen;
varying float vTip;
varying float vNear;
void main() {
  vec3 local = mod( seed * uBox + uOffset - uEye, uBox ) - uBox * 0.5;
  vec3 world = uEye + local - uVel * uLen * tip;
  vTip = tip;
  vNear = 1.0 - smoothstep( uBox.x * 0.25, uBox.x * 0.5, length( local ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
  #include <logdepthbuf_vertex>
}
`;
const RAIN_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uLevel;
uniform vec3 uColour;
varying float vTip;
varying float vNear;
void main() {
  #include <logdepthbuf_fragment>
  float a = uLevel * ( 1.0 - vTip ) * vNear;
  gl_FragColor = vec4( uColour, a );
}
`;

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Brightness of a flash, `t` seconds in: a stroke, a dim moment, two more strokes, weaker. */
const flashCurve = (t: number) => {
  if (t < 0) return 0;
  const pulse = (at: number, w: number, h: number) => h * Math.exp(-(((t - at) / w) ** 2));
  return Math.min(1, pulse(0.02, 0.04, 1) + pulse(0.16, 0.05, 0.75) + pulse(0.3, 0.06, 0.45) + pulse(0.5, 0.1, 0.2));
};

export function createStorm(options: { drops: number }): Storm {
  const group = new THREE.Group();
  const n = options.drops;
  const seeds = new Float32Array(n * 2 * 3);
  const tips = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    seeds.set([x, y, z, x, y, z], i * 6);
    tips[i * 2] = 0;
    tips[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  // Positions are worked out in the shader; this only sizes the draw.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('tip', new THREE.BufferAttribute(tips, 1));
  const uniforms = {
    uEye: { value: new THREE.Vector3() },
    uBox: { value: BOX.clone() },
    uOffset: { value: new THREE.Vector3() },
    uVel: { value: new THREE.Vector3() },
    uLen: { value: 0.02 },
    uLevel: { value: 0 },
    uColour: { value: new THREE.Color(0.75, 0.8, 0.88) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RAIN_VS,
    fragmentShader: RAIN_FS,
    transparent: true,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false;
  rain.renderOrder = 4;
  rain.visible = false;
  group.add(rain);

  const bolt = createLightning();
  group.add(bolt.group);
  const boltTo = new THREE.Vector3();
  const boltFrom = new THREE.Vector3();

  let next = rnd(1.5, 4);
  let since = Infinity;
  let last: { at: number; distance: number } | null = null;
  let pending: number | null = null;
  const fall = new THREE.Vector3();

  const flash = (distance?: number) => {
    pending = distance ?? rnd(1200, 7000);
  };

  const update: Storm['update'] = (f) => {
    const raining = f.rain > 0.01;
    rain.visible = raining;
    if (raining) {
      // Falling at nine metres a second, and swept back past the aeroplane at its speed.
      fall.set(f.flowX, -9, f.flowZ);
      const off = uniforms.uOffset.value;
      off.addScaledVector(fall, f.dt);
      off.set(off.x % BOX.x, off.y % BOX.y, off.z % BOX.z);
      uniforms.uVel.value.copy(fall);
      uniforms.uLen.value = 0.018;
      uniforms.uEye.value.copy(f.eye);
      uniforms.uLevel.value = f.rain * (0.55 - 0.3 * f.night);
    }

    // Thunderstorms: a flash every few seconds, from somewhere out to the horizon.
    if (f.storm) {
      next -= f.dt;
      if (next <= 0 && pending === null) {
        flash();
        next = rnd(2.5, 7.5);
      }
    }
    if (pending !== null) {
      const d = pending;
      pending = null;
      since = 0;
      last = { at: performance.now(), distance: d };
      // Two in three show the channel; the rest are inside the cloud.
      if (Math.random() < 0.66) {
        const a = Math.random() * Math.PI * 2;
        boltTo.set(f.eye.x + Math.cos(a) * d, 0, f.eye.z + Math.sin(a) * d);
        boltFrom.set(boltTo.x + rnd(-500, 500), Math.max(f.cloudBase, f.eye.y + 500), boltTo.z + rnd(-500, 500));
        bolt.strike(boltTo, 1, boltFrom, 2.5 + d / 900);
      }
    }
    since += f.dt;
    const channel = bolt.side ? bolt.update(f.dt, boltTo, f.camera) : 0;
    const sheet = since < 1.2 && last ? flashCurve(since) * (1 - Math.min(0.75, last.distance / 12000)) : 0;
    return Math.max(channel * 0.85, sheet);
  };

  return {
    group,
    update,
    get lastFlash() { return last; },
    flash,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      bolt.dispose();
    },
  };
}
