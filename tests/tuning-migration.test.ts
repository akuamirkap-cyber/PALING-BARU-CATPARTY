import test from 'node:test';
import assert from 'node:assert/strict';

test('leg defaults are 77% and 70%, migrating older saved settings once', async () => {
  const values = new Map<string, string>([['meowbrawl.tuning.v5', JSON.stringify({ head: 0.9, legRoot: 0.94, legTip: 0.74 })]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  const tuning = await import('../src/game/tuning');
  assert.equal(tuning.TUNING_DEFAULTS.legRoot, 0.77);
  assert.equal(tuning.TUNING_DEFAULTS.legTip, 0.70);
  assert.equal(tuning.getTuning().legRoot, 0.77);
  assert.equal(tuning.getTuning().legTip, 0.70);
  assert.equal(tuning.getTuning().head, 0.9, 'unrelated custom proportions must survive');
  assert(values.has('meowbrawl.tuning.v6'));
  tuning.setTuning({ legRoot: 0.8 });
  assert.equal(JSON.parse(values.get('meowbrawl.tuning.v6')!).legRoot, 0.8, 'user can still adjust the slider');
});
