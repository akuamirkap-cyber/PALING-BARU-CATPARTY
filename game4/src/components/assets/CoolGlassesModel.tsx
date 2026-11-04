// COOL shades: wayfarer kotak + brow bar emas + lensa gelap.
// Auto terlihat keren dari jauh. Miring 15 derajat? Tidak — tetap lurus biar rapi.

import { RoundedBox } from '@react-three/drei';

export type CoolTheme = { name: string; main: string; accent: string };

export const COOL_THEMES: CoolTheme[] = [
  { name: 'Midnight Gold', main: '#1C1C24', accent: '#E8A800' },
  { name: 'Cherry', main: '#D92B1F', accent: '#FFE27A' },
  { name: 'Ocean Silver', main: '#1E6FDB', accent: '#E8E8E8' },
  { name: 'Grape', main: '#7A3BFF', accent: '#FFE27A' },
];

export default function CoolGlassesModel({ theme, wireframe = false }: { theme: CoolTheme; wireframe?: boolean }) {
  return (
    <group position={[0, 0.1, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0.42 * s, -0.04, 0]}>
          {/* lensa wayfarer */}
          <mesh>
            <RoundedBox args={[0.56, 0.44, 0.18]} radius={0.1} smoothness={4}>
              <meshStandardMaterial color={theme.main} roughness={0.15} metalness={0.3} wireframe={wireframe} />
            </RoundedBox>
          </mesh>
          {/* kilau slash */}
          <mesh position={[-0.12, 0.03, 0.095]} rotation={[0, 0, 0.5]}>
            <boxGeometry args={[0.08, 0.32, 0.02]} />
            <meshBasicMaterial color="white" transparent opacity={0.85} />
          </mesh>
          {/* dot emas di pelipis */}
          <mesh position={[0.26 * s, 0.05, 0.02]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color={theme.accent} metalness={0.9} roughness={0.25} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
      {/* brow bar emas */}
      <mesh position={[0, 0.24, -0.02]}>
        <boxGeometry args={[1.05, 0.07, 0.07]} />
        <meshStandardMaterial color={theme.accent} metalness={0.9} roughness={0.25} wireframe={wireframe} />
      </mesh>
      {/* bridge */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.2, 0.07, 0.07]} />
        <meshStandardMaterial color={theme.main} roughness={0.3} wireframe={wireframe} />
      </mesh>
      {/* gagang */}
      {[-1, 1].map((s) => (
        <mesh key={'a' + s} position={[0.7 * s, 0.06, -0.45]}>
          <boxGeometry args={[0.09, 0.09, 0.95]} />
          <meshStandardMaterial color={theme.main} roughness={0.35} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
