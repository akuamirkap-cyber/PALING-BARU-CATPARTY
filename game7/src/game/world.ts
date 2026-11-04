import * as THREE from 'three';

export const WATER_Y = -0.9;
export const DOCK_R = 9.6; // radius pulau pasir (area yang bisa diinjak)
export const SPOT_R = 6.7;
export const PLAYER_COLORS = ['#ff4d6d', '#2ec4ff', '#ffd23f', '#7cf05a'];
const TAU = Math.PI * 2;
const SHORE = 10.3; // radius garis air di dinding pulau

export function waterHeight(x: number, z: number, t: number) {
  return WATER_Y + Math.sin(x * 0.35 + t * 1.3) * 0.07 + Math.sin(z * 0.42 + t * 1.0) * 0.07;
}

export interface Spot {
  x: number;
  z: number;
  dx: number; // arah keluar (ke air)
  dz: number;
  a: number;
  bucket: THREE.Vector3;
}
export interface Blocker {
  x: number;
  z: number;
  r: number;
}
export interface World {
  spots: Spot[];
  pads: THREE.Mesh[];
  blockers: Blocker[];
  update(t: number): void;
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
const std = (c: number, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

// ---------- tekstur ----------
function sandTex() {
  const rnd = rng(21);
  const { c, g } = cv(512, 512);
  g.fillStyle = '#fbeec2';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 60 + rnd() * 100;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? 'rgba(255,250,222,0.5)' : 'rgba(232,200,134,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(160,120,70,0.3)';
    g.fillRect(rnd() * 512, rnd() * 512, 1.3, 1.3);
  }
  return toTex(c, 5, 5, true);
}
function seabedTex() {
  const rnd = rng(9);
  const { c, g } = cv(256, 256);
  g.fillStyle = '#f2e3ac';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) {
    const y = (i * 256) / 9 + rnd() * 6;
    g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(205,168,98,0.35)';
    g.lineWidth = 5;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.07 + i) * 5);
    g.stroke();
  }
  return toTex(c, 22, 22, true);
}
function stripeTex(a: string, b: string, n = 8) {
  const { c, g } = cv(256, 32);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / n, 0, 256 / n + 1, 32);
  }
  return toTex(c, 1, 1, true);
}
function plankTex() {
  const rnd = rng(5);
  const { c, g } = cv(256, 256);
  const tones = ['#e0aa66', '#d69e58', '#e8b574', '#cf9450'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = tones[i % 4];
    g.fillRect(0, (i * 256) / 6, 256, 256 / 6);
    g.fillStyle = 'rgba(90,50,15,0.45)';
    g.fillRect(0, (i * 256) / 6, 256, 3);
    g.strokeStyle = 'rgba(120,70,25,0.22)';
    for (let k = 0; k < 3; k++) {
      const y = (i * 256) / 6 + 6 + rnd() * (256 / 6 - 12);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y + rnd() * 3 - 1.5);
      g.stroke();
    }
  }
  return toTex(c);
}
function emblemTex() {
  const { c, g } = cv(1024, 1024);
  g.translate(512, 512);
  g.lineCap = 'round';
  // tali melingkar
  g.strokeStyle = 'rgba(196,150,86,0.55)';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(0, 0, 486, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(226,186,120,0.5)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 452, 0, TAU);
  g.stroke();
  // gelombang lembut
  g.strokeStyle = 'rgba(196,150,86,0.38)';
  g.lineWidth = 7;
  for (let ring = 0; ring < 2; ring++) {
    const rr = 360 - ring * 34;
    g.beginPath();
    for (let k = 0; k <= 72; k++) {
      const a = (k / 72) * TAU;
      const w = Math.sin(a * 9) * 7;
      const x = Math.cos(a) * (rr + w);
      const y = Math.sin(a) * (rr + w);
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  // bintang laut kecil di tengah
  g.fillStyle = 'rgba(255,150,120,0.5)';
  g.strokeStyle = 'rgba(238,130,98,0.6)';
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? 168 : 66;
    const a = (i / 10) * TAU - Math.PI / 2;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,240,205,0.8)';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    for (let m = 1; m <= 3; m++) {
      g.beginPath();
      g.arc(Math.cos(a) * m * 30, Math.sin(a) * m * 30, 6 - m, 0, TAU);
      g.fill();
    }
  }
  // titik pasir kecil, jarang
  g.fillStyle = 'rgba(196,150,86,0.28)';
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + 0.2;
    const rr = 250 + (k % 4) * 14;
    g.beginPath();
    g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 5, 0, TAU);
    g.fill();
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

// daun palem: bentuk V melengkung dengan tepi bergerigi seperti bulu
function frondGeo(len: number, wid: number) {
  const SEG = 14;
  const g = new THREE.PlaneGeometry(1, 1, 2, SEG);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const iy = Math.floor(i / 3);
    const u = p.getX(i);
    const v = p.getY(i) + 0.5;
    const edge = Math.abs(u) > 0.4;
    const zig = edge ? (iy % 2 === 0 ? 1.0 : 0.62) : 1.0;
    const w = wid * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * v)), 0.75) * zig;
    p.setXYZ(i, u * w, -Math.pow(v, 1.7) * len * 0.5 - Math.abs(u) * 0.42 * w * (1 - v * 0.45), v * len);
    const sh = 0.7 + 0.3 * v * (0.55 + Math.abs(u));
    const rib = edge ? 1 : 1.18;
    col[i * 3] = 0.17 * sh * rib;
    col[i * 3 + 1] = (0.62 * sh + 0.1 * v) * rib;
    col[i * 3 + 2] = 0.2 * sh * rib;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function createWorld(scene: THREE.Scene): World {
  const rand = rng(88);
  const uTime = { value: 0 };
  scene.background = new THREE.Color(0xbfeaff);
  scene.fog = new THREE.Fog(0xcaf0ff, 90, 420);

  // ---------- langit tropis ----------
  const sunDir = new THREE.Vector3(-0.42, 0.5, -0.76).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 32, 20),
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
          vec3 top = vec3(0.07, 0.46, 0.98);
          vec3 mid = vec3(0.33, 0.76, 1.00);
          vec3 hor = vec3(0.93, 0.98, 1.00);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.24, 0.92, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.9, 0.6) * pow(s, 8.0) * 0.28 + vec3(1.0, 0.97, 0.8) * pow(s, 90.0);
          c = mix(c, vec3(0.79, 0.94, 1.0), smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdff4ff, 0xf3e3b8, 1.8));
  const sun = new THREE.DirectionalLight(0xfff1d0, 3.0);
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
  const fill = new THREE.DirectionalLight(0xbfe6ff, 0.55);
  fill.position.set(18, 14, 22);
  scene.add(fill);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(24, 32), new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(700);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(sunDir).multiplyScalar(690);
  glow.lookAt(0, 0, 0);
  scene.add(glow);

  // ---------- air laut (shader: gradasi kedalaman, cahaya karang, buih, kilau matahari) ----------
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime, uSun: { value: sunDir }, uFog: { value: new THREE.Color(0xcaf0ff) }, uShore: { value: SHORE } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uFog; uniform float uShore; varying vec3 vW;
      float caustic(vec2 p, float t){
        vec2 q = p; float v = 0.0;
        for (int i = 0; i < 3; i++) {
          q += vec2(sin(q.y * 1.35 + t * 0.8), cos(q.x * 1.25 - t * 0.7)) * 0.55;
          v += pow(0.5 + 0.5 * sin(q.x * 2.2 + q.y * 1.8 + float(i)), 7.0);
        }
        return v;
      }
      void main(){
        float t = uTime;
        vec2 p = vW.xz;
        float r = length(p);
        float dx = cos(p.x * 0.35 + t * 1.3) * 0.0245 + cos(p.x * 1.7 + t * 2.1) * 0.02;
        float dz = cos(p.y * 0.42 + t * 1.0) * 0.0294 + cos(p.y * 1.9 - t * 1.8) * 0.022;
        vec3 n = normalize(vec3(-dx * 7.0, 1.0, -dz * 7.0));
        vec3 V = normalize(cameraPosition - vW);
        float dk = smoothstep(uShore, uShore + 30.0, r);
        vec3 shallow = vec3(0.55, 0.98, 0.91);
        vec3 mid = vec3(0.10, 0.78, 0.93);
        vec3 deep = vec3(0.03, 0.34, 0.76);
        vec3 col = mix(shallow, mid, smoothstep(0.0, 0.4, dk));
        col = mix(col, deep, smoothstep(0.35, 1.0, dk));
        float shal = 1.0 - smoothstep(0.0, 0.34, dk);
        col += vec3(1.0, 1.0, 0.85) * caustic(p * 0.5, t) * 0.07 * shal;
        float fo = smoothstep(uShore + 1.7, uShore + 0.1, r);
        float wob = 0.5 + 0.5 * sin(r * 5.0 - t * 1.6 + sin(atan(p.y, p.x) * 9.0 + t) * 1.3);
        col = mix(col, vec3(1.0), fo * (0.28 + 0.55 * wob));
        float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col = mix(col, vec3(0.62, 0.85, 1.0), fr * 0.45);
        vec3 H = normalize(uSun + V);
        float sp = pow(max(dot(n, H), 0.0), 140.0);
        col += vec3(1.0, 0.95, 0.8) * sp * 1.4;
        float alpha = mix(0.5, 0.94, smoothstep(0.08, 0.9, dk));
        alpha = max(alpha, fo * (0.55 + 0.4 * wob));
        alpha = clamp(alpha + fr * 0.2 + sp, 0.0, 1.0);
        float dist = length(cameraPosition - vW);
        float f = smoothstep(130.0, 440.0, dist);
        col = mix(col, uFog, f);
        alpha = mix(alpha, 1.0, f);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const wGeo = new THREE.PlaneGeometry(200, 200, 100, 100);
  wGeo.rotateX(-Math.PI / 2);
  const wPos = wGeo.attributes.position as THREE.BufferAttribute;
  const wBase = new Float32Array(wPos.count * 2);
  const wFade = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    const x = wPos.getX(i);
    const z = wPos.getZ(i);
    wBase[i * 2] = x;
    wBase[i * 2 + 1] = z;
    const e = Math.max(Math.abs(x), Math.abs(z));
    wFade[i] = 1 - Math.min(1, Math.max(0, (e - 70) / 30));
  }
  const water = new THREE.Mesh(wGeo, waterMat);
  water.renderOrder = -1;
  scene.add(water);
  {
    const outer = new THREE.Shape();
    outer.moveTo(-900, -900);
    outer.lineTo(900, -900);
    outer.lineTo(900, 900);
    outer.lineTo(-900, 900);
    outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-100, -100);
    hole.lineTo(-100, 100);
    hole.lineTo(100, 100);
    hole.lineTo(100, -100);
    hole.closePath();
    outer.holes.push(hole);
    const og = new THREE.ShapeGeometry(outer);
    og.rotateX(-Math.PI / 2);
    const far = new THREE.Mesh(og, waterMat);
    far.position.y = WATER_Y;
    far.renderOrder = -1;
    scene.add(far);
  }

  // ---------- dasar laut berpasir ----------
  {
    const bg = new THREE.CircleGeometry(66, 64);
    bg.rotateX(-Math.PI / 2);
    const bp = bg.attributes.position as THREE.BufferAttribute;
    const bc = new Float32Array(bp.count * 3);
    const cIn = new THREE.Color(0xfff2c6);
    const cMid = new THREE.Color(0x8fe0e8);
    const cOut = new THREE.Color(0x0e5aa0);
    const tmp = new THREE.Color();
    for (let i = 0; i < bp.count; i++) {
      const r = Math.hypot(bp.getX(i), bp.getZ(i));
      if (r < 24) tmp.copy(cIn).lerp(cMid, Math.max(0, (r - 12) / 12));
      else tmp.copy(cMid).lerp(cOut, Math.min(1, (r - 24) / 40));
      bc[i * 3] = tmp.r;
      bc[i * 3 + 1] = tmp.g;
      bc[i * 3 + 2] = tmp.b;
    }
    bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    const bed = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: seabedTex(), vertexColors: true }));
    bed.position.y = -2.4;
    scene.add(bed);
    const deep = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0x0b4e92 }));
    deep.rotation.x = -Math.PI / 2;
    deep.position.y = -13;
    scene.add(deep);
  }

  // ---------- terumbu karang (rumpun rapi, semuanya di bawah permukaan) ----------
  {
    const dm2 = new THREE.Object3D();
    const cc = new THREE.Color();
    const NB = 260;
    const lumpG = new THREE.IcosahedronGeometry(0.5, 1);
    const lumps = new THREE.InstancedMesh(lumpG, std(0xffffff, 0.75), NB);
    const pal = [0xff8fa6, 0xff9f7a, 0xffc46a, 0xd58ec8, 0x9a8cf0, 0x6fd8cf];
    let n = 0;
    const clusters = 12;
    for (let cl = 0; cl < clusters && n < NB; cl++) {
      const a = (cl / clusters) * TAU + (rand() - 0.5) * 0.25;
      const r = 14.5 + rand() * 11;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const col = pal[cl % pal.length];
      const size = 0.75 + rand() * 0.6;
      const num = 5 + Math.floor(rand() * 4);
      for (let k = 0; k < num && n < NB; k++) {
        const aa = rand() * TAU;
        const dd = rand() * 0.85 * size;
        const scl = (0.55 + rand() * 0.55) * size;
        dm2.position.set(cx + Math.cos(aa) * dd, -2.4 + scl * 0.16 + rand() * 0.35 * size, cz + Math.sin(aa) * dd);
        dm2.rotation.set(rand() * 2, rand() * 6, rand() * 2);
        dm2.scale.set(scl * (1 + rand() * 0.3), scl * (0.55 + rand() * 0.35), scl * (1 + rand() * 0.3));
        dm2.updateMatrix();
        lumps.setMatrixAt(n, dm2.matrix);
        lumps.setColorAt(n, cc.setHex(col).offsetHSL(0, 0, (rand() - 0.5) * 0.08));
        n++;
      }
    }
    lumps.count = n;
    scene.add(lumps);
    // kipas laut
    const fanShape = new THREE.Shape();
    fanShape.moveTo(0, 0);
    fanShape.bezierCurveTo(-0.7, 0.4, -0.95, 1.15, -0.55, 1.6);
    fanShape.bezierCurveTo(-0.2, 1.9, 0.2, 1.9, 0.55, 1.6);
    fanShape.bezierCurveTo(0.95, 1.15, 0.7, 0.4, 0, 0);
    const fanGeo = new THREE.ShapeGeometry(fanShape, 10);
    const NF = 5;
    for (let i = 0; i < NF; i++) {
      const a = (i / NF) * TAU + 0.7;
      const r = 15 + (i % 3) * 3;
      const fanCols = [0xc86fa8, 0xe07a5f, 0xcf9a4a, 0x9a6fc8, 0x4fb3a8];
      const m = new THREE.Mesh(fanGeo, new THREE.MeshStandardMaterial({ color: fanCols[i % fanCols.length], roughness: 0.85, side: THREE.DoubleSide }));
      m.position.set(Math.cos(a) * r, -2.4, Math.sin(a) * r);
      m.rotation.y = -a;
      m.rotation.x = -0.06;
      m.scale.setScalar(0.55 + (i % 3) * 0.08);
      scene.add(m);
    }
    // rumput laut berumpun, ujung tetap di bawah air
    const weedShape = new THREE.Shape();
    weedShape.moveTo(-0.09, 0);
    weedShape.bezierCurveTo(-0.16, 0.45, 0.12, 0.75, 0.02, 1.12);
    weedShape.bezierCurveTo(0.14, 0.78, 0.04, 0.4, 0.09, 0);
    weedShape.closePath();
    const weedGeo = new THREE.ShapeGeometry(weedShape, 8);
    const weedMat = new THREE.MeshStandardMaterial({ color: 0x3aa87a, roughness: 0.85, side: THREE.DoubleSide });
    const weedMat2 = new THREE.MeshStandardMaterial({ color: 0x68c98f, roughness: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.3;
      const r = 13.5 + rand() * 10;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const k = 3 + Math.floor(rand() * 3);
      for (let q = 0; q < k; q++) {
        const m = new THREE.Mesh(weedGeo, q % 2 ? weedMat : weedMat2);
        m.position.set(cx + (rand() - 0.5) * 1.1, -2.4, cz + (rand() - 0.5) * 1.1);
        m.rotation.y = rand() * 6;
        m.rotation.z = (rand() - 0.5) * 0.3;
        m.scale.setScalar(0.55 + rand() * 0.4);
        scene.add(m);
      }
    }
    // bintang laut di dasar laut
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? 0.34 : 0.14;
      const a = (i / 10) * TAU - Math.PI / 2;
      if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    star.closePath();
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    sg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const a = rand() * TAU;
      const r = 13 + rand() * 12;
      const m = new THREE.Mesh(sg, std([0xff8f5c, 0xffb066, 0xf05d7a][i % 3], 0.7));
      m.position.set(Math.cos(a) * r, -2.38, Math.sin(a) * r);
      m.rotation.y = rand() * 6;
      m.scale.setScalar(0.9 + rand() * 0.5);
      scene.add(m);
    }
  }

  // ---------- pulau pasir ----------
  const sandTop = new THREE.MeshStandardMaterial({ map: sandTex(), roughness: 1 });
  const sandSide = new THREE.MeshStandardMaterial({ color: 0xf1d79a, roughness: 1 });
  const island = new THREE.Mesh(new THREE.CylinderGeometry(DOCK_R + 0.12, DOCK_R + 1.6, 2.6, 72), [sandSide, sandTop, sandSide]);
  island.position.y = -1.3;
  island.receiveShadow = true;
  island.castShadow = true;
  scene.add(island);
  for (const [r0, r1, o] of [
    [DOCK_R - 0.9, DOCK_R + 0.12, 0.3],
    [DOCK_R - 1.9, DOCK_R - 0.9, 0.14],
  ] as [number, number, number][]) {
    const wr = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), new THREE.MeshBasicMaterial({ color: 0xa5834a, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    wr.rotation.x = -Math.PI / 2;
    wr.position.y = 0.012;
    scene.add(wr);
  }
  // lambang bintang laut di tengah
  {
    const em = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 64),
      new THREE.MeshBasicMaterial({ map: emblemTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    em.rotation.x = -Math.PI / 2;
    em.position.y = 0.018;
    scene.add(em);
  }
  // cincin cangkang di tepi pantai
  {
    const dm = new THREE.Object3D();
    const col = new THREE.Color();
    const N = 58;
    const shell = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), std(0xffffff, 0.55), N);
    const coin = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), std(0xffffff, 0.6), N);
    const pal = [0xffffff, 0xffe6d2, 0xfff3d6, 0xf4ecff];
    let si = 0;
    let ci = 0;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const r = DOCK_R - 0.55 + Math.sin(i * 1.7) * 0.06;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (i % 5 === 0) {
        dm.position.set(x, 0.032, z);
        dm.rotation.set(0, -a, 0);
        dm.scale.setScalar(0.8);
        dm.updateMatrix();
        coin.setMatrixAt(ci, dm.matrix);
        coin.setColorAt(ci++, col.setHex(pal[(i + 1) % pal.length]));
      } else {
        dm.position.set(x, 0.04, z);
        dm.rotation.set(0.4, -a, 0.2);
        const scl = 0.8 + (i % 3) * 0.18;
        dm.scale.set(scl, scl * 0.5, scl);
        dm.updateMatrix();
        shell.setMatrixAt(si, dm.matrix);
        shell.setColorAt(si++, col.setHex(pal[i % pal.length]));
      }
    }
    shell.count = si;
    coin.count = ci;
    shell.castShadow = true;
    scene.add(shell, coin);
    // beberapa bintang laut di pasir, tidak terlalu besar
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? 0.4 : 0.17;
      const a = (i / 10) * TAU - Math.PI / 2;
      if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    star.closePath();
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    sg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 2;
      const m = new THREE.Mesh(sg, std(0xffb066, 0.65));
      m.position.set(Math.cos(a) * (DOCK_R - 1.6), 0.03, Math.sin(a) * (DOCK_R - 1.6));
      m.rotation.y = a + 0.5;
      m.scale.setScalar(0.85);
      scene.add(m);
    }
  }

  // ---------- ayunan pantai di sisi belakang ----------
  {
    const a0 = Math.PI * 0.5 + 0.95;
    const bx = Math.cos(a0) * (DOCK_R - 1.1);
    const bz = Math.sin(a0) * (DOCK_R - 1.1);
    const woodM = std(0x9a6a3a, 0.9);
    for (const sd of [-1, 1]) {
      const px = bx + Math.cos(a0 + Math.PI / 2) * sd * 1.5;
      const pz = bz + Math.sin(a0 + Math.PI / 2) * sd * 1.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.7, 6), woodM);
      leg.position.set(px, 1.35, pz);
      leg.rotation.z = -sd * 0.16;
      leg.castShadow = true;
      scene.add(leg);
      const leg2 = leg.clone();
      leg2.position.z -= 0.55;
      scene.add(leg2);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), woodM);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(bx, 2.62, bz);
    bar.rotation.y = -a0;
    scene.add(bar);
    for (const sd of [-1, 1]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4), std(0xf4e8cf, 0.8));
      rope.position.set(bx + Math.cos(a0 + Math.PI / 2) * sd * 0.85, 1.85, bz + Math.sin(a0 + Math.PI / 2) * sd * 0.85);
      scene.add(rope);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.55), std(0xff9a3c, 0.6));
    seat.position.set(bx, 1.08, bz);
    seat.rotation.y = -a0 + Math.PI / 2;
    seat.castShadow = true;
    scene.add(seat);
  }

  // ---------- spot, panggung kayu, ember, papan nomor ----------
  const spots: Spot[] = [];
  const pads: THREE.Mesh[] = [];
  const blockers: Blocker[] = [];
  const plankM = new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const x = dx * SPOT_R;
    const z = dz * SPOT_R;
    const tx = -dz;
    const tz = dx;
    const c4 = new THREE.Color(PLAYER_COLORS[k]);

    const plank = new THREE.Mesh(new THREE.CircleGeometry(1.85, 44), plankM);
    plank.rotation.x = -Math.PI / 2;
    plank.rotation.z = a;
    plank.position.set(x, 0.022, z);
    plank.receiveShadow = true;
    scene.add(plank);
    const rim = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.02, 44), new THREE.MeshBasicMaterial({ color: c4, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, 0.03, z);
    scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), new THREE.MeshBasicMaterial({ color: c4, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.034, z);
    scene.add(pad);
    pads.push(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.57, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.038, z);
    scene.add(ring);

    // papan nomor
    const sx = x + tx * 2.5 - dx * 0.2;
    const sz = z + tz * 2.5 - dz * 0.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), std(0x7a4a22));
    pole.position.set(sx, 0.9, sz);
    pole.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.1), new THREE.MeshStandardMaterial({ map: signTex(k + 1, PLAYER_COLORS[k]), roughness: 0.6 }));
    board.position.set(sx, 1.95, sz);
    board.rotation.y = Math.atan2(-dx, -dz);
    board.castShadow = true;
    scene.add(pole, board);

    // ember
    const bx = x - dx * 0.2 - tx * 2.05;
    const bz = z - dz * 0.2 - tz * 2.05;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.42, 0.75, 18, 1, true), new THREE.MeshStandardMaterial({ color: c4, roughness: 0.5, side: THREE.DoubleSide }));
    bucket.position.set(bx, 0.375, bz);
    bucket.castShadow = true;
    const inside = new THREE.Mesh(new THREE.CircleGeometry(0.43, 16), std(0x1c3b55));
    inside.rotation.x = -Math.PI / 2;
    inside.position.set(bx, 0.12, bz);
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.85 }));
    w2.rotation.x = -Math.PI / 2;
    w2.position.set(bx, 0.52, bz);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 18, Math.PI), std(0xffffff, 0.5));
    handle.position.set(bx, 0.75, bz);
    handle.rotation.y = Math.atan2(tx, tz);
    scene.add(bucket, inside, w2, handle);
    spots.push({ x, z, dx, dz, a, bucket: new THREE.Vector3(bx, 0.75, bz) });
  }

  // ---------- pohon palem ----------
  const palms: { fronds: THREE.Group; ph: number }[] = [];
  const fGeo = frondGeo(3.8, 1.35);
  const fMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  const trunkMat = std(0x9a6a3a, 0.95);
  const ringMat = std(0x7a5430, 0.95);
  const cylBetween = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, m: THREE.Material) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 9), m);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    mesh.castShadow = true;
    return mesh;
  };
  const addPalm = (x: number, z: number, h: number, lean: number, ang: number, scale: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const lx = Math.cos(ang) * lean;
    const lz = Math.sin(ang) * lean;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(lx * Math.pow(t, 1.7), h * t, lz * Math.pow(t, 1.7)));
    }
    for (let i = 0; i < 8; i++) {
      const r0 = 0.3 * scale * (1 - (i / 8) * 0.45);
      const r1 = 0.3 * scale * (1 - ((i + 1) / 8) * 0.45);
      g.add(cylBetween(pts[i], pts[i + 1], r0, r1, trunkMat));
      if (i > 0) {
        const rg = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.03, 0.04 * scale, 5, 12), ringMat);
        rg.position.copy(pts[i]);
        rg.rotation.x = Math.PI / 2;
        g.add(rg);
      }
    }
    const top = pts[8];
    const fr = new THREE.Group();
    fr.position.copy(top);
    const nF = 11;
    for (let k = 0; k < nF; k++) {
      const m = new THREE.Mesh(fGeo, fMat);
      const holder = new THREE.Group();
      holder.rotation.y = (k / nF) * TAU + rand() * 0.25;
      m.rotation.x = -0.5 + rand() * 0.28;
      m.scale.setScalar(scale * (0.9 + rand() * 0.2));
      m.castShadow = true;
      holder.add(m);
      fr.add(holder);
    }
    const nutM = std(0x5a3a1e, 0.8);
    for (let k = 0; k < 3; k++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 8, 6), nutM);
      n.position.set(Math.cos(k * 2.1) * 0.28, -0.25, Math.sin(k * 2.1) * 0.28);
      fr.add(n);
    }
    g.add(fr);
    scene.add(g);
    palms.push({ fronds: fr, ph: rand() * 6 });
    blockers.push({ x, z, r: 0.6 * scale });
    return new THREE.Vector3(x + lx, h, z + lz);
  };
  // dua palem tinggi membingkai pemain di belakang (tidak menutupi layar)
  const palmTops = [Math.PI / 4, -Math.PI / 4].map((a, i) => addPalm(Math.cos(a) * 8.9, Math.sin(a) * 8.9, 5.5 + i * 0.2, 1.75, a, 0.92));

  // bendera pesta di antara dua palem
  const flags: { h: THREE.Group; m: THREE.Mesh; ph: number }[] = [];
  {
    const A = palmTops[0].clone().add(new THREE.Vector3(0, -0.55, 0));
    const B = palmTops[1].clone().add(new THREE.Vector3(0, -0.55, 0));
    const N = 22;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(new THREE.Vector3().lerpVectors(A, B, u).add(new THREE.Vector3(0, -Math.sin(u * Math.PI) * 1.7, 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.03, 5), std(0xfff6e0, 0.7));
    scene.add(rope);
    const dir = new THREE.Vector3().subVectors(B, A).normalize();
    const yaw = Math.atan2(-dir.z, dir.x);
    const fc = [0xff4d6d, 0xffd23f, 0x2ec4ff, 0x7cf05a, 0xffffff, 0xff8fb8, 0xb26bff];
    const sh = new THREE.Shape();
    sh.moveTo(-0.26, 0);
    sh.lineTo(0.26, 0);
    sh.lineTo(0, -0.72);
    sh.closePath();
    const fg = new THREE.ShapeGeometry(sh);
    for (let i = 1; i < N; i++) {
      const holder = new THREE.Group();
      holder.position.copy(pts[i]);
      holder.rotation.y = yaw;
      const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: fc[i % fc.length], side: THREE.DoubleSide }));
      holder.add(m);
      scene.add(holder);
      flags.push({ h: holder, m, ph: i * 0.55 });
    }
  }

  // ---------- properti pantai (simetris & rapi) ----------
  const polar = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
  const umbTex = stripeTex('#ff4d6d', '#ffffff', 10);
  const umbTex2 = stripeTex('#2ec4ff', '#ffffff', 10);
  const umbrellas: THREE.Group[] = [];
  [Math.PI / 4, -Math.PI / 4].forEach((a, i) => {
    const [ux, uz] = polar(a, 6.3);
    const g = new THREE.Group();
    g.position.set(ux, 0, uz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.0, 8), std(0xf4f4f4, 0.5));
    pole.position.y = 1.5;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.8, 16, 1, true), new THREE.MeshStandardMaterial({ map: i ? umbTex2 : umbTex, side: THREE.DoubleSide, roughness: 0.7 }));
    canopy.position.y = 3.15;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), std(0xffd23f, 0.5));
    tip.position.y = 3.6;
    g.add(pole, canopy, tip);
    g.rotation.z = 0.08;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    scene.add(g);
    umbrellas.push(g);
    blockers.push({ x: ux, z: uz, r: 0.2 });
    const [tx2, tz2] = polar(a, 4.6);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), new THREE.MeshStandardMaterial({ map: stripeTex(i ? '#4dd0ff' : '#ff7aa8', '#ffffff', 6), roughness: 1 }));
    towel.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2);
    towel.position.set(tx2, 0.026, tz2);
    towel.receiveShadow = true;
    scene.add(towel);
    const [cx2, cz2] = polar(a + 0.2, 7.5);
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), std(i ? 0xff7a3d : 0x3d86e8, 0.6));
    cooler.position.set(cx2, 0.25, cz2);
    cooler.rotation.y = -a;
    cooler.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.54), std(0xffffff, 0.5));
    lid.position.set(cx2, 0.54, cz2);
    lid.rotation.y = -a;
    scene.add(cooler, lid);
  });
  // istana pasir (kiri-depan)
  {
    const [cx, cz] = polar(Math.PI * 1.25, 7.4);
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const sand = std(0xe2b96a, 1);
    const sandD = std(0xc99a4c, 1);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 14), sand);
    base.position.y = 0.25;
    g.add(base);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.571 + 0.78;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 10), sandD);
      t.position.set(Math.cos(a) * 0.82, 0.7, Math.sin(a) * 0.82);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.34, 10), sand);
      cone.position.set(t.position.x, 1.27, t.position.z);
      g.add(t, cone);
    }
    const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.2, 12), sand);
    keep.position.y = 1.1;
    const kc = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 12), sandD);
    kc.position.y = 1.95;
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), std(0xffffff, 0.5));
    fp.position.y = 2.4;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0xff4d6d, side: THREE.DoubleSide }));
    fl.position.set(0.17, 2.52, 0);
    g.add(keep, kc, fp, fl);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null));
    scene.add(g);
    blockers.push({ x: cx, z: cz, r: 1.05 });
  }
  // papan selancar + handuk + kotak (kanan-depan)
  {
    const a = Math.PI * 0.75;
    const [bx, bz] = polar(a, 7.4);
    for (const [off, c, tilt] of [
      [-0.35, 0xff4d6d, 0.28],
      [0.35, 0x2ec4ff, -0.2],
    ] as [number, number, number][]) {
      const [ox, oz] = polar(a + Math.PI / 2, off);
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), std(c, 0.45));
      b.scale.set(0.22, 1.35, 0.05);
      b.position.set(bx + ox, 1.2, bz + oz);
      b.rotation.set(tilt, a + Math.PI / 2, 0.06);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), std(0xffffff, 0.5));
      st.position.copy(b.position);
      st.rotation.copy(b.rotation);
      b.castShadow = true;
      scene.add(b, st);
    }
    blockers.push({ x: bx, z: bz, r: 0.7 });
    const [tx3, tz3] = polar(a - 0.12, 5.7);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.1), new THREE.MeshStandardMaterial({ map: stripeTex('#ffd23f', '#ffffff', 6), roughness: 1 }));
    towel.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2);
    towel.position.set(tx3, 0.026, tz3);
    scene.add(towel);
  }

  // kepiting lucu berjalan menyamping
  const crabs: { g: THREE.Group; ang: number; dir: number; sp: number; r: number; claws: THREE.Mesh[]; t: number; ph: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const red = std(0xea4a3c, 0.6);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), red);
    body.scale.set(1.3, 0.62, 1);
    body.position.y = 0.16;
    g.add(body);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(s * 0.1, 0.34, 0.14);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5), red);
      stalk.position.set(s * 0.1, 0.27, 0.14);
      g.add(stalk, eye);
    }
    const claws: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), red);
      claw.scale.set(1, 0.7, 1.2);
      claw.position.set(s * 0.32, 0.2, 0.2);
      g.add(claw);
      claws.push(claw);
      for (let l = 0; l < 3; l++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), red);
        leg.rotation.z = s * 1.2;
        leg.position.set(s * 0.26, 0.1, -0.08 + l * 0.08);
        g.add(leg);
      }
    }
    g.scale.setScalar(1.25);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    scene.add(g);
    crabs.push({ g, ang: (i / 4) * TAU + 0.4, dir: i % 2 ? -1 : 1, sp: 0.1 + rand() * 0.1, r: 8.3 + (i % 2) * 0.6, claws, t: rand() * 3, ph: rand() * 6 });
  }

  // ---------- pelampung & ban renang ----------
  const buoys: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, TAU, 0, Math.PI / 2), std(0xff4d4d, 0.5));
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, TAU, Math.PI / 2, Math.PI / 2), std(0xffffff, 0.5));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), std(0x444444));
    pole.position.y = 0.8;
    g.add(b1, b2, pole);
    const a = (i / 8) * TAU + 0.2;
    const r = 22 + (i % 2) * 6;
    g.position.set(Math.cos(a) * r, WATER_Y, Math.sin(a) * r);
    scene.add(g);
    buoys.push(g);
  }
  const rings: THREE.Mesh[] = [];
  const ringTex = stripeTex('#ff7aa8', '#ffffff', 8);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.28, 10, 24), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.5 }));
    const a = (i / 4) * TAU + 0.9;
    const r = 15.5 + (i % 2) * 3;
    t.rotation.x = Math.PI / 2;
    t.position.set(Math.cos(a) * r, WATER_Y + 0.15, Math.sin(a) * r);
    t.castShadow = true;
    scene.add(t);
    rings.push(t);
  }

  // ---------- kilau matahari di air ----------
  {
    const n = 360;
    const geo = new THREE.BufferGeometry();
    const pp = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const r = SHORE + 2 + rand() * 46;
      pp[i * 3] = Math.cos(a) * r;
      pp[i * 3 + 1] = WATER_Y + 0.2;
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
          float tw = pow(max(sin(uTime * 1.7 + aPhase * 6.2831), 0.0), 4.0);
          vA = tw;
          gl_PointSize = (0.2 + tw) * 5.0 * 95.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float cr = max(smoothstep(0.06, 0.0, abs(c.x)), smoothstep(0.06, 0.0, abs(c.y))) * smoothstep(0.5, 0.1, d);
          float a = (smoothstep(0.5, 0.0, d) * 0.6 + cr) * vA; gl_FragColor = vec4(1.0, 1.0, 0.92, a); }`,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    scene.add(pts);
  }

  // ---------- bayangan ikan berenang ----------
  const fishShadows: { m: THREE.Group; r: number; sp: number; ph: number }[] = [];
  {
    const fMat2 = new THREE.MeshBasicMaterial({ color: 0x0b5a7a, transparent: true, opacity: 0.28, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fMat2);
      body.scale.set(0.7, 0.08, 0.26);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), fMat2);
      tail.rotation.set(0, 0, Math.PI / 2);
      tail.position.x = -0.85;
      tail.scale.set(1, 1, 0.12);
      g.add(body, tail);
      g.scale.setScalar(0.7 + rand() * 1.0);
      g.position.y = WATER_Y - 0.6 - rand() * 0.5;
      scene.add(g);
      fishShadows.push({ m: g, r: 15 + rand() * 26, sp: (0.04 + rand() * 0.1) * (rand() < 0.5 ? -1 : 1), ph: rand() * TAU });
    }
  }

  // ---------- pulau tropis jauh, mercusuar, perahu layar ----------
  const smallPalm = (parent: THREE.Object3D, x: number, y: number, z: number, s: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 3.2 * s, 6), trunkMat);
    t.position.set(x, y + 1.6 * s, z);
    t.rotation.z = 0.14;
    parent.add(t);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 2.5 * s, 4), std(0x39b34a));
      const a = (k / 6) * TAU;
      leaf.position.set(x + Math.cos(a) * 0.9 * s + 0.45 * s, y + 3.3 * s, z + Math.sin(a) * 0.9 * s);
      leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      parent.add(leaf);
    }
  };
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rand() * 0.4;
    const r = 105 + rand() * 90;
    const s = 5 + rand() * 6;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, WATER_Y, Math.sin(a) * r);
    const sandM = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.1, s * 1.7, 1.8, 20), std(0xf3dfa0, 1));
    sandM.position.y = -0.2;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s * 0.9, 18, 10, 0, TAU, 0, Math.PI / 2), std(0x57c86a, 1));
    hill.scale.y = 0.75;
    hill.position.y = 0.6;
    g.add(sandM, hill);
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) smallPalm(g, (rand() - 0.5) * s, 1.6, (rand() - 0.5) * s, 1.2 + rand() * 0.6);
    scene.add(g);
  }
  {
    const g = new THREE.Group();
    g.position.set(-92, WATER_Y, -118);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(9, 0), std(0x8f98a8, 1));
    rock.scale.set(1.3, 0.75, 1.1);
    rock.position.y = 1;
    g.add(rock);
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - k * 0.25, 2.5 - k * 0.25, 4.2, 14), std(k % 2 ? 0xe5484d : 0xffffff, 0.6));
      seg.position.y = 6.4 + k * 4.2;
      g.add(seg);
    }
    const gal = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.5, 14), std(0x333b4a, 0.7));
    gal.position.y = 23.5;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
    lamp.position.y = 24.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 12), std(0xe5484d, 0.6));
    roof.position.y = 26.9;
    g.add(gal, lamp, roof);
    scene.add(g);
  }
  const boats: { g: THREE.Group; a: number; sp: number; r: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 4.6), std(i % 2 ? 0xe5484d : 0x3d86e8, 0.6));
    hull.position.y = 0.2;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), std(i % 2 ? 0xe5484d : 0x3d86e8, 0.6));
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0.2, 3.0);
    bow.scale.set(1, 1, 0.45);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 6.4, 6), std(0xf4f4f4, 0.5));
    mast.position.y = 3.6;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0, 5.4);
    sh.lineTo(2.6, 0.4);
    sh.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 }));
    sail.rotation.y = Math.PI / 2;
    sail.position.set(0.05, 1.0, 0);
    const sh2 = new THREE.Shape();
    sh2.moveTo(0, 0);
    sh2.lineTo(0, 4.4);
    sh2.lineTo(-1.9, 0.4);
    sh2.closePath();
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(sh2), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffe14d : 0xffa8c0, side: THREE.DoubleSide, roughness: 0.7 }));
    jib.rotation.y = Math.PI / 2;
    jib.position.set(0.05, 1.0, 0);
    g.add(hull, bow, mast, sail, jib);
    g.scale.setScalar(2.2);
    scene.add(g);
    boats.push({ g, a: rand() * TAU, sp: (0.006 + rand() * 0.006) * (i % 2 ? -1 : 1), r: 62 + i * 24 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + rand() * 0.2;
    const r = 330 + rand() * 60;
    const h = 40 + rand() * 60;
    const m = new THREE.Mesh(new THREE.ConeGeometry(50 + rand() * 40, h, 7), std(i % 2 ? 0x7fcfa0 : 0x8fcbe8, 1));
    m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    scene.add(m);
  }

  // ---------- camar ----------
  const gulls: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; r: number; sp: number; ph: number; h: number }[] = [];
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
    for (let i = 0; i < 8; i++) {
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
      g.scale.setScalar(2.2);
      scene.add(g);
      gulls.push({ g, wl, wr, r: 24 + rand() * 50, sp: (0.07 + rand() * 0.06) * (i % 3 === 0 ? -1 : 1), ph: rand() * TAU, h: 14 + rand() * 18 });
    }
  }

  // ---------- awan ----------
  const clouds = new THREE.Group();
  {
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, fog: false });
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(5 + rand() * 5, 10, 8), cMat);
        s.position.set(k * 6 - n * 3, rand() * 2.5, rand() * 4);
        s.scale.y = 0.55;
        g.add(s);
      }
      const a = rand() * TAU;
      const r = 110 + rand() * 260;
      g.position.set(Math.cos(a) * r, 50 + rand() * 60, Math.sin(a) * r);
      g.rotation.y = -a;
      clouds.add(g);
    }
    scene.add(clouds);
  }

  // ---------- dekorasi hidup: lentera apung, ikan melompat, bayangan camar, perahu, kupu-kupu ----------
  const lanterns: { g: THREE.Group; a0: number; r: number; sp: number; glow: THREE.Sprite; ph: number }[] = [];
  {
    const glowT = glowTex();
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const paper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.3, 0.42, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xffc872, emissiveIntensity: 1.1, roughness: 0.6 }),
      );
      paper.position.y = 0.21;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 8), std(0xd9a25a, 0.7));
      roof.position.y = 0.5;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.08, 8), std(0x8a5a2a, 0.8));
      base.position.y = 0.02;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, fog: false, color: 0xffcf8a }));
      sp.scale.set(1.4, 1.4, 1);
      sp.position.y = 0.24;
      g.add(paper, roof, base, sp);
      scene.add(g);
      lanterns.push({ g, a0: (i / 7) * TAU + 0.5, r: 13 + (i % 3) * 2.4, sp: 0.02 + (i % 2) * 0.012, glow: sp, ph: rand() * 6 });
    }
  }
  const jumpers: {
    g: THREE.Group;
    cd: number;
    t: number;
    dur: number;
    active: boolean;
    from: THREE.Vector3;
    to: THREE.Vector3;
    ring: THREE.Mesh;
    ringMat: THREE.MeshBasicMaterial;
  }[] = [];
  {
    const silver = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, roughness: 0.3, metalness: 0.4 });
    const ringGeo = new THREE.RingGeometry(0.55, 0.85, 24);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), silver);
      body.scale.set(0.14, 0.1, 0.38);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 3), silver);
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.45;
      tail.scale.set(1, 1, 0.3);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 3), silver);
      fin.position.y = 0.16;
      fin.rotation.x = -0.5;
      g.add(body, tail, fin);
      g.scale.setScalar(2.0);
      g.visible = false;
      scene.add(g);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.visible = false;
      scene.add(ring);
      jumpers.push({ g, cd: 1.5 + i * 2.4, t: 0, dur: 0.9, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), ring, ringMat });
    }
  }
  // bayangan camar melintas di pasir
  const shadows2: { m: THREE.Mesh; r: number; sp: number; ph: number }[] = [];
  {
    const sc2 = cv(128, 64);
    sc2.g.fillStyle = 'rgba(60,50,30,0.55)';
    sc2.g.beginPath();
    sc2.g.moveTo(10, 40);
    sc2.g.quadraticCurveTo(40, 12, 64, 34);
    sc2.g.quadraticCurveTo(88, 12, 118, 40);
    sc2.g.quadraticCurveTo(88, 30, 64, 46);
    sc2.g.quadraticCurveTo(40, 30, 10, 40);
    sc2.g.fill();
    const st = toTex(sc2.c);
    const sm = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.16, depthWrite: false, color: 0x2b3a1f });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), sm);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.045;
      scene.add(m);
      shadows2.push({ m, r: 4 + i * 1.6, sp: 0.12 + i * 0.03, ph: i * 2.1 });
    }
  }
  // kupu-kupu
  const bflies: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; cx: number; cz: number; rx: number; rz: number; sp: number; ph: number; h: number }[] = [];
  {
    const bc = [0xffd23f, 0xff7aa8, 0xffffff, 0x7ad0ff, 0xff8a3d];
    const wingGeo = new THREE.CircleGeometry(0.34, 10);
    wingGeo.scale(0.8, 1, 1);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const wing = (sg: number) => {
        const p = new THREE.Group();
        const m = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color: bc[i % bc.length], side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.position.x = sg * 0.26;
        p.add(m);
        g.add(p);
        return p;
      };
      const wl = wing(1);
      const wr = wing(-1);
      const bd = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), std(0x3a2f22, 0.7));
      bd.scale.set(0.6, 0.6, 3);
      g.add(bd);
      g.scale.setScalar(1.1);
      scene.add(g);
      const pa = i * 1.3;
      bflies.push({ g, wl, wr, cx: Math.cos(pa) * 6 + 2, cz: Math.sin(pa) * 5 - 1, rx: 2 + rand() * 2.5, rz: 2 + rand() * 2.5, sp: 0.4 + rand() * 0.35, ph: rand() * TAU, h: 1.4 + rand() * 1.8 });
    }
  }

  return {
    spots,
    pads,
    blockers,
    update(t: number) {
      uTime.value = t;
      for (let i = 0; i < wPos.count; i++) {
        const x = wBase[i * 2];
        const z = wBase[i * 2 + 1];
        wPos.setY(i, WATER_Y + (Math.sin(x * 0.35 + t * 1.3) * 0.07 + Math.sin(z * 0.42 + t * 1.0) * 0.07) * wFade[i]);
      }
      wPos.needsUpdate = true;
      clouds.rotation.y = t * 0.006;
      palms.forEach((p) => {
        p.fronds.rotation.z = Math.sin(t * 1.3 + p.ph) * 0.04;
        p.fronds.rotation.x = Math.sin(t * 1.1 + p.ph * 1.7) * 0.035;
      });
      flags.forEach((f) => {
        f.m.rotation.x = Math.sin(t * 3.1 + f.ph) * 0.2;
        f.m.rotation.z = Math.sin(t * 2.3 + f.ph * 1.3) * 0.08;
      });
      umbrellas.forEach((u, i) => (u.rotation.x = Math.sin(t * 1.6 + i * 2) * 0.012));
      for (const c of crabs) {
        c.t -= 1 / 60;
        if (c.t <= 0) {
          c.t = 1.5 + Math.random() * 3.5;
          c.dir = Math.random() < 0.4 ? -c.dir : c.dir;
          c.sp = Math.random() < 0.35 ? 0 : 0.1 + Math.random() * 0.14;
        }
        c.ang += c.dir * c.sp * (1 / 60);
        c.g.position.set(Math.cos(c.ang) * c.r, 0.02 + Math.abs(Math.sin(t * 14 + c.ph)) * 0.015 * (c.sp > 0 ? 1 : 0), Math.sin(c.ang) * c.r);
        c.g.rotation.y = Math.atan2(Math.cos(c.ang), Math.sin(c.ang)) + Math.PI;
        c.claws.forEach((cl, k) => (cl.position.y = 0.2 + Math.sin(t * 6 + c.ph + k * 3) * 0.05));
      }
      buoys.forEach((b, i) => {
        b.position.y = waterHeight(b.position.x, b.position.z, t) + Math.sin(t * 1.7 + i) * 0.04;
        b.rotation.z = Math.sin(t * 1.3 + i) * 0.12;
      });
      rings.forEach((r, i) => {
        r.position.y = waterHeight(r.position.x, r.position.z, t) + 0.18 + Math.sin(t * 1.4 + i) * 0.03;
        r.rotation.z = Math.sin(t * 1.1 + i) * 0.1;
      });
      lanterns.forEach((l) => {
        const a = l.a0 + t * l.sp;
        const x = Math.cos(a) * l.r;
        const z = Math.sin(a) * l.r;
        l.g.position.set(x, waterHeight(x, z, t) + 0.22 + Math.sin(t * 1.4 + l.ph) * 0.05, z);
        l.g.rotation.z = Math.sin(t * 1.1 + l.ph) * 0.1;
        l.glow.material.opacity = 0.32 + 0.16 * Math.sin(t * 2.3 + l.ph);
      });
      jumpers.forEach((j) => {
        if (!j.active) {
          j.cd -= 1 / 60;
          if (j.cd <= 0) {
            const a = Math.random() * TAU;
            const r = 12 + Math.random() * 10;
            j.from.set(Math.cos(a) * r, waterHeight(Math.cos(a) * r, Math.sin(a) * r, t), Math.sin(a) * r);
            const dir = Math.random() * TAU;
            j.to.set(j.from.x + Math.cos(dir) * (2 + Math.random() * 2.5), j.from.y, j.from.z + Math.sin(dir) * (2 + Math.random() * 2.5));
            j.t = 0;
            j.dur = 0.85 + Math.random() * 0.4;
            j.active = true;
            j.g.visible = true;
            j.ring.position.set(j.from.x, j.from.y + 0.05, j.from.z);
            j.ring.visible = true;
            j.ringMat.opacity = 0.8;
            j.ring.scale.setScalar(0.4);
          }
          return;
        }
        j.t += 1 / 60 / j.dur;
        const u = Math.min(1, j.t);
        j.g.position.lerpVectors(j.from, j.to, u);
        j.g.position.y += Math.sin(Math.PI * u) * 3.2;
        j.g.rotation.x = -Math.cos(Math.PI * u) * 1.15;
        j.g.rotation.y = Math.atan2(j.to.x - j.from.x, j.to.z - j.from.z);
        j.ring.scale.setScalar(0.4 + u * 1.6);
        j.ringMat.opacity = 0.8 * (1 - u);
        if (u >= 1) {
          j.active = false;
          j.g.visible = false;
          j.ring.visible = false;
          j.cd = 2.5 + Math.random() * 5;
        }
      });
      shadows2.forEach((sh) => {
        const a = sh.ph + t * sh.sp;
        sh.m.position.set(Math.cos(a) * sh.r, 0.045, Math.sin(a) * sh.r * 0.8 + 0.5);
        sh.m.rotation.z = -a + Math.PI / 2;
        (sh.m.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.05 * Math.sin(t * 0.8 + sh.ph);
      });
      bflies.forEach((b) => {
        const a1 = t * b.sp + b.ph;
        const a2 = a1 * 1.3;
        const x = b.cx + Math.cos(a1) * b.rx;
        const z = b.cz + Math.sin(a2) * b.rz;
        b.g.position.set(x, b.h + Math.sin(t * 1.7 + b.ph) * 0.35, z);
        b.g.rotation.y = Math.atan2(-Math.sin(a1) * b.rx, Math.cos(a2) * b.rz);
        const f = 0.3 + (0.5 + 0.5 * Math.sin(t * 20 + b.ph)) * 0.9;
        b.wl.rotation.z = f;
        b.wr.rotation.z = -f;
      });
      for (const f of fishShadows) {
        const a = f.ph + t * f.sp;
        f.m.position.x = Math.cos(a) * f.r;
        f.m.position.z = Math.sin(a) * f.r;
        const s = Math.sign(f.sp);
        f.m.rotation.y = Math.atan2(-s * Math.cos(a), -s * Math.sin(a));
      }
      for (const b of boats) {
        const a = b.a + t * b.sp;
        b.g.position.set(Math.cos(a) * b.r, waterHeight(0, 0, t) + 0.1 + Math.sin(t * 0.9 + b.r) * 0.12, Math.sin(a) * b.r);
        const sg = Math.sign(b.sp);
        b.g.rotation.y = Math.atan2(-Math.sin(a) * sg, Math.cos(a) * sg);
        b.g.rotation.z = Math.sin(t * 0.8 + b.r) * 0.06;
      }
      for (const g of gulls) {
        const a = g.ph + t * g.sp;
        g.g.position.set(Math.cos(a) * g.r, g.h + Math.sin(t * 0.5 + g.ph) * 1.5, Math.sin(a) * g.r);
        const sg = Math.sign(g.sp);
        g.g.rotation.y = Math.atan2(-Math.sin(a) * sg, Math.cos(a) * sg);
        const fl = Math.sin(t * 5.5 + g.ph * 4) * 0.55;
        g.wl.rotation.z = fl;
        g.wr.rotation.z = -fl;
        g.g.rotation.z = -sg * 0.18;
      }
    },
  };
}
