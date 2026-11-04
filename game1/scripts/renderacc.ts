const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as THREE from "three";
import * as fs from "fs";
import * as zlib from "zlib";
import { ANIMALS } from "../src/game/animals";
const T = 360;
const COLS = 4, ROWS = 2; const W = T * COLS, H = T * ROWS;
const img = new Float32Array(W * H * 3);
const zb = new Float32Array(W * H);
const light = new THREE.Vector3(0.4, 0.7, 0.8).normalize();
let cell = 0;
function render(roots: THREE.Object3D[], camera: THREE.PerspectiveCamera, bg: number) {
  const ox = (cell % COLS) * T, oy = Math.floor(cell / COLS) * T; cell++;
  const bgc = new THREE.Color(bg);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const k = (oy + y) * W + ox + x; img[k * 3] = bgc.r; img[k * 3 + 1] = bgc.g; img[k * 3 + 2] = bgc.b; zb[k] = Infinity; }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, unlit: boolean, bias: number) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return; n.normalize();
    if (n.dot(new THREE.Vector3().subVectors(camera.position, a)) < 0) return;
    const sh = unlit ? 1 : 0.45 + 0.65 * Math.max(0, n.dot(light));
    const P = [a, b, c].map((p) => { const q = p.clone().project(camera); return [ox + (q.x * 0.5 + 0.5) * T, oy + (-q.y * 0.5 + 0.5) * T, q.z]; });
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = Math.max(oy, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))); y <= Math.min(oy + T - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1]))); y++)
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
      const mat = m.material as any; if (mat.transparent && mat.opacity < 0.6) return;
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
const batRoots = () => [A.root, Bc.root, ...arena.bats.map((b) => b.mesh)];
// 1: bat resting on shoulder (front-3/4 view)

import { buildCharacterVisual, poseStatic } from "../src/game/characterMesh";
import { setTuning } from "../src/game/tuning";
if (process.argv[4]) setTuning(JSON.parse(process.argv[4]));
const cam = (x: number, y: number, z: number, lx: number, ly: number, lz: number) => { const c = new THREE.PerspectiveCamera(30, 1, 0.1, 50); c.position.set(x, y, z); c.lookAt(lx, ly, lz); c.updateMatrixWorld(); return c; };
const show = (id: string, acc: any, yaw: number, bg: number, hy = 0, hp = 0) => {
  const v = buildCharacterVisual(ANIMALS.find((a) => a.id === id)!, acc);
  const root = new THREE.Group(); root.add(...v.all); root.rotation.y = yaw;
  poseStatic(v, 0.4); v.head.quaternion.setFromEuler(new THREE.Euler(hp, hy, 0));
  const cz = parseFloat(process.env.CAMZ ?? "3.0"), cy = parseFloat(process.env.CAMY ?? "1.4"), ly = parseFloat(process.env.LOOKY ?? "1.08");
  render([root], cam(0, cy, cz, 0, ly, 0), bg);
};
const list = (process.argv[3] ?? "oyen:capRed:0,oreo:capBlue:0.6,mochi:dolit:0,oyen:dolit:0.7,oreo:helmet:0,oyen:helmet:0.8,moka:capBlue:-0.5,garong:none:0").split(",");
const BGS = [0x6a5bc4, 0xf4b8cc, 0x2f9a6a, 0x1f9bb5, 0xf0b13a, 0x2c4fb0, 0xd9cfc6, 0xe08aa8];
list.forEach((e, i) => { const [id, acc, yaw, hy, hp] = e.split(":"); show(id, acc, parseFloat(yaw), BGS[i % BGS.length], parseFloat(hy ?? "0") || 0, parseFloat(hp ?? "0") || 0); });
const raw = Buffer.alloc((W * 3 + 1) * H);
const sr = (x: number) => { x = Math.min(1, Math.max(0, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) raw[y * (W * 3 + 1) + 1 + x * 3 + k] = sr(img[(y * W + x) * 3 + k]); }
const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(process.argv[2] ?? "/tmp/scene.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("ok");

