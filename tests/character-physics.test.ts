import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Character, bodyOwner, type Bat } from '../src/game/Character';
import { ANIMALS } from '../src/game/animals';
import { emptyControl } from '../src/game/input';
import { SWING_DURATION, SWING_WINDUP, SWING_STRIKE_END, segmentDistanceSquared, sweptSegmentDistanceSquared, weaponSwingPose } from '../src/game/weaponMotion';

const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };
const H = 1 / 120;
function setup() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const broadphase = new CANNON.SAPBroadphase(world);
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  (world.solver as CANNON.GSSolver).iterations = 10;
  const floor = new CANNON.Body({ mass: 0 });
  floor.addShape(new CANNON.Box(new CANNON.Vec3(100, 1, 100)));
  floor.position.y = -1;
  world.addBody(floor);
  const hits: string[] = [];
  const hooks = { onHit: (_a: Character, _v: Character, _p: CANNON.Vec3, _d: number, kind: string) => hits.push(kind), onKO() {}, onLand() {}, onStep() {} };
  const make = (index: number, x: number, z: number) => new Character(world, index, ANIMALS[0], 'Cat', index ? 0 : 1, hooks, new THREE.Vector3(x, 0.05, z), 0, emptyControl());
  Character.all = [];
  Character.bats = [];
  Character.thrownProps = [];
  return { world, floor, hits, make };
}
function step(world: CANNON.World, chars: Character[], i: number) {
  if (i % 2 === 0) for (const c of chars) c.frameActions(1 / 60);
  for (const c of chars) c.physicsStep(H);
  world.step(H);
  for (const c of chars) c.updateHolds(H);
}
function makeWeapon(world: CANNON.World, kind: 'bat' | 'pan'): Bat {
  const body = new CANNON.Body({ mass: 1 });
  body.addShape(new CANNON.Sphere(0.1));
  world.addBody(body);
  return { kind, body, mesh: new THREE.Group(), centerOffset: kind === 'bat' ? 0.67 : 0.65, reach: kind === 'bat' ? 1.47 : 1.52,
    impactOffset: kind === 'bat' ? 1.2 : 1.09, holder: null, thrower: null, flyT: 0, hit: new Set() };
}

test('idle, running and KO recovery stay connected and do not launch the ragdoll', () => {
  const { world, make } = setup();
  const c = make(0, 4, 4);
  Character.all = [c];
  let maxSpeed = 0, maxJointError = 0, maxHeight = 0;
  for (let i = 0; i < 850; i++) {
    if (i === 240) { c.input.mx = 1; c.input.run = true; }
    if (i === 480) c.input.mx = 0;
    if (i === 560) c.knockOut(1.2);
    step(world, [c], i);
    maxSpeed = Math.max(maxSpeed, ...c.parts.map(part => part.velocity.length()));
    maxHeight = Math.max(maxHeight, c.position.y);
    for (const joint of c.joints) {
      const j = joint as CANNON.PointToPointConstraint;
      const error = j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB));
      maxJointError = Math.max(maxJointError, error);
    }
  }
  assert(c.grounded && !c.ko, 'cat should recover and stand on the floor');
  assert(maxHeight < 1.7, `cat was launched upward: ${maxHeight}`);
  assert(maxSpeed < 16, `ragdoll accelerated unexpectedly: ${maxSpeed}`);
  assert(maxJointError < 0.18, `ragdoll joints stretched apart: ${maxJointError}`);
  assert(c.position.x > 10, 'running should still move the character');
  c.removeFromWorld();
});

for (const kind of ['bat', 'pan'] as const) {
  test(`${kind}: grip initializes locally and a swing hits only once`, () => {
    const { world, make, hits } = setup();
    const attacker = make(0, 4, 4), victim = make(1, 4, 5.3), far = make(2, 4, 10);
    const chars = [attacker, victim, far];
    Character.all = chars;
    for (let i = 0; i < 180; i++) step(world, chars, i);
    const weapon = makeWeapon(world, kind);
    Character.bats = [weapon];
    attacker.equip(weapon);
    assert(attacker.batGrip.distanceTo(attacker.position) < 1, 'grip must not start at world origin');
    assert(attacker.batTipVel.length() < 0.001, 'equip must not create a false high-speed swing');
    attacker.input.punch = true;
    attacker.frameActions(1 / 60);
    attacker.input.punch = false;
    const timer = attacker.swingTimer;
    // Paused simulation or hit-stop must not skip the active hit window.
    for (let i = 0; i < 30; i++) attacker.frameActions(1 / 60);
    assert.equal(attacker.swingTimer, timer);
    let maxSpeed = 0;
    for (let i = 0; i < 120; i++) {
      step(world, chars, i);
      maxSpeed = Math.max(maxSpeed, ...attacker.parts.map(p => p.velocity.length()));
    }
    assert.deepEqual(hits, [kind]);
    assert(victim.dizzy > 0, 'near target should take damage');
    assert.equal(far.dizzy, 0, 'distant target should not take damage');
    assert(maxSpeed < 15, `equipping/swinging launched the attacker: ${maxSpeed}`);
    assert.equal(attacker.swingTimer, 0);
    for (const c of chars) c.removeFromWorld();
  });
}

test('weapon phases are continuous and the swept-distance helper catches moving hits', () => {
  for (const kind of ['bat', 'pan'] as const) {
    for (const time of [SWING_WINDUP, SWING_STRIKE_END, SWING_DURATION]) {
      const a = weaponSwingPose(kind, time - 1e-6), b = weaponSwingPose(kind, time + 1e-6);
      assert(Math.abs(a.th - b.th) < 0.001 && Math.abs(a.el - b.el) < 0.001, `pose jumps at ${time}`);
    }
  }
  assert.equal(segmentDistanceSquared({x: 0, y: 0, z: 0}, {x: -1, y: 0, z: 0}, {x: 1, y: 0, z: 0}), 0);
  assert.equal(segmentDistanceSquared({x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0}), 1);
});

test('ledge search uses compound shape offsets and rotations', () => {
  const { world, floor, make } = setup();
  world.removeBody(floor);
  const edge = new CANNON.Body({ mass: 0 });
  const angle = new CANNON.Quaternion();
  angle.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
  edge.addShape(new CANNON.Box(new CANNON.Vec3(2, 0.5, 1)), new CANNON.Vec3(10, 0, 0), angle);
  world.addBody(edge);
  const c = make(0, 11.4, 0);
  c.torso.position.y = -0.4;
  const point = (c as unknown as { findLedge(): CANNON.Vec3 | null }).findLedge();
  assert(point && c.ledgeBody === edge, 'offset compound ledge should be found');
  assert(Math.abs(point.y - 0.5) < 1e-6);
  assert(Math.abs(point.x - 11) < 1e-6, `wrong rotated edge: ${point.x}`);
  c.removeFromWorld();
});

test('carrying a knocked-out cat keeps the ragdoll together and releases into a throw', () => {
  const { world, make } = setup();
  const carrier = make(0, 4, 4), passenger = make(1, 4, 5.15);
  const chars = [carrier, passenger];
  Character.all = chars;
  for (let i = 0; i < 180; i++) step(world, chars, i);
  passenger.knockOut(4);
  carrier.tryLift();
  assert(carrier.lifting && carrier.holding, 'nearby KO cat should be lifted');
  let maxSpeed = 0, maxJointError = 0;
  for (let i = 0; i < 240; i++) {
    if (i % 2 === 0) {
      passenger.heldBy = 0; passenger.carriedBy = null;
      for (const h of [carrier.holds.armL, carrier.holds.armR]) {
        if (!h?.owner) continue;
        h.owner.heldBy++;
        if (carrier.lifting && h.carry) h.owner.carriedBy = carrier;
      }
      passenger.updateCollisionMask();
    }
    step(world, chars, i);
    maxSpeed = Math.max(maxSpeed, ...chars.flatMap(c => c.parts.map(p => p.velocity.length())));
    for (const c of chars) for (const joint of c.joints) {
      const j = joint as CANNON.PointToPointConstraint;
      maxJointError = Math.max(maxJointError, j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB)));
    }
  }
  assert.equal(passenger.carriedBy, carrier, 'KO passenger should not collide with carrier');
  assert(passenger.position.y > carrier.position.y + 0.5, 'passenger should rise above the carrier');
  assert(maxSpeed < 15 && maxJointError < 0.2, `unstable carry: speed ${maxSpeed}, joint error ${maxJointError}`);
  carrier.releaseAll(true);
  assert(passenger.thrownT > 0 && passenger.torso.velocity.z > 5, 'throw should release the passenger forward');
  for (const c of chars) c.removeFromWorld();
});

test('a moving weapon only strikes a physics prop once per swing', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4);
  Character.all = [attacker];
  for (let i = 0; i < 120; i++) step(world, [attacker], i);
  const weapon = makeWeapon(world, 'bat');
  Character.bats = [weapon];
  attacker.equip(weapon);
  const prop = new CANNON.Body({ mass: 1 });
  prop.addShape(new CANNON.Sphere(0.25));
  prop.position.set(4, 1.1, 5.4);
  world.addBody(prop);
  attacker.input.punch = true;
  attacker.frameActions(1 / 60);
  attacker.input.punch = false;
  for (let i = 0; i < 80; i++) step(world, [attacker], i);
  assert.equal(Character.thrownProps.filter(p => p.body === prop).length, 1);
  attacker.removeFromWorld();
});


test('selected facial style returns after hurt and KO expressions', () => {
  const { world } = setup();
  const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
  const c = new Character(world, 0, ANIMALS[0], 'Cat', 1, hooks, new THREE.Vector3(4, 0.05, 4), 0, emptyControl(), 'none', 'goofy', 'tongue');
  assert(c.visual.mouthN.children.length > 0);
  c.hurtT = 1;
  c.updateExpr();
  assert(c.visual.eyesHurt.visible && c.visual.mouthCry.visible && !c.visual.mouthN.visible);
  c.hurtT = 0;
  c.koTimer = 1;
  c.updateExpr();
  assert(c.visual.eyesKO.visible && c.visual.mouthWavy.visible && !c.visual.mouthN.visible);
  c.koTimer = 0;
  c.updateExpr();
  assert(c.visual.eyesNormal.visible && c.visual.mouthN.visible && !c.visual.mouthWavy.visible);
  c.removeFromWorld();
});

test('visual arm pinning corrects a paw aimed through the torso without detaching the shoulder', async () => {
  const rig = await import('../src/game/rig');
  const { make } = setup();
  const c = make(0, 4, 4);
  c.armL.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -0.85);
  const before = new THREE.Quaternion(c.armL.quaternion.x, c.armL.quaternion.y, c.armL.quaternion.z, c.armL.quaternion.w);
  c.syncVisual();
  const after = c.visual.armL.quaternion;
  assert(before.angleTo(after) > 0.02, 'arm should rotate away from torso penetration');
  const socket = c.torso.pointToWorldFrame(new CANNON.Vec3(...rig.SHOULDER_L));
  const actual = new THREE.Vector3(...rig.LIMB_TOP).applyQuaternion(after).add(c.visual.armL.position);
  assert(actual.distanceTo(new THREE.Vector3(socket.x, socket.y, socket.z)) < 1e-5, 'shoulder must remain attached');
  c.removeFromWorld();
});

test('arm twist stays controlled during idle, running, attacks and recovery', () => {
  const { world, make } = setup();
  const c = make(0, 4, 4);
  Character.all = [c];
  const axis = new CANNON.Vec3(), relative = new CANNON.Vec3();
  let lateIdleTwist = 0, maxRelativeSpeed = 0, maxJointError = 0;
  for (let i = 0; i < 3000; i++) {
    if (i === 1800) { c.input.mx = 1; c.input.run = true; }
    if (i === 2160) { c.input.mx = 0; c.input.run = false; c.input.punch = true; }
    if (i === 2162) c.input.punch = false;
    if (i === 2400) c.knockOut(1.2);
    step(world, [c], i);
    for (const arm of [c.armL, c.armR]) {
      arm.quaternion.vmult(new CANNON.Vec3(0, 1, 0), axis);
      arm.angularVelocity.vsub(c.torso.angularVelocity, relative);
      maxRelativeSpeed = Math.max(maxRelativeSpeed, relative.length());
      if (i > 480 && i < 1800) lateIdleTwist += Math.abs(relative.dot(axis)) * H;
    }
    for (const j of c.joints) {
      const joint = j as CANNON.PointToPointConstraint;
      const err = joint.bodyA.pointToWorldFrame(joint.pivotA).distanceTo(joint.bodyB.pointToWorldFrame(joint.pivotB));
      maxJointError = Math.max(maxJointError, err);
    }
  }
  assert(lateIdleTwist < 3, `arms keep twisting on their own during idle: ${lateIdleTwist}`);
  assert(maxRelativeSpeed <= 12.001, `uncontrolled angular speed: ${maxRelativeSpeed}`);
  assert(maxJointError < 0.2, `ragdoll joints separated: ${maxJointError}`);
  assert(c.grounded && !c.ko);
  c.removeFromWorld();
});

test('figurine mode remains stable through running, attacks and KO recovery', async () => {
  const tuning = await import('../src/game/tuning');
  const mode = tuning.getShapeMode();
  try {
    tuning.setShapeMode('figure');
    const { world, make } = setup();
    const c = make(0, 4, 4);
    Character.all = [c];
    let maxJointError = 0, maxSpeed = 0;
    for (let i = 0; i < 1100; i++) {
      if (i === 240) { c.input.mx = 1; c.input.run = true; }
      if (i === 540) { c.input.mx = 0; c.input.run = false; c.input.punch = true; }
      if (i === 542) c.input.punch = false;
      if (i === 720) c.knockOut(1.2);
      step(world, [c], i);
      maxSpeed = Math.max(maxSpeed, ...c.parts.map(part => part.velocity.length()));
      for (const j of c.joints) {
        const joint = j as CANNON.PointToPointConstraint;
        maxJointError = Math.max(maxJointError, joint.bodyA.pointToWorldFrame(joint.pivotA).distanceTo(joint.bodyB.pointToWorldFrame(joint.pivotB)));
      }
    }
    assert(c.grounded && !c.ko, 'figurine should recover and stand');
    assert(maxSpeed < 16, `figurine was launched: ${maxSpeed}`);
    assert(maxJointError < 0.2, `figurine joints stretched: ${maxJointError}`);
    assert(c.position.x > 8, 'figurine can run');
    c.removeFromWorld();
  } finally {
    tuning.setShapeMode(mode);
  }
});

test('characters can stand on the enlarged airplane fuselage and wing', async () => {
  const { Arena } = await import('../src/game/Arena');
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const broadphase = new CANNON.SAPBroadphase(world);
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  (world.solver as CANNON.GSSolver).iterations = 10;
  const arena = new Arena(world, new THREE.Scene(), new CANNON.Material('ground'));
  const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
  const chars = [[-1.2, 0], [0.5, 6.5]].map(([x, z], i) =>
    new Character(world, i, ANIMALS[i], 'Cat', i === 0 ? 1 : 0, hooks,
      new THREE.Vector3(x, arena.surfaceHeight(z) + 0.05, z), 0, emptyControl()));
  Character.all = chars;
  Character.bats = arena.bats;
  for (let i = 0; i < 400; i++) step(world, chars, i);
  for (const c of chars) {
    assert(c.grounded && c.alive, 'cat should remain standing on the enlarged plane');
    assert(c.position.y > arena.surfaceHeight(c.position.z), 'cat must not fall through the deck');
    c.removeFromWorld();
  }
  arena.dispose();
});

test('seagull sweeps in from camera right, hits once and knocks cats into bounded ragdoll', async () => {
  const { Seagull } = await import('../src/game/Seagull');
  const { world, make } = setup();
  const cat = make(0, 4, 4), far = make(1, 4, 8);
  const chars = [cat, far];
  Character.all = chars;
  for (let i = 0; i < 180; i++) step(world, chars, i);
  let impacts = 0, approaches = 0, koAtHit = false;
  const scene = new THREE.Scene();
  const bird = new Seagull(scene, () => 0, victim => {
    impacts++;
    koAtHit = victim.ko;
  }, () => approaches++);
  const x = cat.position.x, z = cat.position.z;
  bird.launch(x, z);
  assert(bird.root.position.x > x, 'bird should enter from the right');
  assert.equal(approaches, 1);
  let firstImpactX = 0;
  for (let i = 0; i < 450; i++) {
    bird.update(H, chars, true);
    if (impacts && !firstImpactX) firstImpactX = cat.position.x;
    step(world, chars, i);
  }
  assert.equal(impacts, 1, 'one pass must hit each cat only once');
  assert(koAtHit, 'hit cat must become a ragdoll');
  assert.equal(cat.lastHitBy, null, 'environmental collision must not credit a player');
  assert.equal(cat.lastHitKind, 'seagull');
  assert(cat.position.x < firstImpactX - 0.5, 'hit cat should be launched in flight direction');
  assert(far.position.x > 3, 'a cat outside the flight lane must not be hit');
  assert(!bird.active && !bird.root.visible, 'bird should leave after a pass');
  bird.launch(cat.position.x, cat.position.z, Math.PI / 2);
  assert(bird.root.position.z > cat.position.z, 'incoming side follows camera right');
  bird.update(H, chars, false);
  assert(!bird.active && !bird.root.visible, 'bird should stop outside an active round');
  bird.dispose();
  assert.equal(scene.children.length, 0, 'round cleanup removes the bird');
  chars.forEach(c => c.removeFromWorld());
});

test('batched cap detaches as one object and restores the uncovered ears', () => {
  const { world } = setup();
  const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
  const cat = new Character(world, 0, ANIMALS[0], 'Cat', 1, hooks, new THREE.Vector3(0, 0.05, 0), 0, emptyControl(), 'capNewRed');
  const scene = new THREE.Scene();
  scene.add(cat.root);
  Character.loose = [];
  const cap = cat.visual.accessory;
  const uncovered = cat.visual.uncoveredGeometry;
  cat.knockAccessory(new CANNON.Vec3(1, 0, 0));
  assert.equal(cat.visual.accessory, null);
  assert.equal(cat.visual.mesh.geometry, uncovered);
  assert.equal(Character.loose.length, 1);
  assert.equal(cap?.parent, Character.loose[0].mesh);
  cat.removeFromWorld();
  Character.loose = [];
});

/** Exercise the same post-step contacts used by Game, not just direct callbacks. */
function stepCombat(world: CANNON.World, chars: Character[], i: number) {
  if (i % 2 === 0) for (const c of chars) c.frameActions(1 / 60);
  for (const c of chars) c.physicsStep(H);
  world.step(H);
  for (const contact of world.contacts) {
    const a = bodyOwner.get(contact.bi), b = bodyOwner.get(contact.bj);
    if (a) a.char.onContact(a.part, contact.bj, contact.bi.position.vadd(contact.ri), b);
    if (b) b.char.onContact(b.part, contact.bi, contact.bj.position.vadd(contact.rj), a);
  }
  for (const c of chars) c.updateHolds(H);
}

test('a fist connects once during its active motion, not through the back', () => {
  const { world, make, hits } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 5.15), behind = make(2, 4, 2.75);
  const chars = [attacker, target, behind];
  Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  attacker.input.punch = true;
  attacker.frameActions(1 / 60);
  attacker.input.punch = false;
  let maxSpeed = 0;
  for (let i = 0; i < 120; i++) {
    stepCombat(world, chars, i);
    maxSpeed = Math.max(maxSpeed, ...chars.flatMap(c => c.parts.map(p => p.velocity.length())));
  }
  assert.deepEqual(hits, ['punch']);
  assert(target.dizzy > 0 && behind.dizzy === 0, `damage: front=${target.dizzy}, behind=${behind.dizzy}`);
  assert(maxSpeed < 18, `punch must not launch the ragdoll: ${maxSpeed}`);
  chars.forEach(c => c.removeFromWorld());
});

test('L launches a grounded cat forward and upward and tackles once', () => {
  const { world, make, hits } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 6.6), behind = make(2, 4, 2.8);
  const chars = [attacker, target, behind];
  Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  assert(attacker.grounded);
  const startY = attacker.torso.position.y, startZ = attacker.torso.position.z;
  attacker.input.headbutt = true;
  attacker.frameActions(1 / 60);
  attacker.input.headbutt = false;
  assert(attacker.dropkickTimer > 0 && attacker.torso.velocity.y > 5 && attacker.torso.velocity.z > 6);
  let peakY = startY, maxJointError = 0, maxSpeed = 0;
  for (let i = 0; i < 240; i++) {
    stepCombat(world, chars, i);
    peakY = Math.max(peakY, attacker.torso.position.y);
    maxSpeed = Math.max(maxSpeed, ...chars.flatMap(c => c.parts.map(p => p.velocity.length())));
    for (const joint of attacker.joints) {
      const j = joint as CANNON.PointToPointConstraint;
      maxJointError = Math.max(maxJointError, j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB)));
    }
  }
  assert(peakY > startY + 0.25, `tackle should visibly jump: ${peakY - startY}`);
  assert(attacker.position.z > startZ + 0.5, 'tackle should travel forward');
  assert.deepEqual(hits, ['dropkick']);
  assert(target.dizzy > 0 && behind.dizzy === 0, 'only the cat in front should be hit');
  assert(maxJointError < 0.3, `tackle must keep joints together: ${maxJointError}`);
  assert(maxSpeed < 20, `tackle must not explode: ${maxSpeed}`);
  chars.forEach(c => c.removeFromWorld());
});

test('tackle direction follows movement, cannot spam or attack while knocked out', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4);
  Character.all = [attacker];
  for (let i = 0; i < 160; i++) stepCombat(world, [attacker], i);
  attacker.input.mx = 1;
  attacker.input.headbutt = true;
  attacker.frameActions(1 / 60);
  assert(attacker.torso.velocity.x > 6 && Math.abs(attacker.torso.velocity.z) < 1);
  const velocity = attacker.torso.velocity.x;
  attacker.frameActions(1 / 60);
  assert(Math.abs(attacker.torso.velocity.x - velocity) < 0.001, 'cooldown should prevent repeated launch');
  attacker.knockOut(1);
  assert.equal(attacker.dropkickTimer, 0, 'KO cancels the tackle immediately');
  attacker.frameActions(1 / 60);
  assert.equal(attacker.dropkickTimer, 0);
  attacker.removeFromWorld();
});

test('weapon sweep covers the whole moving shaft and rejects distant points', () => {
  const a = {x: 0, y: 0, z: 0}, b = {x: 0, y: 0, z: 1};
  const c = {x: 1, y: 0, z: 0}, d = {x: 1, y: 0, z: 1};
  assert(sweptSegmentDistanceSquared({x: 0.3, y: 0, z: 0.25}, a, b, c, d) < 1e-10);
  assert(Math.abs(sweptSegmentDistanceSquared({x: 0.3, y: 1, z: 0.25}, a, b, c, d) - 1) < 1e-10);
  assert(Number.isFinite(sweptSegmentDistanceSquared({x: 2, y: 0, z: 0}, a, a, a, a)));
});

test('solid scenery blocks the melee hit path', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 5.5);
  Character.all = [attacker, target];
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 0.1)));
  wall.position.set(4, 1, 4.75);
  world.addBody(wall);
  const from = new CANNON.Vec3(4, 1, 4.35), to = new CANNON.Vec3(4, 1, 5.15);
  const clear = (attacker as unknown as { meleePathClear(a: CANNON.Vec3, b: CANNON.Vec3, target: Character): boolean }).meleePathClear.bind(attacker);
  assert(!clear(from, to, target), 'wall should stop a fist or weapon');
  world.removeBody(wall);
  assert(clear(from, to, target), 'removing the wall restores the attack path');
  attacker.removeFromWorld(); target.removeFromWorld();
});

test('airborne L redirects into a controlled tackle instead of requiring a landing', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4);
  Character.all = [attacker];
  for (let i = 0; i < 180; i++) stepCombat(world, [attacker], i);
  attacker.input.jump = true;
  attacker.frameActions(1 / 60);
  attacker.input.jump = false;
  for (let i = 0; i < 28; i++) stepCombat(world, [attacker], i);
  assert(!attacker.grounded);
  attacker.input.headbutt = true;
  attacker.frameActions(1 / 60);
  attacker.input.headbutt = false;
  assert(attacker.dropkickTimer > 0 && attacker.torso.velocity.z > 6);
  for (let i = 0; i < 240; i++) stepCombat(world, [attacker], i);
  assert(attacker.grounded && !attacker.ko, 'cat lands and recovers from the tackle');
  attacker.removeFromWorld();
});

test('a bat swing does not hit during wind-up and cannot damage through a wall', () => {
  const { world, make, hits } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 5.3);
  const chars = [attacker, target];
  Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 0.06)));
  wall.position.set(4, 1, 4.75);
  world.addBody(wall);
  const weapon = makeWeapon(world, 'bat');
  Character.bats = [weapon];
  attacker.equip(weapon);
  attacker.input.punch = true;
  attacker.frameActions(1 / 60);
  attacker.input.punch = false;
  for (let i = 0; i < 18; i++) stepCombat(world, chars, i);
  assert.deepEqual(hits, [], 'wind-up should not do damage');
  for (let i = 18; i < 100; i++) stepCombat(world, chars, i);
  assert.deepEqual(hits, [], 'solid wall must block the weapon');
  assert.equal(target.dizzy, 0);
  chars.forEach(c => c.removeFromWorld());
});

test('tackles land on the airplane without tunnelling in either body mode', async () => {
  const { Arena } = await import('../src/game/Arena');
  const tuning = await import('../src/game/tuning');
  const previous = tuning.getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) {
      tuning.setShapeMode(mode);
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
      const broadphase = new CANNON.SAPBroadphase(world);
      broadphase.useBoundingBoxes = true;
      world.broadphase = broadphase;
      (world.solver as CANNON.GSSolver).iterations = 10;
      const arena = new Arena(world, new THREE.Scene(), new CANNON.Material('ground'));
      const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
      const cat = new Character(world, 0, ANIMALS[0], 'Cat', 1, hooks, new THREE.Vector3(0, arena.surfaceHeight(0) + 0.05, 0), 0, emptyControl());
      Character.all = [cat];
      Character.bats = arena.bats;
      for (let i = 0; i < 180; i++) stepCombat(world, [cat], i);
      cat.input.headbutt = true;
      cat.frameActions(1 / 60);
      cat.input.headbutt = false;
      let lowest = Infinity;
      for (let i = 0; i < 260; i++) {
        stepCombat(world, [cat], i);
        lowest = Math.min(lowest, cat.torso.position.y - arena.surfaceHeight(cat.torso.position.z));
      }
      assert(lowest > 0, `${mode} torso penetrated the airplane: ${lowest}`);
      assert(cat.grounded && cat.alive, `${mode} cat should land safely`);
      cat.removeFromWorld(); arena.dispose();
    }
  } finally { tuning.setShapeMode(previous); }
});

test('a bat knockout records its source before the KO effect is emitted', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4), victim = make(1, 4, 5);
  let kindAtKO = '';
  victim.hooks.onKO = cat => { kindAtKO = cat.lastHitKind; };
  victim.dizzy = 99;
  victim.receiveHit(attacker, 34, new CANNON.Vec3(0, 0, 1), 7, victim.torso, victim.torso.position.clone(), 'bat');
  assert(victim.ko);
  assert.equal(kindAtKO, 'bat');
  attacker.removeFromWorld(); victim.removeFromWorld();
});

test('punch and bat produce a clear, bounded shove away from the attacker in both body modes', async () => {
  const tuning = await import('../src/game/tuning');
  const previous = tuning.getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) {
      tuning.setShapeMode(mode);
      for (const kind of ['punch', 'bat'] as const) {
        const { world, make } = setup();
        const attacker = make(0, 4, 4), victim = make(1, 4, kind === 'punch' ? 5.15 : 5.3);
        const chars = [attacker, victim];
        Character.all = chars;
        for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
        if (kind === 'bat') {
          const weapon = makeWeapon(world, 'bat');
          Character.bats = [weapon];
          attacker.equip(weapon);
        }
        let hitZ: number | null = null, hits = 0, damage = 0, maxSpeed = 0, maxJointError = 0, zAfter = 0, elapsed = 0;
        attacker.hooks.onHit = (_a, v, _p, dmg) => { hits++; hitZ = v.position.z; damage = dmg; };
        attacker.input.punch = true;
        attacker.frameActions(1 / 60);
        attacker.input.punch = false;
        for (let i = 0; i < 130; i++) {
          stepCombat(world, chars, i);
          if (hitZ === null) continue;
          elapsed += H;
          if (elapsed <= 0.6 + H) zAfter = victim.position.z;
          maxSpeed = Math.max(maxSpeed, ...victim.parts.map(p => p.velocity.length()));
          for (const joint of victim.joints) {
            const j = joint as CANNON.PointToPointConstraint;
            maxJointError = Math.max(maxJointError, j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB)));
          }
        }
        assert.equal(hits, 1, `${mode} ${kind} must hit exactly once`);
        assert(hitZ !== null && zAfter - hitZ > (kind === 'bat' ? 0.9 : 1.0), `${mode} ${kind} should visibly push the victim away`);
        assert(damage >= (kind === 'bat' ? 38 : 22), `${kind} should deal meaningful damage`);
        assert(maxSpeed < 14 && maxJointError < 0.2, `${mode} ${kind} must not explode or tear apart: speed ${maxSpeed}, joint ${maxJointError}`);
        assert.equal(victim.lastHitBy, attacker);
        chars.forEach(c => c.removeFromWorld());
      }
    }
  } finally { tuning.setShapeMode(previous); }
});

test('repeated melee impulses are capped without erasing existing fall speed', () => {
  const { make } = setup();
  const attacker = make(0, 4, 4), victim = make(1, 4, 5);
  victim.torso.velocity.y = -9;
  for (let i = 0; i < 12; i++) {
    victim.receiveHit(attacker, 0, new CANNON.Vec3(0, 0, 1), 12.5, victim.torso, victim.torso.position.clone(), 'bat');
  }
  assert(victim.torso.velocity.z <= 8.001, `stacked melee should not create runaway speed: ${victim.torso.velocity.z}`);
  assert(victim.torso.velocity.y <= 5.001, `stacked melee should not launch vertically: ${victim.torso.velocity.y}`);
  const falling = make(2, 8, 8);
  falling.torso.velocity.y = -9;
  falling.receiveHit(attacker, 0, new CANNON.Vec3(0, 0, 1), 8, falling.torso, falling.torso.position.clone(), 'punch');
  assert(falling.torso.velocity.y < -7, 'a hit must not cancel natural falling speed');
  attacker.removeFromWorld(); victim.removeFromWorld(); falling.removeFromWorld();
});

test('stronger bat knockback stays above the solid airplane deck', async () => {
  const { Arena } = await import('../src/game/Arena');
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const broadphase = new CANNON.SAPBroadphase(world);
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  (world.solver as CANNON.GSSolver).iterations = 10;
  const arena = new Arena(world, new THREE.Scene(), new CANNON.Material('ground'));
  const hits: string[] = [];
  const hooks = { onHit(_a: Character, _v: Character, _p: CANNON.Vec3, _d: number, kind: string) { hits.push(kind); }, onKO() {}, onLand() {}, onStep() {} };
  const attacker = new Character(world, 0, ANIMALS[0], 'A', 1, hooks, new THREE.Vector3(0, arena.surfaceHeight(0) + 0.05, 0), 0, emptyControl());
  const victim = new Character(world, 1, ANIMALS[1], 'B', 0, hooks, new THREE.Vector3(0, arena.surfaceHeight(1.3) + 0.05, 1.3), 0, emptyControl());
  const chars = [attacker, victim];
  Character.all = chars;
  Character.bats = [];
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const weapon = makeWeapon(world, 'bat');
  Character.bats = [weapon];
  attacker.equip(weapon);
  attacker.input.punch = true;
  attacker.frameActions(1 / 60);
  attacker.input.punch = false;
  let clearance = Infinity;
  for (let i = 0; i < 180; i++) {
    stepCombat(world, chars, i);
    clearance = Math.min(clearance, victim.torso.position.y - arena.surfaceHeight(victim.torso.position.z));
  }
  assert.deepEqual(hits, ['bat']);
  assert(clearance > 0, `knockback should not drive the torso through the airplane: ${clearance}`);
  assert(victim.grounded && victim.alive, 'victim should land and recover');
  chars.forEach(c => c.removeFromWorld());
  arena.dispose();
});

test('helmet protection still reduces headshot damage and knockback', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4), bare = make(1, 4, 6);
  const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
  const helmet = new Character(world, 2, ANIMALS[0], 'Helmet', 0, hooks, new THREE.Vector3(8, 0.05, 6), 0, emptyControl(), 'helmet');
  for (const victim of [bare, helmet]) victim.receiveHit(attacker, 28, new CANNON.Vec3(0, 0, 1), 8, victim.head, victim.head.position.clone(), 'punch');
  assert(helmet.dizzy < bare.dizzy);
  assert(helmet.torso.velocity.z < bare.torso.velocity.z);
  attacker.removeFromWorld(); bare.removeFromWorld(); helmet.removeFromWorld();
});

test('punch reaches a nearby opponent on the sloped airplane without hitting distant cats', async () => {
  const { Arena } = await import('../src/game/Arena');
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const broadphase = new CANNON.SAPBroadphase(world);
  broadphase.useBoundingBoxes = true;
  world.broadphase = broadphase;
  (world.solver as CANNON.GSSolver).iterations = 10;
  const arena = new Arena(world, new THREE.Scene(), new CANNON.Material('ground'));
  const hits: string[] = [];
  const hooks = { onHit(_a: Character, v: Character, _p: CANNON.Vec3, _d: number, kind: string) { hits.push(`${kind}:${v.name}`); }, onKO() {}, onLand() {}, onStep() {} };
  const make = (i: number, z: number) => new Character(world, i, ANIMALS[i], i === 1 ? 'near' : 'far', i === 0 ? 1 : 0, hooks, new THREE.Vector3(0, arena.surfaceHeight(z) + 0.05, z), 0, emptyControl());
  const attacker = make(0, 0), near = make(1, 1.15), far = make(2, 4.5);
  const chars = [attacker, near, far];
  Character.all = chars;
  Character.bats = [];
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const start = near.torso.position.z;
  attacker.input.punch = true;
  attacker.frameActions(1 / 60);
  attacker.input.punch = false;
  for (let i = 0; i < 90; i++) stepCombat(world, chars, i);
  assert.deepEqual(hits, ['punch:near']);
  assert(near.torso.position.z > start + 0.45, 'nearby target should be pushed away');
  assert.equal(far.dizzy, 0, 'a distant cat must not be hit');
  assert(near.torso.position.y > arena.surfaceHeight(near.torso.position.z), 'target must stay above the deck');
  chars.forEach(c => c.removeFromWorld()); arena.dispose();
});

test('seagull tumbles visibly after impact, recovers speed and resets for another pass', async () => {
  const { Seagull } = await import('../src/game/Seagull');
  for (const yaw of [Math.PI, Math.PI / 2, 0.7]) {
    const scene = new THREE.Scene();
    const hits: Character[] = [];
    const makeTarget = (x: number, z: number) => {
      const point = new CANNON.Vec3(x, 0.85, z);
      const cat = {
        torso: { position: point }, head: { position: point }, parts: [],
        alive: true, removed: false, ko: false, koTimer: 0, hurtT: 0, time: 0,
        lastHitBy: null, lastHitKind: '', lastHitTime: 0,
        knockOut() { this.ko = true; },
      };
      return cat as unknown as Character;
    };
    const first = makeTarget(0, 0);
    const direction = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
    const second = makeTarget(direction.x * 4, direction.y * 4);
    const bird = new Seagull(scene, () => 0, victim => hits.push(victim));
    bird.launch(0, 0, yaw);
    const body = bird.root.children[0];
    let highestRoll = 0, highestBounce = 0, slowest = bird.speed, lastSpeed = 0;
    let wasHit = false;
    for (let i = 0; i < 600 && bird.active; i++) {
      const before = bird.root.position.clone();
      bird.update(H, [first, second], true);
      if (hits.length && !wasHit) wasHit = true;
      if (wasHit) {
        highestRoll = Math.max(highestRoll, body.rotation.z);
        highestBounce = Math.max(highestBounce, bird.root.position.y - 0.85);
        lastSpeed = Math.hypot(bird.root.position.x - before.x, bird.root.position.z - before.z) / H;
        slowest = Math.min(slowest, lastSpeed);
      }
    }
    assert.deepEqual(hits, [first, second], `each target should be struck once (yaw ${yaw})`);
    assert(highestRoll > Math.PI * 2, `bird should visibly roll at least once: ${highestRoll}`);
    assert(highestBounce > 0.1, `bird should bounce up: ${highestBounce}`);
    assert(slowest < bird.speed * 0.7 && lastSpeed > slowest + 2, `flight should slow and recover: ${slowest}, ${lastSpeed}`);
    bird.launch(0, 0, yaw);
    assert.equal(body.rotation.z, 0, 'a new pass starts upright');
    bird.update(H, [], true);
    assert(Math.abs(body.rotation.z) < 0.1, 'previous tumble must not leak into a new flight');
    bird.dispose();
  }
});

test('pounce leans forward with both paws reaching and hind legs trailing', async () => {
  const tuning = await import('../src/game/tuning');
  const rig = await import('../src/game/rig');
  const old = tuning.getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) for (const sideways of [false, true]) {
      tuning.setShapeMode(mode);
      const { world, make } = setup();
      const cat = make(0, 4, 4);
      Character.all = [cat];
      for (let i = 0; i < 180; i++) stepCombat(world, [cat], i);
      cat.input.mx = sideways ? 1 : 0;
      cat.input.headbutt = true; cat.frameActions(1 / 60); cat.input.headbutt = false; cat.input.mx = 0;
      for (let i = 0; i < 32; i++) stepCombat(world, [cat], i);
      const hand = new CANNON.Vec3(...rig.HAND), foot = new CANNON.Vec3(...rig.FOOT);
      const up = cat.torso.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      const forward = new CANNON.Vec3(sideways ? 1 : 0, 0, sideways ? 0 : 1);
      assert(up.dot(forward) > 0.7, `${mode} torso should lean into the leap: ${up.dot(forward)}`);
      for (const [arm, shoulder] of [[cat.armL, rig.SHOULDER_L], [cat.armR, rig.SHOULDER_R]] as const) {
        const delta = arm.pointToWorldFrame(hand).vsub(cat.torso.pointToWorldFrame(new CANNON.Vec3(...shoulder)));
        assert(delta.dot(forward) > 0.2, `${mode} paw should reach forward: ${delta.dot(forward)}`);
      }
      for (const [leg, hip] of [[cat.legL, rig.HIP_L], [cat.legR, rig.HIP_R]] as const) {
        const delta = leg.pointToWorldFrame(foot).vsub(cat.torso.pointToWorldFrame(new CANNON.Vec3(...hip)));
        assert(delta.dot(forward) < -0.15, `${mode} hind leg should trail behind: ${delta.dot(forward)}`);
      }
      cat.removeFromWorld();
    }
  } finally { tuning.setShapeMode(old); }
});

test('bat alternates side and overhead strikes, each able to hit once', () => {
  for (const boundary of [SWING_WINDUP, SWING_STRIKE_END, SWING_DURATION]) {
    const a = weaponSwingPose('bat', boundary - 1e-6, true), b = weaponSwingPose('bat', boundary + 1e-6, true);
    assert(Math.abs(a.th - b.th) < 0.001 && Math.abs(a.el - b.el) < 0.001 &&
      Math.abs(a.lift - b.lift) < 0.001 && Math.abs(a.lean - b.lean) < 0.001 &&
      Math.abs(a.forward - b.forward) < 0.001, `overhead pose jumps at ${boundary}`);
  }
  assert(weaponSwingPose('bat', SWING_WINDUP, true).lift > 0.1 && Math.cos(weaponSwingPose('bat', SWING_WINDUP, true).el) > 0, 'wind-up raises the hands and draws the bat behind the head');
  assert(Math.sin(weaponSwingPose('bat', SWING_STRIKE_END, true).el) < 0, 'bat swings forward and down');
  const { world, make } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 5.3);
  const chars = [attacker, target]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; attacker.equip(bat);
  let hits = 0; attacker.hooks.onHit = () => { hits++; };
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  assert(!attacker.swingOverhead, 'first swing should be sideways');
  for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
  assert.equal(hits, 1, 'side swing hits once');
  // Reset target to an ordinary nearby position for a second real swing.
  const shift = new CANNON.Vec3(attacker.position.x - target.position.x, 0, attacker.position.z + 1.3 - target.position.z);
  for (const part of target.parts) { part.position.vadd(shift, part.position); part.velocity.setZero(); part.angularVelocity.setZero(); }
  for (let i = 0; i < 90; i++) stepCombat(world, chars, i);
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  assert(attacker.swingOverhead, 'second swing should be overhead');
  for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
  assert.equal(hits, 2, 'overhead swing should hit once too');
  chars.forEach(c => c.removeFromWorld());
});

test('punch causes a recoverable fall without releasing the held weapon or a false KO', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4), victim = make(1, 4, 5.15);
  const chars = [attacker, victim]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; victim.equip(bat);
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  let hitAt = 0, fell = false, minUp = 1;
  attacker.hooks.onHit = (_a, v) => { hitAt = v.position.z; fell = v.down && !v.ko && v.weapon === bat; };
  for (let i = 0; i < 180; i++) {
    stepCombat(world, chars, i);
    if (victim.down) minUp = Math.min(minUp, victim.torso.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y);
  }
  assert(fell, 'hit causes a physical fall but not a scoring KO');
  assert(minUp < 0.5, `victim should visibly tip over: ${minUp}`);
  assert.equal(victim.kos, 0);
  assert.equal(bat.holder, victim);
  assert(!world.bodies.includes(bat.body), 'weapon stays equipped through the fall');
  assert(victim.position.z > hitAt + 0.8, 'punch should throw the victim away');
  assert(!victim.down && victim.alive, 'victim recovers after the fall');
  chars.forEach(c => c.removeFromWorld());
});

function contestSetup() {
  const { world, make } = setup();
  const challenger = make(0, 4, 4), owner = make(1, 4, 5.4);
  Character.all = [challenger, owner];
  for (let i = 0; i < 180; i++) stepCombat(world, [challenger, owner], i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; owner.equip(bat);
  challenger.input.lift = true; challenger.frameActions(1 / 60); challenger.input.lift = false;
  return { world, challenger, owner, bat };
}

test('E contest transfers weapon only after three fast presses; normal throws still work', () => {
  const { world, challenger, owner, bat } = contestSetup();
  assert(challenger.weaponContest && challenger.weaponContest === owner.weaponContest, 'E should start shared contest');
  assert.equal(challenger.weaponContest.challengerPresses, 1, 'starting E counts as first press');
  assert.equal(bat.holder, owner);
  challenger.input.lift = true; challenger.frameActions(0.2); challenger.input.lift = false;
  assert.equal(challenger.weaponContest?.challengerPresses, 2);
  assert.equal(bat.holder, owner);
  challenger.input.lift = true; challenger.frameActions(0.2);
  assert.equal(challenger.weaponContest, null);
  assert.equal(owner.weaponContest, null);
  assert.equal(challenger.weapon, bat);
  assert.equal(owner.weapon, null);
  assert.equal(bat.holder, challenger);
  assert(!world.bodies.includes(bat.body));
  challenger.input.lift = true; challenger.frameActions(1 / 60); challenger.input.lift = false;
  assert.equal(challenger.weapon, null, 'E still throws a weapon outside a contest');
  assert(world.bodies.includes(bat.body));
  challenger.removeFromWorld(); owner.removeFromWorld();
});

test('weapon owner can defend by pressing three times, slow presses reset, and interruptions cancel', () => {
  const { challenger, owner, bat } = contestSetup();
  challenger.frameActions(1.0);
  assert.equal(challenger.weaponContest?.challengerPresses, 0, 'slow sequence expires');
  for (let i = 0; i < 3; i++) {
    owner.input.lift = true; owner.frameActions(0.1); owner.input.lift = false;
    challenger.frameActions(0.1);
  }
  assert.equal(owner.weapon, bat, 'defender keeps their weapon');
  assert.equal(bat.holder, owner);
  assert.equal(owner.weaponContest, null);
  assert.equal(challenger.weaponContest, null);
  challenger.contestCooldown = 0;
  challenger.input.lift = true; challenger.frameActions(0.1); challenger.input.lift = false;
  assert(challenger.weaponContest);
  owner.receiveHit(challenger, 10, new CANNON.Vec3(0, 0, 1), 12.5, owner.torso, owner.torso.position.clone(), 'punch');
  assert.equal(owner.weaponContest, null);
  assert.equal(challenger.weaponContest, null);
  assert.equal(bat.holder, owner, 'a punch interrupts the contest without dropping the weapon');
  challenger.removeFromWorld(); owner.removeFromWorld();
});

test('weapon contest stays stable during real physics and ends fairly', () => {
  const { world, challenger, owner, bat } = contestSetup();
  const chars = [challenger, owner];
  let maximumSpeed = 0, maximumJointError = 0;
  for (let i = 0; i < 90; i++) {
    if (i === 24 || i === 48) challenger.input.lift = true;
    if (i % 2 === 0) for (const c of chars) c.frameActions(1 / 60);
    challenger.input.lift = false;
    for (const c of chars) c.physicsStep(H);
    world.step(H);
    for (const c of chars) c.updateHolds(H);
    maximumSpeed = Math.max(maximumSpeed, ...chars.flatMap(c => c.parts.map(p => p.velocity.length())));
    for (const c of chars) for (const joint of c.joints) {
      const j = joint as CANNON.PointToPointConstraint;
      maximumJointError = Math.max(maximumJointError, j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB)));
    }
  }
  assert.equal(challenger.weapon, bat, 'fast taps should succeed during real movement');
  assert(maximumSpeed < 15 && maximumJointError < 0.2, `struggle must not tear apart the cats: ${maximumSpeed}, ${maximumJointError}`);
  chars.forEach(c => c.removeFromWorld());
});

test('weapon contests respect walls and release cleanly on timeout or removal', () => {
  const { world, make } = setup();
  const challenger = make(0, 4, 4), owner = make(1, 4, 5.35);
  Character.all = [challenger, owner];
  for (let i = 0; i < 180; i++) stepCombat(world, [challenger, owner], i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; owner.equip(bat);
  const wall = new CANNON.Body({ mass: 0 }); wall.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 0.1))); wall.position.set(4, 1, 4.7); world.addBody(wall);
  const attempt = (challenger as unknown as { tryWeaponContest(): boolean }).tryWeaponContest.bind(challenger);
  assert(!attempt(), 'cannot contest through a wall');
  world.removeBody(wall);
  assert(attempt());
  challenger.frameActions(3.6);
  assert.equal(challenger.weaponContest, null, 'timeout releases both players');
  assert.equal(owner.weaponContest, null);
  assert.equal(owner.weapon, bat);
  assert(attempt());
  challenger.removeFromWorld();
  assert.equal(owner.weaponContest, null, 'removing one participant releases the other');
  assert.equal(owner.weapon, bat);
  owner.removeFromWorld();
});

test('a punched armed cat keeps its weapon and recovers above the solid airplane deck', async () => {
  const { Arena } = await import('../src/game/Arena');
  const tuning = await import('../src/game/tuning');
  const previous = tuning.getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) {
      tuning.setShapeMode(mode);
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
      const broadphase = new CANNON.SAPBroadphase(world); broadphase.useBoundingBoxes = true; world.broadphase = broadphase;
      (world.solver as CANNON.GSSolver).iterations = 10;
      const arena = new Arena(world, new THREE.Scene(), new CANNON.Material('ground'));
      const hooks = { onHit() {}, onKO() {}, onLand() {}, onStep() {} };
      const attacker = new Character(world, 0, ANIMALS[0], 'A', 1, hooks, new THREE.Vector3(0, arena.surfaceHeight(0) + 0.05, 0), 0, emptyControl());
      const victim = new Character(world, 1, ANIMALS[1], 'B', 0, hooks, new THREE.Vector3(0, arena.surfaceHeight(1.15) + 0.05, 1.15), 0, emptyControl());
      const chars = [attacker, victim]; Character.all = chars; Character.bats = arena.bats;
      for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
      const weapon = arena.bats[0]; victim.equip(weapon);
      attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
      let down = false, clearance = Infinity;
      for (let i = 0; i < 240; i++) {
        stepCombat(world, chars, i);
        down ||= victim.down;
        clearance = Math.min(clearance, victim.position.y - arena.surfaceHeight(victim.position.z));
      }
      assert(down && !victim.down && victim.grounded && victim.alive, `${mode} cat should fall and recover`);
      assert(clearance > 0, `${mode} fall must not penetrate the deck: ${clearance}`);
      assert.equal(victim.weapon, weapon);
      assert.equal(weapon.holder, victim);
      chars.forEach(c => c.removeFromWorld()); arena.dispose();
    }
  } finally { tuning.setShapeMode(previous); }
});

test('a bot in a weapon contest actively taps to defend its weapon', async () => {
  const { Game } = await import('../src/game/Game');
  const { challenger, owner, bat } = contestSetup();
  const game = { brains: new Map([[owner, {}]]), arena: {} } as unknown as InstanceType<typeof Game>;
  let pulses = 0;
  for (let i = 0; i < 150 && owner.weaponContest; i++) {
    challenger.frameActions(1 / 60);
    owner.input = Game.prototype.botControl.call(game, owner, 1 / 60);
    if (owner.input.lift) pulses++;
    owner.frameActions(1 / 60);
  }
  assert.equal(pulses, 3, 'bot must repeatedly attempt to win');
  assert.equal(owner.weaponContest, null);
  assert.equal(owner.weapon, bat, 'bot can successfully defend');
  challenger.removeFromWorld(); owner.removeFromWorld();
});

test('tackle disarms an armed cat, even when that cat is already down', () => {
  for (const initiallyDown of [false, true]) {
    const { world, make, hits } = setup();
    const attacker = make(0, 4, 4), victim = make(1, 4, 6.6);
    const chars = [attacker, victim]; Character.all = chars;
    for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
    const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; victim.equip(bat);
    if (initiallyDown) victim.knockOut(3);
    attacker.input.headbutt = true; attacker.frameActions(1 / 60); attacker.input.headbutt = false;
    let dropped = false;
    for (let i = 0; i < 120; i++) {
      stepCombat(world, chars, i);
      if (bat.holder === null) dropped = true;
    }
    assert.deepEqual(hits, ['dropkick']);
    assert(dropped && victim.weapon === null && world.bodies.includes(bat.body), 'tackle must disarm');
    chars.forEach(c => c.removeFromWorld());
  }
});

test('KO keeps the weapon attached to the falling paw and cancels an active swing', async () => {
  const rig = await import('../src/game/rig');
  for (const kind of ['bat', 'pan'] as const) {
    const { world, make } = setup();
    const c = make(0, 4, 4); Character.all = [c];
    for (let i = 0; i < 180; i++) stepCombat(world, [c], i);
    const weapon = makeWeapon(world, kind); Character.bats = [weapon]; c.equip(weapon);
    c.input.punch = true; c.frameActions(1 / 60); c.input.punch = false;
    assert(c.swingTimer > 0);
    c.knockOut(0.8);
    assert.equal(c.swingTimer, 0, 'fall must cancel the swing');
    assert.equal(c.weapon, weapon);
    assert.equal(weapon.holder, c);
    assert(!world.bodies.includes(weapon.body));
    for (let i = 0; i < 70; i++) {
      stepCombat(world, [c], i);
      c.syncVisual();
      const arm = c.visual.armR;
      const paw = new THREE.Vector3(...rig.HAND).applyQuaternion(arm.quaternion).add(arm.position);
      const grip = weapon.mesh.position.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(weapon.mesh.quaternion), -weapon.centerOffset);
      assert(paw.distanceTo(grip) < 0.001, `weapon must follow the paw, not float: ${paw.distanceTo(grip)}`);
    }
    for (let i = 70; i < 220; i++) stepCombat(world, [c], i);
    assert(!c.down && c.weapon === weapon, 'weapon stays equipped when recovering');
    c.removeFromWorld();
  }
});

test('seagull knockdown keeps a held weapon', async () => {
  const { Seagull } = await import('../src/game/Seagull');
  const { world, make } = setup();
  const cat = make(0, 4, 4); Character.all = [cat];
  for (let i = 0; i < 180; i++) stepCombat(world, [cat], i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; cat.equip(bat);
  const bird = new Seagull(new THREE.Scene(), () => 0, () => {});
  bird.launch(cat.position.x, cat.position.z);
  for (let i = 0; i < 400 && !cat.ko; i++) { bird.update(H, [cat], true); stepCombat(world, [cat], i); }
  assert(cat.ko, 'seagull must knock the cat down');
  assert.equal(cat.weapon, bat);
  assert.equal(bat.holder, cat);
  assert(!world.bodies.includes(bat.body));
  bird.dispose(); cat.removeFromWorld();
});

test('punch and both bat swings reliably hit close off-center opponents in both body modes', async () => {
  const tuning = await import('../src/game/tuning');
  const previous = tuning.getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) for (const attack of ['punch', 'bat', 'overhead'] as const) for (const x of [-0.65, 0, 0.65]) {
      tuning.setShapeMode(mode);
      const { world, make } = setup();
      const a = make(0, 4, 4), b = make(1, 4 + x, 5.25);
      const chars = [a, b]; Character.all = chars;
      for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
      if (attack !== 'punch') {
        const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; a.equip(bat);
        if (attack === 'overhead') (a as unknown as { nextBatOverhead: boolean }).nextBatOverhead = true;
      }
      let hits = 0, first = 0;
      a.hooks.onHit = (_attacker, victim) => { assert.equal(victim, b); hits++; first = b.dizzy; };
      a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
      for (let i = 0; i < 100; i++) stepCombat(world, chars, i);
      assert.equal(hits, 1, `${mode} ${attack} should hit close target once at x=${x}`);
      assert(first > 0, 'hit must apply damage');
      chars.forEach(c => c.removeFromWorld());
    }
  } finally { tuning.setShapeMode(previous); }
});

test('punch and bat prioritize the nearest visible enemy, not array order', () => {
  for (const attack of ['punch', 'bat', 'overhead'] as const) {
    const { world, make } = setup();
    const a = make(0, 4, 4), near = make(1, 4.48, 5.1), far = make(2, 3.65, 5.75);
    const chars = [a, far, near]; Character.all = chars;
    for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
    if (attack !== 'punch') {
      const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; a.equip(bat);
      if (attack === 'overhead') (a as unknown as { nextBatOverhead: boolean }).nextBatOverhead = true;
    }
    const hit: Character[] = [];
    a.hooks.onHit = (_a, victim) => hit.push(victim);
    a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
    for (let i = 0; i < 100; i++) stepCombat(world, chars, i);
    assert.equal(hit.length, 1, `${attack} should hit one opponent`);
    assert(hit[0] === near, `${attack} should target the nearer enemy even when it is last in the list`);
    chars.forEach(c => c.removeFromWorld());
  }
});

test('melee assistance does not turn toward enemies while idle, attack behind, through walls or at a distance', () => {
  for (const attack of ['punch', 'bat', 'overhead'] as const) {
    const { world, make } = setup();
    const a = make(0, 4, 4), target = make(1, 5, 2);
    Character.all = [a, target];
    for (let i = 0; i < 120; i++) stepCombat(world, [a, target], i);
    const original = a.facing;
    for (let i = 0; i < 60; i++) stepCombat(world, [a, target], i);
    assert.equal(a.facing, original, 'idle character must not lock or rotate towards the opponent');
    if (attack !== 'punch') {
      const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; a.equip(bat);
      if (attack === 'overhead') (a as unknown as { nextBatOverhead: boolean }).nextBatOverhead = true;
    }
    let hits = 0; a.hooks.onHit = () => hits++;
    a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
    assert.equal(a.facing, original, 'attack must not aim at a target behind');
    for (let i = 0; i < 100; i++) stepCombat(world, [a, target], i);
    assert.equal(hits, 0, 'attack must not hit distant or rear targets');
    assert.equal(a.facing, original, 'assist must not keep tracking after the attack');
    a.removeFromWorld(); target.removeFromWorld();
  }
});

test('punch assistance cannot hit through a wall', () => {
  const { world, make } = setup();
  const a = make(0, 4, 4), target = make(1, 4, 5.3);
  Character.all = [a, target];
  for (let i = 0; i < 180; i++) stepCombat(world, [a, target], i);
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 0.06))); wall.position.set(4, 1, 4.75); world.addBody(wall);
  let hits = 0; a.hooks.onHit = () => hits++;
  a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
  for (let i = 0; i < 100; i++) stepCombat(world, [a, target], i);
  assert.equal(hits, 0);
  a.removeFromWorld(); target.removeFromWorld();
});

test('nearby target selection respects vertical distance and a blocked near target', () => {
  const { world, make } = setup();
  const a = make(0, 4, 4), elevated = make(1, 4.05, 5), reachable = make(2, 5, 5.3);
  Character.all = [a, elevated, reachable];
  for (let i = 0; i < 120; i++) stepCombat(world, [a, elevated, reachable], i);
  const select = (a as unknown as { nearestMeleeTarget(range: number): Character | null }).nearestMeleeTarget.bind(a);
  for (const part of elevated.parts) part.position.y += 3;
  assert(select(2.3) === reachable, 'target well above the attack must not be selected');
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(0.16, 3, 0.5))); wall.position.set(4.5, 1, 4.7); world.addBody(wall);
  assert.equal(select(2.3), null, 'a wall between the fighters prevents assisted targeting');
  a.removeFromWorld(); elevated.removeFromWorld(); reachable.removeFromWorld();
});

test('assisted hits occur near the paw or bat rather than across an empty gap', async () => {
  const rig = await import('../src/game/rig');
  for (const kind of ['punch', 'bat', 'overhead'] as const) {
    const { world, make } = setup();
    const a = make(0, 4, 4), b = make(1, 4.65, 5.25);
    Character.all = [a, b];
    for (let i = 0; i < 120; i++) stepCombat(world, [a, b], i);
    if (kind !== 'punch') {
      const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; a.equip(bat);
      if (kind === 'overhead') (a as unknown as { nextBatOverhead: boolean }).nextBatOverhead = true;
    }
    let gap = Infinity, hits = 0;
    a.hooks.onHit = (_attacker, _victim, point) => {
      hits++;
      gap = kind === 'punch'
        ? a[a.punchArm].pointToWorldFrame(new CANNON.Vec3(...rig.HAND)).distanceTo(point)
        : Math.sqrt(segmentDistanceSquared(point, a.batA, a.batB));
    };
    a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
    for (let i = 0; i < 100; i++) stepCombat(world, [a, b], i);
    assert.equal(hits, 1);
    assert(gap < 0.4, `${kind} should reach the impact point visually: ${gap}`);
    a.removeFromWorld(); b.removeFromWorld();
  }
});

test('attack aim is temporary and never tracks a moving opponent after the swing', () => {
  const { world, make } = setup();
  const a = make(0, 4, 4), target = make(1, 4.65, 5.25);
  Character.all = [a, target];
  for (let i = 0; i < 120; i++) stepCombat(world, [a, target], i);
  const oldFacing = a.facing;
  a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
  assert(Math.abs(a.facing - oldFacing) > 0.1, 'pressing attack can briefly aim at a nearby opponent');
  for (let i = 0; i < 100; i++) stepCombat(world, [a, target], i);
  const afterAttack = a.facing;
  for (const part of target.parts) part.position.x -= 2;
  for (let i = 0; i < 90; i++) stepCombat(world, [a, target], i);
  assert.equal(a.facing, afterAttack, 'the attacker must not keep turning to follow the opponent');
  a.removeFromWorld(); target.removeFromWorld();
});

test('melee attacks do not pull in or damage a distant enemy in front', () => {
  for (const attack of ['punch', 'bat', 'overhead'] as const) {
    const { world, make } = setup();
    const a = make(0, 4, 4), target = make(1, 4.7, 8);
    Character.all = [a, target];
    for (let i = 0; i < 120; i++) stepCombat(world, [a, target], i);
    if (attack !== 'punch') {
      const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; a.equip(bat);
      if (attack === 'overhead') (a as unknown as { nextBatOverhead: boolean }).nextBatOverhead = true;
    }
    let hits = 0; a.hooks.onHit = () => hits++;
    const facing = a.facing;
    a.input.punch = true; a.frameActions(1 / 60); a.input.punch = false;
    for (let i = 0; i < 100; i++) stepCombat(world, [a, target], i);
    assert.equal(hits, 0);
    assert.equal(a.facing, facing);
    a.removeFromWorld(); target.removeFromWorld();
  }
});

test('a knocked-down cat is lifted from punch knockback distance, and grabs stay stable', () => {
  const { world, make } = setup();
  const carrier = make(0, 4, 4), victim = make(1, 4, 5.2);
  const chars = [carrier, victim]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  carrier.facing = 0; victim.facing = Math.PI;
  carrier.input.punch = true; carrier.frameActions(1 / 60); carrier.input.punch = false;
  for (let i = 0; i < 70; i++) stepCombat(world, chars, i);
  const gap = Math.hypot(victim.position.x - carrier.position.x, victim.position.z - carrier.position.z);
  assert(gap > 1.7, `punch should push the target out of the old grab reach: ${gap}`);
  carrier.facing = Math.atan2(victim.position.x - carrier.position.x, victim.position.z - carrier.position.z);
  carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
  assert(carrier.holding && carrier.lifting, 'E should still scoop up the knocked-down cat it just hit');
  let maxJointError = 0;
  for (let i = 0; i < 120; i++) {
    stepCombat(world, chars, i);
    for (const c of chars) for (const joint of c.joints) {
      const j = joint as CANNON.PointToPointConstraint;
      maxJointError = Math.max(maxJointError, j.bodyA.pointToWorldFrame(j.pivotA).distanceTo(j.bodyB.pointToWorldFrame(j.pivotB)));
    }
  }
  assert(carrier.holding, 'the grab survives the lift');
  assert(maxJointError < 0.2, `long reach must not tear the ragdoll: ${maxJointError}`);
  carrier.releaseAll(true);
  chars.forEach(c => c.removeFromWorld());
});

test('a standing cat beyond arm reach is not lifted', () => {
  const { world, make } = setup();
  const carrier = make(0, 4, 4), target = make(1, 4, 7);
  const chars = [carrier, target]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  carrier.facing = 0;
  carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
  assert(!carrier.holding, 'E must not yank a standing cat from three units away');
  chars.forEach(c => c.removeFromWorld());
});

test('E grabs the nearest cat instead of being hijacked by a nearby bat contest', () => {
  // A farther armed cat must not steal a grab from the cat standing next to us.
  {
    const { world, make } = setup();
    const carrier = make(0, 4, 4), armed = make(1, 4, 5.3), unarmed = make(2, 4, 4.8);
    const chars = [carrier, armed, unarmed]; Character.all = chars;
    const bat = makeWeapon(world, 'bat'); Character.bats = [bat];
    for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
    armed.equip(bat);
    for (let i = 0; i < 20; i++) stepCombat(world, chars, 180 + i);
    carrier.facing = Math.atan2(armed.position.x - carrier.position.x, armed.position.z - carrier.position.z);
    carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
    assert.equal(carrier.weaponContest, null, 'closer cargo wins over a farther bat contest');
    assert.equal(carrier.holds.armL?.owner ?? carrier.holds.armR?.owner ?? null, unarmed);
    chars.forEach(c => c.removeFromWorld());
  }
  // With the armed cat nearest, the tug-of-war still starts.
  {
    const { world, make } = setup();
    const carrier = make(0, 4, 4), armed = make(1, 4, 5.05), unarmed = make(2, 4, 6.6);
    const chars = [carrier, armed, unarmed]; Character.all = chars;
    const bat = makeWeapon(world, 'bat'); Character.bats = [bat];
    for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
    armed.equip(bat);
    for (let i = 0; i < 20; i++) stepCombat(world, chars, 180 + i);
    carrier.facing = Math.atan2(armed.position.x - carrier.position.x, armed.position.z - carrier.position.z);
    carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
    assert(carrier.weaponContest && carrier.weaponContest === armed.weaponContest, 'nearest armed cat starts a contest');
    assert.equal(carrier.holding, false);
    chars.forEach(c => c.removeFromWorld());
  }
});

test('E cannot lift a cat through solid scenery', () => {
  const { world, make } = setup();
  const carrier = make(0, 4, 4), target = make(1, 4, 5.9);
  const chars = [carrier, target]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(2, 2, 0.1)));
  wall.position.set(4, 1, 4.95);
  world.addBody(wall);
  carrier.facing = 0;
  carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
  assert(!carrier.holding, 'the wall blocks the grab');
  world.removeBody(wall);
  carrier.input.lift = true; carrier.frameActions(1 / 60); carrier.input.lift = false;
  assert(carrier.holding && carrier.lifting, 'lifting still works once the wall is gone');
  chars.forEach(c => c.removeFromWorld());
});

test('K lifts a nearby cat overhead and a second K press throws it', () => {
  const { world, make } = setup();
  const carrier = make(0, 4, 4), victim = make(1, 4, 5.1);
  const chars = [carrier, victim]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  carrier.facing = 0;
  carrier.input.grabPress = true;
  carrier.input.grab = true;
  carrier.frameActions(1 / 60);
  carrier.input.grabPress = false;
  assert(carrier.holding && carrier.lifting, 'K alone should grab and start lifting');
  assert(carrier.stickyLift, 'the lift must not depend on holding K down');
  let peak = 0;
  for (let i = 0; i < 150; i++) {
    stepCombat(world, chars, i);
    if (carrier.holding) peak = Math.max(peak, victim.torso.position.y - carrier.head.position.y);
  }
  assert(carrier.holding, 'releasing K keeps the cat overhead');
  assert(peak > 0.6, `the lifted cat should end up above the carrier's head: ${peak}`);
  // Letting go of the key must not throw the cat.
  carrier.input.grab = false;
  carrier.frameActions(1 / 60);
  assert(carrier.holding, 'releasing K keeps holding instead of dropping');
  // Second press throws.
  carrier.input.grabPress = true;
  carrier.input.grab = true;
  carrier.frameActions(1 / 60);
  carrier.input.grabPress = false;
  carrier.input.grab = false;
  assert(!carrier.holding, 'the second K press releases the hold');
  assert(victim.thrownT > 0 && victim.torso.velocity.z > 5, 'the throw launches the cat forward');
  chars.forEach(c => c.removeFromWorld());
});

test('K does not start a lift while holding a bat or being carried', () => {
  const { world, make } = setup();
  const armed = make(0, 4, 4), friend = make(1, 4, 5.0);
  const chars = [armed, friend]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; armed.equip(bat);
  armed.facing = 0;
  armed.input.grabPress = true; armed.frameActions(1 / 60); armed.input.grabPress = false;
  assert.equal(armed.holding, false, 'a bat in hand is not swapped for a cat by K');
  assert.equal(armed.weapon, bat);
  // While being carried, K cannot grab the carrier.
  friend.heldBy = 1;
  friend.facing = Math.PI;
  friend.input.grabPress = true; friend.frameActions(1 / 60); friend.input.grabPress = false;
  assert.equal(friend.holding, false);
  chars.forEach(c => c.removeFromWorld());
});

test('the overhead swing is a visible top-to-bottom chop in front of the cat', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4), target = make(1, 4, 5.6);
  const chars = [attacker, target]; Character.all = chars;
  for (let i = 0; i < 180; i++) stepCombat(world, chars, i);
  const bat = makeWeapon(world, 'bat'); Character.bats = [bat]; attacker.equip(bat);
  // First swing is sideways; the second is the overhead chop we measure.
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  for (let i = 0; i < 110; i++) stepCombat(world, chars, i);
  const headY = attacker.head.position.y;
  const startZ = attacker.position.z;
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  assert(attacker.swingOverhead, 'the swing under test must be the overhead one');
  let peakY = -Infinity, peakZ = 0, lowestY = Infinity, lowestZ = 0, peakGripY = -Infinity;
  for (let i = 0; i < 90; i++) {
    stepCombat(world, chars, i);
    const tip = attacker.batB;
    if (tip.y > peakY) { peakY = tip.y; peakZ = tip.z; }
    if (tip.y < lowestY) { lowestY = tip.y; lowestZ = tip.z; }
    peakGripY = Math.max(peakGripY, attacker.batGrip.y);
  }
  assert(peakY > headY + 0.5, `bat should rise above the head at wind-up: peak ${peakY} vs head ${headY}`);
  assert(lowestY < headY, `bat should come down near the ground on the chop: ${lowestY}`);
  assert(peakY - lowestY > 1.1, `the chop needs real travel, got ${peakY - lowestY}`);
  assert(lowestZ > startZ + 0.6 && lowestZ > peakZ, 'the chop travels forward, not straight down at the feet');
  assert(peakGripY > attacker.head.position.y - 0.1, `the paws should lift for the chop: ${peakGripY}`);
  chars.forEach(c => c.removeFromWorld());
});

test('side/overhead alternation survives picking up a different bat', () => {
  const { world, make } = setup();
  const attacker = make(0, 4, 4);
  const chars = [attacker]; Character.all = chars;
  for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
  const first = makeWeapon(world, 'bat'); Character.bats = [first]; attacker.equip(first);
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  assert(!attacker.swingOverhead, 'first swing of a new bat is sideways');
  attacker.swingTimer = 0;
  // Drop that bat and grab a fresh one: the next swing should still be overhead.
  attacker.throwWeapon(true);
  // Let the swing cooldown finish so the next press really starts a swing.
  for (let i = 0; i < 120; i++) stepCombat(world, chars, i);
  assert(attacker.punchCd <= 0, 'cooldown should be over before the next swing');
  const second = makeWeapon(world, 'bat'); Character.bats = [first, second]; attacker.equip(second);
  attacker.input.punch = true; attacker.frameActions(1 / 60); attacker.input.punch = false;
  assert(attacker.swingOverhead, 'the alternation must not restart on every pickup');
  attacker.removeFromWorld();
});
