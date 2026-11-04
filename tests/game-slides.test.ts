import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GAME_SLIDES, SLIDE_SCENES } from '../src/components/GameSlides';
import { buildCharacterVisual } from '../src/game/characterMesh';
import { ANIMALS } from '../src/game/animals';

// The character builder samples textures through a 2D canvas.
const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };

function skinnedMeshes(scene: THREE.Scene) {
  const found: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) found.push(o as THREE.SkinnedMesh); });
  return found;
}

test('three game slides build, animate and clean up without touching cached cat assets', () => {
  assert.equal(GAME_SLIDES.length, 3);
  for (const kind of ['brawl', 'balls', 'layout'] as const) {
    const scene = new THREE.Scene();
    const built = SLIDE_SCENES[kind](scene);
    let meshes = 0;
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    assert(meshes > 2, `${kind} slide should contain visible geometry, got ${meshes}`);
    // Animating must stay finite (no NaN transforms leaking into the menu).
    for (const t of [0, 0.4, 1.7, 6.2]) built.animate(t, 1 / 60);
    scene.traverse((o) => {
      for (const v of [o.position.x, o.position.y, o.position.z]) assert(Number.isFinite(v));
    });

    // Cat geometry is cached and shared with the menu/game: it must survive.
    const shared = skinnedMeshes(scene).map((m) => m.geometry);
    const disposed = new Set<THREE.BufferGeometry>();
    const original = THREE.BufferGeometry.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function patched(this: THREE.BufferGeometry) {
      disposed.add(this);
      return original.call(this);
    };
    try {
      built.dispose();
    } finally {
      THREE.BufferGeometry.prototype.dispose = original;
    }
    for (const geometry of shared) {
      assert(!disposed.has(geometry), `${kind} slide must not free the shared cat mesh`);
      assert(geometry.getAttribute('position'), `${kind} slide cat mesh should stay usable`);
    }
  }
});

test('each slide shows a different design', () => {
  const cats: Record<string, number> = {};
  const own: Record<string, number> = {};
  for (const kind of ['brawl', 'balls', 'layout'] as const) {
    const scene = new THREE.Scene();
    const built = SLIDE_SCENES[kind](scene);
    // every cat is a body mesh + a separate arm mesh
    cats[kind] = skinnedMeshes(scene).length / 2;
    let count = 0;
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) count++; });
    own[kind] = count - cats[kind];
    built.dispose();
  }
  assert.equal(cats.brawl, 2, 'the brawl slide stages two fighting cats');
  assert.equal(cats.balls, 0, 'the ball-figure reference has no cat meshes');
  assert.equal(cats.layout, 2, 'the menu-layout reference stages two hopping cats');
  assert(own.balls >= 3, 'the ball reference is built from its own props');
});

test('the cached cat mesh still renders after every slide was disposed', () => {
  for (const kind of ['brawl', 'balls', 'layout'] as const) {
    const scene = new THREE.Scene();
    SLIDE_SCENES[kind](scene).dispose();
  }
  const visual = buildCharacterVisual(ANIMALS[0], 'none');
  const position = visual.mesh.geometry.getAttribute('position');
  assert(position && position.count > 100, 'character geometry survives slide teardown');
  visual.mesh.material.dispose();
});
