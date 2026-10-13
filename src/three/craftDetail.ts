import * as THREE from 'three';

/**
 * The detail the supplied models do not carry, laid over them.
 *
 * models/f35.glb is three flat materials and ufo.glb is three more: shapes,
 * with nothing on them a pilot or a spotter would look for. So both get the
 * lights a real one wears, and the jet a canopy that catches the sky. Shared
 * by the hangar's previews and the flight itself, so the craft you pick is
 * the craft you fly.
 *
 * The jet's lights sit on points measured from its vertices (nose along −z,
 * metres, as its README gives them). The UFO's file carries a squashing,
 * flipping node transform, so its rim is found from the geometry instead.
 */

/** A soft round halo, for any light that should read from across the sky. */
function haloTexture(): THREE.CanvasTexture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Beacon {
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
}

/** A light: a hot core you can see up close, and a halo you can see far off. */
function beacon(color: number, size: number, halo: THREE.Texture): Beacon {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size, 12, 8),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: halo, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.scale.setScalar(size * 9);
  group.add(core, glow);
  return { group, core, halo: glow };
}

export interface CraftDetail {
  /** Seconds since the craft appeared: blinks, chases and pulses run off it. */
  update(time: number): void;
}

/* ── The jet ─────────────────────────────────────────────────────────── */

/** Where its lights go, measured from models/f35.glb. */
const JET = {
  wingtip: { x: 6.55, y: -0.77, z: 2.97 },
  tails: [[-2.38, 1.9, 7.08], [2.39, 1.9, 7.26]] as const,
  nozzle: { y: -0.65, z: 7.05, r: 0.42 },
};

export function addJetDetail(model: THREE.Object3D): CraftDetail {
  const halo = haloTexture();
  // Red to port, green to starboard: facing the nose (−z), port is −x.
  const port = beacon(0xff2d2d, 0.07, halo);
  port.group.position.set(-JET.wingtip.x, JET.wingtip.y, JET.wingtip.z);
  const starboard = beacon(0x2dff78, 0.07, halo);
  starboard.group.position.set(JET.wingtip.x, JET.wingtip.y, JET.wingtip.z);
  // A white strobe on top of each fin.
  const strobes = JET.tails.map(([x, y, z]) => {
    const b = beacon(0xffffff, 0.06, halo);
    b.group.position.set(x, y, z);
    return b;
  });
  // The nozzle, warm even at idle.
  const ember = new THREE.Mesh(
    new THREE.CircleGeometry(JET.nozzle.r, 28),
    new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  ember.position.set(0, JET.nozzle.y, JET.nozzle.z);
  model.add(port.group, starboard.group, ...strobes.map((s) => s.group), ember);

  /* The canopy in the gold-tinted, mirror-bright coating the real one wears,
     and the airframe a satin grey rather than flat paint, so the sky has
     something to slide over. One replacement per material, shared by every
     mesh that used it. */
  const swapped = new Map<THREE.Material, THREE.Material>();
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((material) => {
      const known = swapped.get(material);
      if (known) return known;
      const std = material as THREE.MeshStandardMaterial;
      let out: THREE.Material = material;
      if (material.name === 'F35 canopy') {
        out = new THREE.MeshPhysicalMaterial({
          name: material.name, color: 0x3d2f10, metalness: 0.9, roughness: 0.06,
          clearcoat: 1, clearcoatRoughness: 0.03, envMap: std.envMap ?? null, envMapIntensity: 1.6,
        });
        material.dispose();
      } else if (material.name === 'F35 fuselage') {
        std.metalness = 0.42;
        std.roughness = 0.52;
      } else if (material.name === 'F35 trim') {
        std.metalness = 0.55;
        std.roughness = 0.4;
      }
      swapped.set(material, out);
      return out;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  return {
    update(time) {
      // A double flash, every 1.3 seconds, the way a strobe goes.
      const phase = time % 1.3;
      const on = phase < 0.06 || (phase > 0.16 && phase < 0.22);
      for (const s of strobes) s.group.visible = on;
      const steady = 0.85 + 0.15 * Math.sin(time * 3);
      port.halo.material.opacity = steady;
      starboard.halo.material.opacity = steady;
      ember.material.opacity = 0.42 + 0.1 * Math.sin(time * 11);
    },
  };
}

/* ── The UFO ─────────────────────────────────────────────────────────── */

const RIM_LIGHTS = 20;

export function addUfoDetail(model: THREE.Object3D): CraftDetail {
  /* Find the rim, the belly and the dome in the model's own space: the
     widest ring of vertices, the lowest point and the highest. */
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  const points: THREE.Vector3[] = [];
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += step) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(toModel);
      points.push(v.clone());
      box.expandByPoint(v);
    }
  });
  const centre = box.getCenter(new THREE.Vector3());
  let radius = 0;
  let rimY = centre.y;
  for (const p of points) {
    const r = Math.hypot(p.x - centre.x, p.z - centre.z);
    if (r > radius) { radius = r; rimY = p.y; }
  }
  /* The dome is the narrow end, whichever way up the file has it. */
  const belly = Math.abs(box.max.y - rimY) > Math.abs(rimY - box.min.y) ? box.min.y : box.max.y;
  const halo = haloTexture();

  // A ring of lights round the rim, chasing.
  const cyan = new THREE.Color(0x7df7ff);
  const violet = new THREE.Color(0xb48cff);
  const lights = Array.from({ length: RIM_LIGHTS }, (_, i) => {
    const a = (i / RIM_LIGHTS) * Math.PI * 2;
    const b = beacon(0x7df7ff, radius * 0.035, halo);
    b.group.position.set(centre.x + Math.cos(a) * radius * 1.01, rimY, centre.z + Math.sin(a) * radius * 1.01);
    b.halo.scale.setScalar(radius * 0.22);
    model.add(b.group);
    return { b, a };
  });

  // The light it hangs on, underneath.
  const under = new THREE.Sprite(new THREE.SpriteMaterial({
    map: halo, color: 0x7df7ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  under.position.set(centre.x, belly - Math.sign(rimY - belly) * radius * 0.05, centre.z);
  under.scale.setScalar(radius * 1.6);
  model.add(under);

  const mix = new THREE.Color();
  return {
    update(time) {
      for (const { b, a } of lights) {
        const k = (0.5 + 0.5 * Math.cos(a - time * 3.2)) ** 6;
        mix.copy(cyan).lerp(violet, 0.5 + 0.5 * Math.sin(a * 2 + time));
        b.core.material.color.copy(mix).multiplyScalar(0.3 + 0.7 * k);
        b.halo.material.color.copy(mix);
        b.halo.material.opacity = 0.15 + 0.85 * k;
      }
      under.material.opacity = 0.45 + 0.2 * Math.sin(time * 2.4);
    },
  };
}
