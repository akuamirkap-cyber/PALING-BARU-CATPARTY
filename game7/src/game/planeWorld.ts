import * as THREE from 'three';

const TAU = Math.PI * 2;

// ---------- geometri dek (koordinat lokal pesawat: hidung = -z, ekor = +z) ----------
export const HW = 4.2;
export const NOSE_Z = -17.2;
export const TAIL_Z = 19.4;

export function fusHalf(z: number) {
  if (z < NOSE_Z || z > TAIL_Z) return -1;
  if (z < -13.5) {
    const u = (z + 13.5) / (NOSE_Z + 13.5);
    return HW * Math.sqrt(Math.max(0, 1 - u * u));
  }
  if (z > 12) return Math.max(0.9, HW - (z - 12) * 0.32);
  return HW;
}
function wingRange(ax: number): [number, number] {
  const zl = -3.6 + 0.42 * (ax - 3.3);
  return [zl, zl + 8.2 - 0.12 * (ax - 3.3)];
}
function stabRange(ax: number): [number, number] {
  const zl = 13 + 0.45 * Math.max(0, ax - 1.2);
  return [zl, zl + 4.4];
}
export function onDeck(x: number, z: number) {
  const ax = Math.abs(x);
  if (ax <= fusHalf(z)) return true;
  if (ax >= 3.0 && ax <= 17.5) {
    const [a, b] = wingRange(ax);
    if (z >= a && z <= b) return true;
  }
  if (ax <= 8.4) {
    const [a, b] = stabRange(ax);
    if (z >= a && z <= b) return true;
  }
  return false;
}
/** jarak berjalan dari (x,z) searah (dx,dz) sampai keluar dari dek */
export function march(x: number, z: number, dx: number, dz: number, max: number) {
  const m = Math.hypot(dx, dz) || 1;
  dx /= m;
  dz /= m;
  for (let d = 0.4; d <= max; d += 0.4) if (!onDeck(x + dx * d, z + dz * d)) return d;
  return max;
}

export const ENGINES = [-12.4, -6.6, 6.6, 12.4].map((x) => ({ x, zl: wingRange(Math.abs(x))[0] }));

export interface PBlocker {
  x: number;
  z: number;
  r: number;
  h: number;
}
export interface PlaneEnv {
  bank: number;
  pitch: number;
  bob: number;
  gustK: number;
  dirX: number;
  dirZ: number;
}
export interface PlaneWorld {
  group: THREE.Group;
  spawns: { x: number; z: number }[];
  blockers: PBlocker[];
  update(t: number, dt: number, env: PlaneEnv): void;
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
const mat = (c: number, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

// ---------- tekstur dek: panel, garis, strip, emblem kucing, tepi bahaya ----------
const PPM = 24;
const DX0 = -18;
const DZ0 = -18.5;
const DW = 36;
const DH = 40;
function deckDecal() {
  const W = DW * PPM;
  const H = DH * PPM;
  const { c, g } = cv(W, H);
  const X = (x: number) => (x - DX0) * PPM;
  const Z = (z: number) => (z - DZ0) * PPM;
  // panel
  g.strokeStyle = 'rgba(90,115,150,0.34)';
  g.lineWidth = 1.6;
  for (let x = -18; x <= 18; x += 3) {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), H);
    g.stroke();
  }
  for (let z = -18; z <= 21; z += 3) {
    g.beginPath();
    g.moveTo(0, Z(z));
    g.lineTo(W, Z(z));
    g.stroke();
  }
  g.fillStyle = 'rgba(80,100,135,0.5)';
  for (let x = -18; x <= 18; x += 3) for (let z = -18; z <= 21; z += 3) for (const [ox, oz] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) {
    g.beginPath();
    g.arc(X(x + ox), Z(z + oz), 1.8, 0, TAU);
    g.fill();
  }
  // strip merah di tepi depan sayap + biru di stabilizer
  for (const s of [-1, 1]) {
    g.fillStyle = '#ff4d5e';
    g.beginPath();
    for (let ax = 3.0; ax <= 17.5; ax += 0.5) {
      const [zl] = wingRange(ax);
      g[ax === 3.0 ? 'moveTo' : 'lineTo'](X(s * ax), Z(zl + 0.55));
    }
    for (let ax = 17.5; ax >= 3.0; ax -= 0.5) {
      const [zl] = wingRange(ax);
      g.lineTo(X(s * ax), Z(zl + 1.9));
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let ax = 3.0; ax <= 17.5; ax += 0.5) {
      const [zl] = wingRange(ax);
      g[ax === 3.0 ? 'moveTo' : 'lineTo'](X(s * ax), Z(zl + 1.9));
    }
    for (let ax = 17.5; ax >= 3.0; ax -= 0.5) {
      const [zl] = wingRange(ax);
      g.lineTo(X(s * ax), Z(zl + 2.15));
    }
    g.closePath();
    g.fill();
    // flap di tepi belakang
    g.strokeStyle = 'rgba(70,95,135,0.7)';
    g.lineWidth = 2.4;
    g.beginPath();
    for (let ax = 3.6; ax <= 16.6; ax += 0.5) {
      const [, zt] = wingRange(ax);
      g[ax === 3.6 ? 'moveTo' : 'lineTo'](X(s * ax), Z(zt - 2.2));
    }
    g.stroke();
    for (let ax = 4.5; ax <= 16.5; ax += 4.0) {
      const [a, b] = wingRange(ax);
      g.beginPath();
      g.moveTo(X(s * ax), Z(b - 2.2));
      g.lineTo(X(s * ax), Z(b));
      g.stroke();
      void a;
    }
    // jalur injak (garis putus kuning) di sayap
    g.setLineDash([PPM * 0.7, PPM * 0.55]);
    g.strokeStyle = 'rgba(255,200,40,0.9)';
    g.lineWidth = 3.4;
    g.beginPath();
    for (let ax = 4.0; ax <= 16.0; ax += 0.5) {
      const [zl] = wingRange(ax);
      g[ax === 4.0 ? 'moveTo' : 'lineTo'](X(s * ax), Z(zl + 4.0));
    }
    g.stroke();
    g.setLineDash([]);
    // stabilizer
    g.fillStyle = '#4d9bff';
    g.beginPath();
    for (let ax = 1.2; ax <= 8.4; ax += 0.4) {
      const [zl] = stabRange(ax);
      g[ax === 1.2 ? 'moveTo' : 'lineTo'](X(s * ax), Z(zl + 0.3));
    }
    for (let ax = 8.4; ax >= 1.2; ax -= 0.4) {
      const [zl] = stabRange(ax);
      g.lineTo(X(s * ax), Z(zl + 1.2));
    }
    g.closePath();
    g.fill();
  }
  // garis tengah & palang kuning-hitam hidung
  g.setLineDash([PPM * 1.3, PPM * 0.9]);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(X(0), Z(-11));
  g.lineTo(X(0), Z(12));
  g.stroke();
  g.setLineDash([]);
  // palka
  g.strokeStyle = 'rgba(80,105,145,0.9)';
  g.fillStyle = 'rgba(120,150,190,0.28)';
  g.lineWidth = 3;
  for (const [hz, hh] of [[-9.5, 3.2], [8.2, 2.6]] as [number, number][]) {
    const x0 = X(-1.2);
    const y0 = Z(hz - hh / 2);
    g.beginPath();
    g.roundRect(x0, y0, 2.4 * PPM, hh * PPM, 12);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(X(0), Z(hz), 6, 0, TAU);
    g.stroke();
  }
  // emblem tapak kucing
  g.fillStyle = 'rgba(96,160,235,0.55)';
  const px = X(0);
  const pz = Z(0.9);
  g.beginPath();
  g.ellipse(px, pz + 0.45 * PPM, 1.05 * PPM, 0.9 * PPM, 0, 0, TAU);
  g.fill();
  for (const [ox, oz, r] of [[-1.15, -0.5, 0.42], [-0.42, -1.1, 0.45], [0.42, -1.1, 0.45], [1.15, -0.5, 0.42]]) {
    g.beginPath();
    g.ellipse(px + ox * PPM, pz + oz * PPM, r * PPM, r * 1.2 * PPM, ox * 0.3, 0, TAU);
    g.fill();
  }
  // tepi bahaya: potong sesuai dek + strip kuning-hitam di tepi
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const mask = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) for (let pxx = 0; pxx < W; pxx++) mask[py * W + pxx] = onDeck(DX0 + (pxx + 0.5) / PPM, DZ0 + (py + 0.5) / PPM) ? 1 : 0;
  const R = Math.round(0.52 * PPM);
  const Rd = Math.round(R * 0.7);
  const offs: [number, number][] = [[R, 0], [-R, 0], [0, R], [0, -R], [Rd, Rd], [-Rd, Rd], [Rd, -Rd], [-Rd, -Rd]];
  for (let py = 0; py < H; py++) {
    for (let pxx = 0; pxx < W; pxx++) {
      const i = (py * W + pxx) * 4;
      if (!mask[py * W + pxx]) {
        d[i + 3] = 0;
        continue;
      }
      let edge = false;
      for (const [ox, oy] of offs) {
        const qx = pxx + ox;
        const qy = py + oy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H || !mask[qy * W + qx]) {
          edge = true;
          break;
        }
      }
      if (edge) {
        const on = (pxx + py) % 28 < 14;
        d[i] = on ? 255 : 44;
        d[i + 1] = on ? 210 : 44;
        d[i + 2] = on ? 63 : 52;
        d[i + 3] = 255;
      } else if (d[i + 3] === 0) d[i + 3] = 0;
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTex(c);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function slab(pts: [number, number][], depth: number, yTop: number, top: THREE.Material, side: THREE.Material) {
  const sh = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yTop - depth, 0);
  const m = new THREE.Mesh(geo, [top, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function groundTex() {
  const rnd = rng(9);
  const { c, g } = cv(1024, 1024);
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#36c7ea');
  gr.addColorStop(1, '#2fb6dd');
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    const x = rnd() * 1024;
    const y = rnd() * 1024;
    g.moveTo(x, y);
    g.bezierCurveTo(x + 30, y - 10, x + 60, y + 10, x + 90, y);
    g.stroke();
  }
  const island = (cx: number, cy: number, r: number) => {
    for (const o of [-1024, 0, 1024]) for (const p of [-1024, 0, 1024]) {
      const blob = (rr: number, col: string, a = 1) => {
        g.fillStyle = col;
        g.globalAlpha = a;
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const ang = (k / 24) * TAU;
          const wob = 1 + 0.18 * Math.sin(ang * 3 + cx) + 0.1 * Math.sin(ang * 5 + cy);
          const x = cx + o + Math.cos(ang) * rr * wob;
          const y = cy + p + Math.sin(ang) * rr * wob;
          g[k === 0 ? 'moveTo' : 'lineTo'](x, y);
        }
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      };
      blob(r * 1.55, '#bff7ff', 0.55);
      blob(r * 1.2, '#f4e4a8');
      blob(r * 0.92, '#7ddc5f');
      blob(r * 0.6, '#54c24d');
      g.fillStyle = '#2f9a45';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(cx + o + (rnd() - 0.5) * r * 0.8, cy + p + (rnd() - 0.5) * r * 0.8, r * 0.09, 0, TAU);
        g.fill();
      }
    }
  };
  for (let i = 0; i < 20; i++) island(rnd() * 1024, rnd() * 1024, 26 + rnd() * 62);
  // bayangan awan lembut
  for (let i = 0; i < 16; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 1024;
    const rr = 50 + rnd() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, 'rgba(20,70,110,0.22)');
    rg.addColorStop(1, 'rgba(20,70,110,0)');
    g.fillStyle = rg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return toTex(c, 7, 7, true);
}

function chevronTex() {
  const { c, g } = cv(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  g.lineJoin = 'miter';
  for (const o of [0, 64]) {
    g.beginPath();
    g.moveTo(o + 8, 6);
    g.lineTo(o + 36, 32);
    g.lineTo(o + 8, 58);
    g.stroke();
  }
  return toTex(c, 1, 1, true);
}

export function createChevron() {
  return chevronTex();
}

export function buildPlaneWorld(scene: THREE.Scene, colors: string[]): PlaneWorld {
  const rand = rng(31);
  scene.background = new THREE.Color(0xbfe6ff);
  scene.fog = new THREE.Fog(0xdcf1ff, 170, 640);

  // ---------- langit ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.05, 0.38, 0.95);
          vec3 mid = vec3(0.28, 0.68, 1.00);
          vec3 hor = vec3(0.92, 0.98, 1.00);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.30, h));
          c = mix(c, top, smoothstep(0.26, 0.95, h));
          c = mix(c, vec3(0.84, 0.95, 1.0), smoothstep(0.0, -0.45, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcdeaff, 0xdfe8f2, 1.75));
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.0);
  sun.position.set(-26, 46, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 5;
  sc.far = 130;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.5);
  fill.position.set(30, 20, -30);
  scene.add(fill);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }));
  sunDisc.position.set(-260, 330, -330);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // ---------- pesawat ----------
  const group = new THREE.Group();
  scene.add(group);

  const white = mat(0xf6f8fc, 0.55, 0.05);
  const slabSide = mat(0xe3ebf6, 0.6, 0.05);
  const slabSide2 = mat(0xdbe5f2, 0.6, 0.05);
  // fuselage dek
  const fus: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i <= 70; i++) {
    const z = NOSE_Z + (TAIL_Z - NOSE_Z) * (i / 70);
    R.push([fusHalf(z), z]);
  }
  fus.push(...R, ...R.slice().reverse().map(([x, z]) => [-x, z] as [number, number]));
  group.add(slab(fus, 1.4, 0, white, slabSide));
  for (const s of [-1, 1]) {
    group.add(slab([[s * 3.0, wingRange(3.0)[0]], [s * 17.5, wingRange(17.5)[0]], [s * 17.5, wingRange(17.5)[1]], [s * 3.0, wingRange(3.0)[1]]], 0.55, -0.004, white, slabSide2));
  }
  group.add(slab([[-8.4, stabRange(8.4)[0]], [-1.2, 13], [1.2, 13], [8.4, stabRange(8.4)[0]], [8.4, stabRange(8.4)[1]], [1.2, 17.4], [-1.2, 17.4], [-8.4, stabRange(8.4)[1]]], 0.4, -0.008, white, slabSide2));

  // dek (decal)
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ map: deckDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(0, 0.022, DZ0 + DH / 2);
  decal.renderOrder = 1;
  group.add(decal);

  // perut pesawat (bulat)
  {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 44; i++) {
      const z = NOSE_Z + 0.2 + (TAIL_Z + 0.4 - NOSE_Z - 0.2) * (i / 44);
      let r = 3.55;
      if (z < -13.4) r = 3.55 * Math.sqrt(Math.max(0, 1 - Math.pow((z + 13.4) / (NOSE_Z + 0.2 + 13.4), 2)));
      else if (z > 10) r = Math.max(0.55, 3.55 - (z - 10) * 0.3);
      pts.push(new THREE.Vector2(Math.max(r, 0.02), -z));
    }
    const lg = new THREE.LatheGeometry(pts, 36);
    lg.rotateX(-Math.PI / 2);
    const belly = new THREE.Mesh(lg, mat(0xe9eff8, 0.55, 0.05));
    belly.scale.set(1.2, 0.92, 1);
    belly.position.y = -3.3;
    belly.castShadow = true;
    group.add(belly);
  }

  // jendela + strip livery di sisi badan
  {
    const wm = new THREE.MeshStandardMaterial({ color: 0x7fcaff, roughness: 0.15, metalness: 0.3, emissive: 0x2a6fa8, emissiveIntensity: 0.35 });
    for (const s of [-1, 1]) {
      for (let z = -11; z <= 10.6; z += 1.9) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 1.1), wm);
        w.position.set(s * (HW + 0.02), -0.72, z);
        group.add(w);
      }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 24), mat(0xff4d5e, 0.5));
      stripe.position.set(s * (HW + 0.02), -1.18, -0.2);
      group.add(stripe);
    }
  }

  // kokpit + kucing pilot
  const blockers: PBlocker[] = [];
  {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x78c8ff, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.62, emissive: 0x2a78c0, emissiveIntensity: 0.25 }));
    dome.scale.set(2.2, 2.0, 3.0);
    dome.position.set(0, 0, -13.0);
    group.add(dome);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), mat(0xffffff, 0.4));
    frame.rotation.x = Math.PI / 2;
    frame.scale.set(2.2, 3.0, 1);
    frame.position.set(0, 0.04, -13.0);
    group.add(frame);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mat(0x1a1a22, 0.8));
    head.position.set(0, 0.75, -12.7);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), mat(0xffffff, 0.8));
    muzzle.position.set(0, 0.62, -13.25);
    muzzle.scale.set(1.2, 0.8, 0.8);
    group.add(head, muzzle);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), mat(0x1a1a22, 0.8));
      ear.position.set(s * 0.4, 1.25, -12.7);
      ear.rotation.z = -s * 0.25;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      cap.position.set(s * 0.22, 0.88, -13.25);
      group.add(ear, cap);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.3, 14), mat(0xff4d5e, 0.6));
    cap.position.set(0, 1.28, -12.7);
    group.add(cap);
    blockers.push({ x: 0, z: -13.0, r: 2.3, h: 3.2 });
  }

  // sirip ekor kembar
  const finShape = new THREE.Shape();
  finShape.moveTo(-1.6, 0);
  finShape.lineTo(1.5, 0);
  finShape.lineTo(0.9, 4.6);
  finShape.lineTo(-0.5, 4.6);
  finShape.closePath();
  for (const s of [-1, 1]) {
    const fg = new THREE.ExtrudeGeometry(finShape, { depth: 0.5, bevelEnabled: false });
    fg.rotateY(Math.PI / 2);
    fg.translate(-0.25, 0, 0);
    const fin = new THREE.Mesh(fg, white);
    fin.position.set(s * 7.4, 0, 15.9);
    fin.castShadow = true;
    group.add(fin);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.7, 1.45), mat(0xff4d5e, 0.5));
    tip.position.set(s * 7.4, 4.3, 15.9 + 0.2);
    group.add(tip);
    blockers.push({ x: s * 7.4, z: 15.9, r: 0.7, h: 100 });
  }

  // mesin + baling-baling
  const props: THREE.Group[] = [];
  for (const e of ENGINES) {
    const g = new THREE.Group();
    g.position.set(e.x, -1.15, e.zl - 0.5);
    const cg = new THREE.CapsuleGeometry(0.85, 2.6, 6, 16);
    cg.rotateX(Math.PI / 2);
    const nac = new THREE.Mesh(cg, mat(0xe9eef6, 0.4, 0.2));
    nac.position.z = -0.6;
    nac.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 8, 24), mat(0xff4d5e, 0.5));
    band.position.z = -1.5;
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 16), mat(0xff4d5e, 0.4, 0.2));
    spin.rotation.x = -Math.PI / 2;
    spin.position.z = -2.5;
    const prop = new THREE.Group();
    prop.position.z = -2.35;
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.rotation.z = (k * TAU) / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.55, 0.07), mat(0x2b2f3a, 0.5, 0.3));
      blade.position.y = 1.4;
      const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.5, 0.075), mat(0xffd23f, 0.5));
      tipB.position.y = 2.45;
      holder.add(blade, tipB);
      prop.add(holder);
    }
    const blur = new THREE.Mesh(new THREE.CircleGeometry(2.7, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    blur.position.z = -0.02;
    prop.add(blur);
    g.add(nac, band, spin, prop);
    group.add(g);
    props.push(prop);
  }

  // lampu navigasi
  const nav: { m: THREE.Mesh; c: number; phase: number }[] = [];
  const mkNav = (x: number, y: number, z: number, c: number, ph: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z);
    group.add(m);
    nav.push({ m, c, phase: ph });
  };
  mkNav(-17.4, 0.25, wingRange(17.4)[1] - 0.4, 0xff3030, 0);
  mkNav(17.4, 0.25, wingRange(17.4)[1] - 0.4, 0x30ff60, 0);
  mkNav(-7.4, 4.9, 16.2, 0xffffff, 1.5);
  mkNav(7.4, 4.9, 16.2, 0xffffff, 1.5);

  // properti dek
  const addCrate = (x: number, z: number, s: number, ry: number) => {
    const g = new THREE.Group();
    const wood = mat(0xc08a4a, 0.85);
    const dark = mat(0x8a5a2b, 0.9);
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.92, s), wood);
    b.position.y = s * 0.46;
    g.add(b);
    for (const e of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(s + 0.05, 0.13, 0.13), dark);
      f.position.set(0, s * 0.46 + e * s * 0.4, s / 2);
      g.add(f);
      const f2 = f.clone();
      f2.position.z = -s / 2;
      g.add(f2);
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(s + 0.06, 0.06, 0.28), mat(0xff4d5e, 0.6));
    strap.position.y = s * 0.93;
    g.add(strap);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    group.add(g);
  };
  addCrate(0.2, -5.2, 2.1, 0.12);
  blockers.push({ x: 0.2, z: -5.2, r: 1.5, h: 1.9 });
  addCrate(-2.0, 12.4, 1.6, -0.3);
  blockers.push({ x: -2.0, z: 12.4, r: 1.15, h: 1.45 });
  {
    const g = new THREE.Group();
    for (const [bx, bz] of [[0, 0], [0.9, 0.2], [0.4, -0.85]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), mat(0xe5484d, 0.5, 0.3));
      b.position.set(bx, 0.5, bz);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 16), mat(0x2b2f3a, 0.5, 0.4));
      r1.rotation.x = Math.PI / 2;
      r1.position.set(bx, 0.75, bz);
      g.add(b, r1);
    }
    g.position.set(2.1, 0, 3.3);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    group.add(g);
    blockers.push({ x: 2.3, z: 3.2, r: 1.25, h: 1.1 });
  }
  // kubah radar kecil
  {
    const rd = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12, 0, TAU, 0, Math.PI / 2), mat(0xffffff, 0.4));
    rd.position.set(-2.0, 0, -9.6);
    rd.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 20), mat(0xff4d5e, 0.5));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-2.0, 0.05, -9.6);
    group.add(rd, ring);
    blockers.push({ x: -2.0, z: -9.6, r: 1.05, h: 0.95 });
  }

  // ---------- bumi di bawah + awan ----------
  const gt = groundTex();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.MeshBasicMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -330;
  scene.add(ground);

  const cloudG = new THREE.SphereGeometry(1, 12, 8);
  const cMats = [0xcfe0f7, 0xf1f7ff, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.96 }));
  const clouds: { g: THREE.Group; sp: number }[] = [];
  const mkCloud = (x: number, y: number, z: number, sc: number, sp: number) => {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const rr = (4 + rand() * 6) * sc;
      const yy = rand() * 3 * sc;
      const m = new THREE.Mesh(cloudG, cMats[yy > 2.6 * sc ? 2 : yy > 1.2 * sc ? 1 : 0]);
      m.scale.set(rr, rr * 0.6, rr);
      m.position.set(k * 6 * sc - n * 3 * sc, yy - 1, (rand() - 0.5) * 5 * sc);
      g.add(m);
    }
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ g, sp });
  };
  for (let i = 0; i < 26; i++) mkCloud((rand() - 0.5) * 520, -70 - rand() * 220, -460 + rand() * 640, 2.2, 55 + rand() * 25);
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    mkCloud(side * (62 + rand() * 120), -20 - rand() * 50, -460 + rand() * 600, 1.5, 85 + rand() * 30);
  }

  // garis angin
  const NS = 96;
  const streakGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  const streaks = new THREE.InstancedMesh(streakGeo, streakMat, NS);
  streaks.frustumCulled = false;
  const sPos: THREE.Vector3[] = [];
  const sSp: number[] = [];
  for (let i = 0; i < NS; i++) {
    const high = i < 18;
    sPos.push(new THREE.Vector3((rand() - 0.5) * 100, high ? 6 + rand() * 12 : -12 + rand() * 12, (rand() - 0.5) * 100));
    sSp.push(0.7 + rand() * 0.6);
  }
  scene.add(streaks);
  const dm = new THREE.Object3D();
  const spawns = [
    { x: -2.0, z: 8.0 },
    { x: 9.0, z: 2.6 },
    { x: -9.0, z: 2.6 },
    { x: 2.0, z: -9.5 },
  ];
  spawns.forEach((s, i) => {
    const col = new THREE.Color(colors[i]);
    const d = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(s.x, 0.03, s.z);
    group.add(d);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.65, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(s.x, 0.035, s.z);
    group.add(r);
  });

  return {
    group,
    spawns,
    blockers,
    update(t: number, dt: number, env: PlaneEnv) {
      group.position.y = env.bob;
      group.rotation.set(env.pitch, 0, -env.bank);
      props.forEach((p, i) => (p.rotation.z += dt * (46 + i)));
      nav.forEach((n) => {
        const on = n.phase > 1 ? Math.sin(t * 7) > 0.85 : Math.sin(t * 3 + n.phase) > -0.2;
        (n.m.material as THREE.MeshBasicMaterial).color.setHex(on ? n.c : 0x331111);
      });
      gt.offset.y += (dt * 60) / 700;
      for (const c of clouds) {
        c.g.position.z += c.sp * dt * (1 + env.gustK * 0.4);
        if (c.g.position.z > 190) c.g.position.z -= 640;
      }
      // garis angin: searah angin, memanjang saat gust
      const dl = Math.hypot(env.dirX, env.dirZ) || 1;
      const dx = env.dirX / dl;
      const dz = env.dirZ / dl;
      const sp = 38 + env.gustK * 85;
      const len = 3.5 + env.gustK * 9;
      streakMat.opacity = 0.26 + env.gustK * 0.45;
      for (let i = 0; i < NS; i++) {
        const p = sPos[i];
        p.x += dx * sp * sSp[i] * dt;
        p.z += dz * sp * sSp[i] * dt;
        if (p.x > 52) p.x -= 104;
        else if (p.x < -52) p.x += 104;
        if (p.z > 52) p.z -= 104;
        else if (p.z < -52) p.z += 104;
        dm.position.copy(p);
        dm.rotation.set(0, Math.atan2(dx, dz), 0);
        dm.scale.set(1, 1, len * sSp[i]);
        dm.updateMatrix();
        streaks.setMatrixAt(i, dm.matrix);
      }
      streaks.instanceMatrix.needsUpdate = true;
    },
  };
}
