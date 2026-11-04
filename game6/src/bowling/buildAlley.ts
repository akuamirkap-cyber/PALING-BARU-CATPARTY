import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  APPROACH_X0,
  BALL_R,
  BOARD_W,
  CONCOURSE,
  CUSHION_X,
  DECK_START,
  FOUL_X,
  FT,
  GUTTER_D,
  GUTTER_W,
  HALF_TRACK,
  HALL,
  HEAD_X,
  KICK_H,
  LANE_COUNT,
  LANE_W,
  MASK_BOTTOM,
  MASK_TOP,
  MASK_X,
  PIN_SPOTS,
  PIT_FLOOR,
  PIT_X,
  RETURN_X,
  TRACK_EDGE,
  laneZ,
  pairZ,
} from './dims';
import { TriBuilder, box, cyl, merge, railing, rod, v3, type Geo } from '../ship/geom';
import type { BowlingMaterials } from './materials';

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

/** Quad datar menghadap +Y dengan UV kustom. */
function quadXZ(x0: number, x1: number, z0: number, z1: number, y: number, uv: (x: number, z: number) => [number, number]): Geo {
  const P: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(([x, z]) => [x, y, z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => [0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([x, z]) => uv(x, z)), 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

/** Bidang vertikal menghadap arah `n` (±X / ±Z). */
function wall(cx: number, cy: number, cz: number, w: number, h: number, face: '+x' | '-x' | '+z' | '-z'): Geo {
  const g = new THREE.PlaneGeometry(w, h);
  if (face === '-z') g.rotateY(Math.PI);
  if (face === '+x') g.rotateY(Math.PI / 2);
  if (face === '-x') g.rotateY(-Math.PI / 2);
  g.translate(cx, cy, cz);
  return g;
}

function flatCircle(x: number, z: number, r: number, y: number, seg = 12) {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Gutter setengah pipa (permukaan melengkung halus). */
function gutterGeo(zc: number, x0: number, x1: number): Geo {
  const Rg = (GUTTER_W * GUTTER_W) / 4 / (2 * GUTTER_D) + GUTTER_D / 2;
  const th = Math.asin(GUTTER_W / 2 / Rg);
  const yc = Rg - GUTTER_D;
  const n = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= n; k++) {
    const a = -th + (2 * th * k) / n;
    const z = zc + Rg * Math.sin(a);
    const y = yc - Rg * Math.cos(a);
    pos.push(x0, y, z, x1, y, z);
  }
  for (let k = 0; k < n; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function colored(g: Geo, hex: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

const BALL_COLORS = ['#ff4fd8', '#29e7ff', '#ffe14d', '#6dff7a', '#ff8a3d', '#b07cff', '#ff3b3b', '#2d6bff', '#f4f1ea'];

export interface AlleyBuild {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  mirrorHide: THREE.Object3D[];
  disco: THREE.Object3D;
}

export function buildAlley(M: BowlingMaterials): AlleyBuild {
  const group = grp('BowlingAlley');
  const mirrorHide: THREE.Object3D[] = [];
  const add = (parent: THREE.Object3D, name: string, geos: Geo[] | Geo, mat: THREE.Material | THREE.Material[]) => {
    const list = Array.isArray(geos) ? geos : [geos];
    if (!list.length) return null;
    const m = mesh(name, list.length === 1 ? list[0] : merge(list), mat);
    parent.add(m);
    return m;
  };

  /* ---------------- Lantai, approach & lintasan ---------------- */
  const lanes = grp('Lanes');
  group.add(lanes);
  const woodUV = (x: number, z: number): [number, number] => [x / 4, z / LANE_W + 0.5];
  const laneGeos = Array.from({ length: LANE_COUNT }, (_, i) => {
    const lz = laneZ(i);
    return quadXZ(FOUL_X, PIT_X, lz - LANE_W / 2, lz + LANE_W / 2, 0, (x, z) => [x / 4, (z - lz) / LANE_W]);
  });
  const laneMesh = add(lanes, 'Lane_Beds', laneGeos, M.laneWood);
  const approach = add(lanes, 'Approach', quadXZ(APPROACH_X0, FOUL_X, -TRACK_EDGE, TRACK_EDGE, 0, woodUV), M.laneWood);

  // Marka resmi lintasan
  const marks = new TriBuilder();
  const up = v3(0, 1, 0);
  const dots: Geo[] = [];
  const ym = 0.0012;
  const boardZ = (lz: number, b: number) => lz + LANE_W / 2 - (b - 0.5) * BOARD_W;
  const arrowFt: Record<number, number> = { 5: 13, 10: 14, 15: 15, 20: 16, 25: 15, 30: 14, 35: 13 };
  for (let i = 0; i < LANE_COUNT; i++) {
    const lz = laneZ(i);
    for (const [b, ft] of Object.entries(arrowFt)) {
      const zc = boardZ(lz, Number(b));
      const x0 = FOUL_X + ft * FT;
      const tip = v3(x0 + 0.17, ym, zc);
      const l = v3(x0, ym, zc - 0.014);
      const r = v3(x0, ym, zc + 0.014);
      marks.tri(tip, [0, 0], l, [0, 0], r, [0, 0], up);
    }
    for (const b of [10, 30]) {
      const zc = boardZ(lz, b);
      const a = v3(FOUL_X + 34 * FT, ym, zc - 0.006);
      const bb = v3(FOUL_X + 43 * FT, ym, zc - 0.006);
      const c = v3(FOUL_X + 43 * FT, ym, zc + 0.006);
      const d = v3(FOUL_X + 34 * FT, ym, zc + 0.006);
      marks.tri(a, [0, 0], bb, [0, 0], c, [0, 0], up);
      marks.tri(a, [0, 0], c, [0, 0], d, [0, 0], up);
    }
    for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
      dots.push(flatCircle(FOUL_X + 7 * FT, boardZ(lz, b), 0.011, ym));
      dots.push(flatCircle(FOUL_X - 0.14, boardZ(lz, b), 0.011, ym));
    }
    for (const b of [3, 5, 10, 15, 20, 25, 30, 35, 37]) {
      dots.push(flatCircle(FOUL_X - 12 * FT, boardZ(lz, b), 0.016, ym));
      dots.push(flatCircle(FOUL_X - 15 * FT, boardZ(lz, b), 0.016, ym));
    }
    PIN_SPOTS.forEach(([dx, dz]) => dots.push(flatCircle(HEAD_X + dx, lz + dz, 0.027, ym, 16)));
  }
  const markMesh = add(lanes, 'Lane_Arrows', marks.build(), M.markings);
  const dotMesh = add(lanes, 'Lane_Dots', dots, M.dots);
  const foul = add(lanes, 'Foul_Line', quadXZ(FOUL_X - 0.012, FOUL_X + 0.012, -TRACK_EDGE, TRACK_EDGE, ym, () => [0, 0]), M.foul);
  mirrorHide.push(...([laneMesh, approach, markMesh, dotMesh, foul].filter(Boolean) as THREE.Object3D[]));

  // Gutter, capping & LED
  const gutters: Geo[] = [];
  const caps: Geo[] = [];
  const kicks: Geo[] = [];
  const pits: Geo[] = [];
  const curtains: Geo[] = [];
  const machines: Geo[] = [];
  const capTop = 0.014;
  const capX1 = CUSHION_X + 0.1;
  for (let i = 0; i < LANE_COUNT; i++) {
    const lz = laneZ(i);
    for (const s of [-1, 1]) gutters.push(gutterGeo(lz + s * (LANE_W / 2 + GUTTER_W / 2), FOUL_X, PIT_X));
    const right = i < LANE_COUNT - 1 ? laneZ(i + 1) - HALF_TRACK : TRACK_EDGE;
    const zr0 = lz + HALF_TRACK;
    caps.push(box(capX1 - FOUL_X, 0.12, right - zr0, (capX1 + FOUL_X) / 2, capTop - 0.06, (zr0 + right) / 2));
    if (i === 0) caps.push(box(capX1 - FOUL_X, 0.12, lz - HALF_TRACK + TRACK_EDGE, (capX1 + FOUL_X) / 2, capTop - 0.06, (lz - HALF_TRACK - TRACK_EDGE) / 2));
    const leds: Geo[] = [];
    for (const s of [-1, 1]) {
      leds.push(box(MASK_X - FOUL_X - 0.4, 0.008, 0.018, (MASK_X + FOUL_X) / 2, capTop + 0.004, lz + s * (HALF_TRACK + 0.028)));
      kicks.push(box(capX1 - DECK_START, KICK_H + 0.3, 0.06, (capX1 + DECK_START) / 2, (KICK_H - 0.3) / 2, lz + s * (HALF_TRACK + 0.03)));
    }
    add(lanes, `Lane_LED_${i + 1}`, leds, M.laneLeds[i]);
    pits.push(box(capX1 - PIT_X, 0.1, HALF_TRACK * 2, (capX1 + PIT_X) / 2, PIT_FLOOR - 0.05, lz));
    pits.push(box(0.04, -PIT_FLOOR, HALF_TRACK * 2, PIT_X + 0.02, PIT_FLOOR / 2, lz));
    curtains.push(wall(CUSHION_X, (MASK_BOTTOM + PIT_FLOOR) / 2, lz, HALF_TRACK * 2, MASK_BOTTOM - PIT_FLOOR, '-x'));
    machines.push(box(2.5, 1.55, 1.2, HEAD_X + 1.15, MASK_BOTTOM + 0.95, lz));
    machines.push(cyl(0.42, 0.42, 1.1, HEAD_X + 1.6, 2.2, lz, 16, Math.PI / 2, 0, 0));
  }
  add(lanes, 'Gutters', gutters, M.gutter);
  add(lanes, 'Capping', caps, M.capping);
  add(lanes, 'Kickbacks', kicks, M.kickback);
  add(lanes, 'Pits', pits, M.pit);
  add(lanes, 'Pit_Curtains', curtains, M.curtain);
  add(lanes, 'Pinsetters', machines, M.machine);

  /* ---------------- Masking unit, soffit & neon ---------------- */
  const masking = grp('Masking');
  group.add(masking);
  const mw = 10.8;
  add(masking, 'Masking_Art', wall(MASK_X - 0.004, (MASK_BOTTOM + MASK_TOP) / 2, 0, mw, MASK_TOP - MASK_BOTTOM, '-x'), M.masking);
  add(masking, 'Masking_Body', box(0.5, MASK_TOP - MASK_BOTTOM, mw, MASK_X + 0.25, (MASK_BOTTOM + MASK_TOP) / 2, 0), M.soffit);
  add(masking, 'Pin_Lights', box(0.22, 0.04, mw, MASK_X + 0.14, MASK_BOTTOM - 0.02, 0), M.pinLight);
  const side = (MASK_X + 0) as number;
  add(
    masking,
    'Partition',
    [
      wall(side, MASK_TOP / 2, (mw / 2 + HALL.z1) / 2, HALL.z1 - mw / 2, MASK_TOP, '-x'),
      wall(side, MASK_TOP / 2, -(mw / 2 + HALL.z1) / 2, HALL.z1 - mw / 2, MASK_TOP, '-x'),
      wall(side, (MASK_TOP + HALL.h) / 2, 0, HALL.z1 * 2, HALL.h - MASK_TOP, '-x'),
    ],
    M.soffit,
  );

  const neon = grp('Neon');
  group.add(neon);
  add(neon, 'Neon_Sign', wall(MASK_X - 0.06, 4.02, 0, 7.2, 1.8, '-x'), M.neonSign);
  add(neon, 'Neon_Masking_Lines', [box(0.04, 0.04, mw, MASK_X - 0.03, MASK_TOP + 0.03, 0)], M.neonA);
  add(neon, 'Neon_Masking_Lines_B', [box(0.04, 0.035, mw, MASK_X - 0.03, MASK_BOTTOM + 0.02, 0)], M.neonB);

  /* ---------------- Ruangan: lantai, dinding, plafon ---------------- */
  const room = grp('Room');
  group.add(room);
  const cUV = (x: number, z: number): [number, number] => [x / 2.6, z / 2.6];
  add(
    room,
    'Floor_Carpet',
    [
      quadXZ(CONCOURSE.x1, APPROACH_X0, HALL.z0, HALL.z1, 0, cUV),
      quadXZ(APPROACH_X0, MASK_X, TRACK_EDGE, HALL.z1, 0, cUV),
      quadXZ(APPROACH_X0, MASK_X, HALL.z0, -TRACK_EDGE, 0, cUV),
    ],
    M.carpet,
  );
  add(
    room,
    'Floor_Service',
    [quadXZ(capX1, HALL.x1, HALL.z0, HALL.z1, 0, () => [0, 0]), quadXZ(MASK_X, capX1, TRACK_EDGE, HALL.z1, 0, () => [0, 0]), quadXZ(MASK_X, capX1, HALL.z0, -TRACK_EDGE, 0, () => [0, 0])],
    M.floorDark,
  );
  // concourse (panggung belakang) + tangga samping
  const cw = CONCOURSE.x1 - HALL.x0;
  add(room, 'Concourse', box(cw, CONCOURSE.h, HALL.z1 * 2, (HALL.x0 + CONCOURSE.x1) / 2, CONCOURSE.h / 2, 0), M.concourse);
  const steps: Geo[] = [];
  for (const s of [-1, 1]) {
    steps.push(box(0.25, 0.3, 2.0, CONCOURSE.x1 + 0.125, 0.15, s * 6.3));
    steps.push(box(0.25, 0.15, 2.0, CONCOURSE.x1 + 0.375, 0.075, s * 6.3));
  }
  add(room, 'Concourse_Steps', steps, M.concourse);
  const rail = (z0: number, z1: number) => railing([v3(CONCOURSE.x1 - 0.06, CONCOURSE.h, z0), v3(CONCOURSE.x1 - 0.06, CONCOURSE.h, z1)], { spacing: 1.2, height: 0.9 });
  add(room, 'Concourse_Railing', [...rail(-5.2, 5.2), ...rail(7.4, 9.3), ...rail(-9.3, -7.4)], M.chrome);

  const H = HALL.h;
  const L = HALL.x1 - HALL.x0;
  const cx = (HALL.x0 + HALL.x1) / 2;
  add(
    room,
    'Walls',
    [wall(cx, H / 2, HALL.z0, L, H, '+z'), wall(cx, H / 2, HALL.z1, L, H, '-z'), wall(HALL.x0, H / 2, 0, HALL.z1 * 2, H, '+x'), wall(HALL.x1, H / 2, 0, HALL.z1 * 2, H, '-x')],
    M.walls,
  );
  add(
    room,
    'Walls_Lower',
    [wall(cx, 0.55, HALL.z0 + 0.005, L, 1.1, '+z'), wall(cx, 0.55, HALL.z1 - 0.005, L, 1.1, '-z'), wall(HALL.x0 + 0.005, CONCOURSE.h + 0.55, 0, HALL.z1 * 2, 1.1, '+x')],
    M.wainscot,
  );
  add(room, 'Wall_Mural', wall(HALL.x0 + 0.01, 4.25, 0, 3.4, 1.7, '+x'), M.mural);
  const ceil = new THREE.PlaneGeometry(L, HALL.z1 * 2);
  ceil.rotateX(Math.PI / 2);
  ceil.translate(cx, H, 0);
  add(room, 'Ceiling', ceil, M.ceiling);
  const lights: Geo[] = [];
  for (let i = 0; i < LANE_COUNT; i++) for (let x = FOUL_X + 1.5; x < MASK_X - 1; x += 2.6) lights.push(box(1.4, 0.03, 0.16, x, H - 0.02, laneZ(i)));
  for (let x = -16.5; x < -9; x += 2.2) for (let z = -8; z <= 8; z += 2.6) lights.push(cyl(0.16, 0.16, 0.03, x, H - 0.02, z, 16));
  add(room, 'Ceiling_Lights', lights, M.ceilingLight);
  add(
    neon,
    'Blacklights',
    [rod(v3(-12, 4.75, HALL.z0 + 0.12), v3(12, 4.75, HALL.z0 + 0.12), 0.03, 8), rod(v3(-12, 4.75, HALL.z1 - 0.12), v3(12, 4.75, HALL.z1 - 0.12), 0.03, 8)],
    M.blacklight,
  );
  // garis neon bergelombang di dinding samping
  const wave = (z: number) => {
    const pts: THREE.Vector3[] = [];
    for (let x = -12.5; x <= 12.5; x += 0.25) pts.push(v3(x, 2.55 + Math.sin(x * 0.9) * 0.22, z));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.025, 6, false);
  };
  add(neon, 'Neon_Wave_A', wave(HALL.z0 + 0.06), M.neonA);
  add(neon, 'Neon_Wave_B', wave(HALL.z1 - 0.06), M.neonB);
  // pilar dengan cincin neon
  const pillars: Geo[] = [];
  const ringsA: Geo[] = [];
  const ringsB: Geo[] = [];
  for (const x of [-1, 5, 11]) {
    for (const s of [-1, 1]) {
      const z = s * (HALL.z1 - 0.32);
      pillars.push(box(0.64, H, 0.64, x, H / 2, z));
      for (const y of [2.0, 3.4]) {
        const ring = [box(0.7, 0.05, 0.05, x, y, z - 0.33), box(0.7, 0.05, 0.05, x, y, z + 0.33), box(0.05, 0.05, 0.7, x - 0.33, y, z), box(0.05, 0.05, 0.7, x + 0.33, y, z)];
        (s > 0 ? ringsB : ringsA).push(...ring);
      }
    }
  }
  add(room, 'Pillars', pillars, M.pillar);
  add(neon, 'Pillar_Rings_A', ringsA, M.neonA);
  add(neon, 'Pillar_Rings_B', ringsB, M.neonB);

  /* ---------------- Ball return, sofa, konsol, monitor ---------------- */
  const returns = grp('BallReturns');
  const settees = grp('Settees');
  const monitors = grp('Monitors');
  group.add(returns, settees, monitors);
  const hoods: Geo[] = [];
  const railsG: Geo[] = [];
  const decor: Geo[] = [];
  const benches: Geo[] = [];
  const cushions: Geo[] = [];
  const tables: Geo[] = [];
  const chrome: Geo[] = [];
  const consoles: Geo[] = [];
  const cScreens: Geo[] = [];
  const mFrames: Geo[] = [];
  for (let p = 0; p < LANE_COUNT / 2; p++) {
    const pz = pairZ(p);
    hoods.push(box(1.1, 0.55, 0.5, RETURN_X, 0.275, pz));
    const top = new THREE.CylinderGeometry(0.25, 0.25, 1.1, 18, 1, false, 0, Math.PI);
    top.rotateZ(Math.PI / 2);
    top.rotateX(Math.PI / 2);
    top.translate(RETURN_X, 0.55, pz);
    hoods.push(top);
    for (const s of [-1, 1]) {
      for (const d of [-0.065, 0.065]) railsG.push(rod(v3(RETURN_X - 0.55, 0.862, pz + s * 0.13 + d), v3(RETURN_X + 0.6, 0.862, pz + s * 0.13 + d), 0.012, 6));
      for (const x of [RETURN_X - 0.5, RETURN_X + 0.55]) railsG.push(rod(v3(x, 0.72, pz + s * 0.13), v3(x, 0.862, pz + s * 0.13), 0.015, 6));
      for (const [k, x] of [RETURN_X - 0.05, RETURN_X - 0.38].entries()) {
        const b = new THREE.SphereGeometry(BALL_R, 18, 12);
        b.translate(x, 0.948, pz + s * 0.13);
        decor.push(colored(b, BALL_COLORS[(p * 4 + k * 2 + (s > 0 ? 1 : 0)) % BALL_COLORS.length]));
      }
    }
    // sofa U + meja + konsol skor
    benches.push(box(0.55, 0.42, 2.9, -12.0, 0.21, pz));
    cushions.push(box(0.55, 0.1, 2.9, -12.0, 0.47, pz), box(0.16, 0.5, 2.9, -12.2, 0.77, pz));
    for (const s of [-1, 1]) {
      benches.push(box(1.0, 0.42, 0.55, -11.22, 0.21, pz + s * 1.175));
      cushions.push(box(1.0, 0.1, 0.55, -11.22, 0.47, pz + s * 1.175), box(1.0, 0.5, 0.16, -11.22, 0.77, pz + s * 1.38));
    }
    tables.push(cyl(0.34, 0.34, 0.04, -11.1, 0.62, pz, 24));
    chrome.push(cyl(0.04, 0.04, 0.6, -11.1, 0.31, pz, 8), cyl(0.2, 0.22, 0.03, -11.1, 0.015, pz, 16));
    consoles.push(box(0.28, 0.95, 0.34, -9.45, 0.475, pz), box(0.06, 0.4, 0.56, -9.48, 1.08, pz, 0, 0, -0.5));
    const sc = new THREE.PlaneGeometry(0.5, 0.34);
    sc.rotateY(-Math.PI / 2);
    sc.rotateZ(-0.5);
    sc.translate(-9.512, 1.08, pz);
    cScreens.push(sc);
    // monitor skor gantung
    mFrames.push(box(0.1, 1.04, 1.82, FOUL_X + 1.0, 3.35, pz));
    for (const s of [-1, 1]) mFrames.push(rod(v3(FOUL_X + 1.0, 3.87, pz + s * 0.6), v3(FOUL_X + 1.0, H, pz + s * 0.6), 0.02, 6));
    const scr = new THREE.PlaneGeometry(1.72, 0.96);
    scr.rotateY(-Math.PI / 2);
    scr.translate(FOUL_X + 1.0 - 0.052, 3.35, pz);
    add(monitors, `Monitor_Screen_${p + 1}`, scr, M.monitorScreens[p]);
  }
  add(returns, 'Ball_Return_Hoods', hoods, M.ballReturn);
  add(returns, 'Ball_Return_Rails', railsG, M.chrome);
  add(returns, 'Ball_Return_Balls', mergeGeometries(decor, false) ?? new THREE.BufferGeometry(), M.rackBalls);
  add(settees, 'Settee_Base', benches, M.console);
  add(settees, 'Settee_Cushions', cushions, M.seat);
  add(settees, 'Settee_Tables', tables, M.tableTop);
  add(settees, 'Settee_Chrome', chrome, M.chrome);
  add(settees, 'Score_Consoles', consoles, M.console);
  add(settees, 'Score_Console_Screens', cScreens, M.consoleScreen);
  add(monitors, 'Monitor_Frames', mFrames, M.monitorFrame);

  /* ---------------- Concourse: snack bar & rak bola ---------------- */
  const counter = grp('SnackBar');
  const racks = grp('BallRacks');
  group.add(counter, racks);
  const ch = CONCOURSE.h;
  add(counter, 'Counter', box(0.7, 1.05, 6.4, -16.55, ch + 0.525, 0), M.counter);
  add(counter, 'Counter_Top', box(0.85, 0.05, 6.6, -16.52, ch + 1.075, 0), M.counterTop);
  add(counter, 'Back_Shelf', box(0.35, 1.7, 6.2, -17.8, ch + 0.85, 0), M.console);
  add(counter, 'Menu_Board', wall(HALL.x0 + 0.02, ch + 2.45, 0, 2.2, 1.1, '+x'), M.menu);
  add(counter, 'Snack_Sign', wall(-16.19, ch + 0.62, 0, 2.6, 0.65, '+x'), M.snackSign);
  const stools: Geo[] = [];
  const stoolTops: Geo[] = [];
  for (let z = -2.4; z <= 2.41; z += 1.2) {
    stools.push(cyl(0.035, 0.035, 0.72, -15.75, ch + 0.36, z, 8), cyl(0.2, 0.22, 0.03, -15.75, ch + 0.015, z, 14));
    stoolTops.push(cyl(0.2, 0.2, 0.08, -15.75, ch + 0.76, z, 18));
  }
  add(counter, 'Stools', stools, M.chrome);
  add(counter, 'Stool_Seats', stoolTops, M.seat);
  const rackF: Geo[] = [];
  const rackB: Geo[] = [];
  for (const s of [-1, 1]) {
    const z0 = s * 5.2;
    const z1 = s * 8.9;
    for (const [t, y] of [ch + 0.32, ch + 0.78, ch + 1.24].entries()) {
      for (const x of [-17.55, -17.2]) rackF.push(rod(v3(x - t * 0.05, y, z0), v3(x - t * 0.05, y, z1), 0.015, 6));
      const n = 9;
      for (let k = 0; k < n; k++) {
        const z = z0 + ((z1 - z0) * (k + 0.5)) / n;
        const b = new THREE.SphereGeometry(BALL_R, 16, 12);
        b.translate(-17.375 - t * 0.05, y + 0.07, z);
        rackB.push(colored(b, BALL_COLORS[(k + t * 3 + (s > 0 ? 4 : 0)) % BALL_COLORS.length]));
      }
    }
    for (const z of [z0, z1]) for (const x of [-17.6, -17.15]) rackF.push(box(0.05, 1.35, 0.05, x, ch + 0.675, z));
  }
  add(racks, 'Rack_Frames', rackF, M.chrome);
  add(racks, 'Rack_Balls', mergeGeometries(rackB, false) ?? new THREE.BufferGeometry(), M.rackBalls);

  /* ---------------- Pojok arcade ---------------- */
  const arcade = grp('Arcade');
  group.add(arcade);
  const zA = HALL.z1 - 0.5;
  const bodies: Geo[] = [];
  M.arcadeScreens.forEach((mat, k) => {
    const x = -7.6 + k * 0.95;
    bodies.push(box(0.78, 1.75, 0.72, x, 0.875, zA), box(0.8, 0.28, 0.4, x, 1.88, zA + 0.15));
    const sc = new THREE.PlaneGeometry(0.6, 0.5);
    sc.rotateY(Math.PI);
    sc.rotateX(-0.25);
    sc.translate(x, 1.35, zA - 0.37);
    add(arcade, `Arcade_Screen_${k + 1}`, sc, mat);
  });
  bodies.push(box(1.0, 0.95, 1.0, -4.6, 0.475, zA - 0.1), box(1.0, 0.25, 1.0, -4.6, 2.1, zA - 0.1));
  add(arcade, 'Arcade_Cabinets', bodies, M.arcadeBody);
  add(arcade, 'Claw_Glass', box(0.98, 1.0, 0.98, -4.6, 1.47, zA - 0.1), M.glass);
  const plush: Geo[] = [];
  const pc = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#b197fc'];
  for (let k = 0; k < 14; k++) {
    const b = new THREE.SphereGeometry(0.085, 10, 8);
    b.scale(1, 1.25, 1);
    b.translate(-4.95 + (k % 5) * 0.17, 1.06 + Math.floor(k / 5) * 0.1, zA - 0.4 + ((k * 7) % 5) * 0.14);
    plush.push(colored(b, pc[k % pc.length]));
  }
  add(arcade, 'Claw_Plushies', mergeGeometries(plush, false) ?? new THREE.BufferGeometry(), M.plush);
  add(arcade, 'Arcade_Marquee', [box(0.04, 0.04, 3.2, -6.65, 2.3, zA - 0.38)], M.neonB);
  add(arcade, 'Vending_Machine', box(1.0, 1.9, 0.8, -7.0, 0.95, HALL.z0 + 0.5), M.counter);
  add(arcade, 'Vending_Glow', box(0.7, 1.2, 0.02, -7.0, 1.1, HALL.z0 + 0.91), M.neonA);
  add(arcade, 'Bench_Lockers', [box(2.4, 0.45, 0.45, -4.4, 0.225, HALL.z0 + 0.35)], M.wood);

  /* ---------------- Bola disko ---------------- */
  const disco = grp('DiscoBall');
  group.add(disco);
  const ball = new THREE.IcosahedronGeometry(0.38, 2);
  ball.translate(0, 0, 0);
  const discoMesh = mesh('Disco_Ball', ball, M.disco);
  discoMesh.position.set(4.5, 4.45, 0);
  disco.add(discoMesh);
  add(disco, 'Disco_Rod', rod(v3(4.5, 4.83, 0), v3(4.5, H, 0), 0.012, 6), M.chrome);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.receiveShadow = true;
    m.castShadow = !['Walls', 'Walls_Lower', 'Ceiling', 'Ceiling_Lights', 'Partition', 'Floor_Carpet', 'Floor_Service', 'Wall_Mural', 'Neon_Sign', 'Snack_Sign', 'Claw_Glass', 'Lane_Beds', 'Approach', 'Lane_Arrows', 'Lane_Dots', 'Foul_Line', 'Masking_Art', 'Blacklights'].includes(m.name);
  });

  return {
    group,
    parts: { neon, monitors, settees, returns, racks, counter, arcade, disco },
    mirrorHide,
    disco: discoMesh,
  };
}
