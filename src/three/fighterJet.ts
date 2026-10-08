import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && value.name !== 'shared-environment') textures.add(value);
    }
  });
  geometries.forEach(x => x.dispose()); materials.forEach(x => x.dispose()); textures.forEach(x => x.dispose());
}

/** The same missile geometry is used beneath the wings and in flight. Nose down -z. */
export function createMissileModel(): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xc8d3df, metalness: 0.55, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.5, 10), shell);
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x263342, metalness: 0.6, roughness: 0.25 }));
  tip.rotation.x = -Math.PI / 2; tip.position.z = -1.5;
  const fins = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.65, 0.55), shell);
    fin.position.z = 0.75; fin.rotation.z = i * Math.PI / 2; fins.add(fin);
  }
  group.add(body, tip, fins);
  return group;
}

export function createFighterJet(envMap?: THREE.Texture) {
  const group = new THREE.Group();
  group.name = 'F35 player';
  const missiles = ([-1, 1] as const).map(side => {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x475562, metalness: 0.45, roughness: 0.6 }));
    pylon.position.set(side * 3.3, -0.75, 0.1);
    const missile = createMissileModel(); missile.position.set(side * 3.3, -1.12, 0.1);
    group.add(pylon, missile);
    return missile;
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 18, 1, true), new THREE.MeshBasicMaterial({
    color: 0x69baff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flame.rotation.x = Math.PI / 2; flame.position.set(0, -0.65, 9.2); group.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 3.5, 12), new THREE.MeshBasicMaterial({
    color: 0xffdfa4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  core.rotation.x = Math.PI / 2; core.position.set(0, -0.65, 8.2); group.add(core);
  const shock = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7, 28, 1, true), new THREE.MeshBasicMaterial({
    color: 0xdff6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  shock.rotation.x = -Math.PI / 2; shock.position.z = 1; group.add(shock);
  let loading: Promise<void> | null = null;
  let disposed = false;
  let time = 0;
  let tailMeshes: THREE.Object3D[] = [];
  const load = () => loading ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/f35.glb`).then(gltf => {
    if (disposed) { disposeModel(gltf.scene); return; }
    gltf.scene.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (mesh.name === 'Port_elevator') tailMeshes.push(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = material as THREE.MeshStandardMaterial;
        if (envMap) { m.envMap = envMap; m.envMapIntensity = 0.7; }
      }
    });
    group.add(gltf.scene);
    group.userData.loaded = true;
  }).catch(error => {
    group.userData.loadError = true;
    console.warn('F35 model could not load', error);
  });
  return {
    group, load,
    update(dt: number, boost: number, ammo: readonly boolean[], tailDamage: number, failed: boolean) {
      time += dt;
      missiles.forEach((m, i) => { m.visible = ammo[i] ?? false; });
      tailMeshes.forEach(m => { m.visible = tailDamage < 0.5; });
      const flicker = 0.88 + Math.sin(time * 42) * 0.12;
      flame.material.opacity = (boost * 0.8 + (failed ? 0.3 : 0)) * flicker;
      flame.visible = boost > 0.01 || failed;
      flame.material.color.setHex(failed ? 0xff650f : 0x69baff);
      core.material.opacity = boost * 0.85;
      core.visible = boost > 0.01;
      flame.scale.y = 0.5 + boost * 0.7;
      shock.material.opacity = Math.max(0, (boost - 0.88) * 1.4) * flicker;
      shock.visible = boost > 0.88;
    },
    dispose() { disposed = true; tailMeshes = []; disposeModel(group); },
  };
}
