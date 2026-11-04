import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { Character } from "./Character";
import type { Arena } from "./Arena";
import { sfx } from "./audio";

export const BOMB_R = 0.34;
export const BLAST_R = 3.4;

export interface Bomb {
  body: CANNON.Body;
  root: THREE.Group;
  ring: THREE.Mesh;
  spark: THREE.Sprite;
  lampMat: THREE.MeshStandardMaterial;
  fuse: number;
  fuseMax: number;
  beepT: number;
  chainT: number;
  thrower: Character | null;
  dead: boolean;
  seed: number;
}

export interface BombEvents {
  onExplode(pos: THREE.Vector3, thrower: Character | null): void;
  onSpawned(total: number): void;
}

let sparkTex: THREE.CanvasTexture | null = null;
function getSparkTex() {
  if (sparkTex) return sparkTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,220,120,1)");
  grd.addColorStop(0.7, "rgba(255,140,40,0.7)");
  grd.addColorStop(1, "rgba(255,80,20,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(c);
  sparkTex.colorSpace = THREE.SRGBColorSpace;
  return sparkTex;
}

// shared bomb assets: built once, reused by every bomb (no per-spawn GPU churn)
let bombShared: {
  bodyGeo: THREE.SphereGeometry;
  bodyMat: THREE.MeshStandardMaterial;
  hlGeo: THREE.SphereGeometry;
  hlMat: THREE.MeshBasicMaterial;
  patchGeo: THREE.SphereGeometry;
  patchMat: THREE.MeshStandardMaterial;
  eyeGeo: THREE.SphereGeometry;
  eyeMat: THREE.MeshBasicMaterial;
  noseGeo: THREE.SphereGeometry;
  capGeo: THREE.CylinderGeometry;
  capMat: THREE.MeshStandardMaterial;
  fuseGeo: THREE.TubeGeometry;
  fuseMat: THREE.MeshStandardMaterial;
  sparkMat: THREE.SpriteMaterial;
  lampGeo: THREE.SphereGeometry;
  ringGeo: THREE.RingGeometry;
} | null = null;
function getBombShared() {
  if (bombShared) return bombShared;
  const fuseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, BOMB_R + 0.05, 0),
    new THREE.Vector3(0.09, BOMB_R + 0.2, 0.02),
    new THREE.Vector3(0.03, BOMB_R + 0.32, -0.04),
  ]);
  bombShared = {
    bodyGeo: new THREE.SphereGeometry(BOMB_R, 24, 18),
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x262a35, roughness: 0.35, metalness: 0.4 }),
    hlGeo: new THREE.SphereGeometry(0.09, 10, 8),
    hlMat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    patchGeo: new THREE.SphereGeometry(0.14, 16, 12),
    patchMat: new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.6 }),
    eyeGeo: new THREE.SphereGeometry(0.035, 8, 6),
    eyeMat: new THREE.MeshBasicMaterial({ color: 0x1c1e24 }),
    noseGeo: new THREE.SphereGeometry(0.02, 8, 6),
    capGeo: new THREE.CylinderGeometry(0.09, 0.11, 0.09, 14),
    capMat: new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.5, metalness: 0.5 }),
    fuseGeo: new THREE.TubeGeometry(fuseCurve, 8, 0.022, 6),
    fuseMat: new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }),
    sparkMat: new THREE.SpriteMaterial({ map: getSparkTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    lampGeo: new THREE.SphereGeometry(0.06, 10, 8),
    ringGeo: new THREE.RingGeometry(BLAST_R - 0.35, BLAST_R, 48),
  };
  return bombShared;
}

function makeBombMesh(): { root: THREE.Group; spark: THREE.Sprite; lampMat: THREE.MeshStandardMaterial } {
  const S = getBombShared();
  const root = new THREE.Group();
  // body
  const body = new THREE.Mesh(S.bodyGeo, S.bodyMat);
  body.castShadow = true;
  root.add(body);
  // glossy highlight
  const hl = new THREE.Mesh(S.hlGeo, S.hlMat);
  hl.position.set(-0.14, 0.2, 0.2);
  hl.scale.set(1, 1.3, 0.4);
  root.add(hl);
  // cute skull face on the front (+z)
  const patch = new THREE.Mesh(S.patchGeo, S.patchMat);
  patch.position.set(0, -0.02, BOMB_R - 0.03);
  patch.scale.set(1, 1.1, 0.35);
  root.add(patch);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(S.eyeGeo, S.eyeMat);
    eye.position.set(s * 0.055, 0.02, BOMB_R + 0.015);
    root.add(eye);
  }
  const nose = new THREE.Mesh(S.noseGeo, S.eyeMat);
  nose.position.set(0, -0.05, BOMB_R + 0.02);
  root.add(nose);
  // cap + fuse
  const cap = new THREE.Mesh(S.capGeo, S.capMat);
  cap.position.y = BOMB_R + 0.02;
  root.add(cap);
  const fuse = new THREE.Mesh(S.fuseGeo, S.fuseMat);
  root.add(fuse);
  // burning spark
  const spark = new THREE.Sprite(S.sparkMat);
  spark.position.set(0.03, BOMB_R + 0.36, -0.04);
  spark.scale.setScalar(0.3);
  root.add(spark);
  // blinking red warning light on the side (own material: animated per bomb)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2, roughness: 0.4 });
  const lamp = new THREE.Mesh(S.lampGeo, lampMat);
  lamp.position.set(BOMB_R - 0.02, 0.12, 0.12);
  root.add(lamp);
  return { root, spark, lampMat };
}

export class BombManager {
  bombs: Bomb[] = [];
  private spawnT = 8;
  private elapsed = 0;
  private time = 0;

  constructor(
    private world: CANNON.World,
    private scene: THREE.Scene,
    private groundMat: CANNON.Material,
    private events: BombEvents
  ) {}

  get live(): Bomb[] {
    return this.bombs.filter((b) => !b.dead);
  }

  reset(round: number) {
    this.clear();
    this.elapsed = 0;
    this.spawnT = 8;
    const base = Math.min(2 + (round - 1), 4);
    for (let i = 0; i < base; i++) this.spawn(true);
  }

  isBombBody(body: CANNON.Body): Bomb | null {
    return this.bombs.find((b) => !b.dead && b.body === body) ?? null;
  }

  spawn(initial = false) {
    // random safe landing spot
    const arena = (this as unknown as { arenaRef?: Arena }).arenaRef;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 4.5;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (!arena || arena.isSafe(x, z, 0.4)) break;
    }
    const body = new CANNON.Body({ mass: 1.4, material: this.groundMat, linearDamping: 0.05, angularDamping: 0.2 });
    body.addShape(new CANNON.Sphere(BOMB_R));
    body.position.set(x, initial ? 0.6 : 7, z);
    body.velocity.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    this.world.addBody(body);
    const { root, spark, lampMat } = makeBombMesh();
    root.position.copy(body.position as unknown as THREE.Vector3);
    this.scene.add(root);
    // red danger ring on the ground showing the blast radius (shared geo, own material for pulse)
    const ring = new THREE.Mesh(
      getBombShared().ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xff3d4e, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.scene.add(ring);
    const fuseMax = 6.5 + Math.random() * 2;
    this.bombs.push({
      body,
      root,
      ring,
      spark,
      lampMat,
      fuse: fuseMax,
      fuseMax,
      beepT: 0.4,
      chainT: 0,
      thrower: null,
      dead: false,
      seed: Math.random() * 10,
    });
    if (!initial) {
      sfx.bombDrop();
      this.events.onSpawned(this.live.length);
    }
  }

  update(dt: number, playing: boolean, chars: Character[], arena: Arena) {
    (this as unknown as { arenaRef?: Arena }).arenaRef = arena;
    this.time += dt;
    const time = this.time;
    // track holders (for kill credit + hot-potato risk)
    for (const b of this.bombs) {
      if (b.dead) continue;
      for (const c of chars) {
        if (!c.alive || c.removed) continue;
        if (c.holds.armL?.body === b.body || c.holds.armR?.body === b.body) {
          b.thrower = c;
          break;
        }
      }
    }
    if (playing) {
      this.elapsed += dt;
      // escalating spawner: faster + more bombs over time
      const interval = Math.max(3.5, 9 - this.elapsed * 0.12);
      const maxActive = Math.min(6, 2 + Math.floor(this.elapsed / 22));
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        if (this.live.length < maxActive) this.spawn();
        this.spawnT = interval;
      }
      // fuses
      for (const b of [...this.bombs]) {
        if (b.dead) continue;
        if (b.chainT > 0) {
          b.chainT -= dt;
          if (b.chainT <= 0) {
            this.explode(b);
            continue;
          }
        }
        b.fuse -= dt;
        // accelerating beeps
        const urgency = 1 - b.fuse / b.fuseMax;
        b.beepT -= dt;
        if (b.beepT <= 0) {
          sfx.beep(b.fuse < 1.5);
          b.beepT = 0.5 - urgency * 0.42;
        }
        if (b.fuse <= 0) this.explode(b);
      }
    }
    // visuals + cleanup
    for (const b of [...this.bombs]) {
      if (b.dead) continue;
      const p = b.body.position;
      if (p.y < -30) {
        this.remove(b);
        continue;
      }
      b.root.position.set(p.x, p.y, p.z);
      b.root.quaternion.set(b.body.quaternion.x, b.body.quaternion.y, b.body.quaternion.z, b.body.quaternion.w);
      const urgency = 1 - b.fuse / b.fuseMax;
      // blink faster as it gets closer
      const blinkFast = 4 + urgency * 26;
      const on = Math.sin((time + b.seed) * blinkFast) > -0.2;
      b.lampMat.emissiveIntensity = on ? 3.2 : 0.15;
      const sparkS = 0.26 + urgency * 0.3 + (on ? 0.08 : 0);
      b.spark.scale.setScalar(sparkS);
      // nervous shaking when about to blow
      if (b.fuse < 1.2 && playing) {
        b.root.position.x += (Math.random() - 0.5) * 0.05;
        b.root.position.y += (Math.random() - 0.5) * 0.05;
      }
      // danger ring follows on the ground
      b.ring.position.set(p.x, arena.surfaceHeight(p.z) + 0.04, p.z);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.18 * Math.sin(time * 6 + b.seed) + urgency * 0.15;
      b.ring.visible = p.y > -2;
    }
  }

  explode(bomb: Bomb) {
    if (bomb.dead) return;
    bomb.dead = true;
    const pos = new THREE.Vector3(bomb.body.position.x, bomb.body.position.y, bomb.body.position.z);
    const thrower = bomb.thrower;
    // chain-detonate neighbours (slight delay = rolling booms, super fun)
    for (const o of this.bombs) {
      if (o.dead || o === bomb) continue;
      const d = o.body.position.distanceTo(bomb.body.position);
      if (d < BLAST_R + 0.6 && o.chainT <= 0 && o.fuse > 0.15) o.chainT = 0.15;
    }
    this.remove(bomb);
    this.events.onExplode(pos, thrower);
  }

  private remove(b: Bomb) {
    b.dead = true;
    if (this.world.bodies.includes(b.body)) this.world.removeBody(b.body);
    this.scene.remove(b.root);
    this.scene.remove(b.ring);
    b.lampMat.dispose();
    (b.ring.material as THREE.Material).dispose();
    this.bombs = this.bombs.filter((x) => x !== b);
  }

  private clear() {
    for (const b of [...this.bombs]) this.remove(b);
  }

  dispose() {
    this.clear();
  }
}
