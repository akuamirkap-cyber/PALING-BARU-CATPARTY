import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ACCESSORIES, ANIMALS } from '../src/game/animals';
import { buildCharacterVisual } from '../src/game/characterMesh';
import { FACE_EYES, FACE_MOUTHS } from '../src/game/eyes';
import { createRoster, type GameOptions } from '../src/game/Game';

// canvas stub — the SDF body builder only needs a 2d context for textures
const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };

test('the slide-1 accessories (crown + shades) exist and build real 3D props', () => {
  for (const id of ['crown', 'shades'] as const) {
    assert.ok(ACCESSORIES.some((a) => a.id === id), `${id} is in the wardrobe list`);
    const visual = buildCharacterVisual(ANIMALS[0], id);
    assert.equal(visual.accessoryKind, id, `${id} attaches as its own kind`);
    // rigid pieces are batched per material, so count vertices, not children
    let verts = 0;
    visual.accessory?.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g?.attributes.position) verts += g.attributes.position.count;
    });
    assert.ok(visual.accessory && verts > 100, `${id} builds real geometry (${verts} verts)`);
    assert.equal(visual.googly.length, 0, 'neither prop adds googly eyes');
  }
  assert.ok(ACCESSORIES.length >= 24, `full accessory set (${ACCESSORIES.length})`);
});

test('every accessory from the menu games (Bounce Paws & Ball Party) is wearable', () => {
  const fromGames = ['cowboy', 'afro', 'nerd', 'detective', 'clownnose', 'jason', 'belt', 'boxers', 'duckfloat', 'broom', 'gloves', 'sandal', 'classic', 'cool', 'pixel', 'collar', 'mallet'];
  for (const id of fromGames) {
    assert.ok(ACCESSORIES.some((a) => a.id === id), `${id} is in the wardrobe list`);
    const visual = buildCharacterVisual(ANIMALS[0], id);
    assert.equal(visual.accessoryKind, id, `${id} attaches as its own kind`);
    // body-worn items (belt, boxers, float, broom, gloves, sandals) live on the
    // torso/arm/leg bones, so count vertices across every attach point
    let verts = 0;
    for (const root of [visual.head, visual.torso, visual.armL, visual.armR, visual.legL, visual.legR]) {
      root.traverse((o) => {
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (g?.attributes.position) verts += g.attributes.position.count;
      });
    }
    assert.ok(verts > 60, `${id} builds real geometry (${verts} verts)`);
  }
});

test('every cat wears a face combo from the existing styles, never grumpy', () => {
  const base: GameOptions = {
    p1Animal: ANIMALS[0].id, p2Animal: ANIMALS[1].id, twoPlayer: true,
    p1Acc: 'none', p2Acc: 'none', bots: 9, mode: 'teams',
    camMode: 'stumble', camZoom: 1, onHud: () => {},
  };
  for (let i = 0; i < 24; i++) {
    const roster = createRoster(base);
    for (const r of roster) {
      assert.ok(r.eyeStyle !== 'grumpy' && r.expression !== 'grumpy', `no grumpy faces (saw ${r.name}: ${r.eyeStyle}/${r.expression})`);
      assert.ok(FACE_EYES.includes(r.eyeStyle) || r.eyeStyle === 'default', 'eyes come from the known styles');
      assert.ok(FACE_MOUTHS.includes(r.expression) || r.expression === 'default', 'expressions come from the known styles');
    }
    // KAMU starts unstyled in these options, so the game must style them too
    const you = roster[0];
    assert.ok(you.eyeStyle !== 'default', 'KAMU gets a styled combo when the wardrobe is untouched');
    // P2 (no picker of its own) is styled as well
    const p2 = roster[1];
    assert.ok(p2.name === 'P2' && p2.eyeStyle !== 'default', 'P2 gets a styled combo');
  }
  // a player-chosen face is preserved
  const custom = createRoster({ ...base, p1Eyes: 'green', p1Expression: 'tongue' });
  assert.equal(custom[0].eyeStyle, 'green', 'the wardrobe choice wins over the random combo');
  assert.equal(custom[0].expression, 'tongue');
});
