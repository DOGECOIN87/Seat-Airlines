import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderingProfile, observeElementVisibility } from '../dist-test/lib/rendering.js';
import { precompiler } from '../dist-test/three/precompile.js';

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setDevice = ({ coarse = false, narrow = false, agent = '', cores = 8, dpr = 3 } = {}) => {
  globalThis.window = { devicePixelRatio: dpr, matchMedia: query => ({ matches: query.includes('pointer') ? coarse : narrow }) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: agent, hardwareConcurrency: cores } });
};

setDevice({ coarse: true });
assert.equal(renderingProfile().fps, 30, 'A touch phone starts at 30 FPS without waiting for thermal throttling');
assert.equal(renderingProfile().pixelRatio, 1.25, 'A retina phone has a bounded render buffer');
assert.equal(renderingProfile().antialias, false);
setDevice({ agent: 'Mozilla/5.0 (iPad)' });
assert.equal(renderingProfile().lowPower, true, 'Wide mobile screens keep the lighter profile');
setDevice({ cores: 4 });
assert.equal(renderingProfile().powerPreference, 'low-power');
setDevice({ dpr: 1 });
assert.equal(renderingProfile().fps, 60, 'A desktop keeps the full animation rate');
assert.equal(renderingProfile().pixelRatio, 1, 'A standard screen is not supersampled');
assert.equal(renderingProfile().antialias, true);
setDevice({});
assert.equal(renderingProfile().pixelRatio, 2);

let intersection;
let disconnected = false;
window.IntersectionObserver = true;
globalThis.IntersectionObserver = class {
  constructor(callback) { intersection = callback; }
  observe() {}
  disconnect() { disconnected = true; }
};
globalThis.innerHeight = 844;
globalThis.innerWidth = 390;
const visibility = [];
const stop = observeElementVisibility({ getBoundingClientRect: () => ({ width: 390, height: 200, top: 900, bottom: 1100, left: 0, right: 390 }) }, value => visibility.push(value));
intersection([{ isIntersecting: true, intersectionRatio: 0.5, boundingClientRect: { width: 390, height: 200 } }]);
intersection([{ isIntersecting: true, intersectionRatio: 1, boundingClientRect: { width: 0, height: 0 } }]);
stop();
assert.deepEqual(visibility, [false, true, false], 'A scene pauses off-screen or in a collapsed panel and resumes when it returns');
assert.ok(disconnected, 'Unmounting releases the visibility observer');

const scene = new THREE.Scene();
const exterior = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
const interior = new THREE.Group();
const cabin = exterior.clone();
interior.visible = false;
interior.add(cabin);
scene.add(exterior, interior, new THREE.DirectionalLight());
const timers = [];
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return 0; };
try {
  let ready = false;
  let compiled = [];
  let lightCount = 0;
  const renderer = {
    extensions: { has: () => true },
    properties: { get: () => ({ currentProgram: { isReady: () => ready } }) },
    compile(view, camera, target) {
      compiled = [];
      view.traverse(node => { if (node.isMesh) compiled.push(node); });
      lightCount = 0;
      for (const source of [view, target]) source.traverseVisible(node => { if (node.isLight) lightCount++; });
      return new Set(compiled.map(node => node.material));
    },
  };
  const draw = precompiler(renderer);
  assert.equal(draw(scene, new THREE.PerspectiveCamera()), false);
  assert.deepEqual(compiled, [exterior], 'Hidden cabin shaders do not delay the exterior first frame');
  assert.equal(lightCount, 1, 'The filtered view does not duplicate scene lights');
  assert.equal(cabin.parent, interior, 'Compilation preserves the real object hierarchy');
  ready = true;
  timers.find(timer => timer.delay === 10).callback();
  assert.equal(draw(scene, new THREE.PerspectiveCamera()), true);
  exterior.visible = false;
  interior.visible = true;
  precompiler(renderer)(scene, new THREE.PerspectiveCamera());
  assert.deepEqual(compiled, [cabin], 'An interior view still compiles its visible cabin');
} finally {
  globalThis.setTimeout = originalTimeout;
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  else delete globalThis.navigator;
  delete globalThis.window;
  delete globalThis.IntersectionObserver;
  delete globalThis.innerHeight;
  delete globalThis.innerWidth;
}
console.log('Rendering: mobile/desktop profiles, visibility lifecycle, visible shader compilation and scene-light integrity passed.');
