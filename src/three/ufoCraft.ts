import * as THREE from 'three';
import { disposeModel } from './fighterJet';

/**
 * The UFO, and the wing it takes, as the landing's scene draws them.
 *
 * Where the UFO is comes from `lib/ufo.ts`, in metres right, up and ahead of
 * the aeroplane; this puts it in the world, spins it, tips it into its
 * dashes, and gives it a glow that carries through the haze a kilometre
 * off. The model is public/ufo.glb, loaded only here, and only once the
 * flight starts — the idle landing never fetches it.
 *
 * The wing: when the UFO hits, everything past WING_CUT on that side is
 * clipped out of the airframe, and a copy of just that part — clipped the
 * other way — comes away on its own, drifting out and down and tumbling,
 * falling behind as the air slows it. Both clips are built with the scene,
 * so the moment it happens costs no shader a compile.
 */

export interface UfoPose {
  visible: boolean;
  right: number;
  up: number;
  ahead: number;
  scale: number;
  dash: number;
  strike?: { side: -1 | 1; p: number };
  /** How far the aeroplane has moved off the line the UFO was aimed along, metres right and up. */
  dev?: { right: number; up: number };
  /** Times the scout's size: the player's own saucer is bigger. */
  size?: number;
  /** Degrees of pitch and bank to hold it at, on the heading, instead of leaning it into its motion. */
  attitude?: { pitch: number; bank: number };
}

/** Across the saucer, metres: a small scout next to the airliner —
    still big enough to take a wingtip, not the aeroplane. */
const DIAMETER = 8;

function glowTexture(): THREE.CanvasTexture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(160,255,245,0.85)');
  grd.addColorStop(0.5, 'rgba(60,220,255,0.25)');
  grd.addColorStop(1, 'rgba(0,160,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface UfoCraft {
  group: THREE.Group;
  load(): Promise<void>;
  /**
   * Every frame. `base` is the aeroplane in the world, `heading` its
   * heading in degrees, `target` where the dash at the wing ends, in the
   * world. Returns nothing: it only draws.
   */
  update(dt: number, pose: UfoPose | undefined, base: THREE.Vector3, heading: number, target: THREE.Vector3): void;
  dispose(): void;
}

export function createUfoCraft(url: string): UfoCraft {
  const group = new THREE.Group();
  group.visible = false;
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  group.add(tilt);
  tilt.add(spin);
  const glowTex = glowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x9ff7ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  glow.scale.setScalar(DIAMETER * 3.4);
  glow.renderOrder = 4;
  group.add(glow);

  let loaded = false;
  let disposed = false;
  let loading: Promise<void> | null = null;
  const load = () => loading ??= import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
    .then((gltf) => {
      if (disposed) { disposeModel(gltf.scene); return; }
      const model = gltf.scene;
      // Centred on itself and sized to DIAMETER across, whatever the file's units.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const k = DIAMETER / Math.max(size.x, size.z, 1e-6);
      model.position.sub(centre).multiplyScalar(k);
      model.scale.multiplyScalar(k);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          // The ring's neon should read at a distance, through the haze.
          const std = m as THREE.MeshStandardMaterial;
          if (std.emissive && std.emissive.getHex() !== 0) std.emissiveIntensity = Math.max(std.emissiveIntensity, 6);
        }
      });
      spin.add(model);
      loaded = true;
    })
    .catch(() => {
      // No model, no UFO: the glow alone still makes the point at a distance.
      loaded = true;
    });

  const at = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const last = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let seen = false;
  let clock = 0;

  const update: UfoCraft['update'] = (dt, pose, base, heading, target) => {
    if (pose?.visible) void load();
    if (!pose?.visible || !loaded) {
      group.visible = false;
      seen = false;
      return;
    }
    clock += dt;
    const h = THREE.MathUtils.degToRad(heading);
    // Right, up and ahead of the aeroplane, on its heading: nose along (sin h, 0, -cos h).
    at.set(
      base.x + Math.cos(h) * pose.right + Math.sin(h) * pose.ahead,
      base.y + pose.up,
      base.z + Math.sin(h) * pose.right - Math.cos(h) * pose.ahead,
    );
    /* The dash at the wing ends on the wing the scene drew — less however
       far the aeroplane has got out of the way since it locked on. */
    const dx = pose.dev ? -Math.cos(h) * pose.dev.right : 0;
    const dz = pose.dev ? -Math.sin(h) * pose.dev.right : 0;
    const dy = pose.dev ? -pose.dev.up : 0;
    if (pose.strike) {
      aim.set(target.x + dx, target.y + dy, target.z + dz);
      at.lerp(aim, pose.strike.p * pose.strike.p);
    } else if (pose.dev) {
      at.x += dx;
      at.y += dy;
      at.z += dz;
    }
    if (seen && dt > 0) vel.copy(at).sub(last).divideScalar(dt);
    else vel.set(0, 0, 0);
    last.copy(at);
    seen = true;
    group.position.copy(at);
    group.visible = true;
    // It blinks into being, a touch too big and back.
    const pop = pose.scale < 1 ? pose.scale * (1 + 0.25 * Math.sin(pose.scale * Math.PI)) : 1;
    const size = pose.size ?? 1;
    tilt.scale.setScalar(Math.max(0.001, pop) * size);
    // The glow carries it at a distance, where the saucer itself is a speck; close up, less of it.
    const halo = size > 1 ? 1.5 + 0.6 * pose.dash : 3.2 + 0.8 * pose.dash;
    glow.scale.setScalar(DIAMETER * size * halo * Math.max(0.001, pop));
    (glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.35 * Math.sin(clock * 9) ** 2;
    // Spinning, and tipped into the way it is going — hard, while it dashes.
    spin.rotation.y += dt * 7;
    if (pose.attitude) {
      group.rotation.y = -h;
      tilt.rotation.set(THREE.MathUtils.degToRad(pose.attitude.pitch), 0, THREE.MathUtils.degToRad(-pose.attitude.bank));
      return;
    }
    group.rotation.y = 0;
    const speed = Math.hypot(vel.x, vel.z);
    const lean = Math.min(0.45, speed / 2400);
    if (speed > 1) {
      tilt.rotation.set((vel.z / speed) * lean, 0, (-vel.x / speed) * lean);
    } else {
      tilt.rotation.x *= 1 - Math.min(1, dt * 6);
      tilt.rotation.z *= 1 - Math.min(1, dt * 6);
    }
  };

  return {
    group,
    load,
    update,
    dispose: () => { disposed = true; disposeModel(group); },
  };
}

/* ── The wing that comes away ─────────────────────────────────────────── */

export interface WingBreak {
  /** The outer wing on `side` goes: its piece takes its place in the world, and starts to fall. */
  snap(side: -1 | 1): void;
  /** Every frame, after the airframe is posed. `flowX`/`flowZ` are what the world moved under the aeroplane this frame. */
  update(dt: number, flowX: number, flowZ: number): void;
  /** The wing back on, for a new flight. */
  reset(): void;
  dispose(): void;
}

export function createWingBreak(
  airframe: THREE.Object3D,
  outboard: (side: -1 | 1) => readonly THREE.Object3D[],
  cut: number,
  scene: THREE.Scene,
): WingBreak {
  /* The airframe keeps everything on its own side of the cut: to begin
     with that is everything, a plane a kilometre off. Planes are in the
     world, so they are moved with the airframe every frame. */
  const keep = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
  const keepLocal = keep.clone();
  const mats = new Set<THREE.Material>();
  airframe.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) mats.add(mat);
  });
  for (const m of mats) {
    m.clippingPlanes = [keep];
    m.clipShadows = true;
  }

  /* Each side's piece: copies of what reaches past the cut, clipped to
     keep only that part — and, until it is needed, clipped away entirely,
     so it is drawn (and compiled) from the start without being seen. */
  const pieces = ([-1, 1] as const).map((side) => {
    const group = new THREE.Group();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1e9);
    const local = new THREE.Plane(new THREE.Vector3(side, 0, 0), -cut);
    const own: THREE.Material[] = [];
    for (const part of outboard(side)) {
      const copy = part.clone(true);
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.material) return;
        const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
          const c = m.clone();
          c.clippingPlanes = [plane];
          c.clipShadows = true;
          own.push(c);
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      });
      group.add(copy);
    }
    scene.add(group);
    return {
      side, group, plane, local, own,
      falling: false, age: 0,
      vel: new THREE.Vector3(), spin: new THREE.Vector3(),
    };
  });

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let lost: -1 | 0 | 1 = 0;

  const follow = (g: THREE.Object3D) => {
    airframe.updateWorldMatrix(true, false);
    airframe.matrixWorld.decompose(g.position, g.quaternion, g.scale);
  };

  const snap = (side: -1 | 1) => {
    if (lost) return;
    lost = side;
    keepLocal.set(new THREE.Vector3(-side, 0, 0), cut);
    const p = pieces[side === -1 ? 0 : 1];
    follow(p.group);
    p.falling = true;
    p.age = 0;
    // Out and down and back, from the aeroplane's own frame, and tumbling.
    p.vel.set(side * 7, -3, 4).applyQuaternion(p.group.quaternion);
    p.spin.set(THREE.MathUtils.randFloat(-2, 2), THREE.MathUtils.randFloat(-3, 3), side * THREE.MathUtils.randFloat(4, 7));
  };

  const update = (dt: number, flowX: number, flowZ: number) => {
    airframe.updateWorldMatrix(true, false);
    keep.copy(keepLocal).applyMatrix4(airframe.matrixWorld);
    for (const p of pieces) {
      if (!p.falling) {
        follow(p.group);
        p.plane.set(p.plane.normal.set(1, 0, 0), -1e9);
        continue;
      }
      p.age += dt;
      if (dt > 0) {
        /* The air takes it: its speed relative to the aeroplane runs off
           toward the world's, which goes by at the aeroplane's speed — so
           it falls behind, slowly and then fast — and it drops. */
        const k = 1 - Math.exp(-0.9 * dt);
        p.vel.x += (flowX / dt - p.vel.x) * k;
        p.vel.z += (flowZ / dt - p.vel.z) * k;
        p.vel.y -= 9.81 * dt;
      }
      p.group.position.addScaledVector(p.vel, dt);
      e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.group.quaternion.multiply(q.setFromEuler(e));
      p.group.updateMatrixWorld(true);
      p.plane.copy(p.local).applyMatrix4(p.group.matrixWorld);
      // Long gone after a few seconds: clip it away rather than draw it for ever.
      if (p.age > 8) p.plane.set(p.plane.normal.set(1, 0, 0), -1e9);
    }
  };

  const reset = () => {
    lost = 0;
    keepLocal.set(new THREE.Vector3(1, 0, 0), 1e6);
    for (const p of pieces) p.falling = false;
  };

  return {
    snap,
    update,
    reset,
    dispose: () => pieces.forEach((p) => {
      p.own.forEach((m) => m.dispose());
      scene.remove(p.group);
    }),
  };
}
