import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, type AccessoryId, type AnimalId } from "../game/animals";
import { buildCharacterVisual, disposeCharacterDetails, poseStatic, type CharacterVisual } from "../game/characterMesh";
import type { EyeStyleId, ExpressionId } from "../game/eyes";
import { subscribeTuning } from "../game/tuning";
import { preloadCharacters, type PreloadJob } from "../game/characterPreload";
import { createRenderer } from "./webgl";

interface Props {
  selected: AnimalId;
  accessory: AccessoryId;
  eyeStyle: EyeStyleId;
  expression: ExpressionId;
  active: boolean;
}

export default function LineupPreview({ selected, accessory, eyeStyle, expression, active }: Props) {
  const [failed, setFailed] = useState(false);
  const activeRef = useRef(active);
  const accRef = useRef(accessory);
  const eyeRef = useRef(eyeStyle);
  const expressionRef = useRef(expression);
  const ref = useRef<HTMLDivElement>(null);
  const selRef = useRef(selected);
  const rebuildRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    selRef.current = selected;
    accRef.current = accessory;
    eyeRef.current = eyeStyle;
    expressionRef.current = expression;
    rebuildRef.current?.();
  }, [selected, accessory, eyeStyle, expression]);

  useEffect(() => {
    activeRef.current = active;
    rebuildRef.current?.();
  }, [active]);

  useEffect(() => {
    const el = ref.current!;
    // A missing/blocked WebGL context must not take the menu down with it.
    const renderer = createRenderer(el, { antialias: true, alpha: true });
    if (!renderer) {
      // No WebGL: fall back to a friendly portrait instead of an empty stage.
      setFailed(true);
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.15, 8.6);
    camera.lookAt(0, 0.72, 0);
    // Neutral-warm ambient keeps the orange fur saturated (a cool sky tint
    // turned it beige next to the asset preview).
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0xffddc4, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 6, 6);
    key.castShadow = true;
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.ShadowMaterial({ opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // A quiet ground shadow keeps the characters grounded without a busy podium.
    const stageShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 64),
      new THREE.MeshBasicMaterial({ color: 0x9b5c28, transparent: true, opacity: 0.15, depthWrite: false })
    );
    stageShadow.rotation.x = -Math.PI / 2;
    stageShadow.scale.set(1, 0.38, 1);
    stageShadow.position.y = 0.003;
    scene.add(stageShadow);

    let actors: { v: CharacterVisual; g: THREE.Group; x: number; main: boolean; seed: number }[] = [];

    let buildTimer = 0;
    const assemble = () => {
      for (const a of actors) { scene.remove(a.g); disposeCharacterDetails(a.v.all); }
      actors = [];
      clearTimeout(buildTimer);
      const idx = ANIMALS.findIndex((a) => a.id === selRef.current);
      // One hero and one companion, like a small party portrait.
      const list = [0, 1].map((off) => ({ off, def: ANIMALS[(idx + off) % ANIMALS.length] }));
      // build one character per tick so the menu never freezes
      const step = (i: number) => {
        if (i >= list.length) return;
        const { off, def } = list[i];
        // main cat wears the chosen accessory, the others show off random ones
        const acc = off === 0 ? accRef.current : ACCESSORIES[(idx * 3 + off * 7 + 20) % ACCESSORIES.length].id;
        const v = buildCharacterVisual(def, acc, off === 0 ? eyeRef.current : "default", off === 0 ? expressionRef.current : "default");
        const g = new THREE.Group();
        g.add(...v.all);
        const main = off === 0;
        const x = main ? -0.55 : 0.75;
        g.position.set(x, 0, main ? 0.25 : -0.2);
        g.scale.setScalar(main ? 1.28 : 1.0);
        g.rotation.y = main ? 0.1 : -0.2;
        scene.add(g);
        actors.push({ v, g, x, main, seed: Math.random() * 10 });
        buildTimer = window.setTimeout(() => step(i + 1), 16);
      };
      step(0);
    };
    let preloader: AbortController | null = null;
    const rebuild = () => {
      clearTimeout(buildTimer);
      preloader?.abort();
      if (!activeRef.current) return;
      const controller = new AbortController();
      preloader = controller;
      const idx = Math.max(0, ANIMALS.findIndex(a => a.id === selRef.current));
      const jobs: PreloadJob[] = [];
      for (const off of [0, 1]) {
        const def = ANIMALS[(idx + off) % ANIMALS.length];
        const acc = off === 0 ? accRef.current : ACCESSORIES[(idx * 3 + off * 7 + 20) % ACCESSORIES.length].id;
        const covered = acc === "helmet" || acc.startsWith("cap");
        for (const noEars of covered && acc.startsWith("cap") ? [true, false] : [covered]) jobs.push({ id: def.id, noEars });
      }
      void preloadCharacters(jobs, { signal: controller.signal }).catch(() => {}).then(() => {
        if (!controller.signal.aborted) assemble();
      });
    };
    rebuildRef.current = rebuild;
    let tuneTimer = 0;
    const unsubTune = subscribeTuning(() => {
      clearTimeout(tuneTimer);
      tuneTimer = window.setTimeout(rebuild, 280);
    });
    rebuild();

    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // Frame both characters in the stage, even in a narrow portrait layout.
      const fov = (camera.fov * Math.PI) / 180;
      const needForWidth = 1.55 / (Math.tan(fov / 2) * camera.aspect);
      camera.position.set(0, 1.35, Math.max(6.6, needForWidth));
      camera.lookAt(0, 0.95, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!activeRef.current) return;
      const t = (performance.now() - t0) / 1000;
      for (const a of actors) {
        poseStatic(a.v, t + a.seed);
        if (a.main) {
          a.g.rotation.y = 0.1 + Math.sin(t * 0.65) * 0.16;
          const hop = Math.max(0, Math.sin(t * 3)) * 0.025;
          a.g.position.y = hop;
        }
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      preloader?.abort();
      for (const a of actors) disposeCharacterDetails(a.v.all);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      stageShadow.geometry.dispose();
      (stageShadow.material as THREE.Material).dispose();
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      rebuildRef.current = null;
      unsubTune();
      clearTimeout(tuneTimer);
      clearTimeout(buildTimer);
    };
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      {failed && (
        <div className="lineup-fallback" role="status">
          <strong>😿</strong>
          <span>Pratinjau 3D butuh WebGL. Menumu tetap bisa dimainkan.</span>
        </div>
      )}
    </div>
  );
}
