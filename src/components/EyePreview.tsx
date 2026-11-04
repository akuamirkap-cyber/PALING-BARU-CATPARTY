import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createRenderer } from "./webgl";
import { animalById, type AccessoryId, type AnimalId } from "../game/animals";
import { buildCharacterVisual, disposeCharacterDetails, poseStatic, type CharacterVisual } from "../game/characterMesh";
import type { EyeStyleId, ExpressionId } from "../game/eyes";
import * as rig from "../game/rig";
import { getRigTuning } from "../game/tuning";
import { preloadCharacters, type PreloadJob } from "../game/characterPreload";

type Selection = { animal: AnimalId; accessory: AccessoryId; eyeStyle: EyeStyleId; expression: ExpressionId; framing?: "face" | "body"; revision?: string };

/** A live, head-focused preview of the selected cat and accessory. */
export default function EyePreview(selection: Selection) {
  const container = useRef<HTMLDivElement>(null);
  const update = useRef<((next: Selection) => void) | null>(null);
  useEffect(() => {
    const el = container.current!;
    const renderer = createRenderer(el, { alpha: true, antialias: true });
    if (!renderer) return;
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xffd4b4, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 1.9);
    light.position.set(2, 3, 5);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    let visual: CharacterVisual | null = null;
    let group: THREE.Group | null = null;
    const clear = () => {
      if (!group) return;
      scene.remove(group);
      if (visual) disposeCharacterDetails(visual.all);
      group = null;
      visual = null;
    };
    let preloader: AbortController | null = null;
    update.current = (next) => {
      preloader?.abort();
      const controller = new AbortController();
      preloader = controller;
      const covered = next.accessory === "helmet" || next.accessory.startsWith("cap");
      const jobs: PreloadJob[] = (covered && next.accessory.startsWith("cap") ? [true, false] : [covered])
        .map(noEars => ({ id: next.animal, noEars }));
      void preloadCharacters(jobs, { signal: controller.signal }).catch(() => {}).then(() => {
        if (controller.signal.aborted) return;
        clear();
        visual = buildCharacterVisual(animalById(next.animal), next.accessory, next.eyeStyle, next.expression);
        group = new THREE.Group();
        group.add(...visual.all);
        scene.add(group);
        const hy = rig.HOVER + rig.HEAD_OFFSET + getRigTuning().neck + 0.02;
        if (next.framing === "body") {
          camera.position.set(0, 0.88, 3.6);
          camera.lookAt(0, 0.72, 0);
        } else {
          camera.position.set(0, hy + 0.07, 2.15 * (0.6 + 0.4 * getRigTuning().head));
          camera.lookAt(0, hy, 0);
        }
      });
    };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (visual) {
        poseStatic(visual, (performance.now() - start) / 1000);
        visual.head.quaternion.identity();
      }
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      preloader?.abort();
      update.current = null;
      clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    update.current?.(selection);
  }, [selection.animal, selection.accessory, selection.eyeStyle, selection.expression, selection.framing, selection.revision]);
  return <div ref={container} className="eye-preview" aria-label={selection.framing === "body" ? "Pratinjau bentuk kucing" : "Pratinjau mata kucing"} />;
}
