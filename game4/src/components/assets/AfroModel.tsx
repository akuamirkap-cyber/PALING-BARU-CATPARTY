// Clown afro v3: rambut bentuk KUBAH (bukan piramid) + KEPALA badut
// di bawahnya (mata, senyum, hidung merah, pipi) + topi pesta mini.
// Sekarang langsung kebaca: ini rambut badut!

export type AfroTheme = { name: string; colors: string[] };

export const AFRO_THEMES: AfroTheme[] = [
  { name: 'Rainbow', colors: ['#FF3B3B', '#FF9E0B', '#FFE93B', '#2BD97B', '#2EA8FF', '#B16CFF'] },
  { name: 'Bubblegum', colors: ['#FF7AB8', '#FF5D9E', '#FFC2DA', '#F75D8F'] },
  { name: 'Ocean', colors: ['#2EA8FF', '#1E6FDB', '#9BE8FF', '#5FC0FF'] },
  { name: 'Sunset', colors: ['#FF6A00', '#FF3B3B', '#FFC53D', '#FF9E4B'] },
  { name: 'Mint', colors: ['#5FE0B0', '#2BD97B', '#C8FFE8', '#0E9B6B'] },
];

const SKIN = '#FFD9B3';

// Ikal tersebar di KUBAH (hemisphere), bukan menara
const CURLS = Array.from({ length: 14 }).map((_, i) => {
  const t = i / 14;
  const theta = i * 2.39996;
  const phi = 0.25 + t * 1.2;
  const r = 0.98;
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi) + 0.2,
    z: r * Math.sin(phi) * Math.sin(theta),
    s: 0.92 + (i % 3) * 0.13,
  };
});

export default function AfroModel({ theme, wireframe = false }: { theme: AfroTheme; wireframe?: boolean }) {
  const hatColor = theme.colors[1] ?? theme.colors[0];

  return (
    <group position={[0, -0.2, 0]}>
      {/* kepala badut */}
      <mesh position={[0, -0.35, 0]}>
        <sphereGeometry args={[0.55, 32, 24]} />
        <meshStandardMaterial color={SKIN} roughness={0.55} wireframe={wireframe} />
      </mesh>
      {/* mata */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0.2 * s, -0.28, 0.5]}>
          <mesh>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color="#23130B" roughness={0.25} wireframe={wireframe} />
          </mesh>
          <mesh position={[0.022, 0.025, 0.05]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial color="white" />
          </mesh>
        </group>
      ))}
      {/* hidung badut — BESAR & glossy */}
      <mesh position={[0, -0.38, 0.55]}>
        <sphereGeometry args={[0.14, 20, 18]} />
        <meshPhysicalMaterial
          color="#E23A1E" roughness={0.15} metalness={0.05}
          clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={1.2}
          wireframe={wireframe}
        />
      </mesh>
      <mesh position={[-0.05, -0.33, 0.66]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="white" transparent opacity={0.9} />
      </mesh>
      {/* senyum */}
      <mesh position={[0, -0.44, 0.5]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.13, 0.028, 10, 20, Math.PI]} />
        <meshStandardMaterial color="#7A2E1E" roughness={0.5} wireframe={wireframe} />
      </mesh>
      {/* pipi */}
      {[-1, 1].map((s) => (
        <mesh key={'b' + s} position={[0.3 * s, -0.44, 0.42]} scale={[1, 0.7, 0.4]}>
          <sphereGeometry args={[0.07, 14, 14]} />
          <meshStandardMaterial color="#FF8FA0" roughness={0.6} wireframe={wireframe} />
        </mesh>
      ))}

      {/* dasar rambut */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.8, 28, 20]} />
        <meshStandardMaterial color={theme.colors[0]} roughness={0.7} wireframe={wireframe} />
      </mesh>
      {/* ikal kubah */}
      {CURLS.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          <sphereGeometry args={[0.3, 18, 14]} />
          <meshStandardMaterial color={theme.colors[i % theme.colors.length]} roughness={0.7} wireframe={wireframe} />
        </mesh>
      ))}

      {/* topi pesta mini */}
      <group position={[0.3, 1.22, 0.05]} rotation={[0.1, 0, -0.38]}>
        <mesh position={[0, 0.24, 0]}>
          <coneGeometry args={[0.2, 0.48, 18]} />
          <meshStandardMaterial color={hatColor} roughness={0.55} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.155, 0.185, 0.1, 18]} />
          <meshStandardMaterial color="#FFF7DC" roughness={0.55} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.06, 18]} />
          <meshStandardMaterial color="#FFF7DC" roughness={0.55} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.09, 14, 14]} />
          <meshStandardMaterial color="#FFF7DC" roughness={0.6} wireframe={wireframe} />
        </mesh>
      </group>
    </group>
  );
}
