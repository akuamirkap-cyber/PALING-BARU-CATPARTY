// DETECTIVE specs: bingkai emas TIPIS + lensa bening +
// gagang ramping. Elegan khas detektif — petunjuk +80%.

export type DetectiveTheme = { name: string; main: string; accent: string };

export const DETECTIVE_THEMES: DetectiveTheme[] = [
  { name: 'Gold', main: '#E8A800', accent: '#5A3418' },
  { name: 'Silver', main: '#C8CCD4', accent: '#23232E' },
  { name: 'Copper', main: '#B0662A', accent: '#3A2317' },
  { name: 'Rose', main: '#E8A08A', accent: '#5A2E3A' },
];

export default function DetectiveGlassesModel({ theme, wireframe = false }: { theme: DetectiveTheme; wireframe?: boolean }) {
  return (
    <group position={[0, 0.1, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0.36 * s, 0, 0]}>
          {/* bingkai tipis */}
          <mesh>
            <torusGeometry args={[0.27, 0.032, 12, 36]} />
            <meshStandardMaterial color={theme.main} metalness={0.9} roughness={0.25} wireframe={wireframe} />
          </mesh>
          {/* lensa bening */}
          <mesh position={[0, 0, -0.01]} scale={[1, 1, 0.2]}>
            <sphereGeometry args={[0.25, 24, 18]} />
            <meshStandardMaterial color="#FFFFFF" transparent opacity={0.28} roughness={0.05} metalness={0.1} wireframe={wireframe} />
          </mesh>
          {/* titik kilau */}
          <mesh position={[-0.1, 0.1, 0.05]}>
            <circleGeometry args={[0.035, 12]} />
            <meshBasicMaterial color="white" transparent opacity={0.9} />
          </mesh>
          {/* bridge melengkung */}
          <mesh position={[-0.34 * s, 0.12, 0]} rotation={[0, 0, 0.5 * s]}>
            <boxGeometry args={[0.16, 0.035, 0.035]} />
            <meshStandardMaterial color={theme.main} metalness={0.9} roughness={0.25} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
      {/* gagang ramping */}
      {[-1, 1].map((s) => (
        <mesh key={'a' + s} position={[0.64 * s, 0.05, -0.42]}>
          <boxGeometry args={[0.05, 0.05, 0.9]} />
          <meshStandardMaterial color={theme.accent} roughness={0.45} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
