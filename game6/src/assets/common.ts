import * as THREE from 'three';
import type { CameraPreset } from '../scene/environments';
import type { BowlingController } from '../bowling/controller';
import type { LaneMirrorUniforms } from '../bowling/materials';
import type { SkiController } from '../ski/controller';

export type AssetId = 'ship' | 'stadium' | 'bowling' | 'ski';
export type Surface = 'deck' | 'pool' | 'sea';

export interface PartDef {
  key: string;
  label: string;
  emoji: string;
  hint?: string;
}

export interface Preset {
  id: string;
  name: string;
  colors: Record<string, string>;
}

export interface AssetStats {
  meshes: number;
  triangles: number;
  size: [number, number, number];
}

export interface AssetMeta {
  id: AssetId;
  title: string;
  emoji: string;
  tagline: string;
  partInfo: PartDef[];
  colorLabels: Record<string, string>;
  presets: Preset[];
  defaultName: string;
  nameLabel: string;
  nameHint: string;
  cameras: CameraPreset[];
  friendly: [RegExp, string][];
  specs: string[];
  tips: string[];
  dropArea: { hx: number; hz: number };
  fishRadius: number;
  shadowExtent: number;
  rock: number;
  /** aset dalam ruangan (tanpa laut & langit) */
  indoor?: boolean;
  /** arena gunung salju (langit & cahaya sendiri, tanpa laut) */
  snow?: boolean;
  maxDistance?: number;
}

export interface MatchState {
  home: number;
  away: number;
  flash: number;
  clock: number;
}

export interface AssetHandle {
  meta: AssetMeta;
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  setColors: (c: Record<string, string>) => void;
  setName: (n: string) => void;
  setWireframe: (on: boolean) => void;
  setNight: (glow: number) => void;
  update: (t: number, dt: number) => void;
  groundAt: (x: number, z: number) => { y: number; surface: Surface };
  stats: () => AssetStats;
  refreshText: () => void;
  slideCurve?: THREE.CatmullRomCurve3;
  match?: MatchState;
  ball?: THREE.Object3D;
  bowling?: BowlingController;
  /** objek khusus ekspor (mis. pin sebagai mesh terpisah) */
  buildExport?: () => THREE.Object3D;
  mirror?: { hide: THREE.Object3D[]; uniforms: LaneMirrorUniforms };
  ski?: SkiController;
  /** titik pusat area jatuhkan beast */
  dropOrigin?: [number, number, number];
}

/** Statistik aset yang benar-benar terekspor (melewati objek tersembunyi & userData.noExport). */
export function computeAssetStats(group: THREE.Object3D): AssetStats {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const rel = new THREE.Matrix4();
  let meshes = 0;
  let triangles = 0;
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noExport) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const g = m.geometry;
      const pos = g.getAttribute('position');
      if (pos) {
        const count = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
        meshes++;
        triangles += ((g.index ? g.index.count : pos.count) / 3) * count;
        if (!g.boundingBox) g.computeBoundingBox();
        if (g.boundingBox && !o.userData.statsSkip) {
          rel.multiplyMatrices(inv, m.matrixWorld);
          tmp.copy(g.boundingBox).applyMatrix4(rel);
          box.union(tmp);
        }
      }
    }
    o.children.forEach(visit);
  };
  visit(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { meshes, triangles: Math.round(triangles), size: [size.x, size.y, size.z] };
}

export function setWireframeAll(group: THREE.Object3D, on: boolean) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mt) => {
      if ('wireframe' in mt) (mt as THREE.MeshStandardMaterial).wireframe = on;
    });
  });
}
