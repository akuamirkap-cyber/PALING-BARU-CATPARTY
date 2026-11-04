import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { animalById } from '../src/game/animals';
import { buildCharacterVisual, poseStatic } from '../src/game/characterMesh';
import { getShapeMode, getTuning, getRigTuning, setShapeMode, setTuning, tuningKey } from '../src/game/tuning';

function digest(geometry: THREE.BufferGeometry) {
  const hash = createHash('sha256');
  for (const name of ['position', 'color', 'skinIndex', 'skinWeight']) {
    const array = geometry.getAttribute(name).array;
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest('hex');
}
function decalSnapshot(object: THREE.Object3D) {
  const colors: number[] = [], coords: number[] = [];
  object.traverse(o => {
    if (o instanceof THREE.Mesh) {
      colors.push((o.material as THREE.MeshStandardMaterial).color.getHex());
      coords.push(...Array.from(o.geometry.getAttribute('position').array));
    }
  });
  return { colors, coords };
}

test('shape mode is optional, reversible and keeps colors, expressions and tuning', () => {
  const saved = { ...getTuning() }, mode = getShapeMode();
  try {
    setShapeMode('classic');
    setTuning({ armLen: 1.03, eyeSize: 1.21 });
    const custom = { ...getTuning() };
    const classicKey = tuningKey();
    for (const id of ['oyen', 'siam', 'item'] as const) {
      const cat = animalById(id);
      const old = buildCharacterVisual(cat, 'none', 'grumpy', 'tongue');
      const oldMesh = digest(old.mesh.geometry);
      const oldEyes = decalSnapshot(old.eyesNormal);
      const oldMouth = decalSnapshot(old.mouthN);
      setShapeMode('figure');
      const figure = buildCharacterVisual(cat, 'none', 'grumpy', 'tongue');
      assert.notEqual(tuningKey(), classicKey);
      assert.notEqual(digest(figure.mesh.geometry), oldMesh, 'figure must have its own body mesh');
      assert.deepEqual(getTuning(), custom, 'changing mode must not overwrite sliders');
      assert.equal(getRigTuning().eyeSize, custom.eyeSize);
      assert.equal(getRigTuning().legRoot, custom.legRoot);
      assert.equal(getRigTuning().legTip, custom.legTip);
      const eyes = decalSnapshot(figure.eyesNormal), mouth = decalSnapshot(figure.mouthN);
      assert.deepEqual(eyes.colors, oldEyes.colors, 'eye colors and style must not change');
      assert.deepEqual(mouth.colors, oldMouth.colors, 'mouth expression and colors must not change');
      assert.equal(eyes.coords.length, oldEyes.coords.length);
      assert.equal(mouth.coords.length, oldMouth.coords.length);
      assert(eyes.coords.every((x, i) => Math.abs(x - oldEyes.coords[i]) < 0.01), 'eye design changed');
      assert(mouth.coords.every((x, i) => Math.abs(x - oldMouth.coords[i]) < 0.01), 'expression design changed');
      poseStatic(figure, 1.5);
      assert.equal(figure.eyesNormal.children.length, 2);
      assert.equal(figure.pupils.length, 2);
      setShapeMode('classic');
      assert.equal(digest(buildCharacterVisual(cat, 'none', 'grumpy', 'tongue').mesh.geometry), oldMesh, 'classic shape/colors must return exactly');
    }
  } finally {
    setShapeMode(mode);
    setTuning(saved);
  }
});

test('figurine feet reach the floor and the relaxed paws clear the body', async () => {
  const rig = await import('../src/game/rig');
  const mode = getShapeMode();
  try {
    setShapeMode('figure');
    const visual = buildCharacterVisual(animalById('oyen'), 'capRed');
    poseStatic(visual, 0);
    for (const o of visual.all) o.updateMatrixWorld(true);
    const position = visual.mesh.geometry.getAttribute('position');
    const index = visual.mesh.geometry.getAttribute('skinIndex');
    const weight = visual.mesh.geometry.getAttribute('skinWeight');
    const bottoms = [Infinity, Infinity];
    for (let i = 0; i < position.count; i++) {
      for (let j = 0; j < 4; j++) {
        const bone = index.getComponent(i, j);
        if ((bone === 4 || bone === 5) && weight.getComponent(i, j) > 0.8) {
          const p = new THREE.Vector3().fromBufferAttribute(position as THREE.BufferAttribute, i);
          visual.mesh.applyBoneTransform(i, p);
          bottoms[bone - 4] = Math.min(bottoms[bone - 4], p.y);
        }
      }
    }
    assert(bottoms.every(y => y > -0.015 && y < 0.02), `feet should meet the floor: ${bottoms}`);
    for (let t = 0; t < 6.4; t += 0.2) {
      poseStatic(visual, t);
      for (const o of visual.all) o.updateMatrixWorld(true);
      for (const arm of [visual.armL, visual.armR]) {
        const hand = visual.torso.worldToLocal(arm.localToWorld(new THREE.Vector3(...rig.HAND)));
        const corrected = hand.clone();
        rig.pushOut(corrected, 0.104 * getRigTuning().armTip * 0.9, rig.selfVolumes().torso);
        assert(hand.distanceTo(corrected) < 0.005, 'relaxed paw should stay outside the torso throughout its idle motion');
      }
    }
  } finally { setShapeMode(mode); }
});
