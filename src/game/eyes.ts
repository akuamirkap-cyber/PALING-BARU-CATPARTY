/** Optional facial styles. Defaults preserve each cat's original face. */
export type EyeStyleId = "default" | "round" | "slit" | "grumpy" | "green" | "goofy";
export type ExpressionId = "default" | "grumpy" | "tongue";

export const EYE_STYLES: { id: EyeStyleId; name: string; description: string }[] = [
  { id: "default", name: "Asli Kucing", description: "Mata bawaan tiap kucing" },
  { id: "green", name: "Manis Hijau", description: "Kilau hijau di mata gelap" },
  { id: "goofy", name: "Bulat Kocak", description: "Mata besar yang ekspresif" },
  { id: "grumpy", name: "Judes Mint", description: "Mata setengah terpejam" },
  { id: "round", name: "Bulat Berkilau", description: "Bulat besar dengan kilau emas" },
  { id: "slit", name: "Tajam Emas", description: "Pupil lonjong, ekspresi penasaran" },
];
export const EXPRESSIONS: { id: ExpressionId; name: string; description: string }[] = [
  { id: "default", name: "Asli Kucing", description: "Ekspresi bawaan tiap kucing" },
  { id: "grumpy", name: "Cemberut", description: "Raut kesal yang menggemaskan" },
  { id: "tongue", name: "Lidah Usil", description: "Ekspresi ceria dan jahil" },
];

/** Eye styles bots and unstyled cats pick from — grumpy stays wardrobe-only. */
export const FACE_EYES: EyeStyleId[] = ["round", "slit", "green", "goofy"];
/** Mouth expressions in the bot pool — again, no grumpy. */
export const FACE_MOUTHS: ExpressionId[] = ["default", "tongue"];

/** A random, always-styled, never-grumpy eye+expression combo. */
export function randomFaceCombo(rng: () => number = Math.random): { eyeStyle: EyeStyleId; expression: ExpressionId } {
  return {
    eyeStyle: FACE_EYES[Math.floor(rng() * FACE_EYES.length)],
    expression: FACE_MOUTHS[Math.floor(rng() * FACE_MOUTHS.length)],
  };
}

/** True when a cat shows no chosen style at all (both slots on "Asli Kucing"). */
export const isDefaultFace = (eyeStyle: EyeStyleId, expression: ExpressionId) => eyeStyle === "default" && expression === "default";
