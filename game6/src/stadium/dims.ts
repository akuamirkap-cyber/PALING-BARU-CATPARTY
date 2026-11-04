import * as THREE from 'three';
import type { Surface } from '../assets/common';

/**
 * Stadion terapung "Jelly Arena". Satuan meter, garis air Y = 0.
 * Panjang lapangan sepanjang X (gawang di ±X), lebar sepanjang Z.
 */
export const ST = {
  deckY: 1.6,
  pitchY: 1.66,
  pitchHX: 20,
  pitchHZ: 13,
  fieldHX: 25.5,
  fieldHZ: 17.5,
  platHX: 46,
  platHZ: 37,
  platR: 13,
  pontoonBottom: -2.4,
  goalW: 5.2,
  goalH: 2.2,
  goalD: 1.8,
  ballR: 0.6,
} as const;

export interface StandDef {
  name: string;
  length: number;
  z0: number;
  rows: number;
  rowD: number;
  rise: number;
  front: number;
  concourse: number;
  yaw: number;
  aisles: number[];
  letters?: string;
  roof?: boolean;
  vip?: boolean;
  crest?: boolean;
  screen?: boolean;
}

export const STANDS: StandDef[] = [
  { name: 'Stand_North', length: 42, z0: 17.5, rows: 12, rowD: 0.85, rise: 0.42, front: 1.1, concourse: 2.4, yaw: 0, aisles: [-14, -7, 0, 7, 14], roof: true, crest: true },
  { name: 'Stand_South', length: 42, z0: 17.5, rows: 12, rowD: 0.85, rise: 0.42, front: 1.1, concourse: 2.4, yaw: Math.PI, aisles: [-14, -7, 0, 7, 14], roof: true, vip: true },
  { name: 'Stand_East', length: 26, z0: 25.5, rows: 8, rowD: 0.85, rise: 0.42, front: 1.1, concourse: 1.8, yaw: Math.PI / 2, aisles: [-12.3, 12.3], letters: 'BEEF', screen: true },
  { name: 'Stand_West', length: 26, z0: 25.5, rows: 8, rowD: 0.85, rise: 0.42, front: 1.1, concourse: 1.8, yaw: -Math.PI / 2, aisles: [-12.3, 12.3], letters: 'JELLY', screen: true },
];

export const rowY = (s: StandDef, i: number) => ST.deckY + s.front + i * s.rise;
export const standTopY = (s: StandDef) => ST.deckY + s.front + s.rows * s.rise;
export const standBackZ = (s: StandDef) => s.z0 + s.rows * s.rowD + s.concourse;
export const standMatrix = (s: StandDef) => new THREE.Matrix4().makeRotationY(s.yaw);

export const ROOF = { hx: 22.5, zFront: 16.6, zBack: 30.6, yBack: 13.2, yFront: 14.6, thick: 0.35 };
/** Tinggi permukaan atas atap pada koordinat Z lokal tribun. */
export function roofY(z: number) {
  const s = Math.min(1, Math.max(0, (ROOF.zBack - z) / (ROOF.zBack - ROOF.zFront)));
  return ROOF.yBack + (ROOF.yFront - ROOF.yBack) * s + 0.55 * Math.sin(Math.PI * s);
}

export const TOWERS: [number, number][] = [
  [31.5, 26],
  [-31.5, 26],
  [31.5, -26],
  [-31.5, -26],
];
export const TOWER_TOP = 26.5;

export function insidePlatform(x: number, z: number, inset = 0) {
  const hx = ST.platHX - inset;
  const hz = ST.platHZ - inset;
  const r = ST.platR - inset;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > hx || az > hz) return false;
  const cx = hx - r;
  const cz = hz - r;
  if (ax > cx && az > cz) return Math.hypot(ax - cx, az - cz) <= r;
  return true;
}

/** Permukaan teratas di (x, z) — untuk beast yang dijatuhkan. */
export function stadiumGroundAt(x: number, z: number): { y: number; surface: Surface } {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= ROOF.hx && az >= ROOF.zFront && az <= ROOF.zBack) return { y: roofY(az) + ROOF.thick * 0.5, surface: 'deck' };
  for (const s of STANDS) {
    const local = new THREE.Vector3(x, 0, z).applyMatrix4(standMatrix(s).invert());
    if (Math.abs(local.x) <= s.length / 2 && local.z >= s.z0 && local.z <= standBackZ(s)) {
      const i = Math.floor((local.z - s.z0) / s.rowD);
      return { y: i < s.rows ? rowY(s, i) : standTopY(s), surface: 'deck' };
    }
  }
  if (ax <= ST.fieldHX && az <= ST.fieldHZ) return { y: ST.pitchY, surface: 'deck' };
  if (insidePlatform(x, z)) return { y: ST.deckY, surface: 'deck' };
  return { y: 0, surface: 'sea' };
}
