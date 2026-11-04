import * as THREE from 'three';
import { DOCK_R, WATER_Y } from './world';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};

export interface SharkTarget {
  id: number;
  x: number;
  z: number;
  mode: 'swim' | 'edge';
}
export interface SharkHooks {
  warn(id: number, mode: 'swim' | 'edge'): void;
  lunge(x: number, z: number, edge: boolean): void;
  chomp(id: number, x: number, y: number, z: number): void;
  splash(x: number, z: number, big: number): void;
  miss(id: number, x: number, z: number): void;
}

type SState = 'patrol' | 'hunt' | 'lunge' | 'recover';

function buildShark() {
  const g = new THREE.Group();
  const topM = new THREE.MeshStandardMaterial({ color: 0x2f74a8, roughness: 0.45, metalness: 0.02 });
  const bellyM = new THREE.MeshStandardMaterial({ color: 0xe9f5ff, roughness: 0.5 });
  const finM = new THREE.MeshStandardMaterial({ color: 0x2a6596, roughness: 0.55, side: THREE.DoubleSide });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x3c6f9f, roughness: 0.6 });

  // badan halus (lathe): hidung membulat, ekor meruncing
  const prof: [number, number][] = [
    [0.03, -2.1], [0.12, -1.95], [0.22, -1.68], [0.34, -1.28], [0.46, -0.8], [0.56, -0.25],
    [0.6, 0.25], [0.57, 0.75], [0.48, 1.15], [0.34, 1.5], [0.16, 1.78], [0.02, 1.92],
  ];
  const bodyGeo = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 26);
  bodyGeo.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, topM);
  body.scale.set(0.9, 1.24, 0.94);
  g.add(body);
  const belly = new THREE.Mesh(bodyGeo, bellyM);
  belly.scale.set(0.76, 0.6, 1.0);
  belly.position.y = -0.3;
  g.add(belly);

  // sirip punggung melengkung (bukan kristal)
  const addFin = (shape: THREE.Shape, x: number, y: number, z: number, rotZ: number, sx = 1, sy = 1) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -0.045);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, finM);
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    m.scale.set(1, sy, sx);
    m.castShadow = false;
    g.add(m);
    return m;
  };
  const dorsal = new THREE.Shape();
  dorsal.moveTo(-0.75, 0);
  dorsal.bezierCurveTo(-0.55, 0.55, -0.25, 0.95, 0.1, 1.0);
  dorsal.bezierCurveTo(-0.15, 0.62, -0.32, 0.3, -0.35, 0);
  dorsal.closePath();
  addFin(dorsal, 0, 0.55, 0.35, 0, 0.5);
  // sirip punggung kecil di belakang
  const dorsal2 = new THREE.Shape();
  dorsal2.moveTo(-0.35, 0);
  dorsal2.bezierCurveTo(-0.25, 0.25, -0.05, 0.42, 0.12, 0.44);
  dorsal2.bezierCurveTo(-0.05, 0.24, -0.16, 0.12, -0.18, 0);
  dorsal2.closePath();
  addFin(dorsal2, 0, 0.5, -1.05, 0, 0.4);
  // sirip dada melengkung
  for (const sg of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.25, 0.18, 0.6, 0.1, 0.75, -0.25);
    sh.bezierCurveTo(0.45, -0.3, 0.2, -0.18, 0, 0);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, finM);
    m.position.set(sg * 0.38, -0.16, 0.62);
    m.scale.setScalar(0.45);
    m.rotation.set(0.15, sg > 0 ? 0.2 : Math.PI - 0.2, sg * -0.35);
    g.add(m);
  }
  // ekor sabit
  const tail = new THREE.Group();
  tail.position.set(0, 0, -1.95);
  const blade = (sign: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(-0.2, sign * 0.4, -0.6, sign * 0.8, -1.0, sign * 0.95);
    sh.bezierCurveTo(-0.72, sign * 0.42, -0.5, sign * 0.18, -0.25, 0);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.translate(0, 0, -0.04);
    geo.rotateY(Math.PI / 2);
    return new THREE.Mesh(geo, finM);
  };
  const bU = blade(1);
  const bD = blade(-1);
  bU.scale.set(1.05, 1.05, 1);
  bD.scale.set(1.05, 1.05, 1);
  tail.add(bU, bD);
  g.add(tail);

  // mata besar lucu
  for (const sgs of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    white.position.set(sgs * 0.34, 0.26, 0.95);
    white.scale.set(0.7, 1, 1);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x172a44 }));
    pupil.position.set(sgs * 0.4, 0.26, 1.08);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    spark.position.set(sgs * 0.42, 0.33, 1.16);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: 0x2b5b85 }));
    brow.position.set(sgs * 0.34, 0.46, 1.0);
    brow.rotation.z = sgs * 0.35;
    g.add(white, pupil, spark, brow);
  }
  // mulut ramah + gigi kecil
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 18, Math.PI * 0.85), new THREE.MeshStandardMaterial({ color: 0x7a3c4a, roughness: 0.6 }));
  smile.position.set(0, -0.12, 1.5);
  smile.rotation.set(0.5, 0, Math.PI + 0.22);
  g.add(smile);
  const toothM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), toothM);
    tooth.position.set(-0.2 + i * 0.13, -0.24, 1.48 + Math.abs(i - 1.5) * 0.02);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  // insang
  for (const sgs of [-1, 1]) for (let k = 0; k < 3; k++) {
    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.06), darkM);
    gill.position.set(sgs * 0.5, 0.02, 0.62 - k * 0.16);
    gill.rotation.z = sgs * 0.12;
    g.add(gill);
  }
  // bintik lucu di punggung
  for (let k = 0; k < 6; k++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0x86b8e0 }));
    dot.position.set((Math.random() - 0.5) * 0.6, 0.52 + Math.random() * 0.08, 0.9 - Math.random() * 1.5);
    dot.scale.y = 0.35;
    g.add(dot);
  }
  g.scale.setScalar(1.05);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = false) : null));
  return { g, tail, jaw: smile, dorsal: body };
}
class Shark {
  g: THREE.Group;
  tail: THREE.Group;
  jaw: THREE.Mesh;
  wake: THREE.Mesh;
  wakeMat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  x = 0;
  z = 0;
  h = 0;
  speed = 4;
  state: SState = 'patrol';
  r0 = 14;
  dir = 1;
  ph = 0;
  cd = 0;
  targetId = -1;
  mode: 'swim' | 'edge' = 'swim';
  huntT = 0;
  lungeT = 0;
  lungeDur = 0.68;
  fromX = 0;
  fromZ = 0;
  toX = 0;
  toZ = 0;
  apex = 2;
  bitten = false;
  ripT = 0;
  y = WATER_Y - 0.95;
  constructor(scene: THREE.Scene) {
    const m = buildShark();
    this.g = m.g;
    this.tail = m.tail;
    this.jaw = m.jaw;
    scene.add(this.g);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(-1.1, -4.2);
    sh.lineTo(0, -3.2);
    sh.lineTo(1.1, -4.2);
    sh.closePath();
    const wg = new THREE.ShapeGeometry(sh);
    wg.rotateX(-Math.PI / 2);
    this.wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.wake = new THREE.Mesh(wg, this.wakeMat);
    this.wake.renderOrder = 3;
    scene.add(this.wake);
    const sg2 = new THREE.CircleGeometry(1, 24);
    sg2.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a4a70, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadow = new THREE.Mesh(sg2, this.shadowMat);
    scene.add(this.shadow);
  }
}

export class SharkSystem {
  sharks: Shark[] = [];
  private tmp = { x: 0, z: 0 };

  constructor(scene: THREE.Scene, n = 3) {
    for (let i = 0; i < n; i++) this.sharks.push(new Shark(scene));
    this.reset();
  }

  reset() {
    this.sharks.forEach((s, i) => {
      s.dir = i % 2 ? -1 : 1;
      s.r0 = DOCK_R + 4.5 + i * 3.6;
      s.ph = i * 2.3;
      const a = i * 2.2 + 0.6;
      s.x = Math.cos(a) * s.r0;
      s.z = Math.sin(a) * s.r0;
      s.h = Math.atan2(-Math.sin(a) * s.dir, Math.cos(a) * s.dir);
      s.speed = 4;
      s.state = 'patrol';
      s.cd = 0.3;
      s.targetId = -1;
      s.bitten = false;
      s.jaw.rotation.x = 0;
    });
  }

  private steer(s: Shark, gx: number, gz: number, turn: number, speed: number, dt: number, accel = 3) {
    const want = Math.atan2(gx - s.x, gz - s.z);
    const dh = angDiff(want, s.h);
    s.h += clamp(dh, -turn * dt, turn * dt);
    s.speed += (speed - s.speed) * (1 - Math.exp(-accel * dt));
    s.x += Math.sin(s.h) * s.speed * dt;
    s.z += Math.cos(s.h) * s.speed * dt;
  }

  private keepOffSand(s: Shark) {
    const r = Math.hypot(s.x, s.z);
    const min = DOCK_R + 1.9;
    if (r < min && r > 0.01) {
      s.x *= min / r;
      s.z *= min / r;
    }
  }

  /** 0..1: seberapa dekat/ancaman hiu yang sedang mengincar id ini */
  threat(id: number) {
    let best = 0;
    for (const s of this.sharks) {
      if ((s.state === 'hunt' || s.state === 'lunge') && s.targetId === id) {
        const d = Math.hypot(s.toX - s.x, s.toZ - s.z);
        best = Math.max(best, s.state === 'lunge' ? 1 : clamp(1 - d / 24, 0.25, 0.95));
      }
    }
    return best;
  }

  update(dt: number, t: number, targets: SharkTarget[], hooks: SharkHooks, waveY: (x: number, z: number) => number) {
    // ---- penugasan pemburuan ----
    for (const tg of targets) {
      if (this.sharks.some((s) => (s.state === 'hunt' || s.state === 'lunge') && s.targetId === tg.id)) continue;
      let best: Shark | null = null;
      let bd = 70;
      for (const s of this.sharks) {
        if (s.state !== 'patrol' || s.cd > 0) continue;
        const d = Math.hypot(s.x - tg.x, s.z - tg.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best) {
        best.state = 'hunt';
        best.targetId = tg.id;
        best.mode = tg.mode;
        best.huntT = 0;
        best.bitten = false;
        hooks.warn(tg.id, tg.mode);
      }
    }

    for (const s of this.sharks) {
      s.cd -= dt;
      const tg = targets.find((q) => q.id === s.targetId);

      if (s.state === 'patrol' || s.state === 'recover') {
        const a = Math.atan2(s.z, s.x) + s.dir * 0.5;
        const r = s.r0 + Math.sin(t * 0.5 + s.ph) * 1.6;
        this.steer(s, Math.cos(a) * r, Math.sin(a) * r, 1.7, 3.8 + Math.sin(t * 0.7 + s.ph) * 0.6, dt);
        this.keepOffSand(s);
        if (s.state === 'recover' && s.cd <= 0) s.state = 'patrol';
        s.y += (WATER_Y - 0.86 + Math.sin(t * 2 + s.ph) * 0.04 - s.y) * (1 - Math.exp(-6 * dt));
        s.jaw.rotation.x += (0 - s.jaw.rotation.x) * (1 - Math.exp(-10 * dt));
      } else if (s.state === 'hunt') {
        if (!tg) {
          s.state = 'recover';
          s.cd = 1.6;
          s.targetId = -1;
        } else {
          s.mode = tg.mode;
          s.huntT += dt;
          let gx = tg.x;
          let gz = tg.z;
          if (tg.mode === 'edge') {
            const r = Math.hypot(tg.x, tg.z) || 1;
            gx = (tg.x / r) * (DOCK_R + 2.3);
            gz = (tg.z / r) * (DOCK_R + 2.3);
          }
          this.steer(s, gx, gz, 5.5, 13, dt, 8);
          if (tg.mode === 'edge') this.keepOffSand(s);
          s.y += (WATER_Y - 0.86 - s.y) * (1 - Math.exp(-6 * dt));
          const d = Math.hypot(gx - s.x, gz - s.z);
          const ready = tg.mode === 'swim' ? d < 4.2 && s.huntT > 0.25 : d < 2.8 && s.huntT > 1.15;
          if (ready) {
            s.state = 'lunge';
            s.lungeT = 0;
            s.lungeDur = tg.mode === 'swim' ? 0.68 : 0.72;
            s.fromX = s.x;
            s.fromZ = s.z;
            s.toX = tg.x;
            s.toZ = tg.z;
            s.apex = tg.mode === 'swim' ? 2.3 : 2.6;
            s.bitten = false;
            s.h = Math.atan2(s.toX - s.fromX, s.toZ - s.fromZ);
            hooks.lunge(s.fromX, s.fromZ, tg.mode === 'edge');
            hooks.splash(s.fromX, s.fromZ, 1.0);
          }
        }
      } else if (s.state === 'lunge') {
        s.lungeT += dt;
        const u = clamp(s.lungeT / s.lungeDur, 0, 1);
        // kejar sedikit mengikuti target selama di udara
        if (tg && !s.bitten) {
          s.toX = lerp(s.toX, tg.x, 0.18);
          s.toZ = lerp(s.toZ, tg.z, 0.18);
        }
        s.x = lerp(s.fromX, s.toX, u);
        s.z = lerp(s.fromZ, s.toZ, u);
        const base = WATER_Y - 0.86;
        s.y = base + Math.sin(Math.PI * u) * s.apex * 1.35;
        s.h = Math.atan2(s.toX - s.fromX, s.toZ - s.fromZ);
        s.jaw.rotation.x = Math.sin(Math.PI * clamp((u - 0.18) / 0.55, 0, 1)) * 1.0;
        if (!s.bitten && u >= 0.5) {
          s.bitten = true;
          if (tg && Math.hypot(tg.x - s.x, tg.z - s.z) < 3.0) {
            hooks.chomp(s.targetId, s.x, s.y + 1.0, s.z);
            s.cd = 3.5;
          } else {
            hooks.miss(s.targetId, s.x, s.z);
            s.cd = 2.2;
          }
        }
        if (u >= 1) {
          hooks.splash(s.x, s.z, 1.3);
          s.state = 'recover';
          s.targetId = -1;
          s.speed = 7;
          s.cd = Math.max(s.cd, 2);
          s.h += Math.PI * 0.35 * s.dir;
        }
      }

      // ---- visual ----
      s.g.position.set(s.x, s.y, s.z);
      s.g.rotation.order = 'YXZ';
      s.g.rotation.y = s.h;
      if (s.state === 'lunge') {
        const u = clamp(s.lungeT / s.lungeDur, 0, 1);
        const hv = Math.hypot(s.toX - s.fromX, s.toZ - s.fromZ) / s.lungeDur;
        const vy = Math.cos(Math.PI * u) * Math.PI * s.apex * 1.35 / s.lungeDur;
        s.g.rotation.x = -Math.atan2(vy, Math.max(1, hv));
        s.g.rotation.z = Math.sin(u * TAU) * 0.35 * s.dir;
      } else {
        s.g.rotation.x += (0 - s.g.rotation.x) * (1 - Math.exp(-8 * dt));
        s.g.rotation.z += (Math.sin(t * 1.3 + s.ph) * 0.06 - s.g.rotation.z) * (1 - Math.exp(-6 * dt));
      }
      s.tail.rotation.y = Math.sin(t * (3 + s.speed * 0.9) + s.ph) * (0.28 + s.speed * 0.025);
      // jejak air
      const sub = s.state !== 'lunge';
      s.shadow.position.set(s.x, -2.34, s.z);
      s.shadow.scale.set(1.2, 1, 4.2);
      s.shadow.rotation.y = s.h;
      s.shadowMat.opacity = s.state === 'lunge' ? 0.1 : 0.22;
      s.wake.visible = sub;
      if (sub) {
        s.wake.position.set(s.x + Math.sin(s.h) * 0.4, waveY(s.x, s.z) + 0.1, s.z + Math.cos(s.h) * 0.4);
        s.wake.rotation.y = s.h;
        s.wake.scale.set(1 + s.speed * 0.05, 1, 0.6 + s.speed * 0.08);
        s.wakeMat.opacity = clamp(0.2 + s.speed * 0.03, 0.2, 0.55);
        s.ripT -= dt;
        if (s.ripT <= 0) {
          s.ripT = s.state === 'hunt' ? 0.25 : 0.7;
          this.tmp.x = s.x;
          this.tmp.z = s.z;
          hooks.splash(s.x, s.z, -1);
        }
      }
    }
  }
}
