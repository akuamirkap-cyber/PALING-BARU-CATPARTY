// Cowboy hat v3: atasan dibentuk ala koboy beneran —
// dua lobus + lembah tengah (crease) + cubitan depan (pinch).
// Tidak lagi terlihat seperti mangkok.

import * as THREE from 'three';

export type CowboyTheme = { name: string; main: string; band: string };

export const COWBOY_THEMES: CowboyTheme[] = [
  { name: 'Classic Tan', main: '#C68A3C', band: '#5A3418' },
  { name: 'Midnight', main: '#2B2B3A', band: '#E23A1E' },
  { name: 'Bubblegum', main: '#FF7AB8', band: '#FFF7DC' },
  { name: 'Ranger', main: '#3E7A4E', band: '#E8A800' },
  { name: 'Sheriff', main: '#4A2E18', band: '#E8A800' },
];

const GOLD = '#FFC53D';

export default function CowboyHatModel({ theme, wireframe = false }: { theme: CowboyTheme; wireframe?: boolean }) {
  const dark = new THREE.Color(theme.main).multiplyScalar(0.68).getStyle();
  const conchos = [-0.7, -0.35, 0, 0.35, 0.7].map((a) => ({
    x: Math.sin(a) * 0.64,
    z: Math.cos(a) * 0.64,
  }));

  return (
    <group position={[0, -0.35, 0]} rotation={[0.08, 0, -0.06]}>
      {/* brim */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.18, 1.28, 0.14, 28]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} wireframe={wireframe} />
      </mesh>
      {/* rolled edge */}
      <mesh position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.22, 0.055, 12, 48]} />
        <meshStandardMaterial color={dark} roughness={0.55} wireframe={wireframe} />
      </mesh>

      {/* dome: 3 lobus = lembah tengah alami */}
      <mesh position={[-0.17, 0.4, -0.04]}>
        <sphereGeometry args={[0.5, 26, 20]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} wireframe={wireframe} />
      </mesh>
      <mesh position={[0.17, 0.4, -0.04]}>
        <sphereGeometry args={[0.5, 26, 20]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} wireframe={wireframe} />
      </mesh>
      <mesh position={[0, 0.36, -0.14]}>
        <sphereGeometry args={[0.52, 26, 20]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} wireframe={wireframe} />
      </mesh>
      {/* cubitan depan kiri-kanan */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.3 * s, 0.44, 0.4]} scale={[1, 0.75, 0.55]}>
          <sphereGeometry args={[0.16, 16, 14]} />
          <meshStandardMaterial color={dark} roughness={0.6} wireframe={wireframe} />
        </mesh>
      ))}

      {/* band */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.61, 0.64, 0.2, 24]} />
        <meshStandardMaterial color={theme.band} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* conchos emas */}
      {conchos.map((c, i) => (
        <mesh key={i} position={[c.x, 0.14, c.z]}>
          <sphereGeometry args={[0.06, 14, 14]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.3} wireframe={wireframe} />
        </mesh>
      ))}
      {/* pita samping */}
      <group position={[-0.6, 0.14, -0.18]} rotation={[0, 0.5, 0]}>
        <mesh position={[-0.1, 0.05, 0]} rotation={[0, 0, 0.7]}>
          <coneGeometry args={[0.07, 0.2, 10]} />
          <meshStandardMaterial color={theme.band} roughness={0.55} wireframe={wireframe} />
        </mesh>
        <mesh position={[-0.1, -0.08, 0]} rotation={[0, 0, -0.7 + Math.PI]}>
          <coneGeometry args={[0.07, 0.2, 10]} />
          <meshStandardMaterial color={theme.band} roughness={0.55} wireframe={wireframe} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.3} wireframe={wireframe} />
        </mesh>
      </group>
      {/* badge sheriff */}
      <group position={[0, 0.14, 0.65]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.05, 20]} />
          <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.3} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color="#E23A1E" roughness={0.4} wireframe={wireframe} />
        </mesh>
      </group>
    </group>
  );
}
