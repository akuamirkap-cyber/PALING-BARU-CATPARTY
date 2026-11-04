export interface FishDef {
  id: string;
  name: string;
  emoji: string;
  wMin: number; // kg
  wMax: number; // kg
  difficulty: number; // 0..1
  rarity: number;
  color: number;
}

// ---------- RANK berdasarkan BERAT ----------
export type RankId = 'D' | 'C' | 'B' | 'A' | 'S';
export interface RankInfo {
  id: RankId;
  name: string;
  color: string;
  min: number; // kg
  max: number;
  star: string;
}
export const RANKS: RankInfo[] = [
  { id: 'D', name: 'Kecil', color: '#9aa7b8', min: 0, max: 1, star: '' },
  { id: 'C', name: 'Sedang', color: '#4ade80', min: 1, max: 3, star: '' },
  { id: 'B', name: 'Besar', color: '#38bdf8', min: 3, max: 6, star: '★' },
  { id: 'A', name: 'Raksasa', color: '#c084fc', min: 6, max: 12, star: '★★' },
  { id: 'S', name: 'Legenda', color: '#fbbf24', min: 12, max: 99, star: '★★★' },
];
export function rankOf(weight: number): RankInfo {
  let r = RANKS[0];
  for (const k of RANKS) if (weight >= k.min) r = k;
  return r;
}
/** makin berat, makin banyak poinnya (naik lebih cepat dari berat: bobot^1.2) */
export function pointsFor(weight: number) {
  return Math.max(1, Math.round(Math.pow(weight, 1.2) * 13));
}

export const FISH: FishDef[] = [
  { id: 'boot', name: 'Sepatu Butut', emoji: '👢', wMin: 0.3, wMax: 0.8, difficulty: 0.08, rarity: 7, color: 0x6b4a2b },
  { id: 'sardine', name: 'Ikan Sarden', emoji: '🐟', wMin: 0.2, wMax: 0.7, difficulty: 0.2, rarity: 26, color: 0x9ec9e8 },
  { id: 'crab', name: 'Kepiting', emoji: '🦀', wMin: 0.4, wMax: 1.4, difficulty: 0.3, rarity: 14, color: 0xe5484d },
  { id: 'bass', name: 'Ikan Bass', emoji: '🐟', wMin: 0.9, wMax: 2.8, difficulty: 0.35, rarity: 22, color: 0x6fae6a },
  { id: 'tropical', name: 'Ikan Tropis', emoji: '🐠', wMin: 0.8, wMax: 3.4, difficulty: 0.5, rarity: 16, color: 0xff9a3c },
  { id: 'puffer', name: 'Ikan Buntal', emoji: '🐡', wMin: 2.2, wMax: 5.2, difficulty: 0.62, rarity: 11, color: 0xf2d04a },
  { id: 'octopus', name: 'Gurita', emoji: '🐙', wMin: 3.5, wMax: 8, difficulty: 0.75, rarity: 7, color: 0xd9588f },
  { id: 'koi', name: 'Koi Emas', emoji: '🎏', wMin: 5, wMax: 11, difficulty: 0.86, rarity: 3.5, color: 0xffc800 },
  { id: 'tuna', name: 'Tuna Raksasa', emoji: '🐟', wMin: 11, wMax: 24, difficulty: 0.95, rarity: 2, color: 0x4a78c2 },
];

export interface Catch {
  def: FishDef;
  weight: number;
  rank: RankInfo;
  points: number;
  diff: number;
  size: number; // skala visual
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function makeCatch(def: FishDef, power: number): Catch {
  // lempar jauh = peluang ikan lebih berat
  const u = Math.pow(Math.random(), 1.7 - 0.8 * power);
  const weight = Math.round((def.wMin + (def.wMax - def.wMin) * u) * 10) / 10;
  return {
    def,
    weight,
    rank: rankOf(weight),
    points: pointsFor(weight),
    diff: clamp(def.difficulty + 0.06 * u, 0, 1),
    size: clamp(0.55 + Math.cbrt(weight) * 0.36, 0.6, 1.9),
  };
}

export function pickFish(power: number): Catch {
  // cast lebih jauh (power tinggi) = ikan berat/langka lebih sering
  const weights = FISH.map((f) => {
    const heavy = f.wMax >= 5;
    const w = heavy ? f.rarity * (0.35 + 1.9 * power) : f.rarity * (1.45 - power * 0.9);
    return Math.max(0.1, w);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < FISH.length; i++) {
    r -= weights[i];
    if (r <= 0) return makeCatch(FISH[i], power);
  }
  return makeCatch(FISH[1], power);
}

export type ReelResult = 'run' | 'caught' | 'lost';

/**
 * Minigame tarik-lepas ala "Stardew": TAHAN = zona hijau naik, LEPAS = zona turun.
 * Jaga ikan tetap di dalam zona sampai bar progres penuh.
 */
export class Reel {
  def: FishDef;
  diff: number;
  size: number;
  zone = 0.1; // posisi bawah zona (0..1-size)
  zv = 0;
  fish = 0.5;
  target = 0.5;
  timer = 0.3;
  speedMul = 1;
  progress = 0.32;
  inZone = false;
  thrash = false;
  dashed = false; // true di frame ikan baru "dash"
  time = 0;

  constructor(def: FishDef, diff: number) {
    this.def = def;
    this.diff = diff;
    // zona besar & ramah; ikan lebih berat = zona sedikit lebih kecil
    this.size = 0.46 - diff * 0.14;
    this.fish = rand(0.4, 0.6);
    this.target = this.fish;
    this.zone = clamp(this.fish - this.size / 2, 0, 1 - this.size);
    this.progress = 0.4;
    this.timer = 0.9;
  }

  get center() {
    return this.zone + this.size / 2;
  }

  update(dt: number, hold: boolean): ReelResult {
    const d = this.diff;
    this.time += dt;
    this.dashed = false;

    // fisika zona: halus, ada redaman, tidak liar (tarik = naik, lepas = turun)
    const acc = hold ? 3.0 : -2.6;
    this.zv += acc * dt;
    this.zv *= Math.exp(-1.6 * dt);
    this.zv = clamp(this.zv, -1.1, 1.1);
    this.zone += this.zv * dt;
    if (this.zone < 0) {
      this.zone = 0;
      this.zv = Math.abs(this.zv) * 0.15;
    }
    const maxZ = 1 - this.size;
    if (this.zone > maxZ) {
      this.zone = maxZ;
      this.zv = -Math.abs(this.zv) * 0.1;
    }

    // AI ikan: lebih lambat, gerakan kecil, jarang dash
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(0.9, 1.9) * (1.3 - d * 0.4);
      if (Math.random() < 0.03 + d * 0.12) {
        this.target = this.fish < 0.5 ? rand(0.6, 0.85) : rand(0.15, 0.4);
        this.speedMul = 1.9;
        this.dashed = true;
      } else {
        const range = 0.12 + 0.28 * d;
        this.target = clamp(this.fish + rand(-range, range), 0.1, 0.9);
      }
    }
    this.speedMul = 1 + (this.speedMul - 1) * Math.exp(-dt * 2.5);
    this.thrash = this.speedMul > 1.4;
    const sp = (0.17 + 0.3 * d) * this.speedMul;
    const v = clamp((this.target - this.fish) * 2.5, -sp, sp);
    this.fish = clamp(this.fish + v * dt, 0.05, 0.95);

    // sedikit bantuan: ikan di zona = zona sedikit "menempel" ke ikan
    this.inZone = this.fish >= this.zone - 0.01 && this.fish <= this.zone + this.size + 0.01;
    if (this.inZone) {
      this.progress += (0.36 - 0.1 * d) * dt;
      this.zv += (this.fish - this.center) * 1.2 * dt;
    } else {
      this.progress -= (0.05 + 0.04 * d) * dt;
    }

    if (this.progress >= 1) return 'caught';
    if (this.progress <= 0) return 'lost';
    return 'run';
  }
}
