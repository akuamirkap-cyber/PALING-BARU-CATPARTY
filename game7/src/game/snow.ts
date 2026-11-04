import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { AR, buildSnowWorld, SnowWorld, terrainGrad, terrainH } from './snowWorld';

const TAU = Math.PI * 2;
const ROUND = 90;
const FRENZY = 15;
const G = 26;
const GRAV = 30;
const R0 = 0.55;
const RB_MAX = 2.1; // ukuran maksimum saat digulung
const R_MAX = 3.0; // ukuran maksimum saat menggelinding
const GROW_M = 0.062; // tambahan radius per meter digulung
const ENG_R = 0.95; // bola sebesar ini menggulung kucing
const ESC_NEED = 8; // tekan SPASI sebanyak ini untuk lolos
const EDGE = AR + 0.45;
const relSpeed = (r: number) => 13 + r * 1.6;
const UP = new THREE.Vector3(0, 1, 0);

export type SPhase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
type SType = 'small' | 'big' | 'gold' | 'igloo';

const SM: Record<SType, { rad: number; h: number; need: number; pts: number; respawn: number; name: string }> = {
  small: { rad: 0.85, h: 2.7, need: 0, pts: 10, respawn: 7, name: 'Boneka Salju' },
  big: { rad: 1.5, h: 4.6, need: 1.35, pts: 30, respawn: 9, name: 'Boneka Raksasa' },
  gold: { rad: 1.05, h: 3.4, need: 0, pts: 80, respawn: 12, name: 'Boneka Emas' },
  igloo: { rad: 2.6, h: 3.2, need: 2.15, pts: 60, respawn: 15, name: 'Igloo' },
};

export interface SBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  isPlayer: boolean;
  score: number;
  kos: number;
  smashed: number;
  biggest: number;
  rank: number;
}

export interface SnowHudState {
  phase: SPhase;
  countdown: number;
  go: boolean;
  timeLeft: number;
  frenzy: boolean;
  board: SBoardEntry[];
  me: {
    hasBall: boolean;
    r: number;
    rFrac: number;
    maxed: boolean;
    engulfCap: boolean;
    rolling: boolean;
    engulfed: boolean;
    escape: number;
    kos: number;
    shoveReady: number;
    diveReady: number;
    buried: boolean;
    stunned: boolean;
    incoming: number;
  };
  map: {
    snowmen: { x: number; y: number; t: SType }[];
    balls: { x: number; y: number; r: number; color: string; me: boolean }[];
    cats: { x: number; y: number; color: string; me: boolean; eng: boolean }[];
  };
  banner: string;
  camYaw: number;
  hint: string;
  muted: boolean;
  playerAnimal: string;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

class Spring {
  a = 0;
  v = 0;
  step(target: number, k: number, c: number, dt: number, torque = 0) {
    const acc = (target - this.a) * k - this.v * c + torque;
    this.v += acc * dt;
    this.a += this.v * dt;
  }
}

interface SInput {
  mx: number;
  mz: number;
  build: boolean;
  release: boolean;
  jump: boolean;
  dive: boolean;
  shove: boolean;
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

// ---------- bola salju ----------
class Ball {
  state: 'dead' | 'build' | 'roll' = 'dead';
  owner: Cat | null = null;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  r = R0;
  kills = 0;
  age = 0;
  slow = 0;
  puffT = 0;
  airborne = false;
  fresh = true;
  trailX = 0;
  trailZ = 0;
  carried: Cat[] = [];
  g: THREE.Group;
  body: THREE.Mesh;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 28, 20);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.035 * Math.sin(x * 5 + z * 3) * Math.cos(y * 4 + x * 2) + 0.02 * Math.sin(z * 9);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    this.body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xe4eeff, roughness: 0.95, emissive: 0x8fa8d4, emissiveIntensity: 0.06 }));
    this.body.castShadow = true;
    this.g = new THREE.Group();
    this.g.add(this.body);
    const peb = new THREE.MeshStandardMaterial({ color: 0x55607a, roughness: 0.9 });
    const dirs = [[0.9, 0.3, 0.3], [-0.5, 0.8, 0.3], [0.2, -0.7, 0.7], [-0.8, -0.2, -0.6], [0.3, 0.2, -0.93], [0.1, 0.97, -0.2], [-0.2, -0.95, -0.2], [0.7, -0.4, -0.6]];
    for (const d of dirs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), peb);
      const l = Math.hypot(d[0], d[1], d[2]);
      m.position.set(d[0] / l, d[1] / l, d[2] / l).multiplyScalar(0.99);
      m.scale.set(1, 0.6, 1);
      m.lookAt(0, 0, 0);
      this.body.add(m);
    }
    this.g.visible = false;
    scene.add(this.g);
    const rg = new THREE.RingGeometry(1.0, 1.22, 40);
    rg.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.visible = false;
    scene.add(this.ring);
  }
}

// ---------- boneka salju ----------
class Snowman {
  type: SType;
  bx: number;
  bz: number;
  x: number;
  z: number;
  y = 0;
  alive = true;
  respawnT = 0;
  popT = 1;
  wobble = 0;
  phase = Math.random() * TAU;
  g: THREE.Group;
  constructor(scene: THREE.Scene, type: SType, x: number, z: number, scarf: number) {
    this.type = type;
    this.bx = this.x = x;
    this.bz = this.z = z;
    this.g = new THREE.Group();
    const snow = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, emissive: 0xb5c8ee, emissiveIntensity: 0.1 });
    const sp = (r: number, m: THREE.Material, x0 = 0, y = 0, z0 = 0) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m);
      o.position.set(x0, y, z0);
      o.castShadow = true;
      return o;
    };
    if (type === 'igloo') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.7, 28, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeef6ff, roughness: 0.8, emissive: 0xa9c4ee, emissiveIntensity: 0.14 }));
      dome.castShadow = true;
      this.g.add(dome);
      for (let k = 1; k < 5; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(2.7 * 2.7 - Math.pow((k * 2.7) / 5, 2)) * 1.002, 0.05, 6, 36), new THREE.MeshStandardMaterial({ color: 0x9db8e0, roughness: 0.9 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = (k * 2.7) / 5;
        this.g.add(ring);
      }
      const tun = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xeef6ff, roughness: 0.85 }));
      tun.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      tun.position.set(0, 0.5, -2.7);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1f2a44, side: THREE.DoubleSide }));
      hole.position.set(0, 0.02, -3.46);
      this.g.add(tun, hole);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 3), new THREE.MeshBasicMaterial({ color: scarf, side: THREE.DoubleSide }));
      flag.position.set(0, 3.1, 0);
      this.g.add(flag);
    } else {
      const gold = type === 'gold';
      const m = gold ? new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.25, metalness: 0.75, emissive: 0x7a4a00, emissiveIntensity: 0.55 }) : snow;
      const sc = type === 'big' ? 1.75 : gold ? 1.15 : 1;
      const grp = new THREE.Group();
      grp.add(sp(0.95, m, 0, 0.95, 0), sp(0.68, m, 0, 2.15, 0), sp(0.5, m, 0, 3.05, 0));
      const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.48, 8), new THREE.MeshStandardMaterial({ color: 0xff8a2e, roughness: 0.6 }));
      carrot.rotation.x = Math.PI / 2;
      carrot.position.set(0, 3.02, 0.62);
      const coal = new THREE.MeshBasicMaterial({ color: 0x1b1b24 });
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), coal);
        e.position.set(s * 0.18, 3.22, 0.44);
        grp.add(e);
      }
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), coal);
        b.position.set(0, 2.3 - k * 0.38, 0.66);
        grp.add(b);
      }
      const sc2 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.13, 8, 20), new THREE.MeshStandardMaterial({ color: scarf, roughness: 0.7 }));
      sc2.rotation.x = Math.PI / 2;
      sc2.position.y = 2.72;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: scarf, roughness: 0.7 }));
      tail.position.set(0.28, 2.4, 0.42);
      tail.rotation.z = 0.2;
      const hat = new THREE.Group();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.6 }));
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.5, 16), new THREE.MeshStandardMaterial({ color: gold ? 0xb02020 : 0x23232e, roughness: 0.6 }));
      crown.position.y = 0.28;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.1, 16), new THREE.MeshStandardMaterial({ color: scarf, roughness: 0.6 }));
      band.position.y = 0.1;
      hat.add(brim, crown, band);
      hat.position.y = 3.45;
      grp.add(carrot, sc2, tail, hat);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5), new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.9 }));
        arm.position.set(s * 0.95, 2.35, 0);
        arm.rotation.z = s * -1.0;
        grp.add(arm);
      }
      grp.scale.setScalar(sc);
      grp.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
      this.g.add(grp);
      if (gold) {
        const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.16, depthWrite: false }));
        halo.position.y = 2.0;
        this.g.add(halo);
      }
    }
    this.y = terrainH(x, z);
    this.g.position.set(x, this.y, z);
    this.g.rotation.y = Math.PI;
    scene.add(this.g);
  }
}

// ---------- kucing ----------
class Cat {
  idx: number;
  name: string;
  color: string;
  colorHex: number;
  def: AnimalDef;
  rig: Rig;
  isPlayer: boolean;
  skill: number;
  spawn: { x: number; z: number };

  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  pvx = 0;
  pvz = 0;
  ax = 0;
  az = 0;
  yaw = 0;
  yawV = 0;
  faceYaw: number | null = null;
  grounded = true;
  falling = false;
  fallT = 0;
  buried = 0;
  ragdoll = 0;
  standT = 0;
  hitCd = 0;
  immune = 0;
  fallX = 0;
  fallZ = 0;
  shoveT = -1;
  shoveCd = 0;
  shoveHit = false;
  diveT = 0;
  diveCd = 0;
  walk = 0;
  flailT = 0;
  flail = [0, 0, 0, 0];
  celebrate = false;
  celT = 0;
  buildCd = 0;
  ball: Ball | null = null;
  rollBall: Ball | null = null;
  buildSnd = 0;
  prevBuild = false;
  engulf: Ball | null = null;
  engOff = new THREE.Vector3(0, 0, 1);
  engN = new THREE.Vector3(0, 1, 0);
  engT = 0;
  engImmune = 0;
  escape = 0;
  koDone = false;
  lastHit: Cat | null = null;
  lastHitT = -99;

  score = 0;
  kos = 0;
  smashed = 0;
  biggest = 0;

  tx = new Spring();
  tz = new Spring();
  sq = new Spring();
  armL = new Spring();
  armR = new Spring();
  legL = new Spring();
  legR = new Spring();
  head = new Spring();
  headZ = new Spring();
  tail = new Spring();

  input: SInput = { mx: 0, mz: 0, build: false, release: false, jump: false, dive: false, shove: false };
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  ai = {
    mode: 'idle' as 'idle' | 'grow' | 'aim' | 'hunt',
    t: rand(1.2, 2.4),
    rPlan: 1.2,
    growT: 0,
    wp: null as { x: number; z: number } | null,
    wpT: 0,
    target: null as { x: number; z: number; vx: number; vz: number } | null,
    isCat: null as Cat | null,
    aimErr: 0,
    waitRel: 0,
    alert: 0,
    huntT: 0,
    huntFor: null as Cat | null,
    aggroT: rand(8, 13),
  };

  constructor(idx: number, def: AnimalDef, name: string, isPlayer: boolean, skill: number, spawn: { x: number; z: number }) {
    this.idx = idx;
    this.def = def;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.spawn = spawn;
    this.color = PLAYER_COLORS[idx];
    this.colorHex = parseInt(this.color.slice(1), 16);
    this.rig = buildAnimal(def, this.colorHex);
    this.rig.rodRoot.visible = false;
    this.tag = document.createElement('div');
    this.tag.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;text-align:center;will-change:transform;white-space:nowrap;';
    this.indEl = document.createElement('div');
    this.indEl.style.cssText = 'font-size:26px;height:32px;line-height:32px;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.5);';
    const nm = document.createElement('div');
    nm.textContent = isPlayer ? `▼ ${name}` : name;
    nm.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-weight:800;font-size:${isPlayer ? 15 : 13}px;color:#fff;background:${this.color};border:2px solid #fff;box-shadow:0 2px 0 rgba(0,0,0,.3);text-shadow:0 1px 0 rgba(0,0,0,.35);`;
    this.tag.append(this.indEl, nm);
    this.reset();
  }

  reset() {
    this.x = this.spawn.x;
    this.z = this.spawn.z;
    this.y = 0;
    this.vx = this.vz = this.vy = 0;
    this.pvx = this.pvz = this.ax = this.az = 0;
    this.yaw = Math.atan2(-this.spawn.x, -this.spawn.z);
    this.yawV = 0;
    this.faceYaw = null;
    this.grounded = true;
    this.falling = false;
    this.fallT = 0;
    this.buried = 0;
    this.ragdoll = 0;
    this.standT = 0;
    this.hitCd = 0;
    this.immune = 0;
    this.shoveT = -1;
    this.shoveCd = 0;
    this.diveT = 0;
    this.diveCd = 0;
    this.celebrate = false;
    this.buildCd = 0;
    this.ball = null;
    this.rollBall = null;
    this.prevBuild = false;
    this.engulf = null;
    this.engT = 0;
    this.engImmune = 0;
    this.escape = 0;
    this.koDone = false;
    this.lastHit = null;
    this.lastHitT = -99;
    this.score = this.kos = this.smashed = this.biggest = 0;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail]) {
      s.a = 0;
      s.v = 0;
    }
    this.input = { mx: 0, mz: 0, build: false, release: false, jump: false, dive: false, shove: false };
    this.ai.mode = 'idle';
    this.ai.t = rand(1.4, 2.6);
    this.ai.target = null;
    this.ai.isCat = null;
    this.ai.alert = 0;
    this.ai.aggroT = rand(8, 13);
    this.rig.root.visible = true;
    this.rig.root.quaternion.identity();
  }
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number; grow: number }[] = [];
  constructor(parent: THREE.Object3D) {
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < 420; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
      m.visible = false;
      parent.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 14, size: 0.1, grow: 0 });
    }
  }
  spawn(x: number, y: number, z: number, color: number, n: number, speed: number, up: number, size: number, life: number, grav = 14, grow = 0, dirx = 0, dirz = 0) {
    for (let k = 0; k < n; k++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * TAU;
      const s = Math.random() * speed;
      p.vx = Math.cos(a) * s + dirx;
      p.vz = Math.sin(a) * s + dirz;
      p.vy = up * (0.4 + Math.random() * 0.9);
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.grav = grav;
      p.grow = grow;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.m.position.set(x, y, z);
      (p.m.material as THREE.MeshBasicMaterial).color.setHex(color);
      p.m.visible = true;
      p.m.scale.setScalar(p.size);
    }
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        continue;
      }
      p.vy -= p.grav * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      const t = p.life / p.max;
      p.m.scale.setScalar(p.size * (p.grow ? 1 + (1 - t) * p.grow : 0.3 + 0.7 * t));
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 2) * (p.grow ? 0.6 : 1);
    }
  }
}

export class SnowEngine {
  private container: HTMLElement;
  private onHud: (h: SnowHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: SnowWorld;
  private particles: Particles;
  private cats: Cat[] = [];
  private balls: Ball[] = [];
  private men: Snowman[] = [];
  private dots: THREE.Mesh[] = [];
  private trail!: THREE.InstancedMesh;
  private trailN = 0;
  private trailDummy = new THREE.Object3D();
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;

  phase: SPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private timeLeft = ROUND;
  private goT = 0;
  private frenzy = false;
  private lastSec = 99;
  private banner = '';
  private bannerT = 0;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;
  private rollSndT = 0;

  private keys = new Set<string>();
  private pend = { build: false, release: false, jump: false, dive: false, shove: false };
  private buildHeld = false;
  private joy = { x: 0, y: 0 };
  private camYaw = 0;
  private camPitch = 0.46;
  private mdx = 0;
  private mdy = 0;
  private touchId: number | null = null;
  private touchLast = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 30, -27);
  private camLook = new THREE.Vector3(0, 0, 0);
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();
  private tq = new THREE.Quaternion();
  private gtmp = { x: 0, z: 0 };

  constructor(container: HTMLElement, onHud: (h: SnowHudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;filter:saturate(1.15) contrast(1.03) brightness(1.02);';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2200);
    this.world = buildSnowWorld(this.scene, PLAYER_COLORS);
    this.particles = new Particles(this.scene);
    for (let i = 0; i < 14; i++) this.balls.push(new Ball(this.scene));
    const dg = new THREE.SphereGeometry(0.17, 8, 6);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.visible = false;
      this.scene.add(m);
      this.dots.push(m);
    }
    // jejak rumput di bawah salju yang tergulung
    const tgeo = new THREE.CircleGeometry(1, 18);
    tgeo.rotateX(-Math.PI / 2);
    this.trail = new THREE.InstancedMesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xa4bd98, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 900);
    this.trail.frustumCulled = false;
    this.clearTrail();
    this.scene.add(this.trail);

    // boneka & igloo di arena (penghalang + sasaran)
    const scarves = [0xe5484d, 0x3d86e8, 0x2fbf71, 0xffa51f, 0xb26bff];
    let k = 0;
    const add = (t: SType, x: number, z: number) => this.men.push(new Snowman(this.scene, t, x, z, scarves[k++ % scarves.length]));
    add('igloo', 0, 0);
    for (const [x, z] of [[3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]]) add('small', x, z);
    for (const [x, z] of [[7.8, 7.8], [-7.8, 7.8], [7.8, -7.8], [-7.8, -7.8]]) add('big', x, z);
    add('gold', 6.8, 0);

    this.setupCats(this.playerAnimal);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    container.addEventListener('contextmenu', this.onCtx);
    container.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.updateCamera(1, true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.container.removeEventListener('contextmenu', this.onCtx);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------- API ----------
  setPlayerAnimal(id: string) {
    this.playerAnimal = id;
    this.setupCats(id);
  }
  start() {
    sfx.resume();
    this.resetAll();
    this.phase = 'countdown';
    this.phaseT = 3.2;
    this.lastCount = 4;
  }
  toMenu() {
    this.resetAll();
    this.phase = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
  }
  toggleMute() {
    sfx.muted = !sfx.muted;
  }
  setJoy(x: number, y: number) {
    this.joy.x = x;
    this.joy.y = y;
  }
  touchBuild() {
    sfx.resume();
    this.pend.build = true;
  }
  touchRelease() {
    this.pend.release = true;
  }
  touchJump() {
    this.pend.jump = true;
  }
  touchDive() {
    this.pend.dive = true;
  }
  touchShove() {
    this.pend.shove = true;
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    sfx.resume();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyN') this.buildHeld = true;
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyM' || e.code === 'Enter') this.pend.release = true;
    if (e.code === 'Space') this.pend.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pend.dive = true;
    if (e.code === 'KeyE' || e.code === 'KeyJ') this.pend.shove = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyN') this.buildHeld = false;
  };
  private onBlur = () => {
    this.keys.clear();
    this.buildHeld = false;
  };
  private onCtx = (e: Event) => e.preventDefault();
  private camActive() {
    return this.phase === 'playing' || this.phase === 'countdown';
  }
  // putar kamera: mouse (terkunci / ditahan), sentuh-geser, atau tombol Q / R
  private onMouseDown = () => {
    sfx.resume();
    if (this.camActive() && !document.pointerLockElement) {
      try {
        const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        /* noop */
      }
    }
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.camActive()) return;
    if (!document.pointerLockElement && !(e.buttons & 3)) return;
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mdx += e.movementX;
    this.mdy += e.movementY;
  };
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    sfx.resume();
    if (this.touchId === null) {
      this.touchId = e.pointerId;
      this.touchLast = { x: e.clientX, y: e.clientY };
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || e.pointerId !== this.touchId || !this.camActive()) return;
    this.mdx += (e.clientX - this.touchLast.x) * 1.4;
    this.mdy += (e.clientY - this.touchLast.y) * 1.4;
    this.touchLast = { x: e.clientX, y: e.clientY };
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerId === this.touchId) this.touchId = null;
  };

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- setup ----------
  private setupCats(animalId: string) {
    for (const c of this.cats) {
      this.scene.remove(c.rig.root);
      c.tag.remove();
    }
    this.cats = [];
    const pd = ANIMALS.find((a) => a.id === animalId) ?? ANIMALS[0];
    const others = ANIMALS.filter((a) => a.id !== pd.id).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const skills = [0.5, 0.7, 0.86];
    const defs = [pd, others[0], others[1], others[2]];
    defs.forEach((d, i) => {
      const c = new Cat(i, d, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1], this.world.spots[i]);
      this.scene.add(c.rig.root);
      this.overlay.appendChild(c.tag);
      this.cats.push(c);
    });
    this.resetAll();
  }

  private resetAll() {
    for (const b of this.balls) this.killBall(b);
    for (const c of this.cats) c.reset();
    for (const m of this.men) {
      m.alive = true;
      m.respawnT = 0;
      m.popT = 1;
      m.g.visible = true;
      m.g.scale.setScalar(1);
    }
    this.clearTrail();
    this.timeLeft = ROUND;
    this.frenzy = false;
    this.lastSec = 99;
    this.goT = 0;
    this.banner = '';
    this.bannerT = 0;
    this.dots.forEach((d) => (d.visible = false));
    const sp = this.cats[0]?.spawn;
    if (sp) this.camYaw = Math.atan2(-sp.x, -sp.z);
    this.camPitch = 0.46;
    this.mdx = this.mdy = 0;
  }

  private player() {
    return this.cats[0];
  }

  // ---------- loop ----------
  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.updatePhase(dt);
    const playing = this.phase === 'playing';
    this.updateMen(dt, playing);
    for (const c of this.cats) {
      if (c.isPlayer) this.readPlayerInput(c, playing);
      else this.botThink(c, dt, playing);
      c.celebrate = this.phase === 'menu' || (this.phase === 'results' && c === this.ranking()[0]);
      c.hitCd -= dt;
      c.immune -= dt;
      c.engImmune -= dt;
      this.handleBall(c, dt, playing);
      this.physics(c, dt);
    }
    this.updateBalls(dt);
    this.collisions();
    for (const c of this.cats) this.animate(c, dt);
    this.updatePreview();
    this.particles.update(dt);
    this.updateCamera(dt, false);
    this.world.update(this.time, dt, this.camLook);
    this.updateLabels();
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    this.shake *= Math.exp(-5 * dt);
    this.onHud(this.buildHud());
  }

  private ranking() {
    return [...this.cats].sort((a, b) => b.score - a.score || b.kos - a.kos);
  }

  private updatePhase(dt: number) {
    if (this.phase === 'countdown') {
      this.phaseT -= dt;
      const n = Math.ceil(this.phaseT);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        sfx.tick();
      }
      if (this.phaseT <= 0) {
        this.phase = 'playing';
        this.timeLeft = ROUND;
        this.goT = 1.3;
        sfx.go();
      }
    } else if (this.phase === 'playing') {
      this.timeLeft -= dt;
      this.goT -= dt;
      if (!this.frenzy && this.timeLeft <= FRENZY) {
        this.frenzy = true;
        sfx.horn();
        this.banner = '🔥 FRENZY! POIN ×2';
        this.bannerT = 2.2;
        const g = this.men.find((m) => m.type === 'gold');
        if (g && !g.alive) g.respawnT = 0.3;
      }
      const s = Math.ceil(this.timeLeft);
      if (this.timeLeft <= 10 && s !== this.lastSec) {
        this.lastSec = s;
        sfx.tick();
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.phase = 'finished';
        this.phaseT = 3;
        sfx.horn();
        for (const c of this.cats) if (c.ball) this.killBall(c.ball);
      }
    } else if (this.phase === 'finished') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'results';
        sfx.fanfare();
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }

  // ---------- input pemain ----------
  private readPlayerInput(f: Cat, playing: boolean) {
    const i = f.input;
    const pend = this.pend;
    if (!playing) {
      i.mx = i.mz = 0;
      f.faceYaw = null;
      i.build = i.release = i.jump = i.dive = i.shove = false;
      pend.build = pend.release = pend.jump = pend.dive = pend.shove = false;
      return;
    }
    const k = this.keys;
    let ux = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let uy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    ux += this.joy.x;
    uy += this.joy.y;
    const m = Math.hypot(ux, uy);
    if (m > 1) {
      ux /= m;
      uy /= m;
    }
    // gerakan relatif terhadap arah kamera (ala Fall Guys): atas = maju ke arah kamera menghadap
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    i.mx = uy * fx + ux * -fz;
    i.mz = uy * fz + ux * fx;
    // saat membawa bola & diam: kucing menghadap ke arah kamera, jadi bidik lewat kamera
    f.faceYaw = f.ball && Math.hypot(ux, uy) < 0.1 ? this.camYaw : null;
    i.build = this.buildHeld || pend.build;
    i.release = pend.release;
    i.jump = pend.jump;
    i.dive = pend.dive;
    i.shove = pend.shove;
    pend.build = pend.release = pend.jump = pend.dive = pend.shove = false;
  }

  // ---------- bot ----------
  private findThreat(f: Cat) {
    let best: { tth: number; ex: number; ez: number; r: number } | null = null;
    for (const b of this.balls) {
      if (b.state !== 'roll') continue;
      if (b.owner === f && b.age < 1.2) continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 3.5) continue;
      const hx = b.vx / sp;
      const hz = b.vz / sp;
      const rx = f.x - b.x;
      const rz = f.z - b.z;
      const along = rx * hx + rz * hz;
      if (along < -b.r || along > 20) continue;
      let px = rx - along * hx;
      let pz = rz - along * hz;
      const pm = Math.hypot(px, pz);
      if (pm > b.r + 2.4) continue;
      if (pm < 0.05) {
        px = -hz;
        pz = hx;
      } else {
        px /= pm;
        pz /= pm;
      }
      const tth = Math.max(0, along - b.r) / sp;
      if (!best || tth < best.tth) best = { tth, ex: px, ez: pz, r: b.r };
    }
    return best;
  }

  private botThink(f: Cat, dt: number, playing: boolean) {
    this.botDecide(f, dt, playing);
    const inp = f.input;
    if (!playing || f.falling || f.buried > 0 || f.engulf) return;
    // jangan berjalan ke tepi tebing
    const rr = Math.hypot(f.x, f.z);
    if (rr > AR - 2.4) {
      const nx = f.x / rr;
      const nz = f.z / rr;
      const dot = inp.mx * nx + inp.mz * nz;
      if (dot > 0) {
        inp.mx -= nx * dot;
        inp.mz -= nz * dot;
      }
    }
  }

  private botDecide(f: Cat, dt: number, playing: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.mx = inp.mz = 0;
    inp.build = inp.release = inp.jump = inp.dive = inp.shove = false;
    f.faceYaw = null;
    if (!playing) return;
    const sk = f.skill;
    if (f.engulf) {
      // tekan SPASI berkali-kali untuk lolos
      if (Math.random() < dt * (3 + sk * 3)) inp.jump = true;
      return;
    }
    if (f.falling || f.buried > 0 || f.ragdoll > 0) return;

    // ---- hindari bola yang menggelinding ----
    const th = this.findThreat(f);
    if (th) {
      ai.alert += dt;
      if (ai.alert >= 0.07 + (1 - sk) * 0.42) {
        inp.mx = th.ex;
        inp.mz = th.ez;
        if (th.tth < 0.44 && f.diveCd <= 0 && f.grounded && !f.ball && Math.random() < 0.45 + sk * 0.45) inp.dive = true;
        else if (th.tth < 0.5 && th.r < 0.8 && f.grounded && Math.random() < 0.08) inp.jump = true;
        return;
      }
    } else ai.alert = 0;

    ai.aggroT -= dt;
    if (ai.mode === 'idle' && !f.ball && ai.aggroT <= 0) {
      ai.aggroT = rand(8, 13);
      if (Math.random() < 0.5) {
        const opp = this.ranking().filter((o) => o !== f && o.buried <= 0 && !o.falling && !o.engulf);
        ai.huntFor = Math.random() < 0.55 ? opp[0] : this.cats[0];
        if (!ai.huntFor || ai.huntFor === f || ai.huntFor.engulf) ai.huntFor = opp[0] ?? null;
        if (ai.huntFor) {
          ai.mode = 'hunt';
          ai.huntT = 4.5;
        }
      }
    }

    if (ai.mode === 'hunt' && ai.huntFor) {
      const t = ai.huntFor;
      ai.huntT -= dt;
      const dx = t.x - f.x;
      const dz = t.z - f.z;
      const d = Math.hypot(dx, dz) || 1;
      if (ai.huntT <= 0 || t.buried > 0 || t.falling || t.engulf) {
        ai.mode = 'idle';
        ai.t = 0.4;
      } else if (d < 1.8 && f.shoveCd <= 0) {
        inp.shove = true;
        f.faceYaw = Math.atan2(dx, dz);
        ai.mode = 'idle';
        ai.t = rand(0.5, 1.2);
      } else if (d > 3.5 && d < 7 && f.diveCd <= 0 && Math.random() < 0.04) {
        inp.dive = true;
        inp.mx = dx / d;
        inp.mz = dz / d;
      } else {
        inp.mx = dx / d;
        inp.mz = dz / d;
      }
      return;
    }

    if (ai.mode === 'idle') {
      ai.t -= dt;
      const dx = f.spawn.x * 0.8 - f.x;
      const dz = f.spawn.z * 0.8 - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.8) {
        inp.mx = (dx / d) * clamp(d / 1.5, 0.3, 1);
        inp.mz = (dz / d) * clamp(d / 1.5, 0.3, 1);
      }
      if (ai.t <= 0 && !f.ball && f.buildCd <= 0) {
        inp.build = true; // tekan N
        ai.rPlan = clamp(0.95 + sk * 0.45 + rand(0, 0.7), 0.95, RB_MAX);
        ai.growT = 0;
        ai.wp = null;
        ai.mode = 'grow';
      }
      return;
    }

    if (ai.mode === 'grow') {
      ai.growT += dt;
      const b = f.ball;
      if (!b) {
        if (ai.growT > 0.6) {
          ai.mode = 'idle';
          ai.t = 0.6;
        }
        return;
      }
      // keliling arena sambil menggulung
      ai.wpT -= dt;
      if (!ai.wp || ai.wpT <= 0 || Math.hypot(ai.wp.x - f.x, ai.wp.z - f.z) < 1.4) {
        const a = rand(0, TAU);
        const r = rand(5, AR - 4.5);
        ai.wp = { x: Math.cos(a) * r, z: Math.sin(a) * r };
        ai.wpT = rand(2.2, 4);
      }
      const dx = ai.wp.x - f.x;
      const dz = ai.wp.z - f.z;
      const d = Math.hypot(dx, dz) || 1;
      inp.mx = dx / d;
      inp.mz = dz / d;
      if (b.r >= ai.rPlan - 0.02 || ai.growT > 13) {
        ai.mode = 'aim';
        ai.t = 0;
        ai.target = null;
        ai.isCat = null;
        ai.aimErr = (Math.random() - 0.5) * 2 * (0.04 + (1 - sk) * 0.2);
        ai.waitRel = 0.15 + (1 - sk) * 0.8;
      }
      return;
    }

    if (ai.mode === 'aim') {
      const b = f.ball;
      if (!b) {
        ai.mode = 'idle';
        ai.t = 0.6;
        return;
      }
      ai.t += dt;
      // pilih target: kucing lawan (utama) atau boneka
      if (!ai.target || ai.t < dt * 1.5 || (ai.isCat && (ai.isCat.buried > 0 || ai.isCat.engulf))) this.botPickTarget(f, ai, b.r);
      let yaw = Math.atan2(-f.x, -f.z);
      if (ai.target) {
        const dx = ai.target.x - b.x;
        const dz = ai.target.z - b.z;
        const flight = Math.hypot(dx, dz) / relSpeed(b.r);
        const px = ai.isCat ? ai.isCat.x + ai.isCat.vx * flight * 0.85 : ai.target.x + ai.target.vx * flight;
        const pz = ai.isCat ? ai.isCat.z + ai.isCat.vz * flight * 0.85 : ai.target.z + ai.target.vz * flight;
        yaw = Math.atan2(px - b.x, pz - b.z) + ai.aimErr;
      }
      f.faceYaw = yaw;
      if (Math.abs(angDiff(f.yaw, yaw)) < 0.07 || ai.t > 2.6) {
        ai.waitRel -= dt;
        if (ai.waitRel <= 0) {
          inp.release = true; // tekan M
          ai.mode = 'idle';
          ai.t = rand(1.8, 3.4) + (1 - sk) * 2.2;
        }
      }
    }
  }

  private botPickTarget(f: Cat, ai: Cat['ai'], r: number) {
    let best: { x: number; z: number; vx: number; vz: number } | null = null;
    let bestCat: Cat | null = null;
    let bs = -1;
    for (const o of this.cats) {
      if (o === f || o.buried > 0 || o.falling || o.engulf) continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d < 4) continue;
      const toEdge = AR - Math.hypot(o.x, o.z);
      const sc = 100 + clamp(8 - toEdge, 0, 8) * 6 - d * 0.8 + (o.isPlayer ? 8 : 0) + rand(0, 25);
      if (sc > bs) {
        bs = sc;
        bestCat = o;
        best = { x: o.x, z: o.z, vx: o.vx, vz: o.vz };
      }
    }
    // kadang incar boneka agar dapat poin
    if (Math.random() < 0.28 || !best) {
      for (const m of this.men) {
        if (!m.alive || m.popT < 1 || SM[m.type].need > r) continue;
        const sc = SM[m.type].pts * 0.8 + rand(0, 30);
        if (sc > bs - 40 || !best) {
          bs = Math.max(bs, sc + 40);
          bestCat = null;
          const a = m.type === 'gold' ? this.time * 0.45 + m.phase : 0;
          best = { x: m.x, z: m.z, vx: m.type === 'gold' ? -Math.sin(a) * 6.8 * 0.45 : 0, vz: m.type === 'gold' ? Math.cos(a) * 6.8 * 0.45 : 0 };
        }
      }
    }
    ai.target = best;
    ai.isCat = bestCat;
  }

  // ---------- bola: bikin & lepas ----------
  private freeBall() {
    return this.balls.find((b) => b.state === 'dead') ?? null;
  }

  private killBall(b: Ball) {
    if (b.carried.length) this.dropCarried(b, false);
    if (b.owner) {
      if (b.owner.ball === b) b.owner.ball = null;
      if (b.owner.rollBall === b) b.owner.rollBall = null;
    }
    b.state = 'dead';
    b.owner = null;
    b.fresh = true;
    b.g.visible = false;
    b.ring.visible = false;
  }

  private handleBall(f: Cat, dt: number, playing: boolean) {
    const inp = f.input;
    f.buildCd -= dt;
    const pressN = inp.build && !f.prevBuild;
    f.prevBuild = inp.build;
    if (f.engulf) {
      f.engT += dt;
      if (inp.jump) {
        f.escape++;
        if (f.isPlayer) {
          sfx.snowBonk();
          this.shake = Math.max(this.shake, 0.12);
        }
        this.particles.spawn(f.x, f.y, f.z, 0xffffff, 3, 2.5, 2, 0.14, 0.4, 8);
      }
      if (f.escape >= ESC_NEED && f.engT > 0.6) this.escapeBall(f);
      return;
    }
    const can = playing && !f.falling && f.buried <= 0 && f.ragdoll <= 0 && f.diveT <= 0 && f.shoveT < 0;
    if (f.ball && !can) {
      this.releaseBall(f, true);
      return;
    }
    if (!can) return;
    // N: mulai membuat bola di depan kucing
    if (!f.ball && pressN && f.buildCd <= 0) {
      const b = this.freeBall();
      if (b) {
        b.state = 'build';
        b.owner = f;
        b.r = R0;
        b.kills = 0;
        b.age = 0;
        b.vx = b.vy = b.vz = 0;
        b.slow = 0;
        b.fresh = true;
        b.carried = [];
        b.airborne = false;
        b.g.visible = true;
        b.g.quaternion.identity();
        b.ringMat.color.setHex(f.colorHex);
        f.ball = b;
        f.buildSnd = 0;
        const px = f.x + Math.sin(f.yaw) * 1.5;
        const pz = f.z + Math.cos(f.yaw) * 1.5;
        b.x = px;
        b.z = pz;
        b.trailX = px;
        b.trailZ = pz;
        this.particles.spawn(px, 0.3, pz, 0xffffff, 10, 2.5, 2, 0.13, 0.5, 6);
        if (f.isPlayer) sfx.snowPop();
      }
    }
    const b = f.ball;
    if (b) {
      f.biggest = Math.max(f.biggest, b.r);
      if (inp.release) this.releaseBall(f, false);
    }
  }

  private releaseBall(f: Cat, accident: boolean) {
    const b = f.ball;
    if (!b) return;
    f.ball = null;
    b.state = 'roll';
    b.age = 0;
    b.kills = 0;
    b.slow = 0;
    const heading = accident ? f.yaw + rand(-0.9, 0.9) : f.yaw;
    const spd = relSpeed(b.r) + (accident ? 1 : 0);
    b.vx = Math.sin(heading) * spd;
    b.vz = Math.cos(heading) * spd;
    b.vy = 0;
    f.rollBall = b;
    f.buildCd = 0.45;
    f.biggest = Math.max(f.biggest, b.r);
    f.armL.v = -14;
    f.armR.v = -14;
    f.tx.v -= 3;
    this.particles.spawn(b.x, b.y - b.r * 0.5, b.z, 0xffffff, 8, 3, 2, 0.15, 0.5, 6);
    if (f.isPlayer || Math.hypot(f.x - this.player().x, f.z - this.player().z) < 14) sfx.snowRelease();
  }

  private clearTrail() {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 900; i++) this.trail.setMatrixAt(i, m);
    this.trail.instanceMatrix.needsUpdate = true;
    this.trailN = 0;
  }

  private addTrail(b: Ball) {
    const dx = b.x - b.trailX;
    const dz = b.z - b.trailZ;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return;
    const o = this.trailDummy;
    const n = Math.min(3, Math.floor(d / 0.4));
    for (let k = 1; k <= n; k++) {
      const x = b.trailX + (dx / d) * 0.4 * k;
      const z = b.trailZ + (dz / d) * 0.4 * k;
      o.position.set(x, 0.04, z);
      o.rotation.set(0, 0, 0);
      o.scale.set(b.r * 0.85, 1, b.r * 0.85);
      o.updateMatrix();
      this.trail.setMatrixAt(this.trailN % 900, o.matrix);
      this.trailN++;
    }
    this.trail.instanceMatrix.needsUpdate = true;
    b.trailX = b.x;
    b.trailZ = b.z;
  }

  // ---------- kucing tergulung bola ----------
  private engulfCat(c: Cat, b: Ball) {
    if (c.ball) this.releaseBall(c, true);
    c.engulf = b;
    b.carried.push(c);
    c.escape = 0;
    c.engT = 0;
    c.koDone = false;
    c.ragdoll = 99;
    c.shoveT = -1;
    c.diveT = 0;
    c.vy = 0;
    const w = this.tv.set(c.x - b.x, 0.12, c.z - b.z).normalize();
    w.x += rand(-0.25, 0.25);
    w.y += rand(-0.1, 0.3);
    w.z += rand(-0.25, 0.25);
    w.normalize();
    c.engOff.copy(w).applyQuaternion(this.tq.copy(b.g.quaternion).invert());
    b.r = Math.min(R_MAX, b.r + 0.1);
    b.vx *= 0.94;
    b.vz *= 0.94;
    this.particles.spawn(c.x, c.y + 1.2, c.z, 0xffffff, 16, 4, 4, 0.3, 0.7, 6, 1.2);
    const near = Math.hypot(c.x - this.player().x, c.z - this.player().z) < 40;
    if (near) sfx.snowHit(1);
    if (c.isPlayer) {
      this.shake = Math.max(this.shake, 0.8);
      this.popup('KELINDAS! TEKAN SPASI!', c.x, c.y + 3.4, c.z, '#bfe9ff', 26);
    } else if (near) this.popup('❄️ KELINDAS!', c.x, c.y + 3.2, c.z, '#ffffff', 20);
    if (b.owner && b.owner !== c) {
      c.lastHit = b.owner;
      c.lastHitT = this.time;
    }
  }

  private escapeBall(c: Cat) {
    const b = c.engulf;
    if (!b) return;
    const i = b.carried.indexOf(c);
    if (i >= 0) b.carried.splice(i, 1);
    c.engulf = null;
    c.escape = 0;
    c.ragdoll = 1.0;
    c.engImmune = 1.0;
    c.hitCd = 0.5;
    c.grounded = false;
    c.y = Math.max(c.y, terrainH(c.x, c.z) + 0.3);
    c.vx = b.vx * 0.55 + rand(-3, 3);
    c.vz = b.vz * 0.55 + rand(-3, 3);
    c.vy = 7.5;
    this.setFall(c, c.vx, c.vz, 1.2);
    c.yawV = rand(-10, 10);
    this.particles.spawn(c.x, c.y + 1, c.z, 0xffffff, 14, 4, 4, 0.25, 0.7, 6, 1.2);
    if (c.isPlayer) this.popup('Lolos! 💪', c.x, c.y + 3, c.z, '#9dff8a', 26);
  }

  private dropCarried(b: Ball, far: boolean) {
    for (const c of b.carried) {
      c.engulf = null;
      c.escape = 0;
      if (far) this.bury(c);
      else {
        c.x = b.x;
        c.z = b.z;
        c.y = Math.max(terrainH(b.x, b.z) + 0.4, b.y + b.r * 0.4);
        c.vx = b.vx * 0.3;
        c.vz = b.vz * 0.3;
        c.vy = 4;
        c.ragdoll = 1.0;
        c.engImmune = 1.0;
        c.hitCd = 0.5;
        c.grounded = false;
      }
    }
    b.carried = [];
  }

  private bury(f: Cat) {
    if (f.buried > 0) return;
    if (f.ball) this.killBall(f.ball);
    f.buried = 2.0;
    f.falling = false;
    f.engulf = null;
    f.ragdoll = 0;
    f.rig.root.visible = false;
    this.particles.spawn(f.x, Math.max(f.y, -36), f.z, 0xffffff, 16, 5, 6, 0.4, 0.9, 6, 1.5);
    if (Math.hypot(f.x, f.z) < 60 && f.isPlayer) this.popup('Terjatuh dari bukit! ❄️', this.camLook.x, 1, this.camLook.z, '#bfe3ff', 26);
  }

  private respawn(f: Cat) {
    for (let t = 0; t < 12; t++) {
      const a = rand(0, TAU);
      const r = rand(3, 9.5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.cats.some((o) => o !== f && o.buried <= 0 && Math.hypot(o.x - x, o.z - z) < 2.4)) continue;
      if (this.men.some((m) => m.alive && m.type !== 'gold' && Math.hypot(m.x - x, m.z - z) < SM[m.type].rad + 1.4)) continue;
      f.x = x;
      f.z = z;
      break;
    }
    f.y = 7;
    f.vx = f.vz = f.vy = 0;
    f.falling = false;
    f.fallT = 0;
    f.ragdoll = 0;
    f.standT = 0.5;
    f.hitCd = 0.5;
    f.immune = 1.6;
    f.engImmune = 1.6;
    f.yaw = Math.atan2(-f.x, -f.z);
    f.tx.a = f.tz.a = 0;
    f.tx.v = f.tz.v = 0;
    f.rig.root.visible = true;
    f.grounded = false;
    this.particles.spawn(f.x, 5, f.z, 0xffffff, 12, 3, 4, 0.2, 0.7, 6, 1);
  }

  // ---------- fisika bola ----------
  private ballStep(b: Ball, dt: number) {
    const gr = terrainGrad(b.x, b.z, this.gtmp);
    let ax = -G * gr.x * 0.92;
    let az = -G * gr.z * 0.92;
    const sp = Math.hypot(b.vx, b.vz);
    const drag = 0.035 + 0.003 * sp;
    ax -= b.vx * drag;
    az -= b.vz * drag;
    if (!b.airborne) {
      b.vx += ax * dt;
      b.vz += az * dt;
    } else {
      b.vx += ax * dt * 0.1;
      b.vz += az * dt * 0.1;
    }
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const gy = terrainH(b.x, b.z) + b.r;
    b.vy -= GRAV * dt;
    b.y += b.vy * dt;
    if (b.y <= gy) {
      const g2 = terrainGrad(b.x, b.z, this.gtmp);
      const vyGround = g2.x * b.vx + g2.z * b.vz;
      if (b.airborne && b.vy < -6) {
        this.particles.spawn(b.x, gy - b.r, b.z, 0xffffff, 10, 4, 3, 0.2, 0.6, 6, 1.2);
        if (b === this.player().rollBall) this.shake = Math.max(this.shake, 0.3);
      }
      b.y = gy;
      b.vy = vyGround;
      b.airborne = false;
    } else if (b.y > gy + 0.35) b.airborne = true;
  }

  private updateBalls(dt: number) {
    const me = this.player();
    this.rollSndT -= dt;
    for (const b of this.balls) {
      if (b.state === 'dead') continue;
      const o = b.owner;
      // --- bola yang sedang digulung kucing: ikut di depannya ---
      if (b.state === 'build' && o) {
        const sp = Math.hypot(o.vx, o.vz);
        const dist = 0.7 + b.r + 0.12;
        let wx = o.x + Math.sin(o.yaw) * dist;
        let wz = o.z + Math.cos(o.yaw) * dist;
        const wr = Math.hypot(wx, wz);
        if (wr > AR - 0.3) {
          wx *= (AR - 0.3) / wr;
          wz *= (AR - 0.3) / wr;
        }
        const px = b.x;
        const pz = b.z;
        if (b.fresh) {
          b.x = wx;
          b.z = wz;
          b.fresh = false;
        } else {
          const k = 1 - Math.exp(-15 * dt);
          b.x += (wx - b.x) * k;
          b.z += (wz - b.z) * k;
        }
        // makin jauh digulung, makin besar
        if (b.r < RB_MAX && sp > 0.6 && o.grounded) {
          const frac = (b.r - R0) / (RB_MAX - R0);
          const before = b.r;
          b.r = Math.min(RB_MAX, b.r + sp * dt * GROW_M * (1 - 0.3 * frac));
          o.buildSnd -= dt;
          if (o.buildSnd <= 0) {
            o.buildSnd = 0.16;
            if (o.isPlayer) sfx.snowBuild(frac);
          }
          if (Math.random() < dt * 14) this.particles.spawn(b.x, 0.2, b.z, 0xf1f6ff, 1, 1.6, 1.8, 0.12, 0.4, 7);
          if (before < RB_MAX && b.r >= RB_MAX && o.isPlayer) {
            sfx.snowGold();
            this.popup('BOLA MAKSIMAL! ⛄', b.x, b.y + b.r + 1.4, b.z, '#ffe14d', 24);
          }
          if (before < ENG_R && b.r >= ENG_R && o.isPlayer) this.popup('Cukup besar untuk menggulung! ❄️', b.x, b.y + b.r + 1.4, b.z, '#bfe9ff', 20);
        }
        b.y = terrainH(b.x, b.z) + b.r;
        const mx = b.x - px;
        const mz = b.z - pz;
        const ml = Math.hypot(mx, mz);
        if (ml > 1e-5) b.g.rotateOnWorldAxis(this.tv.set(mz, 0, -mx).normalize(), ml / b.r);
        this.addTrail(b);
        o.biggest = Math.max(o.biggest, b.r);
        b.g.position.set(b.x, b.y, b.z);
        b.g.scale.setScalar(b.r);
        continue;
      }
      // --- bola menggelinding sendiri ---
      b.age += dt;
      const subs = 2;
      for (let s = 0; s < subs; s++) this.ballStep(b, dt / subs);
      const sp = Math.hypot(b.vx, b.vz);
      const rc = Math.hypot(b.x, b.z);
      if (!b.airborne && sp > 3) b.r = Math.min(R_MAX, b.r + dt * sp * 0.008 * (1 - b.r / (R_MAX + 0.5)));
      if (o) o.biggest = Math.max(o.biggest, b.r);
      // lewat tepi arena: kucing yang tergulung ikut terbawa keluar!
      if (rc > AR + 0.6 && b.carried.length) {
        const n = b.carried.length;
        for (const c of b.carried) {
          if (c.koDone) continue;
          c.koDone = true;
          if (b.owner && b.owner !== c) this.awardKO(b.owner, c, 100 + 50 * (n - 1), n > 1 ? `KO ×${n}!` : 'KO!');
        }
      }
      if (rc > AR + 36 || b.y < -36) {
        this.particles.spawn(b.x, Math.max(b.y, -34), b.z, 0xffffff, 14, 5, 5, 0.6, 0.9, 4, 1.4);
        this.dropCarried(b, true);
        this.killBall(b);
        continue;
      }
      if (sp < 0.8 && b.age > 1.2 && rc < AR) {
        this.particles.spawn(b.x, b.y, b.z, 0xffffff, 8, 3, 3, 0.2, 0.5, 6, 1);
        this.killBall(b);
        continue;
      }
      b.puffT -= dt;
      if (b.puffT <= 0 && sp > 5 && !b.airborne) {
        b.puffT = 0.05;
        this.particles.spawn(b.x, b.y - b.r * 0.8, b.z, 0xffffff, 1, 1.2, 1.2, 0.25 + b.r * 0.1, 0.55, 1, 1.6, -b.vx * 0.12, -b.vz * 0.12);
      }
      if (b === me.rollBall && this.rollSndT <= 0 && !b.airborne) {
        this.rollSndT = 0.12;
        sfx.snowRoll(clamp(sp / 26, 0, 1), clamp(b.r / R_MAX, 0, 1));
      }
      const axis = this.tv.set(b.vz, 0, -b.vx);
      if (axis.lengthSq() > 1e-6) b.g.rotateOnWorldAxis(axis.normalize(), (sp * dt) / b.r);
      if (b === me.rollBall) this.shake = Math.max(this.shake, clamp(sp / 26, 0, 1) * 0.06 * b.r);
      b.g.position.set(b.x, b.y, b.z);
      b.g.scale.setScalar(b.r);
    }
    // kucing yang tergulung menempel di permukaan bola dan ikut berputar
    for (const c of this.cats) {
      const b = c.engulf;
      if (!b) continue;
      const wv = this.tv.copy(c.engOff).applyQuaternion(b.g.quaternion);
      c.engN.copy(wv).normalize();
      c.x = b.x + wv.x * b.r * 0.88;
      c.y = b.y + wv.y * b.r * 0.88;
      c.z = b.z + wv.z * b.r * 0.88;
      c.vx = b.vx;
      c.vz = b.vz;
      c.vy = 0;
      c.grounded = false;
      c.ragdoll = 99;
    }
    for (const b of this.balls) {
      const show = (b.state === 'build' || b.state === 'roll') && !b.airborne && Math.hypot(b.x, b.z) < AR + 0.5;
      b.ring.visible = show;
      if (show) {
        b.ring.position.set(b.x, 0.07, b.z);
        b.ring.scale.setScalar(b.r * 1.08);
      }
    }
  }

  // ---------- boneka salju ----------
  private updateMen(dt: number, playing: boolean) {
    for (const m of this.men) {
      if (m.type === 'gold') {
        const a = this.time * 0.45 * (this.frenzy ? 1.4 : 1) + m.phase;
        m.x = Math.cos(a) * 6.8;
        m.z = Math.sin(a) * 6.8;
        m.g.position.set(m.x, 0, m.z);
      }
      if (!m.alive) {
        if (playing || this.phase === 'finished') m.respawnT -= dt;
        if (m.respawnT <= 0 && this.phase !== 'finished') {
          m.alive = true;
          m.popT = 0;
          m.g.visible = true;
          m.wobble = 0;
          this.particles.spawn(m.x, 0.2, m.z, 0xffffff, 8, 3, 3, 0.2, 0.5, 6, 1.1);
          if (m.type === 'gold' && playing) {
            this.banner = '🌟 BONEKA EMAS MUNCUL!';
            this.bannerT = 1.8;
            sfx.snowGold();
          }
        }
        continue;
      }
      if (m.popT < 1) {
        m.popT = Math.min(1, m.popT + dt * 2.2);
        m.g.scale.setScalar(Math.max(0.01, m.popT * (1 + Math.sin(m.popT * Math.PI) * 0.18 * (1 - m.popT))));
      }
      if (m.wobble > 0) {
        m.wobble = Math.max(0, m.wobble - dt * 2.4);
        m.g.rotation.z = Math.sin(this.time * 24) * 0.14 * m.wobble;
      } else m.g.rotation.z = 0;
      if (m.type === 'gold') m.g.rotation.y = Math.PI + Math.sin(this.time * 2) * 0.5;
    }
  }

  private breakMan(m: Snowman, owner: Cat | null, dirx: number, dirz: number, power: number) {
    m.alive = false;
    const d = SM[m.type];
    m.respawnT = d.respawn * (this.frenzy ? 0.65 : 1) * rand(0.9, 1.15);
    m.g.visible = false;
    const sp = 4 + power * 1.2;
    const gold = m.type === 'gold';
    const big = m.type === 'igloo' ? 12 : m.type === 'big' ? 9 : 6;
    this.particles.spawn(m.x, d.h * 0.5, m.z, gold ? 0xffd23f : 0xffffff, big, sp, 5, 0.42 * (m.type === 'big' ? 1.5 : m.type === 'igloo' ? 1.8 : 1), 1.1, 14, 0, dirx * sp * 0.6, dirz * sp * 0.6);
    this.particles.spawn(m.x, d.h * 0.5, m.z, 0xc9dcff, big, sp * 0.8, 4, 0.28, 0.9, 12, 0, dirx * sp * 0.5, dirz * sp * 0.5);
    this.particles.spawn(m.x, d.h * 0.4, m.z, 0xffffff, 8, 3, 3, 0.5, 1, 1, 2.2);
    if (m.type !== 'igloo') {
      this.particles.spawn(m.x, d.h * 0.8, m.z, 0x23232e, 2, 3, 6, 0.3, 1.1, 14, 0, dirx * sp * 0.4, dirz * sp * 0.4);
      this.particles.spawn(m.x, d.h * 0.7, m.z, 0xff8a2e, 1, 3, 5, 0.18, 1.1, 14);
    }
    const near = Math.hypot(m.x - this.player().x, m.z - this.player().z);
    if (owner?.isPlayer || near < 50) sfx.snowHit(owner?.isPlayer ? 1 : 0.5);
  }

  // ---------- skor ----------
  private addScore(c: Cat, pts: number, text: string, x: number, y: number, z: number, color = '#ffffff', size = 24) {
    const v = Math.round(pts * (this.frenzy ? 2 : 1));
    c.score += v;
    if (c.isPlayer) this.popup(`${text} +${v}${this.frenzy ? ' 🔥' : ''}`, x, y, z, color, size);
    else if (v >= 30) this.popup(`+${v}`, x, y, z, '#' + c.color.slice(1), 18);
  }

  private awardKO(by: Cat, victim: Cat, pts: number, label: string) {
    by.kos++;
    this.addScore(by, pts, `🎯 ${label}`, victim.x, Math.max(victim.y, 0) + 3.4, victim.z, '#ffe14d', 30);
    if (by.isPlayer) {
      sfx.snowStrike(label.includes('×') ? 2 : 1);
      this.shake = Math.max(this.shake, 0.5);
    }
    if (victim.isPlayer && !by.isPlayer) {
      this.banner = `${by.name} menggulungmu!`;
      this.bannerT = 1.6;
    } else if (!victim.isPlayer && !by.isPlayer) {
      this.banner = `${by.name} → ${victim.name} KO!`;
      this.bannerT = 1.4;
    }
  }

  // ---------- tabrakan ----------
  private collisions() {
    const F = this.cats;
    // kucing vs kucing
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        const a = F[i];
        const b = F[j];
        if (a.falling || b.falling || a.buried > 0 || b.buried > 0 || a.engulf || b.engulf) continue;
        if (Math.abs(a.y - b.y) > 1.3) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 1.2;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const pen = min - d;
        a.x -= nx * pen * 0.5;
        a.z -= nz * pen * 0.5;
        b.x += nx * pen * 0.5;
        b.z += nz * pen * 0.5;
        const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rv <= 0) continue;
        a.vx -= nx * rv * 0.6;
        a.vz -= nz * rv * 0.6;
        b.vx += nx * rv * 0.6;
        b.vz += nz * rv * 0.6;
        if (rv > 2.5 && (a.isPlayer || b.isPlayer) && this.time - this.bumpAt > 0.2) {
          this.bumpAt = this.time;
          sfx.bump();
        }
        if (a.diveT > 0 && b.diveT <= 0 && rv > 4) {
          this.knock(b, nx, nz, 10, 1.7, 4.5, a);
          this.hitFx(b);
        } else if (b.diveT > 0 && a.diveT <= 0 && rv > 4) {
          this.knock(a, -nx, -nz, 10, 1.7, 4.5, b);
          this.hitFx(a);
        } else if (rv > 7.5) {
          if (Math.hypot(a.vx, a.vz) < Math.hypot(b.vx, b.vz)) this.knock(a, -nx, -nz, 4, 0.9, 3.5, b);
          else this.knock(b, nx, nz, 4, 0.9, 3.5, a);
        }
      }
    }

    for (const b of this.balls) {
      if (b.state !== 'roll') continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 0.1) continue;
      const o = b.owner;
      // vs boneka / igloo
      for (const m of this.men) {
        if (!m.alive || m.popT < 0.7) continue;
        const d = SM[m.type];
        if (b.y - b.r > d.h) continue;
        const dx = m.x - b.x;
        const dz = m.z - b.z;
        const dist = Math.hypot(dx, dz);
        const hitR = b.r + d.rad * 0.85;
        if (dist >= hitR) continue;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        const dirx = b.vx / (sp || 1);
        const dirz = b.vz / (sp || 1);
        if (b.r >= d.need) {
          b.kills++;
          const mult = 1 + 0.25 * (b.kills - 1);
          if (o) {
            o.smashed++;
            this.addScore(o, d.pts * mult, d.name + (b.kills > 1 ? ` ×${mult.toFixed(2).replace(/\.?0+$/, '')}` : ''), m.x, d.h + 1, m.z, m.type === 'gold' ? '#ffd23f' : '#9dff8a', m.type === 'gold' ? 34 : 24);
            if (m.type === 'gold' && o.isPlayer) sfx.snowGold();
            if (b.kills === 4 || b.kills === 7) {
              if (o.isPlayer) {
                this.banner = b.kills === 4 ? '🎳 STRIKE! ×4' : '💥 SUPER STRIKE! ×7';
                this.bannerT = 1.8;
                sfx.snowStrike(b.kills === 4 ? 1 : 2);
                this.shake = Math.max(this.shake, 0.7);
              } else {
                this.banner = `${o.name}: STRIKE ×${b.kills}!`;
                this.bannerT = 1.4;
              }
            }
          }
          this.breakMan(m, o, dirx, dirz, sp * 0.3);
          b.vx *= 0.93 - Math.min(0.1, d.rad * 0.03);
          b.vz *= 0.93 - Math.min(0.1, d.rad * 0.03);
          b.r *= m.type === 'igloo' ? 0.9 : 0.96;
          if (o?.isPlayer) this.shake = Math.max(this.shake, 0.25 + d.rad * 0.1);
        } else {
          // terlalu kecil: bola memantul
          const vn = b.vx * nx + b.vz * nz;
          if (vn > 0) {
            b.vx -= nx * vn * 1.7;
            b.vz -= nz * vn * 1.7;
          }
          b.x = m.x - nx * hitR;
          b.z = m.z - nz * hitR;
          b.r *= 0.97;
          m.wobble = 1;
          this.particles.spawn(b.x + nx * b.r, b.y, b.z + nz * b.r, 0xffffff, 6, 3, 3, 0.18, 0.5, 8);
          if (o?.isPlayer || Math.hypot(b.x - this.player().x, b.z - this.player().z) < 14) {
            sfx.snowBonk();
            if (o?.isPlayer && b.slow <= 0) {
              this.popup(m.type === 'igloo' ? 'Terlalu kecil untuk igloo! 🛖' : 'Butuh bola LEBIH BESAR! ⛄', m.x, d.h + 1, m.z, '#ffd87a', 20);
              b.slow = 1;
            }
          }
        }
      }
      b.slow = Math.max(0, b.slow - 1 / 30);

      // vs kucing: bola besar menggulung, bola kecil cuma menyenggol
      for (const c of F) {
        if (c.falling || c.buried > 0 || c.engulf) continue;
        if (c === o && b.age < 1.2) continue;
        if (c.immune > 0 || c.engImmune > 0) continue;
        const dx = c.x - b.x;
        const dz = c.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d >= b.r + 0.6 || sp < 3.5) continue;
        if (c.y > b.y + b.r * 0.85) continue; // melompat di atas bola
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const ix = b.vx / sp;
        const iz = b.vz / sp;
        if (b.r >= ENG_R && b.carried.length < 3) {
          this.engulfCat(c, b);
        } else {
          if (c.hitCd > 0 && c.ragdoll > 0) continue;
          this.knock(c, ix * 0.7 + nx * 0.3, iz * 0.7 + nz * 0.3, 6 + sp * 0.45, 1.1 + Math.min(1, sp / 25), 5, o, true);
          b.vx *= 0.9;
          b.vz *= 0.9;
          this.particles.spawn(c.x, c.y + 1.3, c.z, 0xffffff, 12, 4, 4, 0.22, 0.6, 7);
          if (o && o !== c && o.isPlayer) sfx.snowBonk();
        }
      }
    }

    // bola vs bola
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        if (a.state !== 'roll' || b.state !== 'roll') continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= a.r + b.r || d < 1e-4) continue;
        if (Math.abs(a.y - b.y) > a.r + b.r) continue;
        const nx = dx / d;
        const nz = dz / d;
        const big = a.r >= b.r ? a : b;
        const small = big === a ? b : a;
        if (big.r >= small.r * 1.2) {
          this.particles.spawn(small.x, small.y, small.z, 0xffffff, 14, 6, 5, 0.3, 0.8, 8, 0, nx * (big === a ? 3 : -3), nz * (big === a ? 3 : -3));
          if (big.owner) this.addScore(big.owner, 20, 'SMASH!', small.x, small.y + small.r + 1.5, small.z, '#ff9ad5', 26);
          if (big.owner?.isPlayer || small.owner?.isPlayer) sfx.snowHit(0.9);
          big.r = Math.min(R_MAX, big.r + 0.05);
          big.vx *= 0.94;
          big.vz *= 0.94;
          this.killBall(small);
        } else {
          const ma = a.r ** 3;
          const mb = b.r ** 3;
          const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (rv > 0) {
            const jv = (2 * rv) / (ma + mb);
            a.vx -= jv * mb * nx;
            a.vz -= jv * mb * nz;
            b.vx += jv * ma * nx;
            b.vz += jv * ma * nz;
          }
          const pen = (a.r + b.r - d) / 2;
          a.x -= nx * pen;
          a.z -= nz * pen;
          b.x += nx * pen;
          b.z += nz * pen;
          this.particles.spawn((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0xffffff, 6, 3, 3, 0.2, 0.5, 8);
          if (a.owner?.isPlayer || b.owner?.isPlayer) sfx.snowBonk();
        }
      }
    }
  }

  private hitFx(f: Cat) {
    this.particles.spawn(f.x, f.y + 1.2, f.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
    this.popup('💥 BRAK!', f.x, f.y + 2.6, f.z, '#ffe14d', 24);
    sfx.punch();
  }

  // ---------- fisika kucing ----------
  private setFall(f: Cat, dx: number, dz: number, mag: number) {
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const lz = dx * sn + dz * cs;
    const lx = dx * cs - dz * sn;
    const m = Math.hypot(lx, lz) || 1;
    f.fallX = (lz / m) * mag;
    f.fallZ = -(lx / m) * mag;
  }

  private knock(f: Cat, dx: number, dz: number, impulse: number, stun: number, lift: number, by: Cat | null, force = false) {
    if (f.falling || f.buried > 0 || f.engulf) return;
    if (!force && f.hitCd > 0) return;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m;
    dz /= m;
    f.vx += dx * impulse;
    f.vz += dz * impulse;
    f.vy = Math.max(f.vy, lift);
    f.grounded = false;
    f.ragdoll = Math.max(f.ragdoll, stun);
    f.hitCd = 0.35;
    f.shoveT = -1;
    f.diveT = 0;
    if (by && by !== f) {
      f.lastHit = by;
      f.lastHitT = this.time;
    }
    this.setFall(f, dx, dz, 1.45);
    f.tx.v += f.fallX * 7;
    f.tz.v += f.fallZ * 7;
    f.yawV = (Math.random() - 0.5) * 14;
    f.flailT = 0;
    if (f.ball) this.releaseBall(f, true);
    if (f.isPlayer) this.shake = Math.max(this.shake, 0.6);
  }

  private doShove(f: Cat) {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    let hit = false;
    for (const o of this.cats) {
      if (o === f || o.falling || o.buried > 0 || o.engulf) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.15 && Math.abs(o.y - f.y) < 1.6) {
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 11, 1.4, 4.5, f);
        this.particles.spawn(o.x, o.y + 1.3, o.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
        this.popup('💥 POW!', o.x, o.y + 2.6, o.z, '#ffe14d', 24);
        hit = true;
      }
    }
    if (hit) {
      sfx.punch();
      if (f.isPlayer) this.shake = Math.max(this.shake, 0.25);
    } else if (f.isPlayer) sfx.jump();
  }

  private startFall(f: Cat) {
    if (f.falling) return;
    if (f.ball) this.releaseBall(f, true);
    f.falling = true;
    f.fallT = 0;
    f.ragdoll = 99;
    this.setFall(f, f.vx, f.vz, 1.3);
    f.tx.v += f.fallX * 4;
    f.tz.v += f.fallZ * 4;
    if (f.lastHit && f.lastHit !== f && this.time - f.lastHitT < 6 && f.lastHit.buried <= 0) this.awardKO(f.lastHit, f, 60, 'KO!');
    sfx.scream();
    if (f.isPlayer) this.popup('AAAAAA! 😱', f.x, f.y + 3, f.z, '#ff7a7a', 30);
  }

  private physics(f: Cat, dt: number) {
    f.shoveCd -= dt;
    f.diveCd -= dt;
    if (f.buried > 0) {
      f.buried -= dt;
      if (f.buried <= 0) this.respawn(f);
      return;
    }
    if (f.engulf) {
      f.grounded = false;
      return;
    }
    if (f.falling) {
      // meluncur & berguling menuruni lereng
      f.fallT += dt;
      terrainGrad(f.x, f.z, this.gtmp);
      f.vx += -G * this.gtmp.x * 0.75 * dt;
      f.vz += -G * this.gtmp.z * 0.75 * dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      const gy = terrainH(f.x, f.z);
      f.vy -= GRAV * dt;
      f.y += f.vy * dt;
      if (f.y < gy) {
        f.y = gy;
        f.vy = f.vy < -4 ? -f.vy * 0.3 : 0;
      }
      if (f.fallT > 2.2 || f.y < -38) this.bury(f);
      return;
    }
    const playing = this.phase === 'playing';
    const inp = f.input;
    const wasStunned = f.ragdoll > 0;
    if (f.ragdoll > 0) f.ragdoll -= dt;
    if (wasStunned && f.ragdoll <= 0) f.standT = 0.55;
    if (f.standT > 0) f.standT -= dt;
    const stunned = f.ragdoll > 0;

    if (f.diveT > 0) {
      f.diveT -= dt;
      if (f.diveT <= 0) {
        f.ragdoll = 0.7;
        this.setFall(f, f.vx, f.vz, 1.35);
        f.hitCd = 0.2;
      }
    }
    const diving = f.diveT > 0;
    const building = !!f.ball;

    if (inp.jump && f.grounded && !stunned && !diving && playing) {
      f.vy = 10;
      f.grounded = false;
      f.sq.v = -5;
      if (f.isPlayer) sfx.jump();
    }
    if (f.celebrate && f.grounded) {
      f.celT -= dt;
      if (f.celT <= 0) {
        f.vy = 8.5;
        f.grounded = false;
        f.celT = 0.85 + f.idx * 0.07;
        f.sq.v = -4;
      }
    }
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded && playing && !building) {
      const mag = Math.hypot(inp.mx, inp.mz);
      const fx = mag > 0.2 ? inp.mx / mag : Math.sin(f.yaw);
      const fz = mag > 0.2 ? inp.mz / mag : Math.cos(f.yaw);
      f.vx = fx * 12;
      f.vz = fz * 12;
      f.vy = 3;
      f.grounded = false;
      f.diveT = 0.4;
      f.diveCd = 1.7;
      f.yaw = Math.atan2(fx, fz);
      if (f.isPlayer) sfx.dive();
    }
    if (inp.shove && f.shoveCd <= 0 && !stunned && !diving && playing && !building) {
      f.shoveT = 0;
      f.shoveCd = 0.75;
      f.shoveHit = false;
      if (f.faceYaw !== null) f.yaw = f.faceYaw;
      f.vx += Math.sin(f.yaw) * 3.4;
      f.vz += Math.cos(f.yaw) * 3.4;
    }
    if (f.shoveT >= 0) {
      f.shoveT += dt;
      if (!f.shoveHit && f.shoveT >= 0.12) {
        f.shoveHit = true;
        this.doShove(f);
      }
      if (f.shoveT > 0.42) f.shoveT = -1;
    }

    const hasIn = Math.hypot(inp.mx, inp.mz) > 0.1;
    const maxSp = f.ball ? 5.3 - 0.9 * clamp((f.ball.r - R0) / (RB_MAX - R0), 0, 1) : 5.6;
    let dvx = inp.mx * maxSp;
    let dvz = inp.mz * maxSp;
    if (stunned || diving) {
      dvx = 0;
      dvz = 0;
    }
    let k: number;
    if (f.grounded) k = diving ? 0.5 : stunned ? 2.1 : hasIn ? 8 : 3.6;
    else k = stunned || diving ? 0.2 : hasIn ? 1.8 : 0.4;
    const a = 1 - Math.exp(-k * dt);
    f.vx += (dvx - f.vx) * a;
    f.vz += (dvz - f.vz) * a;

    const sp = Math.hypot(f.vx, f.vz);
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else if (diving) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-30 * dt));
    } else if (f.faceYaw !== null) {
      f.yaw += angDiff(f.faceYaw, f.yaw) * (1 - Math.exp(-14 * dt));
    } else if (hasIn) {
      f.yaw += angDiff(Math.atan2(inp.mx, inp.mz), f.yaw) * (1 - Math.exp(-12 * dt));
    } else if (sp > 1.4) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-8 * dt));
    }

    f.x += f.vx * dt;
    f.z += f.vz * dt;

    // boneka & igloo = penghalang (bisa jadi tempat sembunyi dari bola)
    for (const m of this.men) {
      if (!m.alive || m.popT < 0.7 || m.type === 'gold') continue;
      const d = SM[m.type];
      if (f.y > d.h - 0.25) continue;
      const bx = f.x - m.x;
      const bz = f.z - m.z;
      const bd = Math.hypot(bx, bz);
      const mr = d.rad * 0.9 + 0.5;
      if (bd < mr && bd > 1e-4) {
        const nx = bx / bd;
        const nz = bz / bd;
        f.x = m.x + nx * mr;
        f.z = m.z + nz * mr;
        const vn = f.vx * nx + f.vz * nz;
        if (vn < 0) {
          f.vx -= nx * vn * 1.1;
          f.vz -= nz * vn * 1.1;
        }
      }
    }

    const gy = terrainH(f.x, f.z);
    f.vy -= GRAV * dt;
    f.y += f.vy * dt;
    if (f.y <= gy && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) {
        f.sq.v += Math.min(-f.vy, 14) * 0.45;
        if (-f.vy > 7) this.particles.spawn(f.x, gy + 0.1, f.z, 0xffffff, 5, 2, 1.5, 0.16, 0.45, 6, 1);
      }
      f.y = gy;
      f.vy = 0;
      f.grounded = true;
    } else if (f.y > gy + 0.001) f.grounded = false;
    // keluar dari arena = jatuh dari bukit
    if (Math.hypot(f.x, f.z) > EDGE) this.startFall(f);
  }

  // ---------- animasi ----------
  private animate(f: Cat, dt: number) {
    const rig = f.rig;
    if (f.buried > 0) return;
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const sp = Math.hypot(f.vx, f.vz);
    const lz = f.vx * sn + f.vz * cs;
    const lx = f.vx * cs - f.vz * sn;
    const rax = clamp((f.vx - f.pvx) / dt, -45, 45);
    const raz = clamp((f.vz - f.pvz) / dt, -45, 45);
    f.pvx = f.vx;
    f.pvz = f.vz;
    f.ax += (rax - f.ax) * 0.3;
    f.az += (raz - f.az) * 0.3;
    const lacF = f.ax * sn + f.az * cs;
    const lacX = f.ax * cs - f.az * sn;
    const eng = !!f.engulf;
    const stunned = f.ragdoll > 0 || f.falling;
    const diving = f.diveT > 0;
    const building = !!f.ball;
    const growing = building && sp > 0.6 && f.ball!.r < RB_MAX;

    if (eng) {
      f.tx.step(0.2, 30, 5, dt);
      f.tz.step(0, 30, 5, dt);
    } else if (stunned) {
      f.tx.step(f.fallX, 26, 3.2, dt);
      f.tz.step(f.fallZ, 26, 3.2, dt);
    } else {
      let tgx = clamp(lz * 0.055, -0.5, 0.5);
      const tgz = clamp(-lx * 0.05, -0.4, 0.4);
      if (diving) tgx = 1.3;
      if (building) tgx = 0.5 + (growing ? Math.sin(this.time * 11) * 0.06 : 0);
      const kk = f.standT > 0 ? 34 : 75;
      const cc = f.standT > 0 ? 6 : 7;
      f.tx.step(tgx, kk, cc, dt, -lacF * 0.025);
      f.tz.step(tgz, kk, cc, dt, lacX * 0.025);
    }
    f.tx.a = clamp(f.tx.a, -2, 2);
    f.tz.a = clamp(f.tz.a, -2, 2);
    f.sq.step(0, 120, 9, dt);
    f.sq.a = clamp(f.sq.a, -0.5, 0.7);

    const walkAmp = Math.min(1, sp / 3.6) * (f.grounded ? 1 : 0.3);
    if (f.grounded) f.walk += (sp + (growing ? 3 : 0)) * dt * 2.3;
    const sw = Math.sin(f.walk) * Math.max(walkAmp, growing ? 0.6 : 0);
    let aL = sw * 0.9;
    let aR = -sw * 0.9;
    let lL = -sw * 0.85;
    let lR = sw * 0.85;
    let zL = 0.28;
    let zR = -0.28;
    let kA = 95;
    let cA = 8;
    let kL = 120;
    let cL = 9;
    if (!f.grounded && !stunned) {
      aL = aR = f.vy > 0 ? -2.6 : -1.5;
      lL = lR = -0.5;
    }
    if (building) {
      aL = aR = -1.45 + (growing ? Math.sin(this.time * 11) * 0.2 : 0);
      zL = 0.38;
      zR = -0.38;
    }
    if (f.celebrate) {
      aL = aR = -2.9 + Math.sin(this.time * 14 + f.idx) * 0.35;
      zL = 0.7;
      zR = -0.7;
    }
    if (f.shoveT >= 0) {
      const ph = f.shoveT;
      aL = aR = ph < 0.12 ? -0.6 : ph < 0.3 ? -1.7 : -0.5;
      zL = 0.1;
      zR = -0.1;
      kA = 340;
      cA = 22;
    }
    if (diving) {
      aL = aR = -2.9;
      lL = lR = 0.7;
    }
    if (stunned) {
      f.flailT -= dt;
      if (f.flailT <= 0) {
        f.flailT = (eng ? 0.07 : 0.12) + Math.random() * 0.12;
        f.flail = [rand(-2.8, 1.6), rand(-2.8, 1.6), rand(-1.2, 1.2), rand(-1.2, 1.2)];
      }
      aL = f.flail[0];
      aR = f.flail[1];
      lL = f.flail[2];
      lR = f.flail[3];
      zL = 0.28 + Math.sin(this.time * 9 + f.idx) * 0.5;
      zR = -0.28 - Math.sin(this.time * 9 + f.idx + 1) * 0.5;
      kA = 12;
      cA = 1.3;
      kL = 12;
      cL = 1.3;
    }
    f.armL.step(aL, kA, cA, dt, lacF * 0.035);
    f.armR.step(aR, kA, cA, dt, lacF * 0.035);
    f.legL.step(lL, kL, cL, dt);
    f.legR.step(lR, kL, cL, dt);
    f.head.step(-f.tx.a * 0.45, 55, 5, dt, lacF * 0.03);
    f.headZ.step(-f.tz.a * 0.4, 55, 5, dt, -lacX * 0.03);
    f.tail.step(0, 40, 3, dt, lacX * 0.05);

    const lift = 0.15 * Math.max(Math.abs(Math.sin(f.tx.a)), Math.abs(Math.sin(f.tz.a)));
    const bob = f.grounded && !f.celebrate ? Math.abs(Math.sin(f.walk)) * 0.07 * Math.max(walkAmp, growing ? 0.6 : 0) : 0;
    const ry = f.y + lift + bob;
    rig.root.position.set(f.x, ry, f.z);
    if (eng) rig.root.quaternion.setFromUnitVectors(UP, f.engN);
    else rig.root.rotation.set(0, f.yaw, 0);
    rig.tilt.rotation.x = f.tx.a;
    rig.tilt.rotation.z = f.tz.a;
    rig.tilt.scale.set(1 + 0.4 * f.sq.a, 1 - 0.5 * f.sq.a, 1 + 0.4 * f.sq.a);
    rig.armL.rotation.x = f.armL.a;
    rig.armR.rotation.x = f.armR.a;
    rig.armL.rotation.z = zL;
    rig.armR.rotation.z = zR;
    rig.legL.rotation.x = f.legL.a;
    rig.legR.rotation.x = f.legR.a;
    rig.head.rotation.x = f.head.a;
    rig.head.rotation.z = f.headZ.a;
    rig.tail.rotation.y = f.tail.a + Math.sin(this.time * 6 + f.idx) * 0.15 * Math.min(1, sp);
    rig.ring.visible = !eng && !f.falling && f.y < 0.4 && Math.hypot(f.x, f.z) < AR + 0.3;
    rig.ring.position.y = 0.07 - ry;
    rig.ring.scale.setScalar(1 + (f.isPlayer ? Math.sin(this.time * 5) * 0.05 : 0));
    rig.root.updateMatrixWorld(true);
  }

  // ---------- garis bidik: lurus ke depan ----------
  private updatePreview() {
    const me = this.player();
    const b = me.ball;
    const show = !!b && (this.phase === 'playing' || this.phase === 'countdown');
    if (!show || !b) {
      this.dots.forEach((d) => (d.visible = false));
      return;
    }
    const hx = Math.sin(me.yaw);
    const hz = Math.cos(me.yaw);
    this.dots.forEach((d, i) => {
      const dist = b.r + 1.2 + i * 1.7;
      const x = b.x + hx * dist;
      const z = b.z + hz * dist;
      const ok = Math.hypot(x, z) < AR + 6;
      d.visible = ok;
      if (ok) {
        d.position.set(x, Math.max(0.25, terrainH(x, z) + 0.25), z);
        d.scale.setScalar(0.8 + 0.4 * Math.sin(this.time * 8 - i * 0.7));
      }
    });
  }

  // ---------- kamera ala Fall Guys: mengikuti dari belakang bahu, bisa diputar bebas ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.player();
    const aspect = this.w / this.h;
    const zoom = aspect < 0.8 ? 1.5 : aspect < 1.25 ? 1.2 : 1;
    const desired = this.tv;
    const look = this.tv2;
    let fov = 60;
    let kc = instant ? 1 : 1 - Math.exp(-14 * dt);
    let kl = instant ? 1 : 1 - Math.exp(-18 * dt);
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = Math.sin(this.time * 0.15) * 0.9;
      desired.set(Math.sin(a) * 15 * zoom, 6.4 * zoom, -Math.cos(a) * 15.5 * zoom);
      look.set(0, 3.2, 0);
      fov = 58;
      kc = kl = instant ? 1 : 1 - Math.exp(-3.2 * dt);
    } else {
      // putar kamera: geser mouse / geser layar / tombol Q & R
      this.camYaw -= this.mdx * 0.0026;
      this.camPitch = clamp(this.camPitch + this.mdy * 0.0026, 0.1, 1.15);
      this.mdx = this.mdy = 0;
      if (this.keys.has('KeyQ')) this.camYaw += 1.9 * dt;
      if (this.keys.has('KeyR')) this.camYaw -= 1.9 * dt;
      if (this.camYaw > Math.PI) this.camYaw -= TAU;
      else if (this.camYaw < -Math.PI) this.camYaw += TAU;
      if (this.phase === 'countdown') {
        kc = instant ? 1 : 1 - Math.exp(-4 * dt);
        kl = instant ? 1 : 1 - Math.exp(-5 * dt);
      }
      let tx = me.x;
      let ty = me.y + 1.6;
      let tz = me.z;
      if (me.buried > 0) {
        tx = 0;
        ty = 1;
        tz = 0;
      }
      const dist = (10.5 + (me.ball ? me.ball.r * 1.8 : 0) + (me.engulf ? 2 : 0)) * zoom;
      const horiz = Math.cos(this.camPitch) * dist;
      const up = Math.sin(this.camPitch) * dist;
      const sy = Math.sin(this.camYaw);
      const cy = Math.cos(this.camYaw);
      desired.set(tx - sy * horiz, ty + up + 0.7, tz - cy * horiz);
      desired.y = Math.max(desired.y, terrainH(desired.x, desired.z) + 1.4);
      look.set(tx + sy * 2.6, ty + 0.5, tz + cy * 2.6);
    }
    this.camPos.lerp(desired, kc);
    this.camLook.lerp(look, kl);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fov, instant ? 1 : 1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
    const sh = this.shake * 0.7;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  private project(x: number, y: number, z: number) {
    const v = this.tv3.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, vis: v.z < 1 && v.z > -1 };
  }

  private updateLabels() {
    for (const f of this.cats) {
      if (f.buried > 0) {
        f.tag.style.display = 'none';
        continue;
      }
      const p = this.project(f.x, f.y + 3.7, f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      f.tag.style.display = p.vis ? 'block' : 'none';
      let ind = '';
      if (f.engulf) ind = '🥶';
      else if (f.falling) ind = '😱';
      else if (f.ragdoll > 0) ind = '💫';
      else if (f.ball) ind = f.ball.r >= RB_MAX - 0.001 ? '⛄MAX' : '⛄';
      else if (this.phase === 'results' && f === this.ranking()[0]) ind = '👑';
      if (f.indEl.textContent !== ind) f.indEl.textContent = ind;
    }
  }

  popup(text: string, x: number, y: number, z: number, color: string, size = 24) {
    const p = this.project(x, y, z);
    if (!p.vis) return;
    const d = document.createElement('div');
    d.textContent = text;
    d.className = 'game-popup';
    d.style.left = `${clamp(p.x, 40, this.w - 40)}px`;
    d.style.top = `${clamp(p.y, 40, this.h - 60)}px`;
    d.style.color = color;
    d.style.fontSize = `${size}px`;
    this.overlay.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  // ---------- HUD ----------
  private buildHud(): SnowHudState {
    const me = this.player();
    const board: SBoardEntry[] = this.ranking().map((c, i) => ({
      id: c.idx,
      name: c.name,
      animal: c.def.id,
      color: c.color,
      isPlayer: c.isPlayer,
      score: c.score,
      kos: c.kos,
      smashed: c.smashed,
      biggest: c.biggest,
      rank: i + 1,
    }));
    const playing = this.phase === 'playing';
    const b = me.ball;
    const rb = me.rollBall && me.rollBall.state === 'roll' ? me.rollBall : null;
    const r = b ? b.r : 0;
    // bola yang mengarah ke pemain
    let incoming = 0;
    if (playing && me.buried <= 0 && !me.engulf) {
      const th = this.findThreat(me);
      if (th) incoming = clamp(1 - th.tth / 1.8, 0.15, 1);
    }
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! N = bikin bola · jalan/lari menggulungnya · geser mouse (atau Q/R) putar kamera · M = lepas ⛄';
    else if (playing) {
      if (me.engulf) hint = '🥶 KAMU TERGULUNG BOLA! Tekan SPASI berkali-kali untuk lolos!';
      else if (me.buried > 0 || me.falling) hint = 'Terjatuh dari bukit! ❄️ Sebentar lagi muncul lagi di arena.';
      else if (me.ragdoll > 0) hint = 'Kamu terpental! 💫';
      else if (incoming > 0.3) hint = '⚠ ADA BOLA MENGGELINDING KE ARAHMU! Menghindar / loncat (SHIFT = terjang)';
      else if (b && b.r >= RB_MAX - 0.001) hint = 'Bola MAKSIMAL! Hadapkan ke lawan lalu tekan M 🚀';
      else if (b) hint = b.r >= ENG_R ? 'Bola cukup besar menggulung kucing! Jalan terus untuk membesarkan · M = lepas' : 'JALAN / LARI sambil menggulung = bola makin besar · M = lepas';
      else if (rb) hint = 'Bola menggelinding sendiri!';
      else if (this.timeLeft > ROUND - 10) hint = 'N = bikin bola · jalan/lari menggulungnya · diam & putar kamera untuk membidik · M = lepas';
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      go: playing && this.goT > 0,
      timeLeft: this.timeLeft,
      frenzy: this.frenzy && playing,
      board,
      me: {
        hasBall: !!b,
        r,
        rFrac: clamp((r - R0) / (RB_MAX - R0), 0, 1),
        maxed: !!b && b.r >= RB_MAX - 0.001,
        engulfCap: !!b && b.r >= ENG_R,
        rolling: !!rb,
        engulfed: !!me.engulf,
        escape: clamp(me.escape / ESC_NEED, 0, 1),
        kos: me.kos,
        shoveReady: clamp(1 - me.shoveCd / 0.75, 0, 1),
        diveReady: clamp(1 - me.diveCd / 1.7, 0, 1),
        buried: me.buried > 0 || me.falling,
        stunned: me.ragdoll > 0 && !me.engulf,
        incoming,
      },
      map: {
        snowmen: this.men.filter((m) => m.alive).map((m) => ({ x: m.x, y: m.z, t: m.type })),
        balls: this.balls.filter((x) => x.state !== 'dead').map((x) => ({ x: x.x, y: x.z, r: x.r, color: x.owner ? x.owner.color : '#ffffff', me: x.owner === me })),
        cats: this.cats.filter((c) => c.buried <= 0).map((c) => ({ x: c.x, y: c.z, color: c.color, me: c.isPlayer, eng: !!c.engulf })),
      },
      banner: this.banner,
      camYaw: this.camYaw,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }
}
