// Senjata sapu: gagang kayu + grip + kepala jerami +
// 2 pengikat + rumbai. Senjata andalan tukang bersih-bersih arena.

import * as THREE from 'three';

export type BroomTheme = { name: string; stick: string; head: string };

export const BROOM_THEMES: BroomTheme[] = [
  { name: 'Classic', stick: '#8A5A2B', head: '#E8C25A' },
  { name: 'Witch', stick: '#3A2E5A', head: '#7A5A8A' },
  { name: 'Bubblegum', stick: '#FF7AB8', head: '#FFD9E8' },
  { name: 'Golden', stick: '#5A3418', head: '#E8A800' },
];

const BAND = '#C22A20';

export default function BroomModel({ theme, wireframe = false }: { theme: BroomTheme; wireframe?: boolean }) {
  const strawDark = new THREE.Color(theme.head).multiplyScalar(0.78).getStyle();
  const bristles = Array.from({ length: 7 }).map((_, i) => {
    const a = (i / 7) * Math.PI * 2;
    return { x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3 };
  });

  return (
    <group position={[0, 0.1, 0]} rotation={[0, 0, -0.28]} scale={0.72}>
      {/* gagang */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 1.9, 14]} />
        <meshStandardMaterial color={theme.stick} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* grip atas */}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.25, 14]} />
        <meshStandardMaterial color={BAND} roughness={0.55} wireframe={wireframe} />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.075, 14, 14]} />
        <meshStandardMaterial color={BAND} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* leher */}
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[0.09, 0.15, 0.2, 14]} />
        <meshStandardMaterial color={strawDark} roughness={0.6} wireframe={wireframe} />
      </mesh>
      {/* kepala jerami */}
      <mesh position={[0, -0.78, 0]}>
        <cylinderGeometry args={[0.15, 0.4, 0.6, 14]} />
        <meshStandardMaterial color={theme.head} roughness={0.65} wireframe={wireframe} />
      </mesh>
      {/* pengikat */}
      {[0.12, -0.12].map((dy, i) => (
        <mesh key={i} position={[0, -0.66 + dy, 0]}>
          <cylinderGeometry args={[0.24 + (dy < 0 ? 0.08 : 0), 0.24 + (dy < 0 ? 0.08 : 0), 0.07, 14]} />
          <meshStandardMaterial color={BAND} roughness={0.55} wireframe={wireframe} />
        </mesh>
      ))}
      {/* rumbai */}
      {bristles.map((b, i) => (
        <mesh key={i} position={[b.x, -1.12, b.z]}>
          <coneGeometry args={[0.055, 0.2, 8]} />
          <meshStandardMaterial color={strawDark} roughness={0.7} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
