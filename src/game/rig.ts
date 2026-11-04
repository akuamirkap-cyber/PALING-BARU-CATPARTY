// Shared skeleton constants (physics ragdoll + skinned mesh bind pose).
// All values are in the local frame of the body they belong to.
// The torso-related ones are LIVE bindings recomputed from the shape tuning by applyRig().
import { getRigTuning, getShapeMode, isSculptedShape, type Tuning } from "./tuning";

export type V3 = [number, number, number];

export const LIMB_TOP: V3 = [0, 0.15, 0]; // joint pivot in limb frame
/** extra shoulder width of the asset cat (its arms hang clear of the belly) */
export const ASSET_SHOULDER = 0.05;
/** foot contact point in leg-local space (moves with the leg length) */
export let FOOT: V3 = [0, -0.2, 0];
export let LEG_H = 1;
/** arm length used by the physics ragdoll (follows the "Panjang tangan" tuning) */
export let ARM_LEN = 1.1;
export let HAND: V3 = [0, 0.15 - 0.37 * ARM_LEN, 0];
/** angle (rad) the arms are spread outward in the mesh bind pose (arms-out plush pose) */
export const ARM_BIND_SPREAD = 0.95;
/** leg length from hip joint to the ground */
const LEG_DROP = 0.52;

export let BODY_H = 1;
export let HOVER = 0.9; // torso centre height above ground
export let NECK_A: V3 = [0, 0.32, 0]; // on torso
export let NECK_B: V3 = [0, -0.24, 0]; // on head
export let HEAD_OFFSET = 0.56;
export let SHOULDER_L: V3 = [0.29, 0.17, 0.04];
export let SHOULDER_R: V3 = [-0.29, 0.17, 0.04];
export let HIP_L: V3 = [0.19, -0.38, 0];
export let HIP_R: V3 = [-0.19, -0.38, 0];

/** Recompute the skeleton from the current proportions (body height, shoulder width, head size). */
export function applyRig(t: Tuning = getRigTuning()) {
  const h = t.bodyH;
  BODY_H = h;
  // Keep the socket close to the chest surface, giving the arm room to hang
  // beside the torso. The asset's shoulders sit further out than the plush
  // ones (measured 0.52 * scale from the centre line), so its arm can hang
  // clear of the belly instead of sinking into it.
  const sw = 0.33 * t.bodyTop * 1.03 + 0.01 + (isSculptedShape() ? 0.015 : 0) + (getShapeMode() === "asset" ? ASSET_SHOULDER : 0);
  const hw = 0.19 * (0.6 + 0.4 * t.bodyBottom);
  NECK_A = [0, 0.32 * h, 0];
  NECK_B = [0, -0.24 * t.head, 0];
  HEAD_OFFSET = NECK_A[1] - NECK_B[1];
  SHOULDER_L = [sw, 0.17 * h, 0.04];
  SHOULDER_R = [-sw, 0.17 * h, 0.04];
  HIP_L = [hw, -0.38 * h, 0];
  HIP_R = [-hw, -0.38 * h, 0];
  LEG_H = t.legH;
  ARM_LEN = t.armLen;
  HAND = [0, 0.15 - 0.37 * ARM_LEN, 0];
  // leg geometry is stretched away from the hip pivot (LIMB_TOP), so the drop scales with legH
  FOOT = [0, LIMB_TOP[1] + (-0.2 - LIMB_TOP[1]) * t.legH, 0];
  HOVER = 0.38 * h + LIMB_TOP[1] + (LEG_DROP - LIMB_TOP[1]) * t.legH;
}
applyRig();

/* ------------------------------------------------------------------ */
/*  Self-collision volumes (match the visible body so paws never sink in) */
/* ------------------------------------------------------------------ */
export interface Ell {
  c: V3;
  r: V3;
}
/** lateral slimness of the asset barrel relative to the same slider values */
export const ASSET_SLIM = 1.0;
/** ellipsoids of the torso (torso frame) and head (head frame), from the current proportions */
export function selfVolumes(t: Tuning = getRigTuning()) {
  const h = t.bodyH, bb = t.bodyBottom, bt = t.bodyTop, fat = t.belly;
  // The figurine is sculpted as a continuous upright torso, not the classic
  // pear scaled up. These same volumes drive the visible surface and paw
  // clearance, so the fuller chest cannot swallow a relaxed arm.
  // The exported sculpt is a touch slimmer than the plush barrel at the same
  // slider values; this factor is shared by the skin, the self-collision and
  // the paw clearance so the mesh and the physics always agree.
  const slim = isSculptedShape() ? (getShapeMode() === "asset" ? ASSET_SLIM : 1) : 1;
  const torso: Ell[] = isSculptedShape() ? [
    // The sculpt's lower body tapers smoothly into the hips instead of bulging
    // out over the legs, so the pelvis volume sits a little higher and slimmer.
    { c: [0, -0.145 * h, 0], r: [0.358 * bb * slim, 0.385 * h * (0.7 + 0.3 * bb), 0.33 * bb * slim] },
    { c: [0, 0.10 * h, -0.015], r: [0.38 * bt * slim, 0.50 * h * (0.75 + 0.25 * bt), 0.27 * (0.55 + 0.45 * bt) * slim] },
    { c: [0, -0.10 * h, 0.055 + 0.07 * (fat - 1)], r: [0.31 * bb * (0.85 + 0.15 * fat) * slim, 0.38 * h * (0.85 + 0.15 * fat), 0.26 * fat * slim] },
  ] : [
    { c: [0, -0.2 * h, 0], r: [0.4 * bb, 0.38 * h * (0.7 + 0.3 * bb), 0.33 * bb] },
    { c: [0, 0.14 * h, 0], r: [0.33 * bt, 0.34 * h * (0.65 + 0.35 * bt), 0.27 * (0.5 + 0.5 * bt)] },
    { c: [0, -0.14 * h, 0.08 + 0.07 * (fat - 1)], r: [0.3 * bb * (0.85 + 0.15 * fat), 0.33 * h * (0.85 + 0.15 * fat), 0.28 * fat] },
  ];
  const S = 0.745 * t.head, ny = t.neck, j = t.jaw;
  const cx = 0.24 * (0.8 + 0.2 * j) * S, cy = (-0.15 - 0.035 * (j - 1)) * S + ny;
  const cr: V3 = [0.31 * (0.75 + 0.25 * j) * S, 0.27 * j * S, 0.3 * (0.8 + 0.2 * j) * S];
  const head: Ell[] = [
    { c: [0, 0.02 * S + ny, -0.01 * S], r: [0.56 * S, 0.5 * S, 0.5 * S] },
    { c: [cx, cy, 0.06 * S], r: cr },
    { c: [-cx, cy, 0.06 * S], r: cr },
    { c: [0, (-0.18 - 0.05 * (j - 1)) * S + ny, 0.04 * S], r: [0.3 * j * S, 0.2 * j * S, 0.28 * (0.85 + 0.15 * j) * S] },
  ];
  return { torso, head };
}

/** push a sphere (centre p, radius rad) out of a set of ellipsoids. Mutates p, returns true if moved. */
export function pushOut(p: { x: number; y: number; z: number }, rad: number, vols: Ell[]): boolean {
  let moved = false;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const e of vols) {
      const rx = e.r[0] + rad, ry = e.r[1] + rad, rz = e.r[2] + rad;
      const dx = p.x - e.c[0], dy = p.y - e.c[1], dz = p.z - e.c[2];
      const k = Math.hypot(dx / rx, dy / ry, dz / rz);
      if (k >= 1) continue;
      if (k < 1e-5) {
        p.x = e.c[0] + rx;
        any = true;
        continue;
      }
      p.x = e.c[0] + dx / k;
      p.y = e.c[1] + dy / k;
      p.z = e.c[2] + dz / k;
      any = true;
    }
    if (!any) break;
    moved = true;
  }
  return moved;
}
