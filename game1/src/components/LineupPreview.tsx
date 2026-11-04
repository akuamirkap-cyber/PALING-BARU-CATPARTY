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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.15, 8.6);
    camera.lookAt(0, 0.72, 0);
    scene.add(new THREE.HemisphereLight(0xf2f8ff, 0xffd2b8, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 6, 6);
    key.castShadow = true;
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.ShadowMaterial({ opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // hero podium: glowing disks + ring + light cone, right under the main cat (z = 0.6)
    const glowDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.32, depthWrite: false })
    );
    glowDisk.rotation.x = -Math.PI / 2;
    glowDisk.position.set(0, 0.004, 0.6);
    scene.add(glowDisk);
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.55, depthWrite: false })
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(0, 0.008, 0.6);
    scene.add(disk);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 56),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.012, 0.6);
    scene.add(ring);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 1.55, 4.6, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff6d8,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    cone.position.set(0, 2.3, 0.6);
    scene.add(cone);

    let actors: { v: CharacterVisual; g: THREE.Group; x: number; main: boolean; seed: number }[] = [];

    let buildTimer = 0;
    const rebuild = () => {
      for (const a of actors) scene.remove(a.g);
      actors = [];
      clearTimeout(buildTimer);
      const idx = ANIMALS.findIndex((a) => a.id === selRef.current);
      // on narrow phone screens show only 3 cats so the hero stays big and readable
      const narrow = el.clientWidth < 520;
      const offs = narrow ? [0, -1, 1] : [0, -1, 1, -2, 2];
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
        const narrow2 = el.clientWidth < 520;
        const x = off * (narrow2 ? 1.95 : 1.75);
        g.position.set(x, 0, main ? 0.6 : -0.55 - Math.abs(off) * 0.25);
        g.scale.setScalar(main ? (narrow2 ? 1.32 : 1.15) : 0.88);
        g.rotation.y = main ? 0 : -off * 0.28;
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
      // phone: frame 3 cats with the hero big; desktop: full 5-cat lineup
      if (w < h) {
        const fov = (camera.fov * Math.PI) / 180;
        const needForWidth = 2.6 / (Math.tan(fov / 2) * (w / h));
        camera.position.set(0, 1.32, Math.max(8.2, needForWidth));
        camera.lookAt(0, 0.85, 0);
      } else {
        camera.position.set(0, 1.15, 8.4);
        camera.lookAt(0, 0.72, 0);
      }
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = (performance.now() - t0) / 1000;
      // podium breathing glow
      const pulse = 1 + Math.sin(t * 2.4) * 0.045;
      glowDisk.scale.set(pulse, pulse, 1);
      (glowDisk.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 2.4) * 0.06;
      ring.rotation.z = t * 0.25;
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
