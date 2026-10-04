import * as THREE from 'three';
import { LOGOS, logoPresence, type LogoPickup } from '../lib/logos';

/**
 * The bonus medallions, drawn (see lib/logos.ts for where they are).
 *
 * Each is the airline's coin: a gold ring round a dark disc with the seat
 * mark in the middle, hanging in the air where the flight is going. They
 * spin in place like a coin on its edge and bob gently as they hang there —
 * unmissable, and worth flying through. A soft halo sits behind each so it
 * reads at a distance, day or night. Everything fades with the medallion as
 * it turns up, is taken, and goes.
 *
 * A couple at most, so each is two draws: the coin a textured disc, the
 * halo a sprite.
 */

export interface LogosCraft {
  group: THREE.Group;
  /**
   * Every frame, with the medallions about (positions relative to the
   * aeroplane), how dark it is (0 day to 1 night), and the aeroplane's own
   * height — their hang height is absolute, so it is read off against it.
   */
  update(dt: number, list: readonly LogoPickup[] | undefined, night: number, planeAlt: number): void;
  dispose(): void;
}

const MOST = 3;
const RADIUS = 15;

function coinTexture(): THREE.CanvasTexture {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  // The gold ring.
  g.beginPath();
  g.arc(n / 2, n / 2, 118, 0, Math.PI * 2);
  g.fillStyle = '#f2b53a';
  g.fill();
  g.beginPath();
  g.arc(n / 2, n / 2, 118, 0, Math.PI * 2);
  g.strokeStyle = '#8a5c14';
  g.lineWidth = 5;
  g.stroke();
  // The dark disc.
  g.beginPath();
  g.arc(n / 2, n / 2, 100, 0, Math.PI * 2);
  g.fillStyle = '#0d2140';
  g.fill();
  // The seat mark: the aeroplane, climbing.
  g.fillStyle = '#ffffff';
  g.font = '150px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('✈︎', n / 2, n / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function haloTexture(): THREE.CanvasTexture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(n / 2, n / 2, n * 0.2, n / 2, n / 2, n / 2);
  grd.addColorStop(0, 'rgba(242,181,58,0)');
  grd.addColorStop(0.62, 'rgba(242,181,58,0.34)');
  grd.addColorStop(0.8, 'rgba(242,181,58,0.5)');
  grd.addColorStop(1, 'rgba(242,181,58,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLogosCraft(): LogosCraft {
  const group = new THREE.Group();
  const coinTex = coinTexture();
  const haloTex = haloTexture();
  const coinGeo = new THREE.CircleGeometry(RADIUS, 40);
  const owned: { dispose(): void }[] = [coinTex, haloTex, coinGeo];

  const slots = Array.from({ length: MOST }, () => {
    const slot = new THREE.Group();
    slot.visible = false;
    group.add(slot);
    const coinMat = new THREE.MeshBasicMaterial({
      map: coinTex, transparent: true, side: THREE.DoubleSide, fog: true,
    });
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.frustumCulled = false;
    coin.renderOrder = 2;
    slot.add(coin);
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(RADIUS * 4.4);
    slot.add(halo);
    owned.push(coinMat, haloMat);
    return { slot, coin, coinMat, haloMat };
  });

  const update: LogosCraft['update'] = (_dt, list, night, planeAlt) => {
    const shade = 1 - 0.45 * night;
    slots.forEach((s, i) => {
      const l = list?.[i];
      if (!l || l.taken) {
        s.slot.visible = false;
        return;
      }
      const presence = logoPresence(l);
      s.slot.visible = presence > 0.01;
      if (!s.slot.visible) return;
      // It hangs at its own height; the slot is placed against the aeroplane's.
      s.slot.position.set(l.x, l.alt - planeAlt + Math.sin(l.bob) * LOGOS.bobAmp, l.z);
      // The spin in place: round its vertical axis, like a coin.
      s.coin.rotation.y = l.spin;
      const o = presence * shade;
      s.coinMat.opacity = Math.min(1, o + 0.15);
      s.haloMat.opacity = 0.8 * presence;
    });
  };

  return {
    group,
    update,
    dispose: () => owned.forEach((d) => d.dispose()),
  };
}
