const ctxStub: any = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }) };
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { Character, GRAVITY, bodyOwner } from "../src/game/Character";
import { ANIMALS } from "../src/game/animals";
import { emptyControl } from "../src/game/input";
import { Arena } from "../src/game/Arena";
import { setTuning, TUNING_DEFAULTS } from "../src/game/tuning";
import * as rig from "../src/game/rig";
for (const [legH, bodyH] of [[1, 0.6], [0.5, 0.6], [1.6, 0.6], [2.0, 1.2], [1, 0.45]]) {
  setTuning({ ...TUNING_DEFAULTS, legH, bodyH });
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  (world.solver as CANNON.GSSolver).iterations = 14;
  const gm = new CANNON.Material("g");
  const arena = new Arena(world, new THREE.Scene(), gm);
  Character.bats = arena.bats; Character.thrownProps = [];
  const hooks = { onLand() {}, onStep() {}, onHit() {}, onKO() {} } as any;
  const A = new Character(world, 0, ANIMALS[0], "A", 1, hooks, new THREE.Vector3(1, 0.05, 1), 0, emptyControl());
  Character.all = [A];
  const pt = new CANNON.Vec3();
  const step = (f?: () => void) => {
    f?.(); A.heldBy = 0; A.carriedBy = null; A.frameActions(1 / 60);
    for (let s = 0; s < 2; s++) { A.physicsStep(1 / 120); world.step(1 / 120);
      for (const con of world.contacts) { const a = bodyOwner.get(con.bi), b = bodyOwner.get(con.bj); if (a) { con.bi.position.vadd(con.ri, pt); a.char.onContact(a.part, con.bj, pt, b); } if (b) { con.bj.position.vadd(con.rj, pt); b.char.onContact(b.part, con.bi, pt, a); } }
      A.updateHolds(1 / 120); }
  };
  for (let i = 0; i < 90; i++) step();
  const foot = A.legL.pointToWorldFrame(new CANNON.Vec3(...rig.FOOT));
  const footBottom = foot.y - 0.1 * 0.74 * (0.7 + 0.3 * 0.74); // sole thickness
  let maxV = 0;
  const y0 = A.torso.position.y, gr = A.grounded;
  for (let i = 0; i < 40; i++) step(() => { A.input.mx = 1; A.input.run = true; });
  maxV = Math.hypot(A.torso.velocity.x, A.torso.velocity.z);
  console.log(`legH=${legH} bodyH=${bodyH}: hover=${rig.HOVER.toFixed(2)} torsoY=${y0.toFixed(2)} grounded0=${gr} sole~${footBottom.toFixed(3)} grounded=${A.grounded} up=${A.torso.quaternion.vmult(new CANNON.Vec3(0,1,0)).y.toFixed(2)} runV=${maxV.toFixed(1)}`);
}
