import * as CANNON from "cannon-es";
import * as THREE from "three";
import { mat } from "./characterMesh";
import type { Bat } from "./Character";

export const TILE = 2.2;
export const GRID = 7;
export const HALF = (TILE * GRID) / 2;
const THICK = 1.2;

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
  vel: number;
  angVel: THREE.Vector3;
  active: boolean;
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
  plane: THREE.Group | null = null;
  tFly = 0;

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
      body.addShape(new CANNON.Box(new CANNON.Vec3(hx, THICK / 2, hz)));
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
    const plane = new THREE.Group();
    this.plane = plane;
    this.group.add(plane);
    const cream = mat(0xf6f1e6, 0.55);
    const creamDark = mat(0xe6dfcf, 0.6);
    const red = mat(0xe84a4a, 0.5);
    const steel = mat(0x8fa3b8, 0.4);
    const darkMetal = mat(0x4a5568, 0.5);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fd4f5, roughness: 0.12, metalness: 0.2, clearcoat: 1 });

    // ---- hull top: one chunk per physics panel, using the AIRPLANE livery ----
    const hullTex = hullTopTexture();
    const hullMat = new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.58, metalness: 0.12 });
    for (const t of this.tiles) {
      // wedge-shaped chunk in the panel's local frame, top surface exactly at y=0.02
      const geo = buildPanelGeometry(t);
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
      skin.castShadow = true;
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
      this.chunks.push({ mesh: chunk, edge, tile: t, vel: 0, angVel: new THREE.Vector3(), active: false });
    }

    // ---- fuselage belly under the walkable panels ----
    const bodyShape = roundedRectShapeWH(8.3, 3.1, 2.2);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 3.4,
      bevelEnabled: true,
      bevelSize: 0.6,
      bevelThickness: 0.5,
      bevelSegments: 4,
      curveSegments: 32,
    });
    bodyGeo.rotateX(-Math.PI / 2);
    bodyGeo.computeBoundingBox();
    bodyGeo.translate(0, -0.55 - bodyGeo.boundingBox!.max.y, 0);
    const airBody = new THREE.Mesh(bodyGeo, cream);
    airBody.castShadow = true;
    airBody.receiveShadow = true;
    plane.add(airBody);
    // red cheatline + white pinstripe hugging the fuselage sides
    for (const sz of [1, -1]) {
      for (const [y, hh, matl] of [
        [-2.6, 0.42, red],
        [-2.15, 0.12, mat(0xffffff, 0.5)],
      ] as const) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(13.5, hh, 0.1), matl);
        line.position.set(-0.3, y, sz * 3.35);
        plane.add(line);
      }
    }
    // side windows
    const winMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
    const winGeo = new THREE.BoxGeometry(1.05, 0.72, 0.16);
    for (const sz of [1, -1]) {
      for (let k = 0; k < 6; k++) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.position.set(-5.4 + k * 2.15, -1.5, sz * 3.45);
        plane.add(w);
      }
    }

    // ---- meow-air lettering on the hull sides ----
    {
      const tc = document.createElement("canvas");
      tc.width = 512;
      tc.height = 128;
      const tg = tc.getContext("2d")!;
      tg.font = "900 64px Nunito, sans-serif";
      tg.textAlign = "center";
      tg.textBaseline = "middle";
      tg.fillStyle = "#e84a4a";
      tg.fillText("★ MEOW AIR ★", 256, 66);
      const ttex = new THREE.CanvasTexture(tc);
      ttex.colorSpace = THREE.SRGBColorSpace;
      for (const sz of [1, -1]) {
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(5.4, 1.35),
          new THREE.MeshBasicMaterial({ map: ttex, transparent: true, side: THREE.DoubleSide })
        );
        decal.position.set(-2.4, -1.5, sz * 3.5);
        if (sz < 0) decal.rotation.y = Math.PI;
        plane.add(decal);
      }
    }

    // ---- nose + cockpit (in front of the play area, so it never blocks standing) ----
    const noseBody = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), cream);
    noseBody.scale.set(4.4, 1.7, 4.4);
    noseBody.position.set(9.9, -1.6, 0);
    noseBody.castShadow = true;
    plane.add(noseBody);
    // sloped nose deck with 3 windshield panes (dark glass)
    const noseDeck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 4.6), cream);
    noseDeck.position.set(9.2, -0.42, 0);
    noseDeck.rotation.z = -0.16;
    plane.add(noseDeck);
    for (const sz of [-1.45, 0, 1.45]) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 1.25), glass);
      pane.position.set(9.25, -0.14, sz);
      pane.rotation.z = -0.28;
      plane.add(pane);
    }
    // slim cockpit windshield sitting on the nose (outside the play area)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.62, 3.3), glass);
    shield.position.set(8.3, 0.18, 0);
    shield.rotation.z = 0.42;
    plane.add(shield);
    for (const sz of [-1.5, 1.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.12), creamDark);
      post.position.set(8.3, 0.22, sz);
      post.rotation.z = 0.42;
      plane.add(post);
    }
    // red spinner + nose prop
    const spinnerCone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.4, 22), red);
    spinnerCone.rotation.z = -Math.PI / 2;
    spinnerCone.position.set(13.9, -1.55, 0);
    plane.add(spinnerCone);

    // ---- tail: fin + stabilizers behind the play area ----
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 5.4), cream);
    tail.position.set(-9.7, -1.2, 0);
    plane.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 1.9), red);
    fin.position.set(-12.1, 1.15, 0);
    fin.rotation.z = 0.12;
    plane.add(fin);
    const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.6, 1.94), mat(0xffffff, 0.5));
    finStripe.position.set(-12.15, 1.5, 0);
    finStripe.rotation.z = 0.12;
    plane.add(finStripe);
    for (const sz of [1, -1]) {
      const stab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 4.6), cream);
      stab.position.set(-10.0, -0.95, sz * 3.4);
      plane.add(stab);
    }

    // ---- shoulder wings (clearly visible beyond the standable wing-top) ----
    for (const sz of [1, -1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.4, 7.6), cream);
      wing.position.set(0.8, -0.28, sz * 11.2);
      wing.rotation.x = sz * 0.08;
      wing.rotation.y = sz * 0.06;
      wing.castShadow = true;
      wing.receiveShadow = true;
      plane.add(wing);
      // red wingtip with rounded cap
      const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), red);
      tip.scale.set(3.4, 0.35, 1.6);
      tip.position.set(0.8, -0.22, sz * 15.15);
      tip.castShadow = true;
      plane.add(tip);
      const nav = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshBasicMaterial({ color: sz > 0 ? 0x00ff88 : 0xff3333 })
      );
      nav.position.set(0.8, 0.0, sz * 15.9);
      nav.userData.blink = true;
      nav.userData.phase = sz;
      plane.add(nav);
      // flap line so it reads as a wing, not a slab
      const flap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 0.5), creamDark);
      flap.position.set(0.75, -0.05, sz * 10.6);
      plane.add(flap);
    }

    // ---- propellers: nose + two wing engines ----
    const mkProp = (x: number, y: number, z: number, s: number) => {
      const mount = new THREE.Group();
      mount.position.set(x, y, z);
      mount.rotation.z = -Math.PI / 2;
      const spinner = new THREE.Group();
      spinner.userData.spin = true;
      spinner.userData.spinSpeed = 16;
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), mat(0xffc93c, 0.4));
      spinner.add(hub);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 2.6), darkMetal);
        blade.position.z = 1.2;
        const pivot = new THREE.Group();
        pivot.rotation.y = (b / 3) * Math.PI * 2;
        pivot.add(blade);
        spinner.add(pivot);
      }
      mount.add(spinner);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.55, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
      );
      disc.rotation.x = -Math.PI / 2;
      mount.add(disc);
      mount.scale.setScalar(s);
      plane.add(mount);
    };
    mkProp(15.9, -1.55, 0, 1.2);
    for (const sz of [1, -1]) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 4.4, 16), steel);
      nac.rotation.z = Math.PI / 2;
      nac.position.set(1.9, -0.9, sz * 11.0);
      plane.add(nac);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.35), darkMetal);
      strut.position.set(1.9, -1.1, sz * 11.0);
      plane.add(strut);
      mkProp(4.35, -0.9, sz * 11.0, 0.9);
    }

    // ---- landing skids under the belly (depth cue) ----
    for (const sz of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 3.2), darkMetal);
      skid.position.set(-2.5, -4.3, sz * 3.2);
      plane.add(skid);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.55, 16), mat(0x2b2f3a, 0.7));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-2.5, -4.75, sz * 3.2);
      plane.add(wheel);
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
      const r = 30 + Math.random() * 34;
      cloud.position.set(Math.cos(a) * r, -16 - Math.random() * 16, Math.sin(a) * r);
      cloud.userData.drift = -(2.2 + Math.random() * 1.6);
      this.group.add(cloud);
    }
    // backdrop clouds high behind the plane (parallax depth while flying)
    for (let k = 0; k < 6; k++) {
      const cloud = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 3);
      for (let p = 0; p < n; p++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const s = 2.5 + Math.random() * 2.5;
        m.scale.set(s, s * 0.7, s);
        m.position.set(p * 2.5 - n, Math.random() * 0.8, Math.random() * 1.5);
        cloud.add(m);
      }
      cloud.position.set(-40 + Math.random() * 80, 10 + Math.random() * 9, -34 - Math.random() * 22);
      cloud.userData.drift = -(0.7 + Math.random() * 0.6);
      this.group.add(cloud);
    }
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
    }

    // baseball bats lying around (on solid wing panels)
    for (const [x, z, a] of [
      [0.9, 3.4, 0.6],
      [1.2, -3.2, -0.9],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.5, material: this.groundMat, linearDamping: 0.05, angularDamping: 0.25 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 0.72, 0.07)));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.48, 0));
      body.position.set(x, 0.2, z);
      body.quaternion.setFromEuler(Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makeBatMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "bat", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set() });
    }

    // cute teflon frying pans lying around (shorter, wider BONK!)
    for (const [x, z, a] of [
      [-2.4, -0.6, 0.4],
      [3.4, 0.8, -0.7],
    ] as const) {
      const body = new CANNON.Body({ mass: 1.3, material: this.groundMat, linearDamping: 0.05, angularDamping: 0.25 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.45, 0.06)), new CANNON.Vec3(0, -0.1, 0));
      body.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(0, 0.48, 0));
      body.position.set(x, 0.25, z);
      body.quaternion.setFromEuler(Math.PI / 2, a, 0);
      this.addBody(body);
      const mesh = makePanMesh();
      this.group.add(mesh);
      this.bats.push({ kind: "pan", body, mesh, holder: null, thrower: null, flyT: 0, hit: new Set() });
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
      b.position.set(0.75, 1.5, -1.2);
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
    for (const t of this.tiles) {
      if (t.state !== "solid") continue;
      if (Math.abs(x - t.baseX) <= t.hx - margin && Math.abs(z - t.baseZ) <= t.hz - margin) return true;
    }
    return false;
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
    const t = pool[Math.floor(Math.random() * pool.length)];
    return {
      x: t.baseX + (Math.random() * 2 - 1) * Math.max(0.1, t.hx - margin),
      z: t.baseZ + (Math.random() * 2 - 1) * Math.max(0.1, t.hz - margin),
    };
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
        ch.active = true;
      } else if (st === "fall") {
        if (!ch.active || ch.vel === 0) {
          ch.active = true;
          ch.vel = -2;
          ch.angVel.set((Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.1);
        }
        edgeMat.opacity = 1;
        ch.vel = Math.max(ch.vel - 18 * dt, -25);
        ch.mesh.position.y += ch.vel * dt;
        ch.mesh.rotation.x += ch.angVel.x * dt;
        ch.mesh.rotation.y += ch.angVel.y * dt;
        ch.mesh.rotation.z += ch.angVel.z * dt;
        if (ch.mesh.position.y < -45) {
          ch.mesh.visible = false;
          ch.active = false;
        }
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
    // gentle flight bob on the plane only (deck physics stays fixed)
    this.tFly += dt;
    // (no airframe bobbing: the hull IS the floor, so feet must stay glued to it)
    this.group.traverse((o) => {
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
    });
    void time;
  }

  dispose() {
    for (const b of this.bodies) if (this.world.bodies.includes(b)) this.world.removeBody(b);
    for (const ch of this.chunks) {
      ch.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (m as unknown as THREE.LineSegments).isLineSegments) {
          (m.geometry as THREE.BufferGeometry)?.dispose?.();
        }
      });
    }
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
  // base cream hull
  g.fillStyle = "#f3ede0";
  g.fillRect(0, 0, S, S);
  // fuselage spine (brighter band down the middle, nose -> tail along X)
  g.fillStyle = "#faf6ec";
  g.fillRect(0, py(1.35), S, py(-1.35) - py(1.35));
  // soft shading toward the wingtips
  const vg = g.createLinearGradient(0, 0, 0, S);
  vg.addColorStop(0, "rgba(120,105,85,0.18)");
  vg.addColorStop(0.2, "rgba(120,105,85,0)");
  vg.addColorStop(0.8, "rgba(120,105,85,0)");
  vg.addColorStop(1, "rgba(120,105,85,0.18)");
  g.fillStyle = vg;
  g.fillRect(0, 0, S, S);
  // red pinstripes framing the spine
  g.strokeStyle = "#e0574f";
  g.lineWidth = 9;
  for (const z of [1.38, -1.38]) {
    g.beginPath();
    g.moveTo(0, py(z));
    g.lineTo(S, py(z));
    g.stroke();
  }
  // spanwise wing ribs + rivets (run WITH the wing = airplane, not a grid floor)
  for (const z of [2.4, 3.3, 4.3, 5.4, 6.5, -2.4, -3.3, -4.3, -5.4, -6.5]) {
    g.strokeStyle = "rgba(150,135,110,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px(-7), py(z));
    g.lineTo(px(7), py(z));
    g.stroke();
    g.fillStyle = "rgba(130,115,95,0.55)";
    for (let x = -6.8; x <= 6.8; x += 1.4) {
      g.beginPath();
      g.arc(px(x), py(z), 3.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  // aileron hatch lines on the wings
  g.strokeStyle = "rgba(150,135,110,0.55)";
  g.lineWidth = 4;
  for (const z of [3.0, 4.9, 5.9, -3.0, -4.9, -5.9]) {
    for (const x of [-1.5, 0.6]) {
      g.beginPath();
      g.moveTo(px(x), py(z));
      g.lineTo(px(x + 2.2), py(z));
      g.stroke();
    }
  }
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
  g.lineWidth = 10;
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

/** wedge footprint for one physics panel (local coords): nose tapers, wingtips taper */
function buildPanelGeometry(t: Tile) {
  const shape = new THREE.Shape();
  const w = t.hx * 2;
  const d = t.hz * 2;
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.min(0.5, Math.min(w, d) * 0.24);
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSize: 0.07,
    bevelThickness: 0.06,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, 0.02 - geo.boundingBox!.max.y, 0);
  return geo;
}

function roundedRectShapeWH(hw: number, hd: number, r: number) {
  const s = new THREE.Shape();
  const rr = Math.max(0.02, Math.min(r, hw * 0.99, hd * 0.99));
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  s.lineTo(hw, hd - rr);
  s.quadraticCurveTo(hw, hd, hw - rr, hd);
  s.lineTo(-hw + rr, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  s.lineTo(-hw, -hd + rr);
  s.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  return s;
}

/** chunky, toy-like cartoon baseball bat (1.5x), centred on its body origin, handle toward -Y */
/** cute pastel teflon frying pan, centred on its body origin, handle toward -Y (same grip frame as the bat) */
function makePanMesh() {
  const g = new THREE.Group();
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xff8fb3, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const darkPink = new THREE.MeshStandardMaterial({ color: 0xe86a94, roughness: 0.5 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.25, metalness: 0.55 });
  // handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.85, 14), darkPink);
  handle.position.y = -0.18;
  handle.castShadow = true;
  g.add(handle);
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18), darkPink);
  hole.position.y = -0.62;
  g.add(hole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), pink);
  knob.scale.set(1.15, 0.6, 1.15);
  knob.position.y = -0.58;
  g.add(knob);
  // pan body: flat wide disc + rim
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.46, 0.13, 32), pink);
  disc.position.y = 0.48;
  disc.castShadow = true;
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 36), darkPink);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.55;
  g.add(rim);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 32), inner);
  bottom.position.y = 0.53;
  g.add(bottom);
  // fried egg face on the pan (cute!)
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  white.scale.set(1, 0.28, 1);
  white.position.set(0.02, 0.57, 0.02);
  g.add(white);
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xffb52e, roughness: 0.35, clearcoat: 0.6 }));
  yolk.scale.set(1, 0.45, 1);
  yolk.position.set(0.02, 0.6, 0.02);
  g.add(yolk);
  const dark = new THREE.MeshBasicMaterial({ color: 0x3a2a2a });
  for (const sx of [-0.05, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), dark);
    eye.position.set(sx, 0.63, 0.1);
    g.add(eye);
  }
  g.scale.setScalar(1.15);
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
