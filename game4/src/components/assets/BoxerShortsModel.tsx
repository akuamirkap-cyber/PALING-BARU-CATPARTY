// Celana boxer: karet pinggang + tali serut + badan + 2 kaki +
// list kaki + logo. Chunky dan empuk seperti celana beneran.

export type BoxerTheme = { name: string; main: string; accent: string };

export const BOXER_THEMES: BoxerTheme[] = [
  { name: 'Classic Red', main: '#D92B1F', accent: '#FFF7DC' },
  { name: 'Ocean', main: '#1E7AE0', accent: '#FFF7DC' },
  { name: 'Midnight', main: '#2B2B3A', accent: '#E8A800' },
  { name: 'Bubblegum', main: '#FF7AB8', accent: '#7A2E5A' },
];

export default function BoxerShortsModel({ theme, wireframe = false }: { theme: BoxerTheme; wireframe?: boolean }) {
  return (
    <group position={[0, -0.1, 0]}>
      {/* badan */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.56, 0.64, 0.5, 24]} />
        <meshStandardMaterial color={theme.main} roughness={0.6} wireframe={wireframe} />
      </mesh>
      {/* karet pinggang */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.56, 0.58, 0.24, 24]} />
        <meshStandardMaterial color={theme.accent} roughness={0.6} wireframe={wireframe} />
      </mesh>
      {/* garis karet */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.575, 0.585, 0.06, 24]} />
        <meshStandardMaterial color={theme.main} roughness={0.6} wireframe={wireframe} />
      </mesh>
      {/* kaki */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0.3 * s, 0, 0]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.3, 0.33, 0.42, 20]} />
            <meshStandardMaterial color={theme.main} roughness={0.6} wireframe={wireframe} />
          </mesh>
          {/* list kaki */}
          <mesh position={[0, -0.44, 0]}>
            <cylinderGeometry args={[0.325, 0.335, 0.1, 20]} />
            <meshStandardMaterial color={theme.accent} roughness={0.6} wireframe={wireframe} />
          </mesh>
        </group>
      ))}
      {/* tali serut */}
      <mesh position={[0, 0.5, 0.57]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color={theme.main} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={'t' + s} position={[0.06 * s, 0.4, 0.57]}>
          <cylinderGeometry args={[0.02, 0.02, 0.16, 8]} />
          <meshStandardMaterial color={theme.main} roughness={0.55} wireframe={wireframe} />
        </mesh>
      ))}
      {/* logo */}
      <group position={[0.28, 0.2, 0.55]}>
        <mesh rotation={[Math.PI / 2 - 0.15, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.04, 18]} />
          <meshStandardMaterial color={theme.accent} roughness={0.5} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, 0.01, 0.025]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color={theme.main} roughness={0.5} wireframe={wireframe} />
        </mesh>
      </group>
    </group>
  );
}
