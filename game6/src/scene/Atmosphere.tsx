import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import { merge } from '../ship/geom';
import { FUNNEL, TIERS, tierTop } from '../ship/dims';
import { LAYER, setLayer } from './layers';

/* ---------------------------- Kubah langit ---------------------------- */
export function SkyDome({ top, horizon }: { top: string; horizon: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(top) },
          bottomColor: { value: new THREE.Color(horizon) },
          offset: { value: 30 },
          exponent: { value: 0.6 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          uniform float offset;
          uniform float exponent;
          varying vec3 vWorld;
          void main() {
            float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
            float k = pow(max(h, 0.0), exponent);
            gl_FragColor = vec4(mix(bottomColor, topColor, k), 1.0);
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    mat.uniforms.topColor.value.set(top);
    mat.uniforms.bottomColor.value.set(horizon);
  }, [top, horizon, mat]);
  useLayoutEffect(() => {
    if (ref.current) setLayer(ref.current, LAYER.SKY);
  }, []);
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}

/* -------------------------------- Awan -------------------------------- */
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function Clouds({ color }: { color: string }) {
  const group = useRef<THREE.Group>(null);
  const { geo, mat } = useMemo(() => {
    const r = rand(42);
    const blobs: THREE.BufferGeometry[] = [];
    for (let c = 0; c < 20; c++) {
      const ang = (c / 20) * Math.PI * 2 + r() * 0.3;
      const rad = 190 + r() * 120;
      const cx = Math.cos(ang) * rad;
      const cz = Math.sin(ang) * rad;
      const cy = 42 + r() * 36;
      const n = 4 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const s = 6 + r() * 10;
        const g = new THREE.IcosahedronGeometry(s, 1);
        g.scale(1.3, 0.6, 1);
        g.translate(cx + (i - n / 2) * s * 1.1 + r() * 4, cy + r() * 4, cz + (r() - 0.5) * 12);
        blobs.push(g);
      }
    }
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.07 });
    return { geo: merge(blobs), mat: m };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    mat.color.set(color);
  }, [color, mat]);
  useLayoutEffect(() => {
    if (group.current) setLayer(group.current, LAYER.SKY);
  }, []);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.004;
  });
  return (
    <group ref={group}>
      <mesh geometry={geo} material={mat} />
    </group>
  );
}

/* ---------------------- Lantai studio (tanpa laut) ---------------------- */
export function StudioFloor() {
  return (
    <group position={[0, -2.62, 0]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <shadowMaterial opacity={0.28} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellThickness={0.6}
        sectionThickness={1.2}
        cellColor="#8fb0bf"
        sectionColor="#4f7b8f"
        fadeDistance={190}
        fadeStrength={1.4}
      />
    </group>
  );
}

/* -------------------------------- Hujan -------------------------------- */
export function Rain() {
  const N = 2600;
  const ref = useRef<THREE.LineSegments>(null);
  const { geo, data } = useMemo(() => {
    const d = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      d[i * 3] = (Math.random() - 0.5) * 160;
      d[i * 3 + 1] = Math.random() * 60;
      d[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    return { geo: g, data: d };
  }, []);
  useLayoutEffect(() => {
    if (ref.current) setLayer(ref.current, LAYER.MAIN_ONLY);
  }, []);
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const cam = state.camera.position;
    for (let i = 0; i < N; i++) {
      let x = data[i * 3] - 7 * dt;
      let y = data[i * 3 + 1] - 40 * dt;
      let z = data[i * 3 + 2];
      if (y < -1) {
        y = 50 + Math.random() * 12;
        x = cam.x + (Math.random() - 0.5) * 160;
        z = cam.z + (Math.random() - 0.5) * 160;
      }
      data[i * 3] = x;
      data[i * 3 + 1] = y;
      data[i * 3 + 2] = z;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + 0.18;
      arr[i * 6 + 4] = y + 1.1;
      arr[i * 6 + 5] = z;
    }
    attr.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color="#d2dce2" transparent opacity={0.42} />
    </lineSegments>
  );
}

/* ---------------------------- Asap cerobong ---------------------------- */
export function Smoke({ color, storm }: { color: string; storm: boolean }) {
  const N = 16;
  const puffs = useRef<THREE.Mesh[]>([]);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const mats = useMemo(
    () =>
      Array.from(
        { length: N },
        () => new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false, flatShading: true }),
      ),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    mats.forEach((m) => m.color.set(color));
  }, [color, mats]);
  const origin = useMemo(() => new THREE.Vector3(FUNNEL.x - FUNNEL.rake * FUNNEL.h - 0.5, tierTop(TIERS[2]) + FUNNEL.h + 0.5, 0), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime * (storm ? 0.32 : 0.18);
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const age = (t + i / N) % 1;
      m.position.set(origin.x - age * (storm ? 15 : 9), origin.y + age * (storm ? 5 : 9), origin.z + Math.sin(i * 12.9 + age * 4) * 0.9 * age);
      m.scale.setScalar(0.4 + age * (storm ? 3.2 : 2.6));
      m.rotation.set(i, age * 2 + i, 0);
      (m.material as THREE.MeshStandardMaterial).opacity = Math.sin(Math.min(age * 6, Math.PI / 2)) * (1 - age) * 0.62;
    });
  });
  return (
    <group>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) puffs.current[i] = el;
          }}
          geometry={geo}
          material={m}
        />
      ))}
    </group>
  );
}
