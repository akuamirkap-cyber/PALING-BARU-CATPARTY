import * as THREE from 'three';

/**
 * Lintasan Ski Cross "Jelly Peak".
 * Satuan meter. Lintasan = spline di bidang XZ + profil ketinggian H(s).
 * Koordinat lintasan: s = jarak sepanjang lintasan, d = offset lateral (positif = kiri pembalap).
 */
export const W = 12; // setengah lebar area ski yang bisa dilalui
export const BERM = 6; // tanggul salju di luar W
export const SKIRT = 3.5;
export const FENCE_D = W + 1.3; // jaring pengaman (B-net)
export const START_S = 12;
export const RUNOUT = 85;
export const RIBBON_S0 = -18;
export const START_D = [-4.5, -1.5, 1.5, 4.5];
export const PLAYER_SLOT = 2;

const CTRL: [number, number][] = [
  [-60, 0],
  [0, 0],
  [60, -16],
  [125, 6],
  [190, 44],
  [262, 38],
  [332, -4],
  [402, -40],
  [470, -30],
  [540, 10],
  [612, 38],
  [680, 26],
  [748, -10],
  [812, -22],
  [872, -6],
  [932, 0],
  [1010, 0],
];

const SEG: [number, number][] = [
  [0.0, 13],
  [0.18, 16],
  [0.3, 10],
  [0.4, 17],
  [0.52, 12],
  [0.62, 15],
  [0.72, 11],
  [0.82, 14],
  [0.9, 8],
  [0.97, 5],
];
const JUMPS: { u: number; h: number; len: number }[] = [
  { u: 0.24, h: 1.5, len: 12 },
  { u: 0.47, h: 1.9, len: 12 },
  { u: 0.68, h: 1.6, len: 12 },
  { u: 0.875, h: 2.3, len: 14 },
];
const ROLLERS: [number, number] = [0.555, 0.6];

export interface Gate {
  idx: number;
  s: number;
  d: number;
  hw: number;
  red: boolean;
}
export interface Jump {
  s: number;
  h: number;
  len: number;
  big: boolean;
}
export interface CrowdZone {
  s0: number;
  s1: number;
  density: number;
  sides: (1 | -1)[];
  stand?: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const smooth01 = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export function noise2(x: number, z: number) {
  return (
    Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.4) * 0.5 +
    Math.sin(x * 0.031 - z * 0.027 + 2.1) * 0.3 +
    Math.sin(x * 0.071 + z * 0.053) * 0.15 +
    Math.sin(x * 0.17 - z * 0.13 + 0.7) * 0.05
  );
}

function boxFilter(src: Float32Array, win: number) {
  const out = new Float32Array(src.length);
  const n = src.length;
  let acc = 0;
  const h = Math.max(1, Math.floor(win / 2));
  for (let i = -h; i <= h; i++) acc += src[clamp(i, 0, n - 1)];
  for (let i = 0; i < n; i++) {
    out[i] = acc / (2 * h + 1);
    acc += src[clamp(i + h + 1, 0, n - 1)] - src[clamp(i - h, 0, n - 1)];
  }
  return out;
}

export interface Proj {
  s: number;
  d: number;
  i: number;
}

export class Course {
  ds: number;
  N: number;
  L: number;
  xs: Float32Array;
  zs: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  H: Float32Array;
  bank: Float32Array;
  kappa: Float32Array;
  startS = START_S;
  finishS: number;
  gates: Gate[] = [];
  jumps: Jump[] = [];
  zones: CrowdZone[] = [];
  rollers: [number, number];

  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    curve.arcLengthDivisions = 6000;
    const len = curve.getLength();
    const N = Math.floor(len / 0.5) + 1;
    const pts = curve.getSpacedPoints(N - 1);
    this.N = N;
    this.ds = len / (N - 1);
    this.L = len;
    this.xs = new Float32Array(N);
    this.zs = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.xs[i] = pts[i].x;
      this.zs[i] = pts[i].z;
    }
    const theta = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(N - 1, i + 1);
      let dx = this.xs[b] - this.xs[a];
      let dz = this.zs[b] - this.zs[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
      theta[i] = Math.atan2(dz, dx);
      if (i > 0) {
        while (theta[i] - theta[i - 1] > Math.PI) theta[i] -= Math.PI * 2;
        while (theta[i] - theta[i - 1] < -Math.PI) theta[i] += Math.PI * 2;
      }
    }
    const k0 = new Float32Array(N);
    for (let i = 1; i < N - 1; i++) k0[i] = (theta[i + 1] - theta[i - 1]) / (2 * this.ds);
    this.kappa = boxFilter(boxFilter(k0, Math.round(30 / this.ds)), Math.round(30 / this.ds));

    this.finishS = this.L - RUNOUT;
    const F = this.finishS;
    this.jumps = JUMPS.map((j, k) => ({ s: j.u * F, h: j.h, len: j.len, big: k === JUMPS.length - 1 }));
    this.rollers = [ROLLERS[0] * F, ROLLERS[1] * F];

    // Profil kemiringan → ketinggian
    const slope = new Float32Array(N);
    for (let i = 0; i < N; i++) slope[i] = this.slopeDeg(i * this.ds);
    const sm = boxFilter(slope, Math.round(16 / this.ds));
    this.H = new Float32Array(N);
    for (let i = 1; i < N; i++) this.H[i] = this.H[i - 1] - Math.tan((sm[i] * Math.PI) / 180) * this.ds;
    for (let i = 0; i < N; i++) this.H[i] += this.bump(i * this.ds);

    this.bank = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      const fade = smooth01((s - START_S - 20) / 30) * (1 - smooth01((s - F + 40) / 30));
      this.bank[i] = clamp(this.kappa[i] * 20, -0.28, 0.28) * fade;
    }

    // Gerbang bendera (bergantian kiri/kanan)
    let side = 1;
    for (let s = START_S + 55; s < F - 35; s += 42) {
      if (this.jumps.some((j) => s > j.s - j.len - 22 && s < j.s + 34)) continue;
      if (s > this.rollers[0] - 14 && s < this.rollers[1] + 10) continue;
      this.gates.push({ idx: this.gates.length, s, d: side * 4.2, hw: 4.6, red: this.gates.length % 2 === 0 });
      side = -side;
    }

    // Zona penonton
    this.zones.push({ s0: -6, s1: START_S + 48, density: 1.1, sides: [1, -1] });
    for (const j of this.jumps) this.zones.push({ s0: j.s - 32, s1: j.s + 26, density: j.big ? 1.3 : 0.85, sides: [1, -1] });
    this.zones.push({ s0: this.rollers[0] - 8, s1: this.rollers[1] + 8, density: 0.7, sides: [1, -1] });
    this.gates.forEach((g, k) => {
      if (k % 2 === 0) this.zones.push({ s0: g.s - 12, s1: g.s + 12, density: 0.6, sides: [g.d > 0 ? -1 : 1] });
    });
    this.zones.push({ s0: F - 62, s1: F + 30, density: 1.0, sides: [1, -1], stand: true });
  }

  private slopeDeg(s: number) {
    const F = this.finishS;
    if (s < START_S + 2) return 0;
    if (s < START_S + 42) return 22;
    if (s > F + 18) return -4;
    if (s > F) return 1.5;
    const u = s / F;
    let deg = SEG[0][1];
    for (const [u0, dg] of SEG) if (u >= u0) deg = dg;
    return deg;
  }

  private bump(s: number) {
    let b = 0;
    for (const j of this.jumps) {
      const a = j.s - j.len;
      if (s >= a && s <= j.s) b += j.h * Math.pow((s - a) / j.len, 1.6);
      else if (s > j.s && s < j.s + 5) b += j.h * Math.pow(1 - (s - j.s) / 5, 2);
    }
    const [r0, r1] = this.rollers;
    if (s > r0 && s < r1) b += 0.65 * Math.pow(Math.sin((Math.PI * (s - r0)) / 9), 2);
    return b;
  }

  private interp(arr: Float32Array, s: number) {
    const f = clamp(s, 0, this.L) / this.ds;
    const i = Math.min(this.N - 2, Math.floor(f));
    const t = f - i;
    return arr[i] * (1 - t) + arr[i + 1] * t;
  }

  Hs(s: number) {
    return this.interp(this.H, s);
  }
  bankAt(s: number) {
    return this.interp(this.bank, s);
  }
  kappaAt(s: number) {
    return this.interp(this.kappa, s);
  }
  slopeAt(s: number) {
    return (this.Hs(s + 0.5) - this.Hs(s - 0.5)) / 1.0;
  }

  /** Titik tengah & tangen di s (ekstrapolasi di luar ujung). */
  frame(s: number) {
    const f = clamp(s, 0, this.L) / this.ds;
    const i = Math.min(this.N - 2, Math.floor(f));
    const t = f - i;
    let x = this.xs[i] * (1 - t) + this.xs[i + 1] * t;
    let z = this.zs[i] * (1 - t) + this.zs[i + 1] * t;
    let tx = this.tx[i] * (1 - t) + this.tx[i + 1] * t;
    let tz = this.tz[i] * (1 - t) + this.tz[i + 1] * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (s < 0) {
      x += tx * s;
      z += tz * s;
    } else if (s > this.L) {
      x += tx * (s - this.L);
      z += tz * (s - this.L);
    }
    return { x, z, tx, tz };
  }

  private berm(ad: number) {
    if (ad <= W - 1) return 0;
    if (ad <= W + 2) return 0.9 * smooth01((ad - (W - 1)) / 3);
    return 0.9 * (1 - smooth01((ad - W - 2) / (BERM - 2)));
  }
  private bermSlope(d: number) {
    return (this.berm(Math.abs(d + 0.05)) - this.berm(Math.abs(d - 0.05))) / 0.1;
  }

  /** Permukaan lintasan (dipakai pembalap & mesh pita salju). */
  surfaceY(s: number, d: number) {
    const dc = clamp(d, -(W + BERM), W + BERM);
    return this.Hs(s) + this.bankAt(s) * dc + this.berm(Math.abs(d));
  }

  /** Gradien permukaan dalam koordinat dunia (dy/dx, dy/dz). */
  gradient(s: number, d: number) {
    const f = this.frame(s);
    const dyds = this.slopeAt(s);
    const dydd = this.bankAt(s) + this.bermSlope(d);
    return { gx: f.tx * dyds + f.tz * dydd, gz: f.tz * dyds - f.tx * dydd };
  }

  /** Medan alami di luar lintasan. */
  naturalY(s: number, d: number, x: number, z: number) {
    const dEdge = clamp(d, -(W + BERM), W + BERM);
    const sc = clamp(s, 0, this.L);
    let y = this.Hs(sc) + this.bankAt(sc) * dEdge;
    const e = Math.max(0, Math.abs(d) - (W + BERM));
    y += 0.1 * e + 0.0011 * e * e;
    if (s < 0) y += Math.max(0, -s - 20) * 0.42;
    if (s > this.L) y += (s - this.L) * 0.05;
    const amp = Math.min(1, e / 35) * 9 + (s < -20 ? Math.min(10, (-s - 20) * 0.2) : 0);
    return y + noise2(x, z) * amp;
  }

  onRibbon(p: Proj) {
    return p.s >= RIBBON_S0 && p.s <= this.L && Math.abs(p.d) <= W + BERM;
  }

  /** Ketinggian tanah sebenarnya (permukaan lintasan atau medan). */
  groundY(x: number, z: number) {
    const p = this.project(x, z);
    return this.onRibbon(p) ? this.surfaceY(p.s, p.d) : this.naturalY(p.s, p.d, x, z);
  }

  worldAt(s: number, d: number) {
    const f = this.frame(s);
    return { x: f.x + f.tz * d, y: this.surfaceY(s, d), z: f.z - f.tx * d };
  }

  /** Proyeksi titik dunia ke koordinat lintasan (s, d). `hint` = indeks sampel sebelumnya. */
  project(x: number, z: number, hint = -1): Proj {
    const N = this.N;
    let best = 0;
    let bd = Infinity;
    const scan = (a: number, b: number, step: number) => {
      for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i += step) {
        const dx = x - this.xs[i];
        const dz = z - this.zs[i];
        const dd = dx * dx + dz * dz;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
    };
    if (hint >= 0) scan(hint - 30, hint + 90, 1);
    else {
      scan(0, N - 1, 16);
      const c = best;
      bd = Infinity;
      scan(c - 24, c + 24, 1);
    }
    const i0 = best;
    // proyeksi presisi ke dua segmen di sekitar sampel terdekat
    let s = i0 * this.ds;
    let sd = Infinity;
    for (const a of [i0 - 1, i0]) {
      if (a < 0 || a > N - 2) continue;
      const ex = this.xs[a + 1] - this.xs[a];
      const ez = this.zs[a + 1] - this.zs[a];
      const l2 = ex * ex + ez * ez || 1;
      let t = ((x - this.xs[a]) * ex + (z - this.zs[a]) * ez) / l2;
      const lo = a === 0 ? -Infinity : 0;
      const hi = a === N - 2 ? Infinity : 1;
      t = clamp(t, lo, hi);
      const px = this.xs[a] + ex * t;
      const pz = this.zs[a] + ez * t;
      const dd = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dd < sd) {
        sd = dd;
        s = (a + t) * this.ds;
      }
    }
    // haluskan dengan tangen terinterpolasi → s kontinu (tanpa lompatan di sudut polyline)
    let f = this.frame(s);
    for (let k = 0; k < 3; k++) {
      s += (x - f.x) * f.tx + (z - f.z) * f.tz;
      f = this.frame(s);
    }
    const d = (x - f.x) * f.tz - (z - f.z) * f.tx;
    return { s, d, i: i0 };
  }
}

export const COURSE = new Course();
