import * as THREE from 'three';

/**
 * An engine blowing up, and burning after.
 *
 * Only the landing page's game asks for this: one engine lets go in a
 * fireball, and from then on it burns — flames streaming off the nacelle,
 * lighting the wing orange — and trails smoke across the sky.
 *
 * Two kinds of particle, each one instanced billboard draw:
 *
 *  - fire, drawn additively, rides the airframe: the flames are attached to
 *    the engine, so they bank and turn with it and stream aft along it;
 *  - smoke and the blast, drawn over the scene, belong to the world: once
 *    released, a puff hangs in the air where it was made. The aeroplane
 *    stays at the origin and the world slides under it (see WorldScene), so
 *    each frame every puff is moved by exactly what the world moved. The
 *    trail therefore lies along the path actually flown — curving through a
 *    turn, falling away below a climb — and never follows the aeroplane.
 */

export interface EngineFireFrame {
  /** Where the burning engine is, in the airframe's own frame. */
  local: THREE.Vector3;
  /** And in the world. */
  world: THREE.Vector3;
  /** What the world moved under the aeroplane this frame, metres. */
  flowX: number;
  flowZ: number;
  /** 0 by day, 1 after dark. */
  night: number;
  /** 0–1, how badly it is burning now. */
  fury: number;
  /** 0–1, lightning in this engine this frame: the glow goes blue-white and blinding. */
  zap?: number;
}

export interface EngineFire {
  /** Smoke, blast and debris, in world space: added to the scene. */
  world: THREE.Group;
  /** The flames and the glow they throw, added to the airframe. */
  local: THREE.Group;
  /** The engine explodes. Positions as in the frame. */
  blast(local: THREE.Vector3, world: THREE.Vector3): void;
  /** Burning, or not; call every frame either way so what is in the air plays out. */
  update(dt: number, burning: boolean, frame: EngineFireFrame): void;
  /** Everything gone at once: a new flight. */
  reset(): void;
  dispose(): void;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size0: number; size1: number;
  spin: number; turn: number;
  /** Grey for smoke; a heat, 0–1, for fire. */
  tone: number;
  /** Debris falls; smoke and fire do not. */
  heavy: boolean;
  alpha: number;
}

/** A soft round puff, lumpy for smoke, clean for fire. */
function puffTexture(lumpy: boolean): THREE.CanvasTexture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = lumpy ? 0x9e3779b9 : 0x85ebca6b;
  const rand = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const blob = (x: number, y: number, r: number, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  if (lumpy) {
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * n * 0.2;
      blob(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, n * (0.16 + rand() * 0.16), 0.45);
    }
  } else {
    blob(n / 2, n / 2, n / 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 offset;
attribute float size;
attribute float spin;
attribute vec4 colour;
varying vec2 vUv;
varying vec4 vColour;
void main() {
  vUv = uv;
  vColour = colour;
  vec4 mvPosition = modelViewMatrix * vec4( offset, 1.0 );
  float c = cos( spin );
  float s = sin( spin );
  mvPosition.xy += mat2( c, s, -s, c ) * position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColour;
void main() {
  #include <logdepthbuf_fragment>
  float a = texture2D( map, vUv ).a * vColour.a;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColour.rgb, a );
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  #ifdef GLOW
    // Light added to the scene fades to nothing in haze, not to the haze's colour.
    gl_FragColor.a *= 1.0 - fogFactor;
  #else
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif
}
`;

/** A pool of billboards drawn in one call. */
function billboards(count: number, glow: boolean, map: THREE.Texture) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const offset = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  const spin = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  const colour = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('offset', offset);
  geo.setAttribute('size', size);
  geo.setAttribute('spin', spin);
  geo.setAttribute('colour', colour);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: glow ? { GLOW: '' } : {},
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.uniforms.map.value = map;
  const mesh = new THREE.Mesh(geo, mat);
  // The pool moves every frame; its bounds are whatever the particles make them.
  mesh.frustumCulled = false;
  mesh.renderOrder = glow ? 4 : 3;
  const live: Particle[] = [];
  /** Write the live particles into the instance buffers. */
  const draw = (paint: (p: Particle, out: Float32Array, i: number) => void) => {
    const n = Math.min(count, live.length);
    for (let i = 0; i < n; i++) {
      const p = live[i];
      const t = p.age / p.life;
      offset.setXYZ(i, p.x, p.y, p.z);
      // Grows fast then settles, the way a puff spreads.
      size.setX(i, p.size0 + (p.size1 - p.size0) * (1 - (1 - t) * (1 - t)));
      spin.setX(i, p.spin);
      paint(p, colour.array as Float32Array, i * 4);
    }
    geo.instanceCount = n;
    offset.needsUpdate = size.needsUpdate = spin.needsUpdate = colour.needsUpdate = true;
  };
  return { mesh, live, draw, count, dispose: () => { base.dispose(); geo.dispose(); mat.dispose(); } };
}

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** The glow sits above and behind the burning engine, over the wing. */
const GLOW_AT = new THREE.Vector3(0, 0.9, 1.2);
const FIRE_LIGHT = new THREE.Color(0xff6a1f);
const BOLT_LIGHT = new THREE.Color(0xc9d6ff);

export function createEngineFire(): EngineFire {
  const smokeTex = puffTexture(true);
  const glowTex = puffTexture(false);
  const smoke = billboards(520, false, smokeTex);
  const flames = billboards(120, true, glowTex);
  const burst = billboards(90, true, glowTex);

  const world = new THREE.Group();
  world.add(smoke.mesh, burst.mesh);
  const local = new THREE.Group();
  local.add(flames.mesh);
  /* The glow the fire throws on the wing and the nacelle. Built with the
     scene and left dark until it is needed: a light arriving mid-flight
     would recompile every lit material in the scene at the worst moment. */
  const light = new THREE.PointLight(0xff6a1f, 0, 70, 2);
  local.add(light);

  let flash = 0;
  let smokeDebt = 0;
  let flameDebt = 0;
  let flicker = 0;
  const spawn = (pool: { live: Particle[]; count: number }, p: Particle) => {
    if (pool.live.length < pool.count) pool.live.push(p);
  };
  const particle = (x: number, y: number, z: number, o: Partial<Particle>): Particle => ({
    x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size0: 1, size1: 2,
    spin: Math.random() * Math.PI * 2, turn: rnd(-0.8, 0.8), tone: 0.15, heavy: false, alpha: 1, ...o,
  });

  const blast = (at: THREE.Vector3, w: THREE.Vector3) => {
    flash = 1;
    // The flash: white-hot and huge, over in a quarter of a second.
    spawn(burst, particle(w.x, w.y, w.z, { life: 0.28, size0: 16, size1: 34, tone: 1, turn: 0 }));
    // The fireball.
    for (let i = 0; i < 34; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(6, 26));
      spawn(burst, particle(w.x + d.x * 0.1, w.y + d.y * 0.1, w.z + d.z * 0.1, {
        vx: d.x, vy: d.y, vz: d.z, life: rnd(0.45, 1.15), size0: rnd(3, 6), size1: rnd(8, 15), tone: rnd(0.55, 1),
      }));
    }
    // The pieces.
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(18, 48));
      spawn(smoke, particle(w.x, w.y, w.z, {
        vx: d.x, vy: d.y, vz: d.z, life: rnd(1.2, 2.2), size0: rnd(0.35, 0.8), size1: rnd(0.35, 0.8),
        tone: 0.05, heavy: true, turn: rnd(-8, 8),
      }));
    }
    // The cloud it leaves.
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 14));
      spawn(smoke, particle(w.x, w.y, w.z, {
        vx: d.x, vy: d.y, vz: d.z, life: rnd(2.6, 4.2), size0: rnd(3, 6), size1: rnd(14, 24), tone: rnd(0.06, 0.16),
      }));
    }
    // And a gout of flame off the engine itself.
    for (let i = 0; i < 30; i++) {
      spawn(flames, particle(at.x + rnd(-1, 1), at.y + rnd(-0.6, 1.2), at.z + rnd(-1.5, 3), {
        vx: rnd(-7, 7), vy: rnd(-2, 9), vz: rnd(6, 30), life: rnd(0.3, 0.7), size0: rnd(2, 3.5), size1: rnd(4, 8), tone: rnd(0.6, 1),
      }));
    }
  };

  const age = (pool: { live: Particle[] }, dt: number, flowX: number, flowZ: number, drag: number) => {
    const live = pool.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { live[i] = live[live.length - 1]; live.pop(); continue; }
      if (p.heavy) p.vy -= 9.81 * dt;
      const k = Math.exp(-drag * dt);
      p.vx *= k; p.vz *= k;
      if (!p.heavy) p.vy *= k;
      p.x += p.vx * dt + flowX;
      p.y += p.vy * dt;
      p.z += p.vz * dt + flowZ;
      p.spin += p.turn * dt;
    }
  };

  /** Fire's colour by heat: white-yellow, orange, a dull red at the end. */
  const heat = (tone: number, t: number, out: Float32Array, i: number, strength: number) => {
    const h = tone * (1 - t);
    out[i] = 1;
    out[i + 1] = 0.25 + 0.7 * h;
    out[i + 2] = 0.05 + 0.5 * h * h;
    out[i + 3] = strength * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
  };

  const update = (dt: number, burning: boolean, f: EngineFireFrame) => {
    if (dt <= 0) return;
    const fury = burning ? f.fury : 0;
    flicker += dt;

    // What is already in the air plays on first; this frame's new puffs are placed after.
    age(smoke, dt, f.flowX, f.flowZ, 0.6);
    age(burst, dt, f.flowX, f.flowZ, 1.8);
    age(flames, dt, 0, 0, 0.5);

    if (burning) {
      /* Smoke, released at the engine into the air it is flying through:
         thick and black while the fuel burns. Each frame's puffs are laid
         along the stretch of air that went past during it — as though each
         had been let go at its own moment within the frame, and had since
         drifted and aged by the rest of it — so the trail is one unbroken
         plume at any frame rate, not a string of beads at a slow one. */
      smokeDebt += dt * (60 + 40 * fury);
      while (smokeDebt >= 1) {
        smokeDebt -= 1;
        const rest = Math.random();
        const p = particle(f.world.x + rnd(-0.5, 0.5), f.world.y + rnd(-0.4, 0.5), f.world.z + rnd(-0.5, 0.5), {
          vx: rnd(-1.5, 1.5), vy: rnd(0.8, 3), vz: rnd(-1.5, 1.5),
          life: rnd(3.2, 4.4), size0: rnd(3.4, 4.6), size1: rnd(13, 19) * (0.8 + 0.4 * fury), tone: rnd(0.02, 0.06),
        });
        p.x += f.flowX * rest + p.vx * rest * dt;
        p.y += p.vy * rest * dt;
        p.z += f.flowZ * rest + p.vz * rest * dt;
        p.age = rest * dt;
        spawn(smoke, p);
      }
      /* Flames, riding the engine: out of the nozzle and off the top of the
         cowling, streaming aft and burning out in a few tenths. */
      flameDebt += dt * (60 + 60 * fury);
      while (flameDebt >= 1) {
        flameDebt -= 1;
        const along = rnd(-1.2, 3.2);
        spawn(flames, particle(f.local.x + rnd(-0.7, 0.7), f.local.y + rnd(-0.3, 0.9), f.local.z + along, {
          vx: rnd(-1.2, 1.2), vy: rnd(0.5, 3.5), vz: rnd(16, 34),
          life: rnd(0.16, 0.38), size0: rnd(1, 1.8), size1: rnd(2.4, 3.8) * (0.8 + 0.4 * fury), tone: rnd(0.55, 1),
        }));
      }
    }

    const shade = 1 - 0.55 * f.night;
    smoke.draw((p, out, i) => {
      const t = p.age / p.life;
      // Heavy pieces stay black; smoke greys as it spreads and thins.
      const g = (p.heavy ? p.tone : p.tone + 0.12 * t) * shade;
      out[i] = g; out[i + 1] = g * 0.97; out[i + 2] = g * 0.95;
      /* Dense from the moment it leaves the engine — a fade-in, at this
         speed, is twenty metres of missing trail — and thinning out only as
         it spreads. */
      out[i + 3] = p.heavy ? 1 - t * t : 0.92 * Math.min(1, p.age / 0.04) * (1 - Math.pow(t, 1.6));
    });
    flames.draw((p, out, i) => heat(p.tone, p.age / p.life, out, i, 0.95));
    burst.draw((p, out, i) => heat(p.tone, p.age / p.life, out, i, 1));

    /* The glow: a flicker made of three unrelated wobbles, and on top of it
       the flash of the blast, gone in half a second. */
    flash *= Math.exp(-7 * dt);
    const wobble = 0.72 + 0.14 * Math.sin(flicker * 23.1) + 0.09 * Math.sin(flicker * 37.7 + 1.3) + 0.05 * Math.sin(flicker * 61.9 + 4.1);
    light.position.copy(f.local).add(GLOW_AT);
    const fireLight = (burning ? (70 + 70 * fury) * wobble : 0) + flash * 4000;
    const boltLight = (f.zap ?? 0) * 14000;
    light.intensity = fireLight + boltLight;
    light.color.copy(FIRE_LIGHT).lerp(BOLT_LIGHT, boltLight / Math.max(1, fireLight + boltLight));
  };

  const reset = () => {
    smoke.live.length = flames.live.length = burst.live.length = 0;
    smoke.mesh.geometry.instanceCount = 0;
    flames.mesh.geometry.instanceCount = 0;
    burst.mesh.geometry.instanceCount = 0;
    light.intensity = 0;
    flash = 0;
  };

  return {
    world,
    local,
    blast,
    update,
    reset,
    dispose: () => {
      smoke.dispose();
      flames.dispose();
      burst.dispose();
      smokeTex.dispose();
      glowTex.dispose();
      light.dispose();
    },
  };
}
