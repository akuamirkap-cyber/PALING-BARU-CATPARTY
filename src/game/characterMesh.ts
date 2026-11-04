import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AccessoryId, AnimalDef, AnimalId } from "./animals";
import type { EyeStyleId, ExpressionId } from "./eyes";
import * as rig from "./rig";
import type { V3 } from "./rig";
import { getRigTuning, getShapeMode, isSculptedShape, tuningKey, TUNING_DEFAULTS, type Tuning } from "./tuning";

/* =====================================================================
 *  Shared material helper (used by the arena too)
 * ===================================================================== */
const sharedMaterials = new WeakSet<THREE.Material>();
const matCache = new Map<number, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.85) {
  const key = color * 10 + Math.round(rough * 9);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    sharedMaterials.add(m);
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
/** Build the head without ears when they are covered by a cap or helmet. */
let NO_EARS = false;
/** arm-local y stretched by the arm length tuning (pivot at LIMB_TOP stays fixed) */
const AY = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * TU.armLen;
/** arm-local y of the paw centre */
const PAW = () => AY(-0.205);
/**
 * Proportions of the sculpted (asset-like) limbs. They are traced from the
 * "accurate 3D cat" export: slim hanging arms that bow slightly outward past
 * the hips, and thick shins ending in long rounded paws.
 * Exported so the shape can be tuned against the asset without touching the rig.
 */
export const ASSET_LIMB = {
  /** outward bow of the hanging arm (asset arms clear the belly) */
  bow: 0.075,
  /** arm tube radius multiplier (asset: tube 0.075 vs mitten 0.087) */
  armR: 1.0,
  /** paw radius multiplier */
  pawR: 1.0,
  /** shin radius multiplier */
  thighR: 1.06,
  /** how much the shin narrows at the ankle (1 = no taper) */
  ankle: 1.04,
  /** foot half-width / half-depth / half-height multipliers */
  footW: 1.04,
  footD: 1.22,
  footH: 1.26,
  /** forward offset of the foot (the paw points at the camera) */
  footFwd: 0.063,
  /** softness of the ankle -> paw transition (bigger = smoother boot) */
  footBlend: 0.085,
  /** the sculpt's legs sit a little outside the hip pivot (x of the shin) */
  legOut: 0.030,
  /** extra outward offset of the paw itself (the sculpt's feet stand apart) */
  footOut: 0.012,
  /** how wide the hanging arms sit in the idle pose (asset arms hang close) */
  armSpread: 0.05,
};
/** baked cavity shading of the asset look: min + range * ao (raw sRGB space) */
export const ASSET_SHADE = { min: 0.5, range: 0.5 };
const ARM_BOW = () => ASSET_LIMB.bow;
const FOOT_FWD = () => ASSET_LIMB.footFwd;
/** leg-local y stretched by the leg length tuning (hip pivot fixed) */
const LY = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * TU.legH;
/** Keep the existing sock and toe markings attached to the reshaped feet. */
const figureFootOffset = () => isSculptedShape() ? 0.1 * (0.7 + 0.3 * TU.legTip) * 0.22 + 0.035 : 0;
/** outward offset of the sculpted leg columns in leg-local space */
const LEG_OUT = () => (isSculptedShape() ? ASSET_LIMB.legOut : 0);
/** outward offset of the sculpted paw (slightly wider stance than the shin) */
const FOOT_OUT = () => LEG_OUT() + (isSculptedShape() ? ASSET_LIMB.footOut : 0);
/** vertical radius of the sculpted paw */
const footRY = () => 0.125 * TU.legTip * ASSET_LIMB.footH;
/** the floor line expressed in leg-local coordinates */
const legLocalGround = () => -rig.HOVER + 0.003 - (rig.HIP_L[1] - rig.LIMB_TOP[1]);
/**
 * Centre of the sculpted paw. The asset's paw is a plump ball whose widest
 * point sits roughly a quarter of its height *above* the floor, with the sole
 * cut flat by the ground — ours used to sit almost on the floor, so the shape
 * degraded into a cone that flares down into a slab. Anchoring the centre to
 * the floor with the same 0.73 ratio gives the same rounded boot.
 */
const footCenterY = () => legLocalGround() + 0.73 * footRY() - 0.014;

/** head-local point -> bind space */
const hd = (x: number, y: number, z: number): V3 => [x * HS, y * HS + HO, z * HS];
const hr = (x: number, y: number, z: number): V3 => [x * HS, y * HS, z * HS];

/* =====================================================================
 *  Signed distance primitives
 * ===================================================================== */
interface Shape {
  t: 0 | 1 | 2 | 3 | 4 | 5 | 6; // ellipsoid | round cone | slab | tube | rounded box | face patch | front column
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
  path?: { a: V3; d: V3; invLength2: number; radius: number; radiusDelta: number }[];
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
/** Rounded box with half-extents; useful for a softly sculpted, flat-soled paw. */
function roundBox(part: PartName, c: V3, r: V3, radius: number, k = 0): Shape {
  const s = blank(part, k, 0, 0.02);
  s.t = 4;
  s.c = c;
  s.r = r;
  s.ra = radius;
  s.bc = c;
  s.br = Math.hypot(...r);
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
/** A single continuous, gently tapered tube along the tail's curved centreline. */
function tailTube(points: V3[], radii: number[], k = 0): Shape {
  const s = blank("torso", k, 0, 0.02);
  s.t = 3;
  s.path = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], p[j]); max[j] = Math.max(max[j], p[j]); }
  s.bc = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  s.br = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    s.br = Math.max(s.br, Math.hypot(p[0] - s.bc[0], p[1] - s.bc[1], p[2] - s.bc[2]) + radii[i]);
    if (i + 1 === points.length) continue;
    const next = points[i + 1];
    const d: V3 = [next[0] - p[0], next[1] - p[1], next[2] - p[2]];
    s.path.push({ a: p, d, invLength2: 1 / Math.max(1e-9, d[0] ** 2 + d[1] ** 2 + d[2] ** 2), radius: radii[i], radiusDelta: radii[i + 1] - radii[i] });
  }
  return s;
}
/** The same continuous tube, but attached to any limb part (arms, legs, tail). */
function tube(part: PartName, points: V3[], radii: number[], k = 0): Shape {
  const s = tailTube(points, radii, k);
  s.part = PI[part];
  // Keep the centre inside the shard so the paint/frustum culling stays sane.
  return s;
}
/**
 * A flat elliptical patch that hugs the front of the head. An ellipsoid can't
 * do this job: the face is almost flat over the muzzle, so a small sphere
 * either misses the skin entirely or has to grow big enough to wrap the whole
 * skull. This paints an ellipse in x/y and only the shell `halfZ` deep in z.
 */
function fpatch(part: PartName, c: V3, rx: number, ry: number, halfZ = 0.3): Shape {
  const s = blank(part, 0, 0, 0.02);
  s.t = 5;
  s.c = c;
  s.r = [rx, ry, halfZ];
  s.bc = c;
  s.br = Math.max(rx, ry, halfZ);
  return s;
}
/**
 * An upright elliptical column that only exists in front of `c[2]`. This is
 * exactly how the exported sculpt's belly mask works (ellipse in x/y, z > 0.1),
 * so the white patch keeps a clean edge on the flanks instead of the ragged
 * smear a z-banded patch leaves there.
 */
function frontColumn(part: PartName, cx: number, cy: number, zMin: number, rx: number, ry: number): Shape {
  const s = blank(part, 0, 0, 0.02);
  s.t = 6;
  s.c = [cx, cy, zMin];
  s.r = [rx, ry, 0];
  s.bc = [cx, cy, zMin];
  s.br = Math.max(rx, ry, 1);
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
  if (s.t === 6) {
    const dx = (x - s.c[0]) / s.r[0];
    const dy = (y - s.c[1]) / s.r[1];
    const flat = (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(s.r[0], s.r[1]);
    return Math.max(flat, s.c[2] - z);
  }
  if (s.t === 5) {
    // elliptical disc: radial distance to the ellipse edge, intersected with
    // a thin shell along z so the patch stays on the face it was drawn for
    const dx = (x - s.c[0]) / s.r[0];
    const dy = (y - s.c[1]) / s.r[1];
    const e = Math.sqrt(dx * dx + dy * dy);
    const flat = (e - 1) * Math.min(s.r[0], s.r[1]);
    const band = Math.abs(z - s.c[2]) - s.r[2];
    return Math.max(flat, band);
  }
  if (s.t === 4) {
    const radius = s.ra;
    const qx = Math.abs(x - s.c[0]) - s.r[0] + radius;
    const qy = Math.abs(y - s.c[1]) - s.r[1] + radius;
    const qz = Math.abs(z - s.c[2]) - s.r[2] + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - radius;
  }
  if (s.t === 3) {
    let closest = Infinity, radius = 0;
    for (const segment of s.path!) {
      const dx = x - segment.a[0], dy = y - segment.a[1], dz = z - segment.a[2];
      const t = Math.max(0, Math.min(1, (dx * segment.d[0] + dy * segment.d[1] + dz * segment.d[2]) * segment.invLength2));
      const ex = dx - segment.d[0] * t, ey = dy - segment.d[1] * t, ez = dz - segment.d[2] * t;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < closest) { closest = d2; radius = segment.radius + segment.radiusDelta * t; }
    }
    return Math.sqrt(closest) - radius;
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
const TAIL_CONTROL_R = [0.12, 0.128, 0.128, 0.122];
let TAIL_R = TAIL_CONTROL_R;
const TAIL_SAMPLES = 18;
// Scale around the attachment point, so the whole tail and its base are 10%
// smaller without pulling the tail away from the body.
const TAIL_SCALE = 0.9;
/** Round the whole bend instead of joining three visibly swollen segments. */
export function buildTailPath(height: number) {
  const root = new THREE.Vector3(TAIL0[0][0], TAIL0[0][1] * height, TAIL0[0][2]);
  const controls = TAIL0.map(p => new THREE.Vector3(p[0], p[1] * height, p[2]).sub(root).multiplyScalar(TAIL_SCALE).add(root));
  const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal");
  const points: V3[] = [], radii: number[] = [];
  for (let i = 0; i <= TAIL_SAMPLES; i++) {
    const t = i / TAIL_SAMPLES;
    const p = curve.getPoint(t);
    points.push([p.x, p.y, p.z]);
    const along = t * (TAIL_CONTROL_R.length - 1);
    const index = Math.min(TAIL_CONTROL_R.length - 2, Math.floor(along));
    radii.push(THREE.MathUtils.lerp(TAIL_CONTROL_R[index], TAIL_CONTROL_R[index + 1], along - index) * TAIL_SCALE);
  }
  return { points, radii };
}

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
    if (isSculptedShape()) {
      // Figurine silhouette: a full upright chest flows into a softly rounded
      // pelvis and into the head, instead of enlarging the classic pear.
      const volumes = rig.selfVolumes(T).torso;
      volumes.forEach((v, i) => this.add(ell("torso", v.c, v.r, [0, 0.22, 0.14][i])));
    } else {
      // Preserve the original silhouette exactly for side-by-side comparison.
      this.add(ell("torso", [0, ty(-0.2), 0.0], [0.4 * bb, ty(0.38) * (0.7 + 0.3 * bb), 0.33 * bb]));
      this.add(ell("torso", [0, ty(0.14), 0.0], [0.33 * bt, ty(0.34) * (0.65 + 0.35 * bt), 0.27 * (0.5 + 0.5 * bt)], 0.26));
      this.add(ell("torso", [0, ty(-0.14), 0.08 + 0.07 * (fat - 1)], [0.3 * bb * (0.85 + 0.15 * fat), ty(0.33) * (0.85 + 0.15 * fat), 0.28 * fat], 0.18));
    }
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
      const figure = isSculptedShape();
      if (figure) {
        // Asset-style arm: a smooth, almost straight tube that drifts outward
        // through the elbow and comes back in at the wrist, ending in a round
        // mitten that melts into the forearm. Every point below is the traced
        // asset curve (shoulder -> elbow -> wrist) mapped into arm-local units,
        // so the silhouette matches the exported cat instead of a bent "hook".
        const kA = (0.7 * ar + 0.3 * at) * ASSET_LIMB.armR;
        // Both bind frames share +x, so the outward drift is mirrored by hand.
        const sage = a === "armL" ? 1 : -1;
        const bow = ARM_BOW() * sage;
        const rTop = 0.0665 * kA;
        // One continuous tube along the traced asset curve (shoulder -> gentle
        // elbow bow -> wrist). A chain of separate cones left visible rings
        // where the pieces met, which is what made the arm look "weird".
        const P0: [number, number, number] = [0.36, 1.26, 0.03];
        const P1: [number, number, number] = [0.54, 1.0, 0.06];
        const P2: [number, number, number] = [0.52, 0.7, 0.1];
        // Asset y 1.26 (shoulder) .. 0.61 (paw centre) maps to arm-local
        // +0.20 .. -0.22, so the arm hangs from the real shoulder joint all
        // the way down to the knee instead of stopping at mid-chest.
        const SY = 0.7, SH = 1.26, SX = 0.16, SZ = 0.5;
        const curvePt = (t: number) => {
          const u = 1 - t;
          const ax = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0];
          const ay = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
          const az = u * u * P0[2] + 2 * u * t * P1[2] + t * t * P2[2];
          return { x: ((ax - P0[0]) / SX) * bow, y: 0.2 + (ay - SH) * SY, z: (az - P0[2]) * SZ };
        };
        const pts: V3[] = [];
        const radii: number[] = [];
        const N = 9;
        for (let i = 0; i <= N; i++) {
          const t = -0.16 + (i / N) * 1.14; // start buried in the chest, end past the wrist
          const q = curvePt(t);
          // Tuck the buried end towards the centre line, otherwise the tube
          // pops out of the cheek as a little pointed flap.
          const tuck = t < 0.1 ? ((0.1 - t) / 0.26) * 0.085 : 0;
          pts.push(B(a, [q.x - tuck * Math.sign(bow), q.y, q.z]));
          // Asset arm tapers from a thick shoulder to a slimmer wrist, but the
          // forearm stays full: the sculpt's tube only steps down right at the
          // mitten, it does not whittle away along the whole arm.
          radii.push(rTop * (1.12 - 0.13 * Math.min(1, Math.max(0, t + 0.1))));
        }
        const arm = tube(a, pts, radii, 0.03);
        arm.col.setHex(this.fur);
        this.arms.push(arm);
        // The mitten is a soft ball that blends into the wrist (asset k = 0.07)
        // instead of a separate sphere stuck on the end.
        const pawR = 0.0765 * kA * ASSET_LIMB.pawR;
        // A softer blend (asset k ~0.07) melts the mitten into the wrist instead
        // of leaving a ball stuck on the end of the arm.
        const paw = ell(a, B(a, [bow * 0.96, PAW() - 0.006, 0.03]), [pawR * 1.06, pawR * 1.14, pawR * 1.06], 0.07);
        paw.col.setHex(this.fur);
        this.arms.push(paw);
      } else {
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
    }
    // ---- short stubby legs with round feet ----
    const lr = T.legRoot, lt = T.legTip;
    for (const l of ["legL", "legR"] as const) {
      const figure = isSculptedShape();
      if (figure) {
        // Asset-style leg: a thick, almost cylindrical shin that runs straight
        // down into a big rounded paw sticking out towards the front — the
        // exported cat's sturdy legs, instead of a narrow stick + flat slab.
        // Nearly cylindrical shin: the asset's legs keep their thickness all the
        // way down, only rounding off at the paw.
        const kL = (0.6 * lr + 0.4 * lt) * ASSET_LIMB.thighR;
        this.add(cone(l, B(l, [LEG_OUT(), 0.115, 0]), B(l, [LEG_OUT(), LY(-0.20), 0.02]),
          0.148 * kL, 0.145 * kL * ASSET_LIMB.ankle, 0.05));
      } else {
        this.add(cone(l, B(l, [0, 0.08, 0]), B(l, [0, LY(-0.17), 0.02]), 0.14 * lr, 0.135 * (0.5 * lr + 0.5 * lt), 0.08));
      }
      // A wide foot blends into the leg like the reference figure; its bottom
      // stays at the same height as the classic foot.
      const footH = 0.1 * (0.7 + 0.3 * lt);
      const figureH = footH * 0.78;
      const footY = LY(-0.25) - (figure ? figureFootOffset() : 0);
      if (figure) {
        // Smooth, rounded paw: as wide as the shin and clearly longer than it,
        // with a soft sole (the ground cut flattens the very bottom).
        // Same width as the shin, clearly longer than it and taller than a
        // slab, so it reads as the asset's rounded paw rather than a plate.
        // Rounded box, not a sphere: the asset's paw has flat-ish inner and
        // outer sides with a soft sole, so the gap between the legs stays a
        // clean slit instead of a rounded valley. Low blend value keeps the
        // ankle crease visible.
        // Smooth plump paw that melts into the shin (the ground cut flattens the
        // sole), so the leg reads as one soft boot like the asset's.
        this.add(ell(l, B(l, [FOOT_OUT(), footCenterY(), FOOT_FWD()]), [
          0.156 * lt * ASSET_LIMB.footW,
          0.125 * lt * ASSET_LIMB.footH,
          0.212 * lt * ASSET_LIMB.footD,
        ], ASSET_LIMB.footBlend));
      } else {
        this.add(ell(l, B(l, [0, footY, 0.06]), [0.145 * lt, footH, 0.175 * lt], 0.06));
      }
    }
    // ---- tail ----
    this.add(tailTube(TAIL, TAIL_R, 0.08 * TAIL_SCALE));
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
    for (const l of ["legL", "legR"] as const) {
      if (isSculptedShape()) {
        this.paint(ell("torso", B(l, [FOOT_OUT(), footCenterY() + 0.01, FOOT_FWD() + 0.02]), [
          0.156 * lt * ASSET_LIMB.footW * 1.16,
          footRY() * 1.25,
          0.212 * lt * ASSET_LIMB.footD * 1.1,
        ]), col, soft);
      } else {
        this.paint(ell("torso", B(l, [0, LY(-0.25) - figureFootOffset(), 0.07]), [0.22 * lt, 0.13, 0.26 * lt]), col, soft);
      }
    }
    this.toes(new THREE.Color(col).multiplyScalar(0.78).lerp(new THREE.Color(0xe39aae), 0.45).getHex());
  }
  /** little toe grooves on the front of the feet */
  toes(col: number) {
    const lt = TU.legTip;
    for (const l of ["legL", "legR"] as const) {
      for (const dx of [-0.05, 0, 0.05]) {
        if (isSculptedShape()) {
          // Shallow painted creases on the front of the paw, like the sculpt's
          // toe lines (carving them into the mesh only made spikes).
          // Deep in z so the paw surface always passes through the shape, thin
          // in x and tall in y: the trace on the paw is one clean crease.
          this.paint(
            ell("torso", B(l, [FOOT_OUT() + dx * lt, footCenterY() + 0.20 * footRY(), FOOT_FWD()]),
              [0.012, 0.085, 0.2]),
            col, 0.008,
          );
        } else {
          this.paint(ell("torso", B(l, [dx * lt, LY(-0.31) - figureFootOffset(), 0.2 * lt]), [0.008, 0.02, 0.06]), col, 0.005);
        }
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
    // "from" originally selected one of three tail sections; keep that
    // meaning while painting the smooth curve in a single continuous pass.
    const start = Math.min(TAIL.length - 2, Math.floor(from / 3 * (TAIL.length - 1)));
    this.paint(tailTube(TAIL.slice(start), TAIL_R.slice(start).map(r => r + 0.04)), col, 0.012);
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
  /**
   * Markings matched to the exported 3D cat (asset shape only).
   * Three forehead stripes, long cheek dashes, a tall white chest/belly, white
   * mittens and socks, two rings per limb and a striped tail.
   */
  tabbyAsset(stripe: number, white: number) {
    const soft = 0.004;
    // Every number below is the exported 3D cat's own marking coordinate. The
    // asset is authored in head/torso-local units that match ours 1:1, so the
    // pattern lands where the model has it instead of being eyeballed.
    //
    // ── head: three straight forehead stripes at fixed x (asset 0 / ±0.082).
    // Painted as thin vertical slabs, not meridians: meridians converge at the
    // crown and the three stripes merge into one blob there.
    for (const [xc, w] of [[-0.084, 0.0105], [0, 0.012], [0.084, 0.0105]] as const) {
      this.paint(
        slab(hd(xc, 0.27, 0.1), [1, 0, 0], w, 0.25),
        stripe, 0.004, 1, PI.head,
      );
    }
    // ── two horizontal cheek dashes beside each eye (asset y -0.035 / -0.105
    //    over |x| 0.40 … 0.58) ──
    for (const s of [1, -1] as const) {
      for (const y of [-0.035, -0.105]) {
        this.paint(
          slab(hd(s * 0.46, y, 0.3), [0, 1, 0], 0.0085, 0.15),
          stripe, 0.005, 1, PI.head,
        );
      }
    }
    // ── three wide bands wrapping the back of the head ──
    // The asset pins these at fixed angles around the head (φ -1.12 / -1.52 /
    // -1.92), so they read as three horizontal stripes from behind and fade out
    // towards the cheeks.
    for (const [phi, w] of [[-1.12, 0.03], [-1.52, 0.034], [-1.92, 0.03]] as const) {
      const y = 0.5 * Math.cos(phi) + 0.045;
      const pts: V3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = 180 + -56 + (112 * i) / 10;
        pts.push(this.headAt(a, y - 0.02 * Math.cos((Math.PI * i) / 10)));
      }
      this.stroke(pts, w, w * 1.15, stripe, soft);
    }
    // ── torso: five rings over the flanks + one stripe down the spine ──
    // asset y -> body rest space (anchored on the white belly patch)
    const SY = (y: number) => (y - 0.892) * 0.6265 - 0.012;
    // Rings are sampled densely so they hug the barrel instead of cutting a
    // chord through it (a coarse polyline only shows up as broken fragments).
    const ring = (y: number, a0: number, a1: number, s: number, r0: number, r1: number, dip: number) => {
      const pts: V3[] = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(this.bodyAt(s * (a0 + (a1 - a0) * t), y - dip * Math.sin(Math.PI * t)));
      }
      this.stroke(pts, r0, r1, stripe, soft);
    };
    for (const ay of [1.15, 0.995, 0.84, 0.69, 0.545]) {
      // Start just behind the belly rim. The patch is narrower now (0.203 of
      // the body), so the rings have orange room to wrap further forward, like
      // the sculpt's flank stripes that peek around the white patch.
      for (const s of [1, -1] as const) ring(SY(ay), 63, 152, s, 0.021, 0.028, 0.014);
    }
    this.stroke([this.bodyAt(180, SY(0.62)), this.bodyAt(180, SY(0.95)), this.bodyAt(180, SY(1.28))], 0.017, 0.013, stripe, soft);
    // ── arms: three rings on the upper arm (asset t .2 / .365 / .53) ──
    const armAt = (t: number) => AY(0.15 - 0.355 * t);
    for (const a of ["armL", "armR"] as const) {
      for (const t of [0.2, 0.365, 0.53]) {
        this.paint(slab(B(a, [0, armAt(t), 0]), Bdir(a, [0, 1, 0]), 0.021, 0.16), stripe, 0.011);
      }
    }
    // ── legs: two rings just above the sock ──
    // Asset legs carry bands at model y 0.39 / 0.475 and the sock ends at
    // y ~0.25. Converted to this rig that is two leg-local rings at 0.034 and
    // -0.028, i.e. right above the cuff with a hair of orange between them.
    for (const l of ["legL", "legR"] as const) {
      for (const y of [0.034, -0.028]) {
        this.paint(slab(B(l, [0, y, 0.005]), [0, 1, 0], 0.022, 0.18), stripe, soft);
      }
    }
    this.tailBands(stripe, 4);
    // ── tall white chest + belly patch (asset ellipse 0.318 × 0.376) ──
    // The exported cat's belly ellipse is 0.318 x 0.376 and runs from the
    // crotch all the way up to the neck, so it is taller and sits higher than
    // the old plush bib.
    // A flat disc hugging the barrel: an ellipsoid buried in the chest can
    // only paint the very front of it, which is why the white patch stayed
    // narrow and its outline stayed jagged. The disc reaches the flanks like
    // the sculpt's own z > 0.1 mask, and its edge follows a smooth ellipse.
    // Asset mask: ellipse 0.318 x 0.376 in x/y, everything in front of z 0.1.
    // Using the same construction keeps a crisp edge on the flanks, where a
    // z-banded patch smeared into the stripes.
    // Asset belly: a tall, narrow egg (half-width 0.235 vs half-height 0.257)
    // that leaves a thick orange margin on both flanks. The old patch was wider
    // than tall, so it filled the whole front and touched the arms.
    this.paint(frontColumn("torso", 0, ty(-0.041), 0.085, 0.203, 0.252), white, 0.011, 1, PI.torso);
    // Fluffy rim: a ring of small soft blobs wobbles the outline the way the
    // sculpt's noise mask does, so the patch reads as fur, not a sticker.
    // Low-frequency wobble instead of per-blob jitter: the sculpt's edge is
    // fur-soft, not sawtoothed.
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const wob = 1 + 0.035 * Math.sin(a * 3 + 0.7) + 0.02 * Math.sin(a * 5 + 2.1);
      this.paint(frontColumn("torso", Math.cos(a) * 0.213 * wob, ty(-0.045) + Math.sin(a) * 0.257 * wob, 0.085, 0.03, 0.028), white, 0.016, 1, PI.torso);
    }
    // ── white mittens and socks: a clean cuff line, like the asset's
    //    "armT > 0.73" / "y < 0.268" colour masks ──
    for (const a of ["armL", "armR"] as const) {
      // Only the mitten itself is white (asset: armT > 0.73). A taller cuff
      // made the whole forearm read as one white blob next to the belly.
      const mx = (a === "armL" ? 1 : -1) * ASSET_LIMB.bow;
      const pr = 0.0765 * (0.7 * TU.armRoot + 0.3 * TU.armTip) * ASSET_LIMB.armR * ASSET_LIMB.pawR;
      // The whole mitten is white, cut by a cuff ring just above the paw ball
      // (the sculpt masks it with `armT > 0.73`, i.e. only the last stretch of
      // the arm). A slab gives the same clean, high-contrast cut the legs have.
      const cuffY = PAW() + 0.046;
      this.paint(slab(B(a, [0, cuffY - 0.11, 0.03]), Bdir(a, [0, 1, 0]), 0.11, 0.22), white, 0.008);
      // Torn cuff: the sculpt draws that boundary with the same fur noise as
      // the socks, so it is ragged instead of a clean ring.
      for (let i = 0; i < 13; i++) {
        const a2 = (i / 13) * Math.PI * 2;
        const jy = 0.008 * Math.sin(i * 2.31) + 0.006 * Math.cos(i * 4.7);
        this.paint(
          ell(a, B(a, [mx * 0.96 + Math.cos(a2) * pr * 0.52, cuffY - 0.012 + jy, 0.03 + Math.sin(a2) * pr * 0.52]),
            [pr * 0.46, 0.024, pr * 0.46]),
          white, 0.006,
        );
      }
    }
    for (const l of ["legL", "legR"] as const) {
      // Asset sock top is model y 0.238-0.268, i.e. ~0.11 of body height above
      // the floor; ours sat at 0.135, which left too little orange shin below
      // the belly stripes.
      const cut = footCenterY() + 0.135;
      this.paint(slab(B(l, [0, cut - 0.235, 0.02]), [0, 1, 0], 0.235, 0.3), white, 0.005);
      // Ragged cuff: the sculpt masks the sock with `y < 0.25 + noise`, so its
      // edge wanders around the leg instead of cutting a clean ring. A ring of
      // soft blobs gives the same torn fur line.
      const R = 0.128;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const jy = 0.011 * Math.sin(i * 2.31) + 0.009 * Math.cos(i * 4.7);
        this.paint(
          ell("torso", B(l, [Math.sin(a) * R, cut - 0.016 + jy, Math.cos(a) * R + 0.02]),
            [0.038, 0.024, 0.038]),
          white, 0.005,
        );
      }
    }
    // The sculpt's toe creases read as pale seams catching the light: paint
    // them a shade under the sock white so the paw keeps its three toes.
    this.toes(new THREE.Color(white).multiplyScalar(0.76).lerp(new THREE.Color(0xc0b0a0), 0.5).getHex());
  }
  /** Wide white face patch + chin, exactly the shape the exported cat has. */
  assetMuzzle(col = WHITE) {
    const soft = 0.008;
    // White mask traced from the exported cat: a wide "ω" mouth oval with
    // fluffy cheeks and a slim chin bridge. Our head is a different mesh, so
    // these are flat patches pinned to the real face front (z ~ 0.55 head
    // local) instead of spheres buried inside the skull — that is why the
    // pattern never showed up before.
    const F = 0.55;
    const patch = (x: number, y: number, rx: number, ry: number, z = F, sft = soft) =>
      this.paint(fpatch("head", hd(x, y, z), hr(rx, ry, 0.2)[0], hr(rx, ry, 0.2)[1], hr(rx, ry, 0.2)[2]), col, sft, 1, PI.head);
    // One wide "ω" mask: a broad cap across the muzzle with a big round chin
    // lobe hanging under it, exactly the silhouette of the sculpt's own mask.
    patch(0, -0.205, 0.205, 0.086);
    patch(0, -0.29, 0.126, 0.092, F - 0.012);
    // the cap widens a touch towards the cheeks
    for (const s of [1, -1] as const) patch(s * 0.15, -0.215, 0.06, 0.056, F - 0.004, 0.014);
    // fluffy rim (same trick as the belly)
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.03 + (i / 11) * 0.94);
      patch(Math.cos(a) * 0.205 * 0.92, -0.215 + Math.sin(a) * 0.096, 0.04, 0.036, F, 0.018);
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
  eye: "puppy" | "big" | "pill" | "plush";
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
  /** feed the palette to the vertex colours the way the 3D asset does */
  rawColors?: boolean;
}

const BLACK = 0x1e1e23;
const WHITE = 0xfaf8f4;
const PINK_EAR = 0xf4b2c0;
const DARK_EAR = 0x2c2a4a;

function recipeFor(id: AnimalId): Recipe {
  type R = Omit<Recipe, "shapes" | "arms" | "paints" | "faceStrokes" | "px" | "py" | "cross" | "lid" | "tilt"> & Partial<Recipe>;
  const done = (c: Cat, r: R, pad = 0xf4a3b5, plainPaws = false): Recipe => {
    // The exported asset has plain white paws; the pink beans only belong to
    // the plush look, so they are skipped while the asset shape is active.
    if (!(plainPaws && getShapeMode() === "asset")) c.pads(pad);
    return { px: 0, py: 0, cross: 0, lid: 0, tilt: 0, ...r, shapes: c.shapes, arms: c.arms, paints: c.paints, faceStrokes: c.faceStrokes };
  };
  switch (id) {
    case "jambul": {
      // the round orange plush buddy: no ears, a stitched curl on top, huge
      // glossy black eyes with a glint, blush and a tiny smile — dressed in a
      // teal vest with a cream collar, a dark sash with a gold buckle, teal
      // shorts, striped socks, brown boots and cream hand mitts
      const c = new Cat(0xe07a2f);
      // stitched curl on top of the head
      c.faceStrokes.push({
        x: 0, y: 0.4,
        pts: [[0.03, 0.0], [0.07, 0.05], [0.04, 0.11], [-0.03, 0.12], [-0.06, 0.06], [-0.02, 0.0]],
        w0: 0.04, w1: 0.032, col: 0x9c4f16,
      });
      c.blush(0xe8603c);
      // ── outfit, matched to the reference plush ──
      // cream shirt peeking at the collar and below the vest
      c.paint(ell("torso", [0, ty(0.33), 0.02], [0.3, ty(0.05), 0.29]), 0xf3ead9, 0.01, 1, PI.torso);
      // big teal vest: shoulders down to mid-torso, longer in front
      c.paint(ell("torso", [0, ty(0.14), 0.03], [0.43, ty(0.21), 0.41]), 0x2f8f86, 0.012, 1, PI.torso);
      // vest trim: pale stripes like the woven band on the reference
      c.paint(ell("torso", [0, ty(0.05), 0.38], [0.36, ty(0.035), 0.1]), 0xd8c9a3, 0.009, 1, PI.torso);
      // thick dark sash across the lower chest with round studs
      c.paint(ell("torso", [0, ty(-0.05), 0], [0.44, ty(0.06), 0.42]), 0x2b3a3c, 0.01, 1, PI.torso);
      c.paint(ell("torso", [-0.16, ty(-0.05), 0.4], [0.032, 0.028, 0.05]), 0xd8c9a3, 0.006, 1, PI.torso);
      c.paint(ell("torso", [0.02, ty(-0.05), 0.42], [0.032, 0.028, 0.05]), 0xd8c9a3, 0.006, 1, PI.torso);
      // gold buckle front and centre, big enough to read
      c.paint(ell("torso", [0.14, ty(-0.05), 0.4], [0.09, 0.095, 0.08]), 0xf2c14e, 0.007, 1, PI.torso);
      c.paint(ell("torso", [0.14, ty(-0.05), 0.45], [0.046, 0.05, 0.05]), 0xc98f1d, 0.006, 1, PI.torso);
      // teal shorts over the hips, with the orange belly showing in between
      c.paint(ell("torso", [0, ty(-0.3), 0], [0.43, ty(0.15), 0.41]), 0x2f8f86, 0.012, 1, PI.torso);
      // teal short sleeves on the upper arms
      const jsy = 0.2 * (0.7 * TU.armRoot + 0.3 * TU.armTip) * ASSET_LIMB.armR * ASSET_LIMB.pawR;
      for (const a of ["armL", "armR"] as const)
        c.paint(ell("torso", B(a, [ARM_BOW() * 0.7, rig.LIMB_TOP[1] - 0.06, 0.0]), [jsy * 1.75, 0.085, jsy * 1.75]), 0x2f8f86, 0.01);
      // cream hand mitts (arms only — the legs wear boots)
      const jat = TU.armTip;
      for (const a of ["armL", "armR"] as const)
        c.paint(ell("torso", B(a, [0, PAW() - 0.025 * jat, 0.0]), [0.17 * jat, 0.13 * jat, 0.17 * jat]), 0xf3ead9, 0.008);
      // brown boots reaching up the shin, striped cuff on top
      for (const l of ["legL", "legR"] as const) {
        if (isSculptedShape()) {
          const fy = footCenterY(), frr = footRY(), fo = FOOT_OUT(), ff = FOOT_FWD();
          // foot + shaft up the shin
          c.paint(ell("torso", B(l, [fo, fy + 0.01, ff + 0.02]), [0.156 * ASSET_LIMB.footW * 1.2, frr * 1.3, 0.212 * ASSET_LIMB.footD * 1.14]), 0x5f3a1e, 0.008);
          c.paint(ell("torso", B(l, [fo, fy + frr * 1.45, ff * 0.35]), [0.14, 0.24, 0.14]), 0x5f3a1e, 0.01);
          const ring = (y: number, col: number) => c.paint(ell("torso", B(l, [0.02, y, 0.0]), [0.132, 0.055, 0.132]), col, 0.009);
          ring(fy + frr * 1.45 + 0.26, 0xf3ead9);
          ring(fy + frr * 1.45 + 0.4, 0xe07a2f);
          ring(fy + frr * 1.45 + 0.54, 0xf3ead9);
        } else {
          c.paint(ell("torso", B(l, [0, LY(-0.25) - figureFootOffset(), 0.07]), [0.22, 0.13, 0.26]), 0x5f3a1e, 0.008);
          c.paint(ell("torso", B(l, [0, LY(-0.2) - figureFootOffset(), 0.03]), [0.2, 0.12, 0.2]), 0x5f3a1e, 0.01);
          const ring2 = (y: number, col: number) => c.paint(ell("torso", B(l, [0, y - figureFootOffset(), 0.05]), [0.2, 0.05, 0.2]), col, 0.009);
          ring2(LY(-0.15), 0xf3ead9);
          ring2(LY(-0.11), 0xe07a2f);
          ring2(LY(-0.07), 0xf3ead9);
        }
      }
      // tiny closed smile (no cat omega mouth, no tongue) like the plush
      c.faceStrokes.push({ x: 0, y: -0.34, pts: [[-0.075, 0.05], [-0.035, 0.005], [0.035, 0.005], [0.075, 0.05]], w0: 0.028, w1: 0.024, col: 0x5a2c14 });
      return done(c, {
        eye: "plush", iris: 0, nose: 0xc9671f, line: 0x5a2c14, noMouth: true, whisker: 0xe07a2f,
      }, 0xe8834a, true);
    }
    case "oyen": {
      // the crayon cat: orange tabby, white muzzle/belly/paws, huge green eyes
      // palette lifted straight from the exported 3D cat (deeper orange)
      const c = new Cat(getShapeMode() === "asset" ? 0xe8903e : 0xf0a24a);
      if (getShapeMode() === "asset") {
        // markings traced from the exported 3D cat
        c.tabbyAsset(0xc2652a, 0xf8f3ec);
        c.assetMuzzle(0xf8f3ec);
      } else {
        c.tabby(0xc8641f, 1.05);
        c.muzzle();
        c.belly(WHITE);
        c.paws(WHITE);
      }
      c.innerEars(getShapeMode() === "asset" ? 0xf2b6a4 : PINK_EAR);
      return done(c, {
        eye: "big", iris: getShapeMode() === "asset" ? 0x8bbe5e : 0xc6e79a, cross: 0.35, py: 0.25, lid: 0.12, tilt: 0.3,
        nose: getShapeMode() === "asset" ? 0xf09aa4 : 0xf28a9a,
        line: getShapeMode() === "asset" ? 0x3a2416 : 0x4a2a17,
        whisker: getShapeMode() === "asset" ? 0x6b4122 : 0x5a3a26,
        // The exported Oyen is the reference here, so its fur is uploaded with
        // the exact same colour space the asset uses (see the vertex loop).
        rawColors: getShapeMode() === "asset",
      }, 0xf4a3b5, true);
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
function pruneOldAssets(key: string) {
  const revision = key.slice(key.indexOf("#"));
  for (const [oldKey, asset] of assetCache) {
    if (oldKey.endsWith(revision)) continue;
    assetCache.delete(oldKey);
    // An old preview can still use these arrays and will re-upload them if
    // needed; disposal releases GPU buffers belonging to obsolete shapes.
    asset.geometry.dispose();
    asset.armGeometry.dispose();
  }
}
/** Transferable buffers used to build the exact same full-detail mesh off the UI thread. */
export interface PackedCharacterGeometry {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint16Array | Uint32Array;
}
export interface PackedCharacterAsset {
  geometry: PackedCharacterGeometry;
  armGeometry: PackedCharacterGeometry;
}
function packGeometry(g: THREE.BufferGeometry): PackedCharacterGeometry {
  const a = (name: string) => (g.getAttribute(name) as THREE.BufferAttribute).array;
  return {
    position: Float32Array.from(a("position")), normal: Float32Array.from(a("normal")),
    color: Float32Array.from(a("color")), skinIndex: Uint16Array.from(a("skinIndex")),
    skinWeight: Float32Array.from(a("skinWeight")),
    index: g.getIndex()!.array instanceof Uint32Array ? Uint32Array.from(g.getIndex()!.array) : Uint16Array.from(g.getIndex()!.array),
  };
}
function unpackGeometry(data: PackedCharacterGeometry) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  g.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(data.skinIndex, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(data.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  g.computeBoundingSphere();
  return g;
}
export function hasCharacterAsset(def: AnimalDef, noEars = false) {
  return assetCache.has(`${def.id}${noEars ? "~ne" : ""}#${tuningKey(getRigTuning())}`);
}
/** Copy rather than transfer the cached worker buffers, so worker rendering stays valid. */
export function packCharacterAsset(def: AnimalDef, noEars = false): PackedCharacterAsset {
  const asset = getAsset(def, noEars);
  return { geometry: packGeometry(asset.geometry), armGeometry: packGeometry(asset.armGeometry) };
}
/** Install worker-built geometry only if the player's tuning still matches. */
export function installCharacterAsset(def: AnimalDef, noEars: boolean, revision: string, data: PackedCharacterAsset) {
  if (revision !== tuningKey() || hasCharacterAsset(def, noEars)) return false;
  const T = getRigTuning();
  TU = T;
  HS = 0.745 * T.head;
  rig.applyRig(T);
  computeBind();
  BH = T.bodyH;
  ({ points: TAIL, radii: TAIL_R } = buildTailPath(BH));
  HB = rig.HEAD_OFFSET;
  HO = rig.HEAD_OFFSET + T.neck;
  NO_EARS = noEars;
  const recipe = recipeFor(def.id);
  NO_EARS = false;
  const key = `${def.id}${noEars ? "~ne" : ""}#${tuningKey(T)}`;
  pruneOldAssets(key);
  assetCache.set(key, {
    geometry: unpackGeometry(data.geometry), armGeometry: unpackGeometry(data.armGeometry), recipe,
    bindPos: bindPos.map(v => v.clone()), bindQuat: bindQuat.map(q => q.clone()),
    boneInverses: bindMat.map(m => m.clone().invert()),
  });
  return true;
}

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

/**
 * Surface for the asset-shaped cats. It copies the 3D preview's material
 * (low white sheen, a touch of clearcoat) instead of the plush-toy sheen, so
 * the vertex-coloured fur keeps the asset's saturated orange instead of being
 * veiled in white.
 */
export const SKIN_MATERIAL_ASSET = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0,
  sheen: 0.26,
  sheenRoughness: 0.6,
  sheenColor: new THREE.Color(0xfff3e2),
  clearcoat: 0.22,
  clearcoatRoughness: 0.5,
});

/** Refine only the little tail, leaving the rest of the character mesh (and
 * its frame cost) unchanged. Shared edge midpoints keep the surface watertight. */
function refineTail(geo: THREE.BufferGeometry, tail: Shape, sdf: (x: number, y: number, z: number) => number) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!index) return;
  const vertices = Array.from(pos.array as Float32Array);
  const triangles: number[] = [];
  const edges = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = edges.get(key);
    if (cached !== undefined) return cached;
    let x = (vertices[a * 3] + vertices[b * 3]) / 2;
    let y = (vertices[a * 3 + 1] + vertices[b * 3 + 1]) / 2;
    let z = (vertices[a * 3 + 2] + vertices[b * 3 + 2]) / 2;
    // Keep the blend at the root intact; refine the exposed curved tube.
    if (z > -0.42 || shapeDist(tail, x, y, z) > 0.045) {
      edges.set(key, -1);
      return -1;
    }
    // Midpoints lie inside the old coarse triangles. Project them back onto
    // the same continuous signed-distance surface before recomputing normals.
    const epsilon = 0.0025;
    const nx = sdf(x + epsilon, y, z) - sdf(x - epsilon, y, z);
    const ny = sdf(x, y + epsilon, z) - sdf(x, y - epsilon, z);
    const nz = sdf(x, y, z + epsilon) - sdf(x, y, z - epsilon);
    const length = Math.hypot(nx, ny, nz) || 1;
    const correction = THREE.MathUtils.clamp(sdf(x, y, z), -0.02, 0.02) / length;
    x -= nx * correction; y -= ny * correction; z -= nz * correction;
    const result = vertices.length / 3;
    vertices.push(x, y, z);
    edges.set(key, result);
    return result;
  };
  for (let i = 0; i < index.count; i += 3) {
    let a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    // Marching-cubes welding can collapse a zero-area source triangle.
    if (a === b || b === c || c === a) continue;
    let ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    const count = Number(ab >= 0) + Number(bc >= 0) + Number(ca >= 0);
    if (count === 0) triangles.push(a, b, c);
    else if (count === 3) triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    else if (count === 1) {
      // Rotate the triangle until its subdivided edge is AB.
      if (bc >= 0) { [a, b, c] = [b, c, a]; ab = bc; }
      else if (ca >= 0) { [a, b, c] = [c, a, b]; ab = ca; }
      triangles.push(a, ab, c, ab, b, c);
    } else {
      // Rotate until AB and BC are the two subdivided edges.
      if (ab < 0) { [a, b, c] = [b, c, a]; [ab, bc] = [bc, ca]; }
      else if (bc < 0) { [a, b, c] = [c, a, b]; [ab, bc] = [ca, ab]; }
      triangles.push(b, bc, ab, a, ab, c, ab, bc, c);
    }
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(triangles);
}

function getAsset(def: AnimalDef, noEars = false): Asset {
  const T = getRigTuning();
  TU = T;
  HS = 0.745 * T.head;
  rig.applyRig(T);
  computeBind();
  BH = T.bodyH;
  ({ points: TAIL, radii: TAIL_R } = buildTailPath(BH));
  HB = rig.HEAD_OFFSET;
  HO = rig.HEAD_OFFSET + T.neck;
  const cacheKey = `${def.id}${noEars ? "~ne" : ""}#${tuningKey(T)}`;
  const cached = assetCache.get(cacheKey);
  if (cached) return cached;
  NO_EARS = noEars;
  const recipe = recipeFor(def.id);
  NO_EARS = false;
  const { paints } = recipe;
  const buildGeo = (shapes: Shape[], rigid: "arms" | "head" | null, contact: Shape[] = []) => {
  const figure = isSculptedShape();
  // The sculpt's toe creases are shading, not geometry: carving them at this
  // mesh resolution only produced spikes, so they are painted instead.
  const grooves: Shape[] = [];
  // A gently grounded sole on the figurine rather than ball-shaped feet.
  // Cut only the body mesh in bind space; the separate hands remain untouched.
  // Crotch slit: the sculpt's legs are two separate columns, so their inner
  // walls stay visible all the way up to the belly. Our pelvis volume used to
  // fill that gap, which is why the game cat had no notch between the legs.
  const assetShape = getShapeMode() === "asset";
  const notch = assetShape
    ? cone("torso", [0, -0.345, 0.005], [0, -0.80, 0.005], 0.03, 0.066, 0.02)
    : null;
  const sdf = (x: number, y: number, z: number) => {
    let d = sceneDist(shapes, x, y, z);
    if (notch && !rigid && y < -0.30 && Math.abs(x) < 0.16) {
      d = -smin(-d, shapeDist(notch, x, y, z), 0.03);
    }
    if (figure && !rigid) {
      d = Math.max(d, -rig.HOVER + 0.003 - y);
      for (const g of grooves) {
        if (Math.abs(x - g.c[0]) < 0.025 && Math.abs(y - g.c[1]) < 0.07 && Math.abs(z - g.c[2]) < 0.08) {
          d = -smin(-d, shapeDist(g, x, y, z), 0.012);
        }
      }
    }
    return d;
  };

  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const s of shapes)
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], s.bc[i] - s.br);
      mx[i] = Math.max(mx[i], s.bc[i] + s.br);
    }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 + 0.1;
  // The optional figurine uses a finer surface for its soft rounded silhouette.
  const res = figure ? Math.min(148, Math.max(80, Math.ceil((2 * ext) / 0.018))) : Math.min(112, Math.max(60, Math.ceil((2 * ext) / 0.026)));

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
  const tail = !rigid ? shapes.find(s => s.t === 3) : undefined;
  if (tail) refineTail(geo, tail, sdf);
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
    if (recipe.rawColors && contact.length) {
      // The exported sculpt is shaded with baked ambient occlusion, so the arm
      // sits in a soft crevice against the flank. Our arm is a separate rigid
      // piece with no baked AO, which is why the two surfaces used to melt into
      // one blob. Darkening the vertices that are a few millimetres away from
      // the neighbouring part recreates that crease.
      const cd = sceneDist(contact, x, y, z);
      const k = 1 - THREE.MathUtils.smoothstep(cd, 0.002, 0.042);
      col.multiplyScalar(1 - 0.26 * k);
    }
    if (recipe.rawColors) {
      // The exported cat bakes its palette (THREE.Color, i.e. linear values)
      // straight into the vertex colours and multiplies them by 0.5 + 0.5 * ao.
      // Doing exactly the same keeps the game cat the same vivid orange as the
      // 3D preview — an extra linear->sRGB pass here is what used to bleach the
      // fur into a pale sand colour.
      col.multiplyScalar(ASSET_SHADE.min + ASSET_SHADE.range * ao);
    } else {
      col.multiplyScalar(0.9 + 0.1 * ao);
    }
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
  const assetMode = getShapeMode() === "asset";
  const geometry = buildGeo(recipe.shapes, null, assetMode ? recipe.arms : []);
  const armGeometry = buildGeo(recipe.arms, "arms", assetMode ? recipe.shapes.filter((sh) => sh.part === PI.torso) : []);

  const asset: Asset = { bindPos: bindPos.map((v) => v.clone()), bindQuat: bindQuat.map((q) => q.clone()), geometry, armGeometry, boneInverses: bindMat.map((m) => m.clone().invert()), recipe };
  pruneOldAssets(cacheKey);
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
    sharedMaterials.add(m);
    decalMatCache.set(key, m);
  }
  return m;
}

function decal(fr: Frame, tris: Tri2[], color: number, layer: number, rough = 0.55, motion?: { mx: number; my: number }): THREE.Mesh | null {
  if (!tris.length) return null;
  const sub = subdivide(tris, 0.022 / fr.scale);
  const pos = new Float32Array(sub.length * 9);
  const nrm = new Float32Array(sub.length * 9);
  const offsets = motion ? [[motion.mx, 0], [-motion.mx, 0], [0, motion.my], [0, -motion.my]] : [];
  const morphPositions = offsets.map(() => new Float32Array(sub.length * 9));
  const morphNormals = offsets.map(() => new Float32Array(sub.length * 9));
  const morphCaches = offsets.map(() => new Map<string, { p: THREE.Vector3; n: THREE.Vector3 }>());
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
      for (let i = 0; i < offsets.length; i++) {
        const [dx, dy] = offsets[i];
        let shifted = morphCaches[i].get(key);
        if (!shifted) {
          start.copy(fr.P).addScaledVector(fr.T, u * fr.scale + dx).addScaledVector(fr.U, v * fr.scale + dy).addScaledVector(fr.D, 0.3);
          shifted = march(fr.shapes, start, dir);
          morphCaches[i].set(key, shifted);
        }
        // The group translates tangentially. Morph only the residual needed to
        // reproject every vertex to the curved face at the new gaze position.
        const tx = fr.T.x * dx + fr.U.x * dy, ty = fr.T.y * dx + fr.U.y * dy, tz = fr.T.z * dx + fr.U.z * dy;
        morphPositions[i][o] = shifted.p.x + shifted.n.x * lift - pos[o] - tx;
        morphPositions[i][o + 1] = shifted.p.y + shifted.n.y * lift - fr.boneY - pos[o + 1] - ty;
        morphPositions[i][o + 2] = shifted.p.z + shifted.n.z * lift - pos[o + 2] - tz;
        morphNormals[i][o] = shifted.n.x - hit.n.x;
        morphNormals[i][o + 1] = shifted.n.y - hit.n.y;
        morphNormals[i][o + 2] = shifted.n.z - hit.n.z;
      }
      o += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  if (motion) {
    g.morphTargetsRelative = true;
    g.morphAttributes.position = morphPositions.map(a => new THREE.BufferAttribute(a, 3));
    g.morphAttributes.normal = morphNormals.map(a => new THREE.BufferAttribute(a, 3));
  }
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
  const pupil = { g, T: fr.T.clone(), U: fr.U.clone(), mx: mx * fr.scale, my: my * fr.scale };
  g.userData.pupilRig = pupil;
  X_PUPILS.push(pupil);
  return g;
}
function pupilDecal(g: THREE.Group, fr: Frame, tris: Tri2[], color: number, layer: number, rough = 0.55) {
  const pupil = g.userData.pupilRig as PupilRig;
  return decal(fr, tris, color, layer, rough, pupil);
}
/** Move over the curved surface without letting any pupil vertices sink into the head. */
export function setPupilGaze(p: PupilRig, gx: number, gy: number) {
  gx = THREE.MathUtils.clamp(gx, -1, 1);
  gy = THREE.MathUtils.clamp(gy, -1, 1);
  const dx = gx * p.mx, dy = gy * p.my;
  p.g.position.set(p.T.x * dx + p.U.x * dy, p.T.y * dx + p.U.y * dy, p.T.z * dx + p.U.z * dy);
  for (const child of p.g.children) {
    const influences = (child as THREE.Mesh).morphTargetInfluences;
    if (influences) {
      influences[0] = Math.max(0, gx); influences[1] = Math.max(0, -gx);
      influences[2] = Math.max(0, gy); influences[3] = Math.max(0, -gy);
    }
  }
}

function buildEye(rec: Recipe, side: 1 | -1, hs: Shape[], eyesNormal: THREE.Group, eyesKO: THREE.Group, style: EyeStyleId) {
  const T = TU;
  const z = T.eyeSize;
  const ex = side * EYE.x * T.eyeX;
  const ey = EYE.y + T.eyeY;
  const fr = frameAt(hs, ex, ey, HS, HO, 0.65);
  const above = march(hs, new THREE.Vector3(ex * HS, (ey + 0.2 * z) * HS + HO, 1.8), new THREE.Vector3(0, 0, -1)).p;
  // Each eye has its own pivot at the surface, so blinking closes in place
  // instead of squashing the entire face toward the centre of the head.
  const eyePivot = new THREE.Group();
  eyePivot.position.copy(toLocal(fr.P));
  const eyeContent = new THREE.Group();
  eyeContent.position.copy(eyePivot.position).negate();
  eyePivot.add(eyeContent);
  eyesNormal.add(eyePivot);
  const darkFur = lum(colorAt(rec, above, new THREE.Color())) < 0.09;
  const koCol = darkFur ? 0xd6d0dc : DARK;
  let koSize = 0.12 * z;

  if (style === "green") {
    // A soft green crescent and tiny catchlight on an almost-black eye.
    const R = 0.16 * z;
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, R + 0.012 * z, R * 1.05 + 0.012 * z, 44)), 0x4d4542, 0, 0.35));
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, R, R * 1.05, 44)), 0x11171a, 1, 0.2));
    const pg = pupilGroup(eyeContent, fr, R * 0.10, R * 0.06);
    addTo(pg, pupilDecal(pg, fr, polyTris(crescent(R * 0.83, R * 0.28, 0.18)), 0xa8ec91, 2, 0.3));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(-R * 0.14, R * 0.49, R * 0.13, R * 0.15, 16)), 0xffffff, 3, 0.15));
    koSize = 0.13 * z;
  } else if (style === "goofy") {
    // Wide pale sclera, oversized dark pupils and two catchlights.
    const w = 0.17 * z, h = 0.175 * z;
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, w + 0.014 * z, h + 0.014 * z, 48)), 0x594b46, 0, 0.35));
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, w, h, 48)), 0xfff7f2, 1, 0.32));
    const pg = pupilGroup(eyeContent, fr, w * 0.11, h * 0.08);
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(0, -0.005 * z, w * 0.76, h * 0.8, 44)), 0x413832, 2, 0.25));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(0, -0.005 * z, w * 0.62, h * 0.67, 40)), 0x171619, 3, 0.17));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(-w * 0.24, h * 0.33, 0.024 * z, 0.025 * z, 16)), 0xffffff, 4, 0.12));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(w * 0.28, h * 0.03, 0.010 * z, 0.010 * z, 12)), 0xffe9dc, 4, 0.12));
    koSize = 0.13 * z;
  } else if (style === "round" || style === "slit") {
    // Golden eyes from the reference: a thick rim and a glossy moving pupil.
    const w = 0.17 * z, h = (style === "round" ? 0.17 : 0.16) * z;
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, w + 0.016 * z, h + 0.016 * z, 48)), DARK, 0, 0.22));
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, w, h, 48)), 0xf6bb35, 1, 0.28));
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, w * 0.88, h * 0.88, 44)), 0xffd45c, 2, 0.3));
    const pw = w * (style === "round" ? 0.70 : 0.30);
    const ph = h * (style === "round" ? 0.74 : 0.82);
    const pg = pupilGroup(eyeContent, fr, w * (style === "round" ? 0.09 : 0.24), h * 0.07);
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(0, -h * 0.035, pw, ph, 40)), 0x14131a, 3, 0.17));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(-pw * 0.28, ph * 0.48, Math.min(pw * 0.24, 0.025 * z), 0.022 * z, 16)), 0xffffff, 4, 0.12));
    if (style === "round") addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(pw * 0.35, ph * 0.22, 0.011 * z, 0.011 * z, 12)), 0xfff4cb, 4, 0.12));
    koSize = 0.13 * z;
  } else if (style === "grumpy") {
    // Low, slightly angled lids and mint irises give a calm grumpy expression.
    const w = 0.175 * z, h = 0.155 * z;
    const lidY = (x: number) => 0.01 * z + side * 0.10 * x;
    const clip = (x: number, y: number) => y - lidY(x);
    const rim = clipHalf(ellipse(0, 0, w + 0.017 * z, h + 0.017 * z, 48), clip);
    const iris = clipHalf(ellipse(0, -0.006 * z, w, h, 48), (x, y) => y - (lidY(x) - 0.009 * z));
    addTo(eyeContent, decal(fr, polyTris(rim), DARK, 0, 0.3));
    addTo(eyeContent, decal(fr, polyTris(iris), 0x76e0c5, 1, 0.3));
    const pg = pupilGroup(eyeContent, fr, w * 0.14, 0);
    const pupil = clipHalf(ellipse(0, -0.035 * z, w * 0.28, h * 0.63, 32), (x, y) => y - (lidY(x) - 0.018 * z));
    addTo(pg, pupilDecal(pg, fr, polyTris(pupil), DARK, 2, 0.25));
    const lid: Vec2[] = [[-w * 1.1, lidY(-w * 1.1)], [w * 1.1, lidY(w * 1.1)]];
    addTo(eyeContent, decal(fr, strokeTris(lid, 0.027 * z, 0.027 * z), DARK, 4, 0.3));
    koSize = 0.12 * z;
  } else if (rec.eye === "pill") {
    const w = 0.08 * z, h = 0.056 * z;
    const pg = pupilGroup(eyeContent, fr, 0.022 * z, 0.012 * z);
    addTo(pg, pupilDecal(pg, fr, polyTris(stadium(w, h)), DARK, 1, 0.25));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(w * 0.32, h * 0.32, 0.018 * z, 0.018 * z, 12)), 0xffffff, 2, 0.2));
    koSize = 0.08 * z;
  } else if (rec.eye === "plush") {
    // the round plush buddy: enormous glossy black discs with a big soft
    // catchlight upper-out and a tiny echo lower-in (stitched-toy eyes)
    const R = 0.205 * z;
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, R + 0.014 * z, R * 1.02 + 0.014 * z, 48)), 0x2b2733, 0, 0.3));
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, R, R * 1.02, 48)), 0x0c0a10, 1, 0.2));
    // a small gaze range so the catchlights track like every other eye
    const pg = pupilGroup(eyeContent, fr, R * 0.16, R * 0.12);
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(side * R * 0.34, R * 0.42, R * 0.30, R * 0.34, 22)), 0xffffff, 2, 0.15));
    addTo(pg, pupilDecal(pg, fr, polyTris(ellipse(side * R * 0.12, -R * 0.42, R * 0.10, R * 0.11, 14)), 0xffffff, 3, 0.15));
    koSize = 0.13 * z;
  } else if (rec.eye === "puppy") {
    // reference 3: big black round eye, thick green crescent at the bottom, white dot near the top
    const R = 0.165 * z;
    addTo(eyeContent, decal(fr, polyTris(ellipse(0, 0, R, R * 1.04, 44)), DARK, 0, 0.2));
    const pg = pupilGroup(eyeContent, fr, R * 0.19, R * 0.12);
    addTo(pg, pupilDecal(pg, fr, polyTris(crescent(R * 0.84, R * 0.27, 0.18)), rec.iris, 1, 0.3));
    addTo(eyeContent, decal(fr, polyTris(ellipse(side * R * 0.08, R * 0.5, R * 0.17, R * 0.17, 20)), 0xffffff, 2, 0.15));
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
    addTo(eyeContent, decal(fr, polyTris(out), DARK, 0, 0.3));
    addTo(eyeContent, decal(fr, polyTris(iris), rec.iris, 1, 0.3));
    const pg = pupilGroup(eyeContent, fr, w * 0.23, h * 0.11);
    addTo(pg, pupilDecal(pg, fr, polyTris(pupilRim), 0x1a1a1f, 2, 0.25));
    addTo(pg, pupilDecal(pg, fr, polyTris(pupil), 0x34343b, 3, 0.25));
    const hl = clipHalf(ellipse(px + w * 0.2, py + h * 0.22, w * 0.09, w * 0.09, 14), lidLow);
    addTo(pg, pupilDecal(pg, fr, polyTris(hl), 0xe8e8ee, 4, 0.2));
    if (hasLid) {
      const top: Vec2[] = [];
      for (let i = 0; i <= 26; i++) {
        const x = -1.35 * w + (2.7 * w * i) / 26;
        if (inPoly(outline, x, lidY(x) - 0.004)) top.push([x, lidY(x)]);
      }
      if (top.length >= 2) addTo(eyeContent, decal(fr, strokeTris(top, 0.03 * z, 0.03 * z), DARK, 5, 0.3));
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

function buildFace(rec: Recipe, head: THREE.Bone, _torso: THREE.Bone, eyesNormal: THREE.Group, eyesKO: THREE.Group, eyeStyle: EyeStyleId, expression: ExpressionId) {
  // decals sit on the real (blended head + body) surface so they're never buried in the neck blend
  const hs = rec.shapes.filter((s) => s.part === PI.head || s.part === PI.torso);
  buildEye(rec, 1, hs, eyesNormal, eyesKO, eyeStyle);
  buildEye(rec, -1, hs, eyesNormal, eyesKO, eyeStyle);
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
  if (expression === "default" && !rec.noMouth) addTo(mouthN, decal(mz, strokeTris([[0, nBot + 0.004], [0, y0]], lw, lw), mouthCol, 1));
  // crying "wah" mouth
  const cm = ellipse(0, y0 - r * 0.95, r * 1.45, r * 1.15, 30);
  addTo(mouthCry, decal(mz, polyTris(cm), 0x7a2333, 1, 0.4));
  addTo(mouthCry, decal(mz, polyTris(clipConvex(ellipse(0, y0 - r * 1.75, r * 0.95, r * 0.7, 20), cm)), 0xff8fa2, 2, 0.4));
  // dizzy wavy mouth
  const wave = curve(24, (t) => [(-1.5 + 3 * t) * r, y0 - r * 0.6 + Math.sin(t * Math.PI * 4) * r * 0.22]);
  addTo(mouthWavy, decal(mz, strokeTris(wave, lw, lw), mouthCol, 1));
  mouthCry.visible = false;
  mouthWavy.visible = false;
  for (const s of expression !== "default" || rec.noMouth ? [] : [1, -1]) {
    const pts = curve(14, (t) => {
      const th = t * Math.PI * 1.05;
      return [s * (r - r * Math.cos(th)), y0 - r * 0.85 * Math.sin(th)];
    });
    addTo(mouthN, decal(mz, strokeTris(pts, lw, lw * 0.85), mouthCol, 1));
  }

  if (expression === "grumpy") {
    const m = (0.7 + 0.3 * TU.mouth);
    const arch = curve(24, t => {
      const x = (t * 2 - 1) * 0.105 * m;
      return [x, y0 - (0.025 + 0.075 * Math.pow(2 * t - 1, 2)) * m];
    });
    addTo(mouthN, decal(mz, strokeTris([[0, nBot], [0, y0 - 0.025 * m]], lw, lw), mouthCol, 2));
    addTo(mouthN, decal(mz, strokeTris(arch, lw * 1.2, lw * 1.2), mouthCol, 2));
  } else if (expression === "tongue") {
    const m = (0.7 + 0.3 * TU.mouth);
    // Layered mouth cavity and rounded tongue, placed entirely on the muzzle.
    addTo(mouthN, decal(mz, polyTris(ellipse(0, y0 - 0.065 * m, 0.115 * m, 0.085 * m, 40)), 0x5a2530, 1, 0.4));
    addTo(mouthN, decal(mz, polyTris(ellipse(0, y0 - 0.125 * m, 0.071 * m, 0.104 * m, 40)), 0x9e4f5e, 2, 0.45));
    addTo(mouthN, decal(mz, polyTris(ellipse(0, y0 - 0.126 * m, 0.061 * m, 0.094 * m, 40)), 0xed8d9b, 3, 0.4));
    addTo(mouthN, decal(mz, strokeTris([[0, y0 - 0.075 * m], [0, y0 - 0.15 * m]], 0.007 * m, 0.003 * m), 0xb55e70, 4, 0.45));
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
  armLGroup?: THREE.Group | null; // attached to the left arm bone (gloves)
  armRGroup?: THREE.Group | null; // attached to the right arm bone (gloves)
  legLGroup?: THREE.Group | null; // attached to the left leg bone (sandals)
  legRGroup?: THREE.Group | null; // attached to the right leg bone (sandals)
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
/**
 * Batch rigid, opaque pieces that use identical materials. Geometry and all
 * transforms are baked into the accessory's local frame; its silhouette,
 * detail and detachable pivot remain unchanged. Animated googly eyes are
 * deliberately excluded by the caller.
 */
function batchRigidDetails(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || Array.isArray(object.material)) return;
    const material = object.material;
    if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent || material.map || object.geometry.morphAttributes.position?.length) return;
    const physical = material as THREE.MeshPhysicalMaterial;
    const key = JSON.stringify([material.type, material.color.getHex(), material.roughness, material.metalness,
      physical.clearcoat, physical.clearcoatRoughness, material.side, material.opacity, material.depthTest,
      material.depthWrite, material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits,
      object.castShadow, object.receiveShadow, object.renderOrder]);
    const list = groups.get(key) ?? [];
    list.push(object);
    groups.set(key, list);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      // Rigid accessory materials don't use UVs or vertex colours. Removing
      // incidental attributes makes custom surfaces and tubes compatible.
      for (const name of Object.keys(geometry.attributes)) if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    merged.renderOrder = meshes[0].renderOrder;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    root.add(merged);
  }
}

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
  const Cb = new THREE.Vector3(0, 0.02 * HS + HO, -0.01 * HS);
  const th = 0.022 * HS;
  const e0 = (a: number) => {
    const w = (1 - Math.cos(a)) / 2; // 0 front .. 1 back
    // Keep the front panel visible while leaving room above the eyes.
    return isNew ? 0.78 * (1 - w) - 0.12 * w : 0.72 * (1 - w) - 0.3 * w;
  };
  // Give the crown a softly structured shape instead of shrink-wrapping the head.
  const puff = (u: number) =>
    (isNew ? 0.035 * HS : 0) + (isNew ? 0.10 : 0.05) * HS * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.8);
  /** point on the cap surface in the given direction from the head centre (bind space) */
  const onCap = (d: THREE.Vector3, extra = 0) => {
    const a = Math.atan2(d.x, d.z);
    const e = Math.asin(Math.max(-1, Math.min(1, d.y / d.length())));
    const u = Math.max(0, (e - e0(a)) / (Math.PI / 2 - e0(a)));
    const dn = d.clone().normalize();
    const { p, n } = march(body, Cb.clone().addScaledVector(dn, 1.6), dn.clone().negate());
    p.addScaledVector(n, th + puff(u) + extra);
    if (isNew) p.y += 0.055 * HS * Math.sin(u * Math.PI / 2);
    return { p, n };
  };
  const dirAU = (a: number, u: number) => {
    const e = e0(a) + (Math.PI / 2 - e0(a)) * u;
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  };
  const surf = (a: number, u: number, extra = 0) => {
    const r = onCap(dirAU(a, Math.min(u, 0.995)), extra);
    return { p: toLocal(r.p), n: r.n, pb: r.p };
  };
  // The crown is continuous: the ears are tucked inside the cap.
  const A = 168, U = 42;
  const pos: number[] = [];
  for (let iu = 0; iu <= U; iu++) {
    const u = Math.pow(iu / U, 0.9);
    for (let ia = 0; ia <= A; ia++) {
      const v = surf(-Math.PI + (2 * Math.PI * ia) / A, u);
      pos.push(v.p.x, v.p.y, v.p.z);
    }
  }
  const idx: number[] = [];
  for (let iu = 0; iu < U; iu++)
    for (let ia = 0; ia < A; ia++) {
      const a0 = iu * (A + 1) + ia, b0 = a0 + A + 1;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  crownGeo.setIndex(idx);
  crownGeo.computeVertexNormals();
  const mat = accMat(color, 0.6, { clearcoat: 0.2, side: THREE.DoubleSide });
  const darker = new THREE.Color(color).multiplyScalar(0.72).getHex();
  // A classic solid-colour baseball cap, rather than a two-tone trucker cap.
  const trimMat = mat;
  g.add(new THREE.Mesh(crownGeo, mat));
  // rolled bottom band (also hides the edge)
  const band: THREE.Vector3[] = [];
  for (let ia = 0; ia < A; ia++) band.push(surf(-Math.PI + (2 * Math.PI * ia) / A, 0.0, 0.004).p);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(band, true), 192, 0.018 * HS, 8, true), trimMat));
  // stitched panel seams
  const seamMat = accMat(darker, 0.7, { clearcoat: 0 });
  for (const a of isNew ? [-2.62, -1.57, -0.52, 0.52, 1.57, 2.62] : [-2.6, -0.42, 0.42, 2.6, Math.PI]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const v = surf(a, 0.04 + (k / 16) * 0.93, 0.003);
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
  const lp = surf(0, isNew ? 0.22 : 0.28, 0.025 * HS);
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
  // A rounded projecting bill with a subtle downward curve.
  const AB = isNew ? 1.02 : 0.95, NB = 44, MB = 8;
  const Lmax = (isNew ? 0.46 : 0.43) * HS, bth = (isNew ? 0.034 : 0.03) * HS;
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
        ? (0.015 * t - 0.035 * t * t - 0.045 * k * k * t) * HS // gently curved bill, kept clear of the eyes
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
  g.add(new THREE.Mesh(strip(-bth, false), accMat(darker, 0.7, { clearcoat: 0 })));
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i <= NB; i++) edge.push(topV[i][MB].clone().setY(topV[i][MB].y - bth / 2));
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 88, bth * (isNew ? 0.62 : 0.55), 8, false),
      accMat(color, 0.55)
    )
  );
  // brim stitch lines (new only)
  if (isNew) {
    for (const jj of [MB - 2, MB - 4]) {
      const line: THREE.Vector3[] = [];
      for (let i = 0; i <= NB; i++) line.push(topV[i][jj].clone().setY(topV[i][jj].y + 0.004));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 88, 0.006 * HS, 5, false), accMat(darker, 0.7, { clearcoat: 0 })));
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
  // A gently squared shell with straighter sides and a tapered lower edge.
  // The chin bar projects forward without inflating the whole lower helmet.
  const signedPow = (v: number, exponent: number) => Math.sign(v) * Math.pow(Math.abs(v), exponent);
  const at = (yaw: number, pitch: number, k = 1) => {
    const cp = Math.cos(pitch);
    const x = Math.sin(yaw) * cp;
    const y = Math.sin(pitch);
    const z = Math.cos(yaw) * cp;
    const lower = THREE.MathUtils.smoothstep(-pitch, 0.28, 1.06);
    const chin = 0.07 * Math.exp(-Math.pow((pitch + 0.6) / 0.25, 2)) * Math.pow(Math.max(0, Math.cos(yaw)), 3);
    return new THREE.Vector3(
      C.x + signedPow(x, 0.82) * Rx * (1.035 - 0.06 * lower) * k,
      C.y + signedPow(y, 0.86) * Ry * k,
      C.z + signedPow(z, 0.82) * Rz * (1 + chin) * k,
    );
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
        const p = at(Math.atan2(vx, vz), Math.asin(Math.max(-1, Math.min(1, vy))), k);
        out.push(p.x, p.y, p.z);
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
        const p = at(Math.atan2(d.x, d.z), Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), k);
        ps.push(p.x, p.y, p.z);
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
  // A recessed, rounded trapezoid with horizontal slats reads as a
  // motorcycle helmet's chin intake rather than marks on a round shell.
  const ventPoints: number[] = [], ventIndices: number[] = [];
  const ventRows = 8, ventCols = 24;
  for (let row = 0; row <= ventRows; row++) {
    const t = row / ventRows;
    const pitch = -0.49 - t * 0.26;
    const width = (0.24 - 0.07 * t) * (0.94 + 0.06 * Math.sin(Math.PI * t));
    for (let col = 0; col <= ventCols; col++) {
      const yaw = (2 * col / ventCols - 1) * width;
      const p = at(yaw, pitch, 1.018);
      ventPoints.push(p.x, p.y, p.z);
    }
  }
  for (let row = 0; row < ventRows; row++) for (let col = 0; col < ventCols; col++) {
    const i = row * (ventCols + 1) + col;
    ventIndices.push(i, i + ventCols + 1, i + 1, i + 1, i + ventCols + 1, i + ventCols + 2);
  }
  const ventGeo = new THREE.BufferGeometry();
  ventGeo.setAttribute("position", new THREE.Float32BufferAttribute(ventPoints, 3));
  ventGeo.setIndex(ventIndices);
  ventGeo.computeVertexNormals();
  g.add(new THREE.Mesh(ventGeo, accMat(0x24252e, 0.65, { side: THREE.DoubleSide })));
  const slatMat = accMat(0x858995, 0.6, { clearcoat: 0 });
  for (const [pitch, width] of [[-0.55, 0.18], [-0.62, 0.16], [-0.69, 0.13]] as const) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) points.push(at(-width + 2 * width * i / 8, pitch, 1.035));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.008 * HS, 5, false), slatMat));
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
  // Scale around the fitted head centre, not the bone origin, so all helmet
  // parts grow exactly 5% together without shifting off the face.
  g.scale.setScalar(1.05);
  g.position.copy(C).multiplyScalar(1 - 1.05);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: false };
}

/** The royal crown from the reference slides: gold band, six spikes, jewel balls. */
function makeCrown(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const body = hs.filter((s) => s.t === 0 && !s.noBounds);
  const gold = accMat(0xffc53d, 0.3, { clearcoat: 0.6, metalness: 0.45 });
  const goldDark = accMat(0xd9a016, 0.4, { metalness: 0.4 });
  const ruby = accMat(0xe23a5a, 0.2, { clearcoat: 1 });
  // fit the band around the top of the head like makeHelmet fits its shell
  const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const sh of body) {
    mn.min(new THREE.Vector3(sh.c[0] - sh.r[0], sh.c[1] - sh.r[1], sh.c[2] - sh.r[2]));
    mx.max(new THREE.Vector3(sh.c[0] + sh.r[0], sh.c[1] + sh.r[1], sh.c[2] + sh.r[2]));
  }
  const C = toLocal(new THREE.Vector3((mn.x + mx.x) / 2, mx.y + 0.005 * HS, (mn.z + mx.z) / 2 - 0.01 * HS));
  const R = Math.max(0.34 * HS, ((mx.x - mn.x) / 2) * 1.02);
  const H = 0.2 * HS;
  // band: low cylinder that follows the skull curve (slightly domed bottom)
  const bandPts: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    bandPts.push(new THREE.Vector3(C.x + Math.sin(a) * R, C.y + 0.02 * HS, C.z + Math.cos(a) * R));
  }
  const curve = new THREE.CatmullRomCurve3(bandPts, true);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.035 * HS, 10, true), gold));
  // shell under the band so the crown reads solid from the side
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.005, R * 1.02, H * 0.75, 40, 1, true),
    accMat(0xffc53d, 0.32, { clearcoat: 0.5, metalness: 0.35, side: THREE.DoubleSide }),
  );
  shell.position.set(C.x, C.y + H * 0.3, C.z);
  g.add(shell);
  // six spikes with jewel balls, alternating heights
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const h = H * (i % 2 === 0 ? 1 : 0.72);
    const px = C.x + Math.sin(a) * R * 0.98;
    const pz = C.z + Math.cos(a) * R * 0.98;
    const tip = new THREE.Vector3(px, C.y + H * 0.72 + h, pz);
    const base = new THREE.Vector3(px, C.y + H * 0.6, pz);
    g.add(coneAB(base, tip, 0.055 * HS, goldDark, 1, 0.02 * HS));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045 * HS, 12, 10), i === 0 ? ruby : gold);
    ball.position.copy(tip).addScaledVector(tip.clone().sub(base).normalize(), 0.02 * HS);
    g.add(ball);
  }
  // front jewel on the band
  const front = new THREE.Mesh(new THREE.SphereGeometry(0.05 * HS, 14, 12), ruby);
  front.position.set(C.x, C.y + 0.03 * HS, C.z + R * 1.0);
  front.scale.set(1, 1.25, 0.6);
  g.add(front);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** The shades from the reference slides: dark glossy lenses, thin bridge, temple arms. */
function makeShades(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const black = accMat(0x16141a, 0.18, { clearcoat: 1 });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY + 0.015;
  const r = 0.185 * TU.eyeSize * HS;
  for (const s of [1, -1]) {
    const fr = frameAt(hs, s * ex, ey, HS, HO, 0.75);
    const c = toLocal(fr.P).addScaledVector(fr.D, 0.06 * HS);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 16), black);
    lens.scale.set(r * 1.18, r * 0.86, r * 0.32);
    lens.position.copy(c);
    lens.lookAt(c.clone().add(fr.D));
    g.add(lens);
    // temple arm toward the ear
    const back = HL(s * 0.5, ey + 0.03, -0.1);
    const outer = c.clone().add(new THREE.Vector3(s * r * 1.1, 0.02 * HS, -0.02 * HS));
    g.add(coneAB(outer, back, 0.02 * HS, black, 1, 0.02 * HS));
  }
  // bridge across the nose
  const l0 = new THREE.Vector3(), l1 = new THREE.Vector3();
  {
    const fa = frameAt(hs, EYE.x * TU.eyeX, ey, HS, HO, 0.75);
    const fb = frameAt(hs, -EYE.x * TU.eyeX, ey, HS, HO, 0.75);
    l0.copy(toLocal(fa.P)).addScaledVector(fa.D, 0.06 * HS);
    l1.copy(toLocal(fb.P)).addScaledVector(fb.D, 0.06 * HS);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * HS, 0.018 * HS, l0.distanceTo(l1) * 0.72, 8), black);
  bridge.position.copy(l0).add(l1).multiplyScalar(0.5);
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

let SCARF_TORSO: Shape[] = [];

/* ==== accessories ported from the sibling menu games (Bounce Paws & Ball Party) ==== */

/** stable skull-centre anchor in bind space (same anchor the caps mould on) */
function skullAnchor() {
  return new THREE.Vector3(0, 0.02 * HS + HO, -0.01 * HS);
}
/** only the rounded body blobs: excludes tubes (tail), stripes and detail shells */
function blobsOnly(shapes: Shape[]) {
  return shapes.filter((sh) => sh.t === 0 && !sh.noBounds);
}

function blobBounds(shapes: Shape[]) {
  const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const sh of shapes) {
    if (sh.t !== 0 || sh.noBounds) continue;
    mn.min(new THREE.Vector3(sh.c[0] - sh.r[0], sh.c[1] - sh.r[1], sh.c[2] - sh.r[2]));
    mx.max(new THREE.Vector3(sh.c[0] + sh.r[0], sh.c[1] + sh.r[1], sh.c[2] + sh.r[2]));
  }
  return { mn, mx };
}

/** ring of surface points around the torso at height y (bind space, body blobs only — never the tail) */
function torsoRing(ts: Shape[], y: number, pad: number, steps = 28): THREE.Vector3[] {
  const blobs = blobsOnly(ts);
  const ring: THREE.Vector3[] = [];
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const hit = march(blobs, new THREE.Vector3(d.x * 1.5, y, d.z * 1.5), d.clone().negate());
    ring.push(new THREE.Vector3(hit.p.x, y, hit.p.z).addScaledVector(d, pad));
  }
  return ring;
}

/** Topi koboi bertepi lebar dari Bounce Paws. */
function makeCowboy(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const body = hs.filter((sh) => sh.t === 0 && !sh.noBounds);
  const { mn, mx } = blobBounds(body);
  const C = toLocal(new THREE.Vector3((mn.x + mx.x) / 2, mx.y + 0.005 * HS, (mn.z + mx.z) / 2 - 0.01 * HS));
  const R = Math.max(0.34 * HS, ((mx.x - mn.x) / 2) * 1.04);
  const felt = accMat(0x9a6b3f, 0.75, { clearcoat: 0.05 });
  const feltDark = accMat(0x5a3a20, 0.8, { clearcoat: 0 });
  // wavy brim: a squashed torus tucked under the dome edge
  const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, R * 0.34, 12, 40), felt);
  brim.scale.set(1, 1, 0.32);
  brim.rotation.x = Math.PI / 2;
  brim.position.set(C.x, C.y + 0.03 * HS, C.z);
  g.add(brim);
  // rounded crown block with a pinch
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.86, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), felt);
  dome.scale.set(1, 0.78, 1.02);
  dome.position.set(C.x, C.y + 0.02 * HS, C.z);
  g.add(dome);
  const dent = new THREE.Mesh(new THREE.SphereGeometry(R * 0.52, 18, 12), felt);
  dent.scale.set(1, 0.5, 1.05);
  dent.position.set(C.x, C.y + R * 0.66, C.z);
  g.add(dent);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.96, 0.09 * HS, 26, 1, true), feltDark);
  band.position.set(C.x, C.y + 0.085 * HS, C.z);
  g.add(band);
  g.rotation.x = 0.05;
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Afro pelangi kembang dari Ball Party. */
function makeAfro(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const body = hs.filter((sh) => sh.t === 0 && !sh.noBounds);
  const Cb = skullAnchor();
  const rainbow = [0xe94f4f, 0xf2994a, 0xf2d94a, 0x6fcf6f, 0x56a8f5, 0xa45de8];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const puff = (dir: THREE.Vector3, scale = 1) => {
    const dn = dir.clone().normalize();
    const hit = march(body, Cb.clone().addScaledVector(dn, 1.8), dn.clone().negate());
    const r = (0.17 + rnd() * 0.07) * HS * scale;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), accMat(rainbow[Math.floor(rnd() * rainbow.length)], 0.9, { clearcoat: 0 }));
    ball.position.copy(toLocal(hit.p.clone().addScaledVector(hit.n, r * 0.42)));
    g.add(ball);
  };
  // two rings around the crown plus a full top, so the do reads big and round
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd() * 0.22;
    puff(new THREE.Vector3(Math.sin(a), 0.42, Math.cos(a)), 1.08);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3 + rnd() * 0.25;
    puff(new THREE.Vector3(Math.sin(a) * 0.45, 1, Math.cos(a) * 0.45), 1.14);
  }
  for (let i = 0; i < 4; i++) puff(new THREE.Vector3((rnd() - 0.5) * 0.7, 1.5, (rnd() - 0.5) * 0.7), 1.2);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** shared round-glasses builder (nerd = thick black frames, detective = gold + dark glass) */
function makeRoundGlasses(hs: Shape[], frameColor: number, lensColor: number, lensOpacity: number, metal: number): AccessoryBuild {
  const g = new THREE.Group();
  const frame = accMat(frameColor, 0.35, { clearcoat: 0.8, metalness: metal });
  const lensM = new THREE.MeshPhysicalMaterial({ color: lensColor, roughness: 0.12, clearcoat: 1, transparent: lensOpacity < 1, opacity: lensOpacity });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY;
  const r = 0.16 * TU.eyeSize * HS;
  const lensC: THREE.Vector3[] = [];
  for (const sgn of [1, -1]) {
    const fr = frameAt(hs, sgn * ex, ey, HS, HO, 0.75);
    const c = toLocal(fr.P).addScaledVector(fr.D, 0.075 * HS);
    lensC.push(c);
    const lens = new THREE.Group();
    lens.position.copy(c);
    lens.lookAt(c.clone().add(fr.D));
    g.add(lens);
    lens.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.032 * HS, 10, 30), frame));
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 26), lensM);
    glass.position.z = 0.004 * HS;
    lens.add(glass);
    const back = HL(sgn * 0.5, ey + 0.02, -0.12);
    const outer = c.clone().add(new THREE.Vector3(sgn * r, 0, -0.02 * HS));
    g.add(coneAB(outer, back, 0.015 * HS, frame, 1, 0.015 * HS));
  }
  const mid = lensC[0].clone().add(lensC[1]).multiplyScalar(0.5);
  const half = Math.max(0.02 * HS, lensC[0].distanceTo(lensC[1]) / 2 - r);
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(half, 0.022 * HS, 8, 18, Math.PI), frame);
  bridge.position.copy(mid).add(new THREE.Vector3(0, 0.015 * HS, 0));
  g.add(bridge);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}
function makeNerd(hs: Shape[]): AccessoryBuild {
  return makeRoundGlasses(hs, 0x1c1c22, 0xcfe8ff, 0.4, 0);
}
function makeDetective(hs: Shape[]): AccessoryBuild {
  return makeRoundGlasses(hs, 0xc9a227, 0x11161f, 1, 0.6);
}

/** Hidung badut merah dari kedua game menu. */
function makeClownNose(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const nf = frameAt(hs, 0, NOSE.y + TU.noseY + 0.02, HS, HO, 0.8);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 18), accMat(0xe23b3b, 0.3, { clearcoat: 1 }));
  const r = 0.115 * HS;
  nose.scale.set(r, r * 0.92, r);
  nose.position.copy(toLocal(nf.P)).addScaledVector(nf.D, r * 0.55);
  g.add(nose);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.scale.setScalar(r * 0.16);
  glint.position.copy(nose.position).add(new THREE.Vector3(r * 0.3, r * 0.34, r * 0.5));
  g.add(glint);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Topeng hoki putih dari Bounce Paws. */
function makeJason(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const Mb = skullAnchor(); // bind space (direction math)
  const M = toLocal(Mb); // head-bone local (positioning)
  const shellM = accMat(0xf2efe6, 0.45, { clearcoat: 0.35, side: THREE.DoubleSide });
  const holeM = accMat(0x1a1a1e, 0.6);
  // dome floats just proud of the cheeks so it never sinks into the head
  const Rm = 0.68 * HS;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(Rm, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), shellM);
  shell.rotation.x = 0.38; // rim dips to the chin in front, clears the muzzle
  shell.scale.set(1, 1.04, 0.94);
  shell.position.copy(M).add(new THREE.Vector3(0, 0.02 * HS, 0.06 * HS));
  g.add(shell);
  /** dark detail lying flat on the shell surface in the given direction from the skull centre */
  const onShell = (dir: THREE.Vector3) => {
    const d = dir.clone().normalize();
    const p = toLocal(M.clone().addScaledVector(d, Rm * 0.97));
    const look = toLocal(M.clone().addScaledVector(d, Rm * 1.4));
    const grp = new THREE.Group();
    grp.position.copy(p);
    grp.lookAt(look);
    g.add(grp);
    return grp;
  };
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY + 0.02;
  for (const sgn of [1, -1]) {
    const fr = frameAt(hs, sgn * ex, ey, HS, HO, 0.75);
    const grp = onShell(fr.P.clone().sub(Mb));
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * HS, 0.075 * HS, 0.03 * HS, 12), holeM);
    hole.rotation.x = Math.PI / 2;
    grp.add(hole);
  }
  for (const [vx, vy] of [[-0.09, -0.75], [0, -0.85], [0.09, -0.75]]) {
    const grp = onShell(new THREE.Vector3(vx, vy + 0.25, 1.35));
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.06 * HS, 0.035 * HS, 0.03 * HS), holeM);
    grp.add(vent);
  }
  const scarGrp = onShell(new THREE.Vector3(-1.05, 0.12, 0.55));
  const scar = new THREE.Mesh(new THREE.BoxGeometry(0.05 * HS, 0.3 * HS, 0.03 * HS), accMat(0xb03a2e, 0.6));
  scar.rotation.z = 0.55;
  scarGrp.add(scar);
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Sabuk juara dari Ball Party. */
function makeBelt(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const y0 = mn.y + 0.45 * (mx.y - mn.y);
  const ring = torsoRing(ts, y0, 0.05);
  const g = new THREE.Group();
  const leather = accMat(0x3a2416, 0.8, { clearcoat: 0 });
  const gold = accMat(0xf5c542, 0.25, { clearcoat: 0.8, metalness: 0.5 });
  const curve = new THREE.CatmullRomCurve3(ring, true);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.075, 10, true), leather));
  let front = ring[0];
  for (const p of ring) if (p.z > front.z) front = p;
  const out = new THREE.Vector3(front.x, 0, front.z + 1).normalize();
  const buckle = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.07, 6), gold);
  buckle.rotation.x = Math.PI / 2;
  buckle.position.copy(front).addScaledVector(out, 0.06);
  g.add(buckle);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), accMat(0xfff3c4, 0.2, { clearcoat: 1, metalness: 0.4 }));
  pin.position.copy(buckle.position).add(new THREE.Vector3(0, 0.12, 0.04));
  g.add(pin);
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Celana tinju merah dari Ball Party. */
function makeBoxers(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const yb = mn.y + 0.08 * (mx.y - mn.y);
  const yt = yb + 0.4 * (mx.y - mn.y);
  const bot = torsoRing(ts, yb, 0.07, 30);
  const top = torsoRing(ts, yt, 0.045, 30);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= 30; i++) {
    pos.push(bot[i % 30].x, bot[i % 30].y, bot[i % 30].z);
    pos.push(top[i % 30].x, top[i % 30].y, top[i % 30].z);
  }
  for (let i = 0; i < 30; i++) {
    const a0 = i * 2;
    idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, accMat(0xd93636, 0.85, { clearcoat: 0, side: THREE.DoubleSide })));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top, true), 96, 0.05, 10, true), accMat(0xf6f2ea, 0.7, { clearcoat: 0.1 })));
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Pelampung bebek kuning dari Ball Party. */
function makeDuckFloat(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const ym = mn.y + 0.55 * (mx.y - mn.y);
  const ring = torsoRing(ts, ym, 0.14, 30);
  const g = new THREE.Group();
  const yellow = accMat(0xf7c948, 0.5, { clearcoat: 0.3 });
  // fat tube that hugs the real belly silhouette (same trick as the belt, fatter)
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 120, 0.24, 14, true), yellow));
  let front = ring[0];
  for (const p of ring) if (p.z > front.z) front = p;
  const hr = 0.21;
  const head = new THREE.Mesh(new THREE.SphereGeometry(hr, 18, 14), yellow);
  head.position.set(front.x * 0.9, ym + 0.24 + hr * 0.72, front.z + 0.04);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), accMat(0xf28c28, 0.5));
  beak.rotation.x = Math.PI / 2;
  beak.position.copy(head.position).add(new THREE.Vector3(0, -0.03, hr + 0.05));
  g.add(beak);
  for (const sgn of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), accMat(0x222226, 0.4));
    eye.position.copy(head.position).add(new THREE.Vector3(sgn * 0.075, 0.07, hr * 0.8));
    g.add(eye);
  }
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Kacamata klasik bingkai penuh (Sunglasses v2 dari kedua game menu). */
function makeClassicGlasses(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const rimM = accMat(0x0f0f12, 0.3, { clearcoat: 0.6 });
  const lensM = accMat(0x1e1b4b, 0.08, { clearcoat: 1, metalness: 0.55 });
  const glintM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY;
  const r = 0.155 * TU.eyeSize * HS;
  const inner: THREE.Vector3[] = [];
  for (const sgn of [1, -1]) {
    const fr = frameAt(hs, sgn * ex, ey, HS, HO, 0.75);
    const c = toLocal(fr.P).addScaledVector(fr.D, 0.08 * HS);
    const lens = new THREE.Group();
    lens.position.copy(c);
    lens.lookAt(c.clone().add(fr.D));
    g.add(lens);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), lensM);
    glass.scale.set(1.2, 0.85, 0.35);
    lens.add(glass);
    lens.add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.03, 0.032 * HS, 12, 36), rimM));
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glintM);
    g1.scale.set(r * 0.32, r * 0.12, r * 0.08);
    g1.position.set(-sgn * r * 0.35, r * 0.3, r * 0.36);
    g1.rotation.z = 0.7;
    lens.add(g1);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glintM);
    g2.scale.set(r * 0.16, r * 0.07, r * 0.07);
    g2.position.set(sgn * r * 0.2, -r * 0.35, r * 0.36);
    g2.rotation.z = 0.7;
    lens.add(g2);
    const back = HL(sgn * 0.5, ey + 0.02, -0.12);
    const outer = c.clone().add(new THREE.Vector3(sgn * r * 1.25, 0, -0.02 * HS));
    g.add(coneAB(outer, back, 0.016 * HS, rimM, 1, 0.016 * HS));
    inner.push(c.clone().add(new THREE.Vector3(-sgn * r * 1.15, 0.02 * HS, 0)));
  }
  g.add(coneAB(inner[0], inner[1], 0.02 * HS, rimM, 1, 0.02 * HS));
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Kacamata wayfarer kotak + brow bar emas (CoolGlasses dari Bounce Paws). */
function makeCoolGlasses(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const main = accMat(0x1c1c24, 0.2, { clearcoat: 0.8, metalness: 0.3 });
  const gold = accMat(0xe8a800, 0.25, { clearcoat: 0.6, metalness: 0.85 });
  const glintM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY;
  const lw = 0.31 * HS, lh = 0.24 * HS;
  const tops: THREE.Vector3[] = [];
  for (const sgn of [1, -1]) {
    const fr = frameAt(hs, sgn * ex, ey, HS, HO, 0.75);
    const c = toLocal(fr.P).addScaledVector(fr.D, 0.085 * HS);
    const lens = new THREE.Group();
    lens.position.copy(c);
    lens.lookAt(c.clone().add(fr.D));
    g.add(lens);
    const box = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.1 * HS), main);
    lens.add(box);
    const slash = new THREE.Mesh(new THREE.BoxGeometry(0.045 * HS, 0.2 * HS, 0.015 * HS), glintM);
    slash.position.set(-sgn * 0.06 * HS, 0.02 * HS, 0.055 * HS);
    slash.rotation.z = 0.5;
    lens.add(slash);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022 * HS, 10, 8), gold);
    dot.position.set(sgn * lw * 0.42, lh * 0.28, 0.01);
    lens.add(dot);
    const back = HL(sgn * 0.5, ey + 0.02, -0.12);
    const outer = c.clone().add(new THREE.Vector3(sgn * lw * 0.5, 0, -0.02 * HS));
    g.add(coneAB(outer, back, 0.018 * HS, main, 1, 0.018 * HS));
    tops.push(c.clone().add(new THREE.Vector3(0, lh * 0.52, 0)));
  }
  // gold brow bar connecting both tops, plus the bridge
  g.add(coneAB(tops[0], tops[1], 0.022 * HS, gold, 1, 0.022 * HS));
  g.add(coneAB(tops[0].clone().add(new THREE.Vector3(0, -lh * 0.55, 0)), tops[1].clone().add(new THREE.Vector3(0, -lh * 0.55, 0)), 0.018 * HS, main, 1, 0.018 * HS));
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Kacamata pixel 8-bit (PixelShades dari Ball Party). */
function makePixelGlasses(hs: Shape[]): AccessoryBuild {
  const g = new THREE.Group();
  const cells: [number, number][] = [];
  for (let x = 0; x < 12; x++) cells.push([x, 3]);
  for (const v of [[0, 2], [0, 1], [1, 2], [1, 1], [2, 2], [2, 1], [3, 2], [4, 2], [4, 1], [7, 2], [7, 1], [8, 2], [8, 1], [9, 2], [9, 1], [10, 2], [11, 2], [11, 1], [1, 0], [2, 0], [3, 1], [8, 0], [9, 0], [10, 1]]) cells.push(v as [number, number]);
  const white = new Set(["2,2", "3,1", "9,2", "10,1"]);
  const u = 0.062 * HS;
  const blackM = accMat(0x050505, 0.45, { clearcoat: 0.3 });
  const whiteM = accMat(0xffffff, 0.3, { clearcoat: 0.6 });
  const ex = EYE.x * TU.eyeX, ey = EYE.y + TU.eyeY + 0.05;
  const fr = frameAt(hs, 0, ey, HS, HO, 0.75);
  const c = toLocal(fr.P).addScaledVector(fr.D, 0.1 * HS);
  const mosaic = new THREE.Group();
  mosaic.position.copy(c);
  mosaic.lookAt(c.clone().add(fr.D));
  for (const [x, y] of cells) {
    const isW = white.has(`${x},${y}`);
    const px = new THREE.Mesh(new THREE.BoxGeometry(u, u, 0.05 * HS), isW ? whiteM : blackM);
    px.position.set((x - 5.5) * u, (y - 1.5) * u, isW ? 0.012 * HS : 0);
    mosaic.add(px);
  }
  g.add(mosaic);
  for (const sgn of [1, -1]) {
    const back = HL(sgn * 0.5, ey, -0.12);
    const outer = c.clone().add(new THREE.Vector3(sgn * 6.4 * u, 0, -0.02 * HS));
    g.add(coneAB(outer, back, 0.016 * HS, blackM, 1, 0.016 * HS));
  }
  return { group: shadowed(g), torsoGroup: null, googly: [], detachable: true };
}

/** Kalung merah dengan lonceng emas (Collar dari Ball Party). */
function makeCollar(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const y0 = mx.y - 0.17 * (mx.y - mn.y); // where the neck meets the shoulders
  const ring = torsoRing(ts, y0, 0.05);
  const g = new THREE.Group();
  const red = accMat(0xdc2626, 0.45, { clearcoat: 0.4 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 96, 0.05, 10, true), red));
  let front = ring[0];
  for (const p of ring) if (p.z > front.z) front = p;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 12), accMat(0xfacc15, 0.2, { clearcoat: 1, metalness: 0.9 }));
  bell.position.copy(front).add(new THREE.Vector3(0, -0.07, 0.075));
  g.add(bell);
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Palu kayu besar di punggung (Mallet dari Ball Party, pasangan sapu). */
function makeMallet(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const y1 = mx.y - 0.22 * (mx.y - mn.y);
  const back = march(blobsOnly(ts), new THREE.Vector3(-0.05, y1, -1.5), new THREE.Vector3(0, 0, 1)).p;
  const g = new THREE.Group();
  const wood = accMat(0xa86a32, 0.7, { clearcoat: 0.1 });
  const headM = accMat(0xc8894a, 0.65, { clearcoat: 0.1 });
  const capM = accMat(0xe8b878, 0.8, { clearcoat: 0 });
  const redM = accMat(0xd43b2f, 0.6, { clearcoat: 0.1 });
  // handle leans against the back, head peeking out beside the shoulder blade
  const bot = new THREE.Vector3(back.x - 0.06, y1 - 0.85, back.z - 0.02);
  const top = new THREE.Vector3(back.x - 0.38, y1 + 0.3, back.z - 0.14);
  g.add(coneAB(bot, top, 0.055, wood, 1, 0.045));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 18), redM);
  const mid = bot.clone().lerp(top, 0.72);
  ring.position.copy(mid);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), top.clone().sub(bot).normalize());
  g.add(ring);
  // mallet head across the stick top
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.52, 22), headM);
  head.position.copy(top).add(new THREE.Vector3(0.02, 0.06, 0));
  head.rotation.z = Math.PI / 2;
  head.rotation.y = 0.25;
  g.add(head);
  for (const sgn of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.035, 22), capM);
    cap.position.copy(head.position).add(new THREE.Vector3(sgn * 0.26 * Math.cos(0.25), 0, -sgn * 0.26 * Math.sin(0.25)));
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = 0.25;
    g.add(cap);
  }
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Sapu punggung dari Bounce Paws. */
function makeBroom(ts: Shape[]): AccessoryBuild {
  const { mn, mx } = blobBounds(blobsOnly(ts));
  const y1 = mx.y - 0.16 * (mx.y - mn.y);
  const back = march(blobsOnly(ts), new THREE.Vector3(0.05, y1, -1.5), new THREE.Vector3(0, 0, 1)).p;
  const g = new THREE.Group();
  const wood = accMat(0xa9805b, 0.8, { clearcoat: 0 });
  const top = new THREE.Vector3(back.x + 0.22, y1 + 0.62, back.z - 0.16);
  const bot = new THREE.Vector3(back.x + 0.12, y1 - 0.62, back.z - 0.08);
  g.add(coneAB(top, bot, 0.05, wood, 1, 0.042));
  const straw = accMat(0xd9a441, 0.9, { clearcoat: 0 });
  const cluster = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const t = i / 7 - 0.5;
    const a = coneAB(bot.clone().add(new THREE.Vector3(t * 0.1, 0.1, 0)), bot.clone().add(new THREE.Vector3(t * 0.42, -0.34 - (i % 2) * 0.08, 0)), 0.035, straw, 1, 0.012);
    cluster.add(a);
  }
  g.add(cluster);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 18), accMat(0xd93636, 0.6));
  tie.position.copy(bot).add(new THREE.Vector3(0, 0.09, 0));
  tie.rotation.x = Math.PI / 2;
  g.add(tie);
  return { group: new THREE.Group(), torsoGroup: shadowed(g), googly: [], detachable: false };
}

/** Sarung tinju merah kembar dari Ball Party (ikut ayun lengan). */
function makeGloves(): AccessoryBuild {
  // the group rides the arm bone, whose frame is the sculpt limb frame: the
  // visible paw ball sits at [bow * 0.96, PAW(), 0.03] (B() of the sculpt's
  // mitten centre) — the physics HAND sits much higher up the arm
  const py = PAW();
  const px = ARM_BOW() * 0.96;
  const pz = 0.03;
  const pawR = 0.0765 * (0.7 * TU.armRoot + 0.3 * TU.armTip) * ASSET_LIMB.armR * ASSET_LIMB.pawR;
  const mk = (side: 1 | -1) => {
    const g = new THREE.Group();
    // proportions follow the game4 GlovesModel: egg-shaped mitt (y 1.1),
    // a tall cream cuff that clearly reads at the wrist, thumb on the
    // upper inner face, Champion Red vinyl
    g.rotation.z = -side * 0.1;
    g.rotation.x = 0.05;
    const red = accMat(0xe23a1e, 0.5, { clearcoat: 0.35 });
    const cuffM = accMat(0xfff7dc, 0.65, { clearcoat: 0.1 });
    const cx = side * px;
    // egg mitt hanging below-outside the paw — taller than wide
    const fist = new THREE.Mesh(new THREE.SphereGeometry(pawR * 2.1, 24, 18), red);
    fist.scale.set(0.94, 1.16, 0.98);
    fist.position.set(cx + side * pawR * 1.05, py - pawR * 0.35, pz + pawR * 0.45);
    g.add(fist);
    // thumb bump on the upper inner face (asset: ~45% of the ball, above centre)
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(pawR * 0.95, 14, 10), red);
    thumb.scale.set(0.9, 1.3, 0.9);
    thumb.position.set(cx + side * pawR * 0.15, py + pawR * 1.05, pz + pawR * 1.35);
    g.add(thumb);
    // short cream cuff tucked at the wrist: in the game4 asset the cuff is
    // only ~half the ball's height (0.5 vs 1.1) and ~70% of its radius, so it
    // reads as a snug band between arm and ball, never a tall white cup
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(pawR * 1.28, pawR * 1.48, pawR * 1.35, 16), cuffM);
    cuff.position.set(cx + side * pawR * 0.3, py + pawR * 0.8, pz + pawR * 0.12);
    g.add(cuff);
    return shadowed(g);
  };
  return { group: new THREE.Group(), torsoGroup: null, armLGroup: mk(1), armRGroup: mk(-1), googly: [], detachable: false };
}

/** Sandal jepit biru dari Bounce Paws (ikut kaki). */
function makeSandal(): AccessoryBuild {
  // the group rides the leg bone in the sculpt leg frame: the visible foot
  // ball sits at [FOOT_OUT(), footCenterY(), FOOT_FWD()]
  const fx = FOOT_OUT();
  const fy = footCenterY();
  const fz = FOOT_FWD();
  const fw = 0.105 * ASSET_LIMB.footW; // foot half-width-ish
  const mk = (side: 1 | -1) => {
    const g = new THREE.Group();
    const soleM = accMat(0x2f6fd0, 0.7, { clearcoat: 0.1 });
    const strapM = accMat(0x77b5ff, 0.6, { clearcoat: 0.2 });
    const cx = side * fx;
    // flat sole poking out all around under the paw
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(fw * 1.45, fw * 1.6, 0.055, 20), soleM);
    sole.scale.z = 1.6;
    sole.position.set(cx, fy - footRY() * 0.78, fz);
    g.add(sole);
    // toe-post + V strap hugging the instep
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8), strapM);
    post.position.set(cx, fy + footRY() * 0.3, fz + fw * 1.05);
    g.add(post);
    for (const sgn of [1, -1]) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, fw * 1.3, 8), strapM);
      strap.position.set(cx + sgn * fw * 0.28, fy + footRY() * 0.85, fz + fw * 0.1);
      strap.rotation.z = -sgn * 0.35;
      strap.rotation.x = -0.45;
      g.add(strap);
    }
    return shadowed(g);
  };
  return { group: new THREE.Group(), torsoGroup: null, legLGroup: mk(1), legRGroup: mk(-1), googly: [], detachable: false };
}

function buildAccessory(kind: AccessoryId, hs: Shape[], torso: Shape[] = []): AccessoryBuild | null {
  SCARF_TORSO = torso;
  switch (kind) {
    case "capRed":
      return makeCapNew(0xe8343c, hs);
    case "capBlue":
      return makeCapNew(0x2f6fe0, hs);
    case "capNewRed":
      return makeCapNew(0xe8343c, hs);
    case "capNewBlue":
      return makeCapNew(0x2f6fe0, hs);
    case "dolit":
      return makeDolit(hs);
    case "helmet":
      return makeHelmet(0xffcc2e, hs);
    case "crown":
      return makeCrown(hs);
    case "shades":
      return makeShades(hs);
    case "cowboy":
      return makeCowboy(hs);
    case "afro":
      return makeAfro(hs);
    case "nerd":
      return makeNerd(hs);
    case "detective":
      return makeDetective(hs);
    case "clownnose":
      return makeClownNose(hs);
    case "jason":
      return makeJason(hs);
    case "belt":
      return makeBelt(torso);
    case "boxers":
      return makeBoxers(torso);
    case "duckfloat":
      return makeDuckFloat(torso);
    case "broom":
      return makeBroom(torso);
    case "gloves":
      return makeGloves();
    case "sandal":
      return makeSandal();
    case "classic":
      return makeClassicGlasses(hs);
    case "cool":
      return makeCoolGlasses(hs);
    case "pixel":
      return makePixelGlasses(hs);
    case "collar":
      return makeCollar(torso);
    case "mallet":
      return makeMallet(torso);
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
  uncoveredGeometry: THREE.BufferGeometry | null; // restore ears when a cap is knocked off
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

export function buildCharacterVisual(def: AnimalDef, accessory: AccessoryId = "none", eyeStyle: EyeStyleId = "default", expression: ExpressionId = "default"): CharacterVisual {
  const isCap = accessory.startsWith("cap");
  // the fullface helmet and the hockey mask bake the ears away; the loose
  // geometry comes back when the mask is knocked off. Jambul the plush simply
  // has no ears at all, so they never come back.
  const earsHidden = accessory === "helmet" || accessory === "jason" || isCap || def.id === "jambul";
  const asset = getAsset(def, earsHidden);
  const uncoveredGeometry = earsHidden && def.id !== "jambul" ? getAsset(def).geometry : null;
  const bones = PARTS.map((name, i) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(asset.bindPos[i]);
    b.quaternion.copy(asset.bindQuat[i]);
    return b;
  });
  const skeleton = new THREE.Skeleton(bones, asset.boneInverses.map((m) => m.clone()));
  const skin = getShapeMode() === "asset" ? SKIN_MATERIAL_ASSET : SKIN_MATERIAL;
  const mesh = new THREE.SkinnedMesh(asset.geometry, skin);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const armMesh = new THREE.SkinnedMesh(asset.armGeometry, skin);
  armMesh.bind(skeleton, new THREE.Matrix4());
  armMesh.castShadow = true;
  armMesh.receiveShadow = true;
  armMesh.frustumCulled = false;

  const eyesNormal = new THREE.Group();
  const eyesKO = new THREE.Group();
  const eyesHurt = new THREE.Group();
  X_HURT = eyesHurt;
  X_PUPILS = [];
  buildFace(asset.recipe, bones[1], bones[0], eyesNormal, eyesKO, eyeStyle, expression);
  eyesHurt.visible = false;
  bones[1].add(eyesHurt);
  const find = (n: string) => bones[1].getObjectByName(n) ?? new THREE.Group();
  const acc = buildAccessory(
    accessory,
    asset.recipe.shapes.filter((sh) => sh.part === PI.head),
    asset.recipe.shapes.filter((sh) => sh.part === PI.torso)
  );
  if (acc) {
    if (!acc.googly.length) {
      batchRigidDetails(acc.group);
      if (acc.torsoGroup) batchRigidDetails(acc.torsoGroup);
      for (const limb of [acc.armLGroup, acc.armRGroup, acc.legLGroup, acc.legRGroup]) if (limb) batchRigidDetails(limb);
    }
    bones[1].add(acc.group);
    if (acc.torsoGroup) bones[0].add(acc.torsoGroup);
    if (acc.armLGroup) bones[2].add(acc.armLGroup);
    if (acc.armRGroup) bones[3].add(acc.armRGroup);
    if (acc.legLGroup) bones[4].add(acc.legLGroup);
    if (acc.legRGroup) bones[5].add(acc.legRGroup);
  }
  if (accessory === "helmet" || accessory === "jason" || def.id === "jambul") bones[1].traverse((o) => o.name === "whisker" && (o.visible = false));

  return {
    torso: bones[0],
    head: bones[1],
    armL: bones[2],
    armR: bones[3],
    legL: bones[4],
    legR: bones[5],
    mesh,
    uncoveredGeometry,
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
const _palmTurn = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
function setLimb(bone: THREE.Bone, pivot: V3, base: THREE.Vector3, rx: number, rz: number, ry = 0) {
  _e.set(rx, 0, rz);
  _q.setFromEuler(_e);
  if (ry) _q.multiply(_palmTurn.setFromAxisAngle(_upAxis, ry));
  _v.set(rig.LIMB_TOP[0], rig.LIMB_TOP[1], rig.LIMB_TOP[2]).applyQuaternion(_q);
  bone.position.set(base.x + pivot[0] - _v.x, base.y + pivot[1] - _v.y, base.z + pivot[2] - _v.z);
  bone.quaternion.copy(_q);
}

/** A quick natural blink with a short hold and a softer reopening. */
/** Free per-instance details without destroying shared cached skin geometry/materials. */
export function disposeCharacterDetails(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  for (const root of roots) root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o instanceof THREE.SkinnedMesh) { skeletons.add(o.skeleton); return; }
    geometries.add(o.geometry);
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!sharedMaterials.has(material)) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

export function animateBlink(v: CharacterVisual, time: number, phase = 0) {
  const t = (time + phase) % 4.6;
  let openness = 1;
  if (t < 0.09) openness = 1 - t / 0.09;
  else if (t < 0.14) openness = 0;
  else if (t < 0.29) openness = (t - 0.14) / 0.15;
  for (const eye of v.eyesNormal.children) eye.scale.y = Math.max(0.035, openness);
}

export function poseStatic(v: CharacterVisual, t: number) {
  animateBlink(v, t, 0.6);
  const gx = Math.sin(t * 1.15) * 0.7 + Math.sin(t * 2.8) * 0.18;
  const gy = Math.sin(t * 0.8 + 0.7) * 0.5;
  for (const p of v.pupils) {
    setPupilGaze(p, gx, gy);
  }
  const bob = Math.sin(t * 3) * 0.02;
  const base = new THREE.Vector3(0, rig.HOVER + bob, 0);
  v.torso.position.copy(base);
  v.torso.quaternion.identity();
  v.head.position.set(0, rig.HOVER + rig.HEAD_OFFSET + bob * 1.3, 0);
  _e.set(Math.sin(t * 1.3) * 0.04, Math.sin(t * 0.9) * 0.08, Math.sin(t * 1.7) * 0.07);
  v.head.quaternion.setFromEuler(_e);
  // A relaxed, near-vertical stance instead of a continuous wave / T-pose.
  // The small shoulder spread keeps the paws clear of the rounded body.
  const sway = Math.sin(t * 1.6) * 0.025;
  // Palms naturally face inwards; their existing markings remain on the palm.
  // The asset cat's mittens face forward, so its arms get only a slight
  // inward twist; a large twist swings the baked elbow bow forward/back and
  // makes the hanging arms look broken.
  const palmTurn = getShapeMode() === "asset" ? 0.32 : isSculptedShape() ? 1.1 : 0;
  // The asset's arms hang almost straight down beside the belly; the classic
  // shape keeps its wider, plush-toy spread.
  const armSpread = getShapeMode() === "asset" ? ASSET_LIMB.armSpread : isSculptedShape() ? 0.37 : 0.39;
  setLimb(v.armL, rig.SHOULDER_L, base, 0.08, armSpread + sway, -palmTurn);
  setLimb(v.armR, rig.SHOULDER_R, base, 0.08, -armSpread - sway, palmTurn);
  setLimb(v.legL, rig.HIP_L, base, 0, 0.04);
  setLimb(v.legR, rig.HIP_R, base, 0, -0.04);
}
