import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { animateBeast, createBeast, type BeastMode, type BeastRig, type HatKind } from './beast';
import { POOL, SHIP } from '../ship/dims';
import type { Surface } from '../assets/common';

export type GroundFn = (x: number, z: number) => { y: number; surface: Surface };

function useBeast(color: string, hat: HatKind) {
  const rig = useMemo(() => createBeast(color, hat), [color, hat]);
  useEffect(() => () => rig.dispose(), [rig]);
  return rig;
}

interface ActorProps {
  color: string;
  hat?: HatKind;
  mode: BeastMode;
  position?: [number, number, number];
  yaw?: number;
  phase?: number;
}

/** Beast statis di satu tempat dengan animasi tertentu. */
function BeastActor({ color, hat = 'none', mode, position = [0, 0, 0], yaw = 0, phase = 0 }: ActorProps) {
  const rig = useBeast(color, hat);
  useEffect(() => {
    rig.root.position.set(...position);
    rig.root.rotation.set(0, yaw, 0);
  }, [rig, position, yaw]);
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    animateBeast(rig, mode, t);
    if (mode === 'swim') rig.root.position.y = position[1] + Math.sin(t * 2) * 0.05;
  });
  return <primitive object={rig.root} dispose={null} />;
}

/** Beast yang mondar-mandir di promenade dek utama. */
function Walker({ color, hat = 'none', x0, x1, z, phase = 0 }: { color: string; hat?: HatKind; x0: number; x1: number; z: number; phase?: number }) {
  const rig = useBeast(color, hat);
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    const L = x1 - x0;
    const s = (t * 1.1) % (2 * L);
    const forward = s < L;
    const x = forward ? x0 + s : x1 - (s - L);
    rig.root.position.set(x, SHIP.deckY, z);
    rig.root.rotation.y = forward ? Math.PI / 2 : -Math.PI / 2;
    animateBeast(rig, 'walk', t);
  });
  return <primitive object={rig.root} dispose={null} />;
}

/** Beast yang meluncur terus-menerus di perosotan air lalu nyebur ke kolam. */
function Slider({ curve, color, phase = 0 }: { curve: THREE.CatmullRomCurve3; color: string; phase?: number }) {
  const rig = useBeast(color, 'none');
  const tmp = useMemo(
    () => ({ T: new THREE.Vector3(), S: new THREE.Vector3(), U: new THREE.Vector3(), X: new THREE.Vector3(), m: new THREE.Matrix4() }),
    [],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    const cycle = (t * 0.085) % 1.25;
    if (cycle <= 1) {
      const u = Math.pow(cycle, 0.85);
      const p = curve.getPointAt(u);
      tmp.T.copy(curve.getTangentAt(u)).normalize();
      tmp.S.crossVectors(tmp.T, THREE.Object3D.DEFAULT_UP).normalize();
      tmp.U.crossVectors(tmp.S, tmp.T).normalize();
      tmp.X.crossVectors(tmp.U, tmp.T).normalize();
      tmp.m.makeBasis(tmp.X, tmp.U, tmp.T);
      rig.root.quaternion.setFromRotationMatrix(tmp.m);
      rig.root.position.copy(p).addScaledVector(tmp.U, -0.42);
      animateBeast(rig, 'slide', t);
    } else {
      const k = (cycle - 1) / 0.25;
      rig.root.quaternion.identity();
      rig.root.rotation.y = -Math.PI / 2;
      rig.root.position.set(-19.25 - k * 0.6, SHIP.deckY + POOL.water - 0.72 + Math.sin(t * 2.4) * 0.05, -2.0);
      animateBeast(rig, 'swim', t);
    }
  });
  return <primitive object={rig.root} dispose={null} />;
}

/** Kru beast bawaan yang menghidupkan kapal. */
export function BeastCrew({ slideCurve, showSlider }: { slideCurve: THREE.CatmullRomCurve3; showSlider: boolean }) {
  const D = SHIP.deckY;
  return (
    <group>
      {/* Berantem di helipad haluan */}
      <BeastActor color="#ff6b6b" mode="punch" position={[13.1, D, -0.75]} yaw={0} />
      <BeastActor color="#4dabf7" mode="punch" position={[13.3, D, 0.75]} yaw={Math.PI} phase={0.26} />
      {/* Kapten di sayap anjungan */}
      <BeastActor color="#f8f9fa" hat="captain" mode="wave" position={[3.4, 10.2, 4.75]} yaw={Math.PI / 2} />
      {/* Pesta di dek matahari */}
      <BeastActor color="#ffd43b" hat="party" mode="dance" position={[-7.8, 7.9, -2.6]} yaw={-0.6} />
      <BeastActor color="#b197fc" hat="party" mode="dance" position={[1.3, 10.2, 0]} yaw={Math.PI / 2} phase={1.3} />
      {/* Santai di kolam */}
      <BeastActor color="#69db7c" mode="swim" position={[-20.0, D + POOL.water - 0.7, 0.9]} yaw={2.2} />
      {/* Penonton di haluan */}
      <BeastActor color="#ffa94d" hat="sailor" mode="idle" position={[16.6, D, -1.4]} yaw={-1.9} phase={0.8} />
      <Walker color="#f783ac" hat="sailor" x0={-12} x1={6} z={5.1} />
      {showSlider && <Slider curve={slideCurve} color="#63e6be" />}
    </group>
  );
}

/* --------------------------- Beast dijatuhkan --------------------------- */
export interface DroppedSpec {
  id: number;
  x: number;
  z: number;
  y0: number;
  color: string;
  hat: HatKind;
  spin: number;
}

type DropState = 'fall' | 'land' | 'swim' | 'sink';

export function DroppedBeast({ spec, onDone, groundFn }: { spec: DroppedSpec; onDone: (id: number) => void; groundFn: GroundFn }) {
  const rig: BeastRig = useBeast(spec.color, spec.hat);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    [],
  );
  const st = useRef({
    y: spec.y0,
    vy: 0,
    state: 'fall' as DropState,
    squash: 0,
    timer: 0,
    bounces: 0,
    done: false,
    mode: 'idle' as BeastMode,
    ringT: -1,
    ringY: 0,
  });
  const ground = useMemo(() => groundFn(spec.x, spec.z), [spec.x, spec.z, groundFn]);

  useEffect(() => {
    rig.root.position.set(spec.x, spec.y0, spec.z);
    rig.root.rotation.y = Math.random() * Math.PI * 2;
  }, [rig, spec]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    const s = st.current;
    const t = state.clock.elapsedTime + spec.id * 1.7;
    if (s.state === 'fall') {
      s.vy -= 24 * dt;
      s.y += s.vy * dt;
      rig.root.rotation.y += spec.spin * dt;
      if (s.y <= ground.y) {
        if (ground.surface !== 'deck') {
          s.state = ground.surface === 'sea' ? 'sink' : 'swim';
          s.y = ground.y - 0.7;
          s.timer = 0;
          s.ringT = 0;
          s.ringY = ground.y + 0.06;
        } else {
          s.y = ground.y;
          if (s.vy < -3 && s.bounces < 3) {
            s.squash = Math.min(0.5, -s.vy * 0.025);
            s.vy = -s.vy * 0.38;
            s.bounces++;
          } else {
            s.vy = 0;
            s.state = 'land';
            s.squash = Math.max(s.squash, 0.3);
            const modes: BeastMode[] = ['idle', 'dance', 'wave', 'punch', 'idle'];
            s.mode = modes[Math.floor(Math.random() * modes.length)];
          }
        }
      }
      animateBeast(rig, s.y > ground.y + 0.05 ? 'fall' : 'idle', t);
    } else if (s.state === 'land') {
      animateBeast(rig, s.mode, t);
    } else if (s.state === 'swim') {
      s.y = ground.y - 0.7 + Math.sin(t * 2.2) * 0.05;
      animateBeast(rig, 'swim', t);
    } else {
      s.timer += dt;
      s.y = ground.y - 0.6 - Math.max(0, s.timer - 1.8) * 0.7 + Math.sin(t * 2) * 0.06;
      animateBeast(rig, 'swim', t * 1.6);
      if (s.timer > 5 && !s.done) {
        s.done = true;
        onDone(spec.id);
      }
    }
    s.squash *= Math.exp(-dt * 5);
    if (s.squash > 0.002) {
      const w = Math.cos(t * 22) * s.squash;
      rig.body.scale.y *= 1 - w;
      rig.body.scale.x *= 1 + w * 0.6;
      rig.body.scale.z *= 1 + w * 0.6;
    }
    rig.root.position.set(spec.x, s.y, spec.z);

    if (ring.current) {
      if (s.ringT >= 0) {
        s.ringT += dt;
        const k = s.ringT / 1.3;
        ring.current.visible = k < 1;
        ring.current.position.set(spec.x, s.ringY, spec.z);
        ring.current.scale.setScalar(0.4 + k * 2.6);
        ringMat.opacity = (1 - k) * 0.85;
        if (k >= 1) s.ringT = -1;
      } else ring.current.visible = false;
    }
  });

  return (
    <group>
      <primitive object={rig.root} dispose={null} />
      <mesh ref={ring} rotation-x={-Math.PI / 2} material={ringMat} visible={false}>
        <ringGeometry args={[0.55, 0.8, 24]} />
      </mesh>
    </group>
  );
}
