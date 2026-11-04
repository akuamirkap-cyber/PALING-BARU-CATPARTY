import test from 'node:test';
import assert from 'node:assert/strict';
import { POUNCE_DURATION, pouncePose } from '../src/game/pounceMotion';

test('pounce smoothly reaches a forward diving pose and returns to rest', () => {
  assert.equal(pouncePose(0).amount, 0);
  assert.equal(pouncePose(0.3).amount, 1);
  assert(pouncePose(0.3).lean > 2);
  assert.equal(pouncePose(POUNCE_DURATION).amount, 0);
  for (const boundary of [0.13, 0.68, POUNCE_DURATION]) {
    const before = pouncePose(boundary - 1e-6), after = pouncePose(boundary + 1e-6);
    assert(Math.abs(before.amount - after.amount) < 0.001);
    assert(Math.abs(before.lean - after.lean) < 0.001);
  }
});
