import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { buildPlaneWorld, createChevron, ENGINES, march, onDeck, PlaneWorld } from './planeWorld';

const GRAV = 30;
const WAVE_T = 9;
const MAX_TIME = 150;
const BASE_WIND = 2.2;
const GUST_A = 16;
const SLIDE_A = 52;
const TAU = Math.PI * 2;

export type PPhase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
export type AlertKind = 'gust' | 'bank' | 'bird' | 'turb';

export interface PBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  isPlayer: boolean;
  alive: boolean;
  place: number;
  ko: number;
  time: number;
  bracing: boolean;
}

export interface PlaneHudState {
  phase: PPhase;
  countdown: number;
  go: boolean;
  time: number;
  wave: number;
  waveProg: number;
  alive: number;
  board: PBoardEntry[];
  me: {
    alive: boolean;
    falling: boolean;
    stunned: boolean;
    stamina: number;
    bracing: boolean;
    locked: boolean;
    diveReady: number;
    shoveReady: number;
    edge: boolean;
    push: number;
  };
  wind: { x: number; z: number; str: number; pending: boolean; dirX: number; dirZ: number };
  alert: { kind: AlertKind; text: string; sub: string; dx: number; dz: number; bank: number; t: number } | null;
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

interface PInput {
  mx: number;
  mz: number;
  brace: boolean;
  jump: boolean;
  dive: boolean;
  shove: boolean;
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

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
  brace = false;
  braceLock = false;
  stamina = 1;
  braceYaw = 0;
  pushX = 0;
  pushZ = 0;

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

  input: PInput = { mx: 0, mz: 0, brace: false, jump: false, dive: false, shove: false };
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  ai = { alert: 0, noise: 0, noiseT: 0, wanderT: 0, wx: 0, wz: 0, shoveT: 0, jumpT: 0, jumped: false, braceFor: 0 };

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
    this.yaw = Math.PI;
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
    this.brace = false;
    this.braceLock = false;
    this.stamina = 1;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail]) {
      s.a = 0;
      s.v = 0;
    }
    this.input = { mx: 0, mz: 0, brace: false, jump: false, dive: false, shove: false };
    this.ai.alert = 0;
    this.ai.braceFor = 0;
    this.rig.root.visible = true;
  }
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number; grow: number }[] = [];
  constructor(parent: THREE.Object3D) {
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < 260; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
      m.visible = false;
      parent.add(m);
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

// ---------- burung raksasa ----------
function buildBird() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb9c6d8, roughness: 0.6 });
  const sp = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    o.scale.set(sx, sy, sz);
    return o;
  };
  const body = sp(1, white, 0.75, 0.62, 1.55);
  const head = sp(0.55, white);
  head.position.set(0, 0.28, 1.45);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xffa81f, roughness: 0.5 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.2, 2.15);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), grey);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.05, -1.9);
  tail.scale.x = 1.8;
  g.add(body, head, beak, tail);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(s * 0.3, 0.45, 1.85);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    brow.position.set(s * 0.3, 0.62, 1.85);
    brow.rotation.z = s * 0.5;
    g.add(eye, brow);
  }
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.6, 0.2, 0.2);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.7);
    sh.lineTo(3.4, 0.2);
    sh.lineTo(3.1, -0.45);
    sh.lineTo(0, -0.9);
    sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    geo.rotateX(Math.PI / 2);
    if (s < 0) geo.scale(-1, 1, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }));
    const tip = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a4a66, side: THREE.DoubleSide }));
    tip.scale.set(0.3, 1, 0.55);
    tip.position.set(s * 2.35, 0.012, -0.05);
    w.add(m, tip);
    g.add(w);
    wings.push(w);
  }
  g.scale.setScalar(1.15);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  g.visible = false;
  return { g, wings };
}

class Bird {
  ph = 0; // 0 idle, 1 warn, 2 fly
  t = 0;
  warn = 1.4;
  axis: 'x' | 'z' = 'x';
  lane = 0;
  dir = 1;
  s = -34;
  speed = 25;
  g: THREE.Group;
  wings: THREE.Group[];
  band: THREE.Mesh;
  bandMat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  lo = -20;
  hi = 20;
  constructor(parent: THREE.Object3D) {
    const b = buildBird();
    this.g = b.g;
    this.wings = b.wings;
    parent.add(this.g);
    this.tex = createChevron();
    this.bandMat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0xff3030, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.band = new THREE.Mesh(geo, this.bandMat);
    this.band.visible = false;
    this.band.renderOrder = 3;
    parent.add(this.band);
  }
}

interface Alert {
  kind: AlertKind;
  text: string;
  sub: string;
  dx: number;
  dz: number;
  bank: number;
  t: number;
}

export class PlaneEngine {
  private container: HTMLElement;
  private onHud: (h: PlaneHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: PlaneWorld;
  private particles: Particles;
  private cats: Cat[] = [];
  private birds: Bird[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;
  private fast = false;

  phase: PPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private playTime = 0;
  private wave = 0;
  private goT = 0;
  private banner = '';
  private bannerT = 0;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;
  private endT = 0;
  private aliveCount = 4;
  private alert: Alert | null = null;

  // event director
  private gust = { ph: 0, t: 0, warn: 1.5, dur: 2.6, dx: 0, dz: 1, str: 1, e: 0 };
  private bank = { ph: 0, t: 0, warn: 1.3, dur: 2.6, dir: 1, ang: 0.3, e: 0 };
  private turb = { ph: 0, t: 0 };
  private evT = 4.5;
  private lastType = '';
  private bankNow = 0;
  private windX = 0;
  private windZ = BASE_WIND;
  private turbShake = 0;

  private keys = new Set<string>();
  private pend = { jump: false, dive: false, shove: false };
  private braceHeld = false;
  private touchBrace = false;
  private joy = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 40, 34);
  private camLook = new THREE.Vector3(0, 0, 1);
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();

  constructor(container: HTMLElement, onHud: (h: PlaneHudState) => void) {
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

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1600);
    this.world = buildPlaneWorld(this.scene, PLAYER_COLORS);
    this.particles = new Particles(this.world.group);
    for (let i = 0; i < 4; i++) this.birds.push(new Bird(this.world.group));
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
    sfx.engineOff();
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
    sfx.engineOn();
    this.resetAll();
    this.phase = 'countdown';
    this.phaseT = 3.2;
    this.lastCount = 4;
  }
  toMenu() {
    sfx.engineOff();
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
  setTouchBrace(v: boolean) {
    sfx.resume();
    this.touchBrace = v;
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
  private curPhase(): PPhase {
    return this.phase;
  }
  /** loncat ke hasil akhir (dipakai setelah pemain jatuh) */
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
    this.braceHeld = false;
  };
  private onMouseDown = (e: MouseEvent) => {
    sfx.resume();
    if (e.button === 0) this.braceHeld = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.braceHeld = false;
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
      this.world.group.remove(c.rig.root);
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
      this.world.group.add(c.rig.root);
      this.overlay.appendChild(c.tag);
      this.cats.push(c);
    });
    this.resetAll();
  }

  private resetAll() {
    for (const c of this.cats) c.reset();
    for (const b of this.birds) {
      b.ph = 0;
      b.g.visible = false;
      b.band.visible = false;
    }
    this.gust.ph = 0;
    this.gust.e = 0;
    this.bank.ph = 0;
    this.bank.e = 0;
    this.turb.ph = 0;
    this.bankNow = 0;
    this.windX = 0;
    this.windZ = BASE_WIND;
    this.evT = 4.5;
    this.lastType = '';
    this.playTime = 0;
    this.wave = 0;
    this.goT = 0;
    this.banner = '';
    this.bannerT = 0;
    this.alert = null;
    this.aliveCount = this.cats.length;
    this.endT = 0;
    this.turbShake = 0;
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

    this.runEvents(dt, playing);
    for (const c of this.cats) {
      if (c.isPlayer) this.readPlayerInput(c, playing);
      else this.botThink(c, dt, playing);
      c.celebrate = this.phase === 'menu' || (this.phase === 'results' && c.alive && this.contenders().length <= 1);
      c.hitCd -= dt;
      this.physics(c, dt, playing);
    }
    this.collisions();
    this.updateBirds(dt);
    this.checkEnd();

    if (this.fast) return;
    const gustK = this.gust.ph === 2 ? this.gust.e : this.gust.ph === 1 ? 0.12 : 0;
    const swayRoll = Math.sin(this.time * 0.55) * 0.028 + Math.sin(this.time * 31) * 0.012 * this.turbShake;
    this.world.update(this.time, dt, {
      bank: this.bankNow + swayRoll,
      pitch: Math.sin(this.time * 0.7) * 0.014 + Math.sin(this.time * 27) * 0.01 * this.turbShake,
      bob: Math.sin(this.time * 1.1) * 0.18 + Math.sin(this.time * 23) * 0.25 * this.turbShake,
      gustK,
      dirX: this.gust.ph >= 1 ? this.gust.dx : 0,
      dirZ: this.gust.ph >= 1 ? this.gust.dz : 1,
    });
    this.world.group.updateMatrixWorld(true);
    for (const c of this.cats) this.animate(c, dt);
    this.particles.update(dt);
    this.updateCamera(dt, false);
    this.updateLabels();
    this.turbShake = Math.max(0, this.turbShake - dt * 1.6);
    if (this.alert) {
      this.alert.t -= dt;
      if (this.alert.t <= 0) this.alert = null;
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    if (this.phase !== 'menu' && this.phase !== 'results') sfx.engineSet(0.18 + gustK * 0.5, false);
    else sfx.engineOff();
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
      this.playTime += dt;
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

  private checkEnd() {
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
    this.gust.ph = 0;
    this.gust.e = 0;
    this.bank.ph = 0;
    this.bank.e = 0;
    this.turb.ph = 0;
    for (const b of this.birds) {
      b.ph = 0;
      b.g.visible = false;
      b.band.visible = false;
    }
    this.alert = null;
    this.banner = left.length === 1 && left[0].isPlayer ? '👑 KAMU MENANG!' : left.length ? `${left[0].name} MENANG!` : 'SEMUA JATUH!';
    this.bannerT = 3;
    sfx.horn();
  }

  // ---------- event: angin, miring, burung, turbulensi ----------
  private setAlert(kind: AlertKind, text: string, sub: string, dx = 0, dz = 0, bank = 0) {
    this.alert = { kind, text, sub, dx, dz, bank, t: 2.2 };
  }

  private runEvents(dt: number, playing: boolean) {
    const g = this.gust;
    if (g.ph === 1) {
      g.t += dt;
      g.e = 0;
      if (g.t >= g.warn) {
        g.ph = 2;
        g.t = 0;
        sfx.windRush(1);
        if (!this.fast) this.shake = Math.max(this.shake, 0.3);
      }
    } else if (g.ph === 2) {
      g.t += dt;
      g.e = clamp(Math.min(g.t / 0.45, (g.dur - g.t) / 0.6), 0, 1);
      if (g.t >= g.dur) {
        g.ph = 0;
        g.e = 0;
      }
    }
    const b = this.bank;
    if (b.ph === 1) {
      b.t += dt;
      b.e = 0;
      if (b.t >= b.warn) {
        b.ph = 2;
        b.t = 0;
        sfx.creak();
      }
    } else if (b.ph === 2) {
      b.t += dt;
      b.e = clamp(Math.min(b.t / 0.8, (b.dur - b.t) / 0.9), 0, 1);
      if (b.t >= b.dur) {
        b.ph = 0;
        b.e = 0;
      }
    }
    const tb = this.turb;
    if (tb.ph === 1) {
      tb.t += dt;
      this.turbShake = Math.max(this.turbShake, clamp(tb.t / 0.9, 0, 1) * 0.55);
      if (tb.t >= 0.9) {
        tb.ph = 0;
        this.turbShake = 1;
        this.shake = Math.max(this.shake, 1);
        sfx.rumble();
        for (const c of this.cats) {
          if (!c.alive || c.falling || !c.grounded || c.brace) continue;
          c.vy = rand(7, 9);
          c.grounded = false;
          c.vx += rand(-3, 3);
          c.vz += rand(-3, 3);
          c.sq.v -= 3;
        }
      }
    }
    // arah & kekuatan angin/miring
    this.windX = g.dx * GUST_A * g.str * g.e;
    this.windZ = BASE_WIND + g.dz * GUST_A * g.str * g.e;
    const tgt = b.dir * b.ang * b.e;
    this.bankNow += (tgt - this.bankNow) * (1 - Math.exp(-4 * dt));

    // gelombang
    if (!playing) return;
    const w = clamp(1 + Math.floor(this.playTime / WAVE_T), 1, 14);
    if (w !== this.wave) {
      this.wave = w;
      if (w > 1) {
        this.banner = `🌪️ GELOMBANG ${w}!`;
        this.bannerT = 2;
        sfx.waveUp();
      }
    }
    this.evT -= dt;
    if (this.evT <= 0) this.spawnEvent();
  }

  private spawnEvent() {
    const w = this.wave;
    this.evT = Math.max(1.5, 6.2 - 0.5 * w) * rand(0.85, 1.2);
    const pool: string[] = ['gust'];
    if (w >= 2) pool.push('bank', 'gust');
    if (w >= 3) pool.push('bird', 'bird');
    if (w >= 4) pool.push('turb');
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (type === this.lastType) type = pool[Math.floor(Math.random() * pool.length)];
    if (type === 'gust' && this.gust.ph !== 0) type = w >= 3 ? 'bird' : '';
    if (type === 'bank' && this.bank.ph !== 0) type = w >= 3 ? 'bird' : 'gust';
    if (type === 'turb' && this.turb.ph !== 0) type = 'bird';
    if (type === 'gust' && this.gust.ph !== 0) type = '';
    if (!type) {
      this.evT = 1.2;
      return;
    }
    this.lastType = type;
    if (type === 'gust') {
      const g = this.gust;
      g.ph = 1;
      g.t = 0;
      g.warn = Math.max(1.1, 1.6 - 0.05 * w);
      g.dur = Math.min(4.6, 2.4 + 0.16 * w);
      g.str = clamp(0.75 + 0.18 * w, 0.75, 3.2);
      let dx = 0;
      let dz = 1;
      const r = Math.random();
      if (w >= 3 && r < 0.35) {
        const s = Math.random() < 0.5 ? -1 : 1;
        dx = s * 0.9;
        dz = 0.42;
      } else if (w >= 6 && r > 0.88) dz = -1;
      const m = Math.hypot(dx, dz);
      g.dx = dx / m;
      g.dz = dz / m;
      this.setAlert('gust', 'ANGIN KENCANG!', 'Tahan F / klik untuk BERPEGANGAN', g.dx, g.dz);
      sfx.alarm();
    } else if (type === 'bank') {
      const b = this.bank;
      b.ph = 1;
      b.t = 0;
      b.warn = 1.3;
      b.dur = 2.7;
      b.ang = clamp(0.2 + 0.03 * w, 0.2, 0.5);
      b.dir = Math.random() < 0.5 ? -1 : 1;
      this.setAlert('bank', `PESAWAT MIRING KE ${b.dir > 0 ? 'KANAN' : 'KIRI'}!`, 'Lari ke sisi yang naik / berpegangan', 0, 0, b.dir);
      sfx.alarm();
    } else if (type === 'turb') {
      this.turb.ph = 1;
      this.turb.t = 0;
      this.setAlert('turb', 'TURBULENSI!', 'Berpegangan supaya tidak terpental', 0, 0);
      sfx.alarm();
    } else {
      this.launchBird();
      if (w >= 4 && Math.random() < 0.45) this.launchBird();
      if (w >= 7) this.launchBird();
    }
  }

  private launchBird() {
    const b = this.birds.find((x) => x.ph === 0);
    if (!b) return;
    const axis: 'x' | 'z' = this.wave >= 4 && Math.random() < 0.4 ? 'z' : 'x';
    const live = this.cats.filter((c) => c.alive && !c.falling);
    let lane = axis === 'x' ? rand(-12, 15) : rand(-13, 13);
    if (live.length && Math.random() < 0.65) {
      const c = live[Math.floor(Math.random() * live.length)];
      lane = (axis === 'x' ? c.z : c.x) + rand(-0.9, 0.9);
    }
    b.axis = axis;
    b.lane = lane;
    b.dir = Math.random() < 0.5 ? -1 : 1;
    b.ph = 1;
    b.t = 0;
    b.warn = Math.max(1.0, 1.5 - 0.04 * this.wave);
    b.s = -34;
    b.speed = Math.min(34, 24 + this.wave * 0.9);
    // rentang dek pada lajur ini
    let lo = 99;
    let hi = -99;
    for (let u = -26; u <= 26; u += 0.5) {
      const x = axis === 'x' ? u : lane;
      const z = axis === 'x' ? lane : u;
      if (onDeck(x, z)) {
        lo = Math.min(lo, u);
        hi = Math.max(hi, u);
      }
    }
    if (hi < lo) {
      b.ph = 0;
      return;
    }
    b.lo = lo - 0.6;
    b.hi = hi + 0.6;
    const len = b.hi - b.lo;
    const mid = (b.hi + b.lo) / 2;
    b.band.visible = true;
    b.band.scale.set(axis === 'x' ? len : 3.0, 1, axis === 'x' ? 3.0 : len);
    b.band.position.set(axis === 'x' ? mid : lane, 0.045, axis === 'x' ? lane : mid);
    b.tex.repeat.set(len / 3, 1);
    b.band.rotation.y = axis === 'x' ? (b.dir > 0 ? 0 : Math.PI) : b.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.setAlert('bird', 'BURUNG MENYAMBAR!', 'LOMPAT (SPASI) saat burung lewat!', axis === 'x' ? b.dir : 0, axis === 'z' ? b.dir : 0);
    sfx.alarm();
  }

  private updateBirds(dt: number) {
    for (const b of this.birds) {
      if (b.ph === 1) {
        b.t += dt;
        b.bandMat.opacity = 0.35 + 0.35 * (Math.sin(b.t * 16) > 0 ? 1 : 0.4) * (0.5 + 0.5 * (b.t / b.warn));
        b.tex.offset.x -= dt * 2.4;
        if (b.t >= b.warn) {
          b.ph = 2;
          b.s = -34;
          b.g.visible = true;
          if (!this.fast) sfx.birdCry(1);
        }
      } else if (b.ph === 2) {
        const prev = b.s;
        b.s += b.speed * dt;
        const along = b.s * b.dir;
        const px = b.axis === 'x' ? along : b.lane;
        const pz = b.axis === 'x' ? b.lane : along;
        b.g.position.set(px, 1.0 + Math.sin(this.time * 9) * 0.1, pz);
        b.g.rotation.y = b.axis === 'x' ? (b.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : b.dir > 0 ? 0 : Math.PI;
        const fl = Math.sin(this.time * 14) * 0.7;
        b.wings[0].rotation.z = fl;
        b.wings[1].rotation.z = -fl;
        b.bandMat.opacity = Math.max(0.1, b.bandMat.opacity - dt * 0.5);
        const dirx = b.axis === 'x' ? b.dir : 0;
        const dirz = b.axis === 'z' ? b.dir : 0;
        for (const c of this.cats) {
          if (!c.alive || c.falling || c.y > 0.85 || c.hitCd > 0) continue;
          const cl = b.axis === 'x' ? c.z : c.x;
          const ca = b.axis === 'x' ? c.x : c.z;
          if (Math.abs(cl - b.lane) > 1.35) continue;
          const a0 = prev * b.dir;
          const lo = Math.min(a0, along) - 1.25;
          const hi = Math.max(a0, along) + 1.25;
          if (ca >= lo && ca <= hi) {
            this.knock(c, dirx, dirz, 11, 1.5, 6, null);
            this.particles.spawn(c.x, c.y + 1.5, c.z, 0xffffff, 12, 5, 4, 0.2, 0.6, 5);
            this.popup('🐦 PLAK!', c.x, c.y + 3.2, c.z, '#ffffff', 24);
          }
        }
        if (b.s > 34) {
          b.ph = 0;
          b.g.visible = false;
          b.band.visible = false;
        }
      }
    }
  }

  // ---------- input pemain ----------
  private readPlayerInput(f: Cat, playing: boolean) {
    const i = f.input;
    const pend = this.pend;
    if (!playing || !f.alive || f.falling) {
      i.mx = i.mz = 0;
      i.brace = i.jump = i.dive = i.shove = false;
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
    i.mx = ux;
    i.mz = -uy;
    i.brace = k.has('KeyF') || this.braceHeld || this.touchBrace;
    i.jump = pend.jump;
    i.dive = pend.dive;
    i.shove = pend.shove;
    pend.jump = pend.dive = pend.shove = false;
  }

  // ---------- gaya dorong pada kucing ----------
  private push(f: Cat, out: { x: number; z: number }, wash = true) {
    let ax = this.windX;
    let az = this.windZ;
    for (const e of wash ? ENGINES : []) {
      const dx = f.x - e.x;
      if (Math.abs(dx) < 2.3 && f.z > e.zl - 0.5) {
        const fade = clamp(1 - (f.z - e.zl) / 14, 0.25, 1);
        az += 8 * fade;
        ax += Math.sign(dx || 1) * 1.4 * fade;
      }
    }
    out.x = ax;
    out.z = az;
    return out;
  }

  // ---------- bot ----------
  private botThink(f: Cat, dt: number, playing: boolean) {
    this.botDecide(f, dt, playing);
    const inp = f.input;
    if (!playing || !f.alive || f.falling || f.ragdoll > 0 || f.brace) return;
    const m = Math.hypot(inp.mx, inp.mz);
    if (m < 0.05) return;
    const ux = inp.mx / m;
    const uz = inp.mz / m;
    if (march(f.x, f.z, ux, uz, 2.4) >= 2.2) return;
    // jangan melangkah ke tepi: cari arah lain yang aman
    let bx = 0;
    let bz = 0;
    let bd = -1;
    for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = ux * c - uz * s;
      const dz = ux * s + uz * c;
      const dd = march(f.x, f.z, dx, dz, 2.4);
      if (dd > bd) {
        bd = dd;
        bx = dx;
        bz = dz;
      }
    }
    if (bd >= 2.2) {
      inp.mx = bx * m;
      inp.mz = bz * m;
    } else {
      inp.mx = 0;
      inp.mz = 0;
    }
  }

  private botDecide(f: Cat, dt: number, playing: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.brace = inp.jump = inp.dive = inp.shove = false;
    inp.mx = inp.mz = 0;
    f.faceYaw = null;
    if (!playing || !f.alive || f.falling || f.ragdoll > 0) return;
    const sk = f.skill;
    const p = { x: 0, z: 0 };
    this.push(f, p, false);
    let px = p.x;
    let pz = p.z;
    const slide = SLIDE_A * Math.sin(this.bankNow);
    px += slide;
    let forecast = false;
    if (this.gust.ph === 1) {
      px += this.gust.dx * GUST_A * this.gust.str * 0.85;
      pz += this.gust.dz * GUST_A * this.gust.str * 0.85;
      forecast = true;
    }
    if (this.bank.ph === 1) {
      px += SLIDE_A * Math.sin(this.bank.dir * this.bank.ang) * 0.85;
      forecast = true;
    }
    const pm = Math.hypot(px, pz);
    const dx = px / (pm || 1);
    const dz = pz / (pm || 1);
    const dEdge = march(f.x, f.z, dx, dz, 30);
    const risky = pm > 4.2 && dEdge < 5.5 + pm * 0.5;
    const realPush = this.gust.ph === 2 || Math.abs(this.bankNow) > 0.08;

    // ancaman burung
    let birdMove = false;
    for (const b of this.birds) {
      if (b.ph === 0) continue;
      const cl = b.axis === 'x' ? f.z : f.x;
      const ca = b.axis === 'x' ? f.x : f.z;
      const lane = cl - b.lane;
      if (Math.abs(lane) > 2.6) continue;
      const tt = b.ph === 1 ? b.warn - b.t + (ca * b.dir + 34) / b.speed : (ca * b.dir - b.s * 1) / b.speed;
      if (tt < -0.3 || tt > 2.4) continue;
      const side = lane >= 0 ? 1 : -1;
      const mx = b.axis === 'x' ? 0 : side;
      const mz = b.axis === 'x' ? side : 0;
      if (b.ph === 2 && tt > 0 && tt < 0.38 && !ai.jumped && Math.random() < 0.55 + sk * 0.4 && f.grounded) {
        inp.jump = true;
        ai.jumped = true;
      }
      if (tt < 1.7 && ai.alert >= 0.1 + (1 - sk) * 0.4) {
        inp.mx = mx;
        inp.mz = mz;
        birdMove = true;
      }
      ai.alert += dt;
    }
    if (!birdMove && !f.brace) ai.jumped = false;

    // turbulensi: berpegangan
    if (this.turb.ph === 1 && f.stamina > 0.45 && !f.braceLock) {
      inp.brace = true;
      return;
    }

    if (risky || (forecast && pm > 6 && dEdge < 9)) {
      ai.alert += dt;
      const react = 0.08 + (1 - sk) * 0.5;
      if (ai.alert >= react) {
        ai.noiseT -= dt;
        if (ai.noiseT <= 0) {
          ai.noiseT = 0.4;
          ai.noise = (Math.random() - 0.5) * (1 - sk) * 1.3;
        }
        const c = Math.cos(ai.noise);
        const s = Math.sin(ai.noise);
        const ux = -dx * c + dz * s;
        const uz = -dx * s - dz * c;
        const canBrace = f.stamina > 0.12 && !f.braceLock;
        if (realPush && dEdge < 3.2 + pm * 0.35 && canBrace) {
          inp.brace = true;
          ai.braceFor = 0.25;
          return;
        }
        if (realPush && f.brace && ai.braceFor > 0 && canBrace && dEdge < 6 + pm * 0.4) {
          ai.braceFor -= dt;
          inp.brace = true;
          return;
        }
        if (!birdMove) {
          inp.mx = ux;
          inp.mz = uz;
        }
        return;
      }
    } else ai.alert = birdMove ? ai.alert : 0;
    if (birdMove) return;

    // jahili lawan di dekat tepi
    ai.shoveT -= dt;
    if (ai.shoveT <= 0) {
      ai.shoveT = 0.35;
      for (const o of this.cats) {
        if (o === f || !o.alive || o.falling) continue;
        const d = Math.hypot(o.x - f.x, o.z - f.z);
        const ang = Math.atan2(o.x - f.x, o.z - f.z);
        const eDir = march(o.x, o.z, Math.sin(ang), Math.cos(ang), 6);
        if (d < 1.9 && eDir < 4.8 && f.shoveCd <= 0 && Math.random() < 0.35 * sk + 0.12) {
          f.faceYaw = ang;
          inp.shove = true;
          return;
        }
      }
    }

    // diam di tengah dek, agak melawan angin dasar
    ai.wanderT -= dt;
    if (ai.wanderT <= 0) {
      ai.wanderT = rand(1.8, 3.4);
      ai.wx = rand(-1.8, 1.8);
      ai.wz = rand(-1.8, 1.8);
    }
    const gx = f.spawn.x * 0.3 + ai.wx * 0.7;
    const gz = f.spawn.z * 0.55 - 1.5 + ai.wz;
    const ddx = gx - f.x;
    const ddz = gz - f.z;
    const d = Math.hypot(ddx, ddz);
    if (d > 0.7) {
      inp.mx = (ddx / d) * clamp(d / 2, 0.3, 1);
      inp.mz = (ddz / d) * clamp(d / 2, 0.3, 1);
    }
  }

  // ---------- fisika ----------
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
    f.vy = Math.max(f.vy, lift);
    f.grounded = false;
    f.ragdoll = Math.max(f.ragdoll, stun);
    f.hitCd = force ? 0.15 : 0.35;
    f.shoveT = -1;
    f.diveT = 0;
    f.brace = false;
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
        const resist = o.brace ? 0.45 : 1;
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 11 * resist, 1.3 * resist, 4.5, f, o.brace ? false : false);
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
    if (this.phase === 'playing') {
      f.place = this.contenders().length;
      f.surviveTime = this.playTime;
      this.aliveCount = Math.max(0, this.aliveCount - 1);
      if (f.lastHit && f.lastHit.alive && !f.lastHit.falling && this.time - f.lastHitT < 6) {
        f.lastHit.ko++;
        if (!this.fast) this.popup(`🎯 KO! ${f.lastHit.name} +1`, f.lastHit.x, f.lastHit.y + 3.8, f.lastHit.z, '#ffe14d', 24);
      }
      if (!this.fast) {
        this.banner = f.isPlayer ? '😵 KAMU TERBANG JATUH!' : `${f.name} TERBANG JATUH!`;
        this.bannerT = 1.5;
      }
    }
    f.falling = true;
    f.ragdoll = 99;
    f.brace = false;
    this.setFall(f, f.vx, f.vz, 1.3);
    f.tx.v += f.fallX * 4;
    f.tz.v += f.fallZ * 4;
    f.faceYaw = null;
    if (!f.screamed) {
      f.screamed = true;
      if (!this.fast) {
        sfx.scream();
        this.popup('AAAAAA! 😱', f.x, 3, f.z, '#ff7a7a', f.isPlayer ? 34 : 22);
      }
    }
  }

  private physics(f: Cat, dt: number, live: boolean) {
    f.shoveCd -= dt;
    f.diveCd -= dt;
    if (f.out) return;
    if (f.falling) {
      f.vy -= GRAV * dt;
      f.y += f.vy * dt;
      f.vz += (this.windZ + 6) * dt;
      f.vx += this.windX * dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (f.y < -50) {
        f.out = true;
        f.alive = false;
        f.rig.root.visible = false;
      }
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

    // berpegangan
    const canBrace = playing && f.grounded && !stunned && !diving && f.shoveT < 0;
    const want = inp.brace && canBrace && !f.braceLock && f.stamina > 0;
    if (want && !f.brace && f.isPlayer) sfx.grab();
    f.brace = want;
    if (want) {
      f.stamina -= dt * 0.36;
      if (f.stamina <= 0) {
        f.stamina = 0;
        f.braceLock = true;
      }
    } else {
      f.stamina = Math.min(1, f.stamina + dt * (f.grounded ? 0.2 : 0.1));
      if (f.braceLock && f.stamina > 0.35) f.braceLock = false;
    }

    if (inp.jump && f.grounded && !stunned && !diving && playing && !f.brace) {
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
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded && playing && !f.brace) {
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
    if (inp.shove && f.shoveCd <= 0 && !stunned && !diving && playing && !f.brace) {
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
    const maxSp = f.brace ? 1.3 : 5.6;
    let dvx = inp.mx * maxSp;
    let dvz = inp.mz * maxSp;
    if (stunned || diving) {
      dvx = 0;
      dvz = 0;
    }
    let k: number;
    if (f.grounded) k = diving ? 0.5 : stunned ? 2.1 : f.brace ? 10 : hasIn ? 8 : 3.6;
    else k = stunned || diving ? 0.2 : hasIn ? 1.8 : 0.4;
    const a = 1 - Math.exp(-k * dt);
    f.vx += (dvx - f.vx) * a;
    f.vz += (dvz - f.vz) * a;

    // angin, hembusan baling-baling, dan kemiringan pesawat
    if (live) {
      const pu = { x: 0, z: 0 };
      this.push(f, pu);
      const air = f.grounded ? 1 : 0.3;
      const br = f.brace ? 0.16 : 1;
      const sl = SLIDE_A * Math.sin(this.bankNow) * (f.grounded ? (f.brace ? 0.45 : 1) : 0.3);
      f.pushX = pu.x * air * br + sl;
      f.pushZ = pu.z * air * br;
      f.vx += f.pushX * dt;
      f.vz += f.pushZ * dt;
    }

    // arah hadap
    const sp = Math.hypot(f.vx, f.vz);
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else if (diving) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-30 * dt));
    } else if (f.brace) {
      const wx = this.windX - SLIDE_A * Math.sin(this.bankNow) * 0.0;
      const wz = this.windZ;
      f.braceYaw = Math.atan2(-wx - SLIDE_A * Math.sin(this.bankNow), -wz);
      f.yaw += angDiff(f.braceYaw, f.yaw) * (1 - Math.exp(-14 * dt));
    } else if (f.faceYaw !== null) {
      f.yaw += angDiff(f.faceYaw, f.yaw) * (1 - Math.exp(-14 * dt));
    } else if (hasIn) {
      f.yaw += angDiff(Math.atan2(inp.mx, inp.mz), f.yaw) * (1 - Math.exp(-12 * dt));
    } else if (sp > 1.4) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-6 * dt));
    }

    f.x += f.vx * dt;
    f.z += f.vz * dt;

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
    const on = onDeck(f.x, f.z);
    if (on && f.y <= 0 && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) {
        f.sq.v += Math.min(-f.vy, 14) * 0.45;
        if (-f.vy > 7) this.particles.spawn(f.x, 0.1, f.z, 0xe6eef8, 5, 2, 1.5, 0.14, 0.4, 6);
      }
      f.y = 0;
      f.vy = 0;
      f.grounded = true;
    } else if (f.y > 0.001 || !on) f.grounded = false;
    if (!on && f.y < -0.02) this.startFall(f);
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
          this.knock(b, nx, nz, b.brace ? 5 : 10, 1.7, 4.5, a);
          this.hitFx(b);
        } else if (b.diveT > 0 && a.diveT <= 0 && rv > 4) {
          this.knock(a, -nx, -nz, a.brace ? 5 : 10, 1.7, 4.5, b);
          this.hitFx(a);
        } else if (rv > 7.5) {
          const sa = Math.hypot(a.vx, a.vz);
          const sb = Math.hypot(b.vx, b.vz);
          if (sa < sb) this.knock(a, -nx, -nz, 4, 0.9, 3.5, b);
          else this.knock(b, nx, nz, 4, 0.9, 3.5, a);
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
      if (f.brace) tgx = 0.85;
      // condong melawan angin
      const lwx = f.pushX * cs - f.pushZ * sn;
      const lwz = f.pushX * sn + f.pushZ * cs;
      const lean = !f.brace && !diving ? clamp(-lwz * 0.012, -0.25, 0.25) : 0;
      const leanZ = !f.brace && !diving ? clamp(lwx * 0.012, -0.25, 0.25) : 0;
      const kk = f.standT > 0 ? 34 : 75;
      const cc = f.standT > 0 ? 6 : 7;
      f.tx.step(tgx + lean, kk, cc, dt, -lacF * 0.025);
      f.tz.step(tgz + leanZ, kk, cc, dt, lacX * 0.025);
    }
    f.tx.a = clamp(f.tx.a, -2, 2);
    f.tz.a = clamp(f.tz.a, -2, 2);
    f.sq.step(f.brace ? 0.28 : 0, 120, 9, dt);
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
    if (f.brace) {
      aL = aR = -0.55;
      zL = 1.05;
      zR = -1.05;
      lL = -0.5;
      lR = 0.5;
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
    // ekor berkibar ditiup angin
    f.tail.step(0, 40, 3, dt, lacX * 0.05 + clamp(f.pushX, -20, 20) * 0.02);

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
    rig.tail.rotation.y = f.tail.a + Math.sin(this.time * (f.brace ? 22 : 6) + f.idx) * (f.brace ? 0.3 : 0.15) * Math.min(1, sp + (f.brace ? 1 : 0));
    rig.ring.visible = f.y >= -0.08 && !f.falling && onDeck(f.x, f.z);
    rig.ring.position.y = 0.05 - ry;
    rig.ring.scale.setScalar(1 + (f.isPlayer ? Math.sin(this.time * 5) * 0.05 : 0));
    rig.root.updateMatrixWorld(true);
  }

  // ---------- kamera ----------
  private updateCamera(dt: number, instant: boolean) {
    const aspect = this.w / this.h;
    const zoom = aspect < 0.8 ? 1.75 : aspect < 1.25 ? 1.32 : 1;
    const desired = this.tv;
    const look = this.tv2;
    let fov = 50;
    let kc = instant ? 1 : 1 - Math.exp(-3 * dt);
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = this.time * 0.2 + 0.7;
      desired.set(Math.sin(a) * 46 * zoom, 19 * zoom, Math.cos(a) * 46 * zoom);
      look.set(0, -1, 1);
      fov = 48;
    } else {
      desired.set(0, 35 * zoom, 26.5 * zoom);
      look.set(0, 0, 1.4);
    }
    this.camPos.lerp(desired, kc);
    this.camLook.lerp(look, kc);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (instant ? 1 : 1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.shake *= Math.exp(-5 * dt);
    const gk = this.gust.ph === 2 ? this.gust.e * 0.16 : 0;
    const sh = this.shake * 0.7 + this.turbShake * 0.5 + gk;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  private project(x: number, y: number, z: number) {
    const v = this.world.group.localToWorld(this.tv3.set(x, y, z)).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, vis: v.z < 1 && v.z > -1 };
  }

  private updateLabels() {
    for (const f of this.cats) {
      if (f.out) {
        f.tag.style.display = 'none';
        continue;
      }
      const p = this.project(f.x, f.y + 3.7, f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      f.tag.style.display = p.vis ? 'block' : 'none';
      let ind = '';
      if (f.falling) ind = '😱';
      else if (f.ragdoll > 0) ind = '💫';
      else if (f.brace) ind = '🫸';
      else if (this.phase === 'results' && f.alive && this.contenders().length <= 1) ind = '👑';
      if (f.indEl.textContent !== ind) f.indEl.textContent = ind;
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
  private buildHud(): PlaneHudState {
    const me = this.player();
    const board: PBoardEntry[] = [...this.cats]
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
        bracing: c.brace,
      }));
    const playing = this.phase === 'playing';
    const edge =
      me.alive &&
      !me.falling &&
      Math.min(march(me.x, me.z, 1, 0, 2.2), march(me.x, me.z, -1, 0, 2.2), march(me.x, me.z, 0, 1, 2.2), march(me.x, me.z, 0, -1, 2.2)) < 1.7;
    const pushMag = Math.hypot(me.pushX, me.pushZ);
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! Bertahanlah di atas pesawat — angin & burung akan datang ✈️';
    else if (playing) {
      if (!me.alive || me.falling) hint = 'Kamu jatuh dari pesawat! 😵 Tonton atau lewati.';
      else if (me.ragdoll > 0) hint = 'Kamu terpental! 💫';
      else if (me.brace) hint = '🫸 Berpegangan erat! Stamina menipis…';
      else if (this.playTime < 9) hint = 'F / klik TAHAN = berpegangan (tahan angin) · SPASI lompat · E senggol · SHIFT terjang';
      else if (this.gust.ph === 1) hint = 'ANGIN KENCANG! Tahan F / klik sekarang!';
    }
    const gd = this.gust.ph >= 1 ? this.gust : null;
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      go: playing && this.goT > 0,
      time: this.playTime,
      wave: Math.max(1, this.wave),
      waveProg: (this.playTime % WAVE_T) / WAVE_T,
      alive: this.contenders().length,
      board,
      me: {
        alive: me.alive && !me.falling,
        falling: me.falling,
        stunned: me.ragdoll > 0,
        stamina: me.stamina,
        bracing: me.brace,
        locked: me.braceLock,
        diveReady: clamp(1 - me.diveCd / 1.7, 0, 1),
        shoveReady: clamp(1 - me.shoveCd / 0.75, 0, 1),
        edge,
        push: clamp(pushMag / 22, 0, 1),
      },
      wind: {
        x: gd ? gd.dx : 0,
        z: gd ? gd.dz : 1,
        str: this.gust.ph === 2 ? this.gust.e : 0,
        pending: this.gust.ph === 1,
        dirX: this.windX,
        dirZ: this.windZ,
      },
      alert: this.alert ? { ...this.alert } : null,
      banner: this.banner,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }
}
