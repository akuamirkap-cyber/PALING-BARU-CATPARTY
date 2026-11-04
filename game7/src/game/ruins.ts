import * as THREE from 'three';
import { ANIMALS, AnimalDef, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { BACK, boulderTex, buildRuinsWorld, FIN, HW, ND, NH, NICHES, rampH, rampSlope, RuinsWorld, Strip, TOP } from './ruinsWorld';

const TAU = Math.PI * 2;
const ROUND = 95;
const GRACE = 12;
const G = 26;
const GRAV = 30;
const JUMP_V = 11.5;

export type RPhase = 'menu' | 'countdown' | 'playing' | 'finished' | 'results';
type BType = 'small' | 'med' | 'giant';

const BT: Record<BType, { r: number; vmax: number; name: string }> = {
  small: { r: 0.95, vmax: 24, name: 'Batu Kecil' },
  med: { r: 2.0, vmax: 21, name: 'Batu Besar' },
  giant: { r: 3.5, vmax: 18, name: 'Batu RAKSASA' },
};

export interface RBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  isPlayer: boolean;
  rank: number;
  finished: boolean;
  time: number;
  progress: number;
  hits: number;
}

export interface RuinsHudState {
  phase: RPhase;
  countdown: number;
  go: boolean;
  timeLeft: number;
  grace: boolean;
  board: RBoardEntry[];
  me: {
    progress: number;
    finished: boolean;
    stunned: boolean;
    diveReady: number;
    shoveReady: number;
    danger: number;
    hits: number;
    inNiche: boolean;
  };
  track: {
    boulders: { p: number; x: number; r: number }[];
    cats: { p: number; x: number; color: string; me: boolean; fin: boolean }[];
  };
  alert: { text: string; sub: string; kind: BType | 'row'; t: number } | null;
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

interface RInput {
  mx: number;
  mz: number;
  jump: boolean;
  dive: boolean;
  shove: boolean;
}

const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

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
  start: { x: number; z: number };

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
  celT = 0;
  finished = false;
  finishTime = 0;
  maxZ = 0;
  hits = 0;

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

  input: RInput = { mx: 0, mz: 0, jump: false, dive: false, shove: false };
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  ai = { alert: 0, lane: 0, laneT: 0, noise: 0, noiseT: 0, shoveT: rand(1, 3), lastB: null as Boulder | null, ignore: false };

  constructor(idx: number, def: AnimalDef, name: string, isPlayer: boolean, skill: number, start: { x: number; z: number }) {
    this.idx = idx;
    this.def = def;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.start = start;
    this.color = PLAYER_COLORS[idx];
    this.colorHex = parseInt(this.color.slice(1), 16);
    this.rig = buildAnimal(def, this.colorHex);
    this.rig.rodRoot.visible = false;
    this.rig.ring.visible = false;
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
    this.x = this.start.x;
    this.z = this.start.z;
    this.y = 0;
    this.vx = this.vz = this.vy = 0;
    this.pvx = this.pvz = this.ax = this.az = 0;
    this.yaw = 0;
    this.yawV = 0;
    this.grounded = true;
    this.ragdoll = 0;
    this.standT = 0;
    this.hitCd = 0;
    this.immune = 0;
    this.shoveT = -1;
    this.shoveCd = 0;
    this.diveT = 0;
    this.diveCd = 0;
    this.finished = false;
    this.finishTime = 0;
    this.maxZ = this.start.z;
    this.hits = 0;
    for (const s of [this.tx, this.tz, this.sq, this.armL, this.armR, this.legL, this.legR, this.head, this.headZ, this.tail]) {
      s.a = 0;
      s.v = 0;
    }
    this.input = { mx: 0, mz: 0, jump: false, dive: false, shove: false };
    this.ai.alert = 0;
    this.ai.lane = rand(-7, 7);
    this.ai.laneT = rand(1, 3);
    this.rig.root.visible = true;
  }
}

// ---------- batu raksasa ----------
class Boulder {
  active = false;
  type: BType = 'med';
  r = 2;
  x = 0;
  tx = 0;
  z = 0;
  sp = 8;
  age = 0;
  vmax = 20;
  wa = 0;
  wf = 1;
  ph = 0;
  hit = new Set<Cat>();
  dustT = 0;
  g: THREE.Group;
  mesh: THREE.Mesh;
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.g = new THREE.Group();
    this.g.add(this.mesh);
    this.g.visible = false;
    scene.add(this.g);
  }
}

interface Pending {
  t: number;
  x: number;
  type: BType;
  strip: Strip | null;
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number; grow: number }[] = [];
  constructor(parent: THREE.Object3D) {
    const geo = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < 460; i++) {
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
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 2) * (p.grow ? 0.55 : 1);
    }
  }
}

function boulderGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.09 * Math.sin(x * 3.1 + 1.3) * Math.cos(y * 2.7) + 0.06 * Math.sin(z * 4.3 + x * 2.1) + 0.035 * Math.sin(x * 9 + y * 7 + z * 8);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export class RuinsEngine {
  private container: HTMLElement;
  private onHud: (h: RuinsHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private world: RuinsWorld;
  private particles: Particles;
  private cats: Cat[] = [];
  private boulders: Boulder[] = [];
  private pending: Pending[] = [];
  private strips: Strip[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;

  phase: RPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private timeLeft = ROUND;
  private playTime = 0;
  private goT = 0;
  private spawnT = 3;
  private wave = 1;
  private finCount = 0;
  private grace = false;
  private banner = '';
  private bannerT = 0;
  private alert: { text: string; sub: string; kind: BType | 'row'; t: number } | null = null;
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;
  private rollSndT = 0;
  private lastDanger = 0;

  private keys = new Set<string>();
  private pend = { jump: false, dive: false, shove: false };
  private joy = { x: 0, y: 0 };
  private camYaw = 0;
  private camPitch = 0.5;
  private mdx = 0;
  private mdy = 0;
  private manualT = 0;
  private touchId: number | null = null;
  private touchLast = { x: 0, y: 0 };

  private camPos = new THREE.Vector3(0, 8, -12);
  private camLook = new THREE.Vector3(0, 2, 6);
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();
  private tv3 = new THREE.Vector3();

  constructor(container: HTMLElement, onHud: (h: RuinsHudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;filter:saturate(1.18) contrast(1.05) brightness(1.02);';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2200);
    this.world = buildRuinsWorld(this.scene, PLAYER_COLORS);
    this.particles = new Particles(this.scene);
    const bg = boulderGeometry();
    const bm = new THREE.MeshStandardMaterial({ map: boulderTex(), roughness: 0.96, bumpMap: boulderTex(), bumpScale: 2 });
    for (let i = 0; i < 12; i++) this.boulders.push(new Boulder(this.scene, bg, bm));
    for (let i = 0; i < 10; i++) this.strips.push(this.world.makeStrip());
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
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') this.pend.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pend.dive = true;
    if (e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'KeyF') this.pend.shove = true;
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();
  private onCtx = (e: Event) => e.preventDefault();
  private camActive() {
    return this.phase === 'playing' || this.phase === 'countdown';
  }
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
    const skills = [0.38, 0.55, 0.74];
    const defs = [pd, others[0], others[1], others[2]];
    defs.forEach((d, i) => {
      const c = new Cat(i, d, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1], this.world.starts[i]);
      this.scene.add(c.rig.root);
      this.overlay.appendChild(c.tag);
      this.cats.push(c);
    });
    this.resetAll();
  }

  private resetAll() {
    for (const b of this.boulders) {
      b.active = false;
      b.g.visible = false;
    }
    for (const s of this.strips) s.mesh.visible = false;
    this.pending = [];
    for (const c of this.cats) c.reset();
    this.timeLeft = ROUND;
    this.playTime = 0;
    this.goT = 0;
    this.spawnT = 1.6;
    this.wave = 1;
    this.finCount = 0;
    this.grace = false;
    this.banner = '';
    this.bannerT = 0;
    this.alert = null;
    this.camYaw = 0;
    this.camPitch = 0.5;
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
    if (playing) {
      this.playTime += dt;
      this.spawnLogic(dt);
      this.updatePending(dt);
    }
    for (const c of this.cats) {
      if (c.isPlayer) this.readPlayerInput(c, playing);
      else this.botThink(c, dt, playing);
      c.hitCd -= dt;
      c.immune -= dt;
      this.physics(c, dt);
    }
    this.updateBoulders(dt);
    this.collisions();
    for (const c of this.cats) this.animate(c, dt);
    this.particles.update(dt);
    this.updateCamera(dt, false);
    this.world.update(this.time, dt, this.camLook);
    this.updateLabels();
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    if (this.alert) {
      this.alert.t -= dt;
      if (this.alert.t <= 0) this.alert = null;
    }
    this.shake *= Math.exp(-5 * dt);
    this.onHud(this.buildHud());
  }

  private ranking() {
    return [...this.cats].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.maxZ - a.maxZ;
    });
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
      this.timeLeft -= dt;
      this.goT -= dt;
      const s = Math.ceil(this.timeLeft);
      if (this.timeLeft <= 10 && s !== this.lastDanger) {
        this.lastDanger = s;
        sfx.tick();
      }
      if (this.timeLeft <= 0 || this.cats.every((c) => c.finished)) {
        this.timeLeft = Math.max(0, this.timeLeft);
        this.phase = 'finished';
        this.phaseT = 3;
        sfx.horn();
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
      i.jump = i.dive = i.shove = false;
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
    // gerakan relatif terhadap arah kamera
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    i.mx = uy * fx + ux * -fz;
    i.mz = uy * fz + ux * fx;
    i.jump = pend.jump;
    i.dive = pend.dive;
    i.shove = pend.shove;
    pend.jump = pend.dive = pend.shove = false;
  }

  // ---------- bot ----------
  private threatOf(f: Cat) {
    let best: { t: number; b: Boulder } | null = null;
    for (const b of this.boulders) {
      if (!b.active || b.z + b.r < f.z - 0.4) continue;
      const dx = f.x - b.x;
      if (Math.abs(dx) > b.r + 1.9) continue;
      const gap = b.z - b.r - f.z - 0.5;
      if (gap > 36) continue;
      const t = Math.max(0, gap) / Math.max(7, b.sp + 3);
      if (!best || t < best.t) best = { t, b };
    }
    return best;
  }

  private botThink(f: Cat, dt: number, playing: boolean) {
    const ai = f.ai;
    const inp = f.input;
    inp.mx = inp.mz = 0;
    inp.jump = inp.dive = inp.shove = false;
    if (!playing || f.ragdoll > 0) return;
    if (f.finished) return;
    const sk = f.skill;
    const th = this.threatOf(f);
    if (th && th.b !== ai.lastB) {
      ai.lastB = th.b;
      ai.ignore = Math.random() < (1 - sk) * 0.7 + 0.1; // kadang lengah / panik
    }
    if (th && th.t < 2.3 && !ai.ignore) {
      ai.alert += dt;
      if (ai.alert >= 0.12 + (1 - sk) * 0.6) {
        const b = th.b;
        const clear = f.y - rampH(f.z) > b.r * 1.2;
        if (b.type === 'small' && th.t < 0.4 && th.t > 0.15 && f.grounded && Math.random() < 0.55 + sk * 0.4) {
          inp.jump = true;
          inp.mz = 0.4;
          return;
        }
        if (b.type === 'small' && clear) return;
        // jalan keluar dari lajur batu: pilih sisi yang lebih dekat & layak
        const exitL = b.x - b.r - 1.1;
        const exitR = b.x + b.r + 1.1;
        const lim = HW - 0.9;
        const okL = exitL >= -lim;
        const okR = exitR <= lim;
        let dir = 0;
        if (okL && okR) dir = Math.abs(f.x - exitL) < Math.abs(exitR - f.x) ? -1 : 1;
        else if (okL) dir = -1;
        else if (okR) dir = 1;
        else dir = f.x < b.x ? -1 : 1;
        ai.noiseT -= dt;
        if (ai.noiseT <= 0) {
          ai.noiseT = 0.3;
          ai.noise = (Math.random() - 0.5) * (1 - sk) * 0.7;
        }
        inp.mx = dir * 1;
        inp.mz = th.t > 0.9 ? 0.55 : 0;
        const xs = Math.sin(ai.noise);
        inp.mx += xs;
        if (th.t < 0.42 && f.diveCd <= 0 && f.grounded && b.type !== 'small' && Math.random() < 0.4 + sk * 0.5) {
          inp.dive = true;
          inp.mx = dir;
          inp.mz = 0;
        }
        return;
      }
    } else if (!th) ai.alert = 0;

    // naik di lajur pilihan
    ai.laneT -= dt;
    if (ai.laneT <= 0) {
      ai.laneT = rand(2.5, 5);
      ai.lane = clamp(f.x + rand(-6, 6), -HW + 2.4, HW - 2.4);
    }
    inp.mz = 1;
    inp.mx = clamp((ai.lane - f.x) * 0.6, -1, 1) * 0.8;
    // sesekali senggol rival di dekat
    ai.shoveT -= dt;
    if (ai.shoveT <= 0) {
      ai.shoveT = rand(1.6, 3.4);
      for (const o of this.cats) {
        if (o === f || o.finished) continue;
        const dz = o.z - f.z;
        const dx = o.x - f.x;
        if (dz > 0 && dz < 1.8 && Math.abs(dx) < 1.3 && f.shoveCd <= 0 && Math.random() < 0.25 + 0.25 * sk) {
          inp.shove = true;
          break;
        }
      }
    }
  }

  // ---------- gelombang batu ----------
  private spawnLogic(dt: number) {
    const w = clamp(1 + Math.floor(this.playTime / 8), 1, 10);
    if (w !== this.wave) {
      this.wave = w;
      this.banner = `🌋 GELOMBANG ${w}!`;
      this.bannerT = 1.8;
      sfx.waveUp();
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.85, 2.9 - 0.3 * w) * rand(0.85, 1.2);
      this.launchPattern(w);
    }
  }

  private queue(type: BType, x: number, delay: number) {
    const strip = this.strips.find((s) => !s.mesh.visible) ?? null;
    const r = BT[type].r;
    const xx = clamp(x, -(HW - r - 0.3), HW - r - 0.3);
    if (strip) {
      strip.mesh.visible = true;
      strip.mesh.position.x = xx;
      strip.mesh.scale.x = r + 0.25;
    }
    this.pending.push({ t: 1.25 + delay, x: xx, type, strip });
  }

  private setAlert(text: string, sub: string, kind: BType | 'row') {
    this.alert = { text, sub, kind, t: 2.4 };
    sfx.alarm();
    sfx.rockRumble();
    this.shake = Math.max(this.shake, 0.35);
  }

  private launchPattern(w: number) {
    const opts: string[] = ['med', 'small', 'pair'];
    if (w >= 2) opts.push('row', 'zig', 'med');
    if (w >= 3) opts.push('giant', 'giant');
    if (w >= 5) opts.push('giantRow', 'giant');
    if (w >= 7) opts.push('wall');
    const k = opts[Math.floor(Math.random() * opts.length)];
    const X = () => rand(-8, 8);
    switch (k) {
      case 'med':
        this.queue('med', X(), 0);
        this.setAlert('BATU DATANG!', 'geser ke samping atau terjang (SHIFT)', 'med');
        break;
      case 'small':
        this.queue('small', X(), 0);
        if (w >= 2) this.queue('small', X(), 0.5);
        this.setAlert('BATU KECIL CEPAT!', 'LOMPAT (SPASI) tepat saat lewat', 'small');
        break;
      case 'row':
        for (const x of [-6.5, 0, 6.5]) this.queue('small', x + rand(-1, 1), 0);
        this.setAlert('BARIS BATU KECIL!', 'loncat atau selip di antara batu', 'row');
        break;
      case 'pair': {
        const g = rand(-2, 2);
        this.queue('med', g - 5.6, 0);
        this.queue('med', g + 5.6, 0);
        this.setAlert('DUA BATU!', 'lewat tengah, atau masuk relung', 'med');
        break;
      }
      case 'giant':
        this.queue('giant', rand(-4, 4), 0);
        this.setAlert('BATU RAKSASA!', 'menyingkir jauh ke tepi / masuk relung', 'giant');
        break;
      case 'zig':
        this.queue('med', -6, 0);
        this.queue('med', 0, 0.45);
        this.queue('med', 6, 0.9);
        this.setAlert('BATU BERUNTUN!', 'baca jalurnya, jangan panik', 'med');
        break;
      case 'giantRow':
        this.queue('giant', rand(-3, 3), 0);
        this.queue('small', rand(-7, 7), 0.7);
        this.queue('small', rand(-7, 7), 1.0);
        this.setAlert('RAKSASA + KECIL!', 'hindari raksasa, loncati yang kecil', 'giant');
        break;
      default: {
        const gap = [-6, 0, 6][Math.floor(Math.random() * 3)];
        for (const x of [-8, -2.7, 2.7, 8]) if (Math.abs(x - gap) > 3) this.queue('med', x, 0);
        this.setAlert('DINDING BATU!', 'cari celah — satu jalur lolos!', 'med');
      }
    }
  }

  private updatePending(dt: number) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.strip) {
        p.strip.mat.opacity = 0.32 + 0.36 * (Math.sin(this.time * 16) > 0 ? 1 : 0.35) * clamp(1 - p.t / 1.25 + 0.3, 0.3, 1);
        p.strip.tex.offset.y += dt * 2.6;
      }
      if (p.t <= 0) {
        this.fireBoulder(p);
        if (p.strip) p.strip.mesh.visible = false;
        this.pending.splice(i, 1);
      }
    }
  }

  private fireBoulder(p: Pending) {
    const b = this.boulders.find((x) => !x.active);
    if (!b) return;
    const d = BT[p.type];
    b.active = true;
    b.type = p.type;
    b.r = d.r;
    b.vmax = d.vmax;
    b.tx = p.x;
    b.x = clamp(p.x, -(4.5 - d.r), 4.5 - d.r);
    b.z = TOP + d.r + 0.4;
    b.sp = 11;
    b.age = 0;
    b.wa = p.type === 'med' ? rand(0, 1.1) : 0;
    b.wf = rand(0.8, 1.6);
    b.ph = rand(0, TAU);
    b.hit.clear();
    b.dustT = 0;
    b.g.visible = true;
    b.g.scale.setScalar(d.r);
    b.mesh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    this.particles.spawn(b.x, rampH(TOP) + 3, TOP - 1, 0xc9b48a, 14, 7, 2, 0.9, 1.1, 0, 1.6, 0, -3);
    if (Math.hypot(this.player().x - b.x, this.player().z - b.z) < 120) sfx.rockRumble();
  }

  // ---------- batu menggelinding & menggilas ----------
  private updateBoulders(dt: number) {
    const me = this.player();
    this.rollSndT -= dt;
    let nearest = 1e9;
    for (const b of this.boulders) {
      if (!b.active) continue;
      b.age += dt;
      b.sp = Math.min(b.vmax, b.sp + 9.5 * dt);
      b.z -= b.sp * dt;
      // menuju lajur sasaran + sedikit goyang
      if (b.z < TOP - 4) {
        const wob = Math.sin(b.age * b.wf + b.ph) * b.wa;
        const lim = HW - b.r - 0.2;
        const goal = clamp(b.tx, -lim, lim);
        b.x += (goal - b.x) * (1 - Math.exp(-2.4 * dt));
        b.x = clamp(b.x + wob * dt * 1.2, -lim, lim);
      }
      const y = rampH(b.z) + b.r + Math.abs(Math.sin(b.age * 6 + b.ph)) * 0.1 * Math.min(1, b.r / 2);
      b.g.position.set(b.x, y, b.z);
      b.mesh.rotateOnAxis(this.tv.set(-1, 0, 0), (b.sp * dt) / b.r);
      // debu di belakang
      b.dustT -= dt;
      if (b.dustT <= 0 && b.z < TOP - 2) {
        b.dustT = 0.05 + 0.04 / (b.r * 0.6);
        this.particles.spawn(b.x + rand(-b.r, b.r) * 0.6, rampH(b.z) + 0.25, b.z + b.r * 0.9, 0xc8b690, 1, 1.4, 1.2, 0.35 + b.r * 0.22, 0.8, 0.5, 1.8, 0, 3);
      }
      const dp = Math.hypot(me.x - b.x, me.z - b.z);
      nearest = Math.min(nearest, dp);
      // menabrak dinding belakang
      if (b.z - b.r < BACK + 0.9) {
        this.crash(b);
        continue;
      }
    }
    if (nearest < 40 && this.rollSndT <= 0) {
      this.rollSndT = 0.13;
      sfx.rockRoll(clamp(1 - nearest / 40, 0.1, 1));
      this.shake = Math.max(this.shake, clamp(1 - nearest / 20, 0, 1) * 0.12);
    }
    // gilas kucing
    for (const b of this.boulders) {
      if (!b.active) continue;
      for (const c of this.cats) {
        if (c.finished || c.immune > 0 || b.hit.has(c)) continue;
        const dx = c.x - b.x;
        const dz = c.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d >= b.r + 0.62) continue;
        const clearance = c.y - rampH(c.z);
        if (clearance > b.r * 1.2) continue; // melompat di atas batu
        b.hit.add(c);
        c.hits++;
        c.immune = 1.1;
        const side = Math.sign(dx) || (Math.random() < 0.5 ? -1 : 1);
        this.knock(c, side * 0.45, -1, 4.5 + b.sp * 0.2, 1.2 + 0.4 * Math.min(2, b.r / 1.6), 5.5 + b.r * 0.7);
        this.particles.spawn(c.x, c.y + 1.3, c.z, 0xe8d8a8, 14, 5, 5, 0.3, 0.7, 8, 1);
        this.particles.spawn(c.x, c.y + 1.3, c.z, 0xffe14d, 8, 4, 5, 0.14, 0.5);
        if (c.isPlayer) {
          this.shake = Math.max(this.shake, 0.9);
          this.popup('💥 TERTIMPA BATU!', c.x, c.y + 3.4, c.z, '#ff8f7a', 26);
        } else if (Math.hypot(c.x - me.x, c.z - me.z) < 30) this.popup('💥', c.x, c.y + 3.2, c.z, '#ffffff', 22);
        if (Math.hypot(c.x - me.x, c.z - me.z) < 45) sfx.rockHit();
      }
    }
  }

  private crash(b: Boulder) {
    b.active = false;
    b.g.visible = false;
    const gx = b.x;
    const gz = BACK + 0.9;
    const gy = rampH(gz);
    const k = b.r / 2;
    this.particles.spawn(gx, gy + b.r * 0.5, gz, 0xb8a888, Math.round(16 * k + 6), 6 + b.r * 1.5, 7, 0.5 * (0.7 + k * 0.5), 1.2, 14, 0, 0, 5);
    this.particles.spawn(gx, gy + b.r * 0.5, gz, 0x6f6252, Math.round(10 * k + 4), 5 + b.r, 8, 0.36, 1.1, 14, 0, 0, 4);
    this.particles.spawn(gx, gy + 0.6, gz, 0xd2c29c, 10, 5, 2, 0.8, 1.2, 0, 2, 0, 4);
    const dp = Math.hypot(this.player().x - gx, this.player().z - gz);
    sfx.rockCrash(clamp(1.3 - dp / 70, 0.25, 1.2));
    this.shake = Math.max(this.shake, clamp(1.1 - dp / 38, 0, 0.9));
  }

  // ---------- tabrakan antar kucing ----------
  private hitFx(f: Cat) {
    this.particles.spawn(f.x, f.y + 1.2, f.z, 0xffe14d, 10, 4, 5, 0.14, 0.5);
    this.popup('💥 BRAK!', f.x, f.y + 2.6, f.z, '#ffe14d', 24);
    sfx.punch();
  }

  private collisions() {
    const F = this.cats;
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        const a = F[i];
        const b = F[j];
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
          this.knock(b, nx, nz, 10, 1.6, 4.5);
          this.hitFx(b);
        } else if (b.diveT > 0 && a.diveT <= 0 && rv > 4) {
          this.knock(a, -nx, -nz, 10, 1.6, 4.5);
          this.hitFx(a);
        } else if (rv > 7.5) {
          if (Math.hypot(a.vx, a.vz) < Math.hypot(b.vx, b.vz)) this.knock(a, -nx, -nz, 4, 0.9, 3.5);
          else this.knock(b, nx, nz, 4, 0.9, 3.5);
        }
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

  private knock(f: Cat, dx: number, dz: number, impulse: number, stun: number, lift: number) {
    if (f.finished) return;
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
    this.setFall(f, dx, dz, 1.45);
    f.tx.v += f.fallX * 7;
    f.tz.v += f.fallZ * 7;
    f.yawV = (Math.random() - 0.5) * 14;
    f.flailT = 0;
    if (f.isPlayer) this.shake = Math.max(this.shake, 0.6);
  }

  private doShove(f: Cat) {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    let hit = false;
    for (const o of this.cats) {
      if (o === f || o.finished) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.15 && Math.abs(o.y - f.y) < 1.6) {
        this.knock(o, fx * 0.85 + (dx / (d || 1)) * 0.15, fz * 0.85 + (dz / (d || 1)) * 0.15, 11, 1.3, 4.5);
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

  private nicheAt(s: number, z: number, tol: number) {
    return NICHES.find((n) => n.s === s && Math.abs(z - n.z) <= tol);
  }

  private clampCorridor(f: Cat) {
    f.z = clamp(f.z, f.finished ? FIN - 0.2 : BACK + 1.1, TOP - 2.4);
    const s = f.x < 0 ? -1 : 1;
    const ax = Math.abs(f.x);
    const lim = HW - 0.55;
    if (ax <= lim) return;
    if (ax > lim + 0.25) {
      const n = NICHES.find((q) => q.s === s && Math.abs(f.z - q.z) < NH + 1.4);
      if (n) {
        f.z = clamp(f.z, n.z - (NH - 0.5), n.z + (NH - 0.5));
        f.x = s * Math.min(ax, HW + ND - 0.7);
        return;
      }
    } else if (this.nicheAt(s, f.z, NH - 0.5)) {
      f.x = s * ax;
      return;
    }
    f.x = s * lim;
    if (f.vx * s > 0) f.vx *= -0.2;
  }

  private physics(f: Cat, dt: number) {
    f.shoveCd -= dt;
    f.diveCd -= dt;
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
        f.ragdoll = 0.6;
        this.setFall(f, f.vx, f.vz, 1.35);
        f.hitCd = 0.2;
      }
    }
    const diving = f.diveT > 0;

    if (inp.jump && f.grounded && !stunned && !diving && playing) {
      f.vy = JUMP_V;
      f.grounded = false;
      f.sq.v = -5;
      if (f.isPlayer) sfx.jump();
    }
    if (f.finished && f.grounded) {
      f.celT -= dt;
      if (f.celT <= 0) {
        f.vy = 8.5;
        f.grounded = false;
        f.celT = 0.85 + f.idx * 0.07;
        f.sq.v = -4;
      }
    }
    if (inp.dive && f.diveCd <= 0 && !stunned && !diving && f.grounded && playing) {
      const mag = Math.hypot(inp.mx, inp.mz);
      const fx = mag > 0.2 ? inp.mx / mag : Math.sin(f.yaw);
      const fz = mag > 0.2 ? inp.mz / mag : Math.cos(f.yaw);
      f.vx = fx * 12.5;
      f.vz = fz * 12.5;
      f.vy = 3;
      f.grounded = false;
      f.diveT = 0.4;
      f.diveCd = 1.6;
      f.yaw = Math.atan2(fx, fz);
      if (f.isPlayer) sfx.dive();
    }
    if (inp.shove && f.shoveCd <= 0 && !stunned && !diving && playing) {
      f.shoveT = 0;
      f.shoveCd = 0.75;
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
    const maxSp = 5.4;
    let dvx = inp.mx * maxSp;
    let dvz = inp.mz * maxSp;
    if (stunned || diving) {
      dvx = 0;
      dvz = 0;
    }
    let k: number;
    if (f.grounded) k = diving ? 0.5 : stunned ? 2.0 : hasIn ? 8 : 3.6;
    else k = stunned || diving ? 0.2 : hasIn ? 1.8 : 0.4;
    const a = 1 - Math.exp(-k * dt);
    f.vx += (dvx - f.vx) * a;
    f.vz += (dvz - f.vz) * a;
    // terguling turun tanjakan saat terpental
    if (stunned) f.vz -= G * rampSlope(f.z) * 0.4 * dt;

    const sp = Math.hypot(f.vx, f.vz);
    if (stunned) {
      f.yaw += f.yawV * dt;
      f.yawV *= Math.exp(-2.2 * dt);
    } else if (diving) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-30 * dt));
    } else if (hasIn) {
      f.yaw += angDiff(Math.atan2(inp.mx, inp.mz), f.yaw) * (1 - Math.exp(-12 * dt));
    } else if (sp > 1.4) {
      f.yaw += angDiff(Math.atan2(f.vx, f.vz), f.yaw) * (1 - Math.exp(-8 * dt));
    }

    f.x += f.vx * dt;
    f.z += f.vz * dt;
    this.clampCorridor(f);

    const gy = rampH(f.z);
    f.vy -= GRAV * dt;
    f.y += f.vy * dt;
    if (f.y <= gy && f.vy <= 0) {
      if (!f.grounded && f.vy < -4) {
        f.sq.v += Math.min(-f.vy, 14) * 0.45;
        if (-f.vy > 7) this.particles.spawn(f.x, gy + 0.1, f.z, 0xd8c8a0, 5, 2, 1.5, 0.16, 0.45, 6, 1);
      }
      f.y = gy;
      f.vy = 0;
      f.grounded = true;
    } else if (f.y > gy + 0.001) f.grounded = false;

    f.maxZ = Math.max(f.maxZ, f.z);
    if (!f.finished && f.z >= FIN && playing) this.finish(f);
  }

  private finish(f: Cat) {
    f.finished = true;
    f.finishTime = this.playTime;
    f.immune = 9999;
    f.ragdoll = 0;
    const rank = ++this.finCount;
    this.particles.spawn(f.x, f.y + 2, f.z, 0xffd23f, 18, 6, 8, 0.2, 1.1, 6);
    this.particles.spawn(f.x, f.y + 2, f.z, 0xffffff, 10, 5, 7, 0.16, 1, 6);
    if (f.isPlayer) {
      sfx.idolGet();
      this.popup(`🏆 SAMPAI! #${rank}`, f.x, f.y + 3.4, f.z, '#ffd23f', 34);
      this.shake = Math.max(this.shake, 0.5);
    } else this.popup(`#${rank}`, f.x, f.y + 3.2, f.z, '#' + f.color.slice(1), 24);
    if (rank === 1) {
      this.banner = f.isPlayer ? '🏆 KAMU PERTAMA DI PUNCAK!' : `${f.name} PERTAMA DI PUNCAK!`;
      this.bannerT = 2.6;
      this.grace = true;
      this.timeLeft = Math.min(this.timeLeft, GRACE);
    } else if (f.isPlayer) {
      this.banner = `SAMPAI! Juara ${rank}`;
      this.bannerT = 2;
    }
  }

  // ---------- animasi ----------
  private animate(f: Cat, dt: number) {
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
      let tgx = clamp(lz * 0.055, -0.5, 0.5) + 0.06;
      const tgz = clamp(-lx * 0.05, -0.4, 0.4);
      if (diving) tgx = 1.3;
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
    if (f.grounded) f.walk += sp * dt * 2.5;
    const sw = Math.sin(f.walk) * walkAmp;
    let aL = sw * 0.95;
    let aR = -sw * 0.95;
    let lL = -sw * 0.9;
    let lR = sw * 0.9;
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
    if (f.finished) {
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
    const bob = f.grounded && !f.finished ? Math.abs(Math.sin(f.walk)) * 0.07 * walkAmp : 0;
    rig.root.position.set(f.x, f.y + lift + bob, f.z);
    rig.root.rotation.set(0, f.yaw, 0);
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
    rig.root.updateMatrixWorld(true);
  }

  // ---------- kamera ala Fall Guys ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.player();
    const aspect = this.w / this.h;
    const zoom = aspect < 0.8 ? 1.5 : aspect < 1.25 ? 1.2 : 1;
    const desired = this.tv;
    const look = this.tv2;
    let fov = 62;
    let kc = instant ? 1 : 1 - Math.exp(-13 * dt);
    let kl = instant ? 1 : 1 - Math.exp(-17 * dt);
    if (this.phase === 'menu' || this.phase === 'results') {
      const a = Math.sin(this.time * 0.18);
      desired.set(a * 5.5, 4.2 * zoom, BACK + 2.2 - (zoom - 1) * 3);
      look.set(a * 1.5, 3.6, 14);
      fov = 62;
      kc = kl = instant ? 1 : 1 - Math.exp(-3.2 * dt);
    } else {
      this.camYaw -= this.mdx * 0.0026;
      this.camPitch = clamp(this.camPitch + this.mdy * 0.0026, 0.12, 1.15);
      if (Math.abs(this.mdx) + Math.abs(this.mdy) > 1) this.manualT = 1.6;
      this.mdx = this.mdy = 0;
      if (this.keys.has('KeyQ')) {
        this.camYaw += 1.9 * dt;
        this.manualT = 1.6;
      }
      if (this.keys.has('KeyR')) {
        this.camYaw -= 1.9 * dt;
        this.manualT = 1.6;
      }
      this.manualT -= dt;
      // kembali menghadap ke atas tanjakan bila tidak diputar manual
      if (this.manualT <= 0 && Math.hypot(me.vx, me.vz) > 1) this.camYaw += angDiff(0, this.camYaw) * (1 - Math.exp(-0.8 * dt));
      this.camYaw = clamp(this.camYaw, -Math.PI, Math.PI);
      if (this.phase === 'countdown') {
        kc = instant ? 1 : 1 - Math.exp(-4 * dt);
        kl = instant ? 1 : 1 - Math.exp(-5 * dt);
      }
      const tx = me.x;
      const ty = me.y + 1.6;
      const tz = me.z;
      const dist = 10.5 * zoom;
      const horiz = Math.cos(this.camPitch) * dist;
      const up = Math.sin(this.camPitch) * dist;
      const sy = Math.sin(this.camYaw);
      const cy = Math.cos(this.camYaw);
      desired.set(tx - sy * horiz, ty + up + 0.7, tz - cy * horiz);
      desired.x = clamp(desired.x, -(HW - 0.4), HW - 0.4);
      desired.z = Math.max(desired.z, BACK + 1.2);
      desired.y = Math.max(desired.y, rampH(desired.z) + 1.6);
      look.set(tx + sy * 3, ty + 0.9, tz + cy * 3);
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
      const p = this.project(f.x, f.y + 3.7, f.z);
      f.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      f.tag.style.display = p.vis ? 'block' : 'none';
      let ind = '';
      if (f.finished) ind = '🏆';
      else if (f.ragdoll > 0) ind = '💫';
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
  private progressOf(c: Cat) {
    const z0 = c.start.z;
    return clamp((c.maxZ - z0) / (FIN - z0), 0, 1);
  }

  private buildHud(): RuinsHudState {
    const me = this.player();
    const rank = this.ranking();
    const board: RBoardEntry[] = rank.map((c, i) => ({
      id: c.idx,
      name: c.name,
      animal: c.def.id,
      color: c.color,
      isPlayer: c.isPlayer,
      rank: i + 1,
      finished: c.finished,
      time: c.finishTime,
      progress: c.finished ? 1 : this.progressOf(c),
      hits: c.hits,
    }));
    const playing = this.phase === 'playing';
    let danger = 0;
    if (playing && !me.finished) {
      const th = this.threatOf(me);
      if (th && th.t < 2) danger = clamp(1 - th.t / 2, 0.15, 1);
    }
    const inNiche = Math.abs(me.x) > HW + 0.4;
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! Panjat tanjakan kuil menuju berhala emas — hindari batu! 🗿';
    else if (playing) {
      if (me.finished) hint = '🏆 Kamu sampai di puncak! Tunggu yang lain...';
      else if (me.ragdoll > 0) hint = 'Kamu terhantam batu! 💫 Bangkit lalu naik lagi!';
      else if (danger > 0.4) hint = '⚠ BATU DI ARAHMU! Geser ke samping / loncat (batu kecil) / SHIFT terjang';
      else if (inNiche) hint = '✅ Kamu aman di relung dinding. Tunggu batu lewat...';
      else if (this.playTime < 10) hint = 'WASD naik · SPASI loncat batu kecil · SHIFT terjang · relung di dinding = tempat aman';
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT)),
      go: playing && this.goT > 0,
      timeLeft: this.timeLeft,
      grace: this.grace && playing,
      board,
      me: {
        progress: me.finished ? 1 : this.progressOf(me),
        finished: me.finished,
        stunned: me.ragdoll > 0,
        diveReady: clamp(1 - me.diveCd / 1.6, 0, 1),
        shoveReady: clamp(1 - me.shoveCd / 0.75, 0, 1),
        danger,
        hits: me.hits,
        inNiche,
      },
      track: {
        boulders: this.boulders.filter((b) => b.active).map((b) => ({ p: clamp((b.z - 0) / (FIN - 0), 0, 1.1), x: b.x, r: b.r })),
        cats: this.cats.map((c) => ({ p: c.finished ? 1 : this.progressOf(c), x: c.x, color: c.color, me: c.isPlayer, fin: c.finished })),
      },
      alert: this.alert ? { ...this.alert } : null,
      banner: this.banner,
      camYaw: this.camYaw,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }
}
