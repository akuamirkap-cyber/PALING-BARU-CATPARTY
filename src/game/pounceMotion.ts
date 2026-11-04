/** Continuous pose envelope for the L jumping pounce, in simulation seconds. */
export const POUNCE_DURATION = 0.85;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function pouncePose(elapsed: number) {
  // Reach forward quickly as the cat takes off, then settle before recovery.
  const amount = smooth(elapsed / 0.13) * (1 - smooth((elapsed - 0.68) / 0.17));
  return { amount, lean: 2.8 * amount };
}
