import * as THREE from 'three';

export type CoatKind = 'tux' | 'tabby' | 'calico' | 'siamese' | 'cow';

export interface AnimalDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  kind: CoatKind;
  body: number; // warna dasar bulu
  belly: number; // perut
  limb: number; // lengan & kaki
  paw: number; // telapak tangan / kaki
  pad: number; // bantalan pink
  ear: number;
  ear2?: number;
  earIn: number;
  collar: number;
  iris: number;
  muzzle: number;
  nose: number;
  mark: number; // warna belang / titik
  mark2?: number;
  tail: number;
  tailTip: number;
  bell?: boolean;
  blush?: boolean;
}

// Semua karakter = kucing chibi yang sama, beda corak bulu.
export const ANIMALS: AnimalDef[] = [
  {
    id: 'tuxedo',
    name: 'Tuxedo Hitam',
    emoji: '🐈‍⬛',
    blurb: 'Hitam putih, imut mematikan',
    kind: 'tux',
    body: 0x17171d,
    belly: 0xffffff,
    limb: 0x17171d,
    paw: 0xffffff,
    pad: 0xe78db0,
    ear: 0x17171d,
    earIn: 0x2a2a5c,
    collar: 0xb7d3dc,
    iris: 0xb4e2a6,
    muzzle: 0xffffff,
    nose: 0x17171d,
    mark: 0x17171d,
    tail: 0x17171d,
    tailTip: 0x17171d,
  },
  {
    id: 'oren',
    name: 'Oren Belang',
    emoji: '🐱',
    blurb: 'Garang di luar, lembut di dalam',
    kind: 'tabby',
    body: 0xff9a3c,
    belly: 0xfff1d8,
    limb: 0xff9a3c,
    paw: 0xffffff,
    pad: 0xff9fb3,
    ear: 0xff9a3c,
    earIn: 0xffb3bd,
    collar: 0xff4d6d,
    iris: 0xffe17a,
    muzzle: 0xfff1d8,
    nose: 0xff7f99,
    mark: 0xd9661a,
    tail: 0xff9a3c,
    tailTip: 0xfff1d8,
    bell: true,
    blush: true,
  },
  {
    id: 'calico',
    name: 'Calico Tiga Warna',
    emoji: '😺',
    blurb: 'Hoki banget, ikan datang sendiri',
    kind: 'calico',
    body: 0xfffaf2,
    belly: 0xffffff,
    limb: 0xfffaf2,
    paw: 0xffffff,
    pad: 0xff9fb3,
    ear: 0xf2994a,
    ear2: 0x25252c,
    earIn: 0xffb3bd,
    collar: 0xffd23f,
    iris: 0xa8dcff,
    muzzle: 0xffffff,
    nose: 0xff8fa8,
    mark: 0xf2994a,
    mark2: 0x25252c,
    tail: 0x25252c,
    tailTip: 0xf2994a,
    blush: true,
  },
  {
    id: 'abu',
    name: 'Abu-abu Loreng',
    emoji: '😼',
    blurb: 'Kalem, sabar, tukang nunggu',
    kind: 'tabby',
    body: 0x95a1b5,
    belly: 0xffffff,
    limb: 0x95a1b5,
    paw: 0xffffff,
    pad: 0xffa5bd,
    ear: 0x95a1b5,
    earIn: 0xffb3c6,
    collar: 0xff8fb8,
    iris: 0xffe48a,
    muzzle: 0xf4f6fa,
    nose: 0xff8fa8,
    mark: 0x5f6b82,
    tail: 0x95a1b5,
    tailTip: 0x5f6b82,
    blush: true,
  },
  {
    id: 'siam',
    name: 'Siam Krem',
    emoji: '😸',
    blurb: 'Mata biru, elegan, jago banget',
    kind: 'siamese',
    body: 0xf4e4c9,
    belly: 0xfff6e6,
    limb: 0xe9d3b0,
    paw: 0x6c4a3c,
    pad: 0xc98a8a,
    ear: 0x6c4a3c,
    earIn: 0x8f6a5a,
    collar: 0x3fc7c1,
    iris: 0x8fd6ff,
    muzzle: 0x7a574a,
    nose: 0x3d2a24,
    mark: 0x6c4a3c,
    tail: 0x6c4a3c,
    tailTip: 0x4d352b,
    blush: false,
  },
  {
    id: 'sapi',
    name: 'Kucing Sapi',
    emoji: '😻',
    blurb: 'Totol-totol hitam, nyentrik',
    kind: 'cow',
    body: 0xfdfdfd,
    belly: 0xffffff,
    limb: 0xfdfdfd,
    paw: 0xffffff,
    pad: 0xffa0bd,
    ear: 0x25252c,
    ear2: 0xfdfdfd,
    earIn: 0xffb3c6,
    collar: 0x7c8bff,
    iris: 0xd2b8ff,
    muzzle: 0xffffff,
    nose: 0xff8fa8,
    mark: 0x25252c,
    tail: 0xfdfdfd,
    tailTip: 0x25252c,
    bell: true,
    blush: true,
  },
];

export interface Rig {
  root: THREE.Group;
  tilt: THREE.Group;
  inner: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  tail: THREE.Group;
  rodRoot: THREE.Group;
  rodSegs: THREE.Group[];
  rodTip: THREE.Object3D;
  ring: THREE.Mesh;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const mat = (c: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
const basic = (c: number, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

function sph(r: number, c: number, sx = 1, sy = 1, sz = 1, rough = 0.85) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(c, rough));
  m.scale.set(sx, sy, sz);
  return m;
}

function bsph(r: number, c: number, sx = 1, sy = 1, sz = 1, opacity = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), basic(c, opacity));
  m.scale.set(sx, sy, sz);
  return m;
}

// ---------- tekstur corak bulu (di-wrap ke bola) ----------
// u=0.25 depan, 0.5 kanan, 0.75 belakang, 0 kiri. v: 0 atas -> 1 bawah
function coatTexture(def: AnimalDef, part: 'head' | 'body') {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(def.body);
  g.fillRect(0, 0, W, H);

  const blob = (u: number, v: number, rx: number, ry: number, col: string, alpha = 1, rot = 0) => {
    for (const o of [-W, 0, W]) {
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = col;
      g.translate(u * W + o, v * H);
      g.rotate(rot);
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  };
  const line = (u1: number, v1: number, u2: number, v2: number, w: number, col: string) => {
    for (const o of [-W, 0, W]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(u1 * W + o, v1 * H);
      g.lineTo(u2 * W + o, v2 * H);
      g.stroke();
    }
  };
  const m1 = hex(def.mark);
  const m2 = hex(def.mark2 ?? def.mark);

  if (def.kind === 'tabby') {
    if (part === 'head') {
      // dahi (M) depan
      for (const d of [-0.028, 0, 0.028]) line(0.25 + d, 0.05, 0.25 + d * 1.4, 0.24, 10, m1);
      // pipi
      for (const s of [-1, 1]) {
        line(0.25 + s * 0.1, 0.56, 0.25 + s * 0.16, 0.54, 8, m1);
        line(0.25 + s * 0.1, 0.63, 0.25 + s * 0.16, 0.65, 8, m1);
      }
      // belakang kepala (kelihatan dari belakang)
      for (let i = 0; i < 7; i++) {
        const u = 0.6 + i * 0.05;
        line(u, 0.04, u + (i % 2 ? 0.01 : -0.01), 0.3 + (i % 3) * 0.06, 12, m1);
      }
      for (const u of [0.1, 0.4]) line(u, 0.1, u, 0.35, 10, m1);
    } else {
      line(0.75, 0.15, 0.75, 0.9, 14, m1);
      for (const v of [0.25, 0.36, 0.47, 0.58, 0.69, 0.8]) {
        for (const d of [-1, 1]) line(0.75, v, 0.75 + d * 0.15, v + 0.05, 13, m1);
      }
      for (const v of [0.35, 0.5, 0.65]) {
        line(0.45, v, 0.5, v + 0.03, 11, m1);
        line(0.05, v, 0.0, v + 0.03, 11, m1);
      }
    }
  } else if (def.kind === 'calico') {
    if (part === 'head') {
      blob(0.36, 0.3, 70, 52, m1);
      blob(0.1, 0.34, 62, 56, m2);
      blob(0.78, 0.3, 95, 62, m2);
      blob(0.6, 0.22, 60, 46, m1);
    } else {
      blob(0.75, 0.35, 90, 60, m2);
      blob(0.6, 0.7, 70, 55, m1);
      blob(0.9, 0.75, 60, 50, m1);
      blob(0.5, 0.3, 50, 40, m1);
      blob(0.1, 0.5, 60, 55, m2);
    }
  } else if (def.kind === 'cow') {
    if (part === 'head') {
      blob(0.33, 0.4, 52, 44, m1);
      blob(0.72, 0.3, 75, 52, m1);
      blob(0.93, 0.55, 55, 42, m1);
      blob(0.55, 0.6, 40, 34, m1);
      blob(0.12, 0.25, 48, 38, m1);
    } else {
      blob(0.7, 0.35, 72, 55, m1);
      blob(0.9, 0.65, 60, 50, m1);
      blob(0.55, 0.75, 50, 40, m1);
      blob(0.2, 0.4, 65, 50, m1);
      blob(0.38, 0.7, 40, 32, m1);
      blob(0.1, 0.8, 45, 35, m1);
    }
  } else if (def.kind === 'siamese') {
    if (part === 'head') {
      const gr = g.createRadialGradient(0.25 * W, 0.58 * H, 8, 0.25 * W, 0.58 * H, 100);
      gr.addColorStop(0, hex(def.mark) + 'f0');
      gr.addColorStop(0.55, hex(def.mark) + 'b0');
      gr.addColorStop(1, hex(def.mark) + '00');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      blob(0.75, 0.3, 100, 70, m1, 0.28);
    } else {
      blob(0.75, 0.4, 110, 90, m1, 0.2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pear(geo: THREE.BufferGeometry, amt: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 0.5;
    const k = 1 - amt * ny; // bawah lebih lebar, atas lebih sempit
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
}

function texSph(r: number, tex: THREE.Texture, sx: number, sy: number, sz: number, pearAmt = 0) {
  const geo = new THREE.SphereGeometry(r, 36, 26);
  if (pearAmt) pear(geo, pearAmt);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.scale.set(sx, sy, sz);
  return m;
}

export function buildAnimal(def: AnimalDef, playerColor: number): Rig {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.y = 0.5;
  tilt.rotation.order = 'ZXY';
  const inner = new THREE.Group();
  inner.position.y = -0.5;
  root.add(tilt);
  tilt.add(inner);

  // ===== badan GEMPAL berbentuk buah pir =====
  const body = texSph(0.5, coatTexture(def, 'body'), 1.3, 1.4, 1.05, 0.15);
  body.position.y = 0.9;
  inner.add(body);
  // perut oval putih besar (dari kalung sampai hampir pinggul)
  const bg = new THREE.SphereGeometry(0.5, 28, 20);
  const belly = new THREE.Mesh(bg, mat(def.belly));
  belly.scale.set(0.98, 1.0, 0.3);
  belly.position.set(0, 0.88, 0.42);
  inner.add(belly);

  // kalung lebar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 10, 32), mat(def.collar, 0.6));
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1.08, 0.82, 1.3);
  collar.position.set(0, 1.4, 0.0);
  inner.add(collar);
  if (def.bell) {
    const bell = sph(0.085, 0xffd23f, 1, 1, 1, 0.3);
    bell.position.set(0, 1.33, 0.4);
    inner.add(bell);
  }

  // ===== kepala BESAR & lebar =====
  const head = new THREE.Group();
  head.position.set(0, 2.15, 0.02);
  inner.add(head);
  head.add(texSph(0.75, coatTexture(def, 'head'), 1.15, 0.94, 1.0));

  // telinga segitiga besar di pojok atas
  for (const s of [-1, 1]) {
    const ec = s === 1 ? def.ear : (def.ear2 ?? def.ear);
    const g = new THREE.Group();
    g.position.set(s * 0.56, 0.58, -0.02);
    g.rotation.z = -s * 0.42;
    const og = new THREE.ConeGeometry(0.37, 0.78, 4);
    og.rotateY(Math.PI / 4);
    const outer = new THREE.Mesh(og, mat(ec));
    outer.scale.z = 0.5;
    g.add(outer);
    const ig = new THREE.ConeGeometry(0.24, 0.56, 4);
    ig.rotateY(Math.PI / 4);
    const inn = new THREE.Mesh(ig, mat(def.earIn));
    inn.scale.z = 0.5;
    inn.position.set(0, -0.05, 0.1);
    g.add(inn);
    head.add(g);
  }

  // mata besar: bola hitam + lengkung hijau di bawah + titik putih
  for (const s of [-1, 1]) {
    const eye = bsph(0.215, 0x0e0e14, 1, 1.12, 0.55);
    eye.position.set(s * 0.38, -0.02, 0.62);
    head.add(eye);
    const arc = Math.PI * 1.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.034, 8, 24, arc), basic(def.iris));
    ring.position.set(s * 0.38, -0.05, 0.7);
    ring.rotation.z = -Math.PI / 2 - arc / 2;
    ring.scale.y = 1.1;
    head.add(ring);
    const hl = bsph(0.05, 0xffffff, 1, 1, 0.6);
    hl.position.set(s * 0.38, 0.09, 0.725);
    head.add(hl);
    const hl2 = bsph(0.022, 0xffffff, 1, 1, 0.6);
    hl2.position.set(s * 0.38 - s * 0.07, -0.14, 0.715);
    head.add(hl2);
  }

  // moncong putih di dasar wajah, hidung, mulut "ω"
  for (const s of [-1, 1]) {
    const puff = sph(0.21, def.muzzle, 1.2, 0.76, 0.8);
    puff.position.set(s * 0.16, -0.47, 0.55);
    head.add(puff);
  }
  const nose = sph(0.06, def.nose, 1.5, 0.9, 0.8, 0.4);
  nose.position.set(0, -0.33, 0.7);
  head.add(nose);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), basic(0x1b1117));
    m.rotation.z = Math.PI;
    m.position.set(s * 0.06, -0.4, 0.725);
    head.add(m);
  }
  if (def.blush) {
    for (const s of [-1, 1]) {
      const b = bsph(0.12, 0xff8fa8, 1.2, 0.7, 0.3, 0.4);
      b.position.set(s * 0.6, -0.3, 0.44);
      b.rotation.y = s * 0.8;
      head.add(b);
    }
  }

  // kumis putih tipis (2 per sisi)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const a = k === 0 ? 0.2 : -0.12;
      const len = 0.58;
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 4), basic(0xffffff));
      const bx = s * 0.4;
      const by = -0.3 - k * 0.1;
      w.position.set(bx + s * Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.5, 0.64 - k * 0.02);
      w.rotation.z = s * (a - Math.PI / 2);
      head.add(w);
    }
  }

  // ===== lengan tipis, telapak putih BESAR + bantalan pink =====
  const makeArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.48, 1.3, 0.02);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 4, 10), mat(def.limb));
    a.position.y = -0.3;
    g.add(a);
    const paw = sph(0.25, def.paw, 1, 0.92, 0.78);
    paw.position.y = -0.72;
    g.add(paw);
    const pad = sph(0.12, def.pad, 1, 0.85, 0.35);
    pad.position.set(0, -0.68, 0.14);
    g.add(pad);
    for (const dx of [-0.11, 0, 0.11]) {
      const bean = sph(0.043, def.pad, 1, 1, 0.7);
      bean.position.set(dx, dx === 0 ? -0.86 : -0.83, 0.12);
      g.add(bean);
    }
    inner.add(g);
    return g;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ===== kaki pendek tebal, telapak putih besar =====
  const makeLeg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.34, 0.52, 0);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.08, 4, 10), mat(def.limb));
    l.position.y = -0.18;
    g.add(l);
    const f = sph(0.25, def.paw, 1.1, 0.55, 1.5);
    f.position.set(s * 0.04, -0.4, 0.13);
    g.add(f);
    for (const dx of [-0.09, 0, 0.09]) {
      const bean = sph(0.034, def.pad, 1, 1, 0.8);
      bean.position.set(s * 0.04 + dx, dx === 0 ? -0.34 : -0.35, 0.46);
      g.add(bean);
    }
    inner.add(g);
    return g;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ===== ekor tebal & berbulu, melengkung ke atas =====
  const tail = new THREE.Group();
  tail.position.set(0, 0.6, -0.44);
  inner.add(tail);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.0, -0.24),
    new THREE.Vector3(0, 0.1, -0.44),
    new THREE.Vector3(0, 0.3, -0.56),
    new THREE.Vector3(0, 0.55, -0.6),
    new THREE.Vector3(0, 0.8, -0.52),
    new THREE.Vector3(0, 0.98, -0.38),
  ]);
  const pts = curve.getPoints(14);
  const tgeo = new THREE.SphereGeometry(1, 14, 10);
  pts.forEach((p, i) => {
    const t = i / (pts.length - 1);
    const r = 0.19 - 0.03 * t;
    const m = new THREE.Mesh(tgeo, mat(t > 0.82 ? def.tailTip : def.tail));
    m.position.copy(p);
    m.scale.setScalar(t > 0.97 ? r * 1.05 : r);
    tail.add(m);
  });

  // ===== pancing =====
  const rodRoot = new THREE.Group();
  rodRoot.position.set(-0.62, 1.08, 0.62);
  inner.add(rodRoot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8), mat(0x6b3f1d));
  handle.rotation.x = Math.PI / 2;
  rodRoot.add(handle);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), mat(playerColor, 0.4));
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0.1, -0.04, 0.05);
  rodRoot.add(reel);

  const segLen = 0.72;
  const rodSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = rodRoot;
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.z = i === 0 ? 0.15 : segLen;
    const geo = new THREE.CylinderGeometry(0.036 - i * 0.007, 0.046 - i * 0.007, segLen, 8);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, segLen / 2);
    g.add(new THREE.Mesh(geo, mat(i < 2 ? 0xc58b3a : 0xe0b060, 0.6)));
    parent.add(g);
    rodSegs.push(g);
    parent = g;
  }
  const rodTip = new THREE.Object3D();
  rodTip.position.z = segLen;
  parent.add(rodTip);

  // cincin warna pemain
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 36),
    new THREE.MeshBasicMaterial({ color: playerColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && o !== ring && !(m.material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) o.castShadow = true;
  });

  return { root, tilt, inner, head, armL, armR, legL, legR, tail, rodRoot, rodSegs, rodTip, ring };
}
