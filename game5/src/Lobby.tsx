import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, Html, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { sfx } from "./audio";
import { HillScene } from "./Scenes";
import { JButton, KeyHint, MuteButton } from "./ui";

const TABS = ["HEAD", "FACE", "BODY", "GEAR"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { HEAD: "🎩", FACE: "😎", BODY: "🩳", GEAR: "🥊" };
import type { Loadout } from "./Game";
import { Cat, FURS, furFor, frontZ, HEAD_Y, HEAD_R, Z_FLAT } from "./Cat";

export const outfits = Object.entries(FURS).map(([k, f]) => ({ k, n: f.label, c: f.body, metal: !!f.metal, f }));

const players = [
  { name: "Mochi", c: "siamese", x: -6.3 }, { name: "luffy", c: "gray", x: -4.2 },
  { name: "Epun", c: "snow", x: -2.1 }, { name: "YOU", c: "", x: 0 },
  { name: "Rattlexnake", c: "tuxedo", x: 2.1 }, { name: "Apiipp", c: "cream", x: 4.2 },
  { name: "Kopi", c: "tabby", x: 6.3 },
];

export type Hat = "crown" | "cap" | "cowboy" | "afro" | null;
export type Glass = "classic" | "pixel" | null;

function crownGeo(radius: number, h: number, spikes: number, inner = 1) {
  const g = new THREE.CylinderGeometry(radius * inner, radius * 0.9 * inner, h, spikes * 16, 1, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const ang = Math.atan2(pos.getZ(i), pos.getX(i));
      const f = ((ang / (Math.PI * 2)) * spikes + 10) % 1;
      const tri = 1 - Math.abs(f - 0.5) * 2;
      pos.setY(i, h * 0.5 - h * 0.55 * (1 - Math.pow(tri, 1.6)));
    }
  }
  g.computeVertexNormals();
  return g;
}

export function Crown({ scale = 1 }: { scale?: number }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { g.current.rotation.y = clock.getElapsedTime() * 0.5; });
  const spikes = 6;
  const outer = useMemo(() => crownGeo(0.55, 0.6, spikes), []);
  const inner = useMemo(() => crownGeo(0.55, 0.6, spikes, 0.94), []);
  const gold = { color: "#ffc93c", metalness: 1, roughness: 0.15, clearcoat: 1, envMapIntensity: 2 };
  const gems = ["#e11d48", "#2563eb", "#10b981"];
  return (
    <group ref={g} scale={scale}>
      <mesh geometry={outer} castShadow><meshPhysicalMaterial {...gold} side={THREE.FrontSide} /></mesh>
      <mesh geometry={inner}><meshPhysicalMaterial {...gold} roughness={0.35} side={THREE.BackSide} /></mesh>
      <mesh position={[0, 0.02, 0]}><sphereGeometry args={[0.48, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#9f1239" roughness={0.9} /></mesh>
      <mesh position={[0, -0.27, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.515, 0.06, 16, 64]} /><meshPhysicalMaterial {...gold} /></mesh>
      <mesh position={[0, -0.27, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.515, 0.035, 8, 64]} /><meshStandardMaterial color="#fff" roughness={0.9} transparent opacity={0} />
      </mesh>
      {Array.from({ length: spikes }).map((_, i) => {
        const ang = ((i + 0.5) / spikes) * Math.PI * 2;
        const x = Math.cos(ang), z = Math.sin(ang);
        const c = gems[i % 3];
        return (
          <group key={i}>
            <mesh position={[x * 0.545, 0.32, z * 0.545]}><sphereGeometry args={[0.065, 20, 20]} /><meshPhysicalMaterial {...gold} /></mesh>
            <mesh position={[x * 0.53, -0.08, z * 0.53]} rotation-y={-ang + Math.PI / 2} scale={[1, 1.25, 0.6]}>
              <octahedronGeometry args={[0.085]} /><meshPhysicalMaterial color={c} roughness={0} clearcoat={1} emissive={c} emissiveIntensity={0.35} />
            </mesh>
          </group>
        );
      })}
      <group position={[0, 0.48, 0]}>
        <mesh><sphereGeometry args={[0.08, 20, 20]} /><meshPhysicalMaterial {...gold} /></mesh>
        <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.04, 0.16, 0.04]} /><meshPhysicalMaterial {...gold} /></mesh>
        <mesh position={[0, 0.14, 0]}><boxGeometry args={[0.12, 0.04, 0.04]} /><meshPhysicalMaterial {...gold} /></mesh>
      </group>
    </group>
  );
}

export function Cap({ color = "#2563eb" }: { color?: string }) {
  return (
    <group>
      <mesh castShadow><sphereGeometry args={[0.62, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={color} roughness={0.75} /></mesh>
      <mesh position={[0, 0.005, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.6, 0.035, 12, 48]} /><meshStandardMaterial color="#fff" roughness={0.8} /></mesh>
      <mesh position={[0, 0.02, 0.62]} scale={[1, 1, 0.75]} rotation-x={-0.12} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 40, 1, false, -Math.PI / 2, Math.PI]} /><meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.62, 0]}><sphereGeometry args={[0.07, 16, 16]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0, 0.32, 0.53]} rotation-x={-0.55}><circleGeometry args={[0.15, 32]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0, 0.32, 0.535]} rotation-x={-0.55}><circleGeometry args={[0.1, 5]} /><meshStandardMaterial color="#facc15" /></mesh>
    </group>
  );
}

export function CowboyHat() {
  const brown = { color: "#8b5a2b", roughness: 0.85 };
  const crown = useMemo(() => {
    const pts = [[0, 0], [0.42, 0], [0.44, 0.25], [0.42, 0.5], [0.3, 0.6], [0.12, 0.55], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 48);
  }, []);
  const brim = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.3 + t * 0.75, Math.pow(t, 2.5) * 0.12)); }
    return new THREE.LatheGeometry(pts, 64);
  }, []);
  return (
    <group>
      <mesh geometry={crown} castShadow scale={[1, 1, 0.85]}><meshStandardMaterial {...brown} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={brim} castShadow scale={[1, 1, 0.8]} rotation-x={0.05}><meshStandardMaterial {...brown} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.1, 0]} scale={[1, 1, 0.85]}><cylinderGeometry args={[0.435, 0.44, 0.1, 48, 1, true]} /><meshStandardMaterial color="#3b2412" roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.1, 0.38]}><boxGeometry args={[0.12, 0.1, 0.03]} /><meshStandardMaterial color="#e5c07b" metalness={0.9} roughness={0.25} /></mesh>
    </group>
  );
}

export function Sunglasses() {
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.28, 0, -0.03]} rotation-y={sx * 0.28}>
          <mesh scale={[1.2, 0.85, 0.35]}><sphereGeometry args={[0.2, 32, 32]} />
            <meshPhysicalMaterial color="#1e1b4b" roughness={0.05} metalness={0.6} clearcoat={1} envMapIntensity={3} /></mesh>
          <mesh position={[0, 0, 0.02]} scale={[1.2, 0.85, 1]}><torusGeometry args={[0.205, 0.04, 16, 48]} />
            <meshStandardMaterial color="#0f0f12" roughness={0.25} metalness={0.3} /></mesh>
          <mesh position={[-0.07 * sx, 0.06, 0.075]} rotation-z={0.7 * sx} scale={[1, 0.28, 0.2]}><sphereGeometry args={[0.08, 12, 12]} /><meshBasicMaterial color="white" transparent opacity={0.75} /></mesh>
          <mesh position={[sx * 0.04, -0.07, 0.072]} rotation-z={0.7 * sx} scale={[1, 0.25, 0.2]}><sphereGeometry args={[0.04, 12, 12]} /><meshBasicMaterial color="white" transparent opacity={0.4} /></mesh>
          <mesh position={[sx * 0.26, 0.04, -0.18]} rotation-y={sx * 0.9}><boxGeometry args={[0.04, 0.045, 0.42]} /><meshStandardMaterial color="#0f0f12" /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.06, 0.02]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.025, 0.025, 0.16, 12]} /><meshStandardMaterial color="#0f0f12" /></mesh>
    </group>
  );
}

export function Glove({ color = "#e0282e", flip = false }: { color?: string; flip?: boolean }) {
  const leather = <meshPhysicalMaterial color={color} roughness={0.32} clearcoat={0.9} clearcoatRoughness={0.2} />;
  return (
    <group scale={[flip ? -1 : 1, 1, 1]}>
      <mesh castShadow scale={[1, 0.9, 1.15]}><sphereGeometry args={[0.32, 32, 32]} />{leather}</mesh>
      <mesh castShadow position={[0.24, -0.04, 0.1]} scale={[0.6, 0.85, 0.7]} rotation-z={-0.4}><sphereGeometry args={[0.2, 24, 24]} />{leather}</mesh>
      <mesh position={[0, -0.32, -0.05]} castShadow><cylinderGeometry args={[0.22, 0.24, 0.26, 32]} /><meshStandardMaterial color="#fafafa" roughness={0.6} /></mesh>
      <mesh position={[0, -0.25, -0.05]} rotation-x={Math.PI / 2}><torusGeometry args={[0.235, 0.03, 12, 32]} /><meshStandardMaterial color="#facc15" metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[0, 0.05, 0.36]} rotation-x={0.2} scale={[1, 0.4, 0.2]}><sphereGeometry args={[0.12, 16, 16]} /><meshBasicMaterial color="white" transparent opacity={0.35} /></mesh>
    </group>
  );
}

export function DuckFloat({ r }: { r: number }) {
  const yellow = { color: "#ffd31a", roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 };
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { g.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.6) * 0.05; });
  return (
    <group ref={g} position={[0, -0.38 * r, 0]}>
      <mesh castShadow rotation-x={Math.PI / 2}><torusGeometry args={[1.02 * r, 0.3 * r, 32, 64]} /><meshPhysicalMaterial {...yellow} /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation-x={Math.PI / 2} rotation-z={(i * Math.PI) / 2 + Math.PI / 4}>
          <torusGeometry args={[1.02 * r, 0.305 * r, 16, 64, 0.35]} /><meshPhysicalMaterial color="#fff6c2" roughness={0.3} clearcoat={1} />
        </mesh>
      ))}
      <group position={[0, 0.32 * r, 1.12 * r]}>
        <mesh position={[0, -0.05 * r, -0.05 * r]} castShadow><sphereGeometry args={[0.2 * r, 24, 24]} /><meshPhysicalMaterial {...yellow} /></mesh>
        <mesh position={[0, 0.28 * r, 0]} castShadow><sphereGeometry args={[0.3 * r, 32, 32]} /><meshPhysicalMaterial {...yellow} /></mesh>
        <mesh position={[0, 0.22 * r, 0.3 * r]} scale={[1.3, 0.45, 1]}><sphereGeometry args={[0.16 * r, 24, 24]} /><meshPhysicalMaterial color="#ff8a00" roughness={0.3} clearcoat={1} /></mesh>
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 0.13 * r, 0.38 * r, 0.24 * r]}>
            <mesh><sphereGeometry args={[0.065 * r, 16, 16]} /><meshStandardMaterial color="#111" roughness={0.2} /></mesh>
            <mesh position={[0.015 * r, 0.02 * r, 0.05 * r]}><sphereGeometry args={[0.02 * r, 8, 8]} /><meshBasicMaterial color="white" /></mesh>
          </group>
        ))}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.24 * r, 0.22 * r, 0.12 * r]}><sphereGeometry args={[0.05 * r, 12, 12]} /><meshBasicMaterial color="#ff9eb5" transparent opacity={0.7} /></mesh>
        ))}
      </group>
      <mesh position={[0, 0.22 * r, -1.2 * r]} rotation-x={-0.7} castShadow><coneGeometry args={[0.16 * r, 0.35 * r, 24]} /><meshPhysicalMaterial {...yellow} /></mesh>
    </group>
  );
}

export function RainbowAfro({ r }: { r: number }) {
  const puffs = useMemo(() => {
    const cols = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
    const out: { p: [number, number, number]; s: number; c: string }[] = [];
    const n = 140;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 1.25;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.39996;
      const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      if (z > 0.35 && y < 0.55) continue;
      const R = r * 1.08;
      const band = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * cols.length) % cols.length;
      out.push({ p: [x * R, y * R + r * 0.15, z * R], s: r * (0.24 + ((i * 37) % 10) / 100), c: cols[band] });
    }
    return out;
  }, [r]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    puffs.forEach((f, i) => {
      m.compose(new THREE.Vector3(...f.p), new THREE.Quaternion(), new THREE.Vector3(f.s, f.s, f.s));
      ref.current.setMatrixAt(i, m); ref.current.setColorAt(i, c.set(f.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [puffs]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, puffs.length]} castShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.95} flatShading />
    </instancedMesh>
  );
}

export function PixelShades() {
  const px: [number, number][] = [];
  for (let x = 0; x < 12; x++) px.push([x, 3]);
  [[0, 2], [0, 1], [1, 2], [1, 1], [2, 2], [2, 1], [3, 2], [4, 2], [4, 1], [7, 2], [7, 1], [8, 2], [8, 1], [9, 2], [9, 1], [10, 2], [11, 2], [11, 1], [1, 0], [2, 0], [3, 1], [8, 0], [9, 0], [10, 1]].forEach((v) => px.push(v as [number, number]));
  const white = ["2,2", "3,1", "9,2", "10,1"];
  const u = 0.075;
  return (
    <group position={[-5.5 * u, -1.5 * u, 0]}>
      {px.map(([x, y], i) => {
        const w = white.includes(`${x},${y}`);
        return <mesh key={i} position={[x * u, y * u, w ? 0.01 : 0]}><boxGeometry args={[u, u, 0.05]} /><meshStandardMaterial color={w ? "#fff" : "#050505"} roughness={0.4} /></mesh>;
      })}
      {[-1, 1].map((sx) => <mesh key={sx} position={[sx > 0 ? 12 * u : -1 * u, 3 * u, -0.2]} rotation-y={sx * 0.6}><boxGeometry args={[0.04, 0.05, 0.45]} /><meshStandardMaterial color="#050505" /></mesh>)}
    </group>
  );
}

export function Mallet({ r, seed = 0 }: { r: number; seed?: number }) {
  const pivot = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const wood = { color: "#c8894a", roughness: 0.7 };
  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() + seed) % 4;
    let a = 0.35, sq = 1;
    if (t > 2.6 && t < 3.0) a = 0.35 + ((t - 2.6) / 0.4) * 1.0;
    else if (t >= 3.0 && t < 3.12) a = 1.35 - ((t - 3.0) / 0.12) * 2.9;
    else if (t >= 3.12 && t < 3.5) { a = -1.55 + Math.sin((t - 3.12) * 30) * 0.08 * (3.5 - t); sq = 1 - 0.25 * Math.max(0, 1 - (t - 3.12) * 6); }
    else if (t >= 3.5) a = -1.55 + ((t - 3.5) / 0.5) * 1.9;
    pivot.current.rotation.x = -a;
    head.current.scale.set(1 + (1 - sq) * 0.8, sq, 1 + (1 - sq) * 0.8);
  });
  return (
    <group position={[r * 1.15, -r * 0.1, 0.1]} scale={r}>
      <group ref={pivot}>
        <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.07, 0.085, 1.5, 16]} /><meshStandardMaterial {...wood} color="#a86a32" /></mesh>
        <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.1, 0.1, 0.35, 16]} /><meshStandardMaterial color="#d43b2f" roughness={0.6} /></mesh>
        <mesh position={[0, -0.05, 0]}><sphereGeometry args={[0.11, 16, 16]} /><meshStandardMaterial color="#d43b2f" /></mesh>
        <group ref={head} position={[0, 1.55, 0]}>
          <group rotation-z={Math.PI / 2}>
            <mesh castShadow><cylinderGeometry args={[0.38, 0.38, 0.95, 32]} /><meshStandardMaterial {...wood} /></mesh>
            {[-0.48, 0.48].map((y) => (
              <group key={y}>
                <mesh position={[0, y, 0]}><cylinderGeometry args={[0.36, 0.38, 0.03, 32]} /><meshStandardMaterial color="#e8b878" roughness={0.8} /></mesh>
                {[0.1, 0.2, 0.3].map((rr) => (
                  <mesh key={rr} position={[0, y * 1.035, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[rr, 0.008, 6, 32]} /><meshStandardMaterial color="#9c6630" /></mesh>
                ))}
              </group>
            ))}
            {[-0.32, 0.32].map((y) => (
              <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.395, 0.395, 0.09, 32]} /><meshStandardMaterial color="#8a8f99" metalness={0.85} roughness={0.3} /></mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

export function BoxerShorts({ r, color = "#dc2626", trim = "#ffffff" }: { r: number; color?: string; trim?: string }) {
  const R = r * 1.035;
  const t0 = Math.acos(-0.36 / 1.035), t1 = 2.72;
  const satin = { color, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 1, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.3 };
  const wy = -0.36 * r, wr = Math.sqrt(1 - 0.36 * 0.36) * r;
  return (
    <group>
      <mesh castShadow><sphereGeometry args={[R, 64, 32, 0, Math.PI * 2, t0, t1 - t0]} /><meshPhysicalMaterial {...satin} side={THREE.DoubleSide} /></mesh>
      {/* hem trim */}
      <mesh position={[0, R * Math.cos(t1), 0]} rotation-x={Math.PI / 2}><torusGeometry args={[R * Math.sin(t1), 0.035 * r, 12, 64]} /><meshPhysicalMaterial color={trim} roughness={0.3} clearcoat={1} /></mesh>
      {/* side stripes */}
      {[-1, 1].map((sd) => (
        <mesh key={sd}><sphereGeometry args={[R * 1.004, 8, 24, sd > 0 ? -0.09 : Math.PI - 0.09, 0.18, t0 + 0.05, t1 - t0 - 0.05]} /><meshPhysicalMaterial color={trim} roughness={0.3} clearcoat={1} side={THREE.DoubleSide} /></mesh>
      ))}
      {/* front split between legs */}
      <mesh position={[0, -0.72 * r, 0.7 * r]} rotation-x={-0.75}><boxGeometry args={[0.035 * r, 0.32 * r, 0.02 * r]} /><meshStandardMaterial color="#000" transparent opacity={0.35} /></mesh>
      {/* waistband */}
      <mesh position={[0, wy, 0]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[wr * 1.06, wr * 1.06, 0.16 * r, 64, 1, true]} /><meshPhysicalMaterial color={trim} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, wy, 0]}><cylinderGeometry args={[wr * 1.065, wr * 1.065, 0.16 * r, 64, 1, true]} /><meshPhysicalMaterial color={trim} roughness={0.5} side={THREE.DoubleSide} /></mesh>
      {[0.065, -0.065].map((dy) => (
        <mesh key={dy} position={[0, wy + dy * r, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[wr * 1.07, 0.012 * r, 8, 64]} /><meshStandardMaterial color={color} /></mesh>
      ))}
      {/* drawstring */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 0.06 * r, wy - 0.02 * r, wr * 1.07]} rotation-z={sd * 0.25}>
          <mesh position={[0, -0.1 * r, 0.01 * r]}><cylinderGeometry args={[0.012 * r, 0.012 * r, 0.2 * r, 6]} /><meshStandardMaterial color="#fff" /></mesh>
          <mesh position={[0, -0.21 * r, 0.01 * r]}><capsuleGeometry args={[0.018 * r, 0.03 * r, 4, 8]} /><meshStandardMaterial color="#facc15" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      ))}
      {/* star patch */}
      <mesh position={[-0.42 * r, -0.62 * r, 0.71 * r]} rotation={[-0.6, -0.5, 0]}><circleGeometry args={[0.1 * r, 5]} /><meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.3} /></mesh>
    </group>
  );
}

function starShape(o: number, i: number) {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2, rr = k % 2 ? i : o;
    if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}

export function ChampionBelt({ r }: { r: number }) {
  const y = -0.2 * r, h = 0.24 * r;
  const bandR = r * 1.02;
  const plate = useRef<THREE.Group>(null!);
  const star = useMemo(() => new THREE.ExtrudeGeometry(starShape(0.13, 0.055), { depth: 0.03, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }), []);
  const plateShape = useMemo(() => {
    const s = new THREE.Shape(), w = 0.42, hh = 0.3;
    s.moveTo(-w, 0); s.quadraticCurveTo(-w, hh, -w * 0.45, hh); s.quadraticCurveTo(0, hh * 1.35, w * 0.45, hh);
    s.quadraticCurveTo(w, hh, w, 0); s.quadraticCurveTo(w, -hh, w * 0.45, -hh); s.quadraticCurveTo(0, -hh * 1.35, -w * 0.45, -hh);
    s.quadraticCurveTo(-w, -hh, -w, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 4, curveSegments: 24 });
  }, []);
  useFrame(({ clock }) => {
    const m = plate.current?.children[2] as THREE.Mesh | undefined;
    if (m) (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25 + Math.sin(clock.getElapsedTime() * 3) * 0.15;
  });
  const gold = { color: "#ffcc33", metalness: 1, roughness: 0.16, clearcoat: 1, envMapIntensity: 2.2 };
  const sides = [-0.62, -1.05, 0.62, 1.05];
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow><cylinderGeometry args={[bandR, bandR * 0.985, h, 72, 1, true]} /><meshPhysicalMaterial color="#141414" roughness={0.38} clearcoat={0.6} side={THREE.DoubleSide} /></mesh>
      {[h / 2, -h / 2].map((dy) => (
        <mesh key={dy} position={[0, dy, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[bandR * (dy > 0 ? 1 : 0.985), 0.018 * r, 8, 72]} /><meshPhysicalMaterial {...gold} /></mesh>
      ))}
      {sides.map((a) => (
        <group key={a} rotation-y={a}>
          <group position={[0, 0, bandR + 0.01 * r]} scale={r}>
            <mesh position={[0, 0, 0]}><boxGeometry args={[0.2, 0.2, 0.04]} /><meshPhysicalMaterial {...gold} /></mesh>
            <mesh position={[0, 0, 0.022]}><circleGeometry args={[0.065, 24]} /><meshPhysicalMaterial color={Math.abs(a) > 0.8 ? "#1d4ed8" : "#dc2626"} roughness={0.1} clearcoat={1} /></mesh>
            {[[-0.08, 0.08], [0.08, 0.08], [-0.08, -0.08], [0.08, -0.08]].map(([x, yy]) => (
              <mesh key={x + "" + yy} position={[x, yy, 0.022]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#fff" metalness={0.9} roughness={0.1} /></mesh>
            ))}
          </group>
        </group>
      ))}
      <group ref={plate} position={[0, 0.02 * r, bandR - 0.01 * r]} scale={r}>
        <mesh geometry={plateShape} castShadow><meshPhysicalMaterial {...gold} /></mesh>
        <mesh position={[0, 0, 0.08]} scale={[0.78, 0.74, 1]}><circleGeometry args={[0.3, 48]} /><meshPhysicalMaterial color="#b91c1c" roughness={0.12} clearcoat={1} /></mesh>
        <mesh position={[0, 0, 0.085]} scale={[0.6, 0.56, 1]}><ringGeometry args={[0.27, 0.3, 48]} /><meshPhysicalMaterial {...gold} emissive="#ffb000" emissiveIntensity={0.3} /></mesh>
        <mesh geometry={star} position={[0, 0.005, 0.08]}><meshPhysicalMaterial {...gold} /></mesh>
        {Array.from({ length: 14 }).map((_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return <mesh key={i} position={[Math.cos(a) * 0.3, Math.sin(a) * 0.22, 0.085]}><octahedronGeometry args={[0.018]} /><meshPhysicalMaterial color="#ffffff" roughness={0} metalness={0.2} clearcoat={1} emissive="#ffffff" emissiveIntensity={0.25} /></mesh>;
        })}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.36, 0, 0.08]}><octahedronGeometry args={[0.035]} /><meshPhysicalMaterial color="#2563eb" roughness={0} clearcoat={1} emissive="#3b82f6" emissiveIntensity={0.3} /></mesh>
        ))}
      </group>
    </group>
  );
}

export function ClownNose() {
  const m = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() % 3;
    const k = t < 0.25 ? Math.sin((t / 0.25) * Math.PI) : 0;
    m.current.scale.set(1 + k * 0.2, 1 - k * 0.15, 1 + k * 0.2);
  });
  return (
    <group>
      <mesh ref={m} castShadow>
        <sphereGeometry args={[0.13, 40, 32]} />
        <meshPhysicalMaterial color="#e3121b" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} sheen={0.4} sheenColor={new THREE.Color("#ff8080")} />
      </mesh>
      <mesh position={[-0.04, 0.05, 0.1]} scale={[1, 0.7, 0.4]}><sphereGeometry args={[0.035, 16, 12]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.85} /></mesh>
      <mesh position={[0.05, -0.03, 0.11]}><sphereGeometry args={[0.012, 8, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.6} /></mesh>
    </group>
  );
}

function BristleSet({ bristles }: { bristles: { x: number; z: number; l: number; c: string }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    bristles.forEach((b, i) => {
      o.position.set(b.x * 0.55, -b.l / 2, b.z); o.rotation.set(0, 0, b.x * 0.9); o.scale.set(1, b.l, 1); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix); ref.current.setColorAt(i, c.set(b.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [bristles]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, bristles.length]} castShadow>
      <boxGeometry args={[0.022, 1, 0.022]} /><meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

export function Broom({ swing = true, seed = 0 }: { swing?: boolean; seed?: number }) {
  const pivot = useRef<THREE.Group>(null!);
  const bristles = useMemo(() => {
    const out: { x: number; z: number; l: number; c: string }[] = [];
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996, rr = Math.sqrt(i / 70);
      out.push({ x: Math.cos(a) * rr * 0.26, z: Math.sin(a) * rr * 0.1, l: 0.62 + ((i * 37) % 10) / 60, c: i % 5 === 0 ? "#c99a3c" : i % 3 ? "#e8c46a" : "#d9b155" });
    }
    return out;
  }, []);
  useFrame(({ clock }) => {
    if (!swing) return;
    const t = (clock.getElapsedTime() + seed) % 3.4;
    let a = 0;
    if (t > 2.2 && t < 2.55) a = -((t - 2.2) / 0.35) * 0.9;
    else if (t >= 2.55 && t < 2.75) a = -0.9 + ((t - 2.55) / 0.2) * 2.6;
    else if (t >= 2.75 && t < 3.4) a = 1.7 * (1 - (t - 2.75) / 0.65) + Math.sin((t - 2.75) * 25) * 0.08 * (3.4 - t);
    pivot.current.rotation.z = -a * 0.6;
    pivot.current.rotation.x = a * 0.5;
  });
  return (
    <group ref={pivot}>
      <group rotation-z={-0.25}>
        {/* handle */}
        <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.035, 0.04, 2.1, 12]} /><meshStandardMaterial color="#9a5b2c" roughness={0.6} /></mesh>
        {[1.2, 1.05].map((y) => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.043, 0.043, 0.06, 12]} /><meshStandardMaterial color="#d43b2f" /></mesh>)}
        <mesh position={[0, 1.62, 0]}><sphereGeometry args={[0.05, 12, 12]} /><meshStandardMaterial color="#d43b2f" /></mesh>
        {/* binding */}
        <mesh position={[0, -0.52, 0]} scale={[1, 1, 0.45]}><cylinderGeometry args={[0.13, 0.2, 0.22, 20]} /><meshStandardMaterial color="#e8c46a" roughness={0.9} /></mesh>
        {[-0.46, -0.56].map((y) => (
          <mesh key={y} position={[0, y, 0]} scale={[1, 1, 0.45]}><cylinderGeometry args={[y < -0.5 ? 0.19 : 0.15, y < -0.5 ? 0.19 : 0.15, 0.035, 20]} /><meshStandardMaterial color="#d43b2f" roughness={0.5} /></mesh>
        ))}
        {/* bristles */}
        <group position={[0, -0.62, 0]}><BristleSet bristles={bristles} /></group>
      </group>
    </group>
  );
}

export type Look = Loadout & { collar?: boolean; capColor?: string };

export function Dressed({ r, look, seed = 0, getSpeed }: { r: number; look: Look; seed?: number; getSpeed?: () => number }) {
  const fur = furFor(look.fur, look.color, look.metal);
  const gl = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!gl.current) return;
    const t = clock.getElapsedTime() * 3 + seed;
    gl.current.children[0].position.set(-r * 0.98, -0.28 * r + Math.sin(t) * 0.05, 0.22 * r + Math.max(0, Math.sin(t * 0.5)) * 0.15);
    gl.current.children[1].position.set(r * 0.98, -0.28 * r + Math.cos(t) * 0.05, 0.22 * r + Math.max(0, -Math.sin(t * 0.5)) * 0.15);
  });
  const hat = look.hat;
  return (
    <group>
      <group position={[0, -r * 0.0, 0]}>
        <Cat fur={fur} r={r} seed={seed} getSpeed={getSpeed} showEars={!hat || hat === "crown"} showEyes={!look.glasses} />
      </group>
      {/* head accessories */}
      <group position={[0, r * HEAD_Y, 0]} scale={HEAD_R}>
        {hat === "crown" && <group position={[0, r * 0.98, 0]}><Crown scale={r * 0.78} /></group>}
        {hat === "cap" && <group position={[0, r * 0.6, 0]} rotation-x={-0.08} scale={r * 1.1}><Cap color={look.capColor ?? "#2563eb"} /></group>}
        {hat === "cowboy" && <group position={[0, r * 0.75, 0]} scale={r * 1.1}><CowboyHat /></group>}
        {hat === "afro" && <group position={[0, r * 0.15, -r * 0.05]}><RainbowAfro r={r} /></group>}
      </group>
      {look.glasses === "classic" && <group position={[0, r * 1.29, r * 0.76]} rotation-x={-0.05} scale={r * 1.25}><Sunglasses /></group>}
      {look.glasses === "pixel" && <group position={[0, r * 1.29, r * 0.78]} scale={r * 1.3}><PixelShades /></group>}
      {look.collar && (
        <group position={[0, r * 0.6, 0]} scale={[1, 1, Z_FLAT]}>
          <mesh rotation-x={Math.PI / 2}><torusGeometry args={[r * 0.72, r * 0.045, 12, 48]} /><meshStandardMaterial color="#dc2626" roughness={0.4} /></mesh>
          <mesh position={[0, -r * 0.1, r * 0.78]}><sphereGeometry args={[r * 0.09, 20, 20]} /><meshStandardMaterial color="#facc15" metalness={1} roughness={0.2} /></mesh>
        </group>
      )}
      {/* body accessories */}
      <group position={[0, -r * 0.08, 0]} scale={[0.84, 0.72, 0.76]}>
        {look.shorts && <BoxerShorts r={r} />}
        {look.belt && <ChampionBelt r={r} />}
      </group>
      {look.duck && <group position={[0, -r * 0.05, 0]} scale={[0.85, 0.85, 0.78]}><DuckFloat r={r} /></group>}
      {look.hammer && <group position={[-r * 0.1, -r * 0.15, 0]}><Mallet r={r} seed={seed} /></group>}
      {look.broom && !look.hammer && <group position={[r * 0.78, -r * 0.24, r * 0.08]} scale={r}><Broom seed={seed} /></group>}
      {look.clown && <group position={[0, r * 1.06, r * (frontZ(0, 1.07) + 0.07)]} scale={r}><ClownNose /></group>}
      {look.gloves && (
        <group ref={gl}>
          <group rotation={[0.3, 0.4, 0.2]} scale={r / 0.8}><Glove flip /></group>
          <group rotation={[0.3, -0.4, -0.2]} scale={r / 0.8}><Glove /></group>
        </group>
      )}
    </group>
  );
}

export function labelHeight(r: number, hat: Hat) {
  return r * (2.05 + (hat === "crown" ? 0.95 : hat === "cowboy" ? 0.7 : hat === "afro" ? 0.55 : hat === "cap" ? 0.35 : 0)) + 0.45;
}

function Ball({ x, look, you, delay, name, ready }: { x: number; look: Look; you?: boolean; delay: number; name: string; ready: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  const r = you ? 0.95 : 0.8;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (start.current === null) start.current = t;
    const e = t - start.current - delay;
    const drop = e < 0 ? 7 : Math.max(0, 7 - e * e * 20);
    g.current.position.y = r + drop;
    const land = e > 0 && e < 0.9 ? Math.max(0, Math.sin((e - Math.sqrt(7 / 20)) * 14)) * Math.max(0, 0.6 - e) : 0;
    const sq = 1 + Math.sin(t * 2 + x) * 0.012 - land * 0.25;
    g.current.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, Math.sin(t * 0.6 + x) * 0.22 - x * 0.05, 0.05);
  });
  return (
    <group ref={g} position={[x, 8, you ? 0.6 : 0]}>
      <group position={[0, -r * 0, 0]}><Dressed r={r} look={look} seed={x} /></group>
      <Html position={[0, labelHeight(r, look.hat) - r, 0]} center distanceFactor={15} zIndexRange={[10, 0]}>
        <div className="flex flex-col items-center gap-1 pointer-events-none" style={{ fontFamily: "'Lilita One', sans-serif" }}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${ready ? "bg-gradient-to-b from-[#ffe14d] to-[#f5b400] scale-100" : "bg-white/30 scale-75"} shadow-[0_3px_0_rgba(0,0,0,.25)]`}>
            {ready ? <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" stroke="#6b4a00" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span className="text-white text-lg">…</span>}
          </div>
          <div className="text-white text-xl whitespace-nowrap" style={{ textShadow: "0 2px 4px rgba(0,0,0,.6)" }}>{name}</div>
        </div>
      </Html>
    </group>
  );
}

function CatFace({ f }: { f: (typeof outfits)[number]["f"] }) {
  const ear = f.ear ?? f.body;
  return (
    <svg viewBox="0 0 100 100" className="w-[92%] h-[92%] translate-y-[8%]">
      <path d="M22 40 L28 8 L48 30Z" fill={ear} stroke="#0002" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M78 40 L72 8 L52 30Z" fill={ear} stroke="#0002" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="60" rx="40" ry="38" fill={f.metal ? "url(#gold)" : f.body} />
      <defs><radialGradient id="gold" cx=".35" cy=".3"><stop offset="0" stopColor="#fff6c8" /><stop offset=".5" stopColor="#f5c542" /><stop offset="1" stopColor="#a8770f" /></radialGradient></defs>
      {f.mask && <ellipse cx="50" cy="66" rx="24" ry="17" fill={f.mask} />}
      {f.stripe && <><rect x="42" y="25" width="4" height="12" rx="2" fill={f.stripe} /><rect x="49" y="23" width="4" height="13" rx="2" fill={f.stripe} /><rect x="56" y="25" width="4" height="12" rx="2" fill={f.stripe} /></>}
      {[34, 66].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="58" r="11" fill="#111" /><circle cx={cx} cy="58" r="9.5" fill={f.eye} />
          <circle cx={cx + (cx < 50 ? 1 : -1)} cy="59" r="6" fill="#141a2e" /><circle cx={cx + 2} cy="55" r="2" fill="#fff" />
          <path d={cx < 50 ? `M${cx - 10} 44 L${cx + 9} 49` : `M${cx + 10} 44 L${cx - 9} 49`} stroke="#111" strokeWidth="4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M44 76 Q47 80 50 76 Q53 80 56 76" stroke="#2a1a12" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="73" rx="3" ry="2" fill={f.mask ? "#2a1a12" : "#f2909c"} />
    </svg>
  );
}

function Locker({ x, open = false, color = "#a9b8c6" }: { x: number; open?: boolean; color?: string }) {
  const d = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { if (open) d.current.rotation.y = -1.1 + Math.sin(clock.getElapsedTime() * 0.7) * 0.05; });
  return (
    <group position={[x, 1.9, -2.2]}>
      <RoundedBox args={[1.9, 3.8, 1]} radius={0.06} castShadow receiveShadow>
        <meshStandardMaterial color={open ? "#3a3f45" : color} roughness={0.5} metalness={0.3} />
      </RoundedBox>
      {open && [0.6, -0.3].map((y) => <mesh key={y} position={[0, y, 0.1]}><boxGeometry args={[1.7, 0.05, 0.8]} /><meshStandardMaterial color="#565c63" /></mesh>)}
      {open && <mesh position={[-0.4, 0.85, 0.2]}><boxGeometry args={[0.4, 0.45, 0.3]} /><meshStandardMaterial color="#16a34a" /></mesh>}
      <group ref={d} position={[-0.95, 0, 0.52]}>
        <group position={[0.95, 0, 0]}>
          <RoundedBox args={[1.85, 3.7, 0.06]} radius={0.03}><meshStandardMaterial color={color} roughness={0.45} metalness={0.35} /></RoundedBox>
          {[1.3, 1.1, 0.9].map((y) => (
            <mesh key={y} position={[0, y, 0.04]}><boxGeometry args={[1.1, 0.07, 0.02]} /><meshStandardMaterial color="#6b7a88" /></mesh>
          ))}
          <mesh position={[0.65, 0, 0.06]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.12, 0.12, 0.06, 24]} /><meshStandardMaterial color="#7b8794" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      </group>
    </group>
  );
}

function Room() {
  const bag = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { bag.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.3) * 0.06; });
  return (
    <>
      <mesh position={[0, 4, -2.8]} receiveShadow><planeGeometry args={[80, 30]} /><meshStandardMaterial color="#b9ada0" roughness={0.9} /></mesh>
      <mesh position={[-11.5, 4, -2.75]}><planeGeometry args={[8, 14]} /><meshStandardMaterial color="#3a332d" /></mesh>
      <mesh position={[11.5, 4, -2.75]}><planeGeometry args={[8, 14]} /><meshStandardMaterial color="#3a332d" /></mesh>
      <mesh position={[0, 6.2, -2.7]}><boxGeometry args={[30, 0.4, 0.3]} /><meshStandardMaterial color="#6b6158" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 15]} receiveShadow><planeGeometry args={[80, 40]} /><meshStandardMaterial color="#c8b8a4" roughness={0.85} /></mesh>
      {[-3.1, -1.1, 0.9, 2.9].map((x, i) => <Locker key={x} x={x} open={i === 1} />)}
      <Locker x={5.1} color="#d6cbb8" />
      <Locker x={-8.6} color="#8796a5" />
      <Locker x={8.9} color="#8796a5" />
      <mesh position={[0, 0.5, -1.4]} castShadow><boxGeometry args={[16, 0.12, 0.6]} /><meshStandardMaterial color="#a0673a" roughness={0.6} /></mesh>
      {[-6, 0, 6].map((x) => <mesh key={x} position={[x, 0.25, -1.4]}><boxGeometry args={[0.12, 0.5, 0.5]} /><meshStandardMaterial color="#6b4a2a" /></mesh>)}
      <group ref={bag} position={[-6.4, 7, -1.6]}>
        <mesh position={[0, -0.8, 0]}><cylinderGeometry args={[0.03, 0.03, 1.6]} /><meshStandardMaterial color="#555" metalness={0.9} /></mesh>
        <mesh position={[0, -3.2, 0]} castShadow><capsuleGeometry args={[0.65, 2.2, 8, 32]} /><meshStandardMaterial color="#d9452b" roughness={0.5} /></mesh>
        {[-2.3, -4.1].map((y) => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.67, 0.67, 0.12, 32]} /><meshStandardMaterial color="#8a2a1a" /></mesh>)}
      </group>
      <group position={[3.9, 3.4, -1.55]} rotation-z={0.15}><mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.012, 0.012, 0.6]} /><meshStandardMaterial color="#eee" /></mesh><group rotation-x={Math.PI}><Glove color="#2563eb" /></group></group>
      <group position={[4.35, 3.3, -1.5]} rotation-z={-0.12}><mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.012, 0.012, 0.7]} /><meshStandardMaterial color="#eee" /></mesh><group rotation-x={Math.PI}><Glove color="#2563eb" flip /></group></group>
      <group position={[7, 2.2, -2.3]}>
        <mesh castShadow><cylinderGeometry args={[0.22, 0.22, 1.1, 24]} /><meshStandardMaterial color="#c81e1e" roughness={0.35} /></mesh>
        <mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.08, 0.1, 0.2]} /><meshStandardMaterial color="#222" /></mesh>
      </group>
    </>
  );
}

function Rig({ shift = 0, hill = false }: { shift?: number; hill?: boolean }) {
  const { size } = useThree();
  const sh = useRef(0);
  useFrame(({ camera, clock, pointer }) => {
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(15));
    const d = Math.max(8.2 / (tan * aspect), 4.4 / tan);
    const t = Math.min(clock.getElapsedTime() / 1.6, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    sh.current = THREE.MathUtils.lerp(sh.current, shift * Math.min(4, d * 0.18), 0.06);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.5 + sh.current, 0.08);
    camera.position.z = d + 5 * (1 - ease);
    camera.position.y = 2.6 + 1.5 * (1 - ease) + pointer.y * 0.15;
    camera.lookAt(sh.current + (camera.position.x - sh.current) * 0.6, hill ? 2.7 : 2.25, 0);
  });
  return null;
}

export function Lobby({ onBack, onStart }: { onBack: () => void; onStart: (l: Loadout) => void }) {
  const [outfit, setOutfit] = useState(0);
  const [ready, setReady] = useState(false);
  const [hat, setHat] = useState<Hat>("crown");
  const [glass, setGlass] = useState<Glass>("classic");
  const [acc, setAcc] = useState({ duck: false, gloves: true, hammer: false, shorts: true, belt: true, broom: true, clown: true });
  const [time, setTime] = useState(15);
  const [others, setOthers] = useState<boolean[]>(players.map(() => false));

  useEffect(() => {
    const i = setInterval(() => setTime((t) => (t > 0 ? t - 1 : 0)), 1000);
    const timers = players.map((_, idx) => setTimeout(() => setOthers((o) => o.map((v, j) => (j === idx ? true : v))), 1500 + Math.random() * 7000));
    return () => { clearInterval(i); timers.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d") { sfx.select(); setOutfit((o) => (o + 1) % outfits.length); }
      if (e.key === "ArrowLeft" || e.key === "a") { sfx.select(); setOutfit((o) => (o - 1 + outfits.length) % outfits.length); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setReady((r) => { (r ? sfx.unready : sfx.ready)(); return !r; }); }
      if (e.key === "Escape") { sfx.back(); onBack(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onBack]);

  const me = outfits[outfit];
  const started = useRef(false);
  const [panel, setPanel] = useState(false);
  const [scene, setSceneRaw] = useState<"hill" | "locker">(() => (localStorage.getItem("lobbyScene") as "hill" | "locker") || "hill");
  const setScene = (v: "hill" | "locker") => { setSceneRaw(v); localStorage.setItem("lobbyScene", v); };
  const [tab, setTab] = useState<Tab>("HEAD");
  const readyCount = players.filter((p, i) => (p.name === "YOU" ? ready : others[i])).length;
  const cycle = (d: number) => setOutfit((o) => (o + d + outfits.length) % outfits.length);
  const toggleAcc = (k: keyof typeof acc) => setAcc((a) => ({ ...a, [k]: !a[k], ...(k === "broom" && !a.broom ? { hammer: false } : {}), ...(k === "hammer" && !a.hammer ? { broom: false } : {}), ...(k === "duck" && !a.duck ? { shorts: false } : {}), ...(k === "shorts" && !a.shorts ? { duck: false } : {}) }));
  const resetLook = () => { setHat(null); setGlass(null); setAcc({ duck: false, gloves: false, hammer: false, shorts: false, belt: false, broom: false, clown: false }); };
  type It = { id: string; icon: string; name: string; on: boolean; toggle: () => void; tag?: string };
  const hatIt = (k: Hat, icon: string, name: string, tag?: string): It => ({ id: String(k), icon, name, on: hat === k, toggle: () => setHat(hat === k ? null : k), tag });
  const glIt = (k: Glass, icon: string, name: string): It => ({ id: String(k), icon, name, on: glass === k, toggle: () => setGlass(glass === k ? null : k) });
  const accIt = (k: keyof typeof acc, icon: string, name: string, tag?: string): It => ({ id: k, icon, name, on: acc[k], toggle: () => toggleAcc(k), tag });
  const items: It[] = tab === "HEAD"
    ? [hatIt("crown", "👑", "Royal Crown", "RARE"), hatIt("cap", "🧢", "Ball Cap"), hatIt("cowboy", "🤠", "Cowboy Hat"), hatIt("afro", "🌈", "Rainbow Afro", "NEW")]
    : tab === "FACE"
      ? [glIt("classic", "🕶️", "Shades"), glIt("pixel", "😎", "Pixel Shades"), accIt("clown", "🔴", "Clown Nose", "NEW")]
      : tab === "BODY"
        ? [accIt("shorts", "🩳", "Boxer Shorts"), accIt("belt", "🏆", "Champ Belt", "RARE"), accIt("duck", "🦆", "Duck Float")]
        : [accIt("gloves", "🥊", "Boxing Gloves"), accIt("hammer", "🔨", "Mallet"), accIt("broom", "🧹", "Broom", "NEW")];
  const equipped = (hat ? 1 : 0) + (glass ? 1 : 0) + Object.values(acc).filter(Boolean).length;
  const prevReady = useRef(0);
  useEffect(() => { if (readyCount > prevReady.current && prevReady.current > 0) sfx.coin(); prevReady.current = readyCount; }, [readyCount]);
  useEffect(() => { if (time > 0 && time <= 5) sfx.tickUrgent(); else if (time > 0 && time < 15) sfx.tick(); }, [time]);
  useEffect(() => {
    const allReady = ready && others.every((v, i) => players[i].name === "YOU" || v);
    if (allReady) setTime((t) => Math.min(t, 3));
  }, [ready, others]);
  useEffect(() => {
    if (time === 0 && !started.current) {
      started.current = true;
      onStart({ fur: me.k, color: me.c, metal: !!me.metal, hat, glasses: glass, duck: acc.duck, gloves: acc.gloves, hammer: acc.hammer, shorts: acc.shorts, belt: acc.belt, broom: acc.broom, clown: acc.clown });
    }
  }, [time]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#2a2622] select-none" style={{ fontFamily: "'Lilita One', sans-serif" }}>
      <Canvas shadows camera={{ position: [0, 3.2, 26], fov: 30 }} dpr={[1, 1.5]} gl={{ powerPreference: "high-performance", antialias: true, stencil: false }}>
        <Environment resolution={64}>
          <Lightformer intensity={2} position={[0, 5, 5]} scale={[10, 5, 1]} color="#fff4e0" />
          <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color="#ffd59e" />
          <Lightformer intensity={1} position={[6, 2, 2]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color="#ffffff" />
          <Lightformer intensity={0.6} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} color="#b07a40" />
        </Environment>
        {scene === "locker" ? (
          <>
            <color attach="background" args={["#2a2622"]} />
            <fog attach="fog" args={["#3a332d", 30, 60]} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#fff4e0", "#5a4a3a", 0.6]} />
        <directionalLight position={[2, 8, 6]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={8} shadow-camera-bottom={-4} />
        <spotLight position={[0, 7, 4]} angle={0.35} penumbra={0.8} intensity={60} color="#fff1c7" target-position={[0, 0, 0.6]} />
        <Room />
          </>
        ) : <HillScene />}
        {players.map((p, i) => (
          <Ball key={p.name} x={p.x} name={p.name} you={p.name === "YOU"} delay={0.3 + Math.abs(i - 3) * 0.12} ready={p.name === "YOU" ? ready : others[i]}
            look={p.name === "YOU"
              ? { fur: me.k, color: me.c, metal: me.metal, hat, glasses: glass, duck: acc.duck && !acc.shorts, gloves: acc.gloves, hammer: acc.hammer, shorts: acc.shorts, belt: acc.belt, collar: !acc.belt, broom: acc.broom, clown: acc.clown }
              : { fur: p.c, color: "#999", hat: p.name === "Apiipp" ? "crown" : p.name === "Mochi" ? "cap" : p.name === "Kopi" ? "cowboy" : p.name === "luffy" ? "afro" : null,
                  glasses: p.name === "Rattlexnake" ? "classic" : p.name === "Epun" ? "pixel" : null, duck: p.name === "Epun",
                  shorts: p.name === "luffy" || p.name === "Rattlexnake", belt: p.name === "Rattlexnake", hammer: p.name === "Mochi" || p.name === "Kopi",
                  gloves: p.name === "luffy" || p.name === "Rattlexnake", clown: p.name === "luffy" || p.name === "Epun", broom: p.name === "Epun" || p.name === "Apiipp" }} />
        ))}
        <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={20} blur={2} far={3} resolution={256} frames={2} />
        <Rig shift={panel ? 1 : 0} hill={scene === "hill"} />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none" style={{ background: scene === "hill" ? "radial-gradient(ellipse at 50% 45%, transparent 70%, rgba(20,70,120,.15))" : "radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(20,12,4,.55))" }} />
      <div className={`absolute inset-x-0 bottom-0 h-[38%] pointer-events-none bg-gradient-to-t to-transparent ${scene === "hill" ? "from-[#1f5a18]/30" : "from-[#1a120a]/70"}`} />

      {/* top-left */}
      <div className="absolute top-5 left-5 flex items-center gap-3 animate-[slideL_.5s_.35s_both_cubic-bezier(.3,1.5,.5,1)]">
        <JButton sound="back" onClick={onBack}
          className="h-12 pl-3 pr-5 rounded-2xl bg-[#fff8ec] text-[#3b2a1a] flex items-center gap-2 text-lg shadow-[0_4px_0_rgba(0,0,0,.25),0_10px_24px_rgba(0,0,0,.25)] hover:-translate-x-1">
          <span className="w-7 h-7 rounded-lg bg-[#3b2a1a] text-white flex items-center justify-center text-base">‹</span> BACK
          <kbd className="ml-1 text-[11px] font-sans font-bold text-[#3b2a1a]/50">ESC</kbd>
        </JButton>
        <MuteButton />
        <div className="relative h-12 p-1 rounded-2xl bg-[#fff8ec] flex shadow-[0_4px_0_rgba(0,0,0,.25),0_10px_24px_rgba(0,0,0,.25)]">
          <div className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-b from-[#ffe14d] to-[#ffb000] shadow-[0_2px_0_#c27c00] transition-all duration-300 ease-[cubic-bezier(.3,1.5,.5,1)]"
            style={{ left: scene === "hill" ? 4 : "50%" }} />
          {([["hill", "⛰️", "HILL"], ["locker", "🚪", "LOCKER"]] as const).map(([k, ic, lb]) => (
            <JButton key={k} sound="select" onClick={() => setScene(k)}
              className={`relative z-10 w-[92px] rounded-xl flex items-center justify-center gap-1.5 text-sm ${scene === k ? "text-[#4a2c00]" : "text-[#3b2a1a]/50 hover:text-[#3b2a1a]/80"}`}>
              <span className="text-lg">{ic}</span>{lb}
            </JButton>
          ))}
        </div>
      </div>

      {/* timer */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 animate-[slideD_.6s_.25s_both_cubic-bezier(.3,1.6,.5,1)]">
        <div className="bg-[#fff8ec] rounded-b-[28px] pl-4 pr-6 pt-3 pb-3 flex items-center gap-4 shadow-[0_8px_0_rgba(0,0,0,.18),0_14px_30px_rgba(0,0,0,.3)]">
          <div className="relative w-14 h-14">
            <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
              <circle cx="28" cy="28" r="23" fill="none" stroke="#3b2a1a14" strokeWidth="6" />
              <circle cx="28" cy="28" r="23" fill="none" stroke={time <= 5 ? "#ff4d1a" : "#f5b400"} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={144.5} strokeDashoffset={144.5 * (1 - time / 15)} style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
            </svg>
            <span key={time} className={`absolute inset-0 flex items-center justify-center text-2xl tabular-nums animate-[jelly_.4s_ease] ${time <= 5 ? "text-[#ff4d1a]" : "text-[#3b2a1a]"}`}>{time}</span>
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-sans font-extrabold tracking-[.18em] text-[#3b2a1a]/45">{readyCount === players.length ? "ALL READY!" : "MATCH STARTS IN"}</div>
            <div className="flex items-center gap-1.5 mt-1">
              {players.map((p, i) => {
                const r = p.name === "YOU" ? ready : others[i];
                return <span key={p.name} className={`h-2.5 rounded-full transition-all duration-300 ${r ? "w-5 bg-[#22c55e]" : "w-2.5 bg-[#3b2a1a]/15"} ${p.name === "YOU" ? "ring-2 ring-[#f5b400] ring-offset-1 ring-offset-[#fff8ec]" : ""}`} />;
              })}
              <span className="ml-1.5 text-[#3b2a1a] text-lg tabular-nums">{readyCount}/{players.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* wardrobe toggle */}
      <JButton sound={panel ? "unequip" : "equip"} onClick={() => setPanel((v) => !v)}
        className={`absolute top-5 right-5 h-12 pl-3 pr-4 rounded-2xl flex items-center gap-2 text-lg z-20 animate-[slideR_.5s_.4s_both_cubic-bezier(.3,1.5,.5,1)] ${panel ? "bg-[#3b2a1a] text-white shadow-[0_4px_0_#000]" : "bg-gradient-to-b from-[#ffe14d] to-[#ffb000] text-[#4a2c00] shadow-[0_4px_0_#b45309,0_10px_24px_rgba(0,0,0,.25)] hover:scale-105"}`}>
        <span className="text-2xl">{panel ? "✕" : "👕"}</span>{panel ? "CLOSE" : "WARDROBE"}
        {!panel && <span className="ml-1 min-w-6 h-6 px-1.5 rounded-full bg-[#ff4d1a] text-white text-sm flex items-center justify-center">{equipped}</span>}
      </JButton>

      {/* wardrobe panel */}
      {panel && (
        <div className="absolute top-20 right-5 bottom-[150px] w-[min(340px,86vw)] z-10 animate-[panelIn_.45s_cubic-bezier(.3,1.3,.5,1)_both]">
          <div className="h-full bg-[#fff8ec] rounded-[28px] shadow-[0_10px_0_rgba(0,0,0,.18),0_24px_50px_rgba(0,0,0,.35)] flex flex-col overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <div>
                <div className="text-2xl text-[#3b2a1a]">WARDROBE</div>
                <div className="text-xs font-sans font-bold text-[#3b2a1a]/45 -mt-0.5">{equipped} items equipped</div>
              </div>
              <JButton sound="unequip" onClick={resetLook} className="text-xs font-sans font-extrabold tracking-wider text-[#3b2a1a]/55 hover:text-[#ff4d1a] px-2 py-1 rounded-lg hover:bg-[#3b2a1a]/5">RESET</JButton>
            </div>
            <div className="mx-4 p-1 bg-[#3b2a1a]/[.07] rounded-2xl grid grid-cols-4 gap-1 relative">
              <div className="absolute top-1 bottom-1 rounded-xl bg-white shadow-[0_2px_0_rgba(0,0,0,.08),0_4px_10px_rgba(0,0,0,.08)] transition-all duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]"
                style={{ left: `calc(${TABS.indexOf(tab)} * 25% + 4px)`, width: "calc(25% - 6px)" }} />
              {TABS.map((t) => (
                <JButton key={t} sound="select" onClick={() => setTab(t)} className={`relative z-10 py-2 rounded-xl text-sm flex flex-col items-center leading-none gap-1 ${tab === t ? "text-[#3b2a1a]" : "text-[#3b2a1a]/45 hover:text-[#3b2a1a]/75"}`}>
                  <span className={`text-xl transition-transform ${tab === t ? "scale-110" : ""}`}>{TAB_ICON[t]}</span>{t}
                </JButton>
              ))}
            </div>
            <div key={tab} className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-2.5 content-start">
              {items.map((it, i) => (
                <JButton key={it.id} sound={it.on ? "unequip" : "equip"} onClick={it.toggle}
                  style={{ animation: `tileIn .35s ${i * 0.04}s cubic-bezier(.3,1.6,.5,1) both` }}
                  className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 ${it.on
                    ? "bg-gradient-to-b from-[#fff3b0] to-[#ffd23d] shadow-[0_4px_0_#d99a00,inset_0_0_0_2px_#fff7] -translate-y-0.5"
                    : "bg-white shadow-[0_4px_0_rgba(59,42,26,.12)] hover:-translate-y-1 hover:shadow-[0_6px_0_rgba(59,42,26,.14)]"}`}>
                  <span className={`text-[34px] leading-none drop-shadow-sm ${it.on ? "animate-[jelly_.45s_ease]" : ""}`}>{it.icon}</span>
                  <span className={`text-[11px] leading-tight text-center px-1 ${it.on ? "text-[#5a3800]" : "text-[#3b2a1a]/70"}`}>{it.name}</span>
                  {it.on && <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#22c55e] text-white text-sm flex items-center justify-center shadow-[0_2px_0_#15803d] animate-[tileIn_.3s_cubic-bezier(.3,2,.5,1)_both]">✓</span>}
                  {it.tag && <span className="absolute top-1.5 left-1.5 text-[9px] font-sans font-black px-1.5 py-0.5 rounded-md bg-[#ff4d1a] text-white">{it.tag}</span>}
                </JButton>
              ))}
            </div>
            {tab === "GEAR" && <div className="px-5 pb-4 -mt-1 text-[11px] font-sans font-bold text-[#3b2a1a]/45">⚡ Weapons push 35% harder in the arena. Only one weapon at a time.</div>}
          </div>
        </div>
      )}

      {/* bottom: cat picker */}
      <div className="absolute bottom-[96px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-[slideU_.6s_.5s_both_cubic-bezier(.3,1.5,.5,1)]">
        <div className="flex items-center gap-3">
          <JButton sound="select" onClick={() => cycle(-1)} className="w-9 h-9 rounded-full bg-white/15 text-white text-lg hover:bg-white/30 backdrop-blur ring-1 ring-white/20">‹</JButton>
          <div key={me.n} className="min-w-[150px] text-center text-white text-2xl tracking-wide animate-[jelly_.4s_ease]" style={{ textShadow: "0 3px 0 rgba(0,0,0,.35)" }}>
            {me.n.toUpperCase()} {me.metal && <span className="text-xs align-middle font-sans font-black px-1.5 py-0.5 rounded bg-gradient-to-b from-[#ffe98a] to-[#e3a400] text-[#5a3800]">RARE</span>}
          </div>
          <JButton sound="select" onClick={() => cycle(1)} className="w-9 h-9 rounded-full bg-white/15 text-white text-lg hover:bg-white/30 backdrop-blur ring-1 ring-white/20">›</JButton>
        </div>
        <div className="flex items-end gap-[clamp(4px,0.6vw,10px)] px-3 py-2.5 rounded-[26px] bg-black/25 backdrop-blur-md ring-1 ring-white/10 max-w-[94vw] overflow-x-auto">
          {outfits.map((o, i) => (
            <JButton key={o.n} sound="select" onClick={() => setOutfit(i)} title={o.n}
              className={`relative shrink-0 rounded-full p-[3px] ${i === outfit
                ? "w-[clamp(46px,5vw,70px)] h-[clamp(46px,5vw,70px)] bg-gradient-to-b from-[#ffe14d] to-[#f5a400] shadow-[0_0_0_3px_rgba(255,255,255,.9),0_8px_24px_rgba(255,190,0,.55)] -translate-y-1"
                : "w-[clamp(38px,4vw,54px)] h-[clamp(38px,4vw,54px)] bg-[#f4ece0] hover:-translate-y-1 hover:scale-105 opacity-90 hover:opacity-100"}`}>
              <div className="w-full h-full rounded-full bg-[#e7ddcf] flex items-end justify-center overflow-hidden">
                <CatFace f={o.f} />
              </div>
              {o.metal && <span className="absolute -top-1 -right-1 text-xs">✨</span>}
            </JButton>
          ))}
        </div>
      </div>

      {/* ready */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 animate-[slideU_.6s_.65s_both_cubic-bezier(.3,1.5,.5,1)]">
        <JButton sound={ready ? "unready" : "ready"} onClick={() => setReady((r) => !r)}
          style={!ready ? { animation: "readyGlow 1.6s ease-in-out infinite" } : undefined}
          className={`j-shine h-16 min-w-[260px] px-8 rounded-[22px] flex items-center justify-center gap-3 text-3xl tracking-wide ${ready
            ? "bg-[#fff8ec] text-[#3b2a1a] shadow-[0_8px_0_rgba(0,0,0,.25)]"
            : "bg-gradient-to-b from-[#ffe14d] via-[#ffc21a] to-[#ff9d00] text-white shadow-[0_8px_0_#b45309] hover:scale-105"}`}>
          <span className={`w-9 h-9 rounded-full text-lg flex items-center justify-center ${ready ? "bg-[#22c55e] text-white" : "bg-white/30 text-white"}`}>{ready ? "✓" : "A"}</span>
          <span style={!ready ? { textShadow: "0 3px 0 #c2600088" } : undefined}>{ready ? "READY!" : "READY UP"}</span>
        </JButton>
        {ready && <div className="text-center text-white/70 text-sm mt-2 font-sans font-bold animate-[tileIn_.3s_both]">Click again to unready</div>}
      </div>

      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 text-sm animate-[slideR_.5s_.7s_both]">
        <KeyHint k="◀ ▶" label="CAT" />
        <KeyHint k="ENTER" label="READY" />
      </div>
    </div>
  );
}
