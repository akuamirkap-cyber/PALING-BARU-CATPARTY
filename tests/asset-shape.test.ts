import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animalById } from '../src/game/animals';
import { buildCharacterVisual, disposeCharacterDetails, poseStatic } from '../src/game/characterMesh';
import { ASSET_TUNING, getRigTuning, getShapeMode, getTuning, setShapeMode, setTuning } from '../src/game/tuning';
import { buildCat } from '../src/catasset/build';
import { SPECS } from '../src/catasset/specs';

/**
 * The playable cat is asked to mimic the "accurate 3D cat" asset
 * (create-3d-asset-without-hat). The asset is a static sculpt, so the game cat
 * keeps its rig and simply adopts the asset's proportions; this test guards
 * that the silhouette stays on target.
 */

/** Full width / height of the front silhouette, sampled in 20 height bands. */
function silhouette(points: { x: number; y: number }[]) {
  let min = Infinity, max = -Infinity;
  for (const p of points) { min = Math.min(min, p.y); max = Math.max(max, p.y); }
  const h = max - min;
  const bands: number[] = [];
  for (let i = 0; i < 20; i++) {
    const y0 = min + (h * i) / 20;
    const y1 = min + (h * (i + 1)) / 20;
    let half = 0;
    for (const p of points) if (p.y >= y0 && p.y <= y1) half = Math.max(half, Math.abs(p.x));
    bands.push((half * 2) / h);
  }
  return { h, bands };
}

function gameSilhouette() {
  const visual = buildCharacterVisual(animalById('oyen'), 'none', 'default', 'default');
  poseStatic(visual, 0.6);
  const root = new THREE.Group();
  root.add(...visual.all);
  root.updateMatrixWorld(true);
  const points: { x: number; y: number }[] = [];
  const v = new THREE.Vector3();
  for (const object of visual.all) {
    if (!(object instanceof THREE.SkinnedMesh)) continue;
    object.skeleton.update();
    const pos = object.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      object.applyBoneTransform(i, v);
      points.push({ x: v.x, y: v.y });
    }
  }
  disposeCharacterDetails(visual.all);
  return silhouette(points);
}

function assetSilhouette() {
  const build = buildCat(SPECS.oyen, 0.03);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < build.body.positions.length; i += 3) {
    points.push({ x: build.body.positions[i], y: build.body.positions[i + 1] });
  }
  return silhouette(points);
}

test('asset shape is the default and mimics the 3D asset silhouette', () => {
  assert.equal(getShapeMode(), 'asset', 'the menu cat starts out shaped like the asset');
  for (const key of Object.keys(ASSET_TUNING) as (keyof typeof ASSET_TUNING)[]) {
    const spec = { head: 0.6, neck: -0.05, jaw: 0.7, ear: 0.7, bodyTop: 0.5, bodyBottom: 0.7, belly: 0.6, armRoot: 0.7, armTip: 0.7, armLen: 0.8, legRoot: 0.7, legTip: 0.7, legH: 0.5 } as Record<string, number>;
    const min = spec[key as string];
    if (min !== undefined) assert.ok(ASSET_TUNING[key] >= min, `${key} inside the slider range`);
  }

  const game = gameSilhouette();
  const asset = assetSilhouette();
  let sum = 0;
  for (let i = 0; i < game.bands.length; i++) {
    const d = game.bands[i] - asset.bands[i];
    sum += d * d;
  }
  const rms = Math.sqrt(sum / game.bands.length);
  assert.ok(rms < 0.07, `silhouette differs from the asset (rms ${rms.toFixed(3)})`);
  assert.ok(game.h > 1.2 && game.h < 2.2, 'the avatar keeps a sane height');
});

test('the rig still works in asset shape: bones, skinning and a grounded stance', () => {
  const visual = buildCharacterVisual(animalById('oyen'), 'none', 'default', 'default');
  poseStatic(visual, 0.6);
  assert.equal(visual.mesh.skeleton.bones.length, 6, 'six bones (torso/head/arms/legs)');
  const arms = visual.all.filter((o) => o instanceof THREE.SkinnedMesh && o !== visual.mesh);
  assert.equal(arms.length, 1, 'arms stay a separate rigid piece');
  const root = new THREE.Group();
  root.add(...visual.all);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  assert.ok(box.min.y > -0.02, 'feet sit on the floor, not through it');
  assert.ok(box.max.y > box.min.y + 1, 'the body has height');

  // every vertex is weighted, otherwise the ragdoll would leave pieces behind
  const weights = visual.mesh.geometry.getAttribute('skinWeight');
  let weightless = 0;
  for (let i = 0; i < weights.count; i++) {
    const total = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
    if (total < 0.5) weightless++;
  }
  assert.equal(weightless, 0, 'every vertex follows the skeleton');
  disposeCharacterDetails(visual.all);
});

test('shape mode stays reversible and never eats the slider values', () => {
  const saved = { ...getTuning() };
  const mode = getShapeMode();
  try {
    setTuning({ eyeSize: 1.3, head: 0.8 });
    const custom = { ...getTuning() };
    setShapeMode('classic');
    const classicHead = getRigTuning().head;
    setShapeMode('asset');
    assert.equal(getTuning().head, custom.head, 'sliders keep the value the player set');
    assert.notEqual(getRigTuning().head, classicHead, 'asset mode reshapes the body');
    assert.equal(getRigTuning().eyeSize, custom.eyeSize, 'face settings are untouched');
    // the player's own adjustment still shifts the asset baseline
    assert.ok(Math.abs(getRigTuning().head - (ASSET_TUNING.head + 0.8 - 0.74)) < 0.11);
  } finally {
    setShapeMode(mode);
    setTuning(saved);
  }
});
