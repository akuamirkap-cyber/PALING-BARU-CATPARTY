import * as THREE from 'three';
import { ROOF, ST, STANDS, rowY, roofY, standBackZ, standMatrix, standTopY, type StandDef } from './dims';
import { beam, box, merge, rod, v3, type Geo } from '../ship/geom';
import type { StadiumMaterials } from './materials';

const GLYPHS: Record<string, string[]> = {
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
};

export interface SeatSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** kursi di area mosaik huruf — dibiarkan kosong agar tulisan terbaca */
  letter?: boolean;
}

function mesh(name: string, geo: Geo, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  return m;
}

let seatCache: { pos: Float32Array; nrm: Float32Array } | null = null;
function seatTemplate() {
  if (seatCache) return seatCache;
  const s = new THREE.Shape();
  s.moveTo(-0.22, 0.24);
  s.lineTo(0.2, 0.24);
  s.lineTo(0.27, 0.86);
  s.lineTo(0.17, 0.86);
  s.lineTo(0.11, 0.34);
  s.lineTo(-0.22, 0.34);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.46, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(0.23, 0, 0);
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  seatCache = {
    pos: ng.getAttribute('position').array as Float32Array,
    nrm: ng.getAttribute('normal').array as Float32Array,
  };
  return seatCache;
}

function seatsGeometry(spots: [number, number, number][]): Geo {
  const t = seatTemplate();
  const n = t.pos.length;
  const pos = new Float32Array(n * spots.length);
  const nrm = new Float32Array(n * spots.length);
  spots.forEach(([x, y, z], k) => {
    const o = k * n;
    for (let i = 0; i < n; i += 3) {
      pos[o + i] = t.pos[i] + x;
      pos[o + i + 1] = t.pos[i + 1] + y;
      pos[o + i + 2] = t.pos[i + 2] + z;
      nrm[o + i] = t.nrm[i];
      nrm[o + i + 1] = t.nrm[i + 1];
      nrm[o + i + 2] = t.nrm[i + 2];
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

function standProfile(s: StandDef) {
  const base = ST.deckY;
  const sh = new THREE.Shape();
  sh.moveTo(s.z0, base);
  sh.lineTo(s.z0, rowY(s, 0));
  for (let i = 0; i < s.rows; i++) {
    const ze = s.z0 + (i + 1) * s.rowD;
    sh.lineTo(ze, rowY(s, i));
    sh.lineTo(ze, i + 1 < s.rows ? rowY(s, i + 1) : standTopY(s));
  }
  const zb = standBackZ(s);
  const top = standTopY(s);
  sh.lineTo(zb, top);
  sh.lineTo(zb, top + 1.0);
  sh.lineTo(zb + 0.3, top + 1.0);
  sh.lineTo(zb + 0.3, base);
  sh.closePath();
  return sh;
}

/** Ekstrusi profil (bidang ZY lokal) sepanjang sumbu X lokal. */
function extrudeAlongX(shape: THREE.Shape, length: number): Geo {
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate(length / 2, 0, 0);
  return g;
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function buildStands(M: StadiumMaterials) {
  const stands = new THREE.Group();
  stands.name = 'Stands';
  const roofs = new THREE.Group();
  roofs.name = 'Roofs';
  const screens = new THREE.Group();
  screens.name = 'Screens';
  const seatSpots: SeatSpot[] = [];
  const base = ST.deckY;

  for (const s of STANDS) {
    const mat = standMatrix(s);
    const add = (group: THREE.Group, name: string, geos: Geo[], material: THREE.Material | THREE.Material[]) => {
      if (!geos.length) return;
      const g = merge(geos);
      g.applyMatrix4(mat);
      group.add(mesh(`${s.name}_${name}`, g, material));
    };
    const top = standTopY(s);
    const zb = standBackZ(s);

    // --- massa tribun ---
    const body = extrudeAlongX(standProfile(s), s.length);
    body.applyMatrix4(mat);
    stands.add(mesh(s.name, body, [M.facade, M.concrete]));
    add(stands, 'FrontWall', [box(s.length, s.front - 0.04, 0.06, 0, base + (s.front - 0.04) / 2, s.z0 - 0.03)], M.facade);
    add(stands, 'Coping', [box(s.length, 0.07, 0.24, 0, rowY(s, 0) + 0.035, s.z0 + 0.12)], M.trim);

    // --- lorong tangga ---
    const steps: Geo[] = [];
    const nosing: Geo[] = [];
    const rails: Geo[] = [];
    for (const ax of s.aisles) {
      for (let i = 0; i < s.rows; i++) {
        const zi = s.z0 + i * s.rowD;
        const y = rowY(s, i);
        steps.push(box(1.0, s.rise / 2, s.rowD / 2, ax, y + s.rise / 4, zi + s.rowD * 0.75));
        nosing.push(box(1.0, 0.025, 0.07, ax, y + 0.013, zi + 0.035));
        nosing.push(box(1.0, 0.025, 0.07, ax, y + s.rise / 2 + 0.013, zi + s.rowD / 2 + 0.035));
        if (i % 3 === 0) rails.push(rod(v3(ax, y, zi + 0.3), v3(ax, y + 0.95, zi + 0.3), 0.035, 6));
      }
      rails.push(rod(v3(ax, rowY(s, 0) + 0.95, s.z0 + 0.3), v3(ax, rowY(s, s.rows - 1) + 0.95 + s.rise * 0.5, s.z0 + (s.rows - 0.4) * s.rowD), 0.04, 6));
    }
    add(stands, 'AisleSteps', steps, M.concrete);
    add(stands, 'AisleNosing', nosing, M.yellow);
    add(stands, 'Handrails', rails, M.trim);

    // --- kursi + pola ---
    const xs: number[] = [];
    for (let x = s.length / 2 - 0.45; x >= -s.length / 2 + 0.45; x -= 0.62) {
      if (s.aisles.some((a) => Math.abs(x - a) < 0.74)) continue;
      xs.push(x);
    }
    const ncols = xs.length;
    let isB: (row: number, col: number) => boolean;
    let letterBox = (col: number) => col < 0;
    if (s.letters) {
      const letters = s.letters.split('');
      const W = letters.length * 6 - 1;
      const c0 = Math.floor((ncols - W) / 2);
      letterBox = (col) => col >= c0 - 1 && col <= c0 + W;
      isB = (row, col) => {
        const gr = s.rows - 1 - row;
        if (gr < 0 || gr > 6) return false;
        const cc = col - c0;
        if (cc < 0 || cc >= W) return false;
        const li = Math.floor(cc / 6);
        const lx = cc % 6;
        if (lx === 5) return false;
        return GLYPHS[letters[li]]?.[gr]?.[lx] === '1';
      };
    } else {
      isB = (row, col) => Math.abs(row - (s.rows / 2 - 0.5 + 3.2 * Math.sin(col * 0.2 + s.yaw))) < 0.9 || hash(row, col + s.yaw * 10) < 0.06;
    }
    const spotsA: [number, number, number][] = [];
    const spotsB: [number, number, number][] = [];
    const pv = new THREE.Vector3();
    for (let i = 0; i < s.rows; i++) {
      const y = rowY(s, i);
      const z = s.z0 + i * s.rowD + s.rowD - 0.36;
      xs.forEach((x, col) => {
        const b = isB(i, col);
        (b ? spotsB : spotsA).push([x, y, z]);
        pv.set(x, y + 0.34, z - 0.02).applyMatrix4(mat);
        seatSpots.push({ x: pv.x, y: pv.y, z: pv.z, yaw: s.yaw, letter: !!s.letters && letterBox(col) });
      });
    }
    for (const [list, m, name] of [
      [spotsA, M.seatA, 'Seats_Main'],
      [spotsB, M.seatB, 'Seats_Pattern'],
    ] as const) {
      if (!list.length) continue;
      const g = seatsGeometry(list as [number, number, number][]);
      g.applyMatrix4(mat);
      stands.add(mesh(`${s.name}_${name}`, g, m));
    }

    // --- fasad belakang bersirip ---
    const h = top + 1.0 - base;
    const finsA: Geo[] = [];
    const finsB: Geo[] = [];
    const gates: Geo[] = [];
    const gateXs = s.length > 30 ? [-s.length / 4, s.length / 4] : [0];
    const crestGap = s.crest ? 3.4 : 0;
    let k = 0;
    for (let x = -s.length / 2 + 0.7; x <= s.length / 2 - 0.6; x += 1.4) {
      k++;
      if (gateXs.some((gx) => Math.abs(x - gx) < 1.5) || Math.abs(x) < crestGap) continue;
      (k % 2 ? finsA : finsB).push(box(0.42, h, 0.45, x, base + h / 2, zb + 0.3 + 0.225));
    }
    for (const gx of gateXs) {
      gates.push(box(2.4, 2.7, 0.12, gx, base + 1.35, zb + 0.36));
      finsA.push(box(3.0, 0.5, 0.6, gx, base + 2.95, zb + 0.6));
    }
    add(stands, 'FacadeFins', finsA, M.facade);
    add(stands, 'FacadeFinsAlt', finsB, M.seatB);
    add(stands, 'Gates', gates, M.door);
    if (s.crest) {
      add(stands, 'CrestPanel', [box(6.8, h, 0.25, 0, base + h / 2, zb + 0.42)], M.facade);
      const crest = new THREE.PlaneGeometry(5.6, 5.6);
      crest.translate(0, base + h * 0.55, zb + 0.56);
      add(stands, 'Crest', [crest], M.crest);
    }

    // --- boks VIP ---
    if (s.vip) {
      const zc = s.z0 + s.rows * s.rowD;
      const d = zb - zc;
      const vip: Geo[] = [
        box(20, 0.25, d + 0.2, 0, top + 2.6, zc + d / 2),
        box(20, 2.5, 0.2, 0, top + 1.25, zb - 0.1),
        box(0.25, 2.5, d, -10, top + 1.25, zc + d / 2),
        box(0.25, 2.5, d, 10, top + 1.25, zc + d / 2),
      ];
      for (let x = -8; x <= 8; x += 2) vip.push(box(0.1, 2.4, 0.1, x, top + 1.25, zc + 0.12));
      add(stands, 'VIP_Box', vip, M.facade);
      const glass = new THREE.PlaneGeometry(19.8, 2.35);
      glass.rotateY(Math.PI);
      glass.translate(0, top + 1.25, zc + 0.1);
      add(stands, 'VIP_Glass', [glass], M.glass);
    }

    // --- atap kantilever ---
    if (s.roof) {
      const n = 16;
      const topPts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const z = ROOF.zBack - ((ROOF.zBack - ROOF.zFront) * i) / n;
        topPts.push([z, roofY(z)]);
      }
      const sh = new THREE.Shape();
      sh.moveTo(topPts[0][0], topPts[0][1]);
      topPts.slice(1).forEach(([z, y]) => sh.lineTo(z, y));
      [...topPts].reverse().forEach(([z, y]) => sh.lineTo(z, y - ROOF.thick));
      sh.closePath();
      const roof = extrudeAlongX(sh, ROOF.hx * 2);
      roof.applyMatrix4(mat);
      roofs.add(mesh(`${s.name}_Roof`, roof, [M.steel, M.roof]));

      const truss: Geo[] = [];
      const yUnder = (z: number) => roofY(z) - ROOF.thick - 0.08;
      const zF = ROOF.zFront + 0.7;
      const bot0 = 10.6;
      const bot1 = yUnder(zF) - 0.45;
      const botY = (z: number) => bot0 + ((bot1 - bot0) * (ROOF.zBack - z)) / (ROOF.zBack - zF);
      for (let x = -21; x <= 21; x += 7) {
        truss.push(box(0.55, yUnder(ROOF.zBack) - base, 0.55, x, (yUnder(ROOF.zBack) + base) / 2, ROOF.zBack));
        for (let i = 0; i < n; i++) {
          const za = topPts[i][0];
          const zbb = topPts[i + 1][0];
          truss.push(beam(v3(x, yUnder(za), za), v3(x, yUnder(zbb), zbb), 0.22));
        }
        truss.push(beam(v3(x, bot0, ROOF.zBack), v3(x, bot1, zF), 0.22));
        const webs = 6;
        for (let w = 1; w <= webs; w++) {
          const z = ROOF.zBack - ((ROOF.zBack - zF) * w) / webs;
          truss.push(rod(v3(x, botY(z), z), v3(x, yUnder(z), z), 0.07, 6));
          if (w < webs) {
            const z2 = ROOF.zBack - ((ROOF.zBack - zF) * (w + 1)) / webs;
            truss.push(rod(v3(x, botY(z), z), v3(x, yUnder(z2), z2), 0.06, 6));
          }
        }
        truss.push(rod(v3(x, yUnder(ROOF.zBack), ROOF.zBack), v3(x, base, ROOF.zBack + 5), 0.09, 8));
        truss.push(box(0.9, 0.2, 0.9, x, base + 0.1, ROOF.zBack + 5));
      }
      truss.push(box(ROOF.hx * 2, 1.15, 0.3, 0, roofY(ROOF.zFront) - 0.35, ROOF.zFront - 0.12));
      add(roofs, 'Truss', truss, M.steel);
      const fascia = new THREE.PlaneGeometry(ROOF.hx * 2 - 0.8, 1.0);
      fascia.rotateY(Math.PI);
      fascia.translate(0, roofY(ROOF.zFront) - 0.35, ROOF.zFront - 0.28);
      add(roofs, 'Fascia', [fascia], M.fascia);
      const housings: Geo[] = [];
      const lenses: Geo[] = [];
      for (let x = -20.3; x <= 20.4; x += 2.9) {
        const yl = roofY(ROOF.zFront) - 1.08;
        housings.push(box(0.7, 0.22, 0.36, x, yl + 0.1, ROOF.zFront + 0.25));
        const lens = new THREE.PlaneGeometry(0.6, 0.3);
        lens.rotateX(Math.PI / 2 + 0.6);
        lens.translate(x, yl - 0.02, ROOF.zFront + 0.22);
        lenses.push(lens);
      }
      add(roofs, 'Lamps', housings, M.darkMetal);
      add(roofs, 'LampLenses', lenses, M.lamp);
    }

    // --- layar raksasa ---
    if (s.screen) {
      const zs = zb + 0.95;
      const yb = top + 1.6;
      add(
        screens,
        'Frame',
        [
          box(12.4, 6.0, 0.6, 0, yb + 3.0, zs),
          box(12.9, 0.25, 1.1, 0, yb + 6.12, zs),
          box(0.6, yb - base, 0.6, -4.8, (yb + base) / 2, zs),
          box(0.6, yb - base, 0.6, 4.8, (yb + base) / 2, zs),
        ],
        M.screenFrame,
      );
      const scr = new THREE.PlaneGeometry(12, 5.6);
      scr.rotateY(Math.PI);
      scr.translate(0, yb + 3.0, zs - 0.31);
      add(screens, 'Display', [scr], M.jumbotron);
      const back = new THREE.PlaneGeometry(4.6, 4.6);
      back.translate(0, yb + 3.0, zs + 0.31);
      add(screens, 'BackCrest', [back], M.crest);
    }
  }
  return { stands, roofs, screens, seatSpots };
}
