import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Mount smoke test.
 *
 * The screens build their three.js scene inside `useEffect`. That code is where
 * a stray `ReferenceError` once blanked the whole app, and a plain unit test
 * cannot see it: without a renderer the effect returns early. So we install a
 * fake renderer, let the real scene setup (camera framing, resize, animation
 * loop) run in jsdom, and assert the DOM always survives with readable UI.
 */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
/** No-op worker: the asset cat keeps loading instead of baking meshes in the test. */
globalThis.Worker = class {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
} as unknown as typeof Worker;
globalThis.matchMedia = (() => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
})) as typeof window.matchMedia;
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
window.ResizeObserver = globalThis.ResizeObserver as typeof window.ResizeObserver;
window.IntersectionObserver = globalThis.IntersectionObserver as typeof window.IntersectionObserver;
window.matchMedia = globalThis.matchMedia;
(window as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { setRendererFactoryForTests } = await import('../src/components/webgl.ts');
const MatchLobby = (await import('../src/components/MatchLobby.tsx')).default;
const MenuScreen = (await import('../src/components/MenuScreen.tsx')).default;

let renderersCreated = 0;

/** Minimal renderer API: the scene graph is real, the GPU calls are no-ops. */
function fakeRenderer() {
  renderersCreated += 1;
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    shadowMap: { enabled: false, type: 0 },
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
    setPixelRatio() {},
    setSize() {},
    setClearColor() {},
    setAnimationLoop() {},
    render() {},
    dispose() {},
    forceContextLoss() {},
    capabilities: { isWebGL2: true, getMaxAnisotropy: () => 1 },
  } as unknown;
}

const host = document.getElementById('root')!;

async function mount(element: React.ReactElement) {
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  return root;
}

async function unmount(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount();
  });
}

const you = { animal: 'oyen' as const, accessory: 'capNewRed' as const, eyeStyle: 'default' as const, expression: 'default' as const };

function lobby(overrides: Record<string, unknown> = {}) {
  return React.createElement(MatchLobby, {
    you,
    friend: null,
    bots: 5,
    mode: 'brawl',
    onChangeAnimal() {},
    onPickAnimal() {},
    onWardrobe() {},
    onCancel() {},
    onStart() {},
    ...overrides,
  } as never);
}

after(() => {
  // jsdom keeps its own frame timer alive; close it so the runner can exit.
  window.close();
});

test('matching screen builds its 3D stage without taking the page down', async () => {
  setRendererFactoryForTests(fakeRenderer as never);
  const before = renderersCreated;
  const root = await mount(lobby());
  const html = host.innerHTML;
  assert.ok(html.includes('ml-screen'), 'matching screen renders');
  assert.ok(!html.includes('crash-note'), 'no crash fallback');
  assert.ok((html.match(/ml-tag/g) ?? []).length >= 6, 'every cat still has a name tag');
  assert.ok(html.includes('SIAP'), 'ready button survives');
  assert.ok(renderersCreated > before, 'the real stage setup actually ran');
  await unmount(root);
});

test('matching screen keeps its UI when the device has no WebGL', async () => {
  setRendererFactoryForTests((() => null) as never);
  const root = await mount(lobby());
  const html = host.innerHTML;
  assert.ok(html.includes('ml-screen'), 'matching screen still renders');
  assert.ok(!html.includes('crash-note'), 'no crash fallback');
  assert.ok(html.includes('ml-gl-note'), 'tells the player 3D is off');
  await unmount(root);
});

test('menu screen renders even when every canvas fails', async () => {
  setRendererFactoryForTests((() => null) as never);
  const root = await mount(
    React.createElement(MenuScreen, {
      selected: 'oyen',
      accessory: 'capNewRed',
      eyeStyle: 'default',
      expression: 'default',
      mode: 'brawl',
      bots: 5,
      twoPlayer: false,
      active: true,
      onPlay() {},
      onOpenSheet() {},
      onMode() {},
      onBots() {},
      onTwoPlayer() {},
      onSelectAnimal() {},
    } as never),
  );
  const html = host.innerHTML;
  assert.ok(html.includes('mm-screen'), 'menu renders');
  assert.ok(!html.includes('crash-note'), 'no crash fallback');
  assert.ok(html.includes('lineup-fallback'), 'stage explains the missing 3D');
  assert.ok(html.includes('mm-asset-box'), 'the accurate 3D asset gets its own slot on the right');
  assert.ok(html.includes('MAIN'), 'the play button survives');
  await unmount(root);
  setRendererFactoryForTests(null);
});
