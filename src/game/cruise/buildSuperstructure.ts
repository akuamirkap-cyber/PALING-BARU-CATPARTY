import * as THREE from 'three';
import { BRIDGE, FUNNEL, MAST, SHIP, TIERS, tierTop } from './dims';
import {
  box,
  cyl,
  extrudeUp,
  merge,
  planarUV,
  resample,
  rod,
  scaleUV,
  sphere,
  stadiumShape,
  stairs,
  tierOutline,
  tierShape,
  v3,
  type Geo,
} from './geom';
import type { ShipMaterials } from './materials';

function mesh(name: string, geo: Geo, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}

export interface SuperstructureBuild {
  group: THREE.Group;
  stairsGroup: THREE.Group;
  radar: THREE.Object3D;
  decals: THREE.Mesh[];
}

export function buildSuperstructure(M: ShipMaterials): SuperstructureBuild {
  const group = new THREE.Group();
  group.name = 'Superstructure';
  const decals: THREE.Mesh[] = [];
  const mullions: Geo[] = [];

  // --- Tingkat dek A, B, C ---
  for (const t of TIERS) {
    const body = scaleUV(extrudeUp(tierShape(t.x0, t.x1, t.hw, t.r), t.h, t.base), 0.25);
    group.add(mesh(t.name, body, [M.deckPaint, M.white]));
    const o = 0.035;
    const band = extrudeUp(tierShape(t.x0 - o, t.x1 + o, t.hw + o, t.r + o), t.bandH, t.base + t.band);
    group.add(mesh(`${t.name}_Windows`, band, M.glass));
    const outline = resample(tierOutline(t.x0 - 0.06, t.x1 + 0.06, t.hw + 0.06, t.r + 0.06, 0, 14), 1.05, true);
    for (const p of outline) {
      mullions.push(box(0.09, t.bandH + 0.04, 0.09, p.x, t.base + t.band + t.bandH / 2, p.z));
    }
  }

  // --- Anjungan (bridge) dengan sayap ---
  const C = TIERS[2];
  const bx = (BRIDGE.x0 + BRIDGE.x1) / 2;
  const bw = new THREE.BoxGeometry(BRIDGE.x1 - BRIDGE.x0, C.h, BRIDGE.hw * 2);
  bw.translate(bx, C.base + C.h / 2, 0);
  planarUV(bw, 0.25);
  group.add(mesh('Bridge_Wings', bw, [M.white, M.white, M.deckPaint, M.white, M.white, M.white]));
  const bandY = C.base + C.band;
  group.add(
    mesh(
      'Bridge_Windows',
      box(BRIDGE.x1 - BRIDGE.x0 + 0.07, C.bandH, BRIDGE.hw * 2 + 0.07, bx, bandY + C.bandH / 2, 0),
      M.glass,
    ),
  );
  for (let z = -BRIDGE.hw + 0.35; z <= BRIDGE.hw - 0.3; z += 0.75) {
    mullions.push(box(0.09, C.bandH + 0.04, 0.09, BRIDGE.x1 + 0.045, bandY + C.bandH / 2, z));
  }
  for (const s of [1, -1]) {
    for (let x = BRIDGE.x0 + 0.35; x < BRIDGE.x1; x += 0.65) {
      mullions.push(box(0.09, C.bandH + 0.04, 0.09, x, bandY + C.bandH / 2, s * (BRIDGE.hw + 0.045)));
    }
  }
  group.add(mesh('Window_Frames', merge(mullions), M.white));
  group.add(mesh('Bridge_Visor', box(0.55, 0.08, BRIDGE.hw * 2 + 0.3, BRIDGE.x1 + 0.22, tierTop(C) - 0.06, 0), M.white));

  // --- Pintu ---
  const D = SHIP.deckY;
  const A = TIERS[0];
  const B = TIERS[1];
  const doors: Geo[] = [
    box(0.1, 1.95, 0.95, A.x0 - 0.05, D + 0.975, -1.6),
    box(0.1, 1.95, 0.95, B.x0 - 0.05, B.base + 0.975, -1.0),
    box(0.1, 1.95, 0.95, C.x0 - 0.05, C.base + 0.975, 1.4),
  ];
  for (const s of [1, -1]) {
    for (const x of [-12.4, 5.3]) doors.push(box(0.95, 1.95, 0.1, x, D + 0.975, s * (A.hw + 0.05)));
  }
  group.add(mesh('Doors', merge(doors), M.door));

  // --- Cerobong asap (miring ke belakang) ---
  const fg = new THREE.Group();
  fg.name = 'Funnel';
  const shear = new THREE.Matrix4().set(1, -FUNNEL.rake, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const place = (geo: Geo) => {
    geo.applyMatrix4(shear);
    geo.translate(FUNNEL.x, tierTop(C), 0);
    return geo;
  };
  const st = stadiumShape(FUNNEL.len, FUNNEL.wid);
  const h1 = 2.35;
  const h2 = 2.7;
  const h3 = FUNNEL.h;
  fg.add(mesh('Funnel_Body', place(extrudeUp(st, h1, 0, 18)), M.funnel));
  fg.add(mesh('Funnel_Stripe', place(extrudeUp(st, h2 - h1, h1, 18)), M.white));
  fg.add(mesh('Funnel_Top', place(extrudeUp(st, h3 - h2, h2, 18)), M.funnelTop));
  fg.add(
    mesh(
      'Funnel_Opening',
      place(extrudeUp(stadiumShape(FUNNEL.len - 0.3, FUNNEL.wid - 0.3), 0.04, h3 - 0.01, 18)),
      M.soot,
    ),
  );
  fg.add(
    mesh(
      'Funnel_Exhaust',
      merge([cyl(0.17, 0.17, 0.95, -0.6, h3 + 0.2, 0, 12), cyl(0.12, 0.12, 0.7, 0.45, h3 + 0.1, 0, 12)].map(place)),
      M.darkMetal,
    ),
  );
  const logos: Geo[] = [];
  for (const s of [1, -1]) {
    const p = new THREE.PlaneGeometry(1.45, 1.45);
    if (s === -1) p.rotateY(Math.PI);
    p.translate(0, 1.2, s * (FUNNEL.wid / 2 + 0.02));
    logos.push(place(p));
  }
  const logoMesh = mesh('Funnel_Logo', merge(logos), M.logoDecal);
  fg.add(logoMesh);
  decals.push(logoMesh);
  group.add(fg);

  // --- Tiang radar & lampu navigasi ---
  const base = tierTop(C);
  const mx = MAST.x;
  const mastParts: Geo[] = [
    cyl(0.07, 0.13, MAST.top - base, mx, (MAST.top + base) / 2, 0, 10),
    box(0.09, 0.09, 2.8, mx, 12.7, 0),
    box(1.0, 0.08, 1.0, mx, 11.7, 0),
    cyl(0.05, 0.05, 0.32, mx, 11.88, 0, 8),
    rod(v3(mx, 12.7, 1.35), v3(mx - 1.4, base, 1.6), 0.02, 4),
    rod(v3(mx, 12.7, -1.35), v3(mx - 1.4, base, -1.6), 0.02, 4),
  ];
  group.add(mesh('Mast', merge(mastParts), M.metal));
  const radar = new THREE.Group();
  radar.name = 'Radar';
  radar.position.set(mx, 12.06, 0);
  radar.add(mesh('Radar_Antenna', merge([box(0.18, 0.14, 2.0, 0, 0, 0), box(0.1, 0.1, 0.1, 0, -0.09, 0)]), M.darkMetal));
  group.add(radar);
  group.add(mesh('NavLight_Mast', sphere(0.1, mx, MAST.top + 0.08, 0), M.navWhite));
  group.add(mesh('NavLight_Starboard', sphere(0.12, BRIDGE.x1 - 0.5, base + 0.16, BRIDGE.hw + 0.06), M.navGreen));
  group.add(mesh('NavLight_Port', sphere(0.12, BRIDGE.x1 - 0.5, base + 0.16, -(BRIDGE.hw + 0.06)), M.navRed));

  // Radome satelit di atap sayap anjungan
  const domes: Geo[] = [];
  for (const s of [1, -1]) {
    domes.push(cyl(0.1, 0.13, 0.5, bx, base + 0.25, s * 4.3, 8));
    domes.push(sphere(0.42, bx, base + 0.82, s * 4.3, 16, 12));
  }
  group.add(mesh('Radomes', merge(domes), M.buoyWhite));

  // --- Tangga antar dek & tangga monyet ---
  const stairsGroup = new THREE.Group();
  stairsGroup.name = 'Stairs';
  const lad: Geo[] = [];
  const lx = C.x0 - 0.12;
  for (const z of [-0.28, 0.28]) lad.push(box(0.06, C.h + 1.0, 0.06, lx, C.base + (C.h + 1.0) / 2, z));
  for (let y = C.base + 0.3; y < tierTop(C); y += 0.3) lad.push(box(0.05, 0.05, 0.56, lx, y, 0));
  const st1 = stairs({ x: -14.58, y: D, z: 0.3, yaw: 0, steps: 12, rise: (tierTop(A) - D) / 12, run: 0.28, width: 0.95, landing: 0.8 });
  const st2 = stairs({
    x: -11.58,
    y: tierTop(A),
    z: -0.4,
    yaw: 0,
    steps: 12,
    rise: (tierTop(B) - tierTop(A)) / 12,
    run: 0.28,
    width: 0.95,
    landing: 0.8,
  });
  stairsGroup.add(mesh('Stairs_Ladders', merge([...st1, ...st2, ...lad]), M.trim));

  return { group, stairsGroup, radar, decals };
}
