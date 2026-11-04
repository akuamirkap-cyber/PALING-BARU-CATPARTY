import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster } from '../src/components/MatchLobby';
import { ANIMALS } from '../src/game/animals';
import { WIPE_THEMES } from '../src/components/ScreenWipe';

const you = { animal: 'oyen' as const, accessory: 'capNewRed' as const, eyeStyle: 'default' as const, expression: 'default' as const };

test('matchmaking row puts you in the middle', () => {
  for (const bots of [1, 3, 5, 7]) {
    const row = buildRoster({ you, bots });
    assert.equal(row.length, bots + 1, 'one cat per fighter');
    const index = row.findIndex((m) => m.you);
    assert.equal(index, Math.floor(bots / 2), `you should stand in the middle with ${bots} bots`);
    assert.equal(row.filter((m) => m.you).length, 1);
  }
});

test('couch player stands right beside you', () => {
  const row = buildRoster({ you, bots: 5, friend: { animal: 'item', accessory: 'capNewBlue' } });
  assert.equal(row.length, 7);
  const youIndex = row.findIndex((m) => m.you);
  const friendIndex = row.findIndex((m) => m.friend);
  assert.equal(friendIndex, youIndex - 1, 'P2 is the cat next to you');
  assert.equal(row[friendIndex].animal, 'item');
});

test('bots never clone your cat and keep unique ids', () => {
  const row = buildRoster({ you, bots: 7 });
  const bots = row.filter((m) => !m.you && !m.friend);
  assert.equal(bots.length, 7);
  assert.equal(new Set(bots.map((b) => b.id)).size, bots.length);
  assert.equal(bots.filter((b) => b.animal === you.animal).length, 0, 'your cat is not duplicated in the row');
  for (const bot of bots) {
    assert(ANIMALS.some((a) => a.id === bot.animal), `${bot.animal} is a real cat`);
    assert(bot.name.length > 0);
  }
});

test('every page transition has a readable badge', () => {
  for (const key of ['menu', 'matching', 'game'] as const) {
    const theme = WIPE_THEMES[key];
    assert(theme.label.length > 2);
    assert(theme.sub.length > 2);
    assert.match(theme.main, /^#[0-9a-f]{6}$/i);
  }
  assert.notEqual(WIPE_THEMES.game.main, WIPE_THEMES.menu.main, 'the arena wipe reads differently from the menu');
});
