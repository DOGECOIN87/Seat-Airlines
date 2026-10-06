import type * as THREE from 'three';

/**
 * The world's curve, put on a flat plate.
 *
 * The ground is a plate 120 km across, which from a few kilometres up is a
 * square of map with an edge. Bent down by the square of the distance from
 * the aeroplane — a sphere's drop, near enough, `d² / 2R` — it falls away
 * into a horizon, and with R small enough the edge is always past it. The
 * aeroplane sits over the world's origin, so the bend is centred there.
 *
 * `value` is 1 / 2R: 0 leaves the plate flat, as every page but the game's
 * has it.
 */
export interface CurveParams {
  value: number;
}

type Shader = Parameters<NonNullable<THREE.Material['onBeforeCompile']>>[0];

export function curveShader(shader: Shader, curve: CurveParams): void {
  shader.uniforms.worldCurve = curve;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float worldCurve;')
    .replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
	vec4 curvedWorld = modelMatrix * mvPosition;
	curvedWorld.y -= dot( curvedWorld.xz, curvedWorld.xz ) * worldCurve;
	mvPosition = viewMatrix * curvedWorld;
	gl_Position = projectionMatrix * mvPosition;`,
    );
}
