import { useSyncExternalStore } from "react";

/** Live-adjustable character proportions (all values are multipliers / offsets). */
export interface Tuning {
  head: number; // head size
  neck: number; // + = head sits higher (longer neck), - = sunk into shoulders
  eyeSize: number;
  eyeX: number; // eye spacing
  eyeY: number; // eye height on the face
  noseSize: number;
  noseY: number;
  ear: number; // ear size
  bodyTop: number; // chest / shoulders size
  bodyBottom: number; // belly / hips size
  armRoot: number; // upper arm thickness
  armTip: number; // paw size
  legRoot: number; // thigh thickness
  legTip: number; // foot size
  armLen: number; // arm length
  bodyH: number; // torso height
  belly: number; // belly fatness
  mouth: number; // ω muzzle / mouth size
  jaw: number; // lower head (cheeks + chin) fullness
  legH: number; // leg length
}

// Default look = the values chosen by the player in the shape editor.
export const TUNING_DEFAULTS: Tuning = {
  head: 0.745,
  neck: 0.105,
  eyeSize: 1.16,
  eyeX: 1.17,
  eyeY: 0.07,
  noseSize: 1.51,
  noseY: 0.028,
  ear: 0.96,
  bodyTop: 0.64,
  bodyBottom: 0.7,
  armRoot: 1.35,
  armTip: 0.81,
  legRoot: 0.77,
  legTip: 0.70,
  armLen: 0.96,
  bodyH: 0.59,
  belly: 0.75,
  mouth: 2.46,
  jaw: 0.88,
  legH: 0.83,
};

export interface TuningSpec {
  key: keyof Tuning;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

export const TUNING_SPECS: TuningSpec[] = [
  { key: "head", label: "Ukuran kepala", min: 0.6, max: 1.3, step: 0.01, group: "Kepala" },
  { key: "neck", label: "Panjang leher", min: -0.05, max: 0.18, step: 0.005, group: "Kepala" },
  { key: "jaw", label: "Kepala bawah (pipi mbulet)", min: 0.7, max: 1.7, step: 0.01, group: "Kepala" },
  { key: "ear", label: "Ukuran telinga", min: 0.7, max: 1.4, step: 0.01, group: "Kepala" },
  { key: "eyeSize", label: "Ukuran mata", min: 0.7, max: 1.6, step: 0.01, group: "Wajah" },
  { key: "eyeX", label: "Jarak mata", min: 0.8, max: 1.35, step: 0.01, group: "Wajah" },
  { key: "eyeY", label: "Tinggi mata", min: -0.08, max: 0.14, step: 0.002, group: "Wajah" },
  { key: "noseSize", label: "Ukuran hidung", min: 0.6, max: 1.6, step: 0.01, group: "Wajah" },
  { key: "noseY", label: "Letak hidung", min: -0.06, max: 0.06, step: 0.002, group: "Wajah" },
  { key: "mouth", label: "Ukuran mulut ω", min: 0.8, max: 2.6, step: 0.01, group: "Wajah" },
  { key: "bodyH", label: "Tinggi badan", min: 0.45, max: 1.3, step: 0.01, group: "Badan" },
  { key: "bodyTop", label: "Badan atas", min: 0.5, max: 1.25, step: 0.01, group: "Badan" },
  { key: "bodyBottom", label: "Badan bawah", min: 0.7, max: 1.25, step: 0.01, group: "Badan" },
  { key: "belly", label: "Gendut perut", min: 0.6, max: 1.8, step: 0.01, group: "Badan" },
  { key: "armLen", label: "Panjang tangan", min: 0.8, max: 1.4, step: 0.01, group: "Tangan & Kaki" },
  { key: "armRoot", label: "Pangkal tangan", min: 0.7, max: 1.4, step: 0.01, group: "Tangan & Kaki" },
  { key: "armTip", label: "Ujung tangan", min: 0.7, max: 1.5, step: 0.01, group: "Tangan & Kaki" },
  { key: "legH", label: "Tinggi kaki", min: 0.5, max: 2.0, step: 0.01, group: "Tangan & Kaki" },
  { key: "legRoot", label: "Pangkal kaki", min: 0.7, max: 1.4, step: 0.01, group: "Tangan & Kaki" },
  { key: "legTip", label: "Ujung kaki", min: 0.7, max: 1.5, step: 0.01, group: "Tangan & Kaki" },
];

const STORAGE = "meowbrawl.tuning.v6";
const PREVIOUS_STORAGE = "meowbrawl.tuning.v5";
const SHAPE_STORAGE = "meowbrawl.shapeMode.v2";
export type ShapeMode = "classic" | "figure" | "asset";
function loadShapeMode(): ShapeMode {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SHAPE_STORAGE) : null;
    return raw === "classic" || raw === "figure" || raw === "asset" ? raw : "asset";
  } catch { return "asset"; }
}

/**
 * Proportions traced from the "accurate 3D cat" asset
 * (create-3d-asset-without-hat): big round head, narrow chest over wide hips,
 * thick arms hanging beside the belly, short chunky legs and big paws.
 * The asset is a static sculpt, so the rig keeps these as ordinary slider
 * values — walking, punches and the ragdoll work exactly as before.
 */
export const ASSET_TUNING: Tuning = {
  ...TUNING_DEFAULTS,
  head: 0.85,
  neck: 0.14,
  jaw: 0.82,
  ear: 1.08,
  // The barrel is noticeably slimmer than the plush pear: measured against the
  // exported sculpt the flank has to sit ~10% inside, otherwise the hanging
  // arms merge into the body silhouette and the mitten reads as a white blob
  // stuck on the belly instead of a paw beside it.
  bodyTop: 0.58,
  bodyBottom: 0.76,
  belly: 0.72,
  armRoot: 1.4,
  armTip: 0.85,
  armLen: 1.0,
  legRoot: 0.87,
  legTip: 0.78,
  legH: 0.86,
};
let shapeMode: ShapeMode = loadShapeMode();
let current: Tuning = load();
const listeners = new Set<() => void>();

function load(): Tuning {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE) : null;
    if (raw) return { ...TUNING_DEFAULTS, ...JSON.parse(raw) };
    // Carry earlier custom proportions forward once, while applying the newly
    // requested 77%/70% leg sizes even for existing players.
    const old = typeof localStorage !== "undefined" ? localStorage.getItem(PREVIOUS_STORAGE) : null;
    if (old) {
      const migrated = { ...TUNING_DEFAULTS, ...JSON.parse(old), legRoot: 0.77, legTip: 0.70 };
      localStorage.setItem(STORAGE, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return { ...TUNING_DEFAULTS };
}

export const getTuning = () => current;
export const getShapeMode = () => shapeMode;
/** The sculpted (smooth, figurine-like) surface shared by "figure" and "asset". */
export const isSculptedShape = () => shapeMode === "figure" || shapeMode === "asset";
// Shape mode is a reversible geometry transform, not a destructive slider preset.
// In particular, all face/eye settings and the user's custom proportions survive.
let effectiveSource: Tuning | null = null;
let effectiveMode: ShapeMode | null = null;
let effective: Tuning = current;
export function getRigTuning(): Tuning {
  if (effectiveSource !== current || effectiveMode !== shapeMode) {
    effectiveSource = current;
    effectiveMode = shapeMode;
    if (shapeMode === "figure") {
      effective = {
        ...current,
        bodyTop: current.bodyTop * 1.24,
        bodyBottom: current.bodyBottom * 1.25,
        bodyH: current.bodyH * 1.10,
        legH: current.legH * 0.86,
        armTip: current.armTip * 1.08,
      };
    } else if (shapeMode === "asset") {
      // Asset baseline, plus whatever the player changed in the shape editor.
      const next: Tuning = { ...current };
      for (const key of Object.keys(ASSET_TUNING) as (keyof Tuning)[]) {
        next[key] = ASSET_TUNING[key] + (current[key] - TUNING_DEFAULTS[key]);
      }
      effective = next;
    } else {
      effective = current;
    }
  }
  return effective;
}
export const tuningKey = (t: Tuning = current) =>
  `${shapeMode}|` + (Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]).map((k) => t[k].toFixed(3)).join("|");

export function setShapeMode(mode: ShapeMode) {
  if (mode === shapeMode) return;
  shapeMode = mode;
  try { localStorage.setItem(SHAPE_STORAGE, mode); } catch { /* storage is optional */ }
  // A fresh snapshot makes both shape and existing tuning subscribers update.
  current = { ...current };
  listeners.forEach((l) => l());
}
export const useShapeMode = () => useSyncExternalStore(subscribeTuning, getShapeMode);

export function setTuning(patch: Partial<Tuning>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const resetTuning = () => setTuning({ ...TUNING_DEFAULTS });

export function subscribeTuning(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export const useTuning = () => useSyncExternalStore(subscribeTuning, getTuning);
