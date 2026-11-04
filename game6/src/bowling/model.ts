import { BALL_R, DECK_START, HEAD_X, LANE_W, OIL_END } from './dims';
import { PHYS, throwVectors, type ThrowParams } from './physics';

const G = 9.81;
export const POCKET = 0.064; // jarak "pocket" 1-3 dari tengah pin 1

export interface PathResult {
  pts: [number, number][];
  entry: number | null;
  entryAngle: number;
  gutter: boolean;
}

/** Model gesek 2D (skid → hook → roll) yang sama dengan mesin fisika, untuk garis bidik. */
export function predictPath(lz: number, p: ThrowParams, stepOut = 0.3): PathResult {
  const v0 = throwVectors(lz, p);
  let x = v0.pos.x;
  let z = v0.pos.z;
  let vx = v0.linvel.x;
  let vz = v0.linvel.z;
  let wx = v0.angvel.x;
  let wz = v0.angvel.z;
  const dt = 1 / 240;
  const pts: [number, number][] = [[x, z]];
  let next = x + stepOut;
  let entry: number | null = null;
  let entryAngle = 0;
  let gutter = false;
  const contactX = HEAD_X - 0.168;
  for (let i = 0; i < 4000 && x < contactX; i++) {
    const mu = x < OIL_END ? PHYS.oil : x < DECK_START ? PHYS.dry : PHYS.deck;
    const cx = vx + BALL_R * wz;
    const cz = vz - BALL_R * wx;
    const slip = Math.hypot(cx, cz);
    if (slip > 1e-3) {
      const a = mu * G;
      let ax = (-cx / slip) * a;
      let az = (-cz / slip) * a;
      // laju perubahan slip = 3.5 × a → batasi agar tidak melewati nol
      const maxA = slip / (3.5 * dt);
      if (a > maxA) {
        ax *= maxA / a;
        az *= maxA / a;
      }
      vx += ax * dt;
      vz += az * dt;
      wx += ((-2.5 * az) / BALL_R) * dt;
      wz += ((2.5 * ax) / BALL_R) * dt;
    }
    x += vx * dt;
    z += vz * dt;
    if (Math.abs(z - lz) > LANE_W / 2 + 0.01) {
      gutter = true;
      pts.push([x, z]);
      break;
    }
    if (x >= next) {
      pts.push([x, z]);
      next += stepOut;
    }
  }
  if (!gutter) {
    entry = z - lz;
    entryAngle = (Math.atan2(vz, vx) * 180) / Math.PI;
    pts.push([x, z]);
  }
  return { pts, entry, entryAngle, gutter };
}

/** Cari sudut agar bola masuk "pocket" (1-3 untuk hook kiri, 1-2 untuk hook kanan). */
export function solveAngle(lz: number, p: ThrowParams, target?: number) {
  const tgt = target ?? (p.spin < -0.05 ? -POCKET : POCKET);
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const r = predictPath(lz, { ...p, angle: mid });
    const e = r.entry ?? (r.pts[r.pts.length - 1][1] - lz > 0 ? 1 : -1);
    if (e > tgt) hi = mid;
    else lo = mid;
  }
  return Math.max(-1, Math.min(1, (lo + hi) / 2));
}
