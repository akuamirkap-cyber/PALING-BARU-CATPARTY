import * as THREE from 'three';
import { buildDeckProps } from './buildDeckProps';
import { buildHull } from './buildHull';
import { buildSuperstructure } from './buildSuperstructure';
import { applyScheme, createMaterials, type ColorScheme, type ShipMaterials } from './materials';
import { createCrateTexture, createDeckTexture, createLogoTexture, createTextTexture } from './textures';

export type PartKey = 'railings' | 'lifeboats' | 'pool' | 'slide' | 'loungers' | 'cargo' | 'flags' | 'helipad' | 'underwater';

export const PART_INFO: { key: PartKey; label: string; emoji: string }[] = [
  { key: 'railings', label: 'Pagar & Pelampung', emoji: '🚧' },
  { key: 'lifeboats', label: 'Sekoci Penyelamat', emoji: '🛟' },
  { key: 'pool', label: 'Kolam Renang', emoji: '🏊' },
  { key: 'slide', label: 'Perosotan Air', emoji: '🌀' },
  { key: 'loungers', label: 'Kursi Santai & Payung', emoji: '⛱️' },
  { key: 'cargo', label: 'Peti & Tong (bisa dilempar)', emoji: '📦' },
  { key: 'flags', label: 'Bendera Hias & Lampu', emoji: '🎏' },
  { key: 'helipad', label: 'Helipad Haluan', emoji: '🚁' },
  { key: 'underwater', label: 'Baling-baling & Kemudi', emoji: '⚙️' },
];

export interface ShipStats {
  meshes: number;
  triangles: number;
  size: [number, number, number];
}

export interface ShipHandle {
  group: THREE.Group;
  materials: ShipMaterials;
  parts: Record<PartKey, THREE.Object3D>;
  radar: THREE.Object3D;
  propellers: THREE.Object3D[];
  slideCurve: THREE.CatmullRomCurve3;
  setName: (name: string) => void;
  setColors: (c: ColorScheme) => void;
  setWireframe: (on: boolean) => void;
  stats: () => ShipStats;
}

export function buildShip(scheme: ColorScheme, shipName: string): ShipHandle {
  const nameTex = createTextTexture(1024, 160, 'ShipName');
  const sternTex = createTextTexture(1024, 256, 'SternName');
  const M = createMaterials(scheme, {
    deck: createDeckTexture(),
    crate: createCrateTexture(),
    name: nameTex.texture,
    stern: sternTex.texture,
    logo: createLogoTexture(),
  });

  const group = new THREE.Group();
  group.name = 'CruiseShip_GangBeasts';

  const hull = buildHull(M);
  const sup = buildSuperstructure(M);
  const props = buildDeckProps(M);

  group.add(hull.hull, sup.group, sup.stairsGroup, props.deckGear);
  group.add(props.railings, props.lifeboats, props.pool, props.slide, props.loungers, props.cargo, props.flags, props.helipad);
  group.add(hull.underwater);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  for (const d of [...hull.decals, ...sup.decals]) {
    d.castShadow = false;
    d.renderOrder = 2;
  }

  const setName = (name: string) => {
    const n = (name.trim() || 'WOBBLY QUEEN').toUpperCase();
    nameTex.draw([{ text: n, size: 118 }]);
    sternTex.draw([
      { text: n, size: 118 },
      { text: 'BEEF CITY', size: 72 },
    ]);
  };
  setName(shipName);

  const allMaterials = Object.values(M) as THREE.Material[];

  return {
    group,
    materials: M,
    parts: {
      railings: props.railings,
      lifeboats: props.lifeboats,
      pool: props.pool,
      slide: props.slide,
      loungers: props.loungers,
      cargo: props.cargo,
      flags: props.flags,
      helipad: props.helipad,
      underwater: hull.underwater,
    },
    radar: sup.radar,
    propellers: hull.propellers,
    slideCurve: props.slideCurve,
    setName,
    setColors: (c) => applyScheme(M, c),
    setWireframe: (on) => {
      for (const m of allMaterials) {
        (m as THREE.MeshStandardMaterial).wireframe = on;
      }
    },
    stats: () => computeStats(group),
  };
}

export function computeStats(group: THREE.Object3D): ShipStats {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const rel = new THREE.Matrix4();
  let meshes = 0;
  let triangles = 0;
  group.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    meshes++;
    triangles += (g.index ? g.index.count : pos.count) / 3;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) {
      rel.multiplyMatrices(inv, m.matrixWorld);
      tmp.copy(g.boundingBox).applyMatrix4(rel);
      box.union(tmp);
    }
  });
  const size = new THREE.Vector3();
  box.getSize(size);
  return { meshes, triangles: Math.round(triangles), size: [size.x, size.y, size.z] };
}
