import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALL_R, IN } from './dims';

/** Profil pin standar USBC: [tinggi inci, diameter inci]. */
const PROFILE_IN: [number, number][] = [
  [0, 2.031],
  [0.375, 2.43],
  [0.75, 2.828],
  [1.5, 3.39],
  [2.25, 3.906],
  [3.375, 4.51],
  [4.5, 4.766],
  [5.875, 4.563],
  [7.25, 3.703],
  [8.625, 2.472],
  [9.375, 1.965],
  [10, 1.797],
  [10.875, 1.87],
  [11.75, 2.18],
  [12.5, 2.4],
  [13.5, 2.547],
];
const STRIPES_IN: [number, number][] = [
  [9.3, 9.72],
  [10.12, 10.54],
];
const HEAD_R_IN = 2.547 / 2;

function radiusAt(hIn: number) {
  if (hIn >= 13.5) {
    const s = Math.min(1, (hIn - 13.5) / 1.5);
    return HEAD_R_IN * Math.sqrt(Math.max(0, 1 - s * s));
  }
  for (let i = 0; i < PROFILE_IN.length - 1; i++) {
    const [h0, d0] = PROFILE_IN[i];
    const [h1, d1] = PROFILE_IN[i + 1];
    if (hIn >= h0 && hIn <= h1) {
      const t = (hIn - h0) / (h1 - h0);
      const s = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return (d0 + (d1 - d0) * s) / 2;
    }
  }
  return PROFILE_IN[0][1] / 2;
}

/** Titik profil (r, y) dalam meter, rapat + batas garis merah yang tegas. */
export function pinProfile() {
  const hs = new Set<number>();
  for (let h = 0; h <= 13.5; h += 0.25) hs.add(Math.round(h * 1000) / 1000);
  for (const [a, b] of STRIPES_IN) {
    hs.add(a - 0.012);
    hs.add(a);
    hs.add(b);
    hs.add(b + 0.012);
  }
  const list = [...hs].sort((a, b) => a - b);
  const pts: { r: number; y: number; red: boolean }[] = [{ r: 0, y: 0, red: false }];
  for (const h of list) {
    const red = STRIPES_IN.some(([a, b]) => h >= a - 1e-6 && h <= b + 1e-6);
    pts.push({ r: radiusAt(h) * IN, y: h * IN, red });
  }
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push({ r: HEAD_R_IN * Math.cos(a) * IN, y: (13.5 + 1.5 * Math.sin(a)) * IN, red: false });
  }
  pts[pts.length - 1].r = 0;
  return pts;
}

/** Geometri pin visual (lathe) dengan warna verteks: putih + 2 garis merah di leher. */
export function createPinGeometry(segments = 28) {
  const prof = pinProfile();
  const g = new THREE.LatheGeometry(
    prof.map((p) => new THREE.Vector2(p.r, p.y)),
    segments,
  );
  const n = prof.length;
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color('#fbfaf6');
  const red = new THREE.Color('#d0202a');
  for (let v = 0; v < pos.count; v++) {
    const c = prof[v % n].red ? red : white;
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Mata "googly" lucu di kepala pin (menghadap pelempar = −X). */
export function createPinEyesGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const color = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const y = 12.7 * IN;
  const rr = radiusAt(12.7) * IN;
  for (const s of [-1, 1]) {
    const z = s * 0.42 * IN;
    const x = -Math.sqrt(Math.max(0, rr * rr - z * z)) + 0.002;
    const white = new THREE.SphereGeometry(0.36 * IN, 12, 8);
    white.scale(0.5, 1.15, 1);
    white.translate(x, y, z);
    parts.push(color(white, '#ffffff'));
    const pupil = new THREE.SphereGeometry(0.17 * IN, 10, 6);
    pupil.scale(0.5, 1.1, 1);
    pupil.translate(x - 0.004, y - 0.05 * IN, z + s * 0.04 * IN);
    parts.push(color(pupil, '#111111'));
  }
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
}

/** Titik hull konveks untuk collider (2 bagian: badan bawah & kepala) agar leher tetap cekung. */
export function pinHullPoints(seg = 16) {
  const prof = pinProfile();
  const split = 10 * IN;
  const lower: number[] = [];
  const upper: number[] = [];
  const ring = (arr: number[], r: number, y: number) => {
    if (r < 1e-5) {
      arr.push(0, y, 0);
      return;
    }
    // Alas = persegi 4 titik: manifold kontak Rapier dibatasi 4 titik pertama; dengan alas
    // 16-gon keempatnya mengumpul di satu kuadran sehingga pin pelan-pelan terguling.
    const n = y < 1e-6 ? 4 : seg;
    const off = y < 1e-6 ? Math.PI / 4 : 0;
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      arr.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  };
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i];
    // lewati titik garis-merah yang berdempetan, tapi selalu sertakan cincin alas (i = 1)
    if (i > 1 && i < prof.length - 1 && Math.abs(p.y - prof[i - 1].y) < 0.002) continue;
    if (p.y <= split + 1e-6) ring(lower, p.r, p.y);
    if (p.y >= split - 1e-6) ring(upper, p.r, p.y);
  }
  ring(lower, radiusAt(10) * IN, split);
  ring(upper, radiusAt(10) * IN, split);
  ring(upper, 0, prof[prof.length - 1].y);
  return { lower: new Float32Array(lower), upper: new Float32Array(upper) };
}

/** Volume pin padat (m³), integrasi frustum. */
export function pinVolume() {
  const prof = pinProfile();
  let v = 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i];
    const b = prof[i + 1];
    const h = b.y - a.y;
    v += (Math.PI * h * (a.r * a.r + a.r * b.r + b.r * b.r)) / 3;
  }
  return v;
}

export function createBallGeometry() {
  return new THREE.SphereGeometry(BALL_R, 36, 24);
}
