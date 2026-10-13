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

/**
 * Use both fields of view; a narrow bay must not crop the wings during
 * rotation. The bounding sphere holds the aircraft at every angle it turns
 * to, so framing the sphere tangent to the narrower field is already the
 * guarantee; 3% over it keeps every corner strictly inside. (It was 12% and
 * a fixed 0.2 on top, which left each craft small in its card.)
 */
export function previewDistance(radius: number, verticalFov: number, aspect: number): number {
  const halfVertical = THREE.MathUtils.degToRad(verticalFov) / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(aspect, 0.01));
  return radius * 1.03 / Math.sin(Math.min(halfVertical, halfHorizontal));
}

/** How much of the frame, edge to edge, a turning craft may fill at its widest. */
const FILL = 0.9;

/** How far a model turning on its vertical axis reaches, in the space it turns in. */
export interface TurntableExtent {
  /** The furthest any vertex gets from the axis. */
  radius: number;
  low: number;
  high: number;
}

/**
 * The model's real reach, vertex by vertex, in `space` (the pivot it turns
 * on). A box's corners stick out where no aircraft is — the airliner's
 * bounding sphere is 27 m across the middle, its nose and tail 19 m — so
 * framing the actual vertices lets each craft fill its bay.
 */
export function turntableExtent(root: THREE.Object3D, space: THREE.Object3D): TurntableExtent {
  root.updateMatrixWorld(true);
  space.updateMatrixWorld(true);
  const toSpace = space.matrixWorld.clone().invert();
  const toMesh = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  const full = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const extent: TurntableExtent = { radius: 0, low: Infinity, high: -Infinity };
  root.traverseVisible((node) => {
    /* A halo is part of the craft's silhouette too: the UFO's rim lights
       glow out past its rim. Its bright core, the inner half, counts, and
       only outwards: the light under the saucer would otherwise stretch
       the frame down to where the hull hides it. */
    if ((node as THREE.Sprite).isSprite) {
      full.multiplyMatrices(toSpace, node.matrixWorld);
      v.setFromMatrixPosition(full);
      const core = Math.max(...scale.setFromMatrixScale(full).toArray()) / 4;
      extent.radius = Math.max(extent.radius, Math.hypot(v.x, v.z) + core);
      return;
    }
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => material.visible && (!material.transparent || material.opacity > 0))) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    toMesh.multiplyMatrices(toSpace, mesh.matrixWorld);
    const copies = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    for (let k = 0; k < copies; k++) {
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(k, instance);
        full.multiplyMatrices(toMesh, instance);
      } else full.copy(toMesh);
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(full);
        const r = Math.hypot(v.x, v.z);
        if (r > extent.radius) extent.radius = r;
        if (v.y < extent.low) extent.low = v.y;
        if (v.y > extent.high) extent.high = v.y;
      }
    }
  });
  if (!Number.isFinite(extent.low)) return { radius: 1, low: -1, high: 1 };
  return extent;
}

/**
 * The nearest the camera can sit, along `direction`, and keep a model of
 * this extent inside the frame at every angle it turns to. Found by search
 * against the cylinder that holds it — its rims at the low and the high
 * point, projected through the camera as it really is — so it is exact for
 * any aspect and any elevation. At the widest point of its turn a craft
 * reaches FILL of the way to the frame's edge, so even the saucer, as wide
 * at every angle, has air round it.
 */
export function turntableDistance(extent: TurntableExtent, verticalFov: number, aspect: number, direction: THREE.Vector3): number {
  const camera = new THREE.PerspectiveCamera(verticalFov, Math.max(aspect, 0.01), 0.01, 1e6);
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    for (const y of [extent.low, extent.high]) rim.push(new THREE.Vector3(Math.cos(a) * extent.radius, y, Math.sin(a) * extent.radius));
  }
  const unit = direction.clone().normalize();
  const p = new THREE.Vector3();
  const fits = (distance: number) => {
    camera.position.copy(unit).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    return rim.every((point) => {
      p.copy(point).project(camera);
      return Math.abs(p.x) < FILL && Math.abs(p.y) < FILL && p.z < 1 && p.z > -1;
    });
  };
  const reach = Math.max(extent.radius, Math.abs(extent.low), Math.abs(extent.high), 1e-3);
  let near = reach;
  let far = reach * 4;
  while (!fits(far)) far *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return far;
}
