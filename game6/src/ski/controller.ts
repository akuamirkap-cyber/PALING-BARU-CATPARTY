import * as THREE from 'three';
import { COURSE, PLAYER_SLOT, START_D } from './course';
import { PHYS, Racer, collideRacers, type RacerEvent, type RacerInput } from './racer';
import { SkiAudio } from './audio';
import { createBibTexture, getFlakeTexture } from './textures';
import { animateBeast, createBeast, type BeastRig } from '../scene/beast';
import { Confetti } from '../bowling/effects';
import type { MountainBuild } from './buildMountain';

export type RacePhase = 'pre' | 'countdown' | 'race' | 'results';
export type SkiMsgKind = 'go' | 'gate' | 'miss' | 'air' | 'trick' | 'crash' | 'finish' | 'win' | 'info';
export interface SkiMessage {
  id: number;
  text: string;
  sub?: string;
  kind: SkiMsgKind;
}
export interface Standing {
  id: number;
  name: string;
  color: string;
  player: boolean;
  time: number;
  progress: number;
  finished: boolean;
  penalty: number;
  missed: number;
}
export interface SkiSnapshot {
  phase: RacePhase;
  countdown: number;
  raceTime: number;
  speedKmh: number;
  maxKmh: number;
  position: number;
  racers: number;
  gatesOk: number;
  missed: number;
  gatesTotal: number;
  penalty: number;
  progress: number;
  bestAir: number;
  crashed: boolean;
  air: boolean;
  tuck: boolean;
  finishTime: number;
  standings: Standing[];
  message: SkiMessage | null;
  dots: { x: number; z: number; color: string; player: boolean }[];
}
export interface SkiOptions {
  opponents: number;
  sound: boolean;
  gates: boolean;
}

const NAMES = ['BLOBBY', 'WOBBLY', 'KAMU', 'JIGGLE'];
const COLORS = ['#4dabf7', '#69db7c', '#ff7a3d', '#f783ac'];
const SUITS = ['#1d4ed8', '#059669', '#e63946', '#c026d3'];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Vis {
  rig: BeastRig;
  skis: THREE.Group;
  poles: THREE.Group[];
}

export function formatTime(t: number) {
  if (t < 0 || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class SkiController {
  runtime = new THREE.Group();
  racers: Racer[];
  vis: Vis[] = [];
  audio = new SkiAudio();
  confetti = new Confetti();
  options: SkiOptions = { opponents: 3, sound: true, gates: true };
  phase: RacePhase = 'pre';
  raceTime = 0;
  countT = 0;
  shake = 0;
  input: RacerInput = { steer: 0, tuck: false, brake: false, jump: false };
  private M: MountainBuild;
  private acc = 0;
  private time = 0;
  private listeners = new Set<(s: SkiSnapshot) => void>();
  private snap: SkiSnapshot;
  private message: SkiMessage | null = null;
  private msgId = 0;
  private emitT = 0;
  private boardT = 0;
  private lastCount = -1;
  private cheered = new Set<number>();
  private resultsT = -1;
  private cheerBoost = 0;
  private jumpLatch = false;
  // partikel semburan salju
  private sprayN = 1600;
  private sprayPos: Float32Array;
  private sprayVel: Float32Array;
  private sprayLife: Float32Array;
  private sprayNext = 0;
  private sprayAcc: number[] = [0, 0, 0, 0];
  spray: THREE.Points;

  constructor(M: MountainBuild) {
    this.M = M;
    this.runtime.name = 'SkiRuntime';
    this.runtime.userData.noExport = true;
    this.racers = START_D.map((d, i) => {
      const r = new Racer(i, COURSE, i !== PLAYER_SLOT, d);
      r.dragMul = [0.99, 1.0, 1.0, 1.015][i];
      r.topSpeed = [26, 25, 26, 24.5][i];
      return r;
    });
    this.racers.forEach((r, i) => {
      const v = this.makeVis(i);
      this.vis.push(v);
      this.runtime.add(v.rig.root);
      void r;
    });
    this.sprayPos = new Float32Array(this.sprayN * 3).fill(-9999);
    this.sprayVel = new Float32Array(this.sprayN * 3);
    this.sprayLife = new Float32Array(this.sprayN);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sprayPos, 3));
    const sm = new THREE.PointsMaterial({ color: '#ffffff', size: 0.32, map: getFlakeTexture(), alphaTest: 0.02, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
    sm.name = 'Snow_Spray';
    this.spray = new THREE.Points(g, sm);
    this.spray.name = 'Snow_Spray';
    this.spray.frustumCulled = false;
    this.runtime.add(this.spray, this.confetti.mesh);
    this.snap = this.buildSnap();
    this.updateVisuals(0);
  }

  private makeVis(i: number): Vis {
    const rig = createBeast(COLORS[i], 'none');
    rig.root.name = `Skier_${NAMES[i]}`;
    rig.root.rotation.order = 'YXZ';
    const suit = new THREE.MeshStandardMaterial({ color: SUITS[i], roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1f2430', roughness: 0.4, metalness: 0.3 });
    const lens = new THREE.MeshStandardMaterial({ color: '#ff9f1c', roughness: 0.1, metalness: 0.8, emissive: '#ff7a00', emissiveIntensity: 0.25 });
    // helm & goggle
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), suit);
    helmet.position.y = 0.8;
    helmet.scale.set(1.04, 0.9, 1.04);
    rig.body.add(helmet);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.035, 6, 24), dark);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.85;
    rig.body.add(band);
    const gog = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), lens);
    gog.rotation.z = Math.PI / 2;
    gog.position.set(0, 0.86, 0.31);
    gog.scale.set(1, 1, 0.6);
    rig.body.add(gog);
    // nomor dada
    const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), new THREE.MeshStandardMaterial({ map: createBibTexture(i + 1, SUITS[i]), roughness: 0.6 }));
    bib.position.set(0, 0.46, 0.352);
    rig.body.add(bib);
    // ski
    const skiMat = new THREE.MeshStandardMaterial({ color: SUITS[i], roughness: 0.3, metalness: 0.2 });
    const skis = new THREE.Group();
    skis.name = 'Skis';
    for (const sx of [-0.14, 0.14]) {
      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 1.7), skiMat);
      ski.position.set(sx, 0.02, 0.12);
      ski.castShadow = true;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.28), skiMat);
      tip.position.set(sx, 0.07, 1.06);
      tip.rotation.x = -0.45;
      const bind = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.32), dark);
      bind.position.set(sx, 0.07, 0.02);
      skis.add(ski, tip, bind);
    }
    rig.root.add(skis);
    // tongkat
    const poles: THREE.Group[] = [];
    for (const arm of [rig.armL, rig.armR]) {
      const pg = new THREE.Group();
      pg.position.set(0, -0.46, 0.02);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.15, 5), new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.7, roughness: 0.3 }));
      stick.position.y = -0.52;
      const basket = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), dark);
      basket.rotation.x = Math.PI / 2;
      basket.position.y = -1.0;
      pg.add(stick, basket);
      arm.add(pg);
      poles.push(pg);
    }
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    return { rig, skis, poles };
  }

  /* ------------------------------ API ------------------------------ */
  subscribe(fn: (s: SkiSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snap);
    return () => {
      this.listeners.delete(fn);
    };
  }
  getSnapshot() {
    return this.snap;
  }
  get player() {
    return this.racers[PLAYER_SLOT];
  }
  activeRacers() {
    const order = [PLAYER_SLOT, 1, 3, 0];
    const keep = new Set(order.slice(0, 1 + Math.max(0, Math.min(3, this.options.opponents))));
    return this.racers.filter((r) => keep.has(r.id));
  }

  setOptions(o: Partial<SkiOptions>) {
    const prevOpp = this.options.opponents;
    this.options = { ...this.options, ...o };
    this.audio.setEnabled(this.options.sound);
    this.racers.forEach((r) => (r.gatesOn = this.options.gates));
    if (o.opponents !== undefined && o.opponents !== prevOpp && this.phase === 'pre') this.updateVisuals(0);
  }

  setInput(p: Partial<RacerInput>) {
    this.input = { ...this.input, ...p };
  }

  startRace() {
    if (this.phase !== 'pre') return;
    this.audio.ensure();
    this.audio.setEnabled(this.options.sound);
    this.phase = 'countdown';
    this.countT = 0;
    this.lastCount = -1;
    this.message = null;
    this.emit();
  }

  resetRace() {
    this.racers.forEach((r, i) => r.reset(START_D[i]));
    this.phase = 'pre';
    this.raceTime = 0;
    this.countT = 0;
    this.cheered.clear();
    this.resultsT = -1;
    this.message = null;
    this.resetWands();
    this.M.lights.forEach((l) => {
      l.emissiveIntensity = 0;
      l.color.set('#330000');
    });
    this.emit();
  }

  private wandBase: THREE.Quaternion[] = [];
  private resetWands() {
    if (!this.wandBase.length) this.wandBase = this.M.wands.map((w) => w.quaternion.clone());
    this.M.wands.forEach((w, i) => w.quaternion.copy(this.wandBase[i]));
  }

  /** Kamera kejar / sinematik. */
  getCameraRig(): { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null {
    const r = this.player;
    const sp = r.speed();
    if (this.phase === 'pre' || this.phase === 'countdown') {
      const f = COURSE.frame(r.s);
      const p = new THREE.Vector3(r.x - f.tx * 6.5, r.y + 3.0, r.z - f.tz * 6.5);
      return { pos: p, target: new THREE.Vector3(r.x + f.tx * 12, r.y - 2.5, r.z + f.tz * 12), fov: 55 };
    }
    let dx = Math.cos(r.phi);
    let dz = Math.sin(r.phi);
    if (sp > 2) {
      dx = r.vx / sp;
      dz = r.vz / sp;
    }
    if (this.phase === 'results' && sp < 1.5) {
      const a = this.time * 0.25;
      return { pos: new THREE.Vector3(r.x + Math.cos(a) * 6, r.y + 2.4, r.z + Math.sin(a) * 6), target: new THREE.Vector3(r.x, r.y + 0.8, r.z), fov: 50 };
    }
    const dist = r.state === 'crash' ? 5 : 6.2 + Math.min(sp, 30) * 0.07;
    const h = 2.3 + Math.min(sp, 30) * 0.035;
    const pos = new THREE.Vector3(r.x - dx * dist, r.y + h, r.z - dz * dist);
    const gy = COURSE.groundY(pos.x, pos.z);
    if (pos.y < gy + 1.4) pos.y = gy + 1.4;
    const target = new THREE.Vector3(r.x + dx * 5, r.y + 0.6, r.z + dz * 5);
    return { pos, target, fov: 52 + Math.min(sp, 30) * 0.6 };
  }

  focusPoint() {
    const r = this.player;
    return new THREE.Vector3(r.x, r.y, r.z);
  }

  /* ------------------------------ Loop ------------------------------ */
  update(dtRaw: number) {
    const dt = Math.min(dtRaw, 1 / 20);
    this.time += dt;
    const active = this.activeRacers();
    const ev: RacerEvent[] = [];

    if (this.phase === 'countdown') {
      this.countT += dt;
      const n = Math.floor(this.countT);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n <= 2) {
          this.M.lights.forEach((l, k) => {
            const on = k <= n;
            l.color.set(on ? '#ff2a2a' : '#330000');
            l.emissive.set('#ff2a2a');
            l.emissiveIntensity = on ? 3 : 0;
          });
          this.audio.beep(false);
          this.emit();
        } else if (n === 3) {
          this.M.lights.forEach((l) => {
            l.color.set('#2aff6a');
            l.emissive.set('#2aff6a');
            l.emissiveIntensity = 4;
          });
          this.audio.beep(true);
          this.phase = 'race';
          this.raceTime = 0;
          active.forEach((r) => r.go());
          this.cheerBoost = 1.5;
          this.pushMessage('GO!', 'Tahan ↑ untuk tuck, belok ← →', 'go');
        }
      }
    }
    if (this.phase === 'race' || this.phase === 'results') {
      // palang start membuka
      this.resetWandsIfNeeded();
      this.M.wands.forEach((w, i) => {
        const q = this.wandBase[i].clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.min(1, this.raceTime * 4) * 1.4));
        w.quaternion.copy(q);
      });
      this.raceTime += dt;
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS.dt && n < 8) {
        for (const r of active) {
          const inp = r.ai ? r.aiInput(this.time) : this.playerInput();
          r.step(PHYS.dt, inp, this.raceTime, ev);
        }
        collideRacers(active, ev);
        this.acc -= PHYS.dt;
        n++;
      }
      if (n >= 8) this.acc = 0;
    }
    this.handleEvents(ev);
    if (this.phase === 'race' && this.player.finishTime >= 0 && this.resultsT < 0) this.resultsT = 2.2;
    if (this.resultsT > 0) {
      this.resultsT -= dt;
      if (this.resultsT <= 0) {
        this.phase = 'results';
        this.emit();
      }
    }

    // sorakan penonton saat pemain melewati kerumunan
    const p = this.player;
    let crowdLevel = 0;
    this.M.clusters.forEach((c, k) => {
      const dist = Math.hypot(c.x - p.x, c.z - p.z);
      crowdLevel += Math.min(1, c.n / 60) * Math.max(0, 1 - dist / 70);
      if (this.phase === 'race' && dist < 34 && !this.cheered.has(k)) {
        this.cheered.add(k);
        this.audio.cheer(Math.min(1, 0.4 + c.n / 120), 1.6);
        this.cheerBoost = Math.max(this.cheerBoost, 1);
      }
    });
    this.cheerBoost = Math.max(0, this.cheerBoost - dt * 0.4);
    const u = this.M.crowdUniforms;
    u.uTime.value = this.time;
    u.uFocus.value.set(p.x, p.y, p.z);
    u.uCheer.value = 1 + this.cheerBoost;
    this.audio.update(p.speed(), p.slip, p.air, Math.min(1, crowdLevel), this.phase === 'race' || this.phase === 'results');

    this.updateVisuals(dt);
    this.updateSpray(dt, active);
    this.confetti.update(dt);
    this.M.updateLift(this.time);
    this.shake *= Math.exp(-dt * 6);

    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.25;
      this.drawBoard();
    }
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.1;
      this.emit();
    }
  }

  private resetWandsIfNeeded() {
    if (!this.wandBase.length) this.wandBase = this.M.wands.map((w) => w.quaternion.clone());
  }

  private playerInput(): RacerInput {
    const inp = { ...this.input };
    if (inp.jump) {
      if (this.jumpLatch) inp.jump = false;
      else this.jumpLatch = true;
    } else this.jumpLatch = false;
    return inp;
  }

  private handleEvents(ev: RacerEvent[]) {
    const pid = PLAYER_SLOT;
    for (const e of ev) {
      const me = e.racer === pid;
      switch (e.type) {
        case 'gate':
          if (me) this.audio.gate(true);
          break;
        case 'miss':
          if (me) {
            this.audio.gate(false);
            this.pushMessage('GERBANG TERLEWAT', '+2 detik penalti ⏱️', 'miss');
          }
          break;
        case 'takeoff':
          if (me && e.value === 1) this.audio.whoosh();
          break;
        case 'land': {
          const air = e.value ?? 0;
          this.burst(e.x, e.y, e.z, Math.min(70, 10 + air * 50), 3 + air * 2);
          if (me) {
            this.audio.land(air);
            this.shake = Math.max(this.shake, Math.min(0.25, air * 0.15));
            if (air > 0.75) this.pushMessage(`MELAYANG ${air.toFixed(2)} dtk!`, air > 1.1 ? 'Big air! Penonton histeris 🤩' : 'Lompatan mantap!', 'air');
            if (air > 0.6) {
              this.audio.cheer(Math.min(1, air * 0.7), 1.2);
              this.cheerBoost = Math.max(this.cheerBoost, 1.4);
            }
          }
          break;
        }
        case 'trick':
          if (me) {
            this.pushMessage(e.text ?? 'TRIK!', 'Putaran di udara! 🌀', 'trick');
            this.audio.cheer(1, 2);
            this.cheerBoost = 2;
          }
          break;
        case 'crash':
          this.burst(e.x, e.y, e.z, 90, 5);
          if (me) {
            this.audio.thud(e.value ?? 10);
            this.shake = 0.35;
            this.pushMessage('JATUH!', e.text ?? 'Aduh!', 'crash');
          }
          break;
        case 'fence':
          if (me) {
            this.audio.thud((e.value ?? 2) * 0.5);
            this.shake = Math.max(this.shake, 0.12);
          }
          break;
        case 'bump':
          if (me || e.text === String(pid)) {
            this.audio.thud((e.value ?? 2) * 0.6);
            this.shake = Math.max(this.shake, 0.15);
          }
          break;
        case 'finish': {
          const fin = this.racers.filter((r) => r.finishTime >= 0).length;
          if (me) {
            const pos = this.standings().findIndex((s) => s.player) + 1;
            const win = pos === 1;
            this.audio.fanfare(win);
            this.cheerBoost = 2.5;
            const f = COURSE.worldAt(COURSE.finishS, 0);
            this.confetti.burst(new THREE.Vector3(f.x, f.y + 7, f.z), win ? 380 : 200, 1.4);
            this.pushMessage(win ? 'JUARA 1! 🥇' : `FINISH #${pos}`, `Waktu ${formatTime(e.value ?? 0)}`, win ? 'win' : 'finish');
          } else if (fin === 1) {
            this.audio.cowbell(3);
          }
          break;
        }
      }
    }
    if (ev.length) this.emit();
  }

  private burst(x: number, y: number, z: number, n: number, power: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * power;
      this.spawn(x, y + 0.1, z, Math.cos(a) * sp, 1 + Math.random() * power * 0.8, Math.sin(a) * sp, 0.6 + Math.random() * 0.6);
    }
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    const i = this.sprayNext;
    this.sprayNext = (this.sprayNext + 1) % this.sprayN;
    this.sprayPos[i * 3] = x;
    this.sprayPos[i * 3 + 1] = y;
    this.sprayPos[i * 3 + 2] = z;
    this.sprayVel[i * 3] = vx;
    this.sprayVel[i * 3 + 1] = vy;
    this.sprayVel[i * 3 + 2] = vz;
    this.sprayLife[i] = life;
  }

  private updateSpray(dt: number, active: Racer[]) {
    for (const r of active) {
      if (r.state === 'hold' || r.air) continue;
      const sp = r.speed();
      const rate = r.slip * 22 + (r.state === 'crash' ? 60 : 0) + sp * 0.8;
      this.sprayAcc[r.id] += rate * dt;
      const sx = -Math.sin(r.phi);
      const sz = Math.cos(r.phi);
      const side = Math.sign(r.steer) || 1;
      while (this.sprayAcc[r.id] >= 1) {
        this.sprayAcc[r.id] -= 1;
        const lat = (0.5 + Math.random() * 2.2) * side * Math.min(1, r.slip / 3 + 0.2);
        this.spawn(
          r.x + (Math.random() - 0.5) * 0.4,
          r.y + 0.05,
          r.z + (Math.random() - 0.5) * 0.4,
          r.vx * 0.35 - sx * lat + (Math.random() - 0.5),
          0.6 + Math.random() * (1 + r.slip * 0.25),
          r.vz * 0.35 - sz * lat + (Math.random() - 0.5),
          0.35 + Math.random() * 0.5,
        );
      }
    }
    const P = this.sprayPos;
    const V = this.sprayVel;
    for (let i = 0; i < this.sprayN; i++) {
      if (this.sprayLife[i] <= 0) continue;
      this.sprayLife[i] -= dt;
      if (this.sprayLife[i] <= 0) {
        P[i * 3 + 1] = -9999;
        continue;
      }
      V[i * 3 + 1] -= 5.5 * dt;
      const k = Math.exp(-dt * 2.2);
      V[i * 3] *= k;
      V[i * 3 + 2] *= k;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
    }
    (this.spray.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateVisuals(dt: number) {
    const active = new Set(this.activeRacers().map((r) => r.id));
    this.racers.forEach((r, i) => {
      const { rig, poles } = this.vis[i];
      const root = rig.root;
      root.visible = active.has(r.id);
      if (!root.visible) return;
      const t = this.time + i * 0.7;
      root.position.set(r.x, r.y, r.z);
      const cs = Math.cos(r.phi);
      const sn = Math.sin(r.phi);
      if (r.state === 'crash') {
        root.rotation.z += r.crashAxis * dt * 9 * Math.min(1, r.crashT);
        root.rotation.x += dt * 5 * Math.min(1, r.crashT);
        root.position.y += 0.25 + Math.abs(Math.sin(t * 9)) * 0.2 * r.crashT;
        animateBeast(rig, 'fall', t);
        poles.forEach((p) => (p.rotation.x = 0.4));
        return;
      }
      const yaw = Math.atan2(cs, sn);
      const pitch = r.air ? root.rotation.x * Math.exp(-dt * 2) : Math.atan(-(r.gx * cs + r.gz * sn));
      root.rotation.set(pitch, yaw, r.lean * 0.9);
      const stopped = r.finishTime >= 0 && r.speed() < 1.2;
      if (stopped) {
        animateBeast(rig, this.standings()[0]?.id === r.id ? 'dance' : 'wave', t);
        poles.forEach((p) => (p.rotation.x = 0.2));
        return;
      }
      // pose ski
      const tk = r.tuck;
      rig.body.position.y = 0.26 - tk * 0.14 - (r.landT > 0 ? r.landT * 0.25 : 0);
      rig.body.rotation.set(0.25 + tk * 0.55, 0, -r.lean * 0.25);
      const wob = Math.sin(t * 22) * r.wobble * 0.08;
      rig.body.scale.set(1 + wob, 1 - wob * 1.4, 1 + wob);
      rig.legL.rotation.set(-0.25 - tk * 0.3, 0, 0);
      rig.legR.rotation.set(-0.25 - tk * 0.3, 0, 0);
      if (r.state === 'hold') {
        const plant = this.phase === 'countdown' ? Math.sin(this.countT * Math.PI * 2) * 0.3 : 0;
        rig.armL.rotation.set(-0.7 + plant, 0, -0.35);
        rig.armR.rotation.set(-0.7 + plant, 0, 0.35);
        rig.body.rotation.x = 0.35;
      } else if (r.air && r.airT > 0.22) {
        rig.armL.rotation.set(-0.4, 0, -1.8 - Math.sin(t * 14) * 0.6);
        rig.armR.rotation.set(-0.4, 0, 1.8 + Math.cos(t * 13) * 0.6);
        rig.legL.rotation.x = -0.7;
        rig.legR.rotation.x = -0.7;
      } else if (r.raceStartPush(this.raceTime)) {
        const k = Math.sin(this.raceTime * 9);
        rig.armL.rotation.set(-0.6 + k * 0.9, 0, -0.3);
        rig.armR.rotation.set(-0.6 + k * 0.9, 0, 0.3);
      } else {
        rig.armL.rotation.set(-0.55 - tk * 0.9, 0, -0.3 + tk * 0.15);
        rig.armR.rotation.set(-0.55 - tk * 0.9, 0, 0.3 - tk * 0.15);
      }
      poles.forEach((p) => (p.rotation.x = lerp(0.9, 1.5, tk)));
    });
  }

  standings(): Standing[] {
    const list = this.activeRacers().map((r) => ({
      id: r.id,
      name: NAMES[r.id],
      color: COLORS[r.id],
      player: !r.ai,
      time: r.finishTime,
      progress: Math.max(0, Math.min(1, (r.s - COURSE.startS) / (COURSE.finishS - COURSE.startS))),
      finished: r.finishTime >= 0,
      penalty: r.penalty,
      missed: r.missed,
    }));
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    return list;
  }

  private drawBoard() {
    const st = this.standings();
    this.M.timing.draw(
      'Jelly Peak Ski Cross',
      this.phase === 'pre' ? 'SIAP' : this.phase === 'countdown' ? `${3 - Math.floor(this.countT)}` : formatTime(this.player.finishTime >= 0 ? this.player.finishTime : this.raceTime),
      st.map((s) => ({
        name: s.name,
        color: s.color,
        time: s.finished ? formatTime(s.time) : this.phase === 'race' || this.phase === 'results' ? `${Math.round(s.progress * 100)}%` : '--',
        status: s.finished ? (s.penalty ? `+${s.penalty}s` : 'FINISH') : this.racers[s.id].state === 'crash' ? 'JATUH' : this.phase === 'pre' ? 'START' : 'LIVE',
      })),
    );
  }

  private pushMessage(text: string, sub: string | undefined, kind: SkiMsgKind) {
    this.message = { id: ++this.msgId, text, sub, kind };
    this.emit();
  }

  private buildSnap(): SkiSnapshot {
    const p = this.player;
    const st = this.standings();
    const sp = p.speed();
    return {
      phase: this.phase,
      countdown: this.phase === 'countdown' ? 3 - Math.floor(this.countT) : 0,
      raceTime: p.finishTime >= 0 ? p.finishTime : this.raceTime + p.penalty,
      speedKmh: sp * 3.6,
      maxKmh: p.maxSpeed * 3.6,
      position: st.findIndex((s) => s.player) + 1,
      racers: st.length,
      gatesOk: p.gatesOk,
      missed: p.missed,
      gatesTotal: COURSE.gates.length,
      penalty: p.penalty,
      progress: st.find((s) => s.player)?.progress ?? 0,
      bestAir: p.bestAir,
      crashed: p.state === 'crash',
      air: p.air,
      tuck: p.tuck > 0.5,
      finishTime: p.finishTime,
      standings: st,
      message: this.message,
      dots: this.activeRacers().map((r) => ({ x: r.x, z: r.z, color: COLORS[r.id], player: !r.ai })),
    };
  }

  private emit() {
    this.snap = this.buildSnap();
    this.listeners.forEach((f) => f(this.snap));
  }
}

declare module './racer' {
  interface Racer {
    raceStartPush(t: number): boolean;
  }
}
Racer.prototype.raceStartPush = function (this: Racer, t: number) {
  return this.state === 'race' && t < 1.6 && this.s < COURSE.startS + 14;
};
