import * as THREE from 'three';
import { computeAssetStats, setWireframeAll, type AssetHandle, type AssetMeta, type MatchState } from '../assets/common';
import { stadiumGroundAt } from './dims';
import { buildPitch } from './buildPitch';
import { buildStands } from './buildStands';
import { buildSurroundings } from './buildSurroundings';
import { buildCrowd } from './crowd';
import {
  applyStadiumScheme,
  createStadiumMaterials,
  STADIUM_COLOR_LABELS,
  STADIUM_PRESETS,
  type StadiumScheme,
} from './materials';
import {
  createAdTexture,
  createAwningTexture,
  createCrestTexture,
  createFasciaTexture,
  createGrassTexture,
  createJumbotron,
  createKioskSignTexture,
  createNetTexture,
  createPavingTexture,
} from './textures';

export const STADIUM_META: AssetMeta = {
  id: 'stadium',
  title: 'Stadion Bola',
  emoji: '🏟️',
  tagline: 'Stadion terapung 92 × 74 m di laguna sebening kaca',
  partInfo: [
    { key: 'goals', label: 'Gawang & Jaring', emoji: '🥅' },
    { key: 'roofs', label: 'Atap Kantilever', emoji: '🏗️' },
    { key: 'towers', label: 'Menara Lampu (bisa dipanjat)', emoji: '💡' },
    { key: 'screens', label: 'Layar Raksasa', emoji: '📺' },
    { key: 'adBoards', label: 'Papan Iklan LED', emoji: '🪧' },
    { key: 'dugouts', label: 'Bangku Cadangan & Terowongan', emoji: '🪑' },
    { key: 'promenade', label: 'Kelapa, Kios & Huruf Raksasa', emoji: '🌴' },
    { key: 'railing', label: 'Pagar Tepi Laut', emoji: '🚧', hint: 'Matikan untuk arena tanpa pengaman 😈' },
    { key: 'ball', label: 'Bola Raksasa', emoji: '⚽' },
    { key: 'crowd', label: 'Penonton Jelly', emoji: '🙌', hint: 'Dekorasi pratinjau — tidak ikut diekspor' },
  ],
  colorLabels: STADIUM_COLOR_LABELS,
  presets: STADIUM_PRESETS,
  defaultName: 'Jelly Arena',
  nameLabel: 'Nama Stadion',
  nameHint: 'Tampil di fasia atap, lambang klub & layar raksasa.',
  cameras: [
    { key: 'hero', label: 'Utama', pos: [46, 40, 62], target: [0, 2, 0] },
    { key: 'tribun', label: 'Tribun', pos: [6, 9.6, -25.5], target: [-2, 2.2, 4] },
    { key: 'gawang', label: 'Gawang', pos: [29.5, 7.8, 0.01], target: [0, 2.6, 0] },
    { key: 'menara', label: 'Menara', pos: [31, 30, 26], target: [0, 2, 0] },
    { key: 'laut', label: 'Air Jernih', pos: [66, 3.4, 40], target: [40, -2.5, 24] },
    { key: 'top', label: 'Atas', pos: [0.01, 105, 0], target: [0, 0, 0] },
  ],
  friendly: [
    [/^Pitch_Grass/, 'Rumput lapangan'],
    [/^Pitch_Lines/, 'Garis lapangan'],
    [/^Corner_/, 'Bendera sudut'],
    [/^Goal_/, 'Gawang & jaring'],
    [/^AdBoard/, 'Papan iklan LED'],
    [/^Dugout/, 'Bangku cadangan'],
    [/^Tunnel/, 'Terowongan tiup pemain'],
    [/^Ball_/, 'Bola raksasa'],
    [/^Stand_\w+_Seats/, 'Kursi penonton'],
    [/^Stand_\w+_(Aisle|Handrails)/, 'Tangga lorong'],
    [/^Stand_\w+_VIP/, 'Boks VIP'],
    [/^Stand_\w+_Roof/, 'Atap membran'],
    [/^Stand_\w+_(Truss|Fascia|Lamp)/, 'Rangka atap & lampu'],
    [/^Stand_\w+_(Frame|Display|BackCrest)/, 'Layar raksasa'],
    [/^Stand_\w+_(Facade|Gates|Crest)/, 'Fasad tribun'],
    [/^Stand_/, 'Tribun berundak'],
    [/^Platform/, 'Ponton terapung'],
    [/^Mooring/, 'Rantai tambat'],
    [/^Sea_Railing/, 'Pagar tepi laut'],
    [/^LifeBuoys/, 'Pelampung'],
    [/^Tower_/, 'Menara lampu'],
    [/^(Planter|Palm_)/, 'Pohon kelapa'],
    [/^Kiosk/, 'Kios jajanan'],
    [/^Bench/, 'Bangku taman'],
    [/^Letters/, 'Huruf raksasa JELLY ARENA'],
  ],
  specs: [
    '📐 Skala **1 unit = 1 meter**, lapangan **40 × 26 m** — pas untuk beast setinggi 1,35 m',
    '🏟️ 4 tribun berundak (±2.000 kursi) dengan mosaik huruf **JELLY** & **BEEF**',
    '🌊 Ponton terapung: sudut terbuka untuk melempar lawan ke laut!',
    '🧗 Bisa dipanjat: menara lampu bertangga, atap, layar raksasa & huruf pelangi',
  ],
  tips: [
    'Import **.glb** dengan **glTFast**, lalu beri **Mesh Collider** pada `Pitch_Grass`, `Stand_*`, `Platform_Pontoon` & `*_Roof`.',
    'Beri **Rigidbody** + **Sphere Collider** pada `Ball_Giant` — bola raksasa siap ditendang.',
    'Jaring gawang memakai alpha-mask: aktifkan **Alpha Clipping** di material `Goal_Net`.',
    'Pasang kill-zone di Y < 0 (laut) & trigger skor di dalam gawang ⚽.',
  ],
  dropArea: { hx: 40, hz: 31 },
  fishRadius: 58,
  shadowExtent: 58,
  rock: 0.25,
};

const CROWD_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#b197fc', '#ffa94d', '#63e6be', '#f8f9fa', '#ff8787'];

export function createStadiumAsset(): AssetHandle {
  let scheme: StadiumScheme = { ...STADIUM_PRESETS[0].colors };
  let name = STADIUM_META.defaultName;
  const ads = createAdTexture();
  const fascia = createFasciaTexture();
  const crest = createCrestTexture();
  const kiosk = createKioskSignTexture();
  const jumbo = createJumbotron();
  const M = createStadiumMaterials(scheme, {
    grass: createGrassTexture(),
    paving: createPavingTexture(),
    net: createNetTexture(),
    ads: ads.texture,
    fascia: fascia.texture,
    crest: crest.texture,
    awning: createAwningTexture(),
    kiosk: kiosk.texture,
    jumbo: jumbo.texture,
  });
  M.deck.map!.repeat.set(0.25, 0.25);

  const group = new THREE.Group();
  group.name = 'Stadium_JellyArena';
  const pitch = buildPitch(M);
  const stands = buildStands(M);
  const sur = buildSurroundings(M);
  const crowd = buildCrowd(stands.seatSpots, 0.56, CROWD_COLORS);

  group.add(sur.platform, pitch.pitch, stands.stands);
  group.add(pitch.goals, stands.roofs, sur.towers, stands.screens, pitch.adBoards, pitch.dugouts, sur.promenade, sur.railing, pitch.ball, crowd.mesh);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m !== crowd.mesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && !Array.isArray(m.material) && (mat.transparent || mat.name.startsWith('Decal'))) m.castShadow = false;
    // mesh kursi sangat padat: lewati raycast hover agar tetap ringan (tribun di bawahnya tetap terdeteksi)
    if (m.name.includes('_Seats_') || m.name.startsWith('Palm_Leaves')) m.raycast = () => {};
  });

  const match: MatchState = { home: 0, away: 0, flash: 0, clock: 0 };
  const redrawText = () => {
    fascia.draw(name);
    crest.draw(name, scheme.facade, scheme.seatB);
    jumbo.setTitle(name);
    jumbo.draw(match, 0);
  };
  redrawText();

  let nextDraw = 0;
  let cheer = 1;
  let wave = 0;

  return {
    meta: STADIUM_META,
    group,
    parts: {
      goals: pitch.goals,
      roofs: stands.roofs,
      towers: sur.towers,
      screens: stands.screens,
      adBoards: pitch.adBoards,
      dugouts: pitch.dugouts,
      promenade: sur.promenade,
      railing: sur.railing,
      ball: pitch.ball,
      crowd: crowd.mesh,
    },
    match,
    ball: pitch.ball,
    setColors: (c) => {
      scheme = { ...scheme, ...(c as Partial<StadiumScheme>) };
      applyStadiumScheme(M, scheme);
      crest.draw(name, scheme.facade, scheme.seatB);
    },
    setName: (n) => {
      name = n.trim() || STADIUM_META.defaultName;
      redrawText();
    },
    refreshText: () => {
      ads.draw();
      kiosk.draw();
      redrawText();
    },
    setWireframe: (on) => setWireframeAll(group, on),
    setNight: (glow) => {
      M.lamp.emissiveIntensity = glow > 1 ? 7 : glow > 0.5 ? 2.2 : 0.4;
      M.adScreen.emissiveIntensity = 0.55 + glow * 0.45;
      M.jumbotron.emissiveIntensity = 0.9 + glow * 0.35;
      M.glass.emissiveIntensity = glow * 0.5;
    },
    update: (t, dt) => {
      ads.texture.offset.x = t * 0.045;
      if (t >= nextDraw) {
        jumbo.draw(match, t);
        nextDraw = t + 0.2;
      }
      cheer += ((match.flash > 0 ? 3 : 1) - cheer) * Math.min(1, dt * 3);
      const wantWave = Math.sin(t * 0.21) > 0.35 ? 1 : 0;
      wave += (wantWave - wave) * Math.min(1, dt * 1.5);
      crowd.uniforms.uTime.value = t;
      crowd.uniforms.uCheer.value = cheer;
      crowd.uniforms.uWave.value = wave;
    },
    groundAt: stadiumGroundAt,
    stats: () => computeAssetStats(group),
  };
}
