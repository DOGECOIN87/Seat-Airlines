import * as THREE from 'three';
import { CELL, HAZE, POOL, RISE, SET, cellAt, inBand, place, shapeHeights, type RangeKind } from '../lib/ranges';
import { noise2 } from './noise';

/**
 * The mountains and valleys on the horizon.
 *
 * Two scanned landscapes, baked to 256 × 256 height fields (public/terrain,
 * see scripts/build-ranges.mjs): the snow-covered ranges of northern Montana
 * and the farmed hill country of southern Spain. They come without textures,
 * so the colour is worked out here from what the ground is doing — height,
 * slope, and a little noise to stop it reading as paint — the way a satellite
 * would see it: dark conifer up the valleys, bare rock where it is too steep
 * for anything to stand, snow above the line; ochre stubble, olive groves and
 * red earth on the Spanish hills.
 *
 * Cells of them (see lib/ranges.ts) are laid over the farmland on a lattice
 * that drifts past slowly. In the vertex shader each cell's relief rises out
 * of the ground as it comes into view on the horizon and sinks back before it
 * is overhead, so there is never a mountain to fly into — and its foothills
 * come up out of the fields rather than lying on them. Far out, a range pales
 * into the haze as it settles to the horizon line (see `SET` in lib/ranges).
 *
 * Only the cells that can show are drawn: each has a true bounding sphere, so
 * the renderer culls the ones behind the camera, and a cell wholly outside
 * the band where relief stands is not drawn at all.
 */

/** Metres from the plain to the highest point of each landscape. */
const PEAK: Record<RangeKind, number> = { montana: 5200, spain: 2400 };

/** Where the relief is sunk to when it is not showing: under the ground plate, which lies at −2. */
const SUNK = -30;

/** How much of its relief the ground's low colour is worked out for: foothill country, whatever the height. */
const LOW = 0.1;

const FILES: Record<RangeKind, string> = { montana: 'terrain/montana.bin', spain: 'terrain/spain.bin' };

const c = (hex: number) => new THREE.Color(hex);
const smooth = (t: number, a: number, b: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Colours a point of the ground: `h` is 0–1 up the range, `slope` rise over run, `n` and `m` noise. */
const PALETTES: Record<RangeKind, (out: THREE.Color, h: number, slope: number, n: number, m: number) => void> = {
  montana: (() => {
    const forest = c(0x29382a);
    const forestHigh = c(0x3d4a35);
    const scree = c(0x5d5850);
    const rock = c(0x76716a);
    const snow = c(0xf1f4f8);
    const shadeSnow = c(0xc9d3e0);
    return (out, h, slope, n, m) => {
      out.copy(forest).lerp(forestHigh, smooth(h, 0.05, 0.3) * (0.5 + n * 0.5));
      // Above the treeline, scree and rock.
      out.lerp(scree, smooth(h, 0.24 + m * 0.08, 0.42));
      out.lerp(rock, smooth(slope, 0.35, 0.8) * smooth(h, 0.1, 0.35));
      // The snowline is ragged and lower on gentle ground; cliffs shed it.
      const line = 0.6 - m * 0.14 - n * 0.05;
      const cover = smooth(h, line, line + 0.16) * (1 - smooth(slope, 0.55, 1.05) * 0.8);
      out.lerp(snow, cover).lerp(shadeSnow, cover * smooth(slope, 0.25, 0.7) * 0.5);
    };
  })(),
  spain: (() => {
    const stubble = c(0xb0a05a);
    const green = c(0x62733a);
    const olive = c(0x6f7040);
    const earth = c(0xa66b45);
    const scrub = c(0x8b8354);
    const rock = c(0x9d9280);
    return (out, h, slope, n, m) => {
      // The valley floor is a patchwork of fields; the two noises are the patches.
      out.copy(green).lerp(stubble, smooth(n, 0.4, 0.62)).lerp(earth, smooth(m, 0.62, 0.8) * (1 - h));
      out.lerp(olive, smooth(m, 0.3, 0.5) * smooth(h, 0.08, 0.3) * (1 - smooth(h, 0.5, 0.7)));
      // Higher up it is scrub and bare stone.
      out.lerp(scrub, smooth(h, 0.35, 0.6));
      out.lerp(rock, Math.max(smooth(slope, 0.3, 0.75), smooth(h, 0.65, 0.95)) * smooth(h, 0.1, 0.4));
    };
  })(),
};

/** One landscape as a mesh of `seg` × `seg` squares, its cell wide, with the colour baked in. */
function buildGeometry(kind: RangeKind, field: Float32Array, size: number, seg: number): THREE.BufferGeometry {
  const verts = (seg + 1) * (seg + 1);
  const position = new Float32Array(verts * 3);
  const colour = new Float32Array(verts * 3);
  // The same ground as it looks flattened, while the range is still rising out of it.
  const lowColour = new Float32Array(verts * 3);
  const heights = new Float32Array(verts);
  const sample = (u: number, v: number) => {
    const fx = u * (size - 1);
    const fy = v * (size - 1);
    const x0 = Math.min(size - 2, Math.floor(fx));
    const y0 = Math.min(size - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => field[y * size + x];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const k = j * (seg + 1) + i;
      const h = sample(i / seg, j / seg);
      heights[k] = h;
      position[k * 3] = (i / seg - 0.5) * CELL;
      position[k * 3 + 1] = h * PEAK[kind];
      position[k * 3 + 2] = (j / seg - 0.5) * CELL;
    }
  }
  const spacing = CELL / seg;
  const paint = new THREE.Color();
  const seed = kind === 'montana' ? 11 : 23;
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const k = j * (seg + 1) + i;
      const hx = heights[j * (seg + 1) + Math.min(seg, i + 1)] - heights[j * (seg + 1) + Math.max(0, i - 1)];
      const hz = heights[Math.min(seg, j + 1) * (seg + 1) + i] - heights[Math.max(0, j - 1) * (seg + 1) + i];
      const slope = (Math.hypot(hx, hz) * PEAK[kind]) / (spacing * 2);
      // Two scales of value noise: broad blotches and fine grain.
      const blot = (noise2(Math.floor(i / 5), Math.floor(j / 5), seed) + noise2(Math.floor(i / 11), Math.floor(j / 11), seed + 1)) / 2;
      const grain = noise2(i, j, seed + 2);
      const shade = 0.94 + grain * 0.12;
      PALETTES[kind](paint, heights[k], slope, blot, grain);
      colour[k * 3] = paint.r * shade;
      colour[k * 3 + 1] = paint.g * shade;
      colour[k * 3 + 2] = paint.b * shade;
      PALETTES[kind](paint, heights[k] * LOW, slope * LOW, blot, grain);
      lowColour[k * 3] = paint.r * shade;
      lowColour[k * 3 + 1] = paint.g * shade;
      lowColour[k * 3 + 2] = paint.b * shade;
    }
  }
  const index = new Uint32Array(seg * seg * 6);
  let n = 0;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const d = a + seg + 1;
      const e = d + 1;
      index.set([a, d, b, b, d, e], n);
      n += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.setAttribute('lowColor', new THREE.BufferAttribute(lowColour, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  /* The shader only ever lowers a vertex (toward SUNK), so the mesh as built,
     stretched down to SUNK, bounds it wherever it is drawn. */
  const top = PEAK[kind];
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (top + SUNK) / 2, 0), Math.hypot(CELL / Math.SQRT2, (top - SUNK) / 2));
  return geo;
}

export interface RangesHandles {
  group: THREE.Group;
  /** Carry the ranges with the ground's shift; `amount` is 0–1, 0 to lay them down out of sight. */
  update: (shiftX: number, shiftZ: number, amount: number) => void;
  dispose: () => void;
}

export function createRanges(o: { base: string; segments: number; envMap?: THREE.Texture }): RangesHandles {
  const group = new THREE.Group();
  group.visible = false;
  const amount = { value: 1 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMap: o.envMap ?? null, envMapIntensity: 0.5 });
  const f1 = (v: number) => v.toFixed(1);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rangeAmount = amount;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float rangeAmount;\nattribute vec3 lowColor;\nvarying float vRangeDist;\nvoid main() {')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // Relief comes up out of the ground through the rise, and goes back under it past the set.
        float rangeD = length((modelMatrix * vec4(position, 1.0)).xz);
        float rangeF = smoothstep(${f1(RISE[0])}, ${f1(RISE[1])}, rangeD) * (1.0 - smoothstep(${f1(SET[0])}, ${f1(SET[1])}, rangeD)) * rangeAmount;
        // A height field scaled by f has its slopes scaled by f: lit as it stands, not as it will.
        objectNormal = normalize(vec3(objectNormal.x * rangeF, objectNormal.y, objectNormal.z * rangeF));
        // And it wears the colours of the country it is, still low, not of the peaks it is to be.
        vColor.rgb = mix(lowColor, vColor.rgb, rangeF);
        vRangeDist = rangeD;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y = position.y * rangeF + ${f1(SUNK)} * (1.0 - rangeF);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying float vRangeDist;
        void main() {
          /* Nothing stands inside the rise or past the set: the ground there is
             sunk, and past the edge of the ground plate (60 km out along each
             axis) there is nothing above it to hide it, so it would show as a
             flat band just under the horizon. Nor is it worth shading. */
          if (vRangeDist < ${f1(RISE[0])} || vRangeDist > ${f1(SET[1])}) discard;`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        #ifdef USE_FOG
          // Into the haze with distance, as the range settles to the horizon.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${f1(HAZE[0])}, ${f1(HAZE[1])}, vRangeDist));
        #endif`,
      );
  };

  const geometries = new Map<RangeKind, THREE.BufferGeometry>();
  const slots: THREE.Mesh[] = [];
  for (let a = 0; a < POOL; a++) {
    for (let b = 0; b < POOL; b++) {
      const mesh = new THREE.Mesh(undefined, material);
      mesh.visible = false;
      mesh.userData = { a, b, i: NaN, j: NaN, dressed: false };
      slots.push(mesh);
      group.add(mesh);
    }
  }

  let disposed = false;
  for (const kind of ['montana', 'spain'] as const) {
    fetch(`${o.base}${FILES[kind]}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        if (disposed) return;
        const raw = new Uint16Array(buf);
        const size = Math.round(Math.sqrt(raw.length));
        geometries.set(kind, buildGeometry(kind, shapeHeights(raw, size), size, o.segments));
        for (const m of slots) m.userData.i = NaN; // dress the slots again
      })
      .catch(() => {
        // No mountains is a fair fallback: the farmland was fine on its own.
      });
  }

  const update = (shiftX: number, shiftZ: number, amt: number) => {
    amount.value = amt;
    group.visible = amt > 0.001 && geometries.size > 0;
    if (!group.visible) return;
    for (const mesh of slots) {
      const at = place(mesh.userData.a, mesh.userData.b, shiftX, shiftZ);
      if (at.i !== mesh.userData.i || at.j !== mesh.userData.j) {
        mesh.userData.i = at.i;
        mesh.userData.j = at.j;
        const cell = cellAt(at.i, at.j);
        const geo = cell.kind ? geometries.get(cell.kind) : undefined;
        mesh.userData.dressed = !!geo;
        if (geo) {
          mesh.geometry = geo;
          mesh.rotation.y = (cell.turns * Math.PI) / 2;
          mesh.scale.set(cell.mirror ? -1 : 1, cell.height, 1);
        }
      }
      mesh.position.set(at.x, 0, at.z);
      mesh.visible = mesh.userData.dressed && inBand(at.x, at.z);
    }
  };

  const dispose = () => {
    disposed = true;
    for (const g of geometries.values()) g.dispose();
    material.dispose();
  };

  return { group, update, dispose };
}
