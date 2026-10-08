import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BLIMP, type AerialState } from '../lib/aerialCombat';
import { createMissileModel, disposeModel } from './fighterJet';

/** Aircraft, projectiles and explosions in the same moving world as the scenery. */
export function createAerialCraft() {
  const group = new THREE.Group();
  const blimp = new THREE.Group(); blimp.visible = false; group.add(blimp);
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 1024; labelCanvas.height = 160;
  const ctx = labelCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#132749'; ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = '#f8fcff'; ctx.font = '800 104px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SEAT AIRLINES', 512, 80, 970);
  }
  const label = new THREE.CanvasTexture(labelCanvas); label.colorSpace = THREE.SRGBColorSpace;
  let disposed = false;
  let loaded = false;
  void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/seat-blimp.glb`).then(gltf => {
    if (disposed) { disposeModel(gltf.scene); return; }
    const model = gltf.scene; model.rotation.y = -Math.PI / 2; model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = BLIMP.length / bounds.getSize(new THREE.Vector3()).z;
    model.position.sub(bounds.getCenter(new THREE.Vector3())).multiplyScalar(scale); model.scale.multiplyScalar(scale);
    model.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.name === 'SEAT envelope') {
        // Paint the wordmark onto the supplied hull, following its curvature on both sides.
        const positions = mesh.geometry.attributes.position;
        const uv = new Float32Array(positions.count * 2);
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          uv[i * 2] = 0.5 + (y > 0 ? x : -x) / 39;
          uv[i * 2 + 1] = 0.5 + (-z - 11.79) / 5.2;
        }
        mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        material.map = label; material.color.setHex(0xffffff);
        material.emissiveMap = label; material.emissive.setHex(0xffffff); material.emissiveIntensity = 0.18;
        material.needsUpdate = true;
      }
    });
    blimp.add(model); loaded = true; group.userData.blimpLoaded = true;
  }).catch(error => { group.userData.loadError = true; console.warn('Blimp model could not load', error); });
  const missileSlots = Array.from({ length: 2 }, () => {
    const model = createMissileModel(); model.visible = false; group.add(model);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 7, 10), new THREE.MeshBasicMaterial({
      color: 0xffb458, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    trail.rotation.x = Math.PI / 2; trail.position.z = 4; model.add(trail);
    return model;
  });
  const blasts = Array.from({ length: 3 }, () => {
    const root = new THREE.Group(); root.visible = false; group.add(root);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({
      color: 0xffaf32, transparent: true, opacity: 0, depthWrite: false,
    })); root.add(ball);
    const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.8, 3), new THREE.MeshStandardMaterial({ color: 0x283642, roughness: 0.85 }), 24);
    root.add(debris);
    const directions = Array.from({ length: 24 }, () => new THREE.Vector3().randomDirection());
    const flash = new THREE.PointLight(0xffad45, 0, 240); root.add(flash);
    return { root, ball, debris, directions, flash };
  });
  const aim = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const update = (state: AerialState | undefined, altitude: number, base: THREE.Vector3) => {
    group.position.copy(base);
    const b = state?.blimp;
    blimp.visible = !!b?.alive && loaded;
    if (b) { blimp.position.set(b.x, b.y - altitude, b.z); blimp.rotation.y = -THREE.MathUtils.degToRad(b.heading); }
    missileSlots.forEach((model, i) => {
      const m = state?.missiles[i]; model.visible = !!m;
      if (!m) return;
      model.position.set(m.x, m.y - altitude, m.z);
      aim.set(m.x + m.velocity.x, m.y - altitude + m.velocity.y, m.z + m.velocity.z).add(base);
      // Object3D's +z looks forward, while the missile's nose is -z.
      model.lookAt(aim); model.rotateY(Math.PI);
    });
    blasts.forEach((slot, i) => {
      const e = state?.explosions[i]; slot.root.visible = !!e;
      if (!e) return;
      slot.root.position.set(e.x, e.y - altitude, e.z);
      const t = e.age;
      slot.ball.scale.setScalar(e.size * (0.1 + Math.min(1, t * 2.4)));
      slot.ball.material.opacity = Math.max(0, 1 - t / 1.2);
      slot.ball.material.color.setRGB(1, Math.max(0.08, 0.8 - t), Math.max(0.02, 0.32 - t));
      slot.flash.intensity = Math.max(0, 1800 * (1 - t / 0.5));
      for (let n = 0; n < 24; n++) {
        dummy.position.copy(slot.directions[n]).multiplyScalar(t * (e.size * 0.7 + n));
        dummy.position.y -= 4.9 * t * t;
        dummy.rotation.set(t * (n % 3 + 1), t * (n % 5 + 1), t);
        dummy.scale.setScalar(e.size / 30); dummy.updateMatrix(); slot.debris.setMatrixAt(n, dummy.matrix);
      }
      slot.debris.instanceMatrix.needsUpdate = true;
    });
  };
  return { group, update, dispose() { disposed = true; disposeModel(group); label.dispose(); } };
}
