import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createRenderer } from "./webgl";
import type { CatBuild } from "../catasset/build";
import { SPECS } from "../catasset/specs";

type AssetId = "oyen" | "siam";

/** Voxel size for the SDF build. Small enough for a crisp silhouette, coarse
 *  enough that the worker finishes in about a second. */
const MESH_RES = 0.017;
/** Coarse build used only when Workers are unavailable (blocks once, briefly). */
const MESH_RES_FALLBACK = 0.028;

const LABELS: Record<AssetId, string> = { oyen: "Oyen", siam: "Siam" };

function taperedTube(points: Float32Array, radius: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i += 3) pts.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const TS = 40, RS = 5;
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

function softShadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(74,48,12,.55)");
  grad.addColorStop(1, "rgba(74,48,12,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Turns a baked SDF build into a three.js group (body + painted face + whiskers). */
function makeAssetCat(build: CatBuild, maxAniso: number) {
  const root = new THREE.Group();
  const breathe = new THREE.Group();
  root.add(breathe);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(build.body.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(build.body.normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(build.body.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(build.body.indices, 1));
  geo.computeBoundingSphere();
  const body = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.52,
      metalness: 0,
      clearcoat: 0.24,
      clearcoatRoughness: 0.46,
      sheen: 0.28,
      sheenRoughness: 0.62,
      sheenColor: new THREE.Color("#fff3e2"),
      envMapIntensity: 0.7,
    }),
  );
  breathe.add(body);

  const decalGeo = new THREE.BufferGeometry();
  decalGeo.setAttribute("position", new THREE.BufferAttribute(build.decal.positions, 3));
  decalGeo.setAttribute("normal", new THREE.BufferAttribute(build.decal.normals, 3));
  decalGeo.setAttribute("uv", new THREE.BufferAttribute(build.decal.uvs, 2));
  decalGeo.setIndex(new THREE.BufferAttribute(build.decal.indices, 1));
  const faceTex = new THREE.DataTexture(new Uint8Array(build.tex.rgba.buffer), build.tex.W, build.tex.H, THREE.RGBAFormat);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = maxAniso;
  faceTex.needsUpdate = true;
  const roughTex = new THREE.DataTexture(new Uint8Array(build.tex.mat.buffer), build.tex.W, build.tex.H, THREE.RGBAFormat);
  roughTex.needsUpdate = true;
  const decal = new THREE.Mesh(
    decalGeo,
    new THREE.MeshPhysicalMaterial({
      map: faceTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      roughness: 0.5,
      roughnessMap: roughTex,
      metalness: 0,
    }),
  );
  decal.renderOrder = 2;
  breathe.add(decal);

  const spec = SPECS[build.id];
  const whiskerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.pal.whisker), roughness: 0.45, metalness: 0 });
  for (const w of build.whiskers) breathe.add(new THREE.Mesh(taperedTube(w, spec.face.whiskerR), whiskerMat));

  return { root, breathe };
}

interface Props {
  /** Game cat id; the asset only ships Oyen and Siam, other picks hide the showcase. */
  animal: string;
  active: boolean;
}

/**
 * The "accurate 3D cat" asset (no hat) showcased beside the menu lineup.
 * Built from an SDF in a worker, so it never stalls the menu.
 */
export default function AssetCatPreview({ animal, active }: Props) {
  // only dress this showcase for the two cats the exported asset actually has;
  // for every other pick (e.g. Jambul) it hides so it can't masquerade as the
  // selected character
  const supported = animal === "siam" || animal === "oyen";
  const assetId: AssetId = supported ? (animal as AssetId) : "oyen";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [progress, setProgress] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Both assets are baked once in the background; switching just toggles which
  // one is visible, so the menu never rebuilds mid-selection.
  const assetRef = useRef(assetId);
  const readyRef = useRef<Record<AssetId, boolean>>({ oyen: false, siam: false });
  const pushProgress = useRef<Record<AssetId, number>>({ oyen: 0, siam: 0 });

  useEffect(() => {
    assetRef.current = assetId;
    if (readyRef.current[assetId]) {
      setStatus("ready");
      setProgress(1);
    } else {
      setStatus("loading");
      setProgress(pushProgress.current[assetId]);
    }
  }, [assetId]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = createRenderer(el, { antialias: true, alpha: true, powerPreference: "low-power" });
    if (!renderer) {
      setStatus("failed");
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    camera.position.set(0, 1.52, 6.75);
    camera.lookAt(0, 1.3, 0);

    scene.add(new THREE.HemisphereLight(0xfff3e0, 0xf0d9a8, 1.5));
    const key = new THREE.DirectionalLight(0xfff4e4, 2.2);
    key.position.set(-2.6, 5.4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe9d2, 0.7);
    fill.position.set(4.4, 2.4, 3.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(1.4, 4.0, -5.4);
    scene.add(rim);

    const shadowTex = softShadowTexture();
    if (shadowTex) {
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 1.7),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.004;
      blob.renderOrder = 1;
      scene.add(blob);
    }

    const cats: Partial<Record<AssetId, { root: THREE.Group; breathe: THREE.Group }>> = {};
    const workers: Worker[] = [];
    let raf = 0;
    let disposed = false;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const attach = (id: AssetId, build: CatBuild) => {
      if (disposed) return;
      const made = makeAssetCat(build, maxAniso);
      made.root.visible = id === assetRef.current;
      cats[id] = made;
      scene.add(made.root);
      readyRef.current[id] = true;
      if (id === assetRef.current) {
        setStatus("ready");
        setProgress(1);
      }
    };

    const track = (id: AssetId, p: number) => {
      pushProgress.current[id] = p;
      if (id === assetRef.current) setProgress(p);
    };

    const buildOnMainThread = (id: AssetId) => {
      void import("../catasset/build")
        .then(({ buildCat }) => {
          if (disposed) return;
          attach(id, buildCat(SPECS[id], MESH_RES_FALLBACK));
        })
        .catch(() => {
          if (!disposed && id === assetRef.current) setStatus("failed");
        });
    };

    // Build the visible cat first; the spare one follows so the menu stays snappy.
    let spareTimer = 0;
    const started: Partial<Record<AssetId, boolean>> = {};
    const buildOne = (id: AssetId) => {
      if (started[id]) return;
      started[id] = true;
      try {
        const worker = new Worker(new URL("../catasset/worker.ts", import.meta.url), { type: "module" });
        workers.push(worker);
        worker.onmessage = (event: MessageEvent) => {
          if (disposed) return;
          const msg = event.data as { type: string; p?: number; build?: CatBuild };
          if (msg.type === "progress") track(id, msg.p ?? 0);
          else if (msg.type === "done" && msg.build) {
            attach(id, msg.build);
            worker.terminate();
          }
        };
        worker.onerror = () => {
          worker.terminate();
          buildOnMainThread(id);
        };
        worker.postMessage({ id, h: MESH_RES });
      } catch {
        buildOnMainThread(id);
      }
    };
    buildOne(assetRef.current);
    spareTimer = window.setTimeout(() => {
      buildOne(assetRef.current === "oyen" ? "siam" : "oyen");
      // the player may have flipped cats while the first one baked
      buildOne(assetRef.current);
    }, 900);

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const current = cats[assetRef.current];
      if (!activeRef.current || !current) return;
      const t = (performance.now() - t0) / 1000;
      // showcase sway + calm breathing; the cat stays planted (no hopping)
      for (const id of ["oyen", "siam"] as AssetId[]) {
        const made = cats[id];
        if (!made) continue;
        made.root.visible = id === assetRef.current;
      }
      current.root.rotation.y = Math.sin(t * 0.42) * 0.38;
      const b = 1 + Math.sin(t * 1.7) * 0.014;
      current.breathe.scale.set(b, 2 - b, b);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(spareTimer);
      ro.disconnect();
      for (const w of workers) w.terminate();
      for (const made of Object.values(cats)) {
        if (!made) continue;
        scene.remove(made.root);
        made.root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      }
      shadowTex?.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  if (!supported) return null; // the pick is not Oyen/Siam: step aside, the lineup preview shows it
  return (
    <div className="mm-asset-box" data-testid="menu-asset-cat">
      <div ref={host} className="mm-asset-stage" aria-hidden="true" />
      {status === "failed" && (
        <div className="mm-asset-note" role="status">
          Aset 3D butuh WebGL
        </div>
      )}
      {status === "loading" && (
        <div className="mm-asset-note" role="status">
          Menyiapkan aset 3D… {Math.round(progress * 100)}%
        </div>
      )}
      <span className="mm-asset-tag">
        <i>ASET 3D</i> {LABELS[assetId]} · TANPA TOPI
      </span>
    </div>
  );
}
