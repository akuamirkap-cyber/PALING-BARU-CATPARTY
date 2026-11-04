import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
export const AR = 15.5; // radius arena datar di puncak bukit
const VALLEY = -34;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function ss(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** puncak bukit datar bulat, lalu turun curam ke lembah */
export function terrainH(x: number, z: number) {
  const r = Math.hypot(x, z);
  if (r <= AR) return 0;
  const d = r - AR;
  let h = VALLEY * ss(0, 14, d);
  const k = ss(8, 24, d);
  h += k * (Math.sin(x * 0.17) * Math.cos(z * 0.14) * 0.9 + Math.sin(x * 0.05 + z * 0.07) * 1.2 + Math.sin(x * 0.6) * Math.cos(z * 0.5) * 0.16);
  return h;
}
export function terrainGrad(x: number, z: number, out: { x: number; z: number }) {
  const e = 0.35;
  out.x = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e);
  out.z = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  return out;
}

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
function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}
function toTex(c: HTMLCanvasElement, rx = 1, ry = 1, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}
const mat = (c: number, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

function snowTex() {
  const rnd = rng(11);
  const { c, g } = cv(256, 256);
  g.fillStyle = '#f4f8ff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(170,200,240,0.16)' : 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 2.6, 0, TAU);
    g.fill();
  }
  return toTex(c, 75, 75, true);
}

function glowTex() {
  const { c, g } = cv(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,248,214,1)');
  gr.addColorStop(0.2, 'rgba(255,224,160,0.85)');
  gr.addColorStop(0.55, 'rgba(255,170,130,0.25)');
  gr.addColorStop(1, 'rgba(255,150,120,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return toTex(c);
}

function emblemTex() {
  const { c, g } = cv(1024, 1024);
  g.translate(512, 512);
  g.strokeStyle = 'rgba(150,190,240,0.75)';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(0, 0, 488, 0, TAU);
  g.stroke();
  g.lineWidth = 8;
  g.setLineDash([36, 28]);
  g.beginPath();
  g.arc(0, 0, 440, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(160,198,245,0.6)';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(0, 0, 250, 0, TAU);
  g.stroke();
  g.lineWidth = 14;
  g.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.rotate((k * TAU) / 6);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -230);
    g.moveTo(0, -140);
    g.lineTo(-48, -190);
    g.moveTo(0, -140);
    g.lineTo(48, -190);
    g.moveTo(0, -80);
    g.lineTo(-30, -112);
    g.moveTo(0, -80);
    g.lineTo(30, -112);
    g.stroke();
    g.restore();
  }
  return toTex(c);
}

function signTex(n: number, color: string) {
  const { c, g } = cv(128, 128);
  g.fillStyle = '#fff8e7';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.fillRect(8, 8, 112, 112);
  g.fillStyle = '#fff';
  g.font = '900 78px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  return toTex(c);
}

export interface SnowWorld {
  spots: { x: number; z: number }[];
  update(t: number, dt: number, center: THREE.Vector3): void;
}

export function buildSnowWorld(scene: THREE.Scene, colors: string[]): SnowWorld {
  const rand = rng(5);
  const uTime = { value: 0 };
  const uCenter = { value: new THREE.Vector3() };
  scene.background = new THREE.Color(0xf4dfe0);
  scene.fog = new THREE.Fog(0xf3e0e2, 190, 820);

  // ---------- langit pagi ----------
  const sunDir = new THREE.Vector3(-0.42, 0.2, 0.88).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 36, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: sunDir } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 uSun;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 top = vec3(0.30, 0.52, 0.93);
          vec3 mid = vec3(0.62, 0.78, 0.98);
          vec3 low = vec3(1.00, 0.84, 0.78);
          vec3 c = mix(low, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, top, smoothstep(0.18, 0.85, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.62, 0.30) * pow(s, 6.0) * 0.55 + vec3(1.0, 0.85, 0.55) * pow(s, 40.0) * 0.8;
          c = mix(c, vec3(0.93, 0.86, 0.9), smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdbe9ff, 0xf2e4ea, 2.0));
  const sun = new THREE.DirectionalLight(0xffd9b0, 3.0);
  sun.position.copy(sunDir).multiplyScalar(90);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -21;
  sc.right = 21;
  sc.top = 21;
  sc.bottom = -21;
  sc.near = 20;
  sc.far = 230;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb9d2ff, 0.9);
  fill.position.set(10, 30, -50);
  scene.add(fill);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(820);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(sunDir).multiplyScalar(800);
  glow.lookAt(0, 0, 0);
  scene.add(glow);

  // ---------- medan: puncak bukit bulat ----------
  const tg = new THREE.PlaneGeometry(300, 300, 240, 240);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position as THREE.BufferAttribute;
  const colAttr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainH(x, z);
    pos.setY(i, y);
    const r = Math.hypot(x, z);
    const slope = ss(AR - 0.5, AR + 5, r) * (1 - ss(AR + 14, AR + 22, r));
    const sh = clamp(0.95 + 0.05 * Math.sin(x * 0.4) * Math.cos(z * 0.35), 0.88, 1);
    const blue = clamp(-y / 34, 0, 1) * 0.16 + slope * 0.1;
    colAttr[i * 3] = sh - blue * 0.55;
    colAttr[i * 3 + 1] = sh - blue * 0.3;
    colAttr[i * 3 + 2] = Math.min(1, sh + 0.02);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: snowTex(), vertexColors: true, roughness: 0.92 }));
  terrain.receiveShadow = true;
  scene.add(terrain);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ color: 0xe3e9f6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -34.6;
  scene.add(floor);

  // ---------- lambang arena + garis tepi ----------
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(AR - 0.2, 72),
    new THREE.MeshBasicMaterial({ map: emblemTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.025;
  scene.add(emblem);

  const dm = new THREE.Object3D();
  const col = new THREE.Color();
  {
    const N = 110;
    const band = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.05, 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      dm.position.set(Math.cos(a) * (AR - 0.4), 0.035, Math.sin(a) * (AR - 0.4));
      dm.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      band.setMatrixAt(i, dm.matrix);
      band.setColorAt(i, col.setHex(i % 2 ? 0xff5a6a : 0xffffff));
    }
    scene.add(band);
    const M = 36;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), mat(0xffffff, 0.6), M);
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xffffff, 0.6), M);
    for (let i = 0; i < M; i++) {
      const a = (i / M) * TAU;
      const x = Math.cos(a) * (AR + 0.1);
      const z = Math.sin(a) * (AR + 0.1);
      dm.position.set(x, 0.75 + terrainH(x, z), z);
      dm.rotation.set(0, 0, 0);
      dm.updateMatrix();
      post.setMatrixAt(i, dm.matrix);
      post.setColorAt(i, col.setHex(i % 2 ? 0xe5484d : 0xffffff));
      dm.position.y += 0.78;
      dm.updateMatrix();
      cap.setMatrixAt(i, dm.matrix);
      cap.setColorAt(i, col.setHex(i % 2 ? 0xe5484d : 0xffffff));
    }
    post.castShadow = true;
    scene.add(post, cap);
  }

  // ---------- titik awal pemain ----------
  const spots = [
    { x: 0, z: -9 },
    { x: -9, z: 0 },
    { x: 9, z: 0 },
    { x: 0, z: 9 },
  ];
  spots.forEach((s, i) => {
    const c4 = new THREE.Color(colors[i]);
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ color: c4, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(s.x, 0.04, s.z);
    scene.add(d);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 40), new THREE.MeshBasicMaterial({ color: c4, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(s.x, 0.05, s.z);
    scene.add(r);
    // tiang + bendera + papan nomor di belakang titik awal (dekat tepi)
    const L = Math.hypot(s.x, s.z) || 1;
    const px = (s.x / L) * (AR - 2.4);
    const pz = (s.z / L) * (AR - 2.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), mat(0x7a4a22));
    pole.position.set(px, 1.6, pz);
    pole.castShadow = true;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshStandardMaterial({ color: c4, side: THREE.DoubleSide, roughness: 0.6 }));
    flag.position.set(px - (s.z / L) * 0.6, 2.8, pz + (s.x / L) * 0.6);
    flag.rotation.y = Math.atan2(s.x, s.z) + Math.PI / 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.1), new THREE.MeshStandardMaterial({ map: signTex(i + 1, colors[i]), roughness: 0.6 }));
    board.position.set(px, 1.4, pz);
    board.rotation.y = Math.atan2(-s.x, -s.z);
    board.castShadow = true;
    scene.add(pole, flag, board);
  });

  // ---------- batu bersalju di tepi tebing ----------
  {
    const rg = new THREE.DodecahedronGeometry(0.8, 0);
    const N = 60;
    const rocks = new THREE.InstancedMesh(rg, mat(0x9aa3b4, 0.95), N);
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), mat(0xffffff, 0.95), N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rand() * 0.08;
      const r = AR + 0.9 + rand() * 1.8;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.7 + rand() * 1.2;
      const y = terrainH(x, z);
      dm.position.set(x, y + 0.2, z);
      dm.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      dm.scale.set(s, s * 0.8, s);
      dm.updateMatrix();
      rocks.setMatrixAt(i, dm.matrix);
      dm.position.y += s * 0.5;
      dm.rotation.set(0, 0, 0);
      dm.scale.set(s * 0.9, s * 0.38, s * 0.9);
      dm.updateMatrix();
      cap.setMatrixAt(i, dm.matrix);
    }
    rocks.castShadow = true;
    scene.add(rocks, cap);
  }

  // ---------- pondok kayu di lembah ----------
  const smoke: THREE.Mesh[] = [];
  const chim = new THREE.Vector3();
  const keepout: [number, number, number][] = [];
  const addCabin = (x: number, z: number, rotY: number, withSmoke: boolean) => {
    const y = terrainH(x, z);
    const g = new THREE.Group();
    const wood = mat(0x93603a, 0.9);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 5.4), wood);
    walls.position.y = 1.8;
    for (let k = 0; k < 6; k++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 7.5, 8), mat(0x7a4a28, 0.9));
      lg.rotation.z = Math.PI / 2;
      lg.position.set(0, 0.3 + k * 0.6, 2.75);
      g.add(lg);
    }
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.35, 4.2), mat(0x6a3f22, 0.9));
    roofL.position.set(0, 4.6, 1.65);
    roofL.rotation.x = 0.55;
    const roofR = roofL.clone();
    roofR.position.z = -1.65;
    roofR.rotation.x = -0.55;
    const snowL = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.4, 4.3), mat(0xffffff, 0.95));
    snowL.position.set(0, 4.85, 1.65);
    snowL.rotation.x = 0.55;
    const snowR = snowL.clone();
    snowR.position.z = -1.65;
    snowR.rotation.x = -0.55;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), mat(0x8a8f99, 0.9));
    chimney.position.set(2.3, 5.6, -0.8);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.15), mat(0x5a3a1e, 0.9));
    door.position.set(-1.6, 1.1, 2.75);
    const win = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc860, emissiveIntensity: 0.9, roughness: 0.4 });
    for (const wx of [1.2, 2.9]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.15), win);
      w.position.set(wx, 2.0, 2.75);
      g.add(w);
    }
    g.add(walls, roofL, roofR, snowL, snowR, chimney, door);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    scene.add(g);
    keepout.push([x, z, 11]);
    if (withSmoke) {
      chim.set(x + 2.3, y + 7, z - 0.8);
      const sg = new THREE.SphereGeometry(1, 10, 8);
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
        scene.add(m);
        smoke.push(m);
      }
    }
  };
  addCabin(-34, 62, Math.PI + 0.3, true);
  addCabin(38, 80, Math.PI - 0.4, false);
  addCabin(-8, 108, Math.PI, false);

  // ---------- pohon pinus bersalju di lembah ----------
  {
    const tr = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6);
    tr.translate(0, 1.1, 0);
    const greens: THREE.BufferGeometry[] = [];
    const whites: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const r = 2.7 - k * 0.65;
      const h = 3.0;
      const y0 = 1.7 + k * 1.45;
      const gc = new THREE.ConeGeometry(r, h, 9);
      gc.translate(0, y0 + h / 2, 0);
      greens.push(gc);
      const wc = new THREE.ConeGeometry(r * 0.86, h * 0.72, 9);
      wc.translate(0, y0 + h * 0.58, 0);
      whites.push(wc);
    }
    const N = 340;
    const trunk = new THREE.InstancedMesh(tr, mat(0x6b4426, 0.9), N);
    const green = new THREE.InstancedMesh(mergeGeometries(greens)!, mat(0x2f6f55, 0.9), N);
    const white = new THREE.InstancedMesh(mergeGeometries(whites)!, mat(0xffffff, 0.95), N);
    let n = 0;
    let tries = 0;
    while (n < N && tries++ < 9000) {
      const a = rand() * TAU;
      const r = AR + 20 + Math.pow(rand(), 1.3) * 150;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (keepout.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
      const y = terrainH(x, z);
      dm.position.set(x, y - 0.3, z);
      dm.rotation.set(0, rand() * 6, 0);
      dm.scale.setScalar(0.8 + rand() * 1.2);
      dm.updateMatrix();
      trunk.setMatrixAt(n, dm.matrix);
      green.setMatrixAt(n, dm.matrix);
      white.setMatrixAt(n, dm.matrix);
      n++;
    }
    trunk.count = green.count = white.count = n;
    for (const m of [trunk, green, white]) {
      m.castShadow = false;
      scene.add(m);
    }
  }

  // ---------- gunung jauh (puncak merah muda kena cahaya pagi) ----------
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rand() * 0.12;
    const r = 470 + rand() * 120;
    const h = 130 + rand() * 170;
    const rad = 95 + rand() * 90;
    const base = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mat(0x8fa9d2, 1));
    base.position.set(Math.cos(a) * r, h / 2 - 40, Math.sin(a) * r);
    scene.add(base);
    const lit = Math.max(0, Math.cos(a - Math.atan2(sunDir.z, sunDir.x)));
    const capM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, emissive: new THREE.Color(0xff9a80), emissiveIntensity: 0.12 + 0.55 * lit });
    const capH = h * 0.42;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.44, capH, 7), capM);
    cap.position.set(base.position.x, h - 40 - capH / 2 + 0.2, base.position.z);
    scene.add(cap);
  }

  // ---------- awan pagi ----------
  const clouds = new THREE.Group();
  const cm = [0xfff0ee, 0xffe2dc, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, fog: false }));
  const cg = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const rr = 7 + rand() * 9;
      const yy = rand() * 4;
      const m = new THREE.Mesh(cg, cm[yy > 2.6 ? 2 : yy > 1.2 ? 0 : 1]);
      m.scale.set(rr * 1.3, rr * 0.5, rr);
      m.position.set(k * 9 - n * 4.5, yy, (rand() - 0.5) * 8);
      g.add(m);
    }
    const a = rand() * TAU;
    const r = 220 + rand() * 360;
    g.position.set(Math.cos(a) * r, 70 + rand() * 110, Math.sin(a) * r);
    g.rotation.y = -a;
    clouds.add(g);
  }
  scene.add(clouds);

  // ---------- salju turun + kilau ----------
  {
    const flakeN = 1500;
    const geo = new THREE.BufferGeometry();
    const pp = new Float32Array(flakeN * 3);
    const sd = new Float32Array(flakeN);
    for (let i = 0; i < flakeN; i++) {
      pp[i * 3] = rand();
      pp[i * 3 + 1] = rand();
      pp[i * 3 + 2] = rand();
      sd[i] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime, uCenter },
      vertexShader: `uniform float uTime; uniform vec3 uCenter; attribute float aSeed; varying float vA;
        void main(){
          vec3 q = fract(position + vec3(uTime * 0.010 + sin(uTime * 0.5 + aSeed * 30.0) * 0.01, -uTime * (0.045 + aSeed * 0.04), uTime * 0.006));
          vec3 wp = uCenter + (q - 0.5) * vec3(90.0, 55.0, 90.0);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vA = 0.55 + 0.45 * aSeed;
          gl_PointSize = (0.14 + aSeed * 0.16) * 520.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(1.0, 1.0, 1.0, a * vA); }`,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
  }
  {
    const n = 420;
    const geo = new THREE.BufferGeometry();
    const pp = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const r = Math.sqrt(rand()) * (AR - 0.5);
      pp[i * 3] = Math.cos(a) * r;
      pp[i * 3 + 1] = 0.12;
      pp[i * 3 + 2] = Math.sin(a) * r;
      ph[i] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime },
      vertexShader: `uniform float uTime; attribute float aPhase; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = pow(max(sin(uTime * 1.8 + aPhase * 6.2831), 0.0), 4.0);
          vA = tw;
          gl_PointSize = (0.25 + tw) * 5.0 * 90.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float cr = max(smoothstep(0.06, 0.0, abs(c.x)), smoothstep(0.06, 0.0, abs(c.y))) * smoothstep(0.5, 0.1, d);
          float a = (smoothstep(0.5, 0.0, d) * 0.6 + cr) * vA; gl_FragColor = vec4(1.0, 0.97, 0.88, a); }`,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    scene.add(pts);
  }

  return {
    spots,
    update(t: number, dt: number, center: THREE.Vector3) {
      uTime.value = t;
      uCenter.value.copy(center);
      clouds.rotation.y = t * 0.003;
      glow.scale.setScalar(1 + Math.sin(t * 0.7) * 0.03);
      smoke.forEach((m, i) => {
        const u = (t * 0.22 + i / smoke.length) % 1;
        m.position.set(chim.x + u * 3.4 + Math.sin(t + i) * 0.3, chim.y + u * 11, chim.z + Math.cos(t * 0.8 + i) * 0.3);
        m.scale.setScalar(0.5 + u * 2.4);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - u) * Math.min(1, u * 6);
      });
      void dt;
    },
  };
}
