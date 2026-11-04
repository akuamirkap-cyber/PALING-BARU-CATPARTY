// Focused, headless regression for the toy teflon melee weapon.
const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY, bodyOwner } from "../src/game/Character";
import { Arena } from "../src/game/Arena";
import { Game } from "../src/game/Game";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
(world.solver as CANNON.GSSolver).iterations = 14;
const ground = new CANNON.Material("ground");
world.addContactMaterial(new CANNON.ContactMaterial(Character.material, ground, { friction: 0.25, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(Character.material, Character.material, { friction: 0.35, restitution: 0.15 }));
const scene = new THREE.Scene();
const arena = new Arena(world, scene, ground);
Character.bats = arena.bats;
const hits: string[] = [];
const hooks = {
  onHit: (_a: Character, _b: Character, _p: CANNON.Vec3, _d: number, kind: string) => hits.push(kind),
  onKO() {}, onLand() {}, onStep() {},
};
const pan = arena.bats.find((b) => b.kind === "pan");
if (!pan) throw new Error("Pan was not spawned");
if (arena.bats.filter((b) => b.kind === "pan").length !== 2) throw new Error("Expected two pans");
if (!arena.isSafe(pan.body.position.x, pan.body.position.z)) throw new Error("Pan spawned off the aircraft");
const a = new Character(world, 0, ANIMALS[1], "A", 1, hooks, new THREE.Vector3(0, 0.05, 0), 0, emptyControl());
const b = new Character(world, 1, ANIMALS[0], "B", 0, hooks, new THREE.Vector3(0, 0.05, 2), Math.PI, emptyControl());
Character.all = [a, b];
const h = 1 / 120;
const pt = new CANNON.Vec3();
function sim(seconds: number) {
  for (let n = 0; n < Math.round(seconds * 60); n++) {
    for (const c of [a, b]) { c.heldBy = 0; c.carriedBy = null; }
    for (const c of [a, b]) c.frameActions(1 / 60);
    for (const c of [a, b]) { c.input.punch = false; c.input.lift = false; }
    for (let s = 0; s < 2; s++) {
      for (const c of [a, b]) c.physicsStep(h);
      world.step(h);
      for (const con of world.contacts) {
        const aa = bodyOwner.get(con.bi), bb = bodyOwner.get(con.bj);
        if (aa) { con.bi.position.vadd(con.ri, pt); aa.char.onContact(aa.part, con.bj, pt, bb); }
        if (bb) { con.bj.position.vadd(con.rj, pt); bb.char.onContact(bb.part, con.bi, pt, aa); }
      }
      for (const c of [a, b]) c.updateHolds(h);
    }
    arena.update(1 / 60, 50);
  }
}
function move(c: Character, x: number, z: number) {
  const dx = x - c.position.x, dz = z - c.position.z, dy = 0.75 - c.position.y;
  for (const part of c.parts) {
    part.position.x += dx; part.position.y += dy; part.position.z += dz;
    part.velocity.set(0, 0, 0); part.angularVelocity.set(0, 0, 0);
  }
}

sim(4);
const pans = arena.bats.filter((weapon) => weapon.kind === "pan");
for (const item of pans) {
  if (item.body.position.y < -0.6) throw new Error("A pan fell through the aircraft skin");
}
// The existing bot weapon search must consider pans as well as baseball bats.
move(b, pans[1].body.position.x, pans[1].body.position.z - 0.75);
sim(0.2);
const ai = Object.create(Game.prototype) as Game;
ai.world = world;
ai.arena = arena;
ai.bombSys = null;
ai.chars = [a, b];
ai.brains = new Map([[b, {
  target: a, retarget: 1, punchT: 0, grabT: 0, dropkickT: 0, throwT: 0,
  climbT: 1, holdT: 0, aggro: 0.9, runFlag: false, wander: 0, batPref: true,
}]]);
const aiInput = ai.botControl(b, 1 / 60);
if (!aiInput.lift) {
  console.log("AI pickup debug", {
    bot: b.position.toString(), pan: pans[1].body.position.toString(),
    panSpeed: pans[1].body.velocity.length(), safe: arena.isSafe(pans[1].body.position.x, pans[1].body.position.z, 0.3),
    grounded: b.grounded, ko: b.ko, holding: b.holding,
    input: aiInput,
  });
  throw new Error("Bot does not try to pick up a nearby pan");
}
move(a, pan.body.position.x, pan.body.position.z - 0.8);
sim(0.3);
a.facing = 0;
a.input.lift = true;
sim(0.06);
if (a.weapon !== pan || world.bodies.includes(pan.body)) throw new Error("E did not equip the pan");
move(b, a.position.x, a.position.z + 1.2);
b.koTimer = 0; b.dizzy = 0;
sim(0.3);
const before = b.position.clone();
a.facing = 0;
a.input.punch = true;
sim(0.75);
const moved = b.position.distanceTo(before);
if (!hits.includes("pan")) throw new Error(`Pan swing missed target (${hits.join(",")})`);
if (moved > 4) throw new Error(`Pan knockback too strong: ${moved.toFixed(2)}m`);
if (b.dizzy < 15) throw new Error("Pan hit did not stun the target");
a.input.lift = true;
sim(0.06);
if (a.weapon || !world.bodies.includes(pan.body)) throw new Error("E did not throw the pan");
console.log(`pan: picked=OK bot=OK hit=${hits.join(",")} dizzy=${b.dizzy.toFixed(0)} knockback=${moved.toFixed(2)}m thrown=${pan.body.velocity.length().toFixed(1)}m/s`);