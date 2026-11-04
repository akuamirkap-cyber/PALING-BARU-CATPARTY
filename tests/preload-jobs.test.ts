import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreloadJobs } from '../src/game/characterPreload';
import { ANIMALS } from '../src/game/animals';
import type { RosterEntry } from '../src/game/Game';

test('every roster cat gets a face portrait job, caps only dedupe the mesh variants', () => {
  const roster: RosterEntry[] = [
    { def: ANIMALS[0], name: 'KAMU', slot: 1, wins: 0, acc: 'none', eyeStyle: 'green', expression: 'grumpy', team: -1, flag: 'id', wins2: undefined as never },
    { def: ANIMALS[1], name: 'A', slot: 0, wins: 0, acc: 'capNewRed', eyeStyle: 'default', expression: 'default', team: -1, flag: 'gb' },
    { def: ANIMALS[1], name: 'B', slot: 0, wins: 0, acc: 'capNewRed', eyeStyle: 'default', expression: 'default', team: -1, flag: 'br' },
  ] as unknown as RosterEntry[];
  const jobs = buildPreloadJobs(roster);
  // cat 0: one job (no cap) with a portrait using its custom eyes
  // cat 1: two jobs (cap => ears+no-ears), portrait only on the first
  assert.equal(jobs.length, 3, 'cap cats build both mesh variants, others one');
  const p0 = jobs.filter((j) => j.id === ANIMALS[0].id);
  assert.equal(p0.length, 1);
  assert.deepEqual(p0[0].portrait, { eyeStyle: 'green', expression: 'grumpy' }, 'custom eyes are honoured');
  const p1 = jobs.filter((j) => j.id === ANIMALS[1].id);
  assert.equal(p1.length, 2, 'the cap cat yields the ears/no-ears pair');
  assert.ok(p1[0].portrait, 'first cap variant carries the portrait');
  assert.equal(p1[1].portrait, undefined, 'the second variant never repeats the portrait');
  assert.ok(p1.some((j) => j.noEars === true) && p1.some((j) => j.noEars === false));
});
