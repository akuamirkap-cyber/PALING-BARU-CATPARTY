// Hockey mask v3: lebih lebar & bulat (tidak lonjong), mata lebih besar
// dan turun, diamond dahi, hidung, semua presisi di permukaan.

import * as THREE from 'three';

export type JasonTheme = { name: string; base: string; mark: string };

export const JASON_THEMES: JasonTheme[] = [
  { name: 'Classic', base: '#E8E4DA', mark: '#C22A20' },
  { name: 'Blood Moon', base: '#B9B2A6', mark: '#7A1010' },
  { name: 'Midnight', base: '#23232E', mark: '#E23A1E' },
  { name: 'Golden', base: '#E8A800', mark: '#3A2317' },
];

const DARK = '#14141A';

// Tempurung: sphere r=0.9, scale [1.08, 1.05, 0.55], center y=0.05
const RX = 0.9 * 1.08;
const RY = 0.9 * 1.05;
const RZ = 0.9 * 0.55;
const CY = 0.05;

function surf(x: number, y: number, lift = 0.014) {
  const v = 1 - (x / RX) * (x / RX) - ((y - CY) / RY) * ((y - CY) / RY);
  return RZ * Math.sqrt(Math.max(0, v)) + lift;
}

const VENTS: [number, number][] = [
  [-0.16, 0.82],
  [0, 0.87],
  [0.16, 0.82],
  [-0.58, 0.3],
  [0.58, 0.3],
  [-0.13, -0.52],
  [0, -0.57],
  [0.13, -0.52],
];

export default function JasonMaskModel({ theme, wireframe = false }: { theme: JasonTheme; wireframe?: boolean }) {
  const noseShade = new THREE.Color(theme.base).multiplyScalar(0.82).getStyle();

  return (
    <group position={[0, -0.1, 0]}>
      {/* tempurung bulat */}
      <mesh position={[0, CY, 0]} scale={[1.08, 1.05, 0.55]}>
        <sphereGeometry args={[0.9, 36, 28]} />
        <meshStandardMaterial color={theme.base} roughness={0.45} wireframe={wireframe} />
      </mesh>

      {/* mata besar */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[0.34 * s, 0.12, surf(0.34, 0.12, -0.02)]}
          rotation={[0, -0.3 * s, 0]}
        >
          <boxGeometry args={[0.3, 0.42, 0.12]} />
          <meshStandardMaterial color={DARK} roughness={0.85} wireframe={wireframe} />
        </mesh>
      ))}

      {/* hidung */}
      <mesh position={[0, -0.1, surf(0, -0.1, -0.01)]}>
        <boxGeometry args={[0.11, 0.3, 0.07]} />
        <meshStandardMaterial color={noseShade} roughness={0.55} wireframe={wireframe} />
      </mesh>

      {/* diamond dahi */}
      {[-1, 1].map((s) => (
        <mesh
          key={'f' + s}
          position={[0.17 * s, 0.6, surf(0.17, 0.6, 0.006)]}
          rotation={[0, -0.13 * s, Math.PI / 4]}
        >
          <boxGeometry args={[0.13, 0.13, 0.03]} />
          <meshStandardMaterial color={theme.mark} roughness={0.5} wireframe={wireframe} />
        </mesh>
      ))}

      {/* chevron pipi */}
      {[-1, 1].map((s) => (
        <group
          key={'c' + s}
          position={[0.5 * s, -0.12, surf(0.5, -0.12, 0.0)]}
          rotation={[0, 0.55 * s, 0]}
        >
          <mesh position={[0, 0.1, 0]} rotation={[0, 0, 0.45 * s]}>
            <boxGeometry args={[0.22, 0.06, 0.05]} />
            <meshStandardMaterial color={theme.mark} roughness={0.5} wireframe={wireframe} />
          </mesh>
          <mesh position={[0, -0.1, 0]} rotation={[0, 0, -0.45 * s]}>
            <boxGeometry args={[0.22, 0.06, 0.05]} />
            <meshStandardMaterial color={theme.mark} roughness={0.5} wireframe={wireframe} />
          </mesh>
        </group>
      ))}

      {/* ventilasi */}
      {VENTS.map((v, i) => (
        <mesh
          key={'v' + i}
          position={[v[0], v[1], surf(v[0], v[1])]}
          rotation={[0, -v[0] * 0.9, 0]}
        >
          <circleGeometry args={[0.036, 12]} />
          <meshStandardMaterial color={DARK} roughness={0.85} side={2} wireframe={wireframe} />
        </mesh>
      ))}

      {/* tali samping */}
      {[-1, 1].map((s) => (
        <mesh key={'s' + s} position={[0.88 * s, 0.05, -0.2]}>
          <boxGeometry args={[0.1, 0.18, 0.7]} />
          <meshStandardMaterial color={DARK} roughness={0.7} wireframe={wireframe} />
        </mesh>
      ))}
    </group>
  );
}
