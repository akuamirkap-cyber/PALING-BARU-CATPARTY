import test from 'node:test';
import assert from 'node:assert/strict';
import { runPageWipe, WIPE_TIMING, type WipeTiming } from '../src/components/pageWipe';

type Call = { target: string; frames: number; duration: number; delay: number };

class FakeEl {
  name: string;
  classes = new Set<string>();
  styleVars = new Map<string, string>();
  textContent = '';
  animations: Call[] = [];
  log: string[] = [];
  classList = {
    add: (...list: string[]) => { for (const c of list) { this.classes.add(c); this.log.push(`class+.${c}`); } },
    remove: (...list: string[]) => { for (const c of list) { this.classes.delete(c); this.log.push(`class-.${c}`); } },
  };
  style = {
    setProperty: (k: string, v: string) => this.styleVars.set(k, v),
    removeProperty: (k: string) => this.styleVars.delete(k),
  };
  constructor(name: string) { this.name = name; }
  animate(frames: unknown[], options: KeyframeAnimationOptions = {}) {
    this.animations.push({ target: this.name, frames: (frames as unknown[]).length, duration: Number(options.duration ?? 0), delay: Number(options.delay ?? 0) });
    this.log.push(`animate:${this.name}:${String(options.duration)}`);
    return {} as Animation;
  }
  getAnimations() { return [{ cancel: () => this.log.push(`cancel:${this.name}`) } as unknown as Animation]; }
}

const fast: WipeTiming = { cover: 20, hold: 15, reveal: 20, lag: 4 };

function scene() {
  const root = new FakeEl('root');
  const edge = new FakeEl('edge');
  const main = new FakeEl('main');
  const logo = new FakeEl('logo');
  const sub = new FakeEl('sub');
  const label = new FakeEl('label');
  const bar = new FakeEl('bar');
  const outgoing = new FakeEl('outgoing');
  const incoming = new FakeEl('incoming');
  return { root, edge, main, logo, sub, label, bar, outgoing, incoming };
}

test('every page change plays the full sweep, in order', async () => {
  const s = scene();
  let swapped = 0;
  let swapOrder = -1;
  const trail: string[] = [];
  const rootLog = s.root.log;
  await runPageWipe(
    { root: s.root, edge: s.edge, main: s.main, logo: s.logo, sub: s.sub, label: s.label, bar: s.bar, outgoing: s.outgoing },
    { main: '#ffa412', deep: '#e57f00', ink: '#7a3d00', label: 'MATCHMAKING', sub: 'Mencari lawan' },
    () => {
      swapped++;
      swapOrder = rootLog.length;
      trail.push('swap');
    },
    { timing: fast, getScreen: () => s.incoming },
  );

  // overlay switched on before anything animates
  assert.equal(rootLog[0], 'class+.is-active', 'the wipe overlay is made visible first');
  assert.equal(s.root.classes.has('is-active'), false, 'and cleaned up afterwards');

  // the page we leave really slides away, the panels really sweep in
  assert.equal(s.outgoing.animations.length, 1, 'outgoing page animates');
  assert.equal(s.edge.animations.length, 2, 'edge panel sweeps in and out');
  assert.equal(s.main.animations.length, 2, 'main panel sweeps in and out');
  assert.equal(s.main.animations[0].frames, 2);
  assert.equal(s.main.animations[1].duration, fast.reveal);

  // badge animates too (the loading bar only fills during the hold)
  for (const el of [s.logo, s.sub, s.label]) {
    assert(el.animations.length >= 2, `${el.name} gets an entrance and an exit`);
  }
  assert.equal(s.bar.animations.length, 1, 'the loading bar fills once while the badge holds');

  assert.equal(swapped, 1, 'screens swap exactly once');
  assert.equal(swapOrder > 0, true, 'the swap happens while the panels cover');
  assert.equal(trail.length, 1);

  // the new page settles in
  assert.equal(s.incoming.animations.length, 1, 'incoming page slides in');

  // overlay fully reset
  assert.equal(s.root.styleVars.size, 0, 'theme variables are removed');
  assert.equal(s.sub.textContent, 'Mencari lawan', 'badge text follows the destination');
  assert.equal(s.label.textContent, 'MATCHMAKING');
});

test('badge copy follows the destination screen', async () => {
  const s = scene();
  await runPageWipe(
    { root: s.root, edge: s.edge, main: s.main, logo: s.logo, sub: s.sub, label: s.label, bar: s.bar, outgoing: s.outgoing },
    { main: '#1b8cf0', deep: '#0f63c4', ink: '#05325e', label: 'SIAP GEBUK', sub: 'Semua naik ke pesawat' },
    () => {},
    { timing: fast, getScreen: () => s.incoming },
  );
  assert.equal(s.label.textContent, 'SIAP GEBUK');
  assert.equal(s.sub.textContent, 'Semua naik ke pesawat');
});

test('a cancelled transition still cleans the overlay up', async () => {
  const s = scene();
  let alive = true;
  await runPageWipe(
    { root: s.root, edge: s.edge, main: s.main, logo: s.logo, sub: s.sub, label: s.label, bar: s.bar, outgoing: s.outgoing },
    { main: '#ffa412', deep: '#e57f00', ink: '#7a3d00', label: 'MATCHMAKING', sub: 'Mencari lawan' },
    () => { alive = false; },
    { timing: fast, getScreen: () => s.incoming, isAlive: () => alive },
  );
  assert.equal(s.root.classes.has('is-active'), false, 'overlay hidden again');
  assert.equal(s.root.styleVars.size, 0);
});

test('the sweep is long enough to read', () => {
  const total = WIPE_TIMING.cover + WIPE_TIMING.hold + WIPE_TIMING.reveal + WIPE_TIMING.lag;
  assert(total > 1500 && total < 2600, `full transition is ${total}ms`);
  assert(WIPE_TIMING.hold >= 400, 'the badge needs a beat to be read');
});

test('reduced motion still gets a visible (calm) transition', async () => {
  const s = scene();
  let swapped = 0;
  await runPageWipe(
    { root: s.root, edge: s.edge, main: s.main, logo: s.logo, sub: s.sub, label: s.label, bar: s.bar, outgoing: s.outgoing },
    { main: '#ffa412', deep: '#e57f00', ink: '#7a3d00', label: 'MATCHMAKING', sub: 'Mencari lawan' },
    () => { swapped++; },
    { timing: fast, mode: 'calm', getScreen: () => s.incoming },
  );
  assert.equal(swapped, 1, 'the page still changes');
  assert(s.edge.animations.length >= 2, 'the panels fade instead of sweeping');
  assert.equal(s.root.classes.has('is-active'), false);
  assert.equal(s.root.classes.has('is-calm'), false);
  assert.equal(s.outgoing.animations.length, 0, 'no big travel for reduced motion');
});
