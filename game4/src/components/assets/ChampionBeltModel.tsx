// Champion belt v2 — tampil HORIZONTAL seperti sabuk juara beneran:
// strap kulit melengkung + list emas + medali besar (bintang!) +
// 2 plat samping + paku keliling. Bukan donat lagi.

import * as THREE from 'three';

export type BeltTheme = { name: string; strap: string; gold: string };

export const BELT_THEMES: BeltTheme[] = [
  { name: 'Classic Black', strap: '#23232E', gold: '#E8A800' },
  { name: 'Crimson', strap: '#7A1010', gold: '#FFC53D' },
  { name: 'Ocean', strap: '#1E4F8A', gold: '#FFE27A' },
  { name: 'Ivory', strap: '#E8E4DA', gold: '#B0662A' },
];

const ENAMEL = '#C22A20';
const R = 1.5; // radius lengkung strap
const ARC = 1.9; // ~110 derajat

// Bintang 5 sudut pipih
const starShape = new THREE.Shape();
for (let i = 0; i < 10; i++) {
  const r = i % 2 === 0 ? 0.22 : 0.09;
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r;
  if (i === 0) starShape.moveTo(x, y);
  else starShape.lineTo(x, y);
}
starShape.closePath();

function goldMat(color: string, wireframe: boolean) {
  return (
    <meshStandardMaterial color={color} metalness={0.95} roughness={0.22} envMapIntensity={1.4} wireframe={wireframe} />
  );
}

export default function ChampionBeltModel({ theme, wireframe = false }: { theme: BeltTheme; wireframe?: boolean }) {
  const studAngles = [-0.8, -0.5, 0.5, 0.8];

  return (
    <group position={[0, -0.05, -1.1]} scale={0.95}>
      {/* list emas di belakang strap */}
      <mesh position={[0, 0, -0.02]}>
        <cylinderGeometry args={[R + 0.02, R + 0.02, 0.64, 32, 1, true, -ARC / 2, ARC]} />
        <meshStandardMaterial color={theme.gold} metalness={0.9} roughness={0.3} side={2} wireframe={wireframe} />
      </mesh>
      {/* strap kulit */}
      <mesh>
        <cylinderGeometry args={[R, R, 0.55, 32, 1, true, -ARC / 2, ARC]} />
        <meshStandardMaterial color={theme.strap} roughness={0.55} side={2} wireframe={wireframe} />
      </mesh>

      {/* MEDALI UTAMA */}
      <group position={[0, 0, R]}>
        {/* piringan emas */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.14, 32]} />
          {goldMat(theme.gold, wireframe)}
        </mesh>
        {/* enamel merah */}
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.37, 0.37, 0.16, 28]} />
          <meshStandardMaterial color={ENAMEL} roughness={0.3} wireframe={wireframe} />
        </mesh>
        {/* kubah emas */}
        <mesh position={[0, 0, 0.1]} scale={[1, 1, 0.6]}>
          <sphereGeometry args={[0.18, 24, 18]} />
          {goldMat(theme.gold, wireframe)}
        </mesh>
        {/* BINTANG */}
        <mesh position={[0, 0, 0.21]}>
          <shapeGeometry args={[starShape]} />
          {goldMat(theme.gold, wireframe)}
        </mesh>
        {/* sayap */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0.44 * s, 0.08, -0.02]} rotation={[0, 0, 0.35 * s]}>
            <boxGeometry args={[0.3, 0.09, 0.06]} />
            {goldMat(theme.gold, wireframe)}
          </mesh>
        ))}
        {/* permata keliling medali */}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.075]}>
              <sphereGeometry args={[0.035, 10, 10]} />
              <meshBasicMaterial color="white" />
            </mesh>
          );
        })}
      </group>

      {/* plat samping mengikuti lengkung */}
      {[-0.55, 0.55].map((a) => (
        <group
          key={a}
          position={[R * Math.sin(a), 0, R * Math.cos(a)]}
          rotation={[0, a, 0]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.1, 20]} />
            {goldMat(theme.gold, wireframe)}
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <sphereGeometry args={[0.08, 14, 14]} />
            <meshStandardMaterial color={ENAMEL} roughness={0.35} wireframe={wireframe} />
          </mesh>
        </group>
      ))}

      {/* paku keliling atas-bawah */}
      {[-0.2, 0.2].map((y) =>
        studAngles.map((a) => (
          <mesh key={`${y}-${a}`} position={[R * Math.sin(a), y, R * Math.cos(a) - 0.01]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            {goldMat(theme.gold, wireframe)}
          </mesh>
        )),
      )}
    </group>
  );
}
