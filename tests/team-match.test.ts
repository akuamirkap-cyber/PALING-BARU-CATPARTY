import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { Character } from '../src/game/Character';
import { ANIMALS } from '../src/game/animals';
import { emptyControl } from '../src/game/input';
import { createRoster, teamStocks, TEAM_LIVES, type GameOptions } from '../src/game/Game';

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
  const hits: { attacker: string; victim: string; dmg: number }[] = [];
  const hooks = {
    onHit: (a: Character, v: Character, _p: CANNON.Vec3, d: number) => hits.push({ attacker: a.name, victim: v.name, dmg: d }),
    onKO() {}, onLand() {}, onStep() {},
  };
  const make = (index: number, name: string, team: number, x: number, z: number, yaw = 0) => {
    const c = new Character(world, index, ANIMALS[index % ANIMALS.length], name, 0, hooks, new THREE.Vector3(x, 0.05, z), yaw, emptyControl());
    c.team = team;
    return c;
  };
  Character.all = [];
  Character.bats = [];
  Character.thrownProps = [];
  return { world, hits, make };
}

function step(world: CANNON.World, chars: Character[], i: number) {
  if (i % 2 === 0) for (const c of chars) c.frameActions(1 / 60);
  for (const c of chars) c.physicsStep(H);
  world.step(H);
  for (const c of chars) c.updateHolds(H);
}

test('team matches never let a cat hurt its own teammate', () => {
  const { world, hits, make } = setup();
  // two red teammates face each other point blank; an enemy stands behind
  const a = make(0, 'RED_A', 0, 0, 0, 0);
  const mate = make(1, 'RED_B', 0, 0, 0.8, Math.PI);
  const foe = make(2, 'BLUE', 1, 0, -0.9, Math.PI);
  Character.all = [a, mate, foe];
  for (let i = 0; i < 120; i++) step(world, [a, mate, foe], i); // settle
  for (let i = 0; i < 240; i++) {
    a.input.punch = i % 40 === 0;
    step(world, [a, mate, foe], i);
  }
  assert.equal(hits.filter((h) => h.attacker === 'RED_A' && h.victim === 'RED_B').length, 0, 'a punch must never register on a teammate');
  assert.ok(mate.hurtT <= 0 && mate.dizzy === 0, 'teammate took no stagger from the punches');
  assert.ok(foe.hurtT <= 0 && foe.dizzy === 0, 'the enemy behind the teammate was never reached by accident');
  // the same punch at an enemy does land
  const world2setup = setup();
  const p = world2setup.make(0, 'RED', 0, 0, 0, 0);
  const e = world2setup.make(1, 'BLUE', 1, 0, 0.9, Math.PI);
  Character.all = [p, e];
  for (let i = 0; i < 120; i++) step(world2setup.world, [p, e], i);
  for (let i = 0; i < 240; i++) {
    p.input.punch = i % 40 === 0;
    step(world2setup.world, [p, e], i);
  }
  assert.ok(world2setup.hits.some((h) => h.attacker === 'RED' && h.victim === 'BLUE'), 'the same punch still lands on an enemy');
  p.removeFromWorld(); e.removeFromWorld();
  a.removeFromWorld(); mate.removeFromWorld(); foe.removeFromWorld();
});

test('a teammate cannot be grabbed, lifted or tackle-hit either', () => {
  const { world, make } = setup();
  const a = make(0, 'RED_A', 0, 0, 0, 0);
  const mate = make(1, 'RED_B', 0, 0, 0.9, Math.PI);
  Character.all = [a, mate];
  for (let i = 0; i < 120; i++) step(world, [a, mate], i);
  for (let i = 0; i < 180; i++) {
    a.input.grab = true; // try to lift the teammate standing right in front
    step(world, [a, mate], i);
  }
  assert.ok(!a.holds.armL && !a.holds.armR, 'grab never attaches to a teammate');
  assert.ok(!a.holding, 'no teammate carry');
  // dropkick through the teammate must not damage them
  a.input.grab = false;
  for (let i = 0; i < 60; i++) step(world, [a, mate], i);
  a.input.headbutt = true;
  for (let i = 0; i < 120; i++) step(world, [a, mate], i);
  assert.ok(mate.hurtT <= 0 && mate.dizzy === 0, 'tackle through a teammate deals nothing');
  a.removeFromWorld(); mate.removeFromWorld();
});

test('team roster is a real 5v5 with humans anchored on opposite teams', () => {
  const base: GameOptions = {
    p1Animal: ANIMALS[0].id, p2Animal: ANIMALS[1].id, twoPlayer: false,
    p1Acc: 'none', p2Acc: 'none', bots: 9, mode: 'teams',
    camMode: 'stumble', camZoom: 1, onHud: () => {},
  };
  const solo = createRoster(base);
  assert.equal(solo.length, 10, '1P team match fields 10 cats');
  assert.deepEqual(countTeams(solo), [5, 5], '5 red vs 5 blue');
  assert.equal(solo[0].team, 0, 'you start on the red team');
  assert.ok(solo.slice(1).some((r) => r.team === 0), 'you get 4 bot teammates');

  const duo = createRoster({ ...base, twoPlayer: true, bots: 8 });
  assert.equal(duo.length, 10, '2P team match fields 10 cats');
  assert.deepEqual(countTeams(duo), [5, 5], '5 red vs 5 blue with P2 too');
  assert.equal(duo[0].team, 0, 'P1 is red');
  assert.equal(duo[1].team, 1, 'P2 anchors the blue team');

  const ffa = createRoster({ ...base, mode: 'brawl' });
  assert.ok(ffa.every((r) => r.team === -1), 'brawl stays a free-for-all');
});

function countTeams(roster: ReturnType<typeof createRoster>): [number, number] {
  const t = [0, 0];
  for (const r of roster) if (r.team >= 0) t[r.team]++;
  return t;
}

test('bot brains only hunt the enemy team', async () => {
  const { Game } = await import('../src/game/Game');
  const { world, make } = setup();
  const bot = make(0, 'BOT_RED', 0, 0, 0, 0);
  const mate = make(1, 'MATE_RED', 0, 1.2, 1.2, 0);
  const foeA = make(2, 'FOE_BLUE', 1, -2.5, 0, 0);
  const foeB = make(3, 'FOE_BLUE2', 1, 2.5, 0, 0);
  Character.all = [bot, mate, foeA, foeB];
  const brain = {
    target: null as Character | null, retarget: 0, punchT: 0, grabT: 0, dropkickT: 0, throwT: 0, climbT: 0.8,
    holdT: 0, aggro: 0.9, runFlag: false, wanderX: 0, wanderZ: 0, wanderT: 0, strafeT: 0, strafeDir: 1,
    strikeT: 0.2, reactT: 0, retreatT: 0, pounceCd: 0, batPref: false, aimT: 0, fleeT: 0, fleeX: 0, fleeZ: 0, hadBomb: false,
  };
  const arena = {
    sweeper: null,
    isSafe: (x: number, z: number) => Math.abs(x) < 4.5 && Math.abs(z) < 4.5,
    safeHalf: () => 4.5,
    randomSafePoint: () => ({ x: (Math.random() * 2 - 1) * 3, z: (Math.random() * 2 - 1) * 3 }),
  };
  const game = { brains: new Map([[bot, brain]]), chars: [bot, mate, foeA, foeB], arena, world, opts: { mode: 'teams' }, frameBombs: [] } as unknown as InstanceType<typeof Game>;
  const seen = new Set<string>();
  let punches = 0;
  for (let i = 0; i < 600; i++) {
    bot.input = Game.prototype.botControl.call(game, bot, 1 / 60);
    if (brain.target) seen.add(brain.target.name);
    if (bot.input.punch) punches++;
    step(world, [bot, mate, foeA, foeB], i);
  }
  assert.ok(seen.size > 0, 'the brain locks onto someone');
  assert.ok([...seen].every((n) => n.startsWith('FOE')), `the brain only ever locks onto the blue team (saw: ${[...seen].join(', ')})`);
  assert.ok(punches > 0, 'the bot still fights');
  bot.removeFromWorld(); mate.removeFromWorld(); foeA.removeFromWorld(); foeB.removeFromWorld();
});

test('a fallen team cat keeps its lives, parks, and respawns with a fresh body', async () => {
  const { world, make } = setup();
  const a = make(0, 'RED_A', 0, 0, 0, 0);
  Character.all = [a];
  a.lives = TEAM_LIVES;
  for (let i = 0; i < 120; i++) step(world, [a], i);
  a.parkForRespawn();
  assert.ok(!a.alive && !a.root.visible, 'parked cat is hidden and out of play');
  for (let i = 0; i < 60; i++) step(world, [a], i);
  assert.ok(Math.abs(a.torso.position.y + 8) < 0.01, 'parked cat freezes below the deck instead of falling forever');
  a.respawnAt(1.5, 0.05, -1.2, 1.2);
  assert.ok(a.alive && a.root.visible, 'respawned cat is back in play');
  assert.ok(Math.hypot(a.torso.position.x - 1.5, a.torso.position.z + 1.2) < 0.05, 'respawn lands at the requested spot');
  assert.equal(a.torso.velocity.length(), 0, 'respawn starts at rest');
  assert.equal(a.dizzy, 0, 'respawn clears the dizzy meter');
  assert.equal(a.holds.armL, null && a.holds.armR, null, 'respawn drops every hold');
  for (let i = 0; i < 90; i++) step(world, [a], i);
  assert.ok(a.grounded, 'the respawned cat settles back onto the deck');
  a.removeFromWorld();
});

test('teamStocks counts lives of the fighting and the waiting, not the gone', () => {
  const cat = (over: Partial<{ removed: boolean; alive: boolean; team: number; lives: number; respawnT: number }>) => ({
    removed: false, alive: true, team: 0, lives: TEAM_LIVES, respawnT: 0, ...over,
  });
  const chars = [
    cat({ team: 0, lives: 3 }),                       // red fighting, 3 stocks
    cat({ team: 0, alive: false, lives: 2, respawnT: 1.2 }), // red waiting to respawn: 2 stocks
    cat({ team: 0, alive: false, lives: 0 }),         // red gone for good
    cat({ team: 1, lives: 1 }),                       // blue on its last life
    cat({ team: 1, removed: true, lives: 0 }),        // blue removed from the world
    cat({ team: -1, lives: 5 }),                      // no-team cat never counts
  ];
  assert.deepEqual(teamStocks(chars as never), [5, 1], 'red has 3+2 in play, blue is down to its last life');
  assert.deepEqual(teamStocks([cat({ team: 1, alive: false, lives: 0 })] as never), [0, 0], 'a fully dead team scores zero');
});
