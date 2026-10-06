import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAirframe, type AirframeHandles } from '../three/airframe';

export type PreviewModel = 'airliner' | 'ufo';

interface AircraftModelPreviewProps {
  model: PreviewModel;
}

function fitModel(root: THREE.Object3D, targetSize: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
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
    materials.forEach((material) => material.dispose());
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
  fallback.add(saucer, dome, ring);
  return fallback;
}

/** A small, responsive Three.js viewport used by the hangar roster. */
export default function AircraftModelPreview({ model }: AircraftModelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(model === 'ufo' ? 0 : 9.5, model === 'ufo' ? 7.2 : 5.2, model === 'ufo' ? 15 : 13.5);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xbbeeff, 0x071425, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(7, 12, 9);
    scene.add(key);
    const rim = new THREE.PointLight(model === 'ufo' ? 0x9d6dff : 0x42dfff, 12, 28);
    rim.position.set(-7, 2, -5);
    scene.add(rim);

    let root: THREE.Object3D;
    let airframe: AirframeHandles | null = null;
    let fallback: THREE.Group | null = null;
    let rootBaseY = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    const loader = new GLTFLoader();

    if (model === 'airliner') {
      airframe = createAirframe();
      root = airframe.group;
      fitModel(root, 18);
      root.rotation.y = Math.PI;
      rootBaseY = root.position.y;
      scene.add(root);
    } else {
      const ufoRoot = new THREE.Group();
      fallback = makeFallbackUfo();
      fitModel(fallback, 10.5);
      ufoRoot.add(fallback);
      root = ufoRoot;
      scene.add(root);
      void loader.loadAsync(`${import.meta.env.BASE_URL}ufo.glb`).then((gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const actual = gltf.scene;
        fitModel(actual, 10.5);
        actual.rotation.x = -0.15;
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
        if (fallback) {
          ufoRoot.remove(fallback);
          disposeObject(fallback);
          fallback = null;
        }
        ufoRoot.add(actual);
      }).catch(() => { /* The local fallback remains usable if the optional GLB cannot load. */ });
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    const animate = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      root.rotation.y += dt * (model === 'ufo' ? 0.72 : 0.28);
      root.position.y = rootBaseY + Math.sin(clock.elapsedTime * 1.6) * 0.16;
      airframe?.update(dt, { contrail: 0, stream: 0, bank: Math.sin(clock.elapsedTime) * 3, pitch: 2, night: 0.12, cabin: 0.65, mood: 0, calm: true });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      airframe?.dispose();
      if (!airframe) disposeObject(root);
      renderer.dispose();
      scene.clear();
    };
  }, [model]);

  return <canvas ref={canvasRef} className="sa-aircraft-picker__model-canvas" aria-label={`${model === 'ufo' ? 'UFO interceptor' : 'SA350 airliner'} 3D preview`} />;
}
