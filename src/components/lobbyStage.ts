import * as THREE from "three";
import { animalById } from "../game/animals";
import { buildCharacterVisual, disposeCharacterDetails, poseStatic, type CharacterVisual } from "../game/characterMesh";
import type { LobbyMember } from "./MatchLobby";

/**
 * 3D scenery for the matchmaking lobby. This is a faithful (vanilla three.js)
 * port of the sunny-hill stage from the reference menu: sky dome with sun,
 * far fields, snow-capped mountains, tree line, curve-topped hill with a sandy
 * path, grass, flowers, fence and drifting pollen. The whole line-up of cats
 * stands on the flat crest.
 */

export const LOBBY_FOV = 32;
const SUN = new THREE.Vector3(-0.5, 0.32, -0.8).normalize();
const FIELD_A = new THREE.Color("#ffd84a");
const FIELD_B = new THREE.Color("#ff9ec9");

/* ---------------- noise ---------------- */
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/* ---------------- ground ---------------- */
const pathX = (z: number) => Math.sin(z * 0.11) * 1.4;

/** Hill height. The crest under the line-up is dead flat, then it rolls away. */
export function hillY(x: number, z: number): number {
  const zz = z > 0 ? z * 0.3 : z;
  const xx = x * 0.85;
  const r = Math.hypot(xx, zz);
  const fall = r > 9.5 ? -Math.pow(r - 9.5, 1.7) * 0.18 : 0;
  const mounds = (fbm(x * 0.07 + 3, z * 0.07) - 0.5) * 1.6 * sstep(7, 16, r);
  const ripple = (fbm(x * 0.3, z * 0.3) - 0.5) * 0.25 * sstep(5.5, 10, r);
  // flatten the strip where the cats stand so their feet stay on one line
  const stage = (1 - sstep(4.4, 6.4, Math.abs(x))) * (1 - sstep(1.2, 2.4, Math.abs(z)));
  return (fall + mounds + ripple) * (1 - Math.min(1, stage));
}

/** Height of the distant land ring. */
function farH(x: number, z: number) {
  const rise = sstep(25, 150, -z) * 24;
  const roll = (fbm(x * 0.022 + 10, z * 0.022) - 0.45) * 16 * sstep(15, 55, -z);
  const side = sstep(55, 140, Math.abs(x)) * 14;
  return -15 + rise + roll + side;
}

/* ---------------- scenery ---------------- */
export interface LobbyScenery {
  clouds: THREE.Group[];
  trees: THREE.Object3D[];
  /** per-frame animation (wind, pollen, butterflies, clouds) */
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

function vertexColored(geometry: THREE.BufferGeometry, paint: (x: number, y: number, z: number, i: number) => THREE.Color) {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(paint(pos.getX(i), pos.getY(i), pos.getZ(i), i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function buildLobbyScenery(scene: THREE.Scene): LobbyScenery {
  scene.background = new THREE.Color(0xbfe4ff);
  scene.fog = new THREE.Fog(0xcfeaff, 120, 470);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T) => {
    materials.push(m);
    return m;
  };
  const rand = rng(1337);

  // ---- sky dome
  const skyMat = mat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#1e88ff") },
        horizon: { value: new THREE.Color("#c4e8ff") },
        sunCol: { value: new THREE.Color("#fff1c9") },
        sunDir: { value: SUN.clone() },
      },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = max(d.y, 0.0);
          vec3 c = mix(horizon, top, pow(smoothstep(0.0, 0.55, h), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.45 + pow(s, 5.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(480, 40, 24)), skyMat);
  sky.renderOrder = -3;
  scene.add(sky);

  // ---- far land ring with flower fields
  {
    const g = new THREE.PlaneGeometry(700, 360, 100, 52);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -175);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, farH(pos.getX(i), pos.getZ(i)));
    const low = new THREE.Color("#4fb33a");
    const mid = new THREE.Color("#6cc84a");
    const high = new THREE.Color("#9ad860");
    const c = new THREE.Color();
    vertexColored(g, (x, _y, z) => {
      const h = farH(x, z);
      c.copy(low)
        .lerp(mid, sstep(-14, -4, h))
        .lerp(high, sstep(-2, 8, h) * 0.8)
        .lerp(low, sstep(0.55, 0.75, fbm(x * 0.05, z * 0.05)) * 0.4);
      const field = fbm(x * 0.04 + 90, z * 0.09);
      if (z > -120 && field > 0.62) c.lerp(field > 0.7 ? FIELD_A : FIELD_B, sstep(0.62, 0.68, field) * 0.85);
      return c;
    });
    const farLand = new THREE.Mesh(track(g), mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    scene.add(farLand);
  }

  // ---- mountains
  {
    const peaks: [number, number, number, number][] = [
      [-150, -275, 95, 70],
      [-70, -300, 120, 90],
      [10, -285, 105, 78],
      [90, -305, 130, 95],
      [165, -270, 90, 66],
      [-230, -250, 80, 60],
      [240, -260, 85, 62],
    ];
    const rock = new THREE.Color("#6f9fd6");
    const rock2 = new THREE.Color("#8fb8e6");
    const snow = new THREE.Color("#ffffff");
    const c = new THREE.Color();
    peaks.forEach(([x, z, r, h], idx) => {
      const g = new THREE.ConeGeometry(r, h, 48, 14, true);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const t = (py + h / 2) / h;
        const a = Math.atan2(pz, px);
        const n = fbm(Math.cos(a) * 2 + idx * 5, t * 3 + Math.sin(a) * 2);
        const k = 1 + (n - 0.5) * 0.55 * (1 - t);
        pos.setXYZ(i, px * k, py + (n - 0.5) * h * 0.12 * (1 - t), pz * k);
      }
      vertexColored(g, (px, py, pz) => {
        const t = (py + h / 2) / h;
        const a = Math.atan2(pz, px);
        const n = fbm(Math.cos(a) * 2 + idx * 5, t * 3 + Math.sin(a) * 2);
        return c.copy(rock).lerp(rock2, n).lerp(snow, sstep(0.6 + (n - 0.5) * 0.25, 0.72 + (n - 0.5) * 0.25, t));
      });
      g.computeVertexNormals();
      g.translate(x, h / 2 - 22, z);
      scene.add(new THREE.Mesh(track(g), mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: true }))));
    });
  }

  // ---- the hill the cats stand on (vertex-coloured, with a sandy path)
  {
    const g = new THREE.PlaneGeometry(160, 160, 140, 140);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, hillY(pos.getX(i), pos.getZ(i)));
    const top = new THREE.Color("#7fd84a");
    const top2 = new THREE.Color("#a6e85c");
    const slope = new THREE.Color("#5cc23e");
    const deep = new THREE.Color("#46a736");
    const sand = new THREE.Color("#ecd9a6");
    const sandEdge = new THREE.Color("#c9d983");
    const c = new THREE.Color();
    vertexColored(g, (x, _y, z) => {
      const h = hillY(x, z);
      const n = fbm(x * 0.12, z * 0.12);
      c.copy(top).lerp(top2, sstep(0.45, 0.75, n) * 0.7);
      c.lerp(slope, sstep(-0.5, -4, h));
      c.lerp(deep, sstep(-4, -14, h));
      // a sandy walking path curving back over the hill
      if (z < -1.6) {
        const t = Math.min(1, (-z - 1.6) / 26);
        const w = 0.55 + t * 1.4 + (fbm(x * 0.8, z * 0.8) - 0.5) * 0.3;
        const dx = Math.abs(x - pathX(z) * (1 + t));
        const k = 1 - sstep(w - 0.25, w + 0.25, dx);
        const e = 1 - sstep(w + 0.1, w + 0.7, dx);
        c.lerp(sandEdge, e * 0.45);
        c.lerp(sand, k);
      }
      return c;
    });
    g.computeVertexNormals();
    const hill = new THREE.Mesh(track(g), mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    hill.receiveShadow = true;
    scene.add(hill);
  }

  // ---- far tree line on the distant hills
  {
    const N = 170;
    const geo = track(new THREE.SphereGeometry(1, 10, 8));
    const material = mat(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    const mesh = new THREE.InstancedMesh(geo, material, N);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let count = 0;
    let guard = 0;
    while (count < N && guard++ < N * 20) {
      const x = (rand() * 2 - 1) * 170;
      const z = -55 - rand() * 110;
      if (fbm(x * 0.03 + 50, z * 0.03) < 0.5) continue;
      const s = 1.2 + rand() * 1.1;
      dummy.position.set(x, farH(x, z) + s * 0.7, z);
      dummy.rotation.set(0, rand() * 6, 0);
      dummy.scale.set(s, s * 0.9, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);
      mesh.setColorAt(count, color.setHSL(0.3 + (rand() - 0.5) * 0.05, 0.6, 0.36 + rand() * 0.1));
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---- fluffy trees framing the line-up
  const trees: THREE.Object3D[] = [];
  {
    const trunkGeo = track(new THREE.CylinderGeometry(0.16, 0.26, 2.1, 10));
    const puffGeo = track(new THREE.SphereGeometry(1, 18, 14));
    const trunkMat = mat(new THREE.MeshStandardMaterial({ color: "#8b5a35", roughness: 0.9 }));
    const spots: [number, number, number, number][] = [
      [-10.4, -9.5, 1.25, 0],
      [10.8, -10.2, 1.3, 1],
      [-14.6, -16, 1.5, 2],
      [15.2, -17, 1.45, 0],
      [-20.5, -24, 1.7, 1],
      [21, -25, 1.65, 2],
    ];
    const puffs: [number, number, number, number, number][] = [
      [0, 2.5, 0, 1.25, 1],
      [0.95, 2.2, 0.2, 0.9, 0],
      [-0.9, 2.3, -0.1, 0.95, 0],
      [0.2, 3.25, 0.15, 0.85, 2],
      [-0.35, 2.9, 0.65, 0.75, 3],
      [0.5, 2.75, -0.6, 0.8, 1],
    ];
    for (const [x, z, s, hue] of spots) {
      const base = new THREE.Color().setHSL(0.28 + hue * 0.02, 0.55, 0.42);
      const shades = [base.clone().offsetHSL(0, 0, -0.07), base, base.clone().offsetHSL(0.01, 0.02, 0.07), base.clone().offsetHSL(0.015, 0.03, 0.13)];
      const leafMats = shades.map((shade) => mat(new THREE.MeshStandardMaterial({ color: shade, roughness: 0.85 })));
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.0;
      trunk.castShadow = true;
      group.add(trunk);
      const branch = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 8)), trunkMat);
      branch.position.set(0.32, 1.6, 0);
      branch.rotation.z = -0.7;
      group.add(branch);
      for (const [px, py, pz, r, k] of puffs) {
        const puff = new THREE.Mesh(puffGeo, leafMats[k]);
        puff.position.set(px, py, pz);
        puff.scale.setScalar(r);
        puff.castShadow = true;
        group.add(puff);
      }
      group.position.set(x, hillY(x, z) - 0.1, z);
      group.scale.setScalar(s);
      scene.add(group);
      trees.push(group);
    }
  }

  // ---- bushes + rocks close to the stage
  {
    const sphereGeo = track(new THREE.SphereGeometry(1, 14, 10));
    const bushMats = ["#5bb243", "#6cc04f", "#4fa53b", "#7acb59"].map((color) => mat(new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));
    const bushes: [number, number, number][] = [
      [-4.9, -2.6, 1.0],
      [5.3, -3.0, 1.05],
      [-7.9, -1.2, 0.8],
      [8.4, -1.6, 0.85],
    ];
    for (const [x, z, s] of bushes) {
      const group = new THREE.Group();
      const parts: [number, number, number, number, number][] = [
        [0, 0.35, 0, 0.55, 0],
        [0.5, 0.28, 0.1, 0.42, 1],
        [-0.45, 0.26, 0.05, 0.4, 2],
        [0.1, 0.55, 0.15, 0.35, 3],
      ];
      for (const [px, py, pz, r, k] of parts) {
        const puff = new THREE.Mesh(sphereGeo, bushMats[k]);
        puff.position.set(px, py, pz);
        puff.scale.setScalar(r);
        puff.castShadow = true;
        group.add(puff);
      }
      group.position.set(x, hillY(x, z), z);
      group.scale.setScalar(s);
      scene.add(group);
    }
    const rockGeo = track(new THREE.IcosahedronGeometry(0.35, 1));
    const rockMat = mat(new THREE.MeshStandardMaterial({ color: "#b9b4aa", roughness: 0.9 }));
    for (const [x, z, s, r] of [[-3.6, 1.9, 0.9, 0.6], [4.1, 2.2, 1.1, 1.9], [8.9, 2.6, 0.7, 2.8], [-8.2, 2.4, 0.8, 1.1]] as const) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x, hillY(x, z) + 0.08 * s, z);
      rock.rotation.set(0.2, r, 0.1);
      rock.scale.set(s * 1.3, s * 0.7, s);
      rock.castShadow = true;
      scene.add(rock);
    }
  }

  // ---- grass (instanced blades that sway in the wind)
  const wind = { value: 0 };
  {
    const segs = 4;
    const w = 0.09;
    const verts: number[] = [];
    const cols: number[] = [];
    const norms: number[] = [];
    const idx: number[] = [];
    const base = new THREE.Color("#4fae35");
    const tip = new THREE.Color("#d8ff8f");
    const c = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ww = w * (1 - t) * (i === segs ? 0 : 1);
      const bend = t * t * 0.18;
      c.copy(base).lerp(tip, Math.pow(t, 0.8));
      for (const s of [-1, 1]) {
        verts.push((s * ww) / 2, t, bend);
        cols.push(c.r, c.g, c.b);
        norms.push(0, 1, 0.3);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const blade = track(new THREE.BufferGeometry());
    blade.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    blade.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
    blade.setIndex(idx);

    const grassMat = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind;
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 1.6 + ip.x * 0.32 + ip.z * 0.21) * 0.6 + sin(uTime * 2.7 + ip.x * 0.9 - ip.z * 0.5) * 0.25;
         float hh = position.y * position.y;
         transformed.x += sway * hh * 0.16;
         transformed.z += (sway * 0.5 + 0.2) * hh * 0.1;`,
      );
    };
    const COUNT = 3200;
    const grass = new THREE.InstancedMesh(blade, grassMat, COUNT);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    let guard = 0;
    while (i < COUNT && guard++ < COUNT * 6) {
      const x = (rand() * 2 - 1) * 20;
      const z = -10 + rand() * 20;
      const h = hillY(x, z);
      if (h < -3) continue;
      if (Math.abs(x) < 4.9 && z > -1.4 && z < 1.7 && rand() < 0.9) continue;
      const stage = Math.abs(x) < 7.5 && z > -1.4 && z < 1.8;
      const s = 0.8 + rand() * 0.6;
      const ht = (stage ? 0.12 : 0.18) + rand() * (stage ? 0.06 : 0.16);
      dummy.position.set(x, h - 0.02, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s, ht, s);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      grass.setColorAt(i, color.setHSL(0.26 + (rand() - 0.5) * 0.05, 0.6, 0.55 + rand() * 0.25));
      i++;
    }
    grass.count = i;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.frustumCulled = false;
    scene.add(grass);
  }

  // ---- flowers
  {
    const petalShape = new THREE.Shape();
    const petals = 6;
    for (let i = 0; i <= petals * 8; i++) {
      const a = (i / (petals * 8)) * Math.PI * 2;
      const r = 0.55 + 0.45 * Math.abs(Math.cos((a * petals) / 2));
      if (i) petalShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else petalShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const petalGeo = track(new THREE.ShapeGeometry(petalShape));
    petalGeo.rotateX(-Math.PI / 2);
    const N = 150;
    const petalMat = mat(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }));
    const head = new THREE.InstancedMesh(petalGeo, petalMat, N);
    const centerGeo = track(new THREE.SphereGeometry(1, 8, 6));
    const centerMat = mat(new THREE.MeshStandardMaterial({ color: "#ffb21a", roughness: 0.5 }));
    const center = new THREE.InstancedMesh(centerGeo, centerMat, N);
    const stemGeo = track(new THREE.CylinderGeometry(0.008, 0.01, 1, 4));
    const stemMat = mat(new THREE.MeshStandardMaterial({ color: "#4f9a37" }));
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, N);
    const colors = ["#ffffff", "#ffe14d", "#ff7eb6", "#ffffff", "#b98cff", "#ff9f43", "#ff5e7a"];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    let guard = 0;
    while (i < N && guard++ < N * 10) {
      const x = (rand() * 2 - 1) * 18;
      const z = -8 + rand() * 22;
      const h = hillY(x, z);
      if (h < -2.5) continue;
      if (Math.abs(x) < 5.1 && z > -1.5 && z < 1.9) continue;
      const s = 0.075 + rand() * 0.045;
      const sh = 0.14 + rand() * 0.12;
      dummy.position.set(x, h + sh, z);
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
      head.setColorAt(i, color.set(colors[i % colors.length]));
      dummy.position.y = h + sh + 0.008;
      dummy.scale.setScalar(s * 0.42);
      dummy.updateMatrix();
      center.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, h + sh / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, sh, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      i++;
    }
    for (const mesh of [head, center, stems]) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  // ---- fence along the front edge of the crest
  {
    const woodMat = mat(new THREE.MeshStandardMaterial({ color: "#c99158", roughness: 0.75 }));
    const postGeo = track(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 8));
    const capGeo = track(new THREE.SphereGeometry(0.08, 8, 6));
    const posts: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (1.16 + (i / 12) * 0.68);
      const x = Math.cos(a) * 10.2;
      const z = 2.2 + Math.sin(a) * 6.4;
      posts.push([x, hillY(x, z), z]);
    }
    for (const [x, y, z] of posts) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(x, y + 0.5, z);
      post.castShadow = true;
      scene.add(post);
      const cap = new THREE.Mesh(capGeo, woodMat);
      cap.position.set(x, y + 1.02, z);
      scene.add(cap);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [x, y, z] = posts[i];
      const [x2, y2, z2] = posts[i + 1];
      const len = Math.hypot(x2 - x, z2 - z, y2 - y);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(x2 - x, y2 - y, z2 - z).normalize());
      for (const rail of [0.42, 0.78]) {
        const railGeo = track(new THREE.BoxGeometry(len, 0.07, 0.05));
        const bar = new THREE.Mesh(railGeo, woodMat);
        bar.position.set((x + x2) / 2, (y + y2) / 2 + rail, (z + z2) / 2);
        bar.quaternion.copy(q);
        bar.castShadow = true;
        scene.add(bar);
      }
    }
  }

  // ---- clouds
  const clouds: THREE.Group[] = [];
  {
    const puffGeo = track(new THREE.SphereGeometry(1, 14, 10));
    const cloudMat = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 1 }));
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 5],
      [5.2, -0.8, 0.5, 3.8],
      [-5.2, -0.8, -0.3, 3.9],
      [2.2, 2.4, 0, 3.6],
      [-2.4, 1.8, 0.4, 3.2],
      [8.5, -1.6, 0, 2.6],
      [-8.4, -1.7, 0, 2.5],
    ];
    const spots: [number, number, number, number][] = [
      [-120, 48, -200, 2.2],
      [-40, 58, -230, 2.8],
      [50, 44, -190, 2.0],
      [140, 55, -220, 2.6],
      [-200, 50, -180, 2.1],
      [0, 36, -150, 1.4],
      [95, 34, -140, 1.2],
    ];
    for (const [x, y, z, s] of spots) {
      const group = new THREE.Group();
      for (const [cx, cy, cz, cr] of puffs) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(cx, cy, cz);
        puff.scale.setScalar(cr);
        group.add(puff);
      }
      group.position.set(x, y, z);
      group.scale.set(s, s * 0.85, s);
      scene.add(group);
      clouds.push(group);
    }
  }

  // ---- floating pollen
  const pollen = { geo: null as THREE.BufferGeometry | null, base: new Float32Array(0), count: 0 };
  {
    const N = 120;
    const base = new Float32Array(N * 3);
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      base[i * 3] = (rand() * 2 - 1) * 14;
      base[i * 3 + 1] = 0.4 + rand() * 4.2;
      base[i * 3 + 2] = -8 + rand() * 16;
    }
    positions.set(base);
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dot = new THREE.MeshBasicMaterial({ color: 0xfff6c4 });
    const points = new THREE.Points(geo, mat(dot));
    points.frustumCulled = false;
    scene.add(points);
    pollen.geo = geo;
    pollen.base = base;
    pollen.count = N;
  }

  // ---- butterflies
  const butterflies: THREE.Group[] = [];
  {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.05, 0.16, 0.22, 0.14, 0.2, 0.02);
    shape.bezierCurveTo(0.22, -0.08, 0.08, -0.12, 0, 0);
    const wing = track(new THREE.ShapeGeometry(shape));
    ["#ffb703", "#ff7ab8", "#7dd3fc", "#ffffff", "#c4a1ff"].forEach((color) => {
      const group = new THREE.Group();
      const wingMat = mat(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
      const left = new THREE.Mesh(wing, wingMat);
      const right = new THREE.Mesh(wing, wingMat);
      right.scale.x = -1;
      group.add(left, right);
      group.scale.setScalar(0.9);
      scene.add(group);
      butterflies.push(group);
    });
  }

  const alive = () => true;
  void alive;

  return {
    clouds,
    trees,
    update: (t, dt) => {
      wind.value = t;
      // clouds drift
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        cloud.position.x += dt * (0.8 + i * 0.15);
        if (cloud.position.x > 260) cloud.position.x = -260;
      }
      // trees sway
      for (let i = 0; i < trees.length; i++) {
        trees[i].rotation.z = Math.sin(t * 0.9 + i) * 0.015;
      }
      // pollen floats
      const geo = pollen.geo;
      if (geo) {
        const attr = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pollen.count; i++) {
          attr.setXYZ(
            i,
            pollen.base[i * 3] + Math.sin(t * 0.3 + i) * 0.6,
            pollen.base[i * 3 + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.35,
            pollen.base[i * 3 + 2] + Math.cos(t * 0.25 + i) * 0.5,
          );
        }
        attr.needsUpdate = true;
      }
      // butterflies loop around the cats
      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        const a = t * (0.35 + i * 0.06) + i * 2;
        b.position.set(Math.cos(a) * (6.5 + i * 1.2), 1.5 + Math.sin(t * 1.7 + i) * 0.45, -1.6 + Math.sin(a * 1.3) * 3.2);
        b.rotation.y = -a;
        const flap = Math.sin(t * 16 + i) * 1;
        const [left, right] = [b.children[0], b.children[1]];
        left.rotation.y = flap;
        right.rotation.y = -flap;
      }
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function addLobbyLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xfff6e8, 0.5));
  // Warm-white sky fill: a blue hemisphere tint desaturated the fur and made
  // the orange cats look beige next to their 3D asset preview.
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0xcfe0a8, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0cf, 3.1);
  sun.position.set(-9, 15, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -6;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const bounce = new THREE.DirectionalLight(0xffeeda, 0.55);
  bounce.position.set(10, 6, -12);
  scene.add(bounce);
}

export function lobbySpacing(count: number) {
  return count > 6 ? 1.06 : 1.24;
}

/**
 * Frame the line-up the way the reference does: the camera sits at the cats'
 * eye level and looks almost level, so the horizon lands behind their heads,
 * the sky fills the top half and the hill curves away underneath.
 */
export function frameLobbyCamera(camera: THREE.PerspectiveCamera, count: number, aspect: number) {
  const spacing = lobbySpacing(count);
  camera.aspect = aspect;
  camera.fov = LOBBY_FOV;
  const halfTan = Math.tan((LOBBY_FOV * Math.PI) / 360);
  const width = ((count - 1) * spacing) / 2 + 0.85;
  const distForWidth = width / (halfTan * aspect);
  // keep enough breathing room above the ears for the name tags
  const distForHeight = 1.62 / halfTan;
  const dist = Math.max(distForWidth, distForHeight);
  camera.position.set(0, 1.62, dist);
  camera.lookAt(0, 1.34, -3);
  camera.updateProjectionMatrix();
}

export interface LobbyActor {
  v: CharacterVisual;
  group: THREE.Group;
  x: number;
  phase: number;
  you: boolean;
  top: number;
  base: number;
  born: number;
}

/** Build one cat for the line-up, posed once so the name tag can be measured. */
export function makeLobbyActor(scene: THREE.Scene, member: LobbyMember, index: number, center: number, spacing: number, born: number): LobbyActor {
  const v = buildCharacterVisual(animalById(member.animal), member.accessory, member.eyeStyle ?? "default", member.expression ?? "default");
  const group = new THREE.Group();
  group.add(...v.all);
  const x = (index - center) * spacing;
  // alternating depth keeps a long row from looking like a flat wall
  const z = member.you ? 0.35 : index % 2 === 0 ? -0.45 : 0;
  const base = member.you ? 1.12 : 1.0;
  group.position.set(x, 0, z);
  group.scale.setScalar(base);
  group.rotation.y = member.you ? 0.08 : x < 0 ? 0.16 : -0.16;
  scene.add(group);
  poseStatic(v, index * 1.37);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return {
    v,
    group,
    x,
    phase: index * 1.37,
    you: !!member.you,
    top: Number.isFinite(box.max.y) && box.max.y > 0.5 ? box.max.y : 1.45,
    base,
    born,
  };
}

/** Remove a cat and free only its own (non-shared) details. */
export function disposeLobbyActor(scene: THREE.Scene, actor: LobbyActor) {
  scene.remove(actor.group);
  disposeCharacterDetails(actor.v.all);
}
