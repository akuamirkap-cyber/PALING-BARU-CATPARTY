import * as CANNON from "cannon-es";
import * as THREE from "three";
import { mat } from "./characterMesh";
import { makeBatMesh, makePanMesh, stripeTexture, beachBallTexture } from "./Arena";
import type { Bat } from "./Character";
// ============================================================
//  KAPAL PESIAR ASLI — diimport langsung dari game lain
//  (gang-beasts-cruise-ship-asset): lambung, dek, bangunan atas,
//  kolam, perosotan, sekoci, pagar, bendera — semua asli.
// ============================================================
import { buildShip } from "./cruise/buildShip";
import { COLOR_PRESETS } from "./cruise/materials";
import { SHIP, TIERS, BRIDGE, POOL, planFactor, insideTier } from "./cruise/dims";
import { createWaterNormalMap } from "./cruise/noise";
import { createWaterMaterial, type WaterUniforms } from "./cruise/waterMaterial";
import { polarGrid, buildSeabed, buildIslands } from "./cruise/seabed";

/**
 * Arena KAPAL PESIAR di laguna. Permukaan main = dek terbuka kapal asli
 * (di luar bangunan atas), dengan ubin jatuh ber-ring seperti arena lain.
 * Skala kapal diperkecil agar enak untuk brawl.
 */

export const BASE_SCALE = 0.4; // skala default (kapal 44 m → 17.6 m)

/** faktor lebar dek asli (dari game lain) pada skala tertentu */
export function shipHalfWidthAt(x: number, halfL: number, shipL: number, scale: number): number {
  const t = (x + halfL) / shipL;
  return (SHIP.beam / 2) * scale * planFactor(t);
}

/** area dek yang tertutup bangunan atas / kolam (tidak bisa jalan) */
function blockedIntervals(xWorld: number, scale: number): [number, number][] {
  const x = xWorld / scale; // koordinat asli kapal
  const iv: [number, number][] = [];
  for (const t of TIERS) {
    if (insideTier(t, x, 0) || (x >= t.x0 && x <= t.x1)) {
      if (x >= t.x0 - 0.2 && x <= t.x1 + 0.2) iv.push([-(t.hw + 0.15), t.hw + 0.15]);
    }
  }
  if (x >= BRIDGE.x0 - 0.2 && x <= BRIDGE.x1 + 0.2) iv.push([-(BRIDGE.hw + 0.15), BRIDGE.hw + 0.15]);
  // gabung interval yang tumpang tindih
  iv.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const cur of iv) {
    const last = merged[merged.length - 1];
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else merged.push([...cur]);
  }
  return merged.map(([a, b]) => [a * scale, b * scale]) as [number, number][];
}

/** interval z yang bisa dijalan di dek pada x tertentu (dalam world) */
function freeIntervals(xWorld: number, halfL: number, shipL: number, scale: number): [number, number][] {
  const hw = shipHalfWidthAt(xWorld, halfL, shipL, scale);
  const blocked = blockedIntervals(xWorld, scale);
  const free: [number, number][] = [];
  let cursor = -hw;
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, Math.min(a, hw)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < hw) free.push([cursor, hw]);
  return free.filter(([a, b]) => b - a > 0.45);
}

interface Tile {
  body: CANNON.Body;
  index: number;
  ring: number;
  state: "solid" | "shake" | "fall" | "gone";
  timer: number;
  baseX: number;
  baseZ: number;
  name: string;
  hx: number;
  hz: number;
}

interface DeckChunk {
  mesh: THREE.Group;
  edge: THREE.LineSegments;
  tile: Tile;
}

function deckTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  // warna dek kayu kapal asli (skema Klasik #c8915a)
  g.fillStyle = "#c8915a";
  g.fillRect(0, 0, S, S);
  const planks = 8;
  for (let i = 0; i < planks; i++) {
    const y = (i * S) / planks;
    const shade = 190 + ((i * 29) % 22);
    g.fillStyle = `rgb(${shade},${Math.floor(shade * 0.72)},${Math.floor(shade * 0.5)})`;
    g.fillRect(0, y, S, S / planks - 3);
    g.fillStyle = "rgba(96,58,28,.5)";
    g.fillRect(0, y + S / planks - 3, S, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Antarmuka arena yang dipakai Game — dipenuhi Arena (pesawat) & ShipArena (kapal). */
export interface ArenaLike {
  props: { body: CANNON.Body; mesh: THREE.Object3D }[];
  bats: Bat[];
  sweeper: { body: CANNON.Body; mesh: THREE.Group; active: boolean; speed: number } | null;
  isSafe(x: number, z: number, margin?: number): boolean;
  surfaceHeight(z: number): number;
  safeHalf(): number;
  randomSafePoint(margin?: number): { x: number; z: number };
  dropRing(ring: number): void;
  activateSweeper(): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

export class ShipArena implements ArenaLike {
  world: CANNON.World;
  scene: THREE.Scene;
  group = new THREE.Group();
  scale: number;
  shipL: number;
  halfL: number;
  deckY: number;
  private waterUniforms: WaterUniforms | null = null;
  private causticU: { uTime: { value: number } } | null = null;
  tiles: Tile[] = [];
  chunks: DeckChunk[] = [];
  props: { body: CANNON.Body; mesh: THREE.Object3D }[] = [];
  bats: Bat[] = [];
  sweeper: { body: CANNON.Body; mesh: THREE.Group; active: boolean; speed: number } | null = null;
  bodies: CANNON.Body[] = [];
  groundMat: CANNON.Material;
  ringsDropped = new Set<number>();
  tFly = 0;
  private animated: THREE.Object3D[] = [];

  constructor(world: CANNON.World, scene: THREE.Scene, groundMat: CANNON.Material, scale = BASE_SCALE) {
    this.world = world;
    this.scene = scene;
    this.groundMat = groundMat;
    this.scale = scale;
    this.shipL = SHIP.length * scale;
    this.halfL = this.shipL / 2;
    this.deckY = SHIP.deckY * scale; // dek utama jadi Y = 0
    scene.add(this.group);
    this.build();
  }

  private addBody(b: CANNON.Body) {
    this.world.addBody(b);
    this.bodies.push(b);
  }

  private build() {
    // ============================================================
    //  KAPAL ASLI dari game "Kapal Pesiar" (Wobbly Queen, skema Klasik)
    // ============================================================
    const ship = buildShip(COLOR_PRESETS[0].colors, "WOBBLY QUEEN");
    ship.group.scale.setScalar(this.scale);
    ship.group.position.y = -this.deckY; // dek utama jadi Y = 0
    this.group.add(ship.group);

    // ============================================================
    //  UBIN DEK — hanya di area dek TERBUKA (di luar bangunan atas),
    //  mengikuti outline lambung asli. Ring 3 (haluan/buritan) jatuh duluan.
    // ============================================================
    const COLS = Math.min(24, Math.max(8, Math.round(12 * this.scale / BASE_SCALE)));
    const colW = this.shipL / COLS;
    const ringOf = (t: number): 0 | 1 | 2 | 3 => {
      if (t < 0.07 || t > 0.92) return 3;
      if (t < 0.2 || t > 0.8) return 2;
      if (t < 0.33 || t > 0.68) return 1;
      return 0;
    };
    const tex = deckTexture();
    tex.repeat.set(3, 1);
    const deckMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.05 });
    const THICK = 1.2;
    for (let i = 0; i < COLS; i++) {
      const cx = -this.halfL + (i + 0.5) * colW;
      const t = (cx + this.halfL) / this.shipL;
      const ring = ringOf(t);
      // SATU kotak solid penuh per kolom (tanpa celah) — anti tembus
      const hz = shipHalfWidthAt(cx, this.halfL, this.shipL, this.scale);
      const hx = colW / 2;
      const name = `deck-${i}`;
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      // tebal 4m ke bawah → mustahil tembus (anti-tunneling)
      body.addShape(new CANNON.Box(new CANNON.Vec3(hx + 0.12, 2, hz + 0.12)), new CANNON.Vec3(0, 0, 0));
      body.position.set(cx, -2, 0);
      this.addBody(body);
      const tile: Tile = { body, index: this.tiles.length, ring, state: "solid", timer: 0, baseX: cx, baseZ: 0, name, hx, hz };
      this.tiles.push(tile);
      const geo = new THREE.BoxGeometry(hx * 2, 0.14, hz * 2);
      const chunk = new THREE.Group();
      const skin = new THREE.Mesh(geo, deckMat);
      skin.position.y = -0.07;
      skin.castShadow = false;
      skin.receiveShadow = true;
      chunk.add(skin);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: 0xd13c3c, transparent: true, opacity: 0 })
      );
      edge.position.y = -0.07;
      chunk.add(edge);
      chunk.position.set(cx, 0, 0);
      this.group.add(chunk);
      this.chunks.push({ mesh: chunk, edge, tile });
    }
    // collider bangunan atas & bridge (statis, cats tidak bisa masuk)
    {
      const blocker = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      for (const t of TIERS) {
        blocker.addShape(
          new CANNON.Box(new CANNON.Vec3((t.x1 - t.x0) / 2 * this.scale + 0.1, 3 * this.scale, t.hw * this.scale + 0.1)),
          new CANNON.Vec3(((t.x0 + t.x1) / 2) * this.scale, 3 * this.scale, 0)
        );
      }
      blocker.addShape(
        new CANNON.Box(new CANNON.Vec3((BRIDGE.x1 - BRIDGE.x0) / 2 * this.scale + 0.1, 3 * this.scale, BRIDGE.hw * this.scale + 0.1)),
        new CANNON.Vec3(((BRIDGE.x0 + BRIDGE.x1) / 2) * this.scale, 3 * this.scale, 0)
      );
      this.addBody(blocker);
    }

    // jaring pengaman: jika ada celah kecil antar ubin, kucing tertahan di sini
    {
      const net = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      net.addShape(new CANNON.Box(new CANNON.Vec3(this.halfL + 0.4, 0.6, (SHIP.beam / 2) * this.scale + 0.4)));
      net.position.set(0, -0.65, 0);
      this.addBody(net);
    }

    // ============================================================
    //  PEMANDANGAN LAGUNA (air, pulau + pohon kelapa, awan)
    // ============================================================
    const WATER_Y = -this.deckY; // garis air asli kapal
    // AIR LAUT ASLI (shader gelombang dari game lain, tanpa render-target refraksi)
    const normalMap = createWaterNormalMap();
    const { material: waterMat, uniforms } = createWaterMaterial(normalMap);
    this.waterUniforms = uniforms;
    uniforms.uSkyTop.value.set("#2b7bd0");
    uniforms.uSkyHorizon.value.set("#c3e8f6");
    uniforms.uShallow.value.set("#3ddbd0");
    uniforms.uDeep.value.set("#0a4f9c");
    uniforms.uFoamAmount.value = 0.22;
    const oceanRadius = Math.min(420, Math.max(260, this.shipL * 5));
    const water = new THREE.Mesh(polarGrid(oceanRadius, 90, 120, 2), waterMat);
    water.position.y = WATER_Y;
    water.frustumCulled = false;
    this.group.add(water);
    // DASAR LAUT + KARANG + PULAU (asli dari game lain)
    const caustic = { uTime: { value: 0 }, uCaustic: { value: 1.7 }, uSunColor: { value: new THREE.Color("#ffffff") } };
    const { seabed, decor } = buildSeabed(caustic as never);
    seabed.position.y = WATER_Y - 4.5;
    decor.position.y = WATER_Y - 4.5;
    this.group.add(seabed, decor);
    this.causticU = caustic;
    const islands = buildIslands();
    islands.group.position.y = WATER_Y;
    this.group.add(islands.group);
    // awan
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.15 });
    for (let k = 0; k < 14; k++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
      cloud.scale.set(2 + Math.random() * 2.4, 1.1 + Math.random() * 0.6, 1.6 + Math.random());
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 40;
      cloud.position.set(Math.cos(a) * r, 6 + Math.random() * 8, Math.sin(a) * r);
      cloud.userData.drift = 0.4 + Math.random() * 0.5;
      this.group.add(cloud);
      this.animated.push(cloud);
    }

    // ============================================================
    //  SENJATA & PROPS di dek terbuka
    // ============================================================
    const k = this.scale / BASE_SCALE;
    for (const [x, z, a] of [
      [3.2 * k, 1.0 * k, 0.6],
      [5.2 * k, -1.0 * k, -0.9],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.5, material: this.groundMat, linearDamping: 0.05, angularDamping: 0.25 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.72, 0.07)));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.48, 0));
      body.position.set(x, 0.2, z);
      body.quaternion.setFromEuler(Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makeBatMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "bat", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set(), centerOffset: 0.67, reach: 1.47, impactOffset: 1.2 });
    }
    for (const [x, z, a] of [
      [-6.2 * k, 1.0 * k, 0.4],
      [6.8 * k, 0.8 * k, -0.7],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.1, material: this.groundMat, linearDamping: 0.12, angularDamping: 0.26 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.065, 0.32, 0.065)), new CANNON.Vec3(0, -0.23, 0));
      const face = new CANNON.Quaternion();
      face.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(new CANNON.Cylinder(0.49, 0.49, 0.13, 16), new CANNON.Vec3(0, 0.36, 0), face);
      body.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.36, -0.006));
      body.position.set(x, 0.2, z);
      body.quaternion.setFromEuler(-Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makePanMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "pan", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set(), centerOffset: 0.65, reach: 1.52, impactOffset: 1.09 });
    }
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    for (const [x, z] of [
      [-6.6 * k, -1.2 * k],
      [7.4 * k, 1.2 * k],
      [7.4 * k, -1.2 * k],
      [-4.9 * k, 1.9 * k],
    ] as const) {
      const b = new CANNON.Body({ mass: 2.5, material: this.groundMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 0.45, 0.45)));
      b.position.set(x, 0.5, z);
      b.angularDamping = 0.3;
      this.addBody(b);
      const m = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, mat(0xffaa55, 0.8));
      box.castShadow = box.receiveShadow = true;
      m.add(box);
      m.add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94), mat(0xd9733a, 0.8)));
      this.group.add(m);
      this.props.push({ body: b, mesh: m });
    }
    {
      const b = new CANNON.Body({ mass: 0.5, material: this.groundMat, linearDamping: 0.15 });
      b.addShape(new CANNON.Sphere(0.55));
      b.position.set(1.0 * k, 1.5, -1.6 * k);
      this.addBody(b);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshStandardMaterial({ map: beachBallTexture(), roughness: 0.5 }));
      m.castShadow = true;
      this.group.add(m);
      this.props.push({ body: b, mesh: m });
    }
    // sweeper berputar di dek buritan yang terbuka
    {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(2.1 * k, 0.2, 0.2)), new CANNON.Vec3(0, 0, 0));
      b.addShape(new CANNON.Cylinder(0.45, 0.45, 1.2, 12), new CANNON.Vec3(0, -0.2, 0));
      b.position.set(-6.6 * k, -3, 0);
      this.addBody(b);
      const g = new THREE.Group();
      const stripeTex = stripeTexture();
      stripeTex.repeat.set(8, 1);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2 * k, 0.4, 0.4), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 }));
      bar.castShadow = true;
      g.add(bar);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 16), mat(0x6b7fd6, 0.4));
      pillar.position.y = -0.2;
      g.add(pillar);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), mat(0xff5a5a, 0.4));
      cap.position.y = 0.3;
      g.add(cap);
      g.position.set(-6.6 * k, -3, 0);
      this.group.add(g);
      this.sweeper = { body: b, mesh: g, active: false, speed: 0 };
    }
  }

  activateSweeper() {
    if (this.sweeper) this.sweeper.active = true;
  }

  dropRing(ring: number) {
    if (this.ringsDropped.has(ring)) return;
    this.ringsDropped.add(ring);
    for (const t of this.tiles) {
      if (t.ring === ring && t.state === "solid") {
        t.state = "shake";
        t.timer = 2.2 + Math.random() * 0.6;
      }
    }
  }

  /** Apakah posisi xz berada di atas dek kapal yang masih solid? */
  isSafe(x: number, z: number, margin = 0) {
    if (Math.abs(x) > this.halfL - margin) return false;
    if (Math.abs(z) > shipHalfWidthAt(x, this.halfL, this.shipL, this.scale) - margin) return false;
    for (const t of this.tiles) {
      if (t.state !== "solid") continue;
      if (Math.abs(x - t.baseX) <= t.hx - margin && Math.abs(z - t.baseZ) <= t.hz - margin) return true;
    }
    return false;
  }

  /** Dek kapal datar di Y = 0. */
  surfaceHeight(_z: number) {
    return 0;
  }

  safeHalf() {
    let mx = 0;
    let mz = 0;
    for (const t of this.tiles) {
      if (t.state !== "solid") continue;
      mx = Math.max(mx, Math.abs(t.baseX) + t.hx);
      mz = Math.max(mz, Math.abs(t.baseZ) + t.hz);
    }
    if (mx === 0) return 0;
    return Math.max(mx, mz);
  }

  randomSafePoint(margin = 0.8): { x: number; z: number } {
    const solid = this.tiles.filter((t) => t.state === "solid");
    const pool = solid.length ? solid : this.tiles;
    for (let i = 0; i < 80; i++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      const x = t.baseX + (Math.random() * 2 - 1) * Math.max(0.1, t.hx - margin);
      const z = t.baseZ + (Math.random() * 2 - 1) * Math.max(0.1, t.hz - margin);
      if (!this.isSafe(x, z, margin)) continue;
      // pastikan titik tidak berada di atas bangunan atas / bridge (blocked)
      const free = freeIntervals(x, this.halfL, this.shipL, this.scale);
      if (!free.some(([a, b]) => z >= a + 0.3 && z <= b - 0.3)) continue;
      return { x, z };
    }
    return { x: 6 * this.scale / BASE_SCALE, z: 0 };
  }

  update(dt: number, _time: number) {
    for (const t of this.tiles) {
      if (t.state === "shake") {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = "fall";
          t.body.velocity.set(0, -2, 0);
          t.body.angularVelocity.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
        }
      } else if (t.state === "fall") {
        t.body.velocity.y = Math.max(t.body.velocity.y - 18 * dt, -25);
        if (t.body.position.y < -45) {
          t.state = "gone";
          this.world.removeBody(t.body);
        }
      }
    }
    for (const ch of this.chunks) {
      const st = ch.tile.state;
      const edgeMat = ch.edge.material as THREE.LineBasicMaterial;
      if (st === "shake") {
        const j = 0.12;
        ch.mesh.position.set(
          ch.tile.baseX + (Math.random() - 0.5) * j,
          (Math.random() - 0.5) * j,
          ch.tile.baseZ + (Math.random() - 0.5) * j
        );
        edgeMat.opacity = 0.5 + 0.5 * Math.sin(this.tFly * 18);
      } else if (st === "fall") {
        edgeMat.opacity = 1;
        const body = ch.tile.body;
        const top = body.pointToWorldFrame(new CANNON.Vec3(0, 0.6, 0));
        ch.mesh.position.set(top.x, top.y, top.z);
        ch.mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        if (body.position.y < -45) ch.mesh.visible = false;
      } else if (st === "gone") {
        ch.mesh.visible = false;
      }
    }
    for (const b of this.bats) {
      if (b.flyT > 0) b.flyT -= dt;
      if (b.holder) continue;
      const inWorld = this.world.bodies.includes(b.body);
      if (inWorld) {
        b.mesh.position.set(b.body.position.x, b.body.position.y, b.body.position.z);
        b.mesh.quaternion.set(b.body.quaternion.x, b.body.quaternion.y, b.body.quaternion.z, b.body.quaternion.w);
        if (b.body.position.y < -40) {
          this.world.removeBody(b.body);
          b.mesh.visible = false;
        }
      }
    }
    for (const p of this.props) {
      p.mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
      p.mesh.quaternion.set(p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w);
      if (p.body.position.y < -40 && this.world.bodies.includes(p.body)) {
        this.world.removeBody(p.body);
        p.mesh.visible = false;
      }
    }
    if (this.sweeper) {
      const s = this.sweeper;
      if (s.active) {
        if (s.body.position.y < 0.45) {
          s.body.velocity.y = 1.2;
        } else {
          s.body.velocity.y = 0;
          s.body.position.y = 0.45;
          s.speed = Math.min(2.2, s.speed + dt * 0.08);
        }
        s.body.angularVelocity.set(0, s.speed, 0);
      }
      s.mesh.position.set(s.body.position.x, s.body.position.y, s.body.position.z);
      s.mesh.quaternion.set(s.body.quaternion.x, s.body.quaternion.y, s.body.quaternion.z, s.body.quaternion.w);
    }
    this.tFly += dt;
    if (this.waterUniforms) this.waterUniforms.uTime.value = this.tFly;
    if (this.causticU) this.causticU.uTime.value = this.tFly;
    for (const o of this.animated) {
      if (o.userData.drift) {
        o.position.x += o.userData.drift * dt;
        if (o.position.x > 70) o.position.x = -70;
      }
    }
  }

  dispose() {
    for (const b of this.bodies) if (this.world.bodies.includes(b)) this.world.removeBody(b);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.LineSegments).isLineSegments) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (!material) continue;
        materials.add(material);
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) textures.add(map);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    this.animated = [];
    this.chunks = [];
    this.scene.remove(this.group);
  }
}
