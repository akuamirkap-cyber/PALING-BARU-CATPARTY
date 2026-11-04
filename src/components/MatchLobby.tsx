import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ACCESSORIES, ANIMALS, animalById, type AccessoryId, type AnimalId } from "../game/animals";
import { flagEmoji, pickFlags } from "../game/flags";
import { poseStatic } from "../game/characterMesh";
import { createRenderer } from "./webgl";
import { addLobbyLights, buildLobbyScenery, disposeLobbyActor, frameLobbyCamera, lobbySpacing, makeLobbyActor, type LobbyActor } from "./lobbyStage";
import { preloadCharacters } from "../game/characterPreload";
import Portrait from "./Portrait";
import { randomFaceCombo, isDefaultFace, type EyeStyleId, type ExpressionId } from "../game/eyes";

export interface LobbyMember {
  id: string;
  name: string;
  flag: string;
  animal: AnimalId;
  accessory: AccessoryId;
  eyeStyle?: EyeStyleId;
  expression?: ExpressionId;
  you?: boolean;
  friend?: boolean;
}

const BOT_NAMES = ["Kopi", "Gembul", "Tigor", "Siti", "Bagas", "Boba", "Nyan"];

/**
 * Build the matchmaking line-up: you in the middle, your couch friend next to
 * you, and the bots filling the rest of the row with their own cat + headgear.
 */
export function buildRoster(opts: {
  you: { animal: AnimalId; accessory: AccessoryId; eyeStyle: EyeStyleId; expression: ExpressionId };
  friend?: { animal: AnimalId; accessory: AccessoryId } | null;
  bots: number;
}): LobbyMember[] {
  const flags = pickFlags(32);
  // same face pool as the real match bots — no grumpy, cheerful mix only
  const used = new Set<AnimalId>([opts.you.animal]);
  if (opts.friend) used.add(opts.friend.animal);
  const pool = ANIMALS.map((a) => a.id).filter((id) => !used.has(id));
  const crowded: LobbyMember[] = [];
  for (let i = 0; i < opts.bots; i++) {
    const animal = pool[i % pool.length] ?? ANIMALS[i % ANIMALS.length].id;
    const accessory = ACCESSORIES[1 + ((i * 5) % Math.max(1, ACCESSORIES.length - 1))].id;
    crowded.push({
      id: `bot-${i}`,
      name: BOT_NAMES[i % BOT_NAMES.length],
      animal,
      accessory,
      flag: flags[i % flags.length],
      ...randomFaceCombo(),
    });
  }
  const youStyled = isDefaultFace(opts.you.eyeStyle, opts.you.expression) ? randomFaceCombo() : { eyeStyle: opts.you.eyeStyle, expression: opts.you.expression };
  const you: LobbyMember = {
    id: "you",
    name: "KAMU",
    animal: opts.you.animal,
    accessory: opts.you.accessory,
    eyeStyle: youStyled.eyeStyle,
    expression: youStyled.expression,
    you: true,
    flag: "id",
  };
  // You always stand in the middle of the row, your couch buddy right beside you.
  const pair: LobbyMember[] = [];
  if (opts.friend) {
    pair.push({ id: "p2", name: "P2", animal: opts.friend.animal, accessory: opts.friend.accessory, friend: true, flag: flags[1], ...randomFaceCombo() });
  }
  pair.push(you);
  const start = Math.floor((crowded.length + pair.length - pair.length) / 2);
  return [...crowded.slice(0, start), ...pair, ...crowded.slice(start)];
}

interface StageProps {
  roster: LobbyMember[];
  ready: boolean[];
  paused: boolean;
}

const CAMERA_FOV = 30;

function LobbyStage({ roster, ready, paused }: StageProps) {
  const [glDead, setGlDead] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = host.current!;
    const renderer = createRenderer(
      el,
      { antialias: true, alpha: true, powerPreference: "low-power" },
      () => setGlDead(true),
    );
    if (!renderer) {
      // Keep the DOM (hill, roster, dock) alive — never a blank stage.
      setGlDead(true);
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
    addLobbyLights(scene);
    const scenery = buildLobbyScenery(scene);

    const actors: LobbyActor[] = [];
    let spot: THREE.Mesh | null = null;
    let buildTimer = 0;
    let preloader: AbortController | null = null;
    let cancelled = false;

    const clearActors = () => {
      for (const a of actors) disposeLobbyActor(scene, a);
      actors.length = 0;
      if (spot) {
        scene.remove(spot);
        spot.geometry.dispose();
        (spot.material as THREE.Material).dispose();
        spot = null;
      }
    };

    const spacing = lobbySpacing(roster.length);
    const center = (roster.length - 1) / 2;

    const assemble = () => {
      if (cancelled) return;
      clearActors();
      const step = (i: number) => {
        if (cancelled || i >= roster.length) return;
        const member = roster[i];
        const actor = makeLobbyActor(scene, member, i, center, spacing, performance.now() + i * 90);
        actors.push(actor);
        if (member.you) {
          spot = new THREE.Mesh(
            new THREE.CircleGeometry(0.62, 40),
            new THREE.MeshBasicMaterial({ color: 0xfff6c4, transparent: true, opacity: 0.62, depthWrite: false }),
          );
          spot.rotation.x = -Math.PI / 2;
          spot.position.set(actor.x, 0.006, actor.group.position.z);
          spot.scale.set(1, 0.55, 1);
          scene.add(spot);
        }
        buildTimer = window.setTimeout(() => step(i + 1), 14);
      };
      step(0);
    };

    const rebuild = () => {
      clearTimeout(buildTimer);
      preloader?.abort();
      const controller = new AbortController();
      preloader = controller;
      const jobs = roster.map((m) => ({
        id: m.animal,
        noEars: m.accessory === "helmet" || m.accessory.startsWith("cap"),
      }));
      void preloadCharacters(jobs, { signal: controller.signal })
        .catch(() => {})
        .then(() => {
          if (!controller.signal.aborted) assemble();
        });
    };
    rebuild();

    // Framed distance, filled by resize() and used by the pointer parallax.
    // Declared before resize() runs: touching it later was a TDZ crash.
    let framedDist = camera.position.z;

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      frameLobbyCamera(camera, roster.length, w / h);
      framedDist = camera.position.z;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // gentle pointer parallax so the hill feels alive like the reference lobby
    const pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const head = new THREE.Vector3();
    let lastFrame = performance.now();
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      const t = (performance.now() - t0) / 1000;
      const now = performance.now();
      const dtFrame = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      camera.updateMatrixWorld();
      camera.position.x += (pointer.x * 0.42 - camera.position.x) * 0.05;
      camera.position.y += (1.62 - pointer.y * 0.14 - camera.position.y) * 0.05;
      camera.position.z += (framedDist - camera.position.z) * 0.06;
      camera.lookAt(0, 1.34, -3);
      camera.updateMatrixWorld();
      scenery.update(t, dtFrame);
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        // Idle only: the cats stand on the hill (no bouncing while matchmaking).
        poseStatic(a.v, t + a.phase);
        a.group.position.y = 0;
        // spring pop-in when the cat is built
        const k = Math.min(1, Math.max(0, (now - a.born) / 420));
        const overshoot = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, k * 1.25));
        const eased = k < 1 ? (1 - Math.pow(1 - k, 3)) * overshoot : 1;
        a.group.scale.setScalar(a.base * Math.max(0.001, eased));
        const tag = tagRefs.current[i];
        if (!tag) continue;
        head.set(a.x, a.top + 0.08 + a.group.position.y, a.group.position.z);
        head.project(camera);
        const visible = head.z < 1;
        tag.style.opacity = visible ? "1" : "0";
        tag.style.transform = `translate(-50%, -100%) translate(${((head.x + 1) / 2) * el.clientWidth}px, ${((1 - head.y) / 2) * el.clientHeight - 10}px)`;
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", onPointer);
      cancelAnimationFrame(raf);
      clearTimeout(buildTimer);
      preloader?.abort();
      ro.disconnect();
      clearActors();
      scenery.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [roster, paused]);

  return (
    <>
      <div ref={host} className="ml-stage" aria-hidden="true" />
      {glDead && (
        <div className="ml-gl-note" role="status">
          Mode ringan: 3D mati di perangkat ini, tetap bisa lanjut main.
        </div>
      )}
      <div ref={tags} className="ml-tags" aria-hidden="true">
        {roster.map((member, i) => (
          <div
            key={member.id}
            ref={(node) => {
              tagRefs.current[i] = node;
            }}
            className={`ml-tag ${member.you ? "is-you" : ""} ${member.friend ? "is-friend" : ""} ${ready[i] ? "is-ready" : ""}`}
          >
            <b>{member.name}<span className="ml-flag">{flagEmoji(member.flag)}</span></b>
            <span>{ready[i] ? "SIAP" : "MENUNGGU"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const MATCH_SECONDS = 12;

interface Props {
  you: { animal: AnimalId; accessory: AccessoryId; eyeStyle: EyeStyleId; expression: ExpressionId };
  friend: { animal: AnimalId; accessory: AccessoryId } | null;
  bots: number;
  mode: "brawl" | "bomb" | "teams";
  onChangeAnimal: (step: number) => void;
  onPickAnimal: (id: AnimalId) => void;
  onWardrobe: () => void;
  onCancel: () => void;
  onStart: () => void;
}

/** Matchmaking lobby: every cat of the match is lined up until everyone is ready. */
export default function MatchLobby({ you, friend, bots, mode, onChangeAnimal, onPickAnimal, onWardrobe, onCancel, onStart }: Props) {
  // Only the actually-used values are dependencies: rebuilding the stage on every
  // parent render would re-create every cat mesh mid-match.
  const roster = useMemo(
    () => buildRoster({ you, friend, bots }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [you.animal, you.accessory, you.eyeStyle, you.expression, friend?.animal, friend?.accessory, bots],
  );
  const [seconds, setSeconds] = useState(MATCH_SECONDS);
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  // Bots trickle in at their own pace so the line-up feels alive.
  const botTimes = useMemo(
    () => roster.map((m, i) => (m.you || m.friend ? Infinity : 0.7 + ((i * 1.9) % 3.4))),
    [roster],
  );
  const elapsed = MATCH_SECONDS - seconds;
  const readyList = roster.map((m, i) => (m.you ? ready : m.friend ? true : elapsed >= botTimes[i]));
  const allReady = readyList.every(Boolean);

  const fire = () => {
    if (started.current) return;
    started.current = true;
    onStart();
  };

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => Math.max(0, +(s - 0.1).toFixed(1))), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (seconds <= 0) fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  useEffect(() => {
    if (!allReady) return;
    const id = window.setTimeout(fire, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") { e.preventDefault(); onCancel(); }
      if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); setReady((r) => !r); }
      if (e.code === "ArrowLeft" || e.code === "KeyA") onChangeAnimal(-1);
      if (e.code === "ArrowRight" || e.code === "KeyD") onChangeAnimal(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onChangeAnimal]);

  const progress = Math.max(0, seconds / MATCH_SECONDS);
  const ring = 2 * Math.PI * 22;
  const youMember = roster.find((m) => m.you)!;

  return (
    <div className="ml-screen" data-screen="matching">
      <div className="ml-hill" aria-hidden="true" />
      <LobbyStage roster={roster} ready={readyList} paused={false} />

      <div className="ml-top">
        <button type="button" className="ml-back" onClick={onCancel}>
          <span>‹</span> BATAL <kbd>ESC</kbd>
        </button>
        <span className={`ml-mode ${mode === "bomb" ? "is-bomb" : mode === "teams" ? "is-team" : ""}`}>{mode === "bomb" ? "💣 LEMPAR BOM" : mode === "teams" ? "🚩 TIM 5V5" : "⚔️ BRAWL"}</span>
        <div className="ml-top-right">
          <button type="button" className="ml-wardrobe" onClick={onWardrobe}>👕 AKSESORIS</button>
          <span className="ml-count">{roster.length} KUCING</span>
        </div>
      </div>

      <div className="ml-timer">
        <div className="ml-ring">
          <svg viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(59,42,26,.12)" strokeWidth="6" />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke={seconds <= 4 ? "#ff4d1a" : "#f5b400"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring * (1 - progress)}
              transform="rotate(-90 28 28)"
              style={{ transition: "stroke-dashoffset .1s linear, stroke .3s" }}
            />
          </svg>
          <span className={seconds <= 4 ? "is-urgent" : ""}>{Math.ceil(seconds)}</span>
        </div>
        <div className="ml-timer-text">
          <small>{allReady ? "SEMUA SIAP!" : "PERTANDINGAN MULAI DALAM"}</small>
          <div className="ml-dots">
            {readyList.map((r, i) => (
              <i key={roster[i].id} className={`${r ? "is-on" : ""} ${roster[i].you ? "is-you" : ""}`} />
            ))}
            <b>{readyList.filter(Boolean).length}/{roster.length}</b>
          </div>
        </div>
      </div>

      <div className="ml-dock">
      <div className="ml-pick-title">PILIH KARAKTER</div>
      <div className="ml-picker">
        <button type="button" aria-label="Kucing sebelumnya" onClick={() => onChangeAnimal(-1)}>‹</button>
        <div>
          <strong>{animalById(you.animal).name}</strong>
          <small>{animalById(you.animal).tagline}</small>
        </div>
        <button type="button" aria-label="Kucing berikutnya" onClick={() => onChangeAnimal(1)}>›</button>
      </div>

      <div className="ml-deck" role="group" aria-label="Pilih kucing">
        {ANIMALS.map((a) => (
          <div className="ml-deck-wrap" key={a.id}>
            <button
              type="button"
              className={`ml-deck-cat ${you.animal === a.id ? "is-on" : ""}`}
              title={a.name}
              aria-pressed={you.animal === a.id}
              onClick={() => onPickAnimal(a.id)}
            >
              <Portrait id={a.id} fallback={a.emoji} />
            </button>
            <small className="ml-deck-name">{a.name}</small>
          </div>
        ))}
      </div>

      <div className="ml-ready-wrap">
        <button type="button" className={`ml-ready ${ready ? "is-on" : ""}`} onClick={() => setReady((r) => !r)}>
          <span>{ready ? "✓" : "A"}</span>
          {ready ? "SIAP!" : "SIAPKAN DIRI"}
        </button>
        <small>{youMember.name === "KAMU" && ready ? "Tekan lagi untuk batal" : "Tunggu semua kucing siap"}</small>
      </div>
      </div>

      <div className="ml-hint">← → ganti kucing · ENTER siap · ESC batal</div>
    </div>
  );
}
