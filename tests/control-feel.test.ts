import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Character, type Bat } from '../src/game/Character';
import { ANIMALS } from '../src/game/animals';
import { emptyControl } from '../src/game/input';

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
  Character.all = [];
  Character.bats = [];
  Character.thrownProps = [];
  const make = (index: number, x: number, z: number) =>
    new Character(world, index, ANIMALS[0], 'Cat', index ? 0 : 1,
      { onHit() {}, onKO() {}, onLand() {}, onStep() {} },
      new THREE.Vector3(x, 0.05, z), 0, emptyControl());
  return { world, make };
}

function step(world: CANNON.World, chars: Character[], i: number) {
  if (i % 2 === 0) for (const c of chars) c.frameActions(1 / 60);
  for (const c of chars) c.physicsStep(H);
  world.step(H);
  for (const c of chars) c.updateHolds(H);
}

function makeWeapon(world: CANNON.World): Bat {
  const body = new CANNON.Body({ mass: 1 });
  body.addShape(new CANNON.Sphere(0.1));
  world.addBody(body);
  return {
    kind: 'bat', body, mesh: new THREE.Group(), centerOffset: 0.67, reach: 1.47, impactOffset: 1.2,
    holder: null, thrower: null, flyT: 0, hit: new Set(),
  };
}

test('a jump pressed just before landing still fires instead of being dropped', () => {
  const { world, make } = setup();
  const c = make(0, 4, 4);
  Character.all = [c];
  for (let i = 0; i < 120; i++) step(world, [c], i);
  const y0 = c.position.y;

  c.input.jump = true; c.frameActions(1 / 60); c.input.jump = false;
  let launches = 0, pressed = false;
  for (let i = 0; i < 400; i++) {
    const vy = c.torso.velocity.y;
    // A human taps jump a beat early: press once the cat is almost down.
    c.input.jump = !pressed && vy < -1.5 && c.position.y - y0 < 0.14;
    if (c.input.jump) pressed = true;
    const prevVy = vy;
    step(world, [c], i);
    if (pressed && prevVy < 0 && c.torso.velocity.y > 4) launches++;
  }
  assert(pressed, 'the test should have produced an early jump press');
  assert.equal(launches, 1, `early jump press must be buffered, got ${launches} launches`);
  c.removeFromWorld();
});

test('a swing pressed during the recovery of the previous swing is queued, not ignored', () => {
  const { world, make } = setup();
  const c = make(0, 4, 4);
  Character.all = [c];
  for (let i = 0; i < 120; i++) step(world, [c], i);
  Character.bats = [makeWeapon(world)];
  c.equip(Character.bats[0]);
  for (let i = 0; i < 60; i++) step(world, [c], i);

  c.input.punch = true; c.frameActions(1 / 60); c.input.punch = false;
  assert(c.swingTimer > 0, 'the first press starts a swing');

  let swings = 1, pressed = false;
  for (let i = 0; i < 200; i++) {
    // Queue the next swing while the current one is still finishing.
    if (!pressed && c.swingTimer > 0 && c.swingTimer < 0.08) {
      c.input.punch = true; c.frameActions(1 / 60); c.input.punch = false; pressed = true;
    }
    const before = c.swingTimer;
    step(world, [c], i);
    if (c.swingTimer > before + 0.05) swings++;
  }
  assert(pressed, 'the test should have queued a second press');
  assert(swings > 1, 'the queued press must start the next swing');
  c.removeFromWorld();
});

test('the cat answers a direction change quickly instead of sliding', () => {
  const { world, make } = setup();
  const c = make(0, 4, 4);
  Character.all = [c];
  for (let i = 0; i < 180; i++) step(world, [c], i);

  c.input.mx = 1; c.input.run = true;
  let t = Infinity;
  for (let i = 0; i < 300; i++) {
    step(world, [c], i);
    if (Math.hypot(c.torso.velocity.x, c.torso.velocity.z) >= 6) { t = (i + 1) * H; break; }
  }
  assert(t < 0.3, `running speed should arrive quickly, took ${t}`);

  c.input.mx = 0;
  let stop = Infinity;
  for (let i = 0; i < 300; i++) {
    step(world, [c], i);
    if (Math.hypot(c.torso.velocity.x, c.torso.velocity.z) < 0.35) { stop = (i + 1) * H; break; }
  }
  assert(stop < 0.3, `the cat should stop on a coin, took ${stop}`);
  c.removeFromWorld();
});
