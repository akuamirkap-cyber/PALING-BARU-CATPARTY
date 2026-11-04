import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { sfx, duckMusic } from "./audio";
import { JButton, KeyHint, MuteButton } from "./ui";
import { Dressed, labelHeight, type Hat, type Glass } from "./Lobby";

export type Loadout = { fur?: string; color: string; metal?: boolean; hat: Hat; glasses: Glass; duck: boolean; gloves: boolean; hammer: boolean; shorts?: boolean; belt?: boolean; broom?: boolean; clown?: boolean };

/* ---------------- deck shape ---------------- */
const A_F = 10, A_B = 8, BW = 4.6;
function edgePt(t: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  const e = c > 0 ? 2.3 : 4.5, A = c > 0 ? A_F : A_B;
  return [A * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), BW * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)];
}
function onDeck(x: number, z: number, k = 1) {
  const A = (x > 0 ? A_F : A_B) * k, e = x > 0 ? 2.3 : 4.5;
  return Math.pow(Math.abs(x) / A, e) + Math.pow(Math.abs(z) / (BW * k), e) <= 1;
}
function deckShape(k: number) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 160; i++) {
    const [x, z] = edgePt((i / 160) * Math.PI * 2);
    if (i) s.lineTo(x * k, z * k); else s.moveTo(x * k, z * k);
  }
  return s;
}

const CABIN = { x0: -7.4, x1: -4.6, z0: -2.1, z1: 2.1 };
const POSTS = [{ x: 7.2, z: 0, r: 0.3 }, { x: 3.8, z: 2.5, r: 0.48 }, { x: 3.8, z: -2.5, r: 0.48 }];
const DURATION = 90;
const WATER_Y = -1.55;

const BOTS: { name: string; look: Loadout }[] = [
  { name: "Mochi", look: { fur: "siamese", color: "#64748b", hat: "cap", glasses: null, duck: false, gloves: false, hammer: true } },
  { name: "luffy", look: { fur: "gray", color: "#a8a29e", hat: "afro", glasses: null, duck: false, gloves: true, hammer: false, shorts: true, clown: true } },
  { name: "Epun", look: { fur: "snow", color: "#d6d3d1", hat: null, glasses: "pixel", duck: true, gloves: false, hammer: false, clown: true, broom: true } },
  { name: "Rattlexnake", look: { fur: "tuxedo", color: "#475569", hat: null, glasses: "classic", duck: false, gloves: true, hammer: false, shorts: true, belt: true } },
  { name: "Apiipp", look: { fur: "cream", color: "#f9a8a8", hat: "crown", glasses: null, duck: false, gloves: false, hammer: false, broom: true } },
  { name: "Kopi", look: { fur: "tabby", color: "#f59e0b", hat: "cowboy", glasses: null, duck: false, gloves: false, hammer: true } },
];

type P = {
  name: string; you: boolean; look: Loadout; r: number;
  x: number; z: number; vx: number; vz: number; y: number; vy: number;
  alive: boolean; falling: boolean; cd: number; dashT: number; fx: number; fz: number;
  hitBy: number; hitT: number; squash: number; target: number; think: number; skill: number;
};
type GS = {
  phase: "count" | "play" | "over"; startAt: number; players: P[]; lastWave: number; waveUntil: number; waveAmt: number;
  shake: number; input: { x: number; z: number; dash: boolean }; elim: number[];
};
type GEvent = { type: "out"; who: number; by: number } | { type: "wave" } | { type: "end"; survivors: number[] };

function makePlayers(look: Loadout): P[] {
  const all = [{ name: "YOU", look, you: true }, ...BOTS.map((b) => ({ ...b, you: false }))];
  return all.map((a, i) => {
    const ang = (i / all.length) * Math.PI * 2 + Math.PI / 2;
    const x = 1 + Math.cos(ang) * 4.2, z = Math.sin(ang) * 2.7;
    const d = Math.hypot(1 - x, -z) || 1;
    return {
      name: a.name, you: a.you, look: a.look, r: a.you ? 0.66 : 0.6, x, z, vx: 0, vz: 0, y: 0.6, vy: 0,
      alive: true, falling: false, cd: 0, dashT: 0, fx: (1 - x) / d, fz: -z / d, hitBy: -1, hitT: 0, squash: 0,
      target: -1, think: Math.random() * 0.5, skill: 0.8 + Math.random() * 0.35,
    };
  });
}

/* ---------------- visuals ---------------- */
function Avatar({ look, r, seed, getSpeed }: { look: Loadout; r: number; seed: number; getSpeed?: () => number }) {
  return <Dressed r={r} look={look} seed={seed} getSpeed={getSpeed} />;
}

function Ocean() {
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(240, 240, 56, 56); g.rotateX(-Math.PI / 2); return g; }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.18 + t * 1.2) * 0.3 + Math.cos(z * 0.22 + t * 0.9) * 0.25 + Math.sin((x + z) * 0.07 + t * 0.5) * 0.35);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} position={[0, -2.0, 0]} receiveShadow>
      <meshStandardMaterial color="#1aa3ff" roughness={0.2} metalness={0.15} flatShading />
    </mesh>
  );
}

function Islands() {
  const list: [number, number, number][] = [[-50, -70, 1.2], [65, -80, 1.6], [-95, -25, 1], [25, -110, 2], [100, -30, 0.9]];
  return (
    <>
      {list.map(([x, z, s], i) => (
        <group key={i} position={[x, -2, z]} scale={s}>
          <mesh scale={[1, 0.25, 1]}><sphereGeometry args={[9, 24, 12]} /><meshStandardMaterial color="#fde68a" roughness={1} flatShading /></mesh>
          <mesh position={[0, 1.5, 0]} scale={[1, 0.6, 1]}><icosahedronGeometry args={[6, 1]} /><meshStandardMaterial color="#34d399" roughness={1} flatShading /></mesh>
          {[[-3, 2], [3, -1]].map(([px, pz], k) => (
            <group key={k} position={[px, 4, pz]}>
              <mesh position={[0, 2, 0]} rotation-z={0.15}><cylinderGeometry args={[0.25, 0.35, 5, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
              {[0, 1, 2, 3, 4].map((l) => (
                <mesh key={l} position={[Math.cos(l * 1.26) * 1.4 + 0.3, 4.4, Math.sin(l * 1.26) * 1.4]} rotation={[Math.sin(l * 1.26) * 0.5, 0, -Math.cos(l * 1.26) * 0.5]} scale={[1.8, 0.15, 0.6]}>
                  <sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial color="#16a34a" flatShading />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {[[-30, 30, -90], [40, 35, -100], [0, 40, -130], [-80, 28, -60], [90, 32, -70]].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          {[[0, 0, 6], [5, -1, 4.5], [-5, -1, 4.5], [2, 2, 4]].map(([cx, cy, cr], k) => (
            <mesh key={k} position={[cx, cy, 0]}><sphereGeometry args={[cr, 16, 12]} /><meshStandardMaterial color="#ffffff" roughness={1} emissive="#ffffff" emissiveIntensity={0.25} /></mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function Gulls() {
  const g = useRef<THREE.Group>(null!);
  const wings = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    g.current.rotation.y = t * 0.25;
    wings.current.forEach((w, i) => w && (w.rotation.z = (i % 2 ? -1 : 1) * Math.sin(t * 8 + i) * 0.5));
  });
  return (
    <group ref={g} position={[1, 7, 0]}>
      {[0, 1].map((b) => (
        <group key={b} position={[b ? -9 : 11, b ? 1 : 0, 0]} rotation-y={b ? Math.PI : 0}>
          <mesh scale={[0.25, 0.22, 0.6]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0, 0.05, 0.6]}><coneGeometry args={[0.06, 0.2, 6]} /><meshStandardMaterial color="#f59e0b" /></mesh>
          {[-1, 1].map((s, k) => (
            <mesh key={s} ref={(el) => { if (el) wings.current[b * 2 + k] = el; }} position={[0, 0.08, 0]}>
              <boxGeometry args={[0.02, 0.02, 0.02]} />
              <mesh position={[s * 0.55, 0, 0]} scale={[0.55, 0.04, 0.25]}><sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Ship() {
  const smoke = useRef<THREE.Mesh[]>([]);
  const radar = useRef<THREE.Mesh>(null!);
  const flagsRef = useRef<THREE.Group>(null!);
  const geos = useMemo(() => {
    const deck = new THREE.ShapeGeometry(deckShape(1)); deck.rotateX(-Math.PI / 2);
    const ext = (k: number, depth: number) => {
      const g = new THREE.ExtrudeGeometry(deckShape(k), { depth, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4 });
      g.rotateX(Math.PI / 2); return g;
    };
    const rimS = deckShape(1.025); rimS.holes.push(deckShape(0.985));
    const rim = new THREE.ExtrudeGeometry(rimS, { depth: 0.16, bevelEnabled: false }); rim.rotateX(-Math.PI / 2);
    const foamS = deckShape(1.18); foamS.holes.push(deckShape(1.0));
    const foam = new THREE.ShapeGeometry(foamS); foam.rotateX(-Math.PI / 2);
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ["#dca56b", "#d29a5e", "#e0ad76", "#cf955a"][i % 4]; g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = "#8f5f34"; g.fillRect(0, i * 32, 256, 2);
      g.fillRect((i * 97) % 256, i * 32, 2, 32);
      g.fillStyle = "rgba(120,70,30,.15)"; for (let k = 0; k < 6; k++) g.fillRect((i * 53 + k * 41) % 256, i * 32 + 8 + (k % 3) * 6, 30, 1);
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.22, 0.38); tex.colorSpace = THREE.SRGBColorSpace;
    return { deck, top: ext(1, 0.55), stripe: ext(1.008, 0.18), bottom: ext(0.97, 1.4), rim, foam, tex };
  }, []);
  const flags = useMemo(() => {
    const a = new THREE.Vector3(7.2, 5.2, 0), b = new THREE.Vector3(-6.3, 3.5, 0);
    const cols = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ec4899", "#f97316"];
    return Array.from({ length: 22 }, (_, i) => {
      const t = (i + 0.5) / 22; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 1.0;
      return { p, c: cols[i % cols.length] };
    });
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    radar.current.rotation.y = t * 2;
    smoke.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.35 + i / 5) % 1;
      m.position.set(-6.9 - k * 1.6, 4.1 + k * 2.4, Math.sin(k * 6 + i) * 0.2);
      m.scale.setScalar(0.25 + k * 0.6);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.85 * (1 - k);
    });
    flagsRef.current.children.forEach((f, i) => (f.rotation.x = Math.sin(t * 4 + i * 0.7) * 0.35));
  });
  const white = { color: "#fbfaf6", roughness: 0.35 };
  const glass = { color: "#1e293b", roughness: 0.05, metalness: 0.6 };
  return (
    <group>
      <mesh geometry={geos.foam} position={[0, WATER_Y + 0.05, 0]}><meshBasicMaterial color="#ffffff" transparent opacity={0.55} /></mesh>
      <mesh geometry={geos.top} castShadow receiveShadow><meshStandardMaterial {...white} /></mesh>
      <mesh geometry={geos.stripe} position={[0, -0.55, 0]}><meshStandardMaterial color="#1e3a8a" roughness={0.4} /></mesh>
      <mesh geometry={geos.bottom} position={[0, -0.72, 0]} castShadow><meshStandardMaterial color="#e5322d" roughness={0.35} /></mesh>
      <mesh geometry={geos.deck} position={[0, 0.01, 0]} receiveShadow><meshStandardMaterial map={geos.tex} roughness={0.8} /></mesh>
      <mesh geometry={geos.rim} castShadow><meshStandardMaterial color="#ffffff" roughness={0.4} /></mesh>
      {/* center ring + hatch */}
      <mesh rotation-x={-Math.PI / 2} position={[1, 0.02, 0]} receiveShadow><ringGeometry args={[2.1, 2.35, 64]} /><meshStandardMaterial color="#facc15" roughness={0.6} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[1, 0.02, 0]} receiveShadow><circleGeometry args={[0.6, 32]} /><meshStandardMaterial color="#ef4444" roughness={0.6} /></mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} rotation-z={(i / 12) * Math.PI * 2} position={[1 + Math.cos((i / 12) * Math.PI * 2) * 1.5, 0.021, -Math.sin((i / 12) * Math.PI * 2) * 1.5]}>
          <planeGeometry args={[0.35, 0.12]} /><meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
      {/* portholes */}
      {[-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5].map((x) => [-1, 1].map((sd) => {
        const A = x > 0 ? A_F : A_B, e = x > 0 ? 2.3 : 4.5;
        const z = BW * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / A, e)), 1 / e) + 0.13;
        return (
          <group key={x + "_" + sd} position={[x, -0.28, sd * z]} rotation-y={sd > 0 ? 0 : Math.PI}>
            <mesh><circleGeometry args={[0.17, 20]} /><meshStandardMaterial color="#7dd3fc" emissive="#bae6fd" emissiveIntensity={0.4} /></mesh>
            <mesh position={[0, 0, 0.005]}><ringGeometry args={[0.17, 0.22, 20]} /><meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.3} /></mesh>
          </group>
        );
      }))}
      {/* cabin */}
      <group position={[(CABIN.x0 + CABIN.x1) / 2, 0, 0]}>
        <mesh position={[0, 1.0, 0]} castShadow receiveShadow><boxGeometry args={[2.8, 2.0, 4.2]} /><meshStandardMaterial {...white} /></mesh>
        <mesh position={[1.41, 1.3, 0]}><boxGeometry args={[0.02, 0.55, 3.6]} /><meshStandardMaterial {...glass} /></mesh>
        <mesh position={[1.41, 0.5, 0]}><boxGeometry args={[0.03, 1.0, 0.7]} /><meshStandardMaterial color="#1e3a8a" /></mesh>
        <mesh position={[1.43, 0.5, 0.22]}><sphereGeometry args={[0.05]} /><meshStandardMaterial color="#facc15" metalness={1} /></mesh>
        {[-1, 1].map((sd) => <mesh key={sd} position={[0, 1.3, sd * 2.11]}><boxGeometry args={[2.3, 0.5, 0.02]} /><meshStandardMaterial {...glass} /></mesh>)}
        <mesh position={[0, 2.05, 0]} castShadow><boxGeometry args={[3.1, 0.12, 4.5]} /><meshStandardMaterial color="#1e3a8a" roughness={0.4} /></mesh>
        <mesh position={[-0.2, 2.6, 0]} castShadow><boxGeometry args={[1.9, 1.0, 3.0]} /><meshStandardMaterial {...white} /></mesh>
        <mesh position={[0.76, 2.7, 0]}><boxGeometry args={[0.02, 0.45, 2.6]} /><meshStandardMaterial {...glass} /></mesh>
        <mesh position={[-0.2, 3.15, 0]} castShadow><boxGeometry args={[2.2, 0.12, 3.3]} /><meshStandardMaterial color="#e5322d" roughness={0.4} /></mesh>
        <mesh position={[-0.2, 3.6, 0]}><cylinderGeometry args={[0.04, 0.04, 0.8]} /><meshStandardMaterial color="#9ca3af" /></mesh>
        <mesh ref={radar} position={[-0.2, 4.0, 0]}><boxGeometry args={[0.9, 0.08, 0.12]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        {/* funnel */}
        <group position={[-0.9, 3.2, 0]}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.32, 0.4, 1.1, 24]} /><meshStandardMaterial color="#e5322d" roughness={0.35} /></mesh>
          <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.37, 0.37, 0.18, 24]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0, 1.07, 0]}><cylinderGeometry args={[0.33, 0.33, 0.1, 24]} /><meshStandardMaterial color="#111" /></mesh>
        </group>
        {/* life buoys */}
        {[-1.4, 1.4].map((z) => (
          <group key={z} position={[1.44, 1.05, z]} rotation-y={Math.PI / 2}>
            {[0, 1, 2, 3].map((q) => (
              <mesh key={q} rotation-z={(q * Math.PI) / 2}><torusGeometry args={[0.3, 0.1, 12, 24, Math.PI / 2]} /><meshStandardMaterial color={q % 2 ? "#ffffff" : "#ef4444"} roughness={0.4} /></mesh>
            ))}
          </group>
        ))}
      </group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(el) => { if (el) smoke.current[i] = el; }}>
          <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#f8fafc" transparent opacity={0.7} roughness={1} />
        </mesh>
      ))}
      {/* mast + crow's nest */}
      <group position={[POSTS[0].x, 0, 0]}>
        <mesh position={[0, 2.8, 0]} castShadow><cylinderGeometry args={[0.12, 0.18, 5.6, 12]} /><meshStandardMaterial color="#8b5a2b" roughness={0.7} /></mesh>
        <mesh position={[0, 4.6, 0]}><cylinderGeometry args={[0.55, 0.45, 0.4, 20, 1, true]} /><meshStandardMaterial color="#8b5a2b" side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 5.9, 0.35]}><planeGeometry args={[0.7, 0.45]} /><meshStandardMaterial color="#ef4444" side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.3, 0.35, 0.3, 16]} /><meshStandardMaterial color="#334155" /></mesh>
      </group>
      <group ref={flagsRef}>
        {flags.map((f, i) => (
          <mesh key={i} position={f.p} rotation-z={Math.PI}><coneGeometry args={[0.14, 0.3, 3]} /><meshStandardMaterial color={f.c} side={THREE.DoubleSide} /></mesh>
        ))}
      </group>
      {/* barrels */}
      {POSTS.slice(1).map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.42, 0.42, 1.0, 20]} /><meshStandardMaterial color="#b45309" roughness={0.7} /></mesh>
          {[0.18, 0.82].map((y) => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.44, 0.44, 0.07, 20]} /><meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} /></mesh>)}
          <mesh position={[0, 1.02, 0]}><cylinderGeometry args={[0.38, 0.38, 0.04, 20]} /><meshStandardMaterial color="#d97706" /></mesh>
        </group>
      ))}
      {/* rope coils + fish crate */}
      {[[-3, 3.2], [5.8, -2.2]].map(([x, z], i) => (
        <group key={i} position={[x, 0.06, z]}>
          {[0, 1, 2].map((k) => <mesh key={k} position={[0, k * 0.07, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.35 - k * 0.06, 0.04, 8, 24]} /><meshStandardMaterial color="#e9d5a1" roughness={0.9} /></mesh>)}
        </group>
      ))}
      <group position={[-3.2, 0, -3.1]}>
        <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[0.9, 0.4, 0.6]} /><meshStandardMaterial color="#38bdf8" /></mesh>
        {[[-0.2, "#fb923c"], [0.15, "#facc15"]].map(([x, c]) => (
          <mesh key={String(c)} position={[x as number, 0.43, 0]} rotation-z={0.2} scale={[1.6, 0.8, 0.6]}><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color={c as string} /></mesh>
        ))}
      </group>
      {/* fishing rods off the stern */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[-7.6, 0.15, sd * 3.0]} rotation={[sd * 0.5, 0, 0.9]}>
          <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.015, 0.04, 2.2, 8]} /><meshStandardMaterial color="#27272a" /></mesh>
          <mesh position={[0.05, 0.25, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.08, 0.08, 0.06, 16]} /><meshStandardMaterial color="#facc15" metalness={0.6} /></mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------------- simulation ---------------- */
function Arena({ G, onEvent }: { G: MutableRefObject<GS>; onEvent: (e: GEvent) => void }) {
  const ship = useRef<THREE.Group>(null!);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const drops = useRef<(THREE.Mesh | null)[]>([]);
  const dropData = useRef(Array.from({ length: 100 }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, s: 1 })));
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const ringData = useRef(Array.from({ length: 8 }, () => ({ on: false, x: 0, z: 0, t: 0 })));
  const focus = useRef(new THREE.Vector3(1, 0, 0));
  const t0 = useRef<number | null>(null);
  const { size } = useThree();

  const burst = (x: number, y: number, z: number, color: string, n: number, spd: number, s = 1) => {
    let k = 0;
    dropData.current.forEach((d, i) => {
      if (d.on || k >= n) return;
      k++;
      const a = Math.random() * Math.PI * 2, u = 0.4 + Math.random() * 0.6;
      Object.assign(d, { on: true, x, y, z, vx: Math.cos(a) * spd * u, vz: Math.sin(a) * spd * u, vy: spd * (0.8 + Math.random() * 0.9), life: 1, s: s * (0.6 + Math.random() * 0.6) });
      const m = drops.current[i];
      if (m) (m.material as THREE.MeshBasicMaterial).color.set(color);
    });
  };

  useFrame(({ clock, camera }, raw) => {
    const dt = Math.min(raw, 1 / 30);
    const g = G.current;
    const t = clock.getElapsedTime();
    if (t0.current === null) t0.current = t;
    const now = performance.now();
    const elapsed = g.phase === "play" ? (now - g.startAt) / 1000 : 0;

    // waves
    if (g.phase === "play" && now - g.lastWave > 14000) { g.lastWave = now; g.waveUntil = now + 3500; onEvent({ type: "wave" }); }
    g.waveAmt = THREE.MathUtils.lerp(g.waveAmt, now < g.waveUntil ? 1 : 0, dt * 1.5);
    const amp = 0.04 + Math.min(elapsed / DURATION, 1) * 0.06 + g.waveAmt * 0.16;
    const roll = Math.sin(t * 0.8) * amp, pitch = Math.sin(t * 0.5 + 1) * amp * 0.35;
    ship.current.rotation.set(roll, 0, pitch);
    ship.current.position.y = Math.sin(t * 1.1) * 0.12;
    const tiltX = -9.8 * Math.sin(pitch), tiltZ = 9.8 * Math.sin(roll);

    const P = g.players;
    const active = g.phase === "play";

    P.forEach((p, i) => {
      if (!p.alive) return;
      p.cd -= dt; p.dashT -= dt; p.hitT -= dt;
      if (p.falling) {
        p.vy -= 24 * dt; p.y += p.vy * dt; p.x += p.vx * dt * 0.6; p.z += p.vz * dt * 0.6;
        if (p.y < WATER_Y) {
          p.alive = false; g.elim.push(i);
          burst(p.x, WATER_Y + 0.1, p.z, "#e0f7ff", 26, 5, 1.2);
          const rd = ringData.current.find((r) => !r.on); if (rd) Object.assign(rd, { on: true, x: p.x, z: p.z, t: 0 });
          if (p.you) g.shake = 0.6;
          sfx.splash();
          onEvent({ type: "out", who: i, by: p.hitT > 0 ? p.hitBy : -1 });
        }
        return;
      }
      let ax = 0, az = 0, wantDash = false, dashX = p.fx, dashZ = p.fz;
      if (active) {
        if (p.you) {
          ax = g.input.x; az = g.input.z;
          const l = Math.hypot(ax, az); if (l > 1) { ax /= l; az /= l; }
          if (g.input.dash) { g.input.dash = false; wantDash = true; if (l > 0.1) { dashX = ax / Math.max(l, 1e-3); dashZ = az / Math.max(l, 1e-3); } }
          ax *= 24; az *= 24;
        } else {
          p.think -= dt;
          if (p.think <= 0) {
            p.think = 0.25 + Math.random() * 0.35;
            let best = -1, bd = 1e9;
            P.forEach((q, j) => {
              if (j === i || !q.alive || q.falling) return;
              const d = Math.hypot(q.x - p.x, q.z - p.z) * (q.you ? 0.75 : 1) * (0.75 + Math.random() * 0.5);
              if (d < bd) { bd = d; best = j; }
            });
            p.target = best;
          }
          const q = P[p.target];
          let dx = 0, dz = 0, dist = 99;
          if (q && q.alive && !q.falling) {
            dx = q.x - p.x; dz = q.z - p.z; dist = Math.hypot(dx, dz);
            if (dist > 2.6) {
              const ox = q.x - 1, oz = q.z, ol = Math.hypot(ox, oz) || 1;
              dx = q.x - (ox / ol) * 1.2 - p.x; dz = q.z - (oz / ol) * 1.2 - p.z;
            }
          }
          let l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const lx = p.x + p.vx * 0.5, lz = p.z + p.vz * 0.5;
          if (!onDeck(lx, lz, 0.8)) { const cx = 1 - p.x, cz = -p.z, cl = Math.hypot(cx, cz) || 1; dx = dx * 0.2 + (cx / cl) * 1.4; dz = dz * 0.2 + (cz / cl) * 1.4; }
          dx -= tiltX * 0.06; dz -= tiltZ * 0.06;
          l = Math.hypot(dx, dz) || 1;
          ax = (dx / l) * 18 * p.skill; az = (dz / l) * 18 * p.skill;
          if (q && dist < 2.6 && p.cd <= 0 && Math.random() < dt * 3 * p.skill) {
            wantDash = true; dashX = (q.x - p.x) / dist; dashZ = (q.z - p.z) / dist;
          }
        }
        if (wantDash && p.cd <= 0) {
          p.vx += dashX * 13; p.vz += dashZ * 13; p.dashT = 0.28; p.cd = 1.1; p.squash = 1;
          if (p.you) sfx.dash();
          burst(p.x - dashX * p.r, 0.15, p.z - dashZ * p.r, "#ffffff", 6, 1.5, 0.6);
        }
      }
      p.vx += (ax + tiltX * (active ? 1 : 0.2)) * dt;
      p.vz += (az + tiltZ * (active ? 1 : 0.2)) * dt;
      const damp = Math.max(0, 1 - 2.4 * dt);
      p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz), max = p.dashT > 0 ? 18 : 7;
      if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (sp > 0.6) { p.fx = THREE.MathUtils.lerp(p.fx, p.vx / sp, 0.2); p.fz = THREE.MathUtils.lerp(p.fz, p.vz / sp, 0.2); }

      // cabin
      const cx = THREE.MathUtils.clamp(p.x, CABIN.x0, CABIN.x1), cz = THREE.MathUtils.clamp(p.z, CABIN.z0, CABIN.z1);
      const ddx = p.x - cx, ddz = p.z - cz, dd = Math.hypot(ddx, ddz);
      if (dd < p.r && dd > 1e-5) {
        const nx = ddx / dd, nz = ddz / dd; p.x = cx + nx * p.r; p.z = cz + nz * p.r;
        const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= 1.6 * vn * nx; p.vz -= 1.6 * vn * nz; }
      }
      POSTS.forEach((o) => {
        const ox = p.x - o.x, oz = p.z - o.z, od = Math.hypot(ox, oz), min = p.r + o.r;
        if (od < min && od > 1e-5) {
          const nx = ox / od, nz = oz / od; p.x = o.x + nx * min; p.z = o.z + nz * min;
          const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= 1.6 * vn * nx; p.vz -= 1.6 * vn * nz; }
        }
      });
      if (!onDeck(p.x, p.z)) { p.falling = true; p.vy = 2.5; p.y = p.r; sfx.fall(); }
    });

    // ball-ball
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (!a.alive || !b.alive || a.falling || b.falling) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d >= min || d < 1e-5) continue;
      const nx = dx / d, nz = dz / d, ov = (min - d) / 2;
      a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
      const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vrel > 0) {
        const jimp = vrel * 0.8;
        a.vx -= jimp * nx; a.vz -= jimp * nz; b.vx += jimp * nx; b.vz += jimp * nz;
        let big = false;
        const wa = a.look.hammer || a.look.broom ? 1.35 : 1, wb = b.look.hammer || b.look.broom ? 1.35 : 1;
        if (a.dashT > 0) { b.vx += nx * 9 * wa; b.vz += nz * 9 * wa; b.hitBy = i; b.hitT = 2.5; a.dashT = 0; big = true; }
        if (b.dashT > 0) { a.vx -= nx * 9 * wb; a.vz -= nz * 9 * wb; a.hitBy = j; a.hitT = 2.5; b.dashT = 0; big = true; }
        if (!big && vrel > 2) { b.hitBy = i; b.hitT = 1.5; a.hitBy = j; a.hitT = 1.5; }
        a.squash = Math.max(a.squash, Math.min(1, vrel / 8)); b.squash = Math.max(b.squash, Math.min(1, vrel / 8));
        if (big) sfx.hit(a.you || b.you ? 1 : 0.5); else if (vrel > 3) sfx.bump();
        if (big || vrel > 4) {
          burst((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2, "#fde047", big ? 12 : 5, big ? 4 : 2.5, 0.7);
          if (a.you || b.you) g.shake = Math.max(g.shake, big ? 0.35 : 0.15);
        }
      }
    }

    // end check
    if (g.phase === "play") {
      const alive = P.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
      if (alive.length <= 1 || elapsed >= DURATION) { g.phase = "over"; onEvent({ type: "end", survivors: alive }); }
    }

    // render players
    P.forEach((p, i) => {
      const b = bodies.current[i]; if (!b) return;
      b.visible = p.alive;
      const lab = labels.current[i]; if (lab) lab.style.opacity = p.alive ? "1" : "0";
      if (!p.alive) return;
      const bob = p.falling ? 0 : Math.abs(Math.sin(t * 9 + i)) * Math.min(Math.hypot(p.vx, p.vz) / 7, 1) * 0.12;
      b.position.set(p.x, (p.falling ? p.y : p.r) + bob, p.z);
      b.rotation.y = Math.atan2(p.fx, p.fz);
      if (p.falling) b.rotation.x += dt * 8;
      p.squash = Math.max(0, p.squash - dt * 4);
      const sq = 1 - Math.sin(p.squash * Math.PI) * 0.22;
      b.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    });

    // particles
    dropData.current.forEach((d, i) => {
      const m = drops.current[i]; if (!m) return;
      if (!d.on) { m.visible = false; return; }
      d.vy -= 14 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.life -= dt * 1.1;
      if (d.life <= 0 || d.y < WATER_Y - 0.3) d.on = false;
      m.visible = d.on; m.position.set(d.x, d.y, d.z); m.scale.setScalar(0.12 * d.s * Math.max(d.life, 0.2));
    });
    ringData.current.forEach((r, i) => {
      const m = rings.current[i]; if (!m) return;
      if (!r.on) { m.visible = false; return; }
      r.t += dt; if (r.t > 1.4) r.on = false;
      m.visible = r.on; m.position.set(r.x, WATER_Y + 0.12, r.z); m.scale.setScalar(0.5 + r.t * 2.2);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - r.t * 0.65);
    });

    // camera
    const aspect = size.width / size.height;
    const D = THREE.MathUtils.clamp(Math.max(17, 12 / (Math.tan(THREE.MathUtils.degToRad(19)) * aspect)), 17, 42);
    const you = P[0];
    const target = new THREE.Vector3(1, 0, 0.5);
    if (you.alive && !you.falling) target.lerp(new THREE.Vector3(you.x, 0, you.z), 0.22);
    focus.current.lerp(target, 0.05);
    const intro = Math.min((t - t0.current) / 2.6, 1), ease = 1 - Math.pow(1 - intro, 3);
    const dist = D * (1 + (1 - ease) * 0.9);
    const ang = THREE.MathUtils.lerp(-0.9, 0, ease);
    const desired = new THREE.Vector3(focus.current.x + Math.sin(ang) * dist * 0.62, dist * 0.8, focus.current.z + Math.cos(ang) * dist * 0.62);
    camera.position.lerp(desired, intro < 1 ? 0.2 : 0.06);
    g.shake = Math.max(0, g.shake - dt * 1.5);
    camera.position.x += (Math.random() - 0.5) * g.shake; camera.position.y += (Math.random() - 0.5) * g.shake;
    camera.lookAt(focus.current.x, -0.5, focus.current.z);
  });

  return (
    <>
      <Ocean />
      <Islands />
      <Gulls />
      <group ref={ship}>
        <Ship />
        {G.current.players.map((p, i) => (
          <group key={p.name} ref={(el) => { bodies.current[i] = el; }} position={[p.x, p.r, p.z]}>
            <Avatar look={p.look} r={p.r} seed={i * 0.7} getSpeed={() => (p.falling ? 0.6 : Math.hypot(p.vx, p.vz) / 6)} />
            <Html position={[0, labelHeight(p.r, p.look.hat) - p.r * 0.6, 0]} center distanceFactor={16} zIndexRange={[10, 0]}>
              <div ref={(el) => { labels.current[i] = el; }} className="pointer-events-none whitespace-nowrap flex flex-col items-center transition-opacity" style={{ fontFamily: "'Lilita One', sans-serif" }}>
                {p.you ? (
                  <>
                    <span className="text-[#ffd23d] text-3xl" style={{ textShadow: "0 3px 0 #9a6200" }}>YOU</span>
                    <span className="text-[#ffd23d] text-2xl -mt-2">▼</span>
                  </>
                ) : (
                  <span className="text-white text-2xl" style={{ textShadow: "0 2px 4px rgba(0,0,0,.6)" }}>{p.name}</span>
                )}
              </div>
            </Html>
          </group>
        ))}
        {dropData.current.map((_, i) => (
          <mesh key={i} ref={(el) => { drops.current[i] = el; }} visible={false}>
            <sphereGeometry args={[1, 6, 5]} /><meshBasicMaterial color="#e0f7ff" />
          </mesh>
        ))}
        {ringData.current.map((_, i) => (
          <mesh key={i} ref={(el) => { rings.current[i] = el; }} rotation-x={-Math.PI / 2} visible={false}>
            <ringGeometry args={[0.6, 0.85, 32]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/* ---------------- UI ---------------- */
type Feed = { id: number; text: string; you?: boolean };

function Match({ loadout, onExit, onAgain }: { loadout: Loadout; onExit: () => void; onAgain: () => void }) {
  const G = useRef<GS>({
    phase: "count", startAt: 0, players: makePlayers(loadout), lastWave: 0, waveUntil: 0, waveAmt: 0, shake: 0,
    input: { x: 0, z: 0, dash: false }, elim: [],
  });
  const [count, setCount] = useState<number | "GO!" | null>(3);
  useEffect(() => { const t = setTimeout(() => sfx.count(), 200); return () => clearTimeout(t); }, []);
  const [time, setTime] = useState(DURATION);
  const [alive, setAlive] = useState<boolean[]>(G.current.players.map(() => true));
  const [feed, setFeed] = useState<Feed[]>([]);
  const [wave, setWave] = useState(false);
  const [youOut, setYouOut] = useState<number | null>(null);
  const [result, setResult] = useState<{ rank: number; ranking: { name: string; rank: number; you: boolean }[]; survivors: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const feedId = useRef(0);

  useEffect(() => {
    const steps: (number | "GO!" | null)[] = [3, 2, 1, "GO!", null];
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setCount(steps[i]);
      if (typeof steps[i] === "number") sfx.count();
      if (steps[i] === "GO!") { sfx.go(); G.current.phase = "play"; G.current.startAt = performance.now(); G.current.lastWave = performance.now(); }
      if (i >= steps.length - 1) clearInterval(iv);
    }, 850);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const g = G.current;
      if (g.phase === "play") setTime((old) => { const n = Math.max(0, Math.ceil(DURATION - (performance.now() - g.startAt) / 1000)); if (n !== old && n <= 10 && n > 0) sfx.tickUrgent(); return n; });
    }, 200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    const upd = () => {
      const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const z = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      G.current.input.x = x; G.current.input.z = z;
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "shift" || k === "j") { e.preventDefault(); if (!e.repeat) G.current.input.dash = true; }
      if (k === "escape") { sfx.back(); onExit(); }
      keys.add(k); upd();
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); upd(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [onExit]);

  const push = (text: string, you?: boolean) => {
    const id = ++feedId.current;
    setFeed((f) => [...f.slice(-4), { id, text, you }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4000);
  };

  const onEvent = (e: GEvent) => {
    const P = G.current.players;
    if (e.type === "wave") { sfx.wave(); setWave(true); setTimeout(() => setWave(false), 2600); }
    if (e.type === "out") {
      setAlive(P.map((p) => p.alive));
      const v = P[e.who], by = e.by >= 0 ? P[e.by] : null;
      const vn = v.you ? "YOU" : v.name, bn = by ? (by.you ? "YOU" : by.name) : null;
      push(bn ? `${bn} 💥 ${vn} overboard!` : `${vn} slipped overboard! 💦`, v.you || by?.you);
      if (v.you) duckMusic(true);
      if (v.you) setYouOut(P.filter((p) => p.alive).length + 1);
    }
    if (e.type === "end") {
      const ranking: { name: string; rank: number; you: boolean }[] = [];
      e.survivors.forEach((i) => ranking.push({ name: P[i].name, rank: 1, you: P[i].you }));
      const order = [...G.current.elim].reverse();
      order.forEach((i, k) => ranking.push({ name: P[i].name, rank: e.survivors.length + k + 1, you: P[i].you }));
      const me = ranking.find((r) => r.you)!;
      setTimeout(() => { setResult({ rank: me.rank, ranking, survivors: e.survivors.length }); duckMusic(true); (me.rank === 1 ? sfx.win : sfx.lose)(); }, 900);
    }
  };

  const joy = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const joyMove = (e: React.PointerEvent) => {
    if (!joy.current || joy.current.id !== e.pointerId) return;
    let dx = e.clientX - joy.current.cx, dy = e.clientY - joy.current.cy;
    const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx = (dx / l) * m; dy = (dy / l) * m; }
    setKnob({ x: dx, y: dy });
    G.current.input.x = dx / m; G.current.input.z = dy / m;
  };
  const joyEnd = () => { joy.current = null; setKnob({ x: 0, y: 0 }); G.current.input.x = 0; G.current.input.z = 0; };

  const aliveCount = alive.filter(Boolean).length;
  const P = G.current.players;
  const won = result && result.rank === 1;

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none" style={{ fontFamily: "'Lilita One', sans-serif", background: "linear-gradient(#5cc8ff, #bdeaff 55%, #e6f7ff)" }}>
      <Canvas shadows camera={{ position: [0, 30, 30], fov: 38 }} dpr={[1, 1.5]} gl={{ powerPreference: "high-performance", antialias: true, stencil: false }}>
        <fog attach="fog" args={["#cdeeff", 45, 150]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#bfe9ff", "#1a6fb0", 0.7]} />
        <directionalLight position={[8, 16, 10]} intensity={2.4} color="#fff6e5" castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-0.0005} />
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 6, 6]} scale={[12, 5, 1]} color="#ffffff" />
          <Lightformer intensity={1} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} color="#bfe9ff" />
          <Lightformer intensity={1} position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} color="#fff1c7" />
          <Lightformer intensity={0.8} position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[12, 12, 1]} color="#1aa3ff" />
        </Environment>
        <Arena G={G} onEvent={onEvent} />
      </Canvas>

      {/* top bar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#fffaf0] rounded-b-[26px] px-7 pt-2 pb-3 flex items-center gap-5 shadow-[0_6px_20px_rgba(0,60,120,.3)] animate-[dropIn_.6s_.2s_both_cubic-bezier(.3,1.6,.5,1)]">
        <div className="flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b2a1a" strokeWidth="2.5"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" strokeLinecap="round" /></svg>
          <span className={`text-4xl tabular-nums ${time <= 10 ? "text-[#ff4d1a] animate-pulse" : "text-[#f5b400]"}`}>{time}</span>
        </div>
        <div className="w-px h-8 bg-[#3b2a1a]/15" />
        <div className="flex items-center gap-2 text-[#3b2a1a]">
          <span className="text-3xl text-[#16a34a]">{aliveCount}</span><span className="text-lg opacity-60">LEFT</span>
        </div>
      </div>

      <div className="absolute top-4 left-4 flex gap-3 animate-[slideL_.5s_.3s_both_cubic-bezier(.3,1.5,.5,1)]">
        <JButton sound="back" onClick={onExit} className="h-12 pl-3 pr-5 rounded-2xl bg-[#fff8ec] text-[#0b3a63] flex items-center gap-2 text-lg shadow-[0_4px_0_rgba(0,50,100,.25),0_10px_24px_rgba(0,50,100,.25)] hover:-translate-x-1">
          <span className="w-7 h-7 rounded-lg bg-[#0b3a63] text-white flex items-center justify-center">‹</span> LEAVE
        </JButton>
        <MuteButton />
      </div>

      {/* player list */}
      <div className="absolute top-20 left-4 flex flex-col gap-1.5 animate-[slideL_.5s_.45s_both_cubic-bezier(.3,1.5,.5,1)]">
        {P.map((p, i) => (
          <div key={p.name} className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-base transition-all duration-500 ${alive[i] ? "bg-white/85 text-[#3b2a1a]" : "bg-[#0b4a7a]/30 text-white/60 line-through scale-95"} ${p.you ? "ring-2 ring-[#ffd23d]" : ""}`}>
            <span className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: `radial-gradient(circle at 35% 30%, #fff9, ${p.look.color} 45%)` }} />
            {p.you ? "YOU" : p.name}{!alive[i] && " 💦"}
          </div>
        ))}
      </div>

      {/* feed */}
      <div className="absolute top-20 right-4 flex flex-col items-end gap-2">
        {feed.map((f) => (
          <div key={f.id} className={`rounded-xl px-4 py-2 text-lg shadow-lg animate-[feedIn_.35s_ease-out] ${f.you ? "bg-[#ffd23d] text-[#4a3300]" : "bg-white/90 text-[#3b2a1a]"}`}>{f.text}</div>
        ))}
      </div>

      {wave && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 bg-gradient-to-b from-[#38bdf8] to-[#0369a1] text-white text-4xl px-8 py-3 rounded-3xl border-4 border-white shadow-2xl animate-[popIn_.4s_cubic-bezier(.3,1.8,.5,1)]" style={{ textShadow: "0 3px 0 rgba(0,0,0,.25)" }}>
          🌊 BIG WAVE! HOLD ON!
        </div>
      )}

      {count !== null && (
        <div key={String(count)} className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`animate-[countPop_.85s_ease-out_both] ${count === "GO!" ? "text-[#ffd23d]" : "text-white"} text-[min(26vw,220px)] leading-none`} style={{ textShadow: "0 10px 0 rgba(0,70,140,.45), 0 0 40px rgba(255,255,255,.5)" }}>
            {count}
          </div>
        </div>
      )}
      {count === 3 && (
        <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 text-white text-3xl text-center pointer-events-none" style={{ textShadow: "0 3px 0 rgba(0,70,140,.5)" }}>
          KNOCK EVERYONE OFF THE BOAT!<div className="text-xl opacity-90">Last ball on deck wins 🏆</div>
        </div>
      )}

      {youOut !== null && !result && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-[#0b4a7a]/80 backdrop-blur text-white rounded-3xl px-8 py-4 text-center animate-[popIn_.4s_cubic-bezier(.3,1.8,.5,1)]">
          <div className="text-4xl">SPLASH! 💦</div>
          <div className="text-lg opacity-80">You finished #{youOut} — spectating…</div>
        </div>
      )}

      {/* controls */}
      <div className="absolute bottom-5 right-6 text-white text-lg flex items-center gap-3 pointer-events-none" style={{ textShadow: "0 2px 3px rgba(0,60,120,.6)" }}>
        <KeyHint k="WASD" label="MOVE" /><KeyHint k="SPACE" label="DASH" />
      </div>
      <div className="absolute bottom-8 left-8 w-32 h-32 rounded-full bg-white/20 border-4 border-white/40 backdrop-blur-sm touch-none md:opacity-60"
        onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); joy.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; e.currentTarget.setPointerCapture(e.pointerId); joyMove(e); }}
        onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd}>
        <div className="absolute left-1/2 top-1/2 w-14 h-14 -ml-7 -mt-7 rounded-full bg-white shadow-lg" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button onPointerDown={() => (G.current.input.dash = true)}
        className="absolute bottom-16 right-8 w-24 h-24 rounded-full bg-gradient-to-b from-[#ffd23d] to-[#ff9d00] text-white text-2xl shadow-[0_6px_0_#b45309] active:translate-y-1 active:shadow-[0_2px_0_#b45309] md:hidden">DASH</button>

      {/* result */}
      {result && (
        <div className="absolute inset-0 bg-[#062a4a]/55 backdrop-blur-sm flex items-center justify-center animate-[fade_.4s_ease]">
          <div className="bg-[#fffaf0] rounded-[32px] p-8 w-[min(92vw,460px)] text-center shadow-2xl animate-[cardIn_.5s_cubic-bezier(.3,1.6,.5,1)]">
            <div className="text-6xl mb-1">{won ? "🏆" : "💦"}</div>
            <div className={`text-5xl ${won ? "text-[#f5b400]" : "text-[#0369a1]"}`} style={{ textShadow: "0 4px 0 rgba(0,0,0,.08)" }}>
              {won ? (result.survivors > 1 ? "SURVIVED!" : "VICTORY!") : `#${result.rank} PLACE`}
            </div>
            <div className="text-[#3b2a1a]/60 text-lg mb-4">{won ? "Captain of the deck!" : "Better luck next voyage!"}</div>
            <div className="flex flex-col gap-1.5 mb-6 max-h-[38vh] overflow-auto">
              {result.ranking.map((r) => (
                <div key={r.name} className={`flex items-center justify-between rounded-xl px-4 py-1.5 text-lg ${r.you ? "bg-[#ffd23d] text-[#4a3300]" : "bg-[#3b2a1a]/5 text-[#3b2a1a]"}`}>
                  <span>#{r.rank} {r.you ? "YOU" : r.name}</span><span>{r.rank === 1 ? "👑" : "💦"}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { sfx.click(); onAgain(); }} className="flex-1 bg-gradient-to-b from-[#ffd23d] to-[#ff9d00] text-white text-2xl rounded-2xl py-3 shadow-[0_5px_0_#b45309] active:translate-y-1">PLAY AGAIN</button>
              <button onClick={() => { sfx.back(); onExit(); }} className="flex-1 bg-[#3b2a1a] text-white text-2xl rounded-2xl py-3 shadow-[0_5px_0_#000] active:translate-y-1">MENU</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Game({ loadout, onExit }: { loadout: Loadout; onExit: () => void }) {
  const [round, setRound] = useState(0);
  useEffect(() => { duckMusic(false); return () => duckMusic(false); }, [round]);
  return <Match key={round} loadout={loadout} onExit={onExit} onAgain={() => setRound((r) => r + 1)} />;
}
