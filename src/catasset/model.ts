import {
  RoundCone, clamp, fbm, hexLin, mix, mixRGB, opExtrude, sdEllipsoid, sdSuperEllipsoid, sdTri2, smax, smin, smoothstep, vnoise,
  type RGB, type V3,
} from './math';
import type { CatSpec } from './specs';

const band = (v: number, c: number, w: number, e: number) => 1 - smoothstep(w - e, w + e, Math.abs(v - c));

// ─────────────────────────────── Ear ───────────────────────────────
class Ear {
  cx: number; cy: number; cz: number;
  exx: number; exy: number; exz: number;
  eyx: number; eyy: number; eyz: number;
  ezx: number; ezy: number; ezz: number;
  t: number[]; ti: number[];
  yBase: number; yTip: number; hBase: number; hTip: number; round: number; cav: number;
  bc: V3; br: number;
  // outputs of last query
  qy = 0; qz = 0; frac = 0; inner = 0;
  constructor(s: CatSpec['ear']) {
    this.cx = s.c[0]; this.cy = s.c[1]; this.cz = s.c[2];
    const ps = Math.sin(s.yaw), pc = Math.cos(s.yaw);
    const a = -s.tilt, sa = Math.sin(a), ca = Math.cos(a);
    this.exx = pc; this.exy = 0; this.exz = -ps;
    this.eyx = sa * ps; this.eyy = ca; this.eyz = sa * pc;
    this.ezx = ca * ps; this.ezy = -sa; this.ezz = ca * pc;
    this.t = [s.outer[0], s.outer[1], s.tip[0], s.tip[1], s.inner[0], s.inner[1]];
    const gx = (s.outer[0] + s.tip[0] + s.inner[0]) / 3, gy = (s.outer[1] + s.tip[1] + s.inner[1]) / 3;
    const k = 0.56;
    this.ti = [
      gx + (s.outer[0] - gx) * k, gy + (s.outer[1] - gy) * k + 0.03,
      gx + (s.tip[0] - gx) * k, gy + (s.tip[1] - gy) * k + 0.03,
      gx + (s.inner[0] - gx) * k, gy + (s.inner[1] - gy) * k + 0.03,
    ];
    this.yBase = Math.min(s.outer[1], s.inner[1]);
    this.yTip = s.tip[1];
    this.hBase = s.hBase; this.hTip = s.hTip; this.round = s.round; this.cav = s.cav;
    this.bc = [s.c[0], s.c[1], s.c[2]];
    this.br = Math.max(Math.hypot(s.tip[0], s.tip[1]), Math.hypot(s.outer[0], s.outer[1]), Math.hypot(s.inner[0], s.inner[1])) + s.hBase + s.round + 0.03;
  }
  d(px: number, py: number, pz: number): number {
    const dx = px - this.cx, dy = py - this.cy, dz = pz - this.cz;
    const qx = dx * this.exx + dy * this.exy + dz * this.exz;
    const qy = dx * this.eyx + dy * this.eyy + dz * this.eyz;
    const qz = dx * this.ezx + dy * this.ezy + dz * this.ezz;
    const t = this.t, ti = this.ti;
    const d2 = sdTri2(qx, qy, t[0], t[1], t[2], t[3], t[4], t[5]);
    const f = clamp((qy - this.yBase) / (this.yTip - this.yBase), 0, 1);
    const h = this.hTip + (this.hBase - this.hTip) * Math.pow(1 - f, 0.8);
    let d = opExtrude(qz, d2, h) - this.round;
    const d2i = sdTri2(qx, qy, ti[0], ti[1], ti[2], ti[3], ti[4], ti[5]);
    const cavH = 0.06;
    const cz = h + this.round + cavH - this.cav;
    const dc = opExtrude(qz - cz, d2i, cavH) - 0.012;
    d = smax(d, -dc, 0.02);
    this.qy = qy; this.qz = qz; this.frac = f;
    this.inner = smoothstep(0.016, -0.012, d2i);
    return d;
  }
}

export interface Parts {
  head: number; torso: number; arm: number; leg: number; ear: number; tail: number;
  armT: number; armLat: number; legLx: number; earFrac: number; earInner: number; earFront: number; tailS: number;
}

type Pal = Record<keyof CatSpec['pal'], RGB>;

// ─────────────────────────────── Cat ───────────────────────────────
export class CatModel {
  s: CatSpec;
  pal: Pal;
  torsoCone: RoundCone; izs: number;
  armSeg: RoundCone[]; armBS: Float64Array; armBC: V3; armBR: number; pca: number; psa: number;
  armDir: V3; armLen2: number; armSh: V3; pawC: V3; armTT = 0;
  leg: RoundCone; legBC: V3; legBR: number;
  ear: Ear;
  tail: RoundCone[]; tailBC: V3; tailBR: number; tailBS: Float64Array;
  eyeIR2: number;
  faceZ0: number; faceZ1: number;
  headBR: number;

  constructor(s: CatSpec) {
    this.s = s;
    const pal = {} as Pal;
    (Object.keys(s.pal) as (keyof CatSpec['pal'])[]).forEach((k) => {
      const v = s.pal[k];
      if (typeof v === 'string') pal[k] = hexLin(v);
    });
    this.pal = pal;
    this.torsoCone = new RoundCone(s.torso.a, s.torso.b, s.torso.ra, s.torso.rb);
    this.izs = 1 / s.torso.zs;
    this.leg = new RoundCone(s.leg.top, s.leg.bot, s.leg.rt, s.leg.rb);
    const f = s.foot;
    this.legBC = [0, (s.leg.top[1] + f.c[1]) / 2, f.c[2] / 2];
    this.legBR = Math.hypot(s.leg.top[1] - this.legBC[1], f.c[2]) + Math.max(s.leg.rt, f.r[2]) + 0.06;
    this.ear = new Ear(s.ear);

    // tail: smooth cubic bezier sampled into round cones
    this.tail = [];
    const T = s.tail, NS = T.seg;
    const P: V3[] = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      P.push([0, 1, 2].map((k) => b0 * T.p[0][k] + b1 * T.p[1][k] + b2 * T.p[2][k] + b3 * T.p[3][k]) as V3);
    }
    const tr = (t: number) => mix(T.r0, T.r1, Math.pow(t, 0.85));
    this.tailBS = new Float64Array(NS * 4);
    for (let i = 0; i < NS; i++) {
      const r0 = tr(i / NS), r1 = tr((i + 1) / NS);
      this.tail.push(new RoundCone(P[i], P[i + 1], r0, r1));
      this.tailBS[i * 4] = (P[i][0] + P[i + 1][0]) / 2;
      this.tailBS[i * 4 + 1] = (P[i][1] + P[i + 1][1]) / 2;
      this.tailBS[i * 4 + 2] = (P[i][2] + P[i + 1][2]) / 2;
      this.tailBS[i * 4 + 3] = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]) / 2 + Math.max(r0, r1);
    }
    const n = P.length;
    const bc: V3 = [0, 0, 0];
    P.forEach((p) => { bc[0] += p[0] / n; bc[1] += p[1] / n; bc[2] += p[2] / n; });
    this.tailBC = bc;
    this.tailBR = Math.max(...P.map((p) => Math.hypot(p[0] - bc[0], p[1] - bc[1], p[2] - bc[2]))) + s.tail.r0 + 0.04;

    const R = s.face.eyeR * 1.1;
    this.eyeIR2 = 1 / (R * R);
    this.faceZ0 = s.head.c[2] + s.head.rz * 0.3;
    this.faceZ1 = s.head.c[2] + s.head.rz * 0.72;
    const h = s.head;
    this.headBR = Math.max(h.rx, h.ry, h.rz) * Math.pow(2, 0.5 - 1 / h.nXY) * 1.04 + 0.04;

    // ── arms: pure smooth continuous quadratic Bezier curve (no kinks, perfectly continuous!) ──
    const A = s.arm, NA = A.seg;
    const AP: V3[] = [], AR: number[] = [];
    for (let k = 0; k <= NA; k++) {
      const t = k / NA, u = 1 - t;
      const b0 = u * u, b1 = 2 * u * t, b2 = t * t;
      const px = b0 * A.p0[0] + b1 * A.p1[0] + b2 * A.p2[0];
      const py = b0 * A.p0[1] + b1 * A.p1[1] + b2 * A.p2[1];
      const pz = b0 * A.p0[2] + b1 * A.p1[2] + b2 * A.p2[2];
      AP.push([px, py, pz]);
      AR.push(mix(A.r0, A.r1, t));
    }
    this.armSeg = [];
    this.armBS = new Float64Array(NA * 4);
    for (let i = 0; i < NA; i++) {
      this.armSeg.push(new RoundCone(AP[i], AP[i + 1], AR[i], AR[i + 1]));
      this.armBS[i * 4] = (AP[i][0] + AP[i + 1][0]) / 2;
      this.armBS[i * 4 + 1] = (AP[i][1] + AP[i + 1][1]) / 2;
      this.armBS[i * 4 + 2] = (AP[i][2] + AP[i + 1][2]) / 2;
      this.armBS[i * 4 + 3] = Math.hypot(AP[i + 1][0] - AP[i][0], AP[i + 1][1] - AP[i][1], AP[i + 1][2] - AP[i][2]) / 2 + Math.max(AR[i], AR[i + 1]);
    }
    const pc = s.paw.c;
    this.pawC = [pc[0], pc[1], pc[2]];
    this.armSh = [A.p0[0], A.p0[1], A.p0[2]];
    const abPts = [...AP, pc];
    const abc: V3 = [0, 0, 0];
    abPts.forEach((q) => { abc[0] += q[0] / abPts.length; abc[1] += q[1] / abPts.length; abc[2] += q[2] / abPts.length; });
    this.armBC = abc;
    this.armBR = Math.max(...abPts.map((q) => Math.hypot(q[0] - abc[0], q[1] - abc[1], q[2] - abc[2]))) + Math.max(A.r0, A.r1, ...s.paw.r) + 0.04;
    this.pca = Math.cos(s.paw.ang); this.psa = Math.sin(s.paw.ang);
    this.armDir = [pc[0] - A.p0[0], pc[1] - A.p0[1], pc[2] - A.p0[2]];
    this.armLen2 = this.armDir[0] ** 2 + this.armDir[1] ** 2 + this.armDir[2] ** 2;
  }

  // ── face relief: slightly domed eyes, nose & puffy muzzle ──
  faceBump(ax: number, y: number, z: number): number {
    const F = this.s.face;
    let b = 0, dx = ax - F.eyeX, dy = y - F.eyeY;
    let s = (dx * dx + dy * dy) * this.eyeIR2;
    if (s < 1) { const u = 1 - s; b += F.bump.eye * u * u; }
    const nr = F.noseW * 0.95;
    dx = ax; dy = y - F.noseY - 0.004;
    s = (dx * dx + dy * dy) / (nr * nr);
    if (s < 1) { const u = 1 - s; b += F.bump.nose * u * u; }
    dx = ax / (F.mouthW * 1.15); dy = (y - (F.mouthJ - F.mouthD * 0.3)) / (F.mouthD * 1.9);
    s = dx * dx + dy * dy;
    if (s < 1) { const u = 1 - s; b += F.bump.pad * u * u; }
    dx = ax / (F.mouthW * 0.62); dy = (y - (F.mouthJ - F.mouthD - 0.055)) / 0.085;
    s = dx * dx + dy * dy;
    if (s < 1) { const u = 1 - s; b += F.bump.chin * u * u; }
    return b * smoothstep(this.faceZ0, this.faceZ1, z);
  }

  pawD(ax: number, y: number, z: number): number {
    const p = this.s.paw, c = this.pawC;
    const dx = ax - c[0], dy = y - c[1];
    const lx = dx * this.pca + dy * this.psa;
    const ly = -dx * this.psa + dy * this.pca;
    return sdEllipsoid(lx, ly, z - c[2], p.r[0], p.r[1], p.r[2]);
  }

  /** leg + foot in leg-local x (outward positive) */
  legD(lx: number, y: number, z: number): number {
    const f = this.s.foot;
    let d = this.leg.d(lx, y, z);
    const df = sdEllipsoid(lx - f.c[0], y - f.c[1], z - f.c[2], f.r[0], f.r[1], f.r[2]);
    d = smin(d, df, f.k);
    // toe creases on the front of the foot
    const zf = f.c[2] + f.r[2] * 0.25;
    if (z > zf && y < f.c[1] + f.r[1]) {
      const sp = f.r[0] * 0.33;
      const g1 = (lx - f.c[0] + sp) / 0.0135, g2 = (lx - f.c[0] - sp) / 0.0135;
      const fz = smoothstep(zf, f.c[2] + f.r[2] * 0.72, z) * smoothstep(f.c[1] + f.r[1] * 0.85, f.c[1] + f.r[1] * 0.3, y);
      d += f.toe * (Math.exp(-g1 * g1) + Math.exp(-g2 * g2)) * fz;
    }
    return d;
  }

  /** curved arm + paw (mitten). Sets armTT = arm parameter of the closest segment. */
  armD(ax: number, y: number, z: number): number {
    let d = 1e9, tt = 0;
    const B = this.armBS, segs = this.armSeg, n = segs.length;
    for (let i = 0; i < n; i++) {
      const bx = ax - B[i * 4], by = y - B[i * 4 + 1], bz = z - B[i * 4 + 2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - B[i * 4 + 3] >= d) continue;
      const di = segs[i].d(ax, y, z);
      if (di < d) { d = di; tt = (i + clamp(segs[i].t, 0, 1)) / n; }
    }
    const dp = this.pawD(ax, y, z);
    if (dp < d) tt = 1;
    this.armTT = tt;
    return smin(d, dp, this.s.paw.k);
  }

  tailD(x: number, y: number, z: number): number {
    let d = 1e9;
    const B = this.tailBS;
    for (let i = 0; i < this.tail.length; i++) {
      const bx = x - B[i * 4], by = y - B[i * 4 + 1], bz = z - B[i * 4 + 2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - B[i * 4 + 3] >= d) continue;
      const di = this.tail[i].d(x, y, z);
      if (di < d) d = di;
    }
    return d;
  }

  headD(x: number, ax: number, y: number, z: number): number {
    const h = this.s.head;
    const ly = y - h.c[1];
    // Smooth egg-sphere head: round from the side (Z), gently softened in XY
    let d = sdSuperEllipsoid(x - h.c[0], ly, z - h.c[2], h.rx, h.ry, h.rz, h.nXY);
    if (z > this.faceZ0) d -= this.faceBump(ax, y, z);
    return d;
  }

  torsoD(x: number, y: number, z: number): number {
    const b = this.s.belly, T = this.s.torso;
    let dCone = this.torsoCone.d(x, y, z * this.izs) * T.zs;
    if (T.cutY !== undefined) {
      dCone = smax(dCone, T.cutY - y, T.cutK);
    }
    return smin(dCone, sdEllipsoid(x - b.c[0], y - b.c[1], z - b.c[2], b.r[0], b.r[1], b.r[2]), b.k);
  }

  /** everything except the arms (head, torso, ears, legs, tail) */
  core(x: number, y: number, z: number): number {
    const s = this.s;
    const ax = x < 0 ? -x : x;
    const dT = this.torsoD(x, y, z);
    const hx = x - s.head.c[0], hy = y - s.head.c[1], hz = z - s.head.c[2];
    const hb = Math.sqrt(hx * hx + hy * hy + hz * hz) - this.headBR;
    let d = hb > dT + s.headTorsoK * 1.5 + 0.02 ? dT : smin(this.headD(x, ax, y, z), dT, s.headTorsoK);
    // ears
    {
      const e = this.ear, bx = ax - e.bc[0], by = y - e.bc[1], bz = z - e.bc[2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - e.br < d + s.ear.k) d = smin(d, e.d(ax, y, z), s.ear.k);
    }
    // legs – blended into the hips, separate below the crotch
    {
      const sx = Math.sqrt(x * x + 0.0004);
      const lx = sx - s.leg.x;
      const c = this.legBC, bx = lx - c[0], by = y - c[1], bz = z - c[2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - this.legBR < d + s.leg.kTop) {
        const dl = this.legD(lx, y, z);
        const t = this.leg.t;
        d = smin(d, dl, mix(s.leg.kTop, s.leg.kBot, smoothstep(0.35, 0.82, t)));
      }
    }
    // tail
    {
      const c = this.tailBC, bx = x - c[0], by = y - c[1], bz = z - c[2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - this.tailBR < d + s.tail.k) d = smin(d, this.tailD(x, y, z), s.tail.k);
    }
    return d;
  }

  /** The full signed distance field of the figure */
  dist(x: number, y: number, z: number): number {
    const s = this.s;
    const ax = x < 0 ? -x : x;
    let d = this.core(x, y, z);
    // arms – blended ONLY at the shoulder joint & armpit; below that the arm is a separate limb (k → ~0)
    {
      const c = this.armBC, bx = ax - c[0], by = y - c[1], bz = z - c[2];
      if (Math.sqrt(bx * bx + by * by + bz * bz) - this.armBR < d + s.arm.kTop) {
        const dArm = this.armD(ax, y, z);
        d = smin(d, dArm, mix(s.arm.kTop, s.arm.kBot, smoothstep(s.arm.t0, s.arm.t1, this.armTT)));
      }
    }
    // flat soles
    return smax(d, -y, 0.012);
  }

  /** individual part distances (for painting) */
  parts(x: number, y: number, z: number, o: Parts): Parts {
    const s = this.s;
    const ax = x < 0 ? -x : x;
    o.head = this.headD(x, ax, y, z);
    o.torso = this.torsoD(x, y, z);
    o.ear = this.ear.d(ax, y, z);
    o.earFrac = this.ear.frac; o.earInner = this.ear.inner; o.earFront = this.ear.qz;
    o.arm = this.armD(ax, y, z);
    const sh = this.armSh, ad = this.armDir;
    const t = ((ax - sh[0]) * ad[0] + (y - sh[1]) * ad[1] + (z - sh[2]) * ad[2]) / this.armLen2;
    o.armT = t;
    o.armLat = ax - (sh[0] + ad[0] * t);
    const lx = Math.sqrt(x * x + 0.0004) - s.leg.x;
    o.leg = this.legD(lx, y, z);
    o.legLx = lx;
    let best = 1e9, bs = 0;
    for (let i = 0; i < this.tail.length; i++) {
      const dd = this.tail[i].d(x, y, z);
      if (dd < best) { best = dd; bs = (i + clamp(this.tail[i].t, 0, 1)) / this.tail.length; }
    }
    o.tail = best;
    o.tailS = bs;
    return o;
  }

  // ─────────────────────────────── paint ───────────────────────────────
  private tmp: Parts = { head: 0, torso: 0, arm: 0, leg: 0, ear: 0, tail: 0, armT: 0, armLat: 0, legLx: 0, earFrac: 0, earInner: 0, earFront: 0, tailS: 0 };
  private c0: RGB = [0, 0, 0];

  color(x: number, y: number, z: number, out: RGB): RGB {
    const p = this.parts(x, y, z, this.tmp);
    const ds = [p.head, p.torso, p.arm, p.leg, p.ear, p.tail];
    let m = 1e9;
    for (const d of ds) if (d < m) m = d;
    const sig = 0.016;
    out[0] = out[1] = out[2] = 0;
    let wsum = 0;
    const n1 = fbm(x * 7.3 + 11, y * 7.3, z * 7.3);
    const n2 = vnoise(x * 34 + 3, y * 34 + 7, z * 34) - 0.5;
    for (let i = 0; i < 6; i++) {
      const w = Math.exp(-(ds[i] - m) / sig);
      if (w < 0.004) continue;
      const c = this.c0;
      if (this.s.id === 'oyen') this.paintOyen(i, x, y, z, p, n1, n2, c);
      else this.paintSiam(i, x, y, z, p, n1, n2, c);
      out[0] += c[0] * w; out[1] += c[1] * w; out[2] += c[2] * w;
      wsum += w;
    }
    out[0] /= wsum; out[1] /= wsum; out[2] /= wsum;
    const v = 1 + fbm(x * 2.2, y * 2.2 + 4, z * 2.2) * 0.07;
    out[0] *= v; out[1] *= v; out[2] *= v;
    return out;
  }

  private set(c: RGB, src: RGB) { c[0] = src[0]; c[1] = src[1]; c[2] = src[2]; }

  // ───────── Orange tabby ─────────
  private paintOyen(part: number, x: number, y: number, z: number, p: Parts, n1: number, n2: number, c: RGB) {
    const P = this.pal, s = this.s, F = s.face;
    const ax = Math.abs(x);
    this.set(c, P.fur);
    if (part === 0) {
      // HEAD
      const lx = x - s.head.c[0], ly = y - s.head.c[1], lz = z - s.head.c[2];
      const phi = Math.atan2(lz, ly);
      let st = 0;
      // 3 clean vertical forehead stripes between eyes (Gambar 2)
      const fs: [number, number, number, number][] = [
        [0, 0.022, 0.22, 1.15],
        [0.082, 0.017, 0.32, 1.08],
        [-0.082, 0.017, 0.32, 1.08],
      ];
      for (const [xc, w, p0, p1] of fs) {
        const xx = lx - xc + n1 * 0.012 + n2 * 0.003;
        const along = smoothstep(p0, p0 + 0.10, phi) * smoothstep(p1, p1 - 0.08, phi);
        const ww = w * (0.75 + 0.25 * smoothstep(p1, p1 - 0.3, phi));
        st = Math.max(st, band(xx, 0, ww, 0.005) * along);
      }
      // 2 horizontal cheek dashes beside each eye (Gambar 2)
      for (const yc of [1.775, 1.705]) {
        const yy = y - yc - (ax - 0.45) * 0.18 + n1 * 0.01;
        const cheekDash = band(yy, 0, 0.013, 0.004) * smoothstep(0.40, 0.44, ax) * smoothstep(0.58, 0.52, ax) * smoothstep(0.08, 0.22, lz);
        st = Math.max(st, cheekDash);
      }
      // stripes on the back of head
      const back = smoothstep(-0.75, -1.0, phi);
      for (const pc of [-1.12, -1.52, -1.92]) {
        st = Math.max(st, band(phi + 0.09 * Math.sin(lx * 7) + n1 * 0.1, pc, 0.075, 0.03) * smoothstep(0.52, 0.3, ax) * back);
      }
      mixRGB(c, P.stripe, st);

      // Fluffy white muzzle & chin patch (Gambar 2)
      const eMuzzle = (ax / (F.mouthW * 1.05)) ** 2 + ((y - (F.mouthJ - F.mouthD * 0.15)) / (F.mouthD * 1.5)) ** 2;
      const chinY = F.mouthJ - F.mouthD - 0.08;
      const eChin = (ax / (F.mouthW * 0.65)) ** 2 + ((y - chinY) / 0.11) ** 2;
      const eNose = (ax / 0.055) ** 2 + ((y - (F.noseY - 0.025)) / 0.04) ** 2;
      const e = Math.min(eMuzzle, eChin, eNose);
      const wm = smoothstep(1.08, 0.82, e + n1 * 0.25 + n2 * 0.08) * smoothstep(this.faceZ0 - 0.05, this.faceZ0 + 0.08, z);
      mixRGB(c, P.white, wm);
    } else if (part === 1) {
      // TORSO
      const aa = Math.abs(Math.atan2(x, z));
      let st = 0;
      const side = smoothstep(0.95, 1.32, aa + n1 * 0.25);
      for (const yc of [1.15, 0.995, 0.84, 0.69, 0.545]) {
        const yy = y - yc + 0.035 * Math.sin(aa * 2.3 + yc * 7) + n1 * 0.035 + n2 * 0.008;
        st = Math.max(st, band(yy, 0, 0.031, 0.011) * side);
      }
      st = Math.max(st, band(x + n1 * 0.03, 0, 0.042, 0.012) * smoothstep(2.6, 2.9, aa) * smoothstep(0.5, 0.65, y) * smoothstep(1.42, 1.28, y));
      mixRGB(c, P.stripe, st);
      const bx = x / 0.318, by = (y - 0.892) / 0.376;
      const wb = smoothstep(1.1, 0.86, bx * bx + by * by + n1 * 0.32 + n2 * 0.1) * smoothstep(0.03, 0.17, z);
      mixRGB(c, P.white, wb);
    } else if (part === 2) {
      // ARM
      let st = 0;
      for (const tc of [0.2, 0.365, 0.53]) {
        st = Math.max(st, band(p.armT - tc + n1 * 0.06 + n2 * 0.015, 0, 0.042, 0.014));
      }
      st *= smoothstep(-0.1, -0.01, p.armLat + n1 * 0.03) * smoothstep(0.05, 0.14, p.armT);
      mixRGB(c, P.stripe, st);
      mixRGB(c, P.white, smoothstep(0.73, 0.79, p.armT + n1 * 0.13 + n2 * 0.05));
    } else if (part === 3) {
      // LEG
      let st = 0;
      for (const yc of [0.475, 0.39]) {
        st = Math.max(st, band(y - yc + n1 * 0.03 + 0.01 * Math.sin(p.legLx * 30), 0, 0.022, 0.009));
      }
      st *= smoothstep(-0.17, -0.07, p.legLx);
      mixRGB(c, P.stripe, st);
      mixRGB(c, P.white, smoothstep(0.268, 0.238, y + n1 * 0.08 + n2 * 0.03));
    } else if (part === 4) {
      // EAR
      mixRGB(c, P.stripe, smoothstep(0.6, 1.0, p.earFrac) * 0.4);
      mixRGB(c, P.earInner, p.earInner * smoothstep(0.0, 0.03, p.earFront) * smoothstep(0.05, 0.25, p.earFrac));
    } else {
      // TAIL
      const r = (p.tailS * 5.2 + n1 * 0.4) % 1;
      mixRGB(c, P.stripe, band(r, 0.5, 0.17, 0.06) * smoothstep(0.08, 0.2, p.tailS));
    }
  }

  // ───────── Siamese ─────────
  private paintSiam(part: number, x: number, y: number, z: number, p: Parts, n1: number, n2: number, c: RGB) {
    const P = this.pal, s = this.s, F = s.face;
    const ax = Math.abs(x);
    this.set(c, P.fur);
    if (part === 0) {
      // HEAD - soft airbrushed dark point mask around nose, muzzle & eyes (Gambar 2)
      const front = smoothstep(this.faceZ0 - 0.08, this.faceZ0 + 0.12, z);
      const mx = ax / 0.21, my = (y - (F.noseY - 0.005)) / 0.145;
      const eMuzzle = Math.sqrt(mx * mx + my * my);
      const ex = (ax - F.eyeX * 0.65) / 0.14, ey = (y - (F.eyeY - 0.02)) / 0.12;
      const eEyes = Math.sqrt(ex * ex + ey * ey);
      const eCenter = Math.hypot(ax / 0.08, (y - (F.noseY + 0.06)) / 0.12);

      let mask = 1 - smoothstep(0.38, 1.22, eMuzzle + n1 * 0.10);
      mask = Math.max(mask, 0.82 * (1 - smoothstep(0.30, 1.15, eEyes + n1 * 0.12)));
      mask = Math.max(mask, 0.75 * (1 - smoothstep(0.25, 1.10, eCenter + n1 * 0.10)));
      mask *= front;
      mask *= 1 - 0.25 * smoothstep(F.mouthJ - 0.02, F.mouthJ - 0.10, y);

      mixRGB(c, P.pointMid, smoothstep(0.0, 0.55, mask));
      mixRGB(c, P.point, smoothstep(0.40, 1.0, mask));

      const eb = s.ear.c;
      const sd = Math.hypot((ax - eb[0] - 0.02) / 0.2, (y - eb[1] + 0.03) / 0.13, (z - eb[2]) / 0.25);
      mixRGB(c, P.pointMid, (1 - smoothstep(0.35, 1.0, sd + n1 * 0.3)) * 0.75);
    } else if (part === 1) {
      // TORSO
      const back = smoothstep(0.1, -0.35, z);
      mixRGB(c, P.stripe, back * 0.45 + n1 * 0.1);
      const bx = x / 0.3, by = (y - 0.76) / 0.34;
      mixRGB(c, P.white, smoothstep(1.2, 0.6, bx * bx + by * by) * smoothstep(0.0, 0.15, z) * 0.7);
    } else if (part === 2) {
      // ARM
      mixRGB(c, P.pointMid, smoothstep(0.66, 0.8, p.armT + n1 * 0.08) * 0.9);
      mixRGB(c, P.point, smoothstep(0.78, 0.92, p.armT + n1 * 0.06));
    } else if (part === 3) {
      // LEG
      mixRGB(c, P.pointMid, smoothstep(0.34, 0.24, y + n1 * 0.05) * 0.9);
      mixRGB(c, P.point, smoothstep(0.26, 0.17, y + n1 * 0.04));
      const f = s.foot;
      const zf = f.c[2] + f.r[2];
      for (const tx of [-0.33, 0, 0.33]) {
        const bx = (p.legLx - f.c[0] - tx * f.r[0]) / 0.04, by = (y - 0.012) / 0.036, bz = (z - (zf - 0.03 - Math.abs(tx) * 0.05)) / 0.05;
        const e = bx * bx + by * by + bz * bz;
        mixRGB(c, P.bean, smoothstep(1.0, 0.45, e + n2 * 0.2));
      }
    } else if (part === 4) {
      // EAR
      mixRGB(c, P.pointMid, smoothstep(-0.05, 0.25, p.earFrac + n1 * 0.15));
      mixRGB(c, P.point, smoothstep(0.15, 0.5, p.earFrac + n1 * 0.15));
      mixRGB(c, P.earInner, p.earInner * smoothstep(0.0, 0.03, p.earFront) * smoothstep(0.2, 0.45, p.earFrac) * 0.8);
    } else {
      // TAIL
      mixRGB(c, P.pointMid, smoothstep(0.05, 0.35, p.tailS));
      mixRGB(c, P.point, smoothstep(0.3, 0.75, p.tailS));
    }
  }
}

/** sphere-trace along -Z from the front to find the surface at (x,y). Returns z or NaN */
export function traceFront(m: CatModel, x: number, y: number, z0: number, zmin: number): number {
  let z = z0;
  for (let i = 0; i < 160; i++) {
    const d = m.dist(x, y, z);
    if (d < 0.0002) return z;
    z -= Math.max(d * 0.85, 0.0004);
    if (z < zmin) return NaN;
  }
  return NaN;
}

export function gradN(m: CatModel, x: number, y: number, z: number, out: V3, e = 0.0012): V3 {
  const a = m.dist(x + e, y - e, z - e);
  const b = m.dist(x - e, y - e, z + e);
  const c = m.dist(x - e, y + e, z - e);
  const d = m.dist(x + e, y + e, z + e);
  let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
  const l = Math.sqrt(nx * nx + ny * nx + nz * nz) || 1;
  nx /= l; ny /= l; nz /= l;
  out[0] = nx; out[1] = ny; out[2] = nz;
  return out;
}
