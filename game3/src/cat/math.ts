// ─────────────────────────────────────────────────────────────
//  Math helpers, SDF primitives & noise (allocation-free, fast)
// ─────────────────────────────────────────────────────────────
export type V2 = [number, number];
export type V3 = [number, number, number];

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** polynomial smooth-min – blends two SDFs over a region of size k */
export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-6) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** IQ's ellipsoid approximation (good near the surface) */
export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/**
 * Super-ellipsoid: front silhouette (XY) is a superellipse with exponent n (2 = ellipse, >2 = rounded box),
 * cross-section in depth (Z) stays elliptical. First-order distance estimate (F-1)/|∇F|.
 */
export function sdSuperEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number, n: number): number {
  const qx = Math.abs(px) / rx, qy = Math.abs(py) / ry, qz = pz / rz;
  const a = qx > 0 ? Math.pow(qx, n) : 0;
  const b = qy > 0 ? Math.pow(qy, n) : 0;
  const s = a + b;
  const q = s > 1e-14 ? Math.pow(s, 1 / n) : 0;
  const F = Math.sqrt(q * q + qz * qz);
  if (F < 1e-9) return -Math.min(rx, ry, rz);
  let gx = 0, gy = 0;
  if (s > 1e-14) {
    const k = (q * q) / (s * F);
    gx = (qx > 0 ? a / qx : 0) * k / rx;
    gy = (qy > 0 ? b / qy : 0) * k / ry;
  }
  const gz = qz / (F * rz);
  const g = Math.sqrt(gx * gx + gy * gy + gz * gz);
  return (F - 1) / (g > 1e-9 ? g : 1);
}

/** Round cone between two points (IQ). Stores the axis parameter of the last query in `t`. */
export class RoundCone {
  ax: number; ay: number; az: number;
  bax: number; bay: number; baz: number;
  l2: number; rr: number; a2: number; il2: number;
  r1: number; r2: number;
  len: number;
  t = 0;
  constructor(a: V3, b: V3, r1: number, r2: number) {
    this.ax = a[0]; this.ay = a[1]; this.az = a[2];
    this.bax = b[0] - a[0]; this.bay = b[1] - a[1]; this.baz = b[2] - a[2];
    this.l2 = this.bax * this.bax + this.bay * this.bay + this.baz * this.baz;
    this.len = Math.sqrt(this.l2);
    this.rr = r1 - r2;
    this.a2 = this.l2 - this.rr * this.rr;
    this.il2 = 1 / this.l2;
    this.r1 = r1; this.r2 = r2;
  }
  d(px: number, py: number, pz: number): number {
    const pax = px - this.ax, pay = py - this.ay, paz = pz - this.az;
    const l2 = this.l2;
    const y = pax * this.bax + pay * this.bay + paz * this.baz;
    this.t = y * this.il2;
    const z = y - l2;
    const qx = pax * l2 - this.bax * y;
    const qy = pay * l2 - this.bay * y;
    const qz = paz * l2 - this.baz * y;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const rr = this.rr;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * this.a2 * z2 > k) return Math.sqrt(x2 + z2) * this.il2 - this.r2;
    if (Math.sign(y) * this.a2 * y2 < k) return Math.sqrt(x2 + y2) * this.il2 - this.r1;
    return (Math.sqrt(x2 * this.a2 * this.il2) + y * rr) * this.il2 - this.r1;
  }
}

/** 2D triangle SDF (IQ) */
export function sdTri2(
  px: number, py: number,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
): number {
  const e0x = x1 - x0, e0y = y1 - y0, e1x = x2 - x1, e1y = y2 - y1, e2x = x0 - x2, e2y = y0 - y2;
  const v0x = px - x0, v0y = py - y0, v1x = px - x1, v1y = py - y1, v2x = px - x2, v2y = py - y2;
  const h0 = clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const h1 = clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const h2 = clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const q0x = v0x - e0x * h0, q0y = v0y - e0y * h0;
  const q1x = v1x - e1x * h1, q1y = v1y - e1y * h1;
  const q2x = v2x - e2x * h2, q2y = v2y - e2y * h2;
  const s = Math.sign(e0x * e2y - e0y * e2x);
  let dd = q0x * q0x + q0y * q0y;
  let ss = s * (v0x * e0y - v0y * e0x);
  const d1 = q1x * q1x + q1y * q1y, s1 = s * (v1x * e1y - v1y * e1x);
  const d2 = q2x * q2x + q2y * q2y, s2 = s * (v2x * e2y - v2y * e2x);
  if (d1 < dd) dd = d1;
  if (d2 < dd) dd = d2;
  if (s1 < ss) ss = s1;
  if (s2 < ss) ss = s2;
  return -Math.sqrt(dd) * Math.sign(ss);
}

export function opExtrude(pz: number, d2: number, h: number): number {
  const wx = d2, wy = Math.abs(pz) - h;
  const inner = Math.min(Math.max(wx, wy), 0);
  const ox = Math.max(wx, 0), oy = Math.max(wy, 0);
  return inner + Math.sqrt(ox * ox + oy * oy);
}

/** distance from p to segment ab in 2D */
export function sdSeg2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── value noise ────────────────────────────────────────────────
function hash3(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0x7fffffff) / 0x7fffffff;
}
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi);
  const c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1);
  const g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
/** fbm in [-0.5, 0.5] */
export function fbm(x: number, y: number, z: number, oct = 3): number {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y, z);
    n += a;
    a *= 0.5;
    x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.2;
  }
  return s / n - 0.5;
}

// ── colour helpers (sRGB hex → linear) ──────────────────────────
export type RGB = [number, number, number];
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function hexLin(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [s2l(((n >> 16) & 255) / 255), s2l(((n >> 8) & 255) / 255), s2l((n & 255) / 255)];
}
export function hexSrgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function mixRGB(out: RGB, b: RGB, t: number): RGB {
  if (t <= 0) return out;
  if (t > 1) t = 1;
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
  return out;
}
