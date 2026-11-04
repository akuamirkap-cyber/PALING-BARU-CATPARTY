import test from 'node:test';
import assert from 'node:assert/strict';
import { PUNCH_DURATION, PUNCH_WINDUP, punchPose } from '../src/game/punchMotion';

test('punch anticipation, strike, guard and recovery are continuous', () => {
  const atStart = punchPose(0), wind = punchPose(PUNCH_WINDUP), strike = punchPose(0.11), end = punchPose(PUNCH_DURATION);
  assert(wind.forward < atStart.forward && wind.lean < 0, 'paw and torso draw back');
  assert(strike.forward > 1 && strike.lean > 0 && strike.twist < 0, 'strike extends with follow-through');
  assert.equal(strike.guard, 1);
  for (const key of Object.keys(atStart) as (keyof typeof atStart)[]) {
    assert(Math.abs(end[key] - atStart[key]) < 1e-10, `${key} should return to rest`);
  }
  for (const boundary of [PUNCH_WINDUP, 0.11, 0.26, PUNCH_DURATION]) {
    const before = punchPose(boundary - 1e-6), after = punchPose(boundary + 1e-6);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      assert(Math.abs(before[key] - after[key]) < 0.001, `${key} jumps at ${boundary}`);
    }
  }
});
