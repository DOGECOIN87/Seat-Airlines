import * as THREE from 'three';
import { presenceOf, type Twister } from '../lib/tornado';

/**
 * Tornadoes, drawn (see lib/tornado.ts for the wind itself).
 *
 * Each is a funnel from the ground to the cloud base — narrow where it
 * touches down, flaring into the wall cloud above — and a skirt of debris
 * thrown out round its foot. Both are one open tube with a shader of their
 * own: bands of condensation and dust streaming round and up it, faster
 * near the ground, bent into a lazy S by the storm's shear, thickest at the
 * rim where you look through the most of it so the funnel reads solid from
 * any side. They touch down growing out of the ground and lift away into
 * the cloud at the end. A handful at most, so each is two draws.
 */

export interface TwisterCraft {
  group: THREE.Group;
  /**
   * Every frame: the funnels about (from the aeroplane, on the world's
   * axes), the ground's height and the cloud base's, how dark it is, and
   * how bright a lightning flash has the sky.
   */
  update(dt: number, list: readonly Twister[] | undefined, ground: number, base: number, night: number, flash: number): void;
  dispose(): void;
}

const MOST = 3;

/* Written with the scene's logarithmic depth, like everything else drawn by hand here. */
const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTime;
uniform float uFoot;
uniform float uTop;
uniform float uSway;
uniform float uSeed;
varying float vH;
varying float vAngle;
varying float vRim;
varying float vDist;
void main() {
  // A unit tube: y 0 at the ground to 1 at the cloud, radius 1.
  float h = position.y;
  float a = atan(position.z, position.x);
  // Narrow at the foot, flaring at the top; growing up out of the ground as it touches down.
  float r = mix(uFoot, uTop, pow(h, 1.7));
  r *= 0.75 + 0.25 * sin(h * 9.0 - uTime * 2.3 + uSeed);
  vec3 p = vec3(cos(a) * r, h, sin(a) * r);
  // The storm's shear: the column bends, and the bend wanders.
  p.x += sin(h * 3.1 + uTime * 0.35 + uSeed) * uSway * h;
  p.z += cos(h * 2.3 + uTime * 0.27 + uSeed * 1.7) * uSway * 0.6 * h;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 view = viewMatrix * world;
  vH = h;
  vAngle = a;
  vec3 n = normalize(mat3(modelMatrix) * vec3(cos(a), 0.0, sin(a)));
  vRim = 1.0 - abs(dot(n, normalize(cameraPosition - world.xyz)));
  vDist = -view.z;
  gl_Position = projectionMatrix * view;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uSpin;
uniform float uOpacity;
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uSeed;
uniform float uDebris;
uniform float uGrow;
varying float vH;
varying float vAngle;
varying float vRim;
varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  // Bands streaming round and up: faster low down, where the wind is.
  float speed = mix(9.0, 3.0, vH);
  float a = vAngle * uSpin;
  float s1 = sin(a * 6.0 + vH * 22.0 - uTime * speed + uSeed) * 0.5 + 0.5;
  float s2 = sin(a * 11.0 - vH * 37.0 - uTime * speed * 1.6 + uSeed * 2.3) * 0.5 + 0.5;
  float s3 = sin(a * 3.0 + vH * 7.0 - uTime * speed * 0.6) * 0.5 + 0.5;
  float streak = smoothstep(0.25, 0.95, s1 * 0.5 + s2 * 0.3 + s3 * 0.2);
  float rim = pow(clamp(vRim, 0.0, 1.0), 1.3);
  float alpha = (0.55 + 0.4 * streak) * (0.55 + 0.45 * rim);
  // Soft at the cloud and in the ground; the debris skirt fades out at its top.
  alpha *= smoothstep(0.0, 0.04, vH) * (1.0 - smoothstep(mix(0.8, 0.35, uDebris), 1.0, vH));
  // Touching down, it reaches down out of the cloud; lifting, it goes back up into it.
  alpha *= mix(uGrow, smoothstep(1.0 - uGrow - 0.06, 1.0 - uGrow + 0.06, vH), 1.0 - uDebris);
  // Into the haze with distance.
  alpha *= 1.0 - smoothstep(6000.0, 14000.0, vDist);
  vec3 col = mix(uDark, uLight, streak * 0.7 + vH * 0.25);
  gl_FragColor = vec4(col, alpha * uOpacity);
}`;

export function createTwisterCraft(): TwisterCraft {
  const group = new THREE.Group();
  const tube = new THREE.CylinderGeometry(1, 1, 1, 48, 40, true);
  tube.translate(0, 0.5, 0);
  const owned: { dispose(): void }[] = [tube];
  const make = (debris: boolean) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFoot: { value: 0.06 },
        uTop: { value: 1 },
        uSway: { value: 0.15 },
        uGrow: { value: 1 },
        uSeed: { value: Math.random() * 10 },
        uSpin: { value: 1 },
        uOpacity: { value: 1 },
        uDark: { value: new THREE.Color(debris ? 0x3b2f25 : 0x3a3f47) },
        uLight: { value: new THREE.Color(debris ? 0x8a7560 : 0x9aa3ad) },
        uDebris: { value: debris ? 1 : 0 },
      },
    });
    owned.push(mat);
    const mesh = new THREE.Mesh(tube, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  };
  const pool = Array.from({ length: MOST }, () => {
    const funnel = make(false);
    const skirt = make(true);
    const g = new THREE.Group();
    g.add(funnel, skirt);
    g.visible = false;
    group.add(g);
    return { g, funnel, skirt };
  });
  const SHADE = {
    funnel: { dark: new THREE.Color(0x1d2026), light: new THREE.Color(0x646b74) },
    skirt: { dark: new THREE.Color(0x2e241b), light: new THREE.Color(0x7a6650) },
  };
  let clock = 0;

  const update: TwisterCraft['update'] = (dt, list, ground, base, night, flash) => {
    clock += dt;
    pool.forEach((p, i) => {
      const t = list?.[i];
      p.g.visible = Boolean(t);
      if (!t) return;
      const here = presenceOf(t);
      const height = Math.max(400, base - ground);
      p.g.position.set(t.x, ground - 8, t.z);
      // The funnel: its wall at the core's radius near the ground, flaring to the wall cloud.
      p.funnel.scale.set(t.reach * 0.8, height, t.reach * 0.8);
      p.skirt.scale.set(t.core * 2.6, Math.min(260, height * 0.15), t.core * 2.6);
      // Day, dusk and the flash light it; at night it is a shape against the lightning.
      const lit = Math.max(1 - night * 0.8, flash);
      for (const [mesh, foot, top, sway] of [[p.funnel, (t.core * 0.7) / (t.reach * 0.8), 1, 0.12], [p.skirt, 0.55, 1, 0]] as const) {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = clock;
        u.uFoot.value = foot;
        u.uTop.value = top;
        u.uSway.value = sway;
        u.uGrow.value = here;
        u.uSpin.value = t.spin;
        u.uOpacity.value = mesh === p.skirt ? here : 1;
        const shade = mesh === p.skirt ? SHADE.skirt : SHADE.funnel;
        (u.uDark.value as THREE.Color).copy(shade.dark).multiplyScalar(0.35 + 0.65 * lit);
        (u.uLight.value as THREE.Color).copy(shade.light).multiplyScalar(0.3 + 0.7 * lit);
      }
    });
  };

  return { group, update, dispose: () => owned.forEach((o) => o.dispose()) };
}
