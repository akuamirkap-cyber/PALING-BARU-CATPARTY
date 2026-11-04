import * as CANNON from "cannon-es";
import * as THREE from "three";
import { mat } from "./characterMesh";
import type { Bat } from "./Character";

export const TILE = 3.1;
export const GRID = 9;
export const HALF = (TILE * GRID) / 2;
const THICK = 1.25;

// Top-down silhouette of the playable airframe: pointed nose, wide wings, tapered tail.
const AIRFRAME: [number, number][] = [
  // nose -> narrow fuselage -> wing leading/trailing edges -> tail plane
  [0, -15], [-1.4, -13], [-2.6, -9], [-3.1, -5], [-3.3, -2],
  [-6, -2.2], [-12.7, -4], [-13.5, -3.4], [-13, 0.8], [-6.8, 2.3], [-3.2, 1.5],
  [-3.1, 6.4], [-4.8, 7.4], [-7.2, 8.1], [-7.4, 9.2], [-5.8, 9.6], [-2.6, 8.9], [0, 8.5],
  [2.6, 8.9], [5.8, 9.6], [7.4, 9.2], [7.2, 8.1], [4.8, 7.4], [3.1, 6.4], [3.2, 1.5],
  [6.8, 2.3], [13, 0.8], [13.5, -3.4], [12.7, -4], [6, -2.2], [3.3, -2], [3.1, -5],
  [2.6, -9], [1.4, -13],
];
function planeContains(x: number, z: number) {
  let inside = false;
  for (let i = 0, j = AIRFRAME.length - 1; i < AIRFRAME.length; j = i++) {
    const [xi, zi] = AIRFRAME[i], [xj, zj] = AIRFRAME[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function clipPlane(poly: THREE.Vector2[], axis: "x" | "y", bound: number, positive: boolean) {
  const out: THREE.Vector2[] = [];
  const value = (p: THREE.Vector2) => axis === "x" ? p.x : p.y;
  const inside = (v: number) => positive ? v >= bound : v <= bound;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const va = value(a), vb = value(b), ia = inside(va), ib = inside(vb);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (bound - va) / (vb - va);
      out.push(new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  return out;
}
function planeSkinCell(x: number, z: number, half: number, material: THREE.Material) {
  let p = AIRFRAME.map(([px, pz]) => new THREE.Vector2(px, pz));
  p = clipPlane(p, "x", x - half, true);
  p = clipPlane(p, "x", x + half, false);
  p = clipPlane(p, "y", z - half, true);
  p = clipPlane(p, "y", z + half, false);
  if (p.length < 3) return null;
  const faces = THREE.ShapeUtils.triangulateShape(p, []);
  const positions: number[] = [];
  // Each clipped piece carries an exactly matching triangle collider, so collision
  // never extends past the wing, nose or tail outline.
  const vertices: number[] = [];
  for (const q of p) vertices.push(q.x - x, 0, q.y - z);
  const indices: number[] = [];
  for (const f of faces) {
    const [ia, ib, ic] = f;
    const a = p[ia], b = p[ib], c = p[ic];
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    // Upward normals for Cannon's one-sided triangle mesh collision.
    if (area > 0) indices.push(ia, ic, ib);
    else indices.push(ia, ib, ic);
    for (const q of f) positions.push(p[q].x - x, 0.002, p[q].y - z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return { mesh: new THREE.Mesh(geo, material), vertices, indices };
}

interface Tile {
  body: CANNON.Body;
  mesh: THREE.Mesh;
  ring: number;
  state: "solid" | "shake" | "fall" | "gone";
  timer: number;
  baseX: number;
  baseZ: number;
}

export class Arena {
  world: CANNON.World;
  scene: THREE.Scene;
  group = new THREE.Group();
  tiles: Tile[] = [];
  tileGrid: (Tile | null)[] = Array(GRID * GRID).fill(null);
  props: { body: CANNON.Body; mesh: THREE.Object3D }[] = [];
  bats: Bat[] = [];
  sweeper: { body: CANNON.Body; mesh: THREE.Group; active: boolean; speed: number } | null = null;
  bodies: CANNON.Body[] = [];
  groundMat: CANNON.Material;
  ringsDropped = new Set<number>();
  spinners: THREE.Object3D[] = [];
  blinking: THREE.MeshBasicMaterial[] = [];
  shipGroup: THREE.Group | null = null;
  streaks: THREE.Mesh[] = [];
  streaks2: THREE.Mesh[] = [];

  constructor(world: CANNON.World, scene: THREE.Scene, groundMat: CANNON.Material) {
    this.world = world;
    this.scene = scene;
    this.groundMat = groundMat;
    scene.add(this.group);
    this.build();
  }

  private addBody(b: CANNON.Body) {
    this.world.addBody(b);
    this.bodies.push(b);
  }

  private build() {
    // Collider seams are invisible. Each visual patch is clipped to the plane outline,
    // so together they are the aircraft's continuous walkable skin, not a floor deck.
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xfff5df, roughness: 0.66, side: THREE.DoubleSide });
    const borderMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a63, side: THREE.DoubleSide });
    const c = (GRID - 1) / 2;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const ring = Math.max(Math.abs(i - c), Math.abs(j - c));
        const x = (i - c) * TILE;
        const z = (j - c) * TILE;
        const patch = planeSkinCell(x, z, TILE / 2 + 0.02, skinMaterial);
        if (!patch) continue;
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
        body.addShape(new CANNON.Trimesh(patch.vertices, patch.indices));
        body.position.set(x, 0, z);
        this.addBody(body);
        const mesh = patch.mesh;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.position.set(x, 0, z);
        this.group.add(mesh);
        const tile: Tile = { body, mesh, ring, state: "solid", timer: 0, baseX: x, baseZ: z };
        this.tiles.push(tile);
        this.tileGrid[i * GRID + j] = tile;
      }
    }
    // runway stripes + roundel painted directly on the airplane skin
    for (const sx of [-3.4, 3.4]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 13.8), borderMaterial);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.008, -0.4);
      this.group.add(stripe);
    }
    for (const [rad, col] of [
      [1.9, 0xff6a63],
      [1.45, 0xfff7e5],
      [0.88, 0xff6a63],
    ] as const) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rad, 36), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.012;
      this.group.add(disc);
    }

    this.buildAirship();

    // ---- wind streaks: sells the feeling that the ship is flying forward fast ----
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let k = 0; k < 46; k++) {
      const m = new THREE.Mesh(streakGeo, streakMat);
      const side = k % 2 ? 1 : -1;
      m.position.set(side * (HALF + 1.5 + Math.random() * 9), -1.5 - Math.random() * 7, (Math.random() - 0.5) * 46);
      m.scale.z = 2.5 + Math.random() * 5;
      m.userData.speed = 22 + Math.random() * 18;
      this.streaks.push(m);
      this.group.add(m);
    }
    for (let k = 0; k < 20; k++) {
      const m = new THREE.Mesh(streakGeo, streakMat);
      m.position.set((Math.random() - 0.5) * 6, -5 - Math.random() * 4, (Math.random() - 0.5) * 46);
      m.scale.z = 3 + Math.random() * 6;
      m.userData.speed = 26 + Math.random() * 20;
      this.streaks2.push(m);
      this.group.add(m);
    }

    // clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.18 });
    const puff = new THREE.SphereGeometry(1, 14, 10);
    for (let k = 0; k < 22; k++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < n; p++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const s = 1.5 + Math.random() * 2.2;
        m.scale.set(s, s * 0.7, s);
        m.position.set(p * 2 - n, Math.random() * 0.8, Math.random() * 1.5);
        cloud.add(m);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 30;
      cloud.position.set(Math.cos(a) * r, -10 - Math.random() * 14, Math.sin(a) * r);
      cloud.userData.drift = 1.2 + Math.random() * 1.6;
      cloud.userData.zdrift = 1.5 + Math.random() * 2.5;
      this.group.add(cloud);
    }

    // Baseball bats and toy frying pans lie on the aircraft skin. Both use the same
    // pickup / throw input, but the pan gets its own wide impact area and "PANG!" hit.
    for (const [x, z, a] of [
      [-2.6, 2.4, 0.6],
      [2.7, -2.2, -0.9],
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
      [-1.8, -2.5, 0.45],
      [1.8, 2.5, -0.65],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.1, material: this.groundMat, linearDamping: 0.12, angularDamping: 0.26 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.065, 0.32, 0.065)), new CANNON.Vec3(0, -0.23, 0));
      const face = new CANNON.Quaternion();
      face.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(new CANNON.Cylinder(0.49, 0.49, 0.13, 16), new CANNON.Vec3(0, 0.36, 0), face);
      // The aircraft skin is a trimesh. The little sphere under the bowl gives Cannon
      // reliable sphere-vs-trimesh contacts while keeping the pan flat on the surface.
      body.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.36, -0.006));
      body.position.set(x, 0.2, z);
      body.quaternion.setFromEuler(-Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makePanMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "pan", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set(), centerOffset: 0.65, reach: 1.52, impactOffset: 1.09 });
    }

    // props: crates + a beach ball
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const cratePos = [
      [-4.5, -4.5],
      [4.5, 4.5],
      [4.6, -4.2],
      [-4.2, 4.6],
    ];
    for (const [x, z] of cratePos) {
      const b = new CANNON.Body({ mass: 2.5, material: this.groundMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 0.45, 0.45)));
      b.position.set(x, 0.5, z);
      b.angularDamping = 0.3;
      this.addBody(b);
      const m = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, mat(0xffaa55, 0.8));
      box.castShadow = box.receiveShadow = true;
      m.add(box);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94), mat(0xd9733a, 0.8));
      m.add(band);
      this.group.add(m);
      this.props.push({ body: b, mesh: m });
    }
    {
      const b = new CANNON.Body({ mass: 0.5, material: this.groundMat, linearDamping: 0.15 });
      b.addShape(new CANNON.Sphere(0.55));
      b.position.set(0, 1.5, -3);
      this.addBody(b);
      const tex = beachBallTexture();
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      m.castShadow = true;
      this.group.add(m);
      this.props.push({ body: b, mesh: m });
    }

    // sweeper (hidden below until activated)
    {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(6.2, 0.2, 0.2)), new CANNON.Vec3(0, 0, 0));
      b.addShape(new CANNON.Cylinder(0.45, 0.45, 1.2, 12), new CANNON.Vec3(0, -0.2, 0));
      b.position.set(0, -3, 0);
      this.addBody(b);
      const g = new THREE.Group();
      const stripeTex = stripeTexture();
      stripeTex.repeat.set(12, 1);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(12.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 })
      );
      bar.castShadow = true;
      g.add(bar);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 16), mat(0x6b7fd6, 0.4));
      pillar.position.y = -0.2;
      g.add(pillar);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), mat(0xff5a5a, 0.4));
      cap.position.y = 0.3;
      g.add(cap);
      g.position.y = -3;
      this.group.add(g);
      this.sweeper = { body: b, mesh: g, active: false, speed: 0 };
    }
  }

  /** a big cartoon flying ship: the tiled brawl deck sits on top of its fuselage */
  private buildAirship() {
    const hullRed = 0xff5b5b;
    const cream = 0xfff1d0;
    const deepRed = 0xd63a4a;
    const mint = 0x6fe0c0;
    const navy = 0x2f3b63;
    const gold = 0xffc93c;
    const ship = new THREE.Group();
    const S = 1.42; // whole aircraft scaled up (~2x the old arena footprint)
    ship.scale.setScalar(S);
    this.shipGroup = ship;
    const topY = -THICK; // deck underside

    // The play surface above is the top of the aircraft itself. Keep only the rounded
    // lower fuselage beneath it; the old oversized extruded slab made a second deck.

    // bow: a pointed deck extension at the far end, sloping up slightly
    const bow = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5.6, 4), mat(cream, 0.7));
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, -THICK - 0.05, (-HALF - 4.2) / S);
    bow.scale.set(1.6, 1, 0.28);
    bow.castShadow = true;
    ship.add(bow);
    const bowRed = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.0, 4), mat(hullRed, 0.6));
    bowRed.rotation.x = -Math.PI / 2;
    bowRed.rotation.y = Math.PI / 4;
    bowRed.position.set(0, -THICK - 0.85, (-HALF - 3.8) / S);
    bowRed.scale.set(1.7, 1, 0.3);
    ship.add(bowRed);

    // ---- fuselage ----
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 7.8, 12, 20), mat(deepRed, 0.55));
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(0.92, 0.62, 1);
    hull.position.set(0, topY - 2.75, 0);
    hull.castShadow = hull.receiveShadow = true;
    ship.add(hull);
    // narrow cream belly seam + keel below the aircraft skin, not a floor plate
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 5.6, 10, 16), mat(cream, 0.7));
    belly.rotation.x = Math.PI / 2;
    belly.scale.set(1, 0.48, 1);
    belly.position.set(0, topY - 3.35, 0);
    ship.add(belly);
    const keel = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 5.8, 8, 12), mat(hullRed, 0.6));
    keel.rotation.x = Math.PI / 2;
    keel.position.set(0, topY - 3.9, 0);
    ship.add(keel);
    // nose cone (points away from the camera, -z) + spinner
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3.32, 4.6, 28), mat(hullRed, 0.5));
    nose.rotation.x = -Math.PI / 2;
    nose.scale.set(1.06, 1, 0.9);
    nose.position.set(0, topY - 2.7, -8.4);
    ship.add(nose);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 18), mat(gold, 0.35));
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, topY - 2.7, -11.1);
    ship.add(spinner);
    // nose propeller
    const noseProp = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 3.4, 0.12), mat(navy, 0.5));
      blade.rotation.z = (b / 3) * Math.PI * 2;
      blade.position.set(Math.sin((b / 3) * Math.PI * 2) * 1.6, Math.cos((b / 3) * Math.PI * 2) * 1.6, 0);
      noseProp.add(blade);
    }
    noseProp.position.set(0, topY - 2.7, -11.5);
    ship.add(noseProp);
    this.spinners.push(noseProp);

    // ---- cockpit just in front of the deck ----
    const cockpit = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(1.65, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshPhysicalMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.62, roughness: 0.06, clearcoat: 1, side: THREE.DoubleSide })
    );
    glass.scale.set(0.78, 0.55, 0.85);
    cockpit.add(glass);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 8, 26), mat(gold, 0.4));
    frame.rotation.x = Math.PI / 2;
    frame.position.y = 0.02;
    cockpit.add(frame);
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), mat(navy, 0.6));
    seat.scale.set(0.65, 0.45, 0.65);
    seat.position.set(0, -0.18, 0.1);
    cockpit.add(seat);
    cockpit.position.set(0, topY + 1.55, -8.55);
    ship.add(cockpit);

    // ---- wings ----
    for (const side of [1, -1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.62, 7.0), mat(cream, 0.7));
      wing.position.set(side * 11.6, topY - 0.55, -0.5);
      wing.rotation.z = side * 0.06;
      wing.castShadow = wing.receiveShadow = true;
      ship.add(wing);
      const wingTip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.4), mat(hullRed, 0.6));
      wingTip.position.set(side * 17.0, topY - 0.25, -0.5);
      wingTip.rotation.z = side * 0.06;
      ship.add(wingTip);
      // wing stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.08, 0.7), mat(hullRed, 0.6));
      stripe.position.set(side * 11.6, topY - 0.2, 1.3);
      ship.add(stripe);
      const tipFin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.5, 2.4), mat(hullRed, 0.55));
      tipFin.position.set(side * 16.9, topY + 0.75, -0.5);
      ship.add(tipFin);
      // wing-tip light
      const lightMat = new THREE.MeshBasicMaterial({ color: side > 0 ? 0x7cf0ff : 0xff8fb3 });
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lightMat);
      light.position.set(side * 17.8, topY - 0.15, -2.6);
      ship.add(light);
      this.blinking.push(lightMat);
      // engine nacelle + spinning propeller
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 3.2, 18), mat(0xfff6e2, 0.5));
      engine.rotation.x = Math.PI / 2;
      engine.position.set(side * 9.9, topY - 0.5, -1.4);
      ship.add(engine);
      const inlet = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.14, 8, 20), mat(hullRed, 0.5));
      inlet.rotation.x = Math.PI / 2;
      inlet.position.set(side * 9.9, topY - 0.5, -2.95);
      ship.add(inlet);
      const prop = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.5, 0.1), mat(0x5a6a8f, 0.5));
        blade.position.y = 1.25;
        const pivot = new THREE.Group();
        pivot.rotation.z = (b / 3) * Math.PI * 2;
        pivot.add(blade);
        prop.add(pivot);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat(gold, 0.35));
      prop.add(hub);
      prop.position.set(side * 9.9, topY - 0.5, -3.1);
      ship.add(prop);
      this.spinners.push(prop);
      // landing float
      const float = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.6, 8, 14), mat(deepRed, 0.6));
      float.rotation.x = Math.PI / 2;
      float.position.set(side * 11.4, topY - 2.6, 0.3);
      ship.add(float);
    }

    // ---- tail: stabiliser + fin (kept low so it never hides the deck) ----
    const tailBase = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.2, 22), mat(hullRed, 0.55));
    tailBase.rotation.x = Math.PI / 2;
    tailBase.position.set(0, topY - 3.4, (HALF + 6.4) / S);
    ship.add(tailBase);
    for (const side of [1, -1]) {
      const stab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.32, 2.1), mat(cream, 0.7));
      stab.position.set(side * 2.9, topY - 2.7, (HALF + 7.4) / S);
      stab.rotation.z = side * -0.12;
      ship.add(stab);
      const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.36, 1.5), mat(hullRed, 0.6));
      finTip.position.set(side * 5.0, topY - 2.3, (HALF + 7.4) / S);
      ship.add(finTip);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.5, 2.6), mat(hullRed, 0.55));
    fin.position.set(0, topY + 0.1, (HALF + 7.6) / S);
    fin.rotation.x = -0.18;
    ship.add(fin);
    const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 2.3), mat(gold, 0.45));
    finStripe.position.set(0, topY + 0.55, (HALF + 7.6) / S);
    finStripe.rotation.x = -0.18;
    ship.add(finStripe);
    // spinning radar dish
    const radar = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(cream, 0.5));
    dish.rotation.x = Math.PI * 0.62;
    radar.add(dish);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8), mat(navy, 0.5));
    mast.position.y = -0.4;
    radar.add(mast);
    radar.position.set(2.4, topY + 1.0, (HALF + 5.0) / S);
    ship.add(radar);
    this.spinners.push(radar);

    // ---- portholes along the hull ----
    for (const side of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const z = -5.4 + k * 2.7;
        const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.44, 18), new THREE.MeshBasicMaterial({ color: 0xfff4b8 }));
        porthole.position.set(side * 3.35, topY - 2.4, z);
        porthole.rotation.y = side * (Math.PI / 2);
        ship.add(porthole);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 20), mat(gold, 0.4));
        rim.position.copy(porthole.position);
        rim.rotation.y = side * (Math.PI / 2);
        ship.add(rim);
      }
    }

    // The playable wing/fuselage outline is the edge; no rectangular deck railing.
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), mat(cream, 0.5));
    flagPole.position.set(0, topY + 0.4, (HALF + 7.8) / S);
    ship.add(flagPole);
    const pennant = new THREE.Shape();
    pennant.moveTo(0, 0.42);
    pennant.lineTo(1.85, 0);
    pennant.lineTo(0, -0.42);
    pennant.lineTo(0, 0.42);
    const pen = new THREE.Mesh(new THREE.ShapeGeometry(pennant), mat(mint, 0.6));
    pen.position.set(0.05, topY + 1.2, (HALF + 7.82) / S);
    ship.add(pen);
    const pen2 = new THREE.Mesh(new THREE.ShapeGeometry(pennant), mat(hullRed, 0.6));
    pen2.position.set(0.05, topY + 1.2, (HALF + 7.8) / S);
    pen2.scale.set(0.55, 0.55, 1);
    ship.add(pen2);
    this.group.add(ship);
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

  private onSkin(x: number, z: number) {
    if (!planeContains(x, z)) return false;
    const i = Math.round(x / TILE) + (GRID - 1) / 2;
    const j = Math.round(z / TILE) + (GRID - 1) / 2;
    if (i < 0 || i >= GRID || j < 0 || j >= GRID) return false;
    return this.tileGrid[i * GRID + j]?.state === "solid";
  }

  /** Is the given xz position over solid aircraft skin? */
  isSafe(x: number, z: number, margin = 0) {
    // Margins are measured from the real plane outline, never invisible cell seams.
    if (!this.onSkin(x, z)) return false;
    if (margin <= 0) return true;
    const d = margin * Math.SQRT1_2;
    return this.onSkin(x + margin, z) && this.onSkin(x - margin, z) &&
      this.onSkin(x, z + margin) && this.onSkin(x, z - margin) &&
      this.onSkin(x + d, z + d) && this.onSkin(x - d, z + d) &&
      this.onSkin(x + d, z - d) && this.onSkin(x - d, z - d);
  }

  /** current solid half-extent along each axis (rough) */
  safeHalf() {
    let r = -1;
    for (const t of this.tiles) if (t.state === "solid") r = Math.max(r, t.ring);
    return (r + 0.5) * TILE;
  }

  update(dt: number, time: number) {
    for (const t of this.tiles) {
      if (t.state === "shake") {
        t.timer -= dt;
        const j = 0.06;
        t.mesh.position.set(t.baseX + (Math.random() - 0.5) * j, -THICK / 2 + (Math.random() - 0.5) * j, t.baseZ + (Math.random() - 0.5) * j);
        if (t.timer <= 0) {
          t.state = "fall";
          t.body.velocity.set(0, -2, 0);
          t.body.angularVelocity.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
        }
      } else if (t.state === "fall") {
        t.body.velocity.y = Math.max(t.body.velocity.y - 18 * dt, -25);
        t.mesh.position.set(t.body.position.x, t.body.position.y, t.body.position.z);
        t.mesh.quaternion.set(t.body.quaternion.x, t.body.quaternion.y, t.body.quaternion.z, t.body.quaternion.w);
        if (t.body.position.y < -45) {
          t.state = "gone";
          this.world.removeBody(t.body);
          t.mesh.visible = false;
        }
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
    for (const p of this.spinners) p.rotation.z += dt * 20;
    // ship gently banks & bobs while cruising
    if (this.shipGroup) {
      this.shipGroup.position.y = Math.sin(time * 0.9) * 0.08;
      this.shipGroup.rotation.z = Math.sin(time * 0.55) * 0.012;
      this.shipGroup.rotation.x = Math.sin(time * 0.42) * 0.008;
    }
    // wind streaks race towards the camera and wrap around
    for (const st of [...this.streaks, ...this.streaks2]) {
      st.position.z += (st.userData.speed as number) * dt;
      if (st.position.z > 24) st.position.z -= 48;
      const m = st.material as THREE.MeshBasicMaterial;
      m.opacity = 0.4;
    }
    const blink = 0.55 + Math.sin(time * 3) * 0.45;
    for (const m of this.blinking) m.opacity = blink;
    this.group.children.forEach((o) => {
      if (o.userData.spin) o.rotation.y += dt * 9;
      if (o.userData.drift) {
        o.position.x += o.userData.drift * dt;
        o.position.z += (o.userData.zdrift ?? 0) * dt;
        if (o.position.x > 55) o.position.x = -55;
        if (o.position.z > 34) o.position.z = -46;
      }
    });
    void time;
  }

  dispose() {
    for (const b of this.bodies) if (this.world.bodies.includes(b)) this.world.removeBody(b);
    this.scene.remove(this.group);
  }
}

/** chunky, toy-like cartoon baseball bat (1.5x), centred on its body origin, handle toward -Y */
function makeBatMesh() {
  const g = new THREE.Group();
  const prof = [
    [0, -0.5],
    [0.07, -0.5],
    [0.085, -0.475],
    [0.075, -0.445],
    [0.042, -0.425],
    [0.04, -0.12],
    [0.068, 0.06],
    [0.1, 0.24],
    [0.112, 0.38],
    [0.108, 0.45],
    [0.085, 0.49],
    [0.0, 0.505],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const woodMat = new THREE.MeshPhysicalMaterial({ color: 0xf6c58a, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const wood = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), woodMat);
  wood.castShadow = true;
  g.add(wood);
  // pink grip with white tape stripes + pink knob
  const pink = new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.3, 18), pink);
  grip.position.y = -0.28;
  g.add(grip);
  for (const y of [-0.38, -0.29, -0.2]) {
    const tape = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.009, 6, 20), white);
    tape.rotation.x = Math.PI / 2;
    tape.position.y = y;
    g.add(tape);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), pink);
  knob.scale.set(1.2, 0.55, 1.2);
  knob.position.y = -0.47;
  g.add(knob);
  // two pastel bands
  for (const [y, c, r] of [
    [0.3, 0x7cc8ff, 0.109],
    [0.35, 0xffffff, 0.112],
  ] as const) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.03, 26), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    band.position.y = y;
    g.add(band);
  }
  // cute star sticker + blushy smiley on the barrel
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.022 : 0.05;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(star, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 })
  );
  starMesh.position.set(0, 0.17, 0.088);
  g.add(starMesh);
  const dark = new THREE.MeshBasicMaterial({ color: 0x3a2a2a });
  for (const sx of [-0.028, 0.028]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark);
    eye.position.set(sx, 0.42, 0.105);
    g.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 5, 12, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.405, 0.107);
  g.add(smile);
  for (const sx of [-0.05, 0.05]) {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9db5 }));
    blush.scale.set(1.3, 0.7, 0.4);
    blush.position.set(sx, 0.4, 0.1);
    g.add(blush);
  }
  g.scale.setScalar(1.6);
  return g;
}

/** Pastel teflon with a rounded bowl, enamel rim and a tiny smiling face inside. */
function makePanMesh() {
  const g = new THREE.Group();
  const mint = new THREE.MeshPhysicalMaterial({ color: 0x67d8c7, roughness: 0.4, metalness: 0.05, clearcoat: 0.75 });
  const inside = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: 0.7 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff86af, roughness: 0.58 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x483b56 });

  // Lathe around local Y, then turn the bowl to face local +Z; the handle stays along Y.
  const profile = [
    [0, -0.095], [0.27, -0.095], [0.38, -0.07], [0.45, -0.02],
    [0.45, 0.06], [0.415, 0.095], [0.37, 0.055], [0.33, 0.018], [0, 0.018],
  ].map(([r, depth]) => new THREE.Vector2(r, depth));
  const pan = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mint);
  pan.rotation.x = Math.PI / 2;
  pan.position.y = 0.34;
  pan.castShadow = pan.receiveShadow = true;
  g.add(pan);
  const foodSurface = new THREE.Mesh(new THREE.CircleGeometry(0.35, 32), inside);
  foodSurface.position.set(0, 0.34, 0.032);
  g.add(foodSurface);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.027, 8, 32), rimMat);
  lip.position.set(0, 0.34, 0.095);
  g.add(lip);

  // A small fried egg gives the pan a recognizable, playful face.
  const egg = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), rimMat);
  egg.scale.set(0.2, 0.16, 0.018);
  egg.position.set(0, 0.35, 0.047);
  g.add(egg);
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.45 }));
  yolk.scale.z = 0.27;
  yolk.position.set(0, 0.34, 0.066);
  g.add(yolk);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark);
    eye.position.set(side * 0.04, 0.355, 0.095);
    g.add(eye);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), pink);
    blush.scale.set(1, 0.58, 0.25);
    blush.position.set(side * 0.16, 0.29, 0.067);
    g.add(blush);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0045, 5, 12, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.314, 0.096);
  g.add(smile);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.63, 14), mint);
  handle.position.y = -0.2;
  handle.castShadow = true;
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.076, 0.25, 6, 14), pink);
  grip.position.y = -0.31;
  grip.castShadow = true;
  g.add(grip);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.013, 6, 16), rimMat);
  neck.rotation.x = Math.PI / 2;
  neck.position.y = -0.1;
  g.add(neck);
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12), rimMat);
  hole.position.set(0, -0.5, 0.072);
  g.add(hole);
  g.scale.setScalar(1.22);
  return g;
}

function stripeTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = "#ff4d5e";
  g.fillRect(0, 0, 32, 16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beachBallTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const cols = ["#ff5a5a", "#ffffff", "#ffd23f", "#ffffff", "#4dabff", "#ffffff"];
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * 256) / cols.length, 0, 256 / cols.length + 1, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
