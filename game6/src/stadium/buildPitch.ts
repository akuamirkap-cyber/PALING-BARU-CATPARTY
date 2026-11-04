import * as THREE from 'three';
import { ST } from './dims';
import { box, merge, rod, v3, type Geo } from '../ship/geom';
import type { StadiumMaterials } from './materials';

function mesh(name: string, geo: Geo, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}
function grp(name: string) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/** Quad planar dengan UV proyeksi (untuk jaring). */
function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, tile: number): Geo {
  const e1 = new THREE.Vector3().subVectors(b, a).normalize();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1);
  const pts = [a, b, c, a, c, d];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const p of pts) {
    pos.push(p.x, p.y, p.z);
    const r = new THREE.Vector3().subVectors(p, a);
    uv.push(r.dot(e1) / tile, r.dot(e2) / tile);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Cangkang lengkung (atap dugout / terowongan tiup). */
export function shell(axis: 'x' | 'z', cx: number, cy: number, cz: number, r: number, a0: number, a1: number, len: number, segs = 14): Geo {
  const pos: number[] = [];
  const uv: number[] = [];
  const P = (a: number, s: number) =>
    axis === 'x' ? v3(cx + s, cy + r * Math.sin(a), cz + r * Math.cos(a)) : v3(cx + r * Math.cos(a), cy + r * Math.sin(a), cz + s);
  for (let i = 0; i < segs; i++) {
    const aa = a0 + ((a1 - a0) * i) / segs;
    const ab = a0 + ((a1 - a0) * (i + 1)) / segs;
    const p1 = P(aa, -len / 2);
    const p2 = P(ab, -len / 2);
    const p3 = P(ab, len / 2);
    const p4 = P(aa, len / 2);
    for (const p of [p1, p2, p3, p1, p3, p4]) pos.push(p.x, p.y, p.z);
    uv.push(0, i / segs, 0, (i + 1) / segs, 1, (i + 1) / segs, 0, i / segs, 1, (i + 1) / segs, 1, i / segs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function flat(g: Geo, y: number) {
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function strip(x0: number, z0: number, x1: number, z1: number, w: number, y: number): Geo {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len + w, w);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

function ring(cx: number, cz: number, r: number, w: number, y: number, start = 0, len = Math.PI * 2): Geo {
  const g = new THREE.RingGeometry(r - w / 2, r + w / 2, 56, 1, start, len);
  flat(g, y);
  g.translate(cx, 0, cz);
  return g;
}

function buildLines(): Geo {
  const y = ST.pitchY + 0.004;
  const w = 0.12;
  const X = ST.pitchHX;
  const Z = ST.pitchHZ;
  const L: Geo[] = [
    strip(-X, -Z, X, -Z, w, y),
    strip(-X, Z, X, Z, w, y),
    strip(-X, -Z, -X, Z, w, y),
    strip(X, -Z, X, Z, w, y),
    strip(0, -Z, 0, Z, w, y),
    ring(0, 0, 3.5, w, y),
  ];
  const spot = (x: number) => {
    const g = new THREE.CircleGeometry(0.17, 16);
    flat(g, y);
    g.translate(x, 0, 0);
    return g;
  };
  L.push(spot(0));
  for (const s of [1, -1]) {
    const pa = s * (X - 6.3);
    const ga = s * (X - 2.1);
    L.push(strip(pa, -7.7, pa, 7.7, w, y), strip(pa, -7.7, s * X, -7.7, w, y), strip(pa, 7.7, s * X, 7.7, w, y));
    L.push(strip(ga, -3.5, ga, 3.5, w, y), strip(ga, -3.5, s * X, -3.5, w, y), strip(ga, 3.5, s * X, 3.5, w, y));
    const ps = s * (X - 4.2);
    L.push(spot(ps));
    const half = Math.acos(0.6);
    L.push(ring(ps, 0, 3.5, w, y, s > 0 ? Math.PI - half : -half, 2 * half));
  }
  const corners: [number, number, number][] = [
    [X, Z, Math.PI / 2],
    [X, -Z, Math.PI],
    [-X, Z, 0],
    [-X, -Z, Math.PI * 1.5],
  ];
  for (const [cx, cz, a] of corners) L.push(ring(cx, cz, 0.6, w, y, a, Math.PI / 2));
  return merge(L);
}

function buildGoals(M: StadiumMaterials) {
  const g = grp('Goals');
  const frame: Geo[] = [];
  const nets: Geo[] = [];
  const y0 = ST.pitchY;
  const H = ST.goalH;
  const W2 = ST.goalW / 2;
  for (const s of [1, -1]) {
    const X = s * ST.pitchHX;
    const tb = X + s * ST.goalD * 0.55;
    const gb = X + s * ST.goalD;
    const yt = y0 + H * 0.9;
    for (const z of [-W2, W2]) frame.push(rod(v3(X, y0, z), v3(X, y0 + H, z), 0.075, 12));
    frame.push(rod(v3(X, y0 + H, -W2 - 0.07), v3(X, y0 + H, W2 + 0.07), 0.075, 12));
    frame.push(rod(v3(tb, yt, -W2), v3(tb, yt, W2), 0.045, 8));
    frame.push(rod(v3(gb, y0 + 0.04, -W2), v3(gb, y0 + 0.04, W2), 0.045, 8));
    for (const z of [-W2, W2]) {
      frame.push(rod(v3(X, y0 + H, z), v3(tb, yt, z), 0.04, 8));
      frame.push(rod(v3(tb, yt, z), v3(gb, y0 + 0.04, z), 0.04, 8));
      frame.push(rod(v3(X, y0 + 0.04, z), v3(gb, y0 + 0.04, z), 0.04, 8));
      nets.push(quad(v3(X, y0, z), v3(X, y0 + H, z), v3(tb, yt, z), v3(gb, y0, z), 0.32));
    }
    nets.push(quad(v3(tb, yt, -W2), v3(tb, yt, W2), v3(gb, y0, W2), v3(gb, y0, -W2), 0.32));
    nets.push(quad(v3(X, y0 + H, -W2), v3(X, y0 + H, W2), v3(tb, yt, W2), v3(tb, yt, -W2), 0.32));
  }
  g.add(mesh('Goal_Frames', merge(frame), M.goalFrame));
  const net = mesh('Goal_Nets', merge(nets), M.net);
  net.castShadow = false;
  g.add(net);
  return g;
}

function buildAdBoards(M: StadiumMaterials) {
  const g = grp('AdBoards');
  const frames: Geo[] = [];
  const faces: Geo[] = [];
  let uOff = 0;
  const board = (cx: number, cz: number, len: number, yaw: number) => {
    const f = new THREE.BoxGeometry(len, 1.0, 0.2);
    f.translate(0, 0.5, -0.11);
    const face = new THREE.PlaneGeometry(len - 0.12, 0.86);
    face.translate(0, 0.5, 0.0);
    const uv = face.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uOff + uv.getX(i) * (len / 13.6));
    uOff += len / 13.6;
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(-0.1));
    m.setPosition(cx, ST.pitchY, cz);
    f.applyMatrix4(m);
    face.applyMatrix4(m);
    frames.push(f);
    faces.push(face);
  };
  for (let k = 0; k < 6; k++) board(-19.5 + 6.5 * k + 3.25, 15.2, 6.3, Math.PI);
  for (const [a, b] of [
    [-19.5, -1.7],
    [1.7, 19.5],
  ]) {
    const n = 3;
    const len = (b - a) / n;
    for (let k = 0; k < n; k++) board(a + len * k + len / 2, -15.2, len - 0.2, 0);
  }
  for (const s of [1, -1]) {
    for (let k = 0; k < 4; k++) board(s * 23.3, -11.5 + 5.75 * k + 2.875, 5.55, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  g.add(mesh('AdBoard_Frames', merge(frames), M.darkMetal));
  g.add(mesh('AdBoard_Screens', merge(faces), M.adScreen));
  return g;
}

function seatBlock(x: number, y: number, z: number, out: Geo[]) {
  out.push(box(0.46, 0.08, 0.42, x, y + 0.42, z));
  out.push(box(0.46, 0.5, 0.08, x, y + 0.7, z - 0.2));
}

function buildDugouts(M: StadiumMaterials) {
  const g = grp('Dugouts');
  const y0 = ST.pitchY;
  const shellGeo: Geo[] = [];
  const frame: Geo[] = [];
  const walls: Geo[] = [];
  const seats: Geo[] = [];
  for (const cx of [-7, 7]) {
    walls.push(box(6.2, 0.05, 1.7, cx, y0 + 0.025, -16.45));
    walls.push(box(6.2, 2.4, 0.12, cx, y0 + 1.2, -17.3));
    for (const s of [-1, 1]) walls.push(box(0.1, 0.9, 1.5, cx + s * 3.05, y0 + 0.45, -16.5));
    shellGeo.push(shell('x', cx, y0 + 0.75, -17.25, 1.6, Math.PI / 2, 0.38, 6.2, 12));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const a0 = Math.PI / 2 + ((0.38 - Math.PI / 2) * i) / 6;
        const a1 = Math.PI / 2 + ((0.38 - Math.PI / 2) * (i + 1)) / 6;
        frame.push(
          rod(
            v3(cx + s * 3.1, y0 + 0.75 + 1.6 * Math.sin(a0), -17.25 + 1.6 * Math.cos(a0)),
            v3(cx + s * 3.1, y0 + 0.75 + 1.6 * Math.sin(a1), -17.25 + 1.6 * Math.cos(a1)),
            0.05,
            6,
          ),
        );
      }
      frame.push(rod(v3(cx + s * 3.1, y0, -15.83), v3(cx + s * 3.1, y0 + 0.75 + 1.6 * Math.sin(0.38), -15.83), 0.05, 6));
    }
    for (let i = 0; i < 9; i++) seatBlock(cx - 2.6 + i * 0.65, y0, -16.8, seats);
  }
  g.add(mesh('Dugout_Walls', merge(walls), M.facade));
  g.add(mesh('Dugout_Seats', merge(seats), M.seatA));
  g.add(mesh('Dugout_Frames', merge(frame), M.trim));
  const glass = mesh('Dugout_Roofs', merge(shellGeo), M.glass);
  glass.castShadow = false;
  g.add(glass);

  // Terowongan tiup pemain
  const segA: Geo[] = [];
  const segB: Geo[] = [];
  const ribs: Geo[] = [];
  const z0 = -17.45;
  const z1 = -14.45;
  const n = 5;
  for (let k = 0; k < n; k++) {
    const za = z0 + ((z1 - z0) * k) / n;
    const zb = z0 + ((z1 - z0) * (k + 1)) / n;
    (k % 2 ? segB : segA).push(shell('z', 0, y0, (za + zb) / 2, 1.3, 0, Math.PI, zb - za, 16));
  }
  for (let k = 0; k <= n; k++) {
    const t = new THREE.TorusGeometry(1.3, 0.12, 6, 18, Math.PI);
    t.translate(0, y0, z0 + ((z1 - z0) * k) / n);
    ribs.push(t);
  }
  g.add(mesh('Tunnel_Color', merge(segA), M.facade));
  g.add(mesh('Tunnel_White', merge(segB), M.tunnelB));
  g.add(mesh('Tunnel_Ribs', merge(ribs), M.tunnelB));
  [...g.children].forEach((c) => {
    const m = c as THREE.Mesh;
    if (m.name.startsWith('Tunnel_Color') || m.name.startsWith('Tunnel_White')) {
      (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    }
  });
  return g;
}

function buildBall(M: StadiumMaterials) {
  const R = ST.ballR;
  const geo = new THREE.IcosahedronGeometry(R, 2);
  const pos = geo.getAttribute('position');
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, f + k));
    c.normalize();
    const near = Math.max(...verts.map((v) => v.dot(c)));
    const dark = near > 0.94;
    for (let k = 0; k < 3; k++) {
      const v = dark ? 0.02 : 0.92;
      col[(f + k) * 3] = v;
      col[(f + k) * 3 + 1] = v;
      col[(f + k) * 3 + 2] = v;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ball = mesh('Ball_Giant', geo, M.ball);
  const rest = [0, ST.pitchY + R, 0];
  ball.position.set(rest[0], rest[1], rest[2]);
  ball.userData.restPosition = rest;
  return ball;
}

export function buildPitch(M: StadiumMaterials) {
  const pitch = grp('Pitch');
  const grass = new THREE.BoxGeometry(ST.fieldHX * 2, 0.06, ST.fieldHZ * 2);
  grass.translate(0, ST.deckY + 0.03, 0);
  pitch.add(mesh('Pitch_Grass', grass, M.grass));
  pitch.add(mesh('Pitch_Lines', buildLines(), M.lines));
  const poles: Geo[] = [];
  const flags: Geo[] = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * ST.pitchHX;
      const z = sz * ST.pitchHZ;
      poles.push(rod(v3(x, ST.pitchY, z), v3(x, ST.pitchY + 1.6, z), 0.03, 6));
      const f = new THREE.BufferGeometry();
      const top = ST.pitchY + 1.58;
      f.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([x, top, z, x, top - 0.42, z, x - sx * 0.55, top - 0.18, z - sz * 0.1], 3),
      );
      f.computeVertexNormals();
      flags.push(f);
    }
  }
  pitch.add(mesh('Corner_Poles', merge(poles), M.yellow));
  pitch.add(mesh('Corner_Flags', merge(flags), M.flag));
  return {
    pitch,
    goals: buildGoals(M),
    adBoards: buildAdBoards(M),
    dugouts: buildDugouts(M),
    ball: buildBall(M),
  };
}
