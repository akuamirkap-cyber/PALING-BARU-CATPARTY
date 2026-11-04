import type { V2, V3 } from './math';

export interface WhiskerSpec { a: V2; b: V2; bend: number }

export interface FaceSpec {
  eyeX: number; eyeY: number; eyeR: number;
  pupilR: number; pupilDX: number; pupilDY: number;
  browIn: V2; browOut: V2; // angled eyelid cut line endpoints
  browArch: number; outlineW: number; topLinerW: number;
  noseY: number; noseW: number; noseH: number;
  mouthJ: number; mouthW: number; mouthD: number; lineW: number;
  rect: [number, number, number, number]; // decal rect x0,y0,x1,y1
  whiskers: WhiskerSpec[]; whiskerR: number; whiskerLift: number;
  bump: { eye: number; nose: number; pad: number; chin: number };
}

export interface CatPalette {
  fur: string; stripe: string; white: string; earInner: string; point: string; pointMid: string; bean: string;
  iris: [string, string]; pupil: string; outline: string; nose: string; noseDark: string; line: string; whisker: string;
}

export interface CatSpec {
  id: 'oyen' | 'siam';
  name: string;
  head: { c: V3; rx: number; ry: number; rz: number; nXY: number };
  torso: { a: V3; ra: number; b: V3; rb: number; zs: number; cutY: number; cutK: number };
  belly: { c: V3; r: V3; k: number };
  headTorsoK: number;
  arm: {
    p0: V3; p1: V3; p2: V3; // 3-point smooth bezier (shoulder -> elbow -> wrist)
    r0: number; r1: number; seg: number;
    kTop: number; kBot: number; t0: number; t1: number;
  };
  paw: { c: V3; r: V3; ang: number; k: number };
  leg: { x: number; top: V3; rt: number; bot: V3; rb: number; kTop: number; kBot: number };
  foot: { c: V3; r: V3; k: number; toe: number };
  ear: { c: V3; tip: V2; outer: V2; inner: V2; hBase: number; hTip: number; round: number; yaw: number; tilt: number; cav: number; k: number };
  tail: { p: [V3, V3, V3, V3]; r0: number; r1: number; k: number; seg: number };
  face: FaceSpec;
  pal: CatPalette;
  bounds: { min: V3; max: V3 };
}

// ─────────────────────────── ORANGE TABBY ("Oyen") ───────────────────────────
export const OYEN: CatSpec = {
  id: 'oyen',
  name: 'Oyen',
  // Head: plump spherical round head (rx = rz = 0.55 -> circular from top view, perfectly round!)
  head: { c: [0, 1.81, 0], rx: 0.55, ry: 0.51, rz: 0.54, nXY: 2.05 },
  // Torso: round cone from hips (y=0.72) to upper chest (y=1.28), smooth bottom cut at y=0.48
  torso: { a: [0, 0.72, -0.01], ra: 0.46, b: [0, 1.28, -0.02], rb: 0.36, zs: 0.88, cutY: 0.48, cutK: 0.12 },
  // Belly: gentle forward roundness
  belly: { c: [0, 0.88, 0.12], r: [0.34, 0.36, 0.32], k: 0.14 },
  headTorsoK: 0.18,
  // Arm: relaxed supple curve (shoulder -> gentle outward bow -> wrist hanging naturally like gambar 2)
  arm: {
    p0: [0.36, 1.26, 0.03],
    p1: [0.54, 1.00, 0.06],
    p2: [0.52, 0.70, 0.10],
    r0: 0.120, r1: 0.124, seg: 18,
    kTop: 0.10, kBot: 0.003, t0: 0.12, t1: 0.42,
  },
  paw: { c: [0.525, 0.61, 0.11], r: [0.138, 0.135, 0.142], ang: 0.15, k: 0.07 },
  // Sturdy clean legs with clear separation & proper height!
  leg: { x: 0.258, top: [0, 0.56, 0.0], rt: 0.185, bot: [0.003, 0.20, 0.025], rb: 0.17, kTop: 0.12, kBot: 0.02 },
  foot: { c: [0.002, 0.11, 0.085], r: [0.188, 0.15, 0.245], k: 0.07, toe: 0.013 },
  // Ear: compact, rounded tip
  ear: {
    c: [0.33, 2.20, 0.00], tip: [0.052, 0.19], outer: [0.14, -0.15], inner: [-0.17, -0.04],
    hBase: 0.065, hTip: 0.012, round: 0.038, yaw: 0.24, tilt: 0.15, cav: 0.026, k: 0.06,
  },
  tail: {
    p: [[0, 0.58, -0.22], [0, 0.42, -0.62], [0.035, 0.80, -0.80], [0.12, 1.06, -0.58]],
    r0: 0.11, r1: 0.078, k: 0.085, seg: 18,
  },
  face: {
    eyeX: 0.262, eyeY: 1.812, eyeR: 0.198,
    pupilR: 0.6, pupilDX: -0.02, pupilDY: 0.02,
    browIn: [-0.98, 0.46], browOut: [0.82, 0.82], browArch: 0.045, outlineW: 0.08, topLinerW: 0.12,
    noseY: 1.692, noseW: 0.066, noseH: 0.044,
    mouthJ: 1.632, mouthW: 0.205, mouthD: 0.062, lineW: 0.0135,
    rect: [-0.53, 1.535, 0.53, 2.07],
    whiskers: [
      { a: [0.085, 1.674], b: [0.53, 1.765], bend: 0.006 },
      { a: [0.09, 1.661], b: [0.545, 1.69], bend: 0.008 },
      { a: [0.085, 1.648], b: [0.525, 1.612], bend: 0.008 },
    ],
    whiskerR: 0.0052, whiskerLift: 0.012,
    bump: { eye: 0.012, nose: 0.015, pad: 0.018, chin: 0.01 },
  },
  pal: {
    fur: '#E8903E', stripe: '#C2652A', white: '#F8F3EC', earInner: '#F2B6A4', point: '#4B392F', pointMid: '#7A6253', bean: '#D99A98',
    iris: ['#D3EDAE', '#8BBE5E'], pupil: '#1A2333', outline: '#121011', nose: '#F09AA4', noseDark: '#D47884', line: '#3A2416', whisker: '#6B4122',
  },
  bounds: { min: [-0.84, -0.02, -1.08], max: [0.84, 2.66, 0.62] },
};

// ─────────────────────────── SIAMESE ("Siam") ───────────────────────────
export const SIAM: CatSpec = {
  id: 'siam',
  name: 'Siam',
  // Head: plump spherical round head (rx = rz = 0.46 -> circular from top view, perfectly round!)
  head: { c: [0, 1.45, 0], rx: 0.46, ry: 0.43, rz: 0.45, nXY: 2.05 },
  torso: { a: [0, 0.60, -0.01], ra: 0.40, b: [0, 1.05, -0.02], rb: 0.31, zs: 0.88, cutY: 0.40, cutK: 0.10 },
  belly: { c: [0, 0.74, 0.11], r: [0.29, 0.31, 0.28], k: 0.12 },
  headTorsoK: 0.16,
  arm: {
    p0: [0.32, 1.02, 0.025],
    p1: [0.46, 0.82, 0.05],
    p2: [0.43, 0.58, 0.08],
    r0: 0.092, r1: 0.098, seg: 18,
    kTop: 0.08, kBot: 0.003, t0: 0.12, t1: 0.42,
  },
  paw: { c: [0.44, 0.50, 0.09], r: [0.108, 0.105, 0.112], ang: 0.15, k: 0.06 },
  leg: { x: 0.222, top: [0, 0.48, 0.0], rt: 0.16, bot: [0.003, 0.18, 0.02], rb: 0.148, kTop: 0.11, kBot: 0.02 },
  foot: { c: [0.002, 0.098, 0.075], r: [0.158, 0.135, 0.215], k: 0.065, toe: 0.012 },
  ear: {
    c: [0.27, 1.78, 0.00], tip: [0.046, 0.165], outer: [0.125, -0.135], inner: [-0.15, -0.035],
    hBase: 0.058, hTip: 0.01, round: 0.032, yaw: 0.22, tilt: 0.14, cav: 0.024, k: 0.055,
  },
  tail: {
    p: [[0, 0.50, -0.2], [0, 0.38, -0.54], [0.03, 0.70, -0.7], [0.1, 0.93, -0.51]],
    r0: 0.096, r1: 0.068, k: 0.075, seg: 18,
  },
  face: {
    eyeX: 0.222, eyeY: 1.452, eyeR: 0.154,
    pupilR: 0.6, pupilDX: -0.02, pupilDY: 0.02,
    browIn: [-0.98, 0.46], browOut: [0.82, 0.82], browArch: 0.045, outlineW: 0.08, topLinerW: 0.12,
    noseY: 1.346, noseW: 0.052, noseH: 0.034,
    mouthJ: 1.294, mouthW: 0.112, mouthD: 0.052, lineW: 0.0125,
    rect: [-0.44, 1.2, 0.44, 1.66],
    whiskers: [
      { a: [0.145, 1.318], b: [0.445, 1.34], bend: 0.004 },
      { a: [0.145, 1.298], b: [0.445, 1.272], bend: 0.004 },
    ],
    whiskerR: 0.0055, whiskerLift: 0.013,
    bump: { eye: 0.01, nose: 0.012, pad: 0.015, chin: 0.01 },
  },
  pal: {
    fur: '#F0E7DA', stripe: '#DCCDBB', white: '#F7F1E8', earInner: '#86705F', point: '#4A372D', pointMid: '#7E6556', bean: '#D7938F',
    iris: ['#BFE0F7', '#6BA3D8'], pupil: '#19202F', outline: '#121011', nose: '#3D2B23', noseDark: '#2A1C16', line: '#22160F', whisker: '#F6F2EB',
  },
  bounds: { min: [-0.72, -0.02, -0.98], max: [0.72, 2.1, 0.56] },
};

export const SPECS = { oyen: OYEN, siam: SIAM } as const;
