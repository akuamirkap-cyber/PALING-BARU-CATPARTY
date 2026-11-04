import * as THREE from 'three';
import { ANIMALS, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';
import { sfx } from './audio';
import { kartAudio, AudioRacer } from './kartAudio';
import { BOX_SETS, buildKartWorld, KartWorld, Loc, PAD_DEFS, Pos, ROAD_HALF, Track, TN, WALL_LAT } from './kartWorld';

export const LAPS = 3;
export const MAX_SPEED = 34;
export type KPhase = 'menu' | 'countdown' | 'racing' | 'finished' | 'results';
export type ItemType = 'boost' | 'banana' | 'shell';

export interface KBoardEntry {
  id: number;
  name: string;
  animal: string;
  color: string;
  isPlayer: boolean;
  pos: number;
  finished: boolean;
  time: number | null;
  lap: number;
}

export interface KartHudState {
  phase: KPhase;
  countdown: number;
  go: boolean;
  lap: number;
  laps: number;
  position: number;
  raceTime: number;
  lapTime: number;
  bestLap: number | null;
  speed: number;
  speedNorm: number;
  boost: boolean;
  boostLeft: number;
  driftLevel: number;
  driftCharge: number;
  drifting: boolean;
  item: ItemType | null;
  itemRolling: boolean;
  draft: number;
  wrongWay: boolean;
  offroad: boolean;
  banner: string;
  board: KBoardEntry[];
  dots: { x: number; y: number; color: string; me: boolean }[];
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

interface Inp {
  gas: number;
  brake: boolean;
  steer: number;
  drift: boolean;
  item: boolean;
}
const NOINP: Inp = { gas: 0, brake: false, steer: 0, drift: false, item: false };

const mat = (c: number, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const BOT_NAMES = ['Mochi', 'Gembul', 'Kiko', 'Bonbon', 'Cimol', 'Pocky', 'Tuyul', 'Boba', 'Nugget'];

// ---------- model gokart ----------
function buildKartModel(color: number) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = mat(color, 0.3, 0.15);
  const white = mat(0xffffff, 0.4);
  const dark = mat(0x23232b, 0.7);

  const s = new THREE.Shape();
  s.moveTo(-0.5, -1.35);
  s.lineTo(0.5, -1.35);
  s.quadraticCurveTo(0.92, -1.2, 0.94, -0.5);
  s.lineTo(0.94, 0.9);
  s.quadraticCurveTo(0.94, 1.3, 0.55, 1.3);
  s.lineTo(-0.55, 1.3);
  s.quadraticCurveTo(-0.94, 1.3, -0.94, 0.9);
  s.lineTo(-0.94, -0.5);
  s.quadraticCurveTo(-0.92, -1.2, -0.5, -1.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2);
  const chassis = new THREE.Mesh(geo, paint);
  chassis.position.y = 0.3;
  body.add(chassis);

  // lantai gelap bawah
  const under = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 2.5), dark);
  under.position.y = 0.26;
  body.add(under);

  // rim kokpit
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 8, 24), white);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.05, 1.25, 1);
  rim.position.set(0, 0.82, -0.28);
  body.add(rim);

  // strip putih di kap
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.95), white);
  stripe.position.set(0, 0.835, 0.82);
  body.add(stripe);
  const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.55), white);
  stripe2.position.set(0, 0.835, -1.0);
  body.add(stripe2);

  // setir
  const wheelTop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 16), dark);
  wheelTop.position.set(0, 1.3, 0.45);
  wheelTop.rotation.x = -0.95;
  body.add(wheelTop);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), dark);
  col.position.set(0, 1.12, 0.4);
  col.rotation.x = -0.95;
  body.add(col);

  // bumper depan
  const bumper = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 1.35, 4, 10), white);
  bumper.rotation.z = Math.PI / 2;
  bumper.position.set(0, 0.45, 1.62);
  body.add(bumper);
  for (const sd of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
    lamp.position.set(sd * 0.55, 0.7, 1.52);
    lamp.scale.z = 0.6;
    body.add(lamp);
  }

  // spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.55), paint);
  wing.position.set(0, 1.2, -1.45);
  body.add(wing);
  const wing2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.12), white);
  wing2.position.set(0, 1.26, -1.2);
  body.add(wing2);
  for (const sd of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.12), dark);
    post.position.set(sd * 0.55, 0.95, -1.38);
    body.add(post);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.45, 10), mat(0x9aa0aa, 0.3, 0.7));
    ex.rotation.x = Math.PI / 2;
    ex.position.set(sd * 0.4, 0.5, -1.55);
    body.add(ex);
  }

  // api turbo
  const flames: THREE.Mesh[] = [];
  const fg = new THREE.ConeGeometry(0.16, 1.1, 8);
  fg.translate(0, 0.55, 0);
  fg.rotateX(-Math.PI / 2);
  for (const sd of [-1, 1]) {
    const f = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.9 }));
    f.position.set(sd * 0.4, 0.5, -1.78);
    f.visible = false;
    body.add(f);
    flames.push(f);
    const f2 = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffee88 }));
    f2.scale.set(0.5, 0.5, 0.6);
    f2.position.set(sd * 0.4, 0.5, -1.78);
    f2.visible = false;
    body.add(f2);
    flames.push(f2);
  }

  // roda
  const tireM = mat(0x1b1b20, 0.9);
  const hubM = mat(0xf2f2f2, 0.3, 0.4);
  const spinners: THREE.Group[] = [];
  const pivots: THREE.Group[] = [];
  const mk = (x: number, z: number, r: number, w: number, front: boolean) => {
    const pv = new THREE.Group();
    pv.position.set(x, r, z);
    const sp = new THREE.Group();
    const tg = new THREE.CylinderGeometry(r, r, w, 18);
    tg.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tg, tireM);
    tire.castShadow = true;
    const hg = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.04, 12);
    hg.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hg, hubM);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, r * 0.25, r * 0.25), new THREE.MeshStandardMaterial({ color }));
    mark.position.y = r * 0.3;
    sp.add(tire, hub, mark);
    pv.add(sp);
    body.add(pv);
    spinners.push(sp);
    if (front) pivots.push(pv);
  };
  mk(-1.05, 0.95, 0.42, 0.4, true);
  mk(1.05, 0.95, 0.42, 0.4, true);
  mk(-1.08, -0.95, 0.5, 0.55, false);
  mk(1.08, -0.95, 0.5, 0.55, false);

  // kursi untuk kucing
  const seat = new THREE.Group();
  seat.position.set(0, 0.74, -0.2);
  seat.scale.setScalar(0.66);
  body.add(seat);

  // lampu rem
  const brakeMats: THREE.MeshBasicMaterial[] = [];
  for (const sd of [-1, 1]) {
    const bm = new THREE.MeshBasicMaterial({ color: 0x6a1212 });
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.08), bm);
    bl.position.set(sd * 0.62, 0.68, -1.5);
    body.add(bl);
    brakeMats.push(bm);
  }
  // syal berkibar (rantai segmen)
  const scarf: THREE.Group[] = [];
  let prev: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    if (i === 0) seg.position.set(0, 1.62, -0.52);
    else seg.position.set(0, 0, -0.3);
    const geo = new THREE.BoxGeometry(0.3 - i * 0.025, 0.03, 0.33);
    geo.translate(0, 0, -0.15);
    seg.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : color, roughness: 0.7, side: THREE.DoubleSide })));
    prev.add(seg);
    scarf.push(seg);
    prev = seg;
  }

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) m.castShadow = true;
  });
  return { g, body, seat, spinners, pivots, flames, brakeMats, scarf };
}

class Racer {
  idx: number;
  name: string;
  animal: string;
  color: string;
  colorHex: number;
  isPlayer: boolean;
  skill: number;
  skillMul: number;
  rig: Rig;
  group: THREE.Group;
  body: THREE.Group;
  spinners: THREE.Group[];
  pivots: THREE.Group[];
  flames: THREE.Mesh[];
  tag: HTMLDivElement;
  indEl: HTMLDivElement;

  x = 0;
  z = 0;
  y = 0;
  vy = 0;
  vx = 0;
  vz = 0;
  vf = 0;
  vr = 0;
  pvf = 0;
  pvr = 0;
  af = 0;
  ar = 0;
  yaw = 0;
  steer = 0;
  drift = { on: false, dir: 0, t: 0, level: 0 };
  prevDrift = false;
  boostT = 0;
  boostMax = 1;
  spinT = 0;
  invT = 0;
  padCd = 0;
  item: ItemType | null = null;
  itemT = 0;
  hint = 0;
  lat = 0;
  locYaw = 0;
  nrx = 0;
  nrz = 0;
  idxF = 0;
  total = 0;
  lap = 0;
  lapStart = 0;
  bestLap = Infinity;
  finished = false;
  finishTime = 0;
  place = 0;
  lineLat = 0;
  boxPref = 0;
  stuckT = 0;
  wrongT = 0;
  wheelRot = 0;
  sparkT = 0;
  smokeT = 0;
  lastDriftLevel = 0;
  slot = 0;
  brakeMats: THREE.MeshBasicMaterial[];
  scarf: THREE.Group[];
  itemRoll = 0;
  draftT = 0;
  drafting = false;
  slip = 0;
  gasIn = 0;
  braking = false;
  scarfSw = 0;
  skidL = { x: 0, z: 0, ok: false };
  skidR = { x: 0, z: 0, ok: false };
  headY = new Spring();

  pitch = new Spring();
  roll = new Spring();
  sq = new Spring();
  catX = new Spring();
  catZ = new Spring();
  headX = new Spring();
  headZ = new Spring();
  tail = new Spring();
  armL = new Spring();
  armR = new Spring();
  flail = [0, 0];
  flailT = 0;

  constructor(idx: number, animalId: string, name: string, isPlayer: boolean, skill: number) {
    this.idx = idx;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.skillMul = skill;
    this.color = PLAYER_COLORS[idx];
    this.colorHex = parseInt(this.color.slice(1), 16);
    this.animal = animalId;
    const def = ANIMALS.find((a) => a.id === animalId) ?? ANIMALS[0];
    const k = buildKartModel(this.colorHex);
    this.group = k.g;
    this.body = k.body;
    this.spinners = k.spinners;
    this.pivots = k.pivots;
    this.flames = k.flames;
    this.brakeMats = k.brakeMats;
    this.scarf = k.scarf;
    this.rig = buildAnimal(def, this.colorHex);
    this.rig.ring.visible = false;
    this.rig.rodRoot.visible = false;
    k.seat.add(this.rig.root);
    this.lineLat = rand(-3.5, 3.5);
    this.boxPref = [-6, -2, 2, 6][Math.floor(Math.random() * 4)];

    this.tag = document.createElement('div');
    this.tag.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;text-align:center;will-change:transform;white-space:nowrap;';
    this.indEl = document.createElement('div');
    this.indEl.style.cssText = 'font-size:26px;height:30px;line-height:30px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35));';
    const nm = document.createElement('div');
    nm.textContent = isPlayer ? `▼ ${name}` : name;
    nm.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-weight:800;font-size:${isPlayer ? 15 : 13}px;color:#fff;background:${this.color};border:2px solid #fff;box-shadow:0 2px 0 rgba(0,0,0,.3);text-shadow:0 1px 0 rgba(0,0,0,.35);`;
    this.tag.append(this.indEl, nm);
  }
}

class Particles {
  pool: { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; grav: number; size: number; grow: number }[] = [];
  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 6, 5);
    for (let i = 0; i < 320; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 14, size: 0.1, grow: 0 });
    }
  }
  spawn(x: number, y: number, z: number, color: number, n: number, speed: number, up: number, size: number, life: number, grav = 14, grow = 0, vx = 0, vz = 0) {
    for (let k = 0; k < n; k++) {
      const p = this.pool.find((q) => q.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      p.vx = Math.cos(a) * s + vx;
      p.vz = Math.sin(a) * s + vz;
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
      p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt);
      p.m.position.z += p.vz * dt;
      const t = p.life / p.max;
      p.m.scale.setScalar(p.size * (p.grow ? 1 + (1 - t) * p.grow : 0.3 + 0.7 * t));
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 2) * (p.grow ? 0.38 : 1);
    }
  }
}

interface Hazard {
  x: number;
  z: number;
  mesh: THREE.Group;
  life: number;
  owner: Racer;
  age: number;
}
interface Shell {
  f: number;
  lat: number;
  speed: number;
  target: Racer | null;
  mesh: THREE.Group;
  life: number;
  owner: Racer;
  age: number;
}

function bananaMesh() {
  const g = new THREE.Group();
  const m = mat(0xffe14d, 0.4);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 8, 14, Math.PI * 1.05), m);
  arc.rotation.set(0, 0, Math.PI * 0.98);
  arc.position.y = 0.55;
  g.add(arc);
  for (const sd of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x6b4a1e));
    tip.position.set(sd * 0.5, 0.55, 0);
    g.add(tip);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.06;
  g.add(sh);
  return g;
}
function shellMesh() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), mat(0xee3b3b, 0.3));
  s.position.y = 0.8;
  s.scale.y = 0.85;
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 8, 20), mat(0xffffff, 0.4));
  r.rotation.x = Math.PI / 2;
  r.position.y = 0.8;
  const st = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), mat(0xffffff, 0.4));
  st.position.y = 1.5;
  g.add(s, r, st);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  return g;
}

export class KartEngine {
  private container: HTMLElement;
  private onHud: (h: KartHudState) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private overlay: HTMLDivElement;
  private track: Track;
  private world: KartWorld;
  private particles: Particles;
  private racers: Racer[] = [];
  private order: Racer[] = [];
  private hazards: Hazard[] = [];
  private shells: Shell[] = [];
  private loc: Loc = { i: 0, lat: 0, f: 0, rx: 0, rz: 0, yaw: 0 };
  private tmp: Pos = { x: 0, z: 0, yaw: 0 };
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private ro: ResizeObserver;

  phase: KPhase = 'menu';
  private phaseT = 0;
  private lastCount = 0;
  private raceTime = 0;
  private goT = 0;
  private finishCount = 0;
  private bannerT = 0;
  private banner = '';
  private playerAnimal = 'tuxedo';
  private shake = 0;
  private bumpAt = 0;
  private gridCenter = new THREE.Vector3();
  private skids!: THREE.InstancedMesh;
  private skidN = 0;
  private dummy = new THREE.Object3D();
  private confettiT = 0;
  private camSide = 0;
  private wasRolling = false;
  private lastRoll = -1;
  private tv3 = new THREE.Vector3();

  private keys = new Set<string>();
  private pend = { item: false, respawn: false };
  private joyX = 0;
  private autoGas = false;
  private touchBrake = false;
  private touchDrift = false;
  private gasPressT = -99;
  private gasWas = false;

  private camPos = new THREE.Vector3(0, 12, -20);
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  private camFov = 62;
  private tv = new THREE.Vector3();
  private tv2 = new THREE.Vector3();

  minimapPath = '';
  private mapB = { minx: 0, minz: 0, s: 1, ox: 0, oz: 0 };

  constructor(container: HTMLElement, onHud: (h: KartHudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.2, 900);
    this.track = new Track();
    this.world = buildKartWorld(this.scene, this.track);
    this.particles = new Particles(this.scene);
    const sg = new THREE.PlaneGeometry(0.34, 1.15);
    sg.rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(
      sg,
      new THREE.MeshBasicMaterial({ color: 0x0c0c10, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      900,
    );
    this.skids.frustumCulled = false;
    this.scene.add(this.skids);
    this.clearSkids();
    this.buildMinimap();
    this.setupRacers(this.playerAnimal);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    this.last = performance.now();
    this.updateCamera(1, true);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    kartAudio.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---------- API ----------
  setPlayerAnimal(id: string) {
    this.playerAnimal = id;
    this.setupRacers(id);
  }
  start() {
    sfx.resume();
    kartAudio.start(4);
    this.camSide = 0;
    this.resetRace();
    this.phase = 'countdown';
    this.phaseT = 3.4;
    this.lastCount = 4;
    this.camPos.set(this.gridCenter.x - 18, 14, this.gridCenter.z - 22);
  }
  toMenu() {
    kartAudio.stop();
    this.resetRace();
    this.phase = 'menu';
  }
  toggleMute() {
    sfx.muted = !sfx.muted;
  }
  setJoy(x: number) {
    this.joyX = x;
  }
  setAutoGas(v: boolean) {
    this.autoGas = v;
  }
  setTouchBrake(v: boolean) {
    this.touchBrake = v;
  }
  setTouchDrift(v: boolean) {
    sfx.resume();
    this.touchDrift = v;
  }
  touchItem() {
    this.pend.item = true;
  }
  touchRespawn() {
    this.pend.respawn = true;
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    sfx.resume();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'KeyF') this.pend.item = true;
    if (e.code === 'KeyR') this.pend.respawn = true;
    if (e.code === 'KeyM') sfx.muted = !sfx.muted;
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  private resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- setup ----------
  private buildMinimap() {
    const t = this.track;
    let minx = 1e9;
    let maxx = -1e9;
    let minz = 1e9;
    let maxz = -1e9;
    for (let i = 0; i < TN; i++) {
      minx = Math.min(minx, t.px[i]);
      maxx = Math.max(maxx, t.px[i]);
      minz = Math.min(minz, t.pz[i]);
      maxz = Math.max(maxz, t.pz[i]);
    }
    const s = 84 / Math.max(maxx - minx, maxz - minz);
    this.mapB = { minx, minz, s, ox: 8 + (84 - (maxx - minx) * s) / 2, oz: 8 + (84 - (maxz - minz) * s) / 2 };
    const pts: string[] = [];
    for (let i = 0; i <= TN; i += 8) {
      const k = i % TN;
      pts.push(`${this.mx(t.px[k]).toFixed(1)},${this.mz(t.pz[k]).toFixed(1)}`);
    }
    this.minimapPath = pts.join(' ');
  }
  private mx(x: number) {
    return this.mapB.ox + (x - this.mapB.minx) * this.mapB.s;
  }
  private mz(z: number) {
    return this.mapB.oz + (z - this.mapB.minz) * this.mapB.s;
  }

  private setupRacers(animalId: string) {
    for (const r of this.racers) {
      this.scene.remove(r.group);
      r.tag.remove();
    }
    this.racers = [];
    const others = ANIMALS.filter((a) => a.id !== animalId).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const skills = [0.9, 0.945, 0.975];
    const ids = [animalId, others[0].id, others[1].id, others[2].id];
    ids.forEach((id, i) => {
      const r = new Racer(i, id, i === 0 ? 'KAMU' : names[i - 1], i === 0, i === 0 ? 1 : skills[i - 1]);
      this.scene.add(r.group);
      this.overlay.appendChild(r.tag);
      this.racers.push(r);
    });
    this.resetRace();
  }

  private resetRace() {
    this.hazards.forEach((h) => this.scene.remove(h.mesh));
    this.shells.forEach((s) => this.scene.remove(s.mesh));
    this.hazards = [];
    this.shells = [];
    this.world.boxes.forEach((b) => {
      b.cd = 0;
      b.mesh.visible = true;
    });
    const slots = [2, 0, 1, 3]; // pemain mulai di barisan belakang kiri
    this.racers.forEach((r, i) => {
      r.slot = slots[i];
      const row = r.slot >> 1;
      const col = r.slot & 1;
      const f = -(4 + row * 5 + col * 2) / this.track.spacing;
      this.track.posAt(f, col ? 3.2 : -3.2, this.tmp);
      r.x = this.tmp.x;
      r.z = this.tmp.z;
      r.yaw = this.tmp.yaw;
      r.y = 0;
      r.vy = r.vx = r.vz = r.vf = r.vr = r.pvf = r.pvr = 0;
      r.steer = 0;
      r.drift = { on: false, dir: 0, t: 0, level: 0 };
      r.prevDrift = false;
      r.boostT = 0;
      r.spinT = 0;
      r.invT = 0;
      r.item = null;
      r.itemRoll = 0;
      r.draftT = 0;
      r.drafting = false;
      r.slip = 0;
      r.gasIn = 0;
      r.braking = false;
      r.skidL.ok = false;
      r.skidR.ok = false;
      r.headY.a = 0;
      r.headY.v = 0;
      r.lap = 0;
      r.lapStart = 0;
      r.bestLap = Infinity;
      r.finished = false;
      r.finishTime = 0;
      r.place = 0;
      r.stuckT = 0;
      r.wrongT = 0;
      this.track.locateFull(r.x, r.z, this.loc);
      r.hint = this.loc.i;
      r.lat = this.loc.lat;
      r.idxF = this.track.wrap(this.loc.f);
      r.total = f;
      r.skillMul = r.skill;
      r.tag.style.display = 'block';
      for (const s of [r.pitch, r.roll, r.sq, r.catX, r.catZ, r.headX, r.headZ, r.tail, r.armL, r.armR]) {
        s.a = 0;
        s.v = 0;
      }
    });
    this.order = [...this.racers];
    this.clearSkids();
    this.confettiT = 0;
    this.raceTime = 0;
    this.finishCount = 0;
    this.goT = 0;
    this.banner = '';
    this.bannerT = 0;
    // pusat grid untuk kamera menu
    this.gridCenter.set(0, 0, 0);
    this.racers.forEach((r) => this.gridCenter.add(this.tv.set(r.x, 0, r.z)));
    this.gridCenter.multiplyScalar(1 / this.racers.length);
    this.camYaw = this.racers[0].yaw;
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

  private player() {
    return this.racers[0];
  }

  private update(dt: number) {
    const me = this.player();
    this.updatePhase(dt);
    const racing = this.phase === 'racing' || this.phase === 'finished' || this.phase === 'results';

    // lacak waktu tekan gas (rocket start)
    const gasNow = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    if (gasNow && !this.gasWas) this.gasPressT = this.time;
    this.gasWas = gasNow;
    if (this.phase === 'countdown') {
      me.gasIn = gasNow ? 1 : 0;
      for (const r of this.racers) if (!r.isPlayer) r.gasIn = this.phaseT < 1.7 ? 1 : 0;
    }

    if (!racing) this.sortOrder();
    if (racing) {
      this.sortOrder();
      for (const r of this.racers) {
        let inp: Inp;
        if (r.isPlayer && !r.finished && this.phase === 'racing') inp = this.playerInput(r);
        else inp = this.botInput(r, dt);
        r.itemRoll = Math.max(0, r.itemRoll - dt);
        if (r.item && r.itemRoll <= 0 && inp.item && this.phase !== 'results') this.useItem(r);
        this.physics(r, inp, dt);
      }
      this.collisions();
      this.interactions(dt);
      this.updateHazards(dt);
      this.checkLaps();
      this.sortOrder();
    }

    for (const r of this.racers) this.visual(r, dt);
    this.world.update(this.time, me.x, me.z);
    this.particles.update(dt);
    this.updateCamera(dt, false);
    this.updateLabels();

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = '';
    }
    // roulette item + konfeti
    if (me.itemRoll > 0) {
      const kk = Math.floor(me.itemRoll * 14);
      if (kk !== this.lastRoll) {
        this.lastRoll = kk;
        sfx.reelTick(0.2 + (kk % 3) * 0.35);
      }
      this.wasRolling = true;
    } else if (this.wasRolling) {
      this.wasRolling = false;
      this.lastRoll = -1;
      if (me.item) sfx.itemGet();
    }
    if (this.confettiT > 0) {
      this.confettiT -= dt;
      const cols = [0xff4d6d, 0xffd23f, 0x4dd0ff, 0x7cf05a, 0xb26bff, 0xffffff];
      for (let q = 0; q < 3; q++) this.particles.spawn(me.x + rand(-4, 4), 5 + Math.random() * 2, me.z + rand(-4, 4), cols[Math.floor(Math.random() * cols.length)], 1, 2, 1, 0.16, 1.8, 3.5);
    }
    this.updateAudio(dt);
    this.onHud(this.buildHud());
  }

  private updatePhase(dt: number) {
    switch (this.phase) {
      case 'countdown': {
        this.phaseT -= dt;
        const n = Math.ceil(this.phaseT - 0.4);
        if (n !== this.lastCount && n > 0 && n <= 3) {
          this.lastCount = n;
          sfx.tick();
        }
        if (this.phaseT <= 0.4 && this.phase === 'countdown') {
          this.phase = 'racing';
          this.raceTime = 0;
          this.goT = 1.2;
          sfx.go();
          const me = this.player();
          const since = this.time - this.gasPressT;
          if (this.gasWas && since >= 0 && since < 0.9) {
            me.boostT = 1.3;
            this.popup('🚀 ROCKET START!', me.x, 3.5, me.z, '#ffe14d', 30);
            sfx.boost();
          }
          for (const r of this.racers) if (!r.isPlayer && Math.random() < 0.55) r.boostT = 0.9;
        }
        break;
      }
      case 'racing': {
        this.raceTime += dt;
        this.goT -= dt;
        if (this.raceTime > 200) {
          this.phase = 'finished';
          this.phaseT = 1.5;
        }
        break;
      }
      case 'finished': {
        this.raceTime += dt;
        this.phaseT -= dt;
        const all = this.racers.every((r) => r.finished);
        if (all) this.phaseT = Math.min(this.phaseT, 1.2);
        if (this.phaseT <= 0) {
          this.phase = 'results';
          sfx.fanfare();
        }
        break;
      }
    }
  }

  private sortOrder() {
    this.order = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.total - a.total;
    });
  }
  private rankOf(r: Racer) {
    return this.order.indexOf(r);
  }

  // ---------- input pemain ----------
  private playerInput(r: Racer): Inp {
    const k = this.keys;
    const steer = clamp((k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joyX, -1, 1);
    const brake = k.has('KeyS') || k.has('ArrowDown') || this.touchBrake;
    let gas = k.has('KeyW') || k.has('ArrowUp') || this.autoGas ? 1 : 0;
    if (brake) gas = 0;
    const inp: Inp = { gas, brake, steer, drift: k.has('Space') || this.touchDrift, item: this.pend.item };
    this.pend.item = false;
    if (this.pend.respawn) {
      this.pend.respawn = false;
      this.respawn(r);
    }
    return inp;
  }

  // ---------- bot ----------
  private botInput(r: Racer, dt: number): Inp {
    const tr = this.track;
    const cruise = r.finished || this.phase === 'results';
    const me = this.player();
    // rubber band halus
    if (!r.isPlayer && !r.finished) {
      const dMeters = (me.total - r.total) * tr.spacing;
      r.skillMul = r.skill + clamp(dMeters * 0.0006, -0.05, 0.065);
    }
    const vf = r.vf;
    const look = 10 + Math.max(0, vf) * 0.5;
    const fAhead = r.idxF + look / tr.spacing;
    const i0 = tr.wrap(Math.round(r.idxF));
    const i1 = tr.wrap(Math.round(r.idxF + 30));
    const i2 = tr.wrap(Math.round(r.idxF + 12));
    const ang = angDiff(tr.yaw[i1], tr.yaw[i0]);
    const ang2 = angDiff(tr.yaw[i2], tr.yaw[i0]);
    let lat = r.lineLat * 0.45 - clamp(ang * 5.5, -5.5, 5.5);

    // ambil item box
    if (!r.item) {
      for (const bf of BOX_SETS) {
        const d = tr.wrap(bf - r.idxF);
        if (d < 50) lat = r.boxPref;
      }
    }
    // hindari kart di depan
    for (const o of this.racers) {
      if (o === r) continue;
      const dm = (o.total - r.total) * tr.spacing;
      if (dm > 0 && dm < 15 && Math.abs(o.lat - lat) < 3.2) lat += (o.lat >= lat ? -1 : 1) * 3.6;
    }
    lat = clamp(lat, -(ROAD_HALF - 2), ROAD_HALF - 2);
    tr.posAt(fAhead, lat, this.tmp);
    const desired = Math.atan2(this.tmp.x - r.x, this.tmp.z - r.z);
    const err = angDiff(desired, r.yaw);
    const steer = clamp(-err * 2.1, -1, 1);

    const turn = Math.max(Math.abs(ang), Math.abs(ang2) * 1.4);
    let cornerSpeed = MAX_SPEED * r.skillMul * (1 - clamp(turn * 0.52 - 0.1, 0, 0.45));
    if (cruise) cornerSpeed *= 0.55;
    let gas = 0;
    if (vf < cornerSpeed) gas = 1;
    else if (vf < cornerSpeed + 3) gas = 0.35;
    const brake = vf > cornerSpeed + 9;

    // item
    let useItem = false;
    if (r.item && !cruise) {
      r.itemT -= dt;
      if (r.itemT <= 0) {
        if (r.item === 'boost') useItem = Math.abs(ang) < 0.35 || r.itemT < -3;
        else if (r.item === 'banana') {
          useItem = this.racers.some((o) => o !== r && (r.total - o.total) * tr.spacing > 3 && (r.total - o.total) * tr.spacing < 16 && Math.abs(o.lat - r.lat) < 5) || r.itemT < -8;
        } else if (r.item === 'shell') {
          useItem = this.racers.some((o) => o !== r && (o.total - r.total) * tr.spacing > 8 && (o.total - r.total) * tr.spacing < 90) || r.itemT < -8;
        }
      }
    }
    return { gas: this.phase === 'racing' || this.phase === 'finished' || this.phase === 'results' ? gas : 0, brake, steer, drift: false, item: useItem };
  }

  // ---------- item ----------
  private giveItem(r: Racer) {
    if (r.item) return;
    const rank = clamp(this.rankOf(r), 0, 3);
    const W: Record<ItemType, number[]> = { boost: [30, 38, 46, 56], banana: [54, 30, 20, 8], shell: [16, 32, 34, 36] };
    const total = W.boost[rank] + W.banana[rank] + W.shell[rank];
    let x = Math.random() * total;
    let it: ItemType = 'boost';
    if ((x -= W.boost[rank]) > 0) it = (x -= W.banana[rank]) > 0 ? 'shell' : 'banana';
    r.item = it;
    r.itemT = rand(0.8, 3.2);
    r.itemRoll = r.isPlayer ? 1.1 : 0.5;
  }

  private useItem(r: Racer) {
    const it = r.item;
    if (!it) return;
    r.item = null;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    if (it === 'boost') {
      r.boostT = Math.max(r.boostT, 1.8);
      this.particles.spawn(r.x - fx * 1.8, 0.8, r.z - fz * 1.8, 0xffb347, 10, 3, 2, 0.25, 0.5, 0);
      if (r.isPlayer) {
        sfx.boost();
        this.popup('🔥 TURBO!', r.x, 3.2, r.z, '#ffb347', 28);
        this.shake = Math.max(this.shake, 0.3);
      }
    } else if (it === 'banana') {
      const mesh = bananaMesh();
      const x = r.x - fx * 2.6;
      const z = r.z - fz * 2.6;
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.hazards.push({ x, z, mesh, life: 45, owner: r, age: 0 });
      if (r.isPlayer) sfx.bananaDrop();
    } else {
      const mesh = shellMesh();
      this.scene.add(mesh);
      let target: Racer | null = null;
      let bd = 1e9;
      for (const o of this.racers) {
        if (o === r) continue;
        const d = (o.total - r.total) * this.track.spacing;
        if (d > 0 && d < bd) {
          bd = d;
          target = o;
        }
      }
      this.shells.push({ f: r.idxF + 3, lat: r.lat, speed: 78, target, mesh, life: 7, owner: r, age: 0 });
      sfx.shellShot();
    }
  }

  private spinOut(r: Racer, quiet = false) {
    if (r.invT > 0 || r.spinT > 0) return;
    r.spinT = 1.25;
    r.invT = 2.6;
    r.vy = 7;
    r.y = 0.02;
    r.vx *= 0.3;
    r.vz *= 0.3;
    r.boostT = 0;
    r.drift.on = false;
    r.drift.level = 0;
    this.particles.spawn(r.x, 1.6, r.z, 0xffe14d, 12, 4, 6, 0.2, 0.7, 10);
    if (r.isPlayer) {
      this.shake = Math.max(this.shake, 0.8);
      if (!quiet) sfx.spin();
      this.popup('💫 WUAAH!', r.x, 3.4, r.z, '#ff8fa3', 28);
    } else if (this.player() && Math.hypot(r.x - this.player().x, r.z - this.player().z) < 40) this.popup('💫', r.x, 3.2, r.z, '#fff', 24);
  }

  private respawn(r: Racer) {
    this.track.posAt(r.idxF, 0, this.tmp);
    r.x = this.tmp.x;
    r.z = this.tmp.z;
    r.yaw = this.tmp.yaw;
    r.vx = r.vz = r.vf = r.vr = 0;
    r.y = 2.5;
    r.vy = 0;
    r.invT = 2.2;
    r.spinT = 0;
    r.stuckT = 0;
    r.drift.on = false;
    r.steer = 0;
    this.track.locateFull(r.x, r.z, this.loc);
    r.hint = this.loc.i;
    r.catX.v += 3;
    if (r.isPlayer) this.popup('↩ Balik ke lintasan', r.x, 3.4, r.z, '#ffffff', 20);
  }

  // ---------- fisika ----------
  private endDrift(r: Racer) {
    const lv = r.drift.level;
    if (lv > 0) {
      r.boostT = Math.max(r.boostT, lv === 1 ? 0.95 : 1.7);
      r.boostMax = r.boostT;
      this.particles.spawn(r.x, 0.5, r.z, lv === 1 ? 0x4db8ff : 0xff9a2e, 14, 5, 3, 0.2, 0.5, 8);
      if (r.isPlayer) {
        sfx.miniTurbo(lv);
        this.popup(lv === 1 ? '⚡ MINI TURBO' : '🔥 SUPER TURBO!', r.x, 3.4, r.z, lv === 1 ? '#6fd0ff' : '#ffb347', 26);
        this.shake = Math.max(this.shake, 0.25);
      }
    }
    r.drift.on = false;
    r.drift.level = 0;
    r.drift.t = 0;
    r.drift.dir = 0;
  }

  private physics(r: Racer, inpIn: Inp, dt: number) {
    const tr = this.track;
    let inp = inpIn;
    r.invT -= dt;
    r.padCd -= dt;
    const stunned = r.spinT > 0;
    if (stunned) {
      r.spinT -= dt;
      inp = NOINP;
    }
    r.gasIn = inp.gas;
    r.braking = inp.brake;
    const fx = Math.sin(r.yaw);
    const fz = Math.cos(r.yaw);
    const rx = -fz;
    const rz = fx;
    let vf = r.vx * fx + r.vz * fz;
    let vr = r.vx * rx + r.vz * rz;
    const airborne = r.y > 0.01 || r.vy > 0;
    const off = Math.abs(r.lat) > ROAD_HALF + 1.0;

    let maxSp = MAX_SPEED * r.skillMul * (off ? 0.55 : 1);
    if (r.boostT > 0) {
      r.boostT -= dt;
      maxSp = MAX_SPEED * (off ? 1.25 : 1.48);
    }

    // ----- slipstream -----
    let drafting = false;
    for (const o of this.racers) {
      if (o === r || o.finished) continue;
      const dm = (o.total - r.total) * tr.spacing;
      if (dm > 3 && dm < 17 && Math.abs(o.lat - r.lat) < 2.4 && o.vf > 18 && r.vf > 18) {
        drafting = true;
        break;
      }
    }
    r.draftT = drafting ? Math.min(2, r.draftT + dt) : Math.max(0, r.draftT - dt * 1.5);
    r.drafting = r.draftT > 0.8;
    if (r.drafting) maxSp += 3.5;

    // ----- drift -----
    if (inp.drift && !r.prevDrift && !airborne && !stunned && vf > 8) {
      r.vy = 5.2;
      r.y = 0.02;
      r.sq.v -= 3;
      r.drift.on = true;
      r.drift.dir = Math.abs(inp.steer) > 0.25 ? Math.sign(inp.steer) : 0;
      r.drift.t = 0;
      r.drift.level = 0;
      if (r.isPlayer) sfx.drift();
    }
    if (r.drift.on) {
      if (!inp.drift || vf < 7 || stunned) this.endDrift(r);
      else {
        if (r.drift.dir === 0 && Math.abs(inp.steer) > 0.35) r.drift.dir = Math.sign(inp.steer);
        if (r.drift.dir !== 0 && !airborne && vf > 11) {
          r.drift.t += dt * (inp.steer * r.drift.dir > 0.6 ? 1.25 : 1);
          const lv = r.drift.t > 1.9 ? 2 : r.drift.t > 0.9 ? 1 : 0;
          if (lv !== r.drift.level) {
            r.drift.level = lv;
            if (r.isPlayer) sfx.tick();
          }
        }
      }
    }
    r.prevDrift = inp.drift;

    // ----- gas / rem -----
    const target = inp.gas * maxSp;
    if (inp.brake) {
      if (vf > 0.5) vf -= 50 * dt;
      else vf = Math.max(vf - 15 * dt, -9);
    } else if (vf < target) {
      vf += (r.boostT > 0 ? 58 : 29) * dt * (1 - clamp(vf / maxSp, 0, 1) * 0.55);
    } else if (vf > target) {
      vf -= (inp.gas > 0 ? 24 : 7) * dt;
    }
    if (r.boostT > 0 && vf < maxSp * 0.85) vf += 30 * dt;

    // kecepatan dunia (frame lama, sudah termasuk gas/rem)
    const wvx = fx * vf + rx * vr;
    const wvz = fz * vf + rz * vr;

    // ----- setir -----
    r.steer += (inp.steer - r.steer) * (1 - Math.exp(-11 * dt));
    const sf = clamp(Math.abs(vf) / 9, 0, 1) * (vf >= 0 ? 1 : -1);
    let s = r.steer;
    let rate = 2.4 * (1 - 0.25 * clamp(vf / MAX_SPEED, 0, 1));
    if (r.drift.on && r.drift.dir !== 0) {
      s = clamp(r.drift.dir * 0.7 + r.steer * 0.55, -1.2, 1.2);
      rate = 2.45 * clamp(0.45 + r.drift.t * 2.5, 0.45, 1);
    }
    if (!stunned) r.yaw -= s * rate * sf * dt;

    // ----- grip: momentum dunia dipertahankan, hanya komponen samping diredam -----
    const nfx = Math.sin(r.yaw);
    const nfz = Math.cos(r.yaw);
    const nrx = -nfz;
    const nrz = nfx;
    vf = wvx * nfx + wvz * nfz;
    vr = wvx * nrx + wvz * nrz;
    const grip = stunned ? 1.2 : r.drift.on ? 6 : off ? 9 : 20;
    if (!airborne || stunned) {
      const v0 = Math.hypot(vf, vr);
      const vr2 = vr * Math.exp(-grip * dt);
      if (!stunned && v0 > 1) {
        // ban yang mencengkeram mengubah luncuran samping jadi dorongan ke depan (kecepatan tetap terjaga)
        const vfFull = Math.sqrt(Math.max(0, v0 * v0 - vr2 * vr2)) * (vf >= 0 ? 1 : -1);
        vf += (vfFull - vf) * 0.88;
      }
      vr = vr2;
    }
    if (stunned) vf *= Math.exp(-2.4 * dt);
    r.vx = nfx * vf + nrx * vr;
    r.vz = nfz * vf + nrz * vr;

    r.x += r.vx * dt;
    r.z += r.vz * dt;

    // ----- vertikal -----
    if (r.y > 0 || r.vy > 0) {
      r.vy -= 30 * dt;
      r.y += r.vy * dt;
      if (r.y <= 0) {
        if (r.vy < -4) {
          r.sq.v += Math.min(-r.vy, 10) * 0.6;
          this.particles.spawn(r.x, 0.1, r.z, 0xf0e6c8, 6, 3, 1.5, 0.18, 0.5, 4);
        }
        r.y = 0;
        r.vy = 0;
      }
    }

    // ----- lokasi di lintasan + tembok -----
    tr.locate(r.x, r.z, r.hint, this.loc);
    let lat = this.loc.lat;
    if (Math.abs(lat) > WALL_LAT) {
      const side = Math.sign(lat);
      const over = Math.abs(lat) - WALL_LAT;
      r.x -= this.loc.rx * side * over;
      r.z -= this.loc.rz * side * over;
      const vn = r.vx * this.loc.rx + r.vz * this.loc.rz;
      if (vn * side > 0) {
        const impact = Math.abs(vn);
        r.vx -= this.loc.rx * vn * 1.35;
        r.vz -= this.loc.rz * vn * 1.35;
        r.vx *= 0.9;
        r.vz *= 0.9;
        r.roll.v += side * Math.min(impact, 14) * 0.5;
        r.catZ.v += side * impact * 0.4;
        if (impact > 2.5) {
          const px = r.x + this.loc.rx * side * 1.2;
          const pz = r.z + this.loc.rz * side * 1.2;
          this.particles.spawn(px, 0.8, pz, 0xffd45a, 6, 4, 3, 0.1, 0.35);
          if (r.isPlayer && this.time - this.bumpAt > 0.15) {
            this.bumpAt = this.time;
            sfx.bump();
            this.shake = Math.max(this.shake, clamp(impact / 14, 0.1, 0.6));
          }
        }
        if (!stunned) r.drift.on && impact > 7 && this.endDrift(r);
      }
      // sejajarkan pelan dengan lintasan agar tidak nyangkut
      r.yaw += angDiff(this.loc.yaw, r.yaw) * (1 - Math.exp(-3.5 * dt)) * (vf > -1 ? 1 : 0);
      r.vx *= Math.exp(-0.8 * dt);
      r.vz *= Math.exp(-0.8 * dt);
      lat = clamp(lat, -WALL_LAT, WALL_LAT);
    }
    r.hint = this.loc.i;
    r.lat = lat;
    r.locYaw = this.loc.yaw;
    r.nrx = this.loc.rx;
    r.nrz = this.loc.rz;
    const f = tr.wrap(this.loc.f);
    let d = f - r.idxF;
    if (d < -TN / 2) d += TN;
    else if (d > TN / 2) d -= TN;
    r.idxF = f;
    r.total += d;

    r.vf = r.vx * Math.sin(r.yaw) + r.vz * Math.cos(r.yaw);
    r.vr = r.vx * -Math.cos(r.yaw) + r.vz * Math.sin(r.yaw);
    r.slip = clamp(Math.abs(r.vr) / Math.max(8, Math.abs(r.vf)), 0, 1);

    // wrong-way
    const align = Math.sin(r.yaw) * Math.sin(r.locYaw) + Math.cos(r.yaw) * Math.cos(r.locYaw);
    if (r.vf > 6 && align < -0.25 && !r.finished) r.wrongT += dt;
    else r.wrongT = Math.max(0, r.wrongT - dt * 2);

    // nyangkut -> respawn
    if (this.phase === 'racing' && !r.finished && Math.abs(r.vf) < 1.6 && inp.gas > 0 && !stunned) r.stuckT += dt;
    else r.stuckT = Math.max(0, r.stuckT - dt * 2);
    if (r.stuckT > (r.isPlayer ? 3.2 : 1.8)) this.respawn(r);
  }

  private collisions() {
    const R = this.racers;
    for (let i = 0; i < R.length; i++) {
      for (let j = i + 1; j < R.length; j++) {
        const a = R[i];
        const b = R[j];
        if (Math.abs(a.y - b.y) > 1.2) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 2.5;
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
        const j2 = rv * 0.5 * 1.5;
        const boostBias = (a.boostT > 0 ? 1 : 0) - (b.boostT > 0 ? 1 : 0);
        a.vx -= nx * j2 * (1 + boostBias * -0.3);
        a.vz -= nz * j2 * (1 + boostBias * -0.3);
        b.vx += nx * j2 * (1 + boostBias * 0.3);
        b.vz += nz * j2 * (1 + boostBias * 0.3);
        // ayunan badan ala Party Animals
        const side = (a: Racer, nxx: number, nzz: number) => {
          const fx = Math.sin(a.yaw);
          const fz = Math.cos(a.yaw);
          return -(nxx * -fz + nzz * fx);
        };
        a.roll.v += side(a, -nx, -nz) * rv * 0.4;
        b.roll.v += side(b, nx, nz) * rv * 0.4;
        a.catZ.v += side(a, -nx, -nz) * rv * 0.6;
        b.catZ.v += side(b, nx, nz) * rv * 0.6;
        a.catX.v += rv * 0.3;
        b.catX.v += rv * 0.3;
        if (rv > 4) {
          this.particles.spawn((a.x + b.x) / 2, 1, (a.z + b.z) / 2, 0xffe14d, 6, 3, 3, 0.12, 0.35);
          if ((a.isPlayer || b.isPlayer) && this.time - this.bumpAt > 0.2) {
            this.bumpAt = this.time;
            sfx.bump();
            this.shake = Math.max(this.shake, clamp(rv / 18, 0.1, 0.5));
          }
        }
        // super ramming kena speed sangat tinggi
        if (rv > 17) {
          const victim = a.vf < b.vf ? a : b;
          this.spinOut(victim);
        }
      }
    }
  }

  private interactions(dt: number) {
    void dt;
    // item box
    for (const bx of this.world.boxes) {
      if (bx.cd > 0) continue;
      for (const r of this.racers) {
        if (r.finished) continue;
        if (Math.hypot(r.x - bx.x, r.z - bx.z) < 2.1) {
          bx.cd = 4.5;
          bx.mesh.visible = false;
          this.particles.spawn(bx.x, 1.5, bx.z, 0xffd23f, 8, 4, 4, 0.14, 0.5);
          this.particles.spawn(bx.x, 1.5, bx.z, 0x4dd0ff, 6, 4, 4, 0.14, 0.5);
          if (!r.item) this.giveItem(r);
          break;
        }
      }
    }
    // boost pads
    PAD_DEFS.forEach((p) => {
      for (const r of this.racers) {
        if (r.padCd > 0 || r.y > 0.8) continue;
        let df = this.track.wrap(r.idxF - p.f);
        if (df > TN / 2) df -= TN;
        if (Math.abs(df) < 4.2 && Math.abs(r.lat - p.lat) < 3.1) {
          r.padCd = 0.8;
          r.boostT = Math.max(r.boostT, 1.5);
          r.boostMax = 1.5;
          this.particles.spawn(r.x, 0.5, r.z, 0xffd23f, 10, 4, 2, 0.16, 0.5);
          if (r.isPlayer) {
            sfx.boost();
            this.shake = Math.max(this.shake, 0.25);
          }
        }
      }
    });
  }

  private updateHazards(dt: number) {
    const tr = this.track;
    // pisang
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.age += dt;
      h.mesh.rotation.y += dt * 2;
      h.mesh.position.y = Math.abs(Math.sin(h.age * 4)) * (h.age < 0.4 ? 0.9 : 0.05);
      let hit = false;
      for (const r of this.racers) {
        if (r.y > 0.7 || (r === h.owner && h.age < 0.7)) continue;
        if (Math.hypot(r.x - h.x, r.z - h.z) < 1.5) {
          this.spinOut(r);
          hit = true;
          break;
        }
      }
      if (hit || h.life <= 0) {
        this.scene.remove(h.mesh);
        this.hazards.splice(i, 1);
      }
    }
    // cangkang
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.age += dt;
      s.f += (s.speed / tr.spacing) * dt;
      if (s.target) {
        const diff = s.target.lat - s.lat;
        s.lat += clamp(diff, -16 * dt, 16 * dt);
      }
      tr.posAt(s.f, s.lat, this.tmp);
      s.mesh.position.set(this.tmp.x, 0, this.tmp.z);
      s.mesh.rotation.y += dt * 14;
      this.particles.spawn(this.tmp.x, 0.8, this.tmp.z, Math.random() < 0.5 ? 0xff9a3d : 0xffe14d, 1, 0.5, 0.3, 0.17, 0.35, 0);
      let hit: Racer | null = null;
      for (const r of this.racers) {
        if (r.y > 1 || (r === s.owner && s.age < 0.6)) continue;
        if (Math.hypot(r.x - this.tmp.x, r.z - this.tmp.z) < 1.9) {
          hit = r;
          break;
        }
      }
      if (hit) {
        this.particles.spawn(this.tmp.x, 1, this.tmp.z, 0xff7a3d, 16, 7, 7, 0.25, 0.6);
        this.particles.spawn(this.tmp.x, 1, this.tmp.z, 0xffe14d, 10, 6, 6, 0.2, 0.6);
        if (hit.isPlayer || Math.hypot(hit.x - this.player().x, hit.z - this.player().z) < 40) sfx.explode();
        if (hit.invT > 0) hit.invT = 0;
        this.spinOut(hit, true);
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      } else if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
  }

  private checkLaps() {
    for (const r of this.racers) {
      if (r.finished) continue;
      const done = Math.floor(r.total / TN);
      if (done > r.lap) {
        const lapTime = this.raceTime - r.lapStart;
        r.lapStart = this.raceTime;
        r.lap = done;
        if (lapTime < r.bestLap) r.bestLap = lapTime;
        if (done >= LAPS) {
          r.finished = true;
          r.finishTime = this.raceTime;
          r.place = ++this.finishCount;
          if (r.isPlayer) {
            this.confettiT = 4;
            this.banner = `🏁 FINISH! #${r.place}`;
            this.bannerT = 3.5;
            sfx.lap();
            sfx.fanfare();
            if (this.phase === 'racing') {
              this.phase = 'finished';
              this.phaseT = 7;
            }
          }
        } else if (r.isPlayer) {
          sfx.lap();
          if (done === LAPS - 1) {
            this.banner = '🔥 LAP TERAKHIR!';
            this.bannerT = 2.2;
          } else {
            this.banner = `LAP ${done + 1}`;
            this.bannerT = 1.4;
          }
        }
      }
    }
  }

  // ---------- visual ----------
  private wheelPos(r: Racer, lx: number, lz: number) {
    const c = Math.cos(r.yaw);
    const s = Math.sin(r.yaw);
    return { x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c };
  }

  private visual(r: Racer, dt: number) {
    const inMenu = this.phase === 'menu';
    const stunned = r.spinT > 0;
    const sp = Math.abs(r.vf);

    // percepatan (filter) untuk goyangan
    const ra = clamp((r.vf - r.pvf) / dt, -60, 60);
    const rl = clamp((r.vr - r.pvr) / dt, -60, 60);
    r.pvf = r.vf;
    r.pvr = r.vr;
    r.af += (ra - r.af) * 0.25;
    r.ar += (rl - r.ar) * 0.25;

    // ---- badan gokart ----
    let rollT = r.steer * 0.12 * clamp(r.vf / 22, 0, 1) + (r.drift.on ? r.drift.dir * 0.2 : 0);
    if (stunned) rollT = 0;
    r.roll.step(rollT, 90, 8, dt, r.ar * -0.004);
    r.pitch.step(-clamp(r.af * 0.004, -0.2, 0.2) + (r.boostT > 0 ? -0.06 : 0), 90, 8, dt);
    r.sq.step(0, 130, 9, dt);
    r.sq.a = clamp(r.sq.a, -0.4, 0.5);

    const vis = stunned ? (1 - r.spinT / 1.25) * Math.PI * 4 : 0;
    r.group.position.set(r.x, r.y, r.z);
    r.group.rotation.y = r.yaw + vis;
    r.body.rotation.x = r.pitch.a;
    r.body.rotation.z = clamp(r.roll.a, -0.6, 0.6);
    r.body.scale.set(1 + 0.25 * r.sq.a, 1 - 0.35 * r.sq.a, 1 + 0.25 * r.sq.a);
    // suspensi: getar halus di aspal, kasar di pasir
    const sn = clamp(sp / MAX_SPEED, 0, 1.4);
    const offr = Math.abs(r.lat) > ROAD_HALF + 1 && r.y < 0.1 && !inMenu;
    r.body.position.y = r.y < 0.1 ? (Math.sin(r.wheelRot * 1.7) * 0.012 + Math.sin(r.wheelRot * 3.1) * 0.008) * sn + (offr ? (Math.random() - 0.5) * 0.07 * sn : 0) : 0;

    // roda
    r.wheelRot += (r.vf * dt) / 0.45;
    for (const w of r.spinners) w.rotation.x = r.wheelRot;
    for (const p of r.pivots) p.rotation.y = -r.steer * 0.5;

    // api turbo
    const fl = r.boostT > 0;
    r.flames.forEach((f, i) => {
      f.visible = fl;
      if (fl) {
        const k = 0.8 + Math.random() * 0.5;
        const base = i % 2 === 0 ? 1 : 0.5;
        f.scale.set(base, base, k * (i % 2 === 0 ? 1 : 0.6));
      }
    });

    // lampu rem + syal
    const brk = r.braking && sp > 1;
    for (const m of r.brakeMats) m.color.setHex(brk ? 0xff3030 : r.gasIn > 0 ? 0x6a1212 : 0x8a1a1a);
    const spd01 = clamp(sp / MAX_SPEED, 0, 1.3);
    r.scarfSw += (clamp(-r.steer * 0.3 + r.ar * 0.004, -0.55, 0.55) - r.scarfSw) * (1 - Math.exp(-6 * dt));
    const hang = -0.75 + 0.95 * Math.min(1, spd01 * 1.15);
    r.scarf.forEach((seg, i) => {
      seg.rotation.x = hang * (i === 0 ? 1 : 0.35) + Math.sin(this.time * 13 + i * 0.9) * 0.1 * spd01;
      seg.rotation.y = r.scarfSw * (i === 0 ? 0.4 : 0.35) + Math.sin(this.time * 9 + i) * 0.06 * spd01;
    });

    // tanda ban di aspal
    if (r.y < 0.15 && !inMenu && Math.abs(r.lat) <= ROAD_HALF + 1.2) {
      const marking = (r.drift.on && sp > 8) || (r.slip > 0.2 && sp > 14) || (r.braking && sp > 22) || r.spinT > 0.1;
      if (marking) {
        this.skidWheel(r, -1, r.skidL);
        this.skidWheel(r, 1, r.skidR);
      } else {
        r.skidL.ok = false;
        r.skidR.ok = false;
      }
    }

    // ---- kucing ----
    const rig = r.rig;
    r.catX.step(-clamp(r.af * 0.012, -0.5, 0.5), 60, 5, dt);
    r.catZ.step(clamp(r.ar * 0.01 + r.roll.a * 0.5, -0.6, 0.6), 60, 5, dt);
    r.headX.step(-r.catX.a * 0.6 + (inMenu ? Math.sin(this.time * 2 + r.idx) * 0.05 : 0), 55, 4.5, dt, -r.af * 0.004);
    r.headZ.step(-r.catZ.a * 0.7 + r.steer * -0.1, 55, 4.5, dt, r.ar * 0.004);
    r.headY.step(-r.steer * 0.45 + (r.drift.on ? -r.drift.dir * 0.35 : 0), 50, 5, dt);
    r.tail.step(0, 40, 3, dt, r.ar * 0.05);
    rig.tilt.rotation.x = r.catX.a + (stunned ? Math.sin(this.time * 18) * 0.25 : 0);
    rig.tilt.rotation.z = r.catZ.a;
    rig.head.rotation.x = r.headX.a;
    rig.head.rotation.y = r.headY.a;
    rig.head.rotation.z = r.headZ.a + (stunned ? Math.sin(this.time * 14) * 0.3 : 0);
    rig.tail.rotation.y = r.tail.a + Math.sin(this.time * 5 + r.idx) * 0.18 * (0.4 + Math.min(1, sp / 15));
    rig.root.position.set(0, 0, 0);

    // kaki ke depan; tangan memegang setir
    rig.legL.rotation.x = -1.4;
    rig.legR.rotation.x = -1.4;
    rig.legL.rotation.z = -0.1;
    rig.legR.rotation.z = 0.1;
    let aLx = -1.15 + Math.sin(this.time * 14) * 0.02 * Math.min(1, sp / 10);
    let aRx = aLx;
    let aLz = 0.18 - r.steer * 0.32;
    let aRz = -0.18 - r.steer * 0.32;
    if (inMenu || this.phase === 'results') {
      // merayakan
      const w = Math.sin(this.time * 9 + r.idx) * 0.35;
      aLx = -2.8 + w;
      aRx = -2.8 - w;
      aLz = 0.5;
      aRz = -0.5;
    }
    if (stunned) {
      r.flailT -= dt;
      if (r.flailT <= 0) {
        r.flailT = 0.12 + Math.random() * 0.1;
        r.flail = [rand(-3, 0.6), rand(-3, 0.6)];
      }
      aLx = r.flail[0];
      aRx = r.flail[1];
      aLz = 0.9;
      aRz = -0.9;
    }
    r.armL.step(aLx, 120, 10, dt);
    r.armR.step(aRx, 120, 10, dt);
    rig.armL.rotation.x = r.armL.a;
    rig.armR.rotation.x = r.armR.a;
    rig.armL.rotation.z = aLz;
    rig.armR.rotation.z = aRz;

    // ---- partikel ----
    if (this.phase === 'racing' || this.phase === 'finished' || this.phase === 'results') {
      const off = Math.abs(r.lat) > ROAD_HALF + 1.0;
      if (r.drift.on && r.y < 0.1 && sp > 8) {
        r.sparkT -= dt;
        if (r.sparkT <= 0) {
          r.sparkT = 0.03;
          const col = r.drift.level === 2 ? 0xff9a2e : r.drift.level === 1 ? 0x4db8ff : 0xfff4c0;
          for (const sd of [-1, 1]) {
            const p = this.wheelPos(r, sd * 1.05, -1.0);
            this.particles.spawn(p.x, 0.15, p.z, col, 1, 2.5, 3.2, r.drift.level ? 0.14 : 0.08, 0.35, 12, 0, -r.vx * 0.25, -r.vz * 0.25);
          }
        }
        r.smokeT -= dt;
        if (r.smokeT <= 0 && sp > 12) {
          r.smokeT = 0.07;
          const p = this.wheelPos(r, (Math.random() - 0.5) * 2, -1.1);
          this.particles.spawn(p.x, 0.25, p.z, 0xdfe3ea, 1, 0.8, 0.6, 0.2, 0.55, -0.5, 1.8);
        }
      }
      if (off && sp > 6 && r.y < 0.1) {
        r.smokeT -= dt;
        if (r.smokeT <= 0) {
          r.smokeT = 0.05;
          const p = this.wheelPos(r, (Math.random() - 0.5) * 2, -1.0);
          this.particles.spawn(p.x, 0.2, p.z, 0xd9c58a, 1, 1.2, 1.4, 0.2, 0.6, 1, 1.4);
        }
      }
      if (r.boostT > 0) {
        r.sparkT -= dt;
        if (r.sparkT <= 0) {
          r.sparkT = 0.035;
          for (const sd of [-1, 1]) {
            const p = this.wheelPos(r, sd * 0.4, -2.0);
            this.particles.spawn(p.x, 0.6, p.z, Math.random() < 0.5 ? 0xffb347 : 0xffee88, 1, 0.6, 0.3, 0.22, 0.35, 0, 0, -r.vx * 0.2, -r.vz * 0.2);
          }
        }
      }
    }
  }

  // ---------- kamera ----------
  private updateCamera(dt: number, instant: boolean) {
    const me = this.player();
    const desired = this.tv;
    const look = this.tv2;
    let fov = 62;
    const kk = instant ? 1 : 1 - Math.exp(-9 * dt);
    let k2 = kk;
    if (this.phase === 'menu') {
      const a = this.time * 0.3 + 0.5;
      const aspectZoom = this.w / this.h < 1 ? 1.5 : 1;
      desired.set(this.gridCenter.x + Math.cos(a) * 15 * aspectZoom, 6.5 * aspectZoom, this.gridCenter.z + Math.sin(a) * 15 * aspectZoom);
      look.set(this.gridCenter.x, 1.6, this.gridCenter.z + 1);
      k2 = instant ? 1 : 1 - Math.exp(-3 * dt);
      fov = 55;
    } else if (this.phase === 'results') {
      const a = this.time * 0.55;
      desired.set(me.x + Math.cos(a) * 10, 4.2, me.z + Math.sin(a) * 10);
      look.set(me.x, 1.5, me.z);
      k2 = 1 - Math.exp(-4 * dt);
      fov = 55;
    } else {
      const sp2 = Math.hypot(me.vx, me.vz);
      let tYaw = me.yaw;
      if (sp2 > 6 && me.spinT <= 0) tYaw = me.yaw + angDiff(Math.atan2(me.vx, me.vz), me.yaw) * 0.6;
      this.camYaw += angDiff(tYaw, this.camYaw) * (1 - Math.exp(-(this.phase === 'countdown' ? 2 : 5) * dt));
      const boost = me.boostT > 0 ? 1 : 0;
      const sn = clamp(me.vf / MAX_SPEED, 0, 1.4);
      const dist = 7.4 + boost * 1.4 + sn * 1.4;
      this.camSide += ((me.drift.on ? -me.drift.dir * 1.7 : 0) + clamp(-me.steer * 0.6 * sn, -0.8, 0.8) - this.camSide) * (1 - Math.exp(-4 * dt));
      const sy = Math.sin(this.camYaw);
      const cy = Math.cos(this.camYaw);
      const rxw = -cy;
      const rzw = sy;
      const aspectZoom = this.w / this.h < 1 ? 1.35 : 1;
      desired.set(me.x - sy * dist * aspectZoom + rxw * this.camSide, (3.9 - sn * 0.25) * aspectZoom + me.y * 0.4, me.z - cy * dist * aspectZoom + rzw * this.camSide);
      look.set(me.x + sy * 6 + rxw * this.camSide * 0.2, 1.7 + me.y * 0.3, me.z + cy * 6 + rzw * this.camSide * 0.2);
      fov = 60 + clamp(me.vf / MAX_SPEED, 0, 1.4) * 9 + boost * 7;
      k2 = this.phase === 'countdown' ? 1 - Math.exp(-2.5 * dt) : kk;
    }
    this.camPos.lerp(desired, instant ? 1 : k2);
    this.camLook.lerp(look, instant ? 1 : Math.min(1, k2 * 1.3));
    this.camFov += (fov - this.camFov) * (instant ? 1 : 1 - Math.exp(-5 * dt));
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    this.shake *= Math.exp(-6 * dt);
    const spk = this.phase === 'racing' ? clamp(Math.abs(me.vf) / MAX_SPEED - 0.8, 0, 0.7) * 0.18 + (me.boostT > 0 ? 0.08 : 0) : 0;
    const sh = this.shake * 0.5 + spk;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  private clearSkids() {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 900; i++) this.skids.setMatrixAt(i, m);
    this.skids.instanceMatrix.needsUpdate = true;
    this.skidN = 0;
  }

  private skidWheel(r: Racer, side: number, st: { x: number; z: number; ok: boolean }) {
    const p = this.wheelPos(r, side * 1.08, -0.95);
    if (!st.ok) {
      st.x = p.x;
      st.z = p.z;
      st.ok = true;
      return;
    }
    const dx = p.x - st.x;
    const dz = p.z - st.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.7 && d < 4) {
      const o = this.dummy;
      o.position.set((p.x + st.x) / 2, 0.045, (p.z + st.z) / 2);
      o.rotation.set(0, Math.atan2(dx, dz), 0);
      o.scale.set(1, 1, Math.min(1.5, d / 0.9));
      o.updateMatrix();
      this.skids.setMatrixAt(this.skidN % 900, o.matrix);
      this.skidN++;
      this.skids.instanceMatrix.needsUpdate = true;
      st.x = p.x;
      st.z = p.z;
    } else if (d >= 4) {
      st.x = p.x;
      st.z = p.z;
    }
  }

  private updateAudio(dt: number) {
    if (this.phase === 'menu') {
      if (kartAudio.running) kartAudio.stop();
      return;
    }
    const me = this.player();
    const cam = this.camera;
    const cr = this.tv3.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const list: AudioRacer[] = this.racers.map((r) => {
      const dx = r.x - me.x;
      const dz = r.z - me.z;
      const dist = Math.hypot(dx, dz);
      const px = r.x - cam.position.x;
      const pz = r.z - cam.position.z;
      const pl = Math.hypot(px, pz) || 1;
      const pan = (px * cr.x + pz * cr.z) / pl;
      const closing = dist > 0.5 ? -(((r.vx - me.vx) * dx + (r.vz - me.vz) * dz) / dist) : 0;
      return {
        isPlayer: r.isPlayer,
        vf: r.vf,
        gas: r.gasIn,
        boost: r.boostT > 0,
        slip: r.slip,
        drifting: r.drift.on,
        off: Math.abs(r.lat) > ROAD_HALF + 1,
        dist,
        pan: r.isPlayer ? 0 : pan,
        closing,
        spin: r.spinT > 0,
        air: r.y > 0.3,
      };
    });
    kartAudio.update(list, dt, this.phase, me.lap === LAPS - 1);
  }

  private project(x: number, y: number, z: number) {
    const v = this.tv.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, vis: v.z < 1 && v.z > -1 };
  }

  private updateLabels() {
    const me = this.player();
    for (const r of this.racers) {
      const far = Math.hypot(r.x - me.x, r.z - me.z);
      const p = this.project(r.x, r.y + 3.1, r.z);
      r.tag.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
      r.tag.style.display = p.vis && (far < 70 || this.phase === 'menu') && !(r.isPlayer && this.phase === 'racing') ? 'block' : 'none';
      let ind = '';
      if (r.spinT > 0) ind = '💫';
      else if (r.finished) ind = '🏁';
      else if (r.boostT > 0) ind = '🔥';
      else if (r.item === 'shell') ind = '🎯';
      else if (r.item === 'banana') ind = '🍌';
      else if (r.item === 'boost') ind = '🚀';
      if (r.indEl.textContent !== ind) r.indEl.textContent = ind;
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
  private buildHud(): KartHudState {
    const me = this.player();
    const rank = this.order.length ? this.rankOf(me) + 1 : 1;
    const board: KBoardEntry[] = this.order.map((r, i) => ({
      id: r.idx,
      name: r.name,
      animal: r.animal,
      color: r.color,
      isPlayer: r.isPlayer,
      pos: i + 1,
      finished: r.finished,
      time: r.finished ? r.finishTime : null,
      lap: clamp(r.lap + 1, 1, LAPS),
    }));
    const dots = this.racers.map((r) => ({ x: this.mx(r.x), y: this.mz(r.z), color: r.color, me: r.isPlayer }));
    const racing = this.phase === 'racing';
    let hint = '';
    if (this.phase === 'countdown') hint = 'Siap! Tekan GAS (W) tepat saat angka 1 untuk ROCKET START 🚀';
    else if (racing) {
      if (me.spinT > 0) hint = 'Kena! 💫 Tunggu sebentar...';
      else if (me.wrongT > 0.8) hint = '⚠ KAMU ARAH SALAH! Putar balik!';
      else if (Math.abs(me.lat) > ROAD_HALF + 1) hint = 'Kamu keluar jalur — pelan di pasir! Balik ke aspal';
      else if (this.time - this.gasPressT > 0 && this.raceTime < 5) hint = 'Tahan SPASI saat menikung untuk DRIFT → lepas = TURBO!';
      else if (me.item && me.itemRoll <= 0) hint = me.item === 'boost' ? 'Tekan SHIFT: pakai TURBO!' : me.item === 'banana' ? 'Tekan SHIFT: jatuhkan PISANG di belakang!' : 'Tekan SHIFT: tembak CANGKANG ke depan!';
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.phaseT - 0.4)),
      go: racing && this.goT > 0,
      lap: clamp(me.lap + 1, 1, LAPS),
      laps: LAPS,
      position: rank,
      raceTime: this.raceTime,
      lapTime: this.raceTime - me.lapStart,
      bestLap: Number.isFinite(me.bestLap) ? me.bestLap : null,
      speed: Math.round(Math.abs(me.vf) * 3.3),
      speedNorm: clamp(Math.abs(me.vf) / (MAX_SPEED * 1.48), 0, 1),
      boost: me.boostT > 0,
      boostLeft: clamp(me.boostT / Math.max(0.5, me.boostMax), 0, 1),
      driftLevel: me.drift.on ? me.drift.level : 0,
      driftCharge: me.drift.on ? clamp(me.drift.t / 1.9, 0, 1) : 0,
      drifting: me.drift.on,
      item: me.item,
      itemRolling: me.itemRoll > 0,
      draft: me.drafting ? 1 : clamp(me.draftT / 0.8, 0, 1),
      wrongWay: me.wrongT > 0.8 && racing,
      offroad: Math.abs(me.lat) > ROAD_HALF + 1,
      banner: this.banner,
      board,
      dots,
      hint,
      muted: sfx.muted,
      playerAnimal: this.playerAnimal,
    };
  }
}

void lerp;
