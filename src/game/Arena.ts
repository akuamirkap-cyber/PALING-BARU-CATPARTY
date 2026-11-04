import * as CANNON from "cannon-es";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat } from "./characterMesh";
import type { Bat } from "./Character";

export const PLANE_SCALE = 1.8;
export const TILE = 2.2 * PLANE_SCALE;
export const GRID = 7;
export const HALF = (TILE * GRID) / 2;
const THICK = 1.2;
// A shallow crowned fuselage blends into the wings. The collider below follows
// the same profile so feet and dropped items stay on the visible surface.
function deckHeight(z: number) {
  const t = Math.min(1, Math.abs(z) / 3.4);
  return 0.08 - 0.64 * t * t * (3 - 2 * t);
}
// The airplane outline is shared by rendering, collision, and bot navigation.
// +X is the nose. The fuselage has rounded ends and the wings sweep back into
// softly rounded tips instead of ending in rectangular slabs.
function planeLimits(z: number): [number, number] {
  const a = Math.abs(z);
  if (a <= 3.5) {
    const tail = Math.min(a / 2, 1);
    const nose = a / 3.5;
    return [-8 + 2.5 * tail * tail, 7.5 - 4 * nose * nose];
  }
  const w = Math.min(a - 3.5, 4.2);
  const back = -2 + 0.10 * w;
  const front = 3.5 - 0.75 * w;
  const rounding = a <= 6.9 ? 1 : Math.sqrt(Math.max(0, 1 - ((a - 6.9) / 0.8) ** 2));
  const middle = (back + front) / 2;
  const half = (front - back) * 0.5 * rounding;
  return [middle - half, middle + half];
}

function panelSpan(cx: number, hx: number, z: number): [number, number] {
  const [min, max] = planeLimits(z);
  const left = Math.max(cx - hx, min);
  const right = Math.min(cx + hx, max);
  // A panel can taper to nothing at its outer edge.
  const collapsed = THREE.MathUtils.clamp((left + right) / 2, cx - hx, cx + hx);
  return left <= right ? [left, right] : [collapsed, collapsed];
}

// A plump belly narrows toward the nose and tail. Every section falls with
// its matching collider rather than leaving a static, intangible shell.
function hullBottom(x: number, z: number) {
  const tailBlend = THREE.MathUtils.clamp((-x - 2) / 1, 0, 1);
  const r = Math.abs(z) / (3.15 - tailBlend * 1.15);
  let taper = 1;
  if (x > 4.2) taper = Math.sqrt(Math.max(0, 1 - ((x - 4.2) / 3.3) ** 2));
  if (x < -5) taper = Math.sqrt(Math.max(0, 1 - ((x + 5) / 3) ** 2));
  const belly = r < 1 ? 2.55 * Math.sqrt(1 - r * r) * taper : 0;
  // The cross-section closes into the outline instead of ending in a tall,
  // vertical wall. This rounds the nose, tail and wing ends from below.
  const [left, right] = planeLimits(z);
  const edge = Math.max(0, Math.min(x - left, right - x, 7.7 - Math.abs(z)));
  const round = THREE.MathUtils.smoothstep(edge, 0, 1.15);
  return deckHeight(z) - (0.09 + (0.61 + belly) * round);
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

// world span of the shared hull livery texture (covers the whole plane top)
const LIVERY_SPAN = 17;




export class Arena {
  world: CANNON.World;
  scene: THREE.Scene;
  group = new THREE.Group();
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
    // ============================================================
    //  PHYSICS = the airplane's own walkable panels (NOT a tile grid).
    //  Sections: nose, fuselage L/R/C, wings L/R, tail — each one body.
    // ============================================================
    const mkPanel = (
      ring: 0 | 1 | 2 | 3,
      cx: number,
      cz: number,
      hx: number,
      hz: number,
      name: string
    ) => {
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.groundMat });
      // Closely spaced strips follow the same swept outline as the visible
      // skin. Each end's maximum extent covers the rendered edge too.
      const strips = Math.max(1, Math.ceil((hz * 2) / 0.38));
      const stripWidth = hz * 2 / strips;
      for (let i = 0; i < strips; i++) {
        const z = -hz + (i + 0.5) * stripWidth;
        const worldZ = cz + z;
        const spans = [panelSpan(cx, hx, worldZ - stripWidth / 2), panelSpan(cx, hx, worldZ), panelSpan(cx, hx, worldZ + stripWidth / 2)];
        const left = Math.min(...spans.map(span => span[0]));
        const right = Math.max(...spans.map(span => span[1]));
        if (right - left < 0.002) continue;
        const top = deckHeight(worldZ);
        const slices = name.startsWith("nose") || name === "tail-tip" ? 2 : 1;
        for (let j = 0; j < slices; j++) {
          const x0 = left + (right - left) * j / slices;
          const x1 = left + (right - left) * (j + 1) / slices;
          const x = (x0 + x1) / 2;
          // Enclose the rounded underside over the whole strip, including
          // the deeper edges, so the visible fuselage remains solid.
          const bottom = Math.min(
            hullBottom(x0, worldZ), hullBottom(x, worldZ), hullBottom(x1, worldZ),
            hullBottom(x, worldZ - stripWidth / 2), hullBottom(x, worldZ + stripWidth / 2),
          ) - 0.10; // conservative enclosure between samples on the curved belly
          body.addShape(
            new CANNON.Box(new CANNON.Vec3((x1 - x0) / 2 + 0.055, (top - bottom) / 2, stripWidth / 2 + 0.055)),
            new CANNON.Vec3(x - cx, (top + bottom) / 2 + THICK / 2, z),
          );
        }
      }
      body.position.set(cx, -THICK / 2, cz);
      this.addBody(body);
      this.tiles.push({ body, index: this.tiles.length, ring, state: "solid", timer: 0, baseX: cx, baseZ: cz, name, hx, hz });
    };
    // ring 3 (falls first): wingtips + tail tip
    mkPanel(3, 0.75, 6.75, 2.75, 0.95, "wingL-tip");
    mkPanel(3, 0.75, -6.75, 2.75, 0.95, "wingR-tip");
    mkPanel(3, -6.75, 0, 1.25, 2.0, "tail-tip");
    // ring 2: mid wings + nose sides
    mkPanel(2, 0.75, 4.9, 2.75, 0.9, "wingL-mid");
    mkPanel(2, 0.75, -4.9, 2.75, 0.9, "wingR-mid");
    mkPanel(2, 5.5, 2.3, 2.0, 1.2, "noseL");
    mkPanel(2, 5.5, -2.3, 2.0, 1.2, "noseR");
    // ring 1: fuselage flanks + nose center + tail mid + wing roots
    mkPanel(1, 0.75, 2.15, 2.75, 0.85, "fuseL");
    mkPanel(1, 0.75, -2.15, 2.75, 0.85, "fuseR");
    mkPanel(1, 5.5, 0, 2.0, 1.1, "noseC");
    mkPanel(1, -3.75, 0, 1.75, 2.0, "tailMid");
    mkPanel(1, 0.75, 3.5, 2.75, 0.5, "wingL-root");
    mkPanel(1, 0.75, -3.5, 2.75, 0.5, "wingR-root");
    // ring 0 (never falls): cockpit strip — the final showdown spot
    mkPanel(0, 0.75, 0.65, 2.75, 0.65, "cockpitL");
    mkPanel(0, 0.75, -0.65, 2.75, 0.65, "cockpitR");
    // ============================================================
    //  BIG CARTOON AIRPLANE — its own hull IS the play surface.
    //  No separate deck: the cream top you stand on is the fuselage back.
    // ============================================================
    const creamDark = mat(0xe6dfcf, 0.6);
    const red = mat(0xe84a4a, 0.5);
    const steel = mat(0x8fa3b8, 0.4);
    const darkMetal = mat(0x4a5568, 0.5);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fd4f5, roughness: 0.12, metalness: 0.2, clearcoat: 1 });

    // ---- hull top: one chunk per physics panel, using the AIRPLANE livery ----
    const hullTex = hullTopTexture();
    const hullMat = new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.58, metalness: 0.12 });
    for (const t of this.tiles) {
      // A curved chunk follows the same shallow profile as its physics strips.
      const geo = buildPanelGeometry(t, this.tiles);
      // world-space UVs into the shared livery so paint is seamless across chunks
      const pos = geo.getAttribute("position");
      const uv = new Float32Array(pos.count * 2);
      for (let k = 0; k < pos.count; k++) {
        uv[k * 2] = (pos.getX(k) + t.baseX + LIVERY_SPAN / 2) / LIVERY_SPAN;
        uv[k * 2 + 1] = 1 - (pos.getZ(k) + t.baseZ + LIVERY_SPAN / 2) / LIVERY_SPAN;
      }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const chunk = new THREE.Group();
      const skin = new THREE.Mesh(geo, hullMat);
      // The plane has no receiver underneath it. Characters and details still
      // cast their shadows onto the hull, without re-rendering its dense skin.
      skin.castShadow = false;
      skin.receiveShadow = true;
      chunk.add(skin);
      // red glowing crack edge = warning that this section is about to break
      const edgeGeo = new THREE.EdgesGeometry(geo, 30);
      const edge = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: 0xd13c3c, transparent: true, opacity: 0 })
      );
      chunk.add(edge);
      chunk.position.set(t.baseX, 0, t.baseZ);
      this.group.add(chunk);
      this.chunks.push({ mesh: chunk, edge, tile: t });
    }

    // Decorative details are anchored to the same breakable physics bodies.
    // Nothing that looks like an airplane surface extends beyond the colliders.
    const anchor = (name: string) => {
      const chunk = this.chunks.find((ch) => ch.tile.name === name)!;
      const detail = new THREE.Group();
      detail.position.set(-chunk.tile.baseX, 0, -chunk.tile.baseZ);
      chunk.mesh.add(detail);
      return { detail, tile: chunk.tile };
    };
    const addCollider = (tile: Tile, center: CANNON.Vec3, half: CANNON.Vec3) => {
      tile.body.addShape(new CANNON.Box(half), new CANNON.Vec3(center.x - tile.baseX, center.y + THICK / 2, center.z - tile.baseZ));
    };

    // Low, rounded cockpit sits on the nose rather than floating beyond it.
    const nose = anchor("noseC");
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), glass);
    canopy.scale.set(1.15, 0.72, 0.9);
    canopy.position.set(6.15, 0.12, 0);
    canopy.castShadow = true;
    const canopyRim = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), creamDark);
    canopyRim.scale.set(1.16, 0.17, 0.95);
    canopyRim.position.set(6.15, 0.11, 0);
    nose.detail.add(canopyRim, canopy);
    // A solid enclosure for the entire visible canopy: it moves and falls
    // together with the nose panel and cannot be walked through.
    addCollider(nose.tile, new CANNON.Vec3(6.15, 0.38, 0), new CANNON.Vec3(1.15, 0.48, 0.9));
    for (const z of [-0.32, 0.32]) {
      const points: THREE.Vector3[] = [];
      const r = Math.sqrt(1 - (z / 0.9) ** 2);
      for (let k = 0; k <= 24; k++) {
        const angle = Math.PI * k / 24;
        points.push(new THREE.Vector3(6.15 + 1.17 * r * Math.cos(angle), 0.12 + 0.74 * r * Math.sin(angle), z));
      }
      nose.detail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.022, 10), creamDark));
    }
    // Small rounded red nose badge, flush with the walkable nose.
    const noseBadge = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), red);
    noseBadge.scale.set(0.23, 0.15, 0.32);
    noseBadge.position.set(7.06, -0.12, 0);
    nose.detail.add(noseBadge);

    const tail = anchor("tail-tip");
    const finShape = new THREE.Shape();
    finShape.moveTo(-7.8, -0.05);
    finShape.quadraticCurveTo(-7.85, 0.2, -7.65, 0.45);
    finShape.lineTo(-7.25, 1.25);
    finShape.quadraticCurveTo(-7.15, 1.55, -6.8, 1.55);
    finShape.lineTo(-6.55, 1.55);
    finShape.quadraticCurveTo(-6.3, 1.55, -6.2, 1.25);
    finShape.lineTo(-5.65, -0.05);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 });
    finGeo.translate(0, 0, -0.13);
    const fin = new THREE.Mesh(finGeo, red);
    fin.castShadow = true;
    tail.detail.add(fin);
    addCollider(tail.tile, new CANNON.Vec3(-6.78, 0.75, 0), new CANNON.Vec3(1.05, 0.85, 0.22));

    for (const sz of [1, -1]) {
      const tip = anchor(sz > 0 ? "wingL-tip" : "wingR-tip");
      // The curved wingtip itself carries the painted red band.
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: sz > 0 ? 0x43eab1 : 0xff5964 }));
      nav.position.set(-0.60, -0.52, sz * 7.32);
      nav.userData.blink = true;
      nav.userData.phase = sz;
      tip.detail.add(nav);
      this.animated.push(nav);
      tip.tile.body.addShape(new CANNON.Sphere(0.16), new CANNON.Vec3(-0.60 - tip.tile.baseX, -0.52 + THICK / 2, sz * 7.32 - tip.tile.baseZ));

      // Compact nacelles are tucked into the solid wing, rather than floating
      // beyond its new swept edge.
      const wing = anchor(sz > 0 ? "wingL-mid" : "wingR-mid");
      const nacelle = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), steel);
      nacelle.scale.set(0.85, 0.28, 0.38);
      nacelle.position.set(0.55, -0.98, sz * 4.8);
      wing.detail.add(nacelle);
    }

    // Portholes belong to the fuselage flank and disappear with that section.
    const portholeMat = new THREE.MeshPhysicalMaterial({ color: 0x87cde5, roughness: 0.25, clearcoat: 0.8 });
    for (const sz of [1, -1]) {
      const flank = anchor(sz > 0 ? "fuseL" : "fuseR");
      for (const x of [-1.4, 0, 1.4, 2.8]) {
        const rim = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), creamDark);
        rim.scale.set(0.27, 0.34, 0.09);
        rim.position.set(x, -1.28, sz * 2.96);
        flank.detail.add(rim);
        const window = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), portholeMat);
        window.scale.set(0.20, 0.26, 0.08);
        window.position.set(x, -1.28, sz * 3.035);
        flank.detail.add(window);
      }
    }

    // Enlarge the airframe itself, not characters, props or sky. Every visual
    // chunk and its compound collider share the same transform, including the
    // canopy and fin; broken sections still rotate around their own bodies.
    for (const chunk of this.chunks) {
      const { tile, mesh } = chunk;
      mesh.scale.setScalar(PLANE_SCALE);
      tile.baseX *= PLANE_SCALE;
      tile.baseZ *= PLANE_SCALE;
      tile.hx *= PLANE_SCALE;
      tile.hz *= PLANE_SCALE;
      mesh.position.set(tile.baseX, 0, tile.baseZ);
      const body = tile.body;
      body.position.scale(PLANE_SCALE, body.position);
      body.previousPosition.copy(body.position);
      body.interpolatedPosition.copy(body.position);
      for (let i = 0; i < body.shapes.length; i++) {
        const shape = body.shapes[i];
        body.shapeOffsets[i].scale(PLANE_SCALE, body.shapeOffsets[i]);
        if (shape instanceof CANNON.Box) {
          shape.halfExtents.scale(PLANE_SCALE, shape.halfExtents);
          shape.updateConvexPolyhedronRepresentation();
          shape.updateBoundingSphereRadius();
        } else if (shape instanceof CANNON.Sphere) {
          shape.radius *= PLANE_SCALE;
          shape.updateBoundingSphereRadius();
        } else {
          throw new Error("Unsupported airplane collider shape");
        }
      }
      body.updateBoundingRadius();
      body.updateMassProperties();
      body.aabbNeedsUpdate = true;
    }

    // Merge the puffs of each drifting cloud into a single draw call without
    // changing their positions, shapes, materials, or parallax animation.
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.18 });
    const puff = new THREE.SphereGeometry(1, 14, 10);
    const makeCloud = (n: number, size: number, sizeRange: number, spacing: number) => {
      const pieces: THREE.BufferGeometry[] = [];
      for (let p = 0; p < n; p++) {
        const radius = size + Math.random() * sizeRange;
        const piece = puff.clone();
        piece.scale(radius, radius * 0.7, radius);
        piece.translate(p * spacing - n, Math.random() * 0.8, Math.random() * 1.5);
        pieces.push(piece);
      }
      const geometry = mergeGeometries(pieces);
      for (const piece of pieces) piece.dispose();
      return new THREE.Mesh(geometry, cloudMat);
    };
    for (let k = 0; k < 22; k++) {
      const cloud = makeCloud(3 + Math.floor(Math.random() * 4), 1.5, 2.2, 2);
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 34;
      cloud.position.set(Math.cos(a) * r, -16 - Math.random() * 16, Math.sin(a) * r);
      cloud.userData.drift = -(2.2 + Math.random() * 1.6);
      this.group.add(cloud);
      this.animated.push(cloud);
    }
    // Backdrop clouds retain their slower parallax.
    for (let k = 0; k < 6; k++) {
      const cloud = makeCloud(4 + Math.floor(Math.random() * 3), 2.5, 2.5, 2.5);
      cloud.position.set(-40 + Math.random() * 80, 10 + Math.random() * 9, -34 - Math.random() * 22);
      cloud.userData.drift = -(0.7 + Math.random() * 0.6);
      this.group.add(cloud);
      this.animated.push(cloud);
    }
    puff.dispose();
    // wind streaks rushing past (plane flies toward +X, so everything streams -X)
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    const streakGeo = new THREE.BoxGeometry(3.2, 0.07, 0.07);
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Mesh(streakGeo, streakMat);
      const upper = k % 2 === 0;
      s.position.set(
        -25 + Math.random() * 50,
        upper ? 3 + Math.random() * 6 : -9 - Math.random() * 3,
        -20 + Math.random() * 40
      );
      s.userData.streak = 14 + Math.random() * 10;
      this.group.add(s);
      this.animated.push(s);
    }

    // baseball bats lying around (on solid wing panels)
    for (const [x, z, a] of [
      [0.9, 3.4, 0.6],
      [1.2, -3.2, -0.9],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.5, material: this.groundMat, linearDamping: 0.05, angularDamping: 0.25 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.72, 0.07)));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.48, 0));
      body.position.set(x * PLANE_SCALE, this.surfaceHeight(z * PLANE_SCALE) + 0.2, z * PLANE_SCALE);
      body.quaternion.setFromEuler(Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makeBatMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "bat", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set(), centerOffset: 0.67, reach: 1.47, impactOffset: 1.2 });
    }

    // Non-stick frying pans lying on the deck.
    for (const [x, z, a] of [
      [-2.4, -0.6, 0.4],
      [3.4, 0.8, -0.7],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.1, material: this.groundMat, linearDamping: 0.12, angularDamping: 0.26 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.065, 0.32, 0.065)), new CANNON.Vec3(0, -0.23, 0));
      const face = new CANNON.Quaternion();
      face.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(new CANNON.Cylinder(0.49, 0.49, 0.13, 16), new CANNON.Vec3(0, 0.36, 0), face);
      // Contact sphere under the bowl gives Cannon reliable contact while keeping the pan flat on the surface.
      body.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.36, -0.006));
      body.position.set(x * PLANE_SCALE, this.surfaceHeight(z * PLANE_SCALE) + 0.2, z * PLANE_SCALE);
      body.quaternion.setFromEuler(-Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makePanMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "pan", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set(), centerOffset: 0.65, reach: 1.52, impactOffset: 1.09 });
    }

    // props: crates + a beach ball (all on solid fuselage panels)
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const cratePos = [
      [-3.6, 1.0],
      [2.6, 1.6],
      [2.6, -1.6],
      [-3.6, -1.0],
    ];
    for (const [x, z] of cratePos) {
      const b = new CANNON.Body({ mass: 2.5, material: this.groundMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 0.45, 0.45)));
      b.position.set(x * PLANE_SCALE, this.surfaceHeight(z * PLANE_SCALE) + 0.5, z * PLANE_SCALE);
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
      b.position.set(0.75 * PLANE_SCALE, this.surfaceHeight(-1.2 * PLANE_SCALE) + 1.5, -1.2 * PLANE_SCALE);
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

  /** Is the given xz position over a solid airplane panel? */
  isSafe(x: number, z: number, margin = 0) {
    const [left, right] = planeLimits(z / PLANE_SCALE).map(v => v * PLANE_SCALE);
    if (x < left + margin || x > right - margin || Math.abs(z) > 7.7 * PLANE_SCALE - margin) return false;
    for (const t of this.tiles) {
      if (t.state !== "solid") continue;
      if (Math.abs(x - t.baseX) <= t.hx - margin && Math.abs(z - t.baseZ) <= t.hz - margin) return true;
    }
    return false;
  }

  /** Height of the scaled visible deck at a world-space z coordinate. */
  surfaceHeight(z: number) {
    return deckHeight(z / PLANE_SCALE) * PLANE_SCALE;
  }

  /** current solid half-extent along each axis (rough) */
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

  /** random solid point on the plane (for spawns) */
  randomSafePoint(margin = 0.8): { x: number; z: number } {
    const solid = this.tiles.filter((t) => t.state === "solid");
    const pool = solid.length ? solid : this.tiles;
    for (let i = 0; i < 80; i++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      const x = t.baseX + (Math.random() * 2 - 1) * Math.max(0.1, t.hx - margin);
      const z = t.baseZ + (Math.random() * 2 - 1) * Math.max(0.1, t.hz - margin);
      if (this.isSafe(x, z, margin)) return { x, z };
    }
    return { x: 0.75 * PLANE_SCALE, z: 0 };
  }

  update(dt: number, time: number) {
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
    // hull-chunk visuals mirror their physics panel (shake with red cracks, then break off)
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
        ch.mesh.rotation.set(0, 0, 0);
        edgeMat.opacity = 0.5 + 0.5 * Math.sin(this.tFly * 18);
      } else if (st === "fall") {
        edgeMat.opacity = 1;
        const body = ch.tile.body;
        const top = body.pointToWorldFrame(new CANNON.Vec3(0, THICK * PLANE_SCALE / 2, 0));
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
    // (no airframe bobbing: the hull IS the floor, so feet must stay glued to it)
    for (const o of this.animated) {
      if (o.userData.spin) o.rotation.y += dt * (o.userData.spinSpeed ?? 9);
      else if (o.userData.blink) o.visible = Math.sin(this.tFly * 5 + (o.userData.phase || 0)) > -0.2;
      else if (o.userData.drift) {
        o.position.x += o.userData.drift * dt;
        if (o.position.x > 55) o.position.x = -55;
        else if (o.position.x < -55) o.position.x = 55;
      } else if (o.userData.streak) {
        o.position.x -= o.userData.streak * dt;
        if (o.position.x < -30) {
          o.position.x = 30;
          o.position.y = (Math.random() < 0.5 ? 3 + Math.random() * 6 : -9 - Math.random() * 3);
          o.position.z = -20 + Math.random() * 40;
        }
      }
    }
    void time;
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

/** painted livery for the airplane's walkable top — fuselage spine, wings, nose, tail */
function hullTopTexture() {
  const S = 1024;
  const span = LIVERY_SPAN;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const px = (x: number) => ((x + span / 2) / span) * S;
  const py = (z: number) => (1 - (z + span / 2) / span) * S;
  // Smooth painted metal with a subtle highlight along the rounded cabin.
  const paint = g.createLinearGradient(0, 0, 0, S);
  paint.addColorStop(0, "#dce9e8");
  paint.addColorStop(0.23, "#f5f2e4");
  paint.addColorStop(0.5, "#fffaf0");
  paint.addColorStop(0.77, "#f5f2e4");
  paint.addColorStop(1, "#dce9e8");
  g.fillStyle = paint;
  g.fillRect(0, 0, S, S);
  // Side-to-side shading reinforces the rounded fuselage crown.
  const crown = g.createLinearGradient(0, py(3.2), 0, py(-3.2));
  crown.addColorStop(0, "rgba(91,137,151,.17)");
  crown.addColorStop(0.25, "rgba(255,255,255,0)");
  crown.addColorStop(0.5, "rgba(255,255,255,.24)");
  crown.addColorStop(0.75, "rgba(255,255,255,0)");
  crown.addColorStop(1, "rgba(91,137,151,.17)");
  g.fillStyle = crown;
  g.fillRect(0, py(3.2), S, py(-3.2) - py(3.2));
  // Two clean airline stripes follow the cabin, not a wooden-plank pattern.
  for (const z of [1.55, -1.55]) {
    g.strokeStyle = "#ca5150";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(0, py(z));
    g.lineTo(S, py(z));
    g.stroke();
    g.strokeStyle = "rgba(64,112,129,.48)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, py(z + 0.15));
    g.lineTo(S, py(z + 0.15));
    g.stroke();
  }
  // A handful of quiet wing panel seams keep the surface readable as metal.
  g.strokeStyle = "rgba(91,126,135,.20)";
  g.lineWidth = 3;
  for (const z of [3.7, -3.7, 5.8, -5.8]) {
    g.beginPath();
    g.moveTo(px(-1.8), py(z));
    g.lineTo(px(3.0), py(z));
    g.stroke();
  }
  // Cream cockpit spine gives the fuselage a broad, soft highlight.
  const shine = g.createLinearGradient(0, py(1.1), 0, py(-1.1));
  shine.addColorStop(0, "rgba(255,255,255,0)");
  shine.addColorStop(0.5, "rgba(255,255,255,.28)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = shine;
  g.fillRect(0, py(1.1), S, py(-1.1) - py(1.1));
  // red wingtip bands (fall first)
  g.fillStyle = "rgba(224,87,79,0.92)";
  g.fillRect(0, py(7.7), S, py(6.9) - py(7.7));
  g.fillRect(0, py(-6.9), S, py(-7.7) - py(-6.9));
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(0, py(7.32), S, 5);
  g.fillRect(0, py(-7.37), S, 5);
  // red nose tip accent (front = +X)
  g.fillStyle = "rgba(224,87,79,0.9)";
  g.fillRect(px(7.0), 0, px(7.7) - px(7.0), S);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fillRect(px(6.97), 0, 6, S);
  // airline paw logo on the right wing (on a solid panel — never floats)
  const lx = px(0.9);
  const lz = py(3.45);
  g.fillStyle = "rgba(224,87,79,0.85)";
  g.beginPath();
  g.ellipse(lx, lz + 16, 26, 21, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [
    [-34, -20],
    [-12, -34],
    [12, -34],
    [34, -20],
  ]) {
    g.beginPath();
    g.ellipse(lx + dx, lz + dy, 11, 13, 0, 0, Math.PI * 2);
    g.fill();
  }
  // red chevrons on the wings
  g.strokeStyle = "rgba(224,87,79,0.75)";
  g.lineWidth = 6;
  for (const z of [2.9, -2.9]) {
    g.beginPath();
    g.moveTo(px(-0.4), py(z - 0.55));
    g.lineTo(px(0.5), py(z));
    g.lineTo(px(-0.4), py(z + 0.55));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Cambered skin follows the same tapered footprint as its collision body. */
function buildPanelGeometry(t: Tile, tiles: Tile[]) {
  const nx = 20;
  const nz = Math.max(12, Math.ceil(t.hz * 2 / 0.10));
  const positions: number[] = [];
  const indices: number[] = [];
  const add = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const span = (z: number) => {
    const [left, right] = panelSpan(t.baseX, t.hx, t.baseZ + z);
    return [left - t.baseX, right - t.baseX] as const;
  };
  const zAt = (i: number) => -t.hz + i * 2 * t.hz / nz;
  for (let iz = 0; iz <= nz; iz++) {
    const z = zAt(iz), [left, right] = span(z);
    for (let ix = 0; ix <= nx; ix++) add(left + (right - left) * ix / nx, deckHeight(t.baseZ + z) + 0.01, z);
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * (nx + 1) + ix;
    indices.push(i, i + nx + 1, i + 1, i + 1, i + nx + 1, i + nx + 2);
  }
  // Continuous connected rim: the previous segment-by-segment faces each had
  // their own normal, producing visible vertical ribs on the nose and wings.
  // Averaging the contour tangent and sharing vertices gives a smooth shell.
  const side = (points: [number, number][]) => {
    const profile = [[0.01, 0], [-0.04, 0.026], [-0.14, 0.052], [-0.28, 0.055], [-0.44, 0.035], [-0.58, 0.005], [-0.70, -0.04]];
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
      const dx = after[0] - before[0], dz = after[1] - before[1];
      const len = Math.hypot(dx, dz) || 1;
      const ox = dz / len, oz = -dx / len;
      const wx = t.baseX + x + ox * 0.04, wz = t.baseZ + z + oz * 0.04;
      const [min, max] = planeLimits(wz);
      const exposed = wx < min || wx > max || Math.abs(wz) > 7.7 || !tiles.some(other => other !== t && Math.abs(wx - other.baseX) < other.hx && Math.abs(wz - other.baseZ) < other.hz);
      const h = deckHeight(t.baseZ + z);
      const bottomY = hullBottom(t.baseX + x, t.baseZ + z);
      const rimScale = Math.min(1, Math.max(0.05, (h - bottomY) / 0.70));
      for (const [y, offset] of profile) add(x + ox * offset * rimScale * (exposed ? 1 : 0), h + (y < 0 ? y * rimScale : y), z + oz * offset * rimScale * (exposed ? 1 : 0));
      add(x, bottomY, z);
    }
    const rows = profile.length + 1;
    for (let i = 0; i < points.length - 1; i++) for (let r = 0; r < rows - 1; r++) {
      const a = start + i * rows + r, b = a + rows, c = a + 1, d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  };
  const [startLeft, startRight] = span(-t.hz);
  const [endLeft, endRight] = span(t.hz);
  side(Array.from({ length: nx + 1 }, (_, i) => [startLeft + (startRight - startLeft) * i / nx, -t.hz]));
  side(Array.from({ length: nz + 1 }, (_, i) => [span(zAt(i))[1], zAt(i)]));
  side(Array.from({ length: nx + 1 }, (_, i) => [endRight - (endRight - endLeft) * i / nx, t.hz]));
  side(Array.from({ length: nz + 1 }, (_, i) => [span(zAt(nz - i))[0], zAt(nz - i)]));
  const bottom = positions.length / 3;
  for (let iz = 0; iz <= nz; iz++) {
    const z = zAt(iz), [left, right] = span(z);
    for (let ix = 0; ix <= nx; ix++) {
      const x = left + (right - left) * ix / nx;
      add(x, hullBottom(t.baseX + x, t.baseZ + z), z);
    }
  }
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = bottom + iz * (nx + 1) + ix;
    indices.push(i, i + 1, i + nx + 1, i + 1, i + nx + 2, i + nx + 1);
  }
  const raw = new THREE.BufferGeometry();
  raw.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  raw.setIndex(indices);
  const geo = mergeVertices(raw, 1e-5);
  raw.dispose();
  geo.computeVertexNormals();
  return geo;
}

/** Grey non-stick frying pan, with a plain cooking surface and no food. */
function makePanMesh() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x626a72, roughness: 0.46, metalness: 0.32 });
  const nonstick = new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.68, metalness: 0.1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa5acb2, roughness: 0.35, metalness: 0.7 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x292d32, roughness: 0.75 });
  const profile = [
    [0, -0.095], [0.27, -0.095], [0.38, -0.07], [0.45, -0.02],
    [0.45, 0.06], [0.415, 0.095], [0.37, 0.055], [0.33, 0.018], [0, 0.018],
  ].map(([r, depth]) => new THREE.Vector2(r, depth));
  const pan = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), shell);
  pan.rotation.x = Math.PI / 2;
  pan.position.y = 0.34;
  pan.castShadow = pan.receiveShadow = true;
  g.add(pan);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.35, 48), nonstick);
  surface.position.set(0, 0.34, 0.032);
  g.add(surface);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.023, 10, 48), metal);
  lip.position.set(0, 0.34, 0.095);
  g.add(lip);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.63, 16), shell);
  handle.position.y = -0.2;
  handle.castShadow = true;
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.076, 0.25, 6, 16), gripMat);
  grip.position.y = -0.31;
  grip.castShadow = true;
  g.add(grip);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.013, 8, 20), metal);
  neck.rotation.x = Math.PI / 2;
  neck.position.y = -0.1;
  g.add(neck);
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 16), metal);
  hole.position.set(0, -0.5, 0.072);
  g.add(hole);
  g.scale.setScalar(1.22);
  return g;
}

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
