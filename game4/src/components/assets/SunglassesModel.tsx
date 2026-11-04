// Sunglasses v2: bingkai penuh + lensa kaca gelap + double bridge +
// bantalan hidung + gagang. Terlihat seperti kacamata beneran.

export type ShadesTheme = { name: string; main: string; arms: string };

export const SHADES_THEMES: ShadesTheme[] = [
  { name: 'Jet Black', main: '#1C1C24', arms: '#1C1C24' },
  { name: 'Cherry', main: '#D92B1F', arms: '#2B2B3A' },
  { name: 'Ocean', main: '#1E6FDB', arms: '#101018' },
  { name: 'Grape', main: '#7A3BFF', arms: '#1C1C24' },
  { name: 'Bubblegum', main: '#FF7AB8', arms: '#FFF7DC' },
];

const LENS = '#101018';

export default function SunglassesModel({ theme, wireframe = false }: { theme: ShadesTheme; wireframe?: boolean }) {
  return (
    <group position={[0, 0.1, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0.4 * s, 0, 0]}>
          {/* bingkai */}
          <mesh scale={[1, 0.85, 0.55]}>
            <torusGeometry args={[0.31, 0.06, 14, 36]} />
            <meshStandardMaterial color={theme.main} roughness={0.35} wireframe={wireframe} />
          </mesh>
          {/* lensa kaca */}
          <mesh position={[0, 0, -0.03]} scale={[1, 0.85, 0.3]}>
            <sphereGeometry args={[0.29, 28, 20]} />
            <meshStandardMaterial color={LENS} roughness={0.08} metalness={0.5} wireframe={wireframe} />
          </mesh>
          {/* kilau diagonal */}
          <mesh position={[-0.09, 0.04, 0.085]} rotation={[0, 0, 0.45]}>
            <boxGeometry args={[0.07, 0.3, 0.02]} />
            <meshBasicMaterial color="white" transparent opacity={0.9} />
          </mesh>
          <mesh position={[-0.01, -0.04, 0.088]} rotation={[0, 0, 0.45]}>
            <boxGeometry args={[0.035, 0.14, 0.02]} />
            <meshBasicMaterial color="white" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
      {/* bridge bawah */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.22, 0.08, 0.08]} />
        <meshStandardMaterial color={theme.main} roughness={0.35} wireframe={wireframe} />
      </mesh>
      {/* brow bar atas */}
      <mesh position={[0, 0.3, -0.02]}>
        <boxGeometry args={[0.95, 0.06, 0.06]} />
        <meshStandardMaterial color={theme.main} roughness={0.35} wireframe={wireframe} />
      </mesh>
      {/* bantalan hidung */}
      {[-1, 1].map((s) => (
        <mesh key={'n' + s} position={[0.13 * s, -0.14, 0.02]} rotation={[0, 0.3 * s, 0]}>
          <boxGeometry args={[0.07, 0.14, 0.05]} />
          <meshStandardMaterial color="#2A2A33" roughness={0.6} wireframe={wireframe} />
        </mesh>
      ))}
      {/* gagang */}
      {[-1, 1].map((s) => (
        <group key={'a' + s} position={[0.72 * s, 0.1, -0.42]}>
          <mesh>
            <boxGeometry args={[0.09, 0.09, 0.9]} />
            <meshStandardMaterial color={theme.arms} roughness={0.45} wireframe={wireframe} />
          </mesh>
          {/* ujung gagang menekuk */}
          <mesh position={[0, -0.07, -0.45]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.085, 0.085, 0.25]} />
            <meshStandardMaterial color={theme.arms} roughness={0.45} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
