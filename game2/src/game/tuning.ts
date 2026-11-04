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
  head: 0.74,
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
  legRoot: 0.94,
  legTip: 0.74,
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

const STORAGE = "meowbrawl.tuning.v5";
let current: Tuning = load();
const listeners = new Set<() => void>();

function load(): Tuning {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE) : null;
    if (raw) return { ...TUNING_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...TUNING_DEFAULTS };
}

export const getTuning = () => current;
export const tuningKey = (t: Tuning = current) =>
  (Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]).map((k) => t[k].toFixed(3)).join("|");

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
