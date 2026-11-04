import * as THREE from 'three';

export type StadiumColorKey = 'grass' | 'seatA' | 'seatB' | 'facade' | 'roof' | 'steel' | 'platform';
export type StadiumScheme = Record<StadiumColorKey, string>;

export const STADIUM_COLOR_LABELS: Record<StadiumColorKey, string> = {
  grass: 'Rumput Lapangan',
  seatA: 'Kursi Utama',
  seatB: 'Kursi Motif & Huruf',
  facade: 'Fasad & Terowongan',
  roof: 'Atap Membran',
  steel: 'Rangka Baja',
  platform: 'Lambung Ponton',
};

export const STADIUM_PRESETS: { id: string; name: string; colors: StadiumScheme }[] = [
  {
    id: 'jelly',
    name: 'Jelly Arena',
    colors: { grass: '#4fb34f', seatA: '#1e88e5', seatB: '#ffd23f', facade: '#ff7a3d', roof: '#f7f7f2', steel: '#ff5d73', platform: '#2f9fd0' },
  },
  {
    id: 'beef',
    name: 'Beef City',
    colors: { grass: '#45a845', seatA: '#d62828', seatB: '#ffffff', facade: '#d62828', roof: '#f4f1ea', steel: '#1d3557', platform: '#1d3557' },
  },
  {
    id: 'tropis',
    name: 'Tropis',
    colors: { grass: '#5cc062', seatA: '#14b8a6', seatB: '#ff8fab', facade: '#fb7185', roof: '#fffaf0', steel: '#f59e0b', platform: '#0ea5e9' },
  },
  {
    id: 'neon',
    name: 'Neon Malam',
    colors: { grass: '#38a85a', seatA: '#6d28d9', seatB: '#22d3ee', facade: '#8b5cf6', roof: '#2a2540', steel: '#f472b6', platform: '#312e81' },
  },
  {
    id: 'retro',
    name: 'Retro',
    colors: { grass: '#6a994e', seatA: '#bc4749', seatB: '#f2e8cf', facade: '#a7c957', roof: '#e9e4d4', steel: '#386641', platform: '#386641' },
  },
];

export interface StadiumTextures {
  grass: THREE.Texture;
  paving: THREE.Texture;
  net: THREE.Texture;
  ads: THREE.Texture;
  fascia: THREE.Texture;
  crest: THREE.Texture;
  awning: THREE.Texture;
  kiosk: THREE.Texture;
  jumbo: THREE.Texture;
}

export function createStadiumMaterials(c: StadiumScheme, t: StadiumTextures) {
  const std = (name: string, color: THREE.ColorRepresentation, p: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...p });
    m.name = name;
    return m;
  };
  const decal = (name: string, map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) =>
    std(name, '#ffffff', {
      map,
      transparent: true,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthWrite: false,
      ...extra,
    });
  const vc = (name: string, p: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, ...p });
    m.name = name;
    return m;
  };
  return {
    grass: std('Pitch_Grass', c.grass, { map: t.grass, roughness: 0.95 }),
    lines: std('Pitch_Lines', '#fbfbf6', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    goalFrame: std('Goal_Frame', '#ffffff', { roughness: 0.35, metalness: 0.2 }),
    net: std('Goal_Net', '#ffffff', { map: t.net, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }),
    concrete: std('Stand_Concrete', '#d3cec4', { roughness: 0.92 }),
    seatA: std('Seat_Main', c.seatA, { roughness: 0.4 }),
    seatB: std('Seat_Pattern', c.seatB, { roughness: 0.4 }),
    facade: std('Facade_Paint', c.facade, { roughness: 0.55 }),
    roof: std('Roof_Membrane', c.roof, { roughness: 0.5 }),
    steel: std('Roof_Steel', c.steel, { roughness: 0.4, metalness: 0.35 }),
    yellow: std('Step_Nosing', '#ffcc33', { roughness: 0.6 }),
    glass: std('Glass_Tinted', '#9fd8ff', { transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2, emissive: '#ffd27a', emissiveIntensity: 0 }),
    darkMetal: std('Metal_Dark', '#30353d', { roughness: 0.5, metalness: 0.5 }),
    metal: std('Metal_Grey', '#a3acb6', { roughness: 0.4, metalness: 0.6 }),
    door: std('Gate_Dark', '#2b3446', { roughness: 0.7 }),
    screenFrame: std('Screen_Frame', '#22252b', { roughness: 0.5, metalness: 0.3 }),
    jumbotron: std('Screen_Jumbotron', '#ffffff', { map: t.jumbo, emissive: '#ffffff', emissiveMap: t.jumbo, emissiveIntensity: 0.9, roughness: 0.3 }),
    fascia: decal('Decal_Fascia', t.fascia),
    crest: decal('Decal_Crest', t.crest),
    adScreen: std('AdBoard_LED', '#ffffff', { map: t.ads, emissive: '#ffffff', emissiveMap: t.ads, emissiveIntensity: 0.55, roughness: 0.3 }),
    lamp: std('Floodlight_Lens', '#fffbe6', { emissive: '#fff4c8', emissiveIntensity: 0.4, roughness: 0.2 }),
    deck: std('Platform_Deck', '#efe9de', { map: t.paving, roughness: 0.85 }),
    hull: std('Platform_Hull', c.platform, { roughness: 0.45 }),
    stripe: std('Platform_Stripe', '#ffffff', { roughness: 0.5 }),
    bootTop: std('Platform_BootTop', '#1f2430', { roughness: 0.6 }),
    trim: std('Railing_White', '#ffffff', { roughness: 0.45 }),
    buoyOrange: std('Buoy_Orange', '#ff6a1a', { roughness: 0.55 }),
    planter: std('Planter', '#f2efe7', { roughness: 0.7 }),
    soil: std('Soil', '#5b4632', { roughness: 1 }),
    palmTrunk: std('Palm_Trunk', '#9c7a52', { roughness: 0.9 }),
    palmLeaf: std('Palm_Leaf', '#3f9b46', { roughness: 0.8, side: THREE.DoubleSide }),
    palmNut: std('Palm_Nut', '#6b4f2a', { roughness: 0.7 }),
    awning: std('Kiosk_Awning', '#ffffff', { map: t.awning, roughness: 0.7 }),
    kioskBody: std('Kiosk_Body', '#fff3d6', { roughness: 0.6 }),
    kioskSign: std('Kiosk_Signs', '#ffffff', { map: t.kiosk, roughness: 0.5 }),
    wood: std('Bench_Wood', '#b07a46', { roughness: 0.8 }),
    letters: vc('Letters_Rainbow', { roughness: 0.35 }),
    tunnelB: std('Tunnel_White', '#ffffff', { roughness: 0.5 }),
    flag: std('Corner_Flag', '#ff4d6d', { side: THREE.DoubleSide, roughness: 0.7 }),
    ball: vc('Ball_Panels', { roughness: 0.35, flatShading: true }),
  };
}

export type StadiumMaterials = ReturnType<typeof createStadiumMaterials>;

export function applyStadiumScheme(m: StadiumMaterials, c: StadiumScheme) {
  m.grass.color.set(c.grass);
  m.seatA.color.set(c.seatA);
  m.seatB.color.set(c.seatB);
  m.facade.color.set(c.facade);
  m.roof.color.set(c.roof);
  m.steel.color.set(c.steel);
  m.hull.color.set(c.platform);
}
