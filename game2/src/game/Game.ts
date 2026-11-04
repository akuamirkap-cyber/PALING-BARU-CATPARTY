import * as CANNON from "cannon-es";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, BOT_NAMES, animalById, type AccessoryId, type AnimalDef, type AnimalId } from "./animals";
import { Arena } from "./Arena";
import { Character, GRAVITY, bodyOwner, type Bat, type CharacterHooks } from "./Character";
import { BombSystem } from "./Bombs";
import { attachInput, detachInput, emptyControl, endFrameInput, readControls, type ControlState } from "./input";
import { sfx } from "./audio";
import * as rig from "./rig";
import { getTuning } from "./tuning";
const _ev = new THREE.Vector3();
const _pm4 = new THREE.Matrix4();
const _pq = new THREE.Quaternion();
const _ps = new THREE.Vector3();

export type Quality = "auto" | "high" | "performance";

export interface GameOptions {
  p1Animal: AnimalId;
  twoPlayer: boolean;
  p2Animal: AnimalId;
  p1Acc: AccessoryId;
  p2Acc: AccessoryId;
  bots: number;
  bombMode: boolean;
  quality: Quality;
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
  bombs: number;
  bombMode: boolean;
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
}

const PARTICLE_MAX = 150;
interface ParticleData {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
}

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
  bombSys: BombSystem | null = null;
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
  pMesh!: THREE.InstancedMesh;
  pData: ParticleData[] = [];
  dprCap = 1.5;
  perfAcc = 0;
  perfN = 0;
  perfT = 0;
  sun: THREE.DirectionalLight | null = null;
  raf = 0;
  last = 0;
  acc = 0;
  hudTimer = 0;
  lastCount = 4;
  events = { sweeper: false, ring4: false, ring3: false, ring2: false, ring1: false };
  resizeObs: ResizeObserver;
  disposed = false;
  hitStop = 0;
  tearT = 0;
  batOf = new Map<CANNON.Body, Bat>();
  words: { sp: THREE.Sprite; life: number; vy: number; base: number }[] = [];
  wordTex: Record<string, THREE.CanvasTexture> = {};

  constructor(container: HTMLElement, opts: GameOptions) {
    this.container = container;
    this.opts = opts;

    const lowEnd = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720);
    this.dprCap = opts.quality === "performance" ? 1 : opts.quality === "high" ? 2 : lowEnd ? 1.35 : 1.7;
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== "performance", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.dprCap));
    this.renderer.shadowMap.enabled = opts.quality !== "performance";
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
    this.sun = sun;
    sun.position.set(9, 20, 8);
    sun.castShadow = opts.quality !== "performance";
    const shadowRes = opts.quality === "high" ? 1536 : 1024;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
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
    (this.world.solver as CANNON.GSSolver).iterations = 14;
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
      ["PANG!", "#ffdd78"],
      ["WHAM!", "#ff8fd8"],
      ["BUGH!", "#b6ff6b"],
      ["WUSH!", "#ffffff"],
      ["TONK!", "#ffe14d"],
    ]) this.wordTex[w] = comicTexture(w, fill);
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      sp.visible = false;
      sp.renderOrder = 20;
      this.scene.add(sp);
      this.words.push({ sp, life: 0, vy: 0, base: 1 });
    }
    // ONE instanced mesh for all burst particles (previously ~110 draw calls per frame)
    const pmat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.pMesh = new THREE.InstancedMesh(pg, pmat, PARTICLE_MAX);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.castShadow = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PARTICLE_MAX; i++) {
      this.pMesh.setMatrixAt(i, zero);
      this.pMesh.setColorAt(i, new THREE.Color(0xffffff));
      this.pData.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.1, color: new THREE.Color(0xffffff) });
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

  hooks: CharacterHooks = {
    onHit: (attacker, victim, point, dmg, kind) => {
      const big = kind !== "punch";
      const pan = kind === "pan";
      this.burst(point.x, point.y, point.z, big ? 14 : 7, pan ? 0xffe9a6 : big ? 0xffe066 : 0xffffff, big ? 0.22 : 0.15, big ? 1.4 : 1);
      if (pan) sfx.pan();
      else if (big) sfx.bigHit();
      else sfx.hit(Math.min(1.2, dmg / 15));
      const word = kind === "pan" ? "PANG!" : kind === "bomb" ? "BOOM!" : kind === "bat" ? "BONK!" : kind === "throw" ? "WHAM!" : kind === "dropkick" ? "BAM!" : kind === "headbutt" ? "BUGH!" : Math.random() < 0.5 ? "POW!" : "BAM!";
      const w2 = victim.accKind === "helmet" && Math.random() < 0.6 ? "TONK!" : word;
      if (big || Math.random() < 0.6) this.comic(w2, point.x, point.y, point.z, big ? 1.25 : 0.85);
      // hit-stop: freeze-frame that makes every hit feel crunchy
      this.hitStop = Math.max(this.hitStop, kind === "bat" ? 0.11 : pan ? 0.075 : big ? 0.08 : 0.045);
      if (attacker.isHuman || victim.isHuman) this.shake = Math.max(this.shake, kind === "bat" ? 0.5 : pan ? 0.26 : big ? 0.35 : 0.16);
    },
    onKO: (victim) => {
      this.pushFeed(`${victim.name} pingsan!`);
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
    // clear lingering constraints/bodies
    for (const con of [...this.world.constraints]) this.world.removeConstraint(con);
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    for (const l of Character.loose) l.mesh.removeFromParent();
    Character.loose = [];

    this.bombSys?.dispose();
    this.bombSys = new BombSystem(this.world, this.scene, {
      onExplode: (bomb, hits) => {
        const p = bomb.body.position;
        this.burst(p.x, p.y + 0.2, p.z, 26, 0xffb347, 0.3, 1.8, 1.1);
        this.burst(p.x, p.y + 0.2, p.z, 14, 0x33363f, 0.22, 1.2, 0.8);
        this.comic("BOOM!", p.x, p.y + 0.4, p.z, hits > 1 ? 1.7 : 1.35);
        this.shake = Math.max(this.shake, 0.85);
        this.hitStop = Math.max(this.hitStop, 0.06);
        sfx.boom();
        this.pushFeed(`Bom meledak! ${hits} kucing terpental`);
      },
      onWave: (n) => {
        this.setBanner(`BOM BERTAMBAH · ${n}`);
        this.pushFeed(`Gelombang bom baru! ${n} bom aktif sekaligus`);
        sfx.countdown(true);
      },
    }, this.opts.bombMode ? 1.7 : 1);
    this.bombSys.reset();
    this.arena = new Arena(this.world, this.scene, this.groundMat);
    this.chars = [];
    this.brains.clear();
    const n = this.roster.length;
    this.roster.forEach((r, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2 + (this.round * 0.7);
      // Spawn the whole lobby on the aircraft's central fuselage; wide wings are for
      // movement/knockback, not a rectangular spawn perimeter outside the plane skin.
      const rad = 3.0;
      const pos = new THREE.Vector3(Math.cos(a) * rad, 0.05, Math.sin(a) * rad);
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
    this.events = { sweeper: false, ring4: false, ring3: false, ring2: false, ring1: false };
    this.feed = [];
    this.setBanner(this.opts.bombMode ? `BOM PARTY · RONDE ${this.round}` : `RONDE ${this.round}`);
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

  burst(x: number, y: number, z: number, count: number, color: number, size: number, speed = 1, up = 1) {
    let spawned = 0;
    const col = new THREE.Color(color);
    for (let i = 0; i < this.pData.length; i++) {
      const p = this.pData[i];
      if (p.life > 0) continue;
      p.life = p.max = 0.32 + Math.random() * 0.22;
      p.pos.set(x, y, z);
      p.vel.set((Math.random() - 0.5) * 6 * speed, (Math.random() * 4 + 1) * up, (Math.random() - 0.5) * 6 * speed);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color.copy(col);
      this.pMesh.setColorAt(i, col);
      if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
      if (++spawned >= count) break;
    }
  }

  // ---------------- BOT AI ----------------
  /** keep a bomb-related movement from walking off the arena */
  private safeMove(c: Character, s: ControlState) {
    const arena = this.arena!;
    if (arena.isSafe(c.position.x + s.mx * 1.0, c.position.z + s.mz * 1.0, 0.12)) return;
    const l = Math.hypot(c.position.x, c.position.z) || 1;
    s.mx = -c.position.x / l;
    s.mz = -c.position.z / l;
    s.run = false;
    s.jump = false;
  }

  /** a bomb we're holding (if any) */
  private heldBomb(c: Character) {
    if (!this.bombSys) return null;
    for (const arm of ["armL", "armR"] as const) {
      const h = c.holds[arm];
      if (!h) continue;
      const bomb = this.bombSys.bombs.find((bb) => bb.body === h.body);
      if (bomb) return bomb;
    }
    return null;
  }

  /** pick a bomb target: prefer clusters, cats near the edge, and cats that are not already KO */
  private bombAim(c: Character, bomb: { fuse: number }) {
    let best: Character | null = null;
    let bestScore = -Infinity;
    for (const t of this.chars) {
      if (t === c || !t.alive || t.removed) continue;
      const d = Math.hypot(t.position.x - c.position.x, t.position.z - c.position.z);
      if (d > 10) continue;
      let cluster = 0;
      for (const o of this.chars) if (o !== t && o.alive && Math.hypot(o.position.x - t.position.x, o.position.z - t.position.z) < 2.8) cluster++;
      const edge = Math.min(1, Math.hypot(t.position.x, t.position.z) / 5.6);
      const score = edge * 2.6 + cluster * 1.4 - d * 0.22 + (t.isHuman ? 1.1 : 0) - (t.ko ? 0.6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    void bomb;
    return best;
  }

  /** should the bot run away from a bomb right now? returns a flee direction */
  private bombDanger(c: Character): { mx: number; mz: number; panic: boolean } | null {
    if (!this.bombSys) return null;
    const held = this.heldBomb(c);
    let best: { mx: number; mz: number; panic: boolean } | null = null;
    let bestScore = 0;
    for (const bomb of this.bombSys.bombs) {
      if (bomb.exploded || bomb === held) continue;
      const pb = bomb.body.position;
      const dx = c.position.x - pb.x;
      const dz = c.position.z - pb.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const v = bomb.body.velocity;
      const speed = Math.hypot(v.x, v.z);
      const toward = speed > 3.5 ? (dx * v.x + dz * v.z) / (d * speed) < -0.7 : false;
      let score = 0;
      if (bomb.fuse < 1.6 && d < 3.6) score = (1 - bomb.fuse / 1.6) * 2.2 + (3.6 - d) / 3.6;
      else if (toward && d < 2.6) score = 1.4 + (2.6 - d) / 2.6;
      if (score > bestScore) {
        bestScore = score;
        best = { mx: dx / d, mz: dz / d, panic: bomb.fuse < 0.6 && d < 3.2 };
      }
    }
    return bestScore > 0.55 ? best : null;
  }

  botControl(c: Character, dt: number): ControlState {
    const s = emptyControl();
    const b = this.brains.get(c)!;
    const arena = this.arena!;
    if (!c.alive || c.ko) return s;
    const pos = c.position;

    // if we're holding a bomb that's about to pop, throw it at someone NOW
    const heldNow = this.heldBomb(c);
    if (heldNow && heldNow.fuse < 1.35) {
      const target = this.bombAim(c, heldNow);
      if (target) {
        const ang = Math.atan2(target.position.x - pos.x, target.position.z - pos.z);
        s.mx = Math.sin(ang) * 0.2;
        s.mz = Math.cos(ang) * 0.2;
        if (Math.abs(((ang - c.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.7) s.lift = true;
      } else {
        s.mx = Math.sin(c.facing);
        s.mz = Math.cos(c.facing);
        s.lift = true;
      }
      this.safeMove(c, s);
      return s;
    }
    const danger = this.bombDanger(c);
    if (danger && !heldNow) {
      s.mx = danger.mx;
      s.mz = danger.mz;
      s.run = true;
      if (danger.panic) s.jump = true;
      this.safeMove(c, s);
      return s;
    }

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

    // BOMB PARTY: pick bombs up, carry them out of blast range, and lob them at the best target
    if (this.bombSys && this.bombSys.bombs.length && !c.weapon) {
      const held = this.heldBomb(c);
      if (held) {
        const target = this.bombAim(c, held);
        if (!target) {
          // nothing to hit: toss it away so we don't eat our own blast
          s.mx = Math.sin(c.facing);
          s.mz = Math.cos(c.facing);
          if (held.fuse < 2.6) s.lift = true;
          return s;
        }
        const dx = target.position.x + target.torso.velocity.x * 0.22 - pos.x;
        const dz = target.position.z + target.torso.velocity.z * 0.22 - pos.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const ang = Math.atan2(dx, dz);
        let diff = ang - c.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        // turn toward the target (walking slowly keeps us facing the right way)
        const turnOnly = d < 5.6;
        const mag = turnOnly ? 0.22 : 1;
        s.mx = (dx / d) * mag;
        s.mz = (dz / d) * mag;
        s.run = !turnOnly && d > 6.3;
        const aimed = Math.abs(diff) < 0.5;
        const inRange = d > 1.6 && d < 4.2;
        // also lob it toward the enemy when the fuse is about to pop, even if a bit far
        const wantThrow = d < 2.2 || (inRange && held.fuse < 1.5) || (held.fuse < 2.05 && d < 8.5);
        if (aimed && wantThrow) s.lift = true;
        this.safeMove(c, s);
        return s;
      }
      // choose a bomb worth picking: not about to explode, closer to an enemy than to us
      let bestBomb: CANNON.Body | null = null;
      let bestScore = Infinity;
      for (const bomb of this.bombSys.bombs) {
        if (bomb.exploded || bomb.fuse < 1.7) continue;
        const bp = bomb.body.position;
        if (Math.abs(bp.y - pos.y) > 1.8) continue;
        if (!arena.isSafe(bp.x, bp.z, 0.25)) continue;
        const d = Math.hypot(bp.x - pos.x, bp.z - pos.z);
        if (d > 6.5) continue;
        let enemyNear = 6;
        for (const o of this.chars) if (o !== c && o.alive) enemyNear = Math.min(enemyNear, Math.hypot(bp.x - o.position.x, bp.z - o.position.z));
        const score = d * 0.55 + enemyNear * 0.45 + Math.random() * 0.5;
        if (score < bestScore) {
          bestScore = score;
          bestBomb = bomb.body;
        }
      }
      if (bestBomb) {
        const dx = bestBomb.position.x - pos.x;
        const dz = bestBomb.position.z - pos.z;
        const l = Math.hypot(dx, dz) || 1;
        s.mx = dx / l;
        s.mz = dz / l;
        s.run = l > 2.2;
        if (l < 1.15) s.lift = true;
        this.safeMove(c, s);
        return s;
      }
    }

    // Seek an available melee weapon (baseball bat or teflon pan).
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
      const dx = t.position.x - pos.x;
      const dz = t.position.z - pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      s.mx = dx / dist;
      s.mz = dz / dist;
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
      const dir = sw.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      const perp = Math.abs(dir.x * pos.z - dir.z * pos.x);
      if (perp < 1.0 && Math.random() < 0.12) s.jump = true;
    }
    return s;
  }

  // ---------------- LOOP ----------------
  loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
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
        this.setBanner(this.opts.bombMode ? "LEMPAR BOMNYA!" : "BRAWL!");
      }
    } else if (this.phase === "playing") {
      this.timeLeft -= dt;
      if (!this.events.sweeper && this.timeLeft <= 75) {
        this.events.sweeper = true;
        arena.activateSweeper();
        this.setBanner("⚠️ PALANG PUTAR!");
      }
      if (!this.events.ring4 && this.timeLeft <= 50) {
        this.events.ring4 = true;
        arena.dropRing(4);
        this.setBanner("LAPISAN SAYAP RUNTUH!");
      }
      if (!this.events.ring3 && this.timeLeft <= 38) {
        this.events.ring3 = true;
        arena.dropRing(3);
        this.setBanner("BADAN PESAWAT RUNTUH!");
      }
      if (!this.events.ring2 && this.timeLeft <= 23) {
        this.events.ring2 = true;
        arena.dropRing(2);
        this.setBanner("PESAWAT MAKIN SEMPIT!");
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
    for (const c of this.chars) {
      if (!canControl || !c.alive) c.input = emptyControl();
      else if (c.isHuman) c.input = readControls(c.humanSlot as 1 | 2, this.opts.twoPlayer);
      else c.input = this.botControl(c, dt);
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
    const pt = new CANNON.Vec3();
    const maxSteps = this.dprCap > 1.2 ? 4 : 3;
    while (this.acc >= H && steps < maxSteps) {
      for (const c of this.chars) c.physicsStep(H);
      this.world.step(H);
      for (const con of this.world.contacts) {
        const a = bodyOwner.get(con.bi);
        const b = bodyOwner.get(con.bj);
        const weapon = this.batOf.get(con.bi) ?? this.batOf.get(con.bj);
        if (weapon && weapon.flyT > 0 && weapon.thrower) {
          const victim = (a ?? b)?.char;
          const vb = a ? con.bi : con.bj;
          if (victim && victim !== weapon.thrower && victim.alive && !weapon.hit.has(victim) && weapon.body.velocity.length() > 5) {
            weapon.hit.add(victim);
            const v = weapon.body.velocity;
            const l = Math.hypot(v.x, v.z) || 1;
            const pan = weapon.kind === "pan";
            victim.receiveHit(weapon.thrower, pan ? 20 : 32, new CANNON.Vec3(v.x / l, 0, v.z / l), pan ? 5 : 11, vb);
            this.hooks.onHit(weapon.thrower, victim, vb.position.clone(), pan ? 20 : 32, pan ? "pan" : "throw");
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
            const dir = new CANNON.Vec3(x.torso.velocity.x / l, 0, x.torso.velocity.z / l);
            const by = x.thrownBy ?? x;
            y.receiveHit(by, 26, dir, 9, yb);
            x.receiveHit(by, 10, dir.scale(-1), 2, x.torso);
            this.hooks.onHit(by, y, yb.position.clone(), 26, "throw");
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
            victim.receiveHit(tp.by, 24, new CANNON.Vec3(v.x / l, 0, v.z / l), 9, vb);
            this.hooks.onHit(tp.by, victim, vb.position.clone(), 24, "throw");
            tp.t = 0;
          }
        }
        if (!a && !b) continue;
        if (a) {
          con.bi.position.vadd(con.ri, pt);
          a.char.onContact(a.part, con.bj, pt, b);
        }
        if (b) {
          con.bj.position.vadd(con.rj, pt);
          b.char.onContact(b.part, con.bi, pt, a);
        }
      }
      for (const c of this.chars) if (!c.removed) c.updateHolds(H);
      this.acc -= H;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;

    arena.update(dt, this.timeLeft);
    if (this.phase === "playing") this.bombSys?.update(dt, this.chars.filter((c) => c.alive), (x, z) => arena.isSafe(x, z, 0.2));

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
        this.pushFeed(
          killer
            ? `${killer.name} melempar ${c.name} keluar!`
            : `${c.name} jatuh sendiri`
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
    {
      const mtx = _pm4;
      const q0 = _pq;
      const sv = _ps;
      let dirty = false;
      for (let i = 0; i < this.pData.length; i++) {
        const p = this.pData[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          mtx.makeScale(0, 0, 0);
          this.pMesh.setMatrixAt(i, mtx);
          dirty = true;
          continue;
        }
        p.vel.y -= 12 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const k = p.life / p.max;
        const sc = p.size * (0.35 + k * 0.9);
        sv.set(sc, sc, sc);
        mtx.compose(p.pos, q0, sv);
        this.pMesh.setMatrixAt(i, mtx);
        dirty = true;
      }
      if (dirty) this.pMesh.instanceMatrix.needsUpdate = true;
    }

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

    this.perfAcc += dt;
    this.perfN++;
    this.perfT += dt;
    if (this.perfT > 1 && this.opts.quality !== "high") {
      const avg = this.perfAcc / Math.max(1, this.perfN);
      this.perfAcc = 0;
      this.perfN = 0;
      this.perfT = 0;
      if (avg > 0.023 && this.dprCap > 1.01) {
        this.dprCap = Math.max(1, this.dprCap - 0.15);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.dprCap));
      } else if (avg > 0.03 && this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        if (this.sun) this.sun.castShadow = false;
      }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      this.emitHud();
    }
  }

  updateCamera(dt: number) {
    let focus = this.chars.filter((c) => c.isHuman && c.alive);
    if (focus.length === 0) focus = this.chars.filter((c) => c.alive);
    const f = new THREE.Vector3();
    let spread = 0;
    if (focus.length) {
      for (const c of focus) f.add(new THREE.Vector3(c.position.x, Math.max(-2, c.position.y), c.position.z));
      f.divideScalar(focus.length);
      for (const c of focus) spread = Math.max(spread, Math.hypot(c.position.x - f.x, c.position.z - f.z));
    }
    if (this.opts.twoPlayer === false && focus.length > 1) spread = Math.min(spread, 4);
    f.multiplyScalar(0.6);
    f.y = Math.max(0, f.y);
    const portrait = this.camera.aspect < 1;
    // phones sit closer (cats stay readable); wide screens pull back so the ship silhouette shows
    const dist = (portrait ? 12.4 : 16.6) + spread * (portrait ? 0.6 : 0.9);
    const desired = portrait
      ? new THREE.Vector3(f.x, f.y + dist * 0.62 + 1.1, f.z + dist * 1.12)
      : new THREE.Vector3(f.x, f.y + dist * 0.5 + 2.2, f.z + dist * 1.22);
    const k = 1 - Math.exp(-3.5 * dt);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(new THREE.Vector3(f.x, f.y + 0.9, f.z), k);
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
      bombs: this.bombSys?.bombs.length ?? 0,
      bombMode: this.opts.bombMode,
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.bombSys?.dispose();
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
