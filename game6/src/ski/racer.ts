import { Course, W, type Proj } from './course';

export interface RacerInput {
  steer: number; // −1 kiri … +1 kanan
  tuck: boolean;
  brake: boolean;
  jump: boolean;
}
export type RacerState = 'hold' | 'race' | 'crash' | 'finished';
export type RacerEventType = 'gate' | 'miss' | 'takeoff' | 'land' | 'trick' | 'crash' | 'fence' | 'bump' | 'finish';
export interface RacerEvent {
  type: RacerEventType;
  racer: number;
  x: number;
  y: number;
  z: number;
  value?: number;
  text?: string;
}

export const PHYS = {
  g: 9.81,
  mu: 0.045, // gesek ski di salju padat
  drag: 0.0031, // posisi berdiri
  dragTuck: 0.0021, // posisi tuck (meringkuk)
  grip: 7.5, // daya cengkeram tepi ski (carving)
  gripBrake: 3.0,
  brakeDecel: 3.8,
  steerRate: 1.9,
  airSpin: 5.2,
  ollie: 3.3,
  maxLat: W - 0.7,
  dt: 1 / 120,
};

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Racer {
  id: number;
  course: Course;
  ai: boolean;
  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  phi = 0;
  s = 0;
  d = 0;
  idx = -1;
  air = false;
  airT = 0;
  spin = 0;
  state: RacerState = 'hold';
  crashT = 0;
  crashAxis = 0;
  nextGate = 0;
  gatesOk = 0;
  missed = 0;
  penalty = 0;
  finishTime = -1;
  steer = 0;
  tuck = 0;
  brake = 0;
  lean = 0;
  slip = 0;
  wobble = 0;
  jumpCd = 0;
  gx = 0;
  gz = 0;
  topSpeed = 26;
  dragMul = 1;
  line = 0;
  maxSpeed = 0;
  bestAir = 0;
  landT = 0;
  aiNoise = 0;
  /** false = gerbang dinonaktifkan (disembunyikan) → tanpa penalti */
  gatesOn = true;
  private aiPhase = Math.random() * 10;

  constructor(id: number, course: Course, ai: boolean, d0: number) {
    this.id = id;
    this.course = course;
    this.ai = ai;
    this.line = d0;
    this.reset(d0);
  }

  reset(d0: number) {
    const c = this.course;
    const w = c.worldAt(c.startS - 1.2, d0);
    this.x = w.x;
    this.z = w.z;
    this.y = w.y;
    this.vx = this.vz = this.vy = 0;
    const f = c.frame(c.startS);
    this.phi = Math.atan2(f.tz, f.tx);
    this.idx = -1;
    this.proj();
    this.state = 'hold';
    this.air = false;
    this.nextGate = 0;
    this.gatesOk = 0;
    this.missed = 0;
    this.penalty = 0;
    this.finishTime = -1;
    this.maxSpeed = 0;
    this.bestAir = 0;
    this.wobble = 0;
    this.crashT = 0;
  }

  speed() {
    return Math.hypot(this.vx, this.vz);
  }

  proj(): Proj {
    const p = this.course.project(this.x, this.z, this.idx);
    this.s = p.s;
    this.d = p.d;
    this.idx = p.i;
    return p;
  }

  go() {
    if (this.state !== 'hold') return;
    this.state = 'race';
    const f = this.course.frame(this.s);
    this.vx = f.tx * 3.5;
    this.vz = f.tz * 3.5;
  }

  private ground() {
    return this.course.surfaceY(this.s, this.d);
  }

  private emit(ev: RacerEvent[], type: RacerEventType, value?: number, text?: string) {
    ev.push({ type, racer: this.id, x: this.x, y: this.y, z: this.z, value, text });
  }

  crash(ev: RacerEvent[], text: string) {
    if (this.state === 'crash') return;
    this.state = 'crash';
    this.crashT = 1.7;
    this.crashAxis = Math.random() < 0.5 ? 1 : -1;
    this.air = false;
    this.emit(ev, 'crash', this.speed(), text);
  }

  step(dt: number, inp: RacerInput, raceTime: number, ev: RacerEvent[]) {
    const c = this.course;
    if (this.state === 'hold') {
      this.y = this.ground();
      return;
    }
    const prevS = this.s;
    this.jumpCd -= dt;
    this.landT = Math.max(0, this.landT - dt);
    this.wobble *= Math.exp(-dt * 3.5);
    const finished = this.finishTime >= 0;

    if (this.state === 'crash') {
      this.crashT -= dt;
      const v = this.speed();
      const k = v > 0 ? Math.max(0, v - 8 * dt) / v : 0;
      this.vx *= k;
      this.vz *= k;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.proj();
      this.limits(ev, true);
      this.y = this.ground();
      this.slip = v;
      if (this.crashT <= 0) {
        const f = c.frame(this.s);
        this.phi = Math.atan2(f.tz, f.tx);
        const sp = Math.max(4, this.speed());
        this.vx = f.tx * sp;
        this.vz = f.tz * sp;
        this.d = clamp(this.d, -PHYS.maxLat + 1, PHYS.maxLat - 1);
        const w = c.worldAt(this.s, this.d);
        this.x = w.x;
        this.z = w.z;
        this.y = w.y;
        this.vy = 0;
        this.state = finished ? 'finished' : 'race';
        this.wobble = 1;
      }
      this.gates(prevS, raceTime, ev);
      return;
    }

    const steerIn = finished && !this.ai ? clamp(-this.d * 0.08, -1, 1) : inp.steer;
    this.steer += (clamp(steerIn, -1, 1) - this.steer) * Math.min(1, dt * 9);
    this.tuck += ((inp.tuck && !finished ? 1 : 0) - this.tuck) * Math.min(1, dt * 6);
    this.brake += ((inp.brake || finished ? 1 : 0) - this.brake) * Math.min(1, dt * 7);

    if (!this.air) {
      const g = c.gradient(this.s, this.d);
      this.gx = g.gx;
      this.gz = g.gz;
      const cs = Math.cos(this.phi);
      const sn = Math.sin(this.phi);
      let vf = this.vx * cs + this.vz * sn;
      const vl = -this.vx * sn + this.vz * cs;
      const v = Math.hypot(vf, vl);
      const grip = lerp(PHYS.grip, PHYS.gripBrake, this.brake);
      const nvl = vl * Math.exp(-grip * dt);
      this.slip = Math.abs(vl) + this.brake * v * 0.35;
      // carving: 60% energi kinetik lateral dipindah ke arah ski (tidak pernah menambah energi)
      vf = (vf >= 0 ? 1 : -1) * Math.sqrt(vf * vf + 0.6 * (vl * vl - nvl * nvl));
      const drag = lerp(PHYS.drag, PHYS.dragTuck, this.tuck) * this.dragMul;
      const dec = PHYS.mu * PHYS.g + drag * v * v + this.brake * (PHYS.brakeDecel + 0.08 * v) + (finished ? 2.6 : 0);
      vf = Math.sign(vf) * Math.max(0, Math.abs(vf) - dec * dt);
      const f = 1 / (1 + g.gx * g.gx + g.gz * g.gz);
      this.vx = cs * vf - sn * nvl - PHYS.g * g.gx * f * dt;
      this.vz = sn * vf + cs * nvl - PHYS.g * g.gz * f * dt;
      const vv = this.speed();
      const rate = PHYS.steerRate * (1 - 0.45 * this.tuck) * (1 - (Math.min(vv, 32) / 32) * 0.35);
      this.phi += this.steer * rate * dt;
      this.lean += (clamp((vv * this.steer * rate) / PHYS.g, -0.75, 0.75) - this.lean) * Math.min(1, dt * 6);

      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.proj();
      this.limits(ev, false);
      const ny = this.ground();
      const vyG = (ny - this.y) / dt;
      if (inp.jump && this.jumpCd <= 0 && !finished) {
        this.air = true;
        this.vy = Math.max(vyG, this.vy) + PHYS.ollie;
        this.y = ny + 0.01;
        this.airT = 0;
        this.spin = 0;
        this.jumpCd = 0.7;
        this.emit(ev, 'takeoff', 0);
      } else if (vyG < this.vy - PHYS.g * dt - 0.22 && vv > 6) {
        this.air = true;
        this.airT = 0;
        this.spin = 0;
        this.y += this.vy * dt;
        if (this.y < ny) this.y = ny;
        this.emit(ev, 'takeoff', 1);
      } else {
        this.y = ny;
        this.vy = vyG;
      }
    } else {
      this.airT += dt;
      this.vy -= PHYS.g * dt;
      const v = this.speed();
      const k = Math.max(0, v - 0.0012 * v * v * dt) / Math.max(v, 1e-6);
      this.vx *= k;
      this.vz *= k;
      const spinRate = this.steer * PHYS.airSpin;
      this.phi += spinRate * dt;
      this.spin += spinRate * dt;
      this.lean *= Math.exp(-dt * 3);
      this.slip = 0;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.y += this.vy * dt;
      this.proj();
      this.limits(ev, false);
      const ny = this.ground();
      if (this.y <= ny) this.land(ny, ev);
    }

    const sp = this.speed();
    if (sp > this.maxSpeed) this.maxSpeed = sp;
    if (this.s > c.L - 3) {
      const f = c.frame(this.s);
      const fw = this.vx * f.tx + this.vz * f.tz;
      if (fw > 0) {
        this.vx -= f.tx * fw;
        this.vz -= f.tz * fw;
      }
    }
    this.gates(prevS, raceTime, ev);
  }

  private land(ny: number, ev: RacerEvent[]) {
    const c = this.course;
    const g = c.gradient(this.s, this.d);
    const vyG = g.gx * this.vx + g.gz * this.vz;
    const impact = this.vy - vyG;
    const velA = Math.atan2(this.vz, this.vx);
    const diff = Math.abs(wrap(velA - this.phi));
    const sideways = Math.min(diff, Math.PI - diff);
    const air = this.airT;
    this.air = false;
    this.y = ny;
    this.vy = vyG;
    if (air > this.bestAir) this.bestAir = air;
    if (this.speed() > 4 && (sideways > 1.05 || (diff > Math.PI / 2 && this.speed() > 8))) {
      this.crash(ev, 'Mendarat miring!');
      return;
    }
    if (impact < -15) {
      this.crash(ev, 'Mendarat terlalu keras!');
      return;
    }
    if (diff > Math.PI / 2) this.phi += Math.PI;
    // sejajarkan kecepatan dengan ski (kehilangan sebagian kecepatan)
    const v = this.speed() * (1 - Math.min(0.6, sideways * 0.5));
    this.vx = Math.cos(this.phi) * v;
    this.vz = Math.sin(this.phi) * v;
    if (air >= 0.12) this.wobble = Math.min(1.2, 0.3 + -impact * 0.06);
    if (air < 0.12) return;
    this.landT = 0.35;
    this.emit(ev, 'land', air, undefined);
    const turns = Math.round(Math.abs(this.spin) / (Math.PI * 2));
    if (turns >= 1 && sideways < 0.6) this.emit(ev, 'trick', turns * 360, `${turns * 360}°!`);
  }

  private limits(ev: RacerEvent[], crashed: boolean) {
    const ad = Math.abs(this.d);
    if (ad <= PHYS.maxLat) return;
    const c = this.course;
    const f = c.frame(this.s);
    const lx = f.tz;
    const lz = -f.tx;
    const sg = Math.sign(this.d);
    const push = ad - PHYS.maxLat;
    this.x -= lx * push * sg;
    this.z -= lz * push * sg;
    this.d = sg * PHYS.maxLat;
    const vlat = this.vx * lx + this.vz * lz;
    if (vlat * sg > 0) {
      const imp = vlat * 1.45;
      this.vx -= lx * imp;
      this.vz -= lz * imp;
      this.vx *= 0.95;
      this.vz *= 0.95;
      if (crashed) return;
      if (Math.abs(vlat) > 7.5 && !this.air) this.crash(ev, 'Nabrak jaring pengaman!');
      else if (Math.abs(vlat) > 1.2) {
        this.wobble = Math.max(this.wobble, 0.7);
        this.phi -= sg * 0.15 * Math.sign(Math.cos(this.phi - Math.atan2(f.tz, f.tx)));
        ev.push({ type: 'fence', racer: this.id, x: this.x, y: this.y, z: this.z, value: Math.abs(vlat) });
      }
    }
  }

  private gates(prevS: number, raceTime: number, ev: RacerEvent[]) {
    const c = this.course;
    while (this.nextGate < c.gates.length && this.s >= c.gates[this.nextGate].s && prevS < c.gates[this.nextGate].s + 0.001) {
      const g = c.gates[this.nextGate];
      if (!this.gatesOn) {
        this.nextGate++;
        continue;
      }
      if (Math.abs(this.d - g.d) <= g.hw) {
        this.gatesOk++;
        this.emit(ev, 'gate', g.idx);
      } else {
        this.missed++;
        this.penalty += 2;
        this.emit(ev, 'miss', g.idx);
      }
      this.nextGate++;
    }
    if (this.nextGate < c.gates.length && this.s > c.gates[this.nextGate].s + 3) this.nextGate++;
    if (this.finishTime < 0 && prevS < c.finishS && this.s >= c.finishS) {
      this.finishTime = raceTime + this.penalty;
      if (this.state === 'race') this.state = 'finished';
      this.emit(ev, 'finish', this.finishTime);
    }
  }

  /** Kecerdasan buatan lawan: ikuti garis gerbang, tuck di trek lurus. */
  aiInput(t: number): RacerInput {
    const c = this.course;
    const v = this.speed();
    const finished = this.finishTime >= 0;
    if (this.air) {
      const velA = Math.atan2(this.vz, this.vx);
      return { steer: clamp(wrap(velA - this.phi) * 4, -1, 1), tuck: false, brake: false, jump: false };
    }
    const look = clamp(v * 0.9, 7, 24);
    let dT = this.line;
    const g = c.gates[this.nextGate];
    if (finished) dT = this.line * 0.6;
    else if (g) {
      const gd = g.d + clamp(this.line * 0.3, -1.4, 1.4);
      const k = clamp((g.s - this.s - 45) / 45, 0, 1);
      dT = lerp(gd, this.line, k);
    }
    this.aiNoise += (Math.sin(t * 0.7 + this.aiPhase) * 0.8 - this.aiNoise) * 0.02;
    const target = c.worldAt(this.s + look, clamp(dT + this.aiNoise, -PHYS.maxLat + 1, PHYS.maxLat - 1));
    const desired = Math.atan2(target.z - this.z, target.x - this.x);
    const diff = wrap(desired - this.phi);
    return {
      steer: clamp(diff * 3.2, -1, 1),
      tuck: Math.abs(diff) < 0.1 && v < this.topSpeed,
      brake: finished || v > this.topSpeed + 5,
      jump: false,
    };
  }
}

/** Tabrakan antar pembalap (saling senggol khas ski cross). */
export function collideRacers(rs: Racer[], ev: RacerEvent[]) {
  for (let a = 0; a < rs.length; a++) {
    for (let b = a + 1; b < rs.length; b++) {
      const A = rs[a];
      const B = rs[b];
      if (A.state === 'hold' || B.state === 'hold') continue;
      if (Math.abs(A.y - B.y) > 1.2) continue;
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const dist = Math.hypot(dx, dz);
      const R = 0.95;
      if (dist >= R || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (R - dist) / 2;
      A.x -= nx * push;
      A.z -= nz * push;
      B.x += nx * push;
      B.z += nz * push;
      const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (rel < 0) {
        const j = -rel * 0.9;
        A.vx -= nx * j * 0.5;
        A.vz -= nz * j * 0.5;
        B.vx += nx * j * 0.5;
        B.vz += nz * j * 0.5;
        A.wobble = Math.max(A.wobble, 0.8);
        B.wobble = Math.max(B.wobble, 0.8);
        ev.push({ type: 'bump', racer: A.id, x: (A.x + B.x) / 2, y: A.y, z: (A.z + B.z) / 2, value: -rel, text: String(B.id) });
        if (-rel > 6.5) {
          const loser = A.speed() < B.speed() ? A : B;
          if (loser.state === 'race' || loser.state === 'finished') loser.crash(ev, 'Disenggol lawan!');
        }
      }
    }
  }
}
