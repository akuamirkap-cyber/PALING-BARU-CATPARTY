import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityPixelRatio } from '../src/game/quality';

test('adaptive render resolution never grows as performance quality decreases', () => {
  for (const base of [0.75, 1, 1.25, 1.5, 2]) {
    const values = [0, 1, 2, 3].map(level => qualityPixelRatio(base, level));
    assert.equal(values[0], base);
    for (let i = 1; i < values.length; i++) {
      assert(values[i] <= values[i - 1], `DPR ${base}: ${values}`);
      assert(values[i] > 0);
    }
  }
});
