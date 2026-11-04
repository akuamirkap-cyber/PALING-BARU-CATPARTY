import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { createWorld, DOCK_R, PLAYER_COLORS, Spot, WATER_Y, waterHeight, World } from './world';
import { Catch, pickFish, Reel, RANKS } from './fish';
import { SharkHooks, SharkSystem, SharkTarget } from './sharks';
import { sfx } from './audio';

export const ROUND_TIME = 90;
export const FRENZY_TIME = 15;

export type Phase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
export type FState = 'idle' | 'charging' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'landing' | 'cooldown';

export interface BoardEntry {
  id: number;
  name: string;
  emoji: string;
  animal: string;
  color: string;
  score: number;
  count: number;
  isPlayer: boolean;
  rank: number;
  best: string;
  bestRank: string;
  bestColor: string;
  heaviest: number;
  bites: number;
}

export interface HudState {
  phase: Phase;
  countdown: number;
  timeLeft: number;
  frenzy: boolean;
  go: boolean;
  board: BoardEntry[];
  me: {
    fs: FState;
    power: number;
    hold: boolean;
    inSpot: boolean;
    stunned: boolean;
    swimming: boolean;
    leaping: boolean;
    sharkAlert: number;
    edge: boolean;
    heaviest: number;
    bites: number;
    biteLeft: number;
    punchReady: number;
    diveReady: number;
    reel: null | { zone: number; size: number; fish: number; progress: number; emoji: string; name: string; thrash: boolean; inZone: boolean; rank: string; rankName: string; rankColor: string; weight: number; points: number };
  };
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
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
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

interface Input {
  mx: number;
  mz: number;
  hold: boolean;
  punch: boolean;
  jump: boolean;
  dive: boolean;
}

class Fighter {
  idx: number;
  name: string;
  color: string;
  colorHex: number;
  def: AnimalDef;
  rig: Rig;
  isPlayer: boolean;
  skill: number;
  spot: Spot;

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
  grounded = true;
  falling = false;
  ragdoll = 0;
  standT = 0;
  swim = 0;
  hitCd = 0;
  fallX = 0;
  fallZ = 0;
  punchT = -1;
  punchCd = 0;
  punchHit = false;
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
  rodPitch = new Spring();
  rodBend = new Spring();

  input: Input = { mx: 0, mz: 0, hold: false, punch: false, jump: false, dive: false };
  prevHold = false;

  fs: FState = 'idle';
  stateT = 0;
  ft = 0;
  power = 0;
  powDir = 1;
  castPower = 0;
  castT = 0;
  landing = new THREE.Vector3();
  bobber = new THREE.Vector3();
  bobFrom = new THREE.Vector3();
  tipPos = new THREE.Vector3();
  catchFrom = new THREE.Vector3();
  fish: Catch | null = null;
  reel: Reel | null = null;
  reelClick = 0;
  ripT = 0;

  score = 0;
  count = 0;
  best: Catch | null = null;
  heaviest = 0;
  bites = 0;
  leapT = -1;
  leapDur = 1.4;
  leapApex = 6;
  leapSpin = 1;
  leapFrom = new THREE.Vector3();
  sharkImm = 0;

  // visual extras
  bobberObj: THREE.Group;
  lineObj: THREE.Line;
  lineGeo: THREE.BufferGeometry;
  lineMat: THREE.LineBasicMaterial;
  fishObj: THREE.Group;
  fishMat: THREE.MeshStandardMaterial;
  shadowObj: THREE.Mesh;
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  // AI
  ai = {
    mode: 'fish' as 'fish' | 'hunt',
    aggroT: rand(11, 19),
    huntT: 0,
    target: null as Fighter | null,
    wait: rand(0.5, 1.5),
    charging: false,
    holdT: 0,
    lastFs: 'idle' as FState,
    react: 0,
    miss: false,
    ctlT: 0,
    noise: 0,
    holdState: false,
  };

  constructor(idx: number, def: AnimalDef, name: string, isPlayer: boolean, skill: number, spot: Spot) {
    this.idx = idx;
    this.def = def;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.spot = spot;
    this.color = PLAYER_COLORS[idx];
    this.colorHex = parseInt(this.color.slice(1), 16);
    this.rig = buildAnimal(def, this.colorHex);

    // bobber
    this.bobberObj = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: this.colorHex, roughness: 0.4 }),
    );
    const bot = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    );
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    ant.position.y = 0.3;
    this.bobberObj.add(top, bot, ant);
    this.bobberObj.visible = false;

    // line
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 21), 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.lineObj = new THREE.Line(this.lineGeo, this.lineMat);
    this.lineObj.frustumCulled = false;
    this.lineObj.visible = false;

    // ikan terbang
    this.fishObj = new THREE.Group();
    this.fishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), this.fishMat);
    fb.scale.set(1.3, 0.8, 0.5);
    const ft = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), this.fishMat);
    ft.rotation.z = Math.PI / 2;
    ft.position.x = -0.65;
    ft.scale.z = 0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.35, 0.1, 0.2);
    const eye2 = eye.clone();
    eye2.position.z = -0.2;
    this.fishObj.add(fb, ft, eye, eye2);
    this.fishObj.visible = false;

    // bayangan ikan di air
    const sg = new THREE.CircleGeometry(1, 20);
    sg.rotateX(-Math.PI / 2);
    this.shadowObj = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x08384f, transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadowObj.scale.set(0.8, 1, 0.4);
    this.shadowObj.visible = false;

    // label
    this.tag = document.createElement('div');
    this.tag.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;text-align:center;will-change:transform;white-space:nowrap;';
    this.indEl = document.createElement('div');
    this.indEl.style.cssText = 'font-size:30px;height:36px;line-height:36px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35));';
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
    this.yaw = Math.atan2(this.spot.dx, this.spot.dz);
    this.yawV = 0;
    this.grounded = true;
    this.falling = false;
    this.ragdoll = 0;
    this.standT = 0;
    this.swim = 0;
    this.hitCd = 0;
    this.punchT = -1;
    this.punchCd = 0;
    this.diveT = 0;
    this.diveCd = 0;
    this.celebrate = false;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail, this.rodPitch, this.rodBend]) {
      s.a = 0;
      s.v = 0;
    }
    this.rodPitch.a = -0.95;
    this.fs = 'idle';
    this.stateT = 0;
    this.reel = null;
    this.fish = null;
    this.score = 0;
    this.count = 0;
    this.best = null;
    this.heaviest = 0;
    this.bites = 0;
    this.leapT = -1;
    this.sharkImm = 0;
    this.prevHold = false;
    this.input = { mx: 0, mz: 0, hold: false, punch: false, jump: false, dive: false };
    this.bobberObj.visible = false;
    this.lineObj.visible = false;
    this.fishObj.visible = false;
    this.shadowObj.visible = false;
    this.ai.mode = 'fish';
    this.ai.aggroT = rand(11, 19);
    this.ai.wait = rand(0.5, 1.5);
    this.ai.charging = false;
  }

  get fishingActive() {
    return this.fs === 'charging' || this.fs === 'casting' || this.fs === 'waiting' || this.fs === 'bite' || this.fs === 'reeling';
  }
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 6, 5);
    for (let i = 0; i < 160; i++) {
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
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.5 + Math.random() * 0.8);
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
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, life: 0, max: 1, size: 1 });
    }
  }
  spawn(x: number, z: number, size = 1.5, t = 0) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = 0.9;
    p.size = size;
    p.m.position.set(x, waterHeight(x, z, t) + 0.04, z);
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

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const cols = ['#ff4d6d', '#ffffff', '#ffd23f', '#ffffff', '#2ec4ff', '#ffffff'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = cols[i];
    g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

export class GameEngine {
  private container: HTMLElement;
  private onHud: (h: HudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: World;
  private particles: Particles;
  private ripples: Ripples;
  private sharks: SharkSystem;
  private sharkAlert = 0;
  private banner = '';
  private bannerT = 0;
  private fighters: Fighter[] = [];
  private ball = { mesh: new THREE.Mesh(), x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, r: 0.75, wet: 0 };
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;

  phase: Phase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private timeLeft = ROUND_TIME;
  private goT = 0;
  private frenzy = false;
  private lastSec = 99;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;

  private keys = new Set<string>();
  private pend = { punch: false, jump: false, dive: false };
  private mouseHold = false;
  private touchHold = false;
  private joy = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 10, 20);
  private camLook = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(container: HTMLElement, onHud: (h: HudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;filter:saturate(1.16) contrast(1.04) brightness(1.02);';
    container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.world = createWorld(this.scene);
    this.particles = new Particles(this.scene);
    this.ripples = new Ripples(this.scene);
    this.sharks = new SharkSystem(this.scene, 3);

    // bola pantai
    const bm = new THREE.Mesh(new THREE.SphereGeometry(this.ball.r, 24, 18), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35 }));
    bm.castShadow = true;
    this.ball.mesh = bm;
    this.scene.add(bm);

    this.setupFighters(this.playerAnimal);
    this.resetBall();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    container.addEventListener('pointerdown', this.onPointerDown);
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
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('contextmenu', this.onCtx);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------- API publik ----------
  setPlayerAnimal(id: string) {
    this.playerAnimal = id;
    this.setupFighters(id);
  }

  start() {
    sfx.resume();
    this.fighters.forEach((f) => f.reset());
    this.resetBall();
    this.phase = 'countdown';
    this.phaseT = 3.0;
    this.lastCount = 4;
    this.timeLeft = ROUND_TIME;
    this.frenzy = false;
    this.lastSec = 99;
    this.goT = 0;
    this.sharks.reset();
    this.banner = '';
    this.bannerT = 0;
  }

  toMenu() {
    this.fighters.forEach((f) => f.reset());
    this.resetBall();
    this.sharks.reset();
    this.phase = 'menu';
  }

  toggleMute() {
    sfx.muted = !sfx.muted;
  }

  setJoy(x: number, y: number) {
    this.joy.x = x;
    this.joy.y = y;
  }
  setTouchHold(v: boolean) {
    sfx.resume();
    this.touchHold = v;
  }
  touchPunch() {
    this.pend.punch = true;
  }
  touchJump() {
    this.pend.jump = true;
  }
  touchDive() {
    this.pend.dive = true;
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    sfx.resume();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyJ' || e.code === 'KeyF') this.pend.punch = true;
    if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pend.jump = true;
    if (e.code === 'KeyL' || e.code === 'KeyE') this.pend.dive = true;
    if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.mouseHold = false;
  };
  private onPointerDown = (e: PointerEvent) => {
    sfx.resume();
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) this.mouseHold = true;
    if (e.button === 2) this.pend.punch = true;
  };
  private onPointerUp = () => {
    this.mouseHold = false;
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
  private setupFighters(animalId: string) {
    for (const f of this.fighters) {
      this.scene.remove(f.rig.root, f.bobberObj, f.lineObj, f.fishObj, f.shadowObj);
      f.tag.remove();
    }
    this.fighters = [];
    const pd = ANIMALS.find((a) => a.id === animalId) ?? ANIMALS[0];
    const others = ANIMALS.filter((a) => a.id !== pd.id).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const skills = [0.5, 0.64, 0.76];
    const defs = [pd, others[0], others[1], others[2]];
    defs.forEach((d, i) => {
      const f = new Fighter(i, d, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1], this.world.spots[i]);
      this.scene.add(f.rig.root, f.bobberObj, f.lineObj, f.fishObj, f.shadowObj);
      this.overlay.appendChild(f.tag);
      this.fighters.push(f);
    });
  }

  private resetBall() {
    const b = this.ball;
    b.x = -6.4;
    b.z = 4.6;
    b.y = 6;
    b.vx = b.vy = b.vz = 0;
    b.wet = 0;
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
    this.world.update(this.time);
    this.updatePhase(dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }

    const live = this.phase === 'countdown' || this.phase === 'playing';
    for (const f of this.fighters) {
      if (f.isPlayer) this.readPlayerInput(f, live);
      else this.botThink(f, dt, live);
      f.celebrate = this.phase === 'menu' || (this.phase === 'results' && f === this.winner());
      f.hitCd -= dt;
      f.sharkImm -= dt;
      this.physics(f, dt);
    }
    this.collisions();
    this.updateBall(dt);
    for (const f of this.fighters) {
      this.animate(f, dt);
      this.fishing(f, dt);
    }
    this.updateSharks(dt);

    // pad pulse
    this.fighters.forEach((f, i) => {
      const pad = this.world.pads[i];
      const m = pad.material as THREE.MeshBasicMaterial;
      m.opacity = 0.4 + Math.sin(this.time * 4 + i) * 0.1 + (f.isPlayer ? 0.12 : 0);
    });

    this.particles.update(dt);
    this.ripples.update(dt);
    this.updateCamera(dt, false);
    this.updateLabels();
    this.onHud(this.buildHud());
  }

  private winner() {
    return this.ranking()[0];
  }

  private ranking() {
    return [...this.fighters].sort((a, b) => b.score - a.score || (b.best?.weight ?? 0) - (a.best?.weight ?? 0));
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
          this.timeLeft = ROUND_TIME;
          this.goT = 1.4;
          sfx.go();
        }
        break;
      }
      case 'playing': {
        this.timeLeft -= dt;
        this.goT -= dt;
        if (!this.frenzy && this.timeLeft <= FRENZY_TIME) {
          this.frenzy = true;
          sfx.horn();
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
        }
        break;
      }
    }
  }

  // ---------- input pemain ----------
  private readPlayerInput(f: Fighter, live: boolean) {
    const i = f.input;
    const pend = this.pend;
    if (!live) {
      i.mx = i.mz = 0;
      i.hold = false;
      i.punch = i.jump = i.dive = false;
      pend.punch = pend.jump = pend.dive = false;
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
    const s = f.spot;
    i.mx = uy * s.dx + ux * -s.dz;
    i.mz = uy * s.dz + ux * s.dx;
    i.hold = k.has('Space') || this.mouseHold || this.touchHold;
    i.punch = pend.punch;
    i.jump = pend.jump;
    i.dive = pend.dive;
    pend.punch = pend.jump = pend.dive = false;
  }

  // ---------- bot ----------
  private botThink(f: Fighter, dt: number, live: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.punch = inp.jump = inp.dive = false;
    inp.hold = false;
    inp.mx = inp.mz = 0;

    let gx = f.spot.x;
    let gz = f.spot.z;
    const playing = this.phase === 'playing';

    if (playing) {
      ai.aggroT -= dt;
      if (ai.mode === 'fish' && ai.aggroT <= 0 && f.ragdoll <= 0 && f.swim <= 0) {
        ai.aggroT = rand(9, 17);
        if (Math.random() < 0.55) {
          // targetkan pemain yg skornya tertinggi / pemain
          const rank = this.ranking().filter((o) => o !== f && o.swim <= 0);
          const leader = rank[0];
          ai.target = Math.random() < 0.55 ? leader : this.fighters[0];
          if (ai.target === f || !ai.target) ai.target = rank[0];
          ai.mode = 'hunt';
          ai.huntT = 4;
        }
      }
    } else if (ai.mode === 'hunt') ai.mode = 'fish';

    if (ai.mode === 'hunt' && ai.target) {
      const t = ai.target;
      ai.huntT -= dt;
      gx = t.x;
      gz = t.z;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (t.swim > 0 || ai.huntT <= 0) ai.mode = 'fish';
      else if (d < 1.8 && f.punchCd <= 0 && f.ragdoll <= 0) {
        inp.punch = true;
        ai.mode = 'fish';
        ai.aggroT = rand(9, 17);
      }
    }

    if (live) {
      const dx = gx - f.x;
      const dz = gz - f.z;
      const d = Math.hypot(dx, dz);
      const stopD = ai.mode === 'hunt' ? 1.2 : 0.35;
      if (d > stopD) {
        const s = ai.mode === 'hunt' ? 1 : clamp(d / 1.2, 0.35, 1);
        inp.mx = (dx / d) * s;
        inp.mz = (dz / d) * s;
      }
      // jangan jalan ke luar dermaga sendiri
      const rr = Math.hypot(f.x, f.z);
      if (rr > DOCK_R - 1.2) {
        const nx = f.x / rr;
        const nz = f.z / rr;
        const dot = inp.mx * nx + inp.mz * nz;
        if (dot > 0) {
          inp.mx -= nx * dot;
          inp.mz -= nz * dot;
        }
      }
    }

    if (!playing) return;
    const inSpot = Math.hypot(f.x - f.spot.x, f.z - f.spot.z) < 1.4;
    if (f.fs !== ai.lastFs) {
      if (f.fs === 'cooldown' || f.fs === 'idle') ai.wait = rand(0.35, 1.1);
      if (f.fs === 'bite') {
        ai.react = lerp(0.85, 0.28, f.skill) + rand(0, 0.25);
        ai.miss = Math.random() < (1 - f.skill) * 0.28;
      }
      if (f.fs === 'reeling') ai.ctlT = 0;
      ai.lastFs = f.fs;
    }
    if (!inSpot || f.ragdoll > 0) return;

    switch (f.fs) {
      case 'idle':
        if (!ai.charging) {
          ai.wait -= dt;
          if (ai.wait <= 0) {
            ai.charging = true;
            ai.holdT = rand(0.12, 0.66);
          }
        }
        if (ai.charging) {
          inp.hold = true;
        }
        break;
      case 'charging':
        ai.holdT -= dt;
        if (ai.holdT > 0) inp.hold = true;
        else ai.charging = false;
        break;
      case 'bite':
        ai.react -= dt;
        if (ai.react <= 0 && !ai.miss) inp.hold = true;
        break;
      case 'reeling': {
        const r = f.reel;
        if (!r) break;
        ai.ctlT -= dt;
        if (ai.ctlT <= 0) {
          ai.ctlT = 0.09 + (1 - f.skill) * 0.25;
          ai.noise = (Math.random() * 2 - 1) * (1 - f.skill) * 0.3;
          const pred = r.center + r.zv * 0.22;
          ai.holdState = pred < r.fish + ai.noise;
        }
        inp.hold = ai.holdState;
        break;
      }
      default:
        ai.charging = false;
    }
  }

  // ---------- fisika karakter ----------
  private setFall(f: Fighter, dx: number, dz: number, mag: number) {
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const lz = dx * sn + dz * cs;
    const lx = dx * cs - dz * sn;
    const m = Math.hypot(lx, lz) || 1;
    f.fallX = (lz / m) * mag;
    f.fallZ = -(lx / m) * mag;
  }

  knock(f: Fighter, dx: number, dz: number, impulse: number, stun: number, lift = 3.5) {
    if (f.swim > 0 || f.leapT >= 0) return;
    if (f.hitCd > 0) return;
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
    f.punchT = -1;
    f.diveT = 0;
    this.setFall(f, dx, dz, 1.45);
    f.tx.v += f.fallX * 7;
    f.tz.v += f.fallZ * 7;
    f.yawV = (Math.random() - 0.5) * 12;
    f.flailT = 0;
    this.cancelFish(f, 'Tali putus! 💥');
    if (f.isPlayer) this.shake = Math.max(this.shake, 0.6);
  }

  private bump(f: Fighter, nx: number, nz: number, s: number) {
    const sn = Math.sin(f.yaw);
    const cs = Math.cos(f.yaw);
    const lz = nx * sn + nz * cs;
    const lx = nx * cs - nz * sn;
    f.tx.v += lz * s;
    f.tz.v += -lx * s;
  }

  private startPunch(f: Fighter) {
    f.punchT = 0;
    f.punchCd = 0.7;
    f.punchHit = false;
    // aim assist
    let best: Fighter | null = null;
    let bd = 3.2;
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    for (const o of this.fighters) {
      if (o === f || o.swim > 0 || o.leapT >= 0) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) {
        bd = d;
        best = o;
      }
    }
    if (best) f.yaw = Math.atan2(best.x - f.x, best.z - f.z);
    f.vx += Math.sin(f.yaw) * 3.4;
    f.vz += Math.cos(f.yaw) * 3.4;
  }

  private doPunch(f: Fighter) {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    let hit = false;
    for (const o of this.fighters) {
      if (o === f || o.swim > 0 || o.leapT >= 0) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2 && (dx * fx + dz * fz) / (d || 1) > 0.2 && Math.abs(o.y - f.y) < 1.5) {
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 10.5, 1.3, 4.2);
        this.particles.spawn(o.x, o.y + 1.3, o.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
        this.popup('💥 POW!', o.x, o.y + 2.6, o.z, '#ffe14d', 26);
        hit = true;
        f.vx -= fx * 1.2;
        f.vz -= fz * 1.2;
      }
    }
    const b = this.ball;
    const bdx = b.x - f.x;
    const bdz = b.z - f.z;
    const bd = Math.hypot(bdx, bdz);
    if (bd < 2.6 && (bdx * fx + bdz * fz) / (bd || 1) > 0.1) {
      b.vx += fx * 11;
      b.vz += fz * 11;
      b.vy = 4;
      hit = true;
    }
    if (hit) {
      sfx.punch();
      if (f.isPlayer) this.shake = Math.max(this.shake, 0.25);
    } else if (f.isPlayer) sfx.jump();
  }

  private physics(f: Fighter, dt: number) {
    f.punchCd -= dt;
    f.diveCd -= dt;
    if (f.leapT >= 0) {
      this.leapStep(f, dt);
      return;
    }
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

    if (f.diveT > 0) {
      f.diveT -= dt;
      if (f.diveT <= 0) {
        f.ragdoll = 0.75;
        this.setFall(f, f.vx, f.vz, 1.35);
        f.hitCd = 0.2;
      }
    }
    const diving = f.diveT > 0;

    // aksi
    if (inp.jump && f.grounded && !stunned && !diving) {
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
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded) {
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
      this.cancelFish(f, undefined);
      if (f.isPlayer) sfx.jump();
    }
    if (inp.punch && f.punchCd <= 0 && !stunned && !diving) this.startPunch(f);
    if (f.punchT >= 0) {
      f.punchT += dt;
      if (!f.punchHit && f.punchT >= 0.12) {
        f.punchHit = true;
        this.doPunch(f);
      }
      if (f.punchT > 0.42) f.punchT = -1;
    }

    // gerak (licin ala Gang Beasts: akselerasi + momentum)
    const fishing = f.fishingActive;
    const maxSp = fishing ? 3.0 : 5.3;
    const hasIn = Math.hypot(inp.mx, inp.mz) > 0.1;
    let dvx = inp.mx * maxSp;
    let dvz = inp.mz * maxSp;
    if (stunned || diving) {
      dvx = 0;
      dvz = 0;
    }
    let k: number;
    if (f.grounded) k = diving ? 0.5 : stunned ? 1.3 : hasIn ? 8 : 3.2;
    else k = stunned || diving ? 0.2 : hasIn ? 1.8 : 0.4;
    const a = 1 - Math.exp(-k * dt);
    f.vx += (dvx - f.vx) * a;
    f.vz += (dvz - f.vz) * a;

    // yaw
    const sp = Math.hypot(f.vx, f.vz);
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else {
      let target = f.yaw;
      const near = Math.hypot(f.x - f.spot.x, f.z - f.spot.z) < 2.2;
      if (diving) target = Math.atan2(f.vx, f.vz);
      else if ((fishing || f.fs === 'landing') && near) target = Math.atan2(f.spot.dx, f.spot.dz);
      else if (f.punchT >= 0) target = f.yaw;
      else if (sp > 0.8) target = Math.atan2(f.vx, f.vz);
      else if (hasIn) target = Math.atan2(inp.mx, inp.mz);
      f.yaw += angDiff(target, f.yaw) * (1 - Math.exp(-(diving ? 30 : 11) * dt));
    }

    // integrasi
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    // batang palem & istana pasir = penghalang
    for (const bl of this.world.blockers) {
      if (f.y > 3) continue;
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
    let dist = Math.hypot(f.x, f.z);

    // dinding dermaga (bawah permukaan)
    if (f.y < -0.08 && dist < DOCK_R + 0.25 && dist > 0.01) {
      const nx = f.x / dist;
      const nz = f.z / dist;
      f.x = nx * (DOCK_R + 0.25);
      f.z = nz * (DOCK_R + 0.25);
      const vn = f.vx * nx + f.vz * nz;
      if (vn < 0) {
        f.vx -= nx * vn;
        f.vz -= nz * vn;
      }
      dist = DOCK_R + 0.25;
    }
    const onDock = dist < DOCK_R && f.y >= -0.08;

    f.vy -= 30 * dt;
    f.y += f.vy * dt;

    if (onDock && f.y <= 0 && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) this.landed(f, -f.vy);
      f.y = 0;
      f.vy = 0;
      f.grounded = true;
      f.falling = false;
    } else if (f.y > 0.001 || !onDock) {
      f.grounded = false;
    }

    if (!onDock && f.y >= -0.08 && !f.falling && f.grounded === false && f.y <= 0.3 && f.vy <= 0.5) {
      // melewati tepi: jatuh!
      f.falling = true;
      f.ragdoll = Math.max(f.ragdoll, 2);
      this.setFall(f, f.vx, f.vz, 1.3);
      f.tx.v += f.fallX * 4;
      f.tz.v += f.fallZ * 4;
      this.cancelFish(f, 'Jatuh! 😱');
    }

    // masuk air
    if (!onDock && f.y < WATER_Y + 0.25 && f.vy < 0) {
      f.swim = 4.2;
      f.vx *= 0.25;
      f.vz *= 0.25;
      f.vy = 0;
      f.ragdoll = 0;
      f.falling = false;
      this.cancelFish(f, undefined);
      this.splash(f.x, f.z, 1.6);
      if (f.isPlayer) {
        this.popup('BYURR! 💦', f.x, 1.5, f.z, '#8fe3ff', 32);
        this.shake = Math.max(this.shake, 0.5);
      }
    }
  }

  private landed(f: Fighter, speed: number) {
    f.sq.v += Math.min(speed, 14) * 0.45;
    if (speed > 6) this.particles.spawn(f.x, 0.1, f.z, 0xf5e6c8, 5, 2, 1.5, 0.12, 0.4, 6);
    if (f.isPlayer && speed > 9) sfx.bump();
  }

  private swimStep(f: Fighter, dt: number) {
    f.swim -= dt;
    f.vx *= Math.exp(-3 * dt);
    f.vz *= Math.exp(-3 * dt);
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    const sd = Math.hypot(f.x, f.z);
    if (sd < DOCK_R + 0.9 && sd > 0.01) {
      f.x = (f.x / sd) * (DOCK_R + 0.9);
      f.z = (f.z / sd) * (DOCK_R + 0.9);
    }
    const ty = waterHeight(f.x, f.z, this.time) - 0.7 + Math.sin(this.time * 3 + f.idx) * 0.06;
    f.y += (ty - f.y) * (1 - Math.exp(-8 * dt));
    f.vy = 0;
    f.grounded = false;
    f.punchT = -1;
    f.diveT = 0;
    if (Math.random() < dt * 6) this.ripples.spawn(f.x + rand(-0.6, 0.6), f.z + rand(-0.6, 0.6), 1.2, this.time);
    if (Math.random() < dt * 8) this.particles.spawn(f.x, f.y + 1.2, f.z, 0xbdf2ff, 1, 1, 2, 0.1, 0.5);
    if (f.swim <= 0) {
      // loncat balik ke spot
      this.splash(f.x, f.z, 1.2);
      f.x = f.spot.x;
      f.z = f.spot.z;
      f.y = 5;
      f.vx = f.vz = 0;
      f.vy = 0;
      f.ragdoll = 0;
      f.yaw = Math.atan2(f.spot.dx, f.spot.dz);
      f.tx.a = f.tz.a = 0;
      f.hitCd = 0.5;
      f.standT = 0.4;
      this.splash(f.x, f.z, 0.8);
    }
  }

  private splash(x: number, z: number, big: number) {
    this.particles.spawn(x, WATER_Y + 0.1, z, 0xdff6ff, Math.floor(14 * big), 3.5 * big, 6 * big, 0.14, 0.8);
    this.particles.spawn(x, WATER_Y + 0.1, z, 0x7fdcff, Math.floor(8 * big), 2.5 * big, 4 * big, 0.12, 0.7);
    this.ripples.spawn(x, z, 1.8 * big, this.time);
    this.ripples.spawn(x, z, 1.2 * big, this.time);
    const near = this.fighters[0] ? Math.hypot(x - this.fighters[0].x, z - this.fighters[0].z) < 14 : false;
    if (near) sfx.splash(Math.min(1.4, big));
  }

  // ---------- tabrakan ----------
  private collisions() {
    const F = this.fighters;
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        const a = F[i];
        const b = F[j];
        if (a.swim > 0 || b.swim > 0 || a.leapT >= 0 || b.leapT >= 0) continue;
        if (Math.abs(a.y - b.y) > 1.3) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 1.15;
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
        if (rv > 2.5) {
          this.bump(a, -nx, -nz, rv * 0.7);
          this.bump(b, nx, nz, rv * 0.7);
          if ((a.isPlayer || b.isPlayer) && this.time - this.bumpAt > 0.2) {
            this.bumpAt = this.time;
            sfx.bump();
          }
        }
        if (a.diveT > 0 && b.diveT <= 0 && rv > 4) {
          this.knock(b, nx, nz, 9, 1.6, 4);
          this.hitFx(b);
        } else if (b.diveT > 0 && a.diveT <= 0 && rv > 4) {
          this.knock(a, -nx, -nz, 9, 1.6, 4);
          this.hitFx(a);
        } else if (rv > 7.5) {
          const sa = Math.hypot(a.vx, a.vz);
          const sb = Math.hypot(b.vx, b.vz);
          if (sa < sb) this.knock(a, -nx, -nz, 4, 0.9);
          else this.knock(b, nx, nz, 4, 0.9);
        }
      }
    }
  }

  private hitFx(f: Fighter) {
    this.particles.spawn(f.x, f.y + 1.2, f.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
    this.popup('💥 BRAK!', f.x, f.y + 2.6, f.z, '#ffe14d', 26);
    sfx.punch();
  }

  private updateBall(dt: number) {
    const b = this.ball;
    b.vy -= 22 * dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.y += b.vy * dt;
    let dist = Math.hypot(b.x, b.z);
    const onDock = dist < DOCK_R;

    if (onDock) {
      if (b.y <= b.r) {
        b.y = b.r;
        if (b.vy < -2) b.vy = -b.vy * 0.45;
        else b.vy = 0;
        const fr = Math.exp(-0.45 * dt);
        b.vx *= fr;
        b.vz *= fr;
      }
    } else {
      if (b.y < b.r - 0.1 && dist < DOCK_R + 0.8 && dist > 0.01) {
        const nx = b.x / dist;
        const nz = b.z / dist;
        b.x = nx * (DOCK_R + 0.8);
        b.z = nz * (DOCK_R + 0.8);
        dist = DOCK_R + 0.8;
      }
      const wy = waterHeight(b.x, b.z, this.time) + b.r * 0.4;
      if (b.y < wy) {
        if (b.wet <= 0) {
          this.splash(b.x, b.z, 1.1);
          b.wet = 2.6;
        }
        b.y += (wy - b.y) * (1 - Math.exp(-8 * dt));
        b.vy = 0;
        const fr = Math.exp(-2 * dt);
        b.vx *= fr;
        b.vz *= fr;
      }
      if (b.wet > 0) {
        b.wet -= dt;
        if (b.wet <= 0) {
          this.resetBall();
          this.particles.spawn(0, 6, 0, 0xffffff, 12, 3, 3, 0.15, 0.6, 2);
        }
      }
    }

    // vs karakter
    for (const f of this.fighters) {
      if (f.swim > 0 || f.leapT >= 0) continue;
      if (Math.abs(f.y - (b.y - b.r)) > 1.5) continue;
      const dx = b.x - f.x;
      const dz = b.z - f.z;
      const d = Math.hypot(dx, dz);
      const min = b.r + 0.58;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const pen = min - d;
      b.x += nx * pen * 0.7;
      b.z += nz * pen * 0.7;
      f.x -= nx * pen * 0.3;
      f.z -= nz * pen * 0.3;
      const rel = (b.vx - f.vx) * nx + (b.vz - f.vz) * nz; // <0 = saling mendekat
      if (rel < 0) {
        const j = -rel * 1.6;
        b.vx += nx * j * 0.62;
        b.vz += nz * j * 0.62;
        f.vx -= nx * j * 0.38;
        f.vz -= nz * j * 0.38;
        const toward = -(b.vx * nx + b.vz * nz);
        if (-rel > 2.5 && f.isPlayer) sfx.bump();
        if (toward > 5.5 && Math.hypot(b.vx, b.vz) > 6.5 && f.diveT <= 0) {
          this.knock(f, -b.vx, -b.vz, 6, 1.1);
          this.hitFx(f);
          b.vx *= 0.5;
          b.vz *= 0.5;
        }
      }
    }

    b.mesh.position.set(b.x, b.y, b.z);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.05 && b.y < b.r + 0.3) {
      const axis = this.tmpV.set(b.vz, 0, -b.vx).normalize();
      b.mesh.rotateOnWorldAxis(axis, (sp * dt) / b.r);
    }
  }

  // ---------- animasi rig ----------
  private animate(f: Fighter, dt: number) {
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

    // tilt badan
    if (swimming) {
      f.tx.step(0.15 + Math.sin(this.time * 2 + f.idx) * 0.1, 30, 4, dt);
      f.tz.step(Math.sin(this.time * 1.7 + f.idx) * 0.2, 30, 4, dt);
    } else if (stunned) {
      f.tx.step(f.fallX, 26, 3.2, dt);
      f.tz.step(f.fallZ, 26, 3.2, dt);
    } else {
      let tgx = clamp(lz * 0.055, -0.5, 0.5);
      const tgz = clamp(-lx * 0.05, -0.4, 0.4);
      if (diving) tgx = 1.3;
      if (f.fs === 'reeling') tgx += f.input.hold ? -0.24 : 0.1;
      if (f.fs === 'charging') tgx -= f.power * 0.16;
      if (f.fs === 'bite') tgx += Math.sin(this.time * 40) * 0.05;
      const k = f.standT > 0 ? 34 : 75;
      const c = f.standT > 0 ? 6 : 7;
      f.tx.step(tgx, k, c, dt, -lacF * 0.025);
      f.tz.step(tgz, k, c, dt, lacX * 0.025);
    }
    f.tx.a = clamp(f.tx.a, -2, 2);
    f.tz.a = clamp(f.tz.a, -2, 2);
    f.sq.step(0, 120, 9, dt);
    f.sq.a = clamp(f.sq.a, -0.5, 0.7);

    // anggota badan
    const walkAmp = Math.min(1, sp / 3.6) * (f.grounded ? 1 : 0.3);
    if (f.grounded) f.walk += sp * dt * 2.3;
    const sw = Math.sin(f.walk) * walkAmp;
    let aL = sw * 0.9;
    let aR = -sw * 0.9;
    let lL = -sw * 0.85;
    let lR = sw * 0.85;
    let kA = 95;
    let cA = 8;
    let kL = 120;
    let cL = 9;
    const fishingPose = f.fishingActive || f.fs === 'landing';

    if (!f.grounded && !stunned && !swimming) {
      aL = aR = f.vy > 0 ? -2.6 : -1.5;
      lL = lR = -0.5;
    }
    if (fishingPose) {
      aR = f.rodPitch.a * 1.25 - 0.1;
      aL = aR * 0.85;
      if (walkAmp > 0.2) {
        aR = aR * 0.9;
      }
    }
    if (f.celebrate) {
      aL = aR = -2.9 + Math.sin(this.time * 14 + f.idx) * 0.35;
      kA = 70;
    }
    if (f.punchT >= 0) {
      const ph = f.punchT;
      if (ph < 0.12) {
        aR = 0.9;
        aL = 0.5;
      } else if (ph < 0.3) {
        aR = -1.6;
        aL = -1.3;
      } else {
        aR = -0.3;
        aL = -0.2;
      }
      kA = 340;
      cA = 22;
    }
    if (diving) {
      aL = aR = -2.9;
      lL = lR = 0.7;
    }
    if (swimming) {
      aL = Math.sin(this.time * 8 + f.idx) * 1.0 - 1.9;
      aR = Math.sin(this.time * 8 + f.idx + 2) * 1.0 - 1.9;
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
      kA = 12;
      cA = 1.3;
      kL = 12;
      cL = 1.3;
    }
    f.armL.step(aL, kA, cA, dt, lacF * 0.035);
    f.armR.step(aR, kA, cA, dt, lacF * 0.035);
    f.legL.step(lL, kL, cL, dt);
    f.legR.step(lR, kL, cL, dt);

    // kepala & ekor (spring tertinggal = wobble)
    f.head.step(-f.tx.a * 0.45 + (f.fs === 'waiting' ? 0.25 : 0), 55, 5, dt, lacF * 0.03);
    f.headZ.step(-f.tz.a * 0.4, 55, 5, dt, -lacX * 0.03);
    f.tail.step(0, 40, 3, dt, lacX * 0.05);

    // pancing
    let tp = -0.95;
    let tb = 0.05;
    const hold = f.input.hold;
    switch (f.fs) {
      case 'idle':
      case 'cooldown':
        tp = -0.95 + Math.sin(this.time * 2 + f.idx) * 0.03;
        break;
      case 'charging':
        tp = -0.95 - f.power * 1.05;
        tb = 0.25;
        break;
      case 'casting':
        tp = f.castT < 0.2 ? -0.1 : -0.85;
        tb = f.castT < 0.2 ? 0.8 : 0.1;
        break;
      case 'waiting':
        tp = -0.85 + Math.sin(this.time * 1.5 + f.idx) * 0.03;
        tb = 0.2;
        break;
      case 'bite':
        tp = -0.78 + Math.sin(this.time * 45) * 0.1;
        tb = 0.75;
        break;
      case 'reeling':
        tp = hold ? -1.45 : -0.72;
        tb = 0.55 + (f.reel?.thrash ? 0.55 : 0) + (f.reel && !f.reel.inZone ? 0.2 : 0);
        break;
      case 'landing':
        tp = -1.75;
        tb = 0.25;
        break;
    }
    const snappy = f.fs === 'casting' || f.fs === 'bite';
    f.rodPitch.step(tp, snappy ? 260 : 150, snappy ? 18 : 13, dt);
    f.rodBend.step(tb, 120, 8, dt);

    // terapkan
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
    const splay = fishingPose && !stunned && !swimming ? 0.14 : f.celebrate ? 0.9 : 0.85;
    rig.armL.rotation.z = splay + (stunned ? Math.sin(this.time * 9 + f.idx) * 0.5 : 0);
    rig.armR.rotation.z = -splay - (stunned ? Math.sin(this.time * 9 + f.idx + 1) * 0.5 : 0);
    rig.legL.rotation.x = f.legL.a;
    rig.legR.rotation.x = f.legR.a;
    rig.head.rotation.x = f.head.a;
    rig.head.rotation.z = f.headZ.a;
    rig.tail.rotation.y = f.tail.a + Math.sin(this.time * 6 + f.idx) * 0.15 * Math.min(1, sp);
    rig.rodRoot.rotation.x = f.rodPitch.a;
    for (const s of rig.rodSegs) s.rotation.x = f.rodBend.a / 4;

    const dist = Math.hypot(f.x, f.z);
    rig.ring.visible = f.y >= -0.08 && dist < DOCK_R && !swimming;
    rig.ring.position.y = 0.05 - ry;
    rig.ring.scale.setScalar(1 + (f.isPlayer ? Math.sin(this.time * 5) * 0.05 : 0));
    if (f.leapT >= 0) {
      // lompatan kocak: salto, tangan & kaki melambai, badan melar
      const u = Math.min(1, f.leapT);
      const air = Math.sin(Math.PI * u);
      rig.tilt.rotation.x = f.leapSpin * u * Math.PI * 4;
      rig.tilt.rotation.z = Math.sin(u * 13) * 0.3 * air;
      rig.tilt.scale.set(1 - 0.16 * air, 1 + 0.26 * air, 1 - 0.16 * air);
      rig.armL.rotation.x = -2.6 + Math.sin(this.time * 32) * 0.9;
      rig.armR.rotation.x = -2.6 - Math.sin(this.time * 32) * 0.9;
      rig.armL.rotation.z = 1.1;
      rig.armR.rotation.z = -1.1;
      rig.legL.rotation.x = Math.sin(this.time * 28) * 1.3;
      rig.legR.rotation.x = -Math.sin(this.time * 28) * 1.3;
      rig.tail.rotation.y = Math.sin(this.time * 30) * 0.9;
      rig.head.rotation.x = Math.sin(this.time * 20) * 0.35;
    }
    rig.root.updateMatrixWorld(true);
  }

  // ---------- memancing ----------
  private setFs(f: Fighter, s: FState) {
    f.fs = s;
    f.stateT = 0;
  }

  cancelFish(f: Fighter, msg?: string) {
    if (!f.fishingActive) return;
    f.bobFrom.copy(f.bobber);
    f.reel = null;
    f.fish = null;
    this.setFs(f, 'cooldown');
    f.ft = 0.4;
    f.shadowObj.visible = false;
    if (msg) {
      if (f.isPlayer || Math.hypot(f.x - this.fighters[0].x, f.z - this.fighters[0].z) < 12) this.popup(msg, f.x, f.y + 3.6, f.z, '#ff7a7a', f.isPlayer ? 22 : 16);
    }
  }

  private fishing(f: Fighter, dt: number) {
    const hold = f.input.hold;
    const pressed = hold && !f.prevHold;
    f.prevHold = hold;
    const sp = f.spot;
    const inSpot = Math.hypot(f.x - sp.x, f.z - sp.z) < 1.8 && f.y < 1.2;
    const canFish = this.phase === 'playing' && f.swim <= 0 && f.leapT < 0 && f.ragdoll <= 0 && f.diveT <= 0 && inSpot;
    f.rig.rodTip.getWorldPosition(f.tipPos);
    f.stateT += dt;

    if (f.fishingActive && !canFish) {
      this.cancelFish(f, this.phase === 'playing' ? (inSpot ? 'Tali putus!' : 'Keluar spot! 🚫') : undefined);
    }

    const b = f.bobber;
    switch (f.fs) {
      case 'idle':
        if (pressed && canFish) {
          this.setFs(f, 'charging');
          f.power = 0;
          f.powDir = 1;
        }
        break;

      case 'charging':
        f.power += f.powDir * 1.45 * dt;
        if (f.power >= 1) {
          f.power = 1;
          f.powDir = -1;
        }
        if (f.power <= 0) {
          f.power = 0;
          f.powDir = 1;
        }
        if (!hold) {
          f.castPower = f.power;
          const dist = 3.3 + f.power * 6.2;
          const lat = rand(-0.9, 0.9);
          f.landing.set(sp.x + sp.dx * dist - sp.dz * lat, WATER_Y, sp.z + sp.dz * dist + sp.dx * lat);
          f.bobFrom.copy(f.tipPos);
          b.copy(f.tipPos);
          this.setFs(f, 'casting');
          f.castT = 0;
          if (f.isPlayer) sfx.cast();
        }
        break;

      case 'casting': {
        f.castT += dt;
        const u = Math.min(1, f.castT / 0.7);
        b.x = lerp(f.bobFrom.x, f.landing.x, u);
        b.z = lerp(f.bobFrom.z, f.landing.z, u);
        b.y = lerp(f.bobFrom.y, WATER_Y + 0.05, u) + Math.sin(Math.PI * u) * (2 + f.castPower * 2.2);
        if (u >= 1) {
          this.splash(f.landing.x, f.landing.z, 0.7);
          this.setFs(f, 'waiting');
          f.ft = (1.3 + Math.random() * 2.6 + f.castPower * 0.9) * (this.frenzy ? 0.6 : 1);
        }
        break;
      }

      case 'waiting': {
        b.x = f.landing.x;
        b.z = f.landing.z;
        b.y = waterHeight(b.x, b.z, this.time) + 0.06 + Math.sin(this.time * 2.5 + f.idx) * 0.03;
        f.ripT -= dt;
        if (f.ripT <= 0) {
          f.ripT = 1.1;
          this.ripples.spawn(b.x, b.z, 0.9, this.time);
        }
        f.ft -= dt;
        if (pressed && f.stateT > 0.5) {
          this.cancelFish(f);
        } else if (f.ft <= 0) {
          f.fish = pickFish(f.castPower);
          this.setFs(f, 'bite');
          f.ft = 1.5;
          this.splash(b.x, b.z, 0.5);
          if (f.isPlayer) sfx.bite();
        }
        break;
      }

      case 'bite': {
        b.x = f.landing.x + Math.sin(this.time * 30) * 0.05;
        b.z = f.landing.z;
        b.y = waterHeight(b.x, b.z, this.time) - 0.15 + Math.abs(Math.sin(this.time * 22)) * 0.12;
        f.shadowObj.visible = true;
        f.shadowObj.position.set(b.x + 0.5, WATER_Y + 0.06, b.z);
        f.ripT -= dt;
        if (f.ripT <= 0) {
          f.ripT = 0.18;
          this.ripples.spawn(b.x, b.z, 0.7, this.time);
        }
        f.ft -= dt;
        if (pressed && f.fish) {
          f.reel = new Reel(f.fish.def, f.fish.diff);
          this.setFs(f, 'reeling');
          f.reelClick = 0;
          this.splash(b.x, b.z, 0.8);
          if (f.isPlayer) {
            sfx.hook();
            this.popup('KENA! 🎣', f.x, f.y + 3.6, f.z, '#ffe14d', 30);
          }
        } else if (f.ft <= 0) {
          this.cancelFish(f, 'Kelamaan! Ikan lolos');
          if (f.isPlayer) sfx.lose();
        }
        break;
      }

      case 'reeling': {
        const r = f.reel;
        if (!r || !f.fish) {
          this.cancelFish(f);
          break;
        }
        const res = r.update(dt, hold);
        if (r.dashed) {
          this.splash(b.x, b.z, 0.7);
        }
        const pull = lerp(0, 0.55, r.progress);
        const tx = lerp(f.landing.x, sp.x + sp.dx * 3.2, pull);
        const tz = lerp(f.landing.z, sp.z + sp.dz * 3.2, pull);
        const jig = r.thrash ? 0.28 : 0.1;
        b.x = tx + Math.sin(this.time * 23) * jig;
        b.z = tz + Math.cos(this.time * 19) * jig;
        b.y = waterHeight(b.x, b.z, this.time) + 0.03 + Math.abs(Math.sin(this.time * 14)) * (r.inZone ? 0.04 : 0.1);
        f.shadowObj.visible = true;
        const orbit = this.time * (r.thrash ? 7 : 3.5);
        f.shadowObj.position.set(b.x + Math.cos(orbit) * 0.75, WATER_Y + 0.06, b.z + Math.sin(orbit) * 0.75);
        f.shadowObj.rotation.y = -orbit - Math.PI / 2;
        f.shadowObj.scale.set(0.9 * f.fish.size, 1, 0.38 * f.fish.size);
        f.ripT -= dt;
        if (f.ripT <= 0) {
          f.ripT = r.thrash ? 0.14 : 0.32;
          this.ripples.spawn(b.x, b.z, r.thrash ? 1.1 : 0.7, this.time);
        }
        if (f.isPlayer && hold) {
          f.reelClick -= dt;
          if (f.reelClick <= 0) {
            f.reelClick = 0.11;
            sfx.reelTick(r.progress);
          }
        }
        if (res === 'caught') {
          f.catchFrom.copy(b);
          f.fishMat.color.setHex(f.fish.def.color);
          f.fishObj.visible = true;
          f.fishObj.scale.setScalar(f.fish.size * 1.15);
          f.shadowObj.visible = false;
          this.setFs(f, 'landing');
          this.splash(b.x, b.z, 1);
          f.reel = null;
        } else if (res === 'lost') {
          this.cancelFish(f, 'Ikan kabur! 🐟💨');
          if (f.isPlayer) sfx.lose();
        }
        break;
      }

      case 'landing': {
        const fish = f.fish;
        const u = Math.min(1, f.stateT / 0.85);
        const tgt = sp.bucket;
        const p = f.fishObj.position;
        p.x = lerp(f.catchFrom.x, tgt.x, u);
        p.z = lerp(f.catchFrom.z, tgt.z, u);
        p.y = lerp(f.catchFrom.y, tgt.y, u) + Math.sin(Math.PI * u) * 3.6;
        f.fishObj.rotation.set(0, Math.atan2(tgt.x - f.catchFrom.x, tgt.z - f.catchFrom.z) - Math.PI / 2, u * 14);
        b.copy(p);
        if (u >= 1 && fish) {
          const pts = fish.points * (this.frenzy ? 2 : 1);
          f.score += pts;
          f.count++;
          if (fish.weight > f.heaviest) f.heaviest = fish.weight;
          if (!f.best || fish.weight > f.best.weight) f.best = fish;
          f.fishObj.visible = false;
          this.particles.spawn(tgt.x, tgt.y + 0.4, tgt.z, f.colorHex, 10, 3, 5, 0.13, 0.7);
          this.particles.spawn(tgt.x, tgt.y + 0.4, tgt.z, 0xffe14d, 8, 3, 6, 0.12, 0.7);
          const lvl = RANKS.findIndex((q) => q.id === fish.rank.id);
          const hi = lvl >= 3;
          const kg = `${fish.weight.toFixed(1)} kg`;
          if (f.isPlayer || hi) {
            this.popup(`${fish.rank.id}-RANK ${fish.def.emoji} ${fish.def.name} · ${kg}`, f.x, f.y + 3.95, f.z, fish.rank.color, f.isPlayer ? 22 : 15);
            this.popup(`+${pts}${this.frenzy ? ' ×2' : ''}`, f.x, f.y + 3.05, f.z, hi ? '#ffd23f' : '#9dff8a', f.isPlayer ? 34 : 20);
          }
          if (f.isPlayer) {
            if (lvl >= 2) sfx.rankUp(lvl - 1);
            else sfx.catchFish(fish.points);
            if (hi) this.shake = Math.max(this.shake, 0.35);
          }
          if (hi) {
            this.banner = `${f.isPlayer ? 'KAMU' : f.name} dapat ${fish.rank.id}-RANK! ${fish.def.emoji} ${kg}`;
            this.bannerT = 2.4;
          }
          f.fish = null;
          this.setFs(f, 'idle');
        }
        break;
      }

      case 'cooldown': {
        f.ft -= dt;
        const r = clamp(1 - f.ft / 0.4, 0, 1);
        b.lerpVectors(f.bobFrom, f.tipPos, r);
        if (f.ft <= 0) this.setFs(f, 'idle');
        break;
      }
    }

    this.drawLine(f);
  }

  private drawLine(f: Fighter) {
    const show = f.fs !== 'idle' && f.fs !== 'charging';
    f.bobberObj.visible = show && f.fs !== 'landing';
    f.lineObj.visible = show;
    f.shadowObj.visible = f.shadowObj.visible && (f.fs === 'bite' || f.fs === 'reeling');
    if (!show) return;
    f.bobberObj.position.copy(f.bobber);
    f.bobberObj.rotation.z = f.fs === 'bite' ? Math.sin(this.time * 30) * 0.3 : 0;
    let sag = 0.8;
    if (f.fs === 'casting') sag = 0.4;
    else if (f.fs === 'bite') sag = 0.25;
    else if (f.fs === 'reeling') sag = 0.1 + (f.reel ? (1 - f.reel.progress) * 0.35 : 0);
    else if (f.fs === 'landing') sag = 0.2;
    else if (f.fs === 'cooldown') sag = 0.5;
    const pos = f.lineGeo.attributes.position as THREE.BufferAttribute;
    const N = 20;
    const A = f.tipPos;
    const B = f.bobber;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pos.setXYZ(i, lerp(A.x, B.x, t), lerp(A.y, B.y, t) - sag * 4 * t * (1 - t), lerp(A.z, B.z, t));
    }
    pos.needsUpdate = true;
    if (f.fs === 'reeling' && f.reel) f.lineMat.color.setHex(f.reel.inZone ? 0xffffff : 0xff9a3c);
    else f.lineMat.color.setHex(0xffffff);
  }

  // ---------- kamera & label ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.fighters[0];
    const s0 = me.spot;
    const aspect = this.w / this.h;
    const zoom = aspect < 1 ? Math.min(2, 1 / aspect + 0.25) : 1;
    const desired = this.tmpV;
    const look = this.tmpV2;
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = this.time * 0.22 + s0.a;
      desired.set(Math.cos(a + Math.PI) * 17 * zoom, 9.5 * zoom, Math.sin(a + Math.PI) * 17 * zoom);
      look.set(0, 1, 0);
    } else {
      const fx = me.x * 0.22;
      const fz = me.z * 0.22;
      desired.set(-s0.dx * 19 * zoom + fx * 0.5, 17 * zoom, -s0.dz * 19 * zoom + fz * 0.5);
      look.set(s0.dx * 1 + fx, 0, s0.dz * 1 + fz);
    }
    const k = instant ? 1 : 1 - Math.exp(-3 * dt);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, k);
    this.shake *= Math.exp(-6 * dt);
    const sh = this.shake * 0.35;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  private project(x: number, y: number, z: number) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, vis: v.z < 1 };
  }

  private updateLabels() {
    for (const f of this.fighters) {
      const yy = f.swim > 0 ? WATER_Y + 1.6 : f.y + 3.75;
      const p = this.project(f.x, yy, f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      f.tag.style.display = p.vis ? 'block' : 'none';
      let ind = '';
      if (f.leapT >= 0) ind = '🦈💥';
      else if (this.sharks.threat(f.idx) > 0) ind = '🦈❗';
      else if (f.swim > 0) ind = '💦';
      else if (f.ragdoll > 0) ind = '💫';
      else if (f.fs === 'bite') ind = '❗';
      else if (f.fs === 'reeling') ind = f.reel && f.reel.inZone ? '😆' : '😰';
      else if (this.phase === 'results' && f === this.winner()) ind = '👑';
      if (f.indEl.textContent !== ind) f.indEl.textContent = ind;
    }
  }

  popup(text: string, x: number, y: number, z: number, color: string, size = 24) {
    const p = this.project(x, y, z);
    if (!p.vis) return;
    const d = document.createElement('div');
    d.textContent = text;
    d.className = 'game-popup';
    d.style.left = `${p.x}px`;
    d.style.top = `${p.y}px`;
    d.style.color = color;
    d.style.fontSize = `${size}px`;
    this.overlay.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  // ---------- HUD ----------
  private buildHud(): HudState {
    const me = this.fighters[0];
    const rank = this.ranking();
    const board: BoardEntry[] = rank.map((f, i) => ({
      id: f.idx,
      name: f.name,
      emoji: f.def.emoji,
      animal: f.def.id,
      color: f.color,
      score: f.score,
      count: f.count,
      isPlayer: f.isPlayer,
      rank: i + 1,
      best: f.best ? `${f.best.def.emoji} ${f.best.def.name} · ${f.best.weight.toFixed(1)} kg` : '-',
      bestRank: f.best ? f.best.rank.id : '-',
      bestColor: f.best ? f.best.rank.color : '#94a3b8',
      heaviest: f.heaviest,
      bites: f.bites,
    }));
    const inSpot = Math.hypot(me.x - me.spot.x, me.z - me.spot.z) < 1.8 && me.y < 1.2;
    const r = me.reel;

    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap-siap! Berdiri di lingkaran spot-mu 🎣';
    else if (this.phase === 'playing') {
      if (me.leapT >= 0) hint = 'WHEEE! 🦈 Kamu dilempar hiu balik ke pantai!';
      else if (me.swim > 0) hint = 'Kamu nyebur! 🦈 Hiu mendekat... siap-siap dilempar balik!';
      else if (this.sharkAlert > 0.2) hint = '🦈 HIU MENGINCARMU! Menjauh dari tepi air!';
      else if (me.ragdoll > 0) hint = 'Aduh, kamu kena hajar! 💫';
      else if (!inSpot) hint = '⬇ Balik ke SPOT mancingmu (lingkaran warna kamu)!';
      else {
        switch (me.fs) {
          case 'idle':
          case 'cooldown':
            hint = 'TAHAN [SPASI] lalu LEPAS untuk melempar pancing!';
            break;
          case 'charging':
            hint = 'LEPAS untuk lempar! Makin jauh = ikan makin langka 🐟';
            break;
          case 'casting':
          case 'waiting':
            hint = 'Tunggu ikan menggigit... 👀';
            break;
          case 'bite':
            hint = '❗ TEKAN [SPASI] SEKARANG!';
            break;
          case 'reeling':
            hint = 'TAHAN = zona naik · LEPAS = zona turun. Jaga ikan di zona hijau!';
            break;
          default:
            hint = 'Mantap! 🎉';
        }
      }
    }

    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      timeLeft: this.timeLeft,
      frenzy: this.frenzy && this.phase === 'playing',
      go: this.phase === 'playing' && this.goT > 0,
      board,
      me: {
        fs: me.fs,
        power: me.power,
        hold: me.input.hold,
        inSpot,
        stunned: me.ragdoll > 0,
        swimming: me.swim > 0,
        leaping: me.leapT >= 0,
        sharkAlert: this.sharkAlert,
        edge: me.swim <= 0 && Math.hypot(me.x, me.z) > DOCK_R - 1.15 && me.leapT < 0,
        heaviest: me.heaviest,
        bites: me.bites,
        biteLeft: me.fs === 'bite' ? clamp(me.ft / 1.5, 0, 1) : 0,
        punchReady: clamp(1 - me.punchCd / 0.7, 0, 1),
        diveReady: clamp(1 - me.diveCd / 1.8, 0, 1),
        reel:
          me.fs === 'reeling' && r
            ? { zone: r.zone, size: r.size, fish: r.fish, progress: r.progress, emoji: r.def.emoji, name: r.def.name, thrash: r.thrash, inZone: r.inZone, rank: me.fish ? me.fish.rank.id : 'D', rankName: me.fish ? me.fish.rank.name : '', rankColor: me.fish ? me.fish.rank.color : '#9aa7b8', weight: me.fish ? me.fish.weight : 0, points: me.fish ? me.fish.points : 0 }
            : null,
      },
      banner: this.banner,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }

  // ---------- hiu ----------
  private sharkHooks: SharkHooks = {
    warn: (id, mode) => {
      const f = this.fighters[id];
      if (!f) return;
      if (f.isPlayer) {
        this.popup(mode === 'edge' ? '🦈 HIU MENGINCARMU!' : '🦈 HIU MENDEKAT!', f.x, Math.max(f.y, 0) + 3.95, f.z, '#ff8a7a', 24);
        sfx.sharkWarn();
      } else if (Math.hypot(f.x - this.fighters[0].x, f.z - this.fighters[0].z) < 16) this.popup('🦈❗', f.x, Math.max(f.y, 0) + 3.9, f.z, '#ff8a7a', 22);
    },
    lunge: (x, z) => {
      const me = this.fighters[0];
      if (me && Math.hypot(x - me.x, z - me.z) < 30) sfx.sharkLunge();
    },
    chomp: (id, x, y, z) => this.sharkBite(this.fighters[id], x, y, z),
    splash: (x, z, big) => {
      if (big < 0) this.ripples.spawn(x, z, 0.45, this.time);
      else this.splash(x, z, big);
    },
    miss: (id, x, z) => {
      const f = this.fighters[id];
      if (f && f.isPlayer) this.popup('Hiu meleset! 😅', x, 2.2, z, '#ffffff', 22);
    },
  };

  private updateSharks(dt: number) {
    const targets: SharkTarget[] = [];
    if (this.phase === 'playing') {
      for (const f of this.fighters) {
        if (f.leapT >= 0 || f.sharkImm > 0) continue;
        const d = Math.hypot(f.x, f.z);
        if (f.swim > 0.2) targets.push({ id: f.idx, x: f.x, z: f.z, mode: 'swim' });
        else if (f.swim <= 0 && !f.falling && f.y > -0.2 && f.y < 2.6 && d > DOCK_R - 1.15) targets.push({ id: f.idx, x: f.x, z: f.z, mode: 'edge' });
      }
    }
    this.sharks.update(dt, this.time, targets, this.sharkHooks, (x, z) => waterHeight(x, z, this.time));
    this.sharkAlert = this.fighters[0] ? this.sharks.threat(0) : 0;
  }

  private sharkBite(f: Fighter | undefined, x: number, y: number, z: number) {
    if (!f || f.leapT >= 0) return;
    f.bites++;
    f.sharkImm = 5;
    f.swim = 0;
    f.ragdoll = 0;
    f.falling = false;
    f.punchT = -1;
    f.diveT = 0;
    this.cancelFish(f, undefined);
    f.leapFrom.set(f.x, Math.max(f.y, WATER_Y - 0.4), f.z);
    const dist = Math.hypot(f.spot.x - f.x, f.spot.z - f.z);
    f.leapApex = 4.2 + Math.min(5.5, dist * 0.45);
    f.leapDur = clamp(0.95 + dist * 0.045, 1.0, 1.6);
    f.leapSpin = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
    f.leapT = 0;
    f.vx = f.vz = f.vy = 0;
    this.particles.spawn(x, y, z, 0xff4d6d, 10, 4, 5, 0.14, 0.6, 9);
    this.particles.spawn(x, y, z, 0xffffff, 14, 5, 5, 0.18, 0.7, 9);
    this.splash(f.x, f.z, 1.5);
    const me = this.fighters[0];
    const near = me ? Math.hypot(f.x - me.x, f.z - me.z) < 30 : false;
    if (near) {
      sfx.sharkChomp();
      window.setTimeout(() => sfx.boing(), 140);
    }
    this.popup('💥 DIGIGIT HIU! 🦈', f.x, Math.max(f.y, 0) + 3.4, f.z, '#ff7a7a', f.isPlayer ? 32 : 22);
    if (f.isPlayer) {
      this.shake = Math.max(this.shake, 0.9);
      this.banner = '🦈 KAMU DILEMPAR HIU!';
      this.bannerT = 1.8;
    } else if (near) {
      this.banner = `🦈 ${f.name} dilempar hiu!`;
      this.bannerT = 1.5;
    }
  }

  private leapStep(f: Fighter, dt: number) {
    f.leapT += dt / f.leapDur;
    const u = Math.min(1, f.leapT);
    const sp = f.spot;
    f.x = lerp(f.leapFrom.x, sp.x, u);
    f.z = lerp(f.leapFrom.z, sp.z, u);
    f.y = lerp(f.leapFrom.y, 0, u) + Math.sin(Math.PI * u) * f.leapApex;
    f.vx = f.vz = f.vy = 0;
    f.grounded = false;
    f.yaw += dt * 9 * f.leapSpin;
    if (u >= 1) {
      f.leapT = -1;
      f.x = sp.x;
      f.z = sp.z;
      f.y = 0;
      f.grounded = true;
      f.yaw = Math.atan2(sp.dx, sp.dz);
      f.sq.v = 12;
      f.tx.a = f.tz.a = 0;
      f.tx.v = f.tz.v = 0;
      f.hitCd = 0.5;
      f.standT = 0.5;
      this.particles.spawn(f.x, 0.15, f.z, 0xf5e6c8, 12, 3.5, 2.5, 0.2, 0.6, 6);
      this.particles.spawn(f.x, 1.6, f.z, 0xffe14d, 6, 3, 4, 0.14, 0.8, 8);
      const me = this.fighters[0];
      if (me && Math.hypot(f.x - me.x, f.z - me.z) < 30) {
        sfx.bump();
        sfx.wheee();
      }
      if (f.isPlayer) this.popup('Mendarat di pantai! 🏖️', f.x, 3.4, f.z, '#ffffff', 22);
    }
  }
}
