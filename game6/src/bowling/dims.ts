import type { Surface } from '../assets/common';

/**
 * Arena bowling "Jelly Bowl" — ukuran mengikuti standar USBC.
 * Satuan meter. Lintasan sepanjang +X (pelempar menghadap +X), +Z = kanan pelempar, lantai Y = 0.
 */
export const IN = 0.0254;
export const FT = 0.3048;

export const LANE_W = 41.5 * IN; // 1,054 m — 39 papan
export const BOARDS = 39;
export const BOARD_W = LANE_W / BOARDS;
export const GUTTER_W = 9.25 * IN; // 0,235 m
export const GUTTER_D = 1.875 * IN; // kedalaman gutter
export const HALF_TRACK = LANE_W / 2 + GUTTER_W; // tepi luar gutter dari tengah lintasan
export const LANE_PITCH = 1.7; // jarak antar-tengah lintasan
export const LANE_COUNT = 6;
export const PLAYER_LANE = 2;

export const FOUL_X = -4;
export const HEAD_X = FOUL_X + 60 * FT; // foul line → pin 1 = 60 kaki
export const PIT_X = HEAD_X + 34.1875 * IN; // ujung pin deck (tail plank)
export const DECK_START = HEAD_X - 0.62;
export const OIL_END = FOUL_X + 40 * FT; // pola minyak "house shot" 40 kaki
export const APPROACH_X0 = FOUL_X - 15 * FT - 0.45; // approach ≥ 15 kaki
export const CUSHION_X = PIT_X + 0.95;
export const PIT_FLOOR = -0.22;
export const KICK_H = 0.6;
export const MASK_X = HEAD_X - 0.72;
export const MASK_BOTTOM = 1.05;
export const MASK_TOP = 2.9;
export const TRACK_EDGE = (LANE_COUNT / 2) * LANE_PITCH + 0.12; // tepi struktur lintasan terluar

export const HALL = { x0: -18, x1: 18, z0: -9.5, z1: 9.5, h: 5.2 };
export const CONCOURSE = { x1: -13, h: 0.45 };

export const PIN_H = 15 * IN; // 0,381 m
export const PIN_MASS = 1.55; // kg (3 lb 6 oz)
export const BALL_R = 4.25 * IN; // diameter 8,5 inci
export const BALL_MASS = 7.26; // kg (16 lb)

export const laneZ = (i: number) => (i - (LANE_COUNT - 1) / 2) * LANE_PITCH;
export const pairZ = (p: number) => (laneZ(p * 2) + laneZ(p * 2 + 1)) / 2;

const DX = 12 * IN * Math.cos(Math.PI / 6);
const S = 12 * IN;
/** Posisi pin 1–10 relatif pin 1 (x maju, z ke kanan). Jarak antar pin 12 inci. */
export const PIN_SPOTS: [number, number][] = [
  [0, 0],
  [DX, -S / 2],
  [DX, S / 2],
  [2 * DX, -S],
  [2 * DX, 0],
  [2 * DX, S],
  [3 * DX, -1.5 * S],
  [3 * DX, -S / 2],
  [3 * DX, S / 2],
  [3 * DX, 1.5 * S],
];

export const BOWLER_X0 = FOUL_X - 3.4;
export const RELEASE_X = FOUL_X - 0.06;
export const RETURN_X = -8.2;
export const RETURN_TOP = 0.84;

export function returnSlot(lane: number): [number, number, number] {
  const p = Math.floor(lane / 2);
  return [RETURN_X + 0.42, RETURN_TOP + BALL_R, pairZ(p) + (lane % 2 === 0 ? -0.13 : 0.13)];
}

/** Permukaan teratas untuk beast yang dijatuhkan. */
export function bowlingGroundAt(x: number, z: number): { y: number; surface: Surface } {
  if (x <= CONCOURSE.x1 && x >= HALL.x0) return { y: CONCOURSE.h, surface: 'deck' };
  for (let i = 0; i < LANE_COUNT; i++) {
    const dz = Math.abs(z - laneZ(i));
    if (dz > HALF_TRACK) continue;
    if (x > PIT_X && x < CUSHION_X) return { y: PIT_FLOOR, surface: 'deck' };
    if (dz > LANE_W / 2 && x > FOUL_X && x < PIT_X) return { y: -GUTTER_D * 0.6, surface: 'deck' };
  }
  return { y: 0, surface: 'deck' };
}
