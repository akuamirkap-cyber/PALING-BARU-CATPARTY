import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game/Game';
import { impactEffect, knockoutEffectColor } from '../src/game/impactEffects';

test('bat impact and bat KO puffs are white while other effects retain their colours', () => {
  assert.equal(impactEffect('bat').color, 0xffffff);
  assert.equal(impactEffect('bat').count, 14);
  assert.equal(knockoutEffectColor('bat'), 0xffffff);
  assert.equal(impactEffect('punch').color, 0xffffff);
  assert.equal(impactEffect('pan').color, 0xffe9a6);
  assert.equal(impactEffect('dropkick').color, 0xffe066);
  assert.equal(knockoutEffectColor('punch'), 0xffd93d);
});

test('instanced particles only draw and upload while alive, including pool reuse', () => {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial(), 3);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < 3; i++) mesh.setMatrixAt(i, zero);
  mesh.visible = false;
  const particles = Array.from({ length: 3 }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, grow: 1 }));
  const game = { particles, pMesh: mesh } as unknown as Game;
  const update = (Game.prototype as unknown as { updateParticles(this: Game, dt: number): void }).updateParticles;
  const burst = Game.prototype.burst;
  const idleVersion = mesh.instanceMatrix.version;
  update.call(game, 1 / 60);
  assert(!mesh.visible);
  assert.equal(mesh.instanceMatrix.version, idleVersion, 'idle pool must not upload unchanged matrices');
  burst.call(game, 1, 2, 3, 2, 0xffffff, 0.22);
  assert(mesh.visible && particles.filter(p => p.life > 0).length === 2);
  const color = new THREE.Color();
  mesh.getColorAt(0, color);
  assert.equal(color.getHex(), 0xffffff);
  update.call(game, 0.1);
  assert(mesh.visible && mesh.instanceMatrix.version > idleVersion);
  update.call(game, 1);
  assert(!mesh.visible && particles.every(p => p.life <= 0), 'finished puffs should stop drawing');
  const finishedVersion = mesh.instanceMatrix.version;
  update.call(game, 1 / 60);
  assert.equal(mesh.instanceMatrix.version, finishedVersion);
  burst.call(game, 0, 0, 0, 1, 0xffffff, 0.22);
  update.call(game, 1 / 60);
  assert(mesh.visible && particles.filter(p => p.life > 0).length === 1, 'dead particle slots should be reusable');
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
});
