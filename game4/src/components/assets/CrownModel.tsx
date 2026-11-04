// Crown v4 — premium toy crown:
// - TIDAK ADA lagi bola putih & ring tipis
// - Duri pendek-lebar dengan collar penyambung + orb emas senada
// - Permata duduk di bezel emas, band bersih, emas pekat

export type CrownTheme = { name: string; band: string; velvet: string };

export const CROWN_THEMES: CrownTheme[] = [
  { name: 'Classic Gold', band: '#F0A000', velvet: '#FF5A3C' },
  { name: 'Rose', band: '#E89B7E', velvet: '#E23A5E' },
  { name: 'Midnight', band: '#7E8AA3', velvet: '#3B4A6B' },
  { name: 'Emerald', band: '#D9A400', velvet: '#0E9B6E' },
];

const LIGHT = '#FFE08A';

function vinyl(color: string, wireframe: boolean, rough = 0.2) {
  return (
    <meshPhysicalMaterial
      color={color} roughness={rough} metalness={0.08}
      clearcoat={1} clearcoatRoughness={0.12} envMapIntensity={1.15}
      wireframe={wireframe}
    />
  );
}

export default function CrownModel({ theme, wireframe = false }: { theme: CrownTheme; wireframe?: boolean }) {
  const spikes = Array.from({ length: 5 }).map((_, i) => {
    const angle = (i / 5) * Math.PI * 2;
    return { x: Math.sin(angle) * 0.8, z: Math.cos(angle) * 0.8 };
  });
  const gems = Array.from({ length: 6 }).map((_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    return { x: Math.sin(angle) * 1.03, z: Math.cos(angle) * 1.03, ry: angle };
  });

  return (
    <group position={[0, -0.4, 0]}>
      {/* dome dalam */}
      <mesh position={[0, 0.45, 0]} scale={[0.9, 0.45, 0.9]}>
        <sphereGeometry args={[1, 36, 24]} />
        <meshStandardMaterial color={theme.velvet} roughness={0.35} wireframe={wireframe} />
      </mesh>

      {/* band bersih tanpa garis */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.0, 1.06, 0.72, 36]} />
        {vinyl(theme.band, wireframe)}
      </mesh>

      {/* ring gemuk atas & bawah */}
      <mesh position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.98, 0.13, 18, 48]} />
        {vinyl(LIGHT, wireframe, 0.16)}
      </mesh>
      <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.04, 0.14, 18, 48]} />
        {vinyl(LIGHT, wireframe, 0.16)}
      </mesh>

      {/* duri pendek-lebar + collar + orb emas */}
      {spikes.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          {/* collar penyambung ke ring */}
          <mesh position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.37, 0.075, 14, 32]} />
            {vinyl(LIGHT, wireframe, 0.16)}
          </mesh>
          {/* duri */}
          <mesh position={[0, 0.68, 0]}>
            <coneGeometry args={[0.4, 0.66, 20]} />
            {vinyl(theme.band, wireframe)}
          </mesh>
          {/* orb emas senada (bukan putih) */}
          <mesh position={[0, 1.06, 0]}>
            <sphereGeometry args={[0.11, 18, 16]} />
            {vinyl(LIGHT, wireframe, 0.14)}
          </mesh>
        </group>
      ))}

      {/* permata coral dalam bezel emas */}
      {gems.map((g, i) => (
        <group key={'g' + i} position={[g.x, 0, g.z]} rotation={[0, g.ry, 0]}>
          <mesh>
            <sphereGeometry args={[0.17, 20, 16]} />
            {vinyl(theme.velvet, wireframe, 0.15)}
          </mesh>
          <mesh position={[0, 0, -0.06]}>
            <torusGeometry args={[0.17, 0.045, 12, 28]} />
            {vinyl(LIGHT, wireframe, 0.16)}
          </mesh>
        </group>
      ))}
    </group>
  );
}
