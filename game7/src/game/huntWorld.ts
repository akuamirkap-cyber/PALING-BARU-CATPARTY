import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from './audio';

export const H_WATER_Y = -0.9;
export const H_DOCK_R = 9.6; // radius pulau rumput (area yang bisa diinjak)
export const H_SPOT_R = 5.4;
export const H_SHORE = 46; // tepi daratan di seberang kolam
const TAU = Math.PI * 2;

export function hWave(x: number, z: number, t: number) {
  return H_WATER_Y + Math.sin(x * 0.3 + t * 1.2) * 0.08 + Math.sin(z * 0.37 + t * 0.9) * 0.08;
}

export interface HSpot {
  x: number;
  z: number;
  dx: number;
  dz: number;
  a: number;
}

export interface Blocker {
  x: number;
  z: number;
  r: number;
  h: number;
}

export interface HuntWorld {
  spots: HSpot[];
  blockers: Blocker[];
  update(t: number, dt: number, cam?: THREE.Vector3): void;
  popDog(kind: 'laugh' | 'wag'): void;
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

// rumput bergaris-garis seperti lapangan dipotong + helai-helai kecil
function grassTex(rx: number, ry: number, seed: number) {
  const rnd = rng(seed);
  const { c, g } = cv(512, 512);
  const n = 8;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#7ae05c' : '#6ed352';
    g.fillRect(0, (i * 512) / n, 512, 512 / n);
  }
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const len = 5 + rnd() * 9;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(30,110,40,0.35)' : 'rgba(190,255,150,0.3)';
    g.lineWidth = 1.2 + rnd() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 6, y - len);
    g.stroke();
  }
  for (let i = 0; i < 38; i++) {
    g.fillStyle = ['rgba(255,255,255,0.8)', 'rgba(255,224,90,0.8)', 'rgba(255,150,190,0.7)'][i % 3];
    g.beginPath();
    g.arc(rnd() * 512, rnd() * 512, 2 + rnd() * 1.5, 0, TAU);
    g.fill();
  }
  return toTex(c, rx, ry, true);
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

function glowTex() {
  const { c, g } = cv(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,240,180,0.8)');
  gr.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return toTex(c);
}

const std = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

// ---------- anjing Duck Hunt ----------
function buildDog() {
  const g = new THREE.Group();
  const brown = 0xb5692b;
  const m = (c: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const sp = (r: number, c: number, sx = 1, sy = 1, sz = 1, rough = 0.8) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m(c, rough));
    o.scale.set(sx, sy, sz);
    return o;
  };
  const torso = sp(0.85, brown, 0.95, 1.05, 0.85);
  torso.position.y = 0.45;
  g.add(torso);
  const chest = sp(0.5, 0xf0d3a8, 0.9, 1, 0.5);
  chest.position.set(0, 0.5, 0.52);
  g.add(chest);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 8, 20), m(0xd23a3a, 0.5));
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.12, 0.05);
  g.add(collar);

  const head = new THREE.Group();
  head.position.set(0, 1.55, 0.12);
  g.add(head);
  head.add(sp(0.58, brown, 1.02, 0.96, 1));
  const snout = sp(0.34, 0xf0d3a8, 0.85, 0.66, 1.15);
  snout.position.set(0, -0.14, 0.52);
  head.add(snout);
  const nose = sp(0.12, 0x111111, 1.2, 0.9, 1, 0.3);
  nose.position.set(0, -0.02, 0.9);
  head.add(nose);
  const mouth = sp(0.2, 0xd8436a, 1.1, 0.5, 0.8);
  mouth.position.set(0, -0.36, 0.62);
  mouth.scale.y = 0.001;
  head.add(mouth);
  for (const s of [-1, 1]) {
    const eye = sp(0.075, 0x111111, 1, 1.2, 0.7, 0.3);
    eye.position.set(s * 0.22, 0.16, 0.5);
    head.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(s * 0.22 + 0.02, 0.2, 0.56);
    head.add(hl);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04), m(0x5a2f12));
    brow.position.set(s * 0.22, 0.3, 0.5);
    brow.rotation.z = -s * 0.25;
    head.add(brow);
  }
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.52, 0.28, -0.04);
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m(0x6b3a1a));
    ear.position.set(s * 0.08, -0.3, 0);
    ear.scale.z = 0.6;
    e.add(ear);
    e.rotation.z = s * 0.35;
    head.add(e);
    ears.push(e);
  }
  // cakar di atas semak
  for (const s of [-1, 1]) {
    const paw = sp(0.2, 0xf6e7c8, 1, 0.8, 1.2);
    paw.position.set(s * 0.5, 0.15, 0.95);
    g.add(paw);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  return { g, head, mouth, ears };
}

export function buildHuntWorld(scene: THREE.Scene, colors: string[]): HuntWorld {
  const rand = rng(77);
  scene.background = new THREE.Color(0xbfe6ff);
  scene.fog = new THREE.Fog(0xe2f4ff, 150, 430);

  // kubah langit: biru dalam di atas, turun ke putih kekuningan di cakrawala
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(560, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.07, 0.42, 0.96);
          vec3 mid = vec3(0.30, 0.70, 1.00);
          vec3 hor = vec3(0.88, 0.97, 1.00);
          vec3 warm = vec3(1.00, 0.95, 0.82);
          vec3 c = mix(hor, mid, smoothstep(0.02, 0.32, h));
          c = mix(c, top, smoothstep(0.30, 0.95, h));
          c = mix(c, warm, smoothstep(0.10, 0.0, abs(h)) * 0.35);
          c = mix(c, vec3(0.80, 0.94, 1.0), smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcdeaff, 0xa8d878, 1.75));
  const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.1);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -15;
  sc.right = 15;
  sc.top = 15;
  sc.bottom = -15;
  sc.near = 5;
  sc.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.6);
  fill.position.set(sunDir.x * -30, 18, sunDir.z * -30);
  scene.add(fill);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(420);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, fog: false }));
  glow.position.copy(sunDir).multiplyScalar(415);
  glow.lookAt(0, 0, 0);
  scene.add(glow);

  // ---------- air kolam ----------
  const wGeo = new THREE.PlaneGeometry(300, 300, 76, 76);
  wGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    wGeo,
    new THREE.MeshStandardMaterial({ color: 0x33d2ef, emissive: 0x0b6f8c, emissiveIntensity: 0.5, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.86, flatShading: true }),
  );
  water.receiveShadow = true;
  scene.add(water);
  const wPos = wGeo.attributes.position as THREE.BufferAttribute;
  const wBase = new Float32Array(wPos.count * 2);
  for (let i = 0; i < wPos.count; i++) {
    wBase[i * 2] = wPos.getX(i);
    wBase[i * 2 + 1] = wPos.getZ(i);
  }
  const bed = new THREE.Mesh(new THREE.CircleGeometry(200, 32), std(0x58d6e6, 1));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -6;
  scene.add(bed);

  // ---------- pulau rumput ----------
  const topMat = new THREE.MeshStandardMaterial({ map: grassTex(6, 6, 11), roughness: 0.95 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 1 });
  const island = new THREE.Mesh(new THREE.CylinderGeometry(H_DOCK_R + 0.15, H_DOCK_R + 1.1, 1.3, 64), [soilMat, topMat, soilMat]);
  island.position.y = -0.65;
  island.receiveShadow = true;
  island.castShadow = true;
  scene.add(island);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(H_DOCK_R + 0.1, 0.34, 8, 80), std(0x62cf4c, 0.95));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.05;
  lip.scale.z = 0.8;
  scene.add(lip);

  // batu di tepi pulau
  const rockG = new THREE.DodecahedronGeometry(0.5, 0);
  const rocks = new THREE.InstancedMesh(rockG, std(0x9aa0a8, 0.95), 46);
  const dm = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < 46; i++) {
    const a = rand() * TAU;
    const r = H_DOCK_R + 0.7 + rand() * 0.8;
    dm.position.set(Math.cos(a) * r, -0.55 + rand() * 0.25, Math.sin(a) * r);
    dm.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dm.scale.set(0.6 + rand() * 1.0, 0.5 + rand() * 0.7, 0.6 + rand() * 1.0);
    dm.updateMatrix();
    rocks.setMatrixAt(i, dm.matrix);
    rocks.setColorAt(i, col.setHSL(0.6, 0.06, 0.5 + rand() * 0.2));
  }
  rocks.castShadow = true;
  scene.add(rocks);

  // ---------- spot tiap pemain ----------
  const spots: HSpot[] = [];
  const blockers: Blocker[] = [];
  const blobs: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number }[] = [];
  const berries: { x: number; y: number; z: number; c: number }[] = [];
  const greens = [0x3fae45, 0x4cc04e, 0x2f9a47, 0x5ed05a, 0x37a552, 0x6fd45a, 0x2c8f45];
  const berryCols = [0xff4d6d, 0xff7aa8, 0xffe14d, 0xffffff, 0xff8a3d];
  const farBlobs: typeof blobs = [];
  let target = blobs;
  const addBush = (x: number, z: number, r: number, h: number, n: number, blocker: Blocker | null = null) => {
    for (let i = 0; i < n; i++) {
      const ang = rand() * TAU;
      const d = i === 0 ? 0 : r * 0.55 * rand();
      const br = r * (i === 0 ? 0.95 : 0.6 + rand() * 0.45);
      const bh = h * (i === 0 ? 1 : 0.6 + rand() * 0.4);
      const bx = x + Math.cos(ang) * d;
      const bz = z + Math.sin(ang) * d;
      const sy = bh * 0.6;
      const cy = bh * 0.4;
      const c = greens[Math.floor(rand() * greens.length)];
      target.push({ x: bx, y: cy, z: bz, sx: br, sy, sz: br, c });
      if (rand() < 0.55 && berries.length < 700) {
        for (let k = 0; k < 3; k++) {
          const a2 = rand() * TAU;
          const ey = 0.15 + rand() * 0.8;
          const rr = Math.sqrt(1 - ey * ey);
          berries.push({ x: bx + Math.cos(a2) * rr * br * 0.98, y: cy + ey * sy * 0.98, z: bz + Math.sin(a2) * rr * br * 0.98, c: berryCols[Math.floor(rand() * berryCols.length)] });
        }
      }
    }
    if (blocker) blockers.push(blocker);
  };

  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tx = -dz;
    const tz = dx;
    const x = dx * H_SPOT_R;
    const z = dz * H_SPOT_R;
    const col4 = new THREE.Color(colors[k]);
    spots.push({ x, z, dx, dz, a });

    // petak rumput terinjak + cincin warna pemain
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ color: 0xb4e68a, transparent: true, opacity: 0.8, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.04, z);
    scene.add(pad);
    const tint = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ color: col4, transparent: true, opacity: 0.32, depthWrite: false }));
    tint.rotation.x = -Math.PI / 2;
    tint.position.set(x, 0.045, z);
    scene.add(tint);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.75, 40), new THREE.MeshBasicMaterial({ color: col4, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    scene.add(ring);

    // sarang semak: lengkung rendah di depan + semak tinggi di kiri-kanan
    for (let j = -2; j <= 2; j++) {
      const aa = a + j * 0.23;
      const rr = H_SPOT_R + 2.9;
      const bx = Math.cos(aa) * rr;
      const bz = Math.sin(aa) * rr;
      const hh = 1.0 + rand() * 0.3;
      addBush(bx, bz, 1.2, hh, 4, { x: bx, z: bz, r: 0.9, h: hh });
    }
    // semak kiri-kanan (ramping, supaya ada celah ~3 m antar sarang untuk jatuh ke kolam)
    for (const s of [-1, 1]) {
      const bx = x + tx * s * 2.6 + dx * 0.9;
      const bz = z + tz * s * 2.6 + dz * 0.9;
      const hh = 1.35 + rand() * 0.25;
      addBush(bx, bz, 1.2, hh, 5, { x: bx, z: bz, r: 0.8, h: hh });
    }

    // tiang + bendera + papan nomor (kiri-belakang)
    // tiang di depan sarang (di balik semak depan): hanya terlihat oleh pemilik spot, tidak menutupi pemain lain
    const px = dx * 9.0 - tx * 1.8;
    const pz = dz * 9.0 - tz * 1.8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8), std(0x6b3f1d));
    pole.position.set(px, 1.5, pz);
    pole.castShadow = true;
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.58), new THREE.MeshStandardMaterial({ color: col4, side: THREE.DoubleSide, roughness: 0.6 }));
    flag.position.set(px - tx * 0.48, 2.7, pz - tz * 0.48);
    flag.rotation.y = Math.atan2(tx, tz) + Math.PI / 2;
    scene.add(flag);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), new THREE.MeshStandardMaterial({ map: signTex(k + 1, colors[k]), roughness: 0.6 }));
    board.position.set(px, 2.05, pz);
    board.rotation.y = Math.atan2(-dx, -dz) + Math.PI;
    board.castShadow = true;
    scene.add(board);
    // peti amunisi
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.65), std(0x4f6b3a, 0.8));
    crate.position.set(dx * 8.7 - tx * 3.0 * 0 + tx * 2.9, 0.28, dz * 8.7 + tz * 2.9);
    crate.rotation.y = -a + 0.3;
    crate.castShadow = true;
    scene.add(crate);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.67), std(0xffd23f, 0.6));
    stripe.position.set(crate.position.x, 0.4, crate.position.z);
    stripe.rotation.y = crate.rotation.y;
    scene.add(stripe);
  }

  // petak tengah: tanah lapang + lingkaran bunga
  const clear = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ color: 0xa9e07c, transparent: true, opacity: 0.55, depthWrite: false }));
  clear.rotation.x = -Math.PI / 2;
  clear.position.y = 0.035;
  scene.add(clear);
  const clearRing = new THREE.Mesh(new THREE.RingGeometry(3.25, 3.4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  clearRing.rotation.x = -Math.PI / 2;
  clearRing.position.y = 0.04;
  scene.add(clearRing);

  // semak anjing di celah antara spot 1 dan 2
  const dogA = Math.PI / 4;
  const dogR = H_DOCK_R - 1.2;
  for (const off of [-0.17, 0.17]) {
    const bx = Math.cos(dogA + off) * (dogR - 0.9);
    const bz = Math.sin(dogA + off) * (dogR - 0.9);
    addBush(bx, bz, 1.45, 1.55, 6, { x: bx, z: bz, r: 1.3, h: 1.6 });
  }
  const dogBack = Math.cos(dogA) * (dogR + 0.5);
  const dogBackZ = Math.sin(dogA) * (dogR + 0.5);
  addBush(dogBack, dogBackZ, 1.4, 1.9, 4);

  // semak pemanis di tepi pulau, di celah antar sarang
  for (const ga of [Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    for (let i = 0; i < 4; i++) {
      const aa = ga + (rand() - 0.5) * 0.35;
      const rr = H_DOCK_R - 0.4 - rand() * 0.6;
      addBush(Math.cos(aa) * rr, Math.sin(aa) * rr, 0.5 + rand() * 0.3, 0.5 + rand() * 0.4, 2);
    }
  }

  // semak di daratan seberang kolam (tanpa bayangan, lebih ringan)
  target = farBlobs;
  for (let i = 0; i < 110; i++) {
    const a = rand() * TAU;
    const r = H_SHORE + 2 + rand() * 80;
    addBush(Math.cos(a) * r, Math.sin(a) * r, 1.4 + rand() * 2.0, 1.2 + rand() * 2.2, 3);
  }
  target = blobs;

  const NBL = blobs.length;
  const bushG = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const bushes = new THREE.InstancedMesh(bushG, bushMat, NBL);
  blobs.forEach((b, i) => {
    dm.position.set(b.x, b.y, b.z);
    dm.rotation.set(rand() * 0.5, rand() * 6, rand() * 0.5);
    dm.scale.set(b.sx, b.sy, b.sz);
    dm.updateMatrix();
    bushes.setMatrixAt(i, dm.matrix);
    bushes.setColorAt(i, col.setHex(b.c).offsetHSL(0, 0, (rand() - 0.5) * 0.06));
  });
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  scene.add(bushes);
  const farBushes = new THREE.InstancedMesh(bushG, bushMat, Math.max(1, farBlobs.length));
  farBlobs.forEach((b, i) => {
    dm.position.set(b.x, b.y, b.z);
    dm.rotation.set(rand() * 0.5, rand() * 6, rand() * 0.5);
    dm.scale.set(b.sx, b.sy, b.sz);
    dm.updateMatrix();
    farBushes.setMatrixAt(i, dm.matrix);
    farBushes.setColorAt(i, col.setHex(b.c).offsetHSL(0, 0, (rand() - 0.5) * 0.06));
  });
  scene.add(farBushes);

  const berryG = new THREE.SphereGeometry(0.065, 8, 6);
  const berryI = new THREE.InstancedMesh(berryG, std(0xffffff, 0.5), Math.max(1, berries.length));
  berries.forEach((b, i) => {
    dm.position.set(b.x, b.y, b.z);
    dm.rotation.set(0, 0, 0);
    dm.scale.setScalar(0.8 + rand() * 0.6);
    dm.updateMatrix();
    berryI.setMatrixAt(i, dm.matrix);
    berryI.setColorAt(i, col.setHex(b.c));
  });
  scene.add(berryI);

  // ---------- rumput tinggi bergoyang ----------
  const tuft = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const offs: [number, number, number, number][] = [
      [0, 0, 0, 0.0],
      [0.09, 0.05, 0.28, 0.35],
      [-0.08, 0.06, -0.3, -0.25],
      [0.02, -0.09, 0.1, -0.5],
    ];
    for (const [ox, oz, lx, lz] of offs) {
      const g = new THREE.ConeGeometry(0.055, 1, 4);
      g.translate(0, 0.5, 0);
      g.rotateX(lx * 0.4);
      g.rotateZ(lz * 0.4);
      g.translate(ox, 0, oz);
      parts.push(g);
    }
    return mergeGeometries(parts)!;
  })();
  const uTime = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        #else
        float ph = 0.0;
        #endif
        transformed.x += sin(uTime * 2.1 + ph) * 0.2 * position.y;
        transformed.z += cos(uTime * 1.7 + ph * 1.3) * 0.14 * position.y;`,
      );
  };
  const NG = 1700;
  const grass = new THREE.InstancedMesh(tuft, grassMat, NG);
  let gi = 0;
  let tries = 0;
  while (gi < NG && tries++ < 30000) {
    const r = Math.sqrt(rand()) * (H_DOCK_R - 0.15);
    const a = rand() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (r < 3.7) continue;
    let near = false;
    for (const sp of spots) if (Math.hypot(x - sp.x, z - sp.z) < 2.0) near = true;
    if (near) continue;
    dm.position.set(x, 0, z);
    dm.rotation.set((rand() - 0.5) * 0.2, rand() * 6, (rand() - 0.5) * 0.2);
    const h = 0.38 + rand() * 0.32;
    dm.scale.set(1 + rand() * 0.6, h, 1 + rand() * 0.6);
    dm.updateMatrix();
    grass.setMatrixAt(gi, dm.matrix);
    grass.setColorAt(gi, col.setHSL(0.26 + rand() * 0.07, 0.55 + rand() * 0.2, 0.34 + rand() * 0.14));
    gi++;
  }
  grass.count = gi;
  scene.add(grass);

  // rumput tinggi di tepi pulau + alang-alang di air
  const bladeG = new THREE.ConeGeometry(0.2, 2.4, 5);
  bladeG.translate(0, 1.2, 0);
  const reedMat = std(0x5eaa3c, 0.9);
  const reeds = new THREE.InstancedMesh(bladeG, reedMat, 1100);
  const tailG = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6);
  const cattails = new THREE.InstancedMesh(tailG, std(0x6b3f1d, 0.9), 240);
  let ri = 0;
  let ci = 0;
  const putReed = (x: number, z: number, y: number, sMin: number, sMax: number, tail: boolean) => {
    dm.position.set(x, y, z);
    dm.rotation.set((rand() - 0.5) * 0.35, rand() * 6, (rand() - 0.5) * 0.35);
    const s = sMin + rand() * (sMax - sMin);
    dm.scale.set(1, s, 1);
    dm.updateMatrix();
    reeds.setMatrixAt(ri, dm.matrix);
    reeds.setColorAt(ri, col.setHSL(0.25 + rand() * 0.06, 0.5, 0.32 + rand() * 0.12));
    ri++;
    if (tail && rand() < 0.4 && ci < 240) {
      dm.position.y = y + 1.85 * s;
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      cattails.setMatrixAt(ci++, dm.matrix);
    }
  };
  for (let i = 0; i < 90; i++) {
    const a = rand() * TAU;
    const r = H_DOCK_R + 0.1 + rand() * 0.6;
    for (let b = 0; b < 3; b++) putReed(Math.cos(a) * r + (rand() - 0.5) * 0.5, Math.sin(a) * r + (rand() - 0.5) * 0.5, -0.05, 0.28, 0.5, false);
  }
  for (let g2 = 0; g2 < 110 && ri < 1080; g2++) {
    const a = rand() * TAU;
    const r = 15 + rand() * (H_SHORE - 17);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const n = 5 + Math.floor(rand() * 3);
    for (let b = 0; b < n && ri < 1100; b++) putReed(cx + (rand() - 0.5) * 3, cz + (rand() - 0.5) * 3, H_WATER_Y - 0.1, 0.7, 1.6, true);
  }
  reeds.count = ri;
  cattails.count = ci;
  scene.add(reeds, cattails);

  // teratai
  const padG = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14);
  const lilies = new THREE.InstancedMesh(padG, std(0x3fae4a, 0.8), 110);
  const flG = new THREE.SphereGeometry(0.28, 8, 6);
  const lilyFl = new THREE.InstancedMesh(flG, std(0xff8fc0, 0.6), 60);
  let fi = 0;
  for (let i = 0; i < 110; i++) {
    const a = rand() * TAU;
    const r = H_DOCK_R + 2 + rand() * (H_SHORE - H_DOCK_R - 6);
    dm.position.set(Math.cos(a) * r, H_WATER_Y + 0.03, Math.sin(a) * r);
    dm.rotation.set(0, rand() * 6, 0);
    const s = 0.7 + rand() * 0.9;
    dm.scale.set(s, 1, s);
    dm.updateMatrix();
    lilies.setMatrixAt(i, dm.matrix);
    if (i % 2 === 0 && fi < 60) {
      dm.position.y += 0.1;
      dm.scale.setScalar(1);
      dm.updateMatrix();
      lilyFl.setMatrixAt(fi++, dm.matrix);
    }
  }
  lilyFl.count = fi;
  scene.add(lilies, lilyFl);

  // bunga di pulau
  const flowerMat = std(0xffffff, 0.6);
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), flowerMat, 320);
  const fcol = [0xffffff, 0xffe14d, 0xff7aa8, 0xb98cff, 0xff8a3d];
  let fl = 0;
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * TAU;
    dm.position.set(Math.cos(a) * 3.6, 0.22, Math.sin(a) * 3.6);
    dm.rotation.set(0, 0, 0);
    dm.scale.set(1, 0.7, 1);
    dm.updateMatrix();
    flowers.setMatrixAt(fl, dm.matrix);
    flowers.setColorAt(fl, col.setHex(fcol[i % fcol.length]));
    fl++;
  }
  let ft = 0;
  while (fl < 320 && ft++ < 5000) {
    const r = 3.9 + rand() * (H_DOCK_R - 4.6);
    const a = rand() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    let near = false;
    for (const sp of spots) if (Math.hypot(x - sp.x, z - sp.z) < 2.0) near = true;
    if (near) continue;
    dm.position.set(x, 0.24, z);
    dm.scale.set(1, 0.7, 1);
    dm.updateMatrix();
    flowers.setMatrixAt(fl, dm.matrix);
    flowers.setColorAt(fl, col.setHex(fcol[Math.floor(rand() * fcol.length)]));
    fl++;
  }
  scene.add(flowers);

  const foam = new THREE.Mesh(new THREE.RingGeometry(H_DOCK_R + 0.3, H_DOCK_R + 1.8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = H_WATER_Y + 0.05;
  scene.add(foam);

  // ---------- daratan seberang kolam ----------
  const landGeo = new THREE.RingGeometry(H_SHORE - 1, 800, 72, 1);
  const lp = landGeo.attributes.position as THREE.BufferAttribute;
  const luv = landGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < lp.count; i++) luv.setXY(i, lp.getX(i) / 9, lp.getY(i) / 9);
  const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({ map: grassTex(1, 1, 5), roughness: 1 }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = 0.3;
  land.receiveShadow = true;
  scene.add(land);
  const sand = new THREE.Mesh(new THREE.RingGeometry(H_SHORE - 3.2, H_SHORE + 0.4, 64), std(0xefdca0, 1));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.2;
  scene.add(sand);
  const slope = new THREE.Mesh(new THREE.CylinderGeometry(H_SHORE - 0.5, H_SHORE - 4, 1.4, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0xcdb27a, roughness: 1, side: THREE.DoubleSide }));
  slope.position.y = -0.4;
  scene.add(slope);

  // ================= pemandangan cerah & hidup =================
  const keepout: [number, number, number][] = [];
  const toon = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

  // air dangkal berwarna lebih muda di sekitar pulau
  for (const [r0, r1, c, o] of [
    [H_DOCK_R + 0.3, H_DOCK_R + 7, 0x9ff5ff, 0.34],
    [H_DOCK_R + 7, H_DOCK_R + 16, 0x6fe6fa, 0.2],
  ] as [number, number, number, number][]) {
    const rm = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false }));
    rm.rotation.x = -Math.PI / 2;
    rm.position.y = H_WATER_Y + 0.2;
    rm.renderOrder = 2;
    scene.add(rm);
  }

  // kilau matahari di air + serbuk sari melayang
  const mkSparkles = (n: number, pos: () => [number, number, number], size: () => number, color: number, speed: number, drift: number, scale: number) => {
    const geo = new THREE.BufferGeometry();
    const pp = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pos();
      pp[i * 3] = x;
      pp[i * 3 + 1] = y;
      pp[i * 3 + 2] = z;
      ph[i] = rand();
      sz[i] = size();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime, uColor: { value: new THREE.Color(color) }, uSpeed: { value: speed }, uDrift: { value: drift }, uScale: { value: scale } },
      vertexShader: `uniform float uTime; uniform float uSpeed; uniform float uDrift; uniform float uScale;
        attribute float aPhase; attribute float aSize; varying float vA;
        void main(){
          vec3 p = position;
          p.y += uDrift * (0.5 + 0.5 * sin(uTime * 0.6 + aPhase * 3.0));
          p.x += uDrift * 0.6 * sin(uTime * 0.35 + aPhase * 5.0);
          p.z += uDrift * 0.6 * cos(uTime * 0.3 + aPhase * 4.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float tw = pow(max(sin(uTime * uSpeed + aPhase * 6.2831), 0.0), 3.0);
          vA = tw;
          gl_PointSize = aSize * (0.25 + tw) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.5, 0.0, d);
          float cr = max(smoothstep(0.07, 0.0, abs(c.x)), smoothstep(0.07, 0.0, abs(c.y))) * smoothstep(0.5, 0.1, d);
          float a = (core * 0.7 + cr) * (0.3 + vA);
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    scene.add(pts);
  };
  mkSparkles(
    280,
    () => {
      const a = rand() * TAU;
      const r = H_DOCK_R + 3 + rand() * (H_SHORE - H_DOCK_R - 6);
      return [Math.cos(a) * r, H_WATER_Y + 0.22, Math.sin(a) * r];
    },
    () => 0.5 + rand() * 0.8,
    0xffffff,
    1.5,
    0,
    700,
  );
  mkSparkles(
    120,
    () => {
      const a = rand() * TAU;
      const r = Math.sqrt(rand()) * 16;
      return [Math.cos(a) * r, 0.8 + rand() * 5, Math.sin(a) * r];
    },
    () => 0.08 + rand() * 0.07,
    0xfff3a8,
    0.9,
    1.4,
    700,
  );

  // pelangi besar di kejauhan
  {
    const rb = new THREE.Group();
    const bands = [0xff4d4d, 0xff9a3d, 0xffe14d, 0x5ee05a, 0x4db8ff, 0x5a6bff, 0xa56bff];
    bands.forEach((c, i) => {
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(150 - i * 6.6, 3.6, 8, 90, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42, fog: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      rb.add(t);
    });
    const ra = 0.38;
    rb.position.set(Math.cos(ra) * 300, -8, Math.sin(ra) * 300);
    rb.lookAt(0, -8, 0);
    scene.add(rb);
  }

  // balon udara
  const balloons: { g: THREE.Group; r: number; sp: number; a0: number; h: number; flame: THREE.Mesh; ph: number }[] = [];
  {
    const { c, g } = cv(256, 128);
    const cols = ['#ff4d6d', '#ffd23f', '#4dd0ff', '#ffffff', '#7cf05a', '#b26bff'];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 128);
    }
    const bt = toTex(c);
    const mk = (r: number, sp: number, a0: number, h: number, sc: number) => {
      const grp = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 18), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }));
      env.scale.set(1, 1.18, 1);
      env.position.y = 9;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), toon(0x9a6a36));
      basket.position.y = 0;
      grp.add(env, basket);
      for (const [rx, rz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7.2, 5), toon(0x5a3a1a));
        rope.position.set(rx * 0.5, 3.8, rz * 0.5);
        rope.rotation.z = -rx * 0.14;
        rope.rotation.x = rz * 0.14;
        grp.add(rope);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffa530 }));
      flame.position.y = 3.6;
      grp.add(flame);
      grp.scale.setScalar(sc);
      scene.add(grp);
      balloons.push({ g: grp, r, sp, a0, h, flame, ph: rand() * 6 });
    };
    mk(150, 0.012, 0.4, 55, 1.7);
    mk(215, -0.008, 2.6, 85, 2.1);
    mk(120, 0.009, 4.4, 38, 1.3);
  }

  // burung camar (sayap V lancip + kepala + paruh)
  const birds: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; r: number; sp: number; ph: number; h: number }[] = [];
  {
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const beakM = new THREE.MeshBasicMaterial({ color: 0xffa81f });
    const wingGeo = (sg: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.28);
      sh.lineTo(1.7, -0.15);
      sh.lineTo(1.55, -0.32);
      sh.lineTo(0, -0.34);
      sh.closePath();
      const geo = new THREE.ShapeGeometry(sh);
      geo.rotateX(Math.PI / 2);
      if (sg < 0) geo.scale(-1, 1, 1);
      return geo;
    };
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), bm);
      body.scale.set(0.7, 0.6, 2.0);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), bm);
      head.position.set(0, 0.05, 0.62);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 5), beakM);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.03, 0.88);
      g.add(body, head, beak);
      const wing = (sg: number) => {
        const pv = new THREE.Group();
        pv.add(new THREE.Mesh(wingGeo(sg), bm));
        g.add(pv);
        return pv;
      };
      const wl = wing(1);
      const wr = wing(-1);
      g.scale.setScalar(2.4);
      scene.add(g);
      birds.push({ g, wl, wr, r: 50 + rand() * 60, sp: (0.07 + rand() * 0.06) * (i % 3 === 0 ? -1 : 1), ph: rand() * TAU, h: 22 + rand() * 20 });
    }
  }

  // kupu-kupu (sayap atas & bawah, ada bintik) di atas padang bunga
  const bflies: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; cx: number; cz: number; rx: number; rz: number; sp: number; ph: number; h: number }[] = [];
  {
    const bc = [0xffd23f, 0xff7aa8, 0xffffff, 0x7ad0ff, 0xff8a3d, 0xc08cff];
    const wingGeo = (sg: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.05);
      sh.bezierCurveTo(0.15, 0.5, 0.62, 0.55, 0.64, 0.24);
      sh.bezierCurveTo(0.66, 0.02, 0.42, 0.0, 0.26, -0.02);
      sh.bezierCurveTo(0.5, -0.12, 0.5, -0.46, 0.28, -0.43);
      sh.bezierCurveTo(0.12, -0.4, 0.04, -0.2, 0, -0.05);
      sh.closePath();
      const geo = new THREE.ShapeGeometry(sh);
      geo.rotateX(Math.PI / 2);
      if (sg < 0) geo.scale(-1, 1, 1);
      return geo;
    };
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: bc[i % bc.length], side: THREE.DoubleSide });
      const m2 = new THREE.MeshBasicMaterial({ color: i % 3 === 2 ? 0x3a3a55 : 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const wing = (sg: number) => {
        const pv = new THREE.Group();
        pv.add(new THREE.Mesh(wingGeo(sg), m));
        const dot = new THREE.Mesh(wingGeo(sg), m2);
        dot.scale.set(0.45, 1, 0.45);
        dot.position.set(sg * 0.17, 0.003, 0.1);
        pv.add(dot);
        g.add(pv);
        return pv;
      };
      const wl = wing(1);
      const wr = wing(-1);
      const bd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), toon(0x2b2b33));
      bd.scale.set(0.6, 0.6, 3.2);
      g.add(bd);
      g.scale.setScalar(1.5);
      scene.add(g);
      const ca = rand() * TAU;
      const cr = i < 9 ? 7 + rand() * 4 : 12 + rand() * 12;
      bflies.push({ g, wl, wr, cx: Math.cos(ca) * cr, cz: Math.sin(ca) * cr, rx: 2 + rand() * 3.5, rz: 2 + rand() * 3.5, sp: 0.35 + rand() * 0.35, ph: rand() * TAU, h: 1.6 + rand() * 2.6 });
    }
  }

  // desa kecil di seberang kolam: kincir angin + rumah
  const windBlades: THREE.Group[] = [];
  const faceCenter = (x: number, z: number) => Math.atan2(-x, -z);
  const addCottage = (ang: number, r: number, sc: number, wall: number, roof: number) => {
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 3.6), toon(wall));
    walls.position.y = 1.5;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(3.7, 2.3, 4), toon(roof));
    rf.rotation.y = Math.PI / 4;
    rf.position.y = 4.15;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), toon(0x7a4a22));
    door.position.set(0.7, 0.8, 1.84);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), toon(0xb55a3c));
    chim.position.set(-1.2, 4.6, -0.6);
    g.add(walls, rf, door, chim);
    for (const wx of [-1.1, 1.9]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.12), toon(0x9fd8ff));
      win.position.set(wx, 1.8, 1.84);
      g.add(win);
    }
    g.scale.setScalar(sc);
    g.position.set(x, 0.3, z);
    g.rotation.y = faceCenter(x, z);
    scene.add(g);
    keepout.push([x, z, 9 * sc]);
  };
  const addWindmill = (ang: number, r: number, sc: number) => {
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.2, 10, 12), toon(0xfff3dc));
    tower.position.y = 5;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.95, 1.0, 12), toon(0xe5484d));
    band.position.y = 2.6;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 12), toon(0xe5484d));
    roof.position.y = 11.6;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.2), toon(0x7a4a22));
    door.position.set(0, 0.9, 3.1);
    const hub = new THREE.Group();
    hub.position.set(0, 10.2, 2.4);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), toon(0x7a4a22));
    hub.add(cap);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 8, 0.2), toon(0x7a4a22));
      beam.position.y = 4.4;
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.4, 0.1), toon(0xffffff));
      sail.position.set(0.9, 5.3, 0.05);
      arm.add(beam, sail);
      hub.add(arm);
    }
    g.add(tower, band, roof, door, hub);
    g.scale.setScalar(sc);
    g.position.set(x, 0.3, z);
    g.rotation.y = faceCenter(x, z);
    scene.add(g);
    windBlades.push(hub);
    keepout.push([x, z, 12 * sc]);
  };
  addWindmill(0.05, H_SHORE + 22, 1.25);
  addWindmill(Math.PI + 0.6, H_SHORE + 26, 1.15);
  addCottage(0.5, H_SHORE + 17, 1.1, 0xfff0d0, 0xe5484d);
  addCottage(0.82, H_SHORE + 24, 1.0, 0xffe2e8, 0x4d7be5);
  addCottage(-0.4, H_SHORE + 19, 1.05, 0xe8f6ff, 0xe58a3d);
  addCottage(1.9, H_SHORE + 18, 1.1, 0xfff0d0, 0x4dbd6a);
  addCottage(3.0, H_SHORE + 16, 1.0, 0xffe9c2, 0xe5484d);
  addCottage(4.0, H_SHORE + 20, 1.1, 0xe8f6ff, 0xb26bff);
  addCottage(5.2, H_SHORE + 17, 1.0, 0xfff0d0, 0xe58a3d);

  const animateExtras = (t: number, dt: number, cam?: THREE.Vector3) => {
    windBlades.forEach((b, i) => (b.rotation.z += dt * (0.7 + i * 0.15)));
    for (const b of bflies) {
      const a1 = t * b.sp + b.ph;
      const a2 = a1 * 1.3;
      const x = b.cx + Math.cos(a1) * b.rx;
      const z = b.cz + Math.sin(a2) * b.rz;
      b.g.position.set(x, b.h + Math.sin(t * 1.7 + b.ph) * 0.6, z);
      b.g.rotation.y = Math.atan2(-Math.sin(a1) * b.rx * b.sp, Math.cos(a2) * b.rz * b.sp * 1.3);
      const f = 0.25 + (0.5 + 0.5 * Math.sin(t * 22 + b.ph * 5)) * 0.95;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
      const dc = cam ? b.g.position.distanceTo(cam) : 99;
      const vis = Math.min(1, Math.max(0, (dc - 3.5) / 4));
      b.g.visible = vis > 0.02;
      b.g.scale.setScalar(1.5 * vis);
    }
    for (const b of birds) {
      const a = b.ph + t * b.sp;
      b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 2, Math.sin(a) * b.r);
      const sg = Math.sign(b.sp);
      b.g.rotation.y = Math.atan2(-Math.sin(a) * sg, Math.cos(a) * sg);
      const fl = Math.sin(t * 5.5 + b.ph * 4) * 0.55;
      b.wl.rotation.z = fl;
      b.wr.rotation.z = -fl;
      b.g.rotation.z = -sg * 0.18;
    }
    for (const b of balloons) {
      const a = b.a0 + t * b.sp;
      b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.4 + b.ph) * 2, Math.sin(a) * b.r);
      b.g.rotation.y = t * 0.05 + b.ph;
      b.flame.scale.set(1, 0.7 + Math.random() * 0.7, 1);
    }
  };

  // pohon bulat ala Duck Hunt + pohon pinus
  const trunkG = new THREE.CylinderGeometry(0.6, 0.85, 5, 7);
  trunkG.translate(0, 2.5, 0);
  const coneG = new THREE.ConeGeometry(3.4, 7.5, 8);
  coneG.translate(0, 8, 0);
  const ballG = new THREE.IcosahedronGeometry(4.3, 1);
  ballG.translate(0, 8.4, 0);
  const NT = 220;
  const trunks = new THREE.InstancedMesh(trunkG, std(0x7a4f28), NT);
  const cones = new THREE.InstancedMesh(coneG, std(0x3cc05a, 0.9), NT);
  const balls = new THREE.InstancedMesh(ballG, std(0xffffff, 0.9), NT);
  const tgreens = [0x55d062, 0x8fe05a, 0x35b963, 0xb6e84f, 0x45c458];
  const tpinks = [0xff9ec9, 0xffb7d5, 0xff86b8];
  for (let i = 0; i < NT; i++) {
    let a = 0;
    let r = 0;
    let tr = 0;
    do {
      a = rand() * TAU;
      r = H_SHORE + 8 + Math.pow(rand(), 1.4) * 190;
      tr++;
    } while (tr < 12 && keepout.some(([kx, kz, kr]) => Math.hypot(Math.cos(a) * r - kx, Math.sin(a) * r - kz) < kr));
    dm.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    dm.rotation.set(0, rand() * 6, 0);
    dm.scale.setScalar(0.8 + rand() * 1.3);
    dm.updateMatrix();
    trunks.setMatrixAt(i, dm.matrix);
    if (i % 3 !== 0) {
      balls.setMatrixAt(i, dm.matrix);
      balls.setColorAt(i, col.setHex(i % 7 === 1 ? tpinks[Math.floor(rand() * tpinks.length)] : tgreens[Math.floor(rand() * tgreens.length)]));
      dm.scale.setScalar(0);
      dm.updateMatrix();
      cones.setMatrixAt(i, dm.matrix);
    } else {
      cones.setMatrixAt(i, dm.matrix);
      dm.scale.setScalar(0);
      dm.updateMatrix();
      balls.setMatrixAt(i, dm.matrix);
      balls.setColorAt(i, col.setHex(0xffffff));
    }
  }
  for (const m of [trunks, cones, balls]) {
    m.castShadow = true;
    scene.add(m);
  }

  // bukit hijau bergelombang + bukit jauh
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rand() * 0.2;
    const r = 240 + rand() * 60; // di luar desa & pepohonan dekat, tidak menimbun kincir/rumah
    const s = 26 + rand() * 24;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), std(i % 2 ? 0x82e060 : 0x6fd458, 1));
    hill.scale.set(s * 1.5, s * 0.5, s * 1.5);
    hill.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    scene.add(hill);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rand() * 0.2;
    const r = 330 + rand() * 70;
    const h = 45 + rand() * 70;
    const rad = 60 + rand() * 60;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 8), std(i % 2 ? 0x7fdc98 : 0x8fcdf2, 1));
    hill.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
    scene.add(hill);
    if (h > 80) {
      const capH = h * 0.32;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.32, capH, 8), std(0xffffff, 0.9));
      cap.position.set(hill.position.x, h - 3 - capH / 2, hill.position.z);
      scene.add(cap);
    }
  }

  // awan berlapis: atas putih terang, bawah kebiruan lembut
  const clouds = new THREE.Group();
  const cMats = [0xcfe0f7, 0xf1f7ff, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.97, fog: false }));
  const cloudG = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 24; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const rr = 5 + rand() * 6;
      const yy = rand() * 4;
      const sph = new THREE.Mesh(cloudG, cMats[yy > 2.6 ? 2 : yy > 1.2 ? 1 : 0]);
      sph.scale.set(rr, rr * 0.6, rr);
      sph.position.set(k * 6.5 - n * 3.2, yy - 1, (rand() - 0.5) * 6);
      g.add(sph);
    }
    const a = rand() * TAU;
    const r = 110 + rand() * 290;
    g.position.set(Math.cos(a) * r, 50 + rand() * 70, Math.sin(a) * r);
    g.rotation.y = -a;
    clouds.add(g);
  }
  scene.add(clouds);

  // pelampung
  const buoys: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, TAU, 0, Math.PI / 2), std(0xff4d4d, 0.5));
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, TAU, Math.PI / 2, Math.PI / 2), std(0xffffff, 0.5));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), std(0x444444));
    pole.position.y = 0.8;
    g.add(b1, b2, pole);
    const a = (i / 8) * TAU + 0.2;
    const r = 15 + rand() * 24;
    g.position.set(Math.cos(a) * r, H_WATER_Y, Math.sin(a) * r);
    scene.add(g);
    buoys.push(g);
  }

  // ---------- anjing ----------
  const dog = buildDog();
  const dogPx = Math.cos(dogA) * dogR;
  const dogPz = Math.sin(dogA) * dogR;
  dog.g.position.set(dogPx, -1.8, dogPz);
  dog.g.rotation.y = Math.atan2(-dogPx, -dogPz);
  dog.g.visible = false;
  scene.add(dog.g);
  const D = { state: 'hidden' as 'hidden' | 'rising' | 'up' | 'sinking', t: 0, hold: 2, kind: 'wag' as 'laugh' | 'wag', idle: 7 + rand() * 6 };
  const DOG_UP = 0.05;
  const DOG_DOWN = -1.9;

  return {
    spots,
    blockers,
    popDog(kind) {
      if (D.state !== 'hidden') {
        if (kind === 'laugh' && D.kind !== 'laugh' && D.state !== 'sinking') {
          D.kind = 'laugh';
          sfx.dogLaugh();
          D.t = 0;
          D.hold = 2.2;
          if (D.state === 'rising') D.state = 'up';
        }
        return;
      }
      D.state = 'rising';
      D.t = 0;
      D.kind = kind;
      D.hold = kind === 'laugh' ? 2.2 : 1.6;
      if (kind === 'laugh') sfx.dogLaugh();
    },
    update(t: number, dt: number, cam?: THREE.Vector3) {
      uTime.value = t;
      animateExtras(t, dt, cam);
      for (let i = 0; i < wPos.count; i++) {
        const x = wBase[i * 2];
        const z = wBase[i * 2 + 1];
        wPos.setY(i, H_WATER_Y + Math.sin(x * 0.3 + t * 1.2) * 0.08 + Math.sin(z * 0.37 + t * 0.9) * 0.08);
      }
      wPos.needsUpdate = true;
      clouds.rotation.y = t * 0.006;
      foam.scale.setScalar(1 + Math.sin(t * 1.2) * 0.012);
      buoys.forEach((b, i) => {
        b.position.y = hWave(b.position.x, b.position.z, t) + Math.sin(t * 1.7 + i) * 0.04;
        b.rotation.z = Math.sin(t * 1.3 + i) * 0.12;
      });

      // anjing
      D.t += dt;
      let y = DOG_DOWN;
      if (D.state === 'hidden') {
        D.idle -= dt;
        if (D.idle <= 0) {
          D.idle = 9 + rand() * 9;
          D.state = 'rising';
          D.t = 0;
          D.kind = 'wag';
          D.hold = 1.6;
        }
      } else if (D.state === 'rising') {
        const u = Math.min(1, D.t / 0.35);
        y = DOG_DOWN + (DOG_UP - DOG_DOWN) * (1 - Math.pow(1 - u, 3));
        if (u >= 1) {
          D.state = 'up';
          D.t = 0;
        }
      } else if (D.state === 'up') {
        y = DOG_UP;
        if (D.t > D.hold) {
          D.state = 'sinking';
          D.t = 0;
        }
      } else {
        const u = Math.min(1, D.t / 0.4);
        y = DOG_UP + (DOG_DOWN - DOG_UP) * u * u;
        if (u >= 1) D.state = 'hidden';
      }
      dog.g.position.y = y;
      dog.g.visible = D.state !== 'hidden';
      if (D.state !== 'hidden') {
        if (D.kind === 'laugh') {
          dog.head.rotation.z = Math.sin(t * 34) * 0.1;
          dog.head.rotation.x = -0.28 + Math.sin(t * 22) * 0.08;
          dog.head.position.y = 1.55 + Math.abs(Math.sin(t * 17)) * 0.08;
          dog.mouth.scale.y = 0.15 + Math.abs(Math.sin(t * 17)) * 0.6;
          dog.ears[0].rotation.z = 0.35 + Math.sin(t * 20) * 0.2;
          dog.ears[1].rotation.z = -0.35 - Math.sin(t * 20) * 0.2;
        } else {
          dog.head.rotation.z = Math.sin(t * 5) * 0.06;
          dog.head.rotation.x = 0.05 + Math.sin(t * 3) * 0.05;
          dog.head.rotation.y = Math.sin(t * 1.6) * 0.45;
          dog.head.position.y = 1.55;
          dog.mouth.scale.y = 0.001;
          dog.ears[0].rotation.z = 0.35 + Math.sin(t * 6) * 0.06;
          dog.ears[1].rotation.z = -0.35 - Math.sin(t * 6) * 0.06;
        }
      }
    },
  };
}
