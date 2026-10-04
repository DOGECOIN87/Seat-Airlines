import * as THREE from 'three';

/**
 * Lightning, for the landing's game: now and then it is not the engine that
 * lets go, but a bolt out of the cloud that hits it.
 *
 * A jagged main channel from high above and ahead down into the nacelle,
 * with a few forks off it, each drawn as a ribbon turned to face the camera:
 * a white-hot core inside a violet-blue glow, added to whatever is behind
 * it. It flickers the way a real stroke does — a flash, a dimmer moment, a
 * second stroke down the same channel, a third, weaker — and is gone in
 * half a second. The forks go first.
 *
 * The bottom of the channel stays on the engine it hit while the aeroplane
 * rolls under it; the top stays in the cloud. What it lights is up to the
 * caller, which is told how bright it is each frame (see `update`).
 */

export interface Lightning {
  /** Added to the scene. */
  group: THREE.Group;
  /** Which engine the bolt is in, while there is one: -1 port, 1 starboard, 0 none. */
  readonly side: -1 | 0 | 1;
  /**
   * A bolt into `to`, a point in the world: the top of the engine on `side`.
   * Or, given `from`, a bolt from there — a cloud base kilometres off — down
   * to `to`, its channel `width` times as thick.
   */
  strike(to: THREE.Vector3, side: -1 | 1, from?: THREE.Vector3, width?: number): void;
  /** Every frame: where that engine is now, and the camera the ribbons face. Returns how bright it is, 0–1. */
  update(dt: number, to: THREE.Vector3, camera: THREE.Camera): number;
  reset(): void;
  dispose(): void;
}

/** Points across every strand: the main channel is 129 and each fork 33. */
const MAX_POINTS = 129 + 6 * 33;
/** Brightness through the stroke, seconds after it: [t, level]. */
const FLICKER: readonly (readonly [number, number])[] = [
  [0, 1], [0.045, 0.92], [0.07, 0.18], [0.1, 0.98], [0.15, 0.32], [0.2, 0.72], [0.24, 0.16], [0.3, 0.3], [0.5, 0],
];
/** When the channel is re-struck, and a little re-jagged. */
const RESTRIKES = [0.1, 0.2];

/* The scene's depth is logarithmic (see WorldScene), so the bolt writes its
   depth the same way — or the ground, a kilometre behind it, would hide the
   half of it that is in front. */
const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float across;
attribute float bright;
varying float vAcross;
varying float vBright;
void main() {
  vAcross = across;
  vBright = bright;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float level;
uniform vec3 glowColour;
varying float vAcross;
varying float vBright;
void main() {
  #include <logdepthbuf_fragment>
  float d = abs( vAcross * 2.0 - 1.0 );
  float core = 1.0 - smoothstep( 0.0, 0.14, d );
  float glow = pow( 1.0 - d, 2.4 );
  vec3 colour = glowColour * glow + vec3( 1.0 ) * core * 1.6;
  gl_FragColor = vec4( colour, ( glow * 0.85 + core ) * level * vBright );
}
`;

interface Strand {
  pts: THREE.Vector3[];
  /** Metres across, at the widest. */
  width: number;
  /** How bright, against the main channel. */
  bright: number;
  /** Where along the main channel it leaves from, 0 top to 1 bottom: how much it follows the engine. */
  root: number;
  /** A fork, which tapers to nothing and goes out first. */
  fork: boolean;
}

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** A jagged line from `a` to `b`: the midpoint displaced, again and again, by less each time. */
function channel(a: THREE.Vector3, b: THREE.Vector3, depth: number, rough: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  let amp = a.distanceTo(b) * rough;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const mid = pts[i - 1].clone().add(pts[i]).multiplyScalar(0.5);
      mid.x += rnd(-1, 1) * amp;
      mid.y += rnd(-1, 1) * amp * 0.3;
      mid.z += rnd(-1, 1) * amp;
      next.push(mid, pts[i]);
    }
    pts = next;
    amp *= 0.56;
  }
  return pts;
}

export function createLightning(): Lightning {
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const across = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2), 1);
  const bright = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2), 1).setUsage(THREE.DynamicDrawUsage);
  const index = new THREE.BufferAttribute(new Uint16Array((MAX_POINTS - 1) * 6), 1);
  for (let i = 0; i < MAX_POINTS; i++) {
    across.setX(i * 2, 0);
    across.setX(i * 2 + 1, 1);
  }
  geo.setAttribute('position', position);
  geo.setAttribute('across', across);
  geo.setAttribute('bright', bright);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, glowColour: { value: new THREE.Color(0.55, 0.62, 1) } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Rebuilt every frame it shows; its bounds are wherever it struck.
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  const group = new THREE.Group();
  group.add(mesh);

  let strands: Strand[] = [];
  let age = Infinity;
  let side: -1 | 0 | 1 = 0;
  let restruck = 0;
  const struckAt = new THREE.Vector3();
  const drift = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const across3 = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const p = new THREE.Vector3();

  /** The index buffer for this bolt's strands: two triangles between each pair of points along each. */
  const link = () => {
    let v = 0;
    let n = 0;
    for (const s of strands) {
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = (v + i) * 2;
        index.setX(n++, a); index.setX(n++, a + 1); index.setX(n++, a + 2);
        index.setX(n++, a + 1); index.setX(n++, a + 3); index.setX(n++, a + 2);
      }
      v += s.pts.length;
    }
    index.needsUpdate = true;
    geo.setDrawRange(0, n);
  };

  const strike = (to: THREE.Vector3, at: -1 | 1, from?: THREE.Vector3, scale = 1) => {
    side = at;
    age = 0;
    restruck = 0;
    struckAt.copy(to);
    /* From high up in the cloud, ahead of the aeroplane and out to the side
       it hits, so a camera astern sees it come down across the sky. */
    const top = from?.clone() ?? new THREE.Vector3(to.x + at * rnd(60, 190), to.y + rnd(430, 560), to.z - rnd(120, 300));
    const main = channel(top, to, 7, 0.11);
    const span = top.distanceTo(to) / 500;
    strands = [{ pts: main, width: 7 * scale, bright: 1, root: 1, fork: false }];
    for (let f = 0; f < 6; f++) {
      const i = Math.floor(rnd(8, 96));
      const from = main[i];
      const reach = rnd(50, 170) * span * (1 - (i / main.length) * 0.6);
      const end = new THREE.Vector3(
        from.x + rnd(-1, 1) * reach * 0.8,
        from.y - reach * rnd(0.45, 0.95),
        from.z + rnd(-1, 1) * reach * 0.8,
      );
      strands.push({ pts: channel(from, end, 5, 0.16), width: rnd(2.2, 3.6) * scale, bright: rnd(0.35, 0.7), root: i / (main.length - 1), fork: true });
    }
    link();
    mesh.visible = true;
  };

  /** How bright the stroke is `t` seconds in. */
  const levelAt = (t: number) => {
    for (let i = 1; i < FLICKER.length; i++) {
      const [t1, l1] = FLICKER[i];
      if (t <= t1) {
        const [t0, l0] = FLICKER[i - 1];
        return l0 + ((l1 - l0) * (t - t0)) / (t1 - t0);
      }
    }
    return 0;
  };

  const update = (dt: number, to: THREE.Vector3, camera: THREE.Camera) => {
    if (!mesh.visible) return 0;
    age += dt;
    const level = levelAt(age);
    if (age >= FLICKER[FLICKER.length - 1][0]) {
      reset();
      return 0;
    }
    // A re-stroke comes down nearly the same way, not exactly.
    if (restruck < RESTRIKES.length && age >= RESTRIKES[restruck]) {
      restruck++;
      for (const s of strands) {
        for (let i = 1; i < s.pts.length - 1; i++) {
          s.pts[i].x += rnd(-1, 1) * 1.6;
          s.pts[i].z += rnd(-1, 1) * 1.6;
        }
      }
    }
    // The bottom of the channel stays in the engine as the aeroplane moves under it.
    drift.copy(to).sub(struckAt);
    camera.getWorldPosition(eye);
    let v = 0;
    for (const s of strands) {
      const n = s.pts.length;
      // Forks are gone by the second stroke's end.
      const shown = s.fork ? s.bright * Math.max(0, 1 - age / 0.17) : s.bright;
      for (let i = 0; i < n; i++) {
        const along = s.fork ? s.root : i / (n - 1);
        p.copy(s.pts[i]).addScaledVector(drift, along * along);
        tangent.copy(s.pts[Math.min(n - 1, i + 1)]).sub(s.pts[Math.max(0, i - 1)]);
        toEye.copy(eye).sub(p);
        across3.crossVectors(tangent, toEye).normalize();
        // The main channel is widest where it strikes; a fork narrows to its tip.
        const w = s.fork ? s.width * (1 - i / (n - 1)) ** 0.7 : s.width * (0.55 + 0.45 * (i / (n - 1)));
        const a = (v + i) * 2;
        position.setXYZ(a, p.x - across3.x * w * 0.5, p.y - across3.y * w * 0.5, p.z - across3.z * w * 0.5);
        position.setXYZ(a + 1, p.x + across3.x * w * 0.5, p.y + across3.y * w * 0.5, p.z + across3.z * w * 0.5);
        bright.setX(a, shown);
        bright.setX(a + 1, shown);
      }
      v += n;
    }
    position.needsUpdate = true;
    bright.needsUpdate = true;
    mat.uniforms.level.value = level;
    return level;
  };

  const reset = () => {
    mesh.visible = false;
    geo.setDrawRange(0, 0);
    strands = [];
    age = Infinity;
    side = 0;
  };

  return {
    group,
    get side() { return side; },
    strike,
    update,
    reset,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
