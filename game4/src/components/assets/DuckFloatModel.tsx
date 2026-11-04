// Duck float v3 — versi CUTE: kepala super besar, mata belo,
// pipi tembem, jambul, paruh mungil. Proporsi bayi biar gemas.

import * as THREE from 'three';

export type DuckTheme = { name: string; body: string; beak: string };

export const DUCK_THEMES: DuckTheme[] = [
  { name: 'Classic', body: '#FFC53D', beak: '#FF7A00' },
  { name: 'Bubblegum', body: '#FF7AB8', beak: '#FF9E0B' },
  { name: 'Mint', body: '#5FE0B0', beak: '#FF7A00' },
  { name: 'Ocean', body: '#4FB3FF', beak: '#FFC53D' },
  { name: 'Choco', body: '#9A6A3B', beak: '#FFC53D' },
];

export default function DuckFloatModel({ theme, wireframe = false }: { theme: DuckTheme; wireframe?: boolean }) {
  const matte = { roughness: 0.45, metalness: 0.02, wireframe } as const;
  const dark = new THREE.Color(theme.body).multiplyScalar(0.85).getStyle();

  return (
    <group position={[0, -0.3, 0]} rotation={[0, 0, 0.05]}>
      {/* ban */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.7, 0.3, 20, 36]} />
        <meshStandardMaterial color={theme.body} {...matte} />
      </mesh>
      {/* kilau ban */}
      <mesh position={[-0.5, 0.2, 0.3]} scale={[1, 0.5, 0.6]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="white" transparent opacity={0.5} />
      </mesh>

      {/* kepala BESAR */}
      <group position={[0, 0.48, 0.58]} rotation={[0, 0, 0.07]}>
        <mesh>
          <sphereGeometry args={[0.42, 32, 24]} />
          <meshStandardMaterial color={theme.body} {...matte} />
        </mesh>
        {/* mata belo */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0.17 * s, 0.1, 0.36]}>
            <mesh>
              <sphereGeometry args={[0.095, 18, 18]} />
              <meshStandardMaterial color="#23130B" roughness={0.2} wireframe={wireframe} />
            </mesh>
            <mesh position={[0.032, 0.035, 0.07]}>
              <sphereGeometry args={[0.032, 12, 12]} />
              <meshBasicMaterial color="white" />
            </mesh>
            <mesh position={[-0.03, -0.03, 0.075]}>
              <sphereGeometry args={[0.014, 8, 8]} />
              <meshBasicMaterial color="white" transparent opacity={0.8} />
            </mesh>
          </group>
        ))}
        {/* pipi tembem */}
        {[-1, 1].map((s) => (
          <mesh key={'b' + s} position={[0.3 * s, -0.08, 0.28]} scale={[1, 0.75, 0.45]}>
            <sphereGeometry args={[0.095, 16, 16]} />
            <meshStandardMaterial color="#FF8FA0" roughness={0.6} wireframe={wireframe} />
          </mesh>
        ))}
        {/* paruh mungil */}
        <mesh position={[0, -0.06, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.13, 0.18, 18]} />
          <meshStandardMaterial color={theme.beak} {...matte} />
        </mesh>
        {/* jambul */}
        <mesh position={[0, 0.42, -0.02]} rotation={[0, 0, -0.25]}>
          <coneGeometry args={[0.08, 0.18, 10]} />
          <meshStandardMaterial color={theme.body} {...matte} />
        </mesh>
      </group>

      {/* sayap gembul */}
      {[-1, 1].map((s) => (
        <mesh key={'w' + s} position={[0.78 * s, 0.06, 0.05]} rotation={[0, 0, -0.4 * s]} scale={[0.55, 1, 0.4]}>
          <sphereGeometry args={[0.32, 20, 14]} />
          <meshStandardMaterial color={dark} {...matte} />
        </mesh>
      ))}
      {/* ekor */}
      <mesh position={[0, 0.3, -0.86]} rotation={[Math.PI / 2 + 0.5, 0, 0]}>
        <coneGeometry args={[0.17, 0.34, 14]} />
        <meshStandardMaterial color={dark} {...matte} />
      </mesh>
    </group>
  );
}
