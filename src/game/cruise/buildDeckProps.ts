import * as THREE from 'three';
import {
  BRIDGE,
  FUNNEL,
  MAST,
  POOL,
  SHIP,
  SLIDE,
  TIERS,
  X_STERN,
  deckYAt,
  halfWidth,
  tierTop,
  topY,
  xToT,
  type Tier,
} from './dims';
import {
  beam,
  box,
  cyl,
  lifeBuoy,
  merge,
  railing,
  rod,
  tierOutline,
  trough,
  v3,
  type Gap,
  type Geo,
  type V3,
} from './geom';
import type { ShipMaterials } from './materials';

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

const D = SHIP.deckY;

/* ------------------------------ Pagar ------------------------------ */
function mainDeckRailPath(): V3[] {
  const xs: number[] = [];
  for (let x = 13.6; x > X_STERN + 1.4; x -= 1.15) xs.push(x);
  xs.push(X_STERN + 1.0, X_STERN + 0.5, X_STERN + SHIP.th / 2);
  const right = xs.map((x) => {
    const t = xToT(x);
    return v3(x, topY(t), halfWidth(t) - SHIP.th / 2);
  });
  const left = right
    .slice()
    .reverse()
    .map((p) => v3(p.x, p.y, -p.z));
  return [...right, ...left];
}

function buildRailings(M: ShipMaterials) {
  const g = grp('Railings');
  const A = TIERS[0];
  const B = TIERS[1];
  const C = TIERS[2];
  const inset = 0.12;
  const tierRail = (t: Tier, gaps: Gap[]) =>
    railing(tierOutline(t.x0 + inset, t.x1 - inset, t.hw - inset, t.r - inset, tierTop(t), 12), {
      closed: true,
      spacing: 1.2,
      gaps,
    });
  const rails: Geo[] = [
    ...railing(mainDeckRailPath(), { spacing: 1.2 }),
    ...tierRail(A, [{ x0: -14.3, x1: -13.5, z0: 3.55, z1: 4.6 }]),
    ...tierRail(B, [
      { x0: -11.3, x1: -10.5, z0: 2.85, z1: 3.95 },
      { x0: -11.3, x1: -10.5, z0: -2.75, z1: -1.55 },
    ]),
    ...tierRail(C, [
      { x0: -7.3, x1: -6.5, z0: -0.65, z1: 0.65 },
      { x0: BRIDGE.x0 - 0.15, x1: BRIDGE.x1 + 0.3, z0: -3.7, z1: 3.7 },
    ]),
    ...railing(
      [
        v3(2.5, tierTop(C), -3.3),
        v3(2.5, tierTop(C), -5.18),
        v3(4.28, tierTop(C), -5.18),
        v3(4.28, tierTop(C), 5.18),
        v3(2.5, tierTop(C), 5.18),
        v3(2.5, tierTop(C), 3.3),
      ],
      { spacing: 1.2 },
    ),
  ];
  g.add(mesh('Railings', merge(rails), M.trim));

  // Pelampung penyelamat yang digantung di pagar
  const orange: Geo[] = [];
  const white: Geo[] = [];
  const add = (b: { orange: Geo[]; white: Geo[] }) => {
    orange.push(...b.orange);
    white.push(...b.white);
  };
  const ty0 = topY(0);
  for (const z of [-2.6, 2.6]) add(lifeBuoy(X_STERN - 0.06, ty0 + 0.5, z, Math.PI / 2));
  for (const s of [1, -1]) {
    const x = 7.5;
    const t = xToT(x);
    add(lifeBuoy(x, topY(t) + 0.5, s * (halfWidth(t) - SHIP.th / 2 + 0.09), 0));
    add(lifeBuoy(-8.0, topY(xToT(-8)) + 0.5, s * (halfWidth(xToT(-8)) - SHIP.th / 2 + 0.09), 0));
  }
  g.add(mesh('LifeBuoys_Orange', merge(orange), M.buoyOrange));
  g.add(mesh('LifeBuoys_White', merge(white), M.buoyWhite));
  return g;
}

/* ------------------------------ Sekoci ----------------------------- */
function buildLifeboats(M: ShipMaterials) {
  const g = grp('Lifeboats');
  const hulls: Geo[] = [];
  const tops: Geo[] = [];
  const davits: Geo[] = [];
  const roof = tierTop(TIERS[0]);
  for (const x of [-9.2, -4.8, -0.4]) {
    for (const s of [1, -1]) {
      const cz = s * 5.2;
      const cy = 5.25;
      const body = new THREE.CapsuleGeometry(0.52, 1.9, 4, 14);
      body.rotateZ(Math.PI / 2);
      body.scale(1, 0.62, 1);
      body.translate(x, cy, cz);
      hulls.push(body);
      const top = new THREE.CapsuleGeometry(0.42, 1.5, 4, 14);
      top.rotateZ(Math.PI / 2);
      top.scale(1, 0.55, 0.92);
      top.translate(x, cy + 0.2, cz);
      tops.push(top);
      for (const dx of [-1.05, 1.05]) {
        const px = x + dx;
        const pz = s * 4.42;
        const ty = 6.95;
        davits.push(box(0.12, ty - roof, 0.12, px, (ty + roof) / 2, pz));
        davits.push(beam(v3(px, ty, pz), v3(px, ty, cz), 0.12));
        davits.push(beam(v3(px, ty - 0.55, pz), v3(px, ty, pz + s * 0.45), 0.08));
        davits.push(box(0.03, ty - (cy + 0.4), 0.03, px, (ty + cy + 0.4) / 2, cz));
      }
    }
  }
  g.add(mesh('Lifeboat_Hulls', merge(hulls), M.lifeboat));
  g.add(mesh('Lifeboat_Canopies', merge(tops), M.lifeboatTop));
  g.add(mesh('Lifeboat_Davits', merge(davits), M.metal));
  return g;
}

/* --------------------------- Kolam renang -------------------------- */
function buildPool(M: ShipMaterials) {
  const g = grp('Pool');
  const P = POOL;
  const wt = 0.22;
  const cx = (P.x0 + P.x1) / 2;
  const cz = (P.z0 + P.z1) / 2;
  const lx = P.x1 - P.x0;
  const lz = P.z1 - P.z0;
  g.add(
    mesh(
      'Pool_Walls',
      merge([
        box(lx, P.h, wt, cx, D + P.h / 2, P.z0 + wt / 2),
        box(lx, P.h, wt, cx, D + P.h / 2, P.z1 - wt / 2),
        box(wt, P.h, lz - 2 * wt, P.x0 + wt / 2, D + P.h / 2, cz),
        box(wt, P.h, lz - 2 * wt, P.x1 - wt / 2, D + P.h / 2, cz),
        box(lx - 2 * wt, 0.04, lz - 2 * wt, cx, D + 0.02, cz),
      ]),
      M.poolTile,
    ),
  );
  g.add(
    mesh(
      'Pool_Coping',
      merge([
        box(lx + 0.12, 0.07, wt + 0.12, cx, D + P.h + 0.035, P.z0 + wt / 2),
        box(lx + 0.12, 0.07, wt + 0.12, cx, D + P.h + 0.035, P.z1 - wt / 2),
        box(wt + 0.12, 0.07, lz - 2 * wt, P.x0 + wt / 2, D + P.h + 0.035, cz),
        box(wt + 0.12, 0.07, lz - 2 * wt, P.x1 - wt / 2, D + P.h + 0.035, cz),
      ]),
      M.white,
    ),
  );
  g.add(mesh('Pool_Water', box(lx - 2 * wt, P.water, lz - 2 * wt, cx, D + P.water / 2, cz), M.poolWater));
  const lad: Geo[] = [];
  for (const dx of [-0.28, 0.28]) {
    const x = -19.6 + dx;
    lad.push(rod(v3(x, D, P.z1 + 0.3), v3(x, D + 1.05, P.z1 + 0.3), 0.035));
    lad.push(rod(v3(x, D + 1.05, P.z1 + 0.3), v3(x, D + 1.05, P.z1 - 0.3), 0.035));
    lad.push(rod(v3(x, D + 1.05, P.z1 - 0.3), v3(x, D + 0.25, P.z1 - 0.3), 0.035));
  }
  for (const y of [D + 0.35, D + 0.65]) lad.push(rod(v3(-19.88, y, P.z1 - 0.3), v3(-19.32, y, P.z1 - 0.3), 0.03));
  g.add(mesh('Pool_Ladder', merge(lad), M.metal));
  return g;
}

/* --------------------------- Perosotan air ------------------------- */
export function createSlideCurve() {
  const S = SLIDE;
  const zLine = S.az + S.r;
  const pts: V3[] = [v3(-10.35, 8.35, zLine), v3(-12.4, 8.15, zLine), v3(-14.6, 7.93, zLine)];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const th = Math.PI / 2 + s * S.turns * Math.PI * 2;
    pts.push(v3(S.ax + S.r * Math.cos(th), S.top - s * (S.top - S.bottom), S.az + S.r * Math.sin(th)));
  }
  pts.push(v3(-17.3, 3.9, zLine), v3(-18.75, 3.86, zLine));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function buildSlide(M: ShipMaterials, curve: THREE.CatmullRomCurve3) {
  const g = grp('WaterSlide');
  const S = SLIDE;
  const tr = trough(curve, 300, S.trough, 12, 0.38);
  g.add(mesh('Slide_Trough', tr.geometry, M.slide));
  const rims = [tr.rimA, tr.rimB].map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.055, 6, false));
  g.add(mesh('Slide_Rims', merge(rims), M.buoyWhite));
  const sup: Geo[] = [cyl(0.15, 0.15, S.top + 0.3 - D, S.ax, (S.top + 0.3 + D) / 2, S.az, 12)];
  const arms = S.turns * 8;
  for (let i = 0; i <= arms; i++) {
    const s = i / arms;
    const th = Math.PI / 2 + s * S.turns * Math.PI * 2;
    const y = S.top - s * (S.top - S.bottom) - S.trough - 0.03;
    sup.push(beam(v3(S.ax, y, S.az), v3(S.ax + S.r * Math.cos(th), y, S.az + S.r * Math.sin(th)), 0.09));
  }
  sup.push(cyl(0.09, 0.09, 2.1, -12.9, tierTop(TIERS[0]) + 1.05, S.az + S.r, 8));
  sup.push(cyl(0.1, 0.1, 4.28, -14.75, D + 2.14, S.az + S.r, 8));
  sup.push(cyl(0.3, 0.34, 0.12, S.ax, D + 0.06, S.az, 14));
  g.add(mesh('Slide_Supports', merge(sup), M.metal));
  return g;
}

/* ------------------------ Kursi santai & payung -------------------- */
function lounger(x: number, y: number, z: number, yaw: number, frame: Geo[], cushion: Geo[]) {
  const parts: [Geo, boolean][] = [
    [box(0.62, 0.08, 1.85, 0, 0.3, 0), true],
    [box(0.06, 0.3, 0.06, -0.26, 0.15, -0.8), true],
    [box(0.06, 0.3, 0.06, 0.26, 0.15, -0.8), true],
    [box(0.06, 0.3, 0.06, -0.26, 0.15, 0.8), true],
    [box(0.06, 0.3, 0.06, 0.26, 0.15, 0.8), true],
    [box(0.56, 0.08, 1.1, 0, 0.38, -0.32), false],
    [box(0.62, 0.07, 0.8, 0, 0.6, 0.62, -0.62, 0, 0), true],
    [box(0.56, 0.07, 0.72, 0, 0.66, 0.58, -0.62, 0, 0), false],
  ];
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  for (const [geo, isFrame] of parts) {
    geo.applyMatrix4(m);
    (isFrame ? frame : cushion).push(geo);
  }
}

function umbrella(x: number, y: number, z: number, poles: Geo[], canopy: Geo[]) {
  poles.push(cyl(0.035, 0.035, 2.35, x, y + 1.175, z, 6));
  poles.push(cyl(0.22, 0.26, 0.08, x, y + 0.04, z, 12));
  const c = new THREE.ConeGeometry(1.15, 0.5, 8);
  c.translate(x, y + 2.55, z);
  canopy.push(c);
}

function buildLoungers(M: ShipMaterials) {
  const g = grp('Loungers');
  const frame: Geo[] = [];
  const cushion: Geo[] = [];
  const poles: Geo[] = [];
  const canA: Geo[] = [];
  const canB: Geo[] = [];
  for (const x of [-20.6, -19.4, -18.2]) lounger(x, D, 3.65, 0, frame, cushion);
  const yB = tierTop(TIERS[1]);
  for (const z of [-0.7, 0.4, 1.5]) lounger(-9.4, yB, z, Math.PI / 2, frame, cushion);
  const yC = tierTop(TIERS[2]);
  for (const z of [-1.2, 1.2]) lounger(-0.6, yC, z, Math.PI / 2, frame, cushion);
  umbrella(-20.0, D, 3.65, poles, canA);
  umbrella(-18.8, D, 3.65, poles, canB);
  umbrella(-9.4, yB, 2.75, poles, canA);
  umbrella(-0.6, yC, 0, poles, canB);
  g.add(mesh('Lounger_Frames', merge(frame), M.white));
  g.add(mesh('Lounger_Cushions', merge(cushion), M.cushion));
  g.add(mesh('Umbrella_Poles', merge(poles), M.metal));
  g.add(mesh('Umbrella_Canopy_A', merge(canA), M.umbrellaA));
  g.add(mesh('Umbrella_Canopy_B', merge(canB), M.umbrellaB));
  return g;
}

/* ------------------------------ Helipad ---------------------------- */
function buildHelipad(M: ShipMaterials) {
  const g = grp('Helipad');
  const hx = 13.4;
  const circle = new THREE.CircleGeometry(2.6, 40);
  circle.rotateX(-Math.PI / 2);
  circle.translate(hx, D + 0.012, 0);
  g.add(mesh('Helipad_Base', circle, M.helipad));
  const ring = new THREE.RingGeometry(2.18, 2.42, 48);
  ring.rotateX(-Math.PI / 2);
  ring.translate(hx, D + 0.02, 0);
  g.add(mesh('Helipad_Ring', ring, M.yellowPaint));
  g.add(
    mesh(
      'Helipad_H',
      merge([
        box(1.5, 0.02, 0.26, hx, D + 0.025, -0.55),
        box(1.5, 0.02, 0.26, hx, D + 0.025, 0.55),
        box(0.26, 0.02, 0.84, hx, D + 0.025, 0),
      ]),
      M.buoyWhite,
    ),
  );
  return g;
}

/* ---------------------- Mesin jangkar & bolder --------------------- */
function buildDeckGear(M: ShipMaterials) {
  const g = grp('DeckGear');
  const wx = 18.4;
  g.add(mesh('Windlass_Base', box(1.5, 0.35, 1.4, wx, D + 0.175, 0), M.darkMetal));
  const drums: Geo[] = [];
  for (const s of [1, -1]) {
    drums.push(cyl(0.32, 0.32, 0.46, wx, D + 0.62, s * 0.42, 14, Math.PI / 2, 0, 0));
    drums.push(cyl(0.4, 0.4, 0.05, wx, D + 0.62, s * 0.68, 14, Math.PI / 2, 0, 0));
  }
  g.add(mesh('Windlass_Drums', merge(drums), M.metal));
  const chain: Geo[] = [];
  for (const s of [1, -1]) {
    chain.push(beam(v3(wx + 0.3, D + 0.05, s * 0.42), v3(19.9, D + 0.05, s * 1.05), 0.12, 0.05));
  }
  g.add(mesh('Anchor_Chains', merge(chain), M.rope));
  const bol: Geo[] = [];
  const pairs: [number, number][] = [
    [11.0, 4.45],
    [16.0, 3.1],
    [-17.0, 5.15],
    [-6.0, 5.4],
  ];
  for (const [x, zz] of pairs) {
    for (const s of [1, -1]) {
      const z = s * zz;
      bol.push(box(0.95, 0.06, 0.42, x, D + 0.03, z));
      bol.push(cyl(0.15, 0.17, 0.42, x - 0.24, D + 0.24, z, 12));
      bol.push(cyl(0.15, 0.17, 0.42, x + 0.24, D + 0.24, z, 12));
      bol.push(cyl(0.2, 0.2, 0.05, x - 0.24, D + 0.46, z, 12));
      bol.push(cyl(0.2, 0.2, 0.05, x + 0.24, D + 0.46, z, 12));
    }
  }
  g.add(mesh('Bollards', merge(bol), M.darkMetal));
  return g;
}

/* ---------------------------- Peti & tong -------------------------- */
function buildCargo(M: ShipMaterials) {
  const g = grp('Cargo');
  const crates: Geo[] = [
    box(1, 1, 1, 10.45, D + 0.5, -3.6),
    box(1, 1, 1, 11.5, D + 0.5, -3.55, 0, 0.12, 0),
    box(1, 1, 1, 10.95, D + 1.5, -3.6, 0, -0.2, 0),
    box(0.9, 0.9, 0.9, 16.2, D + 0.45, 1.85, 0, 0.3, 0),
    box(0.9, 0.9, 0.9, 16.05, D + 0.45, 2.85, 0, -0.1, 0),
    box(0.8, 0.8, 0.8, -16.6, D + 0.4, 1.3, 0, 0.4, 0),
  ];
  g.add(mesh('Crates', merge(crates), M.crate));
  const red: Geo[] = [];
  const blue: Geo[] = [];
  const hoops: Geo[] = [];
  const barrels: [number, number, boolean][] = [
    [12.5, -4.05, true],
    [12.65, -3.25, false],
    [11.1, 4.0, true],
    [-17.4, 2.1, false],
  ];
  for (const [x, z, isRed] of barrels) {
    (isRed ? red : blue).push(cyl(0.35, 0.35, 0.95, x, D + 0.475, z, 14));
    for (const dy of [0.2, 0.75]) hoops.push(cyl(0.365, 0.365, 0.06, x, D + dy, z, 14));
  }
  g.add(mesh('Barrels_Red', merge(red), M.barrelA));
  g.add(mesh('Barrels_Blue', merge(blue), M.barrelB));
  g.add(mesh('Barrel_Hoops', merge(hoops), M.darkMetal));
  return g;
}

/* --------------------------- Bendera hias -------------------------- */
const FLAG_COLORS = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#ffffff', '#f77f00', '#8338ec', '#1d3557'];

function buildFlags(M: ShipMaterials) {
  const g = grp('Flags');
  const pos: number[] = [];
  const col: number[] = [];
  const line: Geo[] = [];
  const bulbs: Geo[] = [];
  const color = new THREE.Color();
  const pushTri = (a: V3, b: V3, c: V3, hex: string) => {
    color.set(hex);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  const dressLine = (a: V3, b: V3, sag: number, offset: number) => {
    const n = Math.max(3, Math.round(a.distanceTo(b) / 0.6));
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const p = a.clone().lerp(b, s);
      p.y -= sag * 4 * s * (1 - s);
      pts.push(p);
    }
    for (let i = 0; i < n; i++) line.push(beam(pts[i], pts[i + 1], 0.03));
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const m1 = p.clone().lerp(q, 0.12);
      const m2 = p.clone().lerp(q, 0.82);
      const tip = p.clone().lerp(q, 0.47);
      tip.y -= 0.5;
      pushTri(m1, m2, tip, FLAG_COLORS[(i + offset) % FLAG_COLORS.length]);
      if (i % 2 === 0) {
        const bulb = new THREE.IcosahedronGeometry(0.07, 0);
        bulb.translate(p.x, p.y, p.z);
        bulbs.push(bulb);
      }
    }
  };
  const C = TIERS[2];
  const fTop = tierTop(C) + FUNNEL.h - 0.1;
  const fShift = FUNNEL.rake * FUNNEL.h;
  const bowX = 21.55;
  const bowBase = deckYAt(xToT(bowX));
  const sternX = X_STERN + 0.45;
  const mastTop = v3(MAST.x, MAST.top - 0.1, 0);
  dressLine(mastTop, v3(bowX, 6.7, 0), 0.45, 0);
  dressLine(mastTop, v3(FUNNEL.x + FUNNEL.len / 2 - fShift + 0.05, fTop, 0), 0.12, 3);
  dressLine(v3(FUNNEL.x - FUNNEL.len / 2 - fShift - 0.05, fTop, 0), v3(sternX, 7.3, 0), 0.5, 5);

  // Bendera buritan (ensign) & panji haluan
  const sTop = v3(sternX, 7.3, 0);
  const ensign: [string, number, number][] = [
    ['#ff5d8f', 0, 0.27],
    ['#ffd166', 0.27, 0.54],
    ['#3fa7d6', 0.54, 0.8],
  ];
  for (const [hex, a, b] of ensign) {
    const p0 = v3(sTop.x, sTop.y - a, 0);
    const p1 = v3(sTop.x - 1.25, sTop.y - a - 0.05, 0);
    const p2 = v3(sTop.x - 1.25, sTop.y - b - 0.05, 0);
    const p3 = v3(sTop.x, sTop.y - b, 0);
    pushTri(p0, p1, p2, hex);
    pushTri(p0, p2, p3, hex);
  }
  pushTri(v3(bowX, 6.65, 0), v3(bowX, 6.15, 0), v3(bowX - 0.95, 6.4, 0), '#e63946');

  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flagGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  flagGeo.computeVertexNormals();
  g.add(mesh('Signal_Flags', flagGeo, M.flags));
  g.add(mesh('Flag_Lines', merge(line), M.rope));
  g.add(mesh('Flag_Bulbs', merge(bulbs), M.bulb));
  g.add(
    mesh(
      'Flag_Staffs',
      merge([rod(v3(bowX, bowBase, 0), v3(bowX, 6.75, 0), 0.045), rod(v3(sternX, D, 0), v3(sternX, 7.35, 0), 0.05)]),
      M.metal,
    ),
  );
  return g;
}

export interface DeckPropsBuild {
  railings: THREE.Group;
  lifeboats: THREE.Group;
  pool: THREE.Group;
  slide: THREE.Group;
  loungers: THREE.Group;
  helipad: THREE.Group;
  deckGear: THREE.Group;
  cargo: THREE.Group;
  flags: THREE.Group;
  slideCurve: THREE.CatmullRomCurve3;
}

export function buildDeckProps(M: ShipMaterials): DeckPropsBuild {
  const slideCurve = createSlideCurve();
  return {
    railings: buildRailings(M),
    lifeboats: buildLifeboats(M),
    pool: buildPool(M),
    slide: buildSlide(M, slideCurve),
    loungers: buildLoungers(M),
    helipad: buildHelipad(M),
    deckGear: buildDeckGear(M),
    cargo: buildCargo(M),
    flags: buildFlags(M),
    slideCurve,
  };
}
