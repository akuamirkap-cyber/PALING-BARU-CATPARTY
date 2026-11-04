// Headless physics sanity test (not part of the app bundle)
const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }),
};
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY, bodyOwner } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";
import * as rig from "../src/game/rig";

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
(world.solver as CANNON.GSSolver).iterations = 14;
const groundMat = new CANNON.Material("ground");
world.addContactMaterial(new CANNON.ContactMaterial(Character.material, groundMat, { friction: 0.25, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(Character.material, Character.material, { friction: 0.35, restitution: 0.15 }));
const scene = new THREE.Scene();
const arena = new Arena(world, scene, groundMat);
const hooks = { onLand: () => {}, onStep: () => {}, onHit: (a: Character, v: Character, _p: any, d: number, k: string) => console.log(`  HIT ${a.name}->${v.name} ${k} dmg=${d.toFixed(0)} dizzy=${v.dizzy.toFixed(0)}`), onKO: (v: Character) => console.log(`  KO ${v.name}`) };

const A = new Character(world, 0, ANIMALS[0], "A", 1, hooks, new THREE.Vector3(0, 0.05, 0), 0, emptyControl());
const B = new Character(world, 1, ANIMALS[1], "B", 0, hooks, new THREE.Vector3(0, 0.05, 1.5), Math.PI, emptyControl());
Character.all = [A, B];
const H = 1 / 120;
const pt = new CANNON.Vec3();
function sim(sec: number, setInput?: (t: number) => void) {
  const frames = Math.round(sec * 60);
  for (let f = 0; f < frames; f++) {
    setInput?.(f / 60);
    for (const c of Character.all) { c.heldBy = 0; c.carriedBy = null; }
    for (const c of Character.all) for (const h of [c.holds.armL, c.holds.armR]) if (h?.owner) { h.owner.heldBy++; if (c.lifting && h.carry && !h.owner.ko) h.owner.carriedBy = c; }
    for (const c of Character.all) c.updateCollisionMask();
    for (const c of Character.all) c.frameActions(1 / 60);
    for (const c of Character.all) {
      c.input.jump = false;
      c.input.punch = false;
      c.input.headbutt = false;
      c.input.lift = false;
    }
    for (let s = 0; s < 2; s++) {
      for (const c of Character.all) c.physicsStep(H);
      world.step(H);
      for (const con of world.contacts) {
        const a = bodyOwner.get(con.bi), b = bodyOwner.get(con.bj);
        if (a) { con.bi.position.vadd(con.ri, pt); a.char.onContact(a.part, con.bj, pt, b); }
        if (b) { con.bj.position.vadd(con.rj, pt); b.char.onContact(b.part, con.bi, pt, a); }
      }
      for (const c of Character.all) c.updateHolds(H);
    }
    arena.update(1 / 60, 0);
  }
}
const up = (c: Character) => c.torso.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y.toFixed(2);
const p = (c: Character) => `pos=(${c.position.x.toFixed(2)},${c.position.y.toFixed(2)},${c.position.z.toFixed(2)}) up=${up(c)} grounded=${c.grounded} head.y=${c.head.position.y.toFixed(2)} footL.y=${c.legL.position.y.toFixed(2)} hand.y=${c.armL.position.y.toFixed(2)}`;

sim(2);
console.log("idle A:", p(A));
console.log("idle B:", p(B));

// walk A to -x
sim(1, () => { A.input.mx = -1; A.input.mz = 0; });
console.log("walk A:", p(A), "vel", A.torso.velocity.x.toFixed(2));
sim(1.5, () => { A.input.mx = 0; });
console.log("stop A:", p(A));
// run
sim(0.8, () => { A.input.mx = 1; A.input.run = true; });
console.log("run A:", p(A), "vel", A.torso.velocity.x.toFixed(2));
A.input.run = false;
sim(1, () => { A.input.mx = 0; });
// jump
A.input.jump = true;
let maxY = 0;
sim(1.2, () => { maxY = Math.max(maxY, A.position.y); });
console.log("jump peak torso y", maxY.toFixed(2), p(A));

function tp(c: Character, x: number, z: number) {
  const dx = x - c.torso.position.x, dz = z - c.torso.position.z, dy = 0.9 - c.torso.position.y;
  for (const b of c.parts) { b.position.x += dx; b.position.y += dy; b.position.z += dz; b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0); }
}
console.log("pre-tp A:", p(A)); tp(A, 2, -3); tp(B, 2, -1.8); for (let i=0;i<5;i++){ sim(0.1); console.log("  post-tp A:", p(A), "ground:", A.groundBody?.id, bodyOwner.get(A.groundBody!)?.char.name, bodyOwner.get(A.groundBody!)?.part, A.groundDist.toFixed(2), "parts", A.parts.map(b=>b.id).join(",")); }
// move A in front of B and punch repeatedly
A.input.mx = 0;
const face = () => { const dx = B.position.x - A.position.x, dz = B.position.z - A.position.z; const d = Math.hypot(dx, dz); A.input.mx = dx / d * (d > 1.3 ? 1 : 0.2); A.input.mz = dz / d * (d > 1.3 ? 1 : 0.2); };
sim(2, face);
console.log("approach A:", p(A), "dist", A.position.distanceTo(B.position).toFixed(2));
for (let i = 0; i < 12 && !B.ko; i++) { A.input.punch = true; sim(0.35, face); console.log("   B", p(B)); }
console.log("after punches B:", p(B), "ko", B.ko, "dizzy", B.dizzy.toFixed(0));
tp(A, 0, -1.2); tp(B, 0, 0.6); B.knockOut(4); for(let i=0;i<4;i++){ sim(0.1); console.log("  KOfall A", p(A), "B", p(B), "Aground", bodyOwner.get(A.groundBody!)?.char.name); }
// grab B
for (let i=0;i<6;i++){ sim(0.1, () => { face(); A.input.grab = true; });
  const hl = A.armL.pointToWorldFrame(new CANNON.Vec3(0,-0.22,0)); const hr = A.armR.pointToWorldFrame(new CANNON.Vec3(0,-0.22,0));
  let n=0; for (const con of world.contacts){ const a=bodyOwner.get(con.bi), b=bodyOwner.get(con.bj); if(a&&b&&((a.char===A&&b.char===B)||(a.char===B&&b.char===A))) n++; }
  console.log("   handL", hl.toString(), "handR", hr.toString(), "Btorso", B.torso.position.toString(), "contactsAB", n, "ko", B.ko, "Agrab", A.input.grab);
}
console.log("grab: holds", !!A.holds.armL, !!A.holds.armR, "B heldBy", B.heldBy);
console.log("  holding B:", A.holds.armL?.owner?.name, A.holds.armR?.owner?.name);
A.input.punch = true; // lift
sim(1.0, () => { A.input.grab = true; A.input.mx = 0; A.input.mz = 0; });
console.log("lifting:", A.lifting, "B:", p(B), "A:", p(A));
A.input.grab = false;
sim(0.05);
const bx = B.position.clone();
sim(1.0);
console.log("thrown B moved", B.position.vsub(bx).length().toFixed(2), p(B));
sim(5);
console.log("recovered B:", p(B), "ko", B.ko);
console.log("A final:", p(A));
tp(A, 0, -4); tp(B, 0, 0); sim(1);
// dropkick
sim(1.5, face);
A.input.jump = true; sim(0.2, face); A.input.headbutt = true; sim(1.5);
console.log("after dropkick A:", p(A), "B dizzy", B.dizzy.toFixed(0));
sim(2);
console.log("A recovered:", p(A));
// ledge hang
console.log("--- LEDGE ---");
tp(B, -3, -3); B.input = emptyControl();
A.input = emptyControl();
tp(A, 6.6, 0); sim(0.5);
for (let i = 0; i < 8; i++) { sim(0.25, () => { A.input.mx = A.position.x > 7.6 ? -1 : 1; A.input.mz = 0; A.input.grab = true; }); console.log("  ", p(A), "hang", A.hangingStatic, "holds", !!A.holds.armL, !!A.holds.armR); }
sim(1.0, () => { A.input.mx = -1; A.input.grab = true; });
console.log(" hanging after 1s:", p(A), "hang", A.hangingStatic);
A.input.jump = true;
sim(0.1, () => { A.input.mx = -1; A.input.grab = false; });
sim(1.2, () => { A.input.mx = -1; });
console.log(" after climb:", p(A), "safe?", arena.isSafe(A.position.x, A.position.z));
// ---- E-lift + throw, bat pickup + swing ----
console.log("--- LIFT & BAT ---");
tp(A, 0, -1.0); tp(B, 0, 0.0); A.facing = 0; B.input = emptyControl(); A.input = emptyControl(); sim(0.6); console.log("  B ko before lift:", B.ko);
A.input.lift = true; for (let i=0;i<4;i++){ sim(0.2); console.log("   t+", ((i+1)*0.2).toFixed(1), "B y", B.position.y.toFixed(2), "dxz", Math.hypot(B.position.x-A.position.x, B.position.z-A.position.z).toFixed(2), "A up", A.torso.quaternion.vmult(new CANNON.Vec3(0,1,0)).y.toFixed(2), "B dizzy", B.dizzy.toFixed(0), "B heldBy", B.heldBy, "holds", !!A.holds.armL, !!A.holds.armR); }
{ const bu = B.torso.quaternion.vmult(new CANNON.Vec3(0,1,0)); const bz = B.torso.quaternion.vmult(new CANNON.Vec3(0,0,1));
  console.log("E-lift: lifting", A.lifting, "B y", B.position.y.toFixed(2), "A head y", A.head.position.y.toFixed(2), "B carried", !!B.carriedBy, "B expr", B.expr, "B bodyAxisY", bu.y.toFixed(2), "B bellyUp", bz.y.toFixed(2), "dxz", Math.hypot(B.position.x-A.position.x, B.position.z-A.position.z).toFixed(2)); }
const bpre = B.position.clone();
A.input.lift = true; sim(1.0);
console.log("E-throw: B moved", B.position.vsub(bpre).length().toFixed(2), "lifting", A.lifting);
sim(4);
const bat = arena.bats[0];
Character.bats = arena.bats;
tp(A, bat.body.position.x, bat.body.position.z - 0.7); sim(0.4);
A.input.lift = true; sim(0.3);
console.log("bat equipped", A.weapon === bat, "inWorld", world.bodies.includes(bat.body));
tp(B, A.position.x, A.position.z + 0.95); B.koTimer = 0; B.dizzy = 0; sim(0.3);
const b0 = B.position.clone();
A.facing = 0; A.input.punch = true; sim(0.9);
console.log("bat grip-to-tip", A.batGrip.distanceTo(A.batB).toFixed(2), "B expr", B.expr);
console.log("swing: B dizzy", B.dizzy.toFixed(0), "ko", B.ko, "B moved", B.position.vsub(b0).length().toFixed(2));
A.input.lift = true; sim(0.1);
console.log("bat thrown: weapon", A.weapon, "inWorld", world.bodies.includes(bat.body), "vel", bat.body.velocity.length().toFixed(1));

// head stability: angle between head up and torso up while running
{
  tp(A, 0, -3); A.input = emptyControl(); sim(0.5);
  let worst = 0;
  sim(1.5, () => { A.input.mx = Math.sin(A.time * 2); A.input.mz = Math.cos(A.time * 2); A.input.run = true;
    const hu = A.head.quaternion.vmult(new CANNON.Vec3(0, 1, 0)), tu = A.torso.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const hz = A.head.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), tz = A.torso.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    worst = Math.max(worst, Math.acos(Math.min(1, hu.dot(tu))) * 57.3, Math.acos(Math.min(1, hz.dot(tz))) * 57.3); });
  console.log("head max deviation while running (deg):", worst.toFixed(1), "A expr", A.expr);
  { let tilt = 0; const keepB = B.position.clone(); tp(B, 30, 30); sim(1.5, () => { A.input.mx = Math.sin(A.time * 2); A.input.mz = Math.cos(A.time * 2); A.input.run = true;
      const hu = A.head.quaternion.vmult(new CANNON.Vec3(0, 1, 0)), tu = A.torso.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      tilt = Math.max(tilt, Math.acos(Math.min(1, hu.dot(tu))) * 57.3); });
    console.log("  head TILT (up-vector) while running, nobody nearby (deg):", tilt.toFixed(1)); tp(B, keepB.x, keepB.z); }
  const hand = A.armL.pointToWorldFrame(new CANNON.Vec3(0, -0.257, 0));
  console.log("idle/run hand below shoulder:", (A.torso.position.y + 0.1 - hand.y).toFixed(2));
}
// ---- self-collision: max paw/forearm penetration into own torso/head ----
{
  console.log("--- SELF COLLISION ---");
  const pen = (c: Character) => {
    let worst = 0;
    for (const arm of [c.armL, c.armR]) for (const ap of (c as any).armPts) {
      const wp = arm.pointToWorldFrame(new CANNON.Vec3(0, ap.y, 0.01));
      for (const [body, vols] of [[c.torso, c.vols.torso], [c.head, c.vols.head]] as const) {
        const l = body.pointToLocalFrame(wp); const l0 = l.clone();
        if (rig.pushOut(l, ap.r, vols)) worst = Math.max(worst, l.vsub(l0).length());
      }
    }
    return worst;
  };
  const run = (label: string, sec: number, f?: () => void) => { let w = 0; sim(sec, () => { f?.(); w = Math.max(w, pen(A)); }); console.log(`  ${label.padEnd(10)} max penetration ${(w * 100).toFixed(1)} cm  Apos ${A.position.toString()} B ${B.position.toString()}`); };
  tp(A, 0, -2); tp(B, 3, 3); A.input = emptyControl(); A.koTimer = 0; sim(0.5);
  run("idle", 1.5);
  run("run", 2, () => { A.input.mx = Math.sin(A.time * 3); A.input.mz = Math.cos(A.time * 3); A.input.run = true; });
  A.input = emptyControl(); tp(A, 0, -2); sim(0.5);
  run("punch", 2, () => { if (Math.round(A.time * 60) % 20 === 0) A.input.punch = true; });
  tp(A, 0, -2); sim(0.3);
  A.knockOut(2.5);
  run("KO", 2.5);
  // ---- look-at ----
  console.log("--- LOOK AT ---");
  A.koTimer = 0; A.input = emptyControl(); tp(A, 0, 0); tp(B, 2.5, 0.8); A.facing = 0; B.input = emptyControl(); sim(1.5, () => { A.facing = 0; });
  const fT = A.torso.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), fH = A.head.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
  const yawRel = (Math.atan2(fH.x, fH.z) - Math.atan2(fT.x, fT.z)) * 57.3;
  console.log("  B alive", B.alive, "removed", B.removed, "Bpos", B.head.position.toString(), "Apos", A.head.position.toString(), "A ko", A.ko, "A carried", !!A.carriedBy, "A lifting", A.lifting);
  console.log("  target", A.lookTarget?.name, "head yaw vs body (deg):", yawRel.toFixed(1), "(B is to A's left/+x)");
  A.syncVisual();
  console.log("  pupX", A.pupX.toFixed(2), "pupil offsets", A.visual.pupils.map((p) => p.g.position.x.toFixed(3)).join(","));
}
// ---- accessories ----
{
  console.log("--- ACCESSORIES ---");
  const scene = new THREE.Scene();
  const C = new Character(world, 5, ANIMALS[0], "C", 0, hooks as any, new THREE.Vector3(-3, 0.05, -3), 0, emptyControl(), "capRed");
  const D = new Character(world, 6, ANIMALS[1], "D", 0, hooks as any, new THREE.Vector3(-3, 0.05, -1.8), Math.PI, emptyControl(), "helmet");
  const E = new Character(world, 7, ANIMALS[2], "E", 0, hooks as any, new THREE.Vector3(3, 0.05, -3), 0, emptyControl(), "dolit");
  for (const c of [C, D, E]) scene.add(c.root);
  Character.all = [A, B, C, D, E];
  sim(0.6);
  console.log("  C acc", C.accKind, "D acc", D.accKind, "E acc", E.accKind, "E googly", E.visual.googly.length, "helmet headTop", D.headTop.toFixed(2), "vs", C.headTop.toFixed(2));
  // helmet damage reduction on headshot
  const d0 = D.dizzy; D.receiveHit(C, 20, new CANNON.Vec3(0, 0, 1), 3, D.head); console.log("  helmet headshot dizzy +", (D.dizzy - d0).toFixed(1), "(20 without helmet)");
  // knock the cap off
  C.knockAccessory(new CANNON.Vec3(1, 0, 0));
  console.log("  cap knocked:", C.accKind, "loose", Character.loose.length, "inWorld", world.bodies.includes(Character.loose[0]?.body));
  const y0 = Character.loose[0].body.position.y;
  sim(1.5, () => { for (const l of Character.loose) { l.mesh.position.set(l.body.position.x, l.body.position.y, l.body.position.z); } });
  console.log("  loose cap fell from", y0.toFixed(2), "to", Character.loose[0].body.position.y.toFixed(2));
  D.knockAccessory(new CANNON.Vec3(1, 0, 0)); console.log("  helmet stays on:", D.accKind);
  // googly pupils move when the head shakes
  const p0 = E.visual.googly[0].pupil.position.clone();
  for (let i = 0; i < 20; i++) { E.head.velocity.set(Math.sin(i) * 4, 0, 0); E.syncVisual(); }
  console.log("  googly pupil moved", E.visual.googly[0].pupil.position.distanceTo(p0).toFixed(3));
}
