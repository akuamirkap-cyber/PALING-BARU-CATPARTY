import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ANIMALS } from "../game/animals";
import { buildCharacterVisual, disposeCharacterDetails, poseStatic, type CharacterVisual } from "../game/characterMesh";
import { createRenderer } from "./webgl";

/**
 * Three live 3D "game slides" shown together so the two reference menu designs
 * from the repo (3d-game-main-menu-design, 3d-game-menu-layout) can be compared
 * side by side with the current Meow Brawl arena.
 */
export type SlideKind = "brawl" | "balls" | "layout";

interface Slide {
  kind: SlideKind;
  tag: string;
  title: string;
  note: string;
  source: string;
  traits: string[];
  accent: string;
  glow: string;
}

export const GAME_SLIDES: Slide[] = [
  {
    kind: "brawl",
    tag: "PUNYAMU",
    title: "Meow Brawl",
    note: "Ragdoll fisika di dek pesawat yang miring.",
    source: "Arena asli game ini",
    traits: ["Kucing ragdoll", "Dek pesawat", "Brawl & Bom"],
    accent: "#ff8a3d",
    glow: "rgba(255,138,61,.45)",
  },
  {
    kind: "balls",
    tag: "REFERENSI 1",
    title: "3D Game Main Menu",
    note: "Bola kucing mengkilap dengan aksesoris di atas panggung.",
    source: "3d-game-main-menu-design (1).zip",
    traits: ["Figur bola glossy", "Menu vertikal", "Kartu skin"],
    accent: "#e23a1e",
    glow: "rgba(226,58,30,.45)",
  },
  {
    kind: "layout",
    tag: "REFERENSI 2",
    title: "3D Game Menu Layout",
    note: "Dua kucing melompat di panggung oranye, kartu di kanan.",
    source: "3d-game-menu-layout.zip",
    traits: ["Panggung oranye", "Kucing melompat", "Kartu kanan"],
    accent: "#f0a415",
    glow: "rgba(240,164,21,.5)",
  },
];

const MAX_DPR = 1.6;

/** shared stage lighting for the two cat stages */
function stageLights(scene: THREE.Scene, warm = 0xffd9a8) {
  scene.add(new THREE.HemisphereLight(0xfff6ea, warm, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.1);
  key.position.set(3.4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb347, 0.85);
  rim.position.set(-4, 2.6, -3);
  scene.add(rim);
}

function kitty(scene: THREE.Scene, index: number, x: number, y: number, z: number, rotY: number, scale: number) {
  const visual = buildCharacterVisual(ANIMALS[index % ANIMALS.length], "none");
  const group = new THREE.Group();
  group.add(...visual.all);
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  group.scale.setScalar(scale);
  scene.add(group);
  return { visual, group };
}

/** Free geometries/materials of stage props only (cat assets are cached + shared). */
function disposeOwn(objects: (THREE.Object3D | THREE.Mesh)[]) {
  for (const object of objects) {
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const material = o.material as THREE.Material | THREE.Material[];
      for (const m of Array.isArray(material) ? material : [material]) m.dispose();
    });
  }
}

interface Built {
  animate: (t: number, dt: number) => void;
  dispose: () => void;
}

function buildBrawl(scene: THREE.Scene): Built {
  stageLights(scene, 0xc3d6ff);
  // deck of the plane: a warm steel plate with hazard stripes at the front
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.72, metalness: 0.15 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.42, 3.2), deckMat);
  deck.position.set(0, -0.21, 0);
  deck.receiveShadow = true;
  scene.add(deck);
  const stripeMat = [
    new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.8 }),
  ];
  const stripes: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 3.2), stripeMat[i % 2]);
    stripe.position.set(-1.75 + i * 0.7, 0.005, 0);
    scene.add(stripe);
    stripes.push(stripe);
  }
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8b98a6, roughness: 0.6 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 0.16), edgeMat);
  edge.position.set(0, -0.05, 1.66);
  scene.add(edge);

  const left = kitty(scene, 1, -0.78, 0, 0.18, 0.55, 1.02);
  const right = kitty(scene, 0, 0.86, 0, -0.1, -0.5, 1.06);
  const casters = [left, right];

  const own: THREE.Mesh[] = [deck, edge, ...stripes];
  return {
    animate: (t) => {
      for (const c of casters) poseStatic(c.visual, t + (c === left ? 0 : 1.7));
      left.group.position.y = Math.max(0, Math.sin(t * 2.6)) * 0.05;
      right.group.position.y = Math.max(0, Math.sin(t * 2.6 + 1.3)) * 0.05;
    },
    dispose: () => {
      // Cat geometry is shared/cached, so only the deck props are ours to free.
      for (const c of casters) disposeCharacterDetails(c.visual.all);
      disposeOwn(own);
      deckMat.dispose();
      edgeMat.dispose();
      for (const m of stripeMat) m.dispose();
    },
  };
}

function buildBalls(scene: THREE.Scene): Built {
  scene.add(new THREE.HemisphereLight(0xfff3dd, 0x5a2a12, 1.35));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
  key.position.set(2.6, 4.6, 4.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8a3d, 1.1);
  rim.position.set(-3.4, 2.4, -2.6);
  scene.add(rim);

  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.7, 0.24, 48),
    new THREE.MeshStandardMaterial({ color: 0x3a2317, roughness: 0.9 }),
  );
  podium.position.y = -0.24;
  scene.add(podium);
  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.04, 48),
    new THREE.MeshStandardMaterial({ color: 0xffc53d, roughness: 0.5, emissive: 0x6b3b00, emissiveIntensity: 0.4 }),
  );
  halo.position.y = -0.1;
  scene.add(halo);

  const balls: { group: THREE.Group; baseZ: number; phase: number }[] = [];
  const palette = [0xff7a00, 0xfff1c8, 0x2ea8ff];
  palette.forEach((color, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 28, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.06 }),
    );
    body.scale.set(1, 0.96, 1);
    g.add(body);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x23130b, roughness: 0.35 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), eyeMat);
      eye.position.set(sx * 0.17, 0.14, 0.46);
      eye.scale.set(1, 1.25, 0.7);
      g.add(eye);
    }
    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    shine.position.set(-0.2, 0.3, 0.36);
    shine.scale.set(1, 0.7, 0.5);
    g.add(shine);
    if (i === 0) {
      // crown, like the "royal" skin in the reference
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.26, 0.2, 6, 1, false),
        new THREE.MeshStandardMaterial({ color: 0xffc53d, roughness: 0.35, metalness: 0.35 }),
      );
      crown.position.set(0, 0.5, 0);
      g.add(crown);
    }
    if (i === 2) {
      // shades
      const shades = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.14, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 0.25 }),
      );
      shades.position.set(0, 0.15, 0.47);
      g.add(shades);
    }
    g.position.set((i - 1) * 1.32, 0.58, 0);
    g.rotation.y = (i - 1) * -0.12;
    scene.add(g);
    balls.push({ group: g, baseZ: g.position.y, phase: i * 1.5 });
  });

  return {
    animate: (t) => {
      for (const b of balls) {
        const hop = Math.max(0, Math.sin(t * 2.4 + b.phase));
        b.group.position.y = b.baseZ + hop * hop * 0.16;
        const squash = 1 - Math.max(0, 0.06 - hop * 0.22);
        b.group.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        b.group.rotation.z = Math.sin(t * 1.6 + b.phase) * 0.06;
      }
    },
    dispose: () => disposeOwn([podium, halo, ...balls.map((b) => b.group) as unknown as THREE.Mesh[]]),
  };
}

function buildLayout(scene: THREE.Scene): Built {
  stageLights(scene, 0xb07a40);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.5, 0.26, 52),
    new THREE.MeshStandardMaterial({ color: 0xf7a21b, roughness: 0.95 }),
  );
  disc.position.y = -0.2;
  disc.receiveShadow = true;
  scene.add(disc);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 48),
    new THREE.MeshBasicMaterial({ color: 0xa14f00, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.42, 1);
  shadow.position.y = 0.002;
  scene.add(shadow);

  const a = kitty(scene, 2, -1.02, 0, 0.1, 0.32, 1.0);
  const b = kitty(scene, 10, 1.02, 0, 0, -0.26, 0.96);

  return {
    animate: (t) => {
      poseStatic(a.visual, t);
      poseStatic(b.visual, t + 1.2);
      const hopA = Math.max(0, Math.sin(t * 2.2));
      a.group.position.y = hopA * hopA * 0.12;
      const hopB = Math.max(0, Math.sin(t * 2.2 + 1.6));
      b.group.position.y = hopB * hopB * 0.1;
    },
    dispose: () => {
      for (const c of [a, b]) disposeCharacterDetails(c.visual.all);
      disposeOwn([disc, shadow]);
    },
  };
}

/** Exposed for tests: build one slide's 3D content into an existing scene. */
export const SLIDE_SCENES: Record<SlideKind, (scene: THREE.Scene) => Built> = {
  brawl: buildBrawl,
  balls: buildBalls,
  layout: buildLayout,
};

/** One live slide: its own tiny renderer, paused while off-screen. */
function SlideView({ kind }: { kind: SlideKind }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const renderer = createRenderer(el, { antialias: true, alpha: true, powerPreference: "low-power" });
    if (!renderer) return;
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 1.12, 4.0);
    camera.lookAt(0, 0.68, 0);

    let built: Built | null = null;
    let started = false;
    let disposed = false;
    let visible = true;

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Frame ~2 units tall of stage and keep both fighters inside on narrow slides.
      const half = Math.tan((camera.fov * Math.PI) / 360);
      const forHeight = 1.16 / half;
      const forWidth = 1.85 / (half * camera.aspect);
      camera.position.set(0, 1.12, Math.max(forHeight, forWidth));
      camera.lookAt(0, 0.68, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Building a cat mesh is heavy: do it once the slide is actually on screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !started && !disposed) start();
      },
      { threshold: 0.05 },
    );
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!built || !visible || document.hidden) return;
      built.animate((now - t0) / 1000, dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    function start() {
      if (started) return;
      started = true;
      const build = kind === "brawl" ? buildBrawl : kind === "balls" ? buildBalls : buildLayout;
      // let the first paint of the slide happen before the mesh work
      window.setTimeout(() => {
        started = false;
        if (disposed) return;
        built = build(scene);
        setReady(true);
        renderer.render(scene, camera);
      }, 60);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      built?.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
    };
  }, [kind]);

  return (
    <div ref={host} className="home-slide-canvas" aria-hidden="true">
      {!ready && <span className="home-slide-loading">LIVE 3D</span>}
    </div>
  );
}

function SlideChrome({ kind }: { kind: SlideKind }) {
  if (kind === "brawl") {
    return (
      <div className="slide-chrome slide-chrome-brawl" aria-hidden="true">
        <div className="slide-hud">
          <span className="slide-hud-name">MOCHI</span>
          <span className="slide-hud-bar"><i style={{ width: "72%" }} /></span>
        </div>
        <div className="slide-hud">
          <span className="slide-hud-name">OREN</span>
          <span className="slide-hud-bar is-foe"><i style={{ width: "54%" }} /></span>
        </div>
        <span className="slide-timer">1:24</span>
      </div>
    );
  }
  if (kind === "balls") {
    return (
      <div className="slide-chrome slide-chrome-menu" aria-hidden="true">
        <span className="slide-menu-item is-on">QUICK MATCH</span>
        <span className="slide-menu-item">CUSTOM GAME</span>
        <span className="slide-menu-item">LOCKER</span>
        <span className="slide-menu-card">SKIN</span>
      </div>
    );
  }
  return (
    <div className="slide-chrome slide-chrome-menu slide-chrome-layout" aria-hidden="true">
      <span className="slide-menu-item is-on">PLAY</span>
      <span className="slide-menu-item">CUSTOM</span>
      <span className="slide-menu-item">SETTINGS</span>
      <span className="slide-menu-vote">VOTE<br />NOW</span>
    </div>
  );
}

export default function GameSlides() {
  const [open, setOpen] = useState(true);
  return (
    <section className="home-slides" aria-label="Bandingkan tiga tampilan game">
      <div className="home-slides-head">
        <div>
          <h2>
            <span className="home-slides-dot" /> 3 TAMPILAN GAME · LIVE
          </h2>
          <p>Bandingkan arena Meow Brawl dengan dua desain menu referensi.</p>
        </div>
        <button type="button" className="home-slides-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Sembunyikan" : "Tampilkan"}
        </button>
      </div>
      {open && (
        <div className="home-slides-track">
          {GAME_SLIDES.map((slide) => (
            <article key={slide.kind} className="home-slide" style={{ ["--slide-accent" as string]: slide.accent, ["--slide-glow" as string]: slide.glow }}>
              <div className="home-slide-stage">
                <span className="home-slide-bg" aria-hidden="true" />
                <SlideView kind={slide.kind} />
                <SlideChrome kind={slide.kind} />
                <span className="home-slide-tag">{slide.tag}</span>
              </div>
              <div className="home-slide-body">
                <strong>{slide.title}</strong>
                <small>{slide.note}</small>
                <div className="home-slide-traits">
                  {slide.traits.map((trait) => (
                    <span key={trait}>{trait}</span>
                  ))}
                </div>
                <em>{slide.source}</em>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
