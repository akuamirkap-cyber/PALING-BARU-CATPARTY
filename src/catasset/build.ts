import { clamp, type RGB } from './math';
import { polygonize } from './mesher';
import { CatModel } from './model';
import { buildDecal, buildWhiskers, paintFaceTexture } from './face';
import type { CatSpec } from './specs';

export interface CatBuild {
  id: CatSpec['id'];
  body: { positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array };
  decal: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array };
  tex: { rgba: Uint8ClampedArray; mat: Uint8ClampedArray; W: number; H: number };
  whiskers: Float32Array[];
}

/** baked SDF ambient occlusion (incl. floor) */
export function bakeAO(m: CatModel, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  let occ = 0, sca = 1;
  for (let i = 1; i <= 5; i++) {
    const hh = 0.01 + 0.042 * i;
    const px = x + nx * hh, py = y + ny * hh, pz = z + nz * hh;
    let d = m.dist(px, py, pz);
    if (py < d) d = Math.max(py, 0);
    occ += (hh - d) * sca;
    sca *= 0.72;
  }
  return clamp(1 - 2.1 * occ, 0, 1);
}

export function buildCat(spec: CatSpec, h: number, onProgress?: (p: number) => void): CatBuild {
  const m = new CatModel(spec);
  const f = (x: number, y: number, z: number) => m.dist(x, y, z);
  const mesh = polygonize(f, spec.bounds.min, spec.bounds.max, h, (p) => onProgress?.(p * 0.85));
  const nV = mesh.positions.length / 3;
  const colors = new Float32Array(nV * 3);
  const c: RGB = [0, 0, 0];
  const P = mesh.positions, N = mesh.normals;
  for (let v = 0; v < nV; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    m.color(x, y, z, c);
    const ao = bakeAO(m, x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
    const k = 0.5 + 0.5 * ao;
    colors[v * 3] = c[0] * k;
    colors[v * 3 + 1] = c[1] * k;
    colors[v * 3 + 2] = c[2] * k;
    if (onProgress && (v & 4095) === 0) onProgress(0.85 + (v / nV) * 0.1);
  }
  const decal = buildDecal(m);
  const whiskers = buildWhiskers(m);
  const tex = paintFaceTexture(spec, 1024, Math.round((1024 * (spec.face.rect[3] - spec.face.rect[1])) / (spec.face.rect[2] - spec.face.rect[0])));
  onProgress?.(1);
  return { id: spec.id, body: { ...mesh, colors }, decal, tex, whiskers };
}
