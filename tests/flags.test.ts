import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, drawFlag, flagEmoji, flagName, isFlagCode, pickFlags } from '../src/game/flags';
import { createRoster, type GameOptions } from '../src/game/Game';
import { ANIMALS } from '../src/game/animals';

const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
(globalThis as any).document = { createElement: () => ({ getContext: () => context }) };

test('every requested country exists and renders a flag without throwing', () => {
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 100 }) : () => true),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  for (const c of COUNTRIES) {
    assert.doesNotThrow(() => drawFlag(ctx, c.code, 4, 4, 36, 25), `${c.code} must draw`);
    assert.ok(flagEmoji(c.code).length >= 2, `${c.code} yields an emoji flag`);
    assert.ok(flagName(c.code).length > 1);
  }
  // the user's list is fully covered
  for (const code of ['id', 'gb', 'br', 'ps', 'ru', 'kr', 'cn']) {
    assert.ok(COUNTRIES.some((c) => c.code === code), `${code} is in the list`);
  }
  assert.ok(COUNTRIES.length >= 17, '17 flags: 7 requested + 10 famous');
  assert.equal(isFlagCode('xx'), false);
  assert.doesNotThrow(() => drawFlag(ctx, 'xx', 0, 0, 10, 10), 'unknown codes fall back to a neutral panel');
});

test('pickFlags spreads the countries and cycles only after exhausting the pool', () => {
  const n = COUNTRIES.length + 5;
  const flags = pickFlags(n);
  assert.equal(flags.length, n);
  assert.equal(new Set(flags).size, COUNTRIES.length, 'first cycle is unique');
  assert.ok(flags.every((f) => isFlagCode(f)));
});

test('roster flags: KAMU is Indonesia, everyone else draws from the country pool', () => {
  const base: GameOptions = {
    p1Animal: ANIMALS[0].id, p2Animal: ANIMALS[1].id, twoPlayer: false,
    p1Acc: 'none', p2Acc: 'none', bots: 9, mode: 'teams',
    camMode: 'stumble', camZoom: 1, onHud: () => {},
  };
  const roster = createRoster(base);
  assert.equal(roster[0].flag, 'id', 'you always play under the Indonesian flag');
  assert.ok(roster.slice(1).every((r) => isFlagCode(r.flag)), 'bots carry real country codes');
  assert.ok(new Set(roster.map((r) => r.flag)).size >= Math.min(10, roster.length), 'flags are varied across the lobby');
});
