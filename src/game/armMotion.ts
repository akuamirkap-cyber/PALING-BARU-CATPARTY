import * as CANNON from "cannon-es";

// A ball joint controls position, but it leaves an arm free to spin forever
// about its own axis. Damp that otherwise-uncontrolled twist relative to the
// torso while keeping the arm free to swing, punch, grab, and ragdoll.
const Y = new CANNON.Vec3(0, 1, 0);
const Z = new CANNON.Vec3(0, 0, 1);
const X = new CANNON.Vec3(1, 0, 0);
const axis = new CANNON.Vec3();
const front = new CANNON.Vec3();
const current = new CANNON.Vec3();
const ref = new CANNON.Vec3();
const cross = new CANNON.Vec3();
const rel = new CANNON.Vec3();
const sideX = new CANNON.Vec3();
const fwdZ = new CANNON.Vec3();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * How far the elbow bow leans forward from the pure sideways direction. The
 * menu pose hangs the arm with a slight inward twist (mitten facing forward),
 * so gameplay has to aim at the very same twist: otherwise the baked bow of
 * the arm swings backwards and the identical arm looks stiff in game.
 */
export const ARM_BOW_TWIST = 0.33;

/**
 * Desired world direction of an arm's baked bow (its local +X): straight out
 * to the side of the torso, tilted `twist` radians towards the front.
 * `side` is +1 for the left arm and -1 for the right one.
 */
export function bowTarget(torso: CANNON.Body, twist: number, out: CANNON.Vec3) {
  // Both arm bind frames share +X (the mesh mirrors the geometry, not the
  // frame), so *both* bows point along the torso's +X. Only the forward tilt is
  // mirrored — asking the right arm for -X made the stabiliser fight its own
  // geometry and left that arm rolled tens of degrees away from the menu pose.
  torso.quaternion.vmult(X, sideX);
  torso.quaternion.vmult(Z, fwdZ);
  const c = Math.cos(twist);
  const s = Math.sin(twist);
  out.set(sideX.x * c + fwdZ.x * s, sideX.y * c + fwdZ.y * s, sideX.z * c + fwdZ.z * s);
  out.normalize();
  return out;
}

/**
 * @param bow optional desired world direction for the arm's own bow axis.
 * Without it the arm's front is kept on the torso's front, which is stable for
 * a plush arm but can settle on either of two 180°-apart twists for a shape
 * whose bow carries real geometry.
 */
export function stabilizeArmRotation(arm: CANNON.Body, torso: CANNON.Body, dt: number, bow: CANNON.Vec3 | null = null) {
  arm.quaternion.vmult(Y, axis);
  let goal = 0;
  if (bow) {
    // Deterministic twist: measure the signed angle between the arm's current
    // bow and the requested one, both projected onto the plane the arm can
    // actually spin in.
    arm.quaternion.vmult(X, current);
    const a1 = current.dot(axis);
    current.x -= axis.x * a1;
    current.y -= axis.y * a1;
    current.z -= axis.z * a1;
    const a2 = bow.dot(axis);
    ref.set(bow.x - axis.x * a2, bow.y - axis.y * a2, bow.z - axis.z * a2);
    const len = ref.length();
    const clen = current.length();
    if (len > 0.15 && clen > 0.15) {
      ref.scale(1 / len, ref);
      current.scale(1 / clen, current);
      current.cross(ref, cross);
      const error = Math.atan2(axis.dot(cross), clamp(current.dot(ref), -1, 1));
      goal = clamp(error * 4, -3.2, 3.2);
    }
  } else {
    arm.quaternion.vmult(Z, front);
    torso.quaternion.vmult(Z, ref);
    const projection = ref.dot(axis);
    ref.x -= axis.x * projection;
    ref.y -= axis.y * projection;
    ref.z -= axis.z * projection;
    const len = ref.length();
    if (len > 0.15) {
      ref.scale(1 / len, ref);
      // An arm pointing directly forward has no unique projected reference.
      // Choose the nearest equivalent orientation to avoid a sudden half-turn.
      if (front.dot(ref) < 0) ref.negate(ref);
      front.cross(ref, cross);
      const error = Math.atan2(axis.dot(cross), clamp(front.dot(ref), -1, 1));
      goal = clamp(error * 4, -3.2, 3.2);
    }
  }
  arm.angularVelocity.vsub(torso.angularVelocity, rel);
  const twist = rel.dot(axis);
  const change = (goal - twist) * (1 - Math.exp(-16 * Math.max(0, dt)));
  arm.angularVelocity.x += axis.x * change;
  arm.angularVelocity.y += axis.y * change;
  arm.angularVelocity.z += axis.z * change;
  // A hard relative-speed ceiling also prevents violent impulses from creating
  // multi-revolution spins, without suppressing the torso's own rotation.
  arm.angularVelocity.vsub(torso.angularVelocity, rel);
  const speed = rel.length();
  if (speed > 9) {
    rel.scale(9 / speed, rel);
    torso.angularVelocity.vadd(rel, arm.angularVelocity);
  }
}
