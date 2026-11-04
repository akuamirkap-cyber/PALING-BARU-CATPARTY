import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AssetHandle } from '../assets/common';
import type { EnvKey } from './environments';
import { LAYER } from './layers';
import { getFlakeTexture } from '../ski/textures';

interface SnowEnv {
  label: string;
  icon: string;
  top: string;
  horizon: string;
  fog: string;
  near: number;
  far: number;
  sun: string;
  sunI: number;
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  snow: number;
  wind: number;
  glow: number;
  stars: number;
}

export const SNOW_ENVS: Record<EnvKey, SnowEnv> = {
  day: { label: 'Cerah', icon: '☀️', top: '#2f7fd6', horizon: '#cfe7f8', fog: '#d9eaf6', near: 260, far: 1650, sun: '#fff4e6', sunI: 3.0, sunDir: [0.45, 0.75, 0.35], hemiSky: '#dcefff', hemiGround: '#aebdd2', hemiI: 1.05, snow: 0.12, wind: 0.6, glow: 0, stars: 0 },
  sunset: { label: 'Senja Alpen', icon: '🌄', top: '#4b3f8f', horizon: '#ffb48c', fog: '#f0c2ab', near: 220, far: 1350, sun: '#ffab6b', sunI: 2.5, sunDir: [-0.75, 0.25, 0.45], hemiSky: '#ffd5c2', hemiGround: '#8676a0', hemiI: 0.85, snow: 0.08, wind: 0.4, glow: 0.7, stars: 0.15 },
  night: { label: 'Malam Berlampu', icon: '🌙', top: '#030716', horizon: '#18284a', fog: '#121c36', near: 110, far: 900, sun: '#a9bcff', sunI: 0.55, sunDir: [-0.3, 0.8, -0.3], hemiSky: '#4d64a3', hemiGround: '#1a2238', hemiI: 0.72, snow: 0.3, wind: 0.5, glow: 1.8, stars: 1 },
  storm: { label: 'Badai Salju', icon: '🌨️', top: '#8d99a6', horizon: '#cbd3db', fog: '#d1d8df', near: 15, far: 240, sun: '#e3e9ee', sunI: 0.8, sunDir: [0.3, 0.8, 0.2], hemiSky: '#e3e9ee', hemiGround: '#9aa6b2', hemiI: 1.25, snow: 1, wind: 4, glow: 0.6, stars: 0 },
};

export interface SnowSettings {
  follow: boolean;
  snowfall: boolean;
}

function SkyDome({ env, camera }: { env: SnowEnv; camera: THREE.Camera }) {
  const mesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(env.top) },
        uHorizon: { value: new THREE.Color(env.horizon) },
        uSunDir: { value: new THREE.Vector3(...env.sunDir).normalize() },
        uSun: { value: new THREE.Color(env.sun) },
        uStars: { value: env.stars },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 wp = modelMatrix * vec4(position,1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uStars;
        varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y + 0.04, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSun * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * 0.18);
          if (uStars > 0.0 && d.y > 0.0) {
            vec3 cell = floor(d * 260.0);
            float s = hash(cell);
            col += vec3(step(0.9965, s)) * uStars * smoothstep(0.0, 0.25, d.y) * (0.6 + 0.4 * hash(cell + 3.0));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 40, 20), mat);
    m.name = 'SnowSky';
    m.renderOrder = -10;
    m.frustumCulled = false;
    m.layers.set(LAYER.SKY);
    return m;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    u.uTop.value.set(env.top);
    u.uHorizon.value.set(env.horizon);
    u.uSunDir.value.set(...env.sunDir).normalize();
    u.uSun.value.set(env.sun);
    u.uStars.value = env.stars;
  }, [env, mesh]);
  useFrame(() => mesh.position.copy(camera.position));
  return <primitive object={mesh} />;
}

function Snowfall({ env }: { env: SnowEnv }) {
  const N = 5000;
  const { points, pos, vel } = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 50 - 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      vel[i] = 1.2 + Math.random() * 1.8;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 0.14, map: getFlakeTexture(), transparent: true, opacity: 0.9, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.layers.set(LAYER.MAIN_ONLY);
    return { points: p, pos, vel };
  }, []);
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const cam = state.camera.position;
    const n = Math.floor(N * env.snow);
    points.geometry.setDrawRange(0, n);
    (points.material as THREE.PointsMaterial).size = env.snow > 0.6 ? 0.2 : 0.13;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      let x = pos[i * 3] + (env.wind + Math.sin(t * 0.7 + i) * 0.4) * dt;
      let y = pos[i * 3 + 1] - vel[i] * dt * (1 + env.wind * 0.15);
      let z = pos[i * 3 + 2] + Math.cos(t * 0.5 + i * 1.3) * 0.3 * dt;
      // bungkus relatif kamera
      const rx = x - cam.x;
      const ry = y - cam.y;
      const rz = z - cam.z;
      if (rx > 60) x -= 120;
      else if (rx < -60) x += 120;
      if (rz > 60) z -= 120;
      else if (rz < -60) z += 120;
      if (ry < -12) y += 52;
      else if (ry > 40) y -= 52;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    (points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  });
  return <primitive object={points} />;
}

export function SnowSystem({ asset, envKey, settings }: { asset: AssetHandle; envKey: EnvKey; settings: SnowSettings }) {
  const ctl = asset.ski!;
  const env = SNOW_ENVS[envKey];
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;

  useEffect(() => {
    (window as unknown as { __ski?: unknown }).__ski = ctl;
    return () => ctl.audio.silence();
  }, [ctl]);

  // Pulihkan kamera & kontrol saat arena ditinggalkan (agar arena lain tidak terkunci)
  useEffect(
    () => () => {
      if (controls) controls.enabled = true;
      camera.fov = 40;
      camera.updateProjectionMatrix();
    },
    [controls, camera],
  );

  useEffect(() => {
    asset.setNight(env.glow);
  }, [asset, env]);

  const lights = useMemo(() => {
    const hemi = new THREE.HemisphereLight('#dcefff', '#aebdd2', 1);
    const sun = new THREE.DirectionalLight('#ffffff', 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 400;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    return { hemi, sun };
  }, []);

  useEffect(() => {
    lights.hemi.color.set(env.hemiSky);
    lights.hemi.groundColor.set(env.hemiGround);
    lights.hemi.intensity = env.hemiI;
    lights.sun.color.set(env.sun);
    lights.sun.intensity = env.sunI;
    scene.background = new THREE.Color(env.fog);
    const fog = new THREE.Fog(env.fog, env.near, env.far);
    scene.fog = fog;
    return () => {
      // hanya hapus kabut milik sendiri — jangan menimpa kabut arena berikutnya
      if (scene.fog === fog) scene.fog = null;
    };
  }, [env, lights, scene]);

  const follow = useRef({ active: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 });
  const shakeOff = useMemo(() => new THREE.Vector3(), []);
  const sunDir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    camera.position.sub(shakeOff);
    ctl.update(dt);
    const f = follow.current;
    const rig = settings.follow ? ctl.getCameraRig() : null;
    if (rig) {
      if (!f.active) {
        f.active = true;
        f.pos.copy(camera.position);
        f.target.copy(controls?.target ?? rig.target);
        f.fov = camera.fov;
        if (controls) controls.enabled = false;
      }
      const k = 1 - Math.exp(-dt * 5);
      f.pos.lerp(rig.pos, k);
      f.target.lerp(rig.target, 1 - Math.exp(-dt * 8));
      f.fov += (rig.fov - f.fov) * Math.min(1, dt * 2);
      camera.position.copy(f.pos);
      camera.lookAt(f.target);
      camera.fov = f.fov;
      camera.updateProjectionMatrix();
      if (controls) controls.target.copy(f.target);
    } else if (f.active) {
      f.active = false;
      camera.fov = 40;
      camera.updateProjectionMatrix();
      if (controls) controls.enabled = true;
    }
    const sh = ctl.shake;
    shakeOff.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    camera.position.add(shakeOff);
    // bayangan matahari mengikuti fokus
    const focus = f.active ? ctl.focusPoint() : (controls?.target ?? ctl.focusPoint());
    sunDir.set(...env.sunDir).normalize();
    lights.sun.position.copy(focus).addScaledVector(sunDir, 180);
    lights.sun.target.position.copy(focus);
    lights.sun.target.updateMatrixWorld();
  });

  return (
    <>
      <SkyDome env={env} camera={camera} />
      <primitive object={lights.hemi} />
      <primitive object={lights.sun} />
      <primitive object={lights.sun.target} />
      {settings.snowfall && env.snow > 0 && <Snowfall env={env} />}
    </>
  );
}
