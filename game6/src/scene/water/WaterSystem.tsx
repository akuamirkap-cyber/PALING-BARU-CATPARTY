import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createWaterNormalMap } from './noise';
import { createWaterMaterial } from './waterMaterial';
import { buildFish, buildIslands, buildSeabed, polarGrid, type CausticUniforms } from './seabed';
import { LAYER } from '../layers';
import type { EnvDef } from '../environments';

const RENDER_SCALE = 0.5;

function makeTargets(gl: THREE.WebGLRenderer, w: number, h: number) {
  const half = gl.extensions.has('EXT_color_buffer_half_float') || gl.extensions.has('EXT_color_buffer_float');
  const opts = {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  } as const;
  const refr = new THREE.WebGLRenderTarget(w, h, { ...opts, depthTexture: new THREE.DepthTexture(w, h) });
  const refl = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
  if (!half) {
    refr.texture.colorSpace = THREE.SRGBColorSpace;
    refl.texture.colorSpace = THREE.SRGBColorSpace;
  }
  return { refr, refl, w, h };
}

/** Kamera cermin (port dari three/examples Reflector) dengan clip plane oblik di Y = 0. */
function createMirror() {
  const virtualCamera = new THREE.PerspectiveCamera();
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
  virtualCamera.layers.set(LAYER.DEFAULT);
  virtualCamera.layers.enable(LAYER.SKY);
  virtualCamera.layers.enable(LAYER.ABOVE);

  const update = (camera: THREE.PerspectiveCamera) => {
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(planePos, camPos);
    if (view.dot(normal) > 0) return false;
    view.reflect(normal).negate().add(planePos);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(planePos, lookAt).reflect(normal).negate().add(planePos);
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    virtualCamera.lookAt(target);
    virtualCamera.near = camera.near;
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(virtualCamera.projectionMatrix);
    textureMatrix.multiply(virtualCamera.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(normal, planePos);
    plane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = virtualCamera.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.003;
    pm[14] = clip.w;
    virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();
    return true;
  };
  return { virtualCamera, textureMatrix, update };
}

export function WaterSystem({ env, reflections, fishRadius, night }: { env: EnvDef; reflections: boolean; fishRadius: number; night: boolean }) {
  const gl = useThree((s) => s.gl);

  const res = useMemo(() => {
    const normalMap = createWaterNormalMap();
    const { material, uniforms } = createWaterMaterial(normalMap);
    const water = new THREE.Mesh(polarGrid(1100, 180, 240, 2), material);
    water.name = 'Ocean';
    water.frustumCulled = false;
    const caustic: CausticUniforms = {
      uTime: { value: 0 },
      uCaustic: { value: 1 },
      uSunColor: { value: new THREE.Color('#ffffff') },
    };
    const { seabed, decor } = buildSeabed(caustic);
    const islands = buildIslands();
    return { normalMap, material, uniforms, water, caustic, seabed, decor, islands, mirror: createMirror() };
  }, []);

  const fish = useMemo(() => buildFish(fishRadius), [fishRadius]);
  useEffect(
    () => () => {
      fish.mesh.geometry.dispose();
      fish.mesh.dispose();
    },
    [fish],
  );

  const targets = useRef<ReturnType<typeof makeTargets> | null>(null);
  const tmpSize = useMemo(() => new THREE.Vector2(), []);
  const ampRef = useRef(env.waveAmp);

  useEffect(() => {
    const u = res.uniforms;
    u.uShallow.value.set(env.waterShallow);
    u.uDeep.value.set(env.waterDeep);
    u.uAbsorb.value.set(env.absorb[0], env.absorb[1], env.absorb[2]);
    u.uClarity.value = env.clarity;
    u.uLight.value = env.waterLight;
    u.uFoamAmount.value = env.foam;
    u.uGlint.value = env.glint;
    u.uSkyTop.value.set(env.skyTop);
    u.uSkyHorizon.value.set(env.fog);
    u.uSunDir.value.set(...env.sunPos).normalize();
    u.uSunColor.value.set(env.sunColor).multiplyScalar(env.sunIntensity);
    res.caustic.uCaustic.value = env.caustic;
    res.caustic.uSunColor.value.set(env.sunColor);
  }, [env, res]);

  useEffect(() => {
    res.islands.beams.forEach((b) => (b.visible = night));
    res.islands.lamps.forEach((m) => (m.emissiveIntensity = night ? 3 : 0.6));
  }, [night, res]);

  useEffect(
    () => () => {
      targets.current?.refr.dispose();
      targets.current?.refl.dispose();
      targets.current?.refr.depthTexture?.dispose();
      res.material.dispose();
      res.normalMap.dispose();
      gl.shadowMap.autoUpdate = true;
    },
    [res, gl],
  );

  useFrame((state, dt) => {
    const { gl: renderer, scene } = state;
    const camera = state.camera as THREE.PerspectiveCamera;
    const t = state.clock.elapsedTime;
    const u = res.uniforms;

    u.uTime.value = t;
    res.caustic.uTime.value = t;
    ampRef.current += (env.waveAmp - ampRef.current) * Math.min(1, dt * 1.2);
    u.uAmp.value = ampRef.current;
    fish.update(t);
    res.islands.beams.forEach((b) => (b.rotation.y += dt * 0.9));

    renderer.getDrawingBufferSize(tmpSize);
    const w = Math.max(2, Math.floor(tmpSize.x * RENDER_SCALE));
    const h = Math.max(2, Math.floor(tmpSize.y * RENDER_SCALE));
    if (!targets.current || targets.current.w !== w || targets.current.h !== h) {
      targets.current?.refr.dispose();
      targets.current?.refr.depthTexture?.dispose();
      targets.current?.refl.dispose();
      targets.current = makeTargets(renderer, w, h);
    }
    const tg = targets.current;
    u.uScreenSize.value.copy(tmpSize);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.tRefrColor.value = tg.refr.texture;
    u.tRefrDepth.value = tg.refr.depthTexture;
    u.tReflColor.value = tg.refl.texture;

    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    res.water.visible = false;

    // Pass 1: refraksi (apa yang ada di bawah permukaan air)
    const mask = camera.layers.mask;
    camera.layers.set(LAYER.DEFAULT);
    camera.layers.enable(LAYER.UNDERWATER);
    renderer.setRenderTarget(tg.refr);
    renderer.render(scene, camera);
    camera.layers.mask = mask;

    // Pass 2: refleksi (kamera cermin)
    let hasRefl = 0;
    if (reflections && res.mirror.update(camera)) {
      u.uReflMatrix.value.copy(res.mirror.textureMatrix);
      renderer.setRenderTarget(tg.refl);
      renderer.render(scene, res.mirror.virtualCamera);
      hasRefl = 1;
    }
    u.uHasRefl.value = hasRefl;

    // Pass 3: render utama
    renderer.setRenderTarget(null);
    res.water.visible = true;
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = true;
  }, 1);

  return (
    <>
      <primitive object={res.water} dispose={null} />
      <primitive object={res.seabed} dispose={null} />
      <primitive object={res.decor} dispose={null} />
      <primitive object={res.islands.group} dispose={null} />
      <primitive object={fish.mesh} dispose={null} />
    </>
  );
}
