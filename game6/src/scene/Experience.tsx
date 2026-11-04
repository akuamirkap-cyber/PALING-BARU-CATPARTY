import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AssetHandle } from '../assets/common';
import { ENVIRONMENTS, type CameraPreset, type EnvKey } from './environments';
import { Clouds, Rain, SkyDome, Smoke, StudioFloor } from './Atmosphere';
import { BeastCrew, DroppedBeast, type DroppedSpec } from './Beasts';
import { StadiumCrew } from './StadiumCrew';
import { WaterSystem } from './water/WaterSystem';
import { mainCameraLayers } from './layers';
import { ST, TOWERS, TOWER_TOP } from '../stadium/dims';
import { BowlingSystem, type BowlingSettings } from './BowlingSystem';
import { SnowSystem, type SnowSettings } from './SnowSystem';

export interface SceneSettings {
  env: EnvKey;
  showOcean: boolean;
  rocking: boolean;
  showBeasts: boolean;
  showSmoke: boolean;
  autoRotate: boolean;
  reflections: boolean;
}

export interface CamRequest {
  key: string;
  nonce: number;
  instant?: boolean;
}

function Lights({ env, extent }: { env: EnvKey; extent: number }) {
  const E = ENVIRONMENTS[env];
  const hemi = useRef<THREE.HemisphereLight>(null);
  const flash = useRef({ next: 3, t: -1 });
  const sunPos = useMemo(() => new THREE.Vector3(...E.sunPos).normalize().multiplyScalar(130).toArray() as [number, number, number], [E]);
  useFrame((state, dt) => {
    let boost = 0;
    if (env === 'storm') {
      const f = flash.current;
      const now = state.clock.elapsedTime;
      if (now > f.next) {
        f.t = 0;
        f.next = now + 4 + Math.random() * 7;
      }
      if (f.t >= 0) {
        f.t += dt;
        const k = f.t < 0.08 ? 1 : f.t < 0.16 ? 0.15 : f.t < 0.27 ? 0.85 : 0;
        boost = k * 3.2;
        if (f.t > 0.45) f.t = -1;
      }
    }
    if (hemi.current) hemi.current.intensity = E.hemiIntensity + boost;
  });
  return (
    <>
      <hemisphereLight ref={hemi} color={E.hemiSky} groundColor={E.hemiGround} intensity={E.hemiIntensity} />
      <directionalLight
        position={sunPos}
        intensity={E.sunIntensity}
        color={E.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      >
        <orthographicCamera attach="shadow-camera" args={[-extent, extent, extent, -extent, 1, 320]} />
      </directionalLight>
    </>
  );
}

/** Lampu sorot menara stadion (malam/senja/badai). */
function StadiumLights({ level }: { level: number }) {
  const lights = useMemo(
    () =>
      TOWERS.map(([x, z]) => {
        const l = new THREE.SpotLight('#fff1d0', 0, 0, 0.62, 0.7, 2);
        l.position.set(x, TOWER_TOP + 3, z);
        l.target.position.set(x * 0.12, ST.pitchY, z * 0.12);
        return l;
      }),
    [],
  );
  useEffect(() => {
    lights.forEach((l) => (l.intensity = level * 2300));
  }, [level, lights]);
  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={l} />
          <primitive object={l.target} />
        </group>
      ))}
    </>
  );
}

function AssetRig({ asset, rocking, amp, children }: { asset: AssetHandle; rocking: boolean; amp: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const a = rocking ? amp * asset.meta.rock : 0;
    const roll = (Math.sin(t * 0.55) * 0.022 + Math.sin(t * 1.3) * 0.006) * a;
    const pitch = Math.sin(t * 0.42 + 1) * 0.012 * a;
    const heave = Math.sin(t * 0.8) * 0.14 * a;
    const k = Math.min(1, dt * 3);
    g.rotation.x += (roll - g.rotation.x) * k;
    g.rotation.z += (pitch - g.rotation.z) * k;
    g.position.y += (heave - g.position.y) * k;
    asset.update(t, dt);
  });
  return <group ref={ref}>{children}</group>;
}

function CameraRig({
  request,
  presets,
  autoRotate,
  oceanVisible,
  maxDist = 240,
}: {
  maxDist?: number;
  request: CamRequest | null;
  presets: CameraPreset[];
  autoRotate: boolean;
  oceanVisible: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const anim = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!request) return;
    const p = presets.find((c) => c.key === request.key) ?? presets[0];
    const pos = new THREE.Vector3(...p.pos);
    const target = new THREE.Vector3(...p.target);
    if (request.instant && controls.current) {
      camera.position.copy(pos);
      controls.current.target.copy(target);
      controls.current.update();
      anim.current = null;
    } else {
      anim.current = { pos, target };
    }
  }, [request, presets, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    c.autoRotate = autoRotate && !anim.current;
    const a = anim.current;
    if (a) {
      const k = 1 - Math.exp(-dt * 3.2);
      camera.position.lerp(a.pos, k);
      c.target.lerp(a.target, k);
      c.update();
      if (camera.position.distanceTo(a.pos) < 0.05 && c.target.distanceTo(a.target) < 0.05) anim.current = null;
    }
    if (oceanVisible && camera.position.y < 1.2) camera.position.y = 1.2;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotateSpeed={0.55}
      minDistance={4}
      maxDistance={maxDist}
      maxPolarAngle={oceanVisible ? Math.PI * 0.53 : Math.PI * 0.95}
      onStart={() => {
        anim.current = null;
      }}
    />
  );
}

interface ExperienceProps {
  asset: AssetHandle;
  settings: SceneSettings;
  camRequest: CamRequest | null;
  dropped: DroppedSpec[];
  onDroppedDone: (id: number) => void;
  onHover: (name: string | null) => void;
  partsVisible: Record<string, boolean>;
  bowl: BowlingSettings;
  onFollowEnd: () => void;
  snow: SnowSettings;
}

export function Experience({ asset, settings, camRequest, dropped, onDroppedDone, onHover, partsVisible, bowl, onFollowEnd, snow }: ExperienceProps) {
  const E = ENVIRONMENTS[settings.env];
  const camera = useThree((s) => s.camera);
  const hoverRef = useRef<string | null>(null);
  const isShip = asset.meta.id === 'ship';
  const isStadium = asset.meta.id === 'stadium';
  const indoor = !!asset.meta.indoor;
  const snowy = !!asset.meta.snow;

  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    mainCameraLayers(camera);
  }, [camera]);
  useEffect(() => {
    (window as unknown as { __three?: unknown }).__three = { scene, camera, controls };
  }, [scene, camera, controls]);

  useEffect(() => {
    asset.setNight(E.windowGlow);
  }, [E, asset]);

  const night = settings.env === 'night' || settings.env === 'storm';
  const flood = !isStadium ? 0 : settings.env === 'night' ? 1 : settings.env === 'storm' ? 0.55 : settings.env === 'sunset' ? 0.3 : 0;

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const name = e.object.name || e.object.parent?.name || null;
    if (name !== hoverRef.current) {
      hoverRef.current = name;
      onHover(name);
    }
  };
  const handleOut = () => {
    hoverRef.current = null;
    onHover(null);
  };

  return (
    <>
      {snowy ? (
        <SnowSystem asset={asset} envKey={settings.env} settings={snow} />
      ) : indoor ? (
        <>
          <color attach="background" args={['#120f24']} />
          <BowlingSystem asset={asset} settings={bowl} onFollowEnd={onFollowEnd} />
        </>
      ) : (
        <>
          <color attach="background" args={[E.fog]} />
          <fog attach="fog" args={[E.fog, E.fogNear, E.fogFar]} />
          <SkyDome top={E.skyTop} horizon={E.fog} />
          <Clouds color={E.cloud} />
          <Lights env={settings.env} extent={asset.meta.shadowExtent} />
          {flood > 0 && <StadiumLights level={flood} />}
        </>
      )}

      <AssetRig key={asset.meta.id} asset={asset} rocking={settings.rocking} amp={E.rock}>
        <primitive object={asset.group} dispose={null} onPointerMove={handleMove} onPointerOut={handleOut} />
        {isShip && settings.showSmoke && <Smoke color={E.smoke} storm={settings.env === 'storm'} />}
        {settings.showBeasts && isShip && asset.slideCurve && (
          <BeastCrew slideCurve={asset.slideCurve} showSlider={partsVisible.slide !== false} />
        )}
        {settings.showBeasts && isStadium && partsVisible.ball !== false && <StadiumCrew asset={asset} />}
        {dropped.map((d) => (
          <DroppedBeast key={d.id} spec={d} onDone={onDroppedDone} groundFn={asset.groundAt} />
        ))}
      </AssetRig>

      {!indoor && !snowy && (settings.showOcean ? <WaterSystem env={E} reflections={settings.reflections} fishRadius={asset.meta.fishRadius} night={night} /> : <StudioFloor />)}
      {!indoor && !snowy && settings.env === 'storm' && <Rain />}
      <CameraRig request={camRequest} presets={asset.meta.cameras} autoRotate={settings.autoRotate} oceanVisible={settings.showOcean && !indoor && !snowy} maxDist={asset.meta.maxDistance} />
    </>
  );
}
