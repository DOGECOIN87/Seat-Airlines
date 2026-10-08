import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAirframe, type AirframeHandles } from '../three/airframe';
import { previewBounds, previewDistance } from '../three/previewBounds';
import { createFighterJet } from '../three/fighterJet';
import { observeElementVisibility, renderingProfile } from '../lib/rendering';

export type PreviewModel = 'airliner' | 'jet' | 'ufo';

interface AircraftModelPreviewProps {
  model: PreviewModel;
  active?: boolean;
}

function fitModel(root: THREE.Object3D, targetSize: number): void {
  root.updateMatrixWorld(true);
  const box = previewBounds(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(scale);
  root.position.sub(centre.multiplyScalar(scale));
  root.updateMatrixWorld(true);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

/** Keep GLB and procedurally-built materials visually consistent in the preview. */
function configurePreviewMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const textured = material as THREE.MeshStandardMaterial;
      if (textured.map) textured.map.colorSpace = THREE.SRGBColorSpace;
      if (textured.emissiveMap) textured.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      textured.needsUpdate = true;
    });
  });
}

function makeFallbackUfo(): THREE.Group {
  const fallback = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9ff7ff, emissive: 0x2aa9d8, emissiveIntensity: 2.8, metalness: 0.35, roughness: 0.2 }),
  );
  dome.scale.y = 0.55;
  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 1.4, 0.28, 32),
    new THREE.MeshStandardMaterial({ color: 0x6d55c8, emissive: 0x332078, emissiveIntensity: 2.2, metalness: 0.65, roughness: 0.18 }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.12, 10, 32),
    new THREE.MeshBasicMaterial({ color: 0x7df7ff }),
  );
  ring.rotation.x = Math.PI / 2;
  fallback.add(saucer, dome, ring);
  return fallback;
}

/** A small, responsive Three.js viewport used by the hangar roster. */
export default function AircraftModelPreview({ model, active = true }: AircraftModelPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    /* A canvas of its own each time: the context is given back on the way
       out (see below), and a lost one cannot be had again from the same
       element — which StrictMode's second mount would otherwise ask for. */
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);
    const profile = renderingProfile();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: profile.antialias, powerPreference: 'low-power' });
    } catch {
      canvas.remove();
      return; // Keep the labelled fallback and ride selection usable without WebGL.
    }
    renderer.setPixelRatio(profile.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const contextLost = (event: Event) => {
      event.preventDefault();
      delete host.dataset.ready;
    };
    canvas.addEventListener('webglcontextlost', contextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(model === 'ufo' ? 0 : 9.5, model === 'ufo' ? 7.2 : 5.2, model === 'ufo' ? 15 : 13.5);
    camera.lookAt(0, 0, 0);
    const viewDirection = camera.position.clone().normalize();
    scene.add(new THREE.HemisphereLight(0xbbeeff, 0x071425, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(7, 12, 9);
    scene.add(key);
    const rim = new THREE.PointLight(model === 'ufo' ? 0x9d6dff : 0x42dfff, 12, 28);
    rim.position.set(-7, 2, -5);
    scene.add(rim);

    /* What spins: the model is centred on it, so it turns about its middle. */
    const pivot = new THREE.Group();
    scene.add(pivot);
    let root: THREE.Object3D;
    let airframe: AirframeHandles | null = null;
    let fighter: ReturnType<typeof createFighterJet> | null = null;
    let fallback: THREE.Group | null = null;
    let disposed = false;
    const loader = new GLTFLoader();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let onScreen = false;
    const interval = 1000 / (profile.lowPower ? 20 : 30) - 1;
    const animate = (now: number) => {
      frame = 0;
      if (disposed || !onScreen || document.hidden || !host.clientWidth || !host.clientHeight
        || renderer.getContext().isContextLost()) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      if (last && now - last < interval) {
        frame = requestAnimationFrame(animate);
        return;
      }
      last = now;
      const moving = activeRef.current && !motion.matches;
      if (moving) {
        elapsed += dt;
        pivot.rotation.y += dt * (model === 'ufo' ? 0.72 : 0.28);
        pivot.position.y = Math.sin(elapsed * 1.6) * 0.16;
      }
      airframe?.update(moving ? dt : 0, { contrail: 0, stream: 0, bank: 0, pitch: 2, night: 0.12, cabin: 0.65, mood: 0, calm: true });
      renderer.render(scene, camera);
      host.dataset.ready = 'true';
      if (moving) frame = requestAnimationFrame(animate);
    };
    const requestDraw = () => {
      if (!disposed && onScreen && !document.hidden && !frame) {
        last = 0;
        frame = requestAnimationFrame(animate);
      }
    };
    redraw.current = requestDraw;
    let radius = 1;
    const frameModel = () => {
      const bounds = previewBounds(root);
      radius = bounds.isEmpty() ? 1 : bounds.getBoundingSphere(new THREE.Sphere()).radius;
      camera.position.copy(viewDirection).multiplyScalar(previewDistance(radius, camera.fov, camera.aspect));
      camera.far = camera.position.length() + radius * 4;
      camera.updateProjectionMatrix();
    };

    if (model === 'airliner') {
      airframe = createAirframe();
      // Set the effects' visibility before measuring. Box3.setFromObject also
      // includes invisible contrails, shrinking and moving the plane out of its bay.
      airframe.update(0, { contrail: 0, stream: 0, bank: 0, pitch: 0, night: 0.12, cabin: 0.65, mood: 0, calm: true });
      root = airframe.group;
      root.rotation.y = Math.PI;
      fitModel(root, 18);
      configurePreviewMaterials(root);
      pivot.add(root);
    } else if (model === 'jet') {
      fighter = createFighterJet();
      root = fighter.group;
      root.rotation.y = Math.PI;
      pivot.add(root);
      void fighter.load().then(() => {
        if (disposed) return;
        fighter?.update(0, 0, [true, true], 0, false);
        fitModel(root, 16);
        frameModel();
        requestDraw();
      });
    } else {
      const ufoRoot = new THREE.Group();
      fallback = makeFallbackUfo();
      fitModel(fallback, 10.5);
      ufoRoot.add(fallback);
      root = ufoRoot;
      pivot.add(root);
      void loader.loadAsync(`${import.meta.env.BASE_URL}ufo.glb`).then((gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const actual = gltf.scene;
        actual.rotation.x = -0.15;
        fitModel(actual, 10.5);
        actual.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          materials.forEach((material) => {
            const lit = material as THREE.MeshStandardMaterial;
            if (lit.emissive) lit.emissiveIntensity = Math.max(lit.emissiveIntensity || 0, 2.5);
          });
        });
        configurePreviewMaterials(actual);
        if (fallback) {
          ufoRoot.remove(fallback);
          disposeObject(fallback);
          fallback = null;
        }
        ufoRoot.add(actual);
        frameModel();
        requestDraw();
      }).catch(() => { /* The local fallback remains usable if the optional GLB cannot load. */ });
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      frameModel();
      requestDraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const visibilityChanged = () => {
      if (!onScreen || document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
      } else requestDraw();
    };
    const stopObserving = observeElementVisibility(host, visible => { onScreen = visible; visibilityChanged(); });
    document.addEventListener('visibilitychange', visibilityChanged);
    motion.addEventListener('change', requestDraw);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      redraw.current = () => {};
      stopObserving();
      document.removeEventListener('visibilitychange', visibilityChanged);
      motion.removeEventListener('change', requestDraw);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      airframe?.dispose();
      fighter?.dispose();
      if (!airframe && !fighter) disposeObject(root);
      renderer.dispose();
      // Browsers keep only so many contexts; past that the oldest — the flight's — is the one lost.
      renderer.forceContextLoss();
      canvas.remove();
      scene.clear();
      delete host.dataset.ready;
    };
  }, [model]);

  useEffect(() => { redraw.current(); }, [active]);

  return (
    <div ref={hostRef} className="sa-aircraft-picker__model-canvas" role="img" aria-label={`${model === 'ufo' ? 'UFO interceptor' : model === 'jet' ? 'F35 fighter jet' : 'SA350 airliner'} 3D preview`}>
        {model === 'airliner'
          ? <img className="sa-aircraft-picker__fallback" src={`${import.meta.env.BASE_URL}plane-top.svg`} alt="" />
          : <span className="sa-aircraft-picker__fallback" aria-hidden>◉</span>}
    </div>
  );
}
