import * as THREE from 'three';
import { AIRLINER_MESH } from './airlinerMesh';
import { ENGINE_AT } from './airframe';
import { radialTexture } from './terrain';

/**
 * The afterburners, for the landing's game: a long lance of flame out of the
 * back of each engine that is lit, white-blue at the nozzle through orange to
 * a ragged red tail, banded with shock diamonds, throwing sparks aft and a
 * hot light on the wing and the tail.
 *
 * Built in the airframe's own frame and added to it, so it rides the
 * aeroplane through every bank and pitch.
 */

export interface BoostFlame {
  /** Added to the airframe's group. */
  group: THREE.Group;
  /** Every frame: how hard each engine is burning, 0–1, port and starboard. */
  update(dt: number, port: number, starboard: number): void;
  dispose(): void;
}

const LENGTH = 16;
const SPARKS = 140;

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vec3 n = normalize( mat3( modelMatrix ) * normal );
  vFacing = abs( dot( n, normalize( cameraPosition - world.xyz ) ) );
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uLevel;
uniform float uCore;
varying vec2 vUv;
varying float vFacing;
void main() {
  #include <logdepthbuf_fragment>
  // 0 at the nozzle, 1 at the tip: the cone's uv runs base to apex.
  float t = vUv.y;
  float flow = t * 9.0 - uTime * 26.0;
  float n = 0.5 + 0.25 * sin( vUv.x * 37.7 + flow ) + 0.25 * sin( vUv.x * 18.8 - flow * 1.7 + 1.3 );
  float diamonds = 0.7 + 0.3 * cos( t * 6.2831 * 4.5 );
  vec3 hot = mix( vec3( 0.75, 0.88, 1.6 ), vec3( 1.9, 0.95, 0.32 ), smoothstep( 0.04, 0.4, t ) );
  hot = mix( hot, vec3( 1.1, 0.22, 0.05 ), smoothstep( 0.45, 0.95, t ) );
  hot = mix( hot, vec3( 1.6, 1.7, 2.0 ), uCore * ( 1.0 - smoothstep( 0.0, 0.35, t ) ) );
  float fade = ( 1.0 - smoothstep( 0.25, 1.0, t ) ) * smoothstep( 0.0, 0.03, t + 0.02 );
  // Seen down its length from astern, a cone's sides face away: the flame must still read as a fire.
  float a = uLevel * fade * mix( n, 1.0, uCore * 0.6 ) * diamonds * mix( 0.55, 1.0, vFacing );
  gl_FragColor = vec4( hot * a, a );
}
`;

function sparkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,200,120,0.8)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBoostFlame(): BoostFlame {
  const group = new THREE.Group();
  const back = AIRLINER_MESH.engine.back;
  const radius = AIRLINER_MESH.engine.radius;
  const cone = (r: number, len: number) => {
    const geo = new THREE.ConeGeometry(r, len, 40, 12, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    return geo;
  };
  const outerGeo = cone(radius * 0.95, LENGTH);
  const innerGeo = cone(radius * 0.45, LENGTH * 0.55);
  const texture = sparkTexture();
  const glowTex = radialTexture(0.08, 64);
  const owned: { dispose(): void }[] = [outerGeo, innerGeo, texture, glowTex];

  const engines = ([-1, 1] as const).map((side) => {
    const at = new THREE.Group();
    at.position.set(ENGINE_AT.x * side, ENGINE_AT.y, back - 0.2);
    at.visible = false;
    group.add(at);
    const mat = (core: number) => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uCore: { value: core } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const outerMat = mat(0);
    const innerMat = mat(1);
    const outer = new THREE.Mesh(outerGeo, outerMat);
    const inner = new THREE.Mesh(innerGeo, innerMat);
    outer.renderOrder = inner.renderOrder = 6;
    outer.frustumCulled = inner.frustumCulled = false;
    at.add(outer, inner);
    // The nozzle itself, white-hot: what a camera astern sees first.
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffc58a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.z = 0.8;
    glow.renderOrder = 7;
    at.add(glow);
    owned.push(glowMat);

    const positions = new Float32Array(SPARKS * 3);
    const life = new Float32Array(SPARKS);
    const vel = new Float32Array(SPARKS * 3);
    for (let i = 0; i < SPARKS; i++) life[i] = Math.random();
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkMat = new THREE.PointsMaterial({
      map: texture, color: 0xffc070, size: 0.7, sizeAttenuation: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    at.add(sparks);
    owned.push(outerMat, innerMat, sparkGeo, sparkMat);
    return { at, outer, inner, outerMat, innerMat, glow, glowMat, positions, life, vel, sparkGeo, sparkMat, level: 0 };
  });

  /* One hot light between the two, rather than one each: it lights the
     wing roots, the belly and the tail, and costs every lit surface one
     light, not two. Never removed, only dimmed, so turning it on is not a
     recompile of every material in the scene. */
  const light = new THREE.PointLight(0xff9a4a, 0, 70, 2);
  light.position.set(0, ENGINE_AT.y, back + 4);
  group.add(light);

  let clock = 0;
  const update: BoostFlame['update'] = (dt, port, starboard) => {
    clock += dt;
    let total = 0;
    engines.forEach((e, i) => {
      const want = i === 0 ? port : starboard;
      e.level = want;
      e.at.visible = want > 0.01;
      total += want;
      if (!e.at.visible) return;
      const flicker = 0.88 + 0.12 * Math.sin(clock * 53 + i * 2.1) * Math.sin(clock * 31 + i);
      e.outer.scale.set(0.85 + 0.25 * want, 0.85 + 0.25 * want, (0.45 + 0.75 * want) * flicker);
      e.inner.scale.set(1, 1, (0.5 + 0.6 * want) * (0.92 + 0.08 * Math.sin(clock * 71 + i)));
      e.glow.scale.setScalar(radius * (3.5 + 4 * want) * flicker);
      e.glowMat.opacity = Math.min(1, want * 1.2);
      for (const m of [e.outerMat, e.innerMat]) {
        m.uniforms.uTime.value = clock;
        m.uniforms.uLevel.value = Math.min(1, want * 1.15) * flicker;
      }
      // The sparks: thrown aft fast, spreading, and dying in a fraction of a second.
      for (let k = 0; k < SPARKS; k++) {
        e.life[k] += dt * (1.6 + (k % 7) * 0.2);
        if (e.life[k] >= 1) {
          e.life[k] -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius * 0.6;
          e.positions[k * 3] = Math.cos(a) * r;
          e.positions[k * 3 + 1] = Math.sin(a) * r;
          e.positions[k * 3 + 2] = Math.random() * 2;
          e.vel[k * 3] = (Math.random() - 0.5) * 6;
          e.vel[k * 3 + 1] = (Math.random() - 0.5) * 6;
          e.vel[k * 3 + 2] = 30 + Math.random() * 30;
        }
        e.positions[k * 3] += e.vel[k * 3] * dt;
        e.positions[k * 3 + 1] += e.vel[k * 3 + 1] * dt;
        e.positions[k * 3 + 2] += e.vel[k * 3 + 2] * dt;
      }
      (e.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      e.sparkMat.opacity = Math.min(1, want * 1.3);
    });
    light.intensity = total * 380 * (0.85 + 0.15 * Math.sin(clock * 40));
  };

  return {
    group,
    update,
    dispose: () => owned.forEach((d) => d.dispose()),
  };
}
