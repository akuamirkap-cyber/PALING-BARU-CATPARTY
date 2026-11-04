const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";
import { BombSystem } from "../src/game/Bombs";
import { Game } from "../src/game/Game";

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
(world.solver as CANNON.GSSolver).iterations = 14;
const arena = new Arena(world, new THREE.Scene(), new CANNON.Material("g"));
Character.bats = arena.bats;
const hooks = { onLand() {}, onStep() {}, onHit() {}, onKO() {} } as any;
const g: any = Object.create(Game.prototype);
g.arena = arena;
g.world = world;
g.chars = [];
g.brains = new Map();
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const c = new Character(world, i, ANIMALS[i], "bot" + i, 0, hooks, new THREE.Vector3(Math.cos(a) * 4, 0.05, Math.sin(a) * 4), Math.atan2(-Math.cos(a), -Math.sin(a)), emptyControl());
  g.chars.push(c);
  g.brains.set(c, { target: null, retarget: 0, punchT: 0, grabT: 0, dropkickT: 0, throwT: 0, climbT: 0.8, holdT: 0, aggro: 0.85, runFlag: false, wander: 0, batPref: true });
}
Character.all = g.chars;
let explosions = 0, hits = 0, throws = 0, picks = 0, selfBoom = 0, maxSimul = 0;
let lastHolders = new Map<Character, boolean>();
const sys = new BombSystem(world, g.chars[0].root.parent ?? new THREE.Scene(), {
  onExplode: (b, h) => {
    explosions++;
    hits += h;
    if (b.thrower && b.thrower.dizzy > 25) selfBoom++;
  },
  onWave: () => {},
}, 1.7);
g.bombSys = sys;
sys.reset();
const t0 = performance.now();
for (let f = 0; f < 60 * 70; f++) {
  const dt = 1 / 60;
  for (const c of g.chars) {
    const held = g.heldBomb(c);
    c.input = c.alive ? g.botControl(c, dt) : emptyControl();
    if (c.input.lift && held) throws++;
    if (c.input.lift && !held) picks++;
    lastHolders.set(c, !!held);
  }
  for (const c of g.chars) { c.heldBy = 0; c.carriedBy = null; }
  for (const c of g.chars) for (const h of [c.holds.armL, c.holds.armR]) if (h?.owner) { h.owner.heldBy++; if (c.lifting && h.carry) h.owner.carriedBy = c; }
  for (const c of g.chars) c.updateCollisionMask();
  for (const c of g.chars) if (!c.removed) c.frameActions(dt);
  for (let s = 0; s < 2; s++) {
    for (const c of g.chars) c.physicsStep(1 / 120);
    world.step(1 / 120);
    for (const c of g.chars) c.updateHolds(1 / 120);
  }
  if (f > 120) sys.update(dt, g.chars.filter((c: Character) => c.alive), (x: number, z: number) => arena.isSafe(x, z, 0.2));
  arena.update(dt, 0);
  maxSimul = Math.max(maxSimul, sys.bombs.length);
  if (f % 600 === 0) {
    for (const c of g.chars) for (const pb of c.parts) if (pb.position.y < -12) { pb.position.set(0, 1, 0); pb.velocity.set(0, 0, 0); }
  }
}
console.log({ explosions, hits, throws, picks, selfBoom, maxSimul, maxBombs: sys.maxBombs, ms: Math.round(performance.now() - t0) });
console.log("alive holders:", g.chars.map((c: Character) => (g.heldBomb(c) ? "B" : c.weapon ? "T" : "-")).join(""));

// ---------- focused: one bot holding a bomb vs one enemy ----------
{
  const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  w.broadphase = new CANNON.SAPBroadphase(w);
  (w.solver as CANNON.GSSolver).iterations = 14;
  const ar = new Arena(w, new THREE.Scene(), new CANNON.Material("g2"));
  Character.bats = ar.bats;
  const g2: any = Object.create(Game.prototype);
  g2.world = w; g2.arena = ar; g2.chars = []; g2.brains = new Map();
  const mk = (i: number, slot: 0 | 1, x: number, z: number) => {
    const c = new Character(w, i, ANIMALS[i], "c" + i, slot, hooks, new THREE.Vector3(x, 0.05, z), 0, emptyControl());
    g2.chars.push(c);
    return c;
  };
  const bot = mk(0, 0, 0, 0);
  const enemy = mk(1, 1, 0, 3.4);
  g2.brains.set(bot, { target: enemy, retarget: 9, punchT: 0, grabT: 0, dropkickT: 0, throwT: 0, climbT: 0, holdT: 0, aggro: 1, runFlag: false, wander: 0, batPref: true });
  Character.all = g2.chars;
  const sys2 = new BombSystem(w, new THREE.Scene(), { onExplode: () => {}, onWave: () => {} }, 1.7);
  g2.bombSys = sys2; sys2.reset();
  (sys2 as any).alive = 5;
  sys2.spawn(() => true, g2.chars);
  const bomb = sys2.bombs[0];
  bomb.body.position.set(0, 1, 0.5);
  bomb.fuse = 5;
  (bot as any).carryNow(bomb.body, null);
  const dizzy0 = enemy.dizzy;
  let thrownFrame = -1, aimedFrames = 0;
  for (let f = 0; f < 240; f++) {
    bot.input = g2.botControl(bot, 1 / 60);
    if (bot.input.lift && thrownFrame < 0) thrownFrame = f;
    if (!bot.holding) break;
    for (const c of g2.chars) { c.heldBy = 0; c.carriedBy = null; c.frameActions(1 / 60); }
    for (let s = 0; s < 2; s++) { for (const c of g2.chars) c.physicsStep(1 / 120); w.step(1 / 120); for (const c of g2.chars) c.updateHolds(1 / 120); }
    sys2.update(1 / 60, g2.chars, () => true);
    ar.update(1 / 60, 0);
  }
  // let it fly and explode
  for (let f = 0; f < 240; f++) {
    for (const c of g2.chars) c.frameActions(1 / 60);
    for (let s = 0; s < 2; s++) { for (const c of g2.chars) c.physicsStep(1 / 120); w.step(1 / 120); for (const c of g2.chars) c.updateHolds(1 / 120); }
    sys2.update(1 / 60, g2.chars, () => true);
  }
  console.log("focused: bot threw at frame", thrownFrame, "facing err", (() => { const a = Math.atan2(enemy.position.x - bot.position.x, enemy.position.z - bot.position.z); let d = a - bot.facing; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d.toFixed(2); })(), "enemy dizzy +", (enemy.dizzy - dizzy0).toFixed(0), "bombs left", sys2.bombs.length);
  void aimedFrames;
}
