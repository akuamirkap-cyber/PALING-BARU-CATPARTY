import * as THREE from 'three';

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform float uAmp;
uniform mat4 uReflMatrix;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying vec4 vReflCoord;
varying vec3 vViewPos;
varying float vCrest;

void addWave(vec2 p, vec2 D, float L, float A, float Q, float t, inout vec3 offs, inout vec3 nrm) {
  float k = 6.28318530718 / L;
  float w = sqrt(9.81 * k);
  float ph = k * dot(D, p) - w * t;
  float S = sin(ph);
  float C = cos(ph);
  offs.x += Q * A * D.x * C;
  offs.z += Q * A * D.y * C;
  offs.y += A * S;
  float WA = k * A;
  nrm.x -= D.x * WA * C;
  nrm.z -= D.y * WA * C;
  nrm.y -= Q * WA * S;
}

void main() {
  vec4 wp0 = modelMatrix * vec4(position, 1.0);
  vec2 p = wp0.xz;
  vec3 offs = vec3(0.0);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float t = uTime;
  float fadeS = 1.0 - smoothstep(70.0, 260.0, distance(p, cameraPosition.xz));
  addWave(p, normalize(vec2(1.0, 0.35)), 38.0, 0.30 * uAmp, 0.55, t, offs, nrm);
  addWave(p, normalize(vec2(-0.4, 1.0)), 21.0, 0.18 * uAmp, 0.55, t, offs, nrm);
  addWave(p, normalize(vec2(0.8, -0.6)), 13.0, 0.10 * uAmp * fadeS, 0.5, t, offs, nrm);
  addWave(p, normalize(vec2(-0.9, -0.25)), 8.5, 0.06 * uAmp * fadeS, 0.5, t, offs, nrm);
  addWave(p, normalize(vec2(0.2, 0.95)), 5.5, 0.035 * uAmp * fadeS, 0.45, t, offs, nrm);
  vec3 wp = wp0.xyz + offs;
  vWorldPos = wp;
  vWaveNormal = normalize(nrm);
  vCrest = offs.y / max(0.0001, 0.68 * uAmp);
  vReflCoord = uReflMatrix * vec4(wp0.x, 0.0, wp0.z, 1.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D tNormal;
uniform sampler2D tRefrColor;
uniform sampler2D tRefrDepth;
uniform sampler2D tReflColor;
uniform vec2 uScreenSize;
uniform float uNear;
uniform float uFar;
uniform float uHasRefr;
uniform float uHasRefl;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uAbsorb;
uniform float uClarity;
uniform float uFoamAmount;
uniform float uLight;
uniform float uDetail;
uniform float uGlint;
varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying vec4 vReflCoord;
varying vec3 vViewPos;
varying float vCrest;

float viewZFromDepth(float d) {
  return (uNear * uFar) / ((uFar - uNear) * d - uFar);
}
vec3 sampleN(vec2 uv) {
  return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
}

void main() {
  vec3 V = cameraPosition - vWorldPos;
  float dist = length(V);
  V /= dist;
  float t = uTime;
  vec2 wp = vWorldPos.xz;

  // --- normal detail (riak kecil yang bergerak) ---
  vec3 n1 = sampleN(wp * 0.045 + vec2(t * 0.011, t * 0.007));
  vec3 n2 = sampleN(wp * 0.11 + vec2(-t * 0.016, t * 0.012));
  vec3 n3 = sampleN(wp * 0.31 + vec2(t * 0.03, -t * 0.024));
  float dfade = 1.0 - smoothstep(25.0, 300.0, dist);
  vec2 dxy = (n1.xy * 0.6 + n2.xy * 0.45 + n3.xy * 0.3 * dfade) * uDetail * mix(0.3, 1.0, dfade);
  vec3 N = normalize(vWaveNormal + vec3(dxy.x, 0.0, dxy.y));
  float NdV = max(dot(N, V), 0.0);
  float fres = clamp(0.02 + 0.98 * pow(1.0 - NdV, 5.0), 0.0, 1.0);

  // --- refraksi & kedalaman ---
  vec2 suv = gl_FragCoord.xy / uScreenSize;
  float waterZ = -vViewPos.z;
  float thickness = 400.0;
  vec3 sceneCol = uDeep;
  if (uHasRefr > 0.5) {
    float d0 = texture2D(tRefrDepth, suv).x;
    float sceneZ0 = -viewZFromDepth(d0);
    float thick0 = max(sceneZ0 - waterZ, 0.0);
    vec2 distort = (dxy + N.xz * 0.5) * 0.03 * clamp(thick0 * 0.6, 0.0, 1.0) / (1.0 + waterZ * 0.015);
    vec2 ruv = clamp(suv + distort, vec2(0.001), vec2(0.999));
    float d1 = texture2D(tRefrDepth, ruv).x;
    float sceneZ = -viewZFromDepth(d1);
    if (sceneZ < waterZ) { ruv = suv; sceneZ = sceneZ0; d1 = d0; }
    sceneCol = texture2D(tRefrColor, ruv).rgb;
    float rayScale = dist / max(waterZ, 0.001);
    thickness = d1 >= 0.99999 ? 400.0 : max(sceneZ - waterZ, 0.0) * rayScale;
  }
  vec3 T = exp(-uAbsorb * uClarity * thickness);
  float depthV = thickness * clamp(V.y, 0.08, 1.0);
  vec3 scatter = mix(uShallow, uDeep, 1.0 - exp(-depthV * 0.1 * uClarity)) * uLight;
  vec3 refr = sceneCol * T + scatter * (1.0 - T);

  // --- refleksi ---
  vec3 R = reflect(-V, N);
  vec3 refl = mix(uSkyHorizon, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
  if (uHasRefl > 0.5) {
    vec2 luv = vReflCoord.xy / vReflCoord.w + (dxy * 0.7 + N.xz * 0.6) * 0.03;
    refl = texture2D(tReflColor, clamp(luv, vec2(0.001), vec2(0.999))).rgb;
  }

  vec3 col = mix(refr, refl, fres);

  // --- kilau matahari ---
  vec3 H = normalize(uSunDir + V);
  float NdH = max(dot(N, H), 0.0);
  float spec = pow(NdH, 1100.0) * 22.0 + pow(NdH, 160.0) * 1.1;
  col += uSunColor * spec * uGlint * mix(0.6, 1.0, fres);

  // --- buih: garis kontak + puncak ombak ---
  float sh = texture2D(tNormal, wp * 0.21 + vec2(t * 0.02, -t * 0.015)).a;
  float sh2 = texture2D(tNormal, wp * 0.53 - vec2(t * 0.03, t * 0.012)).a;
  float noise = sh * 0.6 + sh2 * 0.4;
  float edge = 1.0 - smoothstep(0.0, 1.5, thickness);
  float ripple = 0.5 + 0.5 * sin(thickness * 5.5 - t * 2.2 + noise * 4.0);
  float foamEdge = edge * smoothstep(0.42, 0.62, noise * 0.55 + ripple * 0.35 * edge + edge * 0.4);
  float crest = smoothstep(0.62, 1.05, vCrest + noise * 0.4) * uFoamAmount;
  float foam = clamp(foamEdge + crest * 0.8, 0.0, 1.0);
  vec3 foamCol = vec3(0.92, 0.97, 1.0) * (0.12 + uLight * 0.95);
  col = mix(col, foamCol, foam * 0.9);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export type WaterUniforms = ReturnType<typeof createWaterUniforms>;

function createWaterUniforms(normalMap: THREE.Texture) {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uReflMatrix: { value: new THREE.Matrix4() },
    tNormal: { value: normalMap },
    tRefrColor: { value: null as THREE.Texture | null },
    tRefrDepth: { value: null as THREE.Texture | null },
    tReflColor: { value: null as THREE.Texture | null },
    uScreenSize: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.5 },
    uFar: { value: 1800 },
    uHasRefr: { value: 1 },
    uHasRefl: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
    uSunColor: { value: new THREE.Color('#ffffff') },
    uSkyTop: { value: new THREE.Color('#3f8fd2') },
    uSkyHorizon: { value: new THREE.Color('#bfe3f2') },
    uShallow: { value: new THREE.Color('#3fd9cf') },
    uDeep: { value: new THREE.Color('#0a4d96') },
    uAbsorb: { value: new THREE.Vector3(0.42, 0.075, 0.05) },
    uClarity: { value: 1 },
    uFoamAmount: { value: 0.25 },
    uLight: { value: 1 },
    uDetail: { value: 0.55 },
    uGlint: { value: 1 },
  };
}

export function createWaterMaterial(normalMap: THREE.Texture) {
  const uniforms = createWaterUniforms(normalMap);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
    side: THREE.FrontSide,
  });
  material.name = 'Ocean_Water';
  return { material, uniforms };
}
