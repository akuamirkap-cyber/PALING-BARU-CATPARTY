import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAUSTIC_GLSL } from './noise';
import { LAYER, setLayer } from '../layers';
import { addPalm, emptyPalmParts } from '../../shared/palm';
import { merge } from '../../ship/geom';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const smax = (a: number, b: number, k: number) => {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return a + (b - a) * h + k * h * (1 - h);
};

function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export interface IslandDef {
  x: number;
  z: number;
  land: number;
  beach: number;
  slope: number;
  top: number;
  palms: number;
  lighthouse?: boolean;
  seed: number;
}

export const ISLANDS: IslandDef[] = [
  { x: -180, z: -155, land: 24, beach: 10, slope: 30, top: 3.4, palms: 9, lighthouse: true, seed: 1 },
  { x: -66, z: -118, land: 8, beach: 7, slope: 22, top: 1.7, palms: 5, seed: 2 },
  { x: 122, z: -58, land: 4.5, beach: 6, slope: 18, top: 1.1, palms: 2, seed: 3 },
  { x: 210, z: 112, land: 19, beach: 9, slope: 26, top: 2.8, palms: 7, seed: 4 },
];

/** Ketinggian dasar laguna (Y), termasuk pulau-pulau yang muncul di atas air. */
export function seabedHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h = -7.5 - 7.5 * smoothstep(40, 160, r) - 26 * smoothstep(160, 380, r);
  h += Math.sin(x * 0.043 + 1.3) * Math.cos(z * 0.037) * 1.1 + Math.sin((x - z) * 0.019) * 1.4;
  h += Math.sin(x * 0.82 + Math.sin(z * 0.21) * 2.2) * 0.07;
  for (const is of ISLANDS) {
    const d = Math.hypot(x - is.x, z - is.z);
    let ih: number;
    if (d < is.land) ih = is.top - Math.pow(d / is.land, 2) * (is.top - 0.9);
    else if (d < is.land + is.beach) ih = 0.9 - ((d - is.land) / is.beach) * 1.6;
    else ih = -0.7 - smoothstep(0, 1, (d - is.land - is.beach) / is.slope) * 24;
    h = smax(h, ih, 2.5);
  }
  return h;
}

/** Grid polar (rapat di tengah, renggang di tepi). */
export function polarGrid(radius: number, rings: number, segs: number, power = 2, cx = 0, cz = 0) {
  const pos: number[] = [cx, 0, cz];
  for (let i = 1; i <= rings; i++) {
    const r = radius * Math.pow(i / rings, power);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
    }
  }
  const idx: number[] = [];
  const ring = (i: number, j: number) => 1 + (i - 1) * segs + (((j % segs) + segs) % segs);
  for (let j = 0; j < segs; j++) idx.push(0, ring(1, j + 1), ring(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ring(i, j);
      const b = ring(i, j + 1);
      const c = ring(i + 1, j);
      const d = ring(i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/* ------------------------- Material kaustik ------------------------- */
export interface CausticUniforms {
  uTime: { value: number };
  uCaustic: { value: number };
  uSunColor: { value: THREE.Color };
}

export function applyCaustics(mat: THREE.MeshStandardMaterial, u: CausticUniforms, key: string) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uCaustic = u.uCaustic;
    shader.uniforms.uSunColor = u.uSunColor;
    shader.vertexShader =
      'varying vec3 vSeaWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader =
      'uniform float uTime;\nuniform float uCaustic;\nuniform vec3 uSunColor;\nvarying vec3 vSeaWorld;\n' +
      CAUSTIC_GLSL +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
          float under = smoothstep(0.4, -0.5, vSeaWorld.y);
          float fade = exp(max(vSeaWorld.y, -45.0) * 0.06);
          float c1 = causticPattern(vSeaWorld.xz * 0.085, uTime * 0.55);
          float c2 = causticPattern(vSeaWorld.xz * 0.155 + vec2(3.7, 1.3), uTime * 0.72);
          float lit = smoothstep(0.01, 0.18, dot(reflectedLight.directDiffuse, vec3(0.3333)));
          outgoingLight += diffuseColor.rgb * uSunColor * (c1 * 0.7 + c2 * 0.45) * uCaustic * under * fade * lit;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => key;
}

/* ----------------------- Penggabung warna verteks ----------------------- */
function mergeColored(items: { geo: THREE.BufferGeometry; color: string }[]) {
  const c = new THREE.Color();
  const list = items.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    c.set(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  return mergeGeometries(list, false) ?? new THREE.BufferGeometry();
}

/* ------------------------------ Dasar laut ------------------------------ */
export function buildSeabed(u: CausticUniforms) {
  const geo = polarGrid(720, 160, 220, 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const sandA = new THREE.Color('#f3e5bd');
  const sandB = new THREE.Color('#d9c291');
  const grass = new THREE.Color('#5a8a4a');
  const deep = new THREE.Color('#b7a684');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = seabedHeight(x, z);
    pos.setY(i, h);
    const n1 = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 - x * 0.03);
    const n2 = Math.sin(x * 0.031 + 2.1) * Math.sin(z * 0.027 + 0.7);
    tmp.copy(sandA).lerp(sandB, 0.5 + 0.5 * n1);
    if (n2 > 0.35 && h < -4 && h > -20) tmp.lerp(grass, smoothstep(0.35, 0.7, n2) * 0.85);
    tmp.lerp(deep, smoothstep(-15, -40, h));
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.name = 'Seabed_Sand';
  applyCaustics(mat, u, 'seabed-caustics-v1');
  const seabed = new THREE.Mesh(geo, mat);
  seabed.name = 'Seabed';
  seabed.receiveShadow = true;
  seabed.frustumCulled = false;
  setLayer(seabed, LAYER.UNDERWATER);

  /* Karang, batu, bintang laut & rumput laut */
  const r = rng(77);
  const items: { geo: THREE.BufferGeometry; color: string }[] = [];
  const coralColors = ['#ff7aa2', '#ff9f43', '#c084fc', '#fde047', '#f87171', '#34d399', '#60a5fa', '#fb7185'];
  const place = (minR: number, maxR: number) => {
    const a = r() * Math.PI * 2;
    const rad = minR + Math.sqrt(r()) * (maxR - minR);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    return { x, z, y: seabedHeight(x, z) };
  };
  for (let i = 0; i < 150; i++) {
    const p = place(10, 105);
    const color = coralColors[Math.floor(r() * coralColors.length)];
    const kind = r();
    if (kind < 0.4) {
      const s = 0.5 + r() * 1.1;
      const g = new THREE.IcosahedronGeometry(s, 1);
      g.scale(1, 0.62, 1);
      g.translate(p.x, p.y + s * 0.3, p.z);
      items.push({ geo: g, color });
    } else if (kind < 0.75) {
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const h = 0.8 + r() * 1.6;
        const g = new THREE.ConeGeometry(0.14, h, 5);
        g.translate(0, h / 2, 0);
        g.rotateZ((r() - 0.5) * 1.1);
        g.rotateY(r() * Math.PI * 2);
        g.translate(p.x + (r() - 0.5) * 0.6, p.y, p.z + (r() - 0.5) * 0.6);
        items.push({ geo: g, color });
      }
    } else {
      const s = 0.8 + r() * 0.9;
      const g = new THREE.CircleGeometry(s, 7);
      g.scale(1, 0.85, 1);
      g.rotateY(r() * Math.PI);
      g.translate(p.x, p.y + s * 0.8, p.z);
      items.push({ geo: g, color: '#a855f7' });
      const g2 = g.clone();
      g2.rotateY(Math.PI);
      items.push({ geo: g2, color: '#a855f7' });
    }
  }
  for (let i = 0; i < 70; i++) {
    const p = place(8, 130);
    const s = 0.4 + r() * 1.4;
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1.3, 0.7, 1);
    g.rotateY(r() * 3);
    g.translate(p.x, p.y + s * 0.2, p.z);
    items.push({ geo: g, color: r() > 0.5 ? '#8a8577' : '#6f6a5f' });
  }
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const rr = k % 2 ? 0.12 : 0.36;
    if (k === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  for (let i = 0; i < 45; i++) {
    const p = place(6, 80);
    const g = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.rotateY(r() * 6);
    g.translate(p.x, p.y + 0.08, p.z);
    items.push({ geo: g, color: r() > 0.5 ? '#ff7849' : '#ffb703' });
  }
  for (let i = 0; i < 90; i++) {
    const p = place(12, 100);
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const h = 1.2 + r() * 2.4;
      const g = new THREE.ConeGeometry(0.09, h, 4);
      g.translate(0, h / 2, 0);
      g.rotateZ((r() - 0.5) * 0.5);
      g.translate(p.x + (r() - 0.5) * 0.8, p.y, p.z + (r() - 0.5) * 0.8);
      items.push({ geo: g, color: r() > 0.5 ? '#3f8f4f' : '#5aa35a' });
    }
  }
  const decorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  decorMat.name = 'Reef_Decor';
  applyCaustics(decorMat, u, 'reef-caustics-v1');
  const decor = new THREE.Mesh(mergeColored(items), decorMat);
  decor.name = 'Reef';
  decor.receiveShadow = true;
  setLayer(decor, LAYER.UNDERWATER);

  return { seabed, decor };
}

/* -------------------------------- Ikan -------------------------------- */
export function buildFish(radius: number) {
  const body = new THREE.SphereGeometry(0.22, 8, 6);
  body.scale(2.2, 1, 0.5);
  const tail = new THREE.ConeGeometry(0.2, 0.36, 4);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.25);
  tail.translate(-0.62, 0, 0);
  const geo = merge([body, tail]);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 });
  mat.name = 'Fish';
  const schools = [
    { n: 34, r: radius, depth: -3.6, speed: 0.11, color: ['#ffd60a', '#ffc300'] },
    { n: 30, r: radius + 14, depth: -4.8, speed: -0.075, color: ['#4cc9f0', '#4361ee'] },
    { n: 26, r: radius * 0.75 + 6, depth: -5.4, speed: 0.09, color: ['#ff8fab', '#ff5d8f'] },
  ];
  const total = schools.reduce((s, x) => s + x.n, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.name = 'FishSchools';
  mesh.frustumCulled = false;
  const offsets: { s: number; o: THREE.Vector3; ph: number }[] = [];
  const r = rng(5);
  const c = new THREE.Color();
  let k = 0;
  schools.forEach((sc, si) => {
    for (let i = 0; i < sc.n; i++) {
      offsets.push({ s: si, o: new THREE.Vector3((r() - 0.5) * 7, (r() - 0.5) * 2.2, (r() - 0.5) * 7), ph: r() * 6.28 });
      mesh.setColorAt(k++, c.set(sc.color[i % 2]));
    }
  });
  setLayer(mesh, LAYER.UNDERWATER);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const update = (t: number) => {
    offsets.forEach((f, i) => {
      const sc = schools[f.s];
      const ang = t * sc.speed + f.s * 2.1 + Math.sin(t * 0.13 + f.s) * 0.2;
      const cx = Math.cos(ang) * sc.r;
      const cz = Math.sin(ang) * sc.r;
      const dir = Math.sign(sc.speed);
      const dx = -Math.sin(ang) * dir;
      const dz = Math.cos(ang) * dir;
      const yaw = Math.atan2(-dz, dx);
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const ox = f.o.x * cos + f.o.z * sin;
      const oz = -f.o.x * sin + f.o.z * cos;
      p.set(cx + ox + Math.sin(t * 1.3 + f.ph) * 0.3, sc.depth + f.o.y + Math.sin(t * 0.9 + f.ph) * 0.25, cz + oz);
      q.setFromEuler(e.set(0, yaw + Math.sin(t * 7 + f.ph) * 0.18, 0));
      m4.compose(p, q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

/* ------------------------------ Pulau tropis ------------------------------ */
export function buildIslands() {
  const group = new THREE.Group();
  group.name = 'Islands';
  const sand = new THREE.Color('#f4e4b4');
  const wet = new THREE.Color('#d6c08a');
  const grassA = new THREE.Color('#6cbc4e');
  const grassB = new THREE.Color('#4c9a3a');
  const tmp = new THREE.Color();
  const palms = emptyPalmParts();
  const rocks: THREE.BufferGeometry[] = [];
  const beams: THREE.Object3D[] = [];
  const lamps: THREE.MeshStandardMaterial[] = [];
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  groundMat.name = 'Island_Ground';

  for (const is of ISLANDS) {
    const R = is.land + is.beach + 6;
    const geo = polarGrid(R, 30, 72, 1, is.x, is.z);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = Math.max(seabedHeight(x, z), -1.6);
      pos.setY(i, h);
      const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.25;
      if (h > 1.05 + n) tmp.copy(grassA).lerp(grassB, 0.5 + Math.sin(x * 0.3 + z * 0.2) * 0.5);
      else if (h > 0.25) tmp.copy(sand);
      else tmp.copy(wet);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, groundMat);
    m.name = 'Island';
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);

    const r = rng(is.seed * 13);
    for (let k = 0; k < is.palms; k++) {
      const a = r() * Math.PI * 2;
      const d = (is.lighthouse ? 0.35 : 0) * is.land + r() * is.land * (is.lighthouse ? 0.5 : 0.75);
      const x = is.x + Math.cos(a) * d;
      const z = is.z + Math.sin(a) * d;
      addPalm(palms, x, seabedHeight(x, z) - 0.1, z, 5 + r() * 3, 1.2 + r() * 1.8, a + (r() - 0.5), is.seed + k);
    }
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      const d = is.land + r() * is.beach * 0.8;
      const x = is.x + Math.cos(a) * d;
      const z = is.z + Math.sin(a) * d;
      const s = 0.6 + r() * 1.2;
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1.3, 0.75, 1);
      g.translate(x, seabedHeight(x, z) + s * 0.25, z);
      rocks.push(g);
    }

    if (is.lighthouse) {
      const lh = new THREE.Group();
      lh.name = 'Lighthouse';
      lh.position.set(is.x, is.top - 0.2, is.z);
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(1.7 - (i + 1) * 0.2, 1.7 - i * 0.2, 2.6, 14),
          new THREE.MeshStandardMaterial({ color: i % 2 ? '#f4f1ea' : '#d62828', roughness: 0.6 }),
        );
        seg.position.y = 1.3 + i * 2.6;
        seg.castShadow = true;
        lh.add(seg);
      }
      const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffd36b', emissiveIntensity: 0.6 });
      lamps.push(lampMat);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.4, 12), lampMat);
      lamp.position.y = 13.7;
      lh.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.3, 12), new THREE.MeshStandardMaterial({ color: '#26303b' }));
      cap.position.y = 15.05;
      lh.add(cap);
      const beam = new THREE.Group();
      beam.position.y = 13.7;
      for (const s of [1, -1]) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(7, 80, 18, 1, true),
          new THREE.MeshBasicMaterial({
            color: '#fff2b0',
            transparent: true,
            opacity: 0.09,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        cone.rotation.z = (s * Math.PI) / 2;
        cone.position.x = s * 40;
        beam.add(cone);
      }
      beam.visible = false;
      lh.add(beam);
      beams.push(beam);
      group.add(lh);
    }
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#9c7a52', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f9b46', roughness: 0.8, side: THREE.DoubleSide });
  const nutMat = new THREE.MeshStandardMaterial({ color: '#6b4f2a', roughness: 0.7 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8a80', roughness: 1, flatShading: true });
  for (const [name, geos, mat] of [
    ['Palm_Trunks', palms.trunk, trunkMat],
    ['Palm_Leaves', palms.leaves, leafMat],
    ['Palm_Nuts', palms.nuts, nutMat],
    ['Beach_Rocks', rocks, rockMat],
  ] as [string, THREE.BufferGeometry[], THREE.Material][]) {
    const m = new THREE.Mesh(merge(geos), mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  setLayer(group, LAYER.ABOVE);
  return { group, beams, lamps };
}
