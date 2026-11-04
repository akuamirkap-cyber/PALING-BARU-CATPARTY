// Renders physics-simulated poses (bat rest / mid-swing / overhead carry) with the software rasterizer.
const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import * as fs from "fs";
import * as zlib from "zlib";
import { Character, GRAVITY, bodyOwner } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";

const T = 360;
const scenes: { title: string; setup: () => { roots: THREE.Object3D[]; cam: THREE.PerspectiveCamera } }[] = [];
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
(world.solver as CANNON.GSSolver).iterations = 14;
const gm = new CANNON.Material("g");
const scene = new THREE.Scene();
const arena = new Arena(world, scene, gm);
const hooks = { onLand() {}, onStep() {}, onHit() {}, onKO() {} } as any;
const A = new Character(world, 0, ANIMALS.find((a) => a.id === "oyen")!, "A", 1, hooks, new THREE.Vector3(0, 0.05, 0), 0, emptyControl());
const Bc = new Character(world, 1, ANIMALS.find((a) => a.id === "oreo")!, "B", 0, hooks, new THREE.Vector3(3, 0.05, 3), 0, emptyControl());
Character.all = [A, Bc];
Character.bats = arena.bats;
const pt = new CANNON.Vec3();
function sim(sec: number, f?: () => void) {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    f?.();
    for (const c of Character.all) { c.heldBy = 0; c.carriedBy = null; }
    for (const c of Character.all) for (const h of [c.holds.armL, c.holds.armR]) if (h?.owner) { h.owner.heldBy++; if (c.lifting && h.carry) h.owner.carriedBy = c; }
    for (const c of Character.all) c.updateCollisionMask();
    for (const c of Character.all) c.frameActions(1 / 60);
    for (const c of Character.all) { c.input.jump = c.input.punch = c.input.lift = c.input.headbutt = false; }
    for (let s = 0; s < 2; s++) {
      for (const c of Character.all) c.physicsStep(1 / 120);
      world.step(1 / 120);
      for (const con of world.contacts) {
        const a = bodyOwner.get(con.bi), b = bodyOwner.get(con.bj);
        if (a) { con.bi.position.vadd(con.ri, pt); a.char.onContact(a.part, con.bj, pt, b); }
        if (b) { con.bj.position.vadd(con.rj, pt); b.char.onContact(b.part, con.bi, pt, a); }
      }
      for (const c of Character.all) c.updateHolds(1 / 120);
    }
    arena.update(1 / 60, 0);
  }
  for (const c of Character.all) c.syncVisual();
}
const tp = (c: Character, x: number, z: number) => { const dx = x - c.torso.position.x, dz = z - c.torso.position.z; for (const b of c.parts) { b.position.x += dx; b.position.z += dz; b.velocity.set(0, 0, 0); } };
const cam = (x: number, y: number, z: number, lx: number, ly: number, lz: number) => { const c = new THREE.PerspectiveCamera(32, 1, 0.1, 50); c.position.set(x, y, z); c.lookAt(lx, ly, lz); c.updateMatrixWorld(); return c; };

const W = T * 4, H = T;
const img = new Float32Array(W * H * 3);
const zb = new Float32Array(W * H);
const light = new THREE.Vector3(0.4, 0.7, 0.8).normalize();
let cell = 0;
function render(roots: THREE.Object3D[], camera: THREE.PerspectiveCamera, bg: number) {
  const ox = cell * T; cell++;
  const bgc = new THREE.Color(bg);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const k = y * W + ox + x; img[k * 3] = bgc.r; img[k * 3 + 1] = bgc.g; img[k * 3 + 2] = bgc.b; zb[k] = Infinity; }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, unlit: boolean, bias: number) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return; n.normalize();
    if (n.dot(new THREE.Vector3().subVectors(camera.position, a)) < 0) return;
    const sh = unlit ? 1 : 0.45 + 0.65 * Math.max(0, n.dot(light));
    const P = [a, b, c].map((p) => { const q = p.clone().project(camera); return [ox + (q.x * 0.5 + 0.5) * T, (-q.y * 0.5 + 0.5) * T, q.z]; });
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))); y <= Math.min(T - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1]))); y++)
      for (let x = Math.max(ox, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))); x <= Math.min(ox + T - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0]))); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
        const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2] - bias, k = y * W + x;
        if (z >= zb[k]) continue; zb[k] = z;
        img[k * 3] = (w0 * ca.r + w1 * cb.r + w2 * cc.r) * sh; img[k * 3 + 1] = (w0 * ca.g + w1 * cb.g + w2 * cc.g) * sh; img[k * 3 + 2] = (w0 * ca.b + w1 * cb.b + w2 * cc.b) * sh;
      }
  };
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let vis = true; let q: THREE.Object3D | null = m; while (q) { if (!q.visible) vis = false; q = q.parent; } if (!vis) return;
      const g = m.geometry, pos = g.getAttribute("position"), idx = g.getIndex();
      const mat = m.material as any;
      const cnt = idx ? idx.count : pos.count;
      if ((m as any).isSkinnedMesh) {
        const sk = (m as THREE.SkinnedMesh).skeleton, col = g.getAttribute("color"), si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight");
        const bm = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
        const P: THREE.Vector3[] = [], C: THREE.Color[] = [];
        for (let i = 0; i < pos.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(pos, i), r = new THREE.Vector3();
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) r.addScaledVector(p.clone().applyMatrix4(bm[si.getComponent(i, k)]), w); }
          P.push(r); C.push(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
        }
        for (let t = 0; t < cnt; t += 3) { const a = idx!.getX(t), b = idx!.getX(t + 1), c = idx!.getX(t + 2); tri(P[a], P[b], P[c], C[a], C[b], C[c], false, 0); }
      } else {
        const c = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1);
        const V = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        for (let t = 0; t < cnt; t += 3) { const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, d = idx ? idx.getX(t + 2) : t + 2; tri(V(a), V(b), V(d), c, c, c, !!mat.isMeshBasicMaterial, mat.polygonOffset ? 0.0004 : 0); }
      }
    });
  }
}
const look = (bx: number, bz: number, bg: number, camx = 0) => {
  tp(A, 0, 0); tp(Bc, bx, bz); A.input = emptyControl(); Bc.input = emptyControl();
  sim(1.4, () => { A.facing = 0; Bc.facing = Math.atan2(-bx, -bz); });
  for (let i = 0; i < 30; i++) A.syncVisual();
  const p = A.torso.position;
  render([A.root], cam(p.x + camx, 1.35, p.z + 2.6, p.x, 1.05, p.z), bg);
};
look(2.6, 0.6, 0x6a5bc4);   // cat on the viewer's right
look(-2.6, 0.6, 0x2f9a6a);  // cat on the viewer's left
// KO ragdoll lying: arms must stay outside the belly
tp(Bc, 6, 6); tp(A, 0, 0); sim(0.5); A.knockOut(3); sim(1.6);
let p = A.torso.position;
render([A.root], cam(p.x + 0.2, 2.6, p.z + 1.6, p.x, 0.3, p.z), 0xf4b8cc);
// running: arm pumps beside the body
A.koTimer = 0; tp(A, -3, 0); sim(1.2);
sim(0.55, () => { A.input.mx = 1; A.input.run = true; });
p = A.torso.position;
render([A.root], cam(p.x + 0.3, 1.3, p.z + 2.8, p.x, 0.9, p.z), 0x1f9bb5);
const raw = Buffer.alloc((W * 3 + 1) * H);
const sr = (x: number) => { x = Math.min(1, Math.max(0, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) raw[y * (W * 3 + 1) + 1 + x * 3 + k] = sr(img[(y * W + x) * 3 + k]); }
const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(process.argv[2] ?? "/tmp/scene.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("ok"); void ("carried", !!Bc.carriedBy, "B expr", Bc.expr, "B ko", Bc.ko, "B y", Bc.torso.position.y.toFixed(2), "A head y", A.head.position.y.toFixed(2), "dxz", Math.hypot(Bc.torso.position.x - A.torso.position.x, Bc.torso.position.z - A.torso.position.z).toFixed(2));
void scenes;
