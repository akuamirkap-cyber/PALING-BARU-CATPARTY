import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { AssetHandle } from '../assets/common';
import type { LightMode } from '../bowling/controller';
import { HEAD_X, pairZ } from '../bowling/dims';

export interface BowlingSettings {
  mode: LightMode;
  followBall: boolean;
  slowmo: boolean;
  sound: boolean;
  aiLanes: boolean;
  bloom: boolean;
  reflections: boolean;
  beastBall: boolean;
}

const MODE = {
  normal: { hemi: 0.6, sun: 1.1, spot: 5.5, env: 0.45, disco: 0, bloom: [0.24, 0.4, 0.95] },
  cosmic: { hemi: 0.1, sun: 0.16, spot: 3, env: 0.1, disco: 0, bloom: [0.8, 0.55, 0.62] },
  disco: { hemi: 0.14, sun: 0.2, spot: 4, env: 0.14, disco: 60, bloom: [0.75, 0.55, 0.65] },
} as const;

/** Kamera cermin di bidang Y = 0 (refleksi lintasan mengkilap). */
function createMirror() {
  const cam = new THREE.PerspectiveCamera();
  const textureMatrix = new THREE.Matrix4();
  const normal = new THREE.Vector3(0, 1, 0);
  const planePos = new THREE.Vector3(0, 0, 0);
  const camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const lookAt = new THREE.Vector3();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const update = (camera: THREE.PerspectiveCamera) => {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(planePos, camPos);
    if (view.dot(normal) > 0) return false;
    view.reflect(normal).negate().add(planePos);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(planePos, lookAt).reflect(normal).negate().add(planePos);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(target);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.002;
    pm[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    return true;
  };
  return { cam, textureMatrix, update };
}

export function BowlingSystem({ asset, settings, onFollowEnd }: { asset: AssetHandle; settings: BowlingSettings; onFollowEnd: () => void }) {
  const ctl = asset.bowling!;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;

  useEffect(() => {
    void ctl.initPhysics();
    (window as unknown as { __bowl?: unknown }).__bowl = ctl;
    return () => ctl.audio.silence();
  }, [ctl]);
  useEffect(
    () => () => {
      if (controls) controls.enabled = true;
    },
    [controls],
  );

  useEffect(() => {
    ctl.setOptions({
      followBall: settings.followBall,
      slowmo: settings.slowmo,
      sound: settings.sound,
      aiLanes: settings.aiLanes,
      beastBall: settings.beastBall,
      mode: settings.mode,
    });
  }, [ctl, settings.followBall, settings.slowmo, settings.sound, settings.aiLanes, settings.beastBall, settings.mode]);

  // Peta lingkungan ruangan → bola & lintasan berkilau
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const lights = useMemo(() => {
    const hemi = new THREE.HemisphereLight('#fff1e0', '#2a2340', 0.55);
    const sun = new THREE.DirectionalLight('#fff4e6', 1.1);
    sun.position.set(5, 26, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -21;
    sc.right = 21;
    sc.top = 21;
    sc.bottom = -21;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const pinSpots = [0, 1, 2].map((p) => {
      const s = new THREE.SpotLight('#fff4dc', 5.5, 9, 0.85, 0.6, 2);
      s.position.set(HEAD_X - 1.3, 2.3, pairZ(p));
      s.target.position.set(HEAD_X + 0.5, 0, pairZ(p));
      return s;
    });
    const discoSpots = ['#ff3fd2', '#2de2ff', '#ffe14d'].map((c) => {
      const s = new THREE.SpotLight(c, 0, 16, 0.3, 0.5, 1.6);
      s.position.set(4.5, 4.4, 0);
      return s;
    });
    return { hemi, sun, pinSpots, discoSpots };
  }, []);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.92);
    c.addPass(bloom);
    c.addPass(new OutputPass());
    return { c, bloom };
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.c.setPixelRatio(gl.getPixelRatio());
    composer.c.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.c.dispose(), [composer]);

  const mirror = useMemo(() => createMirror(), []);
  const rt = useRef<THREE.WebGLRenderTarget | null>(null);
  useEffect(
    () => () => {
      rt.current?.dispose();
      gl.shadowMap.autoUpdate = true;
      if (asset.mirror) asset.mirror.uniforms.uMirrorOn.value = 0;
    },
    [gl, asset],
  );

  const follow = useRef({ active: false, pos: new THREE.Vector3(), target: new THREE.Vector3() });
  const shakeOff = useMemo(() => new THREE.Vector3(), []);
  const tmpSize = useMemo(() => new THREE.Vector2(), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    ctl.update(dt, camera);

    // Kamera ikut bola
    const rig = settings.followBall ? ctl.getCameraRig() : null;
    const f = follow.current;
    if (rig) {
      if (!f.active) {
        f.active = true;
        f.pos.copy(camera.position);
        f.target.copy(controls?.target ?? rig.target);
        if (controls) controls.enabled = false;
      }
      const k = 1 - Math.exp(-dt * 4.2);
      f.pos.lerp(rig.pos, k);
      f.target.lerp(rig.target, k);
      camera.position.copy(f.pos);
      camera.lookAt(f.target);
      if (controls) controls.target.copy(f.target);
    } else if (f.active) {
      f.active = false;
      if (controls) controls.enabled = true;
      onFollowEnd();
    }

    // Transisi pencahayaan mode
    const m = MODE[settings.mode];
    const kk = Math.min(1, dt * 3);
    lights.hemi.intensity += (m.hemi - lights.hemi.intensity) * kk;
    lights.sun.intensity += (m.sun - lights.sun.intensity) * kk;
    lights.pinSpots.forEach((s) => (s.intensity += (m.spot - s.intensity) * kk));
    scene.environmentIntensity += (m.env - scene.environmentIntensity) * kk;
    lights.discoSpots.forEach((s, i) => {
      s.intensity += (m.disco - s.intensity) * kk;
      const a = t * (0.7 + i * 0.25) + (i * Math.PI * 2) / 3;
      s.target.position.set(4.5 + Math.cos(a) * (5 + i * 2), 0, Math.sin(a * 1.3) * 6);
    });
    const b = composer.bloom;
    b.strength += (m.bloom[0] - b.strength) * kk;
    b.radius = m.bloom[1];
    b.threshold += (m.bloom[2] - b.threshold) * kk;

    // Getaran kamera (strike!)
    const sh = ctl.shake;
    shakeOff.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    camera.position.add(shakeOff);

    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;

    // Refleksi planar lintasan
    const mu = asset.mirror?.uniforms;
    if (mu) {
      let on = 0;
      if (settings.reflections && mirror.update(camera)) {
        gl.getDrawingBufferSize(tmpSize);
        const w = Math.max(2, Math.floor(tmpSize.x * 0.5));
        const h = Math.max(2, Math.floor(tmpSize.y * 0.5));
        if (!rt.current || rt.current.width !== w || rt.current.height !== h) {
          rt.current?.dispose();
          const half = gl.extensions.has('EXT_color_buffer_half_float') || gl.extensions.has('EXT_color_buffer_float');
          rt.current = new THREE.WebGLRenderTarget(w, h, {
            type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
            minFilter: THREE.LinearMipmapLinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: true,
          });
        }
        const hide = asset.mirror!.hide;
        hide.forEach((o) => (o.visible = false));
        gl.setRenderTarget(rt.current);
        gl.clear();
        gl.render(scene, mirror.cam);
        gl.setRenderTarget(null);
        hide.forEach((o) => (o.visible = true));
        mu.tMirror.value = rt.current.texture;
        mu.uMirrorMatrix.value.copy(mirror.textureMatrix);
        on = 1;
      }
      mu.uMirrorOn.value = on;
      mu.uMirrorStrength.value = settings.mode === 'normal' ? 0.75 : 1.1;
    }

    if (settings.bloom) composer.c.render(dt);
    else gl.render(scene, camera);
    camera.position.sub(shakeOff);
    gl.shadowMap.autoUpdate = true;
  }, 1);

  return (
    <>
      <primitive object={lights.hemi} />
      <primitive object={lights.sun} />
      {lights.pinSpots.map((s, i) => (
        <group key={`p${i}`}>
          <primitive object={s} />
          <primitive object={s.target} />
        </group>
      ))}
      {lights.discoSpots.map((s, i) => (
        <group key={`d${i}`}>
          <primitive object={s} />
          <primitive object={s.target} />
        </group>
      ))}
    </>
  );
}
