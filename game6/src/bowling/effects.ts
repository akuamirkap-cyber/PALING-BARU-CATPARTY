import * as THREE from 'three';

/** Konfeti meledak saat strike. */
export class Confetti {
  mesh: THREE.InstancedMesh;
  private N = 420;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private rot: THREE.Euler[] = [];
  private spin: THREE.Vector3[] = [];
  private life: number[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private colors = ['#ff4fd8', '#29e7ff', '#ffe14d', '#6dff7a', '#ff8a3d', '#ffffff', '#b07cff'];

  constructor() {
    const g = new THREE.PlaneGeometry(0.055, 0.032);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    mat.name = 'Confetti';
    this.mesh = new THREE.InstancedMesh(g, mat, this.N);
    this.mesh.name = 'Confetti';
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < this.N; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.rot.push(new THREE.Euler());
      this.spin.push(new THREE.Vector3());
      this.life.push(0);
      this.mesh.setColorAt(i, c.set(this.colors[i % this.colors.length]));
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
  }

  burst(center: THREE.Vector3, count: number, power = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.N;
      this.pos[i].copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 0.3, (Math.random() - 0.5) * 0.9));
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 2.6) * power;
      this.vel[i].set(Math.cos(a) * sp * 0.7 - 0.6, (2.6 + Math.random() * 3.2) * power, Math.sin(a) * sp * 0.7);
      this.rot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.spin[i].set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      this.life[i] = 2.6 + Math.random() * 1.4;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const v = this.vel[i];
      v.y -= 5.5 * dt;
      v.multiplyScalar(1 - Math.min(0.9, 2.2 * dt));
      v.x += Math.sin(this.life[i] * 7 + i) * 0.4 * dt;
      this.pos[i].addScaledVector(v, dt);
      if (this.pos[i].y < 0.01) {
        this.pos[i].y = 0.01;
        v.set(0, 0, 0);
      }
      this.rot[i].x += this.spin[i].x * dt;
      this.rot[i].y += this.spin[i].y * dt;
      this.rot[i].z += this.spin[i].z * dt;
      const sc = this.life[i] <= 0 ? 0 : Math.min(1, this.life[i] * 2);
      this.q.setFromEuler(this.rot[i]);
      this.s.setScalar(sc);
      this.m.compose(this.pos[i], this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Bintang kartun di titik benturan keras (menghadap kamera). */
export class ImpactStars {
  mesh: THREE.InstancedMesh;
  private N = 48;
  private pos: THREE.Vector3[] = [];
  private age: number[] = [];
  private size: number[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor() {
    const sh = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const r = k % 2 ? 0.4 : 1;
      if (k === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ShapeGeometry(sh);
    const mat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mat.name = 'ImpactStar';
    this.mesh = new THREE.InstancedMesh(g, mat, this.N);
    this.mesh.name = 'ImpactStars';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < this.N; i++) {
      this.pos.push(new THREE.Vector3());
      this.age.push(9);
      this.size.push(0);
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
  }

  spawn(p: THREE.Vector3, strength: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    this.pos[i].copy(p);
    this.age[i] = 0;
    this.size[i] = 0.05 + Math.min(1, strength) * 0.11;
  }

  update(dt: number, camera: THREE.Camera) {
    this.q.copy(camera.quaternion);
    for (let i = 0; i < this.N; i++) {
      if (this.age[i] > 0.32) continue;
      this.age[i] += dt;
      const k = this.age[i] / 0.32;
      const sc = k >= 1 ? 0 : this.size[i] * (0.4 + Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.6));
      this.s.setScalar(sc);
      const rq = this.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), i + k * 2));
      this.m.compose(this.pos[i], rq, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
