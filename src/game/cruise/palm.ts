import * as THREE from 'three';
import { rod, sphere, v3, type Geo } from './geom';

export interface PalmParts {
  trunk: Geo[];
  leaves: Geo[];
  nuts: Geo[];
}

export function emptyPalmParts(): PalmParts {
  return { trunk: [], leaves: [], nuts: [] };
}

/** Daun kelapa melengkung (strip segitiga) dari titik puncak ke arah `ang`. */
function frond(top: THREE.Vector3, ang: number, len: number, droop: number, width: number): Geo {
  const segs = 6;
  const dir = v3(Math.cos(ang), 0, Math.sin(ang));
  const side = v3(-dir.z, 0, dir.x);
  const pos: number[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    pts.push(
      top
        .clone()
        .addScaledVector(dir, len * u)
        .add(v3(0, len * (0.35 * u - droop * u * u), 0)),
    );
  }
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs;
    const u1 = (i + 1) / segs;
    const w0 = width * Math.sin(Math.PI * Math.min(0.98, u0 * 0.9 + 0.08));
    const w1 = width * Math.sin(Math.PI * Math.min(0.98, u1 * 0.9 + 0.08));
    const a = pts[i];
    const b = pts[i + 1];
    const aL = a.clone().addScaledVector(side, w0).add(v3(0, -w0 * 0.25, 0));
    const aR = a.clone().addScaledVector(side, -w0).add(v3(0, -w0 * 0.25, 0));
    const bL = b.clone().addScaledVector(side, w1).add(v3(0, -w1 * 0.25, 0));
    const bR = b.clone().addScaledVector(side, -w1).add(v3(0, -w1 * 0.25, 0));
    // dua sisi daun dengan lipatan tengah
    for (const [p, q, r] of [
      [a, b, bL],
      [a, bL, aL],
      [a, bR, b],
      [a, aR, bR],
    ] as THREE.Vector3[][]) {
      pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Tambahkan satu pohon kelapa (batang melengkung + 8 daun + buah) ke `out`. */
export function addPalm(out: PalmParts, x: number, y: number, z: number, height: number, lean: number, yaw: number, seed = 1) {
  const segs = 7;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    pts.push(v3(x + Math.cos(yaw) * lean * s * s, y + height * s, z + Math.sin(yaw) * lean * s * s));
  }
  for (let i = 0; i < segs; i++) {
    const r = 0.26 - (0.11 * i) / segs;
    out.trunk.push(rod(pts[i], pts[i + 1], r, 7));
    out.trunk.push(rod(pts[i + 1].clone().add(v3(0, -0.08, 0)), pts[i + 1].clone().add(v3(0, 0.04, 0)), r * 1.12, 7));
  }
  const top = pts[segs];
  const scale = height / 6;
  for (let k = 0; k < 8; k++) {
    const ang = yaw + (k / 8) * Math.PI * 2 + Math.sin(seed * 9.1 + k) * 0.25;
    const len = (2.6 + Math.sin(seed * 3.7 + k * 1.9) * 0.5) * scale;
    out.leaves.push(frond(top, ang, len, 1.15 + 0.25 * Math.sin(seed + k * 2.3), 0.42 * scale));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + seed;
    out.nuts.push(sphere(0.17 * scale, top.x + Math.cos(a) * 0.2, top.y - 0.25, top.z + Math.sin(a) * 0.2, 8, 6));
  }
}
