import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { buildBombWorld, BombWorld, R_HALF } from './bombWorld';

const HALF = R_HALF;
const GRAV = 30;
const BOMB_G = 26;
const WAVE_T = 11;
const MAX_TIME = 150;
const POOL = 34;
const TAU = Math.PI * 2;

export type BPhase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
type BType = 'normal' | 'mega' | 'cluster' | 'mini';

export interface BBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  isPlayer: boolean;
  alive: boolean;
  place: number;
  ko: number;
  time: number;
  carrying: boolean;
}

export interface BombHudState {
  phase: BPhase;
  countdown: number;
  go: boolean;
  time: number;
  wave: number;
  waveProg: number;
  bombs: number;
  alive: number;
  board: BBoardEntry[];
  me: {
    alive: boolean;
    carrying: boolean;
    fuseLeft: number;
    fuseFrac: number;
    charge: number;
    charging: boolean;
    diveReady: number;
    shoveReady: number;
    stunned: boolean;
    falling: boolean;
    danger: number;
    nearBomb: boolean;
    edge: boolean;
  };
  flash: number;
  banner: string;
  hint: string;
  muted: boolean;
  playerAnimal: string;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
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

interface BInput {
  mx: number;
  mz: number;
  grab: boolean;
  jump: boolean;
  dive: boolean;
  shove: boolean;
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

const BT: Record<BType, { r: number; blast: number; power: number; body: number; accent: number }> = {
  normal: { r: 0.58, blast: 4.6, power: 1, body: 0x23232e, accent: 0xff7a2e },
  mega: { r: 0.95, blast: 6.9, power: 1.3, body: 0xd62c2c, accent: 0xffd23f },
  cluster: { r: 0.72, blast: 4.0, power: 0.95, body: 0x7a3fd0, accent: 0xffd23f },
  mini: { r: 0.4, blast: 3.1, power: 0.8, body: 0xff8a2e, accent: 0x2b2b33 },
};

// ---------- bom ----------
class Bomb {
  state: 'dead' | 'falling' | 'free' | 'held' = 'dead';
  type: BType = 'normal';
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  r = 0.58;
  blast = 4.6;
  power = 1;
  fuse = 3;
  fuseMax = 3;
  tx = 0;
  tz = 0;
  fallT = 0;
  fallTotal = 1.6;
  owner: Cat | null = null;
  holder: Cat | null = null;
  thrown = false;
  age = 0;
  tickT = 0;
  sparkT = 0;
  g: THREE.Group;
  scaleG: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  stripe: THREE.MeshStandardMaterial;
  tele: THREE.Group;
  teleDisc: THREE.MeshBasicMaterial;
  teleRing: THREE.MeshBasicMaterial;
  tip: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.g = new THREE.Group();
    this.scaleG = new THREE.Group();
    this.g.add(this.scaleG);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 });
    this.stripe = new THREE.MeshStandardMaterial({ color: 0xff7a2e, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), this.mat);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 28), this.stripe);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.3;
    band.scale.set(0.96, 0.96, 1);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.38, 14), new THREE.MeshStandardMaterial({ color: 0x5a5a68, roughness: 0.4, metalness: 0.5 }));
    cap.position.y = 1.0;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 6), new THREE.MeshStandardMaterial({ color: 0xe8d8a8, roughness: 0.9 }));
    fuse.position.set(0.12, 1.5, 0);
    fuse.rotation.z = -0.4;
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd25a }));
    this.tip.position.set(0.26, 1.82, 0);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const browM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), eyeM);
      e.position.set(s * 0.36, 0.2, 0.86);
      e.scale.z = 0.5;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), pupM);
      p.position.set(s * 0.33, 0.18, 0.99);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.06), browM);
      br.position.set(s * 0.36, 0.55, 0.88);
      br.rotation.z = -s * 0.42;
      this.scaleG.add(e, p, br);
    }
    this.scaleG.add(body, band, cap, fuse, this.tip);
    this.g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.g.visible = false;
    scene.add(this.g);

    this.tele = new THREE.Group();
    this.teleDisc = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.2, depthWrite: false });
    this.teleRing = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, depthWrite: false });
    const dg = new THREE.CircleGeometry(1, 44);
    dg.rotateX(-Math.PI / 2);
    const rg = new THREE.RingGeometry(0.93, 1, 56);
    rg.rotateX(-Math.PI / 2);
    const d = new THREE.Mesh(dg, this.teleDisc);
    const r = new THREE.Mesh(rg, this.teleRing);
    r.position.y = 0.002;
    this.tele.add(d, r);
    this.tele.visible = false;
    scene.add(this.tele);
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
  out = false;
  alive = true;
  place = 0;
  surviveTime = 0;
  ragdoll = 0;
  standT = 0;
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
  ko = 0;
  lastHit: Cat | null = null;
  lastHitT = -99;
  screamed = false;

  carry: Bomb | null = null;
  charge = 0;
  charging = false;
  needRelease = false;
  grabCd = 0;
  prevGrab = false;

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

  input: BInput = { mx: 0, mz: 0, grab: false, jump: false, dive: false, shove: false };
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  ai = {
    alert: 0,
    noise: 0,
    noiseT: 0,
    wanderT: 0,
    wx: 0,
    wz: 0,
    holdFor: 0,
    needPower: 0.5,
    aimErr: 0,
    shoveT: 0,
    target: null as Cat | null,
    bomb: null as Bomb | null,
    pickT: 0,
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
    this.out = false;
    this.alive = true;
    this.place = 0;
    this.surviveTime = 0;
    this.ragdoll = 0;
    this.standT = 0;
    this.hitCd = 0;
    this.shoveT = -1;
    this.shoveCd = 0;
    this.diveT = 0;
    this.diveCd = 0;
    this.celebrate = false;
    this.ko = 0;
    this.lastHit = null;
    this.lastHitT = -99;
    this.screamed = false;
    this.carry = null;
    this.charge = 0;
    this.charging = false;
    this.needRelease = false;
    this.grabCd = 0;
    this.prevGrab = false;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail]) {
      s.a = 0;
      s.v = 0;
    }
    this.input = { mx: 0, mz: 0, grab: false, jump: false, dive: false, shove: false };
    this.ai.alert = 0;
    this.ai.bomb = null;
    this.ai.target = null;
    this.ai.holdFor = 0;
    this.rig.root.visible = true;
  }
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number; grow: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < 420; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 14, size: 0.1, grow: 0 });
    }
  }
  spawn(x: number, y: number, z: number, color: number, n: number, speed: number, up: number, size: number, life: number, grav = 14, grow = 0) {
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
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 2) * (p.grow ? 0.55 : 1);
    }
  }
}

// bola api, gelombang kejut, bekas hangus
class Blasts {
  balls: { m: THREE.Mesh; t: number; max: number; R: number; hot: number }[] = [];
  rings: { m: THREE.Mesh; t: number; R: number }[] = [];
  scorch: { m: THREE.Mesh; t: number }[] = [];
  constructor(scene: THREE.Scene) {
    const sg = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffa530, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.balls.push({ m, t: 1, max: 0.4, R: 1, hot: 1 });
    }
    const rg = new THREE.RingGeometry(0.9, 1, 56);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, t: 1, R: 1 });
    }
    const dg = new THREE.CircleGeometry(1, 28);
    dg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        dg,
        new THREE.MeshBasicMaterial({ color: 0x1a1a22, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      m.visible = false;
      scene.add(m);
      this.scorch.push({ m, t: 99 });
    }
  }
  boom(x: number, y: number, z: number, R: number) {
    let n = 0;
    for (const b of this.balls) {
      if (b.t < b.max) continue;
      b.t = 0;
      b.max = 0.32 + n * 0.1;
      b.R = R * (n === 0 ? 0.62 : 0.4 + Math.random() * 0.2);
      b.hot = n === 0 ? 1 : 0.5;
      const off = n === 0 ? 0 : 0.5 * R * 0.3;
      b.m.position.set(x + (Math.random() - 0.5) * off * 2, y + 0.3 + n * 0.25, z + (Math.random() - 0.5) * off * 2);
      b.m.visible = true;
      if (++n >= 4) break;
    }
    const r = this.rings.find((q) => q.t >= 1);
    if (r) {
      r.t = 0;
      r.R = R * 1.05;
      r.m.position.set(x, 0.12, z);
      r.m.visible = true;
    }
    const s = this.scorch.find((q) => q.t > 8) ?? this.scorch[0];
    s.t = 0;
    s.m.position.set(x, 0.037, z);
    s.m.scale.setScalar(R * (0.38 + Math.random() * 0.08));
    s.m.visible = true;
  }
  update(dt: number) {
    for (const b of this.balls) {
      if (b.t >= b.max) {
        b.m.visible = false;
        continue;
      }
      b.t += dt;
      const u = clamp(b.t / b.max, 0, 1);
      b.m.scale.setScalar(b.R * (0.2 + 0.8 * (1 - Math.pow(1 - u, 3))));
      const mat = b.m.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - u) * 0.95;
      mat.color.setRGB(1, 0.35 + 0.6 * (1 - u) * b.hot, 0.05 + 0.5 * (1 - u) * (1 - u) * b.hot);
    }
    for (const r of this.rings) {
      if (r.t >= 1) {
        r.m.visible = false;
        continue;
      }
      r.t += dt / 0.42;
      const u = clamp(r.t, 0, 1);
      r.m.scale.setScalar(r.R * (0.15 + 0.85 * (1 - Math.pow(1 - u, 2.4))));
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
    }
    for (const s of this.scorch) {
      if (s.t > 8) {
        s.m.visible = false;
        continue;
      }
      s.t += dt;
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.min(0.5, (1 - s.t / 8) * 0.55);
    }
  }
  clear() {
    for (const b of this.balls) {
      b.t = 99;
      b.m.visible = false;
    }
    for (const r of this.rings) {
      r.t = 2;
      r.m.visible = false;
    }
    for (const s of this.scorch) {
      s.t = 99;
      s.m.visible = false;
    }
  }
}

interface Threat {
  x: number;
  z: number;
  R: number;
  t: number;
  b: Bomb;
  shock: boolean;
}

export class BombEngine {
  private container: HTMLElement;
  private onHud: (h: BombHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: BombWorld;
  private particles: Particles;
  private blasts: Blasts;
  private cats: Cat[] = [];
  private bombs: Bomb[] = [];
  private queue: { at: number; x: number; z: number; type: BType }[] = [];
  private markerRing: THREE.Mesh;
  private dots: THREE.Mesh[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private fast = false;

  phase: BPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private playTime = 0;
  private wave = 0;
  private spawnT = 1.5;
  private goT = 0;
  private banner = '';
  private bannerT = 0;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private flash = 0;
  private bumpAt = 0;
  private beeps = 0;
  private aliveCount = 4;
  private endT = 0;
  private threatList: Threat[] = [];

  private keys = new Set<string>();
  private pend = { jump: false, dive: false, shove: false };
  private grabHeld = false;
  private touchGrabHeld = false;
  private joy = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 28, 26);
  private camLook = new THREE.Vector3(0, 0, 1);
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();

  constructor(container: HTMLElement, onHud: (h: BombHudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;filter:saturate(1.2) contrast(1.04) brightness(1.03);';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 1400);
    this.world = buildBombWorld(this.scene, PLAYER_COLORS);
    this.particles = new Particles(this.scene);
    this.blasts = new Blasts(this.scene);
    for (let i = 0; i < POOL; i++) this.bombs.push(new Bomb(this.scene));

    const rg = new THREE.RingGeometry(0.62, 0.8, 36);
    rg.rotateX(-Math.PI / 2);
    this.markerRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.markerRing.visible = false;
    this.scene.add(this.markerRing);
    const dg = new THREE.SphereGeometry(0.14, 8, 6);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      m.visible = false;
      this.scene.add(m);
      this.dots.push(m);
    }

    this.setupCats(this.playerAnimal);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    container.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
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
    this.container.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.container.removeEventListener('contextmenu', this.onCtx);
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
  }
  toggleMute() {
    sfx.muted = !sfx.muted;
  }
  setJoy(x: number, y: number) {
    this.joy.x = x;
    this.joy.y = y;
  }
  setTouchGrab(v: boolean) {
    sfx.resume();
    this.touchGrabHeld = v;
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
  private curPhase(): BPhase {
    return this.phase;
  }
  /** loncat ke hasil akhir (dipakai setelah pemain tersingkir) */
  skip() {
    if (this.phase !== 'playing' && this.phase !== 'finished') return;
    const m = sfx.muted;
    sfx.muted = true;
    this.fast = true;
    let n = 0;
    while (this.curPhase() !== 'results' && n++ < 9000) this.update(1 / 30);
    this.fast = false;
    sfx.muted = m;
    this.overlay.querySelectorAll('.game-popup').forEach((e) => e.remove());
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    sfx.resume();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') this.pend.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pend.dive = true;
    if (e.code === 'KeyE' || e.code === 'KeyJ') this.pend.shove = true;
    if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => {
    this.keys.clear();
    this.grabHeld = false;
  };
  private onMouseDown = (e: MouseEvent) => {
    sfx.resume();
    if (e.button === 0) this.grabHeld = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.grabHeld = false;
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
  private setupCats(animalId: string) {
    for (const c of this.cats) {
      this.scene.remove(c.rig.root);
      c.tag.remove();
    }
    this.cats = [];
    const pd = ANIMALS.find((a) => a.id === animalId) ?? ANIMALS[0];
    const others = ANIMALS.filter((a) => a.id !== pd.id).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const skills = [0.55, 0.72, 0.88];
    const defs = [pd, others[0], others[1], others[2]];
    defs.forEach((d, i) => {
      const c = new Cat(i, d, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1], this.world.spawns[i]);
      this.scene.add(c.rig.root);
      this.overlay.appendChild(c.tag);
      this.cats.push(c);
    });
    this.resetAll();
  }

  private resetAll() {
    for (const b of this.bombs) this.killBomb(b);
    this.blasts.clear();
    for (const c of this.cats) c.reset();
    this.queue = [];
    this.playTime = 0;
    this.wave = 0;
    this.spawnT = 1.6;
    this.goT = 0;
    this.banner = '';
    this.bannerT = 0;
    this.aliveCount = this.cats.length;
    this.endT = 0;
    this.flash = 0;
    this.markerRing.visible = false;
    this.dots.forEach((d) => (d.visible = false));
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
    const live = this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'finished';
    const playing = this.phase === 'playing';

    if (playing) {
      this.playTime += dt;
      this.spawnLogic(dt);
    }
    this.beeps = Math.max(0, this.beeps - dt * 14);
    this.threatList = this.computeThreats();

    for (const c of this.cats) {
      if (c.isPlayer) this.readPlayerInput(c, live && this.phase !== 'finished' && playing, dt);
      else this.botThink(c, dt, playing);
      c.celebrate = this.phase === 'menu' || (this.phase === 'results' && c.alive && this.aliveCount <= 1);
      c.hitCd -= dt;
      this.handleBomb(c, dt, playing);
      this.physics(c, dt);
    }
    this.collisions();
    for (const b of this.bombs) if (b.state !== 'dead') this.updateBomb(b, dt);
    this.checkEnd(dt);

    if (this.fast) return;
    this.world.update(this.time, dt);
    for (const c of this.cats) this.animate(c, dt);
    this.updateMarker();
    this.particles.update(dt);
    this.blasts.update(dt);
    this.updateCamera(dt, false);
    this.updateLabels();
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    this.onHud(this.buildHud());
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
        this.goT = 1.3;
        sfx.go();
      }
    } else if (this.phase === 'playing') {
      this.goT -= dt;
      if (this.playTime > MAX_TIME) this.finish();
    } else if (this.phase === 'finished') {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.phase = 'results';
        sfx.fanfare();
      }
    }
  }

  private contenders() {
    return this.cats.filter((c) => c.alive && !c.falling);
  }

  private checkEnd(dt: number) {
    void dt;
    if (this.phase !== 'playing') return;
    if (this.contenders().length <= 1) this.finish();
  }

  private finish() {
    if (this.phase !== 'playing') return;
    this.phase = 'finished';
    const left = this.contenders().sort((a, b) => b.ko - a.ko);
    left.forEach((c, i) => {
      c.place = i + 1;
      c.surviveTime = this.playTime;
    });
    this.endT = left.length ? 2.6 : 1.2;
    // semua bom lenyap saat ronde selesai (supaya pemenang tidak ikut jatuh)
    for (const b of this.bombs) {
      if (b.state === 'dead') continue;
      if (!this.fast) this.particles.spawn(b.x, Math.max(b.y, 0.5), b.z, 0xffffff, 6, 3, 3, 0.2, 0.6, 4, 1.4);
      this.killBomb(b);
    }
    this.queue = [];
    this.banner = left.length === 1 && left[0].isPlayer ? '👑 KAMU MENANG!' : left.length ? `${left[0].name} MENANG!` : 'SEMUA JATUH!';
    this.bannerT = 3;
    sfx.horn();
  }

  // ---------- input pemain ----------
  private readPlayerInput(f: Cat, live: boolean, dt: number) {
    void dt;
    const i = f.input;
    const pend = this.pend;
    if (!live || !f.alive) {
      i.mx = i.mz = 0;
      i.grab = i.jump = i.dive = i.shove = false;
      pend.jump = pend.dive = pend.shove = false;
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
    // kamera menghadap -z: layar atas = -z
    i.mx = ux;
    i.mz = -uy;
    i.grab = k.has('KeyF') || this.grabHeld || this.touchGrabHeld;
    i.jump = pend.jump;
    i.dive = pend.dive;
    i.shove = pend.shove;
    pend.jump = pend.dive = pend.shove = false;
  }

  // ---------- ancaman (untuk bot & HUD) ----------
  private computeThreats(): Threat[] {
    const out: Threat[] = [];
    for (const b of this.bombs) {
      if (b.state === 'dead') continue;
      if (b.state === 'falling') {
        const land = b.fallTotal - b.fallT;
        out.push({ x: b.tx, z: b.tz, R: 2.7, t: land, b, shock: true });
        out.push({ x: b.tx, z: b.tz, R: b.blast + 0.9, t: land + b.fuseMax, b, shock: false });
      } else if (b.state === 'held' && b.holder) {
        out.push({ x: b.holder.x, z: b.holder.z, R: b.blast + 0.9, t: b.fuse, b, shock: false });
      } else {
        out.push({ x: b.x, z: b.z, R: b.blast + 0.9, t: b.thrown ? Math.min(b.fuse, 0.9) : b.fuse, b, shock: false });
      }
    }
    return out;
  }

  // ---------- bot ----------
  private traj(sx: number, sy: number, sz: number, vx: number, vy: number, vz: number, r: number) {
    const disc = vy * vy + 2 * BOMB_G * (sy - r);
    const t = (vy + Math.sqrt(Math.max(0, disc))) / BOMB_G;
    return { x: sx + vx * t, z: sz + vz * t, t };
  }
  private throwVel(f: Cat, power: number, yaw: number) {
    const hs = 7 + 17 * power;
    return { vx: Math.sin(yaw) * hs + f.vx * 0.4, vz: Math.cos(yaw) * hs + f.vz * 0.4, vy: 6.5 + 2.5 * power };
  }

  private botThink(f: Cat, dt: number, playing: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.grab = inp.jump = inp.dive = inp.shove = false;
    inp.mx = inp.mz = 0;
    f.faceYaw = null;
    if (!playing || !f.alive || f.falling || f.ragdoll > 0) {
      if (f.carry && f.ragdoll <= 0 && f.alive && playing) return;
      return;
    }
    const sk = f.skill;
    if (!f.carry) {
      ai.holdFor = 0.12 + (1 - sk) * 0.5;
      ai.aimErr = (Math.random() - 0.5) * 2 * (0.05 + (1 - sk) * 0.55);
    }

    // --- hindari ledakan ---
    let fx = 0;
    let fz = 0;
    let worst = 9;
    for (const th of this.threatList) {
      if (th.b.holder === f) continue;
      if (th.b === ai.bomb && th.b.fuse > 1.3 && !f.carry) continue; // sedang menuju bom ini untuk diambil
      const limit = th.shock ? 1.4 : 2.7;
      if (th.t > limit) continue;
      const dx = f.x - th.x;
      const dz = f.z - th.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d >= th.R) continue;
      const urg = clamp(1 - th.t / limit, 0, 1);
      const w = ((th.R - d) / th.R) * (0.45 + urg);
      fx += (dx / d) * w;
      fz += (dz / d) * w;
      worst = Math.min(worst, th.t);
    }
    const fleeing = Math.hypot(fx, fz) > 0.02;
    // tepi atap = bahaya
    const em = 3.4;
    const ex = (f.x > HALF - em ? -(f.x - (HALF - em)) : 0) + (f.x < -HALF + em ? -f.x - HALF + em : 0);
    const ez = (f.z > HALF - em ? -(f.z - (HALF - em)) : 0) + (f.z < -HALF + em ? -f.z - HALF + em : 0);
    if (fleeing) {
      fx += (ex / em) * 1.6;
      fz += (ez / em) * 1.6;
      ai.alert += dt;
    } else ai.alert = 0;
    const react = 0.1 + (1 - sk) * 0.5;

    if (fleeing && ai.alert >= react) {
      ai.noiseT -= dt;
      if (ai.noiseT <= 0) {
        ai.noiseT = 0.3;
        ai.noise = (Math.random() - 0.5) * (1 - sk) * 1.5;
      }
      const m = Math.hypot(fx, fz) || 1;
      const c = Math.cos(ai.noise);
      const s = Math.sin(ai.noise);
      inp.mx = (fx / m) * c - (fz / m) * s;
      inp.mz = (fx / m) * s + (fz / m) * c;
      if (worst < 0.55 && f.diveCd <= 0 && f.grounded && !f.carry && Math.random() < 0.06 + sk * 0.06) inp.dive = true;
      // sambil kabur, lempar bom yang dibawa kalau bisa
      if (!f.carry) return;
    }

    // --- sedang membawa bom ---
    if (f.carry) {
      const b = f.carry;
      const opp = this.cats.filter((o) => o !== f && o.alive && !o.falling);
      let tgt: Cat | null = null;
      let best = 1e9;
      for (const o of opp) {
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        const edge = Math.min(HALF - Math.abs(o.x), HALF - Math.abs(o.z));
        const sc = d + edge * 0.7;
        if (sc < best) {
          best = sc;
          tgt = o;
        }
      }
      let yaw = Math.atan2(f.x, f.z) + 0; // default: buang ke arah luar atap
      let dist = 12;
      if (tgt) {
        const lead = 0.55;
        const px = tgt.x + tgt.vx * lead;
        const pz = tgt.z + tgt.vz * lead;
        yaw = Math.atan2(px - f.x, pz - f.z) + ai.aimErr;
        dist = Math.hypot(px - f.x, pz - f.z) * (1 + ai.aimErr * 0.3);
      } else yaw = Math.atan2(f.x, f.z);
      f.faceYaw = yaw;
      // cari daya yang jaraknya paling cocok
      let pw = 0.5;
      let bd = 1e9;
      for (let p = 0.1; p <= 1.001; p += 0.05) {
        const v = this.throwVel(f, p, yaw);
        const l = this.traj(f.x, f.y + 3.0, f.z, v.vx, v.vy, v.vz, 0.5);
        const dd = Math.abs(Math.hypot(l.x - f.x, l.z - f.z) - dist);
        if (dd < bd) {
          bd = dd;
          pw = p;
        }
      }
      ai.needPower = pw;
      const aimed = Math.abs(angDiff(yaw, f.yaw)) < 0.3;
      const urgent = b.fuse < 1.0;
      const farEnough = dist > 5.2 || !tgt;
      // sedikit jalan menjauh dari target kalau terlalu dekat
      if (tgt && dist < 5.2 && !urgent) {
        const dx = f.x - tgt.x;
        const dz = f.z - tgt.z;
        const m = Math.hypot(dx, dz) || 1;
        inp.mx = (dx / m) * 0.7 + (ex / em) * 0.8;
        inp.mz = (dz / m) * 0.7 + (ez / em) * 0.8;
      }
      if (f.needRelease) return;
      if (!f.charging) ai.holdFor -= dt; // ragu sebentar sebelum melempar
      const ready = aimed && (farEnough || urgent) && ai.holdFor <= 0;
      if (f.charging || ready) {
        const want = urgent ? 0.9 : ai.needPower;
        inp.grab = f.charge < want;
      }
      return;
    }

    if (fleeing) return;

    // --- ambil bom di dekat ---
    ai.pickT -= dt;
    if (ai.pickT <= 0) {
      ai.pickT = 0.3;
      ai.bomb = null;
      let bd = 1e9;
      for (const b of this.bombs) {
        if (b.state !== 'free' || b.holder || b.thrown) continue;
        if (b.fuse < 1.5 + (1 - sk) * 0.6) continue;
        if (Math.abs(b.x) > HALF - 1.4 || Math.abs(b.z) > HALF - 1.4 || b.y > 2) continue;
        const d = Math.hypot(b.x - f.x, b.z - f.z);
        if (d < 9 && d < bd) {
          bd = d;
          ai.bomb = b;
        }
      }
    }
    if (ai.bomb && ai.bomb.state === 'free' && !ai.bomb.holder) {
      const b = ai.bomb;
      const dx = b.x - f.x;
      const dz = b.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.35) {
        inp.mx = dx / d;
        inp.mz = dz / d;
      } else if (f.grabCd <= 0 && !f.prevGrab) inp.grab = true;
      return;
    }

    // --- jahili lawan di dekat tepi ---
    ai.shoveT -= dt;
    if (ai.shoveT <= 0) {
      ai.shoveT = 0.35;
      for (const o of this.cats) {
        if (o === f || !o.alive || o.falling) continue;
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        const edge = Math.min(HALF - Math.abs(o.x), HALF - Math.abs(o.z));
        if (d < 1.9 && edge < 5 && f.shoveCd <= 0 && Math.random() < 0.35 * sk + 0.1) {
          f.faceYaw = Math.atan2(o.x - f.x, o.z - f.z);
          inp.shove = true;
          break;
        }
      }
    }

    // --- diam di tempat aman (agak ke tengah) ---
    ai.wanderT -= dt;
    if (ai.wanderT <= 0) {
      ai.wanderT = rand(1.6, 3.4);
      ai.wx = rand(-2.6, 2.6);
      ai.wz = rand(-2.6, 2.6);
    }
    const gx = f.spawn.x * 0.35 + ai.wx;
    const gz = f.spawn.z * 0.35 + ai.wz;
    const dx = gx - f.x;
    const dz = gz - f.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.6) {
      inp.mx = (dx / d) * clamp(d / 2, 0.3, 1);
      inp.mz = (dz / d) * clamp(d / 2, 0.3, 1);
    }
  }

  // ---------- bom: spawn ----------
  private waveCfg(w: number) {
    return {
      interval: Math.max(0.4, 2.35 - 0.19 * w),
      burst: 1 + Math.floor((w - 1) / 3),
      fall: Math.max(1.1, 1.85 - 0.06 * w),
      fuse: Math.max(2.3, 3.5 - 0.1 * w),
      mega: w >= 3 ? Math.min(0.28, 0.08 + 0.04 * (w - 3)) : 0,
      cluster: w >= 5 ? Math.min(0.25, 0.08 + 0.03 * (w - 5)) : 0,
    };
  }

  private freeBomb() {
    return this.bombs.find((b) => b.state === 'dead') ?? null;
  }

  private pickTarget(): { x: number; z: number } {
    const alive = this.cats.filter((c) => c.alive && !c.falling);
    for (let tries = 0; tries < 10; tries++) {
      let x: number;
      let z: number;
      if (alive.length && Math.random() < 0.42) {
        const c = alive[Math.floor(Math.random() * alive.length)];
        x = c.x + c.vx * 0.5 + rand(-2.2, 2.2);
        z = c.z + c.vz * 0.5 + rand(-2.2, 2.2);
      } else {
        x = rand(-HALF + 1.5, HALF - 1.5);
        z = rand(-HALF + 1.5, HALF - 1.5);
      }
      x = clamp(x, -HALF + 1, HALF - 1);
      z = clamp(z, -HALF + 1, HALF - 1);
      const blocked = this.world.blockers.some((bl) => Math.hypot(bl.x - x, bl.z - z) < bl.r + 0.9);
      const crowded = this.bombs.some((b) => b.state === 'falling' && Math.hypot(b.tx - x, b.tz - z) < 3.2);
      if (!blocked && !crowded) return { x, z };
    }
    return { x: rand(-6, 6), z: rand(-6, 6) };
  }

  private spawnBomb(type: BType, x: number, z: number, fall: number, fuse: number) {
    const b = this.freeBomb();
    if (!b) return null;
    const d = BT[type];
    b.state = 'falling';
    b.type = type;
    b.r = d.r;
    b.blast = d.blast;
    b.power = d.power;
    b.tx = x;
    b.tz = z;
    b.x = x;
    b.z = z;
    b.y = 46;
    b.vx = b.vy = b.vz = 0;
    b.fallT = 0;
    b.fallTotal = fall;
    b.fuse = b.fuseMax = type === 'mega' ? fuse + 0.9 : fuse;
    b.owner = null;
    b.holder = null;
    b.thrown = false;
    b.age = 0;
    b.tickT = 0.2;
    b.mat.color.setHex(d.body);
    b.stripe.color.setHex(d.accent);
    b.scaleG.scale.setScalar(d.r);
    b.g.visible = true;
    b.g.position.set(x, 46, z);
    b.tele.visible = true;
    b.tele.position.set(x, 0.045, z);
    b.tele.scale.set(0.01, 1, 0.01);
    if (!this.fast) sfx.bombWhistle(0.5);
    return b;
  }

  private killBomb(b: Bomb) {
    if (b.holder) {
      b.holder.carry = null;
      b.holder.charging = false;
      b.holder.charge = 0;
      b.holder = null;
    }
    b.state = 'dead';
    b.g.visible = false;
    b.tele.visible = false;
    b.mat.emissiveIntensity = 0;
    b.stripe.emissiveIntensity = 0;
  }

  private spawnLogic(dt: number) {
    const w = clamp(1 + Math.floor(this.playTime / WAVE_T), 1, 14);
    const cfg = this.waveCfg(w);
    if (w !== this.wave) {
      this.wave = w;
      if (w > 1) {
        this.banner = `🌩️ GELOMBANG ${w}!`;
        this.bannerT = 2;
        sfx.waveUp();
        // hujan bom berderet
        const n = Math.min(8, 2 + w);
        const horiz = Math.random() < 0.5;
        const off = rand(-6, 6);
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : i / (n - 1) - 0.5;
          this.queue.push({ at: this.playTime + 0.5 + i * 0.16, x: horiz ? u * 20 : off, z: horiz ? off : u * 20, type: 'normal' });
        }
      }
    }
    // antrean
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (this.playTime >= q.at) {
        this.spawnBomb(q.type, clamp(q.x, -HALF + 1, HALF - 1), clamp(q.z, -HALF + 1, HALF - 1), cfg.fall, cfg.fuse);
        this.queue.splice(i, 1);
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = cfg.interval * rand(0.8, 1.2);
      const active = this.bombs.filter((b) => b.state !== 'dead').length;
      if (active < POOL - 8) {
        for (let k = 0; k < cfg.burst; k++) {
          const t = this.pickTarget();
          const r = Math.random();
          const type: BType = r < cfg.mega ? 'mega' : r < cfg.mega + cfg.cluster ? 'cluster' : 'normal';
          this.spawnBomb(type, t.x, t.z, cfg.fall, cfg.fuse);
        }
      }
    }
  }

  // ---------- bom: update ----------
  private handleBomb(f: Cat, dt: number, playing: boolean) {
    const inp = f.input;
    const pressed = inp.grab && !f.prevGrab;
    f.prevGrab = inp.grab;
    f.grabCd -= dt;
    const can = playing && f.alive && !f.falling && f.ragdoll <= 0 && f.diveT <= 0;
    if (f.carry) {
      if (!can) {
        this.dropBomb(f);
        return;
      }
      if (f.needRelease && !inp.grab) f.needRelease = false;
      if (!f.needRelease && inp.grab) {
        f.charging = true;
        f.charge = Math.min(1, f.charge + dt * 1.5);
      } else if (f.charging && !inp.grab) {
        this.throwBomb(f);
      }
    } else if (can && pressed && f.grabCd <= 0 && f.shoveT < 0) {
      let best: Bomb | null = null;
      let bd = 1.9 + 0.3;
      for (const b of this.bombs) {
        if (b.state !== 'free' || b.holder || b.y > 2.6) continue;
        const d = Math.hypot(b.x - f.x, b.z - f.z) - b.r;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (best) {
        best.state = 'held';
        best.holder = f;
        best.owner = f;
        best.thrown = false;
        f.carry = best;
        f.needRelease = true;
        f.charge = 0;
        f.charging = false;
        f.sq.v -= 3;
        if (f.isPlayer) sfx.grab();
      }
    }
  }

  private dropBomb(f: Cat) {
    const b = f.carry;
    if (!b) return;
    b.state = 'free';
    b.holder = null;
    b.vx = f.vx * 0.6 + rand(-1.5, 1.5);
    b.vz = f.vz * 0.6 + rand(-1.5, 1.5);
    b.vy = 3.5;
    b.y = Math.max(b.y, f.y + 2.4);
    b.x = f.x;
    b.z = f.z;
    f.carry = null;
    f.charging = false;
    f.charge = 0;
    f.grabCd = 0.5;
  }

  private throwBomb(f: Cat) {
    const b = f.carry;
    if (!b) return;
    const power = Math.max(0.12, f.charge);
    const v = this.throwVel(f, power, f.yaw);
    b.state = 'free';
    b.holder = null;
    b.thrown = true;
    b.owner = f;
    b.age = 0;
    b.x = f.x + Math.sin(f.yaw) * 0.6;
    b.z = f.z + Math.cos(f.yaw) * 0.6;
    b.y = f.y + 3.0;
    b.vx = v.vx;
    b.vz = v.vz;
    b.vy = v.vy;
    f.carry = null;
    f.charging = false;
    f.charge = 0;
    f.grabCd = 0.4;
    f.armL.v = 20;
    f.armR.v = 20;
    f.tx.v -= 4;
    if (f.isPlayer) sfx.toss();
  }

  private updateBomb(b: Bomb, dt: number) {
    b.age += dt;
    b.sparkT -= dt;
    const urg = clamp(1 - b.fuse / b.fuseMax, 0, 1);

    if (b.state === 'falling') {
      b.fallT += dt;
      const u = Math.min(1, b.fallT / b.fallTotal);
      b.y = b.r + 46 * (1 - u * u);
      b.g.position.set(b.tx, b.y, b.tz);
      b.g.rotation.set(b.fallT * 3, 0, b.fallT * 2);
      // penanda target
      const R = b.blast;
      const grow = clamp(b.fallT / (b.fallTotal * 0.55), 0, 1);
      b.tele.scale.set(R * grow, 1, R * grow);
      b.teleDisc.opacity = 0.1 + 0.18 * u + (Math.sin(this.time * 18) > 0 ? 0.05 : 0);
      b.teleRing.opacity = 0.55 + 0.4 * u;
      b.teleRing.color.setHex(0xffb02e);
      b.teleDisc.color.setHex(0xffb02e);
      if (b.sparkT <= 0) {
        b.sparkT = 0.03;
        this.particles.spawn(b.tx, b.y + 0.5, b.tz, 0xffb347, 1, 0.8, 0.4, 0.2, 0.5, 0, 1.4);
      }
      if (u >= 1) this.landBomb(b);
      return;
    }

    // sumbu
    b.fuse -= dt;
    if (b.sparkT <= 0) {
      b.sparkT = 0.045;
      const px = b.g.position.x;
      const pz = b.g.position.z;
      const py = b.g.position.y + b.r * 1.7;
      this.particles.spawn(px, py, pz, Math.random() < 0.5 ? 0xffd25a : 0xff7a2e, 1, 1.4, 2.4, 0.11, 0.35, 9);
    }
    // kedip makin cepat
    const fr = 7 + 24 * urg * urg;
    const on = Math.sin(this.time * fr + b.age * 0) > 0 ? 1 : 0;
    const em = on * (0.25 + 0.7 * urg);
    b.mat.emissiveIntensity = em;
    b.stripe.emissiveIntensity = em;
    b.scaleG.scale.setScalar(b.r * (1 + (on ? 0.07 * urg : 0)));
    // bip
    b.tickT -= dt;
    if (b.tickT <= 0) {
      b.tickT = 0.1 + 0.5 * (1 - urg) * (1 - urg);
      const p = this.player();
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (!this.fast && d < 20 && this.beeps < 3 && b.state !== 'held') {
        this.beeps++;
        sfx.fuseBeep(urg, 0.7 * (1 - d / 24));
      } else if (!this.fast && b.holder === p && this.beeps < 3) {
        this.beeps++;
        sfx.fuseBeep(urg, 1.2);
      }
    }

    if (b.state === 'held' && b.holder) {
      const h = b.holder;
      const bob = Math.sin(this.time * 9) * 0.04 + (h.charging ? -h.charge * 0.5 : 0);
      b.x = h.x + Math.sin(h.yaw) * (h.charging ? -0.15 * h.charge : 0);
      b.z = h.z + Math.cos(h.yaw) * (h.charging ? -0.15 * h.charge : 0);
      b.y = h.y + 3.3 + bob;
      b.g.position.set(b.x, b.y, b.z);
      b.g.rotation.set(Math.sin(this.time * 7) * 0.15, 0, Math.cos(this.time * 6) * 0.15);
      b.tele.visible = false;
      if (b.fuse <= 0) this.explode(b);
      return;
    }

    // jatuh bebas / menggelinding
    b.vy -= BOMB_G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    const onRoof = Math.abs(b.x) <= HALF + 0.25 && Math.abs(b.z) <= HALF + 0.25;
    if (onRoof && b.y <= b.r && b.vy <= 0) {
      if (b.vy < -4.5) {
        b.vy = -b.vy * 0.4;
        if (!this.fast) {
          this.particles.spawn(b.x, 0.15, b.z, 0xe6dfd0, 3, 1.6, 1.2, 0.14, 0.4, 5);
          const p = this.player();
          if (Math.hypot(b.x - p.x, b.z - p.z) < 18) sfx.bombThud(0.4);
        }
      } else b.vy = 0;
      b.y = b.r;
      const fr = Math.exp(-2.3 * dt);
      b.vx *= fr;
      b.vz *= fr;
    }
    // penghalang atap
    for (const bl of this.world.blockers) {
      if (b.y > bl.h + b.r) continue;
      const dx = b.x - bl.x;
      const dz = b.z - bl.z;
      const d = Math.hypot(dx, dz);
      const mr = bl.r + b.r;
      if (d < mr && d > 1e-4) {
        const nx = dx / d;
        const nz = dz / d;
        b.x = bl.x + nx * mr;
        b.z = bl.z + nz * mr;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.vx -= nx * vn * 1.5;
          b.vz -= nz * vn * 1.5;
        }
      }
    }
    // sisa kecepatan: bom yang dilempar tetap "panas" selama masih cepat
    const spH = Math.hypot(b.vx, b.vz);
    if (b.thrown && spH < 3 && b.y <= b.r + 0.05) b.thrown = false;
    b.g.position.set(b.x, b.y, b.z);
    b.g.rotation.set(0, 0, 0);
    if (spH > 1) b.g.rotation.set(this.time * spH * 0.4, 0, this.time * spH * 0.3);
    // penanda ledakan di tanah
    const R = b.blast;
    if (onRoof && b.y < 3) {
      b.tele.visible = true;
      b.tele.position.set(b.x, 0.045, b.z);
      b.tele.scale.set(R, 1, R);
      const u = urg;
      const flick = Math.sin(this.time * (8 + 22 * u)) > 0 ? 0.08 : 0;
      b.teleDisc.opacity = 0.1 + 0.34 * u * u + flick * u;
      b.teleRing.opacity = 0.5 + 0.5 * u;
      const c = u > 0.55 ? 0xff2b2b : 0xffa530;
      b.teleDisc.color.setHex(c);
      b.teleRing.color.setHex(c);
    } else b.tele.visible = false;

    if (b.fuse <= 0) {
      this.explode(b);
      return;
    }
    if (!onRoof && b.y < -40) {
      // jatuh ke bawah gedung: meledak jauh di bawah
      if (!this.fast) {
        const p = this.player();
        if (Math.hypot(b.x - p.x, b.z - p.z) < 60) sfx.bombThud(0.25);
      }
      this.killBomb(b);
    }
  }

  private landBomb(b: Bomb) {
    b.state = 'free';
    b.y = b.r;
    b.vx = rand(-1.4, 1.4);
    b.vz = rand(-1.4, 1.4);
    b.vy = 5.4;
    b.g.position.set(b.tx, b.y, b.tz);
    this.particles.spawn(b.tx, 0.2, b.tz, 0xf1e9d6, 10, 4.5, 2, 0.2, 0.55, 6, 1.2);
    this.particles.spawn(b.tx, 0.2, b.tz, 0xffffff, 4, 3, 3, 0.12, 0.4, 8);
    const p = this.player();
    const dp = Math.hypot(b.tx - p.x, b.tz - p.z);
    if (!this.fast) {
      sfx.bombThud(clamp(1 - dp / 30, 0.25, 1));
      if (dp < 16) this.shake = Math.max(this.shake, 0.22 * (1 - dp / 16));
    }
    // gelombang kejut pendaratan
    for (const c of this.cats) {
      if (!c.alive || c.falling || c.y > 1.2) continue;
      const dx = c.x - b.tx;
      const dz = c.z - b.tz;
      const d = Math.hypot(dx, dz);
      if (d < 2.4) this.knock(c, dx, dz, 9, 0.7, 5, null);
    }
  }

  private explode(b: Bomb) {
    const R = b.blast;
    const cx = b.x;
    const cy = b.y;
    const cz = b.z;
    const owner = b.owner;
    const holder = b.holder;
    const type = b.type;
    const pw = b.power;
    this.killBomb(b);
    this.blasts.boom(cx, cy, cz, R);
    this.particles.spawn(cx, cy, cz, 0xffd25a, 22, R * 1.9, 9, 0.2, 0.7, 10);
    this.particles.spawn(cx, cy, cz, 0xff7a2e, 18, R * 1.5, 7, 0.26, 0.8, 8);
    this.particles.spawn(cx, cy + 0.6, cz, 0x5a5a66, 12, R * 0.75, 3.5, 0.5, 1.4, -1, 2.6);
    this.particles.spawn(cx, cy, cz, 0x8a8a96, 8, R * 1.3, 8, 0.16, 1.0, 14);
    const p = this.player();
    const dp = Math.hypot(cx - p.x, cz - p.z);
    if (!this.fast) {
      sfx.bigBoom(clamp(1.15 - dp / 40, 0.35, 1.2));
      this.shake = Math.max(this.shake, clamp(1.2 - dp / (R * 2.6), 0.1, 1.1));
      if (dp < R * 1.1 && p.alive) this.flash = Math.max(this.flash, 1);
    }

    for (const c of this.cats) {
      if (!c.alive || c.falling) continue;
      let dx = c.x - cx;
      let dz = c.z - cz;
      const d = Math.hypot(dx, dz);
      const dy = c.y + 1.2 - cy;
      if (d > R || Math.abs(dy) > 4) continue;
      if (d < 0.35) {
        const a = Math.random() * TAU;
        dx = Math.cos(a);
        dz = Math.sin(a);
      }
      const k = 1 - d / R;
      let imp = (3.7 + 5.4 * Math.pow(k, 0.7)) * pw;
      let stun = 1.1 + 0.9 * k;
      if (c.diveT > 0) {
        imp *= 0.45;
        stun *= 0.6;
      }
      this.knock(c, dx, dz, imp, stun, 5.6 + 3 * k, owner, true);
      void holder;
    }
    // bom lain terdorong, ledakan beruntun
    for (const o of this.bombs) {
      if (o.state !== 'free' && o.state !== 'falling') continue;
      if (o.state === 'falling') continue;
      const dx = o.x - cx;
      const dz = o.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const m = d || 1;
      const k = 1 - d / R;
      o.vx += (dx / m) * (6 + 9 * k);
      o.vz += (dz / m) * (6 + 9 * k);
      o.vy = Math.max(o.vy, 6 + 4 * k);
      if (d < R * 0.4) o.fuse = Math.min(o.fuse, 0.35);
    }
    if (type === 'cluster') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.random() * 0.6;
        const m = this.freeBomb();
        if (!m) break;
        const d = BT.mini;
        m.state = 'free';
        m.type = 'mini';
        m.r = d.r;
        m.blast = d.blast;
        m.power = d.power;
        m.x = cx;
        m.y = Math.max(cy, 0.6) + 0.4;
        m.z = cz;
        m.vx = Math.cos(a) * rand(6, 10);
        m.vz = Math.sin(a) * rand(6, 10);
        m.vy = rand(7, 10);
        m.fuse = m.fuseMax = rand(1.6, 2.3);
        m.owner = owner;
        m.holder = null;
        m.thrown = false;
        m.age = 0;
        m.tickT = 0.1;
        m.mat.color.setHex(d.body);
        m.stripe.color.setHex(d.accent);
        m.scaleG.scale.setScalar(d.r);
        m.g.visible = true;
        m.g.position.set(m.x, m.y, m.z);
        m.tele.visible = false;
      }
    }
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
    if (!f.alive || f.falling) return;
    if (!force && f.hitCd > 0) return;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m;
    dz /= m;
    f.vx += dx * impulse;
    f.vz += dz * impulse;
    if (f.y < 0.8 || force) {
      f.vy = Math.max(f.vy, lift);
      f.grounded = false;
    }
    f.ragdoll = Math.max(f.ragdoll, stun);
    f.hitCd = force ? 0.15 : 0.35;
    f.shoveT = -1;
    f.diveT = 0;
    if (f.carry) this.dropBomb(f);
    if (by && by !== f) {
      f.lastHit = by;
      f.lastHitT = this.time;
    }
    this.setFall(f, dx, dz, 1.45);
    f.tx.v += f.fallX * 7;
    f.tz.v += f.fallZ * 7;
    f.yawV = (Math.random() - 0.5) * 14;
    f.flailT = 0;
    if (f.isPlayer && !this.fast) this.shake = Math.max(this.shake, 0.6);
  }

  private doShove(f: Cat) {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    let hit = false;
    for (const o of this.cats) {
      if (o === f || !o.alive || o.falling) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.15 && Math.abs(o.y - f.y) < 1.5) {
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 11, 1.3, 4.5, f);
        this.particles.spawn(o.x, o.y + 1.3, o.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
        this.popup('💥 POW!', o.x, o.y + 2.6, o.z, '#ffe14d', 24);
        hit = true;
      }
    }
    // dorong bom juga
    for (const b of this.bombs) {
      if (b.state !== 'free' || b.holder) continue;
      const dx = b.x - f.x;
      const dz = b.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.6 && (dx * fx + dz * fz) / (d || 1) > 0) {
        b.vx += fx * 12;
        b.vz += fz * 12;
        b.vy = 4;
        b.owner = f;
        hit = true;
      }
    }
    if (hit) {
      sfx.punch();
      if (f.isPlayer) this.shake = Math.max(this.shake, 0.25);
    } else if (f.isPlayer) sfx.jump();
  }

  private startFall(f: Cat) {
    if (this.phase === 'playing') {
      f.place = this.contenders().length;
      f.surviveTime = this.playTime;
      this.aliveCount = Math.max(0, this.aliveCount - 1);
      if (f.lastHit && f.lastHit.alive && !f.lastHit.falling && this.time - f.lastHitT < 6) {
        f.lastHit.ko++;
        if (!this.fast) this.popup(`🎯 KO! ${f.lastHit.name} +1`, f.lastHit.x, f.lastHit.y + 3.8, f.lastHit.z, '#ffe14d', 24);
      }
      if (!this.fast) {
        this.banner = f.isPlayer ? '😵 KAMU JATUH!' : `${f.name} JATUH!`;
        this.bannerT = 1.5;
      }
    }
    f.falling = true;
    f.ragdoll = 99;
    f.carry && this.dropBomb(f);
    this.setFall(f, f.vx, f.vz, 1.3);
    f.tx.v += f.fallX * 4;
    f.tz.v += f.fallZ * 4;
    f.charging = false;
    f.faceYaw = null;
    if (!f.screamed) {
      f.screamed = true;
      if (!this.fast) {
        sfx.scream();
        this.popup('AAAAAA! 😱', f.x, 3, f.z, '#ff7a7a', f.isPlayer ? 34 : 22);
      }
    }
  }

  private eliminate(f: Cat) {
    if (f.out) return;
    f.out = true;
    f.alive = false;
    f.rig.root.visible = false;
  }

  private physics(f: Cat, dt: number) {
    f.shoveCd -= dt;
    f.diveCd -= dt;
    if (f.out) return;
    if (f.falling) {
      f.vy -= GRAV * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      f.vx *= Math.exp(-0.2 * dt);
      f.vz *= Math.exp(-0.2 * dt);
      if (f.y < -26) this.eliminate(f);
      return;
    }
    const inp = f.input;
    const live = this.phase === 'playing';
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

    if (inp.jump && f.grounded && !stunned && !diving && live) {
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
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded && live && !f.carry) {
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
    if (inp.shove && f.shoveCd <= 0 && !stunned && !diving && live && !f.carry) {
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
    const maxSp = f.charging ? 3.2 : f.carry ? 4.6 : 5.6;
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

    // arah hadap
    const sp = Math.hypot(f.vx, f.vz);
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else if (diving) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-30 * dt));
    } else if (f.faceYaw !== null) {
      f.yaw += angDiff(f.faceYaw, f.yaw) * (1 - Math.exp(-14 * dt));
    } else if (hasIn) {
      f.yaw += angDiff(Math.atan2(inp.mx, inp.mz), f.yaw) * (1 - Math.exp(-(f.charging ? 16 : 12) * dt));
    } else if (sp > 1.2) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-8 * dt));
    }

    f.x += f.vx * dt;
    f.z += f.vz * dt;

    // properti atap = penghalang (bisa dilompati yang pendek)
    if (!stunned && !diving) {
      for (const bl of this.world.blockers) {
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
          }
        }
      }
    }

    f.vy -= GRAV * dt;
    f.y += f.vy * dt;
    const onRoof = Math.abs(f.x) <= HALF + 0.15 && Math.abs(f.z) <= HALF + 0.15;
    if (onRoof && f.y <= 0 && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) {
        f.sq.v += Math.min(-f.vy, 14) * 0.45;
        if (-f.vy > 7) this.particles.spawn(f.x, 0.1, f.z, 0xe6dfd0, 5, 2, 1.5, 0.14, 0.4, 6);
      }
      f.y = 0;
      f.vy = 0;
      f.grounded = true;
    } else if (f.y > 0.001 || !onRoof) f.grounded = false;

    if (!onRoof && f.y < -0.02) this.startFall(f);
  }

  private collisions() {
    const F = this.cats;
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        const a = F[i];
        const b = F[j];
        if (!a.alive || !b.alive || a.falling || b.falling) continue;
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
          const sa = Math.hypot(a.vx, a.vz);
          const sb = Math.hypot(b.vx, b.vz);
          if (sa < sb) this.knock(a, -nx, -nz, 4, 0.9, 3.5, b);
          else this.knock(b, nx, nz, 4, 0.9, 3.5, a);
        }
      }
    }
    // bom vs kucing
    for (const bm of this.bombs) {
      if (bm.state !== 'free' || bm.holder) continue;
      for (const c of this.cats) {
        if (!c.alive || c.falling) continue;
        if (bm.y > c.y + 3.2 || bm.y < c.y - 0.3) continue;
        const dx = bm.x - c.x;
        const dz = bm.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = bm.r + 0.62;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const spB = Math.hypot(bm.vx, bm.vz);
        // bom yang dilempar kena lawan = meledak seketika
        if (bm.thrown && spB > 5.5 && (bm.owner !== c || bm.age > 0.6)) {
          this.explode(bm);
          break;
        }
        bm.x = c.x + nx * min;
        bm.z = c.z + nz * min;
        if (c.diveT > 0) {
          bm.vx = nx * 14 + c.vx * 0.5;
          bm.vz = nz * 14 + c.vz * 0.5;
          bm.vy = 4.5;
          bm.owner = c;
        } else {
          const vn = bm.vx * nx + bm.vz * nz - (c.vx * nx + c.vz * nz);
          if (vn < 0) {
            bm.vx -= nx * vn * 1.5;
            bm.vz -= nz * vn * 1.5;
          }
          bm.vx += nx * 1.2;
          bm.vz += nz * 1.2;
        }
      }
    }
  }

  private hitFx(f: Cat) {
    this.particles.spawn(f.x, f.y + 1.2, f.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
    this.popup('💥 BRAK!', f.x, f.y + 2.6, f.z, '#ffe14d', 24);
    sfx.punch();
  }

  // ---------- animasi ----------
  private animate(f: Cat, dt: number) {
    if (f.out) return;
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
    const diving = f.diveT > 0;

    if (stunned) {
      f.tx.step(f.fallX, 26, 3.2, dt);
      f.tz.step(f.fallZ, 26, 3.2, dt);
    } else {
      let tgx = clamp(lz * 0.055, -0.5, 0.5);
      const tgz = clamp(-lx * 0.05, -0.4, 0.4);
      if (diving) tgx = 1.3;
      if (f.charging) tgx -= f.charge * 0.28;
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
    if (f.carry) {
      aL = aR = f.charging ? -3.3 + f.charge * 0.5 : -2.85;
      zL = 0.22;
      zR = -0.22;
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
        f.flailT = 0.12 + Math.random() * 0.12;
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
    rig.ring.visible = f.y >= -0.08 && !f.falling && Math.abs(f.x) <= HALF && Math.abs(f.z) <= HALF;
    rig.ring.position.y = 0.05 - ry;
    rig.ring.scale.setScalar(1 + (f.isPlayer ? Math.sin(this.time * 5) * 0.05 : 0));
    rig.root.updateMatrixWorld(true);
  }

  // ---------- penanda lemparan ----------
  private updateMarker() {
    const me = this.player();
    const show = me.alive && !!me.carry && (this.phase === 'playing' || this.phase === 'countdown');
    this.markerRing.visible = show;
    if (!show) {
      this.dots.forEach((d) => (d.visible = false));
      return;
    }
    const power = Math.max(0.12, me.charging ? me.charge : 0.5);
    const yaw = me.yaw;
    const v = this.throwVel(me, power, yaw);
    const sx = me.x + Math.sin(yaw) * 0.6;
    const sz = me.z + Math.cos(yaw) * 0.6;
    const sy = me.y + 3.0;
    const l = this.traj(sx, sy, sz, v.vx, v.vy, v.vz, 0.5);
    this.markerRing.position.set(clamp(l.x, -40, 40), 0.07, clamp(l.z, -40, 40));
    const pulse = 1 + Math.sin(this.time * 10) * 0.08;
    this.markerRing.scale.setScalar(me.charging ? pulse * 1.15 : pulse);
    (this.markerRing.material as THREE.MeshBasicMaterial).color.setHex(me.charging ? 0xffe14d : 0xffffff);
    for (let i = 0; i < this.dots.length; i++) {
      const u = ((i + 1) / (this.dots.length + 1)) * l.t;
      const d = this.dots[i];
      d.visible = true;
      d.position.set(sx + v.vx * u, sy + v.vy * u - 0.5 * BOMB_G * u * u, sz + v.vz * u);
    }
  }

  // ---------- kamera ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.player();
    const aspect = this.w / this.h;
    const zoom = aspect < 0.8 ? 1.75 : aspect < 1.25 ? 1.35 : 1;
    const desired = this.tv;
    const look = this.tv2;
    let fov = 48;
    let kc = instant ? 1 : 1 - Math.exp(-4 * dt);
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = this.time * 0.18 + 0.6;
      desired.set(Math.sin(a) * 38 * zoom, 21 * zoom, Math.cos(a) * 38 * zoom);
      look.set(0, 1, 0);
      fov = 46;
    } else {
      // pantau area bermain; sedikit mengikuti pemain
      const fx = me.alive ? me.x * 0.1 : 0;
      const fz = me.alive ? me.z * 0.06 : 0;
      desired.set(fx, 29 * zoom, 27 * zoom + fz);
      look.set(fx * 1.2, 0.4, 0.8 + fz * 0.6);
      kc = instant ? 1 : 1 - Math.exp(-3 * dt);
    }
    this.camPos.lerp(desired, kc);
    this.camLook.lerp(look, kc);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (instant ? 1 : 1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.shake *= Math.exp(-5 * dt);
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
      if (f.out) {
        f.tag.style.display = 'none';
        continue;
      }
      const p = this.project(f.x, f.y + (f.carry ? 5.4 : 3.7), f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      f.tag.style.display = p.vis ? 'block' : 'none';
      let ind = '';
      if (f.carry) ind = `💣${Math.max(0, f.carry.fuse).toFixed(1)}`;
      else if (f.falling) ind = '😱';
      else if (f.ragdoll > 0) ind = '💫';
      else if (this.phase === 'results' && f.alive && this.aliveCount <= 1) ind = '👑';
      if (f.indEl.textContent !== ind) f.indEl.textContent = ind;
      f.indEl.style.color = f.carry && f.carry.fuse < 1.2 ? '#ff6b6b' : '#fff';
    }
  }

  popup(text: string, x: number, y: number, z: number, color: string, size = 24) {
    if (this.fast) return;
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
  private buildHud(): BombHudState {
    const me = this.player();
    const board: BBoardEntry[] = [...this.cats]
      .sort((a, b) => {
        const aa = a.alive && !a.falling;
        const ba = b.alive && !b.falling;
        if (aa !== ba) return aa ? -1 : 1;
        if (!aa && !ba) return a.place - b.place;
        return b.ko - a.ko;
      })
      .map((c) => ({
        id: c.idx,
        name: c.name,
        animal: c.def.id,
        color: c.color,
        isPlayer: c.isPlayer,
        alive: c.alive && !c.falling,
        place: c.place,
        ko: c.ko,
        time: c.surviveTime,
        carrying: !!c.carry,
      }));
    let danger = 0;
    if (me.alive && !me.falling) {
      for (const th of this.threatList) {
        if (th.b.holder === me) continue;
        const d = Math.hypot(me.x - th.x, me.z - th.z);
        const lim = th.shock ? 1.3 : 2.4;
        if (d < th.R - 0.9 && th.t < lim) danger = Math.max(danger, clamp(1 - th.t / lim, 0.2, 1));
      }
    }
    let nearBomb = false;
    if (me.alive && !me.carry) {
      for (const b of this.bombs) if (b.state === 'free' && !b.holder && b.y < 2.6 && Math.hypot(b.x - me.x, b.z - me.z) - b.r < 2.2) nearBomb = true;
    }
    const playing = this.phase === 'playing';
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! Hindari lingkaran merah — bom akan jatuh dari langit 💣';
    else if (playing) {
      if (!me.alive || me.falling) hint = 'Kamu jatuh dari gedung! 😵 Tonton atau lewati.';
      else if (me.ragdoll > 0) hint = 'Kamu terpental! 💫';
      else if (me.carry) hint = me.charging ? 'Lepas F untuk MELEMPAR!' : 'Tahan F → lepas untuk melempar bom ke lawan (atau keluar atap)!';
      else if (nearBomb) hint = 'Tekan F untuk AMBIL bom — lempar sebelum meledak!';
      else if (this.playTime < 8) hint = 'Jauhi tepi atap & lingkaran merah · F ambil/lempar bom · SHIFT terjang · E senggol';
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      go: playing && this.goT > 0,
      time: this.playTime,
      wave: Math.max(1, this.wave),
      waveProg: (this.playTime % WAVE_T) / WAVE_T,
      bombs: this.bombs.filter((b) => b.state !== 'dead').length,
      alive: this.aliveCount,
      board,
      me: {
        alive: me.alive && !me.falling,
        carrying: !!me.carry,
        fuseLeft: me.carry ? Math.max(0, me.carry.fuse) : 0,
        fuseFrac: me.carry ? clamp(me.carry.fuse / me.carry.fuseMax, 0, 1) : 0,
        charge: me.charge,
        charging: me.charging,
        diveReady: clamp(1 - me.diveCd / 1.7, 0, 1),
        shoveReady: clamp(1 - me.shoveCd / 0.75, 0, 1),
        stunned: me.ragdoll > 0,
        falling: me.falling,
        danger,
        nearBomb,
        edge: me.alive && !me.falling && (Math.abs(me.x) > HALF - 2.1 || Math.abs(me.z) > HALF - 2.1),
      },
      flash: this.flash,
      banner: this.banner,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }
}
