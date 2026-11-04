import * as THREE from 'three';
import type { Character } from './Character';
import { PLANE_SCALE } from './Arena';
import { segmentDistanceSquared } from './weaponMotion';
import * as CANNON from 'cannon-es';

// A single, reusable hazard. Its hit sweep runs on the same fixed timestep as
// the ragdolls, so a fast bird cannot tunnel through a cat between frames.
export class Seagull {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wings: THREE.Group[] = [];
  private readonly hit = new Set<Character>();
  private readonly previous = new CANNON.Vec3();
  private readonly current = new CANNON.Vec3();
  private elapsed = 0;
  private reaction = 0;
  private roll = 0;
  private rollSpeed = 0;
  private flightSpeed = 13;
  private tumbleHeight = 0;
  private tumbleVerticalSpeed = 0;
  private cooldown = 8;
  active = false;
  readonly speed = 13;
  private directionX = -1;
  private directionZ = 0;
  private distanceLeft = 0;
  private flightHeight = 0;

  constructor(scene: THREE.Scene, private readonly heightAt: (z: number) => number,
    private readonly onImpact: (victim: Character, x: number, y: number, z: number) => void,
    private readonly onApproach: () => void = () => {}) {
    const white = new THREE.MeshStandardMaterial({ color: 0xf8f7ef, roughness: 0.8 });
    const gray = new THREE.MeshStandardMaterial({ color: 0xaeb9c4, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x343a47, roughness: 0.65 });
    const black = new THREE.MeshStandardMaterial({ color: 0x171b25, roughness: 0.3 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf5ab32, roughness: 0.6 });
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const oval = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const mesh = new THREE.Mesh(sphere, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    oval(this.body, white, 0, 0, 0, 0.36, 0.32, 0.54);
    oval(this.body, white, 0, 0.13, 0.38, 0.3, 0.3, 0.3);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.27, 0.09, -0.03);
      oval(wing, gray, side * 0.40, 0, 0, 0.53, 0.10, 0.26);
      oval(wing, dark, side * 0.84, -0.005, -0.02, 0.20, 0.07, 0.15);
      this.body.add(wing);
      this.wings.push(wing);
      // Big, slightly crossed eyes make the hazard readable and comical.
      oval(this.body, white, side * 0.15, 0.20, 0.57, 0.13, 0.15, 0.075);
      oval(this.body, black, side * 0.12, 0.20, 0.63, 0.052, 0.065, 0.035);
      oval(this.body, white, side * 0.105, 0.23, 0.659, 0.015, 0.018, 0.008);
      oval(this.body, yellow, side * 0.15, -0.24, -0.25, 0.055, 0.06, 0.16);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.38, 16), yellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.05, 0.69);
    this.body.add(beak);
    oval(this.body, gray, 0, 0.04, -0.54, 0.21, 0.09, 0.26);
    this.root.add(this.body);
    // The beak faces local +Z; its yaw is set for each incoming flight.
    this.root.rotation.y = -Math.PI / 2;
    this.root.visible = false;
    scene.add(this.root);
  }

  /** Start outside the plane on the camera's right, aimed along a cat's lane. */
  launch(x: number, z: number, cameraYaw = Math.PI) {
    this.hit.clear();
    this.active = true;
    this.elapsed = 0;
    this.reaction = 0;
    this.roll = 0;
    this.rollSpeed = 0;
    this.flightSpeed = this.speed;
    this.tumbleHeight = 0;
    this.tumbleVerticalSpeed = 0;
    this.body.rotation.set(0, 0, 0);
    const rightX = -Math.cos(cameraYaw), rightZ = Math.sin(cameraYaw);
    this.directionX = -rightX;
    this.directionZ = -rightZ;
    const projected = x * rightX + z * rightZ;
    const edge = 9 * PLANE_SCALE + 3;
    const startDistance = Math.max(edge - projected, 8);
    const finishDistance = Math.max(edge + projected, 8);
    this.distanceLeft = startDistance + finishDistance;
    this.flightHeight = this.heightAt(z) + 0.85;
    this.current.set(x + rightX * startDistance, this.flightHeight, z + rightZ * startDistance);
    this.previous.copy(this.current);
    this.root.rotation.y = Math.atan2(this.directionX, this.directionZ);
    this.root.position.set(this.current.x, this.current.y, this.current.z);
    this.root.visible = true;
    this.onApproach();
  }

  update(dt: number, cats: readonly Character[], playing: boolean, cameraYaw = Math.PI) {
    if (!playing) {
      this.active = false;
      this.root.visible = false;
      return;
    }
    if (!this.active) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return;
      const targets = cats.filter(c => c.alive && !c.removed);
      if (!targets.length) return;
      const target = targets[Math.floor(Math.random() * targets.length)];
      this.launch(target.torso.position.x, target.torso.position.z, cameraYaw);
    }
    this.elapsed += dt;
    this.previous.copy(this.current);
    // After an impact the bird briefly loses speed, then regains its flight.
    this.flightSpeed += (this.speed - this.flightSpeed) * (1 - Math.exp(-1.4 * dt));
    this.current.x += this.directionX * this.flightSpeed * dt;
    this.current.z += this.directionZ * this.flightSpeed * dt;
    this.distanceLeft -= this.flightSpeed * dt;
    if (this.tumbleHeight > 0 || this.tumbleVerticalSpeed > 0) {
      this.tumbleVerticalSpeed -= 8 * dt;
      this.tumbleHeight += this.tumbleVerticalSpeed * dt;
      if (this.tumbleHeight < 0) {
        this.tumbleHeight = 0;
        this.tumbleVerticalSpeed = Math.abs(this.tumbleVerticalSpeed) * 0.22;
        if (this.tumbleVerticalSpeed < 0.3) this.tumbleVerticalSpeed = 0;
      }
    }
    // Collision sweep and visuals use the same bobbing/tumbling centre.
    this.current.y = this.flightHeight + this.tumbleHeight + Math.sin(this.elapsed * 8) * 0.06;
    this.root.position.set(this.current.x, this.current.y, this.current.z);
    for (const cat of cats) {
      if (!cat.alive || cat.removed || this.hit.has(cat)) continue;
      // Check both head and torso so jumping over the bird remains possible.
      if (Math.min(segmentDistanceSquared(cat.torso.position, this.previous, this.current),
        segmentDistanceSquared(cat.head.position, this.previous, this.current)) > 0.9 ** 2) continue;
      this.hit.add(cat);
      this.reaction = 1.15;
      // Spin the bird as well as the cat: a damped barrel roll plus a small
      // upwards bounce, while keeping its single reusable flight collider.
      this.rollSpeed = Math.min(22, this.rollSpeed + 17);
      this.flightSpeed = Math.min(this.flightSpeed, this.speed * 0.58);
      this.tumbleVerticalSpeed = Math.max(this.tumbleVerticalSpeed, 1.8);
      // Environmental hits cannot award another player a kill.
      cat.lastHitBy = null;
      cat.lastHitKind = 'seagull';
      cat.lastHitTime = cat.time;
      cat.hurtT = Math.max(cat.hurtT, 0.8);
      if (!cat.ko) cat.knockOut(1.7);
      else cat.koTimer = Math.max(cat.koTimer, 1.7);
      // Move the entire ragdoll coherently, then cap speed so it can tumble
      // without a single joint launching the cat across the entire map.
      for (const part of cat.parts) {
        part.velocity.x = THREE.MathUtils.clamp(part.velocity.x + this.directionX * 4.6, -7, 7);
        part.velocity.z = THREE.MathUtils.clamp(part.velocity.z + this.directionZ * 4.6, -7, 7);
        part.velocity.y = THREE.MathUtils.clamp(part.velocity.y + 2.1, -9, 3.4);
        part.angularVelocity.x += -this.directionZ * 1.6;
        part.angularVelocity.z += this.directionX * 1.6;
      }
      this.onImpact(cat, cat.torso.position.x, cat.torso.position.y, cat.torso.position.z);
    }
    this.reaction = Math.max(0, this.reaction - dt);
    const flap = Math.sin(this.elapsed * (this.reaction > 0 ? 27 : 13));
    this.wings[0].rotation.z = 0.18 + flap * 0.56;
    this.wings[1].rotation.z = -0.18 - flap * 0.56;
    if (Math.abs(this.rollSpeed) > 1.4) {
      this.rollSpeed *= Math.exp(-1.3 * dt);
    } else {
      // Settle towards the nearest upright revolution, without a visual snap.
      const error = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
      this.rollSpeed += -10 * error * dt;
      this.rollSpeed *= Math.exp(-4 * dt);
    }
    this.roll += this.rollSpeed * dt;
    this.body.rotation.z = this.roll + Math.sin(this.elapsed * 4) * 0.05;
    this.body.rotation.x = this.reaction > 0 ? Math.sin(this.elapsed * 16) * 0.22 * Math.min(1, this.reaction * 2) : 0;
    if (this.distanceLeft <= 0) {
      this.active = false;
      this.root.visible = false;
      this.cooldown = 16 + Math.random() * 5;
    }
  }

  dispose() {
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.active = false;
  }
}
