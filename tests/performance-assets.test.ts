import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANIMALS } from '../src/game/animals';
import { buildCharacterVisual, hasCharacterAsset, installCharacterAsset, packCharacterAsset } from '../src/game/characterMesh';
import { getShapeMode, resetTuning, setShapeMode, setTuning, tuningKey } from '../src/game/tuning';

const bytes = (array: ArrayBufferView) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

test('worker mesh transfer preserves full-detail skin, bones and tuning in both shape modes', () => {
  const oldShape = getShapeMode();
  try {
    for (const mode of ['classic', 'figure'] as const) {
      setShapeMode(mode);
      for (const noEars of [false, true]) {
        setTuning({ bodyH: 0.61 });
        const revision = tuningKey();
        const def = ANIMALS[0];
        const packed = packCharacterAsset(def, noEars);
        // Force this animal's old cache entry out, as happens after editing proportions.
        setTuning({ bodyH: 0.67 });
        packCharacterAsset(def, noEars);
        assert(!installCharacterAsset(def, noEars, revision, packed), 'stale worker results must be ignored');
        setTuning({ bodyH: 0.61 });
        assert(!hasCharacterAsset(def, noEars));
        assert(installCharacterAsset(def, noEars, revision, packed));
        const visual = buildCharacterVisual(def, noEars ? 'helmet' : 'none');
        const geometry = visual.mesh.geometry;
        for (const name of ['position', 'normal', 'color', 'skinIndex', 'skinWeight'] as const) {
          assert(bytes(geometry.getAttribute(name).array).equals(bytes(packed.geometry[name])), `${mode} ${name} must be unchanged`);
        }
        assert(bytes(geometry.getIndex()!.array).equals(bytes(packed.geometry.index)));
        assert.equal(visual.mesh.skeleton.bones.length, 6);
      }
    }
  } finally {
    setShapeMode(oldShape);
    resetTuning();
  }
});

test('closed caps retain their triangles, shadow and detachable root with far fewer meshes', () => {
  for (const cap of ['capNewRed', 'capNewBlue'] as const) {
    const v = buildCharacterVisual(ANIMALS[0], cap);
    assert(v.accessory && v.uncoveredGeometry);
    let meshes = 0, triangles = 0;
    v.accessory.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      meshes++;
      assert(o.castShadow);
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    });
    assert.equal(triangles, 27416, 'the cap geometry must retain its detail');
    assert(meshes <= 5, `batched cap uses ${meshes} meshes rather than the original 30`);
    assert.equal(v.accessory.parent, v.head, 'cap must remain on the detachable head pivot');
  }
});
