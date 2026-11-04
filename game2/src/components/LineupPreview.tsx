import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, type AccessoryId, type AnimalId } from "../game/animals";
import { buildCharacterVisual, poseStatic, type CharacterVisual } from "../game/characterMesh";
import { subscribeTuning } from "../game/tuning";

interface Props {
  selected: AnimalId;
  accessory: AccessoryId;
}

export default function LineupPreview({ selected, accessory }: Props) {
  const accRef = useRef(accessory);
  const ref = useRef<HTMLDivElement>(null);
  const selRef = useRef(selected);
  const rebuildRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    selRef.current = selected;
    accRef.current = accessory;
    rebuildRef.current?.();
  }, [selected, accessory]);

  useEffect(() => {
    const el = ref.current!;
    const lowEnd = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720;
    const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !lowEnd;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.5, 7.2);
    camera.lookAt(0, 1.05, 0);
    scene.add(new THREE.HemisphereLight(0xf2f8ff, 0xffd2b8, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 6, 6);
    key.castShadow = true;
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.ShadowMaterial({ opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // spotlight disk (bigger, layered glow)
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.5 })
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.01;
    scene.add(disk);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 48),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.28 })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.005;
    scene.add(halo);

    let actors: { v: CharacterVisual; g: THREE.Group; x: number; main: boolean; seed: number }[] = [];

    let buildTimer = 0;
    const rebuild = () => {
      for (const a of actors) scene.remove(a.g);
      actors = [];
      clearTimeout(buildTimer);
      const idx = ANIMALS.findIndex((a) => a.id === selRef.current);
      const offs = [0, -1, 1, -2, 2];
      const list = offs.map((off) => ({ off, def: ANIMALS[(idx + off + ANIMALS.length * 2) % ANIMALS.length] }));
      // build one character per tick so the menu never freezes
      const step = (i: number) => {
        if (i >= list.length) return;
        const { off, def } = list[i];
        // main cat wears the chosen accessory, the others show off random ones
        const acc = off === 0 ? accRef.current : ACCESSORIES[(idx * 3 + off * 7 + 20) % ACCESSORIES.length].id;
        const v = buildCharacterVisual(def, acc);
        const g = new THREE.Group();
        g.add(...v.all);
        const main = off === 0;
        const x = off * 1.95;
        g.position.set(x, 0, main ? 1.1 : -0.1 - Math.abs(off) * 0.25);
        g.scale.setScalar(main ? 1.42 : 1.05);
        g.rotation.y = main ? 0 : -off * 0.25;
        scene.add(g);
        actors.push({ v, g, x, main, seed: Math.random() * 10 });
        buildTimer = window.setTimeout(() => step(i + 1), 16);
      };
      step(0);
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
      // keep all cats in frame on tall (phone) screens
      if (w < h) {
        const fov = (camera.fov * Math.PI) / 180;
        const needForWidth = 2.55 / (Math.tan(fov / 2) * (w / h));
        camera.position.z = Math.max(7.9, needForWidth);
      } else camera.position.z = 7.2;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const t0 = performance.now();
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // menu only needs ~30 fps on phones: halve the GPU work there
      if (lowEnd && (frame++ & 1)) return;
      const t = (performance.now() - t0) / 1000;
      for (const a of actors) {
        poseStatic(a.v, t + a.seed, a.main);
        if (a.main) {
          a.g.rotation.y = Math.sin(t * 0.8) * 0.35;
          const hop = Math.max(0, Math.sin(t * 4)) * 0.08;
          a.g.position.y = hop;
        }
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      rebuildRef.current = null;
      unsubTune();
      clearTimeout(tuneTimer);
      clearTimeout(buildTimer);
    };
  }, []);

  return <div ref={ref} className="absolute inset-0" />;
}
