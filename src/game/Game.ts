import * as CANNON from "cannon-es";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, BOT_NAMES, animalById, type AccessoryId, type AnimalDef, type AnimalId } from "./animals";
import { Arena } from "./Arena";
import { createRenderer } from "../components/webgl";
import { ShipArena, type ArenaLike } from "./ShipArena";
import { Seagull } from "./Seagull";
import { BLAST_R, BombManager, type Bomb } from "./Bombs";
import { Character, GRAVITY, bodyOwner, type Bat, type CharacterHooks } from "./Character";
import { attachInput, detachInput, emptyControl, endFrameInput, readControls, type ControlState } from "./input";
import { sfx } from "./audio";
import * as rig from "./rig";
import { getTuning } from "./tuning";
import { flagEmoji, pickFlags } from "./flags";
import { qualityPixelRatio } from "./quality";
import { randomFaceCombo, isDefaultFace, type EyeStyleId, type ExpressionId } from "./eyes";
import { disposeCharacterDetails } from "./characterMesh";
import { impactEffect, knockoutEffectColor } from "./impactEffects";
const _ev = new THREE.Vector3();

/** Face combos every cat gets — from the existing styles, never grumpy. */
const randomFace = randomFaceCombo;

export interface GameOptions {
  p1Animal: AnimalId;
  twoPlayer: boolean;
  p2Animal: AnimalId;
  p1Acc: AccessoryId;
  p2Acc: AccessoryId;
  p1Eyes?: EyeStyleId;
  p1Expression?: ExpressionId;
  bots: number;
  mode: "brawl" | "bomb" | "teams";
  camMode: "stumble" | "gang";
  camZoom: number; // 0.7 dekat · 1 normal · 1.35 jauh
  arena?: "plane" | "ship";
  shipScale?: number; // skala kapal pesiar (0.4 = normal, 1.6 = 4x, 2.8 = 7x)
  onHud: (s: HudState) => void;
  preparedRoster?: RosterEntry[];
}

export interface HudPlayer {
  id: number;
  animal: AnimalId;
  eyeStyle: EyeStyleId;
  expression: ExpressionId;
  name: string;
  emoji: string;
  color: string;
  dizzy: number;
  ko: boolean;
  alive: boolean;
  slot: number;
  wins: number;
  team: number;
  lives: number;
  flag: string;
}

export interface HudState {
  phase: "countdown" | "playing" | "roundEnd";
  countdown: number;
  timeLeft: number;
  alive: number;
  total: number;
  round: number;
  players: HudPlayer[];
  feed: { id: number; text: string }[];
  banner: string | null;
  winner: { name: string; emoji: string; human: boolean; animal: AnimalId | null; eyeStyle: EyeStyleId; expression: ExpressionId; team?: 0 | 1 } | null;
  meAlive: boolean;
  respawnIn: number | null;
  mode: "brawl" | "bomb" | "teams";
  teamMode: boolean;
  teamWins: [number, number];
  teamAlive: [number, number];
  bombs: number;
  weaponContest: { owner: string; challenger: string; ownerPresses: number; challengerPresses: number; p1: boolean; p2: boolean } | null;
}

export interface TeamWinner {
  team: 0 | 1;
}

export interface RosterEntry {
  acc: AccessoryId;
  eyeStyle: EyeStyleId;
  expression: ExpressionId;
  def: AnimalDef;
  name: string;
  slot: 0 | 1 | 2;
  wins: number;
  team: number;
  flag: string;
}

interface Brain {
  batPref: boolean;
  target: Character | null;
  retarget: number;
  punchT: number;
  grabT: number;
  dropkickT: number;
  throwT: number;
  climbT: number;
  holdT: number;
  aggro: number;
  runFlag: boolean;
  /** patrol waypoint (no enemies left): walk somewhere on purpose */
  wanderX: number;
  wanderZ: number;
  wanderT: number;
  /** circling at striking distance: flips now and then so it reads as footwork */
  strafeT: number;
  strafeDir: number;
  /** rhythm of actual swings + reaction delay after locking on */
  strikeT: number;
  reactT: number;
  /** give ground for a beat after eating a hit */
  retreatT: number;
  /** cooldown for the flying tackle approach */
  pounceCd: number;
  aimT: number;
  fleeT: number;
  fleeX: number;
  fleeZ: number;
  hadBomb: boolean;
}

/** Build once before loading so the worker prepares the same cats used by the match. */
export function createRoster(opts: Pick<GameOptions, "p1Animal" | "p2Animal" | "p1Acc" | "p2Acc" | "p1Eyes" | "p1Expression" | "twoPlayer" | "bots" | "mode">): RosterEntry[] {
  const teams = opts.mode === "teams";
  const counts = [0, 0];
  const pickTeam = () => {
    // P1 opens on red, P2 anchors blue; bots balance to a 5v5 split
    const t = counts[0] <= counts[1] ? 0 : 1;
    counts[t]++;
    return t;
  };
  const flags = pickFlags(32).filter((f) => f !== "id"); // Indonesia is yours
  let flagIdx = 0;
  const nextFlag = () => flags[flagIdx++ % flags.length];
  // Jambul is a costume character: its face IS the plush look, so only an
  // explicit wardrobe pick may override it (random faces stay the recipe face).
  const plushFace = { eyeStyle: "default" as EyeStyleId, expression: "default" as ExpressionId };
  const youFace = isDefaultFace(opts.p1Eyes ?? "default", opts.p1Expression ?? "default") ? randomFace() : { eyeStyle: opts.p1Eyes!, expression: opts.p1Expression! };
  const youDef = animalById(opts.p1Animal);
  const youFinal = youDef.id === "jambul" && isDefaultFace(opts.p1Eyes ?? "default", opts.p1Expression ?? "default") ? plushFace : youFace;
  const roster: RosterEntry[] = [{
    def: youDef, name: "KAMU", slot: 1, wins: 0, acc: opts.p1Acc,
    eyeStyle: youFinal.eyeStyle, expression: youFinal.expression, team: teams ? pickTeam() : -1,
    flag: "id", // kamu selalu tampil dengan bendera Indonesia
  }];
  if (opts.twoPlayer) {
    const p2Face = randomFace();
    const p2Def = animalById(opts.p2Animal);
    const p2Final = p2Def.id === "jambul" ? plushFace : p2Face;
    roster.push({ def: p2Def, name: "P2", slot: 2, wins: 0, acc: opts.p2Acc, eyeStyle: p2Final.eyeStyle, expression: p2Final.expression, team: teams ? 1 : -1, flag: nextFlag() });
    if (teams) counts[1]++;
  }
  const used = new Set<AnimalId>(roster.map(r => r.def.id));
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < opts.bots; i++) {
    let pool = ANIMALS.filter(a => !used.has(a.id));
    if (!pool.length) pool = ANIMALS;
    const def = pool[Math.floor(Math.random() * pool.length)];
    used.add(def.id);
    const acc: AccessoryId = Math.random() < 0.7 ? ACCESSORIES[1 + Math.floor(Math.random() * (ACCESSORIES.length - 1))].id : "none";
    const face = def.id === "jambul" ? plushFace : randomFace();
    roster.push({ def, name: names[i % names.length], slot: 0, wins: 0, acc, eyeStyle: face.eyeStyle, expression: face.expression, team: teams ? pickTeam() : -1, flag: nextFlag() });
  }
  return roster;
}

/** lives each cat gets in a team match (Digimon-style stock) */
export const TEAM_LIVES = 3;

/** Remaining stocks per team: alive cats plus the lives they still hold. */
export function teamStocks(chars: { removed: boolean; alive: boolean; team: number; lives: number; respawnT: number }[]): [number, number] {
  const t: [number, number] = [0, 0];
  for (const c of chars) {
    if (c.removed || c.team < 0) continue;
    const waiting = !c.alive && c.respawnT > 0;
    if (c.alive || waiting) t[c.team] += Math.max(0, c.lives);
  }
  return t;
}

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
}

const P_COUNT = 110;
const _pm = new THREE.Matrix4();
const _pq = new THREE.Quaternion();
const _ps = new THREE.Vector3();
const _pc = new THREE.Color();
// hot-loop scratch (zero allocation in physics + camera)
const _pt = new CANNON.Vec3();
const _hitDir = new CANNON.Vec3();
const _hitPos = new CANNON.Vec3();
const _camF = new THREE.Vector3();
const _camT = new THREE.Vector3();
const SWEEP_X = new CANNON.Vec3(1, 0, 0);
const _sweepDir = new CANNON.Vec3();

const H = 1 / 120;
const ROUND_TIME = 100;

export class Game {
  container: HTMLElement;
  opts: GameOptions;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: CANNON.World;
  groundMat = new CANNON.Material("ground");
  arena: ArenaLike | null = null;
  chars: Character[] = [];
  brains = new Map<Character, Brain>();
  teamWins: [number, number] = [0, 0];
  roster: RosterEntry[] = [];
  phase: HudState["phase"] = "countdown";
  countdown = 3.5;
  timeLeft = ROUND_TIME;
  private seagull: Seagull | null = null;
  round = 0;
  feed: { id: number; text: string; t: number }[] = [];
  feedId = 0;
  banner: { text: string; t: number } | null = null;
  winner: HudState["winner"] = null;
  shake = 0;
  camPos = new THREE.Vector3(0, 14, 16);
  camLook = new THREE.Vector3();
  camYaw = Math.PI; // current camera forward yaw (π = fixed south view)
  camMode: "stumble" | "gang" = "gang";
  camZoom = 1;
  arenaZoom = 1; // kamera menjauh otomatis saat kapal dibesarkan (1x..7x)
  setCam(mode: "stumble" | "gang", zoom: number) {
    this.camMode = mode;
    this.camZoom = zoom;
  }
  particles: Particle[] = [];
  pMesh: THREE.InstancedMesh | null = null;
  raf = 0;
  last = 0;
  acc = 0;
  hudTimer = 0;
  lastCount = 4;
  events = { sweeper: false, ring3: false, ring2: false, ring1: false };
  resizeObs: ResizeObserver;
  disposed = false;
  tearT = 0;
  batOf = new Map<CANNON.Body, Bat>();
  bombs: BombManager | null = null;
  // adaptive quality (keeps FPS ultra smooth on weak devices)
  qLevel = 0;
  qBasePR = 1.5;
  fpsEMA = 60;
  qTimer = 0;
  qGoodTimer = 0;
  sun: THREE.DirectionalLight | null = null;
  frameBombs: Bomb[] = [];

  constructor(container: HTMLElement, opts: GameOptions) {
    this.container = container;
    this.opts = opts;
    this.camMode = opts.camMode;
    this.camZoom = opts.camZoom;

    const renderer = createRenderer(container, { antialias: true, powerPreference: "high-performance" });
    if (!renderer) throw new Error("WebGL tidak tersedia di perangkat ini");
    this.renderer = renderer;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.qBasePR = Math.min(window.devicePixelRatio || 1, smallScreen ? 1.5 : 2);
    this.renderer.setPixelRatio(this.qBasePR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Neutral tone mapping keeps the candy colours saturated (ACES washed them out)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.4, 300);
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    // sky
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xb8e6ff, 50, 130);
    // Warm-white sky fill instead of a blue one: the blue tint used to wash the
    // orange fur out to beige in the arena.
    this.scene.add(new THREE.HemisphereLight(0xfff3e4, 0xffd9b0, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
    sun.position.set(9, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.sun = sun;
    const sc = sun.shadow.camera;
    sc.left = -13;
    sc.right = 13;
    sc.top = 13;
    sc.bottom = -13;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    // physics
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
    const broadphase = new CANNON.SAPBroadphase(this.world);
    // Long, thin plane sections have huge bounding spheres. AABB checks avoid
    // sending distant characters and props through the expensive narrow phase.
    broadphase.useBoundingBoxes = true;
    this.world.broadphase = broadphase;
    (this.world.solver as CANNON.GSSolver).iterations = 10;
    this.world.allowSleep = false;
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.05;
    const cm = Character.material;
    this.world.addContactMaterial(new CANNON.ContactMaterial(cm, this.groundMat, { friction: 0.25, restitution: 0.02 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(cm, cm, { friction: 0.35, restitution: 0.15 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.groundMat, { friction: 0.4, restitution: 0.2 }));

    // The roster can be prepared by the loading worker before WebGL starts.
    this.roster.push(...(opts.preparedRoster ?? createRoster(opts)));

    // particles pool
    const pg = new THREE.SphereGeometry(1, 8, 6);
    // single instanced draw call for ALL particles (was 110 meshes + 110 materials)
    this.pMesh = new THREE.InstancedMesh(
      pg,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false }),
      P_COUNT
    );
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.visible = false;
    this.pMesh.frustumCulled = false;
    _pm.makeScale(0, 0, 0);
    for (let i = 0; i < P_COUNT; i++) {
      this.pMesh.setMatrixAt(i, _pm);
      this.pMesh.setColorAt(i, _pc.setHex(0xffffff));
      this.particles.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, grow: 1 });
    }
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.pMesh);

    attachInput();
    this.startRound();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  /** auto quality: drop pixel ratio / shadow res when FPS sags, restore when smooth */
  private applyQuality() {
    const pr = qualityPixelRatio(this.qBasePR, this.qLevel);
    const sh = this.qLevel < 2 ? 1024 : 512;
    this.renderer.setPixelRatio(pr);
    const sm = this.sun?.shadow;
    if (sm && sm.mapSize.x !== sh) {
      sm.map?.dispose();
      (sm as unknown as { map: null }).map = null;
      sm.mapSize.set(sh, sh);
    }
    this.resize();
  }

  private autoQuality(rawDt: number) {
    // Ignore tab suspension / very long startup stalls, but still react to
    // genuinely slow frames on lower-end devices.
    if (rawDt <= 0 || rawDt > 2 || document.hidden) return;
    const fps = 1 / rawDt;
    this.fpsEMA += (Math.min(fps, 120) - this.fpsEMA) * 0.04;
    this.qTimer += rawDt;
    if (this.qTimer < 2) return;
    this.qTimer = 0;
    if (this.fpsEMA < 45 && this.qLevel < 3) {
      this.qLevel++;
      this.qGoodTimer = 0;
      this.applyQuality();
    } else if (this.fpsEMA > 57) {
      this.qGoodTimer += 2;
      if (this.qGoodTimer >= 8 && this.qLevel > 0) {
        this.qLevel--;
        this.qGoodTimer = 0;
        this.applyQuality();
      }
    } else {
      this.qGoodTimer = 0;
    }
  }

  hooks: CharacterHooks = {
    onHit: (attacker, victim, point, dmg, kind) => {
      const big = kind !== "punch";
      const pan = kind === "pan";
      const effect = impactEffect(kind);
      this.burst(point.x, point.y, point.z, effect.count, effect.color, effect.size, effect.speed);
      // A weapon blow gets a second, faster puff: one cloud reads as a tap, a
      // burst reads as a hit. Keeps the white bat smoke, just punchier.
      if (big) this.burst(point.x, point.y, point.z, 8, effect.color, effect.size * 0.62, 2.2, 0.55);
      if (pan) sfx.pan();
      else if (big) sfx.bigHit();
      else sfx.hit(Math.min(1.2, dmg / 15));
      if (attacker.isHuman || victim.isHuman) this.shake = Math.max(this.shake, kind === "bat" ? 0.64 : pan ? 0.42 : big ? 0.4 : 0.26);
    },
    onKO: (victim) => {
      this.pushFeed(`${victim.def.emoji} ${victim.name} pingsan! 💫`);
      const p = victim.head.position;
      this.burst(p.x, p.y + 0.4, p.z, 8, knockoutEffectColor(victim.lastHitKind), 0.12);
    },
    onLand: (c, k) => {
      const p = c.position;
      this.burst(p.x, p.y - rig.HOVER + 0.08, p.z, Math.round(5 + 6 * k), 0xf4efe6, 0.13 + 0.08 * k, 0.9, 0.25);
    },
    onStep: (c) => {
      const p = c.position;
      this.burst(p.x, p.y - rig.HOVER + 0.06, p.z, 2, 0xf1ece2, 0.09, 0.4, 0.2);
    },
  };

  startRound() {
    // cleanup
    for (const c of this.chars) {
      c.removeFromWorld();
      this.scene.remove(c.root);
      disposeCharacterDetails([c.root]);
      c.nameTag.material.map?.dispose();
      c.nameTag.material.dispose();
    }
    this.seagull?.dispose();
    this.seagull = null;
    this.arena?.dispose();
    this.bombs?.dispose();
    this.bombs = null;
    // clear lingering constraints/bodies
    for (const con of [...this.world.constraints]) this.world.removeConstraint(con);
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    for (const l of Character.loose) {
      l.mesh.removeFromParent();
      disposeCharacterDetails([l.mesh]);
    }
    Character.loose = [];
    Character.thrownProps = [];

    this.arena = this.opts.arena === "ship"
      ? new ShipArena(this.world, this.scene, this.groundMat, this.opts.shipScale ?? 0.4)
      : new Arena(this.world, this.scene, this.groundMat);
    if (this.opts.arena === "ship") {
      // kapal bisa dibesarkan 4-7x → kamera & fog menjangkau seluruh kapal
      this.camera.far = 1500;
      this.scene.fog = new THREE.Fog(0xb8e6ff, 120, 900);
      this.arenaZoom = Math.min(4, Math.max(1, (this.opts.shipScale ?? 0.4) / 0.4));
      this.camPos.set(0, 14 * this.arenaZoom, 16 * this.arenaZoom);
    }
    this.seagull = new Seagull(this.scene, z => this.arena!.surfaceHeight(z), (_cat, x, y, z) => {
      this.burst(x, y, z, 10, 0xf6f5ed, 0.13, 0.8, 0.8);
      this.burst(x, y, z, 6, 0xffdd87, 0.1, 0.65, 0.8);
      sfx.hit(0.8);
      this.shake = Math.max(this.shake, 0.15);
    }, () => sfx.seagull());
    if (this.opts.mode === "bomb") {
      this.bombs = new BombManager(this.world, this.scene, this.groundMat, {
        onExplode: (pos, thrower) => this.onBombExplode(pos, thrower),
        onSpawned: (total) => {
          if (total >= 4) this.setBanner(`💣 ${total} BOM AKTIF!`);
          else this.pushFeed(`💣 Bom jatuh! (${total} aktif — lempar balik!)`);
        },
      });
      this.bombs.reset(this.round + 1);
    }
    this.chars = [];
    this.brains.clear();
    const n = this.roster.length;
    this.roster.forEach((r, i) => {
      // spread along the fuselage: everyone spawns ON the plane body
      const fx = -3.0 + (i / Math.max(1, n - 1)) * 5.5 + (this.round % 2 ? 0.3 : -0.3);
      const fz = (i % 2 === 0 ? 1 : -1) * [0.5, 0.9, 1.9][i % 3];
      const pos = new THREE.Vector3(fx, 0.05, fz);
      if (this.opts.mode === "teams" && r.team >= 0) {
        // start on your own half: red on the left wing, blue on the right
        const side = r.team === 0 ? -1 : 1;
        const k = i % 5;
        pos.set(side * (0.8 + (k % 2) * 1.5 + (k % 3) * 0.5), 0.05, -2.2 + k * 1.1 + (r.team === 0 ? -0.3 : 0.3));
      }
      if (!this.arena!.isSafe(pos.x, pos.z, 0.3)) {
        const s = this.arena!.randomSafePoint(0.5);
        pos.set(s.x, 0.05, s.z);
      }
      pos.y = this.arena!.surfaceHeight(pos.z) + 0.05;
      const yaw = Math.atan2(-pos.x, -pos.z);
      const c = new Character(this.world, i, r.def, r.name, r.slot, this.hooks, pos, yaw, emptyControl(), r.acc, r.eyeStyle, r.expression, r.team, r.flag);
      c.wins = r.wins;
      if (this.opts.mode === "teams") c.lives = TEAM_LIVES;
      this.scene.add(c.root);
      this.chars.push(c);
      if (r.slot === 0) {
        this.brains.set(c, {
          target: null,
          retarget: 0,
          punchT: 0,
          grabT: 0,
          dropkickT: 0,
          throwT: 0,
          climbT: 0.8,
          holdT: 0,
          aggro: 0.6 + Math.random() * 0.4,
          runFlag: false,
          wanderX: 0,
          wanderZ: 0,
          wanderT: 0,
          strafeT: 0,
          strafeDir: 1,
          strikeT: 0.15 + Math.random() * 0.3,
          reactT: 0,
          retreatT: 0,
          pounceCd: 0,
          batPref: Math.random() < 0.65,
          aimT: 0,
          fleeT: 0,
          fleeX: 0,
          fleeZ: 0,
          hadBomb: false,
        });
      }
    });
    Character.all = this.chars;
    Character.bats = this.arena!.bats;
    Character.thrownProps = [];
    this.batOf = new Map(this.arena!.bats.map((b) => [b.body, b]));
    this.round++;
    this.phase = "countdown";
    this.countdown = 3.5;
    this.lastCount = 4;
    this.timeLeft = ROUND_TIME;
    this.winner = null;
    this.events = { sweeper: false, ring3: false, ring2: false, ring1: false };
    this.feed = [];
    this.setBanner(`RONDE ${this.round}`);
    this.emitHud();
  }

  nextRound() {
    if (this.phase === "roundEnd") this.startRound();
  }

  /** Start the whole match over: round 1, scores cleared, same players/settings. */
  restart() {
    if (this.disposed) return;
    this.round = 0;
    this.teamWins = [0, 0];
    for (const r of this.roster) r.wins = 0;
    this.startRound();
    this.setBanner("ULANG PERTANDINGAN!");
  }

  pushFeed(text: string) {
    this.feed.push({ id: this.feedId++, text, t: 5 });
    if (this.feed.length > 5) this.feed.shift();
  }
  setBanner(text: string) {
    this.banner = { text, t: 2.2 };
  }

  /** Big cartoon explosion: flings EVERYONE in radius, credits the thrower. */
  onBombExplode(pos: THREE.Vector3, thrower: Character | null) {
    // presentation: flash + fire + smoke
    this.burst(pos.x, pos.y, pos.z, 26, 0xfff3c4, 0.5, 2.4, 1.2);
    this.burst(pos.x, pos.y, pos.z, 22, 0xff9a3c, 0.42, 1.9, 1.0);
    this.burst(pos.x, pos.y, pos.z, 16, 0xff4d3c, 0.36, 1.5, 1.4);
    this.burst(pos.x, pos.y + 0.6, pos.z, 10, 0x555566, 0.5, 0.7, 2.0);
    sfx.explode();
    if (this.chars.some((c) => c.isHuman && c.alive)) this.shake = Math.max(this.shake, 0.9);
    // gameplay: radial fling, hurts + credits like a super-throw
    const R = BLAST_R + 0.8;
    let fed = 0;
    for (const c of this.chars) {
      if (!c.alive || c.removed) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const fall = 1 - d / R;
      const l = d || 1;
      const dir = new CANNON.Vec3(dx / l, 0, dz / l);
      c.releaseAll(false); // blast releases grabbed cats and props, not an equipped weapon
      const power = 7 + 13 * fall;
      c.torso.velocity.x += dir.x * power;
      c.torso.velocity.z += dir.z * power;
      c.torso.velocity.y += 5 + 9 * fall;
      for (const p of c.parts) {
        if (p === c.torso) continue;
        p.velocity.x += dir.x * power * 0.6;
        p.velocity.z += dir.z * power * 0.6;
        p.velocity.y += 3 + 5 * fall;
      }
      c.torso.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16);
      c.receiveHit(thrower ?? c, 15 + 55 * fall, dir, 8 + 10 * fall, c.torso);
      c.lastHitKind = "bomb";
      if (fall > 0.55) c.knockAccessory(dir);
      if (fed < 2 && fall > 0.2 && thrower && thrower !== c) {
        this.pushFeed(`💣 ${thrower.name} 💥 ${c.name}!`);
        fed++;
      }
    }
    // kick loose props & bats too
    for (const p of this.arena!.props) {
      if (!this.world.bodies.includes(p.body)) continue;
      const dx = p.body.position.x - pos.x;
      const dz = p.body.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const fall = 1 - d / R;
      const l = d || 1;
      p.body.velocity.x += (dx / l) * 14 * fall;
      p.body.velocity.z += (dz / l) * 14 * fall;
      p.body.velocity.y += 7 * fall;
    }
    for (const b of this.arena!.bats) {
      if (b.holder || !this.world.bodies.includes(b.body)) continue;
      const dx = b.body.position.x - pos.x;
      const dz = b.body.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const fall = 1 - d / R;
      const l = d || 1;
      b.body.velocity.x += (dx / l) * 14 * fall;
      b.body.velocity.z += (dz / l) * 14 * fall;
      b.body.velocity.y += 7 * fall;
    }
  }

  burst(x: number, y: number, z: number, count: number, color: number, size: number, speed = 1, up = 1) {
    if (count <= 0) return;
    let spawned = 0;
    _pc.setHex(color);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      p.life = p.max = 0.35 + Math.random() * 0.25;
      p.pos.set(x, y, z);
      p.vel.set((Math.random() - 0.5) * 6 * speed, (Math.random() * 4 + 1) * up, (Math.random() - 0.5) * 6 * speed);
      p.grow = size * (0.6 + Math.random() * 0.8);
      this.pMesh?.setColorAt(i, _pc);
      if (++spawned >= count) break;
    }
    if (spawned && this.pMesh) {
      this.pMesh.visible = true;
      if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    }
  }

  /** Update only live particles; do not upload or draw the idle pool. */
  private updateParticles(dt: number) {
    if (!this.pMesh?.visible) return;
    let changed = false, live = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      changed = true;
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max);
      _ps.setScalar(p.life <= 0 ? 0.0001 : p.grow * (0.15 + 0.85 * k * k));
      _pm.compose(p.pos, _pq.identity(), _ps);
      this.pMesh?.setMatrixAt(i, _pm);
      if (p.life > 0) live = true;
    }
    if (this.pMesh) {
      this.pMesh.visible = live;
      if (changed) this.pMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------- BOT AI ----------------
  botControl(c: Character, dt: number): ControlState {
    const s = emptyControl();
    const b = this.brains.get(c)!;
    const arena = this.arena!;
    if (!c.alive || c.down) return s;
    if (c.weaponContest) {
      c.contestBotDelay -= dt;
      if (c.contestBotDelay <= 0) {
        s.lift = true;
        c.contestBotDelay = 0.43 + Math.random() * 0.22;
      }
      return s;
    }
    const pos = c.position;
    const toCenter = () => {
      const l = Math.hypot(pos.x, pos.z) || 1;
      return [-pos.x / l, -pos.z / l] as const;
    };

    b.retarget -= dt;
    if (b.retarget <= 0 || !b.target || !b.target.alive) {
      let best: Character | null = null;
      let bestScore = Infinity;
      for (const o of this.chars) {
        if (o === c || !o.alive || (c.team >= 0 && o.team === c.team)) continue;
        const d = Math.hypot(o.position.x - pos.x, o.position.z - pos.z);
        const score = d + (o.ko ? -3 : 0) + Math.random() * 3 + (o.isHuman ? -0.8 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = o;
        }
      }
      b.target = best;
      b.retarget = 1.5 + Math.random() * 2;
      b.runFlag = Math.random() < 0.5 * b.aggro;
    }

    // hanging on a ledge -> climb back
    if (c.hangingStatic) {
      s.grab = true;
      const [cx, cz] = toCenter();
      s.mx = cx;
      s.mz = cz;
      b.climbT -= dt;
      if (b.climbT <= 0) {
        s.jump = true;
        b.climbT = 0.5 + Math.random() * 1.2;
      }
      return s;
    }
    // falling off: flail for a ledge
    if (!c.grounded && pos.y < 0.4 && !arena.isSafe(pos.x, pos.z)) {
      s.grab = true;
      const [cx, cz] = toCenter();
      s.mx = cx;
      s.mz = cz;
      return s;
    }

    // ---- BOMB MODE brains: hot potato with actual aim ----
    const liveBombs = this.frameBombs;
    const heldBombObj =
      liveBombs.find((bb) => c.holds.armL?.body === bb.body || c.holds.armR?.body === bb.body) ?? null;
    const hasBombNow = !!heldBombObj;
    // just threw/dropped a bomb -> sprint away from where it's headed
    if (!hasBombNow && b.hadBomb) {
      b.fleeT = 1.7;
      if (b.target && b.target.alive) {
        b.fleeX = b.target.position.x;
        b.fleeZ = b.target.position.z;
      } else {
        b.fleeX = pos.x;
        b.fleeZ = pos.z;
      }
      b.aimT = 0;
    }
    b.hadBomb = hasBombNow;
    if (heldBombObj) {
      // pick the juiciest victim: close + clustered + near an edge
      const half = arena.safeHalf();
      let victim: Character | null = null;
      let bestScore = Infinity;
      for (const o of this.chars) {
        if (o === c || !o.alive || (c.team >= 0 && o.team === c.team)) continue;
        const d = Math.hypot(o.position.x - pos.x, o.position.z - pos.z);
        let cluster = 0;
        for (const q of this.chars) {
          if (q === c || q === o || !q.alive) continue;
          if (Math.hypot(q.position.x - o.position.x, q.position.z - o.position.z) < BLAST_R) cluster++;
        }
        const edgeBonus = Math.max(0, 2.2 - (half - Math.max(Math.abs(o.position.x), Math.abs(o.position.z)))) * 1.2;
        const score = d - cluster * 2.2 - edgeBonus + (o.ko ? -1 : 0) + (o.isHuman ? -0.5 : 0);
        if (score < bestScore) {
          bestScore = score;
          victim = o;
        }
      }
      if (victim) b.target = victim;
      const fuse = heldBombObj.fuse;
      const urgent = fuse < 1.3;
      if (!victim || urgent) {
        s.lift = true; // nobody around or about to blow: just YEET it
        return s;
      }
      const dx = victim.position.x - pos.x;
      const dz = victim.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2 && !urgent) {
        // too close — point-blank hurts us too, so back off first, then throw
        const bx = -dx / (dist || 1);
        const bz = -dz / (dist || 1);
        if (!arena.isSafe(pos.x + bx * 1.2, pos.z + bz * 1.2, 0.15)) {
          s.lift = true; // nowhere to back off: throw NOW and pray
          return s;
        }
        s.mx = bx * 0.7;
        s.mz = bz * 0.7;
        b.aimT = 0;
        return s;
      }
      if (dist > 7.5 && !urgent) {
        // out of range: run closer while holding (but never off the edge)
        const ax = dx / (dist || 1);
        const az = dz / (dist || 1);
        if (!arena.isSafe(pos.x + ax * 1.4, pos.z + az * 1.4, 0.15)) {
          s.lift = true; // can't chase safely: lob it from here
          return s;
        }
        s.mx = ax;
        s.mz = az;
        s.run = true;
        b.aimT = 0;
        return s;
      }
      // lead the target, then throw only once we're actually facing them
      const tFly = Math.min(0.8, Math.max(0.1, dist / 10));
      const ax = victim.position.x + victim.torso.velocity.x * tFly - pos.x;
      const az = victim.position.z + victim.torso.velocity.z * tFly - pos.z;
      const want = Math.atan2(ax, az);
      const diff = wrapAngle(want - c.facing);
      if (Math.abs(diff) > 0.3) {
        const l = Math.hypot(ax, az) || 1;
        s.mx = (ax / l) * 0.55;
        s.mz = (az / l) * 0.55;
        b.aimT = 0;
      } else {
        const l = Math.hypot(ax, az) || 1;
        s.mx = (ax / l) * 0.2;
        s.mz = (az / l) * 0.2;
        b.aimT += dt;
        if (b.aimT > 0.12) {
          s.lift = true;
          b.aimT = 0;
        }
      }
      return s;
    }
    // keep running from the bomb we just threw (don't admire our work)
    if (b.fleeT > 0) {
      b.fleeT -= dt;
      const dx = pos.x - b.fleeX;
      const dz = pos.z - b.fleeZ;
      const l = Math.hypot(dx, dz) || 1;
      let mx = dx / l;
      let mz = dz / l;
      if (!arena.isSafe(pos.x + mx * 1.2, pos.z + mz * 1.2, 0.15)) {
        const [cx, cz] = toCenter();
        mx = cx;
        mz = cz;
      }
      s.mx = mx;
      s.mz = mz;
      s.run = true;
      return s;
    }
    if (liveBombs.length > 0) {
      // flee the closest armed bomb (flying bombs get a bigger danger zone)
      let nd = Infinity;
      let nx = 0;
      let nz = 0;
      for (const bb of liveBombs) {
        const d = Math.hypot(bb.body.position.x - pos.x, bb.body.position.z - pos.z);
        const dangerR = bb.body.velocity.length() > 4 ? BLAST_R + 2.4 : BLAST_R + 0.9;
        if (d < dangerR && d < nd) {
          nd = d;
          nx = pos.x - bb.body.position.x;
          nz = pos.z - bb.body.position.z;
        }
      }
      if (nd < Infinity) {
        const l = Math.hypot(nx, nz) || 1;
        let mx = nx / l;
        let mz = nz / l;
        if (!arena.isSafe(pos.x + mx * 1.2, pos.z + mz * 1.2, 0.15)) {
          const [cx, cz] = toCenter();
          mx = cx;
          mz = cz;
        }
        s.mx = mx;
        s.mz = mz;
        s.run = true;
        return s;
      }
      // go pick up a fresh bomb to throw at people (only safe-fuse ones)
      let tgt: (typeof liveBombs)[number] | null = null;
      let td = 7;
      for (const bb of liveBombs) {
        if (bb.fuse < 3.0 || bb.body.velocity.length() > 2.5) continue;
        if (!arena.isSafe(bb.body.position.x, bb.body.position.z, 0.3)) continue;
        // don't fight someone who's already carrying it... unless it's almost dead? no, skip carriers
        const d = Math.hypot(bb.body.position.x - pos.x, bb.body.position.z - pos.z);
        if (d < td) {
          td = d;
          tgt = bb;
        }
      }
      if (tgt) {
        if (c.weapon) {
          // hands full: yeet the bat first, then grab the bomb
          s.lift = true;
          const dx = tgt.body.position.x - pos.x;
          const dz = tgt.body.position.z - pos.z;
          s.mx = dx / (td || 1);
          s.mz = dz / (td || 1);
          return s;
        }
        const dx = tgt.body.position.x - pos.x;
        const dz = tgt.body.position.z - pos.z;
        s.mx = dx / (td || 1);
        s.mz = dz / (td || 1);
        s.run = td > 2;
        if (td < 1.15) s.lift = true;
        return s;
      }
    }

    // carrying someone -> walk to edge, lift, throw
    if (c.holding) {
      b.holdT += dt;
      const heldChar = c.holds.armL?.owner ?? c.holds.armR?.owner ?? null;
      if (!heldChar || b.holdT > 4.5) {
        s.grab = false;
        b.holdT = 0;
        return s;
      }
      s.grab = true;
      const half = arena.safeHalf();
      const ax = Math.abs(pos.x),
        az = Math.abs(pos.z);
      let ox = 0,
        oz = 0;
      if (ax > az) ox = Math.sign(pos.x) || 1;
      else oz = Math.sign(pos.z) || 1;
      const edgeDist = half - Math.max(ax, az);
      if (edgeDist > 1.7) {
        s.mx = ox;
        s.mz = oz;
        s.run = false;
      } else {
        // face outward, lift then throw
        s.mx = ox * 0.2;
        s.mz = oz * 0.2;
        if (!c.lifting && b.throwT <= 0) {
          s.punch = true;
          b.throwT = 0.55;
        } else if (c.lifting) {
          b.throwT -= dt;
          if (b.throwT <= 0) {
            s.grab = false;
            b.holdT = 0;
          }
        }
      }
      return s;
    }
    b.holdT = 0;
    b.throwT = 0;

    // go grab a bat if there's a free one nearby
    if (!c.weapon && b.batPref) {
      let tgt: Bat | null = null;
      let td = 5;
      for (const bt of Character.bats) {
        if (bt.holder || !this.world.bodies.includes(bt.body) || bt.body.velocity.length() > 2) continue;
        if (!arena.isSafe(bt.body.position.x, bt.body.position.z, 0.3)) continue;
        const d = Math.hypot(bt.body.position.x - pos.x, bt.body.position.z - pos.z);
        if (d < td) {
          td = d;
          tgt = bt;
        }
      }
      if (tgt) {
        const dx = tgt.body.position.x - pos.x, dz = tgt.body.position.z - pos.z;
        s.mx = dx / (td || 1);
        s.mz = dz / (td || 1);
        s.run = td > 2;
        if (td < 1.1) s.lift = true;
        return s;
      }
    }

    // too close to the abyss? back off before fighting
    const half = arena.safeHalf();
    const edgeGap = half - Math.max(Math.abs(pos.x), Math.abs(pos.z));
    if (edgeGap < 1.3 || !arena.isSafe(pos.x, pos.z, 0.4)) {
      const [cx, cz] = toCenter();
      s.mx = cx;
      s.mz = cz;
      s.run = edgeGap < 0.6;
      if (b.target && Math.hypot(b.target.position.x - pos.x, b.target.position.z - pos.z) < 1.4 && Math.random() < 0.15) s.punch = true;
      return s;
    }

    const t = b.target;
    if (t) {
      const rawDx = t.position.x - pos.x;
      const rawDz = t.position.z - pos.z;
      const dist = Math.hypot(rawDx, rawDz) || 0.001;
      // aim at where the target is GOING, not where it is right now; up
      // close the lead matters more — a punch tracks a point 0.2 s ahead
      const lead = dist < 2.2 ? 0.24 : Math.min(0.45, dist / 12);
      const aimX = rawDx + t.torso.velocity.x * lead;
      const aimZ = rawDz + t.torso.velocity.z * lead;
      const aimL = Math.hypot(aimX, aimZ) || 1;
      const nx = aimX / aimL;
      const nz = aimZ / aimL;
      // Footwork: hold the range and step around the target instead of
      // shoving into it (that head-down push read as "just following").
      b.strafeT -= dt;
      if (b.strafeT <= 0) {
        b.strafeDir = Math.random() < 0.5 ? -1 : 1;
        b.strafeT = 1.0 + Math.random() * 1.5;
      }
      const orbitX = nz * b.strafeDir;
      const orbitZ = -nx * b.strafeDir;
      b.strikeT -= dt;
      b.reactT = Math.max(0, b.reactT - dt);
      b.retreatT = Math.max(0, b.retreatT - dt);
      b.pounceCd = Math.max(0, b.pounceCd - dt);

      // Getting hit? Give ground for a moment instead of feeding the swing.
      if (b.retreatT <= 0 && dist < 3.4 && (c.stagger > 0.12 || c.hurtT > 0.55)) b.retreatT = 0.4 + Math.random() * 0.45;

      const face = wrapAngle(Math.atan2(rawDx, rawDz) - c.facing);
      const facingTarget = Math.abs(face) < 1.1;
      // swing only when the target is inside THIS weapon's reach
      const reach = c.weapon ? 2.15 : 1.6;
      const swingRange = c.weapon ? 1.95 : 1.22;
      let mx = 0;
      let mz = 0;
      let run = false;
      if (b.retreatT > 0) {
        // back off while still watching the fight
        mx = -nx + orbitX * 0.35;
        mz = -nz + orbitZ * 0.35;
        run = true;
      } else if (dist > 3.1) {
        mx = nx;
        mz = nz;
        run = true;
      } else if (dist > reach * 0.92) {
        // close in on a slight arc so the approach is not a straight line
        mx = nx * 0.9 + orbitX * 0.18;
        mz = nz * 0.9 + orbitZ * 0.18;
        run = (b.runFlag && dist > 3) || dist > 3.2;
      } else {
        // in range: hold ground, lean in, swing on rhythm (a small weave keeps
        // it alive without ever circling the foe)
        mx = nx * 0.55 + orbitX * 0.14;
        mz = nz * 0.55 + orbitZ * 0.14;
      }

      // Grab a knocked-out cat and haul it to the edge (unchanged intent).
      if (t.ko && dist < 2.2 && b.grabT <= 0 && c.grounded && Math.random() < 0.5 * dt * 6) b.grabT = 1.0;
      // A frisky bot sometimes starts a wrestling match on purpose.
      else if (!t.ko && b.grabT <= 0 && dist < 1.5 && c.grounded && Math.random() < 0.006 * b.aggro) b.grabT = 0.8;

      // Swing only when squared up AND inside the weapon's reach: random
      // flailing from out of range or facing away is what made fights dumb.
      const targetSliding = t.torso.velocity.x * t.torso.velocity.x + t.torso.velocity.z * t.torso.velocity.z > 9;
      if (dist < swingRange && facingTarget && !targetSliding && b.strikeT <= 0 && b.grabT <= 0 && b.reactT <= 0 && !t.ko && !c.down) {
        s.punch = true;
        mx *= 0.3;
        mz *= 0.3;
        // better bots swing sooner and more often
        b.strikeT = 0.24 + Math.random() * (0.55 - b.aggro * 0.3);
      }

      // Weapon contest: an unarmed cat can try to rip the weapon away.
      if (dist < 1.7 && !c.weapon && t.weapon && !t.down && !c.holding && c.contestCooldown <= 0 && Math.random() < 0.004 * b.aggro) {
        s.lift = true;
        return s;
      }

      // Flying tackle when the target is running away and the gap is right.
      const fleeing = (rawDx * t.torso.velocity.x + rawDz * t.torso.velocity.z) / dist > 1.6;
      if (c.stagger <= 0.1 && b.pounceCd <= 0 && c.attackCd <= 0 && c.grounded && dist > 2.3 && dist < 4.6 &&
          fleeing && Math.random() < 0.45 * b.aggro) {
        s.jump = true;
        b.dropkickT = 0.16;
        b.pounceCd = 2.6 + Math.random() * 2.2;
      }

      s.mx = mx;
      s.mz = mz;
      s.run = run;
    } else {
      // Patrol: walk to a real waypoint on the plane instead of tracing circles.
      b.wanderT -= dt;
      const left = Math.hypot(b.wanderX - pos.x, b.wanderZ - pos.z);
      if (b.wanderT <= 0 || left < 0.9) {
        let px = b.wanderX;
        let pz = b.wanderZ;
        for (let i = 0; i < 6; i++) {
          const p = arena.randomSafePoint(0.9);
          px = p.x;
          pz = p.z;
          if (Math.hypot(p.x - pos.x, p.z - pos.z) > 2.4) break;
        }
        b.wanderX = px;
        b.wanderZ = pz;
        b.wanderT = 3.5 + Math.random() * 3;
      }
      const dx = b.wanderX - pos.x;
      const dz = b.wanderZ - pos.z;
      const l = Math.hypot(dx, dz) || 1;
      s.mx = dx / l;
      s.mz = dz / l;
      s.run = l > 3.5;
    }

    if (b.dropkickT > 0) {
      b.dropkickT -= dt;
      if (b.dropkickT <= 0) s.headbutt = true;
    }
    if (b.grabT > 0) {
      b.grabT -= dt;
      s.grab = true;
    }

    // bomb mode: steer around blast zones while chasing/wandering
    if (this.opts.mode === "bomb" && liveBombs.length > 0) {
      for (const bb of liveBombs) {
        const dx = pos.x - bb.body.position.x;
        const dz = pos.z - bb.body.position.z;
        const d = Math.hypot(dx, dz);
        const R = BLAST_R + 1.0;
        if (d < R && d > 0.01) {
          const push = (1 - d / R) * 1.8;
          s.mx += (dx / d) * push;
          s.mz += (dz / d) * push;
        }
      }
      const l = Math.hypot(s.mx, s.mz);
      if (l > 1) {
        s.mx /= l;
        s.mz /= l;
      }
    }

    // Personal space: cats should not stand inside each other.
    for (const o of this.chars) {
      if (o === c || !o.alive) continue;
      const dx = pos.x - o.position.x;
      const dz = pos.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.36 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.6 - d) * 2.4;
      s.mx += (dx / d) * push;
      s.mz += (dz / d) * push;
    }
    {
      const l = Math.hypot(s.mx, s.mz);
      if (l > 1) {
        s.mx /= l;
        s.mz /= l;
      }
    }

    // edge safety
    const look = s.run ? 1.6 : 1.1;
    if (!arena.isSafe(pos.x + s.mx * look, pos.z + s.mz * look, 0.15)) {
      const [cx, cz] = toCenter();
      s.mx = cx;
      s.mz = cz;
      s.headbutt = false;
      b.dropkickT = 0;
    }

    // jump over the sweeper
    const sw = arena.sweeper;
    if (sw && sw.active && sw.body.position.y > 0.2 && c.grounded) {
      const dir = sw.body.quaternion.vmult(SWEEP_X, _sweepDir);
      const perp = Math.abs(dir.x * pos.z - dir.z * pos.x);
      if (perp < 1.0 && Math.random() < 0.12) s.jump = true;
    }
    return s;
  }

  // ---------------- LOOP ----------------
  loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    this.autoQuality(rawDt);
    const dt = Math.min(0.05, Math.max(0, rawDt));
    try {
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      // jangan biarkan satu frame error mengosongkan seluruh layar
      console.error("[meow-brawl] frame error", err);
      if (!(this as unknown as { _errShown?: boolean })._errShown) {
        (this as unknown as { _errShown?: boolean })._errShown = true;
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;z-index:99999;padding:4px 8px;font:12px monospace;white-space:pre-wrap";
        d.textContent = "FRAME ERR: " + (err as Error).message;
        document.body.appendChild(d);
      }
    }
  };

  update(dt: number) {
    const arena = this.arena!;

    // phase timers
    if (this.phase === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount && n <= 3 && n >= 0) {
        this.lastCount = n;
        sfx.countdown(n === 0);
      }
      if (this.countdown <= 0) {
        this.phase = "playing";
        this.setBanner(this.opts.mode === "bomb" ? "💣 MODE BOM!" : "BRAWL!");
      }
    } else if (this.phase === "playing") {
      this.timeLeft -= dt;
      if (!this.events.sweeper && this.timeLeft <= 75) {
        this.events.sweeper = true;
        arena.activateSweeper();
        this.setBanner("⚠️ PALANG PUTAR!");
      }
      if (!this.events.ring3 && this.timeLeft <= 45) {
        this.events.ring3 = true;
        arena.dropRing(3);
        this.setBanner("⚠️ LANTAI RUNTUH!");
      }
      if (!this.events.ring2 && this.timeLeft <= 22) {
        this.events.ring2 = true;
        arena.dropRing(2);
        this.setBanner("⚠️ LANTAI RUNTUH LAGI!");
      }
      if (!this.events.ring1 && this.timeLeft <= 0) {
        this.events.ring1 = true;
        arena.dropRing(1);
        this.setBanner("☠️ SUDDEN DEATH!");
      }
      if (this.timeLeft < 0) this.timeLeft = 0;
    }

    // inputs
    const canControl = this.phase !== "countdown";
    // cache live bombs once per frame (bots all read this — no per-bot filter alloc)
    this.frameBombs.length = 0;
    if (this.opts.mode === "bomb" && this.bombs) {
      for (const b of this.bombs.bombs) if (!b.dead) this.frameBombs.push(b);
    }
    for (const c of this.chars) {
      if (!canControl || !c.alive) c.input = emptyControl();
      else if (c.isHuman) {
        c.input = readControls(c.humanSlot as 1 | 2, this.opts.twoPlayer);
        // Stumble camera rotates with the player: make stick/WASD camera-relative
        if (this.camMode === "stumble") {
          const { mx, mz } = c.input;
          const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
          // forward F=(sy,cy), right R=(-cy,sy); world = R*mx + F*(-mz)
          c.input.mx = -cy * mx - sy * mz;
          c.input.mz = sy * mx - cy * mz;
        }
      } else c.input = this.botControl(c, dt);
    }
    endFrameInput();

    // held counts
    for (const c of this.chars) {
      c.heldBy = 0;
      c.carriedBy = null;
    }
    for (const c of this.chars)
      for (const h of [c.holds.armL, c.holds.armR])
        if (h?.owner) {
          h.owner.heldBy++;
          if (c.lifting && h.carry) h.owner.carriedBy = c;
        }
    for (const c of this.chars) c.updateCollisionMask();
    // thrown props cool down
    for (const tp of Character.thrownProps) tp.t -= dt;
    Character.thrownProps = Character.thrownProps.filter((tp) => tp.t > 0);
    // crying: little tear drops
    this.tearT -= dt;
    if (this.tearT <= 0) {
      this.tearT = 0.09;
      const T = getTuning();
      const hs = 0.745 * T.head;
      for (const c of this.chars) {
        if (c.expr !== "hurt" || c.removed || !c.alive) continue;
        const vh = c.visual.head;
        for (const sd of [1, -1]) {
          _ev.set(sd * 0.3 * T.eyeX * hs, (T.eyeY - 0.12) * hs, 0.42 * hs).applyQuaternion(vh.quaternion).add(vh.position);
          this.burst(_ev.x, _ev.y, _ev.z, 1, 0x8fd8ff, 0.045, 0.35, 0.5);
        }
      }
    }

    for (const c of this.chars) if (!c.removed) c.frameActions(dt);

    // physics
    // Hits use particles, sound and camera shake, not a physics freeze.
    this.acc += dt;
    let steps = 0;
    while (this.acc >= H && steps < 6) {
      this.seagull?.update(H, this.chars, this.phase === "playing", this.camYaw);
      for (const c of this.chars) c.physicsStep(H);
      this.world.step(H);
      for (const con of this.world.contacts) {
        const a = bodyOwner.get(con.bi);
        const b = bodyOwner.get(con.bj);
        const bat = this.batOf.get(con.bi) ?? this.batOf.get(con.bj);
        if (bat && bat.flyT > 0 && bat.thrower) {
          const victim = (a ?? b)?.char;
          const vb = a ? con.bi : con.bj;
          if (victim && victim !== bat.thrower && victim.alive && !bat.hit.has(victim) && bat.body.velocity.length() > 5) {
            bat.hit.add(victim);
            const v = bat.body.velocity;
            const l = Math.hypot(v.x, v.z) || 1;
            const pan = bat.kind === "pan";
            victim.receiveHit(bat.thrower, pan ? 20 : 32, _hitDir.set(v.x / l, 0, v.z / l), pan ? 5 : 8, vb, undefined, pan ? "pan" : "bat");
            victim.capKnockback(6, 3.2);
            this.hooks.onHit(bat.thrower, victim, _hitPos.copy(vb.position), pan ? 20 : 32, pan ? "pan" : "bat");
          }
        }
        if (a && b && a.char !== b.char) {
          for (const [x, y, yb] of [
            [a.char, b.char, con.bj],
            [b.char, a.char, con.bi],
          ] as const) {
            if (x.thrownT <= 0 || !y.alive || y === x.thrownBy) continue;
            const rv = Math.hypot(x.torso.velocity.x - y.torso.velocity.x, x.torso.velocity.y - y.torso.velocity.y, x.torso.velocity.z - y.torso.velocity.z);
            if (rv < 5) continue;
            x.thrownT = 0;
            const l = Math.hypot(x.torso.velocity.x, x.torso.velocity.z) || 1;
            const dir = _hitDir.set(x.torso.velocity.x / l, 0, x.torso.velocity.z / l);
            const by = x.thrownBy ?? x;
            y.receiveHit(by, 26, dir, 9, yb);
            dir.scale(-1, dir);
            x.receiveHit(by, 10, dir, 2, x.torso);
            this.hooks.onHit(by, y, _hitPos.copy(yb.position), 26, "throw");
          }
        }
        if ((a && !b) || (b && !a)) {
          const victim = (a ?? b)!.char;
          const prop = a ? con.bj : con.bi;
          const vb = a ? con.bi : con.bj;
          const tp = Character.thrownProps.find((q) => q.body === prop);
          if (tp && victim !== tp.by && victim.alive && prop.velocity.length() > 5) {
            const v = prop.velocity;
            const l = Math.hypot(v.x, v.z) || 1;
            victim.receiveHit(tp.by, 24, _hitDir.set(v.x / l, 0, v.z / l), 9, vb);
            this.hooks.onHit(tp.by, victim, _hitPos.copy(vb.position), 24, "throw");
            tp.t = 0;
          }
        }
        if (!a && !b) continue;
        if (a) {
          con.bi.position.vadd(con.ri, _pt);
          a.char.onContact(a.part, con.bj, _pt, b);
        }
        if (b) {
          con.bj.position.vadd(con.rj, _pt);
          b.char.onContact(b.part, con.bi, _pt, a);
        }
      }
      for (const c of this.chars) if (!c.removed) c.updateHolds(H);
      this.acc -= H;
      steps++;
    }
    if (steps >= 6) this.acc = 0;

    arena.update(dt, this.timeLeft);
    this.bombs?.update(dt, this.phase === "playing", this.chars, arena);

    // eliminations
    for (const c of this.chars) {
      if (c.removed) continue;
      const y = c.torso.position.y;
      if (c.alive && y < -3.2) {
        c.alive = false;
        c.koTimer = 0;
        c.releaseAll(false);
        c.throwWeapon(false);
        for (const o of this.chars) {
          for (const arm of ["armL", "armR"] as const) {
            const h = o.holds[arm];
            if (h && h.owner === c) {
              this.world.removeConstraint(h.c);
              o.holds[arm] = null;
            }
          }
        }
        const killer = c.lastHitBy && c.time - c.lastHitAt < 7 && c.lastHitBy !== c ? c.lastHitBy : null;
        const byBomb = this.opts.mode === "bomb" && c.lastHitKind === "bomb";
        const tag = (x: Character) => (this.opts.mode === "teams" ? `${x.team === 0 ? "🟥" : "🟦"} ` : "");
        const fl = (x: Character) => flagEmoji(x.flag);
        this.pushFeed(
          killer
            ? byBomb
              ? `💥 ${tag(killer)}${killer.name}${fl(killer)} meledakkan ${tag(c)}${c.def.emoji} ${c.name}${fl(c)} keluar!`
              : `${tag(killer)}${killer.def.emoji} ${killer.name}${fl(killer)} melempar ${tag(c)}${c.def.emoji} ${c.name}${fl(c)} keluar!`
            : `${tag(c)}${c.def.emoji} ${c.name}${fl(c)} jatuh sendiri 🤦`
        );
        const outOfLives = this.opts.mode !== "teams" || c.team < 0 || c.lives <= 0;
        if (!outOfLives) {
          c.lives--;
          if (c.lives > 0) {
            c.parkForRespawn();
            c.respawnT = 2.8;
            this.pushFeed(`↩️ ${tag(c)}${c.name}${flagEmoji(c.flag)} balik lagi! (sisa ${c.lives} nyawa)`);
            if (c.isHuman) this.setBanner(`KAMU GUGUR! SISA ${c.lives} NYAWA`);
          } else {
            this.pushFeed(`☠️ ${tag(c)}${c.name}${flagEmoji(c.flag)} habis nyawanya!`);
            if (c.isHuman) this.setBanner(c.humanSlot === 1 ? "KAMU TERSINGKIR!" : "P2 TERSINGKIR!");
          }
        } else if (c.isHuman) this.setBanner(c.humanSlot === 1 ? "KAMU TERSINGKIR!" : "P2 TERSINGKIR!");
        sfx.fall();
      }
      if (y < -28) c.removeFromWorld();
    }

    // team-mode respawns
    if (this.phase === "playing" && this.opts.mode === "teams") {
      for (const c of this.chars) {
        if (c.removed || c.alive || c.respawnT <= 0) continue;
        c.respawnT -= dt;
        if (c.respawnT <= 0) {
          const spot = this.respawnSpot(c.team);
          const y = this.arena!.surfaceHeight(spot.z) + 0.05;
          c.respawnAt(spot.x, y, spot.z, Math.atan2(-spot.x, -spot.z));
          if (c.isHuman) this.setBanner("KAMU BALIK! 💪");
          sfx.grab();
        }
      }
    }

    // round end
    if (this.phase === "playing") {
      const alive = this.chars.filter((c) => c.alive);
      if (this.opts.mode === "teams") {
        // team match: the round ends when a team runs out of lives entirely
        const stocks = teamStocks(this.chars);
        if (stocks[0] === 0 || stocks[1] === 0) {
          this.phase = "roundEnd";
          const win: 0 | 1 | null = stocks[0] > 0 ? 0 : stocks[1] > 0 ? 1 : null;
          if (win !== null) this.teamWins[win]++;
          const humanWin = win !== null && this.chars.some((c) => c.isHuman && c.team === win);
          this.winner = win === null
            ? { name: "Seri", emoji: "🤝", human: false, animal: null, eyeStyle: "default", expression: "default" }
            : { name: win === 0 ? "TIM MERAH" : "TIM BIRU", emoji: win === 0 ? "🟥" : "🟦", human: humanWin, animal: null, eyeStyle: "default", expression: "default", team: win };
          sfx.win();
          this.emitHud();
        }
      } else if (alive.length <= 1) {
        this.phase = "roundEnd";
        const w = alive[0];
        if (w) {
          const r = this.roster[w.index];
          r.wins++;
          w.wins = r.wins;
          this.winner = { name: w.name, emoji: w.def.emoji, human: w.isHuman, animal: w.def.id, eyeStyle: this.roster[w.index].eyeStyle, expression: this.roster[w.index].expression };
        } else this.winner = { name: "Seri", emoji: "🤝", human: false, animal: null, eyeStyle: "default", expression: "default" };
        sfx.win();
        this.emitHud();
      }
    }

    // visuals
    for (const c of this.chars) if (!c.removed) c.syncVisual();
    this.updateParticles(dt);

    for (const l of Character.loose) {
      l.mesh.position.set(l.body.position.x, l.body.position.y, l.body.position.z);
      l.mesh.quaternion.set(l.body.quaternion.x, l.body.quaternion.y, l.body.quaternion.z, l.body.quaternion.w);
    }
    this.updateCamera(dt);

    // feed / banner timers
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.08;
      this.emitHud();
    }
  }

  updateCamera(dt: number) {
    const portrait = this.camera.aspect < 1;
    const zoom = this.camZoom * this.arenaZoom;
    // smooth FOV per mode
    const targetFov = this.camMode === "stumble" ? (portrait ? 66 : 58) : portrait ? 58 : 44;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
    const k = 1 - Math.exp(-3.5 * dt);

    if (this.camMode === "stumble") {
      // ----- STUMBLE GUYS: third-person chase cam behind YOUR cat -----
      const me = this.chars.find((c) => c.humanSlot === 1 && c.alive) ?? this.chars.find((c) => c.alive);
      if (me) {
        // yaw eases toward the cat's facing (so the world turns with you)
        let dy = me.facing - this.camYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.camYaw += dy * Math.min(1, dt * 3.2);
        const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
        const dist = (portrait ? 10.5 : 8.5) * zoom;
        const px = me.position.x, py = Math.max(0, me.position.y), pz = me.position.z;
        this.camPos.lerp(_camT.set(px - sy * dist, py + 3.8 * zoom + 1.2, pz - cy * dist), 1 - Math.exp(-6 * dt));
        this.camLook.lerp(_camT.set(px + sy * 2.4, py + 1.1, pz + cy * 2.4), 1 - Math.exp(-8 * dt));
      }
    } else {
      // ----- GANG BEASTS: fixed low cinematic angle, tight on the brawl -----
      let dYaw = Math.PI - this.camYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.camYaw += dYaw * Math.min(1, dt * 3);
      let useHuman = false;
      for (const c of this.chars) {
        if (c.isHuman && c.alive) {
          useHuman = true;
          break;
        }
      }
      const f = _camF.set(0, 0, 0);
      let spread = 0;
      let n = 0;
      for (const c of this.chars) {
        if (!c.alive || (useHuman && !c.isHuman)) continue;
        _camT.set(c.position.x, Math.max(-2, c.position.y), c.position.z);
        f.add(_camT);
        n++;
      }
      if (n > 0) {
        f.divideScalar(n);
        for (const c of this.chars) {
          if (!c.alive || (useHuman && !c.isHuman)) continue;
          spread = Math.max(spread, Math.hypot(c.position.x - f.x, c.position.z - f.z));
        }
      }
      if (!this.opts.twoPlayer && n > 1) spread = Math.min(spread, 4);
      f.multiplyScalar(0.6);
      f.y = Math.max(0, f.y);
      const dist = ((portrait ? 13.5 : 10.5) + spread * 0.75) * zoom;
      this.camPos.lerp(_camT.set(f.x, f.y + dist * 0.62, f.z + dist), k);
      this.camLook.lerp(_camT.set(f.x, f.y + 0.2, f.z), k);
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
  }

  /** A free spot on the respawning cat's own half of the plane. */
  private respawnSpot(team: number): { x: number; z: number } {
    const side = team === 0 ? -1 : 1;
    for (let i = 0; i < 24; i++) {
      const p = this.arena!.randomSafePoint(0.45);
      if (p.x * side < 0.25) p.x = side * (0.45 + Math.random() * 1.4);
      if (this.arena!.isSafe(p.x, p.z, 0.4)) return p;
    }
    return { x: side * 0.9, z: 0 };
  }

  emitHud() {
    const me = this.chars.find((c) => c.humanSlot === 1);
    const contest = this.chars.find(c => c.isHuman && c.weaponContest)?.weaponContest;
    this.opts.onHud({
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      timeLeft: Math.ceil(this.timeLeft),
      alive: this.chars.filter((c) => c.alive).length,
      total: this.chars.length,
      round: this.round,
      players: this.chars.map((c) => ({
        id: c.index,
        animal: c.def.id,
        eyeStyle: this.roster[c.index].eyeStyle,
        expression: this.roster[c.index].expression,
        name: c.name,
        emoji: c.def.emoji,
        color: c.def.ui,
        dizzy: c.dizzy,
        ko: c.ko,
        alive: c.alive,
        slot: c.humanSlot,
        wins: c.wins,
        team: c.team,
        lives: c.lives,
        flag: c.flag,
      })),
      feed: this.feed.map((f) => ({ id: f.id, text: f.text })),
      banner: this.banner?.text ?? null,
      winner: this.winner,
      meAlive: !!me?.alive,
      respawnIn: me && !me.alive && me.respawnT > 0 ? me.respawnT : null,
      mode: this.opts.mode,
      teamMode: this.opts.mode === "teams",
      teamWins: [this.teamWins[0], this.teamWins[1]],
      teamAlive: [
        this.chars.filter((c) => c.alive && c.team === 0).length,
        this.chars.filter((c) => c.alive && c.team === 1).length,
      ],
      bombs: this.bombs?.live.length ?? 0,
      weaponContest: contest ? {
        owner: contest.owner.name, challenger: contest.challenger.name,
        ownerPresses: contest.ownerPresses, challengerPresses: contest.challengerPresses,
        p1: contest.owner.humanSlot === 1 || contest.challenger.humanSlot === 1,
        p2: contest.owner.humanSlot === 2 || contest.challenger.humanSlot === 2,
      } : null,
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    detachInput();
    for (const c of this.chars) {
      c.removeFromWorld();
      disposeCharacterDetails([c.root]);
      c.nameTag.material.map?.dispose();
      c.nameTag.material.dispose();
    }
    for (const l of Character.loose) disposeCharacterDetails([l.mesh]);
    this.chars = [];
    Character.all = [];
    Character.loose = [];
    Character.thrownProps = [];
    this.seagull?.dispose();
    this.seagull = null;
    this.arena?.dispose();
    this.bombs?.dispose();
    this.pMesh?.geometry.dispose();
    (this.pMesh?.material as THREE.Material | undefined)?.dispose();
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#2f9bff");
  grd.addColorStop(0.4, "#6cc8ff");
  grd.addColorStop(0.72, "#bfeeff");
  grd.addColorStop(1, "#fff1dc");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
