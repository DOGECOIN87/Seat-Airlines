import type * as THREE from 'three';

/**
 * Holds a scene's first frame back until its shaders are compiled — in
 * parallel, off the main thread — where the browser can do that.
 *
 * Left to itself three.js compiles each program the first time something
 * uses it and waits on it there and then, so a scene of thirty-odd programs
 * compiles them one after another with the page frozen throughout. With
 * `KHR_parallel_shader_compile` (most desktop and mobile browsers now) they
 * can all be started at once and polled: the driver works through them on
 * its own threads, the page stays responsive, and the first frame arrives
 * sooner. The canvas simply stays empty a moment longer, as it did while
 * frozen. Where the extension is missing nothing changes: compiling ahead
 * there would only freeze the page for the scene's hidden materials too.
 *
 * Returns a check to make before each frame: false while the scene should
 * not be drawn yet.
 */
export function precompiler(renderer: THREE.WebGLRenderer): (scene: THREE.Object3D, camera: THREE.Camera) => boolean {
  let state: 'idle' | 'compiling' | 'ready' = renderer.extensions.has('KHR_parallel_shader_compile') ? 'idle' : 'ready';
  const ready = () => { state = 'ready'; };
  return (scene, camera) => {
    if (state === 'ready') return true;
    if (state === 'idle') {
      state = 'compiling';
      try {
        renderer.compileAsync(scene, camera).then(ready, ready);
        // Never hold the first frame for long, whatever the driver does.
        setTimeout(ready, 8000);
      } catch {
        ready();
      }
    }
    return false;
  };
}
