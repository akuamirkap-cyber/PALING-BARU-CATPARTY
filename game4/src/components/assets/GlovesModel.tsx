// Hypercasual gloves: mitt + jempol + manset + strip.
// 4 mesh per sarung, material matte seperti mainan vinil.

export type GloveTheme = { name: string; main: string; cuff: string };

export const GLOVE_THEMES: GloveTheme[] = [
  { name: 'Champion Red', main: '#E23A1E', cuff: '#FFF7DC' },
  { name: 'Midnight Black', main: '#2B2B3A', cuff: '#E23A1E' },
  { name: 'Ocean Blue', main: '#1E7AE0', cuff: '#FFF7DC' },
  { name: 'Golden Boy', main: '#E8A800', cuff: '#3A2317' },
];

const CREAM = '#FFF7DC';

function Glove({
  theme, mirror = false, wireframe = false,
}: {
  theme: GloveTheme; mirror?: boolean; wireframe?: boolean;
}) {
  const m = mirror ? -1 : 1;

  return (
    <group rotation={[0.12 * m, 0.38 * m, -0.14 * m]}>
      {/* gulingan utama */}
      <mesh position={[0, 0.42, 0]} scale={[1, 1.1, 0.95]}>
        <sphereGeometry args={[0.62, 28, 20]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} metalness={0.05} wireframe={wireframe} />
      </mesh>

      {/* jempol */}
      <mesh position={[0.48 * m, 0.1, 0.2]} rotation={[0.15, 0, -0.4 * m]} scale={[0.9, 1.3, 0.9]}>
        <sphereGeometry args={[0.28, 24, 18]} />
        <meshStandardMaterial color={theme.main} roughness={0.5} metalness={0.05} wireframe={wireframe} />
      </mesh>

      {/* manset */}
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[0.4, 0.47, 0.5, 24]} />
        <meshStandardMaterial color={theme.cuff} roughness={0.6} wireframe={wireframe} />
      </mesh>

      {/* strip manset */}
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.425, 0.425, 0.14, 24]} />
        <meshStandardMaterial color={CREAM} roughness={0.6} wireframe={wireframe} />
      </mesh>
    </group>
  );
}

export default function GlovesModel({ theme, wireframe = false }: { theme: GloveTheme; wireframe?: boolean }) {
  return (
    <group position={[0, -0.1, 0]}>
      <group position={[-0.78, 0, -0.1]}>
        <Glove theme={theme} wireframe={wireframe} />
      </group>
      <group position={[0.78, -0.06, 0.12]}>
        <Glove theme={theme} mirror wireframe={wireframe} />
      </group>
    </group>
  );
}
