import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'kapal_pesiar'
  );
}

/** Klon objek tanpa transformasi induk & tanpa bagian yang disembunyikan. */
function prepare(object: THREE.Object3D) {
  const clone = object.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);
  const hidden: THREE.Object3D[] = [];
  clone.traverse((o) => {
    if (!o.visible || o.userData.noExport) hidden.push(o);
    const rest = o.userData.restPosition as number[] | undefined;
    if (rest) {
      o.position.fromArray(rest);
      o.quaternion.identity();
    }
  });
  hidden.forEach((o) => o.parent?.remove(o));
  clone.updateMatrixWorld(true);
  return clone;
}

export async function exportGLTF(object: THREE.Object3D, filename: string, binary: boolean) {
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(prepare(object), {
    binary,
    onlyVisible: true,
    maxTextureSize: 2048,
  });
  const blob = binary
    ? new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' })
    : new Blob([JSON.stringify(data, null, 1)], { type: 'model/gltf+json' });
  downloadBlob(blob, filename);
  return blob.size;
}

export function exportOBJ(object: THREE.Object3D, filename: string) {
  const text = new OBJExporter().parse(prepare(object));
  const header = '# Kapal Pesiar Jelly - aset gaya Gang Beasts\n# Skala: 1 unit = 1 meter, haluan menghadap +X, atas +Y\n';
  const blob = new Blob([header + text], { type: 'text/plain' });
  downloadBlob(blob, filename);
  return blob.size;
}
