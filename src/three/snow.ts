import * as THREE from 'three';

/**
 * Snow country: the land under a white cover, and snow falling through the
 * air the aircraft flies in.
 *
 * The cover is a tint rather than a map of its own. The farmland keeps its
 * hills, woods, towns and lakes and simply goes white over them, keeping a
 * little of the field pattern underneath the way real snow shows the lie of
 * the land under it, so the switch costs a uniform and the ground stays the
 * same ground. The falling snow is a box of flakes carried round the
 * camera: the flakes ride the air mass, which the aircraft is flying through
 * at a couple of hundred metres a second, so they stream past.
 */

type CompilingShader = { uniforms: Record<string, { value: unknown }>; fragmentShader: string };

export interface SnowParams {
  /** 0–1: how much of the ground is under snow. */
  value: number;
}

/**
 * Patch a ground material to go white under snow. Apply after any patch that
 * paints into `diffuseColor` (the lakes), so the snow lies over them too.
 */
export function snowShader(shader: CompilingShader, snow: SnowParams): void {
  shader.uniforms.snowCover = snow;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float snowCover;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      if ( snowCover > 0.0 ) {
        float snowLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
        vec3 snowy = vec3( 0.86, 0.9, 0.96 ) * ( 0.8 + 0.55 * snowLum );
        diffuseColor.rgb = mix( diffuseColor.rgb, snowy, snowCover );
      }`,
    );
}

export interface SnowfallFrame {
  /** Where the camera is, in the world. */
  eye: THREE.Vector3;
  /** Metres the ground has slid (WorldScene's `shift`): the air goes with it. */
  shiftX: number;
  shiftZ: number;
  /** Seconds since the last frame. */
  dt: number;
  /** 0–1: how hard it is snowing. */
  amount: number;
  /** 0–1: daylight, so the flakes are not white-hot at midnight. */
  day: number;
  /** World to the aircraft's own frame, so no flake falls inside the cabin. */
  toAircraft: THREE.Matrix4;
}

export interface SnowfallHandles {
  points: THREE.Points;
  update: (f: SnowfallFrame) => void;
  dispose: () => void;
}

/** Metres on a side of the box of air round the camera that the flakes fill. */
const BOX = 240;

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 eye;
uniform float time;
uniform vec3 drift;
uniform float size;
uniform float scale;
uniform mat4 toAircraft;
varying float vFade;
void main() {
  // Each flake's place in the moving air, folded into the box round the eye.
  vec3 p = position * ${BOX.toFixed(1)} + drift;
  // A little flutter of its own, so no two fall in step.
  p.x += sin( time * 0.9 + position.z * 40.0 ) * 1.5;
  p.z += cos( time * 0.7 + position.x * 40.0 ) * 1.5;
  p = eye + mod( p - eye + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)} ) - ${(BOX / 2).toFixed(1)};
  vec3 local = ( toAircraft * vec4( p, 1.0 ) ).xyz;
  bool aboard = abs( local.x ) < 2.3 && local.y > -2.6 && local.y < 2.4 && local.z > -4.5 && local.z < 31.0;
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  gl_Position = aboard ? vec4( 2.0, 2.0, 2.0, 1.0 ) : projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  float dist = -mv.z;
  gl_PointSize = clamp( size * scale / max( dist, 0.1 ), 1.0, 26.0 );
  // Thinner toward the walls of the box, so it has none; gone right at the lens.
  vFade = ( 1.0 - smoothstep( ${(BOX * 0.3).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, length( p - eye ) ) ) * smoothstep( 1.5, 5.0, dist );
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 colour;
uniform float opacity;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r = dot( c, c );
  if ( r > 0.25 ) discard;
  gl_FragColor = vec4( colour, opacity * vFade * ( 1.0 - r * 4.0 ) );
}
`;

export function createSnowfall(o: { flakes: number }): SnowfallHandles {
  const pos = new Float32Array(o.flakes * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uniforms = {
    eye: { value: new THREE.Vector3() },
    drift: { value: new THREE.Vector3() },
    time: { value: 0 },
    size: { value: 0.55 },
    scale: { value: 800 },
    toAircraft: { value: new THREE.Matrix4() },
    colour: { value: new THREE.Color(0xffffff) },
    opacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 2;

  let fallen = 0;
  const update = (f: SnowfallFrame) => {
    points.visible = f.amount > 0.01;
    if (!points.visible) return;
    // About two metres a second down; sideways, the air's own speed over the ground.
    fallen += f.dt * 2.2;
    // Wrapped on a whole number of both flutters, so the wrap never shows.
    uniforms.time.value = (uniforms.time.value + f.dt) % (200 * Math.PI);
    const drift = uniforms.drift.value;
    drift.set(-f.shiftX * 0.8, -fallen, f.shiftZ * 0.8);
    // Keep the numbers small: the fold is periodic in the box.
    drift.set(drift.x % BOX, drift.y % BOX, drift.z % BOX);
    uniforms.eye.value.copy(f.eye);
    uniforms.toAircraft.value.copy(f.toAircraft);
    uniforms.opacity.value = 0.85 * f.amount;
    uniforms.colour.value.setScalar(0.3 + 0.7 * f.day);
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  return { points, update, dispose };
}
