// Hidung badut: bola merah glossy + kilau + tali elastis.
// Dipencet bunyi "prit!" (tidak termasuk).

export type NoseTheme = { name: string; main: string; accent: string };

export const NOSE_THEMES: NoseTheme[] = [
  { name: 'Classic Red', main: '#E23A1E', accent: '#23232E' },
  { name: 'Cherry Dark', main: '#8E1414', accent: '#101018' },
  { name: 'Bubblegum', main: '#FF5D8F', accent: '#FFF7DC' },
  { name: 'Golden', main: '#E8A800', accent: '#5A3418' },
];

export default function ClownNoseModel({ theme, wireframe = false }: { theme: NoseTheme; wireframe?: boolean }) {
  return (
    <group position={[0, 0, 0]}>
      {/* bola hidung */}
      <mesh>
        <sphereGeometry args={[0.38, 32, 24]} />
        <meshPhysicalMaterial
          color={theme.main} roughness={0.15} metalness={0.05}
          clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={1.2}
          wireframe={wireframe}
        />
      </mesh>
      {/* kilau */}
      <mesh position={[-0.13, 0.14, 0.3]}>
        <sphereGeometry args={[0.09, 14, 14]} />
        <meshBasicMaterial color="white" transparent opacity={0.85} />
      </mesh>
      <mesh position={[-0.03, 0.05, 0.355]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="white" transparent opacity={0.7} />
      </mesh>
      {/* tali elastis */}
      <mesh position={[0, 0.05, -0.28]} rotation={[0.25, 0, 0]}>
        <torusGeometry args={[0.44, 0.05, 12, 40]} />
        <meshStandardMaterial color={theme.accent} roughness={0.6} wireframe={wireframe} />
      </mesh>
    </group>
  );
}
