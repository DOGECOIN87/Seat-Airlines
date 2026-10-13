import assert from 'node:assert/strict';
import * as THREE from 'three';
import { previewBounds, previewDistance, turntableDistance, turntableExtent } from '../dist-test/previewBounds.js';

const root = new THREE.Group();
const plane = new THREE.Mesh(new THREE.BoxGeometry(32, 8, 38), new THREE.MeshBasicMaterial());
plane.position.z = 12;
root.add(plane);
const trail = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 470), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
trail.position.z = 270;
root.add(trail);
const hidden = new THREE.Group();
hidden.visible = false;
hidden.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), new THREE.MeshBasicMaterial()));
root.add(hidden);

const expected = new THREE.Box3().setFromObject(plane);
assert.ok(previewBounds(root).equals(expected), 'Invisible trails and hidden subtrees must not change aircraft framing');
trail.material.opacity = 1;
trail.material.visible = false;
assert.ok(previewBounds(root).equals(expected), 'Invisible materials must also be excluded');
assert.ok(previewBounds(new THREE.Group()).isEmpty(), 'An empty preview has no invented geometry');

const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial(), 2);
instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-3, 0, 0));
instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0));
assert.equal(previewBounds(instances).getSize(new THREE.Vector3()).x, 8, 'Instanced aircraft details use their instance bounds');

// Project the model corners through a full rotation, at narrow, square and
// ultrawide card ratios. This catches camera fitting that uses only height.
plane.position.sub(expected.getCenter(new THREE.Vector3()));
const radius = previewBounds(plane).getBoundingSphere(new THREE.Sphere()).radius;
let projections = 0;
for (const aspect of [0.25, 0.5, 0.75, 1, 1.5, 2, 4]) {
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 2000);
  camera.position.set(9.5, 5.2, 13.5).normalize().multiplyScalar(previewDistance(radius, 32, aspect));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const rotation = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(degrees));
    for (const x of [-16, 16]) for (const y of [-4, 4]) for (const z of [-19, 19]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(rotation);
      point.y += 0.16;
      point.project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1,
        `Aircraft must stay inside the bay at aspect ${aspect}, rotation ${degrees}`);
      projections++;
    }
  }
}
// The turntable framing, from the vertices themselves: every corner of the
// same aeroplane stays inside at every angle and every card ratio.
const pivot = new THREE.Group();
pivot.add(plane);
const extent = turntableExtent(plane, pivot);
assert.ok(extent.radius > 24 && extent.radius < 25.2, `Turntable radius is the corners' reach from the axis (${extent.radius})`);
const view = new THREE.Vector3(9.5, 5.2, 13.5);
for (const aspect of [0.25, 0.5, 0.75, 1, 1.5, 2, 4]) {
  const distance = turntableDistance(extent, 32, aspect, view);
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 2000);
  camera.position.copy(view).normalize().multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  let widest = 0;
  for (let degrees = 0; degrees < 360; degrees += 1) {
    const rotation = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(degrees));
    for (const x of [-16, 16]) for (const y of [-4, 4]) for (const z of [-19, 19]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(rotation).project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1,
        `Turntable framing keeps the aircraft inside at aspect ${aspect}, rotation ${degrees}`);
      widest = Math.max(widest, Math.abs(point.x), Math.abs(point.y));
      projections++;
    }
  }
  // Air round it at its widest, but no more than that: the craft fills its bay.
  // (The framing samples the rim every 5°, so a corner between two samples may
  // reach a hair past 90%.)
  assert.ok(widest > 0.85 && widest < 0.905, `Turntable framing fills 85–90% of the frame at aspect ${aspect} (${widest.toFixed(3)})`);
}
console.log(`Aircraft preview: hidden-effect bounds, instancing, empty state, turntable framing and ${projections} projected corners passed.`);
