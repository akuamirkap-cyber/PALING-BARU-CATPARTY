import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { AccessoryId, AnimalDef } from "./animals";
import { buildCharacterVisual, type CharacterVisual } from "./characterMesh";
import type { ControlState } from "./input";
import { sfx } from "./audio";
import * as rig from "./rig";
import { bombBodies } from "./Bombs";
import { getTuning } from "./tuning";

export const GRAVITY = 22;
const WALK_SPEED = 4.0;
const RUN_SPEED = 6.6;

const Y = new CANNON.Vec3(0, 1, 0);
const Z = new CANNON.Vec3(0, 0, 1);
const XA = new CANNON.Vec3(1, 0, 0);

export type PartName = "torso" | "head" | "armL" | "armR" | "legL" | "legR";
export interface PartInfo {
  char: Character;
  part: PartName;
}
export const bodyOwner = new WeakMap<CANNON.Body, PartInfo>();

export interface Hold {
  arm: "armL" | "armR";
  c: CANNON.PointToPointConstraint;
  body: CANNON.Body;
  owner: Character | null;
  t: number;
  pivotA: CANNON.Vec3;
  pivotB: CANNON.Vec3;
  carry: boolean;
}

export type HitKind = "punch" | "headbutt" | "dropkick" | "bat" | "pan" | "throw" | "bomb";
export interface CharacterHooks {
  onHit(attacker: Character, victim: Character, point: CANNON.Vec3, dmg: number, kind: HitKind): void;
  onKO(victim: Character): void;
  onLand(c: Character, strength: number): void;
  onStep(c: Character): void;
}

/** A handheld melee weapon lying in the arena (bat or frying pan). */
export interface Bat {
  kind: "bat" | "pan";
  body: CANNON.Body;
  mesh: THREE.Object3D;
  centerOffset: number; // grip -> visual mesh origin
  reach: number; // grip -> farthest tip
  impactOffset: number; // grip -> center of the striking head
  holder: Character | null;
  thrower: Character | null;
  flyT: number;
  hit: Set<Character>;
}
const vec = (a: rig.V3) => new CANNON.Vec3(a[0], a[1], a[2]);
let HOVER = rig.HOVER;
let SHOULDER_L = vec(rig.SHOULDER_L);
let SHOULDER_R = vec(rig.SHOULDER_R);
let HIP_L = vec(rig.HIP_L);
let HIP_R = vec(rig.HIP_R);
/** re-read the skeleton (body height / shoulder width follow the shape tuning) */
function refreshRig() {
  rig.applyRig(getTuning());
  HOVER = rig.HOVER;
  SHOULDER_L = vec(rig.SHOULDER_L);
  SHOULDER_R = vec(rig.SHOULDER_R);
  HIP_L = vec(rig.HIP_L);
  HIP_R = vec(rig.HIP_R);
  FOOT = vec(rig.FOOT);
  HAND = vec(rig.HAND);
}
const LIMB_TOP = vec(rig.LIMB_TOP);
let HAND = vec(rig.HAND);
let FOOT = vec(rig.FOOT);

// scratch vectors
const v1 = new CANNON.Vec3();
const v2 = new CANNON.Vec3();
const v3 = new CANNON.Vec3();
const v4 = new CANNON.Vec3();
const panHitCenter = new CANNON.Vec3();
const rayFrom = new CANNON.Vec3();
const rayTo = new CANNON.Vec3();
const rayRes = new CANNON.RaycastResult();

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const PUNCH_T = 0.28; // total punch time
const PUNCH_WIND = 0.06; // wind-up part
const PUNCH_STRIKE0 = PUNCH_T - PUNCH_WIND; // timer value where the strike starts
const _hq = new CANNON.Quaternion();
const _hq2 = new CANNON.Quaternion();
const _tq = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _iq = new THREE.Quaternion();
const _lq1 = new CANNON.Quaternion();
const _lq2 = new CANNON.Quaternion();
const _lq3 = new CANNON.Quaternion();
const _sp = new CANNON.Vec3();
const _sw = new CANNON.Vec3();
const _sl = new CANNON.Vec3();
const _sl0 = new CANNON.Vec3();
const _sd = new CANNON.Vec3();
const _corr = new CANNON.Vec3();
const _n = new CANNON.Vec3();
const _ra = new CANNON.Vec3();
const _rt = new CANNON.Vec3();
const _va = new CANNON.Vec3();
const _vt = new CANNON.Vec3();
const _tmp = new CANNON.Vec3();
const _imp = new CANNON.Vec3();
const _Y3 = new THREE.Vector3(0, 1, 0);
const _weaponDir = new THREE.Vector3();
const _weaponFace = new THREE.Vector3();
const _weaponNormal = new THREE.Vector3();
const _weaponCross = new THREE.Vector3();
const _weaponRoll = new THREE.Quaternion();

export class Character {
  static all: Character[] = [];

  index: number;
  bit: number;
  def: AnimalDef;
  name: string;
  isHuman: boolean;
  humanSlot: 0 | 1 | 2;
  world: CANNON.World;
  hooks: CharacterHooks;

  torso!: CANNON.Body;
  head!: CANNON.Body;
  armL!: CANNON.Body;
  armR!: CANNON.Body;
  legL!: CANNON.Body;
  legR!: CANNON.Body;
  parts: CANNON.Body[] = [];
  joints: CANNON.Constraint[] = [];
  totalMass = 0;

  visual: CharacterVisual;
  root = new THREE.Group();
  nameTag: THREE.Sprite;
  stars = new THREE.Group();

  // state
  input: ControlState;
  facing: number;
  grounded = false;
  groundBody: CANNON.Body | null = null;
  groundDist = 99;
  airTime = 0;
  alive = true;
  eliminated = false;
  removed = false;
  dizzy = 0;
  koTimer = 0;
  stagger = 0;
  noHover = 0;
  jumpCd = 0;
  punchTimer = 0;
  punchCd = 0;
  punchArm: "armL" | "armR" = "armL";
  headbuttTimer = 0;
  dropkickTimer = 0;
  attackCd = 0;
  lastHitTime = -99;
  lastHitBy: Character | null = null;
  lastHitAt = -99;
  hitSet = new Set<Character>();
  holds: { armL: Hold | null; armR: Hold | null } = { armL: null, armR: null };
  lifting = false;
  heldBy = 0;
  walkPhase = 0;
  time = 0;
  wins = 0;
  kos = 0;
  wasGrounded = true;
  climbAssist = 0;
  static bats: Bat[] = [];
  static thrownProps: { body: CANNON.Body; by: Character; t: number }[] = [];
  // two-handed melee weapon pose (bat or pan)
  batTh = 2.25;
  batEl = 1.0;
  batGrip = new CANNON.Vec3();
  batDir = new CANNON.Vec3(0, 1, 0);
  batA = new CANNON.Vec3();
  batB = new CANNON.Vec3();
  batTipPrev = new CANNON.Vec3();
  batTipVel = new CANNON.Vec3();
  // carry / throw / expressions
  liftT = 0;
  throwAnim = 0;
  carriedBy: Character | null = null;
  thrownT = 0;
  thrownBy: Character | null = null;
  hurtT = 0;
  expr: "normal" | "hurt" | "dizzy" = "normal";
  // look-at (head + pupils follow the nearest cat)
  lookTarget: Character | null = null;
  lookPick = 0;
  lookYaw = 0;
  lookPitch = 0;
  lookPoint = new CANNON.Vec3();
  hasLook = false;
  headGoal = new CANNON.Quaternion();
  pupX = 0;
  pupY = 0;
  // self collision
  vols = rig.selfVolumes();
  armPts: { y: number; r: number }[] = [];
  pawR = 0.09;
  private subTick = 0;
  // accessories
  accKind: AccessoryId = "none";
  static loose: { body: CANNON.Body; mesh: THREE.Object3D }[] = [];
  private prevHeadV = new CANNON.Vec3();
  weapon: Bat | null = null;
  swingTimer = 0;
  stickyLift = false;
  squash = 0;
  squashV = 0;
  stepT = 0;
  airPeak = 0;
  fallV = 0;
  headTop = 0.62;

  constructor(
    world: CANNON.World,
    index: number,
    def: AnimalDef,
    name: string,
    humanSlot: 0 | 1 | 2,
    hooks: CharacterHooks,
    spawn: THREE.Vector3,
    yaw: number,
    input: ControlState,
    accessory: AccessoryId = "none"
  ) {
    this.world = world;
    this.index = index;
    this.bit = 1 << (index + 2);
    this.def = def;
    this.name = name;
    this.humanSlot = humanSlot;
    this.isHuman = humanSlot > 0;
    this.hooks = hooks;
    this.facing = yaw;
    this.input = input;

    refreshRig();
    {
      const tu = getTuning();
      this.vols = rig.selfVolumes(tu);
      const AYf = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * tu.armLen;
      this.pawR = 0.112 * tu.armTip * 0.92;
      // paw, forearm and (thinner) upper part of the arm, in arm-local space
      // only points that can always be resolved (the shoulder ball itself is meant to sit inside the body)
      this.armPts = [
        { y: AYf(-0.205), r: this.pawR },
        { y: AYf(-0.11), r: 0.075 * tu.armRoot * 0.7 },
      ];
    }
    this.buildBodies(spawn, yaw);
    this.visual = buildCharacterVisual(def, accessory);
    this.accKind = this.visual.accessoryKind;
    this.root.add(...this.visual.all);

    this.nameTag = makeNameTag(this.isHuman ? (humanSlot === 1 ? "KAMU" : "P2") : name, this.isHuman, humanSlot);
    this.root.add(this.nameTag);

    // KO stars
    const starGeo = new THREE.OctahedronGeometry(0.09, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffd93d });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      s.scale.set(1, 1, 0.4);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.root.add(this.stars);
    this.syncVisual();
  }

  private makeBody(mass: number, part: PartName, pos: CANNON.Vec3, q: CANNON.Quaternion, mat: CANNON.Material) {
    const b = new CANNON.Body({
      mass,
      material: mat,
      linearDamping: 0.05,
      angularDamping: part === "torso" ? 0.4 : 0.25,
      collisionFilterGroup: this.bit,
      collisionFilterMask: ~this.bit,
    });
    b.position.copy(pos);
    b.quaternion.copy(q);
    b.allowSleep = false;
    bodyOwner.set(b, { char: this, part });
    this.parts.push(b);
    this.totalMass += mass;
    return b;
  }

  private buildBodies(spawn: THREE.Vector3, yaw: number) {
    const mat = Character.material;
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(Y, yaw);
    const base = new CANNON.Vec3(spawn.x, spawn.y + HOVER, spawn.z);
    const at = (local: CANNON.Vec3) => {
      const r = q.vmult(local);
      return base.vadd(r);
    };

    this.torso = this.makeBody(3, "torso", base.clone(), q, mat);
    // torso collision follows the body proportions (height / width / belly)
    {
      const tu = getTuning();
      const bh = tu.bodyH, bb = tu.bodyBottom, bt = tu.bodyTop;
      const rLow = 0.4 * Math.min(1, 0.55 + 0.45 * bb), rMid = 0.3 * (0.6 + 0.4 * bt), rTop = 0.25 * (0.6 + 0.4 * bt);
      // keep the lowest sphere above the feet so short legs still reach the ground
      const lowY = Math.max(-0.2 * bh, -(HOVER - 0.12) + rLow);
      this.torso.addShape(new CANNON.Sphere(rLow), new CANNON.Vec3(0, lowY, 0.02));
      this.torso.addShape(new CANNON.Sphere(rMid), new CANNON.Vec3(0, 0.12 * bh, 0));
      this.torso.addShape(new CANNON.Sphere(rTop), new CANNON.Vec3(0, 0.3 * bh, 0));
    }

    this.head = this.makeBody(0.8, "head", at(new CANNON.Vec3(0, rig.HEAD_OFFSET, 0)), q, mat);
    // big wide cat head: centre ball + cheek balls (kept slim at the front so punches still land)
    const tun = getTuning();
    const hs = tun.head, hy = tun.neck;
    this.head.addShape(new CANNON.Sphere(0.34 * hs), new CANNON.Vec3(0, 0.02 * hs + hy, 0));
    this.head.addShape(new CANNON.Sphere(0.22 * hs), new CANNON.Vec3(0.2 * hs, -0.1 * hs + hy, 0.03));
    this.head.addShape(new CANNON.Sphere(0.22 * hs), new CANNON.Vec3(-0.2 * hs, -0.1 * hs + hy, 0.03));
    this.headTop = 0.62 * hs + hy;

    const limb = (part: PartName, top: CANNON.Vec3, mass: number, r1: number, r2: number, len = 1) => {
      const p = top.vsub(LIMB_TOP);
      const b = this.makeBody(mass, part, at(p), q, mat);
      b.addShape(new CANNON.Sphere(r1), new CANNON.Vec3(0, 0.05, 0));
      b.addShape(new CANNON.Sphere(r2), new CANNON.Vec3(0, 0.15 - 0.35 * len, 0));
      return b;
    };
    this.armL = limb("armL", SHOULDER_L, 0.35, 0.12, 0.13, rig.ARM_LEN);
    this.armR = limb("armR", SHOULDER_R, 0.35, 0.12, 0.13, rig.ARM_LEN);
    this.legL = limb("legL", HIP_L, 0.45, 0.14, 0.17, rig.LEG_H * 0.97);
    this.legR = limb("legR", HIP_R, 0.45, 0.14, 0.17, rig.LEG_H * 0.97);

    // joints
    this.joints.push(
      new CANNON.ConeTwistConstraint(this.torso, this.head, {
        pivotA: vec(rig.NECK_A),
        pivotB: vec(rig.NECK_B),
        axisA: new CANNON.Vec3(0, 1, 0),
        axisB: new CANNON.Vec3(0, 1, 0),
        angle: 0.5,
        twistAngle: 1.0,
      })
    );
    this.joints.push(new CANNON.PointToPointConstraint(this.torso, SHOULDER_L, this.armL, LIMB_TOP));
    this.joints.push(new CANNON.PointToPointConstraint(this.torso, SHOULDER_R, this.armR, LIMB_TOP));
    for (const [leg, hip] of [
      [this.legL, HIP_L],
      [this.legR, HIP_R],
    ] as const) {
      this.joints.push(
        new CANNON.ConeTwistConstraint(this.torso, leg, {
          pivotA: hip,
          pivotB: LIMB_TOP,
          axisA: new CANNON.Vec3(0, -1, 0),
          axisB: new CANNON.Vec3(0, -1, 0),
          angle: 1.4,
          twistAngle: 0.25,
        })
      );
    }
    for (const b of this.parts) this.world.addBody(b);
    for (const j of this.joints) this.world.addConstraint(j);
  }

  static material = new CANNON.Material("char");

  get ko() {
    return this.koTimer > 0;
  }
  get position() {
    return this.torso.position;
  }
  get holding() {
    return !!(this.holds.armL || this.holds.armR);
  }
  get hangingStatic() {
    return [this.holds.armL, this.holds.armR].some((h) => h && h.body.type !== CANNON.Body.DYNAMIC);
  }
  fwd(out = new CANNON.Vec3()) {
    out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    return out;
  }

  /** Called once per rendered frame: handles button presses. */
  frameActions(dt: number) {
    if (!this.alive && this.removed) return;
    const inp = this.input;
    this.time += dt;
    this.updateLook(dt);

    // squash & stretch spring (+ = stretch, - = squash)
    this.squashV += (-110 * this.squash - 10 * this.squashV) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.32, 0.3);
    if (!this.grounded) {
      this.airPeak = Math.max(this.airPeak, this.airTime);
      this.fallV = Math.min(this.fallV, this.torso.velocity.y);
    } else {
      if (!this.wasGrounded && this.airPeak > 0.22) {
        const k = clamp(-this.fallV / 10, 0.25, 1);
        if (this.fallV < -11 && !this.ko) this.stagger = Math.max(this.stagger, 0.45); // hard landing
        this.squashV -= 7 * k;
        this.hooks.onLand(this, k);
      }
      this.airPeak = 0;
      this.fallV = 0;
      const sp = Math.hypot(this.torso.velocity.x, this.torso.velocity.z);
      this.stepT -= dt * (sp > 4.6 ? 1 : 0);
      if (sp > 4.6 && this.stepT <= 0) {
        this.stepT = 0.16;
        this.squashV -= 1.2;
        this.hooks.onStep(this);
      }
    }
    this.wasGrounded = this.grounded;
    if (this.swingTimer > 0) this.swingTimer -= dt;
    if (this.throwAnim > 0) this.throwAnim -= dt;
    if (this.thrownT > 0) this.thrownT -= dt;
    this.hurtT -= dt;
    this.updateExpr();
    this.jumpCd -= dt;
    this.punchCd -= dt;
    this.attackCd -= dt;

    if (this.koTimer > 0) {
      this.koTimer -= dt;
      if (this.koTimer <= 0) {
        this.koTimer = 0;
        this.stagger = 0.5;
        this.stars.visible = false;
      }
    }
    if (this.time - this.lastHitTime > 1.4) this.dizzy = Math.max(0, this.dizzy - 14 * dt);

    const canAct = !this.ko && this.alive;

    // facing from move input
    const mlen = Math.hypot(inp.mx, inp.mz);
    if (canAct && mlen > 0.15 && this.dropkickTimer <= 0) {
      const target = Math.atan2(inp.mx, inp.mz);
      const turnRate = this.grounded ? 13 : 6;
      const d = wrapAngle(target - this.facing);
      this.facing = wrapAngle(this.facing + d * Math.min(1, dt * turnRate));
    }

    if (!canAct) {
      this.releaseAll(false);
      return;
    }

    // struggle out of grabs
    if (this.heldBy > 0 && (inp.punch || inp.jump || inp.headbutt)) {
      for (const c of Character.all) {
        for (const h of [c.holds.armL, c.holds.armR]) if (h && h.owner === this) h.t += 0.32;
      }
    }

    // JUMP / CLIMB
    if (inp.jump && this.jumpCd <= 0) {
      if (this.hangingStatic) {
        this.releaseAll(false);
        // rise first, then the climb assist pulls us over the lip
        for (const b of this.parts) {
          b.velocity.y = 10;
          b.velocity.x *= 0.2;
          b.velocity.z *= 0.2;
        }
        this.climbAssist = 0.7;
        this.noHover = 0.3;
        this.jumpCd = 0.5;
        sfx.jump();
      } else if (this.grounded && this.heldBy === 0) {
        const gv = this.groundBody ? this.groundBody.velocity.y : 0;
        for (const b of this.parts) b.velocity.y = Math.max(b.velocity.y, gv) + 8.2;
        this.noHover = 0.25;
        this.jumpCd = 0.4;
        this.squashV += 5.5;
        sfx.jump();
      }
    }

    // LIFT / THROW (one easy button)
    if (inp.lift) {
      if (this.weapon) this.throwWeapon();
      else if (this.holding) this.releaseAll(true);
      else this.tryLift();
    }

    // PUNCH (or lift / throw when holding, swing when holding a weapon)
    if (inp.punch && this.weapon && this.punchCd <= 0) {
      this.swingTimer = 0.5;
      this.punchCd = this.weapon.kind === "pan" ? 0.54 : 0.58;
      this.hitSet.clear();
      sfx.whoosh();
    } else if (inp.punch && !this.weapon) {
      if (this.holding) {
        if (!this.lifting) {
          // switch to "carry": the body is held above the head by a spring (arms are too short to reach)
          let any = false;
          for (const h of [this.holds.armL, this.holds.armR]) {
            if (h && h.body.type === CANNON.Body.DYNAMIC) {
              this.world.removeConstraint(h.c);
              h.carry = true;
              any = true;
            }
          }
          this.lifting = any;
        } else {
          this.releaseAll(true);
        }
      } else if (this.punchCd <= 0 && this.dropkickTimer <= 0) {
        this.punchArm = this.punchArm === "armL" ? "armR" : "armL";
        this.punchTimer = PUNCH_T;
        this.punchCd = 0.3;
        this.hitSet.clear();
        sfx.whoosh();
      }
    }

    // HEADBUTT / DROPKICK
    if (inp.headbutt && this.attackCd <= 0 && !this.holding) {
      const f = this.fwd(v1);
      this.hitSet.clear();
      if (this.grounded) {
        this.headbuttTimer = 0.38;
        this.torso.velocity.x += f.x * 4;
        this.torso.velocity.z += f.z * 4;
        this.head.velocity.x += f.x * 3;
        this.head.velocity.z += f.z * 3;
        this.attackCd = 0.75;
      } else {
        this.dropkickTimer = 0.75;
        for (const b of this.parts) {
          b.velocity.x = f.x * 8.5;
          b.velocity.z = f.z * 8.5;
          b.velocity.y += 2.5;
        }
        this.attackCd = 1.3;
      }
      sfx.whoosh();
    }

    // GRAB release -> throw
    if (!inp.grab && this.holding && !this.stickyLift) this.releaseAll(true);
    if (!this.holding) {
      this.lifting = false;
      this.stickyLift = false;
    }
  }

  /** hats & masks fly off on big hits and become loose physics props */
  knockAccessory(dir: CANNON.Vec3) {
    const acc = this.visual.accessory;
    if (!acc || this.accKind === "helmet" || this.accKind === "none") return;
    const scene = this.root.parent;
    if (!scene) return;
    this.visual.head.updateMatrixWorld(true);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    acc.getWorldPosition(wp);
    acc.getWorldQuaternion(wq);
    // pivot the loose mesh around its own centre
    const box = new THREE.Box3().setFromObject(acc);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const holder = new THREE.Group();
    holder.position.copy(centre);
    scene.add(holder);
    acc.removeFromParent();
    holder.add(acc);
    acc.position.copy(wp).sub(centre);
    acc.quaternion.copy(wq);
    acc.position.applyQuaternion(new THREE.Quaternion());
    const body = new CANNON.Body({ mass: 0.25, linearDamping: 0.1, angularDamping: 0.2 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.06, size.x * 0.45), Math.max(0.05, size.y * 0.4), Math.max(0.06, size.z * 0.45))));
    body.position.set(centre.x, centre.y, centre.z);
    const l = Math.hypot(dir.x, dir.z) || 1;
    body.velocity.set((dir.x / l) * 4 + this.head.velocity.x * 0.5, 6.5, (dir.z / l) * 4 + this.head.velocity.z * 0.5);
    body.angularVelocity.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 18);
    this.world.addBody(body);
    Character.loose.push({ body, mesh: holder });
    this.visual.accessory = null;
    this.visual.googly = [];
    this.accKind = "none";
    sfx.whoosh();
  }

  /** pick the nearest cat to watch (prefer whoever just hit us) and ease the head toward it */
  private updateLook(dt: number) {
    this.lookPick -= dt;
    if (this.lookPick <= 0) {
      this.lookPick = 0.3 + Math.random() * 0.2;
      let best: Character | null = null;
      let bs = 9;
      const hp = this.head.position;
      for (const c of Character.all) {
        if (c === this || !c.alive || c.removed) continue;
        let d = Math.hypot(c.head.position.x - hp.x, c.head.position.z - hp.z);
        if (c === this.lastHitBy && this.time - this.lastHitTime < 3) d -= 3;
        if (c === this.lookTarget) d -= 0.6; // a bit of stickiness
        if (d < bs) {
          bs = d;
          best = c;
        }
      }
      this.lookTarget = best;
    }
    let ty = 0, tp = 0;
    const lt = this.lookTarget;
    this.hasLook = false;
    if (lt && !lt.removed && this.alive && !this.ko && !this.carriedBy && !this.lifting) {
      const hp = this.head.position, q = lt.head.position;
      const dx = q.x - hp.x, dy = q.y - hp.y, dz = q.z - hp.z;
      const fT = this.torso.quaternion.vmult(Z, v1);
      const rel = wrapAngle(Math.atan2(dx, dz) - Math.atan2(fT.x, fT.z));
      if (Math.abs(rel) < 2.4) {
        ty = clamp(rel * 0.6, -0.85, 0.85); // eyes lead, head follows ~60%
        tp = clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.7, -0.35, 0.35);
        this.lookPoint.copy(q);
        this.hasLook = true;
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    this.lookYaw += (ty - this.lookYaw) * k;
    this.lookPitch += (tp - this.lookPitch) * k;
  }

  /** keep paws / forearms out of our own body (and head): real self-collision for the ragdoll arms */
  private selfCollide() {
    if (this.removed) return;
    const t = this.torso, hd = this.head;
    for (const arm of [this.armL, this.armR]) {
      for (const ap of this.armPts) {
        _sp.set(0, ap.y, 0.01);
        const wp = arm.pointToWorldFrame(_sp, _sw);
        _corr.set(0, 0, 0);
        for (const [body, vols] of [
          [t, this.vols.torso],
          [hd, this.vols.head],
        ] as const) {
          body.pointToLocalFrame(wp, _sl);
          _sl0.copy(_sl);
          if (!rig.pushOut(_sl, ap.r, vols)) continue;
          _sl.vsub(_sl0, _sd);
          body.vectorToWorldFrame(_sd, _sd);
          _corr.vadd(_sd, _corr);
          wp.vadd(_sd, wp);
        }
        const depth = _corr.length();
        if (depth < 1e-4) continue;
        // positional correction on the light arm only, capped per sub-step (stable, no energy pumping)
        const fix = Math.min(depth * 0.6, 0.02) / depth;
        arm.position.x += _corr.x * fix;
        arm.position.y += _corr.y * fix;
        arm.position.z += _corr.z * fix;
        _n.copy(_corr);
        _n.scale(1 / depth, _n);
        // velocity: kill the inward relative motion at the contact point (with a tiny bounce)
        wp.vsub(arm.position, _ra);
        arm.angularVelocity.cross(_ra, _tmp);
        arm.velocity.vadd(_tmp, _va);
        wp.vsub(t.position, _rt);
        t.angularVelocity.cross(_rt, _tmp);
        t.velocity.vadd(_tmp, _vt);
        const va = _va, vt = _vt;
        const vn = (va.x - vt.x) * _n.x + (va.y - vt.y) * _n.y + (va.z - vt.z) * _n.z;
        if (vn < 0) {
          const j = -vn * arm.mass * 0.9;
          _imp.set(_n.x * j, _n.y * j, _n.z * j);
          arm.applyImpulse(_imp, _ra); // cannon-es: point is relative to the centre of mass
          _imp.scale(-0.25, _imp);
          t.applyImpulse(_imp);
          // a little friction so arms slide along the belly instead of sticking
          arm.velocity.scale(0.97, arm.velocity);
        }
      }
    }
  }

  /** don't collide with whoever is carrying / just threw us (prevents getting stuck on their head) */
  updateCollisionMask() {
    const other = this.carriedBy ?? (this.thrownT > 1.15 ? this.thrownBy : null);
    const mask = ~this.bit & (other ? ~other.bit : ~0);
    if (mask === this.parts[0].collisionFilterMask) return;
    for (const b of this.parts) b.collisionFilterMask = mask;
  }

  /** pick the face: crying when hurt / carried, spiral eyes when dizzy or KO */
  updateExpr() {
    let e: "normal" | "hurt" | "dizzy" = "normal";
    if (this.ko) e = "dizzy";
    else if (this.hurtT > 0 || this.carriedBy) e = "hurt";
    else if (this.dizzy >= 60) e = "dizzy";
    if (e === this.expr) return;
    this.expr = e;
    const v = this.visual;
    v.eyesNormal.visible = e === "normal";
    v.eyesHurt.visible = e === "hurt";
    v.eyesKO.visible = e === "dizzy";
    v.mouthN.visible = e === "normal";
    v.mouthCry.visible = e === "hurt";
    v.mouthWavy.visible = e === "dizzy";
  }

  /** E: pick up a bat, or grab + lift whatever is in front of us in one go */
  tryLift() {
    const f = this.fwd(new CANNON.Vec3());
    const tp = this.torso.position;
    let bat: Bat | null = null;
    let batD = 1.35;
    for (const b of Character.bats) {
      if (b.holder || !this.world.bodies.includes(b.body)) continue;
      const d = Math.hypot(b.body.position.x - tp.x, b.body.position.z - tp.z);
      if (d < batD && Math.abs(b.body.position.y - tp.y) < 1.2) {
        batD = d;
        bat = b;
      }
    }
    let best: CANNON.Body | null = null;
    let owner: Character | null = null;
    let bestD = Infinity;
    const consider = (body: CANNON.Body, who: Character | null, maxD: number) => {
      const dx = body.position.x - tp.x, dz = body.position.z - tp.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD || Math.abs(body.position.y - tp.y) > 1.3) return;
      const dot = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      if (dot < -0.2) return;
      const score = d * (1.6 - dot);
      if (score < bestD) {
        bestD = score;
        best = body;
        owner = who;
      }
    };
    for (const c of Character.all) if (c !== this && c.alive && !c.removed) consider(c.torso, c, 1.7);
    for (const b of this.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC || bodyOwner.has(b) || b.mass > 6) continue;
      if (Character.bats.some((bt) => bt.body === b)) continue;
      consider(b, null, 1.4);
    }
    if (bat && (!best || batD < bestD * 0.8)) return this.equip(bat);
    if (best) this.carryNow(best, owner);
  }

  private carryNow(body: CANNON.Body, owner: Character | null) {
    for (const arm of ["armL", "armR"] as const) {
      const c = new CANNON.PointToPointConstraint(this[arm], HAND.clone(), body, new CANNON.Vec3());
      this.holds[arm] = { arm, c, body, owner, t: 0, pivotA: HAND.clone(), pivotB: new CANNON.Vec3(), carry: true };
    }
    this.lifting = true;
    this.stickyLift = true;
    this.liftT = 0;
    this.squashV -= 4.5;
    const bodies = owner ? owner.parts : [body];
    for (const b of bodies) b.velocity.y += 3;
    if (owner) {
      owner.stagger = Math.max(owner.stagger, 0.8);
      owner.lastHitBy = this;
      owner.lastHitAt = this.time;
    }
    sfx.grab();
  }

  equip(weapon: Bat) {
    this.world.removeBody(weapon.body);
    weapon.holder = this;
    weapon.thrower = null;
    weapon.flyT = 0;
    this.weapon = weapon;
    this.batTh = 1.2;
    this.batEl = 0.3;
    sfx.grab();
  }

  /** release the held weapon: thrown hard (E) or just dropped */
  throwWeapon(hard = true) {
    const b = this.weapon;
    if (!b) return;
    this.weapon = null;
    b.holder = null;
    const f = this.fwd(new CANNON.Vec3());
    const g = this.batGrip, d = this.batDir;
    if (hard) {
      // launch from in front of the chest, spinning end over end
      b.body.position.set(this.torso.position.x + f.x * 0.9, this.torso.position.y + 0.45, this.torso.position.z + f.z * 0.9);
      b.body.quaternion.setFromAxisAngle(new CANNON.Vec3(f.z, 0, -f.x), Math.PI / 2);
    } else {
      b.body.position.set(g.x + d.x * b.centerOffset, Math.max(0.3, g.y + d.y * b.centerOffset), g.z + d.z * b.centerOffset);
      b.body.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), d);
    }
    if (hard) {
      const speed = b.kind === "pan" ? 9.5 : 13;
      b.body.velocity.set(f.x * speed + this.torso.velocity.x * 0.5, b.kind === "pan" ? 3 : 3.5, f.z * speed + this.torso.velocity.z * 0.5);
      b.body.angularVelocity.set(f.z * (b.kind === "pan" ? 14 : 20), 0, -f.x * (b.kind === "pan" ? 14 : 20));
      b.thrower = this;
      b.flyT = 1.3;
      b.hit.clear();
      sfx.whoosh();
    } else {
      b.body.velocity.set(this.torso.velocity.x, 1, this.torso.velocity.z);
      b.body.angularVelocity.set(0, 3, 0);
    }
    if (!this.world.bodies.includes(b.body)) this.world.addBody(b.body);
  }

  releaseAll(throwIt: boolean) {
    const thrown = new Set<CANNON.Body | Character>();
    for (const arm of ["armL", "armR"] as const) {
      const h = this.holds[arm];
      if (!h) continue;
      this.world.removeConstraint(h.c);
      this.holds[arm] = null;
      if (throwIt && h.body.type === CANNON.Body.DYNAMIC) {
        const key = h.owner ?? h.body;
        if (thrown.has(key)) continue;
        thrown.add(key);
        const f = this.fwd(v1);
        // bombs are lighter and are thrown in a shorter, more accurate arc
        const isBomb = bombBodies.has(h.body);
        const power = isBomb ? 6.0 : this.lifting ? 11 : 2.5;
        const upv = isBomb ? 2.6 : this.lifting ? 5 : 1.5;
        const bodies = h.owner ? h.owner.parts : [h.body];
        for (const b of bodies) {
          b.velocity.x += f.x * power;
          b.velocity.z += f.z * power;
          b.velocity.y += upv;
        }
        if (this.lifting) {
          this.throwAnim = 0.32;
          this.squashV += 3;
          if (h.owner) {
            h.owner.torso.angularVelocity.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 14);
            h.owner.thrownT = 1.4;
            h.owner.thrownBy = this;
            h.owner.hurtT = Math.max(h.owner.hurtT, 1.2);
          } else {
            Character.thrownProps.push({ body: h.body, by: this, t: 1.4 });
          }
        }
        if (h.owner) {
          h.owner.lastHitBy = this;
          h.owner.lastHitAt = this.time;
          h.owner.stagger = Math.max(h.owner.stagger, this.lifting ? 1.2 : 0.4);
          if (this.lifting) sfx.whoosh();
        }
      }
    }
    this.lifting = false;
    this.stickyLift = false;
  }

  /** Called on every physics sub-step. */
  physicsStep(h: number) {
    if (this.removed) return;
    const t = this.torso;
    const ko = this.ko || !this.alive;

    this.noHover -= h;
    this.stagger -= h;
    if (this.punchTimer > 0) {
      const before = this.punchTimer;
      this.punchTimer -= h;
      // lunge at the start of the strike
      if (before > PUNCH_STRIKE0 && this.punchTimer <= PUNCH_STRIKE0 && !this.ko) {
        const f0 = this.fwd(v1);
        this.torso.velocity.x += f0.x * 2.2;
        this.torso.velocity.z += f0.z * 2.2;
      }
    }
    if (this.headbuttTimer > 0) this.headbuttTimer -= h;
    if (this.dropkickTimer > 0) {
      this.dropkickTimer -= h;
      if (this.dropkickTimer <= 0 || (this.grounded && this.dropkickTimer < 0.5)) {
        this.dropkickTimer = 0;
        this.stagger = Math.max(this.stagger, 0.5);
        for (const b of this.parts) {
          b.velocity.x *= 0.45;
          b.velocity.z *= 0.45;
        }
      }
    }

    // ---------- ground probe ----------
    rayFrom.copy(t.position);
    rayTo.set(t.position.x, t.position.y - (HOVER + 0.5), t.position.z);
    rayRes.reset();
    this.world.raycastClosest(rayFrom, rayTo, { collisionFilterMask: ~this.bit, skipBackfaces: true }, rayRes);
    const hit = rayRes.hasHit;
    this.groundDist = hit ? rayRes.distance : 99;
    this.groundBody = hit ? rayRes.body : null;
    this.grounded = hit && this.groundDist < HOVER + 0.25 && !ko;
    if (this.grounded) this.airTime = 0;
    else this.airTime += h;

    if (ko) return;
    if (this.carriedBy) {
      this.flail();
      return;
    }

    const f = this.fwd(v4);
    const held = this.heldBy > 0;
    let balance = 1;
    if (this.stagger > 0) balance = 0.22;
    if (held) balance *= 0.35;
    if (!this.grounded) balance *= 0.6;
    if (this.dropkickTimer > 0) balance = 0.9;
    if (this.hangingStatic) balance *= 0.3;
    // dizzy: drunk-ish circular wobble
    if (this.dizzy >= 60 && this.grounded) {
      const w = this.time * 4.5;
      t.force.x += Math.cos(w) * this.totalMass * 7;
      t.force.z += Math.sin(w) * this.totalMass * 7;
      balance *= 0.7;
    }

    const inpG = this.input;
    this.aimBody = null;
    // ledge catching while falling beside the arena (takes priority over grabbing people)
    const falling = !this.grounded && this.groundDist > 1.3 && t.position.y < 0.8;
    const ledge = inpG.grab && falling && !this.lifting ? this.findLedge() : null;
    const aim = inpG.grab && !this.lifting && !ledge ? this.findGrabTarget(f) : null;
    const aimLow = aim ? aim.y < t.position.y - 0.05 : false;
    if (ledge) {
      const lx = ledge.x - t.position.x,
        lz = ledge.z - t.position.z;
      const ll = Math.hypot(lx, lz) || 1;
      if (!this.holding) {
        t.force.x += (lx / ll) * this.totalMass * 32;
        t.force.z += (lz / ll) * this.totalMass * 32;
      }
      for (const arm of ["armL", "armR"] as const) {
        if (this.holds[arm]) continue;
        const hand = this[arm].pointToWorldFrame(HAND, v1);
        if (hand.distanceTo(ledge) < 0.8 && this.ledgeBody) this.attachHold(arm, this.ledgeBody, null);
      }
    }

    // ---------- upright + yaw control (angular velocity servo) ----------
    let lean = 0;
    const hSpeed = Math.hypot(t.velocity.x, t.velocity.z);
    if (this.grounded) lean = Math.min(0.18, hSpeed * 0.025);
    if (this.headbuttTimer > 0.12) lean = 1.8;
    if (this.dropkickTimer > 0) lean = -3;
    if (this.punchTimer > 0) {
      const e = PUNCH_T - this.punchTimer;
      lean = e < PUNCH_WIND ? -0.12 : e < PUNCH_T - 0.08 ? 0.38 : 0.1;
    }
    if (this.swingTimer > 0) lean = 0.15;
    if (this.lifting) lean = -0.1 + 0.25 * (1 - Math.min(1, this.liftT));
    if (this.throwAnim > 0) lean = 0.4;
    if (aimLow && this.grounded) lean = 1.1; // bend over to pick things up

    const up = t.quaternion.vmult(Y, v1);
    v2.set(f.x * lean, 1, f.z * lean);
    v2.normalize();
    const axis = up.cross(v2, v3);
    if (up.dot(v2) < 0 && axis.length() < 0.3) {
      // upside-down: pick a deterministic axis
      axis.set(f.z, 0, -f.x);
    }
    const fwdT = t.quaternion.vmult(Z, v2);
    const curYaw = Math.atan2(fwdT.x, fwdT.z);
    // torso twist sells punches & bat swings
    let twist = 0;
    if (this.punchTimer > 0) {
      const sgn = this.punchArm === "armL" ? 1 : -1;
      const e = PUNCH_T - this.punchTimer;
      twist = e < PUNCH_WIND ? sgn * 0.35 : -sgn * 0.5 * Math.min(1, (this.punchTimer + 0.02) / 0.12);
    }
    if (this.swingTimer > 0) {
      const e = 0.5 - this.swingTimer;
      twist = e < 0.14 ? 0.35 * (e / 0.14) : e < 0.28 ? 0.35 - 0.9 * ((e - 0.14) / 0.14) : -0.55 * (this.swingTimer / 0.22);
    }
    const yawErr = wrapAngle(this.facing + twist - curYaw);
    const kUp = 15;
    const kYaw = 10;
    const blend = clamp(balance * 16 * h, 0, 1);
    const av = t.angularVelocity;
    av.x += (axis.x * kUp - av.x) * blend;
    av.z += (axis.z * kUp - av.z) * blend;
    av.y += (axis.y * kUp + yawErr * kYaw - av.y) * blend;

    // head: quaternion PD toward the torso orientation (keeps it from lolling / "sengklek")
    {
      _lq1.setFromAxisAngle(Y, this.lookYaw);
      _lq2.setFromAxisAngle(XA, -this.lookPitch);
      _lq1.mult(t.quaternion, _lq3);
      _lq3.mult(_lq2, this.headGoal);
      const qe = this.headGoal.mult(this.head.quaternion.conjugate(_hq), _hq2);
      if (qe.w < 0) {
        qe.x = -qe.x;
        qe.y = -qe.y;
        qe.z = -qe.z;
        qe.w = -qe.w;
      }
      const sh = Math.hypot(qe.x, qe.y, qe.z);
      const ang = 2 * Math.atan2(sh, qe.w);
      const k = sh > 1e-6 ? (ang / sh) * 24 : 0;
      const hav = this.head.angularVelocity;
      const hb = clamp((this.stagger > 0 ? 9 : 22) * h, 0, 1);
      hav.x += (av.x + qe.x * k - hav.x) * hb;
      hav.y += (av.y + qe.y * k - hav.y) * hb;
      hav.z += (av.z + qe.z * k - hav.z) * hb;
    }

    // ---------- hover (legs "spring") ----------
    let liftedMass = 0;
    if (this.lifting) {
      const seen = new Set<unknown>();
      for (const hd of [this.holds.armL, this.holds.armR]) {
        if (!hd || hd.body.type !== CANNON.Body.DYNAMIC) continue;
        const key = hd.owner ?? hd.body;
        if (seen.has(key)) continue;
        seen.add(key);
        liftedMass += hd.owner ? hd.owner.totalMass : Math.min(hd.body.mass, 6);
      }
    }
    if (this.grounded && this.noHover <= 0) {
      const gv = this.groundBody ? this.groundBody.velocity.y : 0;
      const err = HOVER - this.groundDist;
      const targetVy = clamp(err * 11, -4, 6) + gv;
      const acc = GRAVITY + (targetVy - t.velocity.y) * 18;
      const fy = clamp((this.totalMass + liftedMass) * acc, 0, (this.totalMass + liftedMass) * GRAVITY * 4);
      t.force.y += fy;
      // Newton III: push down on whatever we stand on (no free elevators)
      const gb = this.groundBody;
      if (gb && gb.type === CANNON.Body.DYNAMIC) {
        v1.set(0, -fy, 0);
        v2.set(t.position.x - gb.position.x, t.position.y - this.groundDist - gb.position.y, t.position.z - gb.position.z);
        gb.applyForce(v1, v2);
      }
    }

    // ---------- locomotion ----------
    const inp = this.input;
    let speed = (inp.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, Math.hypot(inp.mx, inp.mz));
    if (this.holding) speed *= 0.65;
    if (this.punchTimer > 0) speed *= 0.6;
    if (held) speed *= 0.25;
    const mlen = Math.hypot(inp.mx, inp.mz);
    const dx = mlen > 0.1 ? (inp.mx / mlen) * speed : 0;
    const dz = mlen > 0.1 ? (inp.mz / mlen) * speed : 0;
    let ctrl = this.grounded ? 9 : 2.2;
    if (this.stagger > 0) ctrl *= 0.3;
    if (this.dropkickTimer > 0 || this.headbuttTimer > 0.1) ctrl = 0;
    if (this.hangingStatic) ctrl = 0.6;
    const gvx = this.groundBody ? this.groundBody.velocity.x : 0;
    const gvz = this.groundBody ? this.groundBody.velocity.z : 0;
    if (this.climbAssist > 0) {
      this.climbAssist -= h;
      if (this.climbAssist < 0.5) {
        // pull forward over the ledge once we're above it
        const fv = this.fwd(v3);
        t.force.x += this.totalMass * clamp((fv.x * 4 - t.velocity.x) * 12, -60, 60);
        t.force.z += this.totalMass * clamp((fv.z * 4 - t.velocity.z) * 12, -60, 60);
      }
      ctrl = 0;
    }
    const ax = clamp((dx + gvx - t.velocity.x) * ctrl, -40, 40);
    const az = clamp((dz + gvz - t.velocity.z) * ctrl, -40, 40);
    t.force.x += this.totalMass * ax;
    t.force.z += this.totalMass * az;

    // ---------- legs ----------
    const moveAmt = clamp(hSpeed / 4.2, 0, 1.25);
    if (this.grounded && moveAmt > 0.06) this.walkPhase += h * (7 + hSpeed * 1.5);
    const side = v2.set(f.z, 0, -f.x); // character's left (+x local)
    for (const [leg, hip, off] of [
      [this.legL, HIP_L, 0],
      [this.legR, HIP_R, Math.PI],
    ] as const) {
      const hipW = t.pointToWorldFrame(hip, v1);
      let tx: number, ty: number, tz: number;
      if (this.dropkickTimer > 0) {
        tx = hipW.x + f.x * 0.6;
        ty = hipW.y + 0.05;
        tz = hipW.z + f.z * 0.6;
      } else if (this.grounded) {
        const ph = this.walkPhase + off;
        const LH = rig.LEG_H;
        const sw = Math.sin(ph) * 0.34 * (0.6 + 0.4 * LH) * moveAmt;
        const lift = Math.max(0, Math.cos(ph)) * 0.24 * (0.6 + 0.4 * LH) * moveAmt;
        tx = hipW.x + f.x * sw;
        ty = hipW.y + (FOOT.y - LIMB_TOP.y) * 0.97 + lift;
        tz = hipW.z + f.z * sw;
      } else {
        const fl = Math.sin(this.time * 14 + off) * 0.18;
        tx = hipW.x + f.x * (0.12 + fl);
        ty = hipW.y + (FOOT.y - LIMB_TOP.y) * 0.78;
        tz = hipW.z + f.z * (0.12 + fl);
      }
      this.driveLimb(leg, FOOT, tx, ty, tz, 320, 22, 1);
    }

    // ---------- arms ----------
    for (const arm of ["armL", "armR"] as const) {
      const body = this[arm];
      const s = arm === "armL" ? 1 : -1;
      const sh = t.pointToWorldFrame(arm === "armL" ? SHOULDER_L : SHOULDER_R, v1);
      let tx = sh.x,
        ty = sh.y,
        tz = sh.z;
      let kp = 240,
        kd = 18;
      const punching = this.punchTimer > 0 && this.punchArm === arm;
      const pe = PUNCH_T - this.punchTimer;
      if (this.weapon) {
        // both paws on the handle (right paw on top)
        const g = this.batGrip, d = this.batDir;
        const up2 = arm === "armR" ? 0.13 : 0.0;
        tx = g.x + d.x * up2;
        ty = g.y + d.y * up2;
        tz = g.z + d.z * up2;
        kp = this.swingTimer > 0 ? 1100 : 520;
        kd = 30;
      } else if (punching && pe < PUNCH_WIND) {
        // wind-up: pull the paw back next to the cheek
        tx += -f.x * 0.12 + side.x * s * 0.12;
        tz += -f.z * 0.12 + side.z * s * 0.12;
        ty += 0.16;
        kp = 700;
        kd = 26;
      } else if (punching && this.punchTimer > 0.08) {
        // strike: snap forward and slightly across the body
        tx += f.x * 1.12 - side.x * s * 0.26;
        tz += f.z * 1.12 - side.z * s * 0.26;
        ty += 0.12;
        kp = 1700;
        kd = 32;
      } else if (this.throwAnim > 0) {
        // throw follow-through: both paws snap forward
        tx += f.x * 0.42 + side.x * s * 0.1;
        tz += f.z * 0.42 + side.z * s * 0.1;
        ty += 0.22;
        kp = 900;
      } else if (this.lifting) {
        // overhead carry: both paws raised in a "V" beside the head, pushing up on the body
        const u = Math.min(1, this.liftT);
        const outw = 0.3 + 0.08 * u;
        const upw = 0.08 + 0.36 * u;
        tx += side.x * s * outw + f.x * 0.06;
        ty += upw;
        tz += side.z * s * outw + f.z * 0.06;
        kp = 650;
      } else if (ledge && !this.holds[arm]) {
        let ax2 = ledge.x + side.x * s * 0.2 - sh.x;
        let ay2 = ledge.y + 0.05 - sh.y;
        let az2 = ledge.z + side.z * s * 0.2 - sh.z;
        const l = Math.hypot(ax2, ay2, az2);
        if (l > 1.05) {
          ax2 *= 1.05 / l;
          ay2 *= 1.05 / l;
          az2 *= 1.05 / l;
        }
        tx += ax2;
        ty += ay2;
        tz += az2;
        kp = 600;
      } else if (inp.grab && aim && !this.holds[arm]) {
        // reach toward the closest grabbable thing (clamped to arm reach)
        let ax2 = aim.x + side.x * s * 0.16 - sh.x;
        let ay2 = aim.y - sh.y;
        let az2 = aim.z + side.z * s * 0.16 - sh.z;
        const l = Math.hypot(ax2, ay2, az2);
        const reach = 1.05;
        if (l > reach) {
          ax2 *= reach / l;
          ay2 *= reach / l;
          az2 *= reach / l;
        }
        tx += ax2;
        ty += ay2;
        tz += az2;
        kp = 420;
      } else if (inp.grab) {
        tx += f.x * 0.72 - side.x * s * 0.12;
        tz += f.z * 0.72 - side.z * s * 0.12;
        ty += 0.12;
        kp = 380;
      } else if (this.headbuttTimer > 0) {
        tx += -f.x * 0.2 + side.x * s * 0.3;
        tz += -f.z * 0.2 + side.z * s * 0.3;
        ty -= 0.2;
      } else if (!this.grounded) {
        // flail in the air
        const fl = Math.sin(this.time * 16 + s) * 0.2;
        tx += side.x * s * 0.35 + f.x * fl;
        tz += side.z * s * 0.35 + f.z * fl;
        ty += 0.35 + fl * 0.5;
        kp = 160;
      } else {
        // relaxed arms hanging a bit out (no T-pose); running = cute alternating pumps
        const ph = this.walkPhase + (s > 0 ? 0 : Math.PI);
        const run = clamp((hSpeed - 2.5) / 3, 0, 1);
        const swing = -Math.sin(ph) * (0.2 + 0.22 * run) * moveAmt;
        const breathe = Math.sin(this.time * 2.4 + s) * 0.018;
        const out = 0.24 + 0.05 * run;
        tx += side.x * s * out + f.x * (0.05 + swing);
        tz += side.z * s * out + f.z * (0.05 + swing);
        ty += -0.33 + breathe + run * (0.1 + Math.max(0, swing) * 0.55);
        kp = 200 + run * 140;
      }
      // never aim a paw inside our own body / head (the PD would fight the self-collision)
      _sw.set(tx, ty, tz);
      t.pointToLocalFrame(_sw, _sl);
      if (rig.pushOut(_sl, this.pawR + 0.015, this.vols.torso)) {
        t.pointToWorldFrame(_sl, _sw);
        tx = _sw.x;
        ty = _sw.y;
        tz = _sw.z;
      }
      this.head.pointToLocalFrame(_sw, _sl);
      if (rig.pushOut(_sl, this.pawR + 0.015, this.vols.head)) {
        this.head.pointToWorldFrame(_sl, _sw);
        tx = _sw.x;
        ty = _sw.y;
        tz = _sw.z;
      }
      this.driveLimb(body, HAND, tx, ty, tz, kp, kd, punching ? 0.3 : 0.6);
    }

    // proximity grab (forgiving, like the real games)
    const ob = this.aimBody as CANNON.Body | null;
    if (inp.grab && ob && !this.lifting) {
      const info = bodyOwner.get(ob);
      const br = info ? (info.part === "torso" ? 0.55 : 0.5) : ob.boundingRadius * 0.8;
      for (const arm of ["armL", "armR"] as const) {
        if (this.holds[arm]) continue;
        const hand = this[arm].pointToWorldFrame(HAND, v1);
        if (hand.distanceTo(ob.position) < br + 0.3) this.attachHold(arm, ob, info?.char ?? null);
      }
    }
  }

  attachHold(arm: "armL" | "armR", other: CANNON.Body, owner: Character | null) {
    const hand = this[arm].pointToWorldFrame(HAND, new CANNON.Vec3());
    const pivotB = other.pointToLocalFrame(hand, new CANNON.Vec3());
    const c = new CANNON.PointToPointConstraint(this[arm], HAND.clone(), other, pivotB, 260);
    this.world.addConstraint(c);
    this.holds[arm] = { arm, c, body: other, owner, t: 0, pivotA: HAND.clone(), pivotB, carry: false };
    sfx.grab();
  }

  private ledgeVec = new CANNON.Vec3();
  ledgeBody: CANNON.Body | null = null;
  private findLedge(): CANNON.Vec3 | null {
    const cx = this.torso.position.x,
      cy = this.torso.position.y + 0.35,
      cz = this.torso.position.z;
    let bestD = 1.9;
    let found = false;
    this.ledgeBody = null;
    for (const b of this.world.bodies) {
      if (b.type === CANNON.Body.DYNAMIC) continue;
      if (b.velocity.lengthSquared() > 0.01 || b.angularVelocity.lengthSquared() > 0.0001) continue;
      const sh = b.shapes[0];
      if (!(sh instanceof CANNON.Box)) continue;
      const he = sh.halfExtents;
      const px = clamp(cx, b.position.x - he.x, b.position.x + he.x);
      const py = clamp(cy, b.position.y - he.y, b.position.y + he.y);
      const pz = clamp(cz, b.position.z - he.z, b.position.z + he.z);
      if (py < this.torso.position.y - 0.7) continue; // that's floor below us, not a ledge
      const d = Math.hypot(px - cx, py - cy, pz - cz);
      if (d < bestD) {
        bestD = d;
        found = true;
        this.ledgeVec.set(px, py, pz);
        this.ledgeBody = b;
      }
    }
    return found ? this.ledgeVec : null;
  }

  private aimVec = new CANNON.Vec3();
  aimBody: CANNON.Body | null = null;
  private findGrabTarget(f: CANNON.Vec3): CANNON.Vec3 | null {
    const cx = this.torso.position.x,
      cy = this.torso.position.y + 0.3,
      cz = this.torso.position.z;
    let best: CANNON.Body | null = null;
    let bestScore = Infinity;
    for (const b of this.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC) continue;
      const info = bodyOwner.get(b);
      if (info && (info.char === this || !info.char.alive || (info.part !== "torso" && info.part !== "head"))) continue;
      const dx = b.position.x - cx,
        dy = b.position.y - cy,
        dz = b.position.z - cz;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 1.8 || dist < 0.01) continue;
      const dot = (dx * f.x + dz * f.z) / dist;
      if (dot < 0.3) continue;
      const score = dist * (1.6 - dot) * (info?.char.ko ? 0.7 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    this.aimBody = best;
    if (!best) return null;
    return this.aimVec.copy(best.position);
  }

  private driveLimb(body: CANNON.Body, localPt: CANNON.Vec3, tx: number, ty: number, tz: number, kp: number, kd: number, reaction: number) {
    const p = body.pointToWorldFrame(localPt, v3);
    const rx = p.x - body.position.x,
      ry = p.y - body.position.y,
      rz = p.z - body.position.z;
    // point velocity = v + w x r
    const w = body.angularVelocity;
    const pvx = body.velocity.x + (w.y * rz - w.z * ry) - this.torso.velocity.x;
    const pvy = body.velocity.y + (w.z * rx - w.x * rz) - this.torso.velocity.y;
    const pvz = body.velocity.z + (w.x * ry - w.y * rx) - this.torso.velocity.z;
    const m = body.mass;
    const fx = clamp(((tx - p.x) * kp - pvx * kd) * m, -400, 400);
    const fy = clamp(((ty - p.y) * kp - pvy * kd) * m, -400, 400);
    const fz = clamp(((tz - p.z) * kp - pvz * kd) * m, -400, 400);
    body.force.x += fx;
    body.force.y += fy;
    body.force.z += fz;
    // reaction on the torso keeps limb motion (mostly) internal
    this.torso.force.x -= fx * reaction;
    this.torso.force.y -= fy * reaction;
    this.torso.force.z -= fz * reaction;
    body.torque.x += ry * fz - rz * fy;
    body.torque.y += rz * fx - rx * fz;
    body.torque.z += rx * fy - ry * fx;
  }

  /** Contact callback from the game (after each physics step). */
  onContact(part: PartName, other: CANNON.Body, point: CANNON.Vec3, otherInfo: PartInfo | undefined) {
    if (this.ko || !this.alive) return;
    const otherChar = otherInfo?.char;
    if (otherChar && (otherChar === this || !otherChar.alive)) return;

    // GRAB
    if ((part === "armL" || part === "armR") && this.input.grab && !this.holds[part]) {
      const arm = this[part];
      const hand = arm.pointToWorldFrame(HAND, new CANNON.Vec3());
      if (hand.distanceTo(point) < 0.4) this.attachHold(part, other, otherChar ?? null);
    }

    if (!otherChar) return;
    const f = this.fwd(v1);

    // PUNCH
    if (this.punchTimer > 0.06 && PUNCH_T - this.punchTimer > PUNCH_WIND - 0.01 && part === this.punchArm && !this.hitSet.has(otherChar)) {
      this.hitSet.add(otherChar);
      const running = this.input.run && Math.hypot(this.torso.velocity.x, this.torso.velocity.z) > 4.5;
      const headshot = otherInfo!.part === "head";
      const dmg = (running ? 22 : 17) * (headshot ? 1.3 : 1);
      otherChar.receiveHit(this, dmg, f, running ? 6.5 : 4.8, other);
      otherChar.squashV -= 4;
      this.hooks.onHit(this, otherChar, point, dmg, "punch");
    }
    // HEADBUTT
    if (this.headbuttTimer > 0.08 && (part === "head" || part === "torso") && !this.hitSet.has(otherChar)) {
      this.hitSet.add(otherChar);
      otherChar.receiveHit(this, 30, f, 9, other);
      this.hooks.onHit(this, otherChar, point, 30, "headbutt");
    }
    // DROPKICK
    if (this.dropkickTimer > 0 && part !== "armL" && part !== "armR" && !this.hitSet.has(otherChar)) {
      this.hitSet.add(otherChar);
      otherChar.receiveHit(this, 40, f, 14, other);
      for (const b of this.parts) {
        b.velocity.x *= -0.25;
        b.velocity.z *= -0.25;
      }
      this.hooks.onHit(this, otherChar, point, 40, "dropkick");
    }
  }

  receiveHit(attacker: Character, dmg: number, dir: CANNON.Vec3, force: number, body: CANNON.Body) {
    if (this.accKind === "helmet" && body === this.head) {
      dmg *= 0.7;
      force *= 0.85;
    }
    this.hurtT = Math.max(this.hurtT, 0.55 + dmg / 70);
    this.lastHitBy = attacker;
    this.lastHitAt = attacker.time;
    this.lastHitTime = this.time;
    const imp = new CANNON.Vec3(dir.x * force, force * 0.3, dir.z * force);
    body.applyImpulse(imp.scale(body.mass * 0.35));
    const kb = force > 7 ? 0.32 : 0.16;
    this.torso.velocity.x += dir.x * force * kb;
    this.torso.velocity.z += dir.z * force * kb;
    this.torso.velocity.y += force * 0.1;
    if (this.ko) {
      this.koTimer = Math.min(this.koTimer + 0.3, 5);
      return;
    }
    this.dizzy += dmg;
    this.stagger = Math.max(this.stagger, 0.3 + dmg / 90);
    if (this.dizzy >= 100) this.knockOut(4.2);
  }

  knockOut(time: number) {
    this.koTimer = time;
    this.dizzy = 0;
    this.kos++;
    if (Math.random() < 0.5) this.knockAccessory(new CANNON.Vec3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    this.releaseAll(false);
    this.throwWeapon(false);
    this.stars.visible = true;
    sfx.ko();
    this.hooks.onKO(this);
  }

  /** Shared two-handed pose: shoulder rest -> wind-up -> horizontal swing -> follow-through. */
  private updateBatPose(h: number) {
    if (!this.weapon) return;
    let th = this.weapon.kind === "pan" ? 2.1 : 2.45,
      el = this.weapon.kind === "pan" ? 0.5 : 0.68,
      fw = 0;
    let exact = false;
    if (this.swingTimer > 0) {
      const e = 0.5 - this.swingTimer;
      if (e < 0.14) {
        th = 2.75;
        el = 0.6;
      } else if (e < 0.28) {
        const u0 = (e - 0.14) / 0.14;
        const u = u0 * u0 * (3 - 2 * u0);
        th = 2.75 - 4.55 * u;
        el = 0.1 + 0.5 * (2 * u - 1) * (2 * u - 1);
        fw = Math.sin(u * Math.PI) * 0.1;
        exact = true;
      } else {
        const v = Math.min(1, (e - 0.28) / 0.22);
        th = -1.8 - 0.35 * v;
        el = 0.6 + 0.35 * v;
      }
    }
    if (exact) {
      this.batTh = th;
      this.batEl = el;
    } else {
      const k = 1 - Math.exp(-h * 20);
      this.batTh += (th - this.batTh) * k;
      this.batEl += (el - this.batEl) * k;
    }
    const t = this.torso;
    const ce = Math.cos(this.batEl);
    v3.set(-Math.sin(this.batTh) * ce, Math.sin(this.batEl), Math.cos(this.batTh) * ce);
    t.quaternion.vmult(v3, this.batDir);
    v3.set(this.swingTimer > 0 ? -0.04 : -0.1, rig.SHOULDER_L[1] * 0.4, 0.28 + fw);
    rig.pushOut(v3, this.pawR + 0.02, this.vols.torso);
    t.pointToWorldFrame(v3, this.batGrip);
    const g = this.batGrip, d = this.batDir;
    const start = this.weapon.kind === "pan" ? this.weapon.impactOffset - 0.2 : 0.3;
    this.batA.set(g.x + d.x * start, g.y + d.y * start, g.z + d.z * start);
    this.batTipPrev.copy(this.batB);
    this.batB.set(g.x + d.x * (this.weapon.reach - 0.05), g.y + d.y * (this.weapon.reach - 0.05), g.z + d.z * (this.weapon.reach - 0.05));
    this.batTipVel.set((this.batB.x - this.batTipPrev.x) / h, (this.batB.y - this.batTipPrev.y) / h, (this.batB.z - this.batTipPrev.z) / h);
  }

  /** Weapon hit test: bat segment or broad pan face; direction follows tip velocity. */
  private batHits() {
    if (!this.weapon || this.swingTimer <= 0) return;
    const e = 0.5 - this.swingTimer;
    if (e < 0.15 || e > 0.3) return;
    const a = this.batA, b = this.batB;
    const pan = this.weapon.kind === "pan";
    panHitCenter.set(
      this.batGrip.x + this.batDir.x * this.weapon.impactOffset,
      this.batGrip.y + this.batDir.y * this.weapon.impactOffset,
      this.batGrip.z + this.batDir.z * this.weapon.impactOffset
    );
    const segDist = (p: CANNON.Vec3) => {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const tt = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
      return Math.hypot(a.x + abx * tt - p.x, a.y + aby * tt - p.y, a.z + abz * tt - p.z);
    };
    const headDist = (p: CANNON.Vec3) => pan ? panHitCenter.distanceTo(p) : segDist(p);
    const tv = this.batTipVel;
    const tipSpeed = Math.hypot(tv.x, tv.z);
    for (const c of Character.all) {
      if (c === this || !c.alive || c.removed || this.hitSet.has(c)) continue;
      for (const [body, r] of [
        [c.head, 0.4],
        [c.torso, 0.44],
      ] as const) {
        if (headDist(body.position) > r + (pan ? 0.47 : 0.12)) continue;
        this.hitSet.add(c);
        let kx = tv.x, kz = tv.z;
        if (tipSpeed < 2) {
          kx = c.torso.position.x - this.torso.position.x;
          kz = c.torso.position.z - this.torso.position.z;
        }
        const l = Math.hypot(kx, kz) || 1;
        const kd = new CANNON.Vec3(kx / l, 0, kz / l);
        if (pan) {
          // The broad teflon face stuns with a bright "pang" rather than launching cats.
          const power = clamp(tipSpeed / 12, 0.85, 1.1);
          c.receiveHit(this, 26, kd, 2.4 * power, body);
          c.knockAccessory(kd);
          for (const pb of c.parts) {
            pb.velocity.x += kd.x * 1.7 * power;
            pb.velocity.z += kd.z * 1.7 * power;
            pb.velocity.y += 1.4;
          }
          c.torso.angularVelocity.set(kd.z * 4.5, (Math.random() - 0.5) * 2.5, -kd.x * 4.5);
          c.squashV -= 5;
          this.hooks.onHit(this, c, body.position.clone(), 26, "pan");
          break;
        }
        // bats hurt a lot but barely shove: a solid "thunk" with only a small step back
        const power = clamp(tipSpeed / 12, 0.8, 1.05);
        c.receiveHit(this, 34, kd, 2.9 * power, body);
        c.knockAccessory(kd);
        for (const pb of c.parts) {
          pb.velocity.x += kd.x * 2.15 * power;
          pb.velocity.z += kd.z * 2.15 * power;
          pb.velocity.y += 1.6;
        }
        c.torso.angularVelocity.set(kd.z * 4.2, (Math.random() - 0.5) * 3, -kd.x * 4.2);
        c.squashV -= 6;
        this.hooks.onHit(this, c, body.position.clone(), 38, "bat");
        break;
      }
    }
    for (const pb of this.world.bodies) {
      if (pb.type !== CANNON.Body.DYNAMIC || bodyOwner.has(pb) || pb.mass > 6) continue;
      if (Character.bats.some((bt) => bt.body === pb)) continue;
      const tag = pb as unknown as { _batHitAt?: number };
      if (headDist(pb.position) > (pan ? 0.8 : 0.6) || tag._batHitAt === this.time) continue;
      tag._batHitAt = this.time;
      const l = tipSpeed || 1;
      const propSpeed = pan ? 4.6 : 4.2;
      pb.velocity.set((tv.x / l) * propSpeed, pan ? 2.2 : 2.6, (tv.z / l) * propSpeed);
      Character.thrownProps.push({ body: pb, by: this, t: 1.2 });
    }
  }

  /** being carried overhead: kick & wave cutely instead of T-posing */
  private flail() {
    const t = this.torso;
    const up = t.quaternion.vmult(Y, v1).clone();
    const fw = t.quaternion.vmult(Z, v2).clone();
    const lf = up.cross(fw);
    const T = this.time;
    for (const arm of ["armL", "armR"] as const) {
      const s = arm === "armL" ? 1 : -1;
      const sh = t.pointToWorldFrame(arm === "armL" ? SHOULDER_L : SHOULDER_R, new CANNON.Vec3());
      const w = Math.sin(T * 17 + s * 1.3);
      const tx = sh.x + up.x * (0.2 + 0.12 * w) + lf.x * s * 0.3 + fw.x * 0.1 * w;
      const ty = sh.y + up.y * (0.2 + 0.12 * w) + lf.y * s * 0.3 + fw.y * 0.1 * w;
      const tz = sh.z + up.z * (0.2 + 0.12 * w) + lf.z * s * 0.3 + fw.z * 0.1 * w;
      this.driveLimb(this[arm], HAND, tx, ty, tz, 260, 16, 0.3);
    }
    for (const [leg, hip, off] of [
      [this.legL, HIP_L, 0],
      [this.legR, HIP_R, Math.PI],
    ] as const) {
      const hp = t.pointToWorldFrame(hip, new CANNON.Vec3());
      const k = Math.sin(T * 15 + off);
      const tx = hp.x - up.x * 0.32 + fw.x * 0.18 * k;
      const ty = hp.y - up.y * 0.32 + fw.y * 0.18 * k;
      const tz = hp.z - up.z * 0.32 + fw.z * 0.18 * k;
      this.driveLimb(leg, FOOT, tx, ty, tz, 260, 16, 0.3);
    }
  }

  /** Per sub-step hold maintenance (break / lift assist). */
  updateHolds(h: number) {
    this.updateBatPose(h);
    // self-collision is expensive: half-rate looks identical and saves CPU
    // full-rate for KO ragdolls (limp paws look bad), half-rate otherwise
    if (this.ko || (this.subTick++ & 1) === 0) this.selfCollide();
    this.batHits();
    if (this.lifting) this.liftT = Math.min(1.5, this.liftT + h / 0.38);
    const seen = new Set<unknown>();
    for (const arm of ["armL", "armR"] as const) {
      const hd = this.holds[arm];
      if (!hd) continue;
      hd.t += h;
      const a = this[arm].pointToWorldFrame(hd.pivotA, v1);
      const b = hd.body.pointToWorldFrame(hd.pivotB, v2);
      const dist = a.distanceTo(b);
      let limit = 7;
      if (hd.owner) limit = hd.owner.ko ? 8 : 2.8;
      if ((!hd.carry && dist > 0.8) || hd.t > limit || (hd.owner && hd.owner.removed) || !this.world.bodies.includes(hd.body)) {
        this.world.removeConstraint(hd.c);
        this.holds[arm] = null;
        continue;
      }
      // lift assist
      if (this.lifting && hd.body.type === CANNON.Body.DYNAMIC) {
        const key = hd.owner ?? hd.body;
        if (seen.has(key)) continue;
        seen.add(key);
        const target = hd.owner ? hd.owner.torso : hd.body;
        const m = hd.owner ? hd.owner.totalMass : Math.min(hd.body.mass, 6);
        const f = this.fwd(v3);
        const u0 = Math.min(1, this.liftT);
        const u = 1 - (1 - u0) * (1 - u0) * (1 - u0); // ease-out lift
        const hy = -0.35 + 0.88 * Math.min(1, u * 1.35); // rise first...
        const back = Math.max(0, (u0 - 0.35) / 0.65);
        const fo = 0.55 * (1 - back * back * (3 - 2 * back)) + 0.06; // ...then swing back over the head
        const tx = this.head.position.x + f.x * fo;
        const ty = this.head.position.y + this.headTop * 0.5 + hy;
        const tz = this.head.position.z + f.z * fo;
        if (hd.owner) this.alignCarried(hd.owner, f);
        const lim = m * 70;
        const fx = clamp(m * ((tx - target.position.x) * 40 - (target.velocity.x - this.torso.velocity.x) * 8), -lim, lim);
        const fy = clamp(m * ((ty - target.position.y) * 40 - (target.velocity.y - this.torso.velocity.y) * 8 + GRAVITY), -lim, lim);
        const fz = clamp(m * ((tz - target.position.z) * 40 - (target.velocity.z - this.torso.velocity.z) * 8), -lim, lim);
        target.force.x += fx;
        target.force.y += fy;
        target.force.z += fz;
        this.torso.force.x -= fx;
        this.torso.force.y -= fy;
        this.torso.force.z -= fz;
      }
    }
  }

  /** rotate the carried cat so it lies across our shoulders, belly up (like an overhead wrestling carry) */
  private alignCarried(o: Character, f: CANNON.Vec3) {
    // desired basis: body axis (+Y) along our left/right, belly (+Z) facing the sky
    const yA = new THREE.Vector3(f.z, 0, -f.x).normalize();
    const zA = new THREE.Vector3(0, 1, 0);
    const xA = new THREE.Vector3().crossVectors(yA, zA);
    _m4.makeBasis(xA, yA, zA);
    _tq.setFromRotationMatrix(_m4);
    const dq = new CANNON.Quaternion(_tq.x, _tq.y, _tq.z, _tq.w);
    const qe = dq.mult(o.torso.quaternion.conjugate(_hq), _hq2);
    if (qe.w < 0) {
      qe.x = -qe.x;
      qe.y = -qe.y;
      qe.z = -qe.z;
      qe.w = -qe.w;
    }
    const sh = Math.hypot(qe.x, qe.y, qe.z);
    const k = sh > 1e-6 ? ((2 * Math.atan2(sh, qe.w)) / sh) * 10 : 0;
    const av = o.torso.angularVelocity;
    const b = 0.25;
    av.x += (qe.x * k + this.torso.angularVelocity.x - av.x) * b;
    av.y += (qe.y * k + this.torso.angularVelocity.y - av.y) * b;
    av.z += (qe.z * k + this.torso.angularVelocity.z - av.z) * b;
  }

  syncVisual() {
    const map: [CANNON.Body, THREE.Object3D][] = [
      [this.torso, this.visual.torso],
      [this.head, this.visual.head],
      [this.armL, this.visual.armL],
      [this.armR, this.visual.armR],
      [this.legL, this.visual.legL],
      [this.legR, this.visual.legR],
    ];
    for (const [b, o] of map) {
      o.position.set(b.position.x, b.position.y, b.position.z);
      o.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    // pin every limb exactly onto its socket (physics joints can stretch a little under big forces)
    {
      const sqv = this.ko ? 0 : this.squash;
      const sxz = 1 - sqv * 0.55, sy = 1 + sqv;
      for (const [o, piv] of [
        [this.visual.armL, SHOULDER_L],
        [this.visual.armR, SHOULDER_R],
        [this.visual.legL, HIP_L],
        [this.visual.legR, HIP_R],
      ] as const) {
        _v3.set(piv.x * sxz, piv.y * sy, piv.z * sxz);
        const sock = this.torso.pointToWorldFrame(new CANNON.Vec3(_v3.x, _v3.y, _v3.z), v1);
        _v3b.set(LIMB_TOP.x, LIMB_TOP.y, LIMB_TOP.z).applyQuaternion(o.quaternion);
        o.position.set(sock.x - _v3b.x, sock.y - _v3b.y, sock.z - _v3b.z);
      }
    }
    // head always sits on the neck (+ blended toward the torso orientation so it never looks broken)
    {
      const vh = this.visual.head;
      const gq = this.ko || this.removed ? this.torso.quaternion : this.headGoal;
      _tq.set(gq.x, gq.y, gq.z, gq.w);
      vh.quaternion.slerp(_tq, this.ko ? 0.15 : 0.4);
      const neck = this.torso.pointToWorldFrame(vec(rig.NECK_A), v1);
      _v3.set(rig.NECK_B[0], rig.NECK_B[1], rig.NECK_B[2]).applyQuaternion(vh.quaternion);
      vh.position.set(neck.x - _v3.x, neck.y - _v3.y, neck.z - _v3.z);
    }
    // Paman Dolit googly eyes: pupils slosh around with gravity + head motion
    if (this.visual.googly.length) {
      const hv = this.head.velocity;
      const ax = (hv.x - this.prevHeadV.x) * 60, ay = (hv.y - this.prevHeadV.y) * 60, az = (hv.z - this.prevHeadV.z) * 60;
      this.prevHeadV.copy(hv);
      for (const gg of this.visual.googly) {
        gg.grp.getWorldQuaternion(_iq);
        _iq.invert();
        // effective gravity in the lens plane = g - head acceleration
        _v3.set(-ax * 0.05, -9.8 - ay * 0.05, -az * 0.05).applyQuaternion(_iq);
        const k = 1 / 60;
        gg.vx += (_v3.x * gg.max * 2.2 - gg.vx * 4) * k;
        gg.vy += (_v3.y * gg.max * 2.2 - gg.vy * 4) * k;
        gg.x += gg.vx * k * 6;
        gg.y += gg.vy * k * 6;
        const l = Math.hypot(gg.x, gg.y);
        if (l > gg.max) {
          gg.x *= gg.max / l;
          gg.y *= gg.max / l;
          // bounce off the rim
          const nx = gg.x / gg.max, ny = gg.y / gg.max;
          const vn = gg.vx * nx + gg.vy * ny;
          if (vn > 0) {
            gg.vx -= 1.6 * vn * nx;
            gg.vy -= 1.6 * vn * ny;
          }
        }
        gg.pupil.position.x = gg.x;
        gg.pupil.position.y = gg.y;
      }
    }
    // pupils glance at the watched cat (or wander idly)
    if (this.expr === "normal" && this.visual.pupils.length) {
      const vh = this.visual.head;
      let ax: number, ay: number;
      if (this.hasLook) {
        _v3.set(this.lookPoint.x - vh.position.x, this.lookPoint.y - vh.position.y, this.lookPoint.z - vh.position.z);
        _iq.copy(vh.quaternion).invert();
        _v3.applyQuaternion(_iq);
        ax = Math.atan2(_v3.x, Math.max(0.05, _v3.z));
        ay = Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z));
      } else {
        ax = Math.sin(this.time * 0.55 + this.index) * 0.35 + (Math.sin(this.time * 2.3 + this.index * 3) > 0.96 ? 0.4 : 0);
        ay = Math.sin(this.time * 0.37 + this.index) * 0.15;
      }
      const gx = clamp(ax / 0.32, -1, 1), gy = clamp(ay / 0.3, -1, 1);
      this.pupX += (gx - this.pupX) * 0.25;
      this.pupY += (gy - this.pupY) * 0.25;
      for (const p of this.visual.pupils) {
        const dx = this.pupX * p.mx, dy = this.pupY * p.my;
        p.g.position.set(p.T.x * dx + p.U.x * dy, p.T.y * dx + p.U.y * dy, p.T.z * dx + p.U.z * dy);
      }
    }
    // squash & stretch (torso scales, head rides on top of it)
    const sq = this.ko ? 0 : this.squash;
    const vt = this.visual.torso;
    vt.scale.set(1 - sq * 0.55, 1 + sq, 1 - sq * 0.55);
    if (Math.abs(sq) > 0.001) {
      const up = this.torso.quaternion.vmult(Y, v1);
      const k = sq * rig.NECK_A[1];
      this.visual.head.position.x += up.x * k;
      this.visual.head.position.y += up.y * k;
      this.visual.head.position.z += up.z * k;
    }
    // Held weapon follows the two-hand grip; a pan also turns its face toward the target.
    if (this.weapon) {
      const g = this.batGrip, d = this.batDir;
      const m = this.weapon.mesh;
      m.position.set(g.x + d.x * this.weapon.centerOffset, g.y + d.y * this.weapon.centerOffset, g.z + d.z * this.weapon.centerOffset);
      _weaponDir.set(d.x, d.y, d.z).normalize();
      m.quaternion.setFromUnitVectors(_Y3, _weaponDir);
      if (this.weapon.kind === "pan") {
        // A pan has a visible face. Keep it pointed toward the opponent during a swing.
        const f = this.fwd(v1);
        _weaponFace.set(f.x, 0, f.z).addScaledVector(_weaponDir, -(f.x * _weaponDir.x + f.z * _weaponDir.z));
        if (_weaponFace.lengthSq() > 0.01) {
          _weaponFace.normalize();
          _weaponNormal.set(0, 0, 1).applyQuaternion(m.quaternion);
          _weaponCross.crossVectors(_weaponNormal, _weaponFace);
          const roll = Math.atan2(_weaponDir.dot(_weaponCross), _weaponNormal.dot(_weaponFace));
          _weaponRoll.setFromAxisAngle(_weaponDir, roll);
          m.quaternion.premultiply(_weaponRoll);
        }
      }
    }
    const hp = this.head.position;
    this.nameTag.position.set(hp.x, hp.y + this.headTop + 0.23 + (this.accKind === "helmet" ? 0.1 : this.accKind.startsWith("cap") ? 0.07 : 0), hp.z);
    this.nameTag.visible = this.alive;
    if (this.stars.visible) {
      this.stars.position.set(hp.x, hp.y + this.headTop, hp.z);
      this.stars.children.forEach((s, i) => {
        const a = this.time * 5 + (i * Math.PI * 2) / 4;
        s.position.set(Math.cos(a) * 0.4, Math.sin(this.time * 8 + i) * 0.05, Math.sin(a) * 0.4);
        s.rotation.y = this.time * 6;
      });
    }
  }

  removeFromWorld() {
    if (this.removed) return;
    this.releaseAll(false);
    this.throwWeapon(false);
    for (const j of this.joints) this.world.removeConstraint(j);
    for (const b of this.parts) this.world.removeBody(b);
    this.removed = true;
    this.root.visible = false;
  }
}

function makeNameTag(text: string, human: boolean, slot: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, 128, 34);
  g.fillStyle = human ? (slot === 1 ? "#ffd23f" : "#6ee7ff") : "#ffffff";
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 10;
  return sp;
}
