import * as THREE from 'three';

export const R_HALF = 13; // setengah sisi atap (atap 26 x 26 m)
const TAU = Math.PI * 2;

export interface RBlocker {
  x: number;
  z: number;
  r: number;
  h: number;
}

export interface BombWorld {
  spawns: { x: number; z: number }[];
  blockers: RBlocker[];
  update(t: number, dt: number): void;
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

const std = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

// 4 x 4 jendela per ubin
function facadeTex(wall: string, glassA: string, glassB: string, lit: string, seed: number) {
  const rnd = rng(seed);
  const { c, g } = cv(256, 256);
  g.fillStyle = wall;
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = x * 64 + 9;
      const py = y * 64 + 10;
      const gr = g.createLinearGradient(px, py, px + 46, py + 44);
      const isLit = rnd() < 0.16;
      gr.addColorStop(0, isLit ? lit : glassA);
      gr.addColorStop(1, isLit ? lit : glassB);
      g.fillStyle = gr;
      g.fillRect(px, py, 46, 44);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(px, py + 30);
      g.lineTo(px + 22, py);
      g.lineTo(px + 34, py);
      g.lineTo(px, py + 44);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(px, py + 42, 46, 3);
    }
  }
  return toTex(c, 1, 1, true);
}

function concreteTex() {
  const rnd = rng(3);
  const { c, g } = cv(256, 256);
  g.fillStyle = '#d4d8e0';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(60,70,90,0.07)';
    g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(70,80,100,0.35)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.lineWidth = 1.5;
  g.stroke();
  return toTex(c, 6.5, 6.5, true);
}

function stripeTex() {
  const { c, g } = cv(128, 32);
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#23232b';
  for (let i = -1; i < 6; i++) {
    g.beginPath();
    g.moveTo(i * 32, 32);
    g.lineTo(i * 32 + 16, 32);
    g.lineTo(i * 32 + 32, 0);
    g.lineTo(i * 32 + 16, 0);
    g.fill();
  }
  return toTex(c, 1, 1, true);
}

function helipadTex() {
  const { c, g } = cv(512, 512);
  g.fillStyle = '#3a4a6e';
  g.beginPath();
  g.arc(256, 256, 250, 0, TAU);
  g.fill();
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(256, 256, 232, 0, TAU);
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(256, 256, 200, 0, TAU);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.fillRect(168, 150, 40, 212);
  g.fillRect(304, 150, 40, 212);
  g.fillRect(168, 230, 176, 40);
  return toTex(c);
}

function billboardTex() {
  const { c, g } = cv(1024, 320);
  const gr = g.createLinearGradient(0, 0, 1024, 320);
  gr.addColorStop(0, '#ff4d6d');
  gr.addColorStop(1, '#ff9a3d');
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 320);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = -2; i < 14; i++) {
    g.beginPath();
    g.moveTo(i * 100, 320);
    g.lineTo(i * 100 + 50, 320);
    g.lineTo(i * 100 + 150, 0);
    g.lineTo(i * 100 + 100, 0);
    g.fill();
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 14;
  g.strokeRect(12, 12, 1000, 296);
  // bom kartun
  g.fillStyle = '#23232e';
  g.beginPath();
  g.arc(150, 180, 82, 0, TAU);
  g.fill();
  g.fillStyle = '#4a4a5c';
  g.fillRect(132, 84, 36, 28);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(150, 84);
  g.quadraticCurveTo(190, 40, 226, 62);
  g.stroke();
  g.fillStyle = '#ffe14d';
  g.beginPath();
  g.arc(232, 60, 18, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(122, 170, 20, 0, TAU);
  g.arc(178, 170, 20, 0, TAU);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(126, 174, 9, 0, TAU);
  g.arc(174, 174, 9, 0, TAU);
  g.fill();
  g.font = '900 150px "Fredoka", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineWidth = 16;
  g.strokeStyle = 'rgba(70,0,20,0.55)';
  g.strokeText('BOM PARTY', 290, 170);
  g.fillStyle = '#fff';
  g.fillText('BOM PARTY', 290, 170);
  return toTex(c);
}

// kotak gedung: UV jendela diskalakan per sisi supaya ukuran jendela konsisten
function tower(w: number, h: number, d: number, facade: THREE.Material, roof: THREE.Material) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const cw = 12.8;
  const ch = 13.6;
  const scaleRange = (from: number, to: number, su: number, sv: number) => {
    for (let i = from; i < to; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  };
  scaleRange(0, 8, d / cw, h / ch);
  scaleRange(16, 24, w / cw, h / ch);
  return new THREE.Mesh(geo, [facade, facade, roof, roof, facade, facade]);
}

export function buildBombWorld(scene: THREE.Scene, colors: string[]): BombWorld {
  const rand = rng(2024);
  scene.background = new THREE.Color(0xbfe6ff);
  scene.fog = new THREE.Fog(0xdcf1ff, 140, 520);

  // ---------- langit ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.06, 0.40, 0.95);
          vec3 mid = vec3(0.30, 0.70, 1.00);
          vec3 hor = vec3(0.90, 0.97, 1.00);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.30, h));
          c = mix(c, top, smoothstep(0.28, 0.95, h));
          c = mix(c, vec3(0.88, 0.96, 1.0), smoothstep(0.0, -0.4, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcdeaff, 0xe8dcc8, 1.7));
  const sunDir = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.0);
  sun.position.copy(sunDir).multiplyScalar(50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -19;
  sc.right = 19;
  sc.top = 19;
  sc.bottom = -19;
  sc.near = 5;
  sc.far = 130;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.55);
  fill.position.set(30, 20, -30);
  scene.add(fill);

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(24, 32), new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }));
  sunDisc.position.set(-230, 300, -300);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // ---------- material ----------
  const facades = [
    facadeTex('#f3efe6', '#7fc4ff', '#3d86d8', '#ffe9a0', 1),
    facadeTex('#ffe4ea', '#9bd7ff', '#5c9be0', '#fff1b0', 2),
    facadeTex('#e3f4ee', '#8ee0e8', '#3fa6bf', '#ffe9a0', 3),
    facadeTex('#fff0d8', '#a7d0ff', '#6b93d6', '#fff4b8', 4),
    facadeTex('#e8e6fa', '#b9c8ff', '#7c8fe0', '#ffe9a0', 5),
  ].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.08 }));
  const roofCream = std(0xf4efe6, 0.9);
  const roofMats = [roofCream, std(0xe6edf5, 0.9), std(0xf2e0e6, 0.9)];

  // ---------- gedung utama (tempat kita berdiri) ----------
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.92 });
  const slabSide = new THREE.MeshStandardMaterial({ color: 0xcfd6e2, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(R_HALF * 2 + 0.7, 1.6, R_HALF * 2 + 0.7), [slabSide, slabSide, concrete, slabSide, slabSide, slabSide]);
  slab.position.y = -0.8;
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);
  const mainTower = tower(R_HALF * 2 + 0.3, 300, R_HALF * 2 + 0.3, facades[0], roofCream);
  mainTower.position.y = -1.6 - 150;
  scene.add(mainTower);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(R_HALF * 2 + 1.5, 0.7, R_HALF * 2 + 1.5), std(0xff6d8a, 0.6));
  cornice.position.y = -1.9;
  cornice.castShadow = true;
  scene.add(cornice);

  // pinggir atap: pagar rendah + garis bahaya kuning-hitam
  const curbM = std(0xf4f6fa, 0.7);
  const st = stripeTex();
  const stripeMat = new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 });
  for (const side of [0, 1, 2, 3]) {
    const horiz = side < 2;
    const sgn = side % 2 === 0 ? 1 : -1;
    const len = R_HALF * 2 + 0.7;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.35, 0.3, horiz ? 0.35 : len), curbM);
    curb.position.set(horiz ? 0 : sgn * (R_HALF + 0.18), 0.14, horiz ? sgn * (R_HALF + 0.18) : 0);
    curb.castShadow = true;
    curb.receiveShadow = true;
    scene.add(curb);
    const sg = new THREE.PlaneGeometry(horiz ? len - 0.5 : 0.9, horiz ? 0.9 : len - 0.5);
    sg.rotateX(-Math.PI / 2);
    const sm = stripeMat.clone();
    sm.map = st.clone();
    sm.map.wrapS = sm.map.wrapT = THREE.RepeatWrapping;
    sm.map.repeat.set(horiz ? 12 : 1, 1);
    if (!horiz) sm.map.rotation = Math.PI / 2;
    sm.map.repeat.set(horiz ? 12 : 12, 1);
    sm.map.needsUpdate = true;
    const sp = new THREE.Mesh(sg, sm);
    sp.position.set(horiz ? 0 : sgn * (R_HALF - 0.55), 0.03, horiz ? sgn * (R_HALF - 0.55) : 0);
    scene.add(sp);
  }

  // landasan helikopter di tengah
  const pad = new THREE.Mesh(new THREE.CircleGeometry(5.4, 56), new THREE.MeshBasicMaterial({ map: helipadTex(), transparent: true, opacity: 0.96 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.035;
  scene.add(pad);

  // petak tempat mulai pemain
  const spawns = [
    { x: -7.5, z: 7.5 },
    { x: 7.5, z: 7.5 },
    { x: -7.5, z: -5.5 },
    { x: 7.5, z: -5.5 },
  ];
  spawns.forEach((s, i) => {
    const col = new THREE.Color(colors[i]);
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(s.x, 0.04, s.z);
    scene.add(d);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.75, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(s.x, 0.05, s.z);
    scene.add(r);
  });

  // ---------- properti atap ----------
  const blockers: RBlocker[] = [];
  const fans: THREE.Group[] = [];
  const addAC = (x: number, z: number, rot: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.25, 1.9), std(0xdfe5ee, 0.55));
    body.position.y = 0.62;
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.18, 1.96), std(0xff6d8a, 0.5));
    band.position.y = 0.95;
    g.add(body, band);
    for (let k = 0; k < 6; k++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.6), std(0x8893a6, 0.6));
      vent.position.set(-1.05 + k * 0.28, 0.45, 0.0);
      vent.position.z = 0.0;
      body.add(vent);
      vent.position.y = -0.1;
      vent.position.x = -1.1 + k * 0.44;
      vent.position.z = 0.96;
      vent.scale.set(1, 0.7, 0.05);
    }
    const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 18), std(0x4a5262, 0.5));
    fanBase.position.set(0, 1.28, 0);
    const fan = new THREE.Group();
    fan.position.set(0, 1.36, 0);
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.2), std(0x9aa6b8, 0.5));
      bl.position.x = 0.35;
      const holder = new THREE.Group();
      holder.rotation.y = (k * Math.PI) / 2;
      holder.add(bl);
      fan.add(holder);
    }
    g.add(fanBase, fan);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    scene.add(g);
    fans.push(fan);
    blockers.push({ x, z, r: 1.45, h: 1.25 });
  };
  addAC(-10.2, 0.4, 0.1);
  addAC(10.3, -0.6, -0.15);

  const addCrates = (x: number, z: number) => {
    const g = new THREE.Group();
    const wood = std(0xc08a4a, 0.85);
    const dark = std(0x8a5a2b, 0.9);
    const mk = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, ry: number) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wood);
      c.position.set(px, py, pz);
      c.rotation.y = ry;
      g.add(c);
      for (const e of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, 0.12, 0.12), dark);
        f.position.set(px, py + e * (sy / 2 - 0.1), pz + sz / 2);
        f.rotation.y = ry;
        g.add(f);
      }
    };
    mk(1.3, 1.1, 1.3, 0, 0.55, 0, 0.1);
    mk(1.1, 1.0, 1.1, 0.4, 1.6, 0.1, 0.5);
    mk(1.0, 0.9, 1.0, -1.15, 0.45, 0.5, -0.2);
    g.position.set(x, 0, z);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    scene.add(g);
    blockers.push({ x, z, r: 1.55, h: 1.2 });
  };
  addCrates(0.2, -10.4);

  // menara air di pojok kiri-belakang
  {
    const x = -10.8;
    const z = -10.8;
    const g = new THREE.Group();
    const legM = std(0x7a5a3a, 0.8);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8), legM);
      leg.position.set(lx * 1.1, 1.6, lz * 1.1);
      g.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.6, 20), std(0xc9945a, 0.8));
    tank.position.y = 4.5;
    const band1 = new THREE.Mesh(new THREE.CylinderGeometry(1.74, 1.74, 0.12, 20), std(0x4a3a2a, 0.8));
    band1.position.y = 3.8;
    const band2 = band1.clone();
    band2.position.y = 5.2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.3, 20), std(0xe5484d, 0.6));
    roof.position.y = 6.4;
    g.add(tank, band1, band2, roof);
    g.position.set(x, 0, z);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    scene.add(g);
    blockers.push({ x, z, r: 1.8, h: 100 });
  }

  // tiang antena di pojok kanan-belakang + lampu kedip
  const mastX = 10.8;
  const mastZ = -10.8;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 11, 8), std(0xe9edf5, 0.5));
  mast.position.set(mastX, 5.5, mastZ);
  mast.castShadow = true;
  scene.add(mast);
  for (let k = 0; k < 4; k++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6 - k * 0.3, 6), std(0xe9edf5, 0.5));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(mastX, 4 + k * 1.8, mastZ);
    scene.add(bar);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  beacon.position.set(mastX, 11.1, mastZ);
  scene.add(beacon);
  blockers.push({ x: mastX, z: mastZ, r: 0.55, h: 100 });

  // untaian bendera pesta dari menara air ke tiang antena
  const flags: THREE.Mesh[] = [];
  {
    const A = new THREE.Vector3(-10.8, 7.0, -10.8);
    const B = new THREE.Vector3(mastX, 10.2, mastZ);
    const cols = [0xff4d6d, 0xffd23f, 0x4dd0ff, 0x7cf05a, 0xb26bff, 0xffffff];
    const N = 17;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(new THREE.Vector3(lerp(A.x, B.x, u), lerp(A.y, B.y, u) - Math.sin(u * Math.PI) * 1.6, lerp(A.z, B.z, u)));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4a4a55 }));
    scene.add(line);
    for (let i = 1; i < N; i++) {
      const fg = new THREE.ConeGeometry(0.34, 0.75, 3);
      fg.rotateX(Math.PI);
      fg.translate(0, -0.37, 0);
      const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      m.position.copy(pts[i]);
      flags.push(m);
      scene.add(m);
    }
  }

  // ---------- kota di sekeliling ----------
  const placed: { x: number; z: number; hw: number; hd: number }[] = [{ x: 0, z: 0, hw: 22, hd: 22 }];
  const blinkers: { m: THREE.Mesh; ph: number }[] = [];
  const neons: { m: THREE.MeshBasicMaterial; ph: number; base: THREE.Color }[] = [];
  const traffic: { m: THREE.Mesh; axis: 'x' | 'z'; lane: number; at: number; sp: number; dir: number }[] = [];
  const birds: { g: THREE.Group; r: number; sp: number; ph: number; h: number }[] = [];

  // gedung kaca bergaya menara modern
  const glassTex = (() => {
    const { c, g } = cv(256, 256);
    const rr = rng(77);
    g.fillStyle = '#9ec7e8';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) {
      const gr = g.createLinearGradient(0, y * 32, 0, y * 32 + 32);
      const lit = rr() < 0.12;
      gr.addColorStop(0, lit ? '#ffe9ad' : '#d7ecff');
      gr.addColorStop(0.5, lit ? '#ffd98a' : '#86b8de');
      gr.addColorStop(1, lit ? '#f2c877' : '#5f96c6');
      g.fillStyle = gr;
      g.fillRect(0, y * 32, 256, 30);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(0, y * 32, 256, 2);
    }
    for (let x = 0; x < 8; x++) {
      g.fillStyle = 'rgba(240,250,255,0.28)';
      g.fillRect(x * 32 + 28, 0, 4, 256);
      g.fillStyle = 'rgba(40,70,100,0.2)';
      g.fillRect(x * 32, 0, 2, 256);
    }
    return toTex(c, 1, 1, true);
  })();
  const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.18, metalness: 0.5 });
  const glassTints = [0xffffff, 0xbfe8ff, 0xd6ccff, 0xffe4cf, 0xc9fff0].map((c) => {
    const m = glassMat.clone();
    m.color = new THREE.Color(c);
    return m;
  });
  const solidTints = [0xfff0dc, 0xffe1e6, 0xe6f0ff, 0xe8ffe0, 0xf6ecff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));

  // papan reklame & neon
  const adDefs: [string, string, string][] = [
    ['PARTY COLA', '#ff4d6d', '#fff6c9'],
    ['MEOW AIR', '#2ec4ff', '#ffffff'],
    ['SNOW CO.', '#7a8cff', '#ffffff'],
    ['BOBA 24H', '#b26bff', '#ffe9a0'],
    ['FISHY', '#ffa51f', '#3a2200'],
    ['KART CLUB', '#2fbf71', '#ffffff'],
  ];
  const adTexs = adDefs.map(([name, bg, fg]) => {
    const { c, g } = cv(512, 192);
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 192);
    for (let i = -2; i < 9; i++) {
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.beginPath();
      g.moveTo(i * 70, 192);
      g.lineTo(i * 70 + 34, 192);
      g.lineTo(i * 70 + 96, 0);
      g.lineTo(i * 70 + 62, 0);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 176);
    g.fillStyle = fg;
    g.font = '900 76px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 256, 100);
    return toTex(c);
  });
  const neonCols = [0x62e8ff, 0xff5fa2, 0xffd23f, 0x9cff6a, 0xff9a3d];
  const crownMats = neonCols.map((c) => new THREE.MeshBasicMaterial({ color: c }));

  const addBuilding = (
    x: number,
    z: number,
    w: number,
    d: number,
    top: number,
    fi: number,
    opt: { glass?: boolean; neon?: number; billboard?: boolean; helipad?: boolean; garden?: boolean; lit?: boolean; simple?: boolean } = {},
  ) => {
    const fm = opt.glass ? glassTints[fi % glassTints.length] : fi % 4 === 0 ? solidTints[fi % solidTints.length] : facades[fi % facades.length];
    const b = tower(w, 400, d, fm, roofMats[fi % roofMats.length]);
    b.position.set(x, top - 200, z);
    scene.add(b);
    // pita neon di puncak + tepi atap
    const bandM = crownMats[(fi + 1) % crownMats.length];
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.9, d + 0.9), bandM);
    lip.position.set(x, top - 0.25, z);
    scene.add(lip);
    if (opt.neon !== undefined) neons.push({ m: bandM, ph: rand() * 6, base: bandM.color.clone() });
    // mahkota & antena
    let roofTop = top;
    if (!opt.simple) {
      if (top > 5 && rand() < 0.7) {
        const crownH = 1.4 + rand() * 2.6;
        const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, crownH, d * 0.82), std(0xdfe7f2, 0.45));
        crown.position.set(x, top + crownH / 2, z);
        crown.castShadow = true;
        scene.add(crown);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.28, d * 0.84), bandM);
        stripe.position.set(x, top + crownH - 0.2, z);
        scene.add(stripe);
        roofTop = top + crownH;
      }
      if (top > 26 && rand() < 0.75) {
        const mastH = 8 + rand() * 14;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, mastH, 6), std(0xd7deea, 0.5));
        mast.position.set(x, roofTop + mastH / 2, z);
        scene.add(mast);
        const bl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
        bl.position.set(x, roofTop + mastH + 0.3, z);
        scene.add(bl);
        blinkers.push({ m: bl, ph: rand() * 6 });
      }
      // papan reklame besar menghadap kamera
      if (opt.billboard) {
        const t = adTexs[Math.floor(rand() * adTexs.length)];
        const bw = Math.min(w * 0.86, 17);
        const bb = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 2.67), new THREE.MeshBasicMaterial({ map: t }));
        bb.position.set(x, top + bw / 5.34 + 1.2, z + d / 2 + 0.6);
        scene.add(bb);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.7, bw / 2.67 + 0.7, 0.3), std(0xffffff, 0.6));
        frame.position.set(bb.position.x, bb.position.y, bb.position.z - 0.22);
        scene.add(frame);
        for (const sx of [-bw * 0.35, bw * 0.35]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), std(0x8a93a6, 0.6));
          leg.position.set(x + sx, top + 0.8, z + d / 2 + 0.6);
          scene.add(leg);
        }
      }
      // neon vertikal di sisi depan
      if (opt.neon !== undefined) {
        const signH = Math.min(9, Math.max(3, roofTop - top + 5));
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.22, signH, 0.22), bandM);
        sign.position.set(x - w / 2 + 0.4, top + signH / 2 + 0.4, z + d / 2 + 0.05);
        scene.add(sign);
      }
      // helipad
      if (opt.helipad) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.3, 28), new THREE.MeshBasicMaterial({ map: helipadTex(), transparent: true }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(x, top + 0.05, z);
        scene.add(disc);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + 0.4;
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), bandM);
          lamp.position.set(x + Math.cos(a) * Math.min(w, d) * 0.3, top + 0.15, z + Math.sin(a) * Math.min(w, d) * 0.3);
          scene.add(lamp);
        }
      }
      // taman atap
      if (opt.garden) {
        const gd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.3, d * 0.5), std(0x8fd98a, 0.95));
        gd.position.set(x, top + 0.15, z);
        scene.add(gd);
        for (let k = 0; k < 3; k++) {
          const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rand() * 0.5, 1), std(0x3fae4a, 0.9));
          tree.position.set(x + (rand() - 0.5) * w * 0.5, top + 1.1, z + (rand() - 0.5) * d * 0.35);
          tree.castShadow = true;
          scene.add(tree);
        }
        const hedge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.5, 0.4), std(0x4cbf55, 0.95));
        hedge.position.set(x, top + 0.4, z + d * 0.25);
        scene.add(hedge);
      }
      // properti atap biasa
      if (!opt.simple) {
        const nProp = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < nProp; k++) {
          const px = x + (rand() - 0.5) * (w - 4);
          const pz = z + (rand() - 0.5) * (d - 4);
          const kind = rand();
          if (kind < 0.4) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.8), std(0xdfe5ee, 0.6));
            ac.position.set(px, top + 0.65, pz);
            scene.add(ac);
          } else if (kind < 0.7) {
            const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.3, 14), std(0xc9945a, 0.8));
            tk.position.set(px, top + 3.2, pz);
            const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6), std(0x7a5a3a, 0.8));
            lg.position.set(px, top + 1.1, pz);
            scene.add(tk, lg);
          } else {
            const an = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 8, 6), std(0xe9edf5, 0.5));
            an.position.set(px, top + 4, pz);
            scene.add(an);
          }
        }
      }
    }
    placed.push({ x, z, hw: w / 2 + 1.2, hd: d / 2 + 1.2 });
  };
  // gedung berpapan reklame tepat di belakang area bermain
  addBuilding(0, -50, 34, 14, 15, 1, { billboard: true, garden: false, neon: 2 });
  {
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(26, 8.1), new THREE.MeshBasicMaterial({ map: billboardTex() }));
    bb.position.set(0, 7.5, -50 + 7.15);
    scene.add(bb);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(26.8, 8.9, 0.3), std(0xffffff, 0.6));
    frame.position.set(0, 7.5, -50 + 7.0);
    scene.add(frame);
    for (const sx of [-10, 10]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), std(0x8a93a6, 0.6));
      leg.position.set(sx, 1.5, -50 + 7.0);
      scene.add(leg);
    }
  }
  let tries = 0;
  let count = 0;
  while (count < 52 && tries++ < 1400) {
    const a = rand() * TAU;
    const r = 44 + rand() * 150;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 10 + rand() * 16;
    const d = 10 + rand() * 16;
    if (placed.some((p) => Math.abs(p.x - x) < p.hw + w / 2 + 2 && Math.abs(p.z - z) < p.hd + d / 2 + 2)) continue;
    let top = -75 + rand() * 120;
    if (r < 80) top = -24 - rand() * 46;
    else if (z > 8 && Math.abs(x) < 80) top = -18 - rand() * 48;
    if (r > 125 && rand() < 0.55) top = 12 + rand() * 66;
    const tall = top > 10;
    addBuilding(x, z, w, d, top, count + 1, {
      glass: rand() < 0.55,
      neon: rand() < 0.45 ? Math.floor(rand() * neonCols.length) : undefined,
      billboard: rand() < 0.22 && z < 0,
      helipad: tall && rand() < 0.2,
      garden: rand() < 0.3,
    });
    count++;
  }
  // lapis gedung jauh untuk membentuk horizon berlapis
  for (let i = 0; i < 54; i++) {
    const a = (i / 54) * TAU + rand() * 0.06;
    const r = 195 + rand() * 120;
    const h = 30 + rand() * 95;
    const w = 12 + rand() * 20;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const top = h - 120;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 240, w * (0.8 + rand() * 0.5)), std(i % 3 === 0 ? 0xbfd2e4 : 0x9fb6cd, 0.85));
    b.position.set(x, top - 120, z);
    scene.add(b);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, w + 0.5), std(0xdfe9f3, 0.7));
    lip.position.set(x, top - 0.3, z);
    scene.add(lip);
    if (h > 80 && rand() < 0.35) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff4d4d }));
      bl.position.set(x, top + 1.2, z);
      scene.add(bl);
      blinkers.push({ m: bl, ph: rand() * 6 });
    }
  }

  // ---------- jalan raya, mobil, sungai, jembatan ----------
  {
    const roadMat = std(0x4a5260, 0.95);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const roads: { x: number; z: number; w: number; d: number }[] = [];
    for (const z of [40, 64, 90, 116]) roads.push({ x: 0, z, w: 260, d: 7 });
    for (const x of [-64, -22, 26, 66]) roads.push({ x, z: 76, w: 7, d: 130 });
    for (const rd of roads) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(rd.w, 0.5, rd.d), roadMat);
      r.position.set(rd.x, -71.7, rd.z);
      scene.add(r);
      const horiz = rd.w > rd.d;
      const dashes = Math.floor((horiz ? rd.w : rd.d) / 8);
      for (let k = 0; k < dashes; k++) {
        const u = -((horiz ? rd.w : rd.d) / 2) + 4 + k * 8;
        const dsh = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 3.2 : 0.4, 0.06, horiz ? 0.4 : 3.2), lineMat);
        dsh.position.set(rd.x + (horiz ? u : 0), -71.4, rd.z + (horiz ? 0 : u));
        scene.add(dsh);
      }
    }
    // lampu jalan
    const lampGeo = new THREE.SphereGeometry(0.28, 6, 5);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
    for (const z of [40, 64, 90, 116]) for (let k = -7; k <= 7; k += 2) {
      const l = new THREE.Mesh(lampGeo, lampMat);
      l.position.set(k * 8, -68.5, z - 4.4);
      scene.add(l);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 5), std(0x3c4452, 0.8));
      p.position.set(l.position.x, -70, z - 4.4);
      scene.add(p);
    }
    // mobil
    const carGeo = new THREE.BoxGeometry(1.5, 0.8, 3.2);
    const carCols = [0xff5a5a, 0xffd23f, 0x4dd0ff, 0xffffff, 0x7cf05a, 0xff8a3d, 0xb26bff];
    for (let i = 0; i < 54; i++) {
      const horiz = i % 2 === 0;
      const rd = roads[Math.floor(rand() * roads.length)];
      if ((rd.w > rd.d) !== horiz) continue;
      const m = new THREE.Mesh(carGeo, std(carCols[i % carCols.length], 0.5));
      const lane = horiz ? rd.z + (rand() < 0.5 ? -1.8 : 1.8) : rd.x + (rand() < 0.5 ? -1.8 : 1.8);
      const span = (horiz ? rd.w : rd.d) / 2;
      m.scale.set(1, 0.85, 0.85);
      m.position.set(horiz ? rand() * span * 2 - span : lane, -70.9, horiz ? lane : rand() * span * 2 - span);
      scene.add(m);
      traffic.push({ m, axis: horiz ? 'x' : 'z', lane, at: horiz ? m.position.x : m.position.z, sp: 10 + rand() * 12, dir: Math.random() < 0.5 ? -1 : 1 });
    }
    // sungai + jembatan
    const rivTex = (() => {
      const { c, g } = cv(256, 256);
      const gr = g.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, '#3fb6d8');
      gr.addColorStop(0.5, '#7fe0ea');
      gr.addColorStop(1, '#2f9ec4');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 30; k++) {
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, k * 9 + rand() * 4);
        g.bezierCurveTo(80, k * 9 - 6, 170, k * 9 + 6, 256, k * 9);
        g.stroke();
      }
      return toTex(c, 1, 4, true);
    })();
    const river = new THREE.Mesh(new THREE.PlaneGeometry(13, 240), new THREE.MeshStandardMaterial({ map: rivTex, roughness: 0.25, metalness: 0.1 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(96, -71.9, 60);
    scene.add(river);
    for (const z of [48, 86]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(19, 1.2, 8), std(0xd8dde6, 0.7));
      br.position.set(96, -71.2, z);
      scene.add(br);
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(19, 0.3, 0.3), std(0xffffff, 0.6));
        rail.position.set(96, -70.4, z + sx * 3.8);
        scene.add(rail);
      }
    }
    // taman kecil
    for (const [px, pz] of [[-42, 46], [44, 34], [-30, 100], [70, 96]] as [number, number][]) {
      const park = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 14), std(0x5fc95e, 1));
      park.position.set(px, -71.6, pz);
      scene.add(park);
      for (let k = 0; k < 5; k++) {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 5), std(0x7a4f28, 0.9));
        const tx = px + (rand() - 0.5) * 14;
        const tz = pz + (rand() - 0.5) * 10;
        tr.position.set(tx, -70, tz);
        const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), std(k % 2 ? 0x4bbf5a : 0x6fd05a, 0.95));
        cr.position.set(tx, -67.8, tz);
        scene.add(tr, cr);
      }
    }
    // stadion + menara TV sebagai penanda kota
    const stad = new THREE.Group();
    stad.position.set(108, -72, 22);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(17, 19, 6, 26, 1, true), std(0xe9eef7, 0.7));
    bowl.material = new THREE.MeshStandardMaterial({ color: 0xe9eef7, roughness: 0.7, side: THREE.DoubleSide });
    bowl.position.y = 3;
    const pitch = new THREE.Mesh(new THREE.CircleGeometry(14, 28), std(0x4cba5a, 1));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.2;
    stad.add(bowl, pitch);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12, 5), std(0xb9c3d2, 0.6));
      tower.position.set(Math.cos(a) * 19, 6, Math.sin(a) * 19);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff8d0 }));
      lamp.position.set(Math.cos(a) * 19, 12.2, Math.sin(a) * 19);
      lamp.lookAt(0, 6, 0);
      stad.add(tower, lamp);
    }
    scene.add(stad);
    const tv = new THREE.Group();
    tv.position.set(-96, -72, 84);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 70, 12), std(0xe5ebf5, 0.55));
    shaft.position.y = 35;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 2.2, 16), std(0xff8a3d, 0.5));
    deck.position.y = 52;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 10, 0, TAU, 0, Math.PI / 2), glassMat);
    dome.position.y = 55;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 26, 6), std(0xd7deea, 0.5));
    ant.position.y = 82;
    const antBl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    antBl.position.y = 95.5;
    tv.add(shaft, deck, dome, ant, antBl);
    scene.add(tv);
    blinkers.push({ m: antBl, ph: 0 });
    // balon zeppelin
    const blimp = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), std(0xfff1dc, 0.5));
    env.scale.set(1, 0.62, 2.6);
    const gond = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 6), std(0x3c4a63, 0.6));
    gond.position.y = -4.6;
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 4), std(0xff5a5a, 0.6));
      const a = (k / 4) * TAU;
      fin.position.set(Math.cos(a) * 3.2, Math.sin(a) * 2.0, -12);
      fin.rotation.set(Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2);
      blimp.add(fin);
    }
    blimp.add(env, gond);
    blimp.position.set(-30, 34, -150);
    blimp.scale.setScalar(1.6);
    scene.add(blimp);
    const blimpEnv = env;
    // burung
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x37455c, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const wing = (s: number) => {
        const p = new THREE.Group();
        const geo = new THREE.PlaneGeometry(2.2, 0.6);
        geo.rotateX(-Math.PI / 2);
        geo.translate(s * 1.1, 0, 0);
        p.add(new THREE.Mesh(geo, birdMat));
        g.add(p);
        return p;
      };
      const wl = wing(1);
      const wr = wing(-1);
      scene.add(g);
      birds.push({ g, r: 40 + rand() * 60, sp: (0.08 + rand() * 0.06) * (i % 2 ? -1 : 1), ph: rand() * TAU, h: -6 + rand() * 26 });
      void wl;
      void wr;
    }
    // kabut cahaya / glow matahari
    const glowTex2 = (() => {
      const { c, g } = cv(128, 128);
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,246,214,0.95)');
      gr.addColorStop(0.35, 'rgba(255,226,160,0.35)');
      gr.addColorStop(1, 'rgba(255,210,140,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return toTex(c);
    })();
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: 0xfff2d0 }));
    sunGlow.scale.set(260, 260, 1);
    sunGlow.position.set(-70, 150, -330);
    scene.add(sunGlow);
    // simpan animasi kota
    const cityAnim = {
      blimp,
      blimpEnv,
      sunGlow,
      carUpdate(dt: number) {
        for (const c of traffic) {
          c.at += c.sp * c.dir * dt;
          if (c.at > 130) c.at = -130;
          if (c.at < -130) c.at = 130;
          if (c.axis === 'x') c.m.position.x = c.at;
          else c.m.position.z = c.at;
        }
      },
      flight(t: number) {
        blimp.position.set(-30 + Math.sin(t * 0.045) * 70, 34 + Math.sin(t * 0.3) * 3, -150 + Math.cos(t * 0.045) * 30);
        blimp.rotation.y = Math.atan2(Math.cos(t * 0.045) * 70, -Math.sin(t * 0.045) * 30) + Math.PI / 2;
        (blimpEnv.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x3a2a10);
        (blimpEnv.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1;
        for (const b of birds) {
          const a = b.ph + t * b.sp;
          b.g.position.set(Math.cos(a) * b.r, 6 + b.h + Math.sin(t * 0.6 + b.ph) * 2, Math.sin(a) * b.r + 20);
          b.g.rotation.y = -a;
          b.g.rotation.z = Math.sin(t * 6 + b.ph) * 0.2;
        }
      },
    };
    (scene as THREE.Scene & { __city?: typeof cityAnim }).__city = cityAnim;
  }
  const cityAnim = (scene as THREE.Scene & { __city?: { blimp: THREE.Group; blimpEnv: THREE.Mesh; sunGlow: THREE.Sprite; carUpdate: (dt: number) => void; flight: (t: number) => void } }).__city!;

  // ---------- atap arena: taman, lampu hias, papan nama ----------
  {
    // pita neon di dalam pagar
    const stripMats = [new THREE.MeshBasicMaterial({ color: 0x62e8ff }), new THREE.MeshBasicMaterial({ color: 0xff5fa2 })];
    for (let side = 0; side < 4; side++) {
      const horiz = side < 2;
      const sgn = side % 2 === 0 ? 1 : -1;
      const len = R_HALF * 2 - 1.4;
      const st = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.16, 0.16, horiz ? 0.16 : len), stripMats[side % 2]);
      st.position.set(horiz ? 0 : sgn * (R_HALF - 0.75), 0.42, horiz ? sgn * (R_HALF - 0.75) : 0);
      scene.add(st);
    }
    // planter dengan semak di empat sudut
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const px = sx * (R_HALF - 1.6);
      const pz = sz * (R_HALF - 1.6);
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.2), std(0xe7edf6, 0.7));
      box.position.set(px, 0.35, pz);
      box.rotation.y = Math.PI / 4;
      box.castShadow = true;
      scene.add(box);
      for (let k = 0; k < 3; k++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), std(k % 2 ? 0x4cbf55 : 0x6ad05a, 0.9));
        bush.position.set(px + (k - 1) * 0.6, 0.95, pz + (k % 2 ? 0.2 : -0.2));
        bush.castShadow = true;
        scene.add(bush);
      }
      blockers.push({ x: px, z: pz, r: 1.1, h: 1.0 });
    }
    // pot tanaman kecil menghadap kamera
    for (const side of [-1, 1]) {
      const px = side * 6.8;
      const pz = R_HALF - 1.4;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.8, 10), std(0xe8c9a0, 0.8));
      pot.position.set(px, 0.4, pz);
      const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), std(0x3fae4a, 0.9));
      tree.position.set(px, 1.8, pz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 6), std(0x7a4f28, 0.9));
      trunk.position.set(px, 1.1, pz);
      tree.castShadow = true;
      scene.add(pot, trunk, tree);
      blockers.push({ x: px, z: pz, r: 0.8, h: 2.4 });
    }
    // lampu hias (string lights) antara tiang-tiang pagar belakang
    const bulbGeo = new THREE.SphereGeometry(0.13, 6, 5);
    const bulbMats = [0xfff0b0, 0xffd08a, 0x9ce8ff];
    for (const side of [-1, 1]) {
      const A = new THREE.Vector3(side * (R_HALF - 0.4), 6.2, -R_HALF + 1.4);
      const B = new THREE.Vector3(side * (R_HALF - 5), 6.2, -R_HALF + 1.4);
      void A;
      void B;
    }
    for (let side = -1; side <= 1; side += 2) {
      const x0 = -R_HALF + 1.2;
      const x1 = R_HALF - 1.2;
      const z = side * (R_HALF - 0.9);
      const N = 22;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = x0 + (x1 - x0) * u;
        const y = 2.9 - Math.sin(u * Math.PI) * 1.0;
        const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: bulbMats[i % 3] }));
        bulb.position.set(x, y, z);
        scene.add(bulb);
      }
      const poleA = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6), std(0x9aa6b8, 0.6));
      poleA.position.set(x0, 1.6, z);
      const poleB = poleA.clone();
      poleB.position.x = x1;
      scene.add(poleA, poleB);
    }
    // papan nama atap
    const signC = cv(1024, 256);
    {
      const g = signC.g;
      g.fillStyle = '#161b28';
      g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = '#62e8ff';
      g.lineWidth = 10;
      g.strokeRect(10, 10, 1004, 236);
      g.fillStyle = '#ffe066';
      g.font = '900 112px Fredoka, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#ffb02e';
      g.shadowBlur = 26;
      g.fillText('BOM PARTY', 512, 140);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: toTex(signC.c), transparent: true }));
    sign.position.set(0, 5.4, -R_HALF + 0.45);
    scene.add(sign);
    const glowBar = new THREE.Mesh(new THREE.BoxGeometry(12.6, 3.6, 0.16), new THREE.MeshBasicMaterial({ color: 0x62e8ff, transparent: true, opacity: 0.28, depthWrite: false }));
    glowBar.position.set(0, 5.4, -R_HALF + 0.3);
    scene.add(glowBar);
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.4, 6), std(0x9aa6b8, 0.6));
      post.position.set(sd * 6.1, 2.7, -R_HALF + 0.5);
      scene.add(post);
    }
  }

  // lautan awan di bawah + awan di langit
  const cloudG = new THREE.SphereGeometry(1, 12, 8);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93 });
  const cloudShade = new THREE.MeshBasicMaterial({ color: 0xdbe9f8, transparent: true, opacity: 0.93 });
  const mkCloud = (x: number, y: number, z: number, sc: number) => {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const rr = (4 + rand() * 6) * sc;
      const yy = rand() * 3 * sc;
      const m = new THREE.Mesh(cloudG, yy > 1.4 * sc ? cloudMat : cloudShade);
      m.scale.set(rr, rr * 0.52, rr);
      m.position.set(k * 6 * sc - n * 3.2 * sc, yy, (rand() - 0.5) * 5 * sc);
      g.add(m);
    }
    g.position.set(x, y, z);
    return g;
  };
  const skyClouds = new THREE.Group();
  const lowClouds = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const a = rand() * TAU;
    const r = 120 + rand() * 330;
    skyClouds.add(mkCloud(Math.cos(a) * r, 78 + rand() * 90, Math.sin(a) * r, 1.15));
  }
  for (let i = 0; i < 46; i++) {
    const a = rand() * TAU;
    const r = 30 + rand() * 330;
    lowClouds.add(mkCloud(Math.cos(a) * r, -120 - rand() * 55, Math.sin(a) * r, 2.0));
  }
  scene.add(skyClouds, lowClouds);
  const horizonClouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + rand() * 0.1;
    const r = 260 + rand() * 120;
    horizonClouds.add(mkCloud(Math.cos(a) * r, 22 + rand() * 46, Math.sin(a) * r, 1.4));
  }
  scene.add(horizonClouds);
  // satu awan kecil melayang dekat atap agar terasa tinggi
  const nearClouds = new THREE.Group();
  for (const [x, y, z] of [[-86, -26, 44], [96, -30, -22], [-74, -34, -68], [80, -18, 74]] as [number, number, number][]) nearClouds.add(mkCloud(x, y, z, 0.85));
  scene.add(nearClouds);

  // tanah jauh di bawah (kabut menutupinya)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: 0xcfe8da }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -330;
  scene.add(ground);

  // balon udara & burung
  const balloons: { g: THREE.Group; r: number; sp: number; a0: number; h: number }[] = [];
  {
    const { c, g } = cv(256, 128);
    const cols = ['#ff4d6d', '#ffd23f', '#4dd0ff', '#ffffff', '#7cf05a', '#b26bff'];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 128);
    }
    const bt = toTex(c);
    const mk = (r: number, sp: number, a0: number, h: number, s: number) => {
      const grp = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(5, 22, 16), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }));
      env.scale.set(1, 1.18, 1);
      env.position.y = 9;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), std(0x9a6a36, 0.8));
      grp.add(env, basket);
      grp.scale.setScalar(s);
      scene.add(grp);
      balloons.push({ g: grp, r, sp, a0, h });
    };
    mk(95, 0.014, 0.9, 16, 1.7);
    mk(150, -0.01, 3.4, 40, 2.1);
  }

  return {
    spawns,
    blockers,
    update(t: number, dt: number) {
      fans.forEach((f) => (f.rotation.y += dt * 9));
      (beacon.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 5) > 0 ? 0xff3b3b : 0x661515);
      flags.forEach((f, i) => (f.rotation.z = Math.sin(t * 3 + i * 0.7) * 0.25));
      cityAnim.carUpdate(dt);
      cityAnim.flight(t);
      skyClouds.rotation.y = t * 0.004;
      lowClouds.rotation.y = -t * 0.003;
      blinkers.forEach((b) => ((b.m.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 2.6 + b.ph) > 0.55 ? 0xff3b3b : 0x551111)));
      neons.forEach((n) => n.m.color.copy(n.base).multiplyScalar(0.82 + 0.18 * Math.abs(Math.sin(t * 2.2 + n.ph))));
      nearClouds.position.x = Math.sin(t * 0.05) * 8;
      horizonClouds.rotation.y = -t * 0.002;
      balloons.forEach((b, i) => {
        const a = b.a0 + t * b.sp;
        b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.4 + i) * 2, Math.sin(a) * b.r);
        b.g.rotation.y = t * 0.05;
      });
    },
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
