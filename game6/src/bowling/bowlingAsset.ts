import * as THREE from 'three';
import { computeAssetStats, setWireframeAll, type AssetHandle, type AssetMeta } from '../assets/common';
import { FOUL_X, HEAD_X, LANE_COUNT, PIN_SPOTS, PLAYER_LANE, bowlingGroundAt, laneZ, returnSlot } from './dims';
import { buildAlley } from './buildAlley';
import { BowlingController } from './controller';
import { BOWLING_COLOR_LABELS, BOWLING_PRESETS, applyBowlingScheme, createBowlingMaterials, type BowlingScheme } from './materials';
import { createCarpetTexture, createMaskingTexture, createMonitor, createNeonTexture, createScreenTexture, createWallMural, createWoodTexture } from './textures';

const PZ = laneZ(PLAYER_LANE);

export const BOWLING_META: AssetMeta = {
  id: 'bowling',
  title: 'Bowling',
  emoji: '🎳',
  indoor: true,
  tagline: 'Arena bowling indoor 6 lintasan ukuran resmi + fisika pin realtime',
  partInfo: [
    { key: 'eyes', label: 'Pin Bermata Jelly', emoji: '👀', hint: 'Mata googly lucu di setiap pin' },
    { key: 'neon', label: 'Neon & Lampu UV', emoji: '💡' },
    { key: 'monitors', label: 'Monitor Skor Gantung', emoji: '📺' },
    { key: 'returns', label: 'Ball Return', emoji: '🎳' },
    { key: 'settees', label: 'Sofa & Konsol Skor', emoji: '🛋️' },
    { key: 'racks', label: 'Rak Bola', emoji: '🔵' },
    { key: 'counter', label: 'Snack Bar', emoji: '🍔' },
    { key: 'arcade', label: 'Pojok Arcade', emoji: '🕹️' },
    { key: 'disco', label: 'Bola Disko', emoji: '🪩' },
  ],
  colorLabels: BOWLING_COLOR_LABELS,
  presets: BOWLING_PRESETS,
  defaultName: 'Jelly Bowl',
  nameLabel: 'Nama Arena',
  nameHint: 'Tampil di neon utama, mural & masking unit.',
  cameras: [
    { key: 'hero', label: 'Pelempar', pos: [FOUL_X - 5.6, 2.65, PZ - 0.75], target: [FOUL_X + 9, 0.05, PZ] },
    { key: 'ruang', label: 'Ruangan', pos: [-17.5, 9.5, 14.5], target: [2.5, 0.3, 0] },
    { key: 'pin', label: 'Pin Deck', pos: [HEAD_X - 2.3, 0.78, PZ + 0.3], target: [HEAD_X + 0.42, 0.14, PZ] },
    { key: 'lintasan', label: 'Lintasan', pos: [FOUL_X + 5, 3.4, PZ + 3.4], target: [FOUL_X + 9.5, 0, PZ] },
    { key: 'lounge', label: 'Lounge', pos: [-8.2, 2.5, 8.2], target: [-13, 0.9, -1.5] },
    { key: 'top', label: 'Atas', pos: [0.01, 42, 0], target: [0, 0, 0] },
  ],
  friendly: [
    [/^Lane_Beds/, 'Lintasan kayu (60 kaki, 39 papan)'],
    [/^Approach/, 'Approach (area ancang-ancang)'],
    [/^Lane_Arrows/, 'Panah target & range finder'],
    [/^Lane_Dots/, 'Dot pemandu & titik pin'],
    [/^Foul_Line/, 'Foul line'],
    [/^Gutters/, 'Gutter (selokan)'],
    [/^Capping/, 'Capping pembatas lintasan'],
    [/^Lane_LED/, 'Lampu LED lintasan'],
    [/^Kickbacks/, 'Kickback (dinding samping pin deck)'],
    [/^Pits?/, 'Pit penampung pin'],
    [/^Pit_Curtains/, 'Tirai pit'],
    [/^Pinsetters/, 'Mesin pinsetter'],
    [/^Masking/, 'Masking unit bermural'],
    [/^Pin_Lights/, 'Lampu pin'],
    [/^Partition|^Soffit/, 'Dinding pinsetter'],
    [/^Neon|^Pillar_Rings|^Blacklights/, 'Neon & lampu UV'],
    [/^Floor_Carpet/, 'Karpet kosmik'],
    [/^Concourse/, 'Concourse (panggung belakang)'],
    [/^Walls|^Wall_/, 'Dinding'],
    [/^Ceiling/, 'Plafon & lampu'],
    [/^Pillars/, 'Pilar'],
    [/^Ball_Return/, 'Ball return'],
    [/^Settee|^Score_Console/, 'Sofa & konsol skor'],
    [/^Monitor/, 'Monitor skor'],
    [/^Counter|^Back_Shelf|^Menu|^Snack|^Stool/, 'Snack bar'],
    [/^Rack/, 'Rak bola'],
    [/^Arcade|^Claw|^Vending|^Bench/, 'Pojok arcade'],
    [/^Disco/, 'Bola disko'],
    [/^Pins$/, 'Pin bowling (fisika realtime)'],
    [/^Pin_Eyes/, 'Mata pin'],
    [/^Ball_Lane|^Beast_Ball/, 'Bola bowling'],
    [/^Aim_Guide/, 'Garis bidik (prediksi fisika)'],
  ],
  specs: [
    '📐 Ukuran resmi USBC: lintasan **60 kaki (18,29 m)**, lebar **41,5 inci**, 39 papan, gutter 9,25 inci',
    '🎳 Pin profil resmi (tinggi 15 inci, 1,54 kg, pusat massa 14,9 cm) & bola 16 lb',
    '⚙️ Fisika **Rapier** 240 Hz: pola minyak 40 kaki → bola skid-hook-roll, kickback & pit realistis',
    '🕹️ 6 lintasan siap minigame: approach lebar untuk saling dorong, pin & bola terekspor terpisah',
  ],
  tips: [
    'Import **.glb** (glTFast), beri **Mesh Collider** pada `Lane_Beds`, `Approach`, `Gutters`, `Capping`, `Kickbacks` & `Pits`.',
    'Pin `LaneN_PinK` → **Rigidbody** 1,54 kg + **Mesh Collider Convex**; bola `LaneN_Ball` → Rigidbody 7,26 kg + Sphere Collider r=0,108 m.',
    'Buat 2 **Physic Material**: oli (gesek 0,04) untuk 40 kaki pertama, kering (0,24) sisanya — bola akan melengkung alami.',
    'Minigame Gang Beasts: lempar beast ke lintasan, hitung pin roboh dari sudut tegak (> 18° = roboh).',
  ],
  dropArea: { hx: 12, hz: 7.5 },
  fishRadius: 0,
  shadowExtent: 21,
  rock: 0,
};

export function createBowlingAsset(): AssetHandle {
  let scheme: BowlingScheme = { ...BOWLING_PRESETS[0].colors };
  let name = BOWLING_META.defaultName;
  const masking = createMaskingTexture();
  const neon = createNeonTexture();
  const mural = createWallMural();
  const snack = createNeonTexture(512, 128);
  const monitors = [0, 1, 2].map((i) => createMonitor(`Monitor_${i + 1}`));
  const M = createBowlingMaterials(scheme, {
    wood: createWoodTexture(),
    carpet: createCarpetTexture(),
    masking: masking.texture,
    neon: neon.texture,
    mural: mural.texture,
    monitors: monitors.map((m) => m.texture),
    console: createScreenTexture('console', 'JELLY BOWL'),
    menu: createScreenTexture('menu', ''),
    arcade: ['#ff4fd8', '#29e7ff', '#ffe14d'].map((c) => createScreenTexture('arcade', c)),
    snack: snack.texture,
  });
  const alley = buildAlley(M);
  const controller = new BowlingController(M, monitors);
  const group = new THREE.Group();
  group.name = 'BowlingAlley_JellyBowl';
  group.add(alley.group, controller.runtime);

  const drawText = () => {
    masking.draw(name);
    neon.draw(name, '★ BOWLING • ARCADE • SNACK ★');
    mural.draw(name);
    snack.draw('SNACK BAR');
  };
  drawText();

  const buildExport = () => {
    const root = new THREE.Group();
    root.name = group.name;
    root.add(alley.group.clone(true));
    const pins = new THREE.Group();
    pins.name = 'Pins';
    const balls = new THREE.Group();
    balls.name = 'Balls';
    for (let i = 0; i < LANE_COUNT; i++) {
      PIN_SPOTS.forEach(([dx, dz], k) => {
        const pin = new THREE.Mesh(controller.pinGeo, controller.pinMat);
        pin.name = `Lane${i + 1}_Pin${k + 1}`;
        pin.position.set(HEAD_X + dx, 0, laneZ(i) + dz);
        if (controller.eyesMesh.visible) {
          const eyes = new THREE.Mesh(controller.eyesGeo, controller.eyesMat);
          eyes.name = `Lane${i + 1}_Pin${k + 1}_Eyes`;
          pin.add(eyes);
        }
        pins.add(pin);
      });
      const ball = new THREE.Mesh(controller.ballGeo, controller.ballMats[i]);
      ball.name = `Lane${i + 1}_Ball`;
      ball.position.set(...returnSlot(i));
      balls.add(ball);
    }
    root.add(pins, balls);
    return root;
  };

  return {
    meta: BOWLING_META,
    group,
    parts: { ...alley.parts, eyes: controller.eyesMesh },
    setColors: (c) => {
      scheme = { ...scheme, ...(c as Partial<BowlingScheme>) };
      applyBowlingScheme(M, scheme);
      controller.refreshLedBase();
    },
    setName: (n) => {
      name = n.trim() || BOWLING_META.defaultName;
      drawText();
    },
    refreshText: drawText,
    setWireframe: (on) => setWireframeAll(group, on),
    setNight: () => {},
    update: (_t, dt) => {
      alley.disco.rotation.y += dt * 0.6;
    },
    groundAt: bowlingGroundAt,
    stats: () => computeAssetStats(group),
    bowling: controller,
    buildExport,
    mirror: { hide: [...alley.mirrorHide, controller.guide], uniforms: M.laneMirror },
  };
}
