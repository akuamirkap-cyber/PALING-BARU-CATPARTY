import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AccessoryId, AnimalDef, AnimalId } from "./animals";
import * as rig from "./rig";
import type { V3 } from "./rig";
import { getTuning, tuningKey, TUNING_DEFAULTS, type Tuning } from "./tuning";

/* =====================================================================
 *  Shared material helper (used by the arena too)
 * ===================================================================== */
const matCache = new Map<number, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.85) {
  const key = color * 10 + Math.round(rough * 9);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

/* =====================================================================
 *  Bind pose (torso at origin). Bone-local frames == physics body frames.
 * ===================================================================== */
type PartName = "torso" | "head" | "armL" | "armR" | "legL" | "legR";
const PARTS: PartName[] = ["torso", "head", "armL", "armR", "legL", "legR"];
const PI = { torso: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5 } as const;

const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
let bindPos: THREE.Vector3[] = [];
let bindQuat: THREE.Quaternion[] = [];
let bindMat: THREE.Matrix4[] = [];
function computeBind() {
  const limb = (pivot: V3, rz: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz);
    const top = v3(rig.LIMB_TOP).applyQuaternion(q);
    return { p: v3(pivot).sub(top), q };
  };
  const list = [
    { p: new THREE.Vector3(), q: new THREE.Quaternion() },
    { p: new THREE.Vector3(0, rig.HEAD_OFFSET, 0), q: new THREE.Quaternion() },
    limb(rig.SHOULDER_L, rig.ARM_BIND_SPREAD),
    limb(rig.SHOULDER_R, -rig.ARM_BIND_SPREAD),
    limb(rig.HIP_L, 0),
    limb(rig.HIP_R, 0),
  ];
  bindPos = list.map((l) => l.p);
  bindQuat = list.map((l) => l.q);
  bindMat = list.map(({ p, q }) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
}
computeBind();
/** bone-local point -> bind space */
function B(part: PartName, p: V3): V3 {
  const v = v3(p).applyMatrix4(bindMat[PI[part]]);
  return [v.x, v.y, v.z];
}
function Bdir(part: PartName, d: V3): V3 {
  const v = v3(d).applyQuaternion(bindQuat[PI[part]]).normalize();
  return [v.x, v.y, v.z];
}
let HO = rig.HEAD_OFFSET; // head geometry centre (includes the neck tuning)
let HB = rig.HEAD_OFFSET; // head bone origin
/** torso height multiplier */
let BH = 1;
/** torso-local point scaled by the body height */
const ty = (y: number) => y * BH;
/** head scale: big meme-cat head on a tiny body */
export let HS = 0.745;
let TU: Tuning = TUNING_DEFAULTS;
/** build the body without ears (they're tucked inside the helmet) */
let NO_EARS = false;
/** arm-local y stretched by the arm length tuning (pivot at LIMB_TOP stays fixed) */
const AY = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * TU.armLen;
/** arm-local y of the paw centre */
const PAW = () => AY(-0.205);
/** leg-local y stretched by the leg length tuning (hip pivot fixed) */
const LY = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * TU.legH;
/** head-local point -> bind space */
const hd = (x: number, y: number, z: number): V3 => [x * HS, y * HS + HO, z * HS];
const hr = (x: number, y: number, z: number): V3 => [x * HS, y * HS, z * HS];

/* =====================================================================
 *  Signed distance primitives
 * ===================================================================== */
interface Shape {
  t: 0 | 1 | 2; // ellipsoid | round cone | slab
  part: number;
  k: number; // smooth-union radius
  col: THREE.Color;
  cs: number;
  c: V3;
  r: V3;
  a: V3;
  ra: number;
  rb: number;
  ba: V3;
  l2: number;
  rr: number;
  a2: number;
  il2: number;
  sq: number; // z squash (cones) -> flat ears / tufts
  n: V3;
  th: number;
  R: number;
  bc: V3;
  noBounds?: boolean;
  br: number;
}
interface Paint {
  s: Shape;
  col: THREE.Color;
  soft: number;
  alpha: number;
  only: number; // restrict to one body part (-1 = any)
}

function blank(part: PartName, k: number, col: number, cs: number): Shape {
  return {
    t: 0, part: PI[part], k, col: new THREE.Color(col), cs,
    c: [0, 0, 0], r: [1, 1, 1], a: [0, 0, 0], ra: 0, rb: 0, ba: [0, 0, 0], l2: 1, rr: 0, a2: 1, il2: 1, sq: 1,
    n: [0, 1, 0], th: 0, R: 0, bc: [0, 0, 0], br: 0,
  };
}
function ell(part: PartName, c: V3, r: V3, k = 0, col = 0, cs = 0.02): Shape {
  const s = blank(part, k, col, cs);
  s.t = 0;
  s.c = c;
  s.r = r;
  s.bc = c;
  s.br = Math.max(r[0], r[1], r[2]);
  return s;
}
function cone(part: PartName, a: V3, b: V3, ra: number, rb: number, k = 0, col = 0, sq = 1, cs = 0.02): Shape {
  const s = blank(part, k, col, cs);
  const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = Math.max(1e-6, ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]);
  const rr = ra - rb;
  s.t = 1;
  s.a = a;
  s.ra = ra;
  s.rb = rb;
  s.ba = ba;
  s.l2 = l2;
  s.rr = rr;
  s.a2 = l2 - rr * rr;
  s.il2 = 1 / l2;
  s.sq = sq;
  s.bc = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  s.br = Math.sqrt(l2) / 2 + Math.max(ra, rb);
  return s;
}
function slab(c: V3, n: V3, th: number, R: number): Shape {
  const s = blank("torso", 0, 0, 0.02);
  s.t = 2;
  s.c = c;
  s.n = n;
  s.th = th;
  s.R = R;
  s.bc = c;
  s.br = R;
  return s;
}

function shapeDist(s: Shape, x: number, y: number, z: number): number {
  if (s.t === 0) {
    const px = (x - s.c[0]) / s.r[0], py = (y - s.c[1]) / s.r[1], pz = (z - s.c[2]) / s.r[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / s.r[0], qy = py / s.r[1], qz = pz / s.r[2];
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (k1 < 1e-9) return -Math.min(s.r[0], s.r[1], s.r[2]);
    return (k0 * (k0 - 1)) / k1;
  }
  if (s.t === 2) {
    const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2];
    const pl = Math.abs(dx * s.n[0] + dy * s.n[1] + dz * s.n[2]) - s.th;
    return Math.max(pl, Math.sqrt(dx * dx + dy * dy + dz * dz) - s.R);
  }
  // iq's round cone (optionally squashed along z)
  if (s.sq !== 1) z = s.a[2] + (z - s.a[2]) * s.sq;
  const pax = x - s.a[0], pay = y - s.a[1], paz = z - s.a[2];
  const ba = s.ba, l2 = s.l2;
  const yy = pax * ba[0] + pay * ba[1] + paz * ba[2];
  const zz = yy - l2;
  const qx = pax * l2 - ba[0] * yy, qy = pay * l2 - ba[1] * yy, qz = paz * l2 - ba[2] * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(s.rr) * s.rr * s.rr * x2;
  let d: number;
  if (Math.sign(zz) * s.a2 * z2 > k) d = Math.sqrt(x2 + z2) * s.il2 - s.rb;
  else if (Math.sign(yy) * s.a2 * y2 < k) d = Math.sqrt(x2 + y2) * s.il2 - s.ra;
  else d = (Math.sqrt(x2 * s.a2 * s.il2) + yy * s.rr) * s.il2 - s.ra;
  return s.sq !== 1 ? d / s.sq : d;
}

function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function sceneDist(shapes: Shape[], x: number, y: number, z: number) {
  let d = 1e9;
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const dx = x - s.bc[0], dy = y - s.bc[1], dz = z - s.bc[2];
    const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - s.br;
    if (lb > d + s.k) continue;
    d = i === 0 ? shapeDist(s, x, y, z) : smin(d, shapeDist(s, x, y, z), s.k);
  }
  return d;
}

function march(shapes: Shape[], o: THREE.Vector3, dir: THREE.Vector3) {
  const p = o.clone();
  for (let i = 0; i < 240; i++) {
    const d = sceneDist(shapes, p.x, p.y, p.z);
    if (d < 0.0005) break;
    p.addScaledVector(dir, Math.max(d * 0.9, 0.0012));
  }
  const e = 0.002;
  const n = new THREE.Vector3(
    sceneDist(shapes, p.x + e, p.y, p.z) - sceneDist(shapes, p.x - e, p.y, p.z),
    sceneDist(shapes, p.x, p.y + e, p.z) - sceneDist(shapes, p.x, p.y - e, p.z),
    sceneDist(shapes, p.x, p.y, p.z + e) - sceneDist(shapes, p.x, p.y, p.z - e)
  ).normalize();
  return { p, n };
}

/* =====================================================================
 *  Cat builder
 * ===================================================================== */
// short, chubby tail that curls up behind the bum
const TAIL0: V3[] = [
  [0, -0.4, -0.25],
  [0, -0.47, -0.48],
  [0.02, -0.36, -0.66],
  [0.05, -0.15, -0.71],
];
let TAIL: V3[] = TAIL0;
const TAIL_R = [0.12, 0.128, 0.128, 0.122];

interface FaceStroke {
  x: number; // frame centre (head-local, unscaled, front view)
  y: number;
  pts: [number, number][]; // relative to frame centre
  w0: number;
  w1: number;
  col: number;
}

class Cat {
  shapes: Shape[] = [];
  arms: Shape[] = [];
  paints: Paint[] = [];
  faceStrokes: FaceStroke[] = [];
  fur: number;
  constructor(fur: number) {
    this.fur = fur;
    this.base();
  }
  add(s: Shape) {
    s.col.setHex(this.fur);
    this.shapes.push(s);
  }
  paint(s: Shape, col: number, soft = 0.013, alpha = 1, only = -1) {
    this.paints.push({ s, col: new THREE.Color(col), soft, alpha, only });
  }
  of(part: PartName) {
    return this.shapes.filter((s) => s.part === PI[part]);
  }
  hit(part: PartName, o: V3, d: V3): V3 {
    const { p } = march(this.of(part), v3(o), v3(d).normalize());
    return [p.x, p.y, p.z];
  }
  headAt(a: number, y: number): V3 {
    const r = (a * Math.PI) / 180;
    return this.hit("head", hd(Math.sin(r) * 2, y, Math.cos(r) * 2), [-Math.sin(r), 0, -Math.cos(r)]);
  }
  bodyAt(a: number, y: number): V3 {
    const r = (a * Math.PI) / 180;
    return this.hit("torso", [Math.sin(r) * 2, y, Math.cos(r) * 2], [-Math.sin(r), 0, -Math.cos(r)]);
  }
  stroke(pts: V3[], r0: number, r1: number, col: number, soft = 0.011) {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const ra = r0 + ((r1 - r0) * i) / n;
      const rb = r0 + ((r1 - r0) * (i + 1)) / n;
      this.paint(cone("torso", pts[i], pts[i + 1], ra, rb), col, soft);
    }
  }

  private base() {
    const T = TU;
    const bt = T.bodyTop, bb = T.bodyBottom;
    const ny = T.noseY, ns = 0.65 + 0.35 * T.noseSize;
    const fat = T.belly;
    const mk = T.mouth;
    // ---- plush bean body: pear shape, the top part can be made really narrow ----
    this.add(ell("torso", [0, ty(-0.2), 0.0], [0.4 * bb, ty(0.38) * (0.7 + 0.3 * bb), 0.33 * bb]));
    this.add(ell("torso", [0, ty(0.14), 0.0], [0.33 * bt, ty(0.34) * (0.65 + 0.35 * bt), 0.27 * (0.5 + 0.5 * bt)], 0.26));
    // round pot belly (fatness adjustable)
    this.add(ell("torso", [0, ty(-0.14), 0.08 + 0.07 * (fat - 1)], [0.3 * bb * (0.85 + 0.15 * fat), ty(0.33) * (0.85 + 0.15 * fat), 0.28 * fat], 0.18));
    // ---- small, round, full head sitting right on the shoulders ----
    this.add(ell("head", hd(0, 0.02, -0.01), hr(0.56, 0.5, 0.5), 0.26));
    // smooth, full back of the head (rounded occiput) that flows into the nape
    this.add(ell("head", hd(0, -0.06, -0.1), hr(0.47, 0.42, 0.4), 0.22));
    // nape skirt: part of the rigid head, tucks down into the body so the back of the head flows into it
    const nape = ell("head", hd(0, -0.4, -0.12), hr(0.33, 0.32, 0.28), 0.2);
    nape.noBounds = true;
    this.add(nape);
    void bt;
    // lower head: chubby cheeks + a soft chin fill (adjustable "Kepala bawah")
    const j = T.jaw;
    for (const s of [1, -1]) {
      this.add(ell("head", hd(s * 0.24 * (0.8 + 0.2 * j), -0.15 - 0.035 * (j - 1), 0.06), hr(0.31 * (0.75 + 0.25 * j), 0.27 * j, 0.3 * (0.8 + 0.2 * j)), 0.22));
    }
    this.add(ell("head", hd(0, -0.18 - 0.05 * (j - 1), 0.04), hr(0.3 * j, 0.2 * j, 0.28 * (0.85 + 0.15 * j)), 0.24));
    // big puffy "ω" muzzle (two lobes sized from the mouth)
    const rM = 0.036 * (0.6 + 0.4 * T.noseSize) * mk;
    for (const s of [1, -1]) {
      this.add(ell("head", hd(s * rM * 1.12, -0.2 + ny - 0.03 * (mk - 1), 0.33), hr(rM * 1.38, rM * 1.08, 0.09 * (0.7 + 0.3 * mk)), 0.05));
    }
    void ns;
    if (!NO_EARS) this.ears();
    // ---- arms: rounded, mitten paw (tight blend: no "bat wing" webbing) ----
    const ar = T.armRoot, at = T.armTip;
    // arms are separate rigid pieces with a ball joint buried in the shoulder:
    // rotating around the pivot never stretches the body skin (no flaps / "gelambir")
    for (const a of ["armL", "armR"] as const) {
      const rRoot = 0.088 * ar;
      const ball = cone(a, B(a, [0, rig.LIMB_TOP[1], 0]), B(a, [0, rig.LIMB_TOP[1] - 0.001, 0]), rRoot, rRoot, 0);
      ball.col.setHex(this.fur);
      this.arms.push(ball);
      const sh = cone(a, B(a, [0, rig.LIMB_TOP[1], 0]), B(a, [0, AY(-0.15), 0]), rRoot, 0.095 * (0.45 * ar + 0.55 * at), 0.06);
      sh.col.setHex(this.fur);
      this.arms.push(sh);
      const paw = ell(a, B(a, [0, PAW(), 0.01]), [0.112 * at, 0.105 * at, 0.11 * at], 0.045);
      paw.col.setHex(this.fur);
      this.arms.push(paw);
    }
    // ---- short stubby legs with round feet ----
    const lr = T.legRoot, lt = T.legTip;
    for (const l of ["legL", "legR"] as const) {
      this.add(cone(l, B(l, [0, 0.08, 0]), B(l, [0, LY(-0.17), 0.02]), 0.14 * lr, 0.135 * (0.5 * lr + 0.5 * lt), 0.08));
      this.add(ell(l, B(l, [0, LY(-0.25), 0.06]), [0.145 * lt, 0.1 * (0.7 + 0.3 * lt), 0.175 * lt], 0.06));
    }
    // ---- tail ----
    for (let i = 0; i < TAIL.length - 1; i++) this.add(cone("torso", TAIL[i], TAIL[i + 1], TAIL_R[i], TAIL_R[i + 1], i === 0 ? 0.08 : 0.04));
  }

  /** big cute triangle ears (wide base, softly rounded tip, tilted out) like the tuxedo plush */
  private earGeo(s: number, grow = 0) {
    const e = TU.ear;
    const base = hd(s * (0.28 - grow * 0.3), 0.25 - grow, -0.05);
    const tip = hd(s * (0.28 + 0.2 * e), 0.25 + 0.52 * e + grow * 0.6, -0.07);
    return { base, tip, ra: (0.25 + grow) * HS * e, rb: (0.065 + grow * 0.6) * HS * e };
  }
  private ears() {
    for (const s of [1, -1]) {
      const g = this.earGeo(s);
      this.add(cone("head", g.base, g.tip, g.ra, g.rb, 0.07, 0, 2.9));
    }
  }

  // ---------- pattern helpers ----------
  innerEars(colL: number, colR = colL) {
    const e = TU.ear;
    for (const s of [1, -1]) {
      const a = hd(s * (0.3 + 0.02 * e), 0.31 + 0.06 * e, 0.07);
      const b = hd(s * (0.3 + 0.16 * e), 0.29 + 0.39 * e, 0.03);
      this.paint(cone("head", a, b, 0.14 * HS * e, 0.035 * HS * e), s > 0 ? colL : colR, 0.008);
    }
  }
  ear(side: 1 | -1, col: number) {
    const g = this.earGeo(side, 0.05);
    this.paint(cone("head", g.base, g.tip, g.ra, g.rb), col, 0.012);
  }
  /** white "moustache" muzzle: two round lobes + chin, with a dark notch above (tuxedo plush) */
  muzzle(col = WHITE, notch?: number, wide = 1) {
    const ny = TU.noseY, mk = TU.mouth;
    const rM = 0.036 * (0.6 + 0.4 * TU.noseSize) * mk;
    const py = -0.2 + ny - 0.03 * (mk - 1);
    const H = PI.head;
    const w = wide;
    for (const s of [1, -1])
      this.paint(ell("head", hd(s * rM * 1.12 * w, py, 0.25), hr(rM * 1.6 * w, rM * 1.3 * (0.6 + 0.4 * w), 0.4)), col, 0.007, 1, H);
    this.paint(ell("head", hd(0, py - rM * 0.9, 0.22), hr(rM * 1.5 * w, rM, 0.4)), col, 0.007, 1, H);
    if (notch !== undefined) this.paint(ell("head", hd(0, py + rM * 0.95, 0.3), hr(rM * 0.6, rM * 0.95, 0.35)), notch, 0.007, 1, H);
  }
  blush(col = 0xf7a3b6) {
    for (const s of [1, -1]) this.paint(ell("head", hd(s * 0.33, -0.15, 0.36), hr(0.085, 0.055, 0.14)), col, 0.03, 0.85);
  }
  /** white mittens (forearm end) + socks with toe lines */
  paws(col: number, soft = 0.008) {
    const at = TU.armTip, lt = TU.legTip;
    for (const a of ["armL", "armR"] as const) this.paint(ell("torso", B(a, [0, PAW() - 0.025 * at, 0.0]), [0.17 * at, 0.13 * at, 0.17 * at]), col, soft);
    for (const l of ["legL", "legR"] as const) this.paint(ell("torso", B(l, [0, LY(-0.25), 0.07]), [0.22 * lt, 0.13, 0.26 * lt]), col, soft);
    this.toes(new THREE.Color(col).multiplyScalar(0.78).lerp(new THREE.Color(0xe39aae), 0.45).getHex());
  }
  /** little toe grooves on the front of the feet */
  toes(col: number) {
    const lt = TU.legTip;
    for (const l of ["legL", "legR"] as const) {
      for (const dx of [-0.05, 0, 0.05]) {
        this.paint(slab(B(l, [dx * lt, LY(-0.31), 0.2 * lt]), [1, 0, 0], 0.0055, 0.06), col, 0.004);
      }
    }
  }
  /** pink toe beans on the paw palms: one big pad + three little beans */
  pads(col = 0xf4a3b5) {
    const at = TU.armTip;
    for (const a of ["armL", "armR"] as const) {
      const pc = PAW();
      this.paint(ell("torso", B(a, [0, pc + 0.005 * at, 0.1 * at]), [0.048 * at, 0.042 * at, 0.05]), col, 0.006);
      for (const [dx, dy] of [
        [-0.05, -0.265],
        [0, -0.285],
        [0.05, -0.265],
      ]) {
        this.paint(ell("torso", B(a, [dx * at, pc + (dy + 0.205) * at, 0.075 * at]), [0.024 * at, 0.024 * at, 0.05]), col, 0.005);
      }
    }
  }
  /** big oval belly */
  belly(col: number) {
    const bb = TU.bodyBottom;
    const fat = TU.belly;
    this.paint(ell("torso", [0, ty(-0.11), 0.32 + 0.1 * (fat - 1)], [0.255 * bb * (0.85 + 0.15 * fat), ty(0.38), 0.24]), col, 0.008, 1, PI.torso);
  }
  /** tuxedo bib from the chin down */
  bib(col: number) {
    const bb = TU.bodyBottom;
    this.paint(ell("torso", [0, ty(-0.05), 0.27 + 0.1 * (TU.belly - 1)], [0.235 * bb, ty(0.44), 0.26]), col, 0.008, 1, PI.torso);
  }
  tailColor(col: number, from = 0) {
    for (let i = from; i < TAIL.length - 1; i++) {
      this.paint(cone("torso", TAIL[i], TAIL[i + 1], TAIL_R[i] + 0.04, TAIL_R[i + 1] + 0.04), col, 0.012);
    }
  }
  tailBands(col: number, n = 5) {
    const total = TAIL.length - 1;
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.7) / (n + 0.3)) * total;
      const i = Math.min(total - 1, Math.floor(t));
      const f = t - i;
      const a = TAIL[i], b = TAIL[i + 1];
      const c: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      const d = v3(b).sub(v3(a)).normalize();
      this.paint(slab(c, [d.x, d.y, d.z], 0.032, 0.17), col, 0.01);
    }
  }
  limbBands(col: number) {
    for (const a of ["armL", "armR"] as const) {
      this.paint(slab(B(a, [0, AY(-0.02), 0]), Bdir(a, [0, 1, 0]), 0.024, 0.2), col, 0.01);
    }
    for (const l of ["legL", "legR"] as const) this.paint(slab(B(l, [0, LY(0.03), 0]), [0, 1, 0], 0.024, 0.21), col, 0.01);
  }
  /** tabby like the crayon cat: 3 forehead stripes, cheek stripes, body stripes */
  tabby(col: number, w = 1) {
    this.faceStrokes.push(
      { x: 0, y: 0.32, pts: [[0, -0.07], [0, 0.03], [0, 0.13]], w0: 0.02 * w, w1: 0.05 * w, col },
      { x: 0, y: 0.32, pts: [[0.1, -0.05], [0.115, 0.04], [0.13, 0.12]], w0: 0.016 * w, w1: 0.044 * w, col },
      { x: 0, y: 0.32, pts: [[-0.1, -0.05], [-0.115, 0.04], [-0.13, 0.12]], w0: 0.016 * w, w1: 0.044 * w, col },
    );
    for (const s of [1, -1]) {
      this.faceStrokes.push(
        { x: s * 0.46, y: -0.05, pts: [[s * 0.09, 0.05], [s * 0.01, 0.045], [-s * 0.05, 0.035]], w0: 0.034 * w, w1: 0.012 * w, col },
        { x: s * 0.46, y: -0.05, pts: [[s * 0.09, -0.04], [s * 0.01, -0.045], [-s * 0.04, -0.055]], w0: 0.03 * w, w1: 0.012 * w, col },
      );
    }
    const st = (pts: V3[], r0 = 0.04 * w, r1 = 0.015 * w) => this.stroke(pts, r0, r1, col);
    for (const s of [1, -1]) {
      for (const y of [ty(0.2), ty(-0.04), ty(-0.28)]) {
        st([this.bodyAt(s * 62, y), this.bodyAt(s * 98, y - 0.02), this.bodyAt(s * 135, y), this.bodyAt(s * 170, y + 0.02)]);
      }
    }
    for (const a of [-30, 0, 30]) {
      st([this.headAt(180 + a, -0.1), this.headAt(180 + a * 0.8, 0.12), this.headAt(180 + a * 0.6, 0.32)], 0.04 * w, 0.014 * w);
    }
    this.limbBands(col);
    this.tailBands(col, 3);
  }
}

/* =====================================================================
 *  The 11 cats (cute plush style, references: crayon tabby + tuxedo/brown plushies)
 * ===================================================================== */
interface Recipe {
  shapes: Shape[];
  arms: Shape[];
  paints: Paint[];
  faceStrokes: FaceStroke[];
  /** puppy = big black eye + colour crescent + sparkle, big = huge iris + big pupil, pill = black capsule */
  eye: "puppy" | "big" | "pill";
  iris: number;
  px: number; // pupil offset (-1..1, + = viewer's right)
  py: number;
  cross: number; // pupils looking toward the nose
  lid: number; // 0..0.4, flat cut on the inner-top of "big" eyes (determined look)
  tilt: number;
  nose: number;
  line: number;
  mouthCol?: number;
  whisker: number;
  noMouth?: boolean;
}

const BLACK = 0x1e1e23;
const WHITE = 0xfaf8f4;
const PINK_EAR = 0xf4b2c0;
const DARK_EAR = 0x2c2a4a;

function recipeFor(id: AnimalId): Recipe {
  type R = Omit<Recipe, "shapes" | "arms" | "paints" | "faceStrokes" | "px" | "py" | "cross" | "lid" | "tilt"> & Partial<Recipe>;
  const done = (c: Cat, r: R, pad = 0xf4a3b5): Recipe => {
    c.pads(pad);
    return { px: 0, py: 0, cross: 0, lid: 0, tilt: 0, ...r, shapes: c.shapes, arms: c.arms, paints: c.paints, faceStrokes: c.faceStrokes };
  };
  switch (id) {
    case "oyen": {
      // the crayon cat: orange tabby, white muzzle/belly/paws, huge green eyes
      const c = new Cat(0xf0a24a);
      c.tabby(0xc8641f, 1.05);
      c.muzzle();
      c.belly(WHITE);
      c.paws(WHITE);
      c.innerEars(PINK_EAR);
      return done(c, {
        eye: "big", iris: 0xc6e79a, cross: 0.35, py: 0.25, lid: 0.12, tilt: 0.3,
        nose: 0xf28a9a, line: 0x4a2a17, whisker: 0x5a3a26,
      });
    }
    case "oreo": {
      // tuxedo plush, pattern copied from the reference: black body, white moustache muzzle with
      // a black notch, pale-blue collar, big oval white bib, white mittens with pink beans, white socks
      const c = new Cat(BLACK);
      c.muzzle(WHITE, BLACK, 1.45);
      c.bib(WHITE);
      c.paint(slab([0, ty(0.235), 0.25], [0, 1, 0], 0.035, 0.32), 0xc6dde3, 0.008, 1, PI.torso);
      c.paws(WHITE);
      c.innerEars(DARK_EAR);
      return done(c, { eye: "puppy", iris: 0xb5e3b0, nose: BLACK, line: BLACK, whisker: 0xffffff, noMouth: true });
    }
    case "moka": {
      // brown plush with white blaze, happy pill eyes and blush
      const c = new Cat(0xa87b5d);
      c.faceStrokes.push({ x: 0, y: 0.22, pts: [[0, -0.08], [0, 0.1], [0, 0.26]], w0: 0.15, w1: 0.2, col: 0xf6f0ea });
      c.paint(ell("head", hd(0, -0.2, 0.25), hr(0.4, 0.2, 0.35)), 0xf6f0ea, 0.01);
      c.blush();
      c.belly(0xf1edf6);
      c.paws(0xf1edf6);
      c.innerEars(0xf2a3bb);
      return done(c, { eye: "pill", iris: 0, nose: 0xec97ab, line: 0xe07d95, mouthCol: 0xe07d95, whisker: 0xf6f0ea });
    }
    case "mochi": {
      const c = new Cat(WHITE);
      c.paint(ell("head", hd(0.27, 0.16, 0.2), hr(0.3, 0.3, 0.42)), BLACK, 0.012);
      c.ear(1, BLACK);
      c.paint(ell("torso", [-0.17, ty(0.1), -0.34], [0.2, ty(0.2), 0.2]), BLACK, 0.012);
      c.tailColor(BLACK, 1);
      c.blush();
      c.innerEars(DARK_EAR, PINK_EAR);
      return done(c, { eye: "puppy", iris: 0x8cc8f0, nose: 0xf28a9a, line: 0x3c3c44, whisker: 0xb8b8c2 });
    }
    case "siam": {
      const BR = 0x4a3428;
      const c = new Cat(0xf3ebdc);
      c.paint(ell("head", hd(0, -0.08, 0.3), hr(0.42, 0.38, 0.36)), BR, 0.02);
      c.ear(1, BR);
      c.ear(-1, BR);
      c.paws(BR, 0.02);
      c.tailColor(BR, 1);
      c.innerEars(0x6e4e3e);
      return done(c, {
        eye: "big", iris: 0x8fc9f2, cross: 0.15, py: 0.15, lid: 0.06, tilt: 0.2,
        nose: 0x1d140f, line: 0x170f0b, whisker: 0xf3ebdc,
      }, 0x8a5a55);
    }
    case "item": {
      const c = new Cat(BLACK);
      c.innerEars(DARK_EAR);
      return done(c, { eye: "puppy", iris: 0xf3c64a, nose: 0x5e5866, line: 0x8e8b99, whisker: 0xe2e2ea }, 0x9a6876);
    }
    case "loreng": {
      const c = new Cat(0xc9a676);
      c.tabby(0x3a2a1d, 1.15);
      c.muzzle(0xf3e7d2);
      c.belly(0xf3e7d2);
      c.paws(0xf3e7d2);
      c.innerEars(0xe8b897);
      return done(c, {
        eye: "big", iris: 0xdbe07a, cross: 0.3, py: 0.2, lid: 0.16, tilt: 0.34,
        nose: 0xd4787a, line: 0x2a1d14, whisker: 0x2a1d14,
      });
    }
    case "telon": {
      const OR = 0xef9d43;
      const c = new Cat(WHITE);
      c.paint(ell("head", hd(-0.3, 0.34, 0.0), hr(0.34, 0.3, 0.5)), OR, 0.012);
      c.ear(-1, OR);
      c.paint(ell("head", hd(0.32, 0.14, 0.18), hr(0.28, 0.28, 0.45)), BLACK, 0.012);
      c.ear(1, BLACK);
      c.paint(ell("torso", [-0.3, ty(0.0), -0.2], [0.24, ty(0.3), 0.3]), OR, 0.012);
      c.paint(ell("torso", [0.3, ty(-0.3), -0.22], [0.22, ty(0.22), 0.25]), BLACK, 0.012);
      c.tailColor(OR, 1);
      c.tailBands(BLACK, 3);
      c.blush();
      c.innerEars(DARK_EAR, PINK_EAR);
      return done(c, { eye: "pill", iris: 0, nose: 0xf28a9a, line: 0x3c3c44, mouthCol: 0xe07d95, whisker: 0xb8b8c2 });
    }
    case "abu": {
      const c = new Cat(0xb9b9c0);
      c.tabby(0x55555f, 1.05);
      c.muzzle();
      c.belly(WHITE);
      c.paws(WHITE);
      c.innerEars(PINK_EAR);
      return done(c, { eye: "puppy", iris: 0x9fd2f2, nose: 0xe68fa0, line: 0x2e2e36, whisker: 0x3a3a42 });
    }
    case "garong": {
      const c = new Cat(0x6e6f78);
      c.muzzle();
      c.faceStrokes.push({ x: 0, y: 0.06, pts: [[0, -0.12], [0, 0.0], [0, 0.16]], w0: 0.1, w1: 0.03, col: WHITE });
      c.bib(WHITE);
      c.paws(WHITE);
      c.innerEars(PINK_EAR);
      return done(c, {
        eye: "big", iris: 0xf6c33c, cross: 0.2, py: 0.1, lid: 0.22, tilt: 0.42,
        nose: 0xeaa0a8, line: 0x2b2b31, whisker: 0xd8d8e0,
      });
    }
    case "mendung":
    default: {
      const c = new Cat(0x4b4e5b);
      c.muzzle(0xd9dae2);
      c.innerEars(0x8a7a92);
      return done(c, { eye: "puppy", iris: 0xf0b84a, nose: 0x2c2e37, line: 0x23242b, whisker: 0xdcdde6 }, 0x9a7b86);
    }
  }
}

/* =====================================================================
 *  Colour evaluation
 * ===================================================================== */
const _tc = new THREE.Color();
function applyPaints(paints: Paint[], x: number, y: number, z: number, col: THREE.Color, part = -1) {
  for (const p of paints) {
    if (p.alpha <= 0) continue;
    if (p.only >= 0 && part >= 0 && p.only !== part) continue;
    const d = shapeDist(p.s, x, y, z);
    if (d > p.soft) continue;
    const t = THREE.MathUtils.smoothstep(d, -p.soft, p.soft);
    const a = (1 - t) * p.alpha;
    if (a <= 0.001) continue;
    col.lerp(_tc.copy(p.col), a);
  }
}
function colorAt(rec: Recipe, p: THREE.Vector3, out: THREE.Color) {
  let wsum = 0;
  out.setRGB(0, 0, 0);
  for (const s of rec.shapes) {
    const w = Math.exp(-Math.max(shapeDist(s, p.x, p.y, p.z), 0) / s.cs);
    wsum += w;
    out.r += s.col.r * w;
    out.g += s.col.g * w;
    out.b += s.col.b * w;
  }
  if (wsum > 0) out.multiplyScalar(1 / wsum);
  applyPaints(rec.paints, p.x, p.y, p.z, out);
  return out;
}

/* =====================================================================
 *  Mesh generation (marching cubes over the blended SDF) + skinning
 * ===================================================================== */
interface Asset {
  armGeometry: THREE.BufferGeometry;
  bindPos: THREE.Vector3[];
  bindQuat: THREE.Quaternion[];
  geometry: THREE.BufferGeometry;
  boneInverses: THREE.Matrix4[];
  recipe: Recipe;
}
const assetCache = new Map<string, Asset>();
/** neck skin split (bind-space height centre + half band), set per build */
const neckSplit = { c: 0.2, b: 0.07 };

export const SKIN_MATERIAL = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.75,
  metalness: 0,
  sheen: 0.7,
  sheenRoughness: 0.55,
  sheenColor: new THREE.Color(0xffffff),
});

function getAsset(def: AnimalDef, noEars = false): Asset {
  const T = getTuning();
  TU = T;
  HS = 0.745 * T.head;
  rig.applyRig(T);
  computeBind();
  BH = T.bodyH;
  TAIL = TAIL0.map((p) => [p[0], p[1] * BH, p[2]] as V3);
  HB = rig.HEAD_OFFSET;
  HO = rig.HEAD_OFFSET + T.neck;
  const cacheKey = `${def.id}${noEars ? "~ne" : ""}#${tuningKey(T)}`;
  const cached = assetCache.get(cacheKey);
  if (cached) return cached;
  NO_EARS = noEars;
  const recipe = recipeFor(def.id);
  NO_EARS = false;
  const { paints } = recipe;
  const buildGeo = (shapes: Shape[], rigid: "arms" | "head" | null) => {
  const sdf = (x: number, y: number, z: number) => sceneDist(shapes, x, y, z);

  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const s of shapes)
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], s.bc[i] - s.br);
      mx[i] = Math.max(mx[i], s.bc[i] + s.br);
    }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 + 0.1;
  const res = Math.min(112, Math.max(60, Math.ceil((2 * ext) / 0.026)));

  const mc = new MarchingCubes(res, SKIN_MATERIAL, false, false, 90000);
  mc.isolation = 0;
  const hs = res / 2;
  const field = mc.field as Float32Array;
  const cell = ext / hs;
  const W = (i: number, c: number) => center[c] + ((i - hs) / hs) * ext;
  const STEP = 4;
  const cr = Math.ceil((res - 1) / STEP) + 1;
  const coarse = new Float32Array(cr * cr * cr);
  for (let z = 0; z < cr; z++)
    for (let y = 0; y < cr; y++)
      for (let x = 0; x < cr; x++) coarse[z * cr * cr + y * cr + x] = sdf(W(x * STEP, 0), W(y * STEP, 1), W(z * STEP, 2));
  const safe = cell * (STEP * 0.87 + 2.5);
  for (let z = 0; z < res; z++) {
    const wz = W(z, 2);
    const cz = Math.min(cr - 1, Math.round(z / STEP));
    for (let y = 0; y < res; y++) {
      const wy = W(y, 1);
      const cy = Math.min(cr - 1, Math.round(y / STEP));
      const off = z * res * res + y * res;
      for (let x = 0; x < res; x++) {
        const cx = Math.min(cr - 1, Math.round(x / STEP));
        const dc = coarse[cz * cr * cr + cy * cr + cx];
        field[off + x] = Math.abs(dc) > safe ? -dc : -sdf(W(x, 0), wy, wz);
      }
    }
  }
  mc.update();
  const count = mc.count as number;
  const raw = new Float32Array(count * 3);
  const pa = mc.positionArray as Float32Array;
  for (let i = 0; i < count; i++) {
    raw[i * 3] = center[0] + pa[i * 3] * ext;
    raw[i * 3 + 1] = center[1] + pa[i * 3 + 1] * ext;
    raw[i * 3 + 2] = center[2] + pa[i * 3 + 2] * ext;
  }
  mc.geometry.dispose();
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(raw, 3));
  geo = mergeVertices(geo, 1e-4);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const n = pos.count;

  const normals = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const e = 0.0025;
  const col = new THREE.Color();
  const partD = new Float64Array(6);
  const _w6 = new Float64Array(6);
  // shoulder / hip joints in bind space: pivot, limb axis (pointing down the limb), radii
  const JOINTS = (["legL", "legR"] as const).map((part) => {
    const arm = false;
    const piv = part === "legL" ? rig.HIP_L : rig.HIP_R;
    const d = Bdir(part, [0, -1, 0]);
    return {
      part: PI[part],
      p: new THREE.Vector3(piv[0], piv[1], piv[2]),
      d: new THREE.Vector3(d[0], d[1], d[2]),
      r: arm ? 0.088 * (0.55 + 0.45 * TU.armRoot) : 0.14 * TU.legRoot,
      band: arm ? 0.085 : 0.1,
      reach: arm ? 0.3 : 0.32,
      cap: arm ? 0.19 : 0.2,
      share: arm ? 0.5 : 0.35,
    };
  });
  const pw: { i: number; w: number }[] = PARTS.map((_, i) => ({ i, w: 0 }));

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let nx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let ny = sdf(x, y + e, z) - sdf(x, y - e, z);
    let nz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;

    partD.fill(1e9);
    let wsum = 0;
    col.setRGB(0, 0, 0);
    for (const s of shapes) {
      const d = shapeDist(s, x, y, z);
      if (d < partD[s.part]) partD[s.part] = d;
      const w = Math.exp(-Math.max(d, 0) / s.cs);
      if (w < 1e-6) continue;
      wsum += w;
      col.r += s.col.r * w;
      col.g += s.col.g * w;
      col.b += s.col.b * w;
    }
    if (wsum > 0) col.multiplyScalar(1 / wsum);
    let dom = 0;
    for (let q = 1; q < 6; q++) if (partD[q] < partD[dom]) dom = q;
    applyPaints(paints, x, y, z, col, dom);
    const ao = THREE.MathUtils.clamp(sdf(x + nx * 0.06, y + ny * 0.06, z + nz * 0.06) / 0.06, 0.5, 1);
    col.multiplyScalar(0.9 + 0.1 * ao);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    for (let p = 0; p < 6; p++) {
      pw[p].i = p;
      pw[p].w = Math.exp(-Math.max(partD[p], 0) / 0.022);
    }
    pw.sort((a, b) => b.w - a.w);
    if (rigid) {
      const part = rigid === "head" ? PI.head : partD[PI.armL] <= partD[PI.armR] ? PI.armL : PI.armR;
      skinIndex.set([part, 0, 0, 0], i * 4);
      skinWeight.set([1, 0, 0, 0], i * 4);
      continue;
    }
    // ---- joint-aware weights at shoulders & hips (continuous field -> no tearing):
    // inside each joint region the torso+limb share is re-split by a smooth function of the
    // position along / around the limb axis, so the skin bends around the pivot.
    const W6 = _w6;
    W6.fill(0);
    {
      let tw = 0;
      for (let p = 0; p < 6; p++) {
        const w = Math.exp(-Math.max(partD[p], 0) / 0.022);
        W6[p] = w;
        tw += w;
      }
      for (let p = 0; p < 6; p++) W6[p] /= tw;
    }
    for (const J of JOINTS) {
      const rx = x - J.p.x, ry = y - J.p.y, rz = z - J.p.z;
      const dist = Math.hypot(rx, ry, rz);
      if (dist > J.reach) continue;
      const m = W6[J.part] + W6[PI.torso];
      if (m < 1e-4) continue;
      const tt = rx * J.d.x + ry * J.d.y + rz * J.d.z;
      const perp = Math.hypot(rx - J.d.x * tt, ry - J.d.y * tt, rz - J.d.z * tt);
      const along = THREE.MathUtils.smoothstep(tt, -J.band * 0.5, J.band);
      const radial = 1 - THREE.MathUtils.smoothstep(perp, J.r * 1.0, J.r * 1.4);
      const wj = along * radial;
      const g = 1 - THREE.MathUtils.smoothstep(dist, J.reach * 0.65, J.reach);
      const cur = W6[J.part] / m;
      const share = g * wj + (1 - g) * cur;
      W6[J.part] = m * share;
      W6[PI.torso] = m * (1 - share);
    }
    // ---- neck: clean height-based head/torso split (smooth band, never tears or twists oddly) ----
    {
      const m = W6[PI.head] + W6[PI.torso];
      if (m > 1e-4) {
        const share = THREE.MathUtils.smoothstep(y, neckSplit.c - neckSplit.b, neckSplit.c + neckSplit.b);
        W6[PI.head] = m * share;
        W6[PI.torso] = m * (1 - share);
      }
    }
    for (let p = 0; p < 6; p++) {
      pw[p].i = p;
      pw[p].w = W6[p];
    }
    pw.sort((a, b) => b.w - a.w);
    let tot = 0;
    for (let k = 0; k < 4; k++) if (pw[k].w >= 0.004 || k === 0) tot += pw[k].w;
    for (let k = 0; k < 4; k++) {
      const ok = pw[k].w >= 0.004 || k === 0;
      skinIndex[i * 4 + k] = pw[k].i;
      skinWeight[i * 4 + k] = ok ? pw[k].w / tot : 0;
    }
  }

  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));

  const idx = geo.getIndex()!;
  let facing = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    facing += b.x * normals[i0 * 3] + b.y * normals[i0 * 3 + 1] + b.z * normals[i0 * 3 + 2];
  }
  if (facing < 0) {
    const arr = idx.array as Uint32Array | Uint16Array;
    for (let t = 0; t < arr.length; t += 3) {
      const tmpI = arr[t + 1];
      arr[t + 1] = arr[t + 2];
      arr[t + 2] = tmpI;
    }
    idx.needsUpdate = true;
  }
  geo.computeBoundingSphere();
    return geo;
  };
  // body + head are ONE smooth surface (the head melts into the shoulders); the skin is split
  // between the head and torso bones by a soft band around the neck. Arms stay rigid pieces.
  const headShapes = recipe.shapes.filter((sh) => sh.part === PI.head && !sh.noBounds);
  const chinY = march(headShapes, new THREE.Vector3(0, HO - 1.5, 0.12 * HS), new THREE.Vector3(0, 1, 0)).p.y;
  const pivotY = rig.NECK_A[1];
  // the split never goes below the neck pivot, so the chest always follows the torso
  neckSplit.c = Math.max(pivotY + 0.03, (pivotY + chinY) / 2);
  const sunk = chinY < pivotY + 0.06;
  neckSplit.b = Math.min(0.13, Math.max(sunk ? 0.11 : 0.06, (chinY - pivotY) / 2 + 0.03));
  const geometry = buildGeo(recipe.shapes, null);
  const armGeometry = buildGeo(recipe.arms, "arms");

  const asset: Asset = { bindPos: bindPos.map((v) => v.clone()), bindQuat: bindQuat.map((q) => q.clone()), geometry, armGeometry, boneInverses: bindMat.map((m) => m.clone().invert()), recipe };
  for (const k of [...assetCache.keys()]) if (!k.endsWith(cacheKey.slice(cacheKey.indexOf("#")))) assetCache.delete(k);
  assetCache.set(cacheKey, asset);
  return asset;
}

/* =====================================================================
 *  Face features: flat 2D decals projected onto the skin (poster style)
 * ===================================================================== */
type Vec2 = [number, number];
type Tri2 = [Vec2, Vec2, Vec2];
const _up = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);
const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// ---------- 2D geometry helpers ----------
function area2(p: Vec2[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}
const ccw = (p: Vec2[]) => (area2(p) < 0 ? p.slice().reverse() : p);
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 28): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}
/** keep the part of `poly` where f(x, y) <= 0 (f linear) */
function clipHalf(poly: Vec2[], f: (x: number, y: number) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a[0], a[1]), fb = f(b[0], b[1]);
    if (fa <= 0) out.push(a);
    if ((fa <= 0) !== (fb <= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function clipConvex(poly: Vec2[], clip: Vec2[]): Vec2[] {
  let out = poly;
  const c = ccw(clip);
  for (let i = 0; i < c.length && out.length; i++) {
    const p = c[i], q = c[(i + 1) % c.length];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    out = clipHalf(out, (x, y) => -(ex * (y - p[1]) - ey * (x - p[0])));
  }
  return out;
}
function polyTris(poly: Vec2[]): Tri2[] {
  if (poly.length < 3 || Math.abs(area2(poly)) < 1e-7) return [];
  const contour = ccw(poly).map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  return faces.map((f) => f.map((i) => [contour[i].x, contour[i].y] as Vec2) as Tri2);
}
function strokeTris(pts: Vec2[], w0: number, w1: number, caps = true): Tri2[] {
  const n = pts.length;
  const L: Vec2[] = [], R: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const w = (w0 + ((w1 - w0) * i) / (n - 1)) / 2;
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  const out: Tri2[] = [];
  for (let i = 0; i < n - 1; i++) {
    out.push([L[i], R[i], L[i + 1]], [R[i], R[i + 1], L[i + 1]]);
  }
  if (caps) {
    if (w0 > 0.006) out.push(...polyTris(ellipse(pts[0][0], pts[0][1], w0 / 2, w0 / 2, 12)));
    if (w1 > 0.006) out.push(...polyTris(ellipse(pts[n - 1][0], pts[n - 1][1], w1 / 2, w1 / 2, 12)));
  }
  return out;
}
function curve(n: number, fn: (t: number) => Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(fn(i / n));
  return out;
}
function roundedTri(c0: Vec2, c1: Vec2, c2: Vec2, n = 7): Vec2[] {
  const C = [c0, c1, c2];
  const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const out: Vec2[] = [];
  for (let k = 0; k < 3; k++) {
    const p0 = mid(C[(k + 2) % 3], C[k]), p1 = C[k], p2 = mid(C[k], C[(k + 1) % 3]);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
    }
  }
  return out;
}
function subdivide(tris: Tri2[], maxLen: number): Tri2[] {
  const out: Tri2[] = [];
  const stack = tris.slice();
  let guard = 0;
  while (stack.length && guard++ < 200000) {
    const t = stack.pop()!;
    const l = [0, 1, 2].map((i) => Math.hypot(t[i][0] - t[(i + 1) % 3][0], t[i][1] - t[(i + 1) % 3][1]));
    const k = l.indexOf(Math.max(...l));
    if (l[k] <= maxLen) {
      out.push(t);
      continue;
    }
    const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
    const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    stack.push([a, m, c], [m, b, c]);
  }
  return out;
}

// ---------- projection onto the SDF surface ----------
interface Frame {
  P: THREE.Vector3;
  T: THREE.Vector3;
  U: THREE.Vector3;
  D: THREE.Vector3;
  scale: number;
  yOff: number;
  boneY: number;
  shapes: Shape[];
}
/** frame on the surface seen from the front at (x, y) (design units, scaled by `scale`) */
function frameAt(shapes: Shape[], x: number, y: number, scale: number, yOff: number, front = 0.6): Frame {
  const { p, n } = march(shapes, new THREE.Vector3(x * scale, y * scale + yOff, 1.8), new THREE.Vector3(0, 0, -1));
  const D = n.clone().lerp(_z, front).normalize();
  const T = _up.clone().cross(D).normalize();
  const U = D.clone().cross(T).normalize();
  return { P: p, T, U, D, scale, yOff, boneY: yOff === 0 ? 0 : HB, shapes };
}

const decalMatCache = new Map<string, THREE.MeshStandardMaterial>();
function decalMat(color: number, layer: number, rough = 0.55) {
  const key = `${color}|${layer}|${rough}`;
  let m = decalMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1 - layer,
      polygonOffsetUnits: -4 - layer * 4,
    });
    decalMatCache.set(key, m);
  }
  return m;
}

function decal(fr: Frame, tris: Tri2[], color: number, layer: number, rough = 0.55): THREE.Mesh | null {
  if (!tris.length) return null;
  const sub = subdivide(tris, 0.022 / fr.scale);
  const pos = new Float32Array(sub.length * 9);
  const nrm = new Float32Array(sub.length * 9);
  const dir = fr.D.clone().negate();
  const start = new THREE.Vector3();
  const lift = 0.0036 + layer * 0.0016;
  const cache = new Map<string, { p: THREE.Vector3; n: THREE.Vector3 }>();
  let o = 0;
  for (const t of sub) {
    for (const [u, v] of t) {
      const key = `${u.toFixed(5)},${v.toFixed(5)}`;
      let hit = cache.get(key);
      if (!hit) {
        start
          .copy(fr.P)
          .addScaledVector(fr.T, u * fr.scale)
          .addScaledVector(fr.U, v * fr.scale)
          .addScaledVector(fr.D, 0.3);
        hit = march(fr.shapes, start, dir);
        cache.set(key, hit);
      }
      pos[o] = hit.p.x + hit.n.x * lift;
      pos[o + 1] = hit.p.y + hit.n.y * lift - fr.boneY;
      pos[o + 2] = hit.p.z + hit.n.z * lift;
      nrm[o] = hit.n.x;
      nrm[o + 1] = hit.n.y;
      nrm[o + 2] = hit.n.z;
      o += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, decalMat(color, layer, rough));
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}
const addTo = (g: THREE.Object3D, m: THREE.Mesh | null) => {
  if (m) g.add(m);
};

// ---------- the face ----------
const EYE = { x: 0.25, y: -0.01 };
const NOSE = { y: -0.118 };
const DARK = 0x111014;

function rotPts(p: Vec2[], rot: number): Vec2[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return p.map(([x, y]) => [x * c - y * s, x * s + y * c] as Vec2);
}
function inPoly(p: Vec2[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}
function stadium(w: number, h: number, n = 32): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push([Math.sign(c) * Math.pow(Math.abs(c), 0.55) * w, Math.sign(s) * Math.pow(Math.abs(s), 0.8) * h]);
  }
  return ccw(out);
}
/** moon-shaped colour crescent hugging the bottom of a round eye (reference: big black eye, green crescent) */
function crescent(R: number, thick: number, reach: number, n = 32): Vec2[] {
  // outer arc = circle radius R; inner arc = circle radius R shifted up by `thick` -> tapered tips
  const outer: Vec2[] = [], inner: Vec2[] = [];
  const a0 = Math.PI + reach, a1 = 2 * Math.PI - reach;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  const p0 = outer[0], p1 = outer[n];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = p1[0] + (p0[0] - p1[0]) * t;
    const base = p1[1] + (p0[1] - p1[1]) * t;
    // inner edge bulges downward but stays `thick` above the outer arc at the bottom
    const bottom = -R + thick;
    const k = 1 - Math.pow((2 * t - 1), 2);
    inner.push([x, base + (bottom - base) * k]);
  }
  return ccw([...outer, ...inner.slice(1, -1)]);
}

/** extra expression groups filled while building a face */
let X_HURT: THREE.Group = new THREE.Group();
export interface PupilRig {
  g: THREE.Group;
  T: THREE.Vector3;
  U: THREE.Vector3;
  mx: number;
  my: number;
}
let X_PUPILS: PupilRig[] = [];
/** a group whose content can slide along the face (pupils looking around) */
function pupilGroup(parent: THREE.Group, fr: Frame, mx: number, my: number) {
  const g = new THREE.Group();
  parent.add(g);
  X_PUPILS.push({ g, T: fr.T.clone(), U: fr.U.clone(), mx: mx * fr.scale, my: my * fr.scale });
  return g;
}

function buildEye(rec: Recipe, side: 1 | -1, hs: Shape[], eyesNormal: THREE.Group, eyesKO: THREE.Group) {
  const T = TU;
  const z = T.eyeSize;
  const ex = side * EYE.x * T.eyeX;
  const ey = EYE.y + T.eyeY;
  const fr = frameAt(hs, ex, ey, HS, HO, 0.65);
  const above = march(hs, new THREE.Vector3(ex * HS, (ey + 0.2 * z) * HS + HO, 1.8), new THREE.Vector3(0, 0, -1)).p;
  const darkFur = lum(colorAt(rec, above, new THREE.Color())) < 0.09;
  const koCol = darkFur ? 0xd6d0dc : DARK;
  let koSize = 0.12 * z;

  if (rec.eye === "pill") {
    const w = 0.08 * z, h = 0.056 * z;
    const pg = pupilGroup(eyesNormal, fr, 0.022 * z, 0.012 * z);
    addTo(pg, decal(fr, polyTris(stadium(w, h)), DARK, 1, 0.25));
    addTo(pg, decal(fr, polyTris(ellipse(w * 0.32, h * 0.32, 0.018 * z, 0.018 * z, 12)), 0xffffff, 2, 0.2));
    koSize = 0.08 * z;
  } else if (rec.eye === "puppy") {
    // reference 3: big black round eye, thick green crescent at the bottom, white dot near the top
    const R = 0.165 * z;
    addTo(eyesNormal, decal(fr, polyTris(ellipse(0, 0, R, R * 1.04, 44)), DARK, 0, 0.2));
    const pg = pupilGroup(eyesNormal, fr, R * 0.13, R * 0.09);
    addTo(pg, decal(fr, polyTris(crescent(R * 0.84, R * 0.27, 0.18)), rec.iris, 1, 0.3));
    addTo(eyesNormal, decal(fr, polyTris(ellipse(side * R * 0.08, R * 0.5, R * 0.17, R * 0.17, 20)), 0xffffff, 2, 0.15));
    koSize = 0.13 * z;
  } else {
    // reference 4: huge green iris, big dark pupil (with a darker rim), thick outline, flat grumpy lid
    const w = 0.175 * z, h = 0.155 * z;
    const rot = side * 0.12;
    const eye = ccw(rotPts(ellipse(0, 0, w, h, 44), rot));
    const outline = ccw(rotPts(ellipse(0, 0, w + 0.02 * z, h + 0.02 * z, 44), rot));
    const hasLid = rec.lid > 0.02;
    const lidBase = h * (1 - 2 * rec.lid);
    const slope = side * rec.tilt;
    const lidY = (x: number) => lidBase + slope * x;
    const lidF = (x: number, y: number) => (hasLid ? y - lidY(x) : -1);
    const iris = clipHalf(eye, lidF);
    const out = clipHalf(outline, lidF);
    const px = (rec.px - side * rec.cross) * w * 0.26;
    const py = rec.py * h * 0.22;
    // pupils are not clipped by the eye so they can slide around (the lid line + outline cover the edges)
    const lidLow = (x: number, y: number) => (hasLid ? y - (lidY(x) - 0.012 * z) : -1);
    const pupilRim = clipHalf(ellipse(px, py, w * 0.62, h * 0.72, 36), lidLow);
    const pupil = clipHalf(ellipse(px, py, w * 0.52, h * 0.6, 36), lidLow);
    addTo(eyesNormal, decal(fr, polyTris(out), DARK, 0, 0.3));
    addTo(eyesNormal, decal(fr, polyTris(iris), rec.iris, 1, 0.3));
    const pg = pupilGroup(eyesNormal, fr, w * 0.19, h * 0.07);
    addTo(pg, decal(fr, polyTris(pupilRim), 0x1a1a1f, 2, 0.25));
    addTo(pg, decal(fr, polyTris(pupil), 0x34343b, 3, 0.25));
    const hl = clipHalf(ellipse(px + w * 0.2, py + h * 0.22, w * 0.09, w * 0.09, 14), lidLow);
    addTo(pg, decal(fr, polyTris(hl), 0xe8e8ee, 4, 0.2));
    if (hasLid) {
      const top: Vec2[] = [];
      for (let i = 0; i <= 26; i++) {
        const x = -1.35 * w + (2.7 * w * i) / 26;
        if (inPoly(outline, x, lidY(x) - 0.004)) top.push([x, lidY(x)]);
      }
      if (top.length >= 2) addTo(eyesNormal, decal(fr, strokeTris(top, 0.03 * z, 0.03 * z), DARK, 5, 0.3));
    }
  }
  // ---- DIZZY "@_@": white disc with a dark spiral ----
  const R = Math.max(0.1, koSize * 0.95);
  addTo(eyesKO, decal(fr, polyTris(ellipse(0, 0, R + 0.016, R + 0.016, 40)), DARK, 0, 0.3));
  addTo(eyesKO, decal(fr, polyTris(ellipse(0, 0, R, R, 40)), 0xffffff, 1, 0.3));
  const spiral = curve(56, (t) => {
    const a = t * Math.PI * 5.2 * side;
    const r = R * (0.08 + 0.8 * t);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  addTo(eyesKO, decal(fr, strokeTris(spiral, 0.022 * z, 0.028 * z, false), DARK, 2, 0.3));

  // ---- CRYING ">_<" with tear streams ----
  const cw = 0.11 * z;
  const chevron: Vec2[] = [
    [side * cw * 0.7, cw * 0.62],
    [-side * cw * 0.55, 0],
    [side * cw * 0.7, -cw * 0.62],
  ];
  addTo(X_HURT, decal(fr, strokeTris(chevron, 0.034 * z, 0.034 * z), koCol, 2, 0.3));
  const tear = curve(10, (t) => [side * cw * (0.35 + 0.35 * t), -cw * (0.75 + 1.5 * t)]);
  addTo(X_HURT, decal(fr, strokeTris(tear, 0.045 * z, 0.07 * z), 0x8fd8ff, 3, 0.15));
  addTo(X_HURT, decal(fr, polyTris(ellipse(side * cw * 0.72, -cw * 2.3, 0.045 * z, 0.055 * z, 16)), 0x8fd8ff, 3, 0.15));
  addTo(X_HURT, decal(fr, polyTris(ellipse(side * cw * 0.66, -cw * 2.18, 0.012 * z, 0.016 * z, 8)), 0xffffff, 4, 0.15));
}

function buildFace(rec: Recipe, head: THREE.Bone, _torso: THREE.Bone, eyesNormal: THREE.Group, eyesKO: THREE.Group) {
  // decals sit on the real (blended head + body) surface so they're never buried in the neck blend
  const hs = rec.shapes.filter((s) => s.part === PI.head || s.part === PI.torso);
  buildEye(rec, 1, hs, eyesNormal, eyesKO);
  buildEye(rec, -1, hs, eyesNormal, eyesKO);
  eyesKO.visible = false;
  head.add(eyesNormal, eyesKO);
  const face = new THREE.Group();
  head.add(face);

  for (const st of rec.faceStrokes) {
    const fr = frameAt(hs, st.x, st.y, HS, HO, 0.35);
    addTo(face, decal(fr, strokeTris(st.pts, st.w0, st.w1), st.col, 0, 0.75));
  }

  // nose + "ω" mouth sitting on top of the muzzle puffs
  const nk = TU.noseSize;
  const NY = NOSE.y + TU.noseY;
  const cy = NY - 0.04;
  const mz = frameAt(hs, 0, cy, HS, HO, 0.75);
  const Y = (y: number) => y - cy;
  const nTop = Y(NY + 0.02 * nk), nBot = Y(NY - 0.02 * nk);
  addTo(face, decal(mz, polyTris(roundedTri([-0.042 * nk, nTop], [0, nBot - 0.004 * nk], [0.042 * nk, nTop])), rec.nose, 2, 0.35));
  const mouthCol = rec.mouthCol ?? rec.line;
  const lw = (rec.mouthCol ? 0.014 : 0.012) * (0.7 + 0.3 * nk) * (0.7 + 0.3 * TU.mouth);
  const y0 = nBot - 0.022 * (0.6 + 0.4 * nk);
  const r = 0.036 * (0.6 + 0.4 * nk) * TU.mouth * (rec.mouthCol ? 1.1 : 1);
  const mouthN = new THREE.Group();
  const mouthCry = new THREE.Group();
  const mouthWavy = new THREE.Group();
  mouthN.name = "mouthN";
  mouthCry.name = "mouthCry";
  mouthWavy.name = "mouthWavy";
  face.add(mouthN, mouthCry, mouthWavy);
  if (!rec.noMouth) addTo(mouthN, decal(mz, strokeTris([[0, nBot + 0.004], [0, y0]], lw, lw), mouthCol, 1));
  // crying "wah" mouth
  const cm = ellipse(0, y0 - r * 0.95, r * 1.45, r * 1.15, 30);
  addTo(mouthCry, decal(mz, polyTris(cm), 0x7a2333, 1, 0.4));
  addTo(mouthCry, decal(mz, polyTris(clipConvex(ellipse(0, y0 - r * 1.75, r * 0.95, r * 0.7, 20), cm)), 0xff8fa2, 2, 0.4));
  // dizzy wavy mouth
  const wave = curve(24, (t) => [(-1.5 + 3 * t) * r, y0 - r * 0.6 + Math.sin(t * Math.PI * 4) * r * 0.22]);
  addTo(mouthWavy, decal(mz, strokeTris(wave, lw, lw), mouthCol, 1));
  mouthCry.visible = false;
  mouthWavy.visible = false;
  for (const s of rec.noMouth ? [] : [1, -1]) {
    const pts = curve(14, (t) => {
      const th = t * Math.PI * 1.05;
      return [s * (r - r * Math.cos(th)), y0 - r * 0.85 * Math.sin(th)];
    });
    addTo(mouthN, decal(mz, strokeTris(pts, lw, lw * 0.85), mouthCol, 1));
  }

  // whiskers: two per side, sticking out from the muzzle
  const wm = new THREE.MeshBasicMaterial({ color: rec.whisker });
  const sd = (p: THREE.Vector3) => sceneDist(hs, p.x, p.y, p.z);
  for (const s of [1, -1]) {
    const o = march(hs, new THREE.Vector3(s * 0.15 * HS, (NY - 0.06) * HS + HO, 1.8), new THREE.Vector3(0, 0, -1));
    const origin = o.p.clone().addScaledVector(o.n, 0.006);
    for (const ang of [0.14, -0.06]) {
      const len = 0.4 * HS;
      let dir = new THREE.Vector3(s * Math.cos(ang), Math.sin(ang), 0);
      for (let dz = -0.1; dz < 1.2; dz += 0.05) {
        const d = new THREE.Vector3(s * Math.cos(ang), Math.sin(ang), dz).normalize();
        let ok = true;
        for (let k = 1; k <= 12 && ok; k++) if (sd(origin.clone().addScaledVector(d, (len * k) / 12)) < 0.008) ok = false;
        dir = d;
        if (ok) break;
      }
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.006, len, 5), wm);
      w.name = "whisker";
      w.position.copy(origin).addScaledVector(dir, len / 2);
      w.position.y -= HB;
      w.quaternion.setFromUnitVectors(_up, dir);
      face.add(w);
    }
  }
}

/* =====================================================================
 *  Accessories (head-local, sized from the current head tuning)
 * ===================================================================== */
export interface Googly {
  grp: THREE.Object3D;
  pupil: THREE.Object3D;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface AccessoryBuild {
  group: THREE.Group; // attached to the head bone
  torsoGroup: THREE.Group | null; // attached to the torso bone (scarf)
  googly: Googly[];
  detachable: boolean;
}
/** design units (like hd) -> head-bone local */
const HL = (x: number, y: number, z: number) => new THREE.Vector3(x * HS, y * HS + (HO - HB), z * HS);
const toLocal = (p: THREE.Vector3) => new THREE.Vector3(p.x, p.y - HB, p.z);
const accMat = (color: number, rough = 0.5, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.4, clearcoatRoughness: 0.4, ...extra });
const shadowed = <T extends THREE.Object3D>(o: T) => {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true;
  });
  return o;
};
/** cone from a to b (radius ra at a), optionally squashed across its width */
function coneAB(a: THREE.Vector3, b: THREE.Vector3, ra: number, mat: THREE.Material, squash = 1, tipR = 0) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(tipR, ra, len, 24, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.scale.set(1, 1, squash);
  return m;
}

function makeDolit(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const googly: Googly[] = [];
  const black = accMat(0x16141a, 0.25, { clearcoat: 1 });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY;
  const r = 0.185 * TU.eyeSize * HS;
  const lensC: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    const fr = frameAt(hs, s * ex, ey, HS, HO, 0.75);
    const c = toLocal(fr.P).addScaledVector(fr.D, 0.07 * HS);
    lensC.push(c);
    const lens = new THREE.Group();
    lens.position.copy(c);
    lens.lookAt(c.clone().add(fr.D));
    g.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.026 * HS, 12, 44), black);
    lens.add(rim);
    // "mata blolok": big googly eye with a wobbly pupil
    const white = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), accMat(0xffffff, 0.3));
    white.scale.set(r * 0.94, r * 0.94, r * 0.35);
    lens.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), black);
    pupil.scale.set(r * 0.48, r * 0.48, r * 0.18);
    pupil.position.z = r * 0.3;
    lens.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.scale.setScalar(r * 0.12);
    glint.position.set(r * 0.18, r * 0.2, r * 0.17);
    pupil.add(glint);
    glint.scale.set(0.25, 0.25, 0.6);
    googly.push({ grp: lens, pupil, max: r * 0.42, x: 0, y: -r * 0.3, vx: 0, vy: 0 });
    // temple arm toward the ear
    const back = HL(s * 0.5, ey + 0.02, -0.12);
    const outer = c.clone().add(new THREE.Vector3(s * r, 0, -0.02 * HS));
    g.add(coneAB(outer, back, 0.016 * HS, black, 1, 0.016 * HS));
  }
  // bridge
  const mid = lensC[0].clone().add(lensC[1]).multiplyScalar(0.5);
  const half = lensC[0].distanceTo(lensC[1]) / 2 - r;
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.02 * HS, half), 0.02 * HS, 8, 20, Math.PI), black);
  bridge.position.copy(mid).add(new THREE.Vector3(0, 0.02 * HS, 0));
  g.add(bridge);
  // big nose
  const ny = NOSE.y + TU.noseY;
  const nf = frameAt(hs, 0, ny + 0.03, HS, HO, 0.8);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), accMat(0xf2ad94, 0.45));
  const nr = 0.13 * HS;
  nose.scale.set(nr * 0.9, nr, nr * 1.05);
  nose.position.copy(toLocal(nf.P)).addScaledVector(nf.D, nr * 0.7);
  g.add(nose);
  for (const s of [1, -1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), accMat(0x6b2f2a, 0.6));
    nostril.scale.set(0.025 * HS, 0.016 * HS, 0.02 * HS);
    nostril.position.copy(nose.position).add(new THREE.Vector3(s * nr * 0.38, -nr * 0.72, nr * 0.45));
    g.add(nostril);
  }
  // bushy moustache
  const brown = accMat(0x2a1c16, 0.85, { clearcoat: 0 });
  for (const s of [1, -1]) {
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const x = s * (0.02 + 0.24 * t);
      const y = ny - 0.075 - 0.05 * t * t + 0.03 * t;
      const mf = frameAt(hs, x, y, HS, HO, 0.6);
      const rr = (0.075 - 0.04 * t) * HS;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), brown);
      blob.scale.set(rr * 1.25, rr * 0.8, rr * 0.75);
      blob.position.copy(toLocal(mf.P)).addScaledVector(mf.D, rr * 0.55 + 0.02 * HS);
      blob.rotation.z = -s * (0.2 + 0.5 * t);
      g.add(blob);
    }
  }
  // rainbow scarf: a fluffy tube hugging the body right under the chin (torso bone)
  const tg = new THREE.Group();
  const cols = [0xff5a5a, 0xffb43c, 0xffe14d, 0x5fd16a, 0x4aa8ff, 0xb36bff].map((c) => new THREE.Color(c));
  const chinY = march(hs, new THREE.Vector3(0, HO - 1.5, 0.1 * HS), new THREE.Vector3(0, 1, 0)).p.y;
  const sy = chinY - 0.02;
  const ts = SCARF_TORSO;
  const ring: THREE.Vector3[] = [];
  for (let k = 0; k < 24; k++) {
    const a2 = (k / 24) * Math.PI * 2;
    const d = new THREE.Vector3(Math.sin(a2), 0, Math.cos(a2));
    const hit = march(ts, new THREE.Vector3(d.x * 1.5, sy, d.z * 1.5), d.clone().negate());
    ring.push(new THREE.Vector3(hit.p.x, sy, hit.p.z).addScaledVector(d, 0.035));
  }
  const curveS = new THREE.CatmullRomCurve3(ring, true);
  const tubeR = 0.065;
  // knitted rainbow stripes: 12 short tube pieces with their own colour
  const N = 12;
  for (let k = 0; k < N; k++) {
    const pts: THREE.Vector3[] = [];
    for (let q = 0; q <= 6; q++) pts.push(curveS.getPointAt(((k + (q / 6) * 1.06) / N) % 1));
    const piece = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, tubeR, 12, false),
      new THREE.MeshStandardMaterial({ color: cols[k % cols.length], roughness: 0.9 })
    );
    tg.add(piece);
  }
  // two dangling ends at the front-right
  const front = ring[2].clone();
  for (let k = 0; k < 2; k++) {
    const end = new THREE.Group();
    end.position.copy(front).add(new THREE.Vector3(k * 0.07, -0.02, 0.03));
    end.rotation.z = 0.18 - k * 0.12;
    for (let q = 0; q < 4; q++) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.035), new THREE.MeshStandardMaterial({ color: cols[(q + k * 3) % cols.length], roughness: 0.9 }));
      piece.position.y = -0.04 - q * 0.07;
      end.add(piece);
    }
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    fringe.position.y = -0.33;
    end.add(fringe);
    tg.add(end);
  }
  return { group: shadowed(g), torsoGroup: shadowed(tg), googly, detachable: true };
}

function makeCap(color: number, hs: Shape[], style: "old" | "new" = "old"): AccessoryBuild {
  const isNew = style === "new";
  const g = new THREE.Group();
  // crown is moulded on the head (ellipsoids only), slightly puffed up like a real structured cap
  const body = hs.filter((s) => s.t === 0 && !s.noBounds);
  const ears = hs.filter((s) => s.t === 1);
  const Cb = new THREE.Vector3(0, 0.02 * HS + HO, -0.01 * HS);
  const th = 0.022 * HS;
  const e0 = (a: number) => {
    const w = (1 - Math.cos(a)) / 2; // 0 front .. 1 back
    // new: front edge sits HIGH above the eyes like a real baseball cap (old sat low on the forehead)
    return isNew ? 1.0 * (1 - w) - 0.22 * w : 0.72 * (1 - w) - 0.3 * w;
  };
  // new: taller structured dome that stands off the head instead of shrink-wrapping it
  const puff = (u: number) =>
    (isNew ? 0.025 * HS : 0) + (isNew ? 0.105 : 0.05) * HS * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.8);
  /** point on the cap surface in the given direction from the head centre (bind space) */
  const onCap = (d: THREE.Vector3, extra = 0) => {
    const a = Math.atan2(d.x, d.z);
    const e = Math.asin(Math.max(-1, Math.min(1, d.y / d.length())));
    const u = Math.max(0, (e - e0(a)) / (Math.PI / 2 - e0(a)));
    const dn = d.clone().normalize();
    const { p, n } = march(body, Cb.clone().addScaledVector(dn, 1.6), dn.clone().negate());
    return { p: p.addScaledVector(n, th + puff(u) + extra), n };
  };
  const dirAU = (a: number, u: number) => {
    const e = e0(a) + (Math.PI / 2 - e0(a)) * u;
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  };
  const surf = (a: number, u: number, extra = 0) => {
    const r = onCap(dirAU(a, Math.min(u, 0.995)), extra);
    return { p: toLocal(r.p), n: r.n, pb: r.p };
  };
  // ear holes: ears poke through neat openings in the cap (no clipping)
  const earGap = 0.022 * HS;
  const inEar = (pb: THREE.Vector3) => ears.some((e) => shapeDist(e, pb.x, pb.y, pb.z) < earGap);
  const A = 168, U = 42;
  const pos: number[] = [];
  const hole: boolean[] = [];
  const fv: number[] = [];
  const PV: THREE.Vector3[] = [];
  const earF = (pb: THREE.Vector3) => {
    let f = 1;
    for (const e of ears) f = Math.min(f, shapeDist(e, pb.x, pb.y, pb.z) - earGap);
    return f;
  };
  for (let iu = 0; iu <= U; iu++) {
    const u = Math.pow(iu / U, 0.9);
    for (let ia = 0; ia <= A; ia++) {
      const v = surf(-Math.PI + (2 * Math.PI * ia) / A, u);
      pos.push(v.p.x, v.p.y, v.p.z);
      PV.push(v.p);
      const f = earF(v.pb);
      fv.push(f);
      hole.push(f < 0);
    }
  }
  const idx: number[] = [];
  for (let iu = 0; iu < U; iu++)
    for (let ia = 0; ia < A; ia++) {
      const a0 = iu * (A + 1) + ia, b0 = a0 + A + 1;
      if (hole[a0] || hole[a0 + 1] || hole[b0] || hole[b0 + 1]) continue;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  crownGeo.setIndex(idx);
  crownGeo.computeVertexNormals();
  const mat = accMat(color, 0.6, { clearcoat: 0.2, side: THREE.DoubleSide });
  const darker = new THREE.Color(color).multiplyScalar(0.72).getHex();
  // new: two-tone trucker style — colored front panel, clean white sides/back
  const trimMat = isNew ? accMat(0xf7f4ee, 0.55, { clearcoat: 0.2 }) : mat;
  if (isNew) {
    const cols = new Float32Array((pos.length / 3) * 3);
    const cMain = new THREE.Color(color);
    const cSide = new THREE.Color(0xf7f4ee);
    for (let v = 0; v < pos.length / 3; v++) {
      const ia = v % (A + 1);
      const a = Math.atan2(Math.sin(-Math.PI + (2 * Math.PI * ia) / A), Math.cos(-Math.PI + (2 * Math.PI * ia) / A));
      const c = Math.abs(a) < 0.8 ? cMain : cSide;
      cols[v * 3] = c.r;
      cols[v * 3 + 1] = c.g;
      cols[v * 3 + 2] = c.b;
    }
    crownGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.add(new THREE.Mesh(crownGeo, accMat(0xffffff, 0.55, { clearcoat: 0.25, side: THREE.DoubleSide, vertexColors: true })));
  } else {
    g.add(new THREE.Mesh(crownGeo, mat));
  }
  // stitched cuff along the exact ear-hole outline (marching squares on the crown grid)
  {
    const id = (iu: number, ia: number) => iu * (A + 1) + ia;
    const pts = new Map<string, THREE.Vector3>();
    const cross = (key: string, i: number, j: number) => {
      if (!pts.has(key)) {
        const t = fv[i] / (fv[i] - fv[j]);
        pts.set(key, PV[i].clone().lerp(PV[j], t));
      }
      return key;
    };
    const adj = new Map<string, string[]>();
    const link = (a2: string, b2: string) => {
      (adj.get(a2) ?? adj.set(a2, []).get(a2)!).push(b2);
      (adj.get(b2) ?? adj.set(b2, []).get(b2)!).push(a2);
    };
    for (let iu = 0; iu < U; iu++)
      for (let ia = 0; ia < A; ia++) {
        const c0 = id(iu, ia), c1 = id(iu, ia + 1), c2 = id(iu + 1, ia + 1), c3 = id(iu + 1, ia);
        const E: string[] = [];
        const ia1 = (ia + 1) % A;
        if (fv[c0] < 0 !== fv[c1] < 0) E.push(cross(`h${iu}:${ia}`, c0, c1));
        if (fv[c1] < 0 !== fv[c2] < 0) E.push(cross(`v${iu}:${ia1}`, c1, c2));
        if (fv[c3] < 0 !== fv[c2] < 0) E.push(cross(`h${iu + 1}:${ia}`, c3, c2));
        if (fv[c0] < 0 !== fv[c3] < 0) E.push(cross(`v${iu}:${ia}`, c0, c3));
        if (E.length === 2) link(E[0], E[1]);
        else if (E.length === 4) {
          link(E[0], E[1]);
          link(E[2], E[3]);
        }
      }
    const seen = new Set<string>();
    const centre = toLocal(Cb.clone());
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      // walk to one end (or around a loop)
      let cur = start, prev = "";
      for (let guard = 0; guard < 5000; guard++) {
        const nb = (adj.get(cur) ?? []).filter((k) => k !== prev);
        if (nb.length === 0 || nb[0] === start) break;
        if ((adj.get(cur) ?? []).length < 2) break;
        prev = cur;
        cur = nb[0];
        if (cur === start) break;
      }
      const chain: string[] = [];
      const s0 = cur;
      prev = "";
      for (let guard = 0; guard < 5000; guard++) {
        chain.push(cur);
        seen.add(cur);
        const nb = (adj.get(cur) ?? []).filter((k) => k !== prev && !seen.has(k));
        if (nb.length === 0) break;
        prev = cur;
        cur = nb[0];
      }
      const closed = chain.length > 3 && (adj.get(chain[chain.length - 1]) ?? []).includes(s0);
      if (chain.length < 4) continue;
      const line = chain.map((k) => {
        const p0 = pts.get(k)!.clone();
        return p0.add(p0.clone().sub(centre).normalize().multiplyScalar(0.004));
      });
      // light smoothing
      const sm = line.map((p0, i) => {
        const a2 = line[(i - 1 + line.length) % line.length], b2 = line[(i + 1) % line.length];
        if (!closed && (i === 0 || i === line.length - 1)) return p0;
        return p0.clone().multiplyScalar(0.5).addScaledVector(a2, 0.25).addScaledVector(b2, 0.25);
      });
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sm, closed), Math.max(16, sm.length * 2), 0.024 * HS, 8, closed), trimMat));
    }
  }
  // rolled bottom band (also hides the edge)
  const band: THREE.Vector3[] = [];
  for (let ia = 0; ia < A; ia++) band.push(surf(-Math.PI + (2 * Math.PI * ia) / A, 0.0, 0.004).p);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band, true), 192, 0.018 * HS, 8, true), trimMat));
  // stitched panel seams (skip the ones that would cross an ear hole)
  const seamMat = accMat(darker, 0.7, { clearcoat: 0 });
  for (const a of isNew ? [-2.62, -1.57, -0.52, 0.52, 1.57, 2.62] : [-2.6, -0.42, 0.42, 2.6, Math.PI]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const v = surf(a, 0.04 + (k / 16) * 0.93, 0.003);
      if (inEar(v.pb)) break;
      pts.push(v.p);
    }
    if (pts.length > 3)
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, (isNew ? 0.0085 : 0.007) * HS, 5, false), seamMat));
  }
  // button on top
  const top = surf(0, 0.999, 0.008);
  const btn = new THREE.Mesh(new THREE.SphereGeometry((isNew ? 0.062 : 0.05) * HS, 16, 10), mat);
  btn.position.copy(top.p);
  btn.scale.y = 0.55;
  g.add(btn);
  if (isNew) {
    const bring = new THREE.Mesh(new THREE.TorusGeometry(0.07 * HS, 0.013 * HS, 8, 28), accMat(0xf7f4ee, 0.5));
    bring.position.copy(top.p).addScaledVector(top.n, -0.012 * HS);
    bring.lookAt(top.p.clone().add(top.n));
    g.add(bring);
  }
  // paw logo on the front panel (new: embroidered patch style — white patch + colored paw)
  const white = accMat(0xf7f4ee, 0.5);
  const lp = surf(0, isNew ? 0.32 : 0.28, 0.004);
  const logo = new THREE.Group();
  logo.position.copy(lp.p);
  logo.lookAt(lp.p.clone().add(lp.n));
  const pawMat = isNew ? mat : white;
  if (isNew) {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), white);
    patch.scale.set(0.115 * HS, 0.115 * HS, 0.014 * HS);
    logo.add(patch);
  }
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), pawMat);
  const pawK = isNew ? 1.15 : 1;
  pad.scale.set(0.058 * HS * pawK, 0.046 * HS * pawK, 0.012 * HS);
  pad.position.set(0, -0.02 * HS, isNew ? 0.012 * HS : 0);
  logo.add(pad);
  for (const [x, y] of [
    [-0.058, 0.034],
    [-0.021, 0.062],
    [0.021, 0.062],
    [0.058, 0.034],
  ]) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), pawMat);
    t.scale.set(0.02 * HS * pawK, 0.023 * HS * pawK, 0.01 * HS);
    t.position.set(x * HS * pawK, y * HS * pawK, isNew ? 0.012 * HS : 0);
    logo.add(t);
  }
  g.add(logo);
  // ventilation eyelets on the side/back panels (new only)
  if (isNew) {
    for (const a of [-2.1, -1.05, 1.05, 2.1, Math.PI]) {
      const v = surf(a, 0.55, 0.002);
      if (inEar(v.pb)) continue;
      const holder = new THREE.Group();
      holder.position.copy(v.p);
      holder.lookAt(v.p.clone().add(v.n));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), white);
      eye.scale.set(0.02 * HS, 0.02 * HS, 0.01 * HS);
      holder.add(eye);
      g.add(holder);
    }
  }
  // snapback opening + strap at the back
  const arch: THREE.Vector3[] = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    arch.push(surf(Math.PI + (t - 0.5) * 0.9, 0.02 + 0.2 * Math.sin(Math.PI * t), 0.005).p);
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 30, (isNew ? 0.016 : 0.013) * HS, 6, false), seamMat));
  if (isNew) {
    const strapPts = [surf(Math.PI - 0.32, 0.03, 0.01).p, surf(Math.PI, 0.03, 0.012).p, surf(Math.PI + 0.32, 0.03, 0.01).p];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPts), 16, 0.02 * HS, 6, false), accMat(darker, 0.7, { clearcoat: 0 })));
    for (const s of [-1, 1]) {
      const sp = surf(Math.PI + s * 0.14, 0.035, 0.028);
      const snap = new THREE.Mesh(new THREE.SphereGeometry(0.018 * HS, 10, 8), white);
      snap.position.copy(sp.p);
      g.add(snap);
    }
  }
  // brim: grows out of the front edge, gently curved, sits ABOVE the eyes
  // new: much bigger & longer, dipping down toward the tip like a real baseball brim
  const AB = isNew ? 1.02 : 0.95, NB = 44, MB = 8;
  const Lmax = (isNew ? 0.62 : 0.43) * HS, bth = (isNew ? 0.034 : 0.03) * HS;
  const topV: THREE.Vector3[][] = [];
  for (let i = 0; i <= NB; i++) {
    const a = -AB + (2 * AB * i) / NB;
    const root = surf(a, 0.0, -0.002).p;
    const k = a / AB;
    const L = Lmax * Math.pow(Math.max(0, 1 - k * k), 0.8) + 0.012 * HS;
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= MB; j++) {
      const t = j / MB;
      const v = root.clone().addScaledVector(out, L * t);
      v.y += isNew
        ? (-0.03 * t - 0.13 * t * t - 0.08 * k * k * t) * HS // dips down toward the tip
        : (0.02 * t - 0.09 * k * k * t) * HS; // nearly flat in the middle, curls down at the sides
      row.push(v);
    }
    topV.push(row);
  }
  const strip = (off: number, flip: boolean) => {
    const ps: number[] = [], ix: number[] = [];
    for (let i = 0; i <= NB; i++) for (let j = 0; j <= MB; j++) ps.push(topV[i][j].x, topV[i][j].y + off, topV[i][j].z);
    for (let i = 0; i < NB; i++)
      for (let j = 0; j < MB; j++) {
        const a0 = i * (MB + 1) + j, b0 = a0 + MB + 1;
        if (flip) ix.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        else ix.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    return geo;
  };
  g.add(new THREE.Mesh(strip(0, true), accMat(color, 0.55)));
  g.add(new THREE.Mesh(strip(-bth, false), isNew ? accMat(0xf7f4ee, 0.6, { clearcoat: 0.1 }) : accMat(darker, 0.7, { clearcoat: 0 })));
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i <= NB; i++) edge.push(topV[i][MB].clone().setY(topV[i][MB].y - bth / 2));
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 88, bth * (isNew ? 0.62 : 0.55), 8, false),
      isNew ? accMat(0xf7f4ee, 0.55) : accMat(color, 0.55)
    )
  );
  // brim stitch lines (new only)
  if (isNew) {
    for (const jj of [MB - 2, MB - 4]) {
      const line: THREE.Vector3[] = [];
      for (let i = 0; i <= NB; i++) line.push(topV[i][jj].clone().setY(topV[i][jj].y + 0.004));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 88, 0.006 * HS, 5, false), accMat(0xf7f4ee, 0.6, { clearcoat: 0 })));
    }
  }
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

function makeCapNew(color: number, hs: Shape[]): AccessoryBuild {
  return makeCap(color, hs, "new");
}

function makeHelmet(color: number, hs: Shape[]): AccessoryBuild {
  void hs;
  const g = new THREE.Group();
  const j = TU.jaw;
  // fit the head: 20% bigger than before, and never smaller than the head's own bounds
  const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const sh of hs) {
    if (sh.t !== 0 || sh.noBounds) continue;
    mn.min(new THREE.Vector3(sh.c[0] - sh.r[0], sh.c[1] - sh.r[1], sh.c[2] - sh.r[2]));
    mx.max(new THREE.Vector3(sh.c[0] + sh.r[0], sh.c[1] + sh.r[1], sh.c[2] + sh.r[2]));
  }
  const C = toLocal(new THREE.Vector3((mn.x + mx.x) / 2, (mn.y + mx.y) / 2 + 0.02 * HS, (mn.z + mx.z) / 2 - 0.01 * HS));
  const fit = 1.07;
  const K = 1.2 * 0.83; // 20% bigger, then 17% smaller
  const Rx = Math.max((0.67 + 0.03 * (j - 1)) * HS * K, ((mx.x - mn.x) / 2) * fit);
  const Ry = Math.max((0.68 + 0.05 * (j - 1)) * HS * K, ((mx.y - mn.y) / 2) * fit);
  const Rz = Math.max(0.7 * HS * K, ((mx.z - mn.z) / 2) * fit + 0.03 * HS);
  /** radial bulge: the chin bar pushes the lower front of the shell forward */
  const bulge = (yaw: number, pitch: number) => {
    const c = Math.max(0, Math.cos(yaw));
    return 1 + 0.13 * Math.exp(-Math.pow((pitch + 0.62) / 0.27, 2)) * Math.pow(c, 2.2);
  };
  const at = (yaw: number, pitch: number, k = 1) => {
    const b = bulge(yaw, pitch) * k;
    return new THREE.Vector3(C.x + Math.sin(yaw) * Math.cos(pitch) * Rx * b, C.y + Math.sin(pitch) * Ry * b, C.z + Math.cos(yaw) * Math.cos(pitch) * Rz * b);
  };
  const shell = accMat(color, 0.22, { clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  const dark = accMat(0x24252e, 0.65, { clearcoat: 0.2 });
  const white = accMat(0xffffff, 0.25, { clearcoat: 1, side: THREE.DoubleSide });
  const accent = accMat(0xff4d6d, 0.3, { clearcoat: 1, side: THREE.DoubleSide });
  // eye port: rounded rectangle in yaw/pitch
  const WY = 0.92, WT = 0.5, WB = -0.34;
  const WC = (WT + WB) / 2, WP = (WT - WB) / 2;
  const winF = (yaw: number, pitch: number) => Math.pow(Math.abs(yaw / WY), 3.2) + Math.pow(Math.abs((pitch - WC) / WP), 3.2);
  const BOT = -1.06; // bottom opening (pitch)
  const split = (keep: (yaw: number, pitch: number) => boolean, k: number, seg = 160) => {
    const src = new THREE.SphereGeometry(1, seg, seg / 2).toNonIndexed();
    const pa = src.getAttribute("position");
    const out: number[] = [];
    for (let i = 0; i < pa.count; i += 3) {
      const cx = (pa.getX(i) + pa.getX(i + 1) + pa.getX(i + 2)) / 3;
      const cy = (pa.getY(i) + pa.getY(i + 1) + pa.getY(i + 2)) / 3;
      const cz = (pa.getZ(i) + pa.getZ(i + 1) + pa.getZ(i + 2)) / 3;
      const yaw = Math.atan2(cx, cz), pitch = Math.asin(Math.max(-1, Math.min(1, cy)));
      if (!keep(yaw, pitch)) continue;
      for (let q = 0; q < 3; q++) {
        const vx = pa.getX(i + q), vy = pa.getY(i + q), vz = pa.getZ(i + q);
        const b = bulge(Math.atan2(vx, vz), Math.asin(Math.max(-1, Math.min(1, vy)))) * k;
        out.push(C.x + vx * Rx * b, C.y + vy * Ry * b, C.z + vz * Rz * b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    geo.computeVertexNormals();
    return geo;
  };
  // main shell
  g.add(new THREE.Mesh(split((y, p) => p > BOT && !(Math.abs(y) < Math.PI / 2 && winF(y, p) < 1), 1), shell));
  // smooth stripes along the crown (white centre + red pinstripes), front window -> back
  const stripe = (x0: number, x1: number, mat: THREE.Material, k: number) => {
    const ps: number[] = [], ix: number[] = [];
    const N = 70;
    const M = 6;
    for (let i = 0; i <= N; i++) {
      const phi = WT + 0.06 + ((Math.PI + 0.75 - WT) * i) / N; // over the top to the back
      for (let q = 0; q <= M; q++) {
        const xw = x0 + ((x1 - x0) * q) / M;
        const d = new THREE.Vector3(Math.sin(xw), Math.cos(xw) * Math.sin(phi), Math.cos(xw) * Math.cos(phi));
        ps.push(C.x + d.x * Rx * k, C.y + d.y * Ry * k, C.z + d.z * Rz * k);
      }
    }
    for (let i = 0; i < N; i++)
      for (let q = 0; q < M; q++) {
        const a0 = i * (M + 1) + q, b0 = a0 + M + 1;
        ix.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  g.add(stripe(-0.11, 0.11, white, 1.008));
  g.add(stripe(0.14, 0.175, accent, 1.008));
  g.add(stripe(-0.175, -0.14, accent, 1.008));
  // chin vent grille
  for (const s of [-1, 0, 1]) {
    const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.012 * HS, 0.07 * HS, 4, 8), dark);
    v.position.copy(at(s * 0.14, WB - 0.28, 1.005));
    v.lookAt(at(s * 0.14, WB - 0.28, 2));
    g.add(v);
  }
  // rubber gasket around the eye port
  const rim: THREE.Vector3[] = [];
  for (let k = 0; k < 96; k++) {
    const t = (k / 96) * Math.PI * 2;
    const c = Math.cos(t), sn = Math.sin(t);
    const yaw = Math.sign(c) * Math.pow(Math.abs(c), 1 / 1.6) * WY;
    const pitch = WC + Math.sign(sn) * Math.pow(Math.abs(sn), 1 / 1.6) * WP;
    rim.push(at(yaw, pitch, 1.008));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 192, 0.022 * HS, 8, true), dark));
  // visor (face shield): slightly larger than the port, light blue tint + cartoon glare
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x9ad8ff,
    transparent: true,
    opacity: 0.26,
    roughness: 0.04,
    clearcoat: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const visor = new THREE.Mesh(split((y, p) => Math.abs(y) < Math.PI / 2 && Math.pow(Math.abs(y / (WY + 0.1)), 3.2) + Math.pow(Math.abs((p - WC - 0.02) / (WP + 0.07)), 3.2) < 1, 1.05, 128), visorMat);
  visor.renderOrder = 5;
  g.add(visor);
  const glareMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  for (const [y0, w] of [
    [-0.55, 0.11],
    [-0.36, 0.05],
  ] as const) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) pts.push(at(y0 + k * 0.02, WT - 0.02 - k * 0.06, 1.056));
    const gl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, w * 0.12 * HS, 6, false), glareMat);
    gl.renderOrder = 6;
    g.add(gl);
  }
  // visor top tab + side pivot plates
  const tab = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 * HS, 0.08 * HS, 4, 8), dark);
  tab.position.copy(at(0, WT + 0.07, 1.06));
  tab.rotation.z = Math.PI / 2;
  g.add(tab);
  for (const s of [1, -1]) {
    const yaw = s * (WY + 0.16);
    const p = at(yaw, WC, 1.03);
    const n = at(yaw, WC, 2).sub(C).normalize();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * HS, 0.06 * HS, 0.03 * HS, 24), dark);
    plate.position.copy(p);
    plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    g.add(plate);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * HS, 0.024 * HS, 0.035 * HS, 16), accMat(0x6b6f80, 0.3, { metalness: 0.5 }));
    bolt.position.copy(p).addScaledVector(n, 0.012 * HS);
    bolt.quaternion.copy(plate.quaternion);
    g.add(bolt);
  }
  // rear spoiler
  const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.045 * HS, 0.32 * HS, 6, 12), shell);
  sp.position.copy(at(Math.PI, 0.32, 1.02));
  sp.rotation.z = Math.PI / 2;
  sp.scale.set(1, 1, 0.6);
  g.add(sp);
  // padded bottom opening + neck roll
  const bot: THREE.Vector3[] = [];
  for (let k = 0; k < 72; k++) bot.push(at((k / 72) * Math.PI * 2, BOT, 1.0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bot, true), 144, 0.045 * HS, 10, true), dark));
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: false };
}

let SCARF_TORSO: Shape[] = [];
function buildAccessory(kind: AccessoryId, hs: Shape[], torso: Shape[] = []): AccessoryBuild | null {
  SCARF_TORSO = torso;
  switch (kind) {
    case "capRed":
      return makeCap(0xe8343c, hs);
    case "capBlue":
      return makeCap(0x2f6fe0, hs);
    case "capNewRed":
      return makeCapNew(0xe8343c, hs);
    case "capNewBlue":
      return makeCapNew(0x2f6fe0, hs);
    case "dolit":
      return makeDolit(hs);
    case "helmet":
      return makeHelmet(0xffcc2e, hs);
    default:
      return null;
  }
}

/* =====================================================================
 *  Public API
 * ===================================================================== */
export interface CharacterVisual {
  torso: THREE.Bone;
  head: THREE.Bone;
  armL: THREE.Bone;
  armR: THREE.Bone;
  legL: THREE.Bone;
  legR: THREE.Bone;
  mesh: THREE.SkinnedMesh;
  eyesNormal: THREE.Group;
  eyesKO: THREE.Group;
  eyesHurt: THREE.Group;
  pupils: PupilRig[];
  accessory: THREE.Group | null;
  accessoryKind: AccessoryId;
  googly: Googly[];
  mouthN: THREE.Object3D;
  mouthCry: THREE.Object3D;
  mouthWavy: THREE.Object3D;
  all: THREE.Object3D[];
}

/** Pre-build (and cache) the blended mesh for an animal. */
export function warmCharacter(def: AnimalDef) {
  getAsset(def);
}

export function buildCharacterVisual(def: AnimalDef, accessory: AccessoryId = "none"): CharacterVisual {
  const asset = getAsset(def, accessory === "helmet");
  const bones = PARTS.map((name, i) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(asset.bindPos[i]);
    b.quaternion.copy(asset.bindQuat[i]);
    return b;
  });
  const skeleton = new THREE.Skeleton(bones, asset.boneInverses.map((m) => m.clone()));
  const mesh = new THREE.SkinnedMesh(asset.geometry, SKIN_MATERIAL);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const armMesh = new THREE.SkinnedMesh(asset.armGeometry, SKIN_MATERIAL);
  armMesh.bind(skeleton, new THREE.Matrix4());
  armMesh.castShadow = true;
  armMesh.receiveShadow = true;
  armMesh.frustumCulled = false;

  const eyesNormal = new THREE.Group();
  const eyesKO = new THREE.Group();
  const eyesHurt = new THREE.Group();
  X_HURT = eyesHurt;
  X_PUPILS = [];
  buildFace(asset.recipe, bones[1], bones[0], eyesNormal, eyesKO);
  eyesHurt.visible = false;
  bones[1].add(eyesHurt);
  const find = (n: string) => bones[1].getObjectByName(n) ?? new THREE.Group();
  const acc = buildAccessory(
    accessory,
    asset.recipe.shapes.filter((sh) => sh.part === PI.head),
    asset.recipe.shapes.filter((sh) => sh.part === PI.torso)
  );
  if (acc) {
    bones[1].add(acc.group);
    if (acc.torsoGroup) bones[0].add(acc.torsoGroup);
    if (accessory === "helmet") bones[1].traverse((o) => o.name === "whisker" && (o.visible = false));
  }

  return {
    torso: bones[0],
    head: bones[1],
    armL: bones[2],
    armR: bones[3],
    legL: bones[4],
    legR: bones[5],
    mesh,
    eyesNormal,
    eyesKO,
    eyesHurt,
    pupils: X_PUPILS,
    accessory: acc ? acc.group : null,
    accessoryKind: acc ? accessory : "none",
    googly: acc ? acc.googly : [],
    mouthN: find("mouthN"),
    mouthCry: find("mouthCry"),
    mouthWavy: find("mouthWavy"),
    all: [mesh, armMesh, ...bones],
  };
}

/* =====================================================================
 *  Static (menu) posing
 * ===================================================================== */
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
function setLimb(bone: THREE.Bone, pivot: V3, base: THREE.Vector3, rx: number, rz: number) {
  _e.set(rx, 0, rz);
  _q.setFromEuler(_e);
  _v.set(rig.LIMB_TOP[0], rig.LIMB_TOP[1], rig.LIMB_TOP[2]).applyQuaternion(_q);
  bone.position.set(base.x + pivot[0] - _v.x, base.y + pivot[1] - _v.y, base.z + pivot[2] - _v.z);
  bone.quaternion.copy(_q);
}

export function poseStatic(v: CharacterVisual, t: number, wave = false) {
  const bob = Math.sin(t * 3) * 0.02;
  const base = new THREE.Vector3(0, rig.HOVER + bob, 0);
  v.torso.position.copy(base);
  v.torso.quaternion.identity();
  v.head.position.set(0, rig.HOVER + rig.HEAD_OFFSET + bob * 1.3, 0);
  _e.set(Math.sin(t * 1.3) * 0.04, Math.sin(t * 0.9) * 0.08, Math.sin(t * 1.7) * 0.07);
  v.head.quaternion.setFromEuler(_e);
  const sway = Math.sin(t * 2) * 0.06;
  if (wave) setLimb(v.armL, rig.SHOULDER_L, base, -0.2, 1.75 + Math.sin(t * 9) * 0.28);
  else setLimb(v.armL, rig.SHOULDER_L, base, 0.12, 0.42 + sway);
  setLimb(v.armR, rig.SHOULDER_R, base, 0.12, -0.42 - sway);
  setLimb(v.legL, rig.HIP_L, base, 0, 0.04);
  setLimb(v.legR, rig.HIP_R, base, 0, -0.04);
}
