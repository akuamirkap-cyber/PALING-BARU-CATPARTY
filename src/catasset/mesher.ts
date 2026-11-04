import type { V3 } from './math';

export type SDF = (x: number, y: number, z: number) => number;

// cube corner c = dx | dy<<1 | dz<<2 ; 12 edges
const EDGES: [number, number][] = [];
for (let c = 0; c < 8; c++) for (const b of [1, 2, 4]) if (!(c & b)) EDGES.push([c, c | b]);

/**
 * Narrow-band naive surface nets + Newton projection onto the true surface.
 * Returns positions (projected exactly onto the SDF), normals (SDF gradient) and triangle indices.
 */
export function polygonize(f: SDF, bmin: V3, bmax: V3, h: number, onProgress?: (p: number) => void) {
  const B = 8;
  const nbx = Math.ceil((bmax[0] - bmin[0]) / h / B), nby = Math.ceil((bmax[1] - bmin[1]) / h / B), nbz = Math.ceil((bmax[2] - bmin[2]) / h / B);
  const nx = nbx * B + 1, ny = nby * B + 1, nz = nbz * B + 1;
  const ox = bmin[0], oy = bmin[1], oz = bmin[2];
  const V = new Float32Array(nx * ny * nz);
  const sxy = nx * ny;
  const active = new Uint8Array(nbx * nby * nbz);
  const r = B * h * Math.sqrt(3) * 0.5;

  // pass 1 – classify blocks
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const cx = ox + (bi * B + B / 2) * h, cy = oy + (bj * B + B / 2) * h, cz = oz + (bk * B + B / 2) * h;
    const d = f(cx, cy, cz);
    const bid = bi + nbx * (bj + nby * bk);
    if (Math.abs(d) < r * 1.45 + h) { active[bid] = 1; continue; }
    const val = d;
    for (let k = bk * B; k <= bk * B + B; k++) for (let j = bj * B; j <= bj * B + B; j++) {
      const base = j * nx + k * sxy;
      for (let i = bi * B; i <= bi * B + B; i++) V[base + i] = val;
    }
  }
  // pass 2 – evaluate active blocks exactly (shared block faces only once)
  const nAct = active.reduce((a, b) => a + b, 0);
  const evaluated = new Uint8Array(nx * ny * nz);
  let done = 0;
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    if (!active[bi + nbx * (bj + nby * bk)]) continue;
    for (let k = bk * B; k <= bk * B + B; k++) {
      const z = oz + k * h;
      for (let j = bj * B; j <= bj * B + B; j++) {
        const y = oy + j * h;
        const base = j * nx + k * sxy;
        for (let i = bi * B; i <= bi * B + B; i++) {
          const id = base + i;
          if (evaluated[id]) continue;
          evaluated[id] = 1;
          V[id] = f(ox + i * h, y, z);
        }
      }
    }
    done++;
    if (onProgress && (done & 63) === 0) onProgress((done / nAct) * 0.7);
  }

  // resolve ambiguous (checkerboard) cell faces – the only source of non-manifold edges in surface nets.
  // They appear where two surfaces are closer than one cell (e.g. deep in the armpit crease). We fill that
  // sub-cell slit locally (outside corner nearest to the surface → inside), which is invisible but keeps the
  // mesh 100% manifold. Monotone (only fills) → always terminates.
  const FILL = -1e-5;
  const fix = (i0: number, i1: number, i2: number, i3: number): boolean => {
    const a = V[i0], b = V[i1], c = V[i2], d = V[i3];
    const sa = a < 0, sb = b < 0;
    if (sa !== (c < 0) || sb !== (d < 0) || sa === sb) return false;
    if (sa) { if (b < d) V[i1] = FILL; else V[i3] = FILL; }
    else { if (a < c) V[i0] = FILL; else V[i2] = FILL; }
    return true;
  };
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
      if (!active[bi + nbx * (bj + nby * bk)]) continue;
      const i1 = Math.min(bi * B + B, nx - 2), j1 = Math.min(bj * B + B, ny - 2), k1 = Math.min(bk * B + B, nz - 2);
      for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) for (let i = bi * B; i <= i1; i++) {
        const o = i + j * nx + k * sxy;
        if (fix(o, o + 1, o + 1 + nx, o + nx)) changed++; // XY face
        if (fix(o, o + 1, o + 1 + sxy, o + sxy)) changed++; // XZ face
        if (fix(o, o + nx, o + nx + sxy, o + sxy)) changed++; // YZ face
      }
    }
    if (!changed) break;
  }

  // surface nets
  const vmap = new Map<number, number>();
  const pos: number[] = [];
  const g = new Float64Array(8);
  const cellVertex = (i: number, j: number, k: number): number => {
    const key = i + nx * (j + ny * k);
    const got = vmap.get(key);
    if (got !== undefined) return got;
    for (let c = 0; c < 8; c++) g[c] = V[(i + (c & 1)) + (j + ((c >> 1) & 1)) * nx + (k + ((c >> 2) & 1)) * sxy];
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const ga = g[a], gb = g[b];
      if ((ga < 0) === (gb < 0)) continue;
      const t = ga / (ga - gb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t);
      sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
      sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
      cnt++;
    }
    if (cnt === 0) { sx = sy = sz = 0.5; cnt = 1; }
    const id = pos.length / 3;
    pos.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
    vmap.set(key, id);
    return id;
  };
  const quads: number[] = [];
  const emit = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (flip) quads.push(d, c, b, a); else quads.push(a, b, c, d);
  };
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    if (!active[bi + nbx * (bj + nby * bk)]) continue;
    const i1 = bi === nbx - 1 ? nx - 1 : bi * B + B - 1;
    const j1 = bj === nby - 1 ? ny - 1 : bj * B + B - 1;
    const k1 = bk === nbz - 1 ? nz - 1 : bk * B + B - 1;
    for (let k = bk * B; k <= k1; k++) for (let j = bj * B; j <= j1; j++) for (let i = bi * B; i <= i1; i++) {
      const idx = i + j * nx + k * sxy;
      const v0 = V[idx];
      const in0 = v0 < 0;
      // x edge
      if (i + 1 < nx && j >= 1 && k >= 1 && j <= ny - 2 && k <= nz - 2 && (V[idx + 1] < 0) !== in0) {
        emit(cellVertex(i, j - 1, k - 1), cellVertex(i, j, k - 1), cellVertex(i, j, k), cellVertex(i, j - 1, k), !in0);
      }
      // y edge
      if (j + 1 < ny && i >= 1 && k >= 1 && i <= nx - 2 && k <= nz - 2 && (V[idx + nx] < 0) !== in0) {
        emit(cellVertex(i - 1, j, k - 1), cellVertex(i - 1, j, k), cellVertex(i, j, k), cellVertex(i, j, k - 1), !in0);
      }
      // z edge
      if (k + 1 < nz && i >= 1 && j >= 1 && i <= nx - 2 && j <= ny - 2 && (V[idx + sxy] < 0) !== in0) {
        emit(cellVertex(i - 1, j - 1, k), cellVertex(i, j - 1, k), cellVertex(i, j, k), cellVertex(i - 1, j, k), !in0);
      }
    }
  }
  onProgress?.(0.75);

  // project vertices onto the exact surface, compute gradient normals
  const nV = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(nV * 3);
  const e = h * 0.12;
  for (let v = 0; v < nV; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let nxv = 0, nyv = 1, nzv = 0;
    for (let it = 0; it < 5; it++) {
      const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
      const gx = (a - b - c + d) / (4 * e), gy = (-a - b + c + d) / (4 * e), gz = (-a + b - c + d) / (4 * e);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      const gl = Math.sqrt(g2);
      nxv = gx / gl; nyv = gy / gl; nzv = gz / gl;
      const dv = (a + b + c + d) * 0.25;
      let step = dv / gl;
      if (step > h * 0.7) step = h * 0.7; else if (step < -h * 0.7) step = -h * 0.7;
      x -= nxv * step; y -= nyv * step; z -= nzv * step;
      // converged: the remaining move is far below a texel → the gradient just measured is the final normal
      if (Math.abs(step) < h * 0.02) break;
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = nxv; N[v * 3 + 1] = nyv; N[v * 3 + 2] = nzv;
    if (onProgress && (v & 4095) === 0) onProgress(0.75 + (v / nV) * 0.15);
  }

  // triangulate quads along the shorter diagonal
  const nq = quads.length / 4;
  const I = new Uint32Array(nq * 6);
  for (let q = 0; q < nq; q++) {
    const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3];
    const d02 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d13 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    const o = q * 6;
    if (d02 <= d13) { I[o] = a; I[o + 1] = b; I[o + 2] = c; I[o + 3] = a; I[o + 4] = c; I[o + 5] = d; }
    else { I[o] = a; I[o + 1] = b; I[o + 2] = d; I[o + 3] = b; I[o + 4] = c; I[o + 5] = d; }
  }
  return { positions: P, normals: N, indices: I };
}
