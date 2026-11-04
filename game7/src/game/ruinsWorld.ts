import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

// ---------- geometri lorong kuil ----------
export const HW = 11; // setengah lebar lorong
export const ND = 3.6; // kedalaman relung
export const NH = 1.9; // setengah panjang bukaan relung
export const Z0 = 6; // awal tanjakan
export const Z1 = 106; // akhir tanjakan
export const FIN = 106; // garis finish
export const BACK = -10; // dinding belakang area start
export const TOP = 128; // mulut kuil
export const SLOPE = 0.34;
export const NICHES: { s: number; z: number }[] = [
  { s: -1, z: -3 },
  { s: 1, z: -3 },
  { s: -1, z: 16 },
  { s: 1, z: 26 },
  { s: -1, z: 36 },
  { s: 1, z: 46 },
  { s: -1, z: 56 },
  { s: 1, z: 66 },
  { s: -1, z: 76 },
  { s: 1, z: 86 },
  { s: -1, z: 96 },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function ss(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function rampSlope(z: number) {
  return SLOPE * ss(Z0, Z0 + 8, z) * (1 - ss(Z1 - 8, Z1, z));
}
const ZMIN = -40;
const ZMAX = 180;
const STEP = 0.25;
const TAB = (() => {
  const n = Math.round((ZMAX - ZMIN) / STEP) + 1;
  const a = new Float32Array(n);
  let h = 0;
  for (let i = 1; i < n; i++) {
    h += rampSlope(ZMIN + i * STEP - STEP / 2) * STEP;
    a[i] = h;
  }
  return a;
})();
export function rampH(z: number) {
  const f = (clamp(z, ZMIN, ZMAX - 0.01) - ZMIN) / STEP;
  const i = Math.floor(f);
  const u = f - i;
  return TAB[i] + (TAB[i + 1] - TAB[i]) * u;
}
export const H_TOP = rampH(Z1 + 1);

function terr(x: number, z: number) {
  const e = Math.abs(x) - (HW + ND + 0.6);
  const h = rampH(z) - 0.45;
  if (e <= 0 && z >= BACK - 0.5 && z <= TOP + 0.5) return h;
  let up = 0;
  if (e > 0) up += 22 * ss(0, 20, e);
  if (z < BACK - 0.5) up += 22 * ss(0, 18, BACK - 0.5 - z);
  if (z > TOP + 0.5) up += 34 * ss(0, 24, z - TOP - 0.5);
  const n = Math.sin(x * 0.13 + z * 0.09) * 1.6 + Math.sin(x * 0.31 - z * 0.27) * 0.7 + Math.sin(x * 0.071 + z * 0.053 + 1.3) * 2.2;
  return h + up + n * ss(2, 12, Math.max(e, BACK - 0.5 - z, z - TOP - 0.5));
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
  t.anisotropy = 8;
  return t;
}
const mat = (c: number, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// ---------- tekstur ----------
function stoneCanvas(seed: number, base: [number, number, number], moss: number, slabs: number) {
  const rnd = rng(seed);
  const { c, g } = cv(512, 512);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, 512, 512);
  const s = 512 / slabs;
  for (let i = 0; i < slabs; i++)
    for (let j = 0; j < slabs; j++) {
      const v = (rnd() - 0.5) * 30;
      g.fillStyle = v > 0 ? `rgba(255,240,205,${v / 100})` : `rgba(60,40,20,${-v / 90})`;
      g.fillRect(i * s, j * s, s, s);
    }
  for (let i = 0; i < 2800; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,245,220,0.10)' : 'rgba(70,50,30,0.13)';
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(58,40,22,0.78)';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= slabs; i++) {
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 512);
    g.moveTo(0, i * s);
    g.lineTo(512, i * s);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,238,200,0.28)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= slabs; i++) {
    g.moveTo(i * s + 4, 0);
    g.lineTo(i * s + 4, 512);
    g.moveTo(0, i * s + 4);
    g.lineTo(512, i * s + 4);
  }
  g.stroke();
  g.strokeStyle = 'rgba(48,32,18,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let m = 0; m < 6; m++) {
      x += (rnd() - 0.5) * 60;
      y += (rnd() - 0.3) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < moss; k++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 10 + rnd() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(78,140,52,0.55)');
    gr.addColorStop(1, 'rgba(78,140,52,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

export function boulderTex() {
  const rnd = rng(77);
  const { c, g } = cv(512, 512);
  g.fillStyle = '#8f8472';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 18 + rnd() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(52,44,36,0.45)' : 'rgba(210,196,170,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,245,225,0.12)' : 'rgba(40,30,22,0.18)';
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(30,22,16,0.7)';
  g.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let m = 0; m < 7; m++) {
      x += (rnd() - 0.5) * 70;
      y += (rnd() - 0.5) * 70;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < 20; k++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 14 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(90,140,60,0.5)');
    gr.addColorStop(1, 'rgba(90,140,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c, 1, 1, true);
}

function faceCanvas() {
  const W = 1024;
  const H = 664;
  const { c, g } = cv(W, H);
  const base = stoneCanvas(31, [196, 168, 122], 26, 4);
  g.drawImage(base, 0, 0, W, H);
  g.fillStyle = 'rgba(40,26,14,0.18)';
  g.fillRect(0, 0, W, H);
  // bingkai
  g.strokeStyle = 'rgba(40,26,14,0.8)';
  g.lineWidth = 14;
  g.strokeRect(12, 12, W - 24, H - 24);
  // dahi & alis
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(46,30,16,0.9)';
  g.lineWidth = 22;
  g.beginPath();
  g.moveTo(160, 120);
  g.quadraticCurveTo(310, 60, 450, 130);
  g.moveTo(864, 120);
  g.quadraticCurveTo(714, 60, 574, 130);
  g.stroke();
  // mata
  for (const ex of [305, 719]) {
    g.fillStyle = '#150e07';
    g.beginPath();
    g.ellipse(ex, 195, 98, 58, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#d6a431';
    g.lineWidth = 9;
    g.stroke();
    g.fillStyle = '#ffcf4a';
    g.beginPath();
    g.ellipse(ex, 195, 14, 40, 0, 0, TAU);
    g.fill();
  }
  // hidung
  g.fillStyle = 'rgba(40,26,14,0.5)';
  g.beginPath();
  g.moveTo(512, 215);
  g.lineTo(446, 360);
  g.lineTo(578, 360);
  g.closePath();
  g.fill();
  // pipi berspiral
  g.strokeStyle = 'rgba(46,30,16,0.75)';
  g.lineWidth = 8;
  for (const sx of [150, 874]) {
    g.beginPath();
    for (let a = 0; a < 14; a += 0.2) {
      const r = 4 + a * 4.2;
      const x = sx + Math.cos(a) * r;
      const y = 345 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // mulut = pintu gelap tempat batu keluar
  const mx0 = (W - 271) / 2;
  const my0 = H - 255;
  g.fillStyle = '#080604';
  g.fillRect(mx0, my0, 271, 255);
  // gigi
  g.fillStyle = '#d9c9a0';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(mx0 + i * 45 + 2, my0);
    g.lineTo(mx0 + i * 45 + 43, my0);
    g.lineTo(mx0 + i * 45 + 22, my0 + 38);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(40,26,14,0.9)';
  g.lineWidth = 12;
  g.strokeRect(mx0 - 6, my0 - 6, 283, 261);
  return c;
}

function bannerTex(text: string, sub: string) {
  const { c, g } = cv(1024, 256);
  const base = stoneCanvas(19, [188, 160, 116], 8, 2);
  g.drawImage(base, 0, 0, 1024, 256);
  g.fillStyle = 'rgba(30,18,8,0.28)';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#e1b13a';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 228);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 108px Fredoka, sans-serif';
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(30,16,4,0.85)';
  g.strokeText(text, 512, sub ? 108 : 130);
  g.fillStyle = '#ffd563';
  g.fillText(text, 512, sub ? 108 : 130);
  if (sub) {
    g.font = '700 54px Fredoka, sans-serif';
    g.fillStyle = '#fff1c9';
    g.lineWidth = 8;
    g.strokeText(sub, 512, 196);
    g.fillText(sub, 512, 196);
  }
  return toTex(c);
}

function glyphTex() {
  const { c, g } = cv(512, 512);
  g.translate(256, 256);
  g.strokeStyle = 'rgba(60,40,20,0.7)';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(0, 0, 232, 0, TAU);
  g.stroke();
  g.lineWidth = 8;
  g.beginPath();
  g.arc(0, 0, 150, 0, TAU);
  g.stroke();
  for (let k = 0; k < 12; k++) {
    g.save();
    g.rotate((k * TAU) / 12);
    g.beginPath();
    g.moveTo(0, -158);
    g.lineTo(0, -222);
    g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(60,40,20,0.72)';
  g.beginPath();
  g.ellipse(0, 22, 56, 46, 0, 0, TAU);
  g.fill();
  for (const [x, y] of [[-62, -34], [-22, -64], [22, -64], [62, -34]]) {
    g.beginPath();
    g.ellipse(x, y, 20, 26, 0, 0, TAU);
    g.fill();
  }
  return toTex(c);
}

function glowTex() {
  const { c, g } = cv(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,230,160,1)');
  gr.addColorStop(0.25, 'rgba(255,170,70,0.7)');
  gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return toTex(c);
}

function chevronTex() {
  const { c, g } = cv(128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 20;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(14, 26);
  g.lineTo(64, 84);
  g.lineTo(114, 26);
  g.stroke();
  return toTex(c, 1, 1, true);
}

function checkerTex() {
  const { c, g } = cv(512, 64);
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#1a1208' : '#fff3cf';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  return toTex(c);
}

export interface Strip {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
}

export interface RuinsWorld {
  starts: { x: number; z: number }[];
  makeStrip(): Strip;
  update(t: number, dt: number, focus: THREE.Vector3): void;
}

export function buildRuinsWorld(scene: THREE.Scene, colors: string[]): RuinsWorld {
  const rand = rng(404);
  const uTime = { value: 0 };
  const uCenter = { value: new THREE.Vector3() };
  scene.background = new THREE.Color(0xf0dcaa);
  scene.fog = new THREE.Fog(0xe8d7a2, 130, 640);

  // ---------- langit senja keemasan ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 36, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 top = vec3(0.20, 0.47, 0.82);
          vec3 mid = vec3(0.70, 0.82, 0.78);
          vec3 low = vec3(1.00, 0.84, 0.52);
          vec3 c = mix(low, mid, smoothstep(0.0, 0.26, h));
          c = mix(c, top, smoothstep(0.2, 0.9, h));
          vec3 sun = normalize(vec3(0.0, 0.16, 1.0));
          float s = max(dot(d, sun), 0.0);
          c += vec3(1.0, 0.72, 0.35) * pow(s, 5.0) * 0.55 + vec3(1.0, 0.92, 0.65) * pow(s, 60.0);
          c = mix(c, vec3(0.78, 0.82, 0.6), smoothstep(0.0, -0.3, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xfff0cf, 0x6a8a52, 1.55));
  const sun = new THREE.DirectionalLight(0xffe2b0, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 5;
  sc.far = 130;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffc27a, 0.8);
  fill.position.set(0, 20, 120);
  scene.add(fill);

  // ---------- medan hutan ----------
  const tg = new THREE.PlaneGeometry(260, 230, 130, 115);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position as THREE.BufferAttribute;
  const tcol = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i) + 75;
    tp.setZ(i, z);
    tp.setY(i, terr(x, z));
    const v = 0.78 + 0.22 * Math.sin(x * 0.21 + z * 0.17) * Math.cos(z * 0.13 - x * 0.09);
    tcol[i * 3] = 0.42 * v;
    tcol[i * 3 + 1] = 0.72 * v;
    tcol[i * 3 + 2] = 0.32 * v;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const tuv = tg.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tp.getX(i) / 10, tp.getZ(i) / 10);
  tg.computeVertexNormals();
  const jt = cv(256, 256);
  {
    const r2 = rng(8);
    jt.g.fillStyle = '#4d9a3e';
    jt.g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      jt.g.fillStyle = r2() < 0.5 ? 'rgba(20,80,30,0.3)' : 'rgba(170,230,110,0.25)';
      jt.g.beginPath();
      jt.g.arc(r2() * 256, r2() * 256, 2 + r2() * 5, 0, TAU);
      jt.g.fill();
    }
  }
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: toTex(jt.c, 1, 1, true), vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  scene.add(terrain);
  const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ color: 0x4b7a3a }));
  floorBase.rotation.x = -Math.PI / 2;
  floorBase.position.y = -30;
  scene.add(floorBase);

  // ---------- lantai batu lorong ----------
  const W = HW + ND + 0.1;
  {
    const M = 280;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= M; i++) {
      const z = BACK + ((TOP - BACK) * i) / M;
      const y = rampH(z);
      pos.push(-W, y, z, W, y, z);
      uv.push(-W / 8, z / 8, W / 8, z / 8);
    }
    for (let i = 0; i < M; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: toTex(stoneCanvas(5, [204, 178, 134], 22, 2), 1, 1, true), roughness: 0.95 }));
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ---------- dinding blok batu + relung ----------
  const dm = new THREE.Object3D();
  const col = new THREE.Color();
  const wallTexC = stoneCanvas(12, [190, 158, 112], 18, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: toTex(wallTexC, 1, 1, true), roughness: 0.95 });
  {
    const items: { x: number; y: number; z: number; rx: number }[] = [];
    for (const s of [-1, 1]) {
      for (let zc = BACK; zc <= TOP + 0.01; zc += 2.4) {
        for (let r = 0; r < 4; r++) {
          const zz = zc + (r % 2 ? 1.2 : 0);
          if (NICHES.some((n) => n.s === s && zz + 1.2 > n.z - NH && zz - 1.2 < n.z + NH)) continue;
          const phi = Math.atan(rampSlope(zz));
          items.push({ x: s * (HW + 1.0), y: rampH(zz) + 0.675 + r * 1.35, z: zz, rx: -phi });
        }
      }
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 1.35, 2.42), wallMat, items.length);
    items.forEach((it, i) => {
      dm.position.set(it.x + (rand() - 0.5) * 0.06, it.y + (rand() - 0.5) * 0.04, it.z);
      dm.rotation.set(it.rx, 0, 0);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      inst.setMatrixAt(i, dm.matrix);
      const v = 0.78 + rand() * 0.22;
      inst.setColorAt(i, col.setRGB(v, v * 0.97, v * 0.9));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);

    // penutup atas berlumut
    const caps: { x: number; y: number; z: number; rx: number }[] = [];
    for (const s of [-1, 1])
      for (let zc = BACK; zc <= TOP + 0.01; zc += 2.4) {
        if (NICHES.some((n) => n.s === s && zc + 1.3 > n.z - NH && zc - 1.3 < n.z + NH)) continue;
        caps.push({ x: s * (HW + 1.0), y: rampH(zc) + 5.55, z: zc, rx: -Math.atan(rampSlope(zc)) });
      }
    const capI = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.42, 2.5), mat(0x7fae52, 1), caps.length);
    caps.forEach((it, i) => {
      dm.position.set(it.x, it.y, it.z);
      dm.rotation.set(it.rx, 0, 0);
      dm.updateMatrix();
      capI.setMatrixAt(i, dm.matrix);
      const v = 0.75 + rand() * 0.35;
      capI.setColorAt(i, col.setRGB(v * 0.8, v, v * 0.62));
    });
    scene.add(capI);

    // dedaunan lebat di atas dinding
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0x3f9a3e, 0.95), 170);
    for (let i = 0; i < 170; i++) {
      const s = i % 2 ? 1 : -1;
      const z = BACK + 4 + rand() * (TOP - BACK - 8);
      const r = 0.9 + rand() * 1.5;
      dm.position.set(s * (HW + 0.5 + rand() * 2.6), rampH(z) + 5.9 + rand() * 0.8, z);
      dm.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      dm.scale.set(r * 1.3, r * 0.8, r * 1.3);
      dm.updateMatrix();
      bush.setMatrixAt(i, dm.matrix);
      bush.setColorAt(i, col.setHSL(0.27 + rand() * 0.07, 0.55, 0.28 + rand() * 0.14));
    }
    bush.castShadow = true;
    scene.add(bush);
  }

  const phiAt = (z: number) => -Math.atan(rampSlope(z));
  const slopedBox = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.x = phiAt(z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    return b;
  };
  const okGlow = new THREE.MeshBasicMaterial({ color: 0x66ff9a, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const n of NICHES) {
    const h = rampH(n.z);
    const cx = n.s * (HW + 1.0);
    slopedBox(2.0, 5.4, 2 * NH + 2.6, n.s * (HW + ND + 1.0), h + 2.7, n.z, wallMat); // dinding belakang relung
    slopedBox((ND + 2.0), 5.4, 2.6, n.s * (HW + (ND + 2.0) / 2), h + 2.7, n.z - (NH + 1.3), wallMat); // sisi
    slopedBox((ND + 2.0), 5.4, 2.6, n.s * (HW + (ND + 2.0) / 2), h + 2.7, n.z + (NH + 1.3), wallMat);
    slopedBox(2.0, 2.0, 2 * NH + 0.2, cx, h + 4.4, n.z, wallMat); // ambang atas
    slopedBox(ND + 0.1, 2.0, 2 * NH + 0.2, n.s * (HW + ND / 2 + 0.05), h + 4.4, n.z, wallMat); // atap relung
    // tanda aman
    const g = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), okGlow);
    g.rotation.x = -Math.PI / 2 - Math.atan(rampSlope(n.z));
    g.position.set(n.s * (HW + ND / 2 + 0.2), h + 0.06, n.z);
    scene.add(g);
  }

  // ---------- obor ----------
  const flames: { a: THREE.Mesh; b: THREE.Mesh; s: THREE.Sprite; ph: number }[] = [];
  const glow = glowTex();
  const flameA = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.92, depthWrite: false });
  const flameB = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95, depthWrite: false });
  const addTorch = (x: number, y: number, z: number, scale = 1) => {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8), mat(0x5a3a1e, 0.9));
    stick.position.y = 0.3;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.28, 10), mat(0x2f2a26, 0.7, 0.4));
    bowl.position.y = 0.95;
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), flameA);
    a.position.y = 1.4;
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 8), flameB);
    b.position.y = 1.3;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8, fog: false }));
    sp.scale.set(3.4, 3.4, 1);
    sp.position.y = 1.4;
    g.add(stick, bowl, a, b, sp);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    scene.add(g);
    flames.push({ a, b, s: sp, ph: rand() * 6 });
  };
  for (let k = 0; k < 10; k++) {
    const z = 21 + k * 10;
    const s = k % 2 ? 1 : -1;
    addTorch(s * (HW - 0.35), rampH(z) + 2.0, z);
  }
  for (const s of [-1, 1]) addTorch(s * (HW - 0.4), rampH(2) + 2.0, 2);

  // ---------- gerbang lengkung ----------
  const addArch = (z: number, text: string, sub: string) => {
    const h = rampH(z);
    for (const s of [-1, 1]) {
      slopedBox(3.2, 11.2, 3.0, s * (HW + 1.0), h + 5.6, z, wallMat);
      slopedBox(3.6, 0.7, 3.4, s * (HW + 1.0), h + 0.35, z, wallMat);
      slopedBox(3.5, 0.6, 3.3, s * (HW + 1.0), h + 11.4, z, wallMat);
    }
    slopedBox(2 * HW + 4, 3.2, 3.0, 0, h + 11.2, z, wallMat);
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW - 1, (2 * HW - 1) / 4), new THREE.MeshBasicMaterial({ map: bannerTex(text, sub) }));
    bn.position.set(0, h + 11.2, z - 1.53);
    bn.rotation.set(phiAt(z), Math.PI, 0, 'YXZ');
    scene.add(bn);
    for (let k = 0; k < 9; k++) {
      const len = 1.5 + rand() * 3.2;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, len, 5), mat(0x3d8f3a, 1));
      v.position.set(-HW + 2 + rand() * (2 * HW - 4), h + 9.6 - len / 2, z - 1.6);
      scene.add(v);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rand() * 0.2, 0), mat(0x4aa645, 1));
      leaf.position.set(v.position.x, h + 9.6 - len, z - 1.6);
      scene.add(leaf);
    }
  };
  addArch(Z0 - 1.5, 'KUIL BATU MAUT', 'panjat sebelum batu menggilasmu!');
  addArch(56, 'TERUS NAIK!', '');
  addArch(84, 'HAMPIR SAMPAI!', '');

  // ---------- ukiran matahari di lantai ----------
  {
    const gt = glyphTex();
    for (const z of [32, 62, 92]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.rotation.x = -Math.PI / 2 - Math.atan(rampSlope(z));
      m.position.set(0, rampH(z) + 0.04, z);
      scene.add(m);
    }
  }

  // ---------- area start ----------
  const starts = [
    { x: 2.5, z: -1.5 },
    { x: -2.5, z: -1.5 },
    { x: 7.5, z: -1.5 },
    { x: -7.5, z: -1.5 },
  ];
  starts.forEach((s, i) => {
    const c = new THREE.Color(colors[i]);
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.55, 36), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(s.x, 0.04, s.z);
    scene.add(d);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.58, 36), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(s.x, 0.05, s.z);
    scene.add(r);
  });
  {
    const back = new THREE.Mesh(new THREE.BoxGeometry(2 * (HW + ND + 3), 16, 3), wallMat);
    back.position.set(0, 7.5, BACK - 1.5);
    back.castShadow = true;
    scene.add(back);
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: bannerTex('AWAS BATU!', 'jangan sampai tergilas') }));
    bn.position.set(0, 8.5, BACK + 0.04);
    scene.add(bn);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, 1.1), new THREE.MeshBasicMaterial({ map: (() => { const t = checkerTex(); t.repeat.set(1, 1); return t; })(), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(0, 0.05, Z0 - 3);
    scene.add(sl);
  }

  // ---------- garis finish + berhala emas ----------
  const idol = new THREE.Group();
  {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW, 1.4), new THREE.MeshBasicMaterial({ map: checkerTex(), transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, H_TOP + 0.05, FIN);
    scene.add(fl);
    addArch(FIN + 1.2, 'PUNCAK EMAS', 'sentuh berhala untuk menang');
    const ped = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 3.0), wallMat);
    ped.position.set(0, H_TOP + 0.8, FIN + 9);
    ped.castShadow = true;
    scene.add(ped);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.22, metalness: 0.85, emissive: 0x7a4a00, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), gold);
    body.scale.set(1, 1.15, 0.9);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), gold);
    head.position.y = 2.15;
    idol.add(body, head);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 4), gold);
      ear.position.set(sx * 0.42, 2.75, 0);
      ear.rotation.z = -sx * 0.25;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a1a00 }));
      eye.position.set(sx * 0.23, 2.22, 0.55);
      idol.add(ear, eye);
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 18, Math.PI * 1.3), gold);
    tail.position.set(0, 0.9, -0.8);
    tail.rotation.y = Math.PI / 2;
    idol.add(tail);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false }));
    halo.scale.set(9, 9, 1);
    halo.position.y = 1.7;
    idol.add(halo);
    idol.position.set(0, H_TOP + 1.6, FIN + 9);
    idol.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    scene.add(idol);
    for (const s of [-1, 1]) addTorch(s * 4.5, H_TOP, FIN + 9, 1.4);
  }

  // ---------- kuil dengan wajah raksasa (mulut = tempat batu keluar) ----------
  {
    const fct = toTex(faceCanvas());
    const faces = [wallMat, wallMat, wallMat, wallMat, wallMat, new THREE.MeshStandardMaterial({ map: fct, roughness: 0.95 })];
    const facade = new THREE.Mesh(new THREE.BoxGeometry(34, 22, 6), faces);
    facade.position.set(0, H_TOP + 11, TOP + 3);
    facade.castShadow = true;
    scene.add(facade);
    const tiers: [number, number, number, number][] = [
      [46, 11, 34, 0],
      [34, 11, 26, 11],
      [22, 11, 18, 22],
      [12, 8, 10, 33],
    ];
    tiers.forEach(([w, h, d, y], i) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      t.position.set(0, H_TOP + 22 + y + h / 2, TOP + 6 + d / 2 - 2 + i * 0.5);
      t.castShadow = true;
      scene.add(t);
      const mossTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.5, d * 0.96), mat(0x5f9a45, 1));
      mossTop.position.set(0, H_TOP + 22 + y + h + 0.25, t.position.z);
      scene.add(mossTop);
    });
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(28, 14, 30), wallMat);
      wing.position.set(s * 33, H_TOP + 6, TOP + 14);
      wing.castShadow = true;
      scene.add(wing);
      const wm = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 28), mat(0x5f9a45, 1));
      wm.position.set(s * 33, H_TOP + 14.25, TOP + 14);
      scene.add(wm);
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 16, 14), wallMat);
      pil.position.set(s * 9, H_TOP + 8, TOP - 1.6);
      pil.castShadow = true;
      scene.add(pil);
      for (const yy of [3, 8, 13]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.14, 8, 18), mat(0x7a5a30, 0.9));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(s * 9, H_TOP + yy, TOP - 1.6);
        scene.add(ring);
      }
      addTorch(s * 9, H_TOP + 16, TOP - 1.6, 1.6);
    }
  }

  // ---------- pohon hutan ----------
  {
    const trunkG = new THREE.CylinderGeometry(0.45, 0.75, 6, 7);
    trunkG.translate(0, 3, 0);
    const parts: THREE.BufferGeometry[] = [];
    for (const [x, y, z, r] of [[0, 7.5, 0, 3.2], [2.0, 6.4, 0.8, 2.5], [-2.0, 6.8, -0.6, 2.7], [0.4, 9.2, 0.2, 2.3]]) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.translate(x, y, z);
      parts.push(g);
    }
    const canopyG = mergeGeometries(parts)!;
    const N = 300;
    const trunk = new THREE.InstancedMesh(trunkG, mat(0x6b4426, 0.95), N);
    const canopy = new THREE.InstancedMesh(canopyG, mat(0x2f9a3e, 0.95), N);
    let n = 0;
    let tries = 0;
    while (n < N && tries++ < 9000) {
      const x = (rand() - 0.5) * 220;
      const z = -26 + rand() * 190;
      const e = Math.abs(x) - (HW + ND + 0.6);
      if (e < 4) continue;
      if (z > TOP - 10 && Math.abs(x) < 46) continue;
      const y = terr(x, z);
      dm.position.set(x, y - 0.4, z);
      dm.rotation.set(0, rand() * 6, 0);
      dm.scale.setScalar(0.9 + rand() * 1.5);
      dm.updateMatrix();
      trunk.setMatrixAt(n, dm.matrix);
      canopy.setMatrixAt(n, dm.matrix);
      canopy.setColorAt(n, col.setHSL(0.25 + rand() * 0.1, 0.55 + rand() * 0.2, 0.24 + rand() * 0.14));
      n++;
    }
    trunk.count = canopy.count = n;
    trunk.castShadow = false;
    scene.add(trunk, canopy);
  }

  // ---------- gunung jauh ----------
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + rand() * 0.1;
    const r = 420 + rand() * 110;
    const h = 110 + rand() * 150;
    const rad = 90 + rand() * 80;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mat(i % 2 ? 0x4f8a5a : 0x5b9a68, 1));
    m.position.set(Math.cos(a) * r, h / 2 - 40, 60 + Math.sin(a) * r);
    scene.add(m);
  }

  // ---------- partikel debu emas ----------
  {
    const n = 500;
    const geo = new THREE.BufferGeometry();
    const pp = new Float32Array(n * 3);
    const sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
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
      blending: THREE.AdditiveBlending,
      uniforms: { uTime, uCenter },
      vertexShader: `uniform float uTime; uniform vec3 uCenter; attribute float aSeed; varying float vA;
        void main(){
          vec3 q = fract(position + vec3(sin(uTime * 0.2 + aSeed * 20.0) * 0.01, uTime * 0.012 * (0.4 + aSeed), uTime * 0.01));
          vec3 wp = uCenter + (q - 0.5) * vec3(44.0, 18.0, 70.0) + vec3(0.0, 4.0, 14.0);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float tw = 0.4 + 0.6 * pow(max(sin(uTime * 1.6 + aSeed * 40.0), 0.0), 2.0);
          vA = tw;
          gl_PointSize = (0.12 + aSeed * 0.16) * 520.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(1.0, 0.86, 0.5, a * vA * 0.7); }`,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
  }

  // ---------- jalur peringatan batu ----------
  const chevron = chevronTex();
  const makeStrip = (): Strip => {
    const M = 90;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= M; i++) {
      const z = BACK + 1 + ((TOP - 1 - (BACK + 1)) * i) / M;
      const y = rampH(z) + 0.07;
      pos.push(-1, y, z, 1, y, z);
      uv.push(0, z / 6, 1, z / 6);
    }
    for (let i = 0; i < M; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = chevron.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xff3b2b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    return { mesh, mat: m, tex };
  };

  return {
    starts,
    makeStrip,
    update(t: number, dt: number, focus: THREE.Vector3) {
      uTime.value = t;
      uCenter.value.copy(focus);
      sun.position.set(focus.x - 22, focus.y + 34, focus.z - 26);
      sun.target.position.copy(focus);
      flames.forEach((f, i) => {
        const k = 0.85 + 0.35 * Math.sin(t * 11 + f.ph) * Math.sin(t * 7 + i);
        f.a.scale.set(1 + 0.12 * Math.sin(t * 13 + f.ph), k, 1);
        f.b.scale.set(1, 0.9 + 0.4 * Math.sin(t * 17 + f.ph), 1);
        f.s.material.opacity = 0.65 + 0.2 * Math.sin(t * 9 + f.ph);
      });
      idol.rotation.y = t * 0.8;
      idol.position.y = H_TOP + 1.6 + Math.sin(t * 1.6) * 0.14;
      void dt;
    },
  };
}
