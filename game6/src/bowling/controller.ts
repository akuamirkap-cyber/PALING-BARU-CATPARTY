import * as THREE from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { BALL_R, BOWLER_X0, FOUL_X, HEAD_X, LANE_COUNT, LANE_W, PIN_H, PIN_SPOTS, PIT_X, PLAYER_LANE, RETURN_X, laneZ, returnSlot } from './dims';
import { BowlingPhysics, PHYS, PathPredictor, loadRapier, pinFallen, pinStanding, throwSpeed, type ColMeta, type ThrowParams } from './physics';
import { BowlingGame, isSplit, type GameState } from './scoring';
import { BowlingAudio, type HitKind } from './audio';
import { Confetti, ImpactStars } from './effects';
import { predictPath, solveAngle } from './model';
import { animateBeast, createBeast, type BeastMode, type BeastRig, type HatKind } from '../scene/beast';
import { createBallGeometry, createPinEyesGeometry, createPinGeometry } from './pin';
import { createBallTexture, type MonitorLane } from './textures';
import type { BowlingMaterials } from './materials';

export type LaneState = 'loading' | 'ready' | 'approach' | 'rolling' | 'settling' | 'reset' | 'done';
export type MsgKind = 'strike' | 'spare' | 'gutter' | 'split' | 'count' | 'end' | 'miss';
export type LightMode = 'normal' | 'cosmic' | 'disco';
export interface BowlingMessage {
  id: number;
  text: string;
  sub?: string;
  kind: MsgKind;
}
export interface BowlingOptions {
  followBall: boolean;
  slowmo: boolean;
  sound: boolean;
  aiLanes: boolean;
  eyes: boolean;
  beastBall: boolean;
  mode: LightMode;
}
export interface BowlingSnapshot {
  ready: boolean;
  state: LaneState;
  game: GameState;
  standing: boolean[];
  message: BowlingMessage | null;
  aim: ThrowParams;
  speedKmh: number;
  entryAngle: number | null;
  canThrow: boolean;
}

interface PinRt {
  body: RigidBody | null;
  rest: THREE.Vector3;
  active: boolean;
  inPlay: boolean;
  keep: boolean;
  carried: boolean;
  pushed: boolean;
  cx: number;
  cz: number;
  lastSound: number;
}
interface ResetRt {
  t: number;
  fresh: boolean;
  grabbed: boolean;
  cleared: boolean;
  spawned: boolean;
  placed: boolean;
}
interface LaneRt {
  i: number;
  z: number;
  ai: boolean;
  name: string;
  skill: number;
  pins: PinRt[];
  ball: RigidBody | null;
  ballObj: THREE.Group;
  ballState: 'rack' | 'hand' | 'play' | 'return';
  returnT: number;
  gutter: boolean;
  hitPins: boolean;
  celebrated: boolean;
  state: LaneState;
  t: number;
  quiet: number;
  params: ThrowParams;
  game: BowlingGame;
  bowler: BeastRig;
  react: BeastMode | null;
  reactT: number;
  sweep: THREE.Group;
  table: THREE.Group;
  reset: ResetRt | null;
  aiTimer: number;
  lastSpeed: number;
  entryAngle: number | null;
  ledFlash: number;
  banner: { text: string; color: string } | null;
  bannerT: number;
}

const AI_NAMES = ['BLOBBY', 'WOBBLY', 'KAMU', 'JIGGLE', 'SQUISHY', 'BEEFY'];
const AI_COLORS = ['#4dabf7', '#69db7c', '#ff7a3d', '#f783ac', '#b197fc', '#ffd43b'];
const AI_HATS: HatKind[] = ['sailor', 'none', 'sailor', 'party', 'captain', 'party'];
const BALL_SKINS: [string, string][] = [
  ['#7b2ff7', '#ff4fd8'],
  ['#0f4cff', '#29e7ff'],
  ['#ff3b3b', '#ffe14d'],
  ['#0b8f5a', '#6dff7a'],
  ['#ff6a00', '#ffd23f'],
  ['#d61f8a', '#ffffff'],
];
const APPROACH = 1.45;
const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class BowlingController {
  runtime = new THREE.Group();
  pinGeo = createPinGeometry();
  eyesGeo = createPinEyesGeometry();
  ballGeo = createBallGeometry();
  pinMat: THREE.MeshPhysicalMaterial;
  eyesMat: THREE.MeshStandardMaterial;
  ballMats: THREE.MeshPhysicalMaterial[];
  pinsMesh: THREE.InstancedMesh;
  eyesMesh: THREE.InstancedMesh;
  lanes: LaneRt[] = [];
  phys: BowlingPhysics | null = null;
  predictor: PathPredictor | null = null;
  audio = new BowlingAudio();
  confetti = new Confetti();
  stars = new ImpactStars();
  guide: THREE.InstancedMesh;
  options: BowlingOptions = { followBall: true, slowmo: true, sound: true, aiLanes: true, eyes: true, beastBall: false, mode: 'normal' };
  aim: ThrowParams = { position: 0.35, angle: 0.31, power: 0.6, spin: 0.6 };
  shake = 0;
  timeScale = 1;
  private M: BowlingMaterials;
  private monitors: { draw: (a: MonitorLane, b: MonitorLane, banner: { text: string; color: string } | null, t: number) => void }[];
  private listeners = new Set<(s: BowlingSnapshot) => void>();
  private snap: BowlingSnapshot;
  private message: BowlingMessage | null = null;
  private msgId = 0;
  private slowmoT = 0;
  private acc = 0;
  private simTime = 0;
  private loading = false;
  private aiBase: ThrowParams = { position: 0.35, angle: 0.31, power: 0.6, spin: 0.6 };
  private guideDirty = true;
  private guideT = 0;
  private monitorT = 0;
  private monitorDirty = true;
  private endMsgT = -1;
  private camera: THREE.Camera | null = null;
  private tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), zero: new THREE.Vector3(0, 0, 0) };
  private ledBase: THREE.Color[] = [];
  private beastBall: THREE.Group;
  private classicBall: THREE.Mesh | null = null;

  constructor(M: BowlingMaterials, monitors: BowlingController['monitors']) {
    this.M = M;
    this.monitors = monitors;
    this.runtime.name = 'BowlingRuntime';
    this.runtime.userData.noExport = true;

    this.pinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, emissive: '#9fe8ff', emissiveIntensity: 0 });
    this.pinMat.name = 'Pin_Coating';
    this.eyesMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2 });
    this.eyesMat.name = 'Pin_Eyes';
    const n = LANE_COUNT * 10;
    this.pinsMesh = new THREE.InstancedMesh(this.pinGeo, this.pinMat, n);
    this.pinsMesh.name = 'Pins';
    this.pinsMesh.castShadow = true;
    this.pinsMesh.receiveShadow = true;
    this.pinsMesh.frustumCulled = false;
    this.eyesMesh = new THREE.InstancedMesh(this.eyesGeo, this.eyesMat, n);
    this.eyesMesh.name = 'Pin_Eyes';
    this.eyesMesh.frustumCulled = false;
    this.runtime.add(this.pinsMesh, this.eyesMesh);

    this.ballMats = BALL_SKINS.map(([a, b], i) => {
      const m = new THREE.MeshPhysicalMaterial({ map: createBallTexture(a, b, i + 3), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0.05 });
      m.name = `Ball_${i + 1}`;
      return m;
    });
    this.beastBall = this.makeBeastBall();

    const sweepMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.7, roughness: 0.35 });
    sweepMat.name = 'Sweep_Bar';
    const tableMat = new THREE.MeshStandardMaterial({ color: '#3a3f4a', metalness: 0.6, roughness: 0.4 });
    tableMat.name = 'Setter_Table';

    for (let i = 0; i < LANE_COUNT; i++) {
      const z = laneZ(i);
      const ai = i !== PLAYER_LANE;
      const pins: PinRt[] = PIN_SPOTS.map(([dx, dz]) => ({
        body: null,
        rest: new THREE.Vector3(HEAD_X + dx, 0.0004, z + dz),
        active: true,
        inPlay: true,
        keep: false,
        carried: false,
        pushed: false,
        cx: HEAD_X + dx,
        cz: z + dz,
        lastSound: 0,
      }));
      const ballObj = new THREE.Group();
      ballObj.name = `Ball_Lane${i + 1}`;
      const bm = new THREE.Mesh(this.ballGeo, this.ballMats[i]);
      bm.castShadow = true;
      ballObj.add(bm);
      if (i === PLAYER_LANE) {
        this.classicBall = bm;
        ballObj.add(this.beastBall);
        this.beastBall.visible = false;
      }
      this.runtime.add(ballObj);
      const bowler = createBeast(AI_COLORS[i], AI_HATS[i]);
      bowler.root.position.set(BOWLER_X0, 0, z);
      bowler.root.rotation.y = Math.PI / 2;
      this.runtime.add(bowler.root);
      const sweep = new THREE.Group();
      sweep.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, LANE_W + 0.4), sweepMat));
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.03), sweepMat);
        arm.position.set(0.25, 0.04, s * (LANE_W / 2 + 0.2));
        sweep.add(arm);
      }
      sweep.position.set(HEAD_X - 0.42, 1.28, z);
      const table = new THREE.Group();
      table.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, LANE_W - 0.02), tableMat));
      table.position.set(HEAD_X + 0.4, 1.34, z);
      this.runtime.add(sweep, table);
      this.lanes.push({
        i,
        z,
        ai,
        name: AI_NAMES[i],
        skill: ai ? 0.6 + ((i * 37) % 10) / 10 : 1,
        pins,
        ball: null,
        ballObj,
        ballState: 'rack',
        returnT: 0,
        gutter: false,
        hitPins: false,
        celebrated: false,
        state: 'loading',
        t: 0,
        quiet: 0,
        params: { ...this.aim },
        game: new BowlingGame(),
        bowler,
        react: null,
        reactT: 0,
        sweep,
        table,
        reset: null,
        aiTimer: 2 + i * 1.7,
        lastSpeed: 0,
        entryAngle: null,
        ledFlash: 0,
        banner: null,
        bannerT: 0,
      });
      this.ledBase.push(M.laneLeds[i].emissive.clone());
    }

    const gGeo = new THREE.CircleGeometry(0.022, 10);
    gGeo.rotateX(-Math.PI / 2);
    const gMat = new THREE.MeshBasicMaterial({ color: '#7cf7ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    gMat.name = 'Aim_Guide';
    this.guide = new THREE.InstancedMesh(gGeo, gMat, 70);
    this.guide.name = 'Aim_Guide';
    this.guide.frustumCulled = false;
    this.guide.renderOrder = 3;
    this.runtime.add(this.guide, this.confetti.mesh, this.stars.mesh);
    this.syncPins();
    this.snap = this.buildSnap();
  }

  private makeBeastBall() {
    const g = new THREE.Group();
    g.name = 'Beast_Ball';
    const skin = new THREE.MeshPhysicalMaterial({ color: '#ff7a3d', roughness: 0.4, clearcoat: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), skin);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), dark);
      eye.scale.set(0.7, 1.3, 0.5);
      eye.position.set(s * 0.035, 0.03, BALL_R - 0.006);
      g.add(eye);
      const nub = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.04, 4, 8), skin);
      nub.position.set(s * (BALL_R - 0.01), -0.02, 0.02);
      nub.rotation.z = s * 0.9;
      g.add(nub);
    }
    return g;
  }

  /* ------------------------------ API publik ------------------------------ */
  subscribe(fn: (s: BowlingSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snap);
    return () => {
      this.listeners.delete(fn);
    };
  }
  getSnapshot() {
    return this.snap;
  }

  async initPhysics() {
    if (this.phys || this.loading) return;
    this.loading = true;
    const R = await loadRapier();
    this.phys = new BowlingPhysics(R);
    this.predictor = new PathPredictor(R);
    this.lanes.forEach((ln, i) => {
      ln.ball = this.phys!.lanes[i].ball;
      ln.pins.forEach((p, k) => (p.body = this.phys!.lanes[i].pins[k]));
      ln.state = 'ready';
      ln.t = 0;
    });
    for (let s = 0; s < 160; s++) this.phys.step();
    const base = { position: 0.35, angle: 0, power: 0.6, spin: 0.6 };
    this.aiBase = { ...base, angle: this.predictor.solve(PLAYER_LANE, base) };
    if (Math.abs(this.aim.angle - 0.31) < 1e-6) this.aim.angle = this.aiBase.angle;
    this.guideDirty = true;
    this.emit();
  }

  setOptions(o: Partial<BowlingOptions>) {
    const prev = this.options;
    this.options = { ...this.options, ...o };
    this.audio.setEnabled(this.options.sound);
    this.eyesMesh.visible = this.options.eyes;
    this.beastBall.visible = this.options.beastBall;
    if (this.classicBall) this.classicBall.visible = !this.options.beastBall;
    if (prev.mode !== this.options.mode || o.mode) this.applyMode(this.options.mode);
  }

  setAim(p: Partial<ThrowParams>) {
    this.aim = {
      position: Math.max(-1, Math.min(1, p.position ?? this.aim.position)),
      angle: Math.max(-1, Math.min(1, p.angle ?? this.aim.angle)),
      power: Math.max(0, Math.min(1, p.power ?? this.aim.power)),
      spin: Math.max(-1, Math.min(1, p.spin ?? this.aim.spin)),
    };
    this.guideDirty = true;
    this.emit();
  }

  autoAim() {
    const p = { ...this.aim };
    this.aim.angle = this.predictor ? this.predictor.solve(PLAYER_LANE, p) : solveAngle(laneZ(PLAYER_LANE), p);
    this.guideDirty = true;
    this.emit();
  }

  throwBall(power: number) {
    const ln = this.lanes[PLAYER_LANE];
    if (!this.phys || ln.state !== 'ready') return false;
    this.audio.ensure();
    this.audio.setEnabled(this.options.sound);
    this.startThrow(ln, { ...this.aim, power: Math.max(0, Math.min(1, power)) });
    return true;
  }

  newGame() {
    const ln = this.lanes[PLAYER_LANE];
    if (ln.state !== 'done' && ln.state !== 'ready') return;
    ln.game.reset();
    this.message = null;
    this.endMsgT = -1;
    if (ln.pins.every((p) => p.active)) ln.state = 'ready';
    else {
      // restart di tengah frame → pinsetter menyapu sisa pin & memasang rak baru
      ln.pins.forEach((p) => (p.keep = false));
      ln.reset = { t: 0, fresh: true, grabbed: false, cleared: false, spawned: false, placed: false };
      ln.state = 'reset';
      ln.t = 0;
    }
    this.monitorDirty = true;
    this.emit();
  }

  /** Kamera ikut bola (dipakai BowlingSystem). */
  getCameraRig(): { pos: THREE.Vector3; target: THREE.Vector3 } | null {
    const ln = this.lanes[PLAYER_LANE];
    const pinCam = { pos: new THREE.Vector3(HEAD_X - 2.3, 0.78, ln.z + 0.3), target: new THREE.Vector3(HEAD_X + 0.42, 0.14, ln.z) };
    if (ln.state === 'approach') {
      const b = ln.bowler.root.position;
      return { pos: new THREE.Vector3(b.x - 2.4, 2.35, ln.z - 0.7), target: new THREE.Vector3(FOUL_X + 9, 0.1, ln.z) };
    }
    if (ln.state === 'rolling' && ln.ball && ln.ballState === 'play') {
      const t = ln.ball.translation();
      if (t.x < HEAD_X - 3.6 && t.y > -0.05) {
        return { pos: new THREE.Vector3(t.x - 2.2, 0.6, lerp(t.z, ln.z, 0.4)), target: new THREE.Vector3(t.x + 3, 0.06, lerp(t.z, ln.z, 0.5)) };
      }
      return pinCam;
    }
    if (ln.state === 'settling' || (ln.state === 'reset' && ln.reset && ln.reset.t < 1.3)) return pinCam;
    return null;
  }

  /* ------------------------------ Loop utama ------------------------------ */
  update(dtReal: number, camera: THREE.Camera) {
    this.camera = camera;
    const dt = Math.min(dtReal, 1 / 20);
    if (this.slowmoT > 0) this.slowmoT -= dt;
    const target = this.slowmoT > 0 ? 0.28 : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, dt * (target < this.timeScale ? 12 : 2.5));
    const sdt = dt * this.timeScale;
    this.simTime += sdt;

    for (const ln of this.lanes) this.updateLane(ln, sdt);

    if (this.phys) {
      this.acc += sdt;
      let n = 0;
      while (this.acc >= PHYS.dt && n < 10) {
        this.phys.step(this.onHit);
        this.acc -= PHYS.dt;
        n++;
      }
      if (n >= 10) this.acc = 0;
    }

    this.syncPins();
    this.syncBalls();
    this.confetti.update(sdt);
    this.stars.update(sdt, camera);
    this.shake *= Math.exp(-dt * 7);
    this.updateAudio(camera);
    this.updateLeds(dt);
    this.updateGuide(dt);
    this.updateMonitors(dt);
    if (this.endMsgT > 0) {
      this.endMsgT -= dt;
      if (this.endMsgT <= 0) {
        const total = this.lanes[PLAYER_LANE].game.state().total;
        this.pushMessage(total >= 300 ? 'PERFECT 300!' : `SKOR ${total}`, total >= 300 ? '🏆 Permainan sempurna!' : total >= 200 ? 'Luar biasa! 🔥' : total >= 120 ? 'Mantap!' : 'Coba lagi?', 'end');
        this.audio.jingle('end');
      }
    }
  }

  /** Untuk pengujian otomatis: majukan simulasi tanpa render. */
  debugAdvance(seconds: number) {
    const cam = this.camera ?? new THREE.PerspectiveCamera();
    for (let i = 0; i < Math.round(seconds * 60); i++) this.update(1 / 60, cam);
  }

  /* ------------------------------ Logika lintasan ------------------------------ */
  private startThrow(ln: LaneRt, p: ThrowParams) {
    ln.params = p;
    ln.state = 'approach';
    ln.t = 0;
    ln.react = null;
    ln.ballState = 'hand';
    if (!ln.ai) {
      this.message = null;
      this.emit();
    }
  }

  private aiParams(ln: LaneRt): ThrowParams {
    const r = (a: number) => (Math.random() * 2 - 1) * a * ln.skill;
    const b = this.aiBase;
    return { position: b.position + r(0.03), angle: b.angle + r(0.02), power: b.power + r(0.07), spin: b.spin + r(0.06) };
  }

  private updateLane(ln: LaneRt, sdt: number) {
    ln.t += sdt;
    if (ln.reactT > 0) ln.reactT -= sdt;
    if (ln.bannerT > 0) {
      ln.bannerT -= sdt;
      if (ln.bannerT <= 0) {
        ln.banner = null;
        this.monitorDirty = true;
      }
    }
    if (ln.ballState === 'return') {
      ln.returnT -= sdt;
      if (ln.returnT <= 0) ln.ballState = 'rack';
    }
    const rig = ln.bowler;
    rig.root.visible = !ln.ai || this.options.aiLanes;
    const off = (ln.ai ? ln.params.position : this.aim.position) * 0.42;
    const t = this.simTime + ln.i * 0.7;

    switch (ln.state) {
      case 'loading':
      case 'ready':
      case 'done': {
        rig.root.position.set(BOWLER_X0, 0, ln.z + (ln.state === 'ready' && !ln.ai ? off : 0));
        rig.root.rotation.set(0, Math.PI / 2, 0);
        animateBeast(rig, ln.reactT > 0 && ln.react ? ln.react : ln.state === 'done' ? 'dance' : 'idle', t);
        if (ln.ai && ln.state === 'ready' && this.options.aiLanes && this.phys) {
          if (ln.game.state().done) ln.game.reset();
          ln.aiTimer -= sdt;
          if (ln.aiTimer <= 0 && ln.ballState === 'rack') this.startThrow(ln, this.aiParams(ln));
        }
        break;
      }
      case 'approach': {
        const u = Math.min(1, ln.t / APPROACH);
        const e = u < 0.85 ? Math.pow(u / 0.85, 1.2) : 1;
        const x = BOWLER_X0 + (FOUL_X - 0.4 - BOWLER_X0) * e;
        const z = ln.z + ln.params.position * 0.42 - 0.3;
        rig.root.position.set(x, 0, z);
        rig.root.rotation.set(0, Math.PI / 2, 0);
        animateBeast(rig, u < 0.82 ? 'walk' : 'idle', t * 1.3);
        const arm = u < 0.2 ? lerp(-0.7, -0.3, u / 0.2) : u < 0.62 ? lerp(-0.3, 1.7, ease((u - 0.2) / 0.42)) : lerp(1.7, -1.15, ease((u - 0.62) / 0.38));
        rig.armR.rotation.set(arm, 0, 0.1);
        const lean = u > 0.58 ? ease((u - 0.58) / 0.42) : 0;
        rig.body.rotation.x = 0.38 * lean;
        rig.body.position.y = 0.3 - 0.13 * lean;
        rig.legL.rotation.x = -0.7 * lean;
        rig.legR.rotation.x = 0.9 * lean;
        if (u >= 1 && this.phys) this.release(ln);
        break;
      }
      case 'rolling':
      case 'settling': {
        const follow = ln.t < 0.8 && ln.state === 'rolling';
        if (follow) {
          animateBeast(rig, 'idle', t);
          rig.armR.rotation.set(-1.4, 0, 0.1);
          rig.body.rotation.x = 0.3;
          rig.body.position.y = 0.2;
          rig.legL.rotation.x = -0.6;
          rig.legR.rotation.x = 0.8;
        } else animateBeast(rig, ln.reactT > 0 && ln.react ? ln.react : 'idle', t);
        if (ln.state === 'rolling') this.updateRolling(ln, sdt);
        else this.updateSettling(ln, sdt);
        if (!ln.celebrated && ln.hitPins) this.checkEarly(ln);
        break;
      }
      case 'reset': {
        const back = Math.min(1, ln.t / 1.6);
        const x = lerp(FOUL_X - 0.4, BOWLER_X0, ease(back));
        rig.root.position.x = x;
        rig.root.position.z = lerp(rig.root.position.z, ln.z, Math.min(1, sdt * 3));
        rig.root.rotation.y = back < 1 && ln.reactT <= 0 ? -Math.PI / 2 : Math.PI / 2;
        animateBeast(rig, ln.reactT > 0 && ln.react ? ln.react : back < 1 ? 'walk' : 'idle', t);
        this.updateReset(ln, sdt);
        break;
      }
    }
  }

  private release(ln: LaneRt) {
    if (!this.phys) return;
    this.phys.launch(ln.i, ln.params);
    ln.ballState = 'play';
    ln.state = 'rolling';
    ln.t = 0;
    ln.gutter = false;
    ln.hitPins = false;
    ln.celebrated = false;
    ln.entryAngle = null;
    ln.lastSpeed = throwSpeed(ln.params.power);
    ln.pins.forEach((p) => (p.inPlay = p.active));
    if (!ln.ai) this.emit();
  }

  private updateRolling(ln: LaneRt, sdt: number) {
    const b = ln.ball;
    if (!b) return;
    const t = b.translation();
    const v = b.linvel();
    const sp = Math.hypot(v.x, v.z);
    if (!ln.gutter && t.x < HEAD_X - 0.4 && Math.abs(t.z - ln.z) > LANE_W / 2 + 0.01 && t.y < BALL_R) ln.gutter = true;
    if (t.x > PIT_X + 0.12 || t.y < -0.08 || (ln.t > 3 && sp < 0.05) || ln.t > 10) {
      b.setEnabled(false);
      ln.ballState = 'return';
      ln.returnT = 2.6;
      ln.state = 'settling';
      ln.t = 0;
      ln.quiet = 0;
    }
    void sdt;
  }

  private updateSettling(ln: LaneRt, sdt: number) {
    const quiet = ln.pins.every((p) => {
      if (!p.active || !p.body) return true;
      if (p.body.isSleeping()) return true;
      const lv = p.body.linvel();
      const av = p.body.angvel();
      return Math.hypot(lv.x, lv.y, lv.z) < 0.06 && Math.hypot(av.x, av.y, av.z) < 0.5;
    });
    ln.quiet = quiet ? ln.quiet + sdt : 0;
    if ((ln.t > 0.9 && ln.quiet > 0.35) || ln.t > 4.5) this.evaluate(ln);
  }

  private checkEarly(ln: LaneRt) {
    const inPlay = ln.pins.filter((p) => p.inPlay);
    if (!inPlay.length) return;
    if (inPlay.every((p) => !p.body || pinFallen(p.body))) {
      ln.celebrated = true;
      const st = ln.game.state();
      if (st.rackFresh) this.celebrate(ln, 'strike', st.strikeStreak + 1);
      else this.celebrate(ln, 'spare', 0);
    }
  }

  private celebrate(ln: LaneRt, kind: 'strike' | 'spare', streak: number) {
    const center = new THREE.Vector3(HEAD_X + 0.4, 0.45, ln.z);
    if (kind === 'strike') {
      const text = streak >= 4 ? `${streak}-BAGGER!` : streak === 3 ? 'TURKEY!' : streak === 2 ? 'DOUBLE!' : 'STRIKE!';
      this.confetti.burst(center, ln.ai ? 70 : 260, ln.ai ? 0.7 : 1);
      ln.ledFlash = 3.5;
      ln.banner = { text, color: '#ff2fa8' };
      ln.bannerT = 3.2;
      ln.react = 'dance';
      ln.reactT = 3;
      if (!ln.ai) {
        this.shake = Math.max(this.shake, 0.06);
        this.audio.jingle(streak >= 3 ? 'turkey' : 'strike');
        this.pushMessage(text, streak >= 3 ? '🦃🔥 Tiga strike beruntun!' : streak === 2 ? 'Dua strike beruntun!' : 'Semua pin roboh! 🎳', 'strike');
      }
    } else {
      this.confetti.burst(center, ln.ai ? 40 : 120, 0.8);
      ln.ledFlash = 2.2;
      ln.banner = { text: 'SPARE!', color: '#14b8d4' };
      ln.bannerT = 2.6;
      ln.react = 'wave';
      ln.reactT = 2.4;
      if (!ln.ai) {
        this.audio.jingle('spare');
        this.pushMessage('SPARE!', 'Rapi! Semua sisa pin bersih ✨', 'spare');
      }
    }
    this.monitorDirty = true;
  }

  private evaluate(ln: LaneRt) {
    const standing = ln.pins.map((p) => !!(p.active && p.body && pinStanding(p.body)));
    const before = ln.game.state();
    const down = ln.pins.filter((p, k) => p.inPlay && !standing[k]).length;
    const inPlay = ln.pins.filter((p) => p.inPlay).length;
    ln.game.add(down);
    const after = ln.game.state();
    if (!ln.celebrated) {
      if (before.rackFresh && down === 10) this.celebrate(ln, 'strike', after.strikeStreak);
      else if (!before.rackFresh && down === inPlay && inPlay > 0) this.celebrate(ln, 'spare', 0);
      else if (!ln.ai) {
        const leave = standing.map((s, k) => (s ? k + 1 : 0)).filter(Boolean).join('-');
        if (down === 0) {
          this.pushMessage(ln.gutter ? 'GUTTER!' : 'MELESET!', ln.gutter ? 'Bola masuk selokan 😭' : 'Tidak ada pin yang roboh', ln.gutter ? 'gutter' : 'miss');
          if (ln.gutter) this.audio.jingle('gutter');
          ln.react = 'fall';
          ln.reactT = 2.2;
        } else if (before.rackFresh && isSplit(standing, PIN_SPOTS)) {
          this.pushMessage(`SPLIT ${leave}!`, 'Waduh, pin terpisah 😬', 'split');
          ln.react = 'punch';
          ln.reactT = 1.8;
        } else {
          this.pushMessage(`${down} PIN`, leave ? `Sisa: ${leave}` : undefined, 'count');
        }
      }
    }
    const fresh = after.rackFresh || after.done;
    ln.pins.forEach((p, k) => (p.keep = !fresh && standing[k]));
    ln.reset = { t: 0, fresh, grabbed: false, cleared: false, spawned: false, placed: false };
    ln.state = 'reset';
    ln.t = 0;
    if (!ln.ai && after.done) this.endMsgT = 2.6;
    this.monitorDirty = true;
    if (!ln.ai) this.emit();
  }

  /** Siklus pinsetter: sweep turun → meja angkat pin berdiri → sapu → pasang ulang. */
  private updateReset(ln: LaneRt, sdt: number) {
    const r = ln.reset;
    if (!r || !this.phys) return;
    r.t += sdt;
    const T = r.t;
    const sUp = 1.28;
    const sDown = 0.1;
    const sx0 = HEAD_X - 0.42;
    const sx1 = PIT_X + 0.25;
    const tUp = 1.34;
    const tDown = PIN_H + 0.06;
    const tHold = 1.0;
    let sy = sUp;
    let sx = sx0;
    let ty = tUp;
    if (T < 0.45) sy = lerp(sUp, sDown, ease(T / 0.45));
    else if (T < 3.05) sy = sDown;
    else sy = lerp(sDown, sUp, ease((T - 3.05) / 0.4));
    if (T >= 1.4 && T < 2.1) sx = lerp(sx0, sx1, ease((T - 1.4) / 0.7));
    else if (T >= 2.1 && T < 2.55) sx = lerp(sx1, sx0, ease((T - 2.1) / 0.45));
    if (T >= 0.45 && T < 0.95) ty = lerp(tUp, tDown, ease((T - 0.45) / 0.5));
    else if (T >= 0.95 && T < 1.4) ty = lerp(tDown, tHold, ease((T - 0.95) / 0.45));
    else if (T >= 1.4 && T < 2.55) ty = tHold;
    else if (T >= 2.55 && T < 3.05) ty = lerp(tHold, tDown, ease((T - 2.55) / 0.5));
    else if (T >= 3.05) ty = lerp(tDown, tUp, ease((T - 3.05) / 0.4));
    ln.sweep.position.set(sx, sy, ln.z);
    ln.table.position.y = ty;
    const P = this.phys;

    if (!r.grabbed && T >= 0.95) {
      r.grabbed = true;
      for (const p of ln.pins) {
        if (!p.keep || !p.body) continue;
        const tr = p.body.translation();
        p.cx = tr.x;
        p.cz = tr.z;
        P.makeKinematic(p.body);
        p.carried = true;
      }
    }
    if (!r.cleared && T >= 1.4) {
      r.cleared = true;
      for (const p of ln.pins) {
        if (!p.active || !p.body || p.carried) continue;
        const tr = p.body.translation();
        if (tr.x > PIT_X || tr.y < -0.03 || Math.abs(tr.z - ln.z) > LANE_W / 2 || tr.x < HEAD_X - 0.7) {
          p.body.setEnabled(false);
          p.active = false;
        }
      }
    }
    if (T >= 1.4 && T < 2.1) {
      for (const p of ln.pins) {
        if (!p.active || !p.body || p.carried) continue;
        const tr = p.body.translation();
        if (!p.pushed && tr.x < sx + 0.12) {
          P.makeKinematic(p.body);
          p.pushed = true;
        }
        if (p.pushed) {
          const nx = Math.max(tr.x, sx + 0.12);
          if (nx > PIT_X + 0.05) {
            p.body.setEnabled(false);
            p.active = false;
            p.pushed = false;
          } else p.body.setNextKinematicTranslation({ x: nx, y: tr.y, z: tr.z });
        }
      }
    }
    if (T >= 2.1 && !r.spawned) {
      for (const p of ln.pins) {
        if (p.pushed && p.body) {
          p.body.setEnabled(false);
          p.active = false;
          p.pushed = false;
        }
      }
    }
    if (!r.spawned && T >= 2.55) {
      r.spawned = true;
      if (r.fresh) {
        ln.pins.forEach((p) => {
          if (!p.body) return;
          p.body.setEnabled(true);
          P.makeKinematic(p.body);
          p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          p.cx = p.rest.x;
          p.cz = p.rest.z;
          p.active = true;
          p.carried = true;
        });
      }
    }
    for (const p of ln.pins) {
      if (!p.carried || !p.body) continue;
      const baseY = ty - 0.05 - PIN_H - 0.005;
      p.body.setNextKinematicTranslation({ x: p.cx, y: Math.max(0.0004, baseY), z: p.cz });
      p.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    }
    if (!r.placed && T >= 3.05) {
      r.placed = true;
      for (const p of ln.pins) {
        if (!p.carried || !p.body) continue;
        P.placePin(p.body, p.cx, p.cz);
        p.carried = false;
      }
    }
    if (T >= 3.5) {
      ln.reset = null;
      ln.pins.forEach((p) => {
        p.keep = false;
        p.pushed = false;
        p.inPlay = p.active;
      });
      const done = ln.game.state().done;
      if (ln.ai) {
        ln.state = 'ready';
        ln.aiTimer = 1.5 + Math.random() * 4.5;
      } else ln.state = done ? 'done' : 'ready';
      ln.t = 0;
      this.guideDirty = true;
      if (!ln.ai) this.emit();
    }
  }

  /* ------------------------------ Kontak & suara ------------------------------ */
  private onHit = (a: ColMeta, b: ColMeta, speed: number) => {
    if (speed < 0.3) return;
    const laneIdx = a.lane >= 0 ? a.lane : b.lane;
    const ln = this.lanes[laneIdx];
    if (!ln) return;
    const ka = a.kind;
    const kb = b.kind;
    let kind: HitKind | null = null;
    let strength = speed / 6;
    let pos: THREE.Vector3 | null = null;
    const pinPos = (m: ColMeta) => {
      const body = ln.pins[m.pin ?? 0]?.body;
      if (!body) return null;
      const tr = body.translation();
      return new THREE.Vector3(tr.x, Math.max(0.1, tr.y + 0.12), tr.z);
    };
    if ((ka === 'ball' && kb === 'pin') || (kb === 'ball' && ka === 'pin')) {
      kind = 'ballPin';
      strength = speed / 7;
      const pm = ka === 'pin' ? a : b;
      const pp = pinPos(pm);
      const bt = ln.ball?.translation();
      if (pp && bt) pos = pp.lerp(new THREE.Vector3(bt.x, bt.y, bt.z), 0.45);
      if (!ln.hitPins) {
        ln.hitPins = true;
        const pv = ln.ball && this.phys ? this.phys.prevLinvel(ln.ball.handle) : null;
        if (pv) ln.entryAngle = Math.abs((Math.atan2(pv[2], pv[0]) * 180) / Math.PI);
        if (!ln.ai) {
          this.emit();
          if (this.options.slowmo) this.slowmoT = 1.15;
          this.shake = Math.max(this.shake, 0.05 * Math.min(1, speed / 7));
        }
      }
    } else if (ka === 'pin' && kb === 'pin') {
      kind = 'pinPin';
      strength = speed / 4.5;
      const p1 = pinPos(a);
      const p2 = lnPin(this.lanes, b);
      if (p1 && p2) pos = p1.lerp(p2, 0.5);
    } else if (ka === 'pin' || kb === 'pin') {
      const pm = ka === 'pin' ? a : b;
      const other = ka === 'pin' ? kb : ka;
      const pin = ln.pins[pm.pin ?? 0];
      if (pin) {
        if (this.simTime - pin.lastSound < 0.06) return;
        pin.lastSound = this.simTime;
      }
      kind = other === 'pit' || other === 'cushion' ? 'pit' : other === 'kick' ? 'kick' : other === 'gutter' ? 'gutter' : 'pinDeck';
      strength = speed / 4;
    } else {
      const other = ka === 'ball' ? kb : ka;
      kind = other === 'cushion' ? 'cushion' : other === 'pit' ? 'pit' : other === 'gutter' ? 'gutter' : 'land';
      strength = speed / 3;
    }
    if (!kind) return;
    const p = pos ?? new THREE.Vector3(kind === 'land' ? FOUL_X + 1 : HEAD_X + 0.4, 0.2, ln.z);
    this.playHit(kind, strength, p);
    if (pos && (kind === 'ballPin' || (kind === 'pinPin' && speed > 2.4))) this.stars.spawn(pos, strength);
  };

  private playHit(kind: HitKind, strength: number, p: THREE.Vector3) {
    const cam = this.camera;
    if (!cam) return;
    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const rel = p.clone().sub(camPos);
    const dist = rel.length();
    this.audio.hit(kind, strength, rel.dot(right) / Math.max(1, dist), dist);
  }

  private updateAudio(camera: THREE.Camera) {
    if (!this.audio.ctx) return;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const ln of this.lanes) {
      if (ln.ballState === 'play' && ln.ball) {
        const t = ln.ball.translation();
        const v = ln.ball.linvel();
        const rel = new THREE.Vector3(t.x, t.y, t.z).sub(camPos);
        const dist = rel.length();
        this.audio.roll(ln.i, Math.hypot(v.x, v.z), t.y < BALL_R + 0.03 && t.x < PIT_X, rel.dot(right) / Math.max(1, dist), dist);
      } else this.audio.roll(ln.i, 0, false, 0, 10);
    }
  }

  /* ------------------------------ Visual ------------------------------ */
  private syncPins() {
    const { m, q, s, zero } = this.tmp;
    this.lanes.forEach((ln, li) => {
      ln.pins.forEach((p, k) => {
        const idx = li * 10 + k;
        if (!p.active) m.compose(zero, q.identity(), zero);
        else if (p.body) {
          const t = p.body.translation();
          const r = p.body.rotation();
          q.set(r.x, r.y, r.z, r.w);
          m.compose(this.tmp.v.set(t.x, t.y, t.z), q, s);
        } else m.compose(p.rest, q.identity(), s);
        this.pinsMesh.setMatrixAt(idx, m);
        this.eyesMesh.setMatrixAt(idx, m);
      });
    });
    this.pinsMesh.instanceMatrix.needsUpdate = true;
    this.eyesMesh.instanceMatrix.needsUpdate = true;
  }

  private syncBalls() {
    for (const ln of this.lanes) {
      const o = ln.ballObj;
      o.visible = true;
      if (ln.ballState === 'play' && ln.ball) {
        const t = ln.ball.translation();
        const r = ln.ball.rotation();
        o.position.set(t.x, t.y, t.z);
        o.quaternion.set(r.x, r.y, r.z, r.w);
      } else if (ln.ballState === 'hand') {
        ln.bowler.root.updateMatrixWorld(true);
        const hand = ln.bowler.armR.localToWorld(new THREE.Vector3(0, -0.56, 0));
        this.runtime.worldToLocal(hand);
        o.position.copy(hand);
      } else {
        const [x, y, z] = returnSlot(ln.i);
        if (ln.ballState === 'return') {
          if (ln.returnT > 0.7) o.visible = false;
          else {
            const k = 1 - ln.returnT / 0.7;
            o.position.set(lerp(RETURN_X + 0.6, x, ease(k)), lerp(0.45, y, ease(Math.min(1, k * 1.6))), z);
            o.rotation.z -= 0.15;
          }
        } else o.position.set(x, y, z);
        if (ln.ai && !this.options.aiLanes && ln.ballState !== 'return') o.position.set(x, y, z);
      }
    }
  }

  private updateLeds(dt: number) {
    const cosmic = this.options.mode !== 'normal';
    this.lanes.forEach((ln, i) => {
      const mat = this.M.laneLeds[i];
      if (ln.ledFlash > 0) {
        ln.ledFlash -= dt;
        mat.emissive.setHSL((this.simTime * 1.6 + i * 0.13) % 1, 1, 0.55);
        mat.emissiveIntensity = 3.2 + Math.sin(this.simTime * 30) * 0.8;
        if (ln.ledFlash <= 0) mat.emissive.copy(this.ledBase[i]);
      } else {
        mat.emissiveIntensity = cosmic ? 2.6 : 1.6;
      }
    });
  }

  refreshLedBase() {
    this.ledBase = this.M.laneLeds.map((m) => m.emissive.clone());
  }

  private updateGuide(dt: number) {
    this.guideT -= dt;
    const ln = this.lanes[PLAYER_LANE];
    const show = ln.state === 'ready';
    this.guide.visible = show;
    if (!show || !this.guideDirty || this.guideT > 0) return;
    this.guideDirty = false;
    this.guideT = 0.12;
    const res = this.predictor ? this.predictor.predict(PLAYER_LANE, this.aim, 0.32) : predictPath(laneZ(PLAYER_LANE), this.aim, 0.32);
    const { m, q, zero } = this.tmp;
    const n = this.guide.count;
    for (let i = 0; i < n; i++) {
      const p = res.pts[i + 1];
      if (!p) {
        m.compose(zero, q.identity(), zero);
      } else {
        const sc = i % 3 === 0 ? 1.25 : 0.85;
        m.compose(this.tmp.v.set(p[0], 0.003, p[1]), q.identity(), new THREE.Vector3(sc, 1, sc));
      }
      this.guide.setMatrixAt(i, m);
    }
    this.guide.instanceMatrix.needsUpdate = true;
    (this.guide.material as THREE.MeshBasicMaterial).color.set(res.gutter ? '#ff6b6b' : res.entry !== null && Math.abs(Math.abs(res.entry) - 0.064) < 0.025 ? '#7CFC9A' : '#7cf7ff');
  }

  private updateMonitors(dt: number) {
    this.monitorT -= dt;
    const anim = this.lanes.some((l) => l.bannerT > 0);
    if (this.monitorT > 0 || (!this.monitorDirty && !anim)) return;
    this.monitorT = anim ? 0.08 : 0.5;
    this.monitorDirty = false;
    for (let p = 0; p < this.monitors.length; p++) {
      const a = this.lanes[p * 2];
      const b = this.lanes[p * 2 + 1];
      const view = (l: LaneRt): MonitorLane => {
        const st = l.game.state();
        return { num: l.i + 1, name: l.ai ? l.name : 'KAMU', frames: st.frames, total: st.total, active: !l.ai };
      };
      const banner = a.bannerT > 0 ? a.banner : b.bannerT > 0 ? b.banner : null;
      this.monitors[p].draw(view(a), view(b), banner, this.simTime);
    }
  }

  applyMode(mode: LightMode) {
    const M = this.M;
    const cosmic = mode !== 'normal';
    M.carpet.emissiveIntensity = cosmic ? 0.95 : 0.06;
    M.markings.emissiveIntensity = cosmic ? 1.8 : 0;
    M.dots.emissiveIntensity = cosmic ? 1.8 : 0;
    M.ceilingLight.emissiveIntensity = cosmic ? 0.04 : 1.8;
    M.blacklight.emissiveIntensity = cosmic ? 3.2 : 0.2;
    M.masking.emissiveIntensity = cosmic ? 0.95 : 0.35;
    M.mural.emissiveIntensity = cosmic ? 0.75 : 0.12;
    M.neonA.emissiveIntensity = cosmic ? 3.4 : 2.2;
    M.neonB.emissiveIntensity = cosmic ? 3.4 : 2.2;
    M.neonSign.emissiveIntensity = cosmic ? 3.6 : 2.6;
    M.pinLight.emissiveIntensity = cosmic ? 0.6 : 0.8;
    this.pinMat.emissiveIntensity = cosmic ? 0.7 : 0;
    (this.guide.material as THREE.MeshBasicMaterial).opacity = cosmic ? 1 : 0.85;
  }

  private pushMessage(text: string, sub: string | undefined, kind: MsgKind) {
    this.message = { id: ++this.msgId, text, sub, kind };
    this.emit();
  }

  private buildSnap(): BowlingSnapshot {
    const ln = this.lanes[PLAYER_LANE];
    return {
      ready: !!this.phys,
      state: ln.state,
      game: ln.game.state(),
      standing: ln.pins.map((p) => p.active && (p.body ? pinStanding(p.body) || ln.state !== 'ready' : true)),
      message: this.message,
      aim: { ...this.aim },
      speedKmh: ln.lastSpeed * 3.6,
      entryAngle: ln.entryAngle,
      canThrow: !!this.phys && ln.state === 'ready',
    };
  }

  private emit() {
    this.snap = this.buildSnap();
    this.listeners.forEach((f) => f(this.snap));
  }
}

function lnPin(lanes: LaneRt[], m: ColMeta) {
  const body = lanes[m.lane]?.pins[m.pin ?? 0]?.body;
  if (!body) return null;
  const t = body.translation();
  return new THREE.Vector3(t.x, Math.max(0.1, t.y + 0.12), t.z);
}
