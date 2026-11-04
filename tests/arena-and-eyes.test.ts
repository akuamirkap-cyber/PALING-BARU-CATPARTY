import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Arena, PLANE_SCALE } from '../src/game/Arena';
import { ANIMALS } from '../src/game/animals';
import { animateBlink, buildCharacterVisual, poseStatic } from '../src/game/characterMesh';

// The arena's canvas textures only need a drawing context in these physics tests.
const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };

const deckHeight = (z: number) => {
  const t = Math.min(1, Math.abs(z) / 3.4);
  return 0.08 - 0.64 * t * t * (3 - 2 * t);
};
function createArena() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const broadphase = new CANNON.SAPBroadphase(world);
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  return { world, arena: new Arena(world, new THREE.Scene(), new CANNON.Material('ground')) };
}

test('every intact airplane panel has a matching solid surface', () => {
  const { world, arena } = createArena();
  for (const z of [-7, -5, -3.5, -2, -0.5, 0.5, 2, 3.5, 5, 7]) {
    const hit = new CANNON.RaycastResult();
    world.raycastClosest(new CANNON.Vec3(0.75 * PLANE_SCALE, 5, z * PLANE_SCALE), new CANNON.Vec3(0.75 * PLANE_SCALE, -4, z * PLANE_SCALE), {}, hit);
    assert(hit.hasHit, `missing surface at z=${z}`);
    assert(Math.abs(hit.hitPointWorld.y - deckHeight(z) * PLANE_SCALE) < 0.06 * PLANE_SCALE, `surface mismatch at z=${z}`);
  }
  // The center of the visible belly is also solid from the side.
  const ray = new CANNON.RaycastResult();
  world.raycastClosest(new CANNON.Vec3(0.75 * PLANE_SCALE, -1.5 * PLANE_SCALE, 4 * PLANE_SCALE), new CANNON.Vec3(0.75 * PLANE_SCALE, -1.5 * PLANE_SCALE, 0), {}, ray);
  assert(ray.hasHit && arena.tiles.some(t => t.body === ray.body && ['fuseL', 'wingL-root'].includes(t.name)), 'belly must be solid');
  const nose = arena.tiles.find(t => t.name === 'noseC')!;
  const canopy = new CANNON.RaycastResult();
  world.raycastClosest(new CANNON.Vec3(6.15 * PLANE_SCALE, 3 * PLANE_SCALE, 0), new CANNON.Vec3(6.15 * PLANE_SCALE, 0, 0), {}, canopy);
  assert(canopy.body === nose.body, 'cockpit must belong to the nose section');
  assert(canopy.hitPointWorld.y > 0.7 * PLANE_SCALE, 'cockpit must be solid');
  arena.dispose();
});

test('optimized panels preserve the curved collision surface with a modest shape count', () => {
  const { arena } = createArena();
  const panels = arena.tiles.map(t => t.body);
  assert(panels.reduce((n, b) => n + b.shapes.length, 0) <= 130, 'too many collision shapes');
  for (let z = -7; z <= 7; z += 0.1) {
    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(new CANNON.Vec3(0, 3, z * PLANE_SCALE), new CANNON.Vec3(0, -4, z * PLANE_SCALE));
    ray.mode = CANNON.Ray.CLOSEST;
    ray.intersectBodies(panels, result);
    assert(result.hasHit, `missing panel at z=${z.toFixed(2)}`);
    assert(Math.abs(result.hitPointWorld.y - deckHeight(z) * PLANE_SCALE) < 0.065 * PLANE_SCALE, `height mismatch at z=${z.toFixed(2)}`);
  }
  arena.dispose();
});

test('swept outline agrees with collisions and safe-point navigation', () => {
  const { world, arena } = createArena();
  for (const [x, z] of [[0, 6], [-0.6, 7.35], [6.2, 1], [-6.5, 0.5]]) {
    assert(arena.isSafe(x * PLANE_SCALE, z * PLANE_SCALE, 0), `expected walkable plane at ${x},${z}`);
    const hit = new CANNON.RaycastResult();
    world.raycastClosest(new CANNON.Vec3(x * PLANE_SCALE, 4, z * PLANE_SCALE), new CANNON.Vec3(x * PLANE_SCALE, -4, z * PLANE_SCALE), {}, hit);
    assert(hit.hasHit, `missing outline collision at ${x},${z}`);
  }
  for (const [x, z] of [[2.5, 6], [2, 7.2], [7, 2], [-7.5, 1.5]]) {
    assert(!arena.isSafe(x * PLANE_SCALE, z * PLANE_SCALE, 0), `outside outline should be unsafe at ${x},${z}`);
    const hit = new CANNON.RaycastResult();
    world.raycastClosest(new CANNON.Vec3(x * PLANE_SCALE, 4, z * PLANE_SCALE), new CANNON.Vec3(x * PLANE_SCALE, -4, z * PLANE_SCALE), {}, hit);
    assert(!hit.hasHit, `invisible floor outside outline at ${x},${z}`);
  }
  for (let i = 0; i < 100; i++) {
    const p = arena.randomSafePoint(0.5);
    assert(arena.isSafe(p.x, p.z, 0.5), 'spawn must be on an intact panel');
  }
  arena.dispose();
});

test('fast impacts cannot pass through the fuselage or deck seams', () => {
  const { world, arena } = createArena();
  world.gravity.setZero();
  const side = new CANNON.Body({ mass: 1 });
  side.addShape(new CANNON.Sphere(0.2));
  side.position.set(0.75 * PLANE_SCALE, -1.5 * PLANE_SCALE, 4.5 * PLANE_SCALE);
  side.velocity.set(0, 0, -20);
  world.addBody(side);
  for (let i = 0; i < 72; i++) world.step(1 / 120);
  assert(side.position.z > 2.6 * PLANE_SCALE, `body penetrated the fuselage side: z=${side.position.z}`);
  const downward = new CANNON.Body({ mass: 1 });
  downward.addShape(new CANNON.Sphere(0.2));
  downward.position.set(-0.3 * PLANE_SCALE, 3, 0.65 * PLANE_SCALE); // seam between the center panels
  downward.velocity.set(0, -30, 0);
  world.addBody(downward);
  for (let i = 0; i < 45; i++) world.step(1 / 120);
  assert(downward.position.y > deckHeight(0.65) * PLANE_SCALE, `body fell through a seam: y=${downward.position.y}`);
  arena.dispose();
});

test('objects land on the sloped deck and falling chunks follow their collider', () => {
  const { world, arena } = createArena();
  const sphere = new CANNON.Body({ mass: 1 });
  sphere.addShape(new CANNON.Sphere(0.2));
  sphere.position.set(-1 * PLANE_SCALE, 2, 3.2 * PLANE_SCALE);
  world.addBody(sphere);
  for (let i = 0; i < 360; i++) world.step(1 / 120);
  assert(sphere.position.y > arena.surfaceHeight(sphere.position.z) + 0.08, 'sphere fell through an intact wing');
  const chunk = arena.chunks.find(c => c.tile.name === 'wingL-tip')!;
  arena.dropRing(3);
  for (let i = 0; i < 480 && chunk.tile.state !== 'fall'; i++) {
    world.step(1 / 120);
    arena.update(1 / 120, i / 120);
  }
  assert.equal(chunk.tile.state, 'fall');
  for (let i = 0; i < 30; i++) { world.step(1 / 120); arena.update(1 / 120, i / 120); }
  const expected = chunk.tile.body.pointToWorldFrame(new CANNON.Vec3(0, 0.6 * PLANE_SCALE, 0));
  assert(chunk.mesh.position.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)) < 1e-6);
  assert(Math.abs(chunk.mesh.quaternion.dot(new THREE.Quaternion(chunk.tile.body.quaternion.x, chunk.tile.body.quaternion.y, chunk.tile.body.quaternion.z, chunk.tile.body.quaternion.w))) > 0.9999);
  arena.dispose();
});

test('each cat blinks around its own eyes and menu pupils move', () => {
  for (const animal of ANIMALS) {
    const visual = buildCharacterVisual(animal, 'none');
    assert.equal(visual.eyesNormal.children.length, 2);
    animateBlink(visual, 0.11);
    assert(visual.eyesNormal.children.every(eye => eye.scale.y < 0.1));
    animateBlink(visual, 0.35);
    assert(visual.eyesNormal.children.every(eye => eye.scale.y === 1));
    poseStatic(visual, 0);
    const before = visual.pupils.map(p => p.g.position.clone());
    poseStatic(visual, 1.3);
    assert(visual.pupils.length > 0 && visual.pupils.some((p, i) => p.g.position.distanceTo(before[i]) > 0.001), `${animal.id} pupils did not move`);
  }
});

test('optional eye styles preserve original faces and their animated expressions', () => {
  const signature = (v: ReturnType<typeof buildCharacterVisual>) => {
    const parts: unknown[] = [];
    v.eyesNormal.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        const positions = obj.geometry.getAttribute('position');
        parts.push([(obj.material as THREE.MeshStandardMaterial).color.getHex(), Array.from(positions.array)]);
      }
    });
    return JSON.stringify(parts);
  };
  for (const animal of [ANIMALS[0], ANIMALS[1]]) {
    const original = signature(buildCharacterVisual(animal));
    const options = ['round', 'slit', 'grumpy', 'green', 'goofy'] as const;
    const signatures = new Set<string>();
    for (const style of options) {
      const visual = buildCharacterVisual(animal, 'none', style);
      const sig = signature(visual);
      assert.notEqual(sig, original, `${style} should differ from ${animal.id}'s default`);
      signatures.add(sig);
      assert.equal(visual.eyesNormal.children.length, 2);
      assert.equal(visual.pupils.length, 2);
      assert(visual.eyesKO.children.length > 0 && visual.eyesHurt.children.length > 0);
      animateBlink(visual, 0.11);
      assert(visual.eyesNormal.children.every(eye => eye.scale.y < 0.1));
      animateBlink(visual, 0.35);
      assert(visual.eyesNormal.children.every(eye => eye.scale.y === 1));
      poseStatic(visual, 0);
      const before = visual.pupils.map(p => p.g.position.clone());
      poseStatic(visual, 1.3);
      assert(visual.pupils.some((p, i) => p.g.position.distanceTo(before[i]) > 0.001));
    }
    assert.equal(signatures.size, options.length, 'each eye option should be distinct');
    assert.equal(signature(buildCharacterVisual(animal, 'none', 'default')), original, 'cached cat recipe must not be changed');
  }
});


test('optional expressions mix with eye styles without altering the original face', () => {
  const signature = (object: THREE.Object3D) => {
    const parts: unknown[] = [];
    object.traverse(obj => {
      if (obj instanceof THREE.Mesh) parts.push([(obj.material as THREE.MeshStandardMaterial).color.getHex(), Array.from(obj.geometry.getAttribute('position').array)]);
    });
    return JSON.stringify(parts);
  };
  for (const animal of [ANIMALS[0], ANIMALS[1], ANIMALS[3]]) {
    const original = buildCharacterVisual(animal);
    const mouthDefault = signature(original.mouthN);
    const eyeDefault = signature(original.eyesNormal);
    const frown = buildCharacterVisual(animal, 'none', 'default', 'grumpy');
    const tongue = buildCharacterVisual(animal, 'none', 'default', 'tongue');
    assert.notEqual(signature(frown.mouthN), mouthDefault);
    assert.notEqual(signature(tongue.mouthN), mouthDefault);
    assert.notEqual(signature(frown.mouthN), signature(tongue.mouthN));
    assert.equal(signature(frown.eyesNormal), eyeDefault, 'expression must not change selected eyes');
    const combined = buildCharacterVisual(animal, 'none', 'goofy', 'tongue');
    assert.equal(signature(combined.mouthN), signature(tongue.mouthN));
    assert.notEqual(signature(combined.eyesNormal), eyeDefault);
    assert.equal(signature(buildCharacterVisual(animal).mouthN), mouthDefault, 'default mouth must stay unchanged');
  }
});

test('moving pupils have curved-surface morph targets at every gaze limit', async () => {
  const { setPupilGaze } = await import('../src/game/characterMesh');
  for (const style of ['default', 'round', 'slit', 'grumpy', 'green', 'goofy'] as const) {
    const visual = buildCharacterVisual(ANIMALS[1], 'none', style);
    for (const pupil of visual.pupils) {
      assert(pupil.g.children.length > 0);
      for (const object of pupil.g.children) {
        const mesh = object as THREE.Mesh;
        const targets = mesh.geometry.morphAttributes.position;
        assert.equal(targets.length, 4, `${style} pupil must reproject in all four directions`);
        assert.equal(mesh.geometry.morphTargetsRelative, true);
        assert(targets.every(a => a.count === mesh.geometry.getAttribute('position').count));
        assert(targets.some(a => Array.from(a.array).some(n => Math.abs(n) > 1e-6)), 'curved surface requires actual correction');
      }
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, -0.6]]) {
        setPupilGaze(pupil, x, y);
        assert(Number.isFinite(pupil.g.position.x) && Number.isFinite(pupil.g.position.z));
        for (const obj of pupil.g.children) {
          const weights = (obj as THREE.Mesh).morphTargetInfluences!;
          assert.deepEqual(weights, [Math.max(0, x), Math.max(0, -x), Math.max(0, y), Math.max(0, -y)]);
        }
      }
    }
  }
});

test('rounded airplane shell stays enclosed by collision strips', () => {
  const { arena } = createArena();
  let inspected = 0;
  for (const chunk of arena.chunks) {
    const mesh = chunk.mesh.children[0] as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const body = chunk.tile.body;
    for (let i = 0; i < pos.count; i += 3) {
      const x = pos.getX(i) * PLANE_SCALE, y = (pos.getY(i) + 0.6) * PLANE_SCALE, z = pos.getZ(i) * PLANE_SCALE;
      let distance = Infinity;
      for (let j = 0; j < body.shapes.length; j++) {
        const shape = body.shapes[j];
        if (!(shape instanceof CANNON.Box)) continue;
        const off = body.shapeOffsets[j], half = shape.halfExtents;
        const dx = Math.max(0, Math.abs(x - off.x) - half.x);
        const dy = Math.max(0, Math.abs(y - off.y) - half.y);
        const dz = Math.max(0, Math.abs(z - off.z) - half.z);
        distance = Math.min(distance, Math.hypot(dx, dy, dz));
      }
      assert(distance < 0.065 * PLANE_SCALE, `${chunk.tile.name} shell exceeds its collision enclosure by ${distance}`);
      inspected++;
    }
  }
  assert(inspected > 1000);
  arena.dispose();
});


test('menu arms hang naturally without an automatic wave or exaggerated spread', async () => {
  const { poseStatic } = await import('../src/game/characterMesh');
  const visual = buildCharacterVisual(ANIMALS[1], 'capNewRed');
  let initialLeft = new THREE.Quaternion(), initialRight = new THREE.Quaternion();
  for (const t of [0, 0.4, 1.5, 3, 7, 10]) {
    poseStatic(visual, t);
    const left = new THREE.Vector3(0, -1, 0).applyQuaternion(visual.armL.quaternion);
    const right = new THREE.Vector3(0, -1, 0).applyQuaternion(visual.armR.quaternion);
    assert(left.y < -0.9 && right.y < -0.9, 'arms should point mostly down');
    assert(left.x > 0 && left.x < 0.43 && right.x < 0 && right.x > -0.43, 'arms should be only slightly away from the body');
    if (t === 0) { initialLeft.copy(visual.armL.quaternion); initialRight.copy(visual.armR.quaternion); }
    assert(initialLeft.angleTo(visual.armL.quaternion) < 0.06 && initialRight.angleTo(visual.armR.quaternion) < 0.06, 'idle should not wave or spin');
  }
});

test('plane is enlarged uniformly, including panels and decorative colliders', () => {
  const { arena } = createArena();
  assert.equal(PLANE_SCALE, 1.8);
  const nose = arena.tiles.find(t => t.name === 'noseC')!;
  const chunk = arena.chunks.find(c => c.tile === nose)!;
  assert.equal(nose.baseX, 5.5 * PLANE_SCALE);
  assert.equal(nose.hx, 2 * PLANE_SCALE);
  assert.deepEqual(chunk.mesh.scale.toArray(), [PLANE_SCALE, PLANE_SCALE, PLANE_SCALE]);
  assert.equal(nose.body.position.x, nose.baseX);
  assert(Math.abs(nose.body.position.y + 0.6 * PLANE_SCALE) < 1e-9);
  assert(arena.isSafe(0, 12, 0.5), 'enlarged wing should be playable');
  assert(!arena.isSafe(0, 15, 0), 'area beyond the enlarged outline is unsafe');
  arena.dispose();
});

test('frying pans have plain grey nonstick surfaces and unchanged usable colliders', () => {
  const { arena } = createArena();
  const pans = arena.bats.filter(b => b.kind === 'pan');
  assert.equal(pans.length, 2);
  for (const pan of pans) {
    assert.equal(pan.mesh.children.length, 7, 'no egg or face decoration');
    assert.equal(pan.body.shapes.length, 3, 'pan remains a usable physics weapon');
    for (const object of pan.mesh.children) {
      assert(object instanceof THREE.Mesh);
      const color = (object.material as THREE.MeshStandardMaterial).color;
      assert(Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 0.07, 'pan material should remain neutral grey');
    }
    assert(arena.isSafe(pan.body.position.x, pan.body.position.z), 'pan starts on an intact panel');
  }
  arena.dispose();
});
