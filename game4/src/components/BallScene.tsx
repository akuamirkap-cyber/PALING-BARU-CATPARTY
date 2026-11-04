import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

type BallSpec = {
  color: string;
  accent?: string;
};

function BouncyBall({
  position = [0, 0, 0] as [number, number, number],
  size = 1.1,
  color = '#FF7A00',
  delay = 0,
  speed = 2.1,
}: {
  position?: [number, number, number];
  size?: number;
  color?: string;
  delay?: number;
  speed?: number;
}) {
  const group = useRef<THREE.Group>(null!);
  const ball = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime * speed + delay;
    const bounce = Math.abs(Math.sin(t)) * 0.55;
    const y = position[1] + bounce;
    group.current.position.set(position[0], y, position[2]);

    // squash & stretch
    const airborne = Math.sin(t);
    const squash = 1 - Math.max(0, -airborne) * 0.12 + Math.max(0, airborne) * 0.04;
    const stretchY = squash;
    const stretchXZ = 1 + (1 - squash) * 0.9;
    ball.current.scale.set(stretchXZ, stretchY, stretchXZ);

    // subtle roll / tilt
    ball.current.rotation.z = Math.sin(t * 0.7) * 0.12;
    ball.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6 + delay) * 0.18;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4 + delay) * 0.08;
  });

  const eyeZ = size * 0.86;
  const eyeY = size * 0.18;
  const eyeX = size * 0.24;

  return (
    <group ref={group} position={position}>
      <mesh ref={ball} castShadow>
        <sphereGeometry args={[size, 64, 64]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.18}
          metalness={0.02}
          clearcoat={1}
          clearcoatRoughness={0.12}
          sheen={0.4}
          sheenColor={'#ffffff'}
        />
        {/* glossy highlight blob */}
        <mesh position={[-size * 0.32, size * 0.42, size * 0.72]}>
          <sphereGeometry args={[size * 0.18, 24, 24]} />
          <meshBasicMaterial color="white" transparent opacity={0.85} />
        </mesh>
        <mesh position={[-size * 0.12, size * 0.58, size * 0.68]}>
          <sphereGeometry args={[size * 0.07, 16, 16]} />
          <meshBasicMaterial color="white" transparent opacity={0.7} />
        </mesh>
      </mesh>

      {/* eyes */}
      {[-1, 1].map((s) => (
        <group key={s} position={[eyeX * s, eyeY, eyeZ]}>
          <mesh>
            <sphereGeometry args={[size * 0.11, 24, 24]} />
            <meshStandardMaterial color="#23130B" roughness={0.25} />
          </mesh>
          <mesh position={[size * 0.03, size * 0.04, size * 0.085]}>
            <sphereGeometry args={[size * 0.035, 12, 12]} />
            <meshBasicMaterial color="white" />
          </mesh>
        </group>
      ))}

      {/* blush */}
      {[-1, 1].map((s) => (
        <mesh key={'b' + s} position={[size * 0.5 * s, -size * 0.06, size * 0.72]} scale={[1, 0.62, 0.35]}>
          <sphereGeometry args={[size * 0.11, 20, 20]} />
          <meshStandardMaterial color="#FF8FA0" roughness={0.7} transparent opacity={0.9} />
        </mesh>
      ))}

      {/* tiny smile */}
      <mesh position={[0, -size * 0.1, size * 0.92]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[size * 0.12, size * 0.022, 12, 24, Math.PI * 0.9]} />
        <meshStandardMaterial color="#4A2315" roughness={0.5} />
      </mesh>
    </group>
  );
}

function ParallaxRig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!);
  const target = useRef({ x: 0, y: 0 });
  useFrame((state) => {
    const px = state.pointer.x;
    const py = state.pointer.y;
    target.current.x += (px * 0.28 - target.current.x) * 0.06;
    target.current.y += (py * 0.14 - target.current.y) * 0.06;
    if (ref.current) {
      ref.current.rotation.y = target.current.x;
      ref.current.rotation.x = -target.current.y * 0.5;
      ref.current.position.y = target.current.y * 0.3;
    }
  });
  return <group ref={ref}>{children}</group>;
}

function MiniBall({ pos, c, s = 0.14, ph = 0 }: { pos: [number, number, number]; c: string; s?: number; ph?: number }) {
  const r = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 1.4 + ph;
    r.current.position.y = pos[1] + Math.sin(t) * 0.25;
    r.current.rotation.x = t * 0.6;
    r.current.rotation.y = t * 0.8;
  });
  return (
    <mesh ref={r} position={pos}>
      <sphereGeometry args={[s, 24, 24]} />
      <meshPhysicalMaterial color={c} roughness={0.2} clearcoat={1} clearcoatRoughness={0.2} />
    </mesh>
  );
}

export default function BallScene({ left, right }: { left: BallSpec; right: BallSpec }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.7, 7.2], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 5]} intensity={1.15} color="#FFF6E0" />
      <directionalLight position={[-5, 3, 3]} intensity={0.45} color="#FFCF8A" />
      <pointLight position={[0, 3, 4]} intensity={12} color="#FFF1C8" />
      <spotLight position={[0, 8, 2]} angle={0.5} penumbra={1} intensity={60} color="#FFFFFF" />

      <ParallaxRig>
        <BouncyBall position={[-1.15, -0.25, 0]} size={1.12} color={left.color} delay={0} speed={2.25} />
        <BouncyBall position={[1.18, -0.22, -0.15]} size={1.08} color={right.color} delay={1.7} speed={2.05} />

        {/* little orbiting deco balls */}
        <MiniBall pos={[-2.5, 1.15, -0.6]} c="#FFF7DC" s={0.16} ph={0} />
        <MiniBall pos={[2.55, 1.35, -0.8]} c="#E23A1E" s={0.12} ph={1.2} />
        <MiniBall pos={[-2.15, -0.6, 0.4]} c="#7A2E00" s={0.09} ph={2.1} />
        <MiniBall pos={[2.3, -0.55, 0.3]} c="#FFF7DC" s={0.1} ph={0.7} />
      </ParallaxRig>

      {/* floor glow disc */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.12, 0]}>
        <circleGeometry args={[2.95, 64]} />
        <meshBasicMaterial color="#C96A00" transparent opacity={0.32} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.11, 0]}>
        <circleGeometry args={[2.15, 64]} />
        <meshBasicMaterial color="#FFF1C2" transparent opacity={0.38} />
      </mesh>

      <ContactShadows position={[0, -1.1, 0]} opacity={0.42} scale={9} blur={2.6} far={3.2} resolution={512} color="#5A2600" />
      <Sparkles count={46} scale={[8, 4, 3]} size={5} speed={0.35} opacity={0.65} color="#FFF7DC" position={[0, 0.8, 0]} />
    </Canvas>
  );
}
