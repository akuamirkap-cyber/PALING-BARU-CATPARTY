import * as THREE from 'three';

/**
 * Layer render:
 *  0 DEFAULT    → aset, karakter (semua pass)
 *  1 UNDERWATER → dasar laut, karang, ikan (hanya pass refraksi)
 *  2 SKY        → langit & awan (pass utama + refleksi)
 *  3 ABOVE      → pulau di atas air (pass utama + refleksi)
 *  4 MAIN_ONLY  → dekorasi ringan (penonton, hujan) — hanya pass utama
 */
export const LAYER = { DEFAULT: 0, UNDERWATER: 1, SKY: 2, ABOVE: 3, MAIN_ONLY: 4 } as const;

export function setLayer(obj: THREE.Object3D, layer: number) {
  obj.traverse((o) => o.layers.set(layer));
}

export function mainCameraLayers(cam: THREE.Camera) {
  cam.layers.set(LAYER.DEFAULT);
  cam.layers.enable(LAYER.SKY);
  cam.layers.enable(LAYER.ABOVE);
  cam.layers.enable(LAYER.MAIN_ONLY);
}
