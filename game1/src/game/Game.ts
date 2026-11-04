import * as CANNON from "cannon-es";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, BOT_NAMES, animalById, type AccessoryId, type AnimalDef, type AnimalId } from "./animals";
import { Arena } from "./Arena";
import { BLAST_R, BombManager, type Bomb } from "./Bombs";
import { Character, GRAVITY, bodyOwner, type Bat, type CharacterHooks } from "./Character";
import { attachInput, detachInput, emptyControl, endFrameInput, readControls, type ControlState } from "./input";
import { sfx } from "./audio";
import * as rig from "./rig";
import { getTuning } from "./tuning";
const _ev = new THREE.Vector3();

export interface GameOptions {
  p1Animal: AnimalId;
  twoPlayer: boolean;
  p2Animal: AnimalId;
  p1Acc: AccessoryId;
  p2Acc: AccessoryId;
  bots: number;
  mode: "brawl" | "bomb";
  camMode: "stumble" | "gang";
  camZoom: number; // 0.7 dekat · 1 normal · 1.35 jauh
  onHud: (s: HudState) => void;
}

export interface HudPlayer {
  id: number;
  animal: AnimalId;
  name: string;
  emoji: string;
  color: string;
  dizzy: number;
  ko: boolean;
  alive: boolean;
  slot: number;
  wins: number;
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
  winner: { name: string; emoji: string; human: boolean; animal: AnimalId | null } | null;
  meAlive: boolean;
  mode: "brawl" | "bomb";
  bombs: number;
}

interface RosterEntry {
  acc: AccessoryId;
  def: AnimalDef;
  name: string;
  slot: 0 | 1 | 2;
  wins: number;
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
  wander: number;
  aimT: number;
  fleeT: number;
  fleeX: number;
  fleeZ: number;
  hadBomb: boolean;
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
  arena: Arena | null = null;
  chars: Character[] = [];
  brains = new Map<Character, Brain>();
  roster: RosterEntry[] = [];
  phase: HudState["phase"] = "countdown";
  countdown = 3.5;
  timeLeft = ROUND_TIME;
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
  hitStop = 0;
  tearT = 0;
  batOf = new Map<CANNON.Body, Bat>();
  words: { sp: THREE.Sprite; life: number; vy: number; base: number }[] = [];
  wordTex: Record<string, THREE.CanvasTexture> = {};
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.qBasePR = Math.min(window.devicePixelRatio || 1, smallScreen ? 1.5 : 2);
    this.renderer.setPixelRatio(this.qBasePR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Neutral tone mapping keeps the candy colours saturated (ACES washed them out)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.4, 300);
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    // sky
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xb8e6ff, 50, 130);
    this.scene.add(new THREE.HemisphereLight(0xeaf7ff, 0xffd9b0, 1.55));
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
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as CANNON.GSSolver).iterations = 10;
    this.world.allowSleep = false;
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.05;
    const cm = Character.material;
    this.world.addContactMaterial(new CANNON.ContactMaterial(cm, this.groundMat, { friction: 0.25, restitution: 0.02 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(cm, cm, { friction: 0.35, restitution: 0.15 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.groundMat, { friction: 0.4, restitution: 0.2 }));

    // roster
    this.roster.push({ def: animalById(opts.p1Animal), name: "KAMU", slot: 1, wins: 0, acc: opts.p1Acc });
    if (opts.twoPlayer) this.roster.push({ def: animalById(opts.p2Animal), name: "P2", slot: 2, wins: 0, acc: opts.p2Acc });
    const used = new Set<AnimalId>(this.roster.map((r) => r.def.id));
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < opts.bots; i++) {
      let pool = ANIMALS.filter((a) => !used.has(a.id));
      if (pool.length === 0) pool = ANIMALS;
      const def = pool[Math.floor(Math.random() * pool.length)];
      used.add(def.id);
      const acc: AccessoryId = Math.random() < 0.7 ? ACCESSORIES[1 + Math.floor(Math.random() * (ACCESSORIES.length - 1))].id : "none";
      this.roster.push({ def, name: names[i % names.length], slot: 0, wins: 0, acc });
    }

    // particles pool
    const pg = new THREE.SphereGeometry(1, 8, 6);
    for (const [w, fill] of [
      ["POW!", "#ffd23f"],
      ["BAM!", "#ff7a59"],
      ["BONK!", "#7cf0ff"],
      ["WHAM!", "#ff8fd8"],
      ["BUGH!", "#b6ff6b"],
      ["WUSH!", "#ffffff"],
      ["TONK!", "#ffe14d"],
      ["KLONTANG!", "#ff9ecf"],
      ["BOOM!", "#ff5a3c"],
      ["KABOOM!", "#ffb43c"],
      ["DUAR!", "#ff8fd8"],
    ]) this.wordTex[w] = comicTexture(w, fill);
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      sp.visible = false;
      sp.renderOrder = 20;
      this.scene.add(sp);
      this.words.push({ sp, life: 0, vy: 0, base: 1 });
    }
    // single instanced draw call for ALL particles (was 110 meshes + 110 materials)
    this.pMesh = new THREE.InstancedMesh(
      pg,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false }),
      P_COUNT
    );
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
    const pr = [this.qBasePR, Math.min(this.qBasePR, 1.5), 1.25, 1.0][this.qLevel];
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
    if (rawDt <= 0) return;
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
      this.burst(point.x, point.y, point.z, big ? 14 : 7, big ? 0xffe066 : 0xffffff, big ? 0.22 : 0.15, big ? 1.4 : 1);
      if (big) sfx.bigHit();
      else sfx.hit(Math.min(1.2, dmg / 15));
      const word = kind === "bat" ? "BONK!" : kind === "throw" ? "WHAM!" : kind === "dropkick" ? "BAM!" : kind === "headbutt" ? "BUGH!" : Math.random() < 0.5 ? "POW!" : "BAM!";
      const w2 = victim.accKind === "helmet" && Math.random() < 0.6 ? "TONK!" : word;
      if (big || Math.random() < 0.6) this.comic(w2, point.x, point.y, point.z, big ? 1.25 : 0.85);
      // hit-stop: freeze-frame that makes every hit feel crunchy
      this.hitStop = Math.max(this.hitStop, kind === "bat" || kind === "pan" ? 0.11 : big ? 0.08 : 0.045);
      if (attacker.isHuman || victim.isHuman) this.shake = Math.max(this.shake, kind === "bat" || kind === "pan" ? 0.5 : big ? 0.35 : 0.16);
    },
    onKO: (victim) => {
      this.pushFeed(`${victim.def.emoji} ${victim.name} pingsan! 💫`);
      const p = victim.head.position;
      this.burst(p.x, p.y + 0.4, p.z, 8, 0xffd93d, 0.12);
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
    }
    this.arena?.dispose();
    this.bombs?.dispose();
    this.bombs = null;
    // clear lingering constraints/bodies
    for (const con of [...this.world.constraints]) this.world.removeConstraint(con);
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    for (const l of Character.loose) l.mesh.removeFromParent();
    Character.loose = [];

    this.arena = new Arena(this.world, this.scene, this.groundMat);
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
      if (!this.arena!.isSafe(pos.x, pos.z, 0.3)) {
        const s = this.arena!.randomSafePoint(0.5);
        pos.set(s.x, 0.05, s.z);
      }
      const yaw = Math.atan2(-pos.x, -pos.z);
      const c = new Character(this.world, i, r.def, r.name, r.slot, this.hooks, pos, yaw, emptyControl(), r.acc);
      c.wins = r.wins;
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
          wander: Math.random() * 10,
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

  pushFeed(text: string) {
    this.feed.push({ id: this.feedId++, text, t: 5 });
    if (this.feed.length > 5) this.feed.shift();
  }
  setBanner(text: string) {
    this.banner = { text, t: 2.2 };
  }

  comic(word: string, x: number, y: number, z: number, size = 1) {
    const w = this.words.find((q) => q.life <= 0) ?? this.words[0];
    const m = w.sp.material as THREE.SpriteMaterial;
    m.map = this.wordTex[word];
    m.rotation = (Math.random() - 0.5) * 0.5;
    m.opacity = 1;
    m.needsUpdate = true;
    w.sp.position.set(x, y + 0.5, z);
    w.life = 0.7;
    w.vy = 1.4;
    w.base = size;
    w.sp.visible = true;
  }

  /** Big cartoon explosion: flings EVERYONE in radius, credits the thrower. */
  onBombExplode(pos: THREE.Vector3, thrower: Character | null) {
    // presentation: flash + fire + smoke + comic word
    this.burst(pos.x, pos.y, pos.z, 26, 0xfff3c4, 0.5, 2.4, 1.2);
    this.burst(pos.x, pos.y, pos.z, 22, 0xff9a3c, 0.42, 1.9, 1.0);
    this.burst(pos.x, pos.y, pos.z, 16, 0xff4d3c, 0.36, 1.5, 1.4);
    this.burst(pos.x, pos.y + 0.6, pos.z, 10, 0x555566, 0.5, 0.7, 2.0);
    const word = Math.random() < 0.45 ? "BOOM!" : Math.random() < 0.5 ? "KABOOM!" : "DUAR!";
    this.comic(word, pos.x, pos.y, pos.z, 1.8);
    sfx.explode();
    this.hitStop = Math.max(this.hitStop, 0.16);
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
      c.releaseAll(false); // blast knocks everything out of everyone's hands
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
    let spawned = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      p.life = p.max = 0.35 + Math.random() * 0.25;
      p.pos.set(x, y, z);
      p.vel.set((Math.random() - 0.5) * 6 * speed, (Math.random() * 4 + 1) * up, (Math.random() - 0.5) * 6 * speed);
      p.grow = size * (0.6 + Math.random() * 0.8);
      this.pMesh?.setColorAt(i, _pc.setHex(color));
      if (++spawned >= count) break;
    }
    if (this.pMesh?.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  // ---------------- BOT AI ----------------
  botControl(c: Character, dt: number): ControlState {
    const s = emptyControl();
    const b = this.brains.get(c)!;
    const arena = this.arena!;
    if (!c.alive || c.ko) return s;
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
        if (o === c || !o.alive) continue;
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
        if (o === c || !o.alive) continue;
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
      // intercept: aim where the target is GOING, not where they are
      const rawDx = t.position.x - pos.x;
      const rawDz = t.position.z - pos.z;
      const dist = Math.hypot(rawDx, rawDz) || 0.001;
      const lead = Math.min(0.45, Math.max(0, dist / 12));
      const dx = rawDx + t.torso.velocity.x * lead;
      const dz = rawDz + t.torso.velocity.z * lead;
      const dl = Math.hypot(dx, dz) || 0.001;
      s.mx = dx / dl;
      s.mz = dz / dl;
      s.run = b.runFlag && dist > 3;
      if (dist < 1.7) {
        // in melee range
        s.mx *= 0.35;
        s.mz *= 0.35;
        if (t.ko && b.grabT <= 0 && Math.random() < 0.08) b.grabT = 1.0;
        else if (b.grabT <= 0 && Math.random() < 0.006 * b.aggro) b.grabT = 0.8;
        b.punchT -= dt;
        if (b.punchT <= 0 && b.grabT <= 0 && !t.ko) {
          s.punch = true;
          b.punchT = 0.22 + Math.random() * (0.6 - b.aggro * 0.3);
        }
        if (Math.random() < 0.006 * b.aggro && c.attackCd <= 0) s.headbutt = true;
      } else if (dist > 3 && dist < 5.5 && c.grounded && Math.random() < 0.004 * b.aggro && c.attackCd <= 0) {
        s.jump = true;
        b.dropkickT = 0.2;
      }
    } else {
      b.wander += dt;
      s.mx = Math.cos(b.wander * 0.5) * 0.5;
      s.mz = Math.sin(b.wander * 0.5) * 0.5;
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
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
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
          if (c.lifting && h.carry && !h.owner.ko) h.owner.carriedBy = c;
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
    if (this.hitStop > 0) this.hitStop -= dt;
    this.acc += this.hitStop > 0 ? dt * 0.06 : dt;
    let steps = 0;
    while (this.acc >= H && steps < 6) {
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
            victim.receiveHit(bat.thrower, 32, _hitDir.set(v.x / l, 0, v.z / l), 8, vb);
            victim.capKnockback(6, 3.2);
            this.hooks.onHit(bat.thrower, victim, _hitPos.copy(vb.position), 32, "throw");
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
        this.pushFeed(
          killer
            ? byBomb
              ? `💥 ${killer.name} meledakkan ${c.def.emoji} ${c.name} keluar!`
              : `${killer.def.emoji} ${killer.name} melempar ${c.def.emoji} ${c.name} keluar!`
            : `${c.def.emoji} ${c.name} jatuh sendiri 🤦`
        );
        if (c.isHuman) this.setBanner(c.humanSlot === 1 ? "KAMU TERSINGKIR!" : "P2 TERSINGKIR!");
        sfx.fall();
      }
      if (y < -28) c.removeFromWorld();
    }

    // round end
    if (this.phase === "playing") {
      const alive = this.chars.filter((c) => c.alive);
      if (alive.length <= 1) {
        this.phase = "roundEnd";
        const w = alive[0];
        if (w) {
          const r = this.roster[w.index];
          r.wins++;
          w.wins = r.wins;
          this.winner = { name: w.name, emoji: w.def.emoji, human: w.isHuman, animal: w.def.id };
        } else this.winner = { name: "Seri", emoji: "🤝", human: false, animal: null };
        sfx.win();
        this.emitHud();
      }
    }

    // visuals
    for (const c of this.chars) if (!c.removed) c.syncVisual();
    // particles fade by shrinking (per-instance alpha isn't a thing — 1 draw call total)
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max);
      _ps.setScalar(p.life <= 0 ? 0.0001 : p.grow * (0.15 + 0.85 * k * k));
      _pm.compose(p.pos, _pq.identity(), _ps);
      this.pMesh?.setMatrixAt(i, _pm);
    }
    if (this.pMesh) this.pMesh.instanceMatrix.needsUpdate = true;

    for (const w of this.words) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const k = 1 - w.life / 0.7;
      const pop = k < 0.15 ? (k / 0.15) * 1.25 : 1.25 - Math.min(0.25, (k - 0.15) * 0.6);
      w.sp.scale.set(1.6 * w.base * pop, 0.8 * w.base * pop, 1);
      w.sp.position.y += w.vy * dt;
      w.vy *= 0.9;
      (w.sp.material as THREE.SpriteMaterial).opacity = Math.min(1, w.life / 0.25);
      if (w.life <= 0) w.sp.visible = false;
    }
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
    const zoom = this.camZoom;
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

  emitHud() {
    const me = this.chars.find((c) => c.humanSlot === 1);
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
        name: c.name,
        emoji: c.def.emoji,
        color: c.def.ui,
        dizzy: c.dizzy,
        ko: c.ko,
        alive: c.alive,
        slot: c.humanSlot,
        wins: c.wins,
      })),
      feed: this.feed.map((f) => ({ id: f.id, text: f.text })),
      banner: this.banner?.text ?? null,
      winner: this.winner,
      meAlive: !!me?.alive,
      mode: this.opts.mode,
      bombs: this.bombs?.live.length ?? 0,
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    detachInput();
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

function comicTexture(word: string, fill: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  // spiky burst
  g.translate(128, 64);
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 46 : 62;
    g.lineTo(Math.cos(a) * r * 1.85, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#2b1d3a";
  g.stroke();
  g.font = "900 54px 'Nunito', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 10;
  g.strokeStyle = "#2b1d3a";
  g.strokeText(word, 0, 4);
  g.fillStyle = fill;
  g.fillText(word, 0, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
