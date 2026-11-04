// NERD glasses: lensa bulat OVERSIZE + bingkai tebal +
// plester putih di bridge + gagang tebal. Khas anak pintar.

export type NerdTheme = { name: string; main: string; accent: string };

export const NERD_THEMES: NerdTheme[] = [
  { name: 'Classic Black', main: '#1C1C24', accent: '#1C1C24' },
  { name: 'Tortoise', main: '#7A4A22', accent: '#3A2317' },
  { name: 'Navy', main: '#1E4F8A', accent: '#101018' },
  { name: 'Bubblegum', main: '#FF7AB8', accent: '#7A2E5A' },
];

export default function NerdGlassesModel({ theme, wireframe = false }: { theme: NerdTheme; wireframe?: boolean }) {
  return (
    <group position={[0, 0.1, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0.44 * s, 0, 0]}>
          {/* bingkai tebal */}
          <mesh>
            <torusGeometry args={[0.36, 0.085, 14, 36]} />
            <meshStandardMaterial color={theme.main} roughness={0.4} wireframe={wireframe} />
          </mesh>
          {/* lensa */}
          <mesh position={[0, 0, -0.02]} scale={[1, 1, 0.25]}>
            <sphereGeometry args={[0.33, 28, 20]} />
            <meshStandardMaterial color="#15151D" roughness={0.1} metalness={0.4} wireframe={wireframe} />
          </mesh>
          {/* kilau besar */}
          <mesh position={[-0.12, 0.1, 0.075]}>
            <circleGeometry args={[0.085, 16]} />
            <meshBasicMaterial color="white" transparent opacity={0.9} />
          </mesh>
          <mesh position={[-0.02, -0.02, 0.078]}>
            <circleGeometry args={[0.032, 12]} />
            <meshBasicMaterial color="white" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
      {/* bridge */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.2, 0.09, 0.09]} />
        <meshStandardMaterial color={theme.main} roughness={0.4} wireframe={wireframe} />
      </mesh>
      {/* PLESTER khas nerd */}
      <mesh position={[0, 0.08, 0.02]}>
        <boxGeometry args={[0.15, 0.13, 0.1]} />
        <meshStandardMaterial color="#FFF7DC" roughness={0.7} wireframe={wireframe} />
      </mesh>
      {/* gagang tebal */}
      {[-1, 1].map((s) => (
        <mesh key={'a' + s} position={[0.82 * s, 0.06, -0.32]}>
          <boxGeometry args={[0.12, 0.12, 0.7]} />
          <meshStandardMaterial color={theme.accent} roughness={0.45} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
