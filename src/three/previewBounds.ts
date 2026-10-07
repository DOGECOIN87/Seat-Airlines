import * as THREE from 'three';

/** Bounds of rendered meshes, excluding hidden effects such as the 470m contrails. */
export function previewBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => material.visible && (!material.transparent || material.opacity > 0))) return;
    let box: THREE.Box3 | null;
    if (mesh instanceof THREE.InstancedMesh) {
      mesh.computeBoundingBox();
      box = mesh.boundingBox;
    } else {
      mesh.geometry.computeBoundingBox();
      box = mesh.geometry.boundingBox;
    }
    if (box) bounds.union(box.clone().applyMatrix4(mesh.matrixWorld));
  });
  return bounds;
}

/** Use both fields of view; a narrow bay must not crop the wings during rotation. */
export function previewDistance(radius: number, verticalFov: number, aspect: number): number {
  const halfVertical = THREE.MathUtils.degToRad(verticalFov) / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(aspect, 0.01));
  return (radius + 0.2) * 1.12 / Math.sin(Math.min(halfVertical, halfHorizontal));
}
