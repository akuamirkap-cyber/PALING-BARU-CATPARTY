import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SeatSpot } from './buildStands';
import { LAYER, setLayer } from '../scene/layers';

function colorize(g: THREE.BufferGeometry, hex: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function buildCrowd(spots: SeatSpot[], fill: number, palette: string[]) {
  const body = new THREE.CapsuleGeometry(0.2, 0.3, 2, 8);
  body.translate(0, 0.35, 0);
  const eyeL = new THREE.BoxGeometry(0.05, 0.09, 0.03);
  eyeL.translate(-0.07, 0.52, -0.195);
  const eyeR = new THREE.BoxGeometry(0.05, 0.09, 0.03);
  eyeR.translate(0.07, 0.52, -0.195);
  const geo = mergeGeometries([colorize(body, '#ffffff'), colorize(eyeL, '#000000'), colorize(eyeR, '#000000')], false) ?? body;

  const uniforms = { uTime: { value: 0 }, uCheer: { value: 1 }, uWave: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  mat.name = 'Crowd_Beasts';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      'uniform float uTime;\nuniform float uCheer;\nuniform float uWave;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float cid = float(gl_InstanceID);
          float cph = fract(sin(cid * 12.9898) * 43758.5453);
          vec3 cip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float cang = atan(cip.z, cip.x);
          float cwave = uWave * smoothstep(0.82, 1.0, sin(cang - uTime * 1.5));
          float cb = max(0.0, sin(uTime * (4.0 + cph * 4.0) + cph * 6.2831));
          float cbounce = cb * (0.03 + 0.12 * uCheer * step(0.35, cph));
          transformed.y = transformed.y * (1.0 + cwave * 0.35 + cb * 0.05 * uCheer) + cbounce + cwave * 0.45;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => 'crowd-anim-v1';

  const chosen = spots.filter((s, i) => {
    const h = Math.sin(i * 91.7 + 3.1) * 43758.5453;
    return !s.letter && h - Math.floor(h) < fill;
  });
  const mesh = new THREE.InstancedMesh(geo, mat, chosen.length);
  mesh.name = 'Crowd';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  chosen.forEach((s, i) => {
    const h = Math.sin(i * 12.3 + 0.7) * 9631.17;
    const r = h - Math.floor(h);
    const sc = 0.88 + r * 0.28;
    q.setFromAxisAngle(up, s.yaw + (r - 0.5) * 0.4);
    m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(sc, sc, sc));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, c.set(palette[Math.floor(r * 997) % palette.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.noExport = true;
  setLayer(mesh, LAYER.MAIN_ONLY);
  return { mesh, uniforms };
}
