import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { buildHuntWorld, H_DOCK_R, H_SHORE, H_WATER_Y, hWave, HSpot, HuntWorld } from './huntWorld';

export const H_ROUND = 90;
export const H_FRENZY = 15;
export const MAG = 5;
const RELOAD_T = 1.7;
const BOLT_T = 0.8;
const BULLET_V = 480;
const SCOPE_FOV = 13;
const HIP_FOV = 62;
const DUCK_SCALE = 1.9;
const TAU = Math.PI * 2;

export type HPhase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
export type DuckType = 'mallard' | 'teal' | 'gold' | 'bomb';

export interface HBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  score: number;
  hits: number;
  heads: number;
  streak: number;
  bestStreak: number;
  acc: number;
  isPlayer: boolean;
  rank: number;
}

export interface HuntHudState {
  phase: HPhase;
  countdown: number;
  go: boolean;
  timeLeft: number;
  frenzy: boolean;
  board: HBoardEntry[];
  me: {
    ammo: number;
    mag: number;
    reload: number;
    bolt: number;
    scoped: boolean;
    scopeK: number;
    stunned: boolean;
    swimming: boolean;
    streak: number;
    mult: number;
    shoveReady: number;
    diveReady: number;
    sway: number;
    hurt: number;
  };
  radar: { yaw: number; ducks: { x: number; y: number; t: DuckType }[]; players: { x: number; y: number; color: string; me: boolean }[] };
  hitSeq: number;
  hitKind: 'hit' | 'head' | 'bad' | 'gold';
  banner: string;
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

const DUCK_DEF: Record<DuckType, { pts: number; r: number; head: number; spd: [number, number]; w: number; name: string }> = {
  mallard: { pts: 10, r: 1.45, head: 0.8, spd: [9, 12], w: 60, name: 'Bebek Biasa' },
  teal: { pts: 25, r: 1.35, head: 0.72, spd: [15, 19], w: 24, name: 'Bebek Cepat' },
  gold: { pts: 75, r: 1.3, head: 0.72, spd: [16, 20], w: 8, name: 'Bebek Emas' },
  bomb: { pts: -25, r: 1.5, head: 0.78, spd: [8, 10], w: 9, name: 'Bebek Bom' },
};

// ---------- model bebek ----------
function buildDuckModel(type: DuckType) {
  const g = new THREE.Group();
  const C = {
    mallard: { body: 0x9a6b3f, head: 0x1f8a57, wing: 0x7a4f2c },
    teal: { body: 0x2fb5d8, head: 0x1b4f9c, wing: 0x1f8fb3 },
    gold: { body: 0xffc21a, head: 0xffd84d, wing: 0xffa800 },
    bomb: { body: 0x2b2b33, head: 0x1c1c22, wing: 0x3a3a45 },
  }[type];
  const m = (c: number, rough = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const bodyMat =
    type === 'gold' ? new THREE.MeshStandardMaterial({ color: C.body, roughness: 0.25, metalness: 0.7, emissive: 0x6a4500, emissiveIntensity: 0.7 }) : m(C.body);
  const sp = (r: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    o.scale.set(sx, sy, sz);
    return o;
  };
  g.add(sp(1, bodyMat, 0.5, 0.42, 0.82));
  if (type === 'mallard') {
    const breast = sp(1, m(0xf2e2c4), 0.42, 0.34, 0.5);
    breast.position.set(0, -0.05, 0.3);
    g.add(breast);
  }
  const head = sp(0.27, type === 'gold' ? bodyMat : m(C.head), 1, 1, 1);
  head.position.set(0, 0.42, 0.66);
  g.add(head);
  if (type === 'mallard') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), m(0xffffff));
    ring.position.set(0, 0.27, 0.56);
    ring.rotation.x = Math.PI / 2 - 0.5;
    g.add(ring);
  }
  const beak = sp(1, m(type === 'bomb' ? 0xcc2222 : 0xffa81f, 0.5), 0.2, 0.07, 0.28);
  beak.position.set(0, 0.38, 0.93);
  g.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      type === 'bomb' ? new THREE.MeshBasicMaterial({ color: 0xff3b2e }) : new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    eye.position.set(s * 0.15, 0.48, 0.81);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), m(C.wing));
  tail.rotation.x = -Math.PI / 2 - 0.25;
  tail.position.set(0, 0.2, -0.88);
  tail.scale.x = 1.4;
  g.add(tail);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.36, 0.2, 0.05);
    const wm = sp(1, m(C.wing), 1, 0.07, 0.4);
    wm.scale.set(0.95, 0.07, 0.4);
    wm.position.x = s * 0.55;
    w.add(wm);
    const tip = sp(1, m(type === 'mallard' ? 0x2a6bd0 : C.wing), 0.3, 0.06, 0.34);
    tip.position.set(s * 1.3, 0, -0.02);
    w.add(tip);
    g.add(w);
    wings.push(w);
  }
  let fuse: THREE.Mesh | null = null;
  if (type === 'bomb') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), m(0x8a6a3a));
    stick.position.set(0, 0.78, 0.6);
    g.add(stick);
    fuse = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa530 }));
    fuse.position.set(0, 0.98, 0.6);
    g.add(fuse);
  }
  if (type === 'gold') {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.2, depthWrite: false }));
    g.add(halo);
  }
  g.scale.setScalar(DUCK_SCALE);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material && !((o as THREE.Mesh).material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) o.castShadow = false;
  });
  return { g, wings, fuse };
}

class Duck {
  type: DuckType;
  def: (typeof DUCK_DEF)[DuckType];
  g: THREE.Group;
  wings: THREE.Group[];
  fuse: THREE.Mesh | null;
  pos = new THREE.Vector3();
  ang = 0;
  baseAng = 0;
  targetAng = 0;
  turnT = 0.5;
  speed = 10;
  altT = 10;
  phase = Math.random() * TAU;
  t = 0;
  alive = true;
  vy = 0;
  fallVx = 0;
  fallVz = 0;
  spinX = 0;
  spinZ = 0;
  flap = Math.random() * TAU;
  bank = 0;
  trailT = 0;
  killer: Hunter | null = null;

  constructor(type: DuckType) {
    this.type = type;
    this.def = DUCK_DEF[type];
    const m = buildDuckModel(type);
    this.g = m.g;
    this.wings = m.wings;
    this.fuse = m.fuse;
  }
  vel(out: THREE.Vector3) {
    return out.set(Math.sin(this.ang) * this.speed, 0.0, Math.cos(this.ang) * this.speed);
  }
}

// ---------- model sniper ----------
function buildRifle(accent: number) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.4, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 });
  const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 });
  const cyl = (r1: number, r2: number, len: number, mat: THREE.Material, z: number, y = 0, x = 0) => {
    const geo = new THREE.CylinderGeometry(r1, r2, len, 10);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  cyl(0.045, 0.05, 1.7, metal, 1.05);
  cyl(0.07, 0.07, 0.22, metal, 1.95);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.75), metal);
  body.position.set(0, 0, 0.1);
  g.add(body);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.62), wood);
  stock.position.set(0, -0.03, -0.5);
  g.add(stock);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.07), acc);
  pad.position.set(0, -0.03, -0.84);
  g.add(pad);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), wood);
  grip.position.set(0, -0.17, -0.12);
  grip.rotation.x = 0.3;
  g.add(grip);
  // scope
  cyl(0.085, 0.085, 0.62, metal, 0.35, 0.17);
  cyl(0.115, 0.095, 0.14, metal, 0.7, 0.17);
  cyl(0.1, 0.12, 0.14, metal, -0.0, 0.17);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 14), new THREE.MeshBasicMaterial({ color: 0x66b8ff }));
  lens.position.set(0, 0.17, 0.78);
  g.add(lens);
  const mnt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.1), metal);
  mnt.position.set(0, 0.1, 0.5);
  g.add(mnt);
  const mnt2 = mnt.clone();
  mnt2.position.z = 0.15;
  g.add(mnt2);
  // bolt
  cyl(0.02, 0.02, 0.18, metal, 0.0, 0.0, 0.14).rotation.set(0, 0, Math.PI / 2);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), acc);
  knob.position.set(0.22, 0, 0);
  g.add(knob);
  // bipod
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6), metal);
    leg.position.set(s * 0.1, -0.16, 1.5);
    leg.rotation.z = s * 0.25;
    leg.rotation.x = 0.4;
    g.add(leg);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 2.08);
  g.add(muzzle);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  return { g, muzzle };
}

interface HInput {
  mx: number;
  mz: number;
  fire: boolean;
  scope: boolean;
  shove: boolean;
  dive: boolean;
  jump: boolean;
  reload: boolean;
}

class Hunter {
  idx: number;
  name: string;
  color: string;
  colorHex: number;
  def: AnimalDef;
  rig: Rig;
  isPlayer: boolean;
  skill: number;
  spot: HSpot;
  gun: THREE.Group;
  muzzle: THREE.Object3D;

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
  aimYaw = 0;
  aimPitch = 0.1;
  grounded = true;
  falling = false;
  ragdoll = 0;
  standT = 0;
  swim = 0;
  hitCd = 0;
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

  ammo = MAG;
  reloadT = 0;
  boltT = 0;
  boltSnd = false;
  recoil = 0;
  scoped = false;
  scopeK = 0;
  swayBoost = 0;
  steadyT = 0;
  stunLite = 0;
  hurt = 0;
  fireBuf = 0;
  wasScoped = false;

  score = 0;
  hits = 0;
  heads = 0;
  shots = 0;
  streak = 0;
  bestStreak = 0;

  input: HInput = { mx: 0, mz: 0, fire: false, scope: false, shove: false, dive: false, jump: false, reload: false };

  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  ai = {
    mode: 'shoot' as 'shoot' | 'hunt',
    aggroT: rand(8, 14),
    huntT: 0,
    target: null as Hunter | null,
    duck: null as Duck | null,
    pickT: 0,
    acquire: 0,
    errYaw: 0,
    errPitch: 0,
    cool: rand(0.5, 1.5),
    wanderT: 0,
    wx: 0,
    wz: 0,
    idleYaw: 0,
  };

  constructor(idx: number, def: AnimalDef, name: string, isPlayer: boolean, skill: number, spot: HSpot) {
    this.idx = idx;
    this.def = def;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.spot = spot;
    this.color = PLAYER_COLORS[idx];
    this.colorHex = parseInt(this.color.slice(1), 16);
    this.rig = buildAnimal(def, this.colorHex);
    this.rig.rodRoot.visible = false;
    const r = buildRifle(this.colorHex);
    this.gun = new THREE.Group();
    this.gun.position.set(0, 1.28, 0.22);
    this.gun.add(r.g);
    this.muzzle = r.muzzle;
    this.rig.inner.add(this.gun);

    this.tag = document.createElement('div');
    this.tag.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;text-align:center;will-change:transform;white-space:nowrap;';
    this.indEl = document.createElement('div');
    this.indEl.style.cssText = 'font-size:28px;height:34px;line-height:34px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35));';
    const nm = document.createElement('div');
    nm.textContent = isPlayer ? `▼ ${name}` : name;
    nm.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-weight:800;font-size:${isPlayer ? 15 : 13}px;color:#fff;background:${this.color};border:2px solid #fff;box-shadow:0 2px 0 rgba(0,0,0,.3);text-shadow:0 1px 0 rgba(0,0,0,.35);`;
    this.tag.append(this.indEl, nm);
    this.reset();
  }

  reset() {
    this.x = this.spot.x;
    this.z = this.spot.z;
    this.y = 0;
    this.vx = this.vz = this.vy = 0;
    this.pvx = this.pvz = this.ax = this.az = 0;
    this.aimYaw = this.yaw = Math.atan2(this.spot.dx, this.spot.dz);
    this.aimPitch = 0.2;
    this.yawV = 0;
    this.grounded = true;
    this.falling = false;
    this.ragdoll = 0;
    this.standT = 0;
    this.swim = 0;
    this.hitCd = 0;
    this.shoveT = -1;
    this.shoveCd = 0;
    this.diveT = 0;
    this.diveCd = 0;
    this.celebrate = false;
    this.ammo = MAG;
    this.reloadT = 0;
    this.boltT = 0;
    this.recoil = 0;
    this.scoped = false;
    this.scopeK = 0;
    this.swayBoost = 0;
    this.steadyT = 0;
    this.stunLite = 0;
    this.hurt = 0;
    this.fireBuf = 0;
    this.score = this.hits = this.heads = this.shots = this.streak = this.bestStreak = 0;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail]) {
      s.a = 0;
      s.v = 0;
    }
    this.input = { mx: 0, mz: 0, fire: false, scope: false, shove: false, dive: false, jump: false, reload: false };
    this.ai.mode = 'shoot';
    this.ai.aggroT = rand(8, 14);
    this.ai.duck = null;
    this.ai.cool = rand(0.5, 1.5);
    this.ai.idleYaw = this.aimYaw;
  }
}

interface Bullet {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  owner: Hunter;
  mesh: THREE.Mesh;
  hit: boolean;
  off: THREE.Vector3;
  age: number;
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 6, 5);
    for (let i = 0; i < 260; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 14, size: 0.1 });
    }
  }
  spawn(x: number, y: number, z: number, color: number, n: number, speed: number, up: number, size: number, life: number, grav = 14) {
    for (let k = 0; k < n; k++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * TAU;
      const s = Math.random() * speed;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.4 + Math.random() * 0.9);
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.grav = grav;
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
      p.m.scale.setScalar(p.size * (0.3 + 0.7 * t));
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 2);
    }
  }
}

class Ripples {
  pool: { m: THREE.Mesh; life: number; max: number; size: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.RingGeometry(0.42, 0.5, 32);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, life: 0, max: 1, size: 1 });
    }
  }
  spawn(x: number, z: number, size: number, t: number) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = 0.9;
    p.size = size;
    p.m.position.set(x, hWave(x, z, t) + 0.04, z);
    p.m.visible = true;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        continue;
      }
      const u = 1 - p.life / p.max;
      p.m.scale.setScalar(0.3 + u * p.size * 2);
      (p.m.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.8;
    }
  }
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

export class HuntEngine {
  private container: HTMLElement;
  private onHud: (h: HuntHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: HuntWorld;
  private particles: Particles;
  private ripples: Ripples;
  private hunters: Hunter[] = [];
  private ducks: Duck[] = [];
  private bullets: Bullet[] = [];
  private bulletPool: THREE.Mesh[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;

  phase: HPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private timeLeft = H_ROUND;
  private goT = 0;
  private frenzy = false;
  private lastSec = 99;
  private spawnT = 0;
  private quackT = 2;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;
  private hitSeq = 0;
  private hitKind: 'hit' | 'head' | 'bad' | 'gold' = 'hit';
  private banner = '';
  private bannerT = 0;

  private keys = new Set<string>();
  private pend = { fire: 0, shove: false, dive: false, jump: false, reload: false, scopeToggle: false };
  private scopeHeld = false;
  private touchScope = false;
  private mdx = 0;
  private mdy = 0;
  private joy = { x: 0, y: 0 };
  private touchId: number | null = null;
  private touchLast = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 6, -10);
  private camLook = new THREE.Vector3();
  private camDir = new THREE.Vector3(0, 0, 1);
  private fovNow = HIP_FOV;
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();
  private tv4 = new THREE.Vector3();

  constructor(container: HTMLElement, onHud: (h: HuntHudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;filter:saturate(1.22) contrast(1.05) brightness(1.04);';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(HIP_FOV, 1, 0.2, 700);
    this.world = buildHuntWorld(this.scene, PLAYER_COLORS);
    this.particles = new Particles(this.scene);
    this.ripples = new Ripples(this.scene);

    const bg = new THREE.BoxGeometry(0.08, 0.08, 7);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false }));
      m.visible = false;
      this.scene.add(m);
      this.bulletPool.push(m);
    }

    this.setupHunters(this.playerAnimal);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    container.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('contextmenu', this.onCtx);

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
    window.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('contextmenu', this.onCtx);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------- API ----------
  setPlayerAnimal(id: string) {
    this.playerAnimal = id;
    this.setupHunters(id);
  }
  start() {
    sfx.resume();
    this.hunters.forEach((f) => f.reset());
    this.clearBullets();
    this.phase = 'countdown';
    this.phaseT = 3.2;
    this.lastCount = 4;
    this.timeLeft = H_ROUND;
    this.frenzy = false;
    this.lastSec = 99;
    this.goT = 0;
    this.banner = '';
    this.mdx = this.mdy = 0;
    this.camPos.set(this.hunters[0].x * 1.6, 5, this.hunters[0].z * 1.6);
  }
  toMenu() {
    this.hunters.forEach((f) => f.reset());
    this.clearBullets();
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
  touchFire() {
    sfx.resume();
    this.pend.fire = 0.3;
  }
  toggleTouchScope() {
    this.touchScope = !this.touchScope;
    if (this.touchScope) sfx.scopeIn();
  }
  get touchScoped() {
    return this.touchScope;
  }
  touchShove() {
    this.pend.shove = true;
  }
  touchDive() {
    this.pend.dive = true;
  }
  touchJump() {
    this.pend.jump = true;
  }
  touchReload() {
    this.pend.reload = true;
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    sfx.resume();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') this.pend.jump = true;
    if (e.code === 'KeyF' || e.code === 'KeyE') this.pend.shove = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pend.dive = true;
    if (e.code === 'KeyR') this.pend.reload = true;
    if (e.code === 'KeyQ') this.pend.scopeToggle = true;
    if (e.code === 'Enter') this.pend.fire = 0.3;
    if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => {
    this.keys.clear();
    this.scopeHeld = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return;
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mdx += e.movementX;
    this.mdy += e.movementY;
  };
  // mouse: pakai mousedown/up (tetap terkirim saat dua tombol ditekan bersamaan, mis. scope + tembak)
  private lastTouchT = -99;
  private onMouseDown = (e: MouseEvent) => {
    sfx.resume();
    if (performance.now() - this.lastTouchT < 800) return; // abaikan emulasi mouse dari sentuhan
    if (this.phase === 'playing' || this.phase === 'countdown') {
      if (!document.pointerLockElement) {
        try {
          const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => undefined);
        } catch {
          /* noop */
        }
      }
    }
    if (e.button === 0) this.pend.fire = 0.3;
    if (e.button === 2) this.scopeHeld = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) this.scopeHeld = false;
  };
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    sfx.resume();
    this.lastTouchT = performance.now();
    if (this.touchId === null) {
      this.touchId = e.pointerId;
      this.touchLast = { x: e.clientX, y: e.clientY };
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerId === this.touchId) {
      this.mdx += (e.clientX - this.touchLast.x) * 1.5;
      this.mdy += (e.clientY - this.touchLast.y) * 1.5;
      this.touchLast = { x: e.clientX, y: e.clientY };
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerId === this.touchId) {
      this.touchId = null;
      this.lastTouchT = performance.now();
    }
  };
  private onCtx = (e: Event) => e.preventDefault();

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- setup ----------
  private setupHunters(animalId: string) {
    for (const f of this.hunters) {
      this.scene.remove(f.rig.root);
      f.tag.remove();
    }
    this.hunters = [];
    const pd = ANIMALS.find((a) => a.id === animalId) ?? ANIMALS[0];
    const others = ANIMALS.filter((a) => a.id !== pd.id).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const skills = [0.4, 0.55, 0.7];
    const defs = [pd, others[0], others[1], others[2]];
    defs.forEach((d, i) => {
      const f = new Hunter(i, d, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1], this.world.spots[i]);
      this.scene.add(f.rig.root);
      this.overlay.appendChild(f.tag);
      this.hunters.push(f);
    });
  }

  private clearBullets() {
    for (const b of this.bullets) b.mesh.visible = false;
    this.bullets = [];
  }

  private player() {
    return this.hunters[0];
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
    this.world.update(this.time, dt, this.camPos);
    this.updatePhase(dt);
    const live = this.phase === 'countdown' || this.phase === 'playing';
    const playing = this.phase === 'playing';

    for (const f of this.hunters) {
      if (f.isPlayer) this.readPlayerInput(f, live, dt);
      else this.botThink(f, dt, live);
      f.celebrate = this.phase === 'menu' || (this.phase === 'results' && f === this.ranking()[0]);
      f.hitCd -= dt;
      this.weapon(f, dt, playing);
      this.physics(f, dt);
    }
    this.collisions();
    this.updateDucks(dt);
    this.updateBullets(dt);
    for (const f of this.hunters) this.animate(f, dt);

    this.particles.update(dt);
    this.ripples.update(dt);
    this.updateCamera(dt, false);
    this.updateLabels();
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    this.onHud(this.buildHud());
  }

  private ranking() {
    return [...this.hunters].sort((a, b) => b.score - a.score || b.hits - a.hits);
  }

  private updatePhase(dt: number) {
    switch (this.phase) {
      case 'countdown': {
        this.phaseT -= dt;
        const n = Math.ceil(this.phaseT);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          sfx.tick();
        }
        if (this.phaseT <= 0) {
          this.phase = 'playing';
          this.timeLeft = H_ROUND;
          this.goT = 1.3;
          sfx.go();
        }
        break;
      }
      case 'playing': {
        this.timeLeft -= dt;
        this.goT -= dt;
        if (!this.frenzy && this.timeLeft <= H_FRENZY) {
          this.frenzy = true;
          sfx.horn();
          this.banner = '🔥 FRENZY! POIN ×2';
          this.bannerT = 2.2;
          this.spawnDuck('gold');
        }
        const s = Math.ceil(this.timeLeft);
        if (this.timeLeft <= 10 && s !== this.lastSec) {
          this.lastSec = s;
          sfx.tick();
        }
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.phase = 'finished';
          this.phaseT = 2.6;
          sfx.horn();
        }
        break;
      }
      case 'finished': {
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          this.phase = 'results';
          sfx.fanfare();
          if (document.pointerLockElement) document.exitPointerLock();
        }
        break;
      }
    }
  }

  // ---------- input pemain ----------
  private readPlayerInput(f: Hunter, live: boolean, dt: number) {
    const i = f.input;
    const pend = this.pend;
    if (!live) {
      i.mx = i.mz = 0;
      i.fire = i.scope = i.shove = i.dive = i.jump = i.reload = false;
      pend.fire = 0;
      pend.shove = pend.dive = pend.jump = pend.reload = pend.scopeToggle = false;
      this.mdx = this.mdy = 0;
      return;
    }
    // aim
    const sens = 0.0024 * lerp(1, 0.4, f.scopeK);
    if (f.ragdoll <= 0 && f.swim <= 0) {
      f.aimYaw -= this.mdx * sens;
      f.aimPitch = clamp(f.aimPitch - this.mdy * sens, -0.5, 1.3);
    }
    this.mdx = this.mdy = 0;
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
    const fx = Math.sin(f.aimYaw);
    const fz = Math.cos(f.aimYaw);
    i.mx = uy * fx + ux * -fz;
    i.mz = uy * fz + ux * fx;
    if (pend.scopeToggle) {
      this.touchScope = !this.touchScope;
      pend.scopeToggle = false;
    }
    i.scope = this.scopeHeld || this.touchScope;
    pend.fire = Math.max(0, pend.fire - dt);
    i.fire = pend.fire > 0;
    i.shove = pend.shove;
    i.dive = pend.dive;
    i.jump = pend.jump;
    i.reload = pend.reload;
    pend.shove = pend.dive = pend.jump = pend.reload = false;
  }

  // ---------- bot ----------
  private duckVel(d: Duck, out: THREE.Vector3) {
    return out.set(Math.sin(d.ang) * d.speed, 0, Math.cos(d.ang) * d.speed);
  }

  private botThink(f: Hunter, dt: number, live: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.fire = inp.shove = inp.dive = inp.jump = inp.reload = false;
    inp.mx = inp.mz = 0;
    inp.scope = false;
    const playing = this.phase === 'playing';

    if (!live && !f.celebrate) {
      f.aimYaw += angDiff(Math.atan2(f.spot.dx, f.spot.dz), f.aimYaw) * 0.1;
    }
    if (!playing) return;
    if (f.ragdoll > 0 || f.swim > 0) return;

    // agresif sesekali
    ai.aggroT -= dt;
    if (ai.mode === 'shoot' && ai.aggroT <= 0) {
      ai.aggroT = rand(8, 15);
      if (Math.random() < 0.6) {
        const rank = this.ranking().filter((o) => o !== f && o.swim <= 0);
        ai.target = Math.random() < 0.6 ? rank[0] : this.hunters[0];
        if (!ai.target || ai.target === f) ai.target = rank[0];
        ai.mode = 'hunt';
        ai.huntT = 4.5;
      }
    }
    let gx = f.spot.x + ai.wx;
    let gz = f.spot.z + ai.wz;
    ai.wanderT -= dt;
    if (ai.wanderT <= 0) {
      ai.wanderT = rand(2.5, 5);
      ai.wx = rand(-1.4, 1.4);
      ai.wz = rand(-1.4, 1.4);
    }
    if (ai.mode === 'hunt' && ai.target) {
      const t = ai.target;
      ai.huntT -= dt;
      gx = t.x;
      gz = t.z;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (t.swim > 0 || ai.huntT <= 0) {
        ai.mode = 'shoot';
      } else {
        f.aimYaw += angDiff(Math.atan2(t.x - f.x, t.z - f.z), f.aimYaw) * (1 - Math.exp(-10 * dt));
        if (d < 1.9 && f.shoveCd <= 0) {
          inp.shove = true;
          ai.mode = 'shoot';
        } else if (d > 3 && d < 6.5 && f.diveCd <= 0 && Math.random() < 0.05) {
          inp.dive = true;
        }
      }
    }
    const dx = gx - f.x;
    const dz = gz - f.z;
    const d = Math.hypot(dx, dz);
    const stopD = ai.mode === 'hunt' ? 1.1 : 0.4;
    if (d > stopD) {
      const s = ai.mode === 'hunt' ? 1 : clamp(d / 1.2, 0.3, 1);
      inp.mx = (dx / d) * s;
      inp.mz = (dz / d) * s;
    }
    const rr = Math.hypot(f.x, f.z);
    if (rr > H_DOCK_R - 1.3) {
      const nx = f.x / rr;
      const nz = f.z / rr;
      const dot = inp.mx * nx + inp.mz * nz;
      if (dot > 0) {
        inp.mx -= nx * dot;
        inp.mz -= nz * dot;
      }
    }
    if (ai.mode === 'hunt') return;

    // pilih bebek
    ai.pickT -= dt;
    if (ai.pickT <= 0) {
      ai.pickT = 0.4;
      let best: Duck | null = null;
      let bs = 0;
      for (const dk of this.ducks) {
        if (!dk.alive || dk.type === 'bomb') continue;
        const ddx = dk.pos.x - f.x;
        const ddz = dk.pos.z - f.z;
        const dist = Math.hypot(ddx, ddz);
        if (dist < 14 || dist > 85 || dk.pos.y < 2) continue;
        const yawErr = Math.abs(angDiff(Math.atan2(ddx, ddz), f.aimYaw));
        const sc = (dk.def.pts / (1 + dist * 0.03)) * Math.exp(-yawErr * 0.9) * (0.7 + Math.random() * 0.6);
        if (sc > bs) {
          bs = sc;
          best = dk;
        }
      }
      if (best !== ai.duck) {
        ai.duck = best;
        ai.acquire = 0;
        const e = 0.03 + (1 - f.skill) * 0.1;
        ai.errYaw = rand(-e, e);
        ai.errPitch = rand(-e, e);
      }
    }
    const dk = ai.duck;
    const turn = 1.2 + f.skill * 2.6;
    if (dk && dk.alive) {
      const dist0 = Math.hypot(dk.pos.x - f.x, dk.pos.z - f.z);
      const v = this.duckVel(dk, this.tv);
      let t = dist0 / BULLET_V;
      let px = dk.pos.x;
      let py = dk.pos.y;
      let pz = dk.pos.z;
      for (let it = 0; it < 2; it++) {
        px = dk.pos.x + v.x * t;
        py = dk.pos.y + v.y * t;
        pz = dk.pos.z + v.z * t;
        t = Math.hypot(px - f.x, pz - f.z) / BULLET_V;
      }
      const dh = Math.hypot(px - f.x, pz - f.z);
      const wantYaw = Math.atan2(px - f.x, pz - f.z) + ai.errYaw;
      const wantPitch = Math.atan2(py - (f.y + 2.2), dh) + ai.errPitch;
      f.aimYaw += clamp(angDiff(wantYaw, f.aimYaw), -turn * dt, turn * dt);
      f.aimPitch += clamp(wantPitch - f.aimPitch, -turn * dt, turn * dt);
      f.aimPitch = clamp(f.aimPitch, -0.4, 1.3);
      ai.acquire += dt;
      ai.cool -= dt;
      const ey = Math.abs(angDiff(wantYaw, f.aimYaw));
      const ep = Math.abs(wantPitch - f.aimPitch);
      const tol = 0.012 + (1 - f.skill) * 0.04;
      if (ey < tol && ep < tol && ai.acquire > 0.55 + (1 - f.skill) * 1.0 && ai.cool <= 0 && f.ammo > 0 && f.reloadT <= 0 && f.boltT <= 0) {
        inp.fire = true;
        ai.cool = rand(0.35, 0.9) + (1 - f.skill) * 1.0;
        const e = 0.024 + (1 - f.skill) * 0.085;
        ai.errYaw = rand(-e, e);
        ai.errPitch = rand(-e, e);
      }
    } else {
      // pandang sekeliling pelan
      ai.idleYaw += Math.sin(this.time * 0.4 + f.idx) * 0.3 * dt;
      f.aimYaw += angDiff(ai.idleYaw, f.aimYaw) * (1 - Math.exp(-2 * dt));
      f.aimPitch += (0.45 - f.aimPitch) * (1 - Math.exp(-1.5 * dt));
      if (f.ammo <= 2 && f.reloadT <= 0 && f.ammo < MAG) inp.reload = true;
    }
  }

  // ---------- senjata ----------
  private weapon(f: Hunter, dt: number, playing: boolean) {
    const inp = f.input;
    f.boltT = Math.max(0, f.boltT - dt);
    f.stunLite = Math.max(0, f.stunLite - dt);
    f.hurt = Math.max(0, f.hurt - dt);
    f.recoil *= Math.exp(-9 * dt);
    f.swayBoost *= Math.exp(-3 * dt);
    if (f.boltT < 0.4 && f.boltSnd && f.isPlayer && f.reloadT <= 0) {
      f.boltSnd = false;
      sfx.bolt();
    }
    if (f.boltT <= 0) f.boltSnd = false;

    const can = playing && f.ragdoll <= 0 && f.swim <= 0 && f.diveT <= 0 && f.stunLite <= 0;
    // scope
    const wantScope = can && inp.scope && f.reloadT <= 0.4;
    if (wantScope && !f.scoped && f.isPlayer) sfx.scopeIn();
    f.scoped = wantScope;
    f.scopeK += ((f.scoped ? 1 : 0) - f.scopeK) * (1 - Math.exp(-14 * dt));
    if (!f.scoped && f.scopeK < 0.01) f.scopeK = 0;

    // reload
    if (f.reloadT > 0) {
      f.reloadT -= dt;
      if (f.reloadT <= 0) {
        f.ammo = MAG;
        if (f.isPlayer) sfx.bolt();
      }
    } else if (can && (inp.reload || f.ammo <= 0) && f.ammo < MAG) {
      f.reloadT = RELOAD_T;
      if (f.isPlayer) sfx.reloadStart();
    }

    if (f.isPlayer) {
      if (inp.fire) f.fireBuf = 0.25;
      else f.fireBuf = Math.max(0, f.fireBuf - dt);
      if (f.fireBuf > 0 && can) {
        if (f.ammo > 0 && f.reloadT <= 0 && f.boltT <= 0) {
          this.fire(f);
          f.fireBuf = 0;
        } else if (f.ammo <= 0 && f.reloadT <= 0) sfx.emptyClick();
      }
    } else if (inp.fire && can) this.fire(f);
    if (!playing) f.scoped = false;
  }

  private aimDirOf(f: Hunter, out: THREE.Vector3, withRecoil = true) {
    const p = f.aimPitch + (withRecoil ? f.recoil : 0);
    return out.set(Math.sin(f.aimYaw) * Math.cos(p), Math.sin(p), Math.cos(f.aimYaw) * Math.cos(p));
  }

  private fire(f: Hunter) {
    f.ammo--;
    f.boltT = BOLT_T;
    f.boltSnd = true;
    f.shots++;
    f.recoil += f.scoped ? 0.045 : 0.07;
    f.tx.v -= 5;
    f.vx -= Math.sin(f.aimYaw) * 0.6;
    f.vz -= Math.cos(f.aimYaw) * 0.6;
    f.rig.root.updateMatrixWorld(true);
    const mp = f.muzzle.getWorldPosition(this.tv2.set(0, 0, 0)).clone();
    const dir = this.tv3;
    const start = mp.clone();
    const off = new THREE.Vector3();
    if (f.isPlayer) {
      // lintasan peluru mengikuti garis crosshair kamera; hanya tracer yang tampak keluar dari moncong
      dir.copy(this.camDir);
      start.copy(this.camPos).addScaledVector(this.camDir, 2);
      off.copy(mp).sub(start);
      if (f.scopeK > 0.7) {
        const spr = 0.0012;
        dir.x += rand(-spr, spr);
        dir.y += rand(-spr, spr);
        dir.z += rand(-spr, spr);
      } else {
        const spr = 0.006 * (1 + f.swayBoost);
        dir.x += rand(-spr, spr);
        dir.y += rand(-spr, spr);
        dir.z += rand(-spr, spr);
      }
      dir.normalize();
      if (this.assistOn) this.assistAim(start, dir, f.scopeK > 0.5);
    } else {
      this.aimDirOf(f, dir, false);
      dir.normalize();
    }
    const mesh = this.bulletPool.find((m) => !m.visible);
    if (mesh) {
      mesh.visible = true;
      this.bullets.push({ p: start, v: dir.clone().multiplyScalar(BULLET_V), life: 1.1, owner: f, mesh, hit: false, off, age: 0 });
    }
    this.particles.spawn(mp.x, mp.y, mp.z, 0xfff1a8, 5, 3, 1.5, 0.22, 0.18, 0);
    this.particles.spawn(mp.x, mp.y, mp.z, 0xffa530, 4, 2, 1, 0.16, 0.14, 0);
    const near = Math.hypot(f.x - this.player().x, f.z - this.player().z);
    sfx.snipe(f.isPlayer ? 1 : clamp(1 - near / 40, 0.12, 0.5));
    if (f.isPlayer) this.shake = Math.max(this.shake, f.scoped ? 0.18 : 0.3);
  }

  /**
   * Bantuan bidik: kalau crosshair sudah menempel di bebek, hitung gerak bebek selama peluru terbang
   * dan geser arah peluru ke posisi prediksi. Selisih bidikan pemain tetap dipertahankan,
   * jadi headshot tetap butuh bidikan yang presisi. Kalau pemain sudah memimpin sendiri, tidak diubah.
   */
  private assistOn = true;
  private assistAim(start: THREE.Vector3, dir: THREE.Vector3, scoped: boolean) {
    const to = new THREE.Vector3();
    const perp = new THREE.Vector3();
    const pred = new THREE.Vector3();
    const toP = new THREE.Vector3();
    const bestPerp = new THREE.Vector3();
    const bestPred = new THREE.Vector3();
    let found = false;
    let bestOff = 1e9;
    for (const d of this.ducks) {
      if (!d.alive) continue;
      to.copy(d.pos).sub(start);
      const along = to.dot(dir);
      if (along < 5 || along > 170) continue;
      const R = d.def.r * (DUCK_SCALE / 1.7);
      const vx = Math.sin(d.ang) * d.speed;
      const vz = Math.cos(d.ang) * d.speed;
      let t = along / BULLET_V;
      pred.set(d.pos.x + vx * t, d.pos.y, d.pos.z + vz * t);
      for (let k = 0; k < 2; k++) {
        t = start.distanceTo(pred) / BULLET_V;
        pred.set(d.pos.x + vx * t, d.pos.y, d.pos.z + vz * t);
      }
      toP.copy(pred).sub(start);
      const aP = toP.dot(dir);
      toP.addScaledVector(dir, -aP);
      if (toP.length() < R * 0.9) return; // pemain sudah memimpin dengan benar
      perp.copy(to).addScaledVector(dir, -along);
      const off = perp.length();
      const reach = ((scoped ? 2.4 : 3.8) + along * (scoped ? 0.012 : 0.022)) * (d.type === 'bomb' ? 0.45 : 1);
      if (off < reach && off < bestOff) {
        bestOff = off;
        found = true;
        bestPerp.copy(perp);
        bestPred.copy(pred);
      }
    }
    if (!found) return;
    dir.copy(bestPred).sub(bestPerp).sub(start).normalize();
  }

  private segDist(p0: THREE.Vector3, p1: THREE.Vector3, c: THREE.Vector3) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const l2 = dx * dx + dy * dy + dz * dz || 1;
    let t = ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / l2;
    t = clamp(t, 0, 1);
    const ex = p0.x + dx * t - c.x;
    const ey = p0.y + dy * t - c.y;
    const ez = p0.z + dz * t - c.z;
    return { d: Math.sqrt(ex * ex + ey * ey + ez * ez), t };
  }

  private updateBullets(dt: number) {
    const hd = new THREE.Vector3();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const p0 = b.p.clone();
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      b.age += dt;
      let end = false;
      let bestT = 2;
      let bestDuck: Duck | null = null;
      let head = false;
      for (const d of this.ducks) {
        if (!d.alive) continue;
        const s = this.segDist(p0, b.p, d.pos);
        const bodyR = d.def.r * (DUCK_SCALE / 1.7);
        // posisi kepala
        const fx = Math.sin(d.ang);
        const fz = Math.cos(d.ang);
        hd.set(d.pos.x + fx * 1.0 * DUCK_SCALE * 0.62, d.pos.y + 0.45 * DUCK_SCALE * 0.7, d.pos.z + fz * 1.0 * DUCK_SCALE * 0.62);
        const sh = this.segDist(p0, b.p, hd);
        const isHead = sh.d < d.def.head;
        if ((s.d < bodyR || isHead) && Math.min(s.t, isHead ? sh.t : 9) < bestT) {
          bestT = Math.min(s.t, isHead ? sh.t : 9);
          bestDuck = d;
          head = isHead;
        }
      }
      if (bestDuck) {
        this.hitDuck(b.owner, bestDuck, head);
        b.hit = true;
        end = true;
      } else if (b.p.y < hWave(b.p.x, b.p.z, this.time) && Math.hypot(b.p.x, b.p.z) > H_DOCK_R && Math.hypot(b.p.x, b.p.z) < H_SHORE) {
        this.particles.spawn(b.p.x, H_WATER_Y + 0.1, b.p.z, 0xdff6ff, 6, 2.4, 4, 0.12, 0.5);
        this.ripples.spawn(b.p.x, b.p.z, 1.1, this.time);
        end = true;
      } else if (b.p.y < (Math.hypot(b.p.x, b.p.z) <= H_DOCK_R ? 0.05 : Math.hypot(b.p.x, b.p.z) >= H_SHORE ? 0.3 : -99)) {
        this.particles.spawn(b.p.x, b.p.y + 0.1, b.p.z, 0x8fd470, 4, 2, 2, 0.1, 0.4);
        this.particles.spawn(b.p.x, b.p.y + 0.1, b.p.z, 0xd9b27c, 3, 2, 2, 0.08, 0.35);
        end = true;
      } else if (b.life <= 0 || Math.hypot(b.p.x, b.p.z) > 400) end = true;

      if (end) {
        if (!b.hit) {
          b.owner.streak = 0;
        }
        b.mesh.visible = false;
        this.bullets.splice(i, 1);
        continue;
      }
      // visual
      const dir = this.tv.copy(b.v).normalize();
      b.mesh.position.copy(b.p).addScaledVector(dir, -3.2).addScaledVector(b.off, Math.max(0, 1 - b.age / 0.06));
      b.mesh.lookAt(this.tv2.copy(b.p).add(dir));
    }
  }

  private hitDuck(owner: Hunter, d: Duck, head: boolean) {
    d.alive = false;
    d.killer = owner;
    const isMe = owner.isPlayer;
    const frenzyMul = this.frenzy ? 2 : 1;
    this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, 0xffffff, 10, 5, 4, 0.16, 0.9, 5);
    if (d.type === 'bomb') {
      owner.score = Math.max(0, owner.score + d.def.pts);
      owner.streak = 0;
      owner.stunLite = 0.9;
      owner.scoped = false;
      owner.swayBoost = 3;
      owner.aimYaw += rand(-0.5, 0.5);
      owner.aimPitch = clamp(owner.aimPitch + rand(-0.2, 0.2), -0.4, 1.3);
      this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, 0xff7a3d, 16, 8, 6, 0.3, 0.6, 3);
      this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, 0x333333, 10, 5, 3, 0.35, 0.8, 0);
      d.g.visible = false;
      d.pos.y = -50;
      this.world.popDog('laugh');
      if (isMe) {
        this.hitSeq++;
        this.hitKind = 'bad';
        this.shake = 1;
        sfx.boom();
        this.popup('💣 BOOM! -25', d.pos.x, 1, d.pos.z, '#ff7a7a', 30, true);
      } else if (Math.hypot(owner.x - this.player().x, owner.z - this.player().z) < 30) sfx.boom();
      return;
    }
    owner.streak++;
    owner.bestStreak = Math.max(owner.bestStreak, owner.streak);
    const mult = owner.streak >= 6 ? 3 : owner.streak >= 3 ? 2 : 1;
    const total = Math.round(d.def.pts * mult * (head ? 1.5 : 1) * frenzyMul);
    owner.score += total;
    owner.hits++;
    if (head) owner.heads++;
    const gold = d.type === 'gold';
    d.vy = 2;
    d.fallVx = Math.sin(d.ang) * d.speed * 0.35;
    d.fallVz = Math.cos(d.ang) * d.speed * 0.35;
    d.spinX = rand(-6, 6);
    d.spinZ = rand(-6, 6);
    this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, owner.colorHex, 8, 5, 4, 0.14, 0.8, 4);
    if (gold) this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, 0xffd23f, 16, 7, 6, 0.2, 0.9, 3);
    if (isMe) {
      this.hitSeq++;
      this.hitKind = gold ? 'gold' : head ? 'head' : 'hit';
      sfx.duckHit(1);
      if (head) sfx.headshot();
      if (gold) sfx.goldGet();
      if (owner.streak === 3 || owner.streak === 6) {
        sfx.streak(owner.streak / 3);
        this.banner = owner.streak === 3 ? '🔥 COMBO ×2!' : '⚡ COMBO ×3!!';
        this.bannerT = 1.4;
      }
      this.shake = Math.max(this.shake, 0.12);
      this.popup(`+${total}${mult > 1 ? ` ×${mult}` : ''}${frenzyMul > 1 ? ' 🔥' : ''}`, d.pos.x, d.pos.y, d.pos.z, gold ? '#ffd23f' : '#9dff8a', gold ? 38 : 30, true);
      if (head) this.popup('🎯 HEADSHOT!', d.pos.x, d.pos.y, d.pos.z, '#ffffff', 22, true, -34);
    } else if (gold || Math.hypot(d.pos.x - this.player().x, d.pos.z - this.player().z) < 50) {
      this.popup(`+${total}`, d.pos.x, d.pos.y, d.pos.z, '#' + owner.color.slice(1), 18, true);
      if (Math.hypot(d.pos.x - this.player().x, d.pos.z - this.player().z) < 45) sfx.duckHit(0.35);
    }
    if (gold && !isMe) {
      this.banner = `${owner.name} dapat BEBEK EMAS!`;
      this.bannerT = 1.6;
    }
  }

  // ---------- bebek ----------
  private spawnDuck(forced?: DuckType) {
    let type: DuckType = 'mallard';
    if (forced) type = forced;
    else {
      const order: DuckType[] = ['mallard', 'teal', 'gold', 'bomb'];
      const goldAlive = this.ducks.some((d) => d.type === 'gold' && d.alive);
      const bombs = this.ducks.filter((d) => d.type === 'bomb' && d.alive).length;
      let total = 0;
      const ws = order.map((t) => {
        let w = DUCK_DEF[t].w;
        if (t === 'gold' && (goldAlive || this.phase !== 'playing')) w = 0;
        if (t === 'bomb' && (bombs >= 2 || this.phase !== 'playing')) w = 0;
        if (t === 'gold' && this.frenzy) w *= 2.5;
        total += w;
        return w;
      });
      let r = Math.random() * total;
      for (let i = 0; i < order.length; i++) {
        r -= ws[i];
        if (r <= 0) {
          type = order[i];
          break;
        }
      }
    }
    const d = new Duck(type);
    const th = Math.random() * TAU;
    const R = 90;
    d.pos.set(Math.cos(th) * R, rand(5, 22), Math.sin(th) * R);
    const px = rand(-1, 1) * 42;
    const pz = rand(-1, 1) * 42;
    d.ang = d.baseAng = d.targetAng = Math.atan2(px - d.pos.x, pz - d.pos.z);
    d.speed = rand(d.def.spd[0], d.def.spd[1]);
    d.altT = rand(5, 23);
    d.turnT = rand(0.5, 1.5);
    this.scene.add(d.g);
    this.ducks.push(d);
    if (type === 'gold' && this.phase === 'playing') {
      this.banner = '🌟 BEBEK EMAS MUNCUL!';
      this.bannerT = 2;
      sfx.goldAppear();
    }
  }

  private updateDucks(dt: number) {
    const show = this.phase === 'playing' || this.phase === 'menu' || this.phase === 'countdown' || this.phase === 'finished';
    const targetN = this.phase === 'playing' ? (this.frenzy ? 11 : 8) : show ? 4 : 0;
    const alive = this.ducks.filter((d) => d.alive).length;
    this.spawnT -= dt;
    if (alive < targetN && this.spawnT <= 0) {
      this.spawnT = rand(0.4, 1.1);
      this.spawnDuck();
    }
    this.quackT -= dt;
    if (this.quackT <= 0) {
      this.quackT = rand(1.5, 4);
      const near = this.ducks.filter((d) => d.alive && Math.hypot(d.pos.x, d.pos.z) < 55);
      if (near.length) {
        const d = near[Math.floor(Math.random() * near.length)];
        sfx.quack(d.type === 'teal' ? 1.25 : d.type === 'gold' ? 1.4 : d.type === 'bomb' ? 0.75 : 1, 0.05 + 0.05 * clamp(1 - Math.hypot(d.pos.x, d.pos.z) / 60, 0, 1));
      }
    }
    for (let i = this.ducks.length - 1; i >= 0; i--) {
      const d = this.ducks[i];
      d.t += dt;
      if (d.alive) {
        d.turnT -= dt;
        if (d.turnT <= 0) {
          const g = d.type === 'gold';
          const te = d.type === 'teal';
          d.turnT = g ? rand(0.5, 1.1) : te ? rand(1.1, 2.2) : rand(2, 4);
          const mt = g ? 0.95 : te ? 0.5 : 0.22;
          d.targetAng = d.baseAng + rand(-mt, mt);
        }
        const prev = d.ang;
        d.ang += angDiff(d.targetAng, d.ang) * (1 - Math.exp(-dt * (d.type === 'gold' ? 4 : 2)));
        d.bank += ((angDiff(d.ang, prev) / Math.max(dt, 1e-4)) * -0.35 - d.bank) * (1 - Math.exp(-6 * dt));
        d.pos.x += Math.sin(d.ang) * d.speed * dt;
        d.pos.z += Math.cos(d.ang) * d.speed * dt;
        d.pos.y += (d.altT - d.pos.y) * dt * 0.5 + Math.sin(d.t * 1.7 + d.phase) * 0.9 * dt;
        // di atas dermaga bebek terbang tinggi agar tidak menembus kamera pemain
        d.pos.y = Math.max(Math.hypot(d.pos.x, d.pos.z) < 18 ? 8 : 3, d.pos.y);
        d.flap += dt * (d.type === 'teal' ? 17 : d.type === 'gold' ? 19 : 12);
        const w = Math.sin(d.flap) * 0.85;
        d.wings[0].rotation.z = -w;
        d.wings[1].rotation.z = w;
        d.g.position.copy(d.pos);
        d.g.rotation.set(Math.sin(d.flap * 2) * 0.05, d.ang, clamp(d.bank, -0.6, 0.6));
        if (d.fuse) (d.fuse.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(d.t * 30) > 0 ? 0xffd25a : 0xff5a2e);
        if (d.type === 'gold') {
          d.trailT -= dt;
          if (d.trailT <= 0) {
            d.trailT = 0.05;
            this.particles.spawn(d.pos.x, d.pos.y, d.pos.z, 0xffe066, 1, 0.6, 0.3, 0.2, 0.7, 0);
          }
        }
        const dist = Math.hypot(d.pos.x, d.pos.z);
        const outward = d.pos.x * Math.sin(d.ang) + d.pos.z * Math.cos(d.ang) > 0;
        if (d.t > 3 && dist > 96 && outward) {
          this.scene.remove(d.g);
          this.ducks.splice(i, 1);
        }
      } else if (d.g.visible) {
        d.vy -= 24 * dt;
        d.pos.y += d.vy * dt;
        d.pos.x += d.fallVx * dt;
        d.pos.z += d.fallVz * dt;
        d.g.position.copy(d.pos);
        d.g.rotation.x += d.spinX * dt;
        d.g.rotation.z += d.spinZ * dt;
        d.wings[0].rotation.z = -0.3;
        d.wings[1].rotation.z = 0.3;
        const dd = Math.hypot(d.pos.x, d.pos.z);
        const onLand = dd < H_DOCK_R || dd > H_SHORE;
        const floor = onLand ? 0.3 : H_WATER_Y;
        if (d.pos.y < floor) {
          if (onLand) {
            this.particles.spawn(d.pos.x, 0.4, d.pos.z, 0x8fd470, 7, 2.5, 3, 0.12, 0.5);
            this.particles.spawn(d.pos.x, 0.4, d.pos.z, 0xffffff, 5, 2, 2.5, 0.1, 0.5);
          } else {
            this.particles.spawn(d.pos.x, H_WATER_Y + 0.1, d.pos.z, 0xdff6ff, 10, 3, 5, 0.14, 0.7);
            this.ripples.spawn(d.pos.x, d.pos.z, 1.5, this.time);
            if (Math.hypot(d.pos.x - this.player().x, d.pos.z - this.player().z) < 50) sfx.splash(0.6);
          }
          this.scene.remove(d.g);
          this.ducks.splice(i, 1);
        }
      } else {
        this.scene.remove(d.g);
        this.ducks.splice(i, 1);
      }
    }
  }

  // ---------- fisika karakter ----------
  private setFall(f: Hunter, dx: number, dz: number, mag: number) {
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const lz = dx * sn + dz * cs;
    const lx = dx * cs - dz * sn;
    const m = Math.hypot(lx, lz) || 1;
    f.fallX = (lz / m) * mag;
    f.fallZ = -(lx / m) * mag;
  }

  private knock(f: Hunter, dx: number, dz: number, impulse: number, stun: number, lift = 3.5) {
    if (f.swim > 0 || f.hitCd > 0) return;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m;
    dz /= m;
    f.vx += dx * impulse;
    f.vz += dz * impulse;
    if (f.y < 0.6) {
      f.vy = Math.max(f.vy, lift);
      f.grounded = false;
    }
    f.ragdoll = Math.max(f.ragdoll, stun);
    f.hitCd = 0.35;
    f.shoveT = -1;
    f.diveT = 0;
    f.scoped = false;
    f.scopeK *= 0.4;
    f.reloadT = 0;
    f.hurt = 0.9;
    f.swayBoost = 3;
    f.aimYaw += rand(-0.7, 0.7);
    f.aimPitch = clamp(f.aimPitch + rand(-0.35, 0.35), -0.4, 1.3);
    this.setFall(f, dx, dz, 1.45);
    f.tx.v += f.fallX * 7;
    f.tz.v += f.fallZ * 7;
    f.yawV = (Math.random() - 0.5) * 12;
    f.flailT = 0;
    if (f.isPlayer) {
      this.shake = Math.max(this.shake, 0.7);
      this.popup('💫 DISENGGOL!', f.x, f.y + 3.4, f.z, '#ff8fa3', 24);
    }
  }

  private jolt(f: Hunter, amt: number) {
    f.swayBoost = Math.max(f.swayBoost, amt);
    f.aimYaw += rand(-0.1, 0.1) * amt;
    f.aimPitch = clamp(f.aimPitch + rand(-0.06, 0.06) * amt, -0.4, 1.3);
    f.hurt = Math.max(f.hurt, 0.3);
  }

  private bumpSpring(f: Hunter, nx: number, nz: number, s: number) {
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const lz = nx * sn + nz * cs;
    const lx = nx * cs - nz * sn;
    f.tx.v += lz * s;
    f.tz.v += -lx * s;
  }

  private doShove(f: Hunter) {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    let hit = false;
    for (const o of this.hunters) {
      if (o === f || o.swim > 0) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.15 && Math.abs(o.y - f.y) < 1.5) {
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 10.5, 1.4, 4.2);
        this.particles.spawn(o.x, o.y + 1.3, o.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
        this.popup('💥 POW!', o.x, o.y + 2.6, o.z, '#ffe14d', 26);
        hit = true;
        f.vx -= fx * 1.2;
        f.vz -= fz * 1.2;
      }
    }
    if (hit) {
      sfx.punch();
      if (f.isPlayer) this.shake = Math.max(this.shake, 0.3);
    } else if (f.isPlayer) sfx.jump();
  }

  private physics(f: Hunter, dt: number) {
    f.shoveCd -= dt;
    f.diveCd -= dt;
    if (f.swim > 0) {
      this.swimStep(f, dt);
      return;
    }
    const inp = f.input;
    const wasStunned = f.ragdoll > 0;
    if (f.ragdoll > 0) f.ragdoll -= dt;
    if (wasStunned && f.ragdoll <= 0) f.standT = 0.55;
    if (f.standT > 0) f.standT -= dt;
    const stunned = f.ragdoll > 0;
    const playing = this.phase === 'playing' || this.phase === 'countdown';

    if (f.diveT > 0) {
      f.diveT -= dt;
      if (f.diveT <= 0) {
        f.ragdoll = 0.75;
        this.setFall(f, f.vx, f.vz, 1.35);
        f.hitCd = 0.2;
      }
    }
    const diving = f.diveT > 0;
    const scopedMove = f.scoped;

    if (inp.jump && f.grounded && !stunned && !diving && !scopedMove && playing) {
      f.vy = 9.8;
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
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded && playing && !scopedMove) {
      const mag = Math.hypot(inp.mx, inp.mz);
      const fx = mag > 0.2 ? inp.mx / mag : Math.sin(f.yaw);
      const fz = mag > 0.2 ? inp.mz / mag : Math.cos(f.yaw);
      f.vx = fx * 11.5;
      f.vz = fz * 11.5;
      f.vy = 3;
      f.grounded = false;
      f.diveT = 0.42;
      f.diveCd = 1.8;
      f.yaw = Math.atan2(fx, fz);
      f.reloadT = 0;
      if (f.isPlayer) sfx.dive();
    }
    if (inp.shove && f.shoveCd <= 0 && !stunned && !diving && playing && !scopedMove) {
      f.shoveT = 0;
      f.shoveCd = 0.8;
      f.shoveHit = false;
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
    const maxSp = scopedMove ? 1.7 : f.reloadT > 0 ? 4.2 : 5.3;
    let dvx = inp.mx * maxSp;
    let dvz = inp.mz * maxSp;
    if (stunned || diving) {
      dvx = 0;
      dvz = 0;
    }
    let k: number;
    if (f.grounded) k = diving ? 0.5 : stunned ? 1.3 : hasIn ? 8 : 3.4;
    else k = stunned || diving ? 0.2 : hasIn ? 1.8 : 0.4;
    const a = 1 - Math.exp(-k * dt);
    f.vx += (dvx - f.vx) * a;
    f.vz += (dvz - f.vz) * a;

    // yaw badan mengikuti arah bidik
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else if (diving) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-30 * dt));
    } else {
      f.yaw += angDiff(f.aimYaw, f.yaw) * (1 - Math.exp(-16 * dt));
    }
    if (stunned) f.aimYaw = f.yaw + 0;

    f.x += f.vx * dt;
    f.z += f.vz * dt;
    // semak = penghalang (bisa dilompati kalau pendek)
    for (const bl of this.world.blockers) {
      if (stunned || diving) break; // terlempar / menerjang = menerobos semak
      if (f.y > bl.h - 0.25) continue;
      const bx = f.x - bl.x;
      const bz = f.z - bl.z;
      const bd = Math.hypot(bx, bz);
      const mr = bl.r + 0.5;
      if (bd < mr && bd > 1e-4) {
        const nx = bx / bd;
        const nz = bz / bd;
        f.x = bl.x + nx * mr;
        f.z = bl.z + nz * mr;
        const vn = f.vx * nx + f.vz * nz;
        if (vn < 0) {
          f.vx -= nx * vn * 1.1;
          f.vz -= nz * vn * 1.1;
          if (vn < -6 && f.isPlayer) this.shake = Math.max(this.shake, 0.15);
        }
      }
    }
    let dist = Math.hypot(f.x, f.z);
    if (f.y < -0.08 && dist < H_DOCK_R + 0.25 && dist > 0.01) {
      const nx = f.x / dist;
      const nz = f.z / dist;
      f.x = nx * (H_DOCK_R + 0.25);
      f.z = nz * (H_DOCK_R + 0.25);
      const vn = f.vx * nx + f.vz * nz;
      if (vn < 0) {
        f.vx -= nx * vn;
        f.vz -= nz * vn;
      }
      dist = H_DOCK_R + 0.25;
    }
    const onDock = dist < H_DOCK_R && f.y >= -0.08;
    f.vy -= 30 * dt;
    f.y += f.vy * dt;
    if (onDock && f.y <= 0 && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) {
        f.sq.v += Math.min(-f.vy, 14) * 0.45;
        if (-f.vy > 6) this.particles.spawn(f.x, 0.1, f.z, 0xf5e6c8, 5, 2, 1.5, 0.12, 0.4, 6);
      }
      f.y = 0;
      f.vy = 0;
      f.grounded = true;
      f.falling = false;
    } else if (f.y > 0.001 || !onDock) f.grounded = false;

    if (!onDock && f.y >= -0.08 && !f.falling && !f.grounded && f.y <= 0.3 && f.vy <= 0.5) {
      f.falling = true;
      f.ragdoll = Math.max(f.ragdoll, 2);
      this.setFall(f, f.vx, f.vz, 1.3);
      f.tx.v += f.fallX * 4;
      f.tz.v += f.fallZ * 4;
      f.scoped = false;
      f.reloadT = 0;
      if (f.isPlayer) this.popup('Jatuh! 😱', f.x, f.y + 3.4, f.z, '#ff7a7a', 22);
    }
    if (!onDock && f.y < H_WATER_Y + 0.25 && f.vy < 0) {
      f.swim = 2.4;
      f.vx *= 0.25;
      f.vz *= 0.25;
      f.vy = 0;
      f.ragdoll = 0;
      f.falling = false;
      f.scoped = false;
      f.reloadT = 0;
      f.streak = 0;
      this.world.popDog('laugh');
      this.splash(f.x, f.z, 1.6);
      if (f.isPlayer) {
        this.popup('BYURR! 💦', f.x, 1.5, f.z, '#8fe3ff', 32);
        this.shake = Math.max(this.shake, 0.5);
      }
    }
  }

  private swimStep(f: Hunter, dt: number) {
    f.swim -= dt;
    f.vx *= Math.exp(-3 * dt);
    f.vz *= Math.exp(-3 * dt);
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    const sd = Math.hypot(f.x, f.z);
    if (sd < H_DOCK_R + 0.9 && sd > 0.01) {
      f.x = (f.x / sd) * (H_DOCK_R + 0.9);
      f.z = (f.z / sd) * (H_DOCK_R + 0.9);
    }
    const ty = hWave(f.x, f.z, this.time) - 0.7 + Math.sin(this.time * 3 + f.idx) * 0.06;
    f.y += (ty - f.y) * (1 - Math.exp(-8 * dt));
    f.vy = 0;
    f.grounded = false;
    f.shoveT = -1;
    f.diveT = 0;
    f.scoped = false;
    if (Math.random() < dt * 6) this.ripples.spawn(f.x + rand(-0.6, 0.6), f.z + rand(-0.6, 0.6), 1.2, this.time);
    if (Math.random() < dt * 8) this.particles.spawn(f.x, f.y + 1.2, f.z, 0xbdf2ff, 1, 1, 2, 0.1, 0.5);
    if (f.swim <= 0) {
      this.splash(f.x, f.z, 1.2);
      f.x = f.spot.x;
      f.z = f.spot.z;
      f.y = 5;
      f.vx = f.vz = f.vy = 0;
      f.ragdoll = 0;
      f.aimYaw = f.yaw = Math.atan2(f.spot.dx, f.spot.dz);
      f.aimPitch = 0.2;
      f.tx.a = f.tz.a = 0;
      f.hitCd = 0.5;
      f.standT = 0.4;
      f.ammo = MAG;
      this.splash(f.x, f.z, 0.8);
    }
  }

  private splash(x: number, z: number, big: number) {
    this.particles.spawn(x, H_WATER_Y + 0.1, z, 0xdff6ff, Math.floor(14 * big), 3.5 * big, 6 * big, 0.14, 0.8);
    this.particles.spawn(x, H_WATER_Y + 0.1, z, 0x7fdcff, Math.floor(8 * big), 2.5 * big, 4 * big, 0.12, 0.7);
    this.ripples.spawn(x, z, 1.8 * big, this.time);
    this.ripples.spawn(x, z, 1.2 * big, this.time);
    const p = this.hunters[0];
    if (p && Math.hypot(x - p.x, z - p.z) < 16) sfx.splash(Math.min(1.4, big));
  }

  private collisions() {
    const F = this.hunters;
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        const a = F[i];
        const b = F[j];
        if (a.swim > 0 || b.swim > 0) continue;
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
        const jv = rv * 0.6;
        a.vx -= nx * jv;
        a.vz -= nz * jv;
        b.vx += nx * jv;
        b.vz += nz * jv;
        if (rv > 1.5) {
          // senggol = bidikan goyang
          this.jolt(a, clamp(rv * 0.35, 0.4, 2));
          this.jolt(b, clamp(rv * 0.35, 0.4, 2));
          if (rv > 2.5) {
            this.bumpSpring(a, -nx, -nz, rv * 0.7);
            this.bumpSpring(b, nx, nz, rv * 0.7);
            if ((a.isPlayer || b.isPlayer) && this.time - this.bumpAt > 0.2) {
              this.bumpAt = this.time;
              sfx.bump();
              this.shake = Math.max(this.shake, 0.25);
            }
          }
        }
        if (a.diveT > 0 && b.diveT <= 0 && rv > 4) {
          this.knock(b, nx, nz, 9, 1.8, 4);
          this.hitFx(b);
        } else if (b.diveT > 0 && a.diveT <= 0 && rv > 4) {
          this.knock(a, -nx, -nz, 9, 1.8, 4);
          this.hitFx(a);
        } else if (rv > 7.5) {
          const sa = Math.hypot(a.vx, a.vz);
          const sb = Math.hypot(b.vx, b.vz);
          if (sa < sb) this.knock(a, -nx, -nz, 4, 1.0);
          else this.knock(b, nx, nz, 4, 1.0);
        }
      }
    }
  }

  private hitFx(f: Hunter) {
    this.particles.spawn(f.x, f.y + 1.2, f.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
    this.popup('💥 BRAK!', f.x, f.y + 2.6, f.z, '#ffe14d', 26);
    sfx.punch();
  }

  // ---------- animasi rig ----------
  private animate(f: Hunter, dt: number) {
    const rig = f.rig;
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
    const stunned = f.ragdoll > 0;
    const swimming = f.swim > 0;
    const diving = f.diveT > 0;
    const menuPose = f.celebrate;
    const aiming = !stunned && !swimming && !diving && !menuPose;

    if (swimming) {
      f.tx.step(0.15 + Math.sin(this.time * 2 + f.idx) * 0.1, 30, 4, dt);
      f.tz.step(Math.sin(this.time * 1.7 + f.idx) * 0.2, 30, 4, dt);
    } else if (stunned) {
      f.tx.step(f.fallX, 26, 3.2, dt);
      f.tz.step(f.fallZ, 26, 3.2, dt);
    } else {
      let tgx = clamp(lz * 0.05, -0.45, 0.45);
      const tgz = clamp(-lx * 0.045, -0.35, 0.35);
      if (diving) tgx = 1.3;
      if (f.scoped) tgx += 0.06;
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
    if (f.grounded) f.walk += sp * dt * 2.3;
    const sw = Math.sin(f.walk) * walkAmp;
    let lL = -sw * 0.85;
    let lR = sw * 0.85;
    let kA = 95;
    let cA = 8;
    let kL = 120;
    let cL = 9;
    const pitchV = clamp(f.aimPitch + f.recoil, -0.5, 1.3);
    // pose menembak: lengan lurus ke depan memegang senapan
    let aL = -1.38 - pitchV * 0.95;
    let aR = aL;
    let zL = -0.46;
    let zR = 0.46;
    if (!f.grounded && aiming) {
      lL = lR = -0.5;
    }
    if (menuPose) {
      aL = aR = -2.9 + Math.sin(this.time * 14 + f.idx) * 0.35;
      zL = 0.7;
      zR = -0.7;
      kA = 70;
    }
    if (f.shoveT >= 0) {
      const ph = f.shoveT;
      aL = aR = ph < 0.12 ? -0.6 : ph < 0.3 ? -1.7 : -0.5;
      zL = -0.15;
      zR = 0.15;
      kA = 340;
      cA = 22;
    }
    if (diving) {
      aL = aR = -2.9;
      zL = 0.2;
      zR = -0.2;
      lL = lR = 0.7;
    }
    if (swimming) {
      aL = Math.sin(this.time * 8 + f.idx) * 1.0 - 1.9;
      aR = Math.sin(this.time * 8 + f.idx + 2) * 1.0 - 1.9;
      zL = 0.5;
      zR = -0.5;
      lL = Math.sin(this.time * 9) * 0.7;
      lR = -Math.sin(this.time * 9) * 0.7;
    }
    if (stunned) {
      f.flailT -= dt;
      if (f.flailT <= 0) {
        f.flailT = 0.14 + Math.random() * 0.14;
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
    f.head.step(-f.tx.a * 0.45 - (aiming ? pitchV * 0.5 : 0), 55, 5, dt, lacF * 0.03);
    f.headZ.step(-f.tz.a * 0.4, 55, 5, dt, -lacX * 0.03);
    f.tail.step(0, 40, 3, dt, lacX * 0.05);

    const lift = 0.15 * Math.max(Math.abs(Math.sin(f.tx.a)), Math.abs(Math.sin(f.tz.a)));
    const bob = f.grounded && !f.celebrate ? Math.abs(Math.sin(f.walk)) * 0.07 * walkAmp : 0;
    const ry = f.y + lift + bob;
    rig.root.position.set(f.x, ry, f.z);
    rig.root.rotation.y = f.yaw;
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
    // senapan
    f.gun.visible = !menuPose && !swimming;
    f.gun.rotation.set(aiming ? -pitchV : stunned ? 0.6 : -0.4, 0, 0);
    f.gun.position.set(0, 1.28, 0.22 + (f.shoveT >= 0 ? Math.sin(Math.min(1, f.shoveT / 0.3) * Math.PI) * 0.6 : 0) - f.recoil * 1.8);
    if (f.boltT > 0.3 && aiming) f.gun.rotation.z = Math.sin((BOLT_T - f.boltT) * 10) * 0.12;
    else f.gun.rotation.z = 0;

    const dist = Math.hypot(f.x, f.z);
    rig.ring.visible = f.y >= -0.08 && dist < H_DOCK_R && !swimming;
    rig.ring.position.y = 0.05 - ry;
    rig.ring.scale.setScalar(1 + (f.isPlayer ? Math.sin(this.time * 5) * 0.05 : 0));
    const hidden = f.isPlayer && f.scopeK > 0.85;
    rig.root.visible = !hidden;
    rig.root.updateMatrixWorld(true);
  }

  // ---------- kamera ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.player();
    const aspect = this.w / this.h;
    const zoomOut = aspect < 1 ? 1.4 : 1;
    let fov = HIP_FOV;
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = this.time * 0.22;
      this.tv.set(Math.cos(a) * 21 * zoomOut, 10 * zoomOut, Math.sin(a) * 21 * zoomOut);
      this.tv2.set(0, 2.2, 0);
      const k = instant ? 1 : 1 - Math.exp(-3 * dt);
      this.camPos.lerp(this.tv, k);
      this.camLook.lerp(this.tv2, k);
      this.fovNow += (52 - this.fovNow) * (instant ? 1 : 1 - Math.exp(-5 * dt));
      this.camDir.copy(this.camLook).sub(this.camPos).normalize();
      this.shake *= Math.exp(-6 * dt);
      this.camera.fov = this.fovNow;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camera.updateMatrixWorld();
      return;
    }
    const kScope = me.scopeK;
    // sway: lebih besar saat bergerak / kena senggol, mereda bila diam di scope
    const moving = clamp(Math.hypot(me.vx, me.vz) / 5, 0, 1);
    me.steadyT = me.scoped && moving < 0.1 ? Math.min(1.5, me.steadyT + dt) : Math.max(0, me.steadyT - dt * 3);
    const amp = (me.scoped ? 0.0042 : 0.0028) * (1 + moving * 3) * (1 - 0.7 * clamp(me.steadyT / 1.2, 0, 1)) + me.swayBoost * 0.006;
    const swY = (Math.sin(this.time * 1.9) + Math.sin(this.time * 3.7 + 1) * 0.4) * amp;
    const swP = (Math.cos(this.time * 1.5) + Math.sin(this.time * 4.3) * 0.4) * amp;
    const yaw = me.aimYaw + swY;
    const pitch = clamp(me.aimPitch + me.recoil + swP, -0.55, 1.35);
    const dir = this.camDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const headY = me.y + 2.3;
    const dist = 5.6;
    const hip = this.tv.set(me.x + rx * 1.55 - dir.x * dist, headY + 1.05 - dir.y * dist, me.z + rz * 1.55 - dir.z * dist);
    hip.y = Math.max(hip.y, 1.2 + me.y);
    const eye = this.tv2.set(me.x + dir.x * 0.45, headY + dir.y * 0.45 - 0.05, me.z + dir.z * 0.45);
    const e = 1 - Math.pow(1 - kScope, 2);
    const pos = this.tv3.lerpVectors(hip, eye, e);
    if (instant) this.camPos.copy(pos);
    else this.camPos.lerp(pos, 1 - Math.exp(-26 * dt));
    fov = lerp(HIP_FOV, SCOPE_FOV, e);
    if (this.phase === 'countdown') fov = HIP_FOV;
    this.fovNow = fov;
    this.shake *= Math.exp(-6 * dt);
    const sh = this.shake * 0.45 * (1 - e * 0.6);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camLook.copy(this.camPos).addScaledVector(dir, 50);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  private project(x: number, y: number, z: number) {
    const v = this.tv4.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, vis: v.z < 1 && v.z > -1 };
  }

  private updateLabels() {
    const me = this.player();
    for (const f of this.hunters) {
      const yy = f.swim > 0 ? H_WATER_Y + 1.6 : f.y + 3.5;
      const p = this.project(f.x, yy, f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      const hideSelf = f.isPlayer && (this.phase === 'playing' || this.phase === 'countdown');
      f.tag.style.display = p.vis && !hideSelf && me.scopeK < 0.5 ? 'block' : 'none';
      let ind = '';
      if (f.swim > 0) ind = '💦';
      else if (f.ragdoll > 0) ind = '💫';
      else if (f.reloadT > 0) ind = '🔄';
      else if (this.phase === 'results' && f === this.ranking()[0]) ind = '👑';
      if (f.indEl.textContent !== ind) f.indEl.textContent = ind;
    }
  }

  popup(text: string, x: number, y: number, z: number, color: string, size = 24, noVertOffset = false, dy = 0) {
    void noVertOffset;
    const p = this.project(x, y, z);
    if (!p.vis) return;
    const d = document.createElement('div');
    d.textContent = text;
    d.className = 'game-popup';
    d.style.left = `${clamp(p.x, 40, this.w - 40)}px`;
    d.style.top = `${clamp(p.y + dy, 40, this.h - 60)}px`;
    d.style.color = color;
    d.style.fontSize = `${size}px`;
    this.overlay.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  // ---------- HUD ----------
  private buildHud(): HuntHudState {
    const me = this.player();
    const rank = this.ranking();
    const board: HBoardEntry[] = rank.map((f, i) => ({
      id: f.idx,
      name: f.name,
      animal: f.def.id,
      color: f.color,
      score: f.score,
      hits: f.hits,
      heads: f.heads,
      streak: f.streak,
      bestStreak: f.bestStreak,
      acc: f.shots > 0 ? Math.round((f.hits / f.shots) * 100) : 0,
      isPlayer: f.isPlayer,
      rank: i + 1,
    }));
    const R = 100;
    const ys = me.aimYaw;
    const fxv = Math.sin(ys);
    const fzv = Math.cos(ys);
    const ducks = this.ducks
      .filter((d) => d.alive)
      .map((d) => {
        const dx = d.pos.x - me.x;
        const dz = d.pos.z - me.z;
        return { x: clamp((dx * -fzv + dz * fxv) / R, -1.1, 1.1), y: clamp((dx * fxv + dz * fzv) / R, -1.1, 1.1), t: d.type };
      });
    const players = this.hunters.map((f) => {
      const dx = f.x - me.x;
      const dz = f.z - me.z;
      return { x: (dx * -fzv + dz * fxv) / R, y: (dx * fxv + dz * fzv) / R, color: f.color, me: f.isPlayer };
    });
    const playing = this.phase === 'playing';
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! Gerakkan MOUSE untuk membidik · KLIK KANAN untuk scope 🔭';
    else if (playing) {
      if (me.swim > 0) hint = 'Kamu nyebur! 😂 Sabar, sebentar lagi naik lagi...';
      else if (me.ragdoll > 0) hint = 'Kamu kena senggol! 💫';
      else if (me.stunLite > 0) hint = '💣 Kena bom! Bidikanmu goyang...';
      else if (me.reloadT > 0) hint = 'Reload... 🔄';
      else if (this.timeLeft > H_ROUND - 9) hint = 'KLIK = tembak · KLIK KANAN = scope · F senggol · SHIFT terjang · R reload';
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      go: playing && this.goT > 0,
      timeLeft: this.timeLeft,
      frenzy: this.frenzy && playing,
      board,
      me: {
        ammo: me.ammo,
        mag: MAG,
        reload: me.reloadT > 0 ? 1 - me.reloadT / RELOAD_T : 0,
        bolt: me.boltT > 0 ? 1 - me.boltT / BOLT_T : 1,
        scoped: me.scopeK > 0.55,
        scopeK: me.scopeK,
        stunned: me.ragdoll > 0,
        swimming: me.swim > 0,
        streak: me.streak,
        mult: me.streak >= 6 ? 3 : me.streak >= 3 ? 2 : 1,
        shoveReady: clamp(1 - me.shoveCd / 0.8, 0, 1),
        diveReady: clamp(1 - me.diveCd / 1.8, 0, 1),
        sway: clamp(me.swayBoost / 3, 0, 1),
        hurt: clamp(me.hurt / 0.9, 0, 1),
      },
      radar: { yaw: ys, ducks, players },
      hitSeq: this.hitSeq,
      hitKind: this.hitKind,
      banner: this.banner,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }

}

void lerp;
