import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/* ================= noise ================= */
function hash(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

/* ================= height functions ================= */
export function hillH(x: number, z: number) {
  const zz = z > 0 ? z * 0.3 : z, xx = x * 0.85;
  const r = Math.hypot(xx, zz);
  const fall = r > 9.5 ? -Math.pow(r - 9.5, 1.7) * 0.18 : 0;
  const mounds = (fbm(x * 0.07 + 3, z * 0.07) - 0.5) * 1.6 * sstep(7, 16, r);
  const ripple = (fbm(x * 0.3, z * 0.3) - 0.5) * 0.25 * sstep(5.5, 10, r);
  return fall + mounds + ripple;
}
const pathX = (z: number) => Math.sin(z * 0.11) * 1.4;
function farH(x: number, z: number) {
  const rise = sstep(25, 150, -z) * 24;
  const roll = (fbm(x * 0.022 + 10, z * 0.022) - 0.45) * 16 * sstep(15, 55, -z);
  const side = sstep(55, 140, Math.abs(x)) * 14;
  return -15 + rise + roll + side;
}

/* ================= sky ================= */
const SUN = new THREE.Vector3(-0.5, 0.32, -0.8).normalize();
function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color("#1e88ff") }, horizon: { value: new THREE.Color("#c4e8ff") },
      sunCol: { value: new THREE.Color("#fff1c9") }, sunDir: { value: SUN },
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
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  return <mesh material={mat} scale={480} renderOrder={-1}><sphereGeometry args={[1, 48, 24]} /></mesh>;
}

/* ================= terrain ================= */
function Hill() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(120, 120, 150, 150); g.rotateX(-Math.PI / 2); g.translate(0, 0, 8);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color("#7fd84a"), top2 = new THREE.Color("#a6e85c"), slope = new THREE.Color("#5cc23e"), deep = new THREE.Color("#46a736");
    const sand = new THREE.Color("#ecd9a6"), sandEdge = new THREE.Color("#c9d983"), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = hillH(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.12, z * 0.12);
      c.copy(top).lerp(top2, sstep(0.45, 0.75, n) * 0.7);
      c.lerp(slope, sstep(-0.5, -4, h)); c.lerp(deep, sstep(-4, -14, h));
      if (z > 2.2) {
        const w = 0.85 + z * 0.02 + (fbm(x * 0.8, z * 0.8) - 0.5) * 0.35;
        const dx = Math.abs(x - pathX(z));
        const k = 1 - sstep(w - 0.25, w + 0.25, dx);
        const e = 1 - sstep(w + 0.1, w + 0.7, dx);
        c.lerp(sandEdge, e * 0.45 * sstep(2.2, 3.5, z)); c.lerp(sand, k * sstep(2.2, 3.5, z));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo} receiveShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>;
}

const FIELD_A = new THREE.Color("#ffd84a"), FIELD_B = new THREE.Color("#ff9ec9");
function FarLand() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(700, 360, 140, 72); g.rotateX(-Math.PI / 2); g.translate(0, 0, -175);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const low = new THREE.Color("#4fb33a"), mid = new THREE.Color("#6cc84a"), high = new THREE.Color("#9ad860"), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = farH(x, z);
      pos.setY(i, h);
      const n = fbm(x * 0.05, z * 0.05);
      c.copy(low).lerp(mid, sstep(-14, -4, h)).lerp(high, sstep(-2, 8, h) * 0.8).lerp(low, sstep(0.55, 0.75, n) * 0.4);
      const fl = fbm(x * 0.04 + 90, z * 0.09);
      if (z > -120 && fl > 0.62) c.lerp(fl > 0.7 ? FIELD_A : FIELD_B, sstep(0.62, 0.68, fl) * 0.85);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo}><meshStandardMaterial vertexColors roughness={1} /></mesh>;
}

function Mountains() {
  const geos = useMemo(() => {
    const list: [number, number, number, number][] = [[-150, -275, 95, 70], [-70, -300, 120, 90], [10, -285, 105, 78], [90, -305, 130, 95], [165, -270, 90, 66], [-230, -250, 80, 60], [240, -260, 85, 62]];
    return list.map(([x, z, r, h], idx) => {
      const g = new THREE.ConeGeometry(r, h, 64, 18, true);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      const rock = new THREE.Color("#6f9fd6"), rock2 = new THREE.Color("#8fb8e6"), snow = new THREE.Color("#ffffff"), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const t = (py + h / 2) / h;
        const a = Math.atan2(pz, px);
        const n = fbm(Math.cos(a) * 2 + idx * 5, t * 3 + Math.sin(a) * 2);
        const k = 1 + (n - 0.5) * 0.55 * (1 - t);
        pos.setXYZ(i, px * k, py + (n - 0.5) * h * 0.12 * (1 - t), pz * k);
        c.copy(rock).lerp(rock2, n);
        c.lerp(snow, sstep(0.6 + (n - 0.5) * 0.25, 0.72 + (n - 0.5) * 0.25, t));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.translate(x, h / 2 - 22, z);
      return g;
    });
  }, []);
  return <>{geos.map((g, i) => <mesh key={i} geometry={g}><meshStandardMaterial vertexColors roughness={1} /></mesh>)}</>;
}

/* ================= vegetation ================= */
function bladeGeo() {
  const g = new THREE.BufferGeometry();
  const segs = 4, w = 0.09, verts: number[] = [], cols: number[] = [], norms: number[] = [], uvs: number[] = [], idx: number[] = [];
  const base = new THREE.Color("#4fae35"), tip = new THREE.Color("#d8ff8f"), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ww = w * (1 - t) * (i === segs ? 0 : 1), bend = t * t * 0.18;
    c.copy(base).lerp(tip, Math.pow(t, 0.8));
    for (const s of [-1, 1]) {
      verts.push(s * ww / 2, t, bend); cols.push(c.r, c.g, c.b); norms.push(0, 1, 0.3); uvs.push(s > 0 ? 1 : 0, t);
    }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function Grass() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const COUNT = 5200;
  const uTime = useRef({ value: 0 });
  const geo = useMemo(bladeGeo, []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime.current;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float wv = sin(uTime * 1.6 + ip.x * 0.32 + ip.z * 0.21) * 0.6 + sin(uTime * 2.7 + ip.x * 0.9 - ip.z * 0.5) * 0.25;
        float hh = position.y * position.y;
        transformed.x += wv * hh * 0.16;
        transformed.z += (wv * 0.5 + 0.2) * hh * 0.1;`);
    };
    return m;
  }, []);
  useEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    let i = 0, guard = 0;
    while (i < COUNT && guard++ < COUNT * 6) {
      const x = (rnd() * 2 - 1) * 18, z = -9 + rnd() * 18;
      const h = hillH(x, z);
      if (h < -3) continue;
      if (z > 2.2 && Math.abs(x - pathX(z)) < 0.95 + z * 0.02) continue;
      const stage = Math.abs(x) < 7.4 && z > -1.4 && z < 1.6;
      if (stage && rnd() < 0.8) continue;
      const s = 0.8 + rnd() * 0.6, ht = (stage ? 0.12 : 0.16) + rnd() * (stage ? 0.06 : 0.14);
      o.position.set(x, h - 0.02, z); o.rotation.set(0, rnd() * Math.PI * 2, 0); o.scale.set(s, ht, s); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
      ref.current.setColorAt(i, c.setHSL(0.26 + (rnd() - 0.5) * 0.05, 0.6, 0.95 + rnd() * 0.05));
      i++;
    }
    ref.current.count = i;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => { uTime.current.value = clock.getElapsedTime(); });
  return <instancedMesh ref={ref} args={[geo, mat, COUNT]} frustumCulled={false} />;
}

function Flowers() {
  const petals = useRef<THREE.InstancedMesh>(null!), centers = useRef<THREE.InstancedMesh>(null!), stems = useRef<THREE.InstancedMesh>(null!);
  const N = 420;
  const petalGeo = useMemo(() => {
    const s = new THREE.Shape(), P = 6;
    for (let i = 0; i <= P * 8; i++) {
      const a = (i / (P * 8)) * Math.PI * 2, r = 0.55 + 0.45 * Math.abs(Math.cos((a * P) / 2));
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g;
  }, []);
  useEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    const cols = ["#ffffff", "#ffe14d", "#ff7eb6", "#ffffff", "#b98cff", "#ff9f43", "#ff5e7a"];
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 10) {
      const x = (rnd() * 2 - 1) * 17, z = -7 + rnd() * 22;
      const h = hillH(x, z);
      if (h < -2.5) continue;
      if (z > 2.2 && Math.abs(x - pathX(z)) < 1.4 + z * 0.02) continue;
      if (Math.abs(x) < 7.6 && z > -1.6 && z < 1.8) continue;
      const s = 0.08 + rnd() * 0.05, sh = 0.12 + rnd() * 0.1;
      o.position.set(x, h + sh, z); o.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4); o.scale.setScalar(s); o.updateMatrix();
      petals.current.setMatrixAt(i, o.matrix); petals.current.setColorAt(i, c.set(cols[i % cols.length]));
      o.position.y += 0.008; o.scale.setScalar(s * 0.42); o.updateMatrix(); centers.current.setMatrixAt(i, o.matrix);
      o.position.set(x, h + sh / 2, z); o.rotation.set(0, 0, 0); o.scale.set(1, sh, 1); o.updateMatrix(); stems.current.setMatrixAt(i, o.matrix);
      i++;
    }
    [petals, centers, stems].forEach((m) => { m.current.count = i; m.current.instanceMatrix.needsUpdate = true; if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true; });
  }, []);
  return (
    <>
      <instancedMesh ref={petals} args={[petalGeo, undefined, N]}><meshStandardMaterial side={THREE.DoubleSide} roughness={0.6} /></instancedMesh>
      <instancedMesh ref={centers} args={[undefined, undefined, N]}><sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial color="#ffb21a" roughness={0.5} /></instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, N]}><cylinderGeometry args={[0.008, 0.01, 1, 4]} /><meshStandardMaterial color="#4f9a37" /></instancedMesh>
    </>
  );
}

function Tree({ x, z, s = 1, hue = 0 }: { x: number; z: number; s?: number; hue?: number }) {
  const y = hillH(x, z) - 0.1;
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { g.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.9 + x) * 0.015; });
  const shades = useMemo(() => {
    const base = new THREE.Color().setHSL(0.28 + hue * 0.02, 0.55, 0.42);
    return [base.clone().offsetHSL(0, 0, -0.07), base, base.clone().offsetHSL(0.01, 0.02, 0.07), base.clone().offsetHSL(0.015, 0.03, 0.13)];
  }, [hue]);
  const puffs: [number, number, number, number, number][] = [[0, 2.5, 0, 1.25, 1], [0.95, 2.2, 0.2, 0.9, 0], [-0.9, 2.3, -0.1, 0.95, 0], [0.2, 3.25, 0.15, 0.85, 2], [-0.35, 2.9, 0.65, 0.75, 3], [0.5, 2.75, -0.6, 0.8, 1]];
  return (
    <group position={[x, y, z]} scale={s}>
      <group ref={g}>
        <mesh position={[0, 1.0, 0]} castShadow><cylinderGeometry args={[0.16, 0.26, 2.1, 12]} /><meshStandardMaterial color="#8b5a35" roughness={0.9} /></mesh>
        <mesh position={[0.32, 1.6, 0]} rotation-z={-0.7} castShadow><cylinderGeometry args={[0.06, 0.09, 0.8, 8]} /><meshStandardMaterial color="#8b5a35" /></mesh>
        {puffs.map(([px, py, pz, r, k], i) => (
          <mesh key={i} position={[px, py, pz]} castShadow><sphereGeometry args={[r, 24, 18]} /><meshStandardMaterial color={shades[k]} roughness={0.85} /></mesh>
        ))}
      </group>
    </group>
  );
}

function Bush({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  const y = hillH(x, z);
  return (
    <group position={[x, y, z]} scale={s}>
      {[[0, 0.35, 0, 0.55, "#5bb243"], [0.5, 0.28, 0.1, 0.42, "#6cc04f"], [-0.45, 0.26, 0.05, 0.4, "#4fa53b"], [0.1, 0.55, 0.15, 0.35, "#7acb59"]].map(([px, py, pz, r, c], i) => (
        <mesh key={i} position={[px as number, py as number, pz as number]} castShadow><sphereGeometry args={[r as number, 20, 14]} /><meshStandardMaterial color={c as string} roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

function Rock({ x, z, s = 1, r = 0 }: { x: number; z: number; s?: number; r?: number }) {
  return (
    <mesh position={[x, hillH(x, z) + 0.08 * s, z]} rotation={[0.2, r, 0.1]} scale={[s * 1.3, s * 0.7, s]} castShadow receiveShadow>
      <icosahedronGeometry args={[0.35, 2]} /><meshStandardMaterial color="#b9b4aa" roughness={0.9} />
    </mesh>
  );
}

function FarTrees() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const N = 180;
  useEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 20) {
      const x = (rnd() * 2 - 1) * 170, z = -55 - rnd() * 110;
      const n = fbm(x * 0.03 + 50, z * 0.03);
      if (n < 0.5) continue;
      const s = 1.2 + rnd() * 1.1;
      o.position.set(x, farH(x, z) + s * 0.7, z); o.rotation.set(0, rnd() * 6, 0); o.scale.set(s, s * 0.9, s); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix); ref.current.setColorAt(i, c.setHSL(0.3 + (rnd() - 0.5) * 0.05, 0.6, 0.36 + rnd() * 0.1));
      i++;
    }
    ref.current.count = i; ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[undefined, undefined, N]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial roughness={0.9} /></instancedMesh>;
}

function Windmill({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  const blades = useRef<THREE.Group>(null!);
  useFrame((_, dt) => { blades.current.rotation.z += dt * 0.7; });
  return (
    <group position={[x, farH(x, z) - 0.5, z]} scale={s} rotation-y={0.4}>
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[0.65, 1.05, 4.4, 20]} /><meshStandardMaterial color="#fff8ec" roughness={0.8} /></mesh>
      <mesh position={[0, 4.85, 0]}><coneGeometry args={[0.9, 1.1, 20]} /><meshStandardMaterial color="#e25a3c" roughness={0.7} /></mesh>
      <mesh position={[0, 1.0, 0.98]}><boxGeometry args={[0.45, 0.8, 0.1]} /><meshStandardMaterial color="#8b5a35" /></mesh>
      <group ref={blades} position={[0, 3.9, 0.85]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation-z={(i * Math.PI) / 2}>
            <mesh position={[0, 1.15, 0]}><boxGeometry args={[0.06, 2.3, 0.06]} /><meshStandardMaterial color="#8b5a35" /></mesh>
            <mesh position={[0.2, 1.3, 0]}><boxGeometry args={[0.4, 1.8, 0.03]} /><meshStandardMaterial color="#fbecd2" /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Fence() {
  const posts = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (1.13 + (i / 14) * 0.74);
      const x = Math.cos(a) * 9.4, z = 0.6 + Math.sin(a) * 5.2;
      out.push([x, hillH(x, z), z]);
    }
    return out;
  }, []);
  const wood = <meshStandardMaterial color="#c99158" roughness={0.75} />;
  return (
    <group>
      {posts.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.07, 0.08, 1.0, 10]} />{wood}</mesh>
          <mesh position={[0, 1.02, 0]}><sphereGeometry args={[0.08, 10, 8]} />{wood}</mesh>
        </group>
      ))}
      {[0.42, 0.78].map((ry) => posts.slice(0, -1).map(([x, y, z], i) => {
        const [x2, y2, z2] = posts[i + 1];
        const len = Math.hypot(x2 - x, z2 - z, y2 - y);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(x2 - x, y2 - y, z2 - z).normalize());
        return <mesh key={ry + "_" + i} position={[(x + x2) / 2, (y + y2) / 2 + ry, (z + z2) / 2]} quaternion={q} castShadow><boxGeometry args={[len, 0.07, 0.05]} />{wood}</mesh>;
      }))}
    </group>
  );
}

function Clouds() {
  const g = useRef<THREE.Group>(null!);
  const list = useMemo(() => [[-120, 48, -200, 2.2], [-40, 58, -230, 2.8], [50, 44, -190, 2.0], [140, 55, -220, 2.6], [-200, 50, -180, 2.1], [0, 36, -150, 1.4], [95, 34, -140, 1.2]] as const, []);
  useFrame((_, dt) => { g.current.children.forEach((c, i) => { c.position.x += dt * (0.8 + i * 0.15); if (c.position.x > 260) c.position.x = -260; }); });
  const puffs: [number, number, number, number][] = [[0, 0, 0, 5], [5.2, -0.8, 0.5, 3.8], [-5.2, -0.8, -0.3, 3.9], [2.2, 2.4, 0, 3.6], [-2.4, 1.8, 0.4, 3.2], [8.5, -1.6, 0, 2.6], [-8.4, -1.7, 0, 2.5]];
  return (
    <group ref={g}>
      {list.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={[s, s * 0.85, s]}>
          {puffs.map(([cx, cy, cz, cr], k) => (
            <mesh key={k} position={[cx, cy, cz]}><sphereGeometry args={[cr, 20, 14]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.75} roughness={1} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Pollen() {
  const ref = useRef<THREE.Points>(null!);
  const N = 140;
  const { geo, base, tex } = useMemo(() => {
    const p = new Float32Array(N * 3), b = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { b[i * 3] = (rnd() * 2 - 1) * 15; b[i * 3 + 1] = 0.4 + rnd() * 4.5; b[i * 3 + 2] = -6 + rnd() * 16; }
    p.set(b);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,250,210,.6)"); gr.addColorStop(1, "rgba(255,250,210,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return { geo: g, base: b, tex: new THREE.CanvasTexture(c) };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime(), a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      a.setXYZ(i, base[i * 3] + Math.sin(t * 0.3 + i) * 0.6, base[i * 3 + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.35, base[i * 3 + 2] + Math.cos(t * 0.25 + i) * 0.5);
    }
    a.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial map={tex} size={0.16} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} color="#fff6c4" />
    </points>
  );
}

function Butterflies() {
  const refs = useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((b, i) => {
      if (!b) return;
      const a = t * (0.35 + i * 0.06) + i * 2;
      b.position.set(Math.cos(a) * (8 + i * 1.3), 1.4 + Math.sin(t * 1.7 + i) * 0.45, -1.5 + Math.sin(a * 1.3) * 3.5);
      b.rotation.y = -a;
      const w = Math.sin(t * 16 + i) * 1.0;
      (b.children[0] as THREE.Mesh).rotation.y = w; (b.children[1] as THREE.Mesh).rotation.y = -w;
    });
  });
  const wing = useMemo(() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.05, 0.16, 0.22, 0.14, 0.2, 0.02); s.bezierCurveTo(0.22, -0.08, 0.08, -0.12, 0, 0); return new THREE.ShapeGeometry(s); }, []);
  return (
    <>
      {["#ffb703", "#ff7ab8", "#7dd3fc", "#ffffff", "#c4a1ff"].map((c, i) => (
        <group key={c} ref={(el) => { if (el) refs.current[i] = el; }} scale={0.9}>
          <mesh geometry={wing}><meshStandardMaterial color={c} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={wing} scale={[-1, 1, 1]}><meshStandardMaterial color={c} side={THREE.DoubleSide} /></mesh>
        </group>
      ))}
    </>
  );
}

/* ================= scene ================= */
export function HillScene() {
  return (
    <>
      <color attach="background" args={["#8fd0ff"]} />
      <fog attach="fog" args={["#cfeaff", 120, 560]} />
      <ambientLight intensity={0.5} color="#fff6e8" />
      <hemisphereLight args={["#bfe4ff", "#7fc95a", 1.1]} />
      <directionalLight position={[-9, 15, 10]} intensity={3.1} color="#fff0cf" castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={9} shadow-camera-bottom={-6} shadow-bias={-0.0004} shadow-normalBias={0.03} />
      <directionalLight position={[10, 6, -12]} intensity={0.6} color="#bfe0ff" />
      <Sky />
      <Clouds />
      <Mountains />
      <FarLand />
      <FarTrees />
      <Windmill x={36} z={-72} s={2.1} />
      <Windmill x={-58} z={-95} s={1.8} />
      <Hill />
      <Grass />
      <Flowers />
      <Fence />
      <Tree x={-11.2} z={-2.6} s={1.35} hue={0} />
      <Tree x={-13.6} z={-7} s={1.15} hue={2} />
      <Tree x={11.6} z={-3.4} s={1.3} hue={1} />
      <Tree x={14} z={-8.5} s={1.05} hue={3} />
      <Bush x={-8.8} z={1.6} s={1.0} />
      <Bush x={9.2} z={1.2} s={0.9} />
      <Bush x={-9.6} z={-3.6} s={0.8} />
      <Bush x={9.8} z={-4.2} s={0.85} />
      <Rock x={2.6} z={5.2} s={0.8} r={0.5} />
      <Rock x={-2.4} z={7.4} s={1.1} r={1.8} />
      <Rock x={3.4} z={9.6} s={0.6} r={2.6} />
      <Rock x={-8.2} z={3.4} s={0.7} r={0.9} />
      <Pollen />
      <Butterflies />
    </>
  );
}
