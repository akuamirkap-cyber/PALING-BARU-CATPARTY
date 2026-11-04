import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { AccessoryId, AnimalDef } from "./animals";
import type { EyeStyleId, ExpressionId } from "./eyes";
import { animateBlink, buildCharacterVisual, setPupilGaze, type CharacterVisual } from "./characterMesh";
import type { ControlState } from "./input";
import { sfx } from "./audio";
import * as rig from "./rig";
import { getRigTuning, getShapeMode } from "./tuning";
import { ARM_BOW_TWIST, bowTarget, stabilizeArmRotation } from "./armMotion";
import { PUNCH_DURATION, PUNCH_WINDUP, punchPose } from "./punchMotion";
import { POUNCE_DURATION, pouncePose } from "./pounceMotion";
import { SWING_DURATION, SWING_STRIKE_END, SWING_WINDUP, segmentDistanceSquared, sweptSegmentDistanceSquared, weaponSwingPose } from "./weaponMotion";
import { drawFlag } from "./flags";

export const GRAVITY = 22;
const WALK_SPEED = 4.0;
const RUN_SPEED = 6.6;
/** how long a press is remembered before the character can act on it */
const JUMP_BUFFER = 0.16;
const PUNCH_BUFFER = 0.16;
/** grace period after leaving the ground where a jump still counts */
const COYOTE = 0.11;

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

export type HitKind = "punch" | "headbutt" | "dropkick" | "bat" | "pan" | "throw";
export interface CharacterHooks {
  onHit(attacker: Character, victim: Character, point: CANNON.Vec3, dmg: number, kind: HitKind): void;
  onKO(victim: Character): void;
  onLand(c: Character, strength: number): void;
  onStep(c: Character): void;
}

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
const panHitCenter = new CANNON.Vec3();
const _attackPoint = new CANNON.Vec3();
const _attackCenter = new CANNON.Vec3();
const _meleeDir = new CANNON.Vec3();
const _meleeOffset = new CANNON.Vec3();
const _meleeRay = new CANNON.RaycastResult();
const _impactVelocity = new CANNON.Vec3();
const _weaponContact = new CANNON.Vec3();
const _ledgeLocal = new CANNON.Vec3();
const _ledgePoint = new CANNON.Vec3();
const _ledgeWorld = new CANNON.Vec3();
const _ledgeRotation = new CANNON.Quaternion();

const vec = (a: rig.V3) => new CANNON.Vec3(a[0], a[1], a[2]);
let HOVER = rig.HOVER;
let SHOULDER_L = vec(rig.SHOULDER_L);
let SHOULDER_R = vec(rig.SHOULDER_R);
let HIP_L = vec(rig.HIP_L);
let HIP_R = vec(rig.HIP_R);
/** re-read the skeleton (body height / shoulder width follow the shape tuning) */
function refreshRig() {
  rig.applyRig(getRigTuning());
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
const rayFrom = new CANNON.Vec3();
const rayTo = new CANNON.Vec3();
const rayRes = new CANNON.RaycastResult();

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const PUNCH_T = PUNCH_DURATION;
const PUNCH_WIND = PUNCH_WINDUP;
const PUNCH_STRIKE0 = PUNCH_T - PUNCH_WIND; // timer value where the strike starts
const _hq = new CANNON.Quaternion();
const _bowL = new CANNON.Vec3();
const _bowR = new CANNON.Vec3();
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
const _fallWeaponAxis = new CANNON.Vec3(0, -1, 0);
const _fallGrip = new THREE.Vector3();
const _fallDir = new THREE.Vector3();
const _weaponFace = new THREE.Vector3();
const _weaponNormal = new THREE.Vector3();
const _weaponCross = new THREE.Vector3();
const _weaponRoll = new THREE.Quaternion();
const _acY = new THREE.Vector3();
const _acZ = new THREE.Vector3();
const _acX = new THREE.Vector3();
const _acQ = new CANNON.Quaternion();
const _flUp = new CANNON.Vec3();
const _flFw = new CANNON.Vec3();
const _flLf = new CANNON.Vec3();
const _flSh = new CANNON.Vec3();
const _sock = new CANNON.Vec3();
const _neckA = new CANNON.Vec3();
const _armDir = new THREE.Vector3();
const _armGoal = new THREE.Vector3();
const _armCorrection = new THREE.Quaternion();
const _armIdentity = new THREE.Quaternion();
const _palmOrientation = new THREE.Quaternion();
const _palmAxis = new THREE.Vector3(0, 1, 0);
const _hangGoal = new THREE.Quaternion();
const _hangEuler = new THREE.Euler();
const _hangTorso = new THREE.Quaternion();
const _hangDown = new THREE.Vector3(0, -1, 0);
const _kd = new CANNON.Vec3();
const SYNC_BODIES = ["torso", "head", "armL", "armR", "legL", "legR"] as const;
const LIMB_SOCKETS = ["armL", "armR", "legL", "legR"] as const;

interface WeaponContest {
  owner: Character;
  challenger: Character;
  weapon: Bat;
  ownerPresses: number;
  challengerPresses: number;
  ownerLast: number;
  challengerLast: number;
  elapsed: number;
}

export class Character {
  static all: Character[] = [];

  index: number;
  bit: number;
  def: AnimalDef;
  name: string;
  isHuman: boolean;
  humanSlot: 0 | 1 | 2;
  /** 0 = red team, 1 = blue team, -1 = free-for-all (no teams) */
  team = -1;
  /** lives left INCLUDING the current one (teams mode); -1 = no lives system */
  lives = -1;
  /** countdown while waiting to respawn (teams mode); <= 0 = not waiting */
  respawnT = 0;
  /** country code shown on the name tag */
  flag = "id";
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
  teamRing: THREE.Mesh | null = null;
  /** assembled layout of every part around the torso at spawn time */
  restPose: { body: CANNON.Body; local: CANNON.Vec3; localQ: CANNON.Quaternion }[] = [];
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
  knockdownTimer = 0;
  recoveryT = 0;
  stagger = 0;
  noHover = 0;
  jumpCd = 0;
  /**
   * Input buffering: a press is remembered for a moment, so a button hit a few
   * frames before the character can act still counts. Without this, tapping
   * jump just before landing or punch just before a swing ends was silently
   * dropped, which is what made the controls feel heavy.
   */
  jumpBuf = 0;
  punchBuf = 0;
  /** coyote time: still allowed to jump for a moment after leaving the ground */
  coyote = 0;
  punchTimer = 0;
  punchCd = 0;
  punchArm: "armL" | "armR" = "armL";
  headbuttTimer = 0;
  dropkickTimer = 0;
  attackCd = 0;
  lastHitTime = -99;
  lastHitBy: Character | null = null;
  lastHitAt = -99;
  lastHitKind = "";
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
  // bat pose (two-handed, procedural)
  batTh = 2.25;
  batEl = 1.0;
  batGrip = new CANNON.Vec3();
  batDir = new CANNON.Vec3(0, 1, 0);
  batA = new CANNON.Vec3();
  batB = new CANNON.Vec3();
  batTipPrev = new CANNON.Vec3();
  batAPrev = new CANNON.Vec3();
  panCenterPrev = new CANNON.Vec3();
  private swingPropsHit = new Set<CANNON.Body>();
  private previousPunchHand = new CANNON.Vec3();
  private punchHand = new CANNON.Vec3();
  private dashDirection = new CANNON.Vec3(0, 0, 1);
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
  // arm-local collision probes: y along the arm, r the radius, x the baked
  // outward bow of the sculpted arm (mirrored per side).
  armPts: { y: number; r: number; x: number }[] = [];
  pawR = 0.09;
  // accessories
  accKind: AccessoryId = "none";
  static loose: { body: CANNON.Body; mesh: THREE.Object3D }[] = [];
  private prevHeadV = new CANNON.Vec3();
  weapon: Bat | null = null;
  swingTimer = 0;
  private nextBatOverhead = false;
  swingOverhead = false;
  weaponContest: WeaponContest | null = null;
  contestCooldown = 0;
  contestBotDelay = 0;
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
    accessory: AccessoryId = "none",
    eyeStyle: EyeStyleId = "default",
    expression: ExpressionId = "default",
    team: number = -1,
    flag = "id"
  ) {
    this.world = world;
    this.index = index;
    this.bit = 1 << (index + 2);
    this.def = def;
    this.name = name;
    this.humanSlot = humanSlot;
    this.isHuman = humanSlot > 0;
    this.team = team;
    this.flag = flag;
    this.hooks = hooks;
    this.facing = yaw;
    this.input = input;

    refreshRig();
    {
      const tu = getRigTuning();
      this.vols = rig.selfVolumes(tu);
      const AYf = (y: number) => rig.LIMB_TOP[1] + (y - rig.LIMB_TOP[1]) * tu.armLen;
      this.pawR = 0.112 * tu.armTip * 0.92;
      // paw, forearm and (thinner) upper part of the arm, in arm-local space
      // only points that can always be resolved (the shoulder ball itself is meant to sit inside the body)
      // The asset-shaped arm hangs right beside the belly, exactly like the
      // menu pose, and that pose accepts a couple of centimetres of overlap.
      // Demanding a full paw radius pushes the hanging arm out to ~17 degrees,
      // which reads as a stiff, bow-legged stance in game.
      const snug = getShapeMode() === "asset" ? 0.55 : 1;
      this.armPts = [
        { y: AYf(-0.205), r: this.pawR * snug, x: 0 },
        { y: AYf(-0.11), r: 0.075 * tu.armRoot * 0.7 * snug, x: 0 },
        // the elbow sits on the baked outward bow of the asset arm
        { y: AYf(-0.07), r: 0.072 * tu.armRoot * 0.7 * snug, x: 0.19 },
      ];
    }
    this.buildBodies(spawn, yaw);
    // Remember the assembled standing layout so respawnAt can restore it
    // (teleporting the fallen pose with reset orientations interpenetrates
    // the parts and the contact solver launches the cat like a firework).
    {
      const tq = this.torso.quaternion;
      const tqInv = tq.inverse(new CANNON.Quaternion());
      this.restPose = this.parts.map((b) => {
        const local = this.torso.pointToLocalFrame(b.position, new CANNON.Vec3());
        const localQ = tqInv.mult(b.quaternion, new CANNON.Quaternion());
        return { body: b, local, localQ };
      });
    }
    this.visual = buildCharacterVisual(def, accessory, eyeStyle, expression);
    this.accKind = this.visual.accessoryKind;
    this.root.add(...this.visual.all);

    this.nameTag = makeNameTag(this.isHuman ? (humanSlot === 1 ? "KAMU" : "P2") : name, this.isHuman, humanSlot, team, flag);
    this.root.add(this.nameTag);

    // team ring painted on the deck under the cat (team matches only)
    this.teamRing = makeTeamRing(this.team);
    if (this.teamRing) this.root.add(this.teamRing);

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
      angularDamping: part === "torso" ? 0.4 : part === "armL" || part === "armR" ? 0.55 : 0.25,
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
      const tu = getRigTuning();
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
    const tun = getRigTuning();
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
  get down() {
    return this.ko || this.knockdownTimer > 0;
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
    if (!this.alive) return; // eliminated cats take no input at all (also while parked waiting to respawn)
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
    if (this.throwAnim > 0) this.throwAnim -= dt;
    if (this.thrownT > 0) this.thrownT -= dt;
    this.hurtT -= dt;
    this.updateExpr();
    this.jumpCd -= dt;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.punchBuf = Math.max(0, this.punchBuf - dt);
    if (inp.jump) this.jumpBuf = JUMP_BUFFER;
    if (inp.punch) this.punchBuf = PUNCH_BUFFER;
    this.punchCd -= dt;
    this.attackCd -= dt;
    this.contestCooldown = Math.max(0, this.contestCooldown - dt);
    if (this.knockdownTimer > 0) {
      this.knockdownTimer = Math.max(0, this.knockdownTimer - dt);
      if (this.knockdownTimer === 0 && !this.ko) {
        this.stagger = Math.max(this.stagger, 0.4);
        this.recoveryT = 0.55;
      }
    }

    if (this.koTimer > 0) {
      this.koTimer -= dt;
      if (this.koTimer <= 0) {
        this.koTimer = 0;
        this.stagger = 0.5;
        this.recoveryT = 0.55;
        this.stars.visible = false;
      }
    }
    if (this.time - this.lastHitTime > 1.4) this.dizzy = Math.max(0, this.dizzy - 14 * dt);

    const canAct = !this.down && this.alive;

    // facing from move input
    const mlen = Math.hypot(inp.mx, inp.mz);
    if (canAct && mlen > 0.15 && this.dropkickTimer <= 0) {
      const target = Math.atan2(inp.mx, inp.mz);
      const turnRate = this.grounded ? 17 : 7;
      const d = wrapAngle(target - this.facing);
      this.facing = wrapAngle(this.facing + d * Math.min(1, dt * turnRate));
    }

    if (!canAct) {
      this.releaseAll(false);
      return;
    }

    if (this.weaponContest) {
      this.updateWeaponContest(dt, inp.lift);
      return;
    }

    // struggle out of grabs
    if (this.heldBy > 0 && (inp.punch || inp.jump || inp.headbutt)) {
      for (const c of Character.all) {
        for (const h of [c.holds.armL, c.holds.armR]) if (h && h.owner === this) h.t += 0.32;
      }
    }

    // JUMP / CLIMB
    const wantsJump = inp.jump || this.jumpBuf > 0;
    if (wantsJump && this.jumpCd <= 0) {
      this.jumpBuf = 0;
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
      } else if ((this.grounded || this.coyote > 0) && this.heldBy === 0) {
        this.coyote = 0;
        const gv = this.groundBody ? this.groundBody.velocity.y : 0;
        for (const b of this.parts) b.velocity.y = Math.max(b.velocity.y, gv) + 8.2;
        this.noHover = 0.25;
        this.jumpCd = 0.4;
        this.squashV += 5.5;
        sfx.jump();
      }
    }

    // LIFT / THROW (one easy button). Grabbing the nearest cat always wins,
    // so picking someone up never gets hijacked by a bat contest; only when
    // there is nobody to grab does facing an armed opponent start a struggle.
    if (inp.lift) {
      if (this.weapon) this.throwWeapon();
      else if (this.holding) this.releaseAll(true);
      else this.tryLift();
    } else if (inp.grabPress && !this.weapon && this.heldBy === 0 && !this.hangingStatic) {
      // K: one press grabs the nearest cat and hoists it overhead, the next
      // press throws. The lift is sticky (stickyLift), so releasing K keeps
      // holding instead of dropping the catch.
      if (this.holding) this.releaseAll(true);
      else this.tryLift();
    }

    // PUNCH (or lift / throw when holding, swing when holding a bat)
    const wantsPunch = inp.punch || this.punchBuf > 0;
    if (wantsPunch && this.weapon && this.punchCd <= 0 && this.swingTimer <= 0 && this.headbuttTimer <= 0 && this.dropkickTimer <= 0) {
      this.punchBuf = 0;
      if (this.weapon.kind === "bat") this.aimMeleeAtNearest(2.3);
      this.swingTimer = SWING_DURATION;
      this.swingOverhead = this.weapon.kind === "bat" && this.nextBatOverhead;
      if (this.weapon.kind === "bat") this.nextBatOverhead = !this.nextBatOverhead;
      // Swing length is the limiter; a longer cooldown only created dead
      // button time where a queued press was ignored.
      this.punchCd = this.weapon.kind === "pan" ? 0.66 : 0.64;
      this.hitSet.clear();
      this.swingPropsHit.clear();
      sfx.whoosh();
    } else if (wantsPunch && !this.weapon) {
      if (this.holding) {
        // Carry/throw must stay on the live press: a buffered tap from before
        // the cat was picked up should not fling it right away.
        if (!inp.punch) {
          // buffered press while carrying: ignore
        } else if (!this.lifting) {
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
      } else if (this.punchCd <= 0 && this.dropkickTimer <= 0 && this.headbuttTimer <= 0) {
        this.punchBuf = 0;
        this.aimMeleeAtNearest(1.65);
        this.punchArm = this.punchArm === "armL" ? "armR" : "armL";
        this.punchTimer = PUNCH_T;
        this[this.punchArm].pointToWorldFrame(HAND, this.previousPunchHand);
        this.punchCd = PUNCH_DURATION;
        this.hitSet.clear();
        sfx.whoosh();
      }
    }

    // L / touch / P2: a committed jumping tackle, from either ground or air.
    if (inp.headbutt && this.attackCd <= 0 && !this.holding && this.heldBy === 0 && !this.hangingStatic && this.swingTimer <= 0 && this.punchTimer <= 0 && this.dropkickTimer <= 0) {
      if (mlen > 0.15) this.facing = Math.atan2(inp.mx, inp.mz);
      const f = this.fwd(this.dashDirection);
      const onGround = this.grounded;
      const launchY = onGround ? 6.1 + (this.groundBody?.velocity.y ?? 0) : 2.0;
      this.hitSet.clear();
      this.dropkickTimer = POUNCE_DURATION;
      this.headbuttTimer = 0;
      this.noHover = Math.max(this.noHover, 0.32);
      this.jumpCd = Math.max(this.jumpCd, 0.55);
      this.attackCd = 1.25;
      for (const body of this.parts) {
        // Preserve a little prior momentum, but bound the launch and give all
        // joints the same impulse so the ragdoll stays connected.
        const along = body.velocity.x * f.x + body.velocity.z * f.z;
        const delta = clamp(8.0 - along, 0, 8.0);
        body.velocity.x += f.x * delta;
        body.velocity.z += f.z * delta;
        body.velocity.y = Math.max(body.velocity.y, launchY);
      }
      this.squashV += 3;
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
    // body-worn accessories (belt, boxers, float, broom, gloves, sandals) keep an empty head group
    if (!acc || acc.children.length === 0 || this.accKind === "helmet" || this.accKind === "none") return;
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
    if (this.visual.uncoveredGeometry) {
      this.visual.mesh.geometry = this.visual.uncoveredGeometry;
      this.visual.uncoveredGeometry = null;
    }
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
    for (const [arm, sgn] of [[this.armL, 1], [this.armR, -1]] as const) {
      for (const ap of this.armPts) {
        _sp.set(ap.x * sgn, ap.y, 0.01);
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
        arm.aabbNeedsUpdate = true;
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

  /** Nearest armed, reachable opponent we could start a tug-of-war with. */
  private findContestTarget(): { owner: Character; dist: number } | null {
    const f = this.fwd(new CANNON.Vec3());
    let best: Character | null = null, bestDist = 1.8;
    for (const other of Character.all) {
      if (other === this || !other.weapon || other.weaponContest || other.down || !other.alive || other.removed) continue;
      if (this.team >= 0 && other.team === this.team) continue;
      const dx = other.position.x - this.position.x, dz = other.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestDist || Math.abs(other.position.y - this.position.y) > 1.3) continue;
      if (d > 0.01 && (dx * f.x + dz * f.z) / d < -0.2) continue;
      if (!this.meleePathClear(this.torso.position, other.torso.position, other)) continue;
      best = other; bestDist = d;
    }
    return best ? { owner: best, dist: bestDist } : null;
  }

  /** Start a shared contest only against a reachable, unoccupied weapon. */
  private tryWeaponContest() {
    const found = this.findContestTarget();
    if (!found) return false;
    const best = found.owner;
    const contest: WeaponContest = { owner: best, challenger: this, weapon: best.weapon!,
      ownerPresses: 0, challengerPresses: 1, ownerLast: -Infinity, challengerLast: 0, elapsed: 0 };
    this.weaponContest = best.weaponContest = contest;
    this.contestBotDelay = best.contestBotDelay = 0.4 + Math.random() * 0.2;
    this.punchTimer = this.dropkickTimer = best.swingTimer = 0;
    this.facing = Math.atan2(best.position.x - this.position.x, best.position.z - this.position.z);
    sfx.grab();
    return true;
  }

  private updateWeaponContest(dt: number, pressed: boolean) {
    const contest = this.weaponContest;
    if (!contest) return;
    const { owner, challenger, weapon } = contest;
    if (!owner.alive || !challenger.alive || owner.removed || challenger.removed || owner.down || challenger.down ||
        owner.weapon !== weapon || weapon.holder !== owner || Math.hypot(owner.position.x - challenger.position.x, owner.position.z - challenger.position.z) > 2.6 ||
        Math.abs(owner.position.y - challenger.position.y) > 2) {
      this.cancelWeaponContest(); return;
    }
    // Advance once per rendered frame, not once per participant.
    if (this === challenger) {
      contest.elapsed += dt;
      if (contest.elapsed - contest.ownerLast > 0.9) contest.ownerPresses = 0;
      if (contest.elapsed - contest.challengerLast > 0.9) contest.challengerPresses = 0;
    }
    if (contest.elapsed > 3.5) { this.cancelWeaponContest(); return; }
    if (!pressed) return;
    if (this === owner) {
      contest.ownerPresses = contest.elapsed - contest.ownerLast <= 0.9 ? contest.ownerPresses + 1 : 1;
      contest.ownerLast = contest.elapsed;
      if (contest.ownerPresses >= 3) this.finishWeaponContest(owner);
    } else {
      contest.challengerPresses = contest.elapsed - contest.challengerLast <= 0.9 ? contest.challengerPresses + 1 : 1;
      contest.challengerLast = contest.elapsed;
      if (contest.challengerPresses >= 3) this.finishWeaponContest(challenger);
    }
  }

  private finishWeaponContest(winner: Character) {
    const contest = this.weaponContest;
    if (!contest) return;
    const { owner, challenger, weapon } = contest;
    this.cancelWeaponContest();
    // Consume the deciding frame's button edges so E cannot also throw,
    // grab, or immediately restart a contest during the same frame.
    owner.input.lift = challenger.input.lift = false;
    if (winner === challenger && owner.weapon === weapon && weapon.holder === owner) {
      owner.weapon = null;
      owner.swingTimer = 0;
      weapon.holder = null;
      challenger.equip(weapon);
    }
  }

  private cancelWeaponContest() {
    const contest = this.weaponContest;
    if (!contest) return;
    contest.owner.weaponContest = contest.challenger.weaponContest = null;
    contest.owner.input.lift = contest.challenger.input.lift = false;
    contest.owner.contestCooldown = contest.challenger.contestCooldown = 0.7;
  }

  /** E: pick up a bat, or grab + lift whatever is in front of us in one go.
   *  Returns true when a bat or a body was grabbed. */
  tryLift(): boolean {
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
    let bestScore = Infinity;
    let bestDist = Infinity;
    const consider = (body: CANNON.Body, who: Character | null, maxD: number, maxY = 1.3) => {
      const dx = body.position.x - tp.x, dz = body.position.z - tp.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD || Math.abs(body.position.y - tp.y) > maxY) return;
      const dot = d > 0.01 ? (dx * f.x + dz * f.z) / d : 1;
      if (dot < -0.2) return;
      const score = d * (1.6 - dot);
      if (score < bestScore) {
        bestScore = score;
        bestDist = d;
        best = body;
        owner = who;
      }
    };
    // Reach is measured from the torso centre, and a punch now sends a cat
    // sliding, so the natural follow-up (knock them down, then lift) needs
    // extra room. Downed cats are easier to scoop up than standing ones.
    for (const c of Character.all) {
      if (c === this || !c.alive || c.removed) continue;
      if (!this.meleePathClear(tp, c.torso.position, c)) continue;
      consider(c.torso, c, c.down ? 3.4 : 2.6, c.down ? 1.8 : 1.5);
    }
    for (const b of this.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC || bodyOwner.has(b) || b.mass > 6) continue;
      if (Character.bats.some((bt) => bt.body === b)) continue;
      consider(b, null, 1.4);
    }
    const contest = this.heldBy === 0 && this.contestCooldown <= 0 ? this.findContestTarget() : null;
    // Whichever action is nearest wins, so grabbing a cat is never stolen by a
    // bat contest behind it (and a close armed opponent still starts a struggle).
    if (bat && (!best || batD < bestDist * 0.8) && (!contest || batD <= contest.dist)) {
      this.equip(bat);
      return true;
    }
    if (contest && (!best || contest.dist <= bestDist)) return this.tryWeaponContest();
    if (best) {
      // Turn into the lift so the carry pose and reach line up with the target.
      if (owner) this.facing = Math.atan2(owner.position.x - this.position.x, owner.position.z - this.position.z);
      this.carryNow(best, owner);
      return true;
    }
    return false;
  }

  private carryNow(body: CANNON.Body, owner: Character | null) {
    if (owner) {
      // Step in while reaching so a longer grab reads as a grab, not a telekinetic yank.
      const dx = owner.position.x - this.position.x, dz = owner.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        const push = Math.min(2.4, (d - 1.2) * 1.8);
        for (const part of this.parts) {
          part.velocity.x += (dx / d) * push;
          part.velocity.z += (dz / d) * push;
        }
      }
    }
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

  equip(bat: Bat) {
    this.world.removeBody(bat.body);
    bat.holder = this;
    bat.thrower = null;
    bat.flyT = 0;
    this.weapon = bat;
    // Keep the side/overhead alternation across pickups so a freshly grabbed
    // bat does not always restart with the same horizontal swing.
    this.swingOverhead = false;
    this.batTh = bat.kind === "pan" ? 2.1 : 2.45;
    this.batEl = bat.kind === "pan" ? 0.5 : 0.68;
    this.swingTimer = 0;
    this.punchTimer = 0;
    // Seed the grip before the first physics tick: otherwise the arms pull
    // toward (0,0,0) and the first tip velocity looks like a huge hit.
    this.updateBatPose(1 / 120);
    this.batAPrev.copy(this.batA);
    this.batTipPrev.copy(this.batB);
    this.batTipVel.setZero();
    sfx.grab();
  }

  /** release the bat: thrown hard (E) or just dropped */
  throwWeapon(hard = true) {
    const b = this.weapon;
    if (!b) return;
    this.cancelWeaponContest();
    this.weapon = null;
    this.swingTimer = 0;
    b.holder = null;
    const f = this.fwd(new CANNON.Vec3());
    const g = this.batGrip, d = this.batDir;
    if (!hard && this.down) {
      this.armR.pointToWorldFrame(HAND, g);
      this.armR.quaternion.vmult(_fallWeaponAxis, d);
    }
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
        const power = this.lifting ? 11 : 2.5;
        const upv = this.lifting ? 5 : 1.5;
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
    const ko = this.down || !this.alive;

    if (this.weapon) {
      if (ko) this.swingTimer = 0;
      else if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - h);
      this.updateBatPose(h);
    }
    this.recoveryT = Math.max(0, this.recoveryT - h);
    this.noHover -= h;
    this.stagger -= h;
    if (this.punchTimer > 0) {
      const before = this.punchTimer;
      this.punchTimer -= h;
      // lunge at the start of the strike
      if (before > PUNCH_STRIKE0 && this.punchTimer <= PUNCH_STRIKE0 && !this.ko) {
        const lunge = this.nearestMeleeTarget(1.65) ? 4 : 2.2;
        const f0 = this.fwd(v1);
        this.torso.velocity.x += f0.x * lunge;
        this.torso.velocity.z += f0.z * lunge;
      }
    }
    if (this.headbuttTimer > 0) this.headbuttTimer -= h;
    if (this.dropkickTimer > 0) {
      this.dropkickTimer -= h;
      const landing = this.grounded && this.dropkickTimer < 0.5 && this.torso.velocity.y < 1;
      if (this.dropkickTimer <= 0 || landing) {
        this.dropkickTimer = 0;
        this.stagger = Math.max(this.stagger, landing ? 0.35 : 0.18);
        // Ground friction slows a landing; do not abruptly erase airborne momentum.
        if (landing) for (const body of this.parts) {
          body.velocity.x *= 0.75;
          body.velocity.z *= 0.75;
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
    if (this.grounded) this.coyote = COYOTE;
    else this.coyote = Math.max(0, this.coyote - h);
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
    const ledge = inpG.grab && falling && !this.lifting && this.dropkickTimer <= 0 ? this.findLedge() : null;
    const aim = inpG.grab && !this.lifting && !ledge && this.dropkickTimer <= 0 ? this.findGrabTarget(f) : null;
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
    const punch = this.punchTimer > 0 ? punchPose(PUNCH_T - this.punchTimer) : null;
    const pounce = this.dropkickTimer > 0 ? pouncePose(POUNCE_DURATION - this.dropkickTimer) : null;
    let lean = 0;
    const hSpeed = Math.hypot(t.velocity.x, t.velocity.z);
    if (this.grounded) lean = Math.min(0.22, hSpeed * 0.031);
    if (this.headbuttTimer > 0.12) lean = 1.8;
    if (pounce) lean = pounce.lean;
    if (punch) lean = punch.lean;
    if (this.swingTimer > 0 && this.weapon) {
      lean = weaponSwingPose(this.weapon.kind, SWING_DURATION - this.swingTimer, this.swingOverhead).lean;
    }
    if (this.weaponContest) lean = -0.15 + Math.sin(this.time * 13) * 0.12;
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
    if (punch) twist = (this.punchArm === "armL" ? 1 : -1) * punch.twist;
    if (this.swingTimer > 0 && !this.swingOverhead) {
      const e = SWING_DURATION - this.swingTimer;
      twist = e < SWING_WINDUP ? 0.28 * (e / SWING_WINDUP)
        : e < SWING_STRIKE_END ? 0.28 - 0.78 * ((e - SWING_WINDUP) / (SWING_STRIKE_END - SWING_WINDUP))
        : -0.5 * (this.swingTimer / (SWING_DURATION - SWING_STRIKE_END));
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
      t.quaternion.mult(_lq1, _lq3);
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
      const ha = this.holds.armL;
      const hb = this.holds.armR;
      if (ha && ha.body.type === CANNON.Body.DYNAMIC) {
        liftedMass += ha.owner ? ha.owner.totalMass : Math.min(ha.body.mass, 6);
      }
      if (hb && hb.body.type === CANNON.Body.DYNAMIC && (hb.owner ?? hb.body) !== (ha?.owner ?? ha?.body)) {
        liftedMass += hb.owner ? hb.owner.totalMass : Math.min(hb.body.mass, 6);
      }
    }
    if (this.grounded && this.noHover <= 0) {
      const gv = this.groundBody ? this.groundBody.velocity.y : 0;
      const err = HOVER - this.groundDist;
      const recovering = this.recoveryT > 0;
      const targetVy = clamp(err * (recovering ? 7 : 11), recovering ? -2 : -4, recovering ? 2 : 6) + gv;
      const acc = GRAVITY + (targetVy - t.velocity.y) * (recovering ? 10 : 18);
      const fy = clamp((this.totalMass + liftedMass) * acc, 0, (this.totalMass + liftedMass) * GRAVITY * (recovering ? 1.8 : 4));
      t.force.y += fy;
      // Newton III: push down on whatever we stand on (no free elevators)
      const gb = this.groundBody;
      if (gb && gb.type === CANNON.Body.DYNAMIC) {
        v1.set(0, -Math.min(fy, gb.mass * GRAVITY * 2), 0);
        v2.set(t.position.x - gb.position.x, t.position.y - this.groundDist - gb.position.y, t.position.z - gb.position.z);
        gb.applyForce(v1, v2);
      }
    }

    // ---------- locomotion ----------
    const inp = this.input;
    let speed = (inp.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, Math.hypot(inp.mx, inp.mz));
    if (this.holding) speed *= 0.65;
    // Attacking slows the cat a little, not a lot: being pinned in place while
    // swinging read as sluggish.
    if (this.punchTimer > 0) speed *= 0.78;
    if (held) speed *= 0.25;
    const mlen = Math.hypot(inp.mx, inp.mz);
    const dx = mlen > 0.1 ? (inp.mx / mlen) * speed : 0;
    const dz = mlen > 0.1 ? (inp.mz / mlen) * speed : 0;
    // Higher gain = the cat reaches its speed sooner and stops on a coin. A
    // stronger gain when releasing or reversing removes the old ice-skate drift.
    const braking = mlen <= 0.1 || (dx * t.velocity.x + dz * t.velocity.z) < 0;
    // Brake hard only while there is speed to shed; a stiff idle stance fought
    // the ragdoll (and shortened the punch reach).
    const hSpeedNow = Math.hypot(t.velocity.x, t.velocity.z);
    const attacking = this.punchTimer > 0 || this.swingTimer > 0;
    let ctrl: number;
    if (!this.grounded) ctrl = 3.1;
    else if (braking) {
      // Comfort brake: grab hard while there is speed to shed, then let the
      // gain ease toward the idle stance as the cat settles — no final shudder
      // (8 at a crawl grows continuously into 19 at full run).
      ctrl = hSpeedNow > 0.4 && !attacking ? 8 + 11 * Math.min(1, hSpeedNow / 4.5) : 9;
    } else {
      // Launch pop off the line for a snappy start, easing into the steady
      // cruise pull so the run-up stays smooth instead of twitchy.
      const launch = Math.max(0, 1 - hSpeedNow / 3.2);
      ctrl = 14 + 10 * launch;
    }
    if (this.stagger > 0) ctrl *= 0.3;
    if (this.punchTimer > 0) ctrl *= 0.5;
    if (this.dropkickTimer > 0 || this.headbuttTimer > 0.1 || this.weaponContest) ctrl = 0;
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
    let ax = clamp((dx + gvx - t.velocity.x) * ctrl, -55, 55);
    let az = clamp((dz + gvz - t.velocity.z) * ctrl, -55, 55);
    // The spring's weak tail made both ends mushy: a launch crawling into its
    // last 0.4 m/s and a stop dribbling to a halt. Guarantee a small closing
    // rate while there is still a real gap (never against stagger/attacks).
    if (this.grounded && this.stagger <= 0 && !attacking && this.climbAssist <= 0) {
      if (!braking) {
        if (Math.abs(ax) < 5 && dx - t.velocity.x > 0.25) ax = 5 * Math.sign(dx - t.velocity.x);
        if (Math.abs(az) < 5 && dz - t.velocity.z > 0.25) az = 5 * Math.sign(dz - t.velocity.z);
      } else {
        if (Math.abs(ax) < 5 && Math.abs(t.velocity.x) > 0.3) ax = -Math.sign(t.velocity.x) * 5;
        if (Math.abs(az) < 5 && Math.abs(t.velocity.z) > 0.3) az = -Math.sign(t.velocity.z) * 5;
      }
    }
    // Apply the command to the WHOLE chassis: pushing only the torso made the
    // limbs trail through the joints, so the cat answered with about half its
    // weight (mushy gas, a long brake slide, and a lean into every stop).
    for (const b of this.parts) {
      b.force.x += b.mass * ax;
      b.force.z += b.mass * az;
    }
    // Chassis coupling: the control force only pushes the torso, so the head
    // and limbs kept rolling long after the command — mushy gas and a long
    // slide on the brake. Dragging every part toward the torso's horizontal
    // velocity makes the whole cat answer as one body (and stops the legs
    // tipping forward past the feet on hard stops).
    if (this.grounded && ctrl > 0 && this.climbAssist <= 0) {
      const tvx = t.velocity.x;
      const tvz = t.velocity.z;
      for (const b of this.parts) {
        if (b === t) continue;
        b.force.x += b.mass * (tvx - b.velocity.x) * 14;
        b.force.z += b.mass * (tvz - b.velocity.z) * 14;
      }
    }
    // Traction: pull the sideways part of the motion into the facing so a
    // turn-in carves and finishes tidy instead of skating out of the arc
    // (planted, moving under control, and never mid-attack).
    if (this.grounded && !braking && !attacking && mlen > 0.1 && this.stagger <= 0 && !this.weaponContest && this.climbAssist <= 0) {
      const f = this.fwd(v3);
      const fwdV = t.velocity.x * f.x + t.velocity.z * f.z;
      const latX = t.velocity.x - f.x * fwdV;
      const latZ = t.velocity.z - f.z * fwdV;
      t.force.x -= this.totalMass * clamp(latX * 7, -22, 22);
      t.force.z -= this.totalMass * clamp(latZ * 7, -22, 22);
    }

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
      if (pounce) {
        // Hind legs trail behind the torso, instead of kicking out in front.
        const trail = -0.48 * pounce.amount;
        tx = hipW.x + f.x * trail;
        ty = hipW.y + (FOOT.y - LIMB_TOP.y) * (0.97 - 0.65 * pounce.amount);
        tz = hipW.z + f.z * trail;
      } else if (this.grounded) {
        const ph = this.walkPhase + off;
        const LH = rig.LEG_H;
        const sw = Math.sin(ph) * 0.34 * (0.6 + 0.4 * LH) * moveAmt;
        const lift = Math.pow(Math.max(0, Math.cos(ph)), 1.6) * 0.26 * (0.6 + 0.4 * LH) * moveAmt;
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
      if (this.weapon) {
        // both paws on the handle (right paw on top)
        const g = this.batGrip, d = this.batDir;
        // Split grip: the right paw sits lower on the handle so the two arms
        // never fold into one blob in front of the belly.
        const up2 = arm === "armR" ? -0.17 : 0.05;
        tx = g.x + d.x * up2;
        ty = g.y + d.y * up2;
        tz = g.z + d.z * up2;
        kp = this.swingTimer > 0 ? 480 : 340;
        kd = 24;
      } else if (this.weaponContest) {
        const grip = this.weaponContest.owner.batGrip;
        tx = grip.x + side.x * s * 0.09;
        ty = grip.y + 0.08;
        tz = grip.z + side.z * s * 0.09;
        kp = 400;
        kd = 24;
      } else if (punching && punch) {
        // A continuous anticipation, extension and return instead of snapping
        // the paw between disconnected targets on consecutive physics steps.
        tx += f.x * punch.forward + side.x * s * punch.side;
        tz += f.z * punch.forward + side.z * s * punch.side;
        ty += punch.up;
        // During the extension only, steer the paw toward the closest
        // reachable opponent rather than keeping the arm on a fixed rail.
        const aimWeight = clamp((punch.forward - 0.05) / 0.6, 0, 1);
        if (aimWeight > 0 && this.hitSet.size === 0) {
          const target = this.nearestMeleeTarget(1.65);
          if (target && this.assistedContact(target, _attackPoint, sh)) {
            tx += (_attackPoint.x - tx) * aimWeight;
            ty += (_attackPoint.y - ty) * aimWeight;
            tz += (_attackPoint.z - tz) * aimWeight;
          }
        }
        kp = 1700;
        kd = 32;
      } else if (punch) {
        // The other paw lifts slightly as a guard, then relaxes again.
        const out = 0.17 + 0.04 * punch.guard;
        tx += side.x * s * out + f.x * (0.05 + 0.04 * punch.guard);
        tz += side.z * s * out + f.z * (0.05 + 0.04 * punch.guard);
        ty += -0.33 + 0.15 * punch.guard;
        kp = 250;
      } else if (pounce) {
        // Both paws reach toward the prey while the body dives forward.
        const reach = 0.05 + 0.68 * pounce.amount;
        const out = 0.17 + 0.03 * pounce.amount;
        tx += f.x * reach + side.x * s * out;
        tz += f.z * reach + side.z * s * out;
        ty += -0.33 + 0.43 * pounce.amount;
        kp = 420;
        kd = 22;
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
        // The paw has to arc AROUND the belly: a target that merely slides
        // forward beside the barrel gets eaten by it and the swing measures
        // ~4 cm instead of ~14. Growing the side offset with the swing (and
        // lifting the paw on the forward stroke) makes the arm pump readable
        // at any speed while an idle cat keeps the relaxed menu hang.
        const swing = -Math.sin(ph) * (0.32 + 0.24 * run) * moveAmt;
        const breathe = Math.sin(this.time * 2.4 + s) * 0.018;
        // The asset-shaped cat has a wide barrel, so a relaxed paw has to hang a
        // little further out (and less far forward) than the plush default,
        // otherwise the arm slides inside the belly.
        // Menu pose keeps the arms hanging right beside the belly, so the
        // asset shape uses the same tight spread here; pushOut() still lifts
        // a paw out of the body whenever the torso turns into it.
        const out = (getShapeMode() === "asset" ? 0.018 : 0.17) + 0.03 * run + Math.abs(swing) * 0.72;
        const fwd = (getShapeMode() === "asset" ? -0.01 : 0.05) + swing;
        tx += side.x * s * out + f.x * fwd;
        tz += side.z * s * out + f.z * fwd;
        ty += -0.33 + breathe + swing * 0.38 + run * (0.1 + Math.max(0, swing) * 0.55);
        kp = 210 + run * 140 + moveAmt * 110;
      }
      // never aim a paw inside our own body / head (the PD would fight the self-collision)
      _sw.set(tx, ty, tz);
      t.pointToLocalFrame(_sw, _sl);
      // The asset-shaped cat hangs its paws right beside the belly, exactly
      // like the menu pose (only ~3-4 degrees out). A full paw-radius clearance
      // here shoved both arms out by ~17 degrees, which is what made the same
      // cat look stiff and bow-legged in game.
      const clearance = getShapeMode() === "asset" ? this.pawR * 0.12 : this.pawR + 0.015;
      if (rig.pushOut(_sl, clearance, this.vols.torso)) {
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
      const reach = (LIMB_TOP.y - HAND.y) * 1.02;
      const rx = tx - sh.x, ry = ty - sh.y, rz = tz - sh.z;
      const distance = Math.hypot(rx, ry, rz);
      if (distance > reach) {
        const k = reach / distance;
        tx = sh.x + rx * k; ty = sh.y + ry * k; tz = sh.z + rz * k;
      }
      this.driveLimb(body, HAND, tx, ty, tz, kp, kd, punching ? 0.3 : 0.5);
    }

    // proximity grab (forgiving, like the real games)
    const ob = this.aimBody as CANNON.Body | null;
    if (inp.grab && ob && !this.lifting && !this.weaponContest) {
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
      // Plane panels are compounds: each strip has its own offset (and may
      // rotate as a section falls). Work in the individual shape's frame.
      for (let i = 0; i < b.shapes.length; i++) {
        const sh = b.shapes[i];
        if (!(sh instanceof CANNON.Box)) continue;
        b.pointToLocalFrame(_ledgeWorld.set(cx, cy, cz), _ledgeLocal);
        _ledgeLocal.vsub(b.shapeOffsets[i], _ledgeLocal);
        b.shapeOrientations[i].conjugate(_ledgeRotation).vmult(_ledgeLocal, _ledgeLocal);
        const he = sh.halfExtents;
        let px = clamp(_ledgeLocal.x, -he.x, he.x);
        let pz = clamp(_ledgeLocal.z, -he.z, he.z);
        // If directly under the box, grab its nearest outer edge, not the
        // middle of the floor above our head.
        if (Math.abs(_ledgeLocal.x) < he.x && Math.abs(_ledgeLocal.z) < he.z) {
          if (he.x - Math.abs(px) < he.z - Math.abs(pz)) px = (px < 0 ? -1 : 1) * he.x;
          else pz = (pz < 0 ? -1 : 1) * he.z;
        }
        _ledgePoint.set(px, he.y, pz);
        b.shapeOrientations[i].vmult(_ledgePoint, _ledgePoint);
        _ledgePoint.vadd(b.shapeOffsets[i], _ledgePoint);
        b.pointToWorldFrame(_ledgePoint, _ledgeWorld);
        if (_ledgeWorld.y < this.torso.position.y - 0.7 || _ledgeWorld.y > this.torso.position.y + 1.6) continue;
        const d = Math.hypot(_ledgeWorld.x - cx, _ledgeWorld.y - cy, _ledgeWorld.z - cz);
        if (d < bestD) {
          bestD = d;
          found = true;
          this.ledgeVec.copy(_ledgeWorld);
          this.ledgeBody = b;
        }
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
      if (info && (info.char === this || !info.char.alive || (this.team >= 0 && info.char.team === this.team) || (info.part !== "torso" && info.part !== "head"))) continue;
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
    let fx = ((tx - p.x) * kp - pvx * kd) * m;
    let fy = ((ty - p.y) * kp - pvy * kd) * m;
    let fz = ((tz - p.z) * kp - pvz * kd) * m;
    const force = Math.hypot(fx, fy, fz);
    if (force > 100) { const scale = 100 / force; fx *= scale; fy *= scale; fz *= scale; }
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
    if (this.down || !this.alive) return;
    const otherChar = otherInfo?.char;
    if (otherChar && (otherChar === this || !otherChar.alive)) return;

    // GRAB
    const mate = otherChar && this.team >= 0 && otherChar.team === this.team;
    if ((part === "armL" || part === "armR") && this.input.grab && !this.holds[part] && !this.weaponContest && !mate) {
      const arm = this[part];
      const hand = arm.pointToWorldFrame(HAND, new CANNON.Vec3());
      if (hand.distanceTo(point) < 0.4) this.attachHold(part, other, otherChar ?? null);
    }

    if (!otherChar) return;
    // Punches are resolved once, after all contacts, by sweepPunch(). This
    // avoids contact-order favouring a farther cat over the closest one.
    // The tackle only hits cats in the launch direction, once per launch.
    if (this.dropkickTimer > 0 && !mate && part !== "armL" && part !== "armR" && !this.hitSet.has(otherChar) && this.inFront(otherChar, this.dashDirection)) {
      this.hitSet.add(otherChar);
      otherChar.receiveHit(this, 40, this.dashDirection, 11, other, point, "dropkick");
      for (const body of this.parts) {
        body.velocity.x -= this.dashDirection.x * 1.2;
        body.velocity.z -= this.dashDirection.z * 1.2;
      }
      this.hooks.onHit(this, otherChar, point, 40, "dropkick");
    }
  }

  private inFront(other: Character, direction: CANNON.Vec3) {
    const dx = other.torso.position.x - this.torso.position.x;
    const dz = other.torso.position.z - this.torso.position.z;
    return dx * direction.x + dz * direction.z > -0.05;
  }

  private meleePathClear(from: CANNON.Vec3, to: CANNON.Vec3, target: Character) {
    if (from.distanceTo(to) < 1e-5) return true;
    _meleeRay.reset();
    this.world.raycastClosest(from, to, { collisionFilterMask: ~this.bit, skipBackfaces: true }, _meleeRay);
    return !_meleeRay.hasHit || bodyOwner.get(_meleeRay.body)?.char === target;
  }

  /** Nearest visible opponent in a short forward cone, never a global lock. */
  private nearestMeleeTarget(range: number) {
    const f = this.fwd(_meleeDir);
    const origin = this.torso.position;
    let nearest: Character | null = null, best = range;
    for (const target of Character.all) {
      if (target === this || target.removed || !target.alive) continue;
      if (this.team >= 0 && target.team === this.team) continue; // team matches: never aim at a mate
      const dx = target.position.x - origin.x, dy = target.position.y - origin.y, dz = target.position.z - origin.z;
      const planar = Math.hypot(dx, dz), distance = Math.hypot(planar, dy);
      if (distance >= best || Math.abs(dy) > 1.25) continue;
      if (planar > 0.01 && (dx * f.x + dz * f.z) / planar < 0.4) continue;
      if (!this.meleePathClear(origin, target.torso.position, target)) continue;
      nearest = target;
      best = distance;
    }
    return nearest;
  }

  /** A small one-time turn at the button press, not tracking while idle. */
  private aimMeleeAtNearest(range: number) {
    const target = this.nearestMeleeTarget(range);
    if (!target) return;
    const desired = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
    this.facing = wrapAngle(this.facing + clamp(wrapAngle(desired - this.facing), -0.65, 0.65));
  }

  /** Contact on the near side of a real compound sphere for close-range assist. */
  private assistedContact(target: Character, out: CANNON.Vec3, origin = this.position) {
    let chosen: CANNON.Body | null = null, best = Infinity;
    for (const body of [target.torso, target.head]) {
      for (let i = 0; i < body.shapes.length; i++) {
        const shape = body.shapes[i];
        if (!(shape instanceof CANNON.Sphere)) continue;
        body.pointToWorldFrame(body.shapeOffsets[i], _attackCenter);
        const dx = origin.x - _attackCenter.x, dy = origin.y - _attackCenter.y, dz = origin.z - _attackCenter.z;
        const distance = Math.hypot(dx, dy, dz);
        const surface = distance - shape.radius;
        if (surface >= best) continue;
        best = surface;
        chosen = body;
        const scale = shape.radius / (distance || 1);
        out.set(_attackCenter.x + dx * scale, _attackCenter.y + dy * scale, _attackCenter.z + dz * scale);
      }
    }
    return chosen;
  }

  private punchHit(other: Character, body: CANNON.Body, point: CANNON.Vec3, direction: CANNON.Vec3) {
    this.hitSet.add(other);
    const running = this.input.run && Math.hypot(this.torso.velocity.x, this.torso.velocity.z) > 4.5;
    const dmg = (running ? 42 : 38) * (body === other.head ? 1.3 : 1);
    other.receiveHit(this, dmg, direction, running ? 15.7 : 14.4, body, point, "punch");
    other.squashV -= 4;
    this.hooks.onHit(this, other, point, dmg, "punch");
  }

  /** Sweep the actual paw between fixed steps so quick fists cannot tunnel. */
  private sweepPunch() {
    if (this.punchTimer <= 0 || this.down || !this.alive || this.hitSet.size > 0) return;
    const hand = this[this.punchArm].pointToWorldFrame(HAND, this.punchHand);
    const elapsed = PUNCH_T - this.punchTimer;
    if (elapsed >= PUNCH_WIND && this.punchTimer > 0.06) {
      const target = this.nearestMeleeTarget(1.65);
      const f = this.fwd(_meleeDir);
      if (target) {
        let hitBody: CANNON.Body | null = null;
        let best = Infinity;
        for (const body of [target.head, target.torso]) {
          for (let i = 0; i < body.shapes.length; i++) {
            const shape = body.shapes[i];
            if (!(shape instanceof CANNON.Sphere)) continue;
            body.pointToWorldFrame(body.shapeOffsets[i], _attackCenter);
            const d2 = segmentDistanceSquared(_attackCenter, this.previousPunchHand, hand);
            if (d2 <= (shape.radius + this.pawR + 0.15) ** 2 && d2 < best) {
              best = d2;
              hitBody = body;
              // Point on the struck sphere nearest the swept paw.
              const vx = hand.x - this.previousPunchHand.x, vy = hand.y - this.previousPunchHand.y, vz = hand.z - this.previousPunchHand.z;
              const length2 = vx * vx + vy * vy + vz * vz;
              const t = length2 > 1e-10 ? clamp(((_attackCenter.x - this.previousPunchHand.x) * vx + (_attackCenter.y - this.previousPunchHand.y) * vy + (_attackCenter.z - this.previousPunchHand.z) * vz) / length2, 0, 1) : 0;
              const nx = this.previousPunchHand.x + vx * t - _attackCenter.x;
              const ny = this.previousPunchHand.y + vy * t - _attackCenter.y;
              const nz = this.previousPunchHand.z + vz * t - _attackCenter.z;
              const scale = shape.radius / (Math.hypot(nx, ny, nz) || 1);
              _attackPoint.set(_attackCenter.x + nx * scale, _attackCenter.y + ny * scale, _attackCenter.z + nz * scale);
            }
          }
        }
        if (hitBody && this.meleePathClear(hand, _attackPoint, target)) this.punchHit(target, hitBody, _attackPoint, f);
        else if (elapsed >= 0.18) {
          // Modest forgiveness only once the paw is actually close to a
          // target sphere; no invisible hit across a large empty gap.
          const body = this.assistedContact(target, _attackPoint, hand);
          if (body && hand.distanceTo(_attackPoint) <= this.pawR + 0.27 &&
              this.meleePathClear(this.torso.position, _attackPoint, target)) this.punchHit(target, body, _attackPoint, f);
        }
      }
    }
    this.previousPunchHand.copy(hand);
  }

  receiveHit(attacker: Character, dmg: number, dir: CANNON.Vec3, force: number, body: CANNON.Body, point?: CANNON.Vec3, kind?: HitKind) {
    // team matches: no friendly fire, no matter which attack slipped through
    if (attacker !== this && this.team >= 0 && attacker.team === this.team) return;
    this.cancelWeaponContest();
    if (this.accKind === "helmet" && body === this.head) {
      dmg *= 0.7;
      force *= 0.85;
    }
    this.hurtT = Math.max(this.hurtT, 0.55 + dmg / 70);
    this.lastHitBy = attacker;
    this.lastHitKind = kind ?? "";
    this.lastHitAt = attacker.time;
    this.lastHitTime = this.time;
    if (point) {
      const strongerStrike = kind === "punch" || kind === "bat";
      // A landed blow has to read as a blow: the old 4.4 cap flattened a fist
      // and a bat into the exact same shove.
      let horizontal = strongerStrike ? clamp(force * 0.40, 0, 6.2) : clamp(force * 0.26, 0, 3.4);
      if (strongerStrike) {
        // Don't keep adding energy to a victim already flying away quickly.
        const outgoing = this.torso.velocity.x * dir.x + this.torso.velocity.z * dir.z;
        horizontal = Math.min(horizontal, Math.max(0, 7.6 - outgoing));
      }
      let up = clamp(force * 0.11, 0, 1.5);
      if (strongerStrike) up = Math.min(up, Math.max(0, 4 - this.torso.velocity.y));
      for (const part of this.parts) {
        part.velocity.x += dir.x * horizontal;
        part.velocity.z += dir.z * horizontal;
        part.velocity.y += up;
      }
      // Offset impulses create a controlled turn without overwriting the
      // ragdoll's existing angular velocity or teleporting any body.
      point.vsub(body.position, _meleeOffset);
      const offsetLength = _meleeOffset.length();
      if (offsetLength > 0.4) _meleeOffset.scale(0.4 / offsetLength, _meleeOffset);
      let localHorizontal = force * 0.12, localUp = force * 0.035;
      if (strongerStrike) {
        const outgoing = body.velocity.x * dir.x + body.velocity.z * dir.z;
        localHorizontal = Math.min(localHorizontal, Math.max(0, 8 - outgoing));
        localUp = Math.min(localUp, Math.max(0, 5 - body.velocity.y));
      }
      _imp.set(dir.x * body.mass * localHorizontal, body.mass * localUp, dir.z * body.mass * localHorizontal);
      body.applyImpulse(_imp, _meleeOffset);
      if (strongerStrike) {
        // A small bounded torque makes the whole torso recoil in the impact
        // direction rather than sliding rigidly like a statue.
        const recoil = clamp(force * 0.11, 0, 1.4);
        this.torso.angularVelocity.x += dir.z * recoil;
        this.torso.angularVelocity.z -= dir.x * recoil;
      }
      const spin = body.angularVelocity.length();
      if (spin > 12) body.angularVelocity.scale(12 / spin, body.angularVelocity);
    } else {
      const imp = new CANNON.Vec3(dir.x * force, force * 0.3, dir.z * force);
      body.applyImpulse(imp.scale(body.mass * 0.35));
      const kb = force > 7 ? 0.32 : 0.16;
      this.torso.velocity.x += dir.x * force * kb;
      this.torso.velocity.z += dir.z * force * kb;
      this.torso.velocity.y += force * 0.1;
    }
    if (kind === "dropkick") this.throwWeapon(false);
    if (this.ko) {
      this.koTimer = Math.min(this.koTimer + 0.3, 5);
      return;
    }
    this.dizzy += dmg;
    this.stagger = Math.max(this.stagger, 0.3 + dmg / 90);
    if (this.dizzy >= 100) this.knockOut(4.2);
    // Every melee hit floors the victim: a swing that only nudged them was the
    // main reason the bat/pan felt like it did nothing. A bat keeps them down a
    // touch longer, a punch stays exactly as strong as a bat blow.
    else if (kind === "punch") this.knockDown(1.0);
    else if (kind === "bat") this.knockDown(1.1);
    else if (kind === "pan") this.knockDown(1.0);
  }

  /** A short physical fall is not a scoring KO; recover automatically. */
  private knockDown(time: number) {
    this.knockdownTimer = Math.max(this.knockdownTimer, time);
    this.punchTimer = 0;
    this.dropkickTimer = 0;
    this.headbuttTimer = 0;
    this.swingTimer = 0;
    this.releaseAll(false);
  }

  /** Hard cap on torso speed after big hits: strong feel, but never moon-launched. */
  capKnockback(maxV: number, maxUp: number) {
    const v = this.torso.velocity;
    const sp = Math.hypot(v.x, v.z);
    if (sp > maxV) {
      v.x = (v.x / sp) * maxV;
      v.z = (v.z / sp) * maxV;
    }
    if (v.y > maxUp) v.y = maxUp;
  }

  knockOut(time: number) {
    this.koTimer = time;
    this.knockdownTimer = 0;
    this.cancelWeaponContest();
    this.recoveryT = 0;
    this.punchTimer = 0;
    this.dropkickTimer = 0;
    this.headbuttTimer = 0;
    this.dizzy = 0;
    this.kos++;
    if (Math.random() < 0.5) this.knockAccessory(new CANNON.Vec3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    this.releaseAll(false);
    this.swingTimer = 0;
    this.stars.visible = true;
    sfx.ko();
    this.hooks.onKO(this);
  }

  /** Two-handed bat pose: side swing or a raised overhead chop. */
  private updateBatPose(h: number) {
    if (!this.weapon) return;
    const restTh = this.weapon.kind === "pan" ? 2.1 : 2.45;
    const restEl = this.weapon.kind === "pan" ? 0.5 : 0.68;
    let fw = 0, lift = 0;
    if (this.swingTimer > 0) {
      const pose = weaponSwingPose(this.weapon.kind, SWING_DURATION - this.swingTimer, this.swingOverhead);
      this.batTh = pose.th;
      this.batEl = pose.el;
      fw = pose.forward;
      lift = pose.lift;
    } else {
      const k = 1 - Math.exp(-h * 18);
      this.batTh += (restTh - this.batTh) * k;
      this.batEl += (restEl - this.batEl) * k;
    }
    this.batAPrev.copy(this.batA);
    this.batTipPrev.copy(this.batB);
    this.panCenterPrev.set(
      this.batGrip.x + this.batDir.x * this.weapon.impactOffset,
      this.batGrip.y + this.batDir.y * this.weapon.impactOffset,
      this.batGrip.z + this.batDir.z * this.weapon.impactOffset,
    );
    const t = this.torso;
    const ce = Math.cos(this.batEl);
    v3.set(-Math.sin(this.batTh) * ce, Math.sin(this.batEl), Math.cos(this.batTh) * ce);
    t.quaternion.vmult(v3, this.batDir);
    // The handle is held out to the cat's left and a little lower, so the two
    // paws sit on the same side of the belly. A grip on the centre line folded
    // both mittens across the chest, which read as tangled arms at rest.
    v3.set(this.swingTimer > 0 ? 0.02 : 0.2, rig.SHOULDER_L[1] * 0.4 - 0.06 + lift, 0.24 + fw);
    rig.pushOut(v3, this.pawR + 0.02, this.vols.torso);
    t.pointToWorldFrame(v3, this.batGrip);
    const g = this.batGrip, d = this.batDir;
    const start = this.weapon.kind === "pan" ? this.weapon.impactOffset - 0.2 : 0.3;
    this.batA.set(g.x + d.x * start, g.y + d.y * start, g.z + d.z * start);
    this.batB.set(g.x + d.x * (this.weapon.reach - 0.05), g.y + d.y * (this.weapon.reach - 0.05), g.z + d.z * (this.weapon.reach - 0.05));
    this.batTipVel.set((this.batB.x - this.batTipPrev.x) / h, (this.batB.y - this.batTipPrev.y) / h, (this.batB.z - this.batTipPrev.z) / h);
  }

  /** Weapon hit test: bat segment or broad pan face; direction follows tip velocity. */
  private batHits(h: number) {
    if (!this.weapon || this.swingTimer <= 0) return;
    const e = SWING_DURATION - this.swingTimer;
    if (e < SWING_WINDUP || e > SWING_STRIKE_END) return;
    const a = this.batA, b = this.batB;
    const pan = this.weapon.kind === "pan";
    panHitCenter.set(
      this.batGrip.x + this.batDir.x * this.weapon.impactOffset,
      this.batGrip.y + this.batDir.y * this.weapon.impactOffset,
      this.batGrip.z + this.batDir.z * this.weapon.impactOffset
    );
    const prevA = this.batAPrev, prevB = this.batTipPrev;
    const hitDistance = (p: CANNON.Vec3) => Math.sqrt(pan
      ? segmentDistanceSquared(p, this.panCenterPrev, panHitCenter)
      : sweptSegmentDistanceSquared(p, prevA, prevB, a, b));
    // Different parts of a rotating bat move at different speeds. Compute
    // the local velocity at the point of contact, not just at the far tip.
    const impactVelocity = (point: CANNON.Vec3) => {
      if (pan) return _impactVelocity.set((panHitCenter.x - this.panCenterPrev.x) / h, (panHitCenter.y - this.panCenterPrev.y) / h, (panHitCenter.z - this.panCenterPrev.z) / h);
      const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
      const length2 = vx * vx + vy * vy + vz * vz;
      const u = length2 > 1e-10 ? clamp(((point.x - a.x) * vx + (point.y - a.y) * vy + (point.z - a.z) * vz) / length2, 0, 1) : 0;
      const px = prevA.x + (prevB.x - prevA.x) * u;
      const py = prevA.y + (prevB.y - prevA.y) * u;
      const pz = prevA.z + (prevB.z - prevA.z) * u;
      return _impactVelocity.set((a.x + vx * u - px) / h, (a.y + vy * u - py) / h, (a.z + vz * u - pz) / h);
    };
    const nearest = pan || this.hitSet.size > 0 ? null : this.nearestMeleeTarget(2.3);
    for (const c of Character.all) {
      if (c === this || !c.alive || c.removed || this.hitSet.has(c) || (!pan && c !== nearest)) continue;
      for (const body of [c.head, c.torso]) {
        let struck = false, radius = 0;
        for (let i = 0; i < body.shapes.length; i++) {
          const shape = body.shapes[i];
          if (!(shape instanceof CANNON.Sphere)) continue;
          body.pointToWorldFrame(body.shapeOffsets[i], _attackCenter);
          const distance = hitDistance(_attackCenter);
          const closeAssist = !pan && body === c.torso && e >= SWING_WINDUP + 0.08 && distance <= shape.radius + 0.32;
          if (distance <= shape.radius + (pan ? 0.47 : 0.12) || closeAssist) { struck = true; radius = shape.radius; break; }
        }
        if (!struck) continue;
        const impact = impactVelocity(_attackCenter);
        let kx = impact.x - body.velocity.x, kz = impact.z - body.velocity.z;
        const impactSpeed = Math.hypot(kx, kz);
        if (impactSpeed < 2) {
          kx = c.torso.position.x - this.torso.position.x;
          kz = c.torso.position.z - this.torso.position.z;
        }
        const l = Math.hypot(kx, kz) || 1;
        kx /= l; kz /= l;
        if (!pan) {
          // Preserve the sideward swing, but direct the main shove away from
          // the attacker rather than accidentally pulling the victim inward.
          let awayX = c.torso.position.x - this.torso.position.x;
          let awayZ = c.torso.position.z - this.torso.position.z;
          const awayLength = Math.hypot(awayX, awayZ);
          if (awayLength > 1e-5) { awayX /= awayLength; awayZ /= awayLength; }
          else { awayX = Math.sin(this.facing); awayZ = Math.cos(this.facing); }
          const inward = Math.min(0, kx * awayX + kz * awayZ);
          kx = (kx - inward * awayX) * 0.55 + awayX * 0.85;
          kz = (kz - inward * awayZ) * 0.55 + awayZ * 0.85;
          const norm = Math.hypot(kx, kz) || 1;
          kx /= norm; kz /= norm;
        }
        const kd = _kd.set(kx, 0, kz);
        const power = clamp(impactSpeed / 12, 0.8, 1.1);
        const damage = pan ? 32 : 38;
        // Apply one coherent impulse to the ragdoll, with a smaller localized
        // impulse at the actual contacted sphere for natural rotation.
        // Use the closest point on the current weapon as a contact estimate.
        if (pan) _weaponContact.copy(panHitCenter);
        else {
          const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
          const length2 = vx * vx + vy * vy + vz * vz;
          const u = length2 > 1e-10 ? clamp(((_attackCenter.x - a.x) * vx + (_attackCenter.y - a.y) * vy + (_attackCenter.z - a.z) * vz) / length2, 0, 1) : 0;
          _weaponContact.set(a.x + vx * u, a.y + vy * u, a.z + vz * u);
        }
        _weaponContact.vsub(_attackCenter, _meleeOffset);
        const contactDistance = _meleeOffset.length();
        if (contactDistance > 1e-6) _meleeOffset.scale(radius / contactDistance, _meleeOffset);
        _attackCenter.vadd(_meleeOffset, _attackPoint);
        if (!this.meleePathClear(this.batGrip, _attackPoint, c)) continue;
        this.hitSet.add(c);
        // A weapon blow has to land harder than a paw: the pan used to be the
        // weakest hit in the game, which is what made it feel like a soft tap.
        c.receiveHit(this, damage, kd, (pan ? 13.5 : 15.5) * power, body, _attackPoint, pan ? "pan" : "bat");
        c.knockAccessory(kd);
        c.squashV -= pan ? 6.5 : 8;
        this.hooks.onHit(this, c, _sock.copy(_attackPoint), damage, pan ? "pan" : "bat");
        break;
      }
    }
    for (const pb of this.world.bodies) {
      if (pb.type !== CANNON.Body.DYNAMIC || bodyOwner.has(pb) || pb.mass > 6) continue;
      if (Character.bats.some((bt) => bt.body === pb)) continue;
      if (hitDistance(pb.position) > (pan ? 0.8 : 0.6) || this.swingPropsHit.has(pb)) continue;
      this.swingPropsHit.add(pb);
      const impact = impactVelocity(pb.position);
      let dx = impact.x - pb.velocity.x, dz = impact.z - pb.velocity.z;
      let speed = Math.hypot(dx, dz);
      if (speed < 0.5) {
        dx = pb.position.x - this.torso.position.x;
        dz = pb.position.z - this.torso.position.z;
        speed = Math.hypot(dx, dz) || 1;
      }
      const impulse = (pan ? 4.6 : 4.2) * pb.mass;
      _imp.set(dx / speed * impulse, pb.mass * (pan ? 2.2 : 2.6), dz / speed * impulse);
      pb.applyImpulse(_imp);
      Character.thrownProps.push({ body: pb, by: this, t: 1.2 });
    }
  }

  /** being carried overhead: kick & wave cutely instead of T-posing */
  private flail() {
    const t = this.torso;
    const up = t.quaternion.vmult(Y, _flUp);
    const fw = t.quaternion.vmult(Z, _flFw);
    const lf = up.cross(fw, _flLf);
    const T = this.time;
    for (const arm of ["armL", "armR"] as const) {
      const s = arm === "armL" ? 1 : -1;
      const sh = t.pointToWorldFrame(arm === "armL" ? SHOULDER_L : SHOULDER_R, _flSh);
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
      const hp = t.pointToWorldFrame(hip, _flSh);
      const k = Math.sin(T * 15 + off);
      const tx = hp.x - up.x * 0.32 + fw.x * 0.18 * k;
      const ty = hp.y - up.y * 0.32 + fw.y * 0.18 * k;
      const tz = hp.z - up.z * 0.32 + fw.z * 0.18 * k;
      this.driveLimb(leg, FOOT, tx, ty, tz, 260, 16, 0.3);
    }
  }

  /** Per sub-step hold maintenance (break / lift assist). */
  updateHolds(h: number) {
    this.selfCollide();
    // Keep the same hang the menu shows: the asset cat's mittens face forward
    // with the elbow bow out to the side, not spun 90 degrees.
    if (getShapeMode() === "asset") {
      stabilizeArmRotation(this.armL, this.torso, h, bowTarget(this.torso, ARM_BOW_TWIST, _bowL));
      stabilizeArmRotation(this.armR, this.torso, h, bowTarget(this.torso, -ARM_BOW_TWIST, _bowR));
    } else {
      stabilizeArmRotation(this.armL, this.torso, h);
      stabilizeArmRotation(this.armR, this.torso, h);
    }
    this.batHits(h);
    this.sweepPunch();
    if (this.lifting) this.liftT = Math.min(1.5, this.liftT + h / 0.38);
    let seenKey: unknown = null;
    let seenSet = false;
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
        if (seenSet && seenKey === key) continue; // both arms hold the same thing: assist once
        seenSet = true;
        seenKey = key;
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
        const lim = m * 45;
        const fx = clamp(m * ((tx - target.position.x) * 24 - (target.velocity.x - this.torso.velocity.x) * 9), -lim, lim);
        const fy = clamp(m * ((ty - target.position.y) * 24 - (target.velocity.y - this.torso.velocity.y) * 9 + GRAVITY), -lim, lim);
        const fz = clamp(m * ((tz - target.position.z) * 24 - (target.velocity.z - this.torso.velocity.z) * 9), -lim, lim);
        // Accelerate the entire carried ragdoll together rather than yanking
        // its torso away from its head and limbs at every substep.
        const parts = hd.owner ? hd.owner.parts : [target];
        for (const part of parts) {
          const weight = hd.owner ? part.mass / hd.owner.totalMass : 1;
          part.force.x += fx * weight;
          part.force.y += fy * weight;
          part.force.z += fz * weight;
        }
        this.torso.force.x -= fx * 0.55;
        this.torso.force.y -= fy * 0.55;
        this.torso.force.z -= fz * 0.55;
      }
    }
  }

  /** rotate the carried cat so it lies across our shoulders, belly up (like an overhead wrestling carry) */
  private alignCarried(o: Character, f: CANNON.Vec3) {
    // desired basis: body axis (+Y) along our left/right, belly (+Z) facing the sky
    const yA = _acY.set(f.z, 0, -f.x).normalize();
    const zA = _acZ.set(0, 1, 0);
    const xA = _acX.crossVectors(yA, zA);
    _m4.makeBasis(xA, yA, zA);
    _tq.setFromRotationMatrix(_m4);
    const dq = _acQ.set(_tq.x, _tq.y, _tq.z, _tq.w);
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
    for (const part of SYNC_BODIES) {
      const b = this[part];
      const o = this.visual[part];
      o.position.set(b.position.x, b.position.y, b.position.z);
      o.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    // pin every limb exactly onto its socket (physics joints can stretch a little under big forces)
    {
      const sqv = this.down ? 0 : this.squash;
      const sxz = 1 - sqv * 0.55, sy = 1 + sqv;
      for (const limb of LIMB_SOCKETS) {
        const o = this.visual[limb];
        const piv = limb === "armL" ? SHOULDER_L : limb === "armR" ? SHOULDER_R : limb === "legL" ? HIP_L : HIP_R;
        _v3.set(piv.x * sxz, piv.y * sy, piv.z * sxz);
        _sock.set(_v3.x, _v3.y, _v3.z);
        const sock = this.torso.pointToWorldFrame(_sock, v1);
        // Pinning a stretched physics joint can otherwise pull the rendered
        // paw back through the chest. Rotate the visual arm around its socket
        // toward the nearest safe point; do not disturb a held weapon/grip.
        if ((limb === "armL" || limb === "armR") && !this.weapon && !this.holds[limb]) {
          _armDir.set(0, HAND.y - LIMB_TOP.y, 0).applyQuaternion(o.quaternion);
          _sw.set(sock.x + _armDir.x, sock.y + _armDir.y, sock.z + _armDir.z);
          this.torso.pointToLocalFrame(_sw, _sl);
          if (rig.pushOut(_sl, this.pawR * 0.9, this.vols.torso)) {
            const sign = limb === "armL" ? 1 : -1;
            _sl.x = sign * Math.max(sign * _sl.x, Math.abs(piv.x) + 0.035);
            this.torso.pointToWorldFrame(_sl, _sw);
            _armGoal.set(_sw.x - sock.x, _sw.y - sock.y, _sw.z - sock.z).normalize();
            _armCorrection.setFromUnitVectors(_armDir.normalize(), _armGoal);
            // A bounded correction avoids snapping on extreme ragdoll poses.
            const angle = 2 * Math.acos(clamp(_armCorrection.w, -1, 1));
            if (angle > 0.7) {
              _armIdentity.identity().rotateTowards(_armCorrection, 0.7);
              _armCorrection.copy(_armIdentity);
            }
            o.quaternion.premultiply(_armCorrection);
          }
        }
        // The asset cat's physics arm is pushed a few degrees outward by its
        // own self-collision (the paw rides right beside the belly), which made
        // it look stiff and splayed next to the relaxed menu pose. While the
        // arm is simply hanging, ease the *rendered* arm back to the menu hang;
        // a punch, a swing or a weapon grip is untouched.
        if (getShapeMode() === "asset" && !this.weapon && !this.holds[limb] && !this.down) {
          const sign = limb === "armL" ? 1 : -1;
          _hangEuler.set(0.08, 0, sign * 0.05);
          _hangGoal.setFromEuler(_hangEuler).multiply(_palmOrientation.setFromAxisAngle(_palmAxis, -sign * 0.32));
          _hangTorso.set(this.torso.quaternion.x, this.torso.quaternion.y, this.torso.quaternion.z, this.torso.quaternion.w);
          _hangGoal.premultiply(_hangTorso);
          _armDir.set(0, HAND.y - LIMB_TOP.y, 0).applyQuaternion(o.quaternion);
          _hangDown.copy(_armDir).normalize();
          // how upright is the arm? 1 = hanging straight down
          const hang = -_hangDown.y;
          if (hang > 0.72) {
            o.quaternion.slerp(_hangGoal, 0.55 * Math.min(1, (hang - 0.72) / 0.2));
          }
        }
        // In figurine mode the palm points inward just as in the preview.
        // This is a fixed local orientation, not an animated arm twist; the
        // original pads and colors stay on the same side of the paw.
        if (getShapeMode() === "figure" && (limb === "armL" || limb === "armR") && !this.weapon && !this.holds[limb]) {
          o.quaternion.multiply(_palmOrientation.setFromAxisAngle(_palmAxis, limb === "armL" ? -1.1 : 1.1));
        }
        _v3b.set(LIMB_TOP.x, LIMB_TOP.y, LIMB_TOP.z).applyQuaternion(o.quaternion);
        o.position.set(sock.x - _v3b.x, sock.y - _v3b.y, sock.z - _v3b.z);
      }
    }
    // head always sits on the neck (+ blended toward the torso orientation so it never looks broken)
    {
      const vh = this.visual.head;
      const gq = this.down || this.removed ? this.torso.quaternion : this.headGoal;
      _tq.set(gq.x, gq.y, gq.z, gq.w);
      vh.quaternion.slerp(_tq, this.down ? 0.15 : 0.4);
      _neckA.set(rig.NECK_A[0], rig.NECK_A[1], rig.NECK_A[2]);
      const neck = this.torso.pointToWorldFrame(_neckA, v1);
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
    if (this.expr === "normal") animateBlink(this.visual, this.time, this.index * 1.13 + 0.6);
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
      // Small saccades keep the eyes alive even while the head tracks a target.
      const gx = clamp(ax / 0.32 + Math.sin(this.time * 2.6 + this.index * 1.7) * 0.18, -1, 1);
      const gy = clamp(ay / 0.3 + Math.sin(this.time * 1.7 + this.index) * 0.15, -1, 1);
      this.pupX += (gx - this.pupX) * 0.18;
      this.pupY += (gy - this.pupY) * 0.18;
      for (const p of this.visual.pupils) {
        setPupilGaze(p, this.pupX, this.pupY);
      }
    }
    // squash & stretch (torso scales, head rides on top of it)
    const sq = this.down ? 0 : this.squash;
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
      _weaponDir.set(d.x, d.y, d.z).normalize();
      _v3.set(g.x, g.y, g.z);
      if (this.down || this.recoveryT > 0) {
        // The weapon stays in the rendered paw as the ragdoll tumbles; blend
        // smoothly back to the two-handed grip while standing up.
        const arm = this.visual.armR;
        _fallGrip.set(HAND.x, HAND.y, HAND.z).applyQuaternion(arm.quaternion).add(arm.position);
        _fallDir.set(0, -1, 0).applyQuaternion(arm.quaternion).normalize();
        const blend = this.down ? 1 : clamp(this.recoveryT / 0.55, 0, 1);
        _v3.lerp(_fallGrip, blend);
        _weaponDir.lerp(_fallDir, blend);
        if (_weaponDir.lengthSq() < 1e-8) _weaponDir.copy(_fallDir);
        _weaponDir.normalize();
      }
      m.position.copy(_v3).addScaledVector(_weaponDir, this.weapon.centerOffset);
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
    this.nameTag.position.set(hp.x, hp.y + this.headTop + 0.23 + (this.accKind === "helmet" || this.accKind === "crown" ? 0.1 : this.accKind.startsWith("cap") ? 0.07 : 0), hp.z);
    this.nameTag.visible = this.alive;
    if (this.teamRing) {
      const tp = this.torso.position;
      const onDeck = this.groundDist < 2.5;
      this.teamRing.visible = this.alive && onDeck;
      if (this.teamRing.visible) {
        this.teamRing.position.set(tp.x, tp.y - this.groundDist + 0.02 + Math.sin(this.time * 3) * 0.005, tp.z);
      }
    }
    if (this.stars.visible) {
      this.stars.position.set(hp.x, hp.y + this.headTop, hp.z);
      this.stars.children.forEach((s, i) => {
        const a = this.time * 5 + (i * Math.PI * 2) / 4;
        s.position.set(Math.cos(a) * 0.4, Math.sin(this.time * 8 + i) * 0.05, Math.sin(a) * 0.4);
        s.rotation.y = this.time * 6;
      });
    }
  }

  /** Freeze below the deck while waiting to respawn (teams mode). */
  parkForRespawn() {
    for (const b of this.parts) {
      b.type = CANNON.Body.STATIC;
      b.velocity.setZero();
      b.angularVelocity.setZero();
      if (b.position.y > -8) b.position.y = -8;
    }
    this.alive = false;
    this.root.visible = false;
    this.stars.visible = false;
  }

  /** Come back to life at a spot on the deck with a fresh body state. */
  respawnAt(x: number, y: number, z: number, yaw: number) {
    for (const r of this.restPose) r.body.type = CANNON.Body.DYNAMIC;
    // the hover spring holds the torso HOVER above the deck; spawning lower
    // makes it fire one huge corrective kick (the cat pops like a cork)
    this.torso.position.set(x, y + HOVER, z);
    this.torso.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    // NOTE: cannon's pointToWorldFrame clobbers `this.position` when the
    // result aliases it, so every write goes through scratch vectors.
    const wp = new CANNON.Vec3();
    const wq = new CANNON.Quaternion();
    for (const r of this.restPose) {
      const b = r.body;
      this.torso.pointToWorldFrame(r.local, wp);
      b.position.copy(wp);
      this.torso.quaternion.mult(r.localQ, wq);
      b.quaternion.copy(wq);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.force.setZero();
      b.wakeUp();
    }
    this.facing = yaw;
    this.alive = true;
    this.koTimer = 0;
    this.dizzy = 0;
    this.hurtT = 0;
    this.punchTimer = 0;
    this.swingTimer = 0;
    this.dropkickTimer = 0;
    this.headbuttTimer = 0;
    this.respawnT = 0;
    this.walkPhase = 0;
    this.squash = 0;
    this.squashV = 0;
    this.releaseAll(false);
    this.stars.visible = false;
    this.root.visible = true;
  }

  removeFromWorld() {
    if (this.removed) return;
    this.cancelWeaponContest();
    this.releaseAll(false);
    this.throwWeapon(false);
    for (const j of this.joints) this.world.removeConstraint(j);
    for (const b of this.parts) this.world.removeBody(b);
    this.removed = true;
    this.root.visible = false;
  }
}

function makeTeamRing(team: number) {
  if (team < 0) return null;
  const geo = new THREE.RingGeometry(0.36, 0.58, 44);
  const mat = new THREE.MeshBasicMaterial({
    color: team === 0 ? 0xe8343c : 0x2f6fe0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  return ring;
}

function makeNameTag(text: string, human: boolean, slot: number, team = -1, flag = "id") {
  const W = 352;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 30px system-ui, sans-serif";
  g.textBaseline = "middle";
  const tw = g.measureText(text).width;
  const FLAG_W = 36;
  const FLAG_H = 25;
  const gap = 9;
  const total = tw + gap + FLAG_W;
  const startX = (W - total) / 2;
  // name
  g.textAlign = "left";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, startX, 34);
  // team matches dye the name so you can tell friend from foe at a glance
  g.fillStyle = human
    ? slot === 1 ? "#ffd23f" : "#6ee7ff"
    : team < 0 ? "#ffffff" : team === 0 ? "#ff9c9c" : "#93c2ff";
  g.fillText(text, startX, 34);
  // country flag right of the name
  drawFlag(g, flag, startX + tw + gap, 34 - FLAG_H / 2, FLAG_W, FLAG_H);
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 2;
  g.strokeRect(startX + tw + gap + 1, 34 - FLAG_H / 2 + 1, FLAG_W - 2, FLAG_H - 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.2, 0.4, 1);
  sp.renderOrder = 10;
  return sp;
}
