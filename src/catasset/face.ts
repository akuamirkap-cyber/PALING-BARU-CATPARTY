import { clamp, hexSrgb, mix, sdSeg2, sdTri2, smoothstep, type RGB, type V3 } from './math';
import { CatModel, gradN, traceFront } from './model';
import type { CatSpec } from './specs';

interface Acc { r: number; g: number; b: number; a: number }
function over(acc: Acc, c: RGB, a: number) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  const ia = 1 - a;
  acc.r = c[0] * a + acc.r * ia;
  acc.g = c[1] * a + acc.g * ia;
  acc.b = c[2] * a + acc.b * ia;
  acc.a = a + acc.a * ia;
}
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a: RGB, s: number): RGB => [a[0] * s, a[1] * s, a[2] * s];

function bez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export interface FacePainter {
  paint(x: number, y: number, px: number, acc: Acc): number; // returns gloss mask
}

export function makeFacePainter(spec: CatSpec): FacePainter {
  const F = spec.face, P = spec.pal;
  const R = F.eyeR;
  const cOutline = hexSrgb(P.outline), cIrisIn = hexSrgb(P.iris[0]), cIrisOut = hexSrgb(P.iris[1]);
  const cPupil = hexSrgb(P.pupil), cNose = hexSrgb(P.nose), cNoseDark = hexSrgb(P.noseDark), cLine = hexSrgb(P.line);
  const cPupilLow = lerp3(cPupil, [0.2, 0.3, 0.45], 0.45);

  // angled eyelid cut line (for the +X eye, relative to eye centre).
  const Ix = F.browIn[0] * R, Iy = F.browIn[1] * R, Ox = F.browOut[0] * R, Oy = F.browOut[1] * R;
  let ux = Ox - Ix, uy = Oy - Iy;
  const ul = Math.hypot(ux, uy);
  ux /= ul; uy /= ul;
  const nx = -uy, ny = ux; // upward normal
  const arch = F.browArch * R;
  const bl = ul;

  // mouth lobe (for +X side) as a polyline
  const J = F.mouthJ, W = F.mouthW, D = F.mouthD;
  const mouthPts: number[] = [];
  const NM = 26;
  for (let i = 0; i <= NM; i++) {
    const t = i / NM;
    mouthPts.push(bez(0, 0.004, W * 0.86, W, t), bez(J, J - 1.12 * D, J - 1.16 * D, J + 0.06 * D, t));
  }
  const noseTop = F.noseY + F.noseH / 2, noseBot = F.noseY - F.noseH / 2;
  const nr = F.noseH * 0.32;

  return {
    paint(x: number, y: number, px: number, acc: Acc): number {
      const ax = Math.abs(x);
      const aa = (d: number) => clamp(0.5 - d / px, 0, 1);
      let gloss = 0;
      // ── eyes (clean angry-cute shape, eyelid contour without caterpillar block) ──
      const ex = ax - F.eyeX, ey = y - F.eyeY;
      if (ex * ex + ey * ey < (R * 1.55) * (R * 1.55)) {
        const dCircle = Math.hypot(ex, ey) - R;
        // arched cut line for top eyelid
        const tl = clamp(((ex - Ix) * (Ox - Ix) + (ey - Iy) * (Oy - Iy)) / (bl * bl), 0, 1);
        const dCut = (ex - Ix) * nx + (ey - Iy) * ny - 4 * tl * (1 - tl) * arch;
        const dEye = Math.max(dCircle, dCut);

        // outline: clean frame, slightly thicker on the upper cut (topLinerW)
        const linerT = smoothstep(-0.02 * R, 0.04 * R, (ex - Ix) * nx + (ey - Iy) * ny);
        const ol = mix(F.outlineW, F.topLinerW, linerT) * R;

        const cov = aa(dEye);
        gloss = cov;
        if (cov > 0) {
          over(acc, cOutline, cov);
          const ci = aa(dEye + ol);
          if (ci > 0) {
            const rr = Math.hypot(ex, ey) / R;
            let c = lerp3(cIrisIn, cIrisOut, smoothstep(0.15, 1.0, rr));
            const bottom = smoothstep(0.2, -0.85, ey / R);
            c = lerp3(c, cIrisIn, bottom * 0.35);
            const sh = smoothstep(-0.5 * R, -0.04 * R, dCut);
            c = scale3(c, 1 - 0.28 * sh);
            over(acc, c, ci);
            // pupil
            const pcx = F.pupilDX * R, pcy = F.pupilDY * R;
            const pr = F.pupilR * R;
            const dP = Math.hypot(ex - pcx, ey - pcy) - pr;
            const cp = aa(Math.max(dP, dEye + ol));
            if (cp > 0) {
              const v = smoothstep(pr * 0.2, -pr, ey - pcy);
              let pc = lerp3(cPupil, cPupilLow, v * 0.75);
              pc = scale3(pc, 1 - 0.22 * sh);
              over(acc, pc, cp);
              // subtle reflection
              const hx = x - (Math.sign(x) * F.eyeX + Math.sign(x) * pcx) + pr * 0.34;
              const hy = ey - pcy - pr * 0.36;
              const hd = (hx * hx) / (pr * pr * 0.16) + (hy * hy) / (pr * pr * 0.07);
              over(acc, [0.62, 0.72, 0.86], Math.exp(-hd * 1.6) * 0.22 * cp);
            }
          }
        }
      }
      // ── nose ──
      if (Math.abs(y - F.noseY) < F.noseH * 1.5 && ax < F.noseW) {
        const dN = sdTri2(x, y, -F.noseW / 2 + nr * 1.2, noseTop - nr, F.noseW / 2 - nr * 1.2, noseTop - nr, 0, noseBot + nr * 1.3) - nr;
        const cn = aa(dN);
        if (cn > 0) {
          let c = lerp3(cNoseDark, cNose, smoothstep(0.0, -0.008, dN));
          c = lerp3(c, [1, 0.86, 0.88], smoothstep(F.noseY - F.noseH * 0.1, noseTop, y) * smoothstep(-0.004, -0.012, dN) * 0.35);
          over(acc, c, cn);
        }
      }
      // ── mouth ──
      if (y < noseBot + 0.01 && y > J - D * 1.6 && ax < W + 0.03) {
        let dm = sdSeg2(ax, y, 0, noseBot + 0.003, 0, J);
        for (let i = 0; i < NM; i++) {
          const d = sdSeg2(ax, y, mouthPts[i * 2], mouthPts[i * 2 + 1], mouthPts[i * 2 + 2], mouthPts[i * 2 + 3]);
          if (d < dm) dm = d;
        }
        over(acc, cLine, aa(dm - F.lineW * 0.5));
      }
      return gloss;
    },
  };
}

/** Paint the face decal texture. Row 0 = bottom (DataTexture, flipY=false). */
export function paintFaceTexture(spec: CatSpec, W: number, H: number) {
  const [x0, y0, x1, y1] = spec.face.rect;
  const painter = makeFacePainter(spec);
  const rgba = new Uint8ClampedArray(W * H * 4);
  const mat = new Uint8ClampedArray(W * H * 4);
  const px = (x1 - x0) / W;
  const bleed = hexSrgb(spec.pal.outline);
  const acc: Acc = { r: 0, g: 0, b: 0, a: 0 };
  for (let j = 0; j < H; j++) {
    const y = y0 + ((j + 0.5) / H) * (y1 - y0);
    for (let i = 0; i < W; i++) {
      const x = x0 + ((i + 0.5) / W) * (x1 - x0);
      acc.r = acc.g = acc.b = acc.a = 0;
      const gloss = painter.paint(x, y, px, acc);
      const o = (j * W + i) * 4;
      if (acc.a > 0.002) {
        rgba[o] = (acc.r / acc.a) * 255;
        rgba[o + 1] = (acc.g / acc.a) * 255;
        rgba[o + 2] = (acc.b / acc.a) * 255;
      } else {
        rgba[o] = bleed[0] * 255; rgba[o + 1] = bleed[1] * 255; rgba[o + 2] = bleed[2] * 255;
      }
      rgba[o + 3] = acc.a * 255;
      mat[o] = gloss * 255;
      mat[o + 1] = (1 - 0.62 * gloss) * 255;
      mat[o + 2] = 0;
      mat[o + 3] = 255;
    }
  }
  return { rgba, mat, W, H };
}

// ───────────────────────── decal & whisker geometry ─────────────────────────
export function buildDecal(m: CatModel, nx = 140, ny = 76) {
  const s = m.s;
  const [x0, y0, x1, y1] = s.face.rect;
  const zStart = s.head.c[2] + s.head.rz + 0.15;
  const zMin = s.head.c[2] - 0.05;
  const nv = (nx + 1) * (ny + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const ok = new Uint8Array(nv);
  const n: V3 = [0, 0, 0];
  const lift = 0.0026;
  for (let j = 0; j <= ny; j++) {
    const y = y0 + ((y1 - y0) * j) / ny;
    let zs = zStart;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const k = j * (nx + 1) + i;
      const z = traceFront(m, x, y, zs, zMin);
      uv[k * 2] = i / nx;
      uv[k * 2 + 1] = j / ny;
      if (Number.isNaN(z)) { ok[k] = 0; continue; }
      gradN(m, x, y, z, n);
      ok[k] = n[2] > 0.06 ? 1 : 0;
      pos[k * 3] = x + n[0] * lift; pos[k * 3 + 1] = y + n[1] * lift; pos[k * 3 + 2] = z + n[2] * lift;
      nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2];
      zs = z + 0.08;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (ok[a] && ok[b] && ok[c] && ok[d]) {
        const za = pos[a * 3 + 2], zb = pos[b * 3 + 2], zc = pos[c * 3 + 2], zd = pos[d * 3 + 2];
        if (Math.max(za, zb, zc, zd) - Math.min(za, zb, zc, zd) > 0.08) continue;
        idx.push(a, b, d, a, d, c);
      }
    }
  }
  return { positions: pos, normals: nor, uvs: uv, indices: new Uint32Array(idx) };
}

export function buildWhiskers(m: CatModel): Float32Array[] {
  const s = m.s, F = s.face;
  const out: Float32Array[] = [];
  const zStart = s.head.c[2] + s.head.rz + 0.15;
  const n: V3 = [0, 0, 0];
  for (const w of F.whiskers) {
    for (const side of [-1, 1]) {
      const pts: number[] = [];
      const N = 16;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const x = side * (w.a[0] + (w.b[0] - w.a[0]) * t);
        const y = w.a[1] + (w.b[1] - w.a[1]) * t - w.bend * 4 * t * (1 - t);
        const z = traceFront(m, x, y, zStart, s.head.c[2] - 0.2);
        if (Number.isNaN(z)) break;
        gradN(m, x, y, z, n);
        if (n[2] < 0.18) break;
        const lift = F.whiskerLift * (0.55 + 0.45 * t) + 0.03 * t * t;
        pts.push(x + n[0] * lift, y + n[1] * lift, z + n[2] * lift);
      }
      const L = pts.length / 3;
      if (L < 3) continue;
      const lx = pts[(L - 1) * 3], ly = pts[(L - 1) * 3 + 1], lz = pts[(L - 1) * 3 + 2];
      let dx = lx - pts[(L - 3) * 3], dy = ly - pts[(L - 3) * 3 + 1], dz = lz - pts[(L - 3) * 3 + 2];
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl; dy /= dl; dz /= dl;
      for (let e = 1; e <= 3; e++) {
        const t = e * 0.03;
        pts.push(lx + dx * t, ly + dy * t - 0.002 * e * e, lz + dz * t * 0.85);
      }
      out.push(new Float32Array(pts));
    }
  }
  return out;
}
