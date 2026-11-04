import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World, EventQueue } from '@dimforge/rapier3d-compat';
import {
  BALL_MASS,
  BALL_R,
  APPROACH_X0,
  CUSHION_X,
  DECK_START,
  FOUL_X,
  GUTTER_D,
  GUTTER_W,
  HALF_TRACK,
  HEAD_X,
  KICK_H,
  LANE_COUNT,
  LANE_W,
  MASK_BOTTOM,
  OIL_END,
  PIN_MASS,
  PIN_SPOTS,
  PIT_FLOOR,
  PIT_X,
  RELEASE_X,
  TRACK_EDGE,
  laneZ,
} from './dims';
import { pinHullPoints, pinVolume } from './pin';

export type Rapier = typeof RAPIER;
export type ColKind = 'ball' | 'pin' | 'oil' | 'dry' | 'deck' | 'approach' | 'gutter' | 'cap' | 'kick' | 'pit' | 'cushion';
export interface ColMeta {
  kind: ColKind;
  lane: number;
  pin?: number;
}

/** Koefisien fisika (hasil kalibrasi). */
export const PHYS = {
  dt: 1 / 240,
  oil: 0.04, // bagian depan lintasan berminyak (bola meluncur / skid)
  dry: 0.24, // backend kering → bola menggigit & melengkung (hook)
  deck: 0.25,
  approach: 0.5,
  gutter: 0.2,
  pin: 0.4, // pin berlapis plastik
  pinRest: 0.7, // pantulan pin-pin & bola-pin (pin action hidup)
  ballRest: 0.5,
  laneRest: 0.25,
  kickRest: 0.8, // kickback memantulkan pin kembali ke deck ("messenger")
  pinLinDamp: 0.02,
  pinAngDamp: 0.05,
  ballAngDamp: 0.02,
};

let rapierPromise: Promise<Rapier> | null = null;
export function loadRapier(): Promise<Rapier> {
  if (!rapierPromise) rapierPromise = RAPIER.init().then(() => RAPIER);
  return rapierPromise;
}

export interface ThrowParams {
  /** −1..1 posisi lepas (kiri..kanan) */
  position: number;
  /** −1..1 arah (±5°) */
  angle: number;
  /** 0..1 kecepatan */
  power: number;
  /** −1..1 putaran (+ = hook ke kiri, gaya pemain tangan kanan) */
  spin: number;
}

export const throwSpeed = (power: number) => 5.6 + power * 4.4; // 12,5 – 22 mph

/** Vektor posisi/kecepatan/putaran saat bola dilepas. */
export function throwVectors(lz: number, p: ThrowParams) {
  const yaw = p.angle * ((5 * Math.PI) / 180);
  const v = throwSpeed(p.power);
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const rx = -Math.sin(yaw);
  const rz = Math.cos(yaw);
  const revs = 12 + Math.abs(p.spin) * 30;
  const tilt = p.spin * ((68 * Math.PI) / 180);
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return {
    pos: { x: RELEASE_X, y: BALL_R + 0.035, z: lz + p.position * 0.42 },
    linvel: { x: fx * v, y: -0.35, z: fz * v },
    angvel: { x: revs * (-c * rx - s * fx), y: 0, z: revs * (-c * rz - s * fz) },
  };
}

/** Tinggi sumbu atas pin dari quaternion. */
export const upY = (q: { x: number; z: number }) => 1 - 2 * (q.x * q.x + q.z * q.z);

export function pinStanding(body: RigidBody) {
  const t = body.translation();
  return upY(body.rotation()) > 0.95 && t.y > -0.02 && t.y < 0.06 && t.x < PIT_X + 0.01;
}
export function pinFallen(body: RigidBody) {
  const t = body.translation();
  return upY(body.rotation()) < 0.72 || t.y < -0.04 || t.x > PIT_X + 0.02;
}

export interface LanePhys {
  ball: RigidBody;
  pins: RigidBody[];
}

export class BowlingPhysics {
  R: Rapier;
  world: World;
  queue: EventQueue;
  meta = new Map<number, ColMeta>();
  lanes: LanePhys[] = [];
  withPins: boolean;

  constructor(R: Rapier, withPins = true) {
    this.R = R;
    this.withPins = withPins;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = PHYS.dt;
    this.world.numSolverIterations = 8;
    this.queue = new R.EventQueue(true);
    this.buildStatic();
    for (let i = 0; i < LANE_COUNT; i++) this.lanes.push(this.buildLane(i));
  }

  private quatX(a: number) {
    return { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
  }

  private box(kind: ColKind, lane: number, hx: number, hy: number, hz: number, x: number, y: number, z: number, o: { rotX?: number; fr: number; rest: number; frMin?: boolean; restMin?: boolean }) {
    const R = this.R;
    const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(o.fr).setRestitution(o.rest);
    if (o.rotX) d.setRotation(this.quatX(o.rotX));
    if (o.frMin) d.setFrictionCombineRule(R.CoefficientCombineRule.Min);
    if (o.restMin) d.setRestitutionCombineRule(R.CoefficientCombineRule.Min);
    const c = this.world.createCollider(d);
    this.meta.set(c.handle, { kind, lane });
  }

  private buildStatic() {
    const len = FOUL_X - APPROACH_X0;
    this.box('approach', -1, len / 2, 0.1, TRACK_EDGE, (FOUL_X + APPROACH_X0) / 2, -0.1, 0, { fr: PHYS.approach, rest: PHYS.laneRest });
  }

  private buildLane(i: number): LanePhys {
    const z = laneZ(i);
    const R = this.R;
    const lr = PHYS.laneRest;
    const seg = (kind: ColKind, x0: number, x1: number, fr: number) =>
      this.box(kind, i, (x1 - x0) / 2, 0.1, LANE_W / 2, (x0 + x1) / 2, -0.1, z, { fr, rest: lr });
    seg('oil', FOUL_X, OIL_END, PHYS.oil);
    seg('dry', OIL_END, DECK_START, PHYS.dry);
    seg('deck', DECK_START, PIT_X, PHYS.deck);

    // Gutter setengah lingkaran (4 segmen)
    const chord = GUTTER_W;
    const sag = GUTTER_D;
    const Rg = (chord * chord) / 4 / (2 * sag) + sag / 2;
    const thMax = Math.asin(chord / 2 / Rg);
    const n = 4;
    const gx0 = FOUL_X;
    const gx1 = PIT_X;
    for (const s of [-1, 1]) {
      const zc = z + s * (LANE_W / 2 + GUTTER_W / 2);
      const yc = Rg - sag;
      for (let k = 0; k < n; k++) {
        const th = -thMax + ((k + 0.5) * 2 * thMax) / n;
        const half = Rg * Math.sin(thMax / n) + 0.004;
        const t = 0.02;
        const cz = zc + (Rg + t / 2) * Math.sin(th);
        const cy = yc - (Rg + t / 2) * Math.cos(th);
        this.box('gutter', i, (gx1 - gx0) / 2, t / 2, half, (gx0 + gx1) / 2, cy, cz, { rotX: -th, fr: PHYS.gutter, rest: 0.2 });
      }
    }
    // Capping antar lintasan
    const capW = (i < LANE_COUNT - 1 ? laneZ(i + 1) - laneZ(i) : TRACK_EDGE - z + HALF_TRACK) - 2 * HALF_TRACK;
    if (capW > 0.01) this.box('cap', i, (PIT_X - FOUL_X) / 2, 0.06, capW / 2, (PIT_X + FOUL_X) / 2, -0.06 + 0.012, z + HALF_TRACK + capW / 2, { fr: 0.4, rest: 0.3 });
    if (i === 0) {
      const w = z - HALF_TRACK + TRACK_EDGE;
      this.box('cap', i, (PIT_X - FOUL_X) / 2, 0.06, w / 2, (PIT_X + FOUL_X) / 2, -0.048, z - HALF_TRACK - w / 2, { fr: 0.4, rest: 0.3 });
    }
    // Kickback (dinding samping pin deck), atap mesin, pit & cushion
    const kx0 = HEAD_X - 0.62;
    const kx1 = CUSHION_X + 0.1;
    for (const s of [-1, 1]) {
      this.box('kick', i, (kx1 - kx0) / 2, (KICK_H + 0.3) / 2, 0.03, (kx0 + kx1) / 2, (KICK_H - 0.3) / 2, z + s * (HALF_TRACK + 0.03), { fr: 0.3, rest: PHYS.kickRest });
    }
    this.box('kick', i, (kx1 - kx0) / 2, 0.05, HALF_TRACK, (kx0 + kx1) / 2, MASK_BOTTOM + 0.05, z, { fr: 0.3, rest: 0.3 });
    this.box('pit', i, (CUSHION_X + 0.1 - PIT_X) / 2, 0.1, HALF_TRACK, (PIT_X + CUSHION_X + 0.1) / 2, PIT_FLOOR - 0.1, z, { fr: 0.7, rest: 0.05, restMin: true });
    this.box('cushion', i, 0.05, (MASK_BOTTOM - PIT_FLOOR) / 2, HALF_TRACK, CUSHION_X, (MASK_BOTTOM + PIT_FLOOR) / 2, z, { fr: 0.9, rest: 0, restMin: true });

    // Bola
    const ball = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(RELEASE_X, BALL_R, z).setCcdEnabled(true).setAngularDamping(PHYS.ballAngDamp).setCanSleep(true),
    );
    const bc = this.world.createCollider(
      R.ColliderDesc.ball(BALL_R)
        .setDensity(BALL_MASS / ((4 / 3) * Math.PI * BALL_R ** 3))
        .setFriction(1)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(PHYS.ballRest)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      ball,
    );
    this.meta.set(bc.handle, { kind: 'ball', lane: i });
    ball.setEnabled(false);

    // Pin (2 hull konveks: badan + kepala)
    if (!this.withPins) return { ball, pins: [] };
    const hull = pinHullPoints();
    const density = PIN_MASS / pinVolume();
    const pins: RigidBody[] = [];
    PIN_SPOTS.forEach(([dx, dz], k) => {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(HEAD_X + dx, 0.0004, z + dz)
          .setCcdEnabled(false) // CCD pada pin diam membuatnya goyah; 240 Hz sudah cukup
          .setLinearDamping(PHYS.pinLinDamp)
          .setAngularDamping(PHYS.pinAngDamp)
          .setCanSleep(true),
      );
      for (const pts of [hull.lower, hull.upper]) {
        const d = R.ColliderDesc.convexHull(pts);
        if (!d) continue;
        d.setDensity(density).setFriction(PHYS.pin).setRestitution(PHYS.pinRest).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
        const c = this.world.createCollider(d, body);
        this.meta.set(c.handle, { kind: 'pin', lane: i, pin: k });
      }
      // catatan: JANGAN panggil sleep() saat dibuat — kombinasi sleep paksa + CCD membuat pin roboh sendiri.
      pins.push(body);
    });
    return { ball, pins };
  }

  private prevVel = new Map<number, [number, number, number]>();
  /** Kecepatan body sebelum langkah terakhir (untuk sudut masuk bola yang akurat). */
  prevLinvel(handle: number) {
    return this.prevVel.get(handle) ?? null;
  }

  /** Satu langkah simulasi tetap; `onHit` menerima kecepatan relatif SEBELUM benturan. */
  step(onHit?: (a: ColMeta, b: ColMeta, speed: number, h1: number, h2: number) => void) {
    if (onHit) {
      this.prevVel.clear();
      this.world.forEachActiveRigidBody((b) => {
        const v = b.linvel();
        this.prevVel.set(b.handle, [v.x, v.y, v.z]);
      });
    }
    this.world.step(this.queue);
    if (!onHit) {
      this.queue.drainCollisionEvents(() => {});
      return;
    }
    const zero: [number, number, number] = [0, 0, 0];
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.meta.get(h1);
      const b = this.meta.get(h2);
      if (!a || !b) return;
      const b1 = this.world.getCollider(h1)?.parent();
      const b2 = this.world.getCollider(h2)?.parent();
      const v1 = (b1 && this.prevVel.get(b1.handle)) || zero;
      const v2 = (b2 && this.prevVel.get(b2.handle)) || zero;
      const speed = Math.hypot(v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]);
      onHit(a, b, speed, h1, h2);
    });
  }

  /** Pasang ulang pin tegak di posisi (x,z) & tidurkan. */
  placePin(body: RigidBody, x: number, z: number) {
    body.setBodyType(this.R.RigidBodyType.Dynamic, false);
    body.setEnabled(true);
    body.setTranslation({ x, y: 0.0004, z }, false);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  makeKinematic(body: RigidBody) {
    body.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
  }

  launch(lane: number, p: ThrowParams) {
    const b = this.lanes[lane].ball;
    const v = throwVectors(laneZ(lane), p);
    b.setEnabled(true);
    b.setTranslation(v.pos, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    b.setLinvel(v.linvel, true);
    b.setAngvel(v.angvel, true);
    b.wakeUp();
  }

  rackFull(lane: number) {
    const z = laneZ(lane);
    this.lanes[lane].pins.forEach((b, k) => this.placePin(b, HEAD_X + PIN_SPOTS[k][0], z + PIN_SPOTS[k][1]));
  }
}

export interface PredictResult {
  pts: [number, number][];
  entry: number | null;
  entryAngle: number;
  gutter: boolean;
}

/** Prediksi lintasan memakai Rapier sendiri (dunia bayangan tanpa pin) → garis bidik 100% cocok. */
export class PathPredictor {
  phys: BowlingPhysics;
  constructor(R: Rapier) {
    this.phys = new BowlingPhysics(R, false);
  }
  predict(lane: number, p: ThrowParams, stepOut = 0.35): PredictResult {
    const P = this.phys;
    const b = P.lanes[lane].ball;
    const lz = laneZ(lane);
    P.launch(lane, p);
    const pts: [number, number][] = [];
    let t = b.translation();
    pts.push([t.x, t.z]);
    let next = t.x + stepOut;
    const contactX = HEAD_X - 0.168;
    let entry: number | null = null;
    let entryAngle = 0;
    let gutter = false;
    for (let i = 0; i < 1400; i++) {
      P.world.step(P.queue);
      t = b.translation();
      if (t.x >= next) {
        pts.push([t.x, t.z]);
        next += stepOut;
      }
      if (Math.abs(t.z - lz) > LANE_W / 2 + 0.005) {
        gutter = true;
        pts.push([t.x, t.z]);
        break;
      }
      if (t.x >= contactX) {
        const v = b.linvel();
        entry = t.z - lz;
        entryAngle = (Math.atan2(v.z, v.x) * 180) / Math.PI;
        pts.push([t.x, t.z]);
        break;
      }
    }
    P.queue.drainCollisionEvents(() => {});
    b.setEnabled(false);
    return { pts, entry, entryAngle, gutter };
  }
  /** Cari sudut agar bola masuk pocket (1-3 untuk hook kiri / lurus, 1-2 untuk hook kanan). */
  solve(lane: number, p: ThrowParams, target?: number) {
    const tgt = target ?? (p.spin < -0.05 ? -0.064 : 0.064);
    let lo = -1;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const r = this.predict(lane, { ...p, angle: mid }, 50);
      const e = r.entry ?? (r.pts[r.pts.length - 1][1] - laneZ(lane) > 0 ? 1 : -1);
      if (e > tgt) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }
}
