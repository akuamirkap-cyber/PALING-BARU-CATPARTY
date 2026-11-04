import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { Character } from "./Character";

export interface BombHooks {
  onExplode: (bomb: Bomb, hits: number) => void;
  onWave: (count: number) => void;
}

export interface Bomb {
  id: number;
  body: CANNON.Body;
  mesh: THREE.Group;
  fuse: number;
  maxFuse: number;
  lastHeld: Character | null;
  thrower: Character | null;
  chain: boolean;
  exploded: boolean;
  sparkT: number;
}

const BOMB_R = 0.27;
/** every live bomb body (used to give bombs a shorter, more accurate throw) */
export const bombBodies = new WeakSet<CANNON.Body>();

function bombMesh(): { g: THREE.Group; spark: THREE.Mesh; ring: THREE.Mesh; bodyMat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2c3a, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, metalness: 0.15 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BOMB_R, 28, 20), bodyMat);
  ball.castShadow = true;
  g.add(ball);
  // glossy highlight
  const shine = new THREE.Mesh(new THREE.SphereGeometry(BOMB_R * 0.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(-BOMB_R * 0.38, BOMB_R * 0.45, BOMB_R * 0.62);
  g.add(shine);
  // cute face
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dark = new THREE.MeshBasicMaterial({ color: 0x11121a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(BOMB_R * 0.22, 14, 10), white);
    eye.position.set(sx * BOMB_R * 0.32, BOMB_R * 0.12, BOMB_R * 0.86);
    eye.scale.set(0.85, 1.1, 0.35);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(BOMB_R * 0.11, 10, 8), dark);
    pupil.position.set(sx * BOMB_R * 0.32, BOMB_R * 0.1, BOMB_R * 0.98);
    pupil.scale.set(0.8, 1, 0.35);
    g.add(pupil);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(BOMB_R * 0.15, BOMB_R * 0.035, 5, 12, Math.PI), dark);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -BOMB_R * 0.16, BOMB_R * 0.93);
  g.add(mouth);
  // fuse
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0xd9b27a, roughness: 0.9 });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.16, 8), fuseMat);
  fuse.position.set(0, BOMB_R + 0.06, 0);
  fuse.rotation.z = 0.35;
  g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  spark.position.set(0.05, BOMB_R + 0.16, 0);
  g.add(spark);
  // timer ring under the bomb
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(BOMB_R * 1.5, 0.032, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0x7cf0ff, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -BOMB_R + 0.02;
  g.add(ring);
  return { g, spark, ring, bodyMat };
}

function shockMesh() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 22, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false })
  );
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  wave.rotation.x = -Math.PI / 2;
  g.add(core, wave);
  g.visible = false;
  return { g, core, wave };
}

export class BombSystem {
  world: CANNON.World;
  scene: THREE.Scene;
  hooks: BombHooks;
  bombs: Bomb[] = [];
  waves: { g: THREE.Group; core: THREE.Mesh; outer: THREE.Mesh; t: number; radius: number }[] = [];
  timer = 2.2;
  alive = 0;
  wave = 0;
  maxBombs = 2;
  nextWave = 14;
  id = 1;
  intensity = 1;

  constructor(world: CANNON.World, scene: THREE.Scene, hooks: BombHooks, intensity = 1) {
    this.world = world;
    this.scene = scene;
    this.hooks = hooks;
    this.intensity = intensity;
  }

  reset() {
    for (const b of this.bombs) {
      if (this.world.bodies.includes(b.body)) this.world.removeBody(b.body);
      b.mesh.removeFromParent();
    }
    this.bombs = [];
    for (const w of this.waves) w.g.removeFromParent();
    this.waves = [];
    this.timer = this.intensity > 1 ? 1.2 : 3;
    this.alive = 0;
    this.wave = 0;
    this.maxBombs = this.intensity > 1 ? 3 : 2;
    this.nextWave = this.intensity > 1 ? 9 : 16;
  }

  spawn(safe: (x: number, z: number) => boolean, chars: Character[]) {
    const maxHalf = 5.2;
    let x = 0, z = 0;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 3.4;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (!safe(x, z)) continue;
      const far = chars.every((c) => Math.hypot(c.position.x - x, c.position.z - z) > 1.4);
      if (far) break;
    }
    if (!safe(x, z)) return;
    const body = new CANNON.Body({
      mass: 1.1,
      linearDamping: 0.12,
      angularDamping: 0.25,
      shape: new CANNON.Sphere(BOMB_R),
    });
    body.position.set(x, 6.5, z);
    body.velocity.set(0, -1, 0);
    body.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    this.world.addBody(body);
    bombBodies.add(body);
    const { g, spark, ring, bodyMat } = bombMesh();
    g.position.set(x, 6.5, z);
    this.scene.add(g);
    const fuse = Math.max(4.2, 7.5 - this.wave * 0.32) + Math.random() * 1.6;
    this.bombs.push({
      id: this.id++,
      body,
      mesh: g,
      fuse,
      maxFuse: fuse,
      lastHeld: null,
      thrower: null,
      chain: false,
      exploded: false,
      sparkT: 0,
      // @ts-expect-error extra render handles kept for animation
      spark,
      ring,
      bodyMat,
    });
    void maxHalf;
  }

  private detach(bomb: Bomb, chars: Character[]) {
    for (const c of chars) {
      for (const arm of ["armL", "armR"] as const) {
        const h = c.holds[arm];
        if (h && h.body === bomb.body) {
          this.world.removeConstraint(h.c);
          c.holds[arm] = null;
        }
      }
      if (!c.holds.armL && !c.holds.armR) c.lifting = false;
    }
  }

  explode(bomb: Bomb, chars: Character[]) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    if (this.world.bodies.includes(bomb.body)) this.world.removeBody(bomb.body);
    bomb.mesh.removeFromParent();
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.detach(bomb, chars);

    const p = bomb.body.position;
    const radius = 3.2;
    let hits = 0;
    for (const c of chars) {
      if (!c.alive || c.removed) continue;
      const dx = c.torso.position.x - p.x;
      const dy = c.torso.position.y - p.y;
      const dz = c.torso.position.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      hits++;
      const k = 1 - d / radius;
      const l = Math.hypot(dx, dz) || 1;
      const dir = new CANNON.Vec3(dx / l, 0, dz / l);
      const by = bomb.thrower && bomb.thrower !== c ? bomb.thrower : c;
      // damage is high, but the knockback is tuned to stay on the arena (2-4 m blast)
      c.receiveHit(by, 14 + 26 * k, dir, 2.2 + 2.2 * k, c.torso);
      for (const pb of c.parts) {
        pb.velocity.x += dir.x * (1.6 + 2.4 * k);
        pb.velocity.z += dir.z * (1.6 + 2.4 * k);
        pb.velocity.y += 2.2 + 2 * k;
      }
      c.torso.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 10);
      c.squashV -= 6;
      c.hurtT = Math.max(c.hurtT, 0.6 + k * 0.6);
    }
    // chain reaction
    for (const other of this.bombs) {
      if (other === bomb || other.exploded) continue;
      const d = Math.hypot(other.body.position.x - p.x, other.body.position.z - p.z);
      if (d < radius + 0.7) {
        other.chain = true;
        other.fuse = Math.min(other.fuse, 0.22 + Math.random() * 0.25);
        other.thrower = other.thrower ?? bomb.thrower;
      }
    }
    // launch nearby loose props / bats
    for (const b of this.world.bodies) {
      if (b === bomb.body || b.mass <= 0) continue;
      const d = Math.hypot(b.position.x - p.x, b.position.z - p.z);
      if (d > radius || b.type !== CANNON.Body.DYNAMIC) continue;
      const k = 1 - d / radius;
      b.velocity.x += ((b.position.x - p.x) / (d || 1)) * 6 * k;
      b.velocity.z += ((b.position.z - p.z) / (d || 1)) * 6 * k;
      b.velocity.y += 3.5 * k;
      b.angularVelocity.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
    // shockwave visual
    for (let i = 0; i < 2; i++) {
      const s = shockMesh();
      s.g.position.set(p.x, p.y, p.z);
      s.g.scale.setScalar(0.4);
      this.scene.add(s.g);
      this.waves.push({ g: s.g, core: s.core, outer: s.wave, t: 0, radius });
    }
    this.hooks.onExplode(bomb, hits);
  }

  update(dt: number, chars: Character[], safe: (x: number, z: number) => boolean) {
    this.alive += dt;
    if (this.alive < 0.8) {
      this.updateWaves(dt);
      return;
    }
    // progression: more bombs, faster drops, both over time and per wave
    this.nextWave -= dt;
    if (this.nextWave <= 0) {
      if (this.maxBombs < 9) {
        this.maxBombs++;
        this.hooks.onWave(this.maxBombs);
      }
      this.nextWave = Math.max(8, 17 - this.wave * 1.4);
    }
    this.timer -= dt;
    if (this.timer <= 0 && this.bombs.length < this.maxBombs) {
      this.spawn(safe, chars);
      this.wave++;
      this.timer = Math.max(1.8, 6.5 - this.alive * 0.035 - this.wave * 0.15) / this.intensity;
    }

    for (const b of [...this.bombs]) {
      b.fuse -= dt;
      const held = this.holderOf(b, chars);
      if (held) {
        b.lastHeld = held;
      } else if (b.lastHeld && b.body.velocity.length() > 4) {
        b.thrower = b.lastHeld;
        b.lastHeld = null;
      }
      const t = clamp(b.fuse / b.maxFuse, 0, 1);
      // roll on the ground
      b.mesh.position.copy(b.body.position as unknown as THREE.Vector3);
      b.mesh.quaternion.copy(b.body.quaternion as unknown as THREE.Quaternion);
      const pulse = 1 + Math.sin(this.alive * (6 + (1 - t) * 26)) * (0.02 + (1 - t) * 0.09);
      b.mesh.scale.setScalar(pulse);
      const ring = (b as unknown as { ring?: THREE.Mesh }).ring;
      if (ring) {
        ring.scale.setScalar(0.5 + t * 0.55);
        (ring.material as THREE.MeshBasicMaterial).color.setHex(t > 0.55 ? 0x7cf0ff : t > 0.25 ? 0xffd23f : 0xff4d5e);
      }
      const spark = (b as unknown as { spark?: THREE.Mesh }).spark;
      if (spark) {
        const s = 1 + Math.sin(this.alive * 24 + b.id) * 0.25;
        spark.scale.setScalar(s * (1 + (1 - t) * 0.6));
      }
      if (b.body.position.y < -20) {
        if (this.world.bodies.includes(b.body)) this.world.removeBody(b.body);
        b.mesh.removeFromParent();
        this.bombs = this.bombs.filter((x) => x !== b);
        continue;
      }
      if (b.fuse <= 0) this.explode(b, chars);
    }
    this.updateWaves(dt);
  }

  private holderOf(bomb: Bomb, chars: Character[]) {
    for (const c of chars) {
      for (const arm of ["armL", "armR"] as const) {
        const h = c.holds[arm];
        if (h && h.body === bomb.body) return c;
      }
    }
    return null;
  }

  private updateWaves(dt: number) {
    for (const w of this.waves) {
      w.t += dt;
      const k = Math.min(1, w.t / 0.5);
      const size = 0.4 + k * w.radius;
      w.g.scale.setScalar(size);
      (w.core.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      (w.outer.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      w.core.visible = k < 0.35;
      if (k >= 1) {
        w.g.removeFromParent();
        this.waves = this.waves.filter((x) => x !== w);
      }
    }
  }

  dispose() {
    for (const b of this.bombs) {
      if (this.world.bodies.includes(b.body)) this.world.removeBody(b.body);
      b.mesh.removeFromParent();
    }
    for (const w of this.waves) w.g.removeFromParent();
    this.bombs = [];
    this.waves = [];
  }
}

function clamp(x: number, a: number, b: number) {
  return x < a ? a : x > b ? b : x;
}
