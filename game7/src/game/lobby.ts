import * as THREE from 'three';
import { ANIMALS, buildAnimal, Rig } from './animals';
import { PLAYER_COLORS } from './world';

const TAU = Math.PI * 2;
const BOTS = ['Mochi', 'Kimbap', 'Boba'];

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
const mat = (c: number, r = 0.9, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

function grassTex() {
  const rand = rng(4);
  const { c, g } = cv(512, 512);
  g.fillStyle = '#7fd35a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#78cc53' : '#88dd62';
    g.fillRect(0, (i * 512) / 8, 512, 512 / 8);
  }
  for (let i = 0; i < 4200; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    g.strokeStyle = rand() < 0.5 ? 'rgba(40,120,50,0.35)' : 'rgba(210,255,160,0.35)';
    g.lineWidth = 1 + rand();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 5, y - 4 - rand() * 7);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = ['#fff7b0', '#ffd5e8', '#ffffff', '#ffe28a'][i % 4];
    g.beginPath();
    g.arc(rand() * 512, rand() * 512, 2 + rand() * 2.4, 0, TAU);
    g.fill();
  }
  return toTex(c, 4, 4, true);
}
function plaqueTex(text: string, bg: string, fg: string) {
  const { c, g } = cv(256, 72);
  g.clearRect(0, 0, 256, 72);
  g.fillStyle = bg;
  const r = 30;
  g.beginPath();
  g.roundRect(6, 6, 244, 60, r);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = fg;
  g.font = '800 34px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 38);
  return toTex(c);
}

class CatActor {
  rig: Rig;
  ph = Math.random() * 6;
  hop = 2 + Math.random() * 5;
  hopT = -1;
  wave = 3 + Math.random() * 4;
  slot: number;
  constructor(rig: Rig, slot: number) {
    this.rig = rig;
    this.slot = slot;
  }
}

export class LobbyEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private t = 0;
  private ro: ResizeObserver;
  private actors: CatActor[] = [];
  private playerSlot = 1;
  private mouse = { x: 0, y: 0 };
  private playerAnimal: string;
  private petals!: THREE.Points;
  private fflies: { m: THREE.Mesh; a: number; r: number; y: number; sp: number }[] = [];
  private flags: { m: THREE.Mesh; ph: number }[] = [];
  private marker!: THREE.Group;

  constructor(container: HTMLElement, animalId: string) {
    this.container = container;
    this.playerAnimal = animalId;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;filter:saturate(1.12) contrast(1.03);';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
    const rand = rng(31);

    // ---------- langit sore di atas bukit ----------
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP;
          void main(){
            vec3 d = normalize(vP);
            float h = d.y;
            vec3 top = vec3(0.20, 0.48, 0.92);
            vec3 mid = vec3(0.62, 0.80, 1.00);
            vec3 low = vec3(1.00, 0.82, 0.62);
            vec3 c = mix(low, mid, smoothstep(-0.03, 0.3, h));
            c = mix(c, top, smoothstep(0.26, 0.95, h));
            float sun = max(dot(normalize(vP), normalize(vec3(-0.45, 0.12, -0.86))), 0.0);
            c += vec3(1.0, 0.72, 0.4) * pow(sun, 6.0) * 0.45 + vec3(1.0, 0.94, 0.72) * pow(sun, 90.0);
            c = mix(c, vec3(0.82, 0.93, 0.98), smoothstep(0.0, -0.4, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    sceneAdd(this.scene, sky);

    this.scene.add(new THREE.HemisphereLight(0xe2f3ff, 0x9fd07a, 1.45));
    const sun = new THREE.DirectionalLight(0xfff0c8, 2.7);
    sun.position.set(-7, 13, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 2;
    sc.far = 50;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
    fill.position.set(6, 8, -8);
    this.scene.add(fill);

    // ---------- bukit ----------
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 21, 7, 72), mat(0x6f8f4e, 1));
    hill.position.y = -3.5;
    hill.receiveShadow = true;
    this.scene.add(hill);
    const top = new THREE.Mesh(new THREE.CircleGeometry(11.7, 72), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1 }));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    this.scene.add(top);
    // lembah & air di bawah
    const water = new THREE.Mesh(new THREE.CircleGeometry(320, 56), new THREE.MeshStandardMaterial({ color: 0x4ec6e0, roughness: 0.25, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -9;
    this.scene.add(water);
    const shore = new THREE.Mesh(new THREE.CircleGeometry(230, 48), mat(0x8fcf6a, 1));
    shore.rotation.x = -Math.PI / 2;
    shore.position.y = -9.2;
    this.scene.add(shore);

    // ---------- pohon besar ----------
    const addTree = (x: number, z: number, s: number, dark = false) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.72 * s, 4.2 * s, 9), mat(0x8a5a34, 0.95));
      trunk.position.y = 2.1 * s;
      trunk.castShadow = true;
      g.add(trunk);
      for (const [bx, by, bz, br] of [
        [0, 5.1, 0, 2.5],
        [1.7, 4.4, 0.5, 1.8],
        [-1.6, 4.6, -0.4, 1.9],
        [0.4, 6.5, -0.3, 1.7],
      ] as [number, number, number, number][]) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(br * s, 1), mat(dark ? 0x3d9a4a : 0x5cc45c, 0.95));
        b.position.set(bx * s, by * s, bz * s);
        b.castShadow = true;
        b.receiveShadow = true;
        g.add(b);
      }
      g.position.set(x, 0, z);
      this.scene.add(g);
      return g;
    };
    addTree(-8.4, -2.2, 1.15);
    addTree(8.8, -3.4, 0.9, true);
    addTree(-6.6, -7.6, 0.75, true);

    // ---------- pagar, bendera, batu, bunga ----------
    const dm = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * 0.08 + (i / 25) * Math.PI * 0.84;
      const x = Math.cos(a) * 9.6;
      const z = -Math.sin(a) * 9.6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.15, 6), mat(0xd8b98c, 0.9));
      post.position.set(x, 0.55, z);
      post.castShadow = true;
      this.scene.add(post);
      if (i % 2 === 0) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.07), mat(0xe7cfa4, 0.9));
        rail.position.set(Math.cos(a + 0.06) * 9.6, 0.72, -Math.sin(a + 0.06) * 9.6);
        rail.rotation.y = -a;
        this.scene.add(rail);
      }
    }
    {
      const A = new THREE.Vector3(-6.2, 4.9, -2.4);
      const B = new THREE.Vector3(6.4, 4.9, -2.6);
      const N = 20;
      for (let i = 1; i < N; i++) {
        const u = i / N;
        const p = new THREE.Vector3().lerpVectors(A, B, u);
        p.y -= Math.sin(u * Math.PI) * 1.2;
        const sh = new THREE.Shape();
        sh.moveTo(-0.22, 0);
        sh.lineTo(0.22, 0);
        sh.lineTo(0, -0.62);
        sh.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: [0xff6b8a, 0xffd23f, 0x5fd0ff, 0x9cf06a, 0xffffff][i % 5], side: THREE.DoubleSide }));
        m.position.copy(p);
        this.scene.add(m);
        this.flags.push({ m, ph: i * 0.5 });
      }
    }
    // batu & bunga
    for (let i = 0; i < 14; i++) {
      const a = rand() * TAU;
      const r = 5.5 + rand() * 5;
      if (Math.abs(Math.cos(a) * r) < 3.4 && Math.sin(a) * r > -1) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.23 + rand() * 0.3, 0), mat(0xa9b3b8, 0.95));
      rock.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rock.castShadow = true;
      this.scene.add(rock);
    }
    const flowerG = new THREE.SphereGeometry(0.12, 6, 5);
    const flower = new THREE.InstancedMesh(flowerG, mat(0xffffff, 0.7), 220);
    const fcols = [0xff8fb0, 0xffe066, 0xffffff, 0xc3a6ff, 0xffa45c, 0x8fe0ff];
    for (let i = 0; i < 220; i++) {
      const a = rand() * TAU;
      const r = 1.6 + rand() * 9.2;
      dm.position.set(Math.cos(a) * r, 0.22, Math.sin(a) * r);
      dm.rotation.set(0, 0, 0);
      dm.scale.setScalar(0.7 + rand() * 0.9);
      dm.updateMatrix();
      flower.setMatrixAt(i, dm.matrix);
      flower.setColorAt(i, col.setHex(fcols[i % fcols.length]));
    }
    this.scene.add(flower);
    // rumput tinggi
    const tuftG = new THREE.ConeGeometry(0.06, 0.5, 4);
    tuftG.translate(0, 0.25, 0);
    const tufts = new THREE.InstancedMesh(tuftG, mat(0x4fae46, 0.95), 320);
    for (let i = 0; i < 320; i++) {
      const a = rand() * TAU;
      const r = 3 + rand() * 8.6;
      dm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      dm.rotation.set((rand() - 0.5) * 0.2, rand() * 6, (rand() - 0.5) * 0.2);
      dm.scale.set(1, 0.7 + rand() * 0.8, 1);
      dm.updateMatrix();
      tufts.setMatrixAt(i, dm.matrix);
      tufts.setColorAt(i, col.setHSL(0.28 + rand() * 0.06, 0.6, 0.35 + rand() * 0.12));
    }
    this.scene.add(tufts);

    // ---------- pegunungan & awan ----------
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rand() * 0.15;
      const r = 130 + rand() * 90;
      const h = 26 + rand() * 46;
      const m = new THREE.Mesh(new THREE.ConeGeometry(28 + rand() * 26, h, 6), mat(i % 2 ? 0x8fb6d8 : 0xa9c8de, 1));
      m.position.set(Math.cos(a) * r, h / 2 - 10, Math.sin(a) * r);
      this.scene.add(m);
    }
    const cloudG = new THREE.SphereGeometry(1, 10, 8);
    const cMat = new THREE.MeshStandardMaterial({ color: 0xfff6ee, roughness: 1, emissive: 0x5a3a20, emissiveIntensity: 0.06 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const rr = 3.5 + rand() * 4;
        const m = new THREE.Mesh(cloudG, cMat);
        m.scale.set(rr, rr * 0.55, rr);
        m.position.set(k * 4.6 - n * 2.3, rand() * 1.6, rand() * 2.5);
        g.add(m);
      }
      const a = rand() * TAU;
      const r = 70 + rand() * 120;
      g.position.set(Math.cos(a) * r, 24 + rand() * 26, Math.sin(a) * r);
      this.scene.add(g);
    }

    // ---------- penanda "KAMU" ----------
    this.marker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    cone.rotation.x = Math.PI;
    cone.position.y = 0.25;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    arrow.rotation.x = Math.PI;
    this.marker.add(cone, arrow);
    this.scene.add(this.marker);

    // ---------- kucing berjejer ----------
    this.buildActors();

    // ---------- kelopak & kupu-kupu ----------
    const np = 260;
    const pg = new THREE.BufferGeometry();
    const pp = new Float32Array(np * 3);
    const ps = new Float32Array(np);
    for (let i = 0; i < np; i++) {
      pp[i * 3] = (rand() - 0.5) * 22;
      pp[i * 3 + 1] = rand() * 9;
      pp[i * 3 + 2] = (rand() - 0.5) * 16;
      ps[i] = rand();
    }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(ps, 1));
    const pm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime * (0.35 + aSeed * 0.4), 9.0);
          p.x += sin(uTime * 0.6 + aSeed * 12.0) * 0.6;
          p.z += cos(uTime * 0.45 + aSeed * 9.0) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.5 + 0.5 * aSeed;
          gl_PointSize = (2.2 + aSeed * 3.2) * 26.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c * vec2(1.0, 1.7)); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(1.0, 0.86, 0.62, a * vA * 0.9); }`,
    });
    this.petals = new THREE.Points(pg, pm);
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
    const wingG = new THREE.CircleGeometry(0.16, 8);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(wingG, new THREE.MeshBasicMaterial({ color: [0xffe066, 0xff9ec4, 0xbfe6ff][i % 3], side: THREE.DoubleSide }));
      m.position.y = 1.2 + rand() * 1.4;
      this.scene.add(m);
      this.fflies.push({ m, a: rand() * TAU, r: 3.2 + rand() * 5.4, y: 1.2 + rand() * 2.2, sp: 0.35 + rand() * 0.35 });
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    window.addEventListener('pointermove', this.onPointer);
    this.updateMarker();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mm) => mm?.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private onPointer = (e: PointerEvent) => {
    this.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };

  private resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildActors() {
    for (const a of this.actors) this.scene.remove(a.rig.root);
    this.actors = [];
    const others = ANIMALS.filter((a) => a.id !== this.playerAnimal).sort(() => Math.random() - 0.5);
    const defs = [others[0], ANIMALS.find((a) => a.id === this.playerAnimal) ?? ANIMALS[0], others[1], others[2]];
    const xs = [-3.25, -1.1, 1.1, 3.25];
    defs.forEach((d, i) => {
      const rig = buildAnimal(d, parseInt(PLAYER_COLORS[i].slice(1), 16));
      rig.rodRoot.visible = false;
      rig.root.position.set(xs[i], 0, -0.15);
      rig.root.scale.setScalar(0.92);
      rig.root.rotation.y = 0;
      rig.ring.visible = false;
      this.scene.add(rig.root);
      // piring nama
      const tex = plaqueTex(i === this.playerSlot ? 'KAMU' : BOTS[i > this.playerSlot ? i - 1 : i], i === this.playerSlot ? '#ffb02e' : 'rgba(30,45,70,0.72)', '#ffffff');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.scale.set(1.25, 0.35, 1);
      sprite.position.set(0, 3.5, 0);
      rig.root.add(sprite);
      // cincin warna
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.02, 36), new THREE.MeshBasicMaterial({ color: i === this.playerSlot ? 0xffd23f : new THREE.Color(PLAYER_COLORS[i]), transparent: true, opacity: i === this.playerSlot ? 0.95 : 0.6, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      rig.root.add(ring);
      this.actors.push(new CatActor(rig, i));
    });
    this.updateMarker();
  }

  setPlayerAnimal(id: string) {
    if (id === this.playerAnimal) return;
    this.playerAnimal = id;
    this.buildActors();
  }

  private updateMarker() {
    if (!this.marker) return;
    const p = this.actors[this.playerSlot];
    if (!p) return;
    this.marker.position.set(p.rig.root.position.x, 3.55, p.rig.root.position.z + 0.35);
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const t = this.t;

    // kamera sinematik lembut + parallax mouse
    const sway = Math.sin(t * 0.16) * 0.55;
    const px = sway + this.mouse.x * 0.35;
    const aspect = Math.max(0.6, this.camera.aspect);
    const zoom = aspect < 1 ? 1.22 : 1;
    const camZ = 11.4 * zoom;
    this.camera.position.set(px * zoom, (4.0 + Math.sin(t * 0.5) * 0.05 - this.mouse.y * 0.12) * zoom, camZ);
    this.camera.lookAt(0, 2.05 + (zoom - 1) * 0.6, 0.2);
    this.camera.updateMatrixWorld();

    // kucing: napas, geleng, lambaian, lompat sesekali
    for (const a of this.actors) {
      const r = a.rig;
      const isPlayer = a.slot === this.playerSlot;
      const ph = a.ph + t;
      const breathe = 1 + Math.sin(ph * 2.2) * 0.014;
      r.tilt.scale.set(1 / breathe, breathe, 1 / breathe);
      r.head.rotation.y = Math.sin(ph * 0.7) * 0.16 + (isPlayer ? Math.sin(t * 0.4) * 0.18 : 0);
      r.head.rotation.z = Math.sin(ph * 0.9) * 0.05;
      r.head.rotation.x = Math.sin(ph * 1.1) * 0.04 + (isPlayer ? 0.02 : 0);
      r.tail.rotation.y = Math.sin(ph * 1.7) * 0.3;
      r.tilt.rotation.z = Math.sin(ph * 0.8) * 0.02;
      // lompat kecil
      a.hop -= dt;
      if (a.hop <= 0) {
        a.hop = 3.5 + Math.random() * 5;
        a.hopT = 0;
        if (a.slot !== this.playerSlot) a.wave = 1.5 + Math.random() * 3;
      }
      let y = 0;
      if (a.hopT >= 0) {
        a.hopT += dt / 0.55;
        const u = Math.min(1, a.hopT);
        y = Math.sin(Math.PI * u) * 0.55;
        r.tilt.rotation.z += Math.sin(u * TAU) * 0.12;
        if (u >= 1) a.hopT = -1;
      }
      // lambaian tangan (pemain & bot tertentu)
      a.wave -= dt;
      const waving = isPlayer ? true : a.wave > 0 && a.wave < 0.9;
      const waveK = waving ? Math.sin(t * 5.2 + a.slot) * 0.5 + 0.5 : 0;
      r.armR.rotation.x = waving ? -2.2 - waveK * 0.5 : Math.sin(ph * 2) * 0.05;
      r.armR.rotation.z = waving ? -0.9 - waveK * 0.5 : -0.95;
      r.armL.rotation.x = Math.sin(ph * 2 + 1) * 0.05;
      r.armL.rotation.z = 0.95;
      r.root.position.y = y;
      r.root.rotation.y = Math.sin(t * 0.3 + a.ph) * 0.06 * (isPlayer ? 1 : 0.6);
    }
    // penanda melayang
    const p = this.actors[this.playerSlot];
    if (p) {
      this.marker.position.y = 3.55 + Math.sin(t * 2.4) * 0.12;
      this.marker.rotation.y = t * 1.4;
      this.marker.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06);
    }
    // bendera berkibar
    for (const f of this.flags) {
      f.m.rotation.y = Math.sin(t * 2.2 + f.ph) * 0.35;
      f.m.rotation.z = Math.sin(t * 1.8 + f.ph) * 0.12;
    }
    // kelopak
    (this.petals.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    // kupu-kupu
    for (const f of this.fflies) {
      const a = f.a + t * f.sp;
      f.m.position.set(Math.cos(a) * f.r, f.y + Math.sin(t * 1.6 + f.a) * 0.3, Math.sin(a) * f.r - 1.4);
      f.m.rotation.set(t * 9 + f.a, a, Math.sin(t * 7) * 0.3);
    }

    this.renderer.render(this.scene, this.camera);
  };
}

function sceneAdd(scene: THREE.Scene, o: THREE.Object3D) {
  scene.add(o);
}
