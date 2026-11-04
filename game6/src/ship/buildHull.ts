import * as THREE from 'three';
import { BAND_MATERIAL, SHIP, X_STERN, hullOuterZ, sectionPoints, tToX, type SecPt } from './dims';
import { TriBuilder, beam, box, cyl, merge, rod, sphere, v3, weld, type Geo } from './geom';
import type { ShipMaterials } from './materials';

const STATIONS = 88;

function mesh(name: string, geo: Geo, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}

/** Lambung hasil loft penampang — 5 grup material (bulwark, cat, garis, boot-top, antifouling). */
export function buildHullGeometry(): Geo {
  const xs: number[] = [];
  const secs: SecPt[][] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    xs.push(tToX(t));
    secs.push(sectionPoints(t));
  }
  const buckets: number[][] = [[], [], [], [], []];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tri = (mat: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hint?: THREE.Vector3) => {
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) return;
    const arr = buckets[mat];
    if (hint && n.dot(hint) < 0) arr.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const bands = BAND_MATERIAL.length;
  for (let k = 0; k < bands; k++) {
    const mat = BAND_MATERIAL[k];
    for (let i = 0; i < STATIONS; i++) {
      const s0 = secs[i];
      const s1 = secs[i + 1];
      const x0 = xs[i];
      const x1 = xs[i + 1];
      for (const side of [1, -1]) {
        const A = v3(x0, s0[k].y, side * s0[k].z);
        const B = v3(x1, s1[k].y, side * s1[k].z);
        const C = v3(x1, s1[k + 1].y, side * s1[k + 1].z);
        const D = v3(x0, s0[k + 1].y, side * s0[k + 1].z);
        if (side === 1) {
          tri(mat, A, D, B);
          tri(mat, B, D, C);
        } else {
          tri(mat, A, B, D);
          tri(mat, B, C, D);
        }
      }
    }
  }

  // Transom (buritan datar)
  const s0 = secs[0];
  const x0 = xs[0];
  const back = v3(-1, 0, 0);
  for (let k = 2; k < bands; k++) {
    const mat = BAND_MATERIAL[k];
    const R0 = v3(x0, s0[k].y, s0[k].z);
    const R1 = v3(x0, s0[k + 1].y, s0[k + 1].z);
    const L0 = v3(x0, s0[k].y, -s0[k].z);
    const L1 = v3(x0, s0[k + 1].y, -s0[k + 1].z);
    tri(mat, R0, R1, L1, back);
    tri(mat, R0, L1, L0, back);
  }

  // Dinding dalam buritan + tutup atas
  const inner = s0[0].z;
  const ty = s0[1].y;
  const D = SHIP.deckY;
  const xi = x0 + SHIP.th;
  const fwd = v3(1, 0, 0);
  const up = v3(0, 1, 0);
  tri(0, v3(xi, D, -inner), v3(xi, D, inner), v3(xi, ty, inner), fwd);
  tri(0, v3(xi, D, -inner), v3(xi, ty, inner), v3(xi, ty, -inner), fwd);
  tri(0, v3(x0, ty, -inner), v3(x0, ty, inner), v3(xi, ty, inner), up);
  tri(0, v3(x0, ty, -inner), v3(xi, ty, inner), v3(xi, ty, -inner), up);

  const geo = new THREE.BufferGeometry();
  let start = 0;
  buckets.forEach((arr, mi) => {
    const count = arr.length / 3;
    if (count) geo.addGroup(start, count, mi);
    start += count;
  });
  const all = buckets.flat();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 0.1;
    uv[i * 2 + 1] = pos.getY(i) * 0.1;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return weld(geo);
}

/** Dek utama (permukaan kayu), mengikuti bentuk lambung & naik di linggi haluan. */
export function buildDeckGeometry(): Geo {
  const tb = new TriBuilder();
  const up = v3(0, 1, 0);
  const uvOf = (p: THREE.Vector3): [number, number] => [p.x * 0.25, p.z * 0.25];
  let prev: SecPt & { x: number } = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    const s = sectionPoints(t)[0];
    const cur = { x: tToX(t), y: s.y, z: s.z };
    if (i > 0) {
      const L0 = v3(prev.x, prev.y, -prev.z);
      const R0 = v3(prev.x, prev.y, prev.z);
      const R1 = v3(cur.x, cur.y, cur.z);
      const L1 = v3(cur.x, cur.y, -cur.z);
      tb.tri(L0, uvOf(L0), R0, uvOf(R0), R1, uvOf(R1), up);
      tb.tri(L0, uvOf(L0), R1, uvOf(R1), L1, uvOf(L1), up);
    }
    prev = cur;
  }
  return tb.build();
}

/** Putar & tempel geometri ke permukaan lambung, mengikuti kelengkungan. */
function placeOnHull(g: Geo, x: number, y: number, side: 1 | -1, out = 0) {
  const d = 0.2;
  const slope = (hullOuterZ(x + d, y) - hullOuterZ(x - d, y)) / (2 * d);
  const ang = Math.atan(slope);
  g.rotateY(side === 1 ? -ang : Math.PI + ang);
  g.translate(x, y, side * (hullOuterZ(x, y) + out));
  return g;
}

/** Strip decal yang melengkung mengikuti lambung (nama kapal di haluan). */
function nameStrip(side: 1 | -1, xa: number, xb: number, yb: number, yt: number, cols = 36): Geo {
  const tb = new TriBuilder();
  const hint = v3(0, 0, side);
  const P = (x: number, y: number) => v3(x, y, side * (hullOuterZ(x, y) + 0.03));
  for (let j = 0; j < cols; j++) {
    const xA = xa + ((xb - xa) * j) / cols;
    const xB = xa + ((xb - xa) * (j + 1)) / cols;
    let uA = j / cols;
    let uB = (j + 1) / cols;
    if (side === -1) {
      uA = 1 - uA;
      uB = 1 - uB;
    }
    const a = P(xA, yb);
    const b = P(xB, yb);
    const c = P(xB, yt);
    const d = P(xA, yt);
    tb.tri(a, [uA, 0], b, [uB, 0], c, [uB, 1], hint);
    tb.tri(a, [uA, 0], c, [uB, 1], d, [uA, 1], hint);
  }
  return tb.build();
}

function anchorGeo(): Geo {
  const ring = new THREE.TorusGeometry(0.11, 0.035, 6, 12);
  ring.translate(0, 0.06, 0);
  return merge([
    ring,
    box(0.12, 1.0, 0.08, 0, -0.48, 0),
    box(0.62, 0.1, 0.08, 0, -0.16, 0),
    box(0.74, 0.12, 0.08, 0, -0.96, 0),
    box(0.13, 0.32, 0.08, -0.36, -0.84, 0, 0, 0, 0.5),
    box(0.13, 0.32, 0.08, 0.36, -0.84, 0, 0, 0, -0.5),
  ]);
}

function propeller(name: string, M: ShipMaterials) {
  const g = new THREE.Group();
  g.name = name;
  const parts: Geo[] = [cyl(0.2, 0.25, 0.5, 0, 0, 0, 12, 0, 0, Math.PI / 2)];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.BoxGeometry(0.07, 0.78, 0.36);
    b.translate(0, 0.45, 0);
    b.rotateY(0.45);
    b.rotateX((k * Math.PI) / 2);
    parts.push(b);
  }
  parts.push(sphere(0.2, -0.28, 0, 0, 10, 8, 1.2, 1, 1));
  g.add(mesh(`${name}_Blades`, merge(parts), M.bronze));
  return g;
}

export interface HullBuild {
  hull: THREE.Group;
  underwater: THREE.Group;
  propellers: THREE.Object3D[];
  decals: THREE.Mesh[];
}

export function buildHull(M: ShipMaterials): HullBuild {
  const hull = new THREE.Group();
  hull.name = 'Hull';
  const decals: THREE.Mesh[] = [];

  hull.add(mesh('Hull_Body', buildHullGeometry(), [M.white, M.hull, M.stripe, M.bootTop, M.bottom]));
  hull.add(mesh('Deck_Main', buildDeckGeometry(), M.deck));

  // Jendela lambung (2 baris)
  const wins: Geo[] = [];
  for (const y of [1.95, 1.2]) {
    for (let x = -17.6; x <= 7.3; x += 0.9) {
      for (const s of [1, -1] as const) wins.push(placeOnHull(new THREE.BoxGeometry(0.5, 0.34, 0.08), x, y, s, 0));
    }
  }
  hull.add(mesh('Hull_Windows', merge(wins), M.glass));

  // Nama kapal di haluan (melengkung) & buritan
  const nameMesh = mesh('Hull_Name', merge([nameStrip(1, 9.0, 16.0, 1.1, 2.25), nameStrip(-1, 9.0, 16.0, 1.1, 2.25)]), M.nameDecal);
  hull.add(nameMesh);
  decals.push(nameMesh);
  const stern = new THREE.PlaneGeometry(7.2, 1.8);
  stern.rotateY(-Math.PI / 2);
  stern.translate(X_STERN - 0.03, 1.75, 0);
  const sternMesh = mesh('Hull_SternName', stern, M.sternDecal);
  hull.add(sternMesh);
  decals.push(sternMesh);

  // Jangkar + lubang rantai (hawse)
  const anchors: Geo[] = [];
  for (const s of [1, -1] as const) {
    const hawse = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14);
    hawse.rotateX(Math.PI / 2);
    anchors.push(placeOnHull(hawse, 17.1, 2.75, s, 0.0));
    anchors.push(placeOnHull(anchorGeo(), 17.1, 2.72, s, 0.07));
  }
  hull.add(mesh('Hull_Anchors', merge(anchors), M.darkMetal));

  // Haluan bulat bawah air (bulbous bow)
  hull.add(mesh('Hull_BulbousBow', sphere(1, 18.3, -1.75, 0, 20, 12, 2.0, 0.7, 0.66), M.bottom));

  // Bagian bawah air: baling-baling, poros, kemudi
  const underwater = new THREE.Group();
  underwater.name = 'Underwater';
  const propellers: THREE.Object3D[] = [];
  const shafts: Geo[] = [];
  for (const s of [1, -1]) {
    const p = propeller(s === 1 ? 'Propeller_Starboard' : 'Propeller_Port', M);
    p.position.set(-19.5, -1.78, s * 1.7);
    underwater.add(p);
    propellers.push(p);
    shafts.push(rod(v3(-14.4, -2.36, s * 1.7), v3(-19.3, -1.78, s * 1.7), 0.09, 8));
    shafts.push(beam(v3(-18.6, -1.45, s * 1.7), v3(-18.6, -1.9, s * 1.7), 0.1, 0.1));
  }
  underwater.add(mesh('Propeller_Shafts', merge(shafts), M.metal));
  underwater.add(mesh('Rudder', box(1.2, 1.5, 0.14, -20.65, -1.72, 0), M.bottom));

  return { hull, underwater, propellers, decals };
}
