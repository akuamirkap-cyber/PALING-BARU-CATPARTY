import * as THREE from 'three';
import { animalById, type AnimalId } from './animals';
import { buildCharacterVisual, disposeCharacterDetails, packCharacterAsset, poseStatic, type PackedCharacterAsset } from './characterMesh';
import type { EyeStyleId, ExpressionId } from './eyes';
import { getRigTuning, setShapeMode, setTuning, type ShapeMode, type Tuning } from './tuning';
import * as rig from './rig';

export interface CharacterJob {
  id: AnimalId;
  noEars: boolean;
  tuning: Tuning;
  shapeMode: ShapeMode;
  revision: string;
  portrait?: { eyeStyle: EyeStyleId; expression: ExpressionId };
}
export interface CharacterResult { job: CharacterJob; asset: PackedCharacterAsset; portrait: Blob | null }

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let portraitUnavailable = false;
function setupPortrait() {
  if (renderer || portraitUnavailable) return;
  try {
    const canvas = new OffscreenCanvas(192, 192);
    renderer = new THREE.WebGLRenderer({ canvas: canvas as unknown as HTMLCanvasElement, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(192, 192, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a8, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(1.5, 2.5, 4);
    scene.add(key);
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  } catch {
    portraitUnavailable = true;
  }
}
async function renderPortrait(job: CharacterJob): Promise<Blob | null> {
  if (!job.portrait) return null;
  setupPortrait();
  if (!renderer || !scene || !camera) return null;
  const visual = buildCharacterVisual(animalById(job.id), 'none', job.portrait.eyeStyle, job.portrait.expression);
  const group = new THREE.Group();
  group.add(...visual.all);
  poseStatic(visual, 0.4);
  visual.head.quaternion.identity();
  group.rotation.y = -0.12;
  rig.applyRig();
  const T = getRigTuning();
  const hy = rig.HOVER + rig.HEAD_OFFSET + T.neck + 0.02;
  camera.position.set(0.18, hy + 0.1, 2.35 * (0.6 + 0.4 * T.head));
  camera.lookAt(0, hy - 0.02, 0);
  scene.add(group);
  renderer.render(scene, camera);
  const blob = await (renderer.domElement as unknown as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  scene.remove(group);
  disposeCharacterDetails(visual.all);
  return blob;
}

self.onmessage = async (event: MessageEvent<CharacterJob>) => {
  const job = event.data;
  try {
    setShapeMode(job.shapeMode);
    setTuning(job.tuning);
    const asset = packCharacterAsset(animalById(job.id), job.noEars);
    let portrait: Blob | null = null;
    try { portrait = await renderPortrait(job); } catch { portraitUnavailable = true; }
    const result: CharacterResult = { job, asset, portrait };
    const buffers = [asset.geometry, asset.armGeometry].flatMap(g =>
      [g.position, g.normal, g.color, g.skinIndex, g.skinWeight, g.index].map(a => a.buffer as ArrayBuffer));
    self.postMessage({ result }, { transfer: buffers });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
