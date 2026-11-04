import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export type Fur = {
  body: string; belly: string; paw: string; eye: string;
  mask?: string; ear?: string; stripe?: string; whisker?: string; metal?: boolean;
};

export const FURS: Record<string, Fur & { label: string }> = {
  tabby: { label: "Tabby", body: "#f2994a", belly: "#fff6ea", paw: "#fff6ea", eye: "#b9e08e", stripe: "#d0701f", whisker: "#5b3a1e" },
  siamese: { label: "Siamese", body: "#efe5d8", belly: "#efe5d8", paw: "#4a3326", eye: "#8cc6ee", mask: "#4a3326", ear: "#4a3326", whisker: "#ffffff" },
  gold: { label: "Gold", body: "#f5c542", belly: "#ffe7a3", paw: "#ffe7a3", eye: "#7c4a12", metal: true, whisker: "#7c4a12" },
  tuxedo: { label: "Tuxedo", body: "#26272b", belly: "#f7f7f5", paw: "#f7f7f5", eye: "#f5d042", whisker: "#ffffff" },
  gray: { label: "Gray", body: "#9aa3ad", belly: "#e8ecef", paw: "#e8ecef", eye: "#f2b84b", stripe: "#7d8792", whisker: "#3a3f45" },
  snow: { label: "Snow", body: "#fbfaf7", belly: "#fbfaf7", paw: "#ffd6df", eye: "#7cc4f0", whisker: "#c9c9c9" },
  choco: { label: "Choco", body: "#7b4a2d", belly: "#e9c9a8", paw: "#e9c9a8", eye: "#9be27a", stripe: "#5b3420", whisker: "#2c1a10" },
  cream: { label: "Cream", body: "#f3d29b", belly: "#fff6e6", paw: "#fff6e6", eye: "#86c9f0", stripe: "#e0b26b", whisker: "#7a5530" },
  husky: { label: "Husky", body: "#6b7280", belly: "#f4f4f5", paw: "#f4f4f5", eye: "#7cc4f0", mask: "#f4f4f5", whisker: "#222" },
  pink: { label: "Bubblegum", body: "#f9a8c9", belly: "#fff0f6", paw: "#fff0f6", eye: "#7c3aed", whisker: "#9d174d" },
  mint: { label: "Mint", body: "#8be3b8", belly: "#effff6", paw: "#effff6", eye: "#1e40af", whisker: "#065f46" },
  black: { label: "Shadow", body: "#1c1c22", belly: "#1c1c22", paw: "#1c1c22", eye: "#a3e635", whisker: "#9ca3af" },
};

export function furFor(key?: string, color?: string, metal?: boolean): Fur {
  if (key && FURS[key]) return FURS[key];
  return { body: color ?? "#f2994a", belly: "#fff6ea", paw: "#fff6ea", eye: "#b9e08e", metal, whisker: "#3a2a1a" };
}

/* body profile (radius vs height), in units of r. Head + body form one bean. */
const PROFILE: [number, number][] = [
  [0, -0.62], [0.42, -0.6], [0.66, -0.5], [0.78, -0.3], [0.82, -0.05], [0.79, 0.25], [0.72, 0.5],
  [0.7, 0.62], [0.76, 0.78], [0.83, 0.98], [0.86, 1.2], [0.85, 1.42], [0.78, 1.64], [0.62, 1.82], [0.36, 1.94], [0, 1.98],
];
export const HEAD_Y = 1.22, HEAD_R = 0.86, Z_FLAT = 0.86;
export function radiusAt(y: number) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i], [r0, y0] = PROFILE[i - 1];
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0;
}
/* front surface z at (x,y) */
export const frontZ = (x: number, y: number) => Z_FLAT * Math.sqrt(Math.max(0, radiusAt(y) ** 2 - x * x));

function useMat(color: string, metal?: boolean, rough = 0.55) {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color, roughness: metal ? 0.18 : rough, metalness: metal ? 1 : 0,
        clearcoat: metal ? 1 : 0, clearcoatRoughness: 0.4,
        envMapIntensity: metal ? 1.8 : 1,
      }),
    [color, metal, rough],
  );
}

function Eye({ side, fur, blink }: { side: number; fur: Fur; blink: React.MutableRefObject<THREE.Group[]> }) {
  const x = side * 0.34, y = 1.28;
  const z = frontZ(x, y) - 0.035;
  return (
    <group position={[x, y, z]} rotation={[-0.08, side * 0.42, 0]}>
      <group ref={(el) => { if (el) blink.current[side > 0 ? 1 : 0] = el; }}>
        <mesh scale={[1, 1.04, 0.32]}><sphereGeometry args={[0.285, 20, 16]} /><meshStandardMaterial color="#0d0d10" roughness={0.4} /></mesh>
        <mesh position={[0, 0, 0.012]} scale={[1, 1.04, 0.34]}><sphereGeometry args={[0.255, 20, 16]} /><meshPhysicalMaterial color={fur.eye} roughness={0.15} clearcoat={1} /></mesh>
        <mesh position={[-side * 0.025, 0.01, 0.06]} scale={[1, 1.05, 0.4]}><sphereGeometry args={[0.165, 20, 16]} /><meshPhysicalMaterial color="#141a2e" roughness={0.05} clearcoat={1} /></mesh>
        <mesh position={[-side * 0.07 + 0.04, 0.08, 0.13]}><sphereGeometry args={[0.045, 16, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
        <mesh position={[side * 0.03 + 0.03, -0.06, 0.125]}><sphereGeometry args={[0.02, 10, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
      </group>
      {/* angry brow */}
      <mesh position={[side * 0.02, 0.25, 0.07]} rotation-z={side * 0.32}><capsuleGeometry args={[0.04, 0.3, 6, 12]} /><meshStandardMaterial color="#141414" roughness={0.5} /></mesh>
    </group>
  );
}

export function Cat({ fur, r = 1, getSpeed, seed = 0, showEars = true, showEyes = true }: {
  fur: Fur; r?: number; getSpeed?: () => number; seed?: number; showEars?: boolean; showEyes?: boolean;
}) {
  const bodyGeo = useMemo(() => new THREE.LatheGeometry(PROFILE.map(([a, b]) => new THREE.Vector2(a, b)), 40), []);
  const body = useMat(fur.body, fur.metal);
  const belly = useMat(fur.belly, fur.metal);
  const paw = useMat(fur.paw, fur.metal);
  const ear = useMat(fur.ear ?? fur.body, fur.metal);
  const stripe = useMat(fur.stripe ?? fur.body, fur.metal, 0.6);
  const mask = useMat(fur.mask ?? fur.body, fur.metal, 0.6);
  const armL = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!);
  const root = useRef<THREE.Group>(null!);
  const blink = useRef<THREE.Group[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed;
    const sp = Math.min(getSpeed ? getSpeed() : 0, 1);
    const w = Math.sin(t * 13) * sp;
    const idle = Math.sin(t * 1.8) * 0.06 * (1 - sp);
    armL.current.rotation.x = w * 0.9 + idle; armR.current.rotation.x = -w * 0.9 - idle;
    armL.current.rotation.z = -0.1 - Math.abs(idle) * 0.5; armR.current.rotation.z = 0.1 + Math.abs(idle) * 0.5;
    legL.current.rotation.x = -w * 0.8; legR.current.rotation.x = w * 0.8;
    root.current.rotation.z = Math.sin(t * 13) * 0.05 * sp;
    const bl = (t % 4.3) < 0.13 ? 0.08 : 1;
    blink.current.forEach((b) => b && (b.scale.y = THREE.MathUtils.lerp(b.scale.y, bl, 0.6)));
  });

  const hasBelly = fur.belly !== fur.body;
  const tabby = !!fur.stripe;
  return (
    <group scale={r}>
      <group ref={root}>
        {/* body + stripes + belly (flattened front-back) */}
        <group scale={[1, 1, Z_FLAT]}>
          <mesh geometry={bodyGeo} material={body} castShadow receiveShadow />
          {tabby && [-0.28, -0.02, 0.24].map((y, i) => [0.45, 0.45 - Math.PI].map((th) => (
            <group key={y + "_" + th} position={[0, y, 0]} rotation-y={th}>
              <mesh rotation-x={Math.PI / 2} material={stripe}><torusGeometry args={[radiusAt(y) + 0.003, 0.028 - i * 0.004, 8, 24, 0.9]} /></mesh>
            </group>
          )))}
          {hasBelly && <mesh position={[0, 0.02, 0.46]} scale={[1, 1.22, 0.42]} material={belly}><sphereGeometry args={[0.5, 20, 16]} /></mesh>}
        </group>

        {/* forehead stripes */}
        {tabby && [-0.11, 0, 0.11].map((x, i) => (
          <mesh key={x} position={[x, 1.66 - (i === 1 ? 0 : 0.03), frontZ(x, 1.66) - 0.01]} rotation={[-0.55, x * 1.5, 0]} material={stripe}>
            <capsuleGeometry args={[0.022, 0.16, 4, 8]} />
          </mesh>
        ))}
        {tabby && [-1, 1].map((s) => [0, 1].map((k) => (
          <mesh key={s + "_" + k} position={[s * 0.66, 1.2 - k * 0.1, frontZ(s * 0.66, 1.2) - 0.03]} rotation={[0, s * 0.9, s * 0.15]} material={stripe}>
            <capsuleGeometry args={[0.02, 0.12, 4, 8]} />
          </mesh>
        )))}

        {/* muzzle / mask */}
        {fur.mask ? (
          <mesh position={[0, 1.12, frontZ(0, 1.12) - 0.12]} scale={[1.25, 0.85, 0.42]} material={mask}><sphereGeometry args={[0.38, 20, 16]} /></mesh>
        ) : hasBelly ? (
          <mesh position={[0, 0.95, frontZ(0, 0.95) - 0.08]} scale={[1.25, 0.7, 0.35]} material={belly}><sphereGeometry args={[0.27, 20, 16]} /></mesh>
        ) : null}

        {/* eyes */}
        {showEyes && [-1, 1].map((s) => <Eye key={s} side={s} fur={fur} blink={blink} />)}

        {/* nose + mouth */}
        <group position={[0, 1.07, frontZ(0, 1.07) + 0.015]}>
          <mesh scale={[1.4, 0.85, 0.7]} position={[0, 0.02, 0]}><sphereGeometry args={[0.042, 16, 12]} /><meshPhysicalMaterial color={fur.mask ? "#2a1a12" : "#f2909c"} roughness={0.3} clearcoat={1} /></mesh>
          <mesh position={[0, -0.04, -0.005]}><cylinderGeometry args={[0.009, 0.009, 0.06, 6]} /><meshStandardMaterial color="#2a1a12" /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.062, -0.075, -0.012]} rotation-z={Math.PI}><torusGeometry args={[0.062, 0.011, 8, 20, Math.PI]} /><meshStandardMaterial color="#2a1a12" /></mesh>
          ))}
        </group>
        {/* whiskers */}
        {[-1, 1].map((s) => [0.05, 0, -0.05].map((dy, k) => (
          <mesh key={s + "_" + k} position={[s * 0.38, 1.04 + dy, frontZ(0.2, 1.04) - 0.02]} rotation={[0, s * -0.3, Math.PI / 2 + s * (k - 1) * -0.12]}>
            <cylinderGeometry args={[0.006, 0.004, 0.5, 5]} /><meshStandardMaterial color={fur.whisker ?? "#3a2a1a"} />
          </mesh>
        )))}

        {/* ears */}
        {showEars && [-1, 1].map((s) => (
          <group key={s} position={[s * 0.44, 1.8, 0]} rotation={[0, 0, -s * 0.38]}>
            <mesh scale={[1, 1, 0.55]} material={ear} castShadow><coneGeometry args={[0.24, 0.44, 32]} /></mesh>
            <mesh position={[0, -0.03, 0.08]} scale={[0.6, 0.75, 0.25]}><coneGeometry args={[0.24, 0.44, 24]} /><meshStandardMaterial color={fur.mask ? "#6b4a38" : "#f6a9b4"} roughness={0.7} /></mesh>
          </group>
        ))}

        {/* arms */}
        {[-1, 1].map((s) => (
          <group key={s} ref={s < 0 ? armL : armR} position={[s * 0.74, 0.42, 0.02]}>
            <mesh position={[0, -0.36, 0]} material={body} castShadow><capsuleGeometry args={[0.19, 0.42, 8, 20]} /></mesh>
            {tabby && [-0.22, -0.4].map((y) => <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2} material={stripe}><torusGeometry args={[0.193, 0.022, 6, 24]} /></mesh>)}
            <mesh position={[0, -0.66, 0.02]} scale={[1, 0.95, 1]} material={paw} castShadow><sphereGeometry args={[0.215, 24, 20]} /></mesh>
          </group>
        ))}

        {/* legs + feet */}
        {[-1, 1].map((s) => (
          <group key={s} ref={s < 0 ? legL : legR} position={[s * 0.34, -0.42, 0]}>
            <mesh position={[0, -0.2, 0]} material={body} castShadow><capsuleGeometry args={[0.25, 0.2, 8, 20]} /></mesh>
            {tabby && <mesh position={[0, -0.18, 0]} rotation-x={Math.PI / 2} material={stripe}><torusGeometry args={[0.253, 0.024, 6, 24]} /></mesh>}
            <mesh position={[0, -0.42, 0.06]} scale={[1, 0.62, 1.18]} material={paw} castShadow><sphereGeometry args={[0.28, 20, 16]} /></mesh>
            {[-0.08, 0.08].map((x) => (
              <mesh key={x} position={[x, -0.4, 0.37]} rotation-x={-0.3}><boxGeometry args={[0.012, 0.09, 0.02]} /><meshStandardMaterial color="#00000055" transparent opacity={0.3} /></mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}
