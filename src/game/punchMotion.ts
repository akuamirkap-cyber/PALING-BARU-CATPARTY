/** Simulation-time punch phases, shared by the pose and hit window. */
export const PUNCH_DURATION = 0.34;
export const PUNCH_WINDUP = 0.06;
const STRIKE_REACH = 0.11;
const RECOVERY = 0.26;

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Desired paw target in the character's forward/side/up frame, plus torso
 * anticipation and follow-through. All phase boundaries are continuous. */
export function punchPose(elapsed: number) {
  let forward: number, side: number, up: number, lean: number, twist: number, guard: number;
  if (elapsed < PUNCH_WINDUP) {
    const t = smooth(elapsed / PUNCH_WINDUP);
    forward = mix(0.05, -0.12, t); side = mix(0.17, 0.12, t); up = mix(-0.33, 0.16, t);
    lean = mix(0, -0.12, t); twist = mix(0, 0.35, t); guard = t;
  } else if (elapsed < STRIKE_REACH) {
    const t = smooth((elapsed - PUNCH_WINDUP) / (STRIKE_REACH - PUNCH_WINDUP));
    forward = mix(-0.12, 1.12, t); side = mix(0.12, -0.26, t); up = mix(0.16, 0.12, t);
    lean = mix(-0.12, 0.38, t); twist = mix(0.35, -0.5, t); guard = 1;
  } else if (elapsed < RECOVERY) {
    forward = 1.12; side = -0.26; up = 0.12; lean = 0.38; twist = -0.5; guard = 1;
  } else {
    const t = smooth((elapsed - RECOVERY) / (PUNCH_DURATION - RECOVERY));
    forward = mix(1.12, 0.05, t); side = mix(-0.26, 0.17, t); up = mix(0.12, -0.33, t);
    lean = mix(0.38, 0, t); twist = mix(-0.5, 0, t); guard = 1 - t;
  }
  return { forward, side, up, lean, twist, guard };
}
