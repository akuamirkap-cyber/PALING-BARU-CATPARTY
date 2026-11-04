import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ST, TOWERS, TOWER_TOP } from './dims';
import { beam, box, cyl, extrudeUp, lifeBuoy, merge, railing, rod, v3, type Geo, type V3 } from '../ship/geom';
import { addPalm, emptyPalmParts } from '../shared/palm';
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

export function roundedRect(hx: number, hz: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz);
  s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hz - r);
  s.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hz);
  s.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hz + r);
  s.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function roundedRectPath(hx: number, hz: number, r: number, y: number, seg = 10): V3[] {
  const pts: V3[] = [];
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-hx + r, hz - r, Math.PI / 2],
    [-hx + r, -hz + r, Math.PI],
    [hx - r, -hz + r, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((Math.PI / 2) * i) / seg;
      pts.push(v3(cx + r * Math.cos(a), y, cz + r * Math.sin(a)));
    }
  }
  return pts;
}

function buildPlatform(M: StadiumMaterials) {
  const g = grp('Platform');
  const H = ST.deckY - ST.pontoonBottom;
  g.add(mesh('Platform_Pontoon', extrudeUp(roundedRect(ST.platHX, ST.platHZ, ST.platR), H, ST.pontoonBottom, 16), [M.deck, M.hull]));
  g.add(mesh('Platform_Stripe', extrudeUp(roundedRect(ST.platHX + 0.04, ST.platHZ + 0.04, ST.platR + 0.04), 0.35, 0.95, 16), M.stripe));
  g.add(mesh('Platform_BootTop', extrudeUp(roundedRect(ST.platHX + 0.03, ST.platHZ + 0.03, ST.platR + 0.03), 0.6, -0.4, 16), M.bootTop));
  const chains: Geo[] = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const cx = sx * (ST.platHX - ST.platR + ST.platR * Math.SQRT1_2);
      const cz = sz * (ST.platHZ - ST.platR + ST.platR * Math.SQRT1_2);
      const d = v3(sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2);
      const a = v3(cx, -1.0, cz).addScaledVector(d, 0.25);
      const b = v3(cx, -8.2, cz).addScaledVector(d, 8);
      chains.push(rod(a, b, 0.13, 8));
      chains.push(box(1.2, 0.6, 1.2, b.x, b.y, b.z));
      chains.push(cyl(0.35, 0.35, 0.4, a.x, 0.1, a.z, 10));
    }
  }
  g.add(mesh('Mooring_Chains', merge(chains), M.darkMetal));
  return g;
}

function buildRailing(M: StadiumMaterials) {
  const g = grp('SeaRailing');
  const path = roundedRectPath(ST.platHX - 0.35, ST.platHZ - 0.35, ST.platR - 0.35, ST.deckY, 10);
  g.add(mesh('Sea_Railing', merge(railing(path, { closed: true, spacing: 1.6, height: 0.95 })), M.trim));
  const orange: Geo[] = [];
  const white: Geo[] = [];
  const add = (b: { orange: Geo[]; white: Geo[] }) => {
    orange.push(...b.orange);
    white.push(...b.white);
  };
  const y = ST.deckY + 0.55;
  for (const x of [-30, -12, 12, 30]) {
    add(lifeBuoy(x, y, ST.platHZ - 0.25, 0));
    add(lifeBuoy(x, y, -(ST.platHZ - 0.25), 0));
  }
  for (const z of [-14, 14]) {
    add(lifeBuoy(ST.platHX - 0.25, y, z, Math.PI / 2));
    add(lifeBuoy(-(ST.platHX - 0.25), y, z, Math.PI / 2));
  }
  g.add(mesh('LifeBuoys_Orange', merge(orange), M.buoyOrange));
  g.add(mesh('LifeBuoys_White', merge(white), M.stripe));
  return g;
}

function buildTowers(M: StadiumMaterials) {
  const g = grp('FloodlightTowers');
  const steel: Geo[] = [];
  const dark: Geo[] = [];
  const lenses: Geo[] = [];
  const base = ST.deckY;
  const yt = TOWER_TOP - 1.5;
  const L = 9;
  for (const [tx, tz] of TOWERS) {
    const half = (i: number) => 1.4 - (0.8 * i) / L;
    const yl = (i: number) => base + ((yt - base) * i) / L;
    const corner = (i: number, cx: number, cz: number) => v3(tx + cx * half(i), yl(i), tz + cz * half(i));
    const cs: [number, number][] = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (let i = 0; i < L; i++) {
      for (let c = 0; c < 4; c++) {
        const [ax, az] = cs[c];
        const [bx, bz] = cs[(c + 1) % 4];
        steel.push(beam(corner(i, ax, az), corner(i + 1, ax, az), 0.22));
        steel.push(beam(corner(i + 1, ax, az), corner(i + 1, bx, bz), 0.12));
        steel.push(beam(corner(i, ax, az), corner(i + 1, bx, bz), 0.08));
        steel.push(beam(corner(i, bx, bz), corner(i + 1, ax, az), 0.08));
      }
    }
    steel.push(box(3.4, 0.4, 3.4, tx, base + 0.2, tz));
    // platform puncak + pagar
    dark.push(box(3.4, 0.14, 2.8, tx, yt + 0.07, tz));
    const rp = [v3(tx - 1.7, yt, tz - 1.4), v3(tx + 1.7, yt, tz - 1.4), v3(tx + 1.7, yt, tz + 1.4), v3(tx - 1.7, yt, tz + 1.4)];
    steel.push(...railing(rp, { closed: true, spacing: 1.1, height: 1.0 }));
    // tangga dengan sangkar di sisi luar
    const sx = Math.sign(tx);
    const lx = (y: number) => tx + sx * (half(((y - base) / (yt - base)) * L) + 0.32);
    for (const z of [-0.3, 0.3]) steel.push(rod(v3(lx(base), base, tz + z), v3(lx(yt), yt + 1.0, tz + z), 0.035, 5));
    for (let y = base + 0.35; y < yt; y += 0.4) steel.push(rod(v3(lx(y), y, tz - 0.3), v3(lx(y), y, tz + 0.3), 0.025, 4));
    for (let y = base + 2.4; y < yt; y += 1.5) {
      const h = new THREE.TorusGeometry(0.45, 0.03, 4, 10, Math.PI);
      h.rotateX(Math.PI / 2);
      h.rotateY((sx * Math.PI) / 2);
      h.translate(lx(y), y, tz);
      steel.push(h);
    }
    // kepala lampu menghadap lapangan
    const headFrame: Geo[] = [];
    const head: Geo[] = [];
    const headLens: Geo[] = [];
    headFrame.push(box(5.4, 0.16, 0.2, 0, 1.3, -0.15), box(5.4, 0.16, 0.2, 0, -1.3, -0.15));
    headFrame.push(box(0.16, 2.76, 0.2, -2.7, 0, -0.15), box(0.16, 2.76, 0.2, 2.7, 0, -0.15));
    for (const y of [-0.8, 0, 0.8]) headFrame.push(box(5.3, 0.1, 0.12, 0, y, -0.12));
    headFrame.push(box(0.22, 2.0, 0.22, -1.4, -2.2, -0.25), box(0.22, 2.0, 0.22, 1.4, -2.2, -0.25));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const x = -2.0 + c * 1.0;
        const y = -0.8 + r * 0.8;
        const hc = new THREE.CylinderGeometry(0.3, 0.35, 0.42, 12);
        hc.rotateX(Math.PI / 2);
        hc.translate(x, y, 0.12);
        head.push(hc);
        const lens = new THREE.CircleGeometry(0.27, 14);
        lens.translate(x, y, 0.335);
        headLens.push(lens);
      }
    }
    const yaw = Math.atan2(-tx, -tz);
    const m = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationX(0.42))
      .setPosition(tx, yt + 2.7, tz);
    [...headFrame, ...head, ...headLens].forEach((h) => h.applyMatrix4(m));
    steel.push(...headFrame);
    dark.push(...head);
    lenses.push(...headLens);
  }
  g.add(mesh('Tower_Lattice', merge(steel), M.steel));
  g.add(mesh('Tower_Heads', merge(dark), M.darkMetal));
  g.add(mesh('Tower_Lamps', merge(lenses), M.lamp));
  return g;
}

/* ---------------------- Huruf raksasa "JELLY ARENA" ---------------------- */
type Stroke = [number, number, number, number];
const LETTERS: Record<string, Stroke[]> = {
  J: [
    [1.2, 4.5, 2.7, 4.5],
    [2.4, 4.5, 2.4, 1.0],
    [2.2, 0.55, 0.8, 0.55],
    [0.55, 0.8, 0.55, 1.7],
  ],
  E: [
    [0.5, 0.5, 0.5, 4.5],
    [0.5, 4.5, 2.6, 4.5],
    [0.5, 2.5, 2.2, 2.5],
    [0.5, 0.5, 2.6, 0.5],
  ],
  L: [
    [0.5, 0.5, 0.5, 4.5],
    [0.5, 0.5, 2.6, 0.5],
  ],
  Y: [
    [0.5, 4.5, 1.5, 2.4],
    [2.5, 4.5, 1.5, 2.4],
    [1.5, 2.4, 1.5, 0.5],
  ],
  A: [
    [0.45, 0.5, 1.5, 4.5],
    [2.55, 0.5, 1.5, 4.5],
    [0.95, 1.9, 2.05, 1.9],
  ],
  R: [
    [0.5, 0.5, 0.5, 4.5],
    [0.5, 4.5, 2.1, 4.5],
    [2.45, 4.1, 2.45, 3.0],
    [0.5, 2.6, 2.1, 2.6],
    [1.5, 2.4, 2.5, 0.5],
  ],
  N: [
    [0.5, 0.5, 0.5, 4.5],
    [2.5, 0.5, 2.5, 4.5],
    [0.5, 4.5, 2.5, 0.5],
  ],
};

function strokeGeo(x0: number, y0: number, x1: number, y1: number, w: number, depth: number): Geo {
  const len = Math.hypot(x1 - x0, y1 - y0) + w;
  const hx = len / 2;
  const hy = w / 2;
  const r = w * 0.42;
  const sh = new THREE.Shape();
  sh.moveTo(-hx + r, -hy);
  sh.lineTo(hx - r, -hy);
  sh.quadraticCurveTo(hx, -hy, hx, -hy + r);
  sh.lineTo(hx, hy - r);
  sh.quadraticCurveTo(hx, hy, hx - r, hy);
  sh.lineTo(-hx + r, hy);
  sh.quadraticCurveTo(-hx, hy, -hx, hy - r);
  sh.lineTo(-hx, -hy + r);
  sh.quadraticCurveTo(-hx, -hy, -hx + r, -hy);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.07,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return g;
}

function buildLetters(text: string, unit: number) {
  const palette = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c'];
  const parts: Geo[] = [];
  const color = new THREE.Color();
  let x = 0;
  let li = 0;
  for (const ch of text) {
    if (ch === ' ') {
      x += 1.2;
      continue;
    }
    const strokes = LETTERS[ch];
    if (!strokes) continue;
    color.set(palette[li % palette.length]);
    for (const [a, b, c, d] of strokes) {
      const g = strokeGeo(x + a * unit, b * unit, x + c * unit, d * unit, 0.95 * unit, 0.7);
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    x += 3 * unit + 0.6;
    li++;
  }
  const geo = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  return { geo, width: x - 0.6 };
}

function buildPromenade(M: StadiumMaterials) {
  const g = grp('Promenade');
  const base = ST.deckY;
  // pohon kelapa dalam pot
  const palms = emptyPalmParts();
  const planters: Geo[] = [];
  const soil: Geo[] = [];
  const spots: [number, number][] = [
    [10.5, 34],
    [-10.5, 34],
    [3.5, 34],
    [-3.5, 34],
    [10.5, -34],
    [-10.5, -34],
    [39.5, 16.5],
    [39.5, -16.5],
    [41, 28],
    [41, -28],
    [-40, 14],
    [-40, -14],
    [-41, 28],
    [-41, -28],
  ];
  spots.forEach(([x, z], i) => {
    planters.push(cyl(1.05, 0.9, 0.75, x, base + 0.375, z, 16));
    soil.push(cyl(0.95, 0.95, 0.06, x, base + 0.72, z, 16));
    addPalm(palms, x, base + 0.7, z, 5.5 + (i % 3) * 0.8, 0.9 + (i % 2) * 0.8, i * 1.7, i + 1);
  });
  g.add(mesh('Planters', merge(planters), M.planter));
  g.add(mesh('Planter_Soil', merge(soil), M.soil));
  g.add(mesh('Palm_Trunks', merge(palms.trunk), M.palmTrunk));
  g.add(mesh('Palm_Leaves', merge(palms.leaves), M.palmLeaf));
  g.add(mesh('Palm_Nuts', merge(palms.nuts), M.palmNut));

  // kios jajanan
  const bodies: Geo[] = [];
  const awnings: Geo[] = [];
  const signs: Geo[] = [];
  const counters: Geo[] = [];
  const kiosks: [number, number, number][] = [
    [-26, 33.6, 0],
    [26, 33.6, 0],
    [-26, -33.6, Math.PI],
  ];
  kiosks.forEach(([x, z, yaw], i) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    const parts: [Geo, Geo[]][] = [
      [box(3.0, 2.3, 2.0, 0, base + 1.15, 0), bodies],
      [box(3.2, 0.25, 2.2, 0, base + 2.42, 0), bodies],
      [box(3.2, 0.1, 0.55, 0, base + 1.12, 1.25), counters],
      [box(3.4, 0.08, 1.4, 0, base + 2.35, 1.4, 0.32, 0, 0), awnings],
    ];
    const sign = new THREE.PlaneGeometry(2.8, 0.62);
    const uv = sign.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1) / 3 + uv.getY(k) / 3);
    sign.translate(0, base + 2.95, 0.6);
    parts.push([box(3.0, 0.75, 0.12, 0, base + 2.95, 0.52), bodies], [sign, signs]);
    for (const [geo, list] of parts) {
      geo.applyMatrix4(m);
      list.push(geo);
    }
  });
  g.add(mesh('Kiosk_Bodies', merge(bodies), M.kioskBody));
  g.add(mesh('Kiosk_Counters', merge(counters), M.wood));
  g.add(mesh('Kiosk_Awnings', merge(awnings), M.awning));
  g.add(mesh('Kiosk_Signs', merge(signs), M.kioskSign));

  // bangku taman
  const seats: Geo[] = [];
  const legs: Geo[] = [];
  for (const x of [-17.5, -3.5, 3.5, 17.5]) {
    const z = -34.2;
    seats.push(box(2.0, 0.08, 0.5, x, base + 0.46, z));
    seats.push(box(2.0, 0.42, 0.07, x, base + 0.75, z - 0.24));
    for (const dx of [-0.85, 0.85]) legs.push(box(0.08, 0.46, 0.45, x + dx, base + 0.23, z));
  }
  g.add(mesh('Benches', merge(seats), M.wood));
  g.add(mesh('Bench_Legs', merge(legs), M.darkMetal));

  // huruf raksasa
  const { geo, width } = buildLetters('JELLY ARENA', 0.5);
  geo.rotateY(Math.PI / 2);
  geo.translate(40.6, base + 0.45, width / 2);
  const letters = mesh('Letters_JellyArena', geo, M.letters);
  g.add(letters);
  g.add(mesh('Letters_Plinth', box(1.7, 0.45, width + 1.4, 40.6, base + 0.225, 0), M.concrete));
  return g;
}

export function buildSurroundings(M: StadiumMaterials) {
  return {
    platform: buildPlatform(M),
    railing: buildRailing(M),
    towers: buildTowers(M),
    promenade: buildPromenade(M),
  };
}
