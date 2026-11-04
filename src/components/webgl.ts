import * as THREE from "three";

type RendererFactory = (options: THREE.WebGLRendererParameters) => THREE.WebGLRenderer | null;

/** Test hook: lets the mount smoke test run the real scene setup without a GPU. */
let testFactory: RendererFactory | null = null;
export function setRendererFactoryForTests(factory: RendererFactory | null) {
  testFactory = factory;
}

/**
 * Create a WebGL renderer, or `null` when the device cannot give us a context
 * (GPU blocklisted, too many live contexts, headless preview…). Callers must
 * degrade gracefully instead of letting the exception blank the whole app.
 */
export function createRenderer(
  el: HTMLElement,
  options: THREE.WebGLRendererParameters = {},
  onLost?: () => void,
): THREE.WebGLRenderer | null {
  try {
    const renderer = testFactory
      ? testFactory(options)
      : (new THREE.WebGLRenderer(options) as THREE.WebGLRenderer);
    if (!renderer) {
      console.warn("[meow-brawl] WebGL renderer unavailable");
      return null;
    }
    el.appendChild(renderer.domElement);
    // A lost GPU context (driver reset, too many live contexts) does not throw —
    // the canvas just goes black. Report it so the screen can show a fallback.
    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      console.warn("[meow-brawl] WebGL context lost");
      onLost?.();
    });
    return renderer;
  } catch (error) {
    console.warn("[meow-brawl] WebGL renderer unavailable", error);
    return null;
  }
}

/** True when the browser can actually create a WebGL context. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}
