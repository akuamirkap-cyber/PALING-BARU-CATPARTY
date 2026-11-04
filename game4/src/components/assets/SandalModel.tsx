// Sandal jepit v2: sol berlapis + pad kaki + pasak + tali TABUNG
// yang dihitung menyambung dari pasak ke sisi sol. Tidak ada lagi
// tali melayang — semuanya nyambung pas.

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';

export type SandalTheme = { name: string; sole: string; strap: string };

export const SANDAL_THEMES: SandalTheme[] = [
  { name: 'Sunset', sole: '#FF7A00', strap: '#FFF7DC' },
  { name: 'Ocean', sole: '#1E7AE0', strap: '#FFF7DC' },
  { name: 'Bubblegum', sole: '#FF7AB8', strap: '#E14E8A' },
  { name: 'Choco', sole: '#5A3418', strap: '#E8A800' },
];

type V3 = [number, number, number];

// Tabung di antara dua titik — dijamin nyambung
function Tube({ from, to, r, color, wireframe = false }: { from: V3; to: V3; r: number; color: string; wireframe?: boolean }) {
  const { mid, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { mid, quat, len };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[r, r, len + 0.06, 12]} />
      <meshStandardMaterial color={color} roughness={0.55} wireframe={wireframe} />
    </mesh>
  );
}

function FlipFlop({ theme, wireframe = false }: { theme: SandalTheme; wireframe?: boolean }) {
  const pad = new THREE.Color(theme.sole).lerp(new THREE.Color('#FFFFFF'), 0.35).getStyle();
  const darkSole = new THREE.Color(theme.sole).multiplyScalar(0.7).getStyle();
  const postTop: V3 = [0, 0.3, 0.34];

  return (
    <group>
      {/* sol bawah (lapisan gelap) */}
      <mesh position={[0, -0.1, 0]}>
        <RoundedBox args={[0.62, 0.1, 1.22]} radius={0.045} smoothness={4}>
          <meshStandardMaterial color={darkSole} roughness={0.6} wireframe={wireframe} />
        </RoundedBox>
      </mesh>
      {/* sol utama */}
      <mesh position={[0, 0.02, 0]}>
        <RoundedBox args={[0.6, 0.18, 1.2]} radius={0.08} smoothness={4}>
          <meshStandardMaterial color={theme.sole} roughness={0.55} wireframe={wireframe} />
        </RoundedBox>
      </mesh>
      {/* pad pijakan */}
      <mesh position={[0, 0.13, 0]}>
        <RoundedBox args={[0.5, 0.06, 1.05]} radius={0.03} smoothness={4}>
          <meshStandardMaterial color={pad} roughness={0.6} wireframe={wireframe} />
        </RoundedBox>
      </mesh>
      {/* pasak jempol */}
      <mesh position={[0, 0.22, 0.34]}>
        <cylinderGeometry args={[0.04, 0.045, 0.18, 12]} />
        <meshStandardMaterial color={theme.strap} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* pentol pasak */}
      <mesh position={[0, 0.31, 0.34]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshStandardMaterial color={theme.strap} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* tali Y kiri-kanan — nyambung pasak ke sol */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Tube from={postTop} to={[0.26 * s, 0.15, -0.02]} r={0.045} color={theme.strap} wireframe={wireframe} />
          {/* jangkar tali di sol */}
          <mesh position={[0.26 * s, 0.15, -0.02]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.06, 14, 14]} />
            <meshStandardMaterial color={theme.strap} roughness={0.55} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function SandalModel({ theme, wireframe = false }: { theme: SandalTheme; wireframe?: boolean }) {
  return (
    <group position={[0, -0.4, 0]}>
      <group position={[-0.36, 0, 0]} rotation={[0, 0.14, 0]}>
        <FlipFlop theme={theme} wireframe={wireframe} />
      </group>
      <group position={[0.36, 0, 0.08]} rotation={[0, -0.12, 0]}>
        <FlipFlop theme={theme} wireframe={wireframe} />
      </group>
    </group>
  );
}
