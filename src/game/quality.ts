/** Scale only the game render target, keeping the UI, textures and geometry crisp.
 * Levels are monotonic even on screens with a devicePixelRatio below 1. */
export function qualityPixelRatio(base: number, level: number): number {
  const scales = [1, 0.88, 0.76, 0.65];
  const index = Math.max(0, Math.min(scales.length - 1, Math.floor(level)));
  return Math.min(base, Math.max(0.8, base * scales[index]));
}
