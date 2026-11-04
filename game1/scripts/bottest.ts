const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY, bodyOwner } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";
import { Game } from "../src/game/Game";

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
(world.solver as CANNON.GSSolver).iterations = 14;
const groundMat = new CANNON.Material("ground");
world.addContactMaterial(new CANNON.ContactMaterial(Character.material, groundMat, { friction: 0.25, restitution: 0.02 }));
const arena = new Arena(world, new THREE.Scene(), groundMat);
let hits = 0, kos = 0, bats = 0;
const hooks = { onLand: () => {}, onStep: () => {}, onHit: (_a: any, _v: any, _p: any, _d: any, k: string) => { hits++; if (k === 'bat') bats++; }, onKO: () => { kos++; } };
const g: any = Object.create(Game.prototype);
g.arena = arena; g.brains = new Map(); g.chars = []; g.world = world; Character.bats = arena.bats;
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const pos = new THREE.Vector3(Math.cos(a) * 4.4, 0.05, Math.sin(a) * 4.4);
  const c = new Character(world, i, ANIMALS[i], "bot" + i, 0, hooks, pos, Math.atan2(-pos.x, -pos.z), emptyControl());
  g.chars.push(c);
  g.brains.set(c, { target: null, retarget: 0, punchT: 0, grabT: 0, dropkickT: 0, throwT: 0, climbT: 0.8, holdT: 0, aggro: 0.8, runFlag: false, wander: 0, batPref: i % 2 === 0 });
}
Character.all = g.chars;
const pt = new CANNON.Vec3();
let t = 0;
const log: string[] = [];
let sweeper = false, r3 = false, r2 = false;
while (t < 100 && g.chars.filter((c: Character) => c.alive).length > 1) {
  const dt = 1 / 60; t += dt;
  if (!sweeper && t > 25) { sweeper = true; arena.activateSweeper(); }
  if (!r3 && t > 55) { r3 = true; arena.dropRing(3); }
  if (!r2 && t > 78) { r2 = true; arena.dropRing(2); }
  for (const c of g.chars) c.input = c.alive ? g.botControl(c, dt) : emptyControl();
  arena.update(0, t);
  for (const c of g.chars) { c.heldBy = 0; c.carriedBy = null; }
  for (const c of g.chars) for (const h of [c.holds.armL, c.holds.armR]) if (h?.owner) { h.owner.heldBy++; if (c.lifting && h.carry && !h.owner.ko) h.owner.carriedBy = c; }
    for (const c of g.chars) c.updateCollisionMask();
  for (const c of g.chars) if (!c.removed) { if (c.input.headbutt && !c.grounded) log.push(`  t=${t.toFixed(1)} ${c.name} DROPKICK at ${c.position.x.toFixed(1)},${c.position.z.toFixed(1)}`); c.frameActions(dt); }
  for (let s = 0; s < 2; s++) {
    for (const c of g.chars) c.physicsStep(1 / 120);
    world.step(1 / 120);
    for (const con of world.contacts) {
      const a = bodyOwner.get(con.bi), b = bodyOwner.get(con.bj);
      if (a) { con.bi.position.vadd(con.ri, pt); a.char.onContact(a.part, con.bj, pt, b); }
      if (b) { con.bj.position.vadd(con.rj, pt); b.char.onContact(b.part, con.bi, pt, a); }
    }
    for (const c of g.chars) if (!c.removed) c.updateHolds(1 / 120);
  }
  arena.update(dt, t);
  if (Math.round(t*60) % 12 === 0) for (const c of g.chars as Character[]) if (c.alive && (!c.grounded || c.hangingStatic)) log.push(`    t=${t.toFixed(1)} ${c.name} y=${c.position.y.toFixed(2)} x=${c.position.x.toFixed(1)} z=${c.position.z.toFixed(1)} hang=${c.hangingStatic} grab=${c.input.grab} gd=${c.groundDist.toFixed(1)} stag=${c.stagger.toFixed(1)}`);
  for (const c of g.chars as Character[]) {
    if (c.alive && c.torso.position.y < -3.2) {
      c.alive = false;
      const k = c.lastHitBy && c.time - c.lastHitAt < 7 ? c.lastHitBy.name : "self";
      log.push(`t=${t.toFixed(1)} ${c.name} out (by ${k}) dk=${c.dropkickTimer.toFixed(2)} hitAgo=${(c.time-c.lastHitTime).toFixed(1)} held=${c.heldBy} wasKO=${c.koTimer>0} holding=${c.holding}`);
    }
    if (c.torso.position.y < -28) c.removeFromWorld();
  }
}
console.log(log.join("\n"));
console.log(`end t=${t.toFixed(1)} alive=${g.chars.filter((c: Character) => c.alive).map((c: Character) => c.name)} hits=${hits} batHits=${bats} armed=${g.chars.filter((c: Character) => c.weapon).length} kos=${kos}`);
