import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import CatWorker from '../cat/worker?worker&inline';
import type { CatBuild } from '../cat/build';
import { SPECS, type CatSpec } from '../cat/specs';

export type ViewMode = 'both' | 'oyen' | 'siam';
export type CatId = 'oyen' | 'siam';

export interface StageStats { verts: number; tris: number }
export interface StageApi {
  exportGLB: (which: ViewMode) => Promise<void>;
  screenshot: () => void;
  resetCamera: () => void;
}

interface Props {
  view: ViewMode;
  autoRotate: boolean;
  breathing: boolean;
  onProgress: (p: number) => void;
  onReady: (stats: Record<CatId, StageStats>) => void;
  apiRef: React.MutableRefObject<StageApi | null>;
}

const MESH_RES: Record<CatId, number> = { oyen: 0.0105, siam: 0.0095 };

const LAYOUT: Record<ViewMode, Record<CatId, { x: number; ry: number; s: number }> & { box: [number, number, number, number] }> = {
  // box = minX, maxX, minY, maxY of what should be framed
  both: { oyen: { x: -0.8, ry: 0.2, s: 1 }, siam: { x: 0.8, ry: -0.2, s: 1 }, box: [-1.6, 1.5, -0.05, 2.62] },
  oyen: { oyen: { x: 0, ry: 0, s: 1 }, siam: { x: 2.8, ry: -0.3, s: 0 }, box: [-0.8, 0.8, -0.05, 2.62] },
  siam: { oyen: { x: -2.8, ry: 0.3, s: 0 }, siam: { x: 0, ry: 0, s: 1 }, box: [-0.68, 0.68, -0.05, 2.08] },
};

const BG_STOPS: [number, string][] = [[0, '#fcf3d6'], [0.45, '#f7e4ab'], [1, '#efcd7a']];

function radialTexture(inner: string, outer: string, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function taperedTube(points: Float32Array, radius: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i += 3) pts.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const TS = 48, RS = 6;
  const geo = new THREE.TubeGeometry(curve, TS, radius, RS, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    curve.getPointAt(i / TS, c);
    const u = i / TS;
    const k = (0.45 + 0.55 * Math.min(1, u * 6)) * (1 - 0.7 * Math.pow(u, 1.6));
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k);
    }
  }
  pos.needsUpdate = true;
  return geo;
}

interface CatObj {
  root: THREE.Group; // layout transform
  breathe: THREE.Group; // idle animation
  body: THREE.Mesh;
  decal: THREE.Mesh;
  whiskers: THREE.Mesh[];
  exportDecalMat: THREE.MeshStandardMaterial;
  stats: StageStats;
}

function makeCat(b: CatBuild, spec: CatSpec, maxAniso: number): CatObj {
  const root = new THREE.Group();
  root.name = spec.name;
  const breathe = new THREE.Group();
  root.add(breathe);

  // body
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(b.body.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(b.body.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(b.body.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(b.body.indices, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0,
    clearcoat: 0.28, clearcoatRoughness: 0.42,
    sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff3e2'),
  });
  const body = new THREE.Mesh(geo, mat);
  body.name = `${spec.name}_body`;
  body.castShadow = true;
  body.receiveShadow = true;
  breathe.add(body);

  // painted face decal (eyes, brows, nose, mouth)
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(b.decal.positions, 3));
  dgeo.setAttribute('normal', new THREE.BufferAttribute(b.decal.normals, 3));
  dgeo.setAttribute('uv', new THREE.BufferAttribute(b.decal.uvs, 2));
  dgeo.setIndex(new THREE.BufferAttribute(b.decal.indices, 1));
  const tex = new THREE.DataTexture(new Uint8Array(b.tex.rgba.buffer), b.tex.W, b.tex.H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  const mtex = new THREE.DataTexture(new Uint8Array(b.tex.mat.buffer), b.tex.W, b.tex.H, THREE.RGBAFormat);
  mtex.generateMipmaps = true;
  mtex.minFilter = THREE.LinearMipmapLinearFilter;
  mtex.magFilter = THREE.LinearFilter;
  mtex.needsUpdate = true;
  const dmat = new THREE.MeshPhysicalMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    roughness: 0.5, roughnessMap: mtex, metalness: 0,
    clearcoat: 0.8, clearcoatMap: mtex, clearcoatRoughness: 0.14,
  });
  const decal = new THREE.Mesh(dgeo, dmat);
  decal.name = `${spec.name}_face`;
  decal.renderOrder = 2;
  decal.receiveShadow = true;
  breathe.add(decal);
  const exportDecalMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.3, metalness: 0 });

  // 3D whiskers
  const wmat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.pal.whisker), roughness: 0.42, metalness: 0 });
  const whiskers = b.whiskers.map((w, i) => {
    const m = new THREE.Mesh(taperedTube(w, spec.face.whiskerR), wmat);
    m.name = `${spec.name}_whisker_${i}`;
    m.castShadow = true;
    breathe.add(m);
    return m;
  });

  // soft contact shadows
  const blob = radialTexture('rgba(70,45,10,0.55)', 'rgba(70,45,10,0)');
  const shMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false });
  const addBlob = (x: number, z: number, sx: number, sz: number, o: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat.clone());
    (p.material as THREE.MeshBasicMaterial).opacity = o;
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.003, z);
    p.scale.set(sx, sz, 1);
    p.renderOrder = 1;
    p.userData.contact = true;
    root.add(p);
  };
  const lx = spec.leg.x, fz = spec.foot.c[2];
  addBlob(0, 0.02, 1.5, 1.25, 0.55);
  addBlob(-lx, fz, 0.55, 0.75, 0.9);
  addBlob(lx, fz, 0.55, 0.75, 0.9);

  return {
    root, breathe, body, decal, whiskers, exportDecalMat,
    stats: { verts: b.body.positions.length / 3, tris: b.body.indices.length / 3 },
  };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function CatStage({ view, autoRotate, breathing, onProgress, onReady, apiRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const autoRef = useRef(autoRotate);
  const breathRef = useRef(breathing);
  const frameRef = useRef<((v: ViewMode, instant?: boolean) => void) | null>(null);
  const cbRef = useRef({ onProgress, onReady });
  cbRef.current = { onProgress, onReady };

  useEffect(() => {
    viewRef.current = view;
    frameRef.current?.(view);
  }, [view]);
  useEffect(() => { autoRef.current = autoRotate; }, [autoRotate]);
  useEffect(() => { breathRef.current = breathing; }, [breathing]);

  useEffect(() => {
    const host = hostRef.current!;
    let disposed = false;

    // ── renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.42;

    const camera = new THREE.PerspectiveCamera(30, host.clientWidth / host.clientHeight, 0.05, 80);
    camera.position.set(0, 1.9, 9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.2;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.target.set(0, 1.15, 0);
    controls.autoRotateSpeed = 1.4;

    // ── lights (soft studio, key from upper-left like the reference) ──
    scene.add(new THREE.HemisphereLight(0xfff5e3, 0xead6aa, 0.45));
    const key = new THREE.DirectionalLight(0xfff2df, 1.5);
    key.position.set(-3.4, 6.2, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -3.2; sc.right = 3.2; sc.top = 3.6; sc.bottom = -2.2; sc.near = 1; sc.far = 20;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.022;
    key.shadow.radius = 5;
    key.shadow.intensity = 0.72;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff7ee, 0.4);
    fill.position.set(4.6, 2.6, 3.6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(1.2, 4.2, -6.5);
    scene.add(rim);

    // ── white pedestal ──
    const R = 2.75, H = 1.8, bev = 0.07;
    const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 10; i++) {
      const a = (Math.PI / 2) * (i / 10);
      prof.push(new THREE.Vector2(R - bev + Math.sin(a) * bev, -bev + Math.cos(a) * bev));
    }
    prof.push(new THREE.Vector2(R, -H), new THREE.Vector2(0, -H));
    prof.reverse(); // bottom → wall (upwards) → top: faces point outwards
    const pedestal = new THREE.Mesh(
      new THREE.LatheGeometry(prof, 160),
      new THREE.MeshStandardMaterial({ color: 0xf4f2ef, roughness: 0.9, metalness: 0 }),
    );
    pedestal.position.set(0, 0, 0.35);
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    // ── cats (generated in background workers) ──
    const cats: Partial<Record<CatId, CatObj>> = {};
    const progress: Record<CatId, number> = { oyen: 0, siam: 0 };
    const workers: Worker[] = [];
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const placeInstant = (id: CatId) => {
      const c = cats[id];
      if (!c) return;
      const L = LAYOUT[viewRef.current][id];
      c.root.position.set(L.x, 0, 0);
      c.root.rotation.y = L.ry;
      c.root.scale.setScalar(0.0001); // pops in (animated in the loop)
      c.root.visible = false;
    };

    (['oyen', 'siam'] as CatId[]).forEach((id) => {
      const w = new CatWorker();
      workers.push(w);
      w.onmessage = (e: MessageEvent) => {
        if (disposed) return;
        const msg = e.data;
        if (msg.type === 'progress') {
          progress[id] = msg.p;
          cbRef.current.onProgress((progress.oyen + progress.siam) / 2);
        } else if (msg.type === 'done') {
          const obj = makeCat(msg.build as CatBuild, SPECS[id], maxAniso);
          cats[id] = obj;
          scene.add(obj.root);
          placeInstant(id);
          w.terminate();
          if (cats.oyen && cats.siam) {
            cbRef.current.onReady({ oyen: cats.oyen.stats, siam: cats.siam.stats });
          }
        }
      };
      w.postMessage({ id, h: MESH_RES[id] });
    });

    // ── camera framing ──
    let camTween: { t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
    const computeFrame = (v: ViewMode) => {
      const [x0, x1, y0, y1] = LAYOUT[v].box;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const halfW = ((x1 - x0) / 2) * 1.1, halfH = ((y1 - y0) / 2) * 1.24;
      const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const aspect = camera.aspect;
      const dist = Math.max(halfH / tv, halfW / (tv * aspect)) + 0.45;
      const elev = THREE.MathUtils.degToRad(7.5);
      // keep the figures a little above centre so the control bar never covers the feet
      const target = new THREE.Vector3(cx, cy - 0.065 * 2 * dist * tv, 0);
      const pos = new THREE.Vector3(cx, target.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
      return { target, pos };
    };
    const frame = (v: ViewMode, instant = false) => {
      const f = computeFrame(v);
      if (instant) {
        controls.target.copy(f.target);
        camera.position.copy(f.pos);
        camTween = null;
      } else {
        camTween = { t: 0, fromT: controls.target.clone(), toT: f.target, fromP: camera.position.clone(), toP: f.pos };
      }
    };
    frameRef.current = frame;
    frame(viewRef.current, true);
    controls.addEventListener('start', () => { camTween = null; });

    // ── resize ──
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    // ── loop ──
    const timer = new THREE.Timer();
    timer.connect(document);
    const ONE = new THREE.Vector3(1, 1, 1);
    let raf = 0;
    const tick = (ts?: number) => {
      raf = requestAnimationFrame(tick);
      timer.update(ts);
      const dt = Math.min(timer.getDelta(), 0.05);
      const time = timer.getElapsed();
      const k = 1 - Math.pow(0.0015, dt);
      (['oyen', 'siam'] as CatId[]).forEach((id, n) => {
        const c = cats[id];
        if (!c) return;
        const L = LAYOUT[viewRef.current][id];
        c.root.position.x += (L.x - c.root.position.x) * k;
        c.root.rotation.y += (L.ry - c.root.rotation.y) * k;
        const s = c.root.scale.x + (L.s - c.root.scale.x) * k;
        c.root.scale.setScalar(Math.max(s, 0.0001));
        c.root.visible = s > 0.002;
        if (breathRef.current) {
          const b = Math.sin(time * 2.1 + n * 1.7);
          c.breathe.scale.set(1 - b * 0.004, 1 + b * 0.007, 1 - b * 0.004);
        } else {
          c.breathe.scale.lerp(ONE, k);
        }
      });
      if (camTween) {
        camTween.t = Math.min(1, camTween.t + dt / 0.9);
        const e = 1 - Math.pow(1 - camTween.t, 3);
        controls.target.lerpVectors(camTween.fromT, camTween.toT, e);
        camera.position.lerpVectors(camTween.fromP, camTween.toP, e);
        if (camTween.t >= 1) camTween = null;
      }
      controls.autoRotate = autoRef.current && !camTween;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    // ── public api ──
    apiRef.current = {
      resetCamera: () => frame(viewRef.current),
      screenshot: () => {
        renderer.render(scene, camera);
        const src = renderer.domElement;
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        const g = c.getContext('2d')!;
        const grd = g.createRadialGradient(c.width * 0.5, c.height * 0.38, 0, c.width * 0.5, c.height * 0.38, Math.max(c.width, c.height) * 0.75);
        BG_STOPS.forEach(([o, col]) => grd.addColorStop(o, col));
        g.fillStyle = grd;
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(src, 0, 0);
        c.toBlob((b) => b && download(b, `oyen-siam-${viewRef.current}.png`), 'image/png');
      },
      exportGLB: (which: ViewMode) =>
        new Promise<void>((resolve, reject) => {
          const group = new THREE.Group();
          group.name = which === 'both' ? 'Oyen_and_Siam' : SPECS[which].name;
          const ids: CatId[] = which === 'both' ? ['oyen', 'siam'] : [which];
          ids.forEach((id) => {
            const c = cats[id];
            if (!c) return;
            const g = new THREE.Group();
            g.name = SPECS[id].name;
            if (which === 'both') { g.position.x = LAYOUT.both[id].x; g.rotation.y = LAYOUT.both[id].ry; }
            const body = new THREE.Mesh(c.body.geometry, c.body.material);
            body.name = c.body.name;
            const face = new THREE.Mesh(c.decal.geometry, c.exportDecalMat);
            face.name = c.decal.name;
            g.add(body, face);
            c.whiskers.forEach((w) => { const m = new THREE.Mesh(w.geometry, w.material); m.name = w.name; g.add(m); });
            group.add(g);
          });
          new GLTFExporter().parse(
            group,
            (res) => {
              download(new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' }), `${group.name.toLowerCase()}.glb`);
              resolve();
            },
            (err) => reject(err),
            { binary: true },
          );
        }),
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timer.dispose();
      ro.disconnect();
      workers.forEach((w) => w.terminate());
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
      frameRef.current = null;
    };
  }, [apiRef]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
