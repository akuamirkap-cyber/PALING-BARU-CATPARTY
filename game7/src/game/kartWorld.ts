import * as THREE from 'three';

export const ROAD_HALF = 9;
export const WALL_LAT = 12.4;
export const TN = 640;

const CTRL: [number, number][] = [
  [0, -90], [45, -92], [100, -72], [128, -25], [108, 30], [66, 52], [56, 92], [14, 122],
  [-40, 110], [-74, 76], [-58, 38], [-90, 8], [-122, -28], [-104, -74], [-50, -93],
];

export interface Loc {
  i: number;
  lat: number;
  f: number;
  rx: number;
  rz: number;
  yaw: number;
}
export interface Pos {
  x: number;
  z: number;
  yaw: number;
}

export const PAD_DEFS = [
  { f: 70, lat: 0 },
  { f: 235, lat: -3.5 },
  { f: 390, lat: 3.5 },
  { f: 520, lat: 0 },
];
export const BOX_SETS = [150, 300, 450, 590];
export const BOX_LATS = [-6, -2, 2, 6];

export class Track {
  n = TN;
  px = new Float32Array(TN);
  pz = new Float32Array(TN);
  tx = new Float32Array(TN);
  tz = new Float32Array(TN);
  yaw = new Float32Array(TN);
  spacing = 1;
  len = 0;

  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    const pts = curve.getSpacedPoints(TN);
    for (let i = 0; i < TN; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
    }
    for (let i = 0; i < TN; i++) {
      const a = (i + 1) % TN;
      const b = (i - 1 + TN) % TN;
      let dx = this.px[a] - this.px[b];
      let dz = this.pz[a] - this.pz[b];
      const m = Math.hypot(dx, dz) || 1;
      dx /= m;
      dz /= m;
      this.tx[i] = dx;
      this.tz[i] = dz;
      this.yaw[i] = Math.atan2(dx, dz);
      this.len += Math.hypot(this.px[a] - this.px[i], this.pz[a] - this.pz[i]);
    }
    this.spacing = this.len / TN;
  }

  wrap(i: number) {
    return ((i % TN) + TN) % TN;
  }

  private fin(x: number, z: number, i: number, out: Loc) {
    const dx = x - this.px[i];
    const dz = z - this.pz[i];
    const along = dx * this.tx[i] + dz * this.tz[i];
    out.i = i;
    out.lat = dx * -this.tz[i] + dz * this.tx[i];
    out.f = i + along / this.spacing;
    out.rx = -this.tz[i];
    out.rz = this.tx[i];
    out.yaw = this.yaw[i];
  }

  locate(x: number, z: number, hint: number, out: Loc) {
    let best = hint;
    let bd = 1e18;
    for (let d = -14; d <= 14; d++) {
      const i = this.wrap(hint + d);
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const dd = dx * dx + dz * dz;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    this.fin(x, z, best, out);
  }

  locateFull(x: number, z: number, out: Loc) {
    let best = 0;
    let bd = 1e18;
    for (let i = 0; i < TN; i++) {
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const dd = dx * dx + dz * dz;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    this.fin(x, z, best, out);
  }

  posAt(f: number, lat: number, out: Pos) {
    const fw = this.wrap(f);
    const i0 = Math.floor(fw);
    const i1 = (i0 + 1) % TN;
    const u = fw - i0;
    const x = this.px[i0] + (this.px[i1] - this.px[i0]) * u;
    const z = this.pz[i0] + (this.pz[i1] - this.pz[i0]) * u;
    let tx = this.tx[i0] + (this.tx[i1] - this.tx[i0]) * u;
    let tz = this.tz[i0] + (this.tz[i1] - this.tz[i0]) * u;
    const m = Math.hypot(tx, tz) || 1;
    tx /= m;
    tz /= m;
    out.x = x - tz * lat;
    out.z = z + tx * lat;
    out.yaw = Math.atan2(tx, tz);
  }

  dist(x: number, z: number) {
    let m = 1e18;
    for (let i = 0; i < TN; i += 2) {
      const dx = x - this.px[i];
      const dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }
}

// ---------- util ----------
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, rx = 1, ry = 1, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const std = (c: number, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

function skyTexture() {
  const { c, g } = canvas(8, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3f8cff');
  gr.addColorStop(0.5, '#8fd0ff');
  gr.addColorStop(0.82, '#d7f2ff');
  gr.addColorStop(1, '#fff1cf');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 256);
  return tex(c, 1, 1, false);
}

function grassTexture() {
  const { c, g } = canvas(256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#6bcb52' : '#5cb948';
    g.fillRect(0, i * 32, 256, 32);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,60,0,0.06)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  return tex(c, 40, 40);
}

function roadTexture() {
  const { c, g } = canvas(256, 512);
  g.fillStyle = '#3f4350';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.fillRect(66, 0, 34, 512);
  g.fillRect(156, 0, 34, 512);
  g.fillStyle = '#ffffff';
  g.fillRect(10, 0, 8, 512);
  g.fillRect(238, 0, 8, 512);
  g.fillStyle = '#ffe66d';
  for (let k = 0; k < 2; k++) g.fillRect(124, k * 256 + 20, 8, 130);
  return tex(c, 1, 1);
}

function curbTexture() {
  const { c, g } = canvas(32, 128);
  g.fillStyle = '#ee3b3b';
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 64, 32, 64);
  return tex(c, 1, 1);
}

function checkerTexture(cols: number, rows: number, size = 32) {
  const { c, g } = canvas(cols * size, rows * size);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * size, y * size, size, size);
    }
  return tex(c, 1, 1, false);
}

function padTexture() {
  const { c, g } = canvas(128, 256);
  g.fillStyle = '#ffb703';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff3a0';
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    const y = k * 64;
    g.moveTo(14, y + 52);
    g.lineTo(64, y + 8);
    g.lineTo(114, y + 52);
    g.lineTo(114, y + 36 + 8);
    g.lineTo(64, y - 6 + 8 + 8);
    g.lineTo(14, y + 44);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 248);
  return tex(c, 1, 1);
}

function boxTexture() {
  const { c, g } = canvas(128, 128);
  const gr = g.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#ff5fa2');
  gr.addColorStop(0.33, '#ffd23f');
  gr.addColorStop(0.66, '#3fd0ff');
  gr.addColorStop(1, '#a56bff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#fff';
  g.font = '900 88px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 6;
  g.fillText('?', 64, 70);
  return tex(c, 1, 1, false);
}

function billboardTexture(text: string, bg: string, fg: string) {
  const { c, g } = canvas(512, 256);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = -2; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 80, 256);
    g.lineTo(i * 80 + 60, 256);
    g.lineTo(i * 80 + 160, 0);
    g.lineTo(i * 80 + 100, 0);
    g.fill();
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 12;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = fg;
  g.font = '900 78px "Fredoka", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(text, 256, 132);
  g.fillText(text, 256, 132);
  return tex(c, 1, 1, false);
}

function ribbon(track: Track, latA: number, latB: number, y: number, vScale: number, material: THREE.Material) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i <= TN; i++) {
    const k = i % TN;
    const px = track.px[k];
    const pz = track.pz[k];
    const rx = -track.tz[k];
    const rz = track.tx[k];
    pos.push(px + rx * latA, y, pz + rz * latA, px + rx * latB, y, pz + rz * latB);
    uv.push(0, dist * vScale, 1, dist * vScale);
    dist += track.spacing;
  }
  for (let i = 0; i < TN; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

export interface ItemBox {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  cd: number;
  ph: number;
}

export interface KartWorld {
  boxes: ItemBox[];
  pads: THREE.Mesh[];
  update(t: number, fx: number, fz: number): void;
}

export function buildKartWorld(scene: THREE.Scene, track: Track): KartWorld {
  const rand = rng(1234);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xcfeeff, 140, 420);

  // ---- cahaya ----
  scene.add(new THREE.HemisphereLight(0xe3f4ff, 0x8aa070, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
  sun.position.set(40, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48;
  sc.right = 48;
  sc.top = 48;
  sc.bottom = -48;
  sc.near = 10;
  sc.far = 200;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- tanah ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- jalan ----
  const roadTex = roadTexture();
  const road = ribbon(track, -ROAD_HALF, ROAD_HALF, 0.03, 1 / 36, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, side: THREE.DoubleSide }));
  scene.add(road);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe5d19a, roughness: 1, side: THREE.DoubleSide });
  scene.add(ribbon(track, -WALL_LAT - 1.2, -ROAD_HALF - 0.9, 0.015, 1, sandMat), ribbon(track, ROAD_HALF + 0.9, WALL_LAT + 1.2, 0.015, 1, sandMat));
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.7, side: THREE.DoubleSide });
  curbMat.map!.repeat.set(1, 1);
  scene.add(ribbon(track, -ROAD_HALF - 1.0, -ROAD_HALF, 0.05, 1 / 4.4, curbMat), ribbon(track, ROAD_HALF, ROAD_HALF + 1.0, 0.05, 1 / 4.4, curbMat));

  // ---- garis start + kotak grid ----
  const flat = (w: number, l: number, mat: THREE.Material, x: number, z: number, yaw: number, y = 0.07) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, yaw, 0);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  flat(ROAD_HALF * 2, 2.4, new THREE.MeshBasicMaterial({ map: checkerTexture(18, 2, 32), side: THREE.DoubleSide }), track.px[0], track.pz[0], track.yaw[0]);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (let s = 0; s < 4; s++) {
    const row = Math.floor(s / 2);
    const col = s % 2;
    const f = -(4 + row * 5 + col * 2) / track.spacing;
    const o = { x: 0, z: 0, yaw: 0 };
    track.posAt(f, col ? 3.2 : -3.2, o);
    const fwx = Math.sin(o.yaw);
    const fwz = Math.cos(o.yaw);
    const rgx = -Math.cos(o.yaw);
    const rgz = Math.sin(o.yaw);
    flat(2.8, 0.2, gridMat, o.x + fwx * 2.2, o.z + fwz * 2.2, o.yaw, 0.065);
    for (const sd of [-1.4, 1.4]) flat(0.2, 3.0, gridMat, o.x + rgx * sd + fwx * 0.8, o.z + rgz * sd + fwz * 0.8, o.yaw, 0.065);
  }

  // ---- boost pads ----
  const padTex = padTexture();
  const pads: THREE.Mesh[] = [];
  for (const d of PAD_DEFS) {
    const o = { x: 0, z: 0, yaw: 0 };
    track.posAt(d.f, d.lat, o);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 9), new THREE.MeshBasicMaterial({ map: padTex, side: THREE.DoubleSide }));
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, o.yaw + Math.PI, 0);
    m.position.set(o.x, 0.08, o.z);
    scene.add(m);
    pads.push(m);
  }
  padTex.repeat.set(1, 1);

  // ---- tembok ban ----
  const tireGeo = new THREE.TorusGeometry(0.52, 0.26, 8, 16);
  tireGeo.rotateX(Math.PI / 2);
  const count = (TN / 2) * 2 * 2;
  const tires = new THREE.InstancedMesh(tireGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
  tires.castShadow = true;
  tires.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < TN; i += 2) {
    for (const side of [-1, 1]) {
      const lat = side * (WALL_LAT + 0.85);
      const x = track.px[i] - track.tz[i] * lat;
      const z = track.pz[i] + track.tx[i] * lat;
      const grp = Math.floor(i / 6) % 2 === 0;
      for (let lv = 0; lv < 2; lv++) {
        dummy.position.set(x, 0.27 + lv * 0.5, z);
        dummy.rotation.set(0, rand() * 3, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        tires.setMatrixAt(n, dummy.matrix);
        tires.setColorAt(n, col.set(grp ? 0xf04a4a : 0xf6f6f6));
        n++;
      }
    }
  }
  scene.add(tires);

  // ---- gerbang finish ----
  const arch = new THREE.Group();
  const aw = ROAD_HALF + 3.4;
  const o0 = { x: track.px[0], z: track.pz[0], yaw: track.yaw[0] };
  arch.position.set(o0.x, 0, o0.z);
  arch.rotation.y = o0.yaw;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 9.5, 14), std(0xf4f4f4, 0.5));
    p.position.set(s * aw, 4.75, 0);
    p.castShadow = true;
    arch.add(p);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 1.4, 14), std(0xee3b3b, 0.5));
    stripe.position.set(s * aw, 0.7, 0);
    arch.add(stripe);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    lamp.position.set(s * aw, 9.9, 0);
    arch.add(lamp);
  }
  const bannerTex = billboardTexture('🏁 PARTY KART 🏁', '#ff5fa2', '#ffffff');
  const banner = new THREE.Mesh(new THREE.BoxGeometry(aw * 2, 2.8, 0.5), [std(0xffffff), std(0xffffff), std(0xffffff), std(0xffffff), new THREE.MeshBasicMaterial({ map: bannerTex }), new THREE.MeshBasicMaterial({ map: bannerTex })]);
  banner.position.set(0, 9.3, 0);
  banner.castShadow = true;
  arch.add(banner);
  const chk = new THREE.Mesh(new THREE.BoxGeometry(aw * 2, 0.7, 0.55), new THREE.MeshBasicMaterial({ map: checkerTexture(40, 2, 16) }));
  chk.position.set(0, 7.65, 0);
  arch.add(chk);
  // balon di kaki gerbang
  const balloonCols = [0xff4d6d, 0xffd23f, 0x4dd0ff, 0x7cf05a, 0xb26bff];
  for (const s of [-1, 1])
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), std(balloonCols[k % 5], 0.35));
      b.scale.y = 1.15;
      b.position.set(s * (aw + 2 + (k % 3) * 0.8), 2.2 + rand() * 3.5, (rand() - 0.5) * 3);
      b.castShadow = true;
      arch.add(b);
    }
  scene.add(arch);

  // ---- tribun penonton ----
  const crowd: { m: THREE.InstancedMesh; base: THREE.Vector3[]; ph: number[] }[] = [];
  const makeStand = (f: number, side: number, w: number) => {
    const o = { x: 0, z: 0, yaw: 0 };
    track.posAt(f, side * (WALL_LAT + 9), o);
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.yaw + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
    const rows = 6;
    const steps = new THREE.Group();
    for (let r = 0; r < rows; r++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1 + r * 1.1, 2.1), std(r % 2 ? 0xd7dde8 : 0xc2cad8, 0.8));
      s.position.set(0, (1.1 + r * 1.1) / 2, -r * 2.1);
      s.castShadow = true;
      s.receiveShadow = true;
      steps.add(s);
    }
    g.add(steps);
    // penonton
    const cols = Math.floor(w / 1.0);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), rows * cols);
    const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.45, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), rows * cols);
    const base: THREE.Vector3[] = [];
    const ph: number[] = [];
    let q = 0;
    const furs = [0xffa447, 0x2b2b32, 0xf2f2f2, 0x9aa5b8, 0xf4e4c9, 0xd9a066];
    const shirts = [0xff4d6d, 0x4dd0ff, 0xffd23f, 0x7cf05a, 0xb26bff, 0xffffff];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * 1.0 + (rand() - 0.5) * 0.2;
        const y = 1.1 + r * 1.1 + 0.5;
        const z = -r * 2.1 + 0.2;
        base.push(new THREE.Vector3(x, y, z));
        ph.push(rand() * 6.28);
        heads.setColorAt(q, col.set(furs[Math.floor(rand() * furs.length)]));
        bodies.setColorAt(q, col.set(shirts[Math.floor(rand() * shirts.length)]));
        q++;
      }
    g.add(heads, bodies);
    crowd.push({ m: heads, base, ph });
    (heads as unknown as { bodies: THREE.InstancedMesh }).bodies = bodies;
    // atap
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.4, rows * 2.1 + 2), new THREE.MeshStandardMaterial({ color: 0xff5fa2, roughness: 0.6 }));
    roof.position.set(0, 10.2, -rows + 1.5);
    roof.rotation.x = -0.08;
    roof.castShadow = true;
    g.add(roof);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 8), std(0x9aa5b8));
      p.position.set(s * (w / 2 + 0.8), 5, 1.2);
      p.castShadow = true;
      g.add(p);
    }
    // bendera atap
    for (let k = 0; k < 6; k++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), std(balloonCols[k % 5], 0.5));
      fl.position.set((k - 2.5) * (w / 6), 11.0, -rows + 1.5);
      fl.castShadow = true;
      g.add(fl);
    }
    scene.add(g);
  };
  makeStand(-8, -1, 46);
  makeStand(210, 1, 34);
  makeStand(40, 1, 30);

  // ---- baliho ----
  const ads: [string, string, string][] = [
    ['MEOW COLA 🥤', '#e63946', '#fff'],
    ['FISHY SNACK 🐟', '#1d9bf0', '#fff'],
    ['NYAN TIRES', '#222', '#ffd23f'],
    ['BOBA TIME 🧋', '#b26bff', '#fff'],
    ['PURR-FECT!', '#2fbf71', '#fff'],
    ['CAT-LIFE ❤', '#ff5fa2', '#fff'],
    ['YARN CO.', '#ff9f1c', '#fff'],
    ['PARTY CATS', '#3a86ff', '#ffe66d'],
  ];
  const adFs = [95, 175, 255, 330, 410, 480, 555, 615];
  adFs.forEach((f, k) => {
    const side = k % 2 ? 1 : -1;
    const o = { x: 0, z: 0, yaw: 0 };
    track.posAt(f, side * (WALL_LAT + 3.6), o);
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.yaw + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
    const t = billboardTexture(ads[k][0], ads[k][1], ads[k][2]);
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 0.3), [std(0xffffff), std(0xffffff), std(0xffffff), std(0xffffff), new THREE.MeshBasicMaterial({ map: t }), std(0x555566)]);
    b.position.y = 3.6;
    b.castShadow = true;
    g.add(b);
    for (const s of [-3.4, 3.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 3.4, 8), std(0x777788));
      p.position.set(s, 1.7, -0.1);
      p.castShadow = true;
      g.add(p);
    }
    scene.add(g);
  });

  // ---- tiang lampu & bendera di lurus start ----
  for (const f of [-30, 30, 100, 600, 560]) {
    for (const side of [-1, 1]) {
      const o = { x: 0, z: 0, yaw: 0 };
      track.posAt(f, side * (WALL_LAT + 2), o);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), std(0x8a93a6));
      pole.position.set(o.x, 3.5, o.z);
      pole.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
      lamp.position.set(o.x, 7.1, o.z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ color: balloonCols[Math.abs(f) % 5], side: THREE.DoubleSide }));
      flag.position.set(o.x + Math.sin(o.yaw) * 0.9, 6.0, o.z + Math.cos(o.yaw) * 0.9);
      flag.rotation.y = o.yaw - Math.PI / 2;
      scene.add(pole, lamp, flag);
    }
  }

  // ---- infield: kolam + kincir ria ----
  const pond = new THREE.Mesh(new THREE.CircleGeometry(17, 40), new THREE.MeshStandardMaterial({ color: 0x35c3e8, roughness: 0.15, metalness: 0.1 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(42, 0.06, 4);
  scene.add(pond);
  const pondEdge = new THREE.Mesh(new THREE.RingGeometry(16.8, 19.5, 40), new THREE.MeshStandardMaterial({ color: 0xe9d9a2, roughness: 1 }));
  pondEdge.rotation.x = -Math.PI / 2;
  pondEdge.position.set(42, 0.05, 4);
  scene.add(pondEdge);
  const ducks: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), std(0xffe14d, 0.5));
    b.scale.set(1, 0.7, 1.3);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), std(0xffe14d, 0.5));
    h.position.set(0, 0.9, 0.9);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), std(0xff8a00, 0.5));
    bk.rotation.x = Math.PI / 2;
    bk.position.set(0, 0.85, 1.55);
    d.add(b, h, bk);
    d.scale.setScalar(1.1);
    scene.add(d);
    ducks.push(d);
  }

  const wheel = new THREE.Group();
  const wc = new THREE.Vector3(-10, 0, 8);
  const wr = 15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.35, 8, 40), std(0xf4f4f4, 0.5));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(wr * 0.5, 0.2, 8, 30), std(0xff5fa2, 0.5));
  wheel.add(ring, ring2);
  const gondolas: THREE.Group[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, wr, 6), std(0xdfe5ef));
    sp.rotation.z = a - Math.PI / 2;
    sp.position.set(Math.cos(a) * wr * 0.5, Math.sin(a) * wr * 0.5, 0);
    wheel.add(sp);
    const gd = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 2.4), std(balloonCols[k % 5], 0.45));
    cab.position.y = -1.3;
    cab.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), std(0xffffff, 0.5));
    roof.position.y = 0.1;
    roof.rotation.y = Math.PI / 4;
    gd.add(cab, roof);
    gd.position.set(Math.cos(a) * wr, Math.sin(a) * wr, 0);
    wheel.add(gd);
    gondolas.push(gd);
  }
  wheel.position.set(wc.x, wr + 1.5, wc.z);
  wheel.rotation.y = 0.3;
  scene.add(wheel);
  const legs = new THREE.Group();
  legs.position.set(wc.x, 0, wc.z);
  legs.rotation.y = 0.3;
  const hubH = wr + 1.5;
  const th = Math.atan2(6, hubH);
  for (const sd of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, Math.hypot(6, hubH), 8), std(0xff5fa2, 0.5));
    leg.position.set(sd * 3, hubH / 2, 0);
    leg.rotation.z = sd * th;
    leg.castShadow = true;
    legs.add(leg);
  }
  scene.add(legs);

  // ---- pohon, semak, batu (instanced) ----
  const spots: { x: number; z: number; s: number }[] = [];
  let guard = 0;
  while (spots.length < 340 && guard++ < 4000) {
    const x = (rand() - 0.5) * 520;
    const z = (rand() - 0.5) * 520;
    if (track.dist(x, z) < 26) continue;
    if (Math.hypot(x - 42, z - 4) < 24) continue;
    if (Math.hypot(x - wc.x, z - wc.z) < 22) continue;
    spots.push({ x, z, s: 0.8 + rand() * 0.9 });
  }
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 3, 7);
  trunkG.translate(0, 1.5, 0);
  const coneG = new THREE.ConeGeometry(2.3, 4.2, 8);
  coneG.translate(0, 4.2, 0);
  const cone2G = new THREE.ConeGeometry(1.7, 3.4, 8);
  cone2G.translate(0, 6.2, 0);
  const ballG = new THREE.IcosahedronGeometry(2.4, 1);
  ballG.translate(0, 4.6, 0);
  const trunks = new THREE.InstancedMesh(trunkG, std(0x8a5a2b), spots.length);
  const cones = new THREE.InstancedMesh(coneG, std(0x2f9d4a, 0.9), spots.length);
  const cones2 = new THREE.InstancedMesh(cone2G, std(0x38b455, 0.9), spots.length);
  const balls = new THREE.InstancedMesh(ballG, std(0xffffff, 0.9), spots.length);
  const greens = [0x4bbf5a, 0x7ad04f, 0x2fa95a, 0xa5d94a, 0xff9ec0];
  spots.forEach((sp, i) => {
    const round = i % 3 === 0;
    dummy.position.set(sp.x, 0, sp.z);
    dummy.rotation.set(0, rand() * 6, 0);
    dummy.scale.setScalar(sp.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    if (round) {
      balls.setMatrixAt(i, dummy.matrix);
      balls.setColorAt(i, col.set(greens[Math.floor(rand() * greens.length)]));
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
      cones2.setMatrixAt(i, dummy.matrix);
    } else {
      cones.setMatrixAt(i, dummy.matrix);
      cones2.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      balls.setMatrixAt(i, dummy.matrix);
      balls.setColorAt(i, col.set(0xffffff));
    }
  });
  for (const m of [trunks, cones, cones2, balls]) {
    m.castShadow = true;
    scene.add(m);
  }

  // bunga warna-warni
  const flowerG = new THREE.SphereGeometry(0.3, 6, 5);
  const flowers = new THREE.InstancedMesh(flowerG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 260);
  const fc = [0xff5fa2, 0xffd23f, 0xffffff, 0xb26bff, 0xff7a3d];
  let fi = 0;
  guard = 0;
  while (fi < 260 && guard++ < 4000) {
    const x = (rand() - 0.5) * 360;
    const z = (rand() - 0.5) * 360;
    const d = track.dist(x, z);
    if (d < WALL_LAT + 3 || d > 60) continue;
    dummy.position.set(x, 0.25, z);
    dummy.scale.setScalar(0.6 + rand() * 0.8);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix);
    flowers.setColorAt(fi, col.set(fc[Math.floor(rand() * fc.length)]));
    fi++;
  }
  scene.add(flowers);

  // ---- bukit jauh ----
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.2;
    const r = 330 + rand() * 60;
    const h = 40 + rand() * 60;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(50 + rand() * 50, h, 8), std(i % 2 ? 0x7fcf9a : 0x93bde0, 1));
    hill.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
    scene.add(hill);
  }

  // ---- awan ----
  const clouds = new THREE.Group();
  const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93 });
  for (let i = 0; i < 20; i++) {
    const g = new THREE.Group();
    const nn = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < nn; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 4, 10, 8), cMat);
      s.position.set(k * 5 - nn * 2.5, rand() * 2, rand() * 3);
      s.scale.y = 0.55;
      g.add(s);
    }
    const a = rand() * Math.PI * 2;
    const r = 80 + rand() * 260;
    g.position.set(Math.cos(a) * r, 70 + rand() * 50, Math.sin(a) * r);
    g.rotation.y = -a;
    clouds.add(g);
  }
  scene.add(clouds);

  // ---- item boxes ----
  const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const boxMat = new THREE.MeshBasicMaterial({ map: boxTexture(), transparent: true, opacity: 0.95 });
  const boxes: ItemBox[] = [];
  BOX_SETS.forEach((f, si) => {
    BOX_LATS.forEach((lat, li) => {
      const o = { x: 0, z: 0, yaw: 0 };
      track.posAt(f, lat, o);
      const m = new THREE.Mesh(boxGeo, boxMat);
      m.position.set(o.x, 1.5, o.z);
      scene.add(m);
      boxes.push({ mesh: m, x: o.x, z: o.z, cd: 0, ph: si + li });
    });
  });

  const padTexRef = padTex;
  return {
    boxes,
    pads,
    update(t: number, fx: number, fz: number) {
      sun.position.set(fx + 40, 70, fz + 30);
      sun.target.position.set(fx, 0, fz);
      clouds.rotation.y = t * 0.006;
      padTexRef.offset.y = -((t * 1.4) % 1);
      wheel.rotation.z = t * 0.12;
      gondolas.forEach((g) => (g.rotation.z = -wheel.rotation.z));
      ducks.forEach((d, i) => {
        const a = t * 0.25 * (i % 2 ? 1 : -1) + i * 1.6;
        const r = 5 + (i % 2) * 6;
        d.position.set(42 + Math.cos(a) * r, 0.25 + Math.sin(t * 2 + i) * 0.05, 4 + Math.sin(a) * r);
        d.rotation.y = -a + (i % 2 ? 0 : Math.PI);
      });
      for (const c of crowd) {
        const bodies = (c.m as unknown as { bodies: THREE.InstancedMesh }).bodies;
        for (let i = 0; i < c.base.length; i++) {
          const b = c.base[i];
          const h = Math.abs(Math.sin(t * 3.2 + c.ph[i])) * 0.35;
          dummy.position.set(b.x, b.y + 0.55 + h, b.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          c.m.setMatrixAt(i, dummy.matrix);
          dummy.position.set(b.x, b.y - 0.05 + h * 0.8, b.z);
          dummy.updateMatrix();
          bodies.setMatrixAt(i, dummy.matrix);
        }
        c.m.instanceMatrix.needsUpdate = true;
        bodies.instanceMatrix.needsUpdate = true;
      }
      for (const b of boxes) {
        if (b.cd > 0) {
          b.cd -= 1 / 60;
          b.mesh.visible = b.cd <= 0;
          if (b.cd <= 0) b.mesh.scale.setScalar(0.1);
        } else if (b.mesh.scale.x < 1) b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + 0.08));
        b.mesh.rotation.y = t * 1.8 + b.ph;
        b.mesh.rotation.x = Math.sin(t * 1.5 + b.ph) * 0.3;
        b.mesh.position.y = 1.5 + Math.sin(t * 2.5 + b.ph) * 0.25;
      }
    },
  };
}
