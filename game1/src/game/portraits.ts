import { useSyncExternalStore } from "react";
import * as THREE from "three";
import type { AnimalDef, AnimalId } from "./animals";
import { buildCharacterVisual, poseStatic } from "./characterMesh";
import * as rig from "./rig";
import { getTuning, tuningKey } from "./tuning";

let cache: Partial<Record<AnimalId, string>> = {};
let cacheKey = "";
let snapshot: Partial<Record<AnimalId, string>> = {};
const listeners = new Set<() => void>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(192, 192);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a8, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(1.5, 2.5, 4);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
}
/** aim at the head (body height / leg length / neck change where it is) */
function aimCamera() {
  rig.applyRig();
  const T = getTuning();
  const hy = rig.HOVER + rig.HEAD_OFFSET + T.neck + 0.02;
  camera!.position.set(0.18, hy + 0.1, 2.35 * (0.6 + 0.4 * T.head));
  camera!.lookAt(0, hy - 0.02, 0);
}

export function renderPortrait(def: AnimalDef) {
  const k = tuningKey();
  if (k !== cacheKey) {
    cacheKey = k;
    cache = {};
  }
  if (cache[def.id]) return cache[def.id]!;
  try {
    setup();
    const v = buildCharacterVisual(def);
    aimCamera();
    const g = new THREE.Group();
    g.add(...v.all);
    poseStatic(v, 0.4);
    v.head.quaternion.identity();
    g.rotation.y = -0.12;
    scene!.add(g);
    renderer!.render(scene!, camera!);
    const url = renderer!.domElement.toDataURL("image/png");
    scene!.remove(g);
    cache[def.id] = url;
    snapshot = { ...cache };
    listeners.forEach((l) => l());
    return url;
  } catch {
    return undefined;
  }
}

export function usePortraits() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot
  );
}
