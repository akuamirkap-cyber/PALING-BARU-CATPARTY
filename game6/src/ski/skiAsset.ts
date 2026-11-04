import * as THREE from 'three';
import { computeAssetStats, setWireframeAll, type AssetHandle, type AssetMeta } from '../assets/common';
import { COURSE, PLAYER_SLOT, START_D, W } from './course';
import { SKI_COLOR_LABELS, SKI_PRESETS, buildMountain, type SkiScheme } from './buildMountain';
import { SkiController } from './controller';

const c = COURSE;
const P = (s: number, d: number, dy: number): [number, number, number] => {
  const w = c.worldAt(s, d);
  return [w.x, w.y + dy, w.z];
};
/** Posisi kamera: (s, d) + tinggi di atas TANAH sebenarnya (medan bisa lebih tinggi dari lintasan). */
const G = (s: number, d: number, dy: number): [number, number, number] => {
  const w = c.worldAt(s, d);
  return [w.x, c.groundY(w.x, w.z) + dy, w.z];
};
const startP = c.worldAt(c.startS, START_D[PLAYER_SLOT]);
const J3 = c.jumps[3];
const fin = c.finishS;

export const SKI_META: AssetMeta = {
  id: 'ski',
  title: 'Ski Gunung',
  emoji: '⛷️',
  snow: true,
  tagline: 'Lomba Ski Cross 1,1 km menuruni gunung salju — 4 pembalap, gerbang, lompatan & penonton',
  partInfo: [
    { key: 'crowd', label: 'Penonton Bersorak', emoji: '🙌', hint: 'Heboh saat kamu lewat — tidak ikut diekspor' },
    { key: 'gates', label: 'Gerbang Bendera', emoji: '🚩' },
    { key: 'fences', label: 'Jaring Pengaman & Sponsor', emoji: '🥅' },
    { key: 'trees', label: 'Hutan Pinus', emoji: '🌲' },
    { key: 'stands', label: 'Tribun Finish', emoji: '🏟️' },
    { key: 'lift', label: 'Kereta Gantung', emoji: '🚡' },
    { key: 'decor', label: 'Lampu, Chalet & Manusia Salju', emoji: '⛄' },
    { key: 'terrain', label: 'Medan & Puncak Gunung', emoji: '🏔️' },
  ],
  colorLabels: SKI_COLOR_LABELS,
  presets: SKI_PRESETS,
  defaultName: 'Jelly Peak',
  nameLabel: 'Nama Gunung / Event',
  nameHint: 'Tampil di spanduk START & FINISH.',
  cameras: [
    { key: 'hero', label: 'Start', pos: P(c.startS - 9, 6, 6), target: [startP.x + 25, startP.y - 8, startP.z] },
    { key: 'lompat', label: 'Lompatan', pos: G(J3.s + 14, -(W + 9), 11), target: P(J3.s - 6, 1, 0.8) },
    { key: 'finish', label: 'Finish', pos: P(fin + 24, 4, 7), target: P(fin - 30, 0, 2) },
    { key: 'tribun', label: 'Tribun', pos: P(fin - 16, -2, 7.5), target: P(fin - 36, W + 4, 2.5) },
    { key: 'gunung', label: 'Gunung', pos: [c.worldAt(560, 0).x - 40, c.worldAt(560, 0).y + 230, 330], target: P(560, 0, -20) },
    { key: 'top', label: 'Atas', pos: [470, c.Hs(560) + 900, 1], target: [470, c.Hs(560), 0] },
  ],
  friendly: [
    [/^Track_Snow|^Track_EndCaps/, 'Lintasan salju groomed (corduroy)'],
    [/^Jump_Lip/, 'Bibir lompatan (garis pewarna)'],
    [/^Finish_Line/, 'Garis finish'],
    [/^Terrain/, 'Medan salju & tebing batu'],
    [/^Distant_Peaks/, 'Puncak gunung di kejauhan'],
    [/^Pine_Trees/, 'Pohon pinus bersalju'],
    [/^Safety_Nets|^Fence_Posts/, 'Jaring pengaman (B-net)'],
    [/^Sponsor/, 'Spanduk sponsor'],
    [/^Gate_/, 'Gerbang bendera'],
    [/^Start_/, 'Area start'],
    [/^Finish_Arch|^Finish_Banner/, 'Gerbang finish tiup'],
    [/^Timing_Board/, 'Papan waktu'],
    [/^Grandstand/, 'Tribun finish'],
    [/^Lift_/, 'Kereta gantung (chairlift)'],
    [/^Lamp_/, 'Lampu lintasan'],
    [/^Chalet/, 'Chalet / pondok'],
    [/^Snowmen/, 'Manusia salju'],
    [/^Flag_Rows/, 'Bendera hias'],
    [/^Spectator/, 'Penonton jelly'],
    [/^Skier_|^Skis|^Beast_/, 'Pembalap ski beast'],
  ],
  specs: [
    '📐 Lintasan **1.142 m**, turun **247 m**, lebar 24 m + tanggul — ukuran khas **Ski Cross** Olimpiade',
    '🚩 **14 gerbang** bendera, **4 lompatan** (kicker hingga 2,3 m), rollers & tikungan miring (banked)',
    '⚙️ Fisika ski: carving tepi ski, drag udara (tuck), snowplough, lompatan balistik & putaran 360°',
    '🙌 ±1.700 penonton jelly bersorak, tribun finish, kereta gantung, 2.500 pohon pinus',
  ],
  tips: [
    'Import **.glb** (glTFast). Beri **Mesh Collider** pada `Track_Snow`, `Terrain_Snow`, `Grandstand_Steps` & `Start_Hut`.',
    'Jalur tengah lintasan = spline; ekspor titiknya dari `Track_Snow` untuk sistem checkpoint/gerbang.',
    'Physic Material salju: dynamic friction ≈ 0,05; tambahkan drag udara ∝ v² untuk kecepatan puncak ±85 km/j.',
    'Minigame Gang Beasts: beast di atas papan/ski + ragdoll saat jatuh, garis finish = trigger juara 🏁',
  ],
  dropArea: { hx: 20, hz: 20 },
  fishRadius: 0,
  shadowExtent: 45,
  rock: 0,
  maxDistance: 1400,
};

export function createSkiAsset(): AssetHandle {
  let scheme: SkiScheme = { ...SKI_PRESETS[0].colors };
  const M = buildMountain(scheme);
  const ctl = new SkiController(M);
  const group = new THREE.Group();
  group.name = 'SkiArena_JellyPeak';
  group.add(M.group, ctl.runtime);
  let name = SKI_META.defaultName;
  const drawText = () => {
    M.banners.start.draw(`${name.toUpperCase()} SKI CROSS`);
    M.banners.finish.draw(`${name.toUpperCase()} · BEEF CITY CUP`);
  };
  drawText();
  // dropped beasts mendarat di permukaan lintasan relatif titik start
  const origin = c.worldAt(c.startS + 40, 0);
  return {
    meta: SKI_META,
    group,
    parts: M.parts,
    setColors: (col) => {
      scheme = { ...scheme, ...(col as Partial<SkiScheme>) };
      M.setScheme(scheme);
    },
    setName: (n) => {
      name = n.trim() || SKI_META.defaultName;
      drawText();
    },
    refreshText: drawText,
    setWireframe: (on) => setWireframeAll(group, on),
    setNight: (glow) => {
      M.lampMat.emissiveIntensity = glow > 1 ? 4.5 : glow > 0.5 ? 1.6 : 0.2;
      M.windowMat.emissiveIntensity = 0.4 + glow * 1.3;
    },
    update: () => {},
    groundAt: (x, z) => ({ y: c.groundY(x, z), surface: 'deck' }),
    stats: () => computeAssetStats(group),
    ski: ctl,
    dropOrigin: [origin.x, 0, origin.z],
  };
}
