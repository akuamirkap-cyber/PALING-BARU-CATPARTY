const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as THREE from "three";
import * as fs from "fs";
import * as zlib from "zlib";
import { ANIMALS } from "../src/game/animals";
import { buildCharacterVisual, poseStatic } from "../src/game/characterMesh";

const T = 300, COLS = 3;
const ids = (process.argv[2] || ANIMALS.map(a=>a.id).join(",")).split(",");
const yaw = parseFloat(process.argv[3] ?? "0");
const camY = parseFloat(process.argv[4] ?? "1.35");
const camZ = parseFloat(process.argv[5] ?? "4.6");
const look = parseFloat(process.argv[6] ?? "1.2");
const out = process.argv[7] ?? "/tmp/cats.png";
const rows = Math.ceil(ids.length / COLS);
const W = T * Math.min(COLS, ids.length), H = T * rows;
const img = new Float32Array(W * H * 3);
const zb = new Float32Array(W * H).fill(Infinity);
const light = new THREE.Vector3(0.4, 0.7, 0.8).normalize();
const toLin = (c: THREE.Color) => c;

ids.forEach((id, n) => {
  const def = ANIMALS.find(a => a.id === id)!;
  const ox = (n % COLS) * T, oy = Math.floor(n / COLS) * T;
  const bg = new THREE.Color(def.ui);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = ((oy + y) * W + ox + x) * 3; img[i] = bg.r; img[i+1] = bg.g; img[i+2] = bg.b; }
  const v = buildCharacterVisual(def);
  const root = new THREE.Group(); root.add(...v.all); root.rotation.y = yaw;
  poseStatic(v, 0.4); v.head.quaternion.identity();
  const ex = process.argv[8];
  if (ex === "hurt" || ex === "dizzy") {
    v.eyesNormal.visible = false; v.mouthN.visible = false;
    (ex === "hurt" ? v.eyesHurt : v.eyesKO).visible = true;
    (ex === "hurt" ? v.mouthCry : v.mouthWavy).visible = true;
  }
  root.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, camY, camZ); cam.lookAt(0, look, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, unlit = false, bias = 0) => {
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() < 1e-14) return; nrm.normalize();
    const toCam = new THREE.Vector3().subVectors(cam.position, a);
    if (nrm.dot(toCam) < 0) return; // backface
    const sh = unlit ? 1 : 0.45 + 0.65 * Math.max(0, nrm.dot(light));
    const P = [a, b, c].map(p => { const q = p.clone().project(cam); return [ox + (q.x * 0.5 + 0.5) * T, oy + (-q.y * 0.5 + 0.5) * T, q.z]; });
    const minx = Math.max(ox, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxx = Math.min(ox + T - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const miny = Math.max(oy, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxy = Math.min(oy + T - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2] - bias;
      const k = y * W + x;
      if (z >= zb[k]) continue; zb[k] = z;
      img[k*3] = (w0*ca.r + w1*cb.r + w2*cc.r) * sh; img[k*3+1] = (w0*ca.g + w1*cb.g + w2*cc.g) * sh; img[k*3+2] = (w0*ca.b + w1*cb.b + w2*cc.b) * sh;
    }
  };
  // skinned body
  const g = v.mesh.geometry, pos = g.getAttribute("position"), col = g.getAttribute("color"), si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight");
  const sk = v.mesh.skeleton; const bm = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
  const P: THREE.Vector3[] = [], C: THREE.Color[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i), r = new THREE.Vector3();
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) r.addScaledVector(p.clone().applyMatrix4(bm[si.getComponent(i, k)]), w); }
    P.push(r); C.push(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)));
  }
  const idx = g.getIndex()!;
  for (let t = 0; t < idx.count; t += 3) tri(P[idx.getX(t)], P[idx.getX(t+1)], P[idx.getX(t+2)], C[idx.getX(t)], C[idx.getX(t+1)], C[idx.getX(t+2)]);
  // features
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as any).isSkinnedMesh || !m.visible) return;
    let vis = true; let p: THREE.Object3D | null = m; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return;
    const mat = m.material as THREE.MeshStandardMaterial; const c = toLin(mat.color.clone());
    const unlit = (mat as any).isMeshBasicMaterial;
    const gp = m.geometry.getAttribute("position"); const gi = m.geometry.getIndex();
    const V = (i: number) => new THREE.Vector3().fromBufferAttribute(gp, i).applyMatrix4(m.matrixWorld);
    const cnt = gi ? gi.count : gp.count;
    for (let t = 0; t < cnt; t += 3) { const a = gi ? gi.getX(t) : t, b = gi ? gi.getX(t+1) : t+1, d = gi ? gi.getX(t+2) : t+2; tri(V(a), V(b), V(d), c, c, c, unlit, (mat as any).polygonOffset ? 0.0004 : 0); }
  });
});
// write PNG (linear -> sRGB)
const raw = Buffer.alloc((W * 3 + 1) * H);
const s = (x: number) => { x = Math.min(1, Math.max(0, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1/2.4) - 0.055)); };
for (let y = 0; y < H; y++) { raw[y * (W*3+1)] = 0; for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) raw[y*(W*3+1) + 1 + x*3 + k] = s(img[(y*W+x)*3+k]); }
const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote", out, W, H);
