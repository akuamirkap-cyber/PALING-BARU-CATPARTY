import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addLobbyLights, buildLobbyScenery, disposeLobbyActor, frameLobbyCamera, hillY, lobbySpacing, makeLobbyActor } from '../src/components/lobbyStage';
import { buildRoster } from '../src/components/MatchLobby';
import { buildCharacterVisual } from '../src/game/characterMesh';
import { ANIMALS } from '../src/game/animals';

// The character builder samples textures through a 2D canvas.
const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };

const you = { animal: 'oyen' as const, accessory: 'capNewRed' as const, eyeStyle: 'default' as const, expression: 'default' as const };

test('the hill is flat under the cats and drops away behind them', () => {
  for (const x of [-4, -1, 0, 1.5, 4]) {
    assert(Math.abs(hillY(x, 0)) < 0.06, `standing spot ${x} should be level`);
    assert(Math.abs(hillY(x, 1)) < 0.1, `front edge ${x} should stay walkable`);
  }
  assert(hillY(0, -14) < hillY(0, 0) - 0.4, 'the hill falls away behind the line-up');
  assert(hillY(16, 0) < hillY(0, 0) - 0.3, 'the hill rolls off to the sides');
});

test('the hill scene owns its geometry and frees it on dispose', () => {
  const scene = new THREE.Scene();
  addLobbyLights(scene);
  const scenery = buildLobbyScenery(scene);
  assert.equal(scenery.clouds.length > 0, true, 'clouds drift across the sky');

  let meshes = 0;
  let lights = 0;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes++;
    if ((o as THREE.Light).isLight) lights++;
  });
  assert(meshes > 8, `the hill stage should have scenery, got ${meshes} meshes`);
  assert(lights >= 3, 'key, fill and hemisphere lights');

  const disposed = new Set<THREE.BufferGeometry>();
  const original = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function patched(this: THREE.BufferGeometry) {
    disposed.add(this);
    return original.call(this);
  };
  try {
    scenery.dispose();
  } finally {
    THREE.BufferGeometry.prototype.dispose = original;
  }
  assert(disposed.size > 4, 'hill, sky, clouds and props are released');
});

test('every cat in the row is framed inside the viewport', () => {
  for (const bots of [1, 3, 5, 7]) {
    const roster = buildRoster({ you, bots, friend: { animal: 'item', accessory: 'capNewBlue' } });
    const count = roster.length;
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);
    frameLobbyCamera(camera, count, 16 / 9);
    camera.updateMatrixWorld();
    const spacing = lobbySpacing(count);
    const center = (count - 1) / 2;
    let minX = 1;
    let maxX = -1;
    let highest = 1;
    for (let i = 0; i < count; i++) {
      const x = (i - center) * spacing;
      for (const y of [0, 1.55]) {
        for (const dx of [-0.42, 0.42]) {
          const ndc = new THREE.Vector3(x + dx, y, 0).project(camera);
          minX = Math.min(minX, ndc.x);
          maxX = Math.max(maxX, ndc.x);
          highest = Math.min(highest, (1 - ndc.y) / 2);
        }
      }
    }
    assert(minX > -0.98 && maxX < 0.98, `row ${count} fits horizontally (${minX.toFixed(2)}..${maxX.toFixed(2)})`);
    assert(highest > 0.1, `row ${count} keeps the cats below the timer (top at ${(highest * 100).toFixed(0)}%)`);
  }
});

test('lobby cats are built once, centred and disposed without touching shared meshes', () => {
  const scene = new THREE.Scene();
  const roster = buildRoster({ you, bots: 4 });
  const spacing = lobbySpacing(roster.length);
  const center = (roster.length - 1) / 2;
  const actors = roster.map((member, i) => makeLobbyActor(scene, member, i, center, spacing, 0));
  assert.equal(actors.length, roster.length);
  const youIndex = roster.findIndex((m) => m.you);
  assert.equal(actors[youIndex].x, 0, 'you stand in the middle of the hill');
  assert.equal(actors[youIndex].you, true);
  assert(actors[youIndex].base > actors[0].base, 'your cat is a little bigger');
  assert(actors[youIndex].top > 1.2, 'the name tag anchors above the head');

  const shared = actors[0].v.mesh.geometry;
  const disposed = new Set<THREE.BufferGeometry>();
  const original = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function patched(this: THREE.BufferGeometry) {
    disposed.add(this);
    return original.call(this);
  };
  try {
    for (const actor of actors) disposeLobbyActor(scene, actor);
  } finally {
    THREE.BufferGeometry.prototype.dispose = original;
  }
  assert(!disposed.has(shared), 'cached cat geometry survives the lobby teardown');
  assert.equal(scene.children.includes(actors[0].group), false, 'cats leave the scene');

  const rebuilt = buildCharacterVisual(ANIMALS[0], 'none');
  assert(rebuilt.mesh.geometry.getAttribute('position')!.count > 100, 'cats can still be rebuilt afterwards');
});
