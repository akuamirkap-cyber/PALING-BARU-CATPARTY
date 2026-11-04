import * as THREE from 'three';
import { animalById } from './animals';
import { buildCharacterVisual, disposeCharacterDetails, poseStatic } from './characterMesh';
import type { CharacterResult } from './characterWorker';
import { getRigTuning, tuningKey } from './tuning';
import * as rig from './rig';
import { storePortraitUrl } from './portraits';

let renderer: THREE.WebGLRenderer | null = null;
/** Only used on browsers without worker WebGL; the body was already built in the worker. */
export function renderPortraitFallback(result: CharacterResult) {
  if (!result.job.portrait || result.job.revision !== tuningKey()) return;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(192, 192);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a8, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(1.5, 2.5, 4);
    scene.add(light);
    const visual = buildCharacterVisual(animalById(result.job.id), 'none', result.job.portrait.eyeStyle, result.job.portrait.expression);
    const group = new THREE.Group();
    group.add(...visual.all);
    poseStatic(visual, 0.4);
    visual.head.quaternion.identity();
    group.rotation.y = -0.12;
    rig.applyRig();
    const T = getRigTuning();
    const hy = rig.HOVER + rig.HEAD_OFFSET + T.neck + 0.02;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0.18, hy + 0.1, 2.35 * (0.6 + 0.4 * T.head));
    camera.lookAt(0, hy - 0.02, 0);
    scene.add(group);
    renderer.render(scene, camera);
    storePortraitUrl(result, renderer.domElement.toDataURL('image/png'));
    disposeCharacterDetails(visual.all);
  } catch { /* Emoji remains usable when WebGL itself is unavailable. */ }
}
export function disposePortraitFallback() {
  renderer?.dispose();
  renderer = null;
}
