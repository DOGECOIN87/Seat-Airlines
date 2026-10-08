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
export function precompiler(renderer: THREE.WebGLRenderer): (scene: THREE.Scene, camera: THREE.Camera) => boolean {
  let state: 'idle' | 'compiling' | 'ready' = renderer.extensions.has('KHR_parallel_shader_compile') ? 'idle' : 'ready';
  const ready = () => { state = 'ready'; };
  return (scene, camera) => {
    if (state === 'ready') return true;
    if (state === 'idle') {
      state = 'compiling';
      // Never hold the first frame for long, whatever the driver does.
      setTimeout(ready, 8000);
      /* three's own compileAsync polls the same way, but throws from inside
         its timer when a material has no program by the time it looks (one
         swapped or disposed while compiling), and its promise then never
         settles: the canvas sat black until the timeout above. Here a
         material without a program counts as done, and anything unexpected
         lets the frame through rather than holding it. */
      try {
        // compile() normally visits hidden meshes too. Compile the visible
        // view against the real scene's lights, without moving any objects.
        const visible = scene.clone(false);
        visible.traverse = scene.traverseVisible.bind(scene);
        const pending = renderer.compile(visible, camera, scene);
        const poll = () => {
          if (state === 'ready') return;
          try {
            for (const material of pending) {
              const { currentProgram } = renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } };
              if (!currentProgram || currentProgram.isReady()) pending.delete(material);
            }
          } catch {
            pending.clear();
          }
          if (pending.size === 0) ready();
          else setTimeout(poll, 10);
        };
        poll();
      } catch {
        ready();
      }
    }
    return false;
  };
}
