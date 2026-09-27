import type * as THREE from 'three';

/**
 * Breaking up the repeat.
 *
 * The ground is one 3 km tile laid forty times across the plate. Close in
 * that never shows; toward the horizon, where dozens of tiles crowd into a
 * few degrees of view, the same fields and woods recur in rows and the
 * country reads as wallpaper.
 *
 * Two fixes, both in the shader, both driven by one low-frequency noise
 * field read off the ground's own texture coordinate — so they travel with
 * the land rather than sliding over it:
 *
 *   Hex-tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", 2022). Past
 *   `ntParams.x` metres from the aircraft the ground is cut into hexagons
 *   a little smaller than the tile, ~2 km across, and each shows a
 *   randomly shifted copy of it, blended across narrow borders. No two
 *   neighbours line up, so there is no lattice left to find. An earlier
 *   pass shuffled whole regions twelve kilometres wide, and that failed
 *   instructively: the tile still repeated four times over inside every
 *   region. The randomness has to be finer than the repeat it is hiding.
 *   The day map, the night lights, the normal map, the lakes and — in the
 *   vertex shader — the hills all shuffle identically, so the woods stay
 *   on their hilltops and the lakes in their hollows out there too.
 *
 *   Tint. A broad, gentle colour drift over tens of kilometres — greener
 *   here, drier there — strongest in the distance, where the eye looks for
 *   a pattern and now finds regions instead. `ntParams.z` sets it; zero
 *   for water and the moon.
 *
 * Everything is keyed off whole lattice indices through a sine-free hash,
 * which stays stable on every GPU however far the flight has scrolled.
 */
export interface NoTileParams {
  /** x: shuffling starts (m); y: fully shuffled (m); z: land tint, 0–1. */
  value: THREE.Vector3;
}

const COMMON = /* glsl */ `
varying vec3 vNtWorld;
uniform vec3 ntParams;
// Hash without sine: stable on every GPU for the small lattice indices here.
float ntHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
// Value noise, periodic in \`period\` lattice cells.
float ntNoise( vec2 p, float period ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  vec2 i0 = mod( i, period );
  vec2 i1 = mod( i + 1.0, period );
  return mix(
    mix( ntHash( i0 ), ntHash( vec2( i1.x, i0.y ) ), f.x ),
    mix( ntHash( vec2( i0.x, i1.y ) ), ntHash( i1 ), f.x ),
    f.y );
}
float ntFar( vec3 world ) { return smoothstep( ntParams.x, ntParams.y, length( world.xz ) ); }
vec2 ntHash2( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
// The hex grid at this point: three weights, and the random shift of the
// tile each of the three nearest hexes shows. Weights are sharpened, so
// most of each hex is one clean copy and only the borders blend.
void ntHex( vec2 uv, out vec3 w, out vec2 o1, out vec2 o2, out vec2 o3 ) {
  vec2 st = uv * 0.8 * 3.46410162;
  vec2 skew = vec2( st.x - 0.57735027 * st.y, 1.15470054 * st.y );
  vec2 base = floor( skew );
  vec3 t = vec3( fract( skew ), 0.0 );
  t.z = 1.0 - t.x - t.y;
  float s = step( 0.0, -t.z );
  float s2 = 2.0 * s - 1.0;
  w = vec3( -t.z * s2, s - t.y * s2, s - t.x * s2 );
  o1 = ntHash2( base + vec2( s, s ) );
  o2 = ntHash2( base + vec2( s, 1.0 - s ) );
  o3 = ntHash2( base + vec2( 1.0 - s, s ) );
  w = pow( max( w, vec3( 0.0 ) ), vec3( 5.0 ) );
  w /= max( w.x + w.y + w.z, 1e-5 );
}
`;

const FRAGMENT = /* glsl */ `
vec4 noTile( sampler2D samp, vec2 uv ) {
  vec2 dx = dFdx( uv );
  vec2 dy = dFdy( uv );
  float far = ntFar( vNtWorld );
  if ( far < 0.001 ) return textureGrad( samp, uv, dx, dy );
  vec3 w;
  vec2 o1, o2, o3;
  ntHex( uv, w, o1, o2, o3 );
  vec4 shuffled = textureGrad( samp, uv + o1, dx, dy ) * w.x
    + textureGrad( samp, uv + o2, dx, dy ) * w.y
    + textureGrad( samp, uv + o3, dx, dy ) * w.z;
  if ( far > 0.999 ) return shuffled;
  return mix( textureGrad( samp, uv, dx, dy ), shuffled, far );
}
vec3 ntLandTint( vec2 uv ) {
  if ( ntParams.z <= 0.0 ) return vec3( 1.0 );
  float broad = ntNoise( uv * 0.125 + 5.0, 32.0 );
  float patchy = ntNoise( uv * 0.5 + 11.0, 128.0 );
  vec3 tint = mix( vec3( 0.84, 0.92, 0.8 ), vec3( 1.13, 1.06, 0.88 ), broad ) * mix( 0.9, 1.1, patchy );
  float amount = ntParams.z * mix( 0.35, 1.0, smoothstep( 3000.0, 25000.0, length( vNtWorld.xz ) ) );
  return mix( vec3( 1.0 ), tint, amount );
}
`;

const MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = noTile( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
  diffuseColor.rgb *= ntLandTint( vMapUv );
#endif
`;

const EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = noTile( emissiveMap, vEmissiveMapUv );
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

/* The relief, shuffled exactly as the fragments are, and faded toward the
   rim of the near mesh by its per-vertex `fade`. */
const DISPLACE = /* glsl */ `
#ifdef USE_DISPLACEMENTMAP
  vec3 ntW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  float ntF = ntFar( ntW );
  float ntH = textureLod( displacementMap, vDisplacementMapUv, 0.0 ).x;
  if ( ntF > 0.001 ) {
    vec3 w;
    vec2 o1, o2, o3;
    ntHex( vDisplacementMapUv, w, o1, o2, o3 );
    float shuffled = textureLod( displacementMap, vDisplacementMapUv + o1, 0.0 ).x * w.x
      + textureLod( displacementMap, vDisplacementMapUv + o2, 0.0 ).x * w.y
      + textureLod( displacementMap, vDisplacementMapUv + o3, 0.0 ).x * w.z;
    ntH = mix( ntH, shuffled, ntF );
  }
  // Toward the rim the relief settles to the ground's own average level
  // (see noTileShader), where the flat plate beyond carries on.
  transformed += normalize( objectNormal ) * ( mix( ntRim, ntH, fade ) * displacementScale + displacementBias );
#endif
`;

interface CompilingShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
}

/**
 * The lakes, painted by the ground they lie in.
 *
 * They used to be a surface of their own: a transparent plane laid two and a
 * half centimetres over the land, which held while the land under it was the
 * same flat two-triangle plate. Once the hills went in, the lake beds lay on
 * the relief mesh instead — a different triangulation, a hundred metres to a
 * triangle against the plane's sixty kilometres — and seen from a kilometre
 * up the two no longer agreed about their depth to within that hair's
 * breadth. The depth test settled it afresh every frame, and every lake in
 * view blinked on and off with each twitch of the camera.
 *
 * So there is no second surface now. The ground samples the lake layer with
 * its own coordinates, through the same shuffle, and blends it in: water
 * colour in the albedo, a glassier finish, the sky reflected in it and the
 * night lights under it put out. Where the ground goes, its lakes go, and
 * there is no depth left between them to disagree about.
 */
export interface LakeParams {
  /** The lake layer: its colour, and in alpha how much of the land it covers. */
  map: { value: THREE.Texture | null };
  /** 0–1, how much of it shows: lakes fade out with altitude and under an incoming sea. */
  fade: { value: number };
  /** The water's own colour, multiplied into the layer's. */
  tint: { value: THREE.Color };
}

const LAKE_PARS = /* glsl */ `
uniform sampler2D lakeMap;
uniform float lakeFade;
uniform vec3 lakeTint;
`;

/* After the land's own colour and tint, so the water is left untinted —
   and read through \`noTile\`, so the lakes stay in their hollows out where
   the tile is shuffled. */
const LAKE_ALBEDO = /* glsl */ `
float lakeCover = 0.0;
vec3 lakeAlbedo = vec3( 0.0 );
#ifdef USE_MAP
  if ( lakeFade > 0.0 ) {
    vec4 lake = noTile( lakeMap, vMapUv );
    lakeCover = lake.a * lakeFade;
    lakeAlbedo = lake.rgb * lakeTint;
    diffuseColor.rgb = mix( diffuseColor.rgb, lakeAlbedo, lakeCover );
  }
#endif
`;

/* The sky, reflected. The material's environment map is there for the water
   alone: land takes none of it, so the fields are lit exactly as they were —
   including the field that shows through a lake, which is why the sky's
   diffuse light is kept back here and put on the water's own colour below,
   rather than on the blend of the two. */
const LAKE_REFLECTION = /* glsl */ `
vec3 lakeSky = vec3( 0.0 );
#ifdef USE_ENVMAP
  if ( lakeCover > 0.0 ) {
    #include <lights_fragment_maps>
    lakeSky = iblIrradiance;
    iblIrradiance = vec3( 0.0 );
    radiance *= lakeCover;
  }
#else
  #include <lights_fragment_maps>
#endif
`;

const LAKE_SKYLIGHT = /* glsl */ `
reflectedLight.indirectDiffuse += lakeSky * lakeAlbedo * ( 0.92 * RECIPROCAL_PI ) * lakeCover;
`;

/* And the glassy skin the water plane had as a clearcoat: a second, sharper
   reflection over the first, which it dims by as much as it reflects. */
const LAKE_COAT = /* glsl */ `
#ifdef USE_ENVMAP
  if ( lakeCover > 0.0 ) {
    float lakeCoat = 0.6 * lakeCover;
    float lakeNV = saturate( dot( geometryNormal, geometryViewDir ) );
    vec3 lakeFresnel = F_Schlick( vec3( 0.04 ), 1.0, lakeNV );
    vec3 lakeSheen = getIBLRadiance( geometryViewDir, geometryNormal, 0.12 )
      * EnvironmentBRDF( geometryNormal, geometryViewDir, vec3( 0.04 ), 1.0, 0.12 );
    outgoingLight = outgoingLight * ( 1.0 - lakeCoat * lakeFresnel ) + lakeSheen * lakeCoat;
  }
#endif
`;

/**
 * Patch a ground material to paint the lakes into itself. Apply after
 * `noTileShader`, whose shuffled lookup it reads the layer through. Give the
 * material an environment map for the water to reflect.
 */
export function lakeShader(shader: CompilingShader, lakes: LakeParams): void {
  shader.uniforms.lakeMap = lakes.map;
  shader.uniforms.lakeFade = lakes.fade;
  shader.uniforms.lakeTint = lakes.tint;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LAKE_PARS}`)
    .replace('#include <color_fragment>', `${LAKE_ALBEDO}\n#include <color_fragment>`)
    /* The water's finish wherever there is water at all, not blended by
       coverage: the plane was as glossy at 78% opacity as at 100%, and a
       halfway roughness blurs the reflected horizon to grey. */
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.18, smoothstep( 0.0, 0.3, lakeCover ) );')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.08, lakeCover );')
    .replace('#include <lights_physical_fragment>', 'totalEmissiveRadiance *= 1.0 - lakeCover;\n#include <lights_physical_fragment>')
    .replace('#include <lights_fragment_maps>', LAKE_REFLECTION)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${LAKE_SKYLIGHT}`)
    .replace('#include <opaque_fragment>', `${LAKE_COAT}\n#include <opaque_fragment>`);
}

/**
 * Patch a ground material's shader to shuffle its tile in the distance.
 * `displaced` also shuffles the displacement and reads a per-vertex `fade`
 * attribute, for the near-field relief mesh. `rim` is the height, 0–1 of
 * the displacement, that the relief fades to where `fade` runs out: 0, the
 * lowest point, suits hills a few tens of metres high; ground with real
 * relief wants its average, or everything inside the rim stands up out of
 * the plate beyond it like a mesa.
 */
export function noTileShader(shader: CompilingShader, params: NoTileParams, displaced: boolean, rim?: { value: number }): void {
  shader.uniforms.ntParams = params;
  if (displaced) shader.uniforms.ntRim = rim ?? { value: 0 };
  let vs = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>\n${COMMON}${displaced ? '\nattribute float fade;\nuniform float ntRim;' : ''}`,
  );
  if (displaced) vs = vs.replace('#include <displacementmap_vertex>', DISPLACE);
  shader.vertexShader = vs.replace(
    '#include <project_vertex>',
    '#include <project_vertex>\n\tvNtWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
  );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${COMMON}\n${FRAGMENT}`)
    .replace('#include <map_fragment>', MAP)
    .replace('#include <emissivemap_fragment>', EMISSIVE)
    .replaceAll('texture2D( normalMap, vNormalMapUv )', 'noTile( normalMap, vNormalMapUv )');
}
