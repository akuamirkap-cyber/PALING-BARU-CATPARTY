import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BERM, COURSE, FENCE_D, RIBBON_S0, SKIRT, START_D, START_S, W, noise2, smooth01, type Course } from './course';
import { box, cyl, merge, rod, sphere, v3, type Geo } from '../ship/geom';
import { createBannerTexture, createCorduroyTexture, createNetTexture, createSnowTexture, createSponsorTexture, createTimingBoard } from './textures';

export type SkiColorKey = 'snow' | 'net' | 'gateA' | 'gateB' | 'arch' | 'wood' | 'pine';
export type SkiScheme = Record<SkiColorKey, string>;

export const SKI_COLOR_LABELS: Record<SkiColorKey, string> = {
  snow: 'Salju Lintasan',
  net: 'Jaring Pengaman',
  gateA: 'Bendera Gerbang A',
  gateB: 'Bendera Gerbang B',
  arch: 'Gerbang Finish',
  wood: 'Kayu Pondok',
  pine: 'Pohon Pinus',
};

export const SKI_PRESETS: { id: string; name: string; colors: SkiScheme }[] = [
  { id: 'alpen', name: 'Alpen Klasik', colors: { snow: '#ffffff', net: '#ff6a1a', gateA: '#e63946', gateB: '#1d4ed8', arch: '#e63946', wood: '#8b5a2b', pine: '#2f6b3f' } },
  { id: 'jelly', name: 'Jelly Pop', colors: { snow: '#fff7fb', net: '#ff5d8f', gateA: '#ffd23f', gateB: '#3fc1c9', arch: '#ff7a3d', wood: '#c97b4a', pine: '#3a8f5a' } },
  { id: 'nordik', name: 'Nordik', colors: { snow: '#f2f8ff', net: '#2563eb', gateA: '#dc2626', gateB: '#facc15', arch: '#1d4ed8', wood: '#6b3f22', pine: '#1f4d36' } },
  { id: 'neon', name: 'Neon Malam', colors: { snow: '#eef2ff', net: '#00f5d4', gateA: '#f15bb5', gateB: '#00bbf9', arch: '#9b5de5', wood: '#3d2c5e', pine: '#1b4b5a' } },
  { id: 'permen', name: 'Permen Kapas', colors: { snow: '#fffafc', net: '#ff9ecf', gateA: '#ff70a6', gateB: '#70d6ff', arch: '#ffd670', wood: '#e9a17c', pine: '#5fa880' } },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function mesh(name: string, geo: Geo, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}
function grp(name: string) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}
function std(name: string, color: THREE.ColorRepresentation, p: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...p });
  m.name = name;
  return m;
}

/** Tinggi tanah di (s, d): permukaan pita atau medan alami. */
export function groundAtSD(c: Course, s: number, d: number) {
  if (s >= RIBBON_S0 && s <= c.L && Math.abs(d) <= W + BERM) return c.surfaceY(s, d);
  const f = c.frame(s);
  return c.naturalY(s, d, f.x + f.tz * d, f.z - f.tx * d);
}

/** Matriks lokal di lintasan: x = maju, y = atas, z = kanan pembalap. */
export function frameMatrix(c: Course, s: number, d: number, y?: number) {
  const f = c.frame(s);
  const w = c.worldAt(s, d);
  const m = new THREE.Matrix4().makeBasis(v3(f.tx, 0, f.tz), v3(0, 1, 0), v3(-f.tz, 0, f.tx));
  m.setPosition(w.x, y ?? w.y, w.z);
  return m;
}
const place = (g: Geo, m: THREE.Matrix4) => g.applyMatrix4(m);

interface SecPt {
  d: number;
  y: number;
  v?: number;
}
/** Sapu penampang sepanjang lintasan → geometri. */
function sweep(c: Course, s0: number, s1: number, step: number, section: (s: number) => SecPt[], uScale = 0.25): Geo {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let n = -1;
  let rows = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    const f = c.frame(s);
    const sec = section(s);
    if (n < 0) n = sec.length;
    sec.forEach((p, k) => {
      pos.push(f.x + f.tz * p.d, p.y, f.z - f.tx * p.d);
      uv.push(s * uScale, p.v ?? k / (n - 1));
    });
    rows++;
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < n - 1; k++) {
      const a = r * n + k;
      const b = a + n;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function colorize(g: Geo, fn: (x: number, y: number, z: number) => THREE.Color) {
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.getAttribute('position');
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i));
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  return geo;
}
const solid = (g: Geo, hex: string) => {
  const c = new THREE.Color(hex);
  return colorize(g, () => c);
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface CrowdSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export interface Cluster {
  x: number;
  y: number;
  z: number;
  n: number;
  s: number;
}

export interface MountainBuild {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  wands: THREE.Object3D[];
  lights: THREE.MeshStandardMaterial[];
  lampMat: THREE.MeshStandardMaterial;
  windowMat: THREE.MeshStandardMaterial;
  timing: ReturnType<typeof createTimingBoard>;
  banners: { start: ReturnType<typeof createBannerTexture>; finish: ReturnType<typeof createBannerTexture> };
  crowdUniforms: { uTime: { value: number }; uFocus: { value: THREE.Vector3 }; uCheer: { value: number } };
  clusters: Cluster[];
  updateLift: (t: number) => void;
  setScheme: (s: SkiScheme) => void;
}

export function buildMountain(scheme: SkiScheme): MountainBuild {
  const c = COURSE;
  const F = c.finishS;
  const group = grp('SkiMountain_JellyPeak');
  const parts: Record<string, THREE.Object3D> = {};

  const M = {
    snow: std('Snow_Groomed', scheme.snow, { map: createCorduroyTexture(), roughness: 0.82 }),
    terrain: std('Snow_Terrain', '#ffffff', { vertexColors: true, map: createSnowTexture(), roughness: 0.95 }),
    peaks: std('Mountain_Peaks', '#ffffff', { vertexColors: true, flatShading: true, roughness: 0.95 }),
    tree: std('Pine_Trees', '#ffffff', { vertexColors: true, flatShading: true, roughness: 0.85 }),
    net: std('Safety_Net', scheme.net, { map: createNetTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    post: std('Fence_Post', '#e8edf3', { roughness: 0.5 }),
    sponsor: std('Sponsor_Banners', '#ffffff', { map: createSponsorTexture(), roughness: 0.6, side: THREE.DoubleSide }),
    gateA: std('Gate_Flag_A', scheme.gateA, { side: THREE.DoubleSide, roughness: 0.6 }),
    gateB: std('Gate_Flag_B', scheme.gateB, { side: THREE.DoubleSide, roughness: 0.6 }),
    dye: std('Dye_Line', '#2563eb', { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    finishLine: std('Finish_Line', '#e63946', { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wood: std('Cabin_Wood', scheme.wood, { roughness: 0.8 }),
    roof: std('Cabin_Roof_Snow', '#f4f8ff', { roughness: 0.9 }),
    darkWood: std('Wood_Dark', '#4a3020', { roughness: 0.85 }),
    metal: std('Metal_Grey', '#9aa3ad', { roughness: 0.4, metalness: 0.6 }),
    darkMetal: std('Metal_Dark', '#30353d', { roughness: 0.5, metalness: 0.5 }),
    arch: std('Finish_Arch', scheme.arch, { roughness: 0.45 }),
    archWhite: std('Arch_White', '#ffffff', { roughness: 0.45 }),
    startBanner: std('Banner_Start', '#ffffff', { roughness: 0.6, side: THREE.DoubleSide }),
    finishBanner: std('Banner_Finish', '#ffffff', { roughness: 0.6, side: THREE.DoubleSide }),
    timing: std('Timing_Board', '#ffffff', { roughness: 0.4 }),
    window: std('Cabin_Window', '#ffd27a', { emissive: '#ffb347', emissiveIntensity: 0.4, roughness: 0.3 }),
    lamp: std('Lamp_Light', '#fff8e0', { emissive: '#fff1c4', emissiveIntensity: 0.2 }),
    standSeat: std('Grandstand_Seat', '#1d4ed8', { roughness: 0.5 }),
    stand: std('Grandstand', '#c9ced6', { roughness: 0.7 }),
    chair: std('Lift_Chair', '#2b3446', { roughness: 0.5, metalness: 0.3 }),
    snowman: std('Snowman', '#ffffff', { vertexColors: true, roughness: 0.9 }),
    flags: std('Flags', '#ffffff', { vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }),
  };
  M.snow.map!.repeat.set(1, 1);
  const startBanner = createBannerTexture('START', '#1d4ed8', '#ffe14d');
  const finishBanner = createBannerTexture('FINISH', '#e63946', '#ffffff');
  M.startBanner.map = startBanner.texture;
  M.finishBanner.map = finishBanner.texture;
  const timing = createTimingBoard();
  M.timing.map = timing.texture;
  M.timing.emissive = new THREE.Color('#ffffff');
  M.timing.emissiveMap = timing.texture;
  M.timing.emissiveIntensity = 0.85;

  /* ------------------------------ Pita lintasan ------------------------------ */
  const ribbonSec = (s: number): SecPt[] => {
    const pts: SecPt[] = [];
    const E = W + BERM;
    const yl = c.surfaceY(s, E);
    const yr = c.surfaceY(s, -E);
    const fL = c.frame(s);
    const nat = (d: number) => c.naturalY(s, d, fL.x + fL.tz * d, fL.z - fL.tx * d);
    pts.push({ d: E + SKIRT, y: Math.min(yl, nat(E + SKIRT)) - 0.45, v: -0.1 });
    const n = 30;
    for (let k = 0; k <= n; k++) {
      const d = E - (2 * E * k) / n;
      pts.push({ d, y: c.surfaceY(s, d), v: (E - d) / (2 * W) });
    }
    pts.push({ d: -E - SKIRT, y: Math.min(yr, nat(-E - SKIRT)) - 0.45, v: 1.1 });
    return pts;
  };
  const track = grp('Track');
  const ribbon = mesh('Track_Snow', sweep(c, RIBBON_S0, c.L, 1, ribbonSec, 1 / 6), M.snow);
  ribbon.receiveShadow = true;
  track.add(ribbon);
  // tutup ujung (skirt depan/belakang)
  const cap = (s: number, dir: number) => {
    const pts = ribbonSec(s);
    const f = c.frame(s);
    const pos: number[] = [];
    for (const p of pts) {
      const x = f.x + f.tz * p.d;
      const z = f.z - f.tx * p.d;
      pos.push(x, p.y, z, x + f.tx * dir * 4, p.y - 3, z + f.tz * dir * 4);
    }
    const idx: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = k * 2;
      if (dir > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  track.add(mesh('Track_EndCaps', merge([cap(RIBBON_S0, -1), cap(c.L, 1)]), M.snow));
  // garis pewarna di bibir lompatan & garis finish
  const lineAt = (s: number, w: number) =>
    sweep(c, s - w / 2, s + w / 2, w, (ss) => {
      const out: SecPt[] = [];
      for (let k = 0; k <= 12; k++) {
        const d = W - (2 * W * k) / 12;
        out.push({ d, y: c.surfaceY(ss, d) + 0.015 });
      }
      return out;
    });
  track.add(mesh('Jump_Lip_Lines', merge(c.jumps.map((j) => lineAt(j.s - 0.3, 0.4))), M.dye));
  track.add(mesh('Finish_Line', lineAt(F, 0.6), M.finishLine));
  group.add(track);
  parts.track = track;

  /* ------------------------------ Medan & gunung ------------------------------ */
  const terrain = grp('Terrain');
  // medan diperluas agar tepi dunia tidak terlihat dari kamera tinggi
  const X0 = -480;
  const X1 = 1340;
  const Z0 = -640;
  const Z1 = 640;
  const STEP = 6;
  const nx = Math.round((X1 - X0) / STEP) + 1;
  const nz = Math.round((Z1 - Z0) / STEP) + 1;
  const tpos = new Float32Array(nx * nz * 3);
  const tuv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = X0 + i * STEP;
      const z = Z0 + j * STEP;
      const p = c.project(x, z);
      let y: number;
      const ad = Math.abs(p.d);
      const along = p.s > RIBBON_S0 - 6 && p.s < c.L + 4;
      if (along && ad < W + BERM - 5) y = c.surfaceY(clamp(p.s, 0, c.L), p.d) - 2.2;
      else if (along && ad <= W + BERM) y = c.surfaceY(clamp(p.s, 0, c.L), p.d) - 0.35;
      else y = c.naturalY(p.s, p.d, x, z);
      const k = j * nx + i;
      tpos[k * 3] = x;
      tpos[k * 3 + 1] = y;
      tpos[k * 3 + 2] = z;
      tuv[k * 2] = x / 18;
      tuv[k * 2 + 1] = z / 18;
    }
  }
  const tidx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      tidx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tg.setIndex(tidx);
  tg.computeVertexNormals();
  const tn = tg.getAttribute('normal');
  const tcol = new Float32Array(nx * nz * 3);
  const snowC = new THREE.Color('#f7faff');
  const blueC = new THREE.Color('#dde8fb');
  const rockC = new THREE.Color('#6f6863');
  const tmpC = new THREE.Color();
  for (let k = 0; k < nx * nz; k++) {
    const ny = tn.getY(k);
    const nn = noise2(tpos[k * 3] * 3.1, tpos[k * 3 + 2] * 3.1);
    tmpC.copy(snowC).lerp(blueC, clamp(0.5 + nn, 0, 1) * 0.6);
    tmpC.lerp(rockC, smooth01((0.86 - ny + nn * 0.04) / 0.22));
    tcol[k * 3] = tmpC.r;
    tcol[k * 3 + 1] = tmpC.g;
    tcol[k * 3 + 2] = tmpC.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const tmesh = mesh('Terrain_Snow', tg, M.terrain);
  tmesh.receiveShadow = true;
  terrain.add(tmesh);

  // puncak gunung di kejauhan
  const r = rng(77);
  const peakGeos: Geo[] = [];
  const cx = 430;
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + r() * 0.2;
    const rad = 900 + r() * 380;
    const h = 260 + r() * 330;
    const base = 230 + r() * 220;
    const g = new THREE.ConeGeometry(base, h, 7, 4);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      if (yy < h / 2 - 1) {
        const j = 1 - (yy + h / 2) / h;
        p.setX(i, p.getX(i) * (1 + (r() - 0.5) * 0.35 * j));
        p.setZ(i, p.getZ(i) * (1 + (r() - 0.5) * 0.35 * j));
        p.setY(i, yy + (r() - 0.5) * 30 * j);
      }
    }
    g.translate(cx + Math.cos(a) * rad, h / 2 - 150 - r() * 60, Math.sin(a) * rad);
    const top = h / 2 - 150;
    peakGeos.push(
      colorize(g, (_x, y) => {
        const t = (y - (top - h)) / h;
        return t > 0.55 - r() * 0.02 ? new THREE.Color('#f5f8ff') : t > 0.42 ? new THREE.Color('#b9c1cc') : new THREE.Color('#5d5855');
      }),
    );
  }
  const peaksMesh = mesh('Distant_Peaks', mergeGeometries(peakGeos, false) ?? new THREE.BufferGeometry(), M.peaks);
  peaksMesh.userData.statsSkip = true;
  terrain.add(peaksMesh);
  group.add(terrain);
  parts.terrain = terrain;

  /* ------------------------------ Pohon pinus ------------------------------ */
  const treeParts: Geo[] = [];
  const withF = (g: Geo, f: (y: number) => number) => {
    const geo = g.index ? g.toNonIndexed() : g;
    const p = geo.getAttribute('position');
    const a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) a[i] = f(p.getY(i));
    geo.setAttribute('snowf', new THREE.BufferAttribute(a, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    return geo;
  };
  treeParts.push(withF(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0), () => -1));
  for (const [y0, rr, hh] of [
    [1.0, 2.0, 3.0],
    [2.6, 1.55, 2.6],
    [4.0, 1.05, 2.3],
  ] as [number, number, number][]) {
    const cone = new THREE.ConeGeometry(rr, hh, 7, 1);
    cone.translate(0, y0 + hh / 2, 0);
    treeParts.push(
      withF(cone, (y) => {
        const t = (y - y0) / hh;
        return t > 0.6 ? 0.85 : t < 0.02 ? 0.35 : 0.08;
      }),
    );
  }
  const treeGeo = mergeGeometries(treeParts, false) ?? new THREE.BufferGeometry();
  const recolorTrees = (pineHex: string) => {
    const f = treeGeo.getAttribute('snowf') as THREE.BufferAttribute;
    const col = treeGeo.getAttribute('color') as THREE.BufferAttribute;
    const pine = new THREE.Color(pineHex);
    const trunk = new THREE.Color('#5b3a1f');
    const white = new THREE.Color('#f4f8ff');
    const tmp = new THREE.Color();
    for (let i = 0; i < f.count; i++) {
      const k = f.getX(i);
      if (k < 0) tmp.copy(trunk);
      else tmp.copy(pine).lerp(white, k);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  };
  recolorTrees(scheme.pine);
  const spots: THREE.Matrix4[] = [];
  const tr = rng(5);
  const inZone = (s: number) => c.zones.some((z) => s > z.s0 - 6 && s < z.s1 + 6);
  for (let k = 0; k < 14000 && spots.length < 2600; k++) {
    const x = -300 + tr() * 1460;
    const z = -440 + tr() * 880;
    if (Math.abs(z + 100) < 10 && x > -60 && x < 980) continue; // koridor kereta gantung
    const p = c.project(x, z);
    const ad = Math.abs(p.d);
    const minD = W + BERM + (inZone(p.s) ? 18 : 5);
    if (ad < minD || ad > 300) continue;
    if (p.s < -40 && ad < 60) continue;
    const dens = ad < 60 ? 0.9 : ad < 140 ? 0.65 : 0.4;
    if (tr() > dens) continue;
    const y = c.naturalY(p.s, p.d, x, z);
    const sc = 0.7 + tr() * 0.9;
    spots.push(new THREE.Matrix4().compose(v3(x, y - 0.2, z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), tr() * 6.28), v3(sc, sc * (0.9 + tr() * 0.3), sc)));
  }
  const trees = new THREE.InstancedMesh(treeGeo, M.tree, spots.length);
  trees.name = 'Pine_Trees';
  spots.forEach((m, i) => trees.setMatrixAt(i, m));
  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.computeBoundingSphere();
  const treeGroup = grp('Trees');
  treeGroup.add(trees);
  group.add(treeGroup);
  parts.trees = treeGroup;

  /* ------------------------------ Jaring pengaman & sponsor ------------------------------ */
  const fences = grp('Fences');
  const fs0 = START_S - 1;
  const fs1 = c.L - 1;
  const netGeos: Geo[] = [];
  const posts: Geo[] = [];
  for (const sg of [1, -1]) {
    const d = sg * FENCE_D;
    netGeos.push(sweep(c, fs0, fs1, 2, (s) => [{ d, y: c.surfaceY(s, d) - 0.05, v: 0 }, { d, y: c.surfaceY(s, d) + 1.45, v: 1.5 / 1.6 }], 1 / 1.6));
    for (let s = fs0; s <= fs1; s += 4) {
      const w = c.worldAt(s, d);
      posts.push(cyl(0.04, 0.04, 1.6, w.x, w.y + 0.75, w.z, 6));
    }
  }
  fences.add(mesh('Safety_Nets', merge(netGeos), M.net));
  fences.add(mesh('Fence_Posts', merge(posts), M.post));
  const sponsors: Geo[] = [];
  let sk = 0;
  for (let s = START_S + 20; s < F + 20; s += 30) {
    const sg = sk % 2 ? 1 : -1;
    const d = sg * (FENCE_D - 0.06);
    const pl = new THREE.PlaneGeometry(4.2, 0.95);
    pl.rotateY(sg > 0 ? 0 : Math.PI); // selalu menghadap ke tengah lintasan
    const uvA = pl.getAttribute('uv') as THREE.BufferAttribute;
    const row = sk % 4;
    for (let i = 0; i < uvA.count; i++) uvA.setY(i, 1 - (row + 1) / 4 + uvA.getY(i) / 4);
    pl.translate(0, 0.8, 0);
    place(pl, frameMatrix(c, s, d));
    // PlaneGeometry menghadap +Z lokal (kanan); di sisi kiri dibalik agar menghadap lintasan
    sponsors.push(pl);
    sk++;
  }
  fences.add(mesh('Sponsor_Banners', merge(sponsors), M.sponsor));
  group.add(fences);
  parts.fences = fences;

  /* ------------------------------ Gerbang bendera ------------------------------ */
  const gates = grp('Gates');
  const flagsA: Geo[] = [];
  const flagsB: Geo[] = [];
  const gatePoles: Geo[] = [];
  for (const g of c.gates) {
    const list = g.red ? flagsA : flagsB;
    for (const sg of [1, -1]) {
      const dIn = g.d + sg * g.hw;
      const dOut = g.d + sg * (g.hw + 0.85);
      const y = c.surfaceY(g.s, dIn);
      for (const d of [dIn, dOut]) {
        const w = c.worldAt(g.s, d);
        gatePoles.push(cyl(0.028, 0.028, 1.85, w.x, w.y + 0.92, w.z, 6));
      }
      const pl = new THREE.PlaneGeometry(0.85, 0.6);
      pl.rotateY(Math.PI / 2);
      pl.translate(0, 1.3, -(g.d + sg * (g.hw + 0.425)));
      place(pl, frameMatrix(c, g.s, 0, y));
      list.push(pl);
    }
  }
  gates.add(mesh('Gate_Flags_A', merge(flagsA), M.gateA));
  gates.add(mesh('Gate_Flags_B', merge(flagsB), M.gateB));
  gates.add(mesh('Gate_Poles', merge(gatePoles), M.post));
  group.add(gates);
  parts.gates = gates;

  /* ------------------------------ Area START ------------------------------ */
  const start = grp('StartArea');
  const H0 = c.surfaceY(0, 0);
  const hutM = frameMatrix(c, -11.5, 0, H0);
  const hw = W + 2;
  const hut: Geo[] = [box(9, 4.4, 0.4, 0, 2.2, hw), box(9, 4.4, 0.4, 0, 2.2, -hw), box(0.4, 4.4, hw * 2, -4.5, 2.2, 0)];
  const roofL = new THREE.BoxGeometry(5.8, 0.32, hw * 2 + 1.2);
  roofL.rotateZ(0.42);
  roofL.translate(-2.55, 5.25, 0);
  const roofR = new THREE.BoxGeometry(5.8, 0.32, hw * 2 + 1.2);
  roofR.rotateZ(-0.42);
  roofR.translate(2.55, 5.25, 0);
  start.add(mesh('Start_Hut', place(merge(hut), hutM), M.wood));
  start.add(mesh('Start_Hut_Roof', place(merge([roofL, roofR]), hutM), M.roof));
  // papan kayu & bangku di dalam pondok
  start.add(mesh('Start_Hut_Bench', place(merge([box(1.2, 0.5, hw * 1.6, -3.4, 0.25, 0)]), hutM), M.darkWood));
  // palang start per jalur (animasi)
  const wands: THREE.Object3D[] = [];
  const startPosts: Geo[] = [];
  const sM = frameMatrix(c, START_S, 0, c.surfaceY(START_S, 0));
  for (const d of START_D) {
    const zl = -d;
    startPosts.push(box(0.16, 0.95, 0.16, 0, 0.475, zl - 0.75), box(0.16, 0.95, 0.16, 0, 0.475, zl + 0.75));
    const wand = new THREE.Group();
    wand.name = `Start_Wand_${START_D.indexOf(d) + 1}`;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.3), M.gateA);
    bar.position.set(0, 0, 0.65);
    wand.add(bar);
    const p = v3(0, 0.62, zl - 0.65).applyMatrix4(sM);
    wand.position.copy(p);
    wand.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(sM));
    wands.push(wand);
    start.add(wand);
  }
  start.add(mesh('Start_Gate_Posts', place(merge(startPosts), sM), M.darkMetal));
  // gantry START + lampu hitung mundur
  const gM = frameMatrix(c, START_S + 1.6, 0, c.surfaceY(START_S + 1.6, 0));
  start.add(mesh('Start_Gantry', place(merge([box(0.5, 6.2, 0.5, 0, 3.1, W + 0.8), box(0.5, 6.2, 0.5, 0, 3.1, -W - 0.8), box(0.6, 0.6, W * 2 + 2.2, 0, 6.0, 0)]), gM), M.darkMetal));
  const sb = new THREE.PlaneGeometry(11, 2.75);
  sb.rotateY(-Math.PI / 2);
  sb.translate(-0.32, 7.6, 0);
  const sb2 = new THREE.PlaneGeometry(11, 2.75);
  sb2.rotateY(Math.PI / 2);
  sb2.translate(0.32, 7.6, 0);
  start.add(mesh('Start_Banner', place(merge([sb, sb2]), gM), M.startBanner));
  start.add(mesh('Start_Banner_Frame', place(box(0.5, 3.0, 11.4, 0, 7.6, 0), gM), M.darkMetal));
  const lights: THREE.MeshStandardMaterial[] = [];
  const lightBoard = place(box(0.3, 0.9, 4.6, -0.2, 4.95, 0), gM.clone());
  start.add(mesh('Start_Light_Board', lightBoard, M.darkMetal));
  for (let k = 0; k < 4; k++) {
    const lm = std(`Start_Light_${k + 1}`, '#330000', { emissive: '#ff2a2a', emissiveIntensity: 0, roughness: 0.3 });
    lights.push(lm);
    start.add(mesh(`Start_Light_${k + 1}`, place(sphere(0.3, -0.38, 4.95, -1.65 + k * 1.1, 14, 10), gM), lm));
  }
  group.add(start);
  parts.start = start;

  /* ------------------------------ Area FINISH ------------------------------ */
  const finish = grp('FinishArea');
  const fM = frameMatrix(c, F, 0, c.surfaceY(F, 0));
  const R = W + 0.9;
  const archPts: THREE.Vector3[] = [v3(0, -0.5, -R), v3(0, 4, -R), v3(0, 7.2, -R + 1.4), v3(0, 8.4, -R * 0.4), v3(0, 8.6, 0), v3(0, 8.4, R * 0.4), v3(0, 7.2, R - 1.4), v3(0, 4, R), v3(0, -0.5, R)];
  const archGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts), 80, 0.85, 14, false);
  finish.add(mesh('Finish_Arch', place(archGeo, fM.clone()), M.arch));
  const rings: Geo[] = [];
  const curve = new THREE.CatmullRomCurve3(archPts);
  for (let k = 1; k < 12; k++) {
    const p = curve.getPointAt(k / 12);
    const t = curve.getTangentAt(k / 12);
    const tor = new THREE.TorusGeometry(0.88, 0.1, 6, 18);
    tor.lookAt(t);
    tor.translate(p.x, p.y, p.z);
    rings.push(tor);
  }
  finish.add(mesh('Finish_Arch_Stripes', place(merge(rings), fM.clone()), M.archWhite));
  const fb = new THREE.PlaneGeometry(13, 3.25);
  fb.rotateY(-Math.PI / 2);
  fb.translate(-0.9, 6.0, 0);
  const fb2 = new THREE.PlaneGeometry(13, 3.25);
  fb2.rotateY(Math.PI / 2);
  fb2.translate(0.9, 6.0, 0);
  finish.add(mesh('Finish_Banner', place(merge([fb, fb2]), fM.clone()), M.finishBanner));
  // papan waktu
  const tbM = frameMatrix(c, F - 14, -(W + BERM + 3.5), c.surfaceY(F - 14, -(W + BERM)));
  const tbRot = new THREE.Matrix4().makeRotationY(-0.55);
  const tbGeo = new THREE.PlaneGeometry(8, 4);
  tbGeo.rotateY(-Math.PI / 2);
  tbGeo.applyMatrix4(tbRot);
  tbGeo.translate(0, 6.0, 0);
  finish.add(mesh('Timing_Board_Screen', place(tbGeo, tbM.clone()), M.timing));
  const tbFrame = merge([box(0.4, 4.4, 8.4, 0.25, 6.0, 0), box(0.4, 4.2, 0.4, 0.3, 2.0, 2.5), box(0.4, 4.2, 0.4, 0.3, 2.0, -2.5)]);
  tbFrame.applyMatrix4(tbRot);
  finish.add(mesh('Timing_Board_Frame', place(tbFrame, tbM.clone()), M.darkMetal));
  group.add(finish);
  parts.finish = finish;

  /* ------------------------------ Tribun finish ------------------------------ */
  const stands = grp('Grandstands');
  const seatSpots: CrowdSpot[] = [];
  const ROWS = 7;
  const S0 = F - 58;
  const S1 = F - 8;
  const standGeos: Geo[] = [];
  const seatGeos: Geo[] = [];
  for (const sg of [1, -1]) {
    const d0 = W + 2.8;
    standGeos.push(
      sweep(c, S0, S1, 2, (s) => {
        const base = c.surfaceY(s, sg * d0);
        const pts: SecPt[] = [{ d: sg * d0, y: base - 1.2 }];
        for (let k = 0; k < ROWS; k++) {
          const dA = sg * (d0 + k * 0.95);
          const dB = sg * (d0 + (k + 1) * 0.95);
          pts.push({ d: dA, y: base + 0.5 * (k + 1) }, { d: dB, y: base + 0.5 * (k + 1) });
        }
        pts.push({ d: sg * (d0 + ROWS * 0.95), y: base - 1.5 });
        return sg > 0 ? pts : pts.reverse();
      }, 0.25),
    );
    for (let k = 0; k < ROWS; k++) {
      const dd = sg * (d0 + k * 0.95 + 0.62);
      seatGeos.push(sweep(c, S0, S1, 2, (s) => {
        const base = c.surfaceY(s, sg * d0) + 0.5 * (k + 1);
        const pts = [{ d: dd - sg * 0.3, y: base + 0.02 }, { d: dd + sg * 0.12, y: base + 0.02 }, { d: dd + sg * 0.12, y: base + 0.5 }];
        return sg > 0 ? pts : pts.reverse();
      }));
      for (let s = S0 + 0.6; s < S1; s += 0.72) {
        const base = c.surfaceY(s, sg * d0) + 0.5 * (k + 1);
        const f = c.frame(s);
        const dd2 = sg * (d0 + k * 0.95 + 0.48);
        seatSpots.push({ x: f.x + f.tz * dd2, y: base + 0.12, z: f.z - f.tx * dd2, yaw: Math.atan2(-sg * f.tz, sg * f.tx) });
      }
    }
  }
  const standMesh = mesh('Grandstand_Steps', merge(standGeos), M.stand);
  (standMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  stands.add(standMesh);
  stands.add(mesh('Grandstand_Seats', merge(seatGeos), M.standSeat));
  group.add(stands);
  parts.stands = stands;

  /* ------------------------------ Kereta gantung ------------------------------ */
  const lift = grp('Chairlift');
  const LZ = -100;
  const lx0 = -45;
  const lx1 = 975;
  const towers: { x: number; y: number }[] = [];
  const nT = 13;
  const liftGeo: Geo[] = [];
  for (let k = 0; k < nT; k++) {
    const x = lx0 + ((lx1 - lx0) * k) / (nT - 1);
    const gy = c.groundY(x, LZ);
    const h = k === 0 || k === nT - 1 ? 6 : 11;
    towers.push({ x, y: gy + h });
    if (k === 0 || k === nT - 1) {
      liftGeo.push(box(12, 6, 10, x + (k === 0 ? -3 : 3), gy + 3, LZ));
    } else {
      liftGeo.push(cyl(0.35, 0.5, h + 1, x, gy + h / 2 - 0.5, LZ, 10), box(0.4, 0.4, 7.5, x, gy + h, LZ), box(0.25, 0.25, 7.5, x, gy + h - 0.6, LZ));
    }
  }
  lift.add(mesh('Lift_Towers', merge(liftGeo), M.metal));
  const cableY = (x: number) => {
    const f = clamp((x - lx0) / (lx1 - lx0), 0, 0.99999) * (nT - 1);
    const i = Math.floor(f);
    const t = f - i;
    const a = towers[i];
    const b = towers[i + 1];
    return a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 1.6;
  };
  const cables: Geo[] = [];
  for (const dz of [-3, 3]) {
    const pts: THREE.Vector3[] = [];
    for (let x = lx0; x <= lx1; x += 6) pts.push(v3(x, cableY(x), LZ + dz));
    cables.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05, 4, false));
  }
  lift.add(mesh('Lift_Cables', merge(cables), M.darkMetal));
  const chairGeo = merge([box(0.05, 2.2, 0.05, 0, -1.1, 0), box(0.6, 0.08, 1.6, 0.05, -2.2, 0), box(0.08, 0.6, 1.6, 0.35, -1.9, 0), box(0.5, 0.05, 0.05, 0.05, -1.7, 0.8)]);
  const NC = 48;
  const chairs = new THREE.InstancedMesh(chairGeo, M.chair, NC);
  chairs.name = 'Lift_Chairs';
  chairs.castShadow = true;
  chairs.frustumCulled = false;
  lift.add(chairs);
  const span = lx1 - lx0;
  const mtx = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const one = v3(1, 1, 1);
  const updateLift = (t: number) => {
    for (let k = 0; k < NC; k++) {
      let u = ((t * 3.2) / (2 * span) + k / NC) % 1;
      const up = u < 0.5;
      u = up ? u * 2 : (u - 0.5) * 2;
      const x = up ? lx1 - u * span : lx0 + u * span;
      quat.setFromAxisAngle(v3(0, 1, 0), up ? 0 : Math.PI);
      mtx.compose(v3(x, cableY(x), LZ + (up ? -3 : 3)), quat, one);
      chairs.setMatrixAt(k, mtx);
    }
    chairs.instanceMatrix.needsUpdate = true;
  };
  updateLift(0);
  group.add(lift);
  parts.lift = lift;

  /* ------------------------------ Lampu, pondok, manusia salju, bendera ------------------------------ */
  const decor = grp('Decor');
  const lampPoles: Geo[] = [];
  const lampHeads: Geo[] = [];
  let lk = 0;
  for (let s = START_S + 30; s < F + 40; s += 55) {
    const sg = lk++ % 2 ? 1 : -1;
    const d = sg * (W + BERM + 1.2);
    const m = frameMatrix(c, s, d, c.surfaceY(s, d));
    lampPoles.push(place(merge([cyl(0.1, 0.14, 8, 0, 4, 0, 8), box(0.12, 0.12, 2.6, 0, 7.9, sg * 1.3)]), m.clone()));
    lampHeads.push(place(box(0.5, 0.18, 0.8, 0, 7.75, sg * 2.5), m.clone()));
  }
  decor.add(mesh('Lamp_Poles', merge(lampPoles), M.darkMetal));
  decor.add(mesh('Lamp_Heads', merge(lampHeads), M.lamp));
  // chalet di area finish
  const chM = frameMatrix(c, F + 38, -(W + BERM + 15), c.groundY(c.worldAt(F + 38, -(W + BERM + 15)).x, c.worldAt(F + 38, -(W + BERM + 15)).z));
  decor.add(mesh('Chalet_Body', place(merge([box(10, 4.5, 8, 0, 2.25, 0), box(10.4, 0.4, 8.4, 0, 0.2, 0), box(1.4, 3, 1.2, 2.5, 6.2, -2)]), chM.clone()), M.wood));
  const chRoofL = new THREE.BoxGeometry(11.6, 0.4, 5.4);
  chRoofL.rotateX(0.62);
  chRoofL.translate(0, 6.0, -2.2);
  const chRoofR = new THREE.BoxGeometry(11.6, 0.4, 5.4);
  chRoofR.rotateX(-0.62);
  chRoofR.translate(0, 6.0, 2.2);
  decor.add(mesh('Chalet_Roof', place(merge([chRoofL, chRoofR]), chM.clone()), M.roof));
  const winG: Geo[] = [];
  for (const x of [-3.2, 0, 3.2]) winG.push(box(1.4, 1.3, 0.1, x, 2.6, 4.03), box(1.4, 1.3, 0.1, x, 2.6, -4.03));
  winG.push(box(1.4, 2.4, 0.1, 0, 1.2, 4.05));
  decor.add(mesh('Chalet_Windows', place(merge(winG), chM.clone()), M.window));
  // manusia salju
  const smGeos: Geo[] = [];
  const snowmanAt = (s: number, d: number, sc: number) => {
    const w = c.worldAt(s, d);
    const y = c.groundY(w.x, w.z);
    const parts2: Geo[] = [
      solid(sphere(0.55 * sc, 0, 0.5 * sc, 0, 14, 10), '#ffffff'),
      solid(sphere(0.4 * sc, 0, 1.25 * sc, 0, 14, 10), '#ffffff'),
      solid(sphere(0.3 * sc, 0, 1.8 * sc, 0, 14, 10), '#ffffff'),
      solid(new THREE.ConeGeometry(0.06 * sc, 0.32 * sc, 8).rotateZ(Math.PI / 2).translate(-0.4 * sc, 1.8 * sc, 0), '#ff7a1a'),
      solid(sphere(0.04 * sc, -0.25 * sc, 1.9 * sc, 0.1 * sc, 6, 4), '#111111'),
      solid(sphere(0.04 * sc, -0.25 * sc, 1.9 * sc, -0.1 * sc, 6, 4), '#111111'),
      solid(new THREE.CylinderGeometry(0.22 * sc, 0.26 * sc, 0.3 * sc, 12).translate(0, 2.12 * sc, 0), '#e63946'),
      solid(rod(v3(0, 1.3 * sc, 0.3 * sc), v3(0.1 * sc, 1.7 * sc, 0.9 * sc), 0.03 * sc, 4), '#5b3a1f'),
      solid(rod(v3(0, 1.3 * sc, -0.3 * sc), v3(0.1 * sc, 1.75 * sc, -0.9 * sc), 0.03 * sc, 4), '#5b3a1f'),
    ];
    const f = c.frame(s);
    const yaw = Math.atan2(-Math.sign(d) * f.tz, Math.sign(d) * f.tx) + Math.PI / 2;
    const g = mergeGeometries(parts2, false) as Geo;
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-yaw + Math.PI));
    g.translate(w.x, y, w.z);
    smGeos.push(g);
  };
  snowmanAt(START_S + 30, W + BERM + 4, 1.1);
  snowmanAt(F + 12, W + BERM + 5, 1.3);
  snowmanAt(F + 22, -(W + BERM + 6), 1.0);
  snowmanAt(c.jumps[1].s + 30, -(W + BERM + 4), 1.0);
  snowmanAt(c.jumps[3].s - 40, W + BERM + 4, 1.4);
  decor.add(mesh('Snowmen', mergeGeometries(smGeos, false) ?? new THREE.BufferGeometry(), M.snowman));
  // deretan bendera warna-warni di start & finish
  const flagCols = ['#e63946', '#ffd23f', '#06d6a0', '#118ab2', '#ffffff', '#f77f00', '#8338ec'];
  const flagGeos: Geo[] = [];
  const flagRow = (sA: number, sB: number, d: number) => {
    let k = 0;
    for (let s = sA; s <= sB; s += 4) {
      const w = c.worldAt(s, d);
      const y = c.groundY(w.x, w.z);
      flagGeos.push(solid(cyl(0.04, 0.04, 4.2, w.x, y + 2.1, w.z, 6), '#d9dde3'));
      const fl = new THREE.PlaneGeometry(1.1, 0.7);
      fl.translate(0.58, 3.75, 0);
      const f = c.frame(s);
      fl.rotateY(-Math.atan2(f.tz, f.tx) + Math.PI);
      fl.translate(w.x, y, w.z);
      flagGeos.push(solid(fl, flagCols[k++ % flagCols.length]));
    }
  };
  flagRow(-6, START_S + 30, W + BERM + 1.5);
  flagRow(-6, START_S + 30, -(W + BERM + 1.5));
  flagRow(F - 4, F + 30, W + BERM + 1.5);
  flagRow(F - 4, F + 30, -(W + BERM + 1.5));
  decor.add(mesh('Flag_Rows', mergeGeometries(flagGeos, false) ?? new THREE.BufferGeometry(), M.flags));
  group.add(decor);
  parts.decor = decor;

  /* ------------------------------ Penonton ------------------------------ */
  const crowdSpots: CrowdSpot[] = [];
  const clusters: Cluster[] = [];
  const cr = rng(31);
  for (const z of c.zones) {
    let cnt = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const sg of z.sides) {
      const n = Math.round((z.s1 - z.s0) * 1.25 * z.density);
      for (let k = 0; k < n; k++) {
        const s = z.s0 + cr() * (z.s1 - z.s0);
        if (z.stand && s > S0 - 2 && s < S1 + 2) continue;
        const d = sg * (W + 2.6 + Math.pow(cr(), 1.4) * 10);
        const f = c.frame(s);
        const x = f.x + f.tz * d;
        const zz = f.z - f.tx * d;
        const y = groundAtSD(c, s, d);
        crowdSpots.push({ x, y, z: zz, yaw: Math.atan2(-sg * f.tz, sg * f.tx) + (cr() - 0.5) * 0.5 });
        cnt++;
        sx += x;
        sy += y;
        sz += zz;
      }
    }
    if (cnt) clusters.push({ x: sx / cnt, y: sy / cnt, z: sz / cnt, n: cnt, s: (z.s0 + z.s1) / 2 });
  }
  const seatedChosen = seatSpots.filter(() => cr() < 0.72);
  if (seatedChosen.length) {
    const avg = seatedChosen.reduce((a, p) => [a[0] + p.x, a[1] + p.y, a[2] + p.z], [0, 0, 0]);
    clusters.push({ x: avg[0] / seatedChosen.length, y: avg[1] / seatedChosen.length, z: avg[2] / seatedChosen.length, n: seatedChosen.length, s: (S0 + S1) / 2 });
  }
  const allSpots = [...crowdSpots, ...seatedChosen];
  const crowdUniforms = { uTime: { value: 0 }, uFocus: { value: new THREE.Vector3(0, -999, 0) }, uCheer: { value: 1 } };
  const crowd = buildCrowd(allSpots, crowdUniforms, cr);
  crowd.userData.noExport = true;
  group.add(crowd);
  parts.crowd = crowd;

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.receiveShadow === false) m.receiveShadow = true;
    if (!['Track_Snow', 'Terrain_Snow', 'Distant_Peaks', 'Safety_Nets', 'Finish_Line', 'Jump_Lip_Lines', 'Track_EndCaps'].includes(m.name) && !(m as THREE.InstancedMesh).isInstancedMesh) m.castShadow = true;
  });

  const setScheme = (s: SkiScheme) => {
    M.snow.color.set(s.snow);
    M.net.color.set(s.net);
    M.gateA.color.set(s.gateA);
    M.gateB.color.set(s.gateB);
    M.arch.color.set(s.arch);
    M.wood.color.set(s.wood);
    recolorTrees(s.pine);
  };

  return {
    group,
    parts,
    wands,
    lights,
    lampMat: M.lamp,
    windowMat: M.window,
    timing,
    banners: { start: startBanner, finish: finishBanner },
    crowdUniforms,
    clusters,
    updateLift,
    setScheme,
  };
}

/** Penonton jelly (instanced) — melompat & melambai lebih heboh saat pembalap dekat. */
function buildCrowd(spots: CrowdSpot[], uniforms: MountainBuild['crowdUniforms'], r: () => number) {
  const g = grp('Spectators');
  const body = new THREE.CapsuleGeometry(0.22, 0.34, 2, 8).translate(0, 0.39, 0);
  const eyeL = new THREE.BoxGeometry(0.05, 0.09, 0.03).translate(-0.075, 0.6, 0.21);
  const eyeR = new THREE.BoxGeometry(0.05, 0.09, 0.03).translate(0.075, 0.6, 0.21);
  const armL = new THREE.CapsuleGeometry(0.06, 0.26, 2, 6).rotateZ(0.5).translate(-0.27, 0.62, 0);
  const armR = new THREE.CapsuleGeometry(0.06, 0.26, 2, 6).rotateZ(-0.5).translate(0.27, 0.62, 0);
  const bodyGeo = mergeGeometries([solid(body, '#ffffff'), solid(armL, '#ffffff'), solid(armR, '#ffffff'), solid(eyeL, '#111111'), solid(eyeR, '#111111')], false) as Geo;
  const hatGeo = mergeGeometries([solid(new THREE.CylinderGeometry(0.2, 0.23, 0.2, 12).translate(0, 0.82, 0), '#ffffff'), solid(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 0.96, 0), '#ffffff'), solid(new THREE.TorusGeometry(0.21, 0.03, 4, 14).rotateX(Math.PI / 2).translate(0, 0.73, 0), '#dddddd')], false) as Geo;
  const flagGeo = mergeGeometries([solid(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4).translate(0.34, 1.0, 0.05), '#e8e8e8'), solid(new THREE.PlaneGeometry(0.42, 0.28).translate(0.56, 1.42, 0.05), '#ffffff')], false) as Geo;

  const mk = (name: string, geo: Geo, flag: boolean) => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: flag ? THREE.DoubleSide : THREE.FrontSide });
    mat.name = name;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        'uniform float uTime;\nuniform vec3 uFocus;\nuniform float uCheer;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
            float ex = smoothstep(48.0, 5.0, distance(ip, uFocus));
            float amp = 0.035 + ex * 0.42 * uCheer;
            float b = max(0.0, sin(uTime * (5.0 + ph * 4.0 + ex * 3.0) + ph * 6.283));
            ${flag ? 'transformed.z += sin(uTime * 9.0 + ip.x + position.x * 6.0) * 0.08 * step(1.2, position.y);' : ''}
            transformed.y += b * amp;
            transformed.x += sin(uTime * 3.0 + ph * 9.0) * 0.04 * ex;
          #endif`,
        );
    };
    mat.customProgramCacheKey = () => `ski-crowd-${flag ? 'f' : 'b'}-v1`;
    const im = new THREE.InstancedMesh(geo, mat, 1);
    im.name = name;
    return im;
  };
  const bodyCols = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#b197fc', '#ffa94d', '#63e6be', '#f8f9fa', '#ff8787'];
  const hatCols = ['#e63946', '#1d4ed8', '#ffd23f', '#ffffff', '#10b981', '#ff7a1a', '#8338ec'];
  const flagCols = ['#e63946', '#ffd23f', '#1d4ed8', '#06d6a0', '#ff5d8f'];
  const bodies = mk('Spectators', bodyGeo, false);
  const hats = mk('Spectator_Hats', hatGeo, false);
  const flagSpots = spots.filter(() => r() < 0.28);
  const flags = mk('Spectator_Flags', flagGeo, true);
  const fill = (im: THREE.InstancedMesh, list: CrowdSpot[], cols: string[]) => {
    const n = list.length;
    const out = new THREE.InstancedMesh(im.geometry, im.material, Math.max(1, n));
    out.name = im.name;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach((p, i) => {
      const h = Math.abs(Math.sin(p.x * 12.3 + p.z * 4.1));
      const sc = 0.9 + h * 0.25;
      q.setFromAxisAngle(v3(0, 1, 0), p.yaw);
      m.compose(v3(p.x, p.y, p.z), q, v3(sc, sc, sc));
      out.setMatrixAt(i, m);
      out.setColorAt(i, c.set(cols[Math.floor(h * 997) % cols.length]));
    });
    if (!n) out.count = 0;
    out.frustumCulled = false;
    out.receiveShadow = true;
    return out;
  };
  g.add(fill(bodies, spots, bodyCols), fill(hats, spots, hatCols), fill(flags, flagSpots, flagCols));
  return g;
}
