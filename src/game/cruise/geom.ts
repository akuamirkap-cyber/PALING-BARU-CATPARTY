import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Geo = THREE.BufferGeometry;
export type V3 = THREE.Vector3;

const UP = new THREE.Vector3(0, 1, 0);
const ZA = new THREE.Vector3(0, 0, 1);
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Samakan atribut (non-indexed, position/normal/uv) agar aman digabung. */
export function normalizeGeo(g: Geo): Geo {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    const count = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  geo.clearGroups();
  geo.morphAttributes = {};
  return geo;
}

/** Gabungkan banyak geometri menjadi satu (1 draw call, rapi saat diekspor). */
export function merge(geos: Geo[]): Geo {
  const list = geos
    .filter((g) => {
      const p = g.getAttribute('position');
      return p && p.count > 0;
    })
    .map(normalizeGeo);
  if (list.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(list, false);
  return merged ? weld(merged) : new THREE.BufferGeometry();
}

/** Gabungkan vertex identik (posisi+normal+uv) → geometri ber-index, file ekspor lebih kecil. */
export function weld(g: Geo): Geo {
  return mergeVertices(g, 1e-4);
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Geo {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

export function cyl(
  rt: number,
  rb: number,
  h: number,
  x: number,
  y: number,
  z: number,
  seg = 12,
  rx = 0,
  ry = 0,
  rz = 0,
): Geo {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx || ry || rz) g.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

export function sphere(r: number, x: number, y: number, z: number, ws = 14, hs = 10, sx = 1, sy = 1, sz = 1): Geo {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

/** Balok persegi yang membentang dari titik a ke b. */
export function beam(a: V3, b: V3, w: number, h = w): Geo {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(dir.length(), 1e-4);
  const g = new THREE.BoxGeometry(w, h, len);
  const q = new THREE.Quaternion().setFromUnitVectors(ZA, dir.normalize());
  g.applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)),
  );
  return g;
}

/** Batang silinder dari a ke b. */
export function rod(a: V3, b: V3, r: number, seg = 8): Geo {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(dir.length(), 1e-4);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)),
  );
  return g;
}

/** Bentuk denah dek: belakang persegi, depan membulat (elips). */
export function tierShape(x0: number, x1: number, hw: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(x0, -hw);
  s.lineTo(x1 - r, -hw);
  s.absellipse(x1 - r, 0, r, hw, -Math.PI / 2, Math.PI / 2, false, 0);
  s.lineTo(x0, hw);
  s.lineTo(x0, -hw);
  return s;
}

/** Bentuk stadion (persegi panjang bersudut bulat penuh) untuk cerobong. */
export function stadiumShape(len: number, wid: number) {
  const r = wid / 2;
  const half = len / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-half, -r);
  s.lineTo(half, -r);
  s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, r);
  s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

/** Ekstrusi bentuk 2D (bidang XZ) ke atas sumbu Y. */
export function extrudeUp(shape: THREE.Shape, height: number, baseY: number, curveSegments = 14): Geo {
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, baseY, 0);
  return g;
}

export function scaleUV(g: Geo, s: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return g;
}

/** UV planar dari posisi dunia (x,z) — untuk tekstur papan dek. */
export function planarUV(g: Geo, s: number) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * s;
    uv[i * 2 + 1] = pos.getZ(i) * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Garis keliling denah dek (poligon tertutup). */
export function tierOutline(x0: number, x1: number, hw: number, r: number, y: number, arcSeg = 12) {
  const pts: V3[] = [v3(x0, y, -hw), v3(x1 - r, y, -hw)];
  for (let i = 1; i < arcSeg; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / arcSeg;
    pts.push(v3(x1 - r + Math.cos(a) * r, y, Math.sin(a) * hw));
  }
  pts.push(v3(x1 - r, y, hw), v3(x0, y, hw));
  return pts;
}

export function resample(path: V3[], spacing: number, closed: boolean) {
  const out: V3[] = [];
  const n = path.length;
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const k = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    for (let j = 0; j < k; j++) out.push(a.clone().lerp(b, j / k));
  }
  if (!closed) out.push(path[n - 1].clone());
  return out;
}

export interface Gap {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const inGap = (p: V3, gaps: Gap[]) => gaps.some((g) => p.x >= g.x0 && p.x <= g.x1 && p.z >= g.z0 && p.z <= g.z1);

/** Pagar: tiang + pegangan atas + palang tengah, dengan celah untuk tangga. */
export function railing(
  path: V3[],
  opts: { closed?: boolean; spacing?: number; height?: number; gaps?: Gap[] } = {},
): Geo[] {
  const closed = opts.closed ?? false;
  const height = opts.height ?? 0.95;
  const gaps = opts.gaps ?? [];
  const pts = resample(path, opts.spacing ?? 1.2, closed);
  const out: Geo[] = [];
  for (const p of pts) {
    if (inGap(p, gaps)) continue;
    out.push(box(0.08, height, 0.08, p.x, p.y + height / 2, p.z));
  }
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (inGap(a, gaps) || inGap(b, gaps) || a.distanceTo(b) < 0.02) continue;
    out.push(beam(v3(a.x, a.y + height, a.z), v3(b.x, b.y + height, b.z), 0.1, 0.07));
    out.push(beam(v3(a.x, a.y + height * 0.5, a.z), v3(b.x, b.y + height * 0.5, b.z), 0.05));
  }
  return out;
}

/** Tangga terbuka dengan pegangan & bordes (landing) di atas. Naik ke arah +Z lokal. */
export function stairs(o: {
  x: number;
  y: number;
  z: number;
  yaw: number;
  steps: number;
  rise: number;
  run: number;
  width: number;
  landing?: number;
}): Geo[] {
  const out: Geo[] = [];
  const { steps, rise, run, width } = o;
  const H = steps * rise;
  const Lr = steps * run;
  const hw = width / 2 + 0.05;
  for (let i = 0; i < steps; i++) out.push(box(width, 0.08, run + 0.03, 0, (i + 1) * rise - 0.04, i * run + run / 2));
  for (const s of [-1, 1]) {
    out.push(beam(v3(s * hw, 0, 0), v3(s * hw, H, Lr), 0.08, 0.3));
    out.push(beam(v3(s * hw, 0.95, 0), v3(s * hw, H + 0.95, Lr), 0.07));
    out.push(box(0.07, 0.95, 0.07, s * hw, 0.475, 0.05));
    out.push(box(0.07, 0.95, 0.07, s * hw, H + 0.475, Lr - 0.05));
  }
  if (o.landing) {
    const L = o.landing;
    out.push(box(width + 0.1, 0.12, L, 0, H - 0.06, Lr + L / 2));
    for (const s of [-1, 1]) out.push(box(0.1, H, 0.1, s * (width / 2), H / 2, Lr + L - 0.06));
    out.push(box(0.07, 0.95, 0.07, -hw, H + 0.475, Lr + L - 0.04));
    out.push(beam(v3(-hw, H + 0.95, Lr - 0.05), v3(-hw, H + 0.95, Lr + L - 0.04), 0.07));
    out.push(beam(v3(-hw, H + 0.95, Lr + L - 0.04), v3(hw - 0.3, H + 0.95, Lr + L - 0.04), 0.07));
    out.push(box(0.07, 0.95, 0.07, hw - 0.3, H + 0.475, Lr + L - 0.04));
  }
  const m = new THREE.Matrix4().makeRotationY(o.yaw).setPosition(o.x, o.y, o.z);
  out.forEach((g) => g.applyMatrix4(m));
  return out;
}

/** Talang setengah pipa mengikuti kurva — untuk perosotan air. */
export function trough(curve: THREE.Curve<THREE.Vector3>, samples: number, radius: number, seg = 10, extra = 0.35) {
  const pos: number[] = [];
  const uv: number[] = [];
  const rimA: V3[] = [];
  const rimB: V3[] = [];
  const S = new THREE.Vector3();
  const U = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const T = curve.getTangentAt(u).normalize();
    S.crossVectors(T, UP).normalize();
    U.crossVectors(S, T).normalize();
    for (let j = 0; j <= seg; j++) {
      const a = -extra + ((Math.PI + 2 * extra) * j) / seg;
      const q = p
        .clone()
        .addScaledVector(S, Math.cos(a) * radius)
        .addScaledVector(U, -Math.sin(a) * radius);
      pos.push(q.x, q.y, q.z);
      uv.push(j / seg, u * 24);
      if (j === 0) rimA.push(q.clone());
      if (j === seg) rimB.push(q.clone());
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, rimA, rimB };
}

/** Pembangun segitiga dengan orientasi otomatis berdasarkan arah normal yang diinginkan. */
export class TriBuilder {
  pos: number[] = [];
  uv: number[] = [];
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();
  private n = new THREE.Vector3();

  tri(a: V3, ua: [number, number], b: V3, ub: [number, number], c: V3, uc: [number, number], hint?: V3) {
    this.e1.subVectors(b, a);
    this.e2.subVectors(c, a);
    this.n.crossVectors(this.e1, this.e2);
    if (this.n.lengthSq() < 1e-14) return;
    if (hint && this.n.dot(hint) < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
    }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  build(): Geo {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return weld(g);
  }
}

/** Pelampung penyelamat (oranye-putih) — mengembalikan 2 daftar geometri berdasarkan warna. */
export function lifeBuoy(x: number, y: number, z: number, ry: number) {
  const orange: Geo[] = [];
  const white: Geo[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.TorusGeometry(0.3, 0.075, 8, 8, Math.PI / 2);
    g.rotateZ((k * Math.PI) / 2);
    g.rotateY(ry);
    g.translate(x, y, z);
    (k % 2 ? white : orange).push(g);
  }
  return { orange, white };
}
