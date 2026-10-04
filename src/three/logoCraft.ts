import * as THREE from 'three';
import { LOGOS, type Logo } from '../lib/logos';
import { radialTexture } from './terrain';

/**
 * The logos the landing's game hangs in the sky (see lib/logos.ts), drawn:
 * each a big gold-rimmed coin with the AIRLINES badge on both faces,
 * spinning on its vertical axis and bobbing gently, in a soft golden halo
 * that makes it findable from a kilometre off. Flown through, it swells,
 * spins up and flashes out in a burst of gold sparks.
 */

export interface LogoCraft {
  group: THREE.Group;
  /** Every frame, with the logos about (relative to the aeroplane) and how dark it is, 0 day to 1 night. */
  update(dt: number, list: readonly Logo[] | undefined, night: number): void;
  dispose(): void;
}

const MOST = LOGOS.most;
/** Metres across the coin's face. */
const RADIUS = 13;
const SPARKS = 48;

export function createLogoCraft(url: string, envMap: THREE.Texture | null): LogoCraft {
  const group = new THREE.Group();
  const face = new THREE.TextureLoader().load(url);
  face.colorSpace = THREE.SRGBColorSpace;
  face.anisotropy = 8;
  /* The badge fills the middle of its square: zoom the cap's circle onto
     it, about the middle — and turn it a quarter, since the cap's uv is a
     quarter turn round from upright once the coin is stood on its edge. */
  face.center.set(0.5, 0.5);
  face.repeat.set(0.74, 0.74);
  face.rotation = Math.PI / 2;
  const coin = new THREE.CylinderGeometry(1, 1, 0.12, 72, 1);
  coin.rotateX(Math.PI / 2);
  const rim = new THREE.MeshStandardMaterial({
    color: 0xf2c14e, metalness: 1, roughness: 0.22, emissive: 0x7a5200, emissiveIntensity: 0.55, envMap, envMapIntensity: 1.4,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: face, emissiveMap: face, emissive: 0xffffff, emissiveIntensity: 0.5, metalness: 0.25, roughness: 0.3, envMap, envMapIntensity: 0.9,
  });
  const halo = radialTexture(0.05);
  const spark = radialTexture(0.3, 32);
  const owned: { dispose(): void }[] = [face, coin, rim, faceMat, halo, spark];
  // Rim, then the two faces: the order the cylinder's groups come in.
  const coinMats = [rim, faceMat, faceMat];

  const slots = Array.from({ length: MOST }, (_, i) => {
    const slot = new THREE.Group();
    slot.visible = false;
    group.add(slot);
    const mesh = new THREE.Mesh(coin, coinMats);
    mesh.scale.setScalar(RADIUS);
    slot.add(mesh);
    const glowMat = new THREE.SpriteMaterial({
      map: halo, color: 0xffd36b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(RADIUS * 5.5);
    slot.add(glow);
    const positions = new Float32Array(SPARKS * 3);
    const dirs = new Float32Array(SPARKS * 3);
    for (let k = 0; k < SPARKS; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 60);
      dirs.set([v.x, v.y, v.z], k * 3);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkMat = new THREE.PointsMaterial({
      map: spark, color: 0xffe08a, size: 4, sizeAttenuation: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    slot.add(sparks);
    owned.push(glowMat, sparkGeo, sparkMat);
    return { slot, mesh, glow, glowMat, positions, dirs, sparkGeo, sparkMat, phase: i * 1.3 };
  });

  let clock = 0;
  const update: LogoCraft['update'] = (dt, list, night) => {
    clock += dt;
    slots.forEach((s, i) => {
      const l = list?.[i];
      s.slot.visible = !!l;
      if (!l) return;
      const appear = Math.min(1, l.age / 0.5);
      const bob = Math.sin(clock * 1.8 + s.phase) * 2.5;
      s.slot.position.set(l.x, l.y + bob, l.z);
      if (l.taken < 0) {
        s.mesh.visible = true;
        s.mesh.rotation.y = clock * 3.2 + s.phase;
        s.mesh.scale.setScalar(RADIUS * (0.3 + 0.7 * appear));
        s.glowMat.opacity = (0.6 + 0.25 * Math.sin(clock * 4 + s.phase)) * appear * (0.8 + 0.4 * night);
        s.glow.scale.setScalar(RADIUS * 5.5);
        s.sparkMat.opacity = 0;
        return;
      }
      // Taken: it swells, spins up and flashes out, throwing sparks.
      const t = Math.min(1, l.taken / LOGOS.burst);
      s.mesh.visible = t < 0.55;
      s.mesh.rotation.y += dt * 25;
      s.mesh.scale.setScalar(RADIUS * (1 + 1.6 * t));
      s.glowMat.opacity = (1 - t) * 1.2;
      s.glow.scale.setScalar(RADIUS * (5.5 + 10 * t));
      for (let k = 0; k < SPARKS; k++) {
        s.positions[k * 3] = s.dirs[k * 3] * t;
        s.positions[k * 3 + 1] = s.dirs[k * 3 + 1] * t;
        s.positions[k * 3 + 2] = s.dirs[k * 3 + 2] * t;
      }
      (s.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      s.sparkMat.opacity = 1 - t * t;
    });
  };

  return {
    group,
    update,
    dispose: () => owned.forEach((d) => d.dispose()),
  };
}
