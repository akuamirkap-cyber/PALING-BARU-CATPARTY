/**
 * Ukuran & matematika lambung kapal pesiar.
 * Satuan: 1 unit = 1 meter.
 * Haluan (depan) mengarah ke +X, atas = +Y, sisi kanan kapal (starboard) = +Z.
 * Garis air berada di Y = 0.
 */
export const SHIP = {
  length: 44,
  beam: 12,
  deckY: 3.2,
  lip: 0.35,
  bowRise: 1.8,
  th: 0.22,
  keelY: -2.6,
} as const;

export const HALF_L = SHIP.length / 2;
export const X_STERN = -HALF_L;
export const X_BOW = HALF_L;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export const tToX = (t: number) => X_STERN + t * SHIP.length;
export const xToT = (x: number) => (x - X_STERN) / SHIP.length;

/** Faktor lebar tampak atas (0..1) sepanjang kapal: buritan membulat, haluan meruncing. */
export function planFactor(t: number) {
  const tt = clamp01(t);
  let f = 1;
  if (tt < 0.08) f = 0.86 + 0.14 * Math.sin((tt / 0.08) * Math.PI * 0.5);
  if (tt > 0.6) {
    const u = clamp01((tt - 0.6) / 0.4);
    f = Math.pow(Math.max(0, 1 - u * u), 0.8);
  }
  return f;
}

export const halfWidth = (t: number) => (SHIP.beam / 2) * planFactor(t);
export const innerHalfWidth = (t: number) => Math.max(0, halfWidth(t) - SHIP.th);

/** Tinggi bibir lambung (bulwark) — naik di haluan. */
export function topY(t: number) {
  const s = smoothstep(0.62, 1, t);
  return SHIP.deckY + SHIP.lip + SHIP.bowRise * s * s;
}

/** Dasar lunas — terangkat di buritan untuk ruang baling-baling. */
export function keelY(t: number) {
  return SHIP.keelY + 1.7 * (1 - smoothstep(0, 0.16, t));
}

const STEM_START = 0.885;
/** Profil linggi haluan (miring ke depan). */
export function stemY(t: number) {
  if (t <= STEM_START) return -Infinity;
  const s = Math.pow(clamp01((t - STEM_START) / (1 - STEM_START)), 1.5);
  return SHIP.keelY + (topY(1) - SHIP.keelY) * s;
}

export const deckYAt = (t: number) => Math.max(SHIP.deckY, stemY(t));

export interface SecPt {
  z: number;
  y: number;
}

/** Indeks material per pita penampang: 0 bulwark, 1 cat lambung, 2 garis, 3 boot-top, 4 antifouling */
export const BAND_MATERIAL = [0, 0, 1, 2, 1, 3, 4, 4, 4];

/** Titik-titik penampang (sisi kanan, dari dek ke lunas). */
export function sectionPoints(t: number): SecPt[] {
  const hw = halfWidth(t);
  const D = SHIP.deckY;
  const inner = Math.max(hw - SHIP.th, 0);
  const ty = topY(t);
  const k = keelY(t);
  const pts: SecPt[] = [
    { z: inner, y: D },
    { z: inner, y: ty },
    { z: hw, y: ty },
    { z: hw, y: D - 0.45 },
    { z: hw, y: D - 0.8 },
    { z: hw * 0.99, y: 0.35 },
    { z: hw * 0.975, y: 0 },
    { z: hw * 0.86, y: k * 0.5 },
    { z: hw * 0.45, y: k * 0.93 },
    { z: 0, y: k },
  ];
  const s = stemY(t);
  for (const p of pts) if (p.y < s) p.y = s;
  if (pts[1].y < pts[0].y) pts[1].y = pts[0].y;
  pts[2].y = pts[1].y;
  return pts;
}

/** Posisi Z permukaan luar lambung pada (x, y) — untuk menempelkan decal/jendela. */
export function hullOuterZ(x: number, y: number) {
  const pts = sectionPoints(xToT(x));
  for (let i = 2; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (y <= a.y && y >= b.y) {
      const span = a.y - b.y;
      const f = span < 1e-6 ? 0 : (a.y - y) / span;
      return lerp(a.z, b.z, f);
    }
  }
  return y > pts[2].y ? pts[2].z : 0;
}

/* ------------------------------------------------------------------ */
/* Tata letak bangunan atas & fasilitas                                 */
/* ------------------------------------------------------------------ */

export interface Tier {
  name: string;
  x0: number;
  x1: number;
  hw: number;
  base: number;
  h: number;
  r: number;
  band: number;
  bandH: number;
}

export const TIERS: Tier[] = [
  { name: 'Deck_A', x0: -14, x1: 9, hw: 4.5, base: 3.2, h: 2.4, r: 3.2, band: 0.8, bandH: 0.75 },
  { name: 'Deck_B', x0: -11, x1: 6.5, hw: 3.9, base: 5.6, h: 2.3, r: 2.6, band: 0.75, bandH: 0.75 },
  { name: 'Deck_C', x0: -7, x1: 4.4, hw: 3.4, base: 7.9, h: 2.3, r: 2.0, band: 0.85, bandH: 0.95 },
];

export const tierTop = (t: Tier) => t.base + t.h;

export const BRIDGE = { x0: 2.4, x1: 4.4, hw: 5.3 };
export const FUNNEL = { x: -4.0, len: 4.0, wid: 2.0, rake: 0.3, h: 3.3 };
export const MAST = { x: 2.6, top: 13.6 };
export const POOL = { x0: -21.2, x1: -18.0, z0: -2.8, z1: 2.2, h: 0.6, water: 0.48 };
export const SLIDE = { ax: -16.1, az: -3.6, r: 1.45, top: 7.8, bottom: 3.95, turns: 2, trough: 0.45 };

export function insideTier(t: Tier, x: number, z: number) {
  if (x < t.x0 || x > t.x1 || Math.abs(z) > t.hw) return false;
  const cx = t.x1 - t.r;
  if (x > cx) {
    const dx = (x - cx) / t.r;
    const dz = z / t.hw;
    return dx * dx + dz * dz <= 1;
  }
  return true;
}

export type Surface = 'deck' | 'pool' | 'sea';

/** Ketinggian permukaan teratas di titik (x, z) — dipakai untuk karakter yang dijatuhkan. */
export function groundAt(x: number, z: number): { y: number; surface: Surface } {
  const C = TIERS[2];
  const fx = FUNNEL.x - (FUNNEL.rake * FUNNEL.h) / 2;
  if (Math.abs(x - fx) < FUNNEL.len / 2 - 0.2 && Math.abs(z) < FUNNEL.wid / 2 - 0.1) {
    return { y: tierTop(C) + FUNNEL.h, surface: 'deck' };
  }
  if (x >= BRIDGE.x0 && x <= BRIDGE.x1 && Math.abs(z) <= BRIDGE.hw) return { y: tierTop(C), surface: 'deck' };
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (insideTier(TIERS[i], x, z)) return { y: tierTop(TIERS[i]), surface: 'deck' };
  }
  if (x > POOL.x0 + 0.2 && x < POOL.x1 - 0.2 && z > POOL.z0 + 0.2 && z < POOL.z1 - 0.2) {
    return { y: SHIP.deckY + POOL.water, surface: 'pool' };
  }
  const t = xToT(x);
  if (t >= 0 && t <= 1 && Math.abs(z) <= innerHalfWidth(t)) {
    return { y: deckYAt(t), surface: 'deck' };
  }
  return { y: 0, surface: 'sea' };
}
