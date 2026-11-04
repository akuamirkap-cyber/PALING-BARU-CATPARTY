// Dev-only: CPU raymarch preview of the SDF figures → PNG (to compare against the reference render)
import { mkdirSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { CatModel, gradN } from '../src/cat/model';
import { buildWhiskers, makeFacePainter } from '../src/cat/face';
import { bakeAO } from '../src/cat/build';
import { OYEN, SIAM, type CatSpec } from '../src/cat/specs';
import type { RGB, V3 } from '../src/cat/math';

function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgb: Uint8Array) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const l2s = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

interface Placement { spec: CatSpec; cx: number; yaw: number }

function render(file: string, W: number, H: number, ppu: number, floorY: number, items: Placement[], decal = true) {
  const img = new Uint8Array(W * H * 3);
  const bg: RGB = [0.95, 0.87, 0.64];
  for (let i = 0; i < W * H; i++) { img[i * 3] = bg[0] * 255; img[i * 3 + 1] = bg[1] * 255; img[i * 3 + 2] = bg[2] * 255; }
  const L: V3 = [-0.45, 0.62, 0.64];
  const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  for (const it of items) {
    const m = new CatModel(it.spec);
    const painter = makeFacePainter(it.spec);
    const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
    const n: V3 = [0, 0, 0];
    const col: RGB = [0, 0, 0];
    const acc = { r: 0, g: 0, b: 0, a: 0 };
    const R = 0.9;
    const x0 = Math.max(0, Math.floor(it.cx - R * ppu)), x1 = Math.min(W, Math.ceil(it.cx + R * ppu));
    for (let py = 0; py < H; py++) {
      const Y = (floorY - py - 0.5) / ppu;
      if (Y < -0.03 || Y > 2.7) continue;
      for (let px = x0; px < x1; px++) {
        const X = (px + 0.5 - it.cx) / ppu;
        // view ray (X,Y,z) → object: rotate by -yaw
        let t = -1.3, hit = false, ox = 0, oz = 0;
        for (let s = 0; s < 220; s++) {
          const vz = -t;
          ox = X * cy - vz * sy; oz = X * sy + vz * cy;
          const d = m.dist(ox, Y, oz);
          if (d < 0.0004) { hit = true; break; }
          t += Math.max(d * 0.9, 0.0008);
          if (t > 1.4) break;
        }
        if (!hit) continue;
        gradN(m, ox, Y, oz, n);
        m.color(ox, Y, oz, col);
        const ao = bakeAO(m, ox, Y, oz, n[0], n[1], n[2]);
        // to view space normal
        const vnx = n[0] * cy + n[2] * sy, vnz = -n[0] * sy + n[2] * cy, vny = n[1];
        const dif = Math.max(0, vnx * L[0] + vny * L[1] + vnz * L[2]);
        const rim = Math.pow(1 - Math.max(0, vnz), 3) * 0.25;
        const hx = L[0], hy = L[1], hz = L[2] + 1, hl = Math.hypot(hx, hy, hz);
        const spec = Math.pow(Math.max(0, (vnx * hx + vny * hy + vnz * hz) / hl), 16) * 0.04;
        const lit = (0.48 + 0.72 * dif) * (0.5 + 0.5 * ao);
        let r = col[0] * lit + rim * 0.2 + spec, g = col[1] * lit + rim * 0.18 + spec, b = col[2] * lit + rim * 0.16 + spec;
        if (decal && oz > m.faceZ0 - 0.1) {
          const F = it.spec.face.rect;
          if (ox > F[0] && ox < F[2] && Y > F[1] && Y < F[3]) {
            acc.r = acc.g = acc.b = acc.a = 0;
            painter.paint(ox, Y, 1 / ppu, acc);
            if (acc.a > 0) {
              const dr = s2l(acc.r / acc.a) * lit, dg = s2l(acc.g / acc.a) * lit, db = s2l(acc.b / acc.a) * lit;
              r = r * (1 - acc.a) + dr * acc.a; g = g * (1 - acc.a) + dg * acc.a; b = b * (1 - acc.a) + db * acc.a;
            }
          }
        }
        const o = (py * W + px) * 3;
        img[o] = Math.min(255, l2s(Math.min(1, r)) * 255);
        img[o + 1] = Math.min(255, l2s(Math.min(1, g)) * 255);
        img[o + 2] = Math.min(255, l2s(Math.min(1, b)) * 255);
      }
    }
  }
  // overlay 3D whiskers (orthographic projection, only for un-rotated figures)
  for (const it of items) {
    if (it.yaw !== 0) continue;
    const m = new CatModel(it.spec);
    const col = it.spec.pal.whisker.replace('#', '');
    const cr = parseInt(col.slice(0, 2), 16), cg = parseInt(col.slice(2, 4), 16), cb = parseInt(col.slice(4, 6), 16);
    const rad = Math.max(1, it.spec.face.whiskerR * ppu * 1.2);
    for (const w of buildWhiskers(m)) {
      const n = w.length / 3;
      for (let i = 0; i < n - 1; i++) {
        const ax = it.cx + w[i * 3] * ppu, ay = floorY - w[i * 3 + 1] * ppu;
        const bx = it.cx + w[i * 3 + 3] * ppu, by = floorY - w[i * 3 + 4] * ppu;
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
        const r = rad * (1 - 0.6 * (i / n));
        for (let s2 = 0; s2 <= steps; s2++) {
          const px = ax + (bx - ax) * (s2 / steps), py = ay + (by - ay) * (s2 / steps);
          for (let yy = Math.floor(py - r); yy <= Math.ceil(py + r); yy++) for (let xx = Math.floor(px - r); xx <= Math.ceil(px + r); xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const dd = Math.hypot(xx + 0.5 - px, yy + 0.5 - py);
            const a = Math.max(0, Math.min(1, r + 0.5 - dd));
            if (a <= 0) continue;
            const o = (yy * W + xx) * 3;
            img[o] = img[o] * (1 - a) + cr * a; img[o + 1] = img[o + 1] * (1 - a) + cg * a; img[o + 2] = img[o + 2] * (1 - a) + cb * a;
          }
        }
      }
    }
  }
  if (process.env.REF) for (const it of items) if (it.yaw === 0) dots(img, W, H, it.cx, floorY, ppu, REF[it.spec.id]);
  writeFileSync(file, png(W, H, img));
  console.log('wrote', file);
}

const REF: Record<string, [number, number][]> = {
  oyen: [[0.567, 1.95], [0.587, 1.82], [0.58, 1.68], [0.553, 1.56], [0.512, 1.45], [0.463, 1.367],
    [0.497, 1.29], [0.56, 1.18], [0.617, 1.05], [0.66, 0.917], [0.7, 0.81], [0.728, 0.725], [0.742, 0.64], [0.732, 0.56], [0.483, 0.45]],
  siam: [[0.34, 1.99], [0.42, 1.73], [0.16, 1.83], [0, 1.85], [0.453, 1.633], [0.485, 1.533], [0.495, 1.417], [0.483, 1.3], [0.47, 1.2], [0.433, 1.117], [0.41, 1.067],
    [0.453, 1.017], [0.503, 0.933], [0.543, 0.833], [0.573, 0.733], [0.597, 0.633], [0.603, 0.55], [0.583, 0.483], [0.537, 0.447], [0.405, 0.42]],
};
function dots(img: Uint8Array, W: number, H: number, cx: number, floorY: number, ppu: number, pts: [number, number][]) {
  for (const [x, y] of pts) for (const sgn of [-1, 1]) {
    const px = Math.round(cx + sgn * x * ppu), py = Math.round(floorY - y * ppu);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      const X = px + dx, Y = py + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 3; img[o] = 235; img[o + 1] = 20; img[o + 2] = 40;
    }
  }
}
mkdirSync('tools/out', { recursive: true });
const mode = process.argv[2] || 'front';
const t0 = Date.now();
if (mode === 'front') {
  // same framing as the reference: 300px/unit, Oyen at x=292, Siam at x=760, floor at y=880 (here at half scale)
  const k = Number(process.argv[3] || 0.5);
  render('tools/out/front.png', Math.round(1024 * k), Math.round(1024 * k), 300 * k, 880 * k, [
    { spec: OYEN, cx: 292 * k, yaw: 0 },
    { spec: SIAM, cx: 760 * k, yaw: 0 },
  ]);
} else if (mode === 'turn') {
  const k = 0.42;
  const W = Math.round(1700 * k), H = Math.round(900 * k);
  render('tools/out/turn.png', W, H, 300 * k, 860 * k, [
    { spec: OYEN, cx: 260 * k, yaw: 0.6 },
    { spec: OYEN, cx: 700 * k, yaw: Math.PI / 2 },
    { spec: OYEN, cx: 1150 * k, yaw: Math.PI },
    { spec: SIAM, cx: 1520 * k, yaw: -0.7 },
  ]);
} else if (mode === 'ref') {
  const k = 0.6;
  render('tools/out/ref.png', Math.round(1024 * k), Math.round(1024 * k), 300 * k, 880 * k, [
    { spec: OYEN, cx: 290 * k, yaw: 0.27 },
    { spec: SIAM, cx: 758 * k, yaw: -0.21 },
  ]);
} else if (mode === 'top') {
  // Top-down camera view (looking straight down +Y) to verify head roundness from above
  const k = 0.55;
  const W = Math.round(900 * k), H = Math.round(900 * k);
  const img = new Uint8Array(W * H * 3);
  const bg: RGB = [0.95, 0.87, 0.64];
  for (let i = 0; i < W * H; i++) { img[i * 3] = bg[0] * 255; img[i * 3 + 1] = bg[1] * 255; img[i * 3 + 2] = bg[2] * 255; }
  const ppu = 300 * k;
  const cats = [
    { spec: OYEN, cx: W * 0.5, cz: H * 0.62 },
    { spec: SIAM, cx: W * 0.5, cz: H * 0.32 },
  ];
  for (const it of cats) {
    const m = new CatModel(it.spec);
    const n: V3 = [0, 0, 0];
    const col: RGB = [0, 0, 0];
    for (let py = 0; py < H; py++) {
      const Z = (py + 0.5 - it.cz) / ppu;
      for (let px = 0; px < W; px++) {
        const X = (px + 0.5 - it.cx) / ppu;
        let yHit = NaN;
        for (let y = 2.6; y >= 0.0; y -= 0.008) {
          const d = m.dist(X, y, Z);
          if (d < 0.001) { yHit = y; break; }
        }
        if (Number.isNaN(yHit)) continue;
        gradN(m, X, yHit, Z, n);
        m.color(X, yHit, Z, col);
        const dif = Math.max(0, n[1] * 0.7 + n[2] * 0.5 + n[0] * 0.3);
        const r = col[0] * (0.4 + 0.6 * dif), g = col[1] * (0.4 + 0.6 * dif), b = col[2] * (0.4 + 0.6 * dif);
        const o = (py * W + px) * 3;
        img[o] = Math.min(255, l2s(Math.min(1, r)) * 255);
        img[o + 1] = Math.min(255, l2s(Math.min(1, g)) * 255);
        img[o + 2] = Math.min(255, l2s(Math.min(1, b)) * 255);
      }
    }
  }
  writeFileSync('tools/out/top.png', png(W, H, img));
  console.log('wrote tools/out/top.png');
} else if (mode === 'arm') {
  // close side views like the user's screenshot (pure side, from slightly behind, from slightly in front)
  const k = 0.62;
  const W = Math.round(1560 * k), H = Math.round(860 * k);
  render('tools/out/arm.png', W, H, 300 * k, 830 * k, [
    { spec: OYEN, cx: 270 * k, yaw: Math.PI / 2 },
    { spec: OYEN, cx: 800 * k, yaw: Math.PI / 2 + 0.55 },
    { spec: SIAM, cx: 1290 * k, yaw: Math.PI / 2 - 0.45 },
  ]);
} else if (mode === 'side') {
  const k = 0.5;
  const W = Math.round(1500 * k), H = Math.round(900 * k);
  render('tools/out/side.png', W, H, 300 * k, 850 * k, [
    { spec: OYEN, cx: 230 * k, yaw: Math.PI / 2 },
    { spec: OYEN, cx: 640 * k, yaw: -2.35 },
    { spec: SIAM, cx: 1010 * k, yaw: Math.PI / 2 },
    { spec: SIAM, cx: 1330 * k, yaw: 0.35 },
  ]);
} else if (mode === 'face') {
  const k = 1.4;
  render('tools/out/face.png', Math.round(560 * k), Math.round(420 * k), 300 * k, 880 * k - 1.25 * 300 * k + 330 * k, [
    { spec: OYEN, cx: 280 * k, yaw: 0 },
  ]);
}
console.log('time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
