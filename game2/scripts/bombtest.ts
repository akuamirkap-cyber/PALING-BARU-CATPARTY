const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";
import { BombSystem } from "../src/game/Bombs";

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
(world.solver as CANNON.GSSolver).iterations = 14;
const scene = new THREE.Scene();
const arena = new Arena(world, scene, new CANNON.Material("g"));
Character.bats = arena.bats;
const chars: Character[] = [];
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2;
  const c = new Character(world, i, ANIMALS[i], "c" + i, 0, { onLand() {}, onStep() {}, onHit() {}, onKO() {} } as any, new THREE.Vector3(Math.cos(a) * 2, 0.05, Math.sin(a) * 2), 0, emptyControl());
  scene.add(c.root);
  chars.push(c);
}
Character.all = chars;
let explosions = 0, waves = 0, hits = 0;
const sys = new BombSystem(world, scene, { onExplode: (_b, h) => { explosions++; hits += h; }, onWave: () => waves++ }, 1.7);
sys.reset();
let maxBombs = 0;
const t0 = performance.now();
for (let step = 0; step < 60 * 60; step++) {
  const dt = 1 / 60;
  for (const c of chars) { c.input = emptyControl(); c.heldBy = 0; c.carriedBy = null; c.frameActions(dt); }
  for (let s = 0; s < 2; s++) {
    for (const c of chars) c.physicsStep(1 / 120);
    world.step(1 / 120);
    for (const c of chars) c.updateHolds(1 / 120);
  }
  sys.update(dt, chars, (x, z) => arena.isSafe(x, z, 0.2));
  maxBombs = Math.max(maxBombs, sys.bombs.length);
  arena.update(dt, 0);
}
console.log(`60s: explosions=${explosions} waves=${waves} maxConcurrent=${maxBombs} currentMax=${sys.maxBombs} hits=${hits} aliveBombs=${sys.bombs.length}`);
console.log("char positions:", chars.map((c) => `${c.position.x.toFixed(1)},${c.position.z.toFixed(1)} dizzy=${c.dizzy.toFixed(0)}`).join(" | "));
// chain test
sys.reset();
const saved = chars.map((c) => c.torso.position.clone());
chars.forEach((c, i) => { for (const p of c.parts) { p.position.x = saved[i].x; p.position.z = saved[i].z; p.velocity.set(0, 0, 0); } });
sys.bombs = [];
(sys as any).spawn(() => true, chars);
const b = sys.bombs[0];
b.fuse = 99;
sys.spawn(() => true, chars);
const b2 = sys.bombs[1];
b2.body.position.set(b.body.position.x + 1.2, 1, b.body.position.z);
(sys as any).alive = 5;
b.fuse = 0.05;
const before = chars.map((c) => c.torso.position.clone());
for (let i = 0; i < 40; i++) sys.update(1 / 60, chars, () => true);
console.log("chain after:", "bombsLeft", sys.bombs.length, "b2fuse", b2.fuse.toFixed(2), "moved", chars.map((c, i) => c.torso.position.distanceTo(before[i]).toFixed(2)).join(","));
console.log("ms", (performance.now() - t0).toFixed(0));

// focused blast knockback with physics stepping
{
  sys.reset(); (sys as any).alive = 5;
  sysexploded = 0;
  const victim = chars[0];
  for (const p2 of victim.parts) { p2.position.set(0, 0.8, 0); p2.velocity.set(0,0,0); }
  (sys as any).spawn(() => true, chars);
  const bb = sys.bombs[0];
  for (const p2 of bb.body.position ? victim.parts : []) void p2;
  bb.body.position.set(0, 0.5, 1.0);
  bb.fuse = 0.02;
  const apos = victim.torso.position.clone();
  const dizzy0 = victim.dizzy;
  for (let i = 0; i < 120; i++) { sys.update(1/60, chars, () => true); for (let k = 0; k < 2; k++) { world.step(1/120); } }
  console.log("blast: victim moved", victim.torso.position.distanceTo(apos).toFixed(2), "dizzy +", (victim.dizzy - dizzy0).toFixed(0), "ko", victim.ko);
}
let sysexploded = 0;

// ---- integrated blast knockback with physics stepping ----
{
  const w2 = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  (w2.solver as CANNON.GSSolver).iterations = 14;
  const scene2 = new THREE.Scene();
  const arena2 = new Arena(w2, scene2, new CANNON.Material("g"));
  Character.bats = arena2.bats;
  const hooks = { onLand() {}, onStep() {}, onHit() {}, onKO() {} } as any;
  const victim = new Character(w2, 0, ANIMALS[0], "victim", 1, hooks, new THREE.Vector3(0, 0.05, 0), 0, emptyControl());
  scene2.add(victim.root);
  Character.all = [victim];
  const sys2 = new BombSystem(w2, scene2, { onExplode: () => {}, onWave: () => {} }, 1.7);
  sys2.reset();
  for (let i = 0; i < 30; i++) { victim.physicsStep(1/120); w2.step(1/120); }
  const start = victim.torso.position.clone();
  const d0 = victim.dizzy;
  (sys2 as any).alive = 5;
  sys2.spawn(() => true, [victim]);
  const bomb = sys2.bombs[0];
  bomb.body.position.set(0, 0.6, 1.1);
  bomb.body.velocity.set(0, 0, 0);
  bomb.fuse = 0.05;
  let exploded = false;
  const orig = sys2.explode.bind(sys2);
  sys2.explode = (b, ch) => { exploded = true; orig(b, ch); };
  for (let i = 0; i < 90; i++) {
    sys2.update(1 / 60, [victim], () => true);
    for (let s2 = 0; s2 < 2; s2++) { victim.physicsStep(1/120); w2.step(1/120); victim.updateHolds(1/120); }
  }
  console.log(`blast: exploded=${exploded} moved=${victim.torso.position.distanceTo(start).toFixed(2)} dizzy+${(victim.dizzy - d0).toFixed(0)} ko=${victim.ko} expr=${victim.expr}`);
}
