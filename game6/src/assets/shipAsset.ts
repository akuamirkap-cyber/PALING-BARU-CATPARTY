import { buildShip, PART_INFO } from '../ship/buildShip';
import { COLOR_LABELS, COLOR_PRESETS } from '../ship/materials';
import { groundAt } from '../ship/dims';
import { createCausticsTexture } from '../scene/water/noise';
import type { AssetHandle, AssetMeta } from './common';

export const SHIP_META: AssetMeta = {
  id: 'ship',
  title: 'Kapal Pesiar',
  emoji: '🚢',
  tagline: 'Kapal pesiar jelly 44 m dengan kolam & perosotan',
  partInfo: PART_INFO,
  colorLabels: COLOR_LABELS,
  presets: COLOR_PRESETS,
  defaultName: 'Wobbly Queen',
  nameLabel: 'Nama Kapal',
  nameHint: 'Tampil di haluan & buritan, ikut terekspor sebagai tekstur.',
  cameras: [
    { key: 'hero', label: 'Utama', pos: [36, 16, 30], target: [0, 5, 0] },
    { key: 'side', label: 'Samping', pos: [0, 7, 56], target: [0, 5, 0] },
    { key: 'bow', label: 'Haluan', pos: [31, 9.5, -10], target: [12, 4.5, 0] },
    { key: 'stern', label: 'Buritan', pos: [-38, 15, -22], target: [-12, 5, 0] },
    { key: 'pool', label: 'Kolam', pos: [-8.5, 11.5, 9.5], target: [-17, 5, -1] },
    { key: 'water', label: 'Air Jernih', pos: [21, 4.5, 22], target: [4, -2.5, 6] },
    { key: 'top', label: 'Atas', pos: [0.01, 74, 0], target: [0, 0, 0] },
  ],
  friendly: [
    [/^Hull_Body/, 'Lambung kapal'],
    [/^Deck_Main/, 'Dek utama (papan kayu)'],
    [/^Hull_Windows/, 'Jendela lambung'],
    [/^Hull_(Stern)?Name/, 'Nama kapal'],
    [/^Hull_Anchors/, 'Jangkar & lubang rantai'],
    [/^Hull_BulbousBow/, 'Haluan bulat (bulbous bow)'],
    [/^Deck_A$/, 'Dek A — promenade'],
    [/^Deck_B$/, 'Dek B — dek matahari'],
    [/^Deck_C$/, 'Dek C — dek anjungan'],
    [/^Bridge/, 'Anjungan kapten'],
    [/_Windows$/, 'Jendela panorama'],
    [/^Window_Frames/, 'Kusen jendela'],
    [/^Doors/, 'Pintu'],
    [/^Funnel/, 'Cerobong asap'],
    [/^(Mast|Radar)/, 'Tiang & radar'],
    [/^NavLight/, 'Lampu navigasi'],
    [/^Radomes/, 'Radome satelit'],
    [/^Stairs/, 'Tangga & tangga monyet'],
    [/^Railings/, 'Pagar'],
    [/^LifeBuoys/, 'Pelampung'],
    [/^Lifeboat/, 'Sekoci penyelamat'],
    [/^Pool/, 'Kolam renang'],
    [/^Slide/, 'Perosotan air'],
    [/^Lounger/, 'Kursi santai'],
    [/^Umbrella/, 'Payung pantai'],
    [/^Helipad/, 'Helipad'],
    [/^(Windlass|Anchor_Chains)/, 'Mesin jangkar'],
    [/^Bollards/, 'Bolder tambat'],
    [/^Crates/, 'Peti kayu'],
    [/^Barrel/, 'Tong'],
    [/^(Signal_Flags|Flag_)/, 'Bendera hias'],
    [/^Propeller/, 'Baling-baling'],
    [/^Rudder/, 'Kemudi'],
  ],
  specs: [
    '📐 Skala **1 unit = 1 meter**, haluan menghadap **+X**, atas **+Y**',
    '🎨 Material PBR + tekstur prosedural (dek kayu, peti, nama, logo, kaustik kolam)',
    '🤸 Dek datar, tangga & pagar ramah fisika ragdoll',
    '🏝️ 4 tingkat area tarung: haluan, promenade, dek matahari, atap anjungan',
  ],
  tips: [
    'Import **.glb** dengan paket **glTFast** (`com.unity.cloud.gltfast`).',
    'Tambah **Mesh Collider** pada `Hull_Body`, `Deck_*`, `Stairs_Ladders` & `Railings`.',
    'Beri **Rigidbody** pada `Crates` & `Barrels_*` agar bisa diangkat & dilempar.',
    'Pasang kill-zone di bawah garis air (Y < −1): jatuh ke laut = gugur! 🌊',
  ],
  dropArea: { hx: 20, hz: 6.5 },
  fishRadius: 24,
  shadowExtent: 34,
  rock: 1,
};

export function createShipAsset(): AssetHandle {
  const ship = buildShip(COLOR_PRESETS[0].colors, SHIP_META.defaultName);
  const M = ship.materials;
  const caustics = createCausticsTexture();
  caustics.repeat.set(1.6, 1.6);
  M.poolTile.map = caustics;
  M.poolTile.color.set('#ffffff');
  M.poolTile.needsUpdate = true;
  M.poolWater.color.set('#55e2f0');
  M.poolWater.opacity = 0.55;
  M.poolWater.roughness = 0.04;
  let nameCache = SHIP_META.defaultName;

  return {
    meta: SHIP_META,
    group: ship.group,
    parts: ship.parts,
    slideCurve: ship.slideCurve,
    setColors: (c) => ship.setColors(c as Parameters<typeof ship.setColors>[0]),
    setName: (n) => {
      nameCache = n;
      ship.setName(n);
    },
    refreshText: () => ship.setName(nameCache),
    setWireframe: ship.setWireframe,
    setNight: (glow) => {
      M.glass.emissiveIntensity = glow;
      M.bulb.emissiveIntensity = 0.3 + glow * 1.4;
      M.poolWater.emissiveIntensity = 0.12 + glow * 0.35;
      const nav = 0.6 + glow * 1.2;
      M.navRed.emissiveIntensity = nav;
      M.navGreen.emissiveIntensity = nav;
      M.navWhite.emissiveIntensity = nav;
    },
    update: (t, dt) => {
      ship.radar.rotation.y += dt * 1.6;
      ship.propellers.forEach((p, i) => {
        p.rotation.x += dt * (i ? -7 : 7);
      });
      caustics.offset.set(Math.sin(t * 0.21) * 0.08 + t * 0.012, Math.cos(t * 0.17) * 0.08);
    },
    groundAt,
    stats: ship.stats,
  };
}

