import * as THREE from "three";
/** Shared timing for weapon animation and hit detection (in simulated seconds). */
export const SWING_WINDUP = 0.18;
export const SWING_STRIKE_END = 0.36;
export const SWING_DURATION = 0.64;

const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

/** A readable wind-up, quick horizontal strike, and raised recovery. */
export function weaponSwingPose(kind: 'bat' | 'pan', elapsed: number, overhead = false) {
  const restTh = kind === 'pan' ? 2.1 : 2.45;
  const restEl = kind === 'pan' ? 0.5 : 0.68;
  if (kind === 'bat' && overhead) {
    // A two-handed chop: paws rise to face height with the bat straight up
    // (slightly behind the head), then the whole bat travels down in front of
    // the cat. This keeps the arc in view of the chase camera instead of
    // hiding it behind the body, and the torso bows into the hit.
    const raised = 1.22, top = 0.40, follow = Math.PI + 0.62;
    if (elapsed <= SWING_WINDUP) {
      const u = smooth(elapsed / SWING_WINDUP);
      return { th: restTh + (Math.PI - restTh) * u, el: restEl + (raised - restEl) * u,
        forward: -0.06 * u, lift: top * u, lean: -0.26 * u };
    }
    if (elapsed <= SWING_STRIKE_END) {
      const u = smooth((elapsed - SWING_WINDUP) / (SWING_STRIKE_END - SWING_WINDUP));
      return { th: Math.PI, el: raised + (follow - raised) * u,
        forward: -0.06 + 0.30 * u, lift: top - (top + 0.08) * u, lean: -0.26 + 0.82 * u };
    }
    const u = smooth((elapsed - SWING_STRIKE_END) / (SWING_DURATION - SWING_STRIKE_END));
    return { th: Math.PI + (restTh - Math.PI) * u, el: follow + (restEl - follow) * u,
      forward: 0.24 * (1 - u), lift: -0.08 * (1 - u), lean: 0.56 * (1 - u) };
  }
  if (elapsed <= SWING_WINDUP) {
    const u = smooth(elapsed / SWING_WINDUP);
    return { th: restTh + (2.8 - restTh) * u, el: restEl + (0.72 - restEl) * u, forward: 0, lift: 0, lean: 0.15 };
  }
  if (elapsed <= SWING_STRIKE_END) {
    const u = smooth((elapsed - SWING_WINDUP) / (SWING_STRIKE_END - SWING_WINDUP));
    return { th: 2.8 - 4.6 * u, el: 0.2 + 0.52 * (2 * u - 1) ** 2, forward: 0.10 * Math.sin(Math.PI * u), lift: 0, lean: 0.15 };
  }
  const u = smooth((elapsed - SWING_STRIKE_END) / (SWING_DURATION - SWING_STRIKE_END));
  return { th: -1.8 + (restTh + 1.8) * u, el: 0.72 + (restEl - 0.72) * u + 0.45 * Math.sin(Math.PI * u), forward: 0, lift: 0, lean: 0.15 };
}

/** Squared distance to a finite 3D segment; safe for a stationary weapon. */
export function segmentDistanceSquared(p: {x: number; y: number; z: number}, a: {x: number; y: number; z: number}, b: {x: number; y: number; z: number}) {
  const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
  const length2 = x * x + y * y + z * z;
  const t = length2 > 1e-10 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / length2)) : 0;
  return (a.x + x * t - p.x) ** 2 + (a.y + y * t - p.y) ** 2 + (a.z + z * t - p.z) ** 2;
}

/** Distance to the swept surface of a moving finite shaft during one fixed step.
 * Two triangles fill the area between previous and current poses, avoiding
 * gaps between a handful of sampled trajectories on fast swings. */
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _triangle = new THREE.Triangle();
export function sweptSegmentDistanceSquared(
  p: {x: number; y: number; z: number},
  previousA: {x: number; y: number; z: number}, previousB: {x: number; y: number; z: number},
  currentA: {x: number; y: number; z: number}, currentB: {x: number; y: number; z: number},
) {
  let distance = Math.min(segmentDistanceSquared(p, previousA, previousB), segmentDistanceSquared(p, currentA, currentB),
    segmentDistanceSquared(p, previousA, currentA), segmentDistanceSquared(p, previousB, currentB));
  _p.set(p.x, p.y, p.z);
  _a.set(previousA.x, previousA.y, previousA.z);
  _b.set(previousB.x, previousB.y, previousB.z);
  _c.set(currentA.x, currentA.y, currentA.z);
  _d.set(currentB.x, currentB.y, currentB.z);
  // Degenerate triangles are handled by the edge distances above.
  _triangle.set(_a, _b, _c);
  if (_triangle.getArea() >= 1e-10) {
    _triangle.closestPointToPoint(_p, _closest);
    distance = Math.min(distance, _closest.distanceToSquared(_p));
  }
  _triangle.set(_b, _d, _c);
  if (_triangle.getArea() >= 1e-10) {
    _triangle.closestPointToPoint(_p, _closest);
    distance = Math.min(distance, _closest.distanceToSquared(_p));
  }
  return distance;
}
