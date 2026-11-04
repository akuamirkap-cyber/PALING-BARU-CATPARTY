import * as THREE from 'three';

export type ColorKey = 'hull' | 'superstructure' | 'funnel' | 'stripe' | 'deck' | 'lifeboat' | 'trim' | 'slide' | 'bottom';
export type ColorScheme = Record<ColorKey, string>;

export const COLOR_LABELS: Record<ColorKey, string> = {
  hull: 'Lambung',
  superstructure: 'Bangunan Atas',
  funnel: 'Cerobong',
  stripe: 'Garis Lambung',
  deck: 'Lantai Kayu',
  lifeboat: 'Sekoci',
  trim: 'Pagar & Tangga',
  slide: 'Perosotan Air',
  bottom: 'Lambung Bawah Air',
};

export const COLOR_PRESETS: { id: string; name: string; colors: ColorScheme }[] = [
  {
    id: 'klasik',
    name: 'Klasik',
    colors: {
      hull: '#1f3a5f',
      superstructure: '#f4f1ea',
      funnel: '#d62828',
      stripe: '#f2c14e',
      deck: '#c8915a',
      lifeboat: '#ff7b00',
      trim: '#ffffff',
      slide: '#ffd23f',
      bottom: '#b23a3a',
    },
  },
  {
    id: 'beast',
    name: 'Gang Beasts',
    colors: {
      hull: '#2f9fd0',
      superstructure: '#fff4d6',
      funnel: '#ffc93c',
      stripe: '#ff6b6b',
      deck: '#d9a066',
      lifeboat: '#ff8c42',
      trim: '#fffaf0',
      slide: '#ff5d8f',
      bottom: '#8e3b46',
    },
  },
  {
    id: 'mint',
    name: 'Retro Mint',
    colors: {
      hull: '#5fbfa8',
      superstructure: '#fdf6e3',
      funnel: '#f28f3b',
      stripe: '#e15554',
      deck: '#c9a26b',
      lifeboat: '#f6ae2d',
      trim: '#fdf6e3',
      slide: '#4d9de0',
      bottom: '#7a4e3a',
    },
  },
  {
    id: 'neon',
    name: 'Pesta Neon',
    colors: {
      hull: '#5b2a86',
      superstructure: '#fef9ff',
      funnel: '#ff3caa',
      stripe: '#00e5ff',
      deck: '#e0b07a',
      lifeboat: '#ffd300',
      trim: '#ffe8ff',
      slide: '#00e5ff',
      bottom: '#2d1e4a',
    },
  },
  {
    id: 'tua',
    name: 'Kapal Tua',
    colors: {
      hull: '#4a4a48',
      superstructure: '#d8d2c2',
      funnel: '#8c3b2a',
      stripe: '#c2a35a',
      deck: '#8f6b46',
      lifeboat: '#d9792b',
      trim: '#b8b2a2',
      slide: '#c2a35a',
      bottom: '#6b2f25',
    },
  },
];

export interface ShipTextures {
  deck: THREE.Texture;
  crate: THREE.Texture;
  name: THREE.Texture;
  stern: THREE.Texture;
  logo: THREE.Texture;
}

export function createMaterials(c: ColorScheme, tex: ShipTextures) {
  const std = (name: string, color: THREE.ColorRepresentation, p: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...p });
    m.name = name;
    return m;
  };
  const decal = (name: string, map: THREE.Texture) =>
    std(name, '#ffffff', {
      map,
      transparent: true,
      roughness: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthWrite: false,
    });
  const flags = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
  flags.name = 'Signal_Flags';

  return {
    hull: std('Hull_Paint', c.hull, { roughness: 0.42 }),
    bottom: std('Hull_Bottom', c.bottom, { roughness: 0.7 }),
    stripe: std('Hull_Stripe', c.stripe, { roughness: 0.35, metalness: 0.25 }),
    bootTop: std('Hull_BootTop', '#efece4', { roughness: 0.5 }),
    white: std('Superstructure_Paint', c.superstructure, { roughness: 0.55 }),
    deck: std('Deck_Wood', c.deck, { map: tex.deck, roughness: 0.82 }),
    deckPaint: std('Deck_Upper', '#8fb3b5', { map: tex.deck, roughness: 0.85 }),
    glass: std('Window_Glass', '#1b2f4a', { roughness: 0.15, metalness: 0.45, emissive: '#ffcf70', emissiveIntensity: 0 }),
    door: std('Door_Paint', '#36536f', { roughness: 0.5 }),
    funnel: std('Funnel_Paint', c.funnel, { roughness: 0.45 }),
    funnelTop: std('Funnel_Top', '#1c1c22', { roughness: 0.6 }),
    soot: std('Funnel_Inside', '#0b0b0d', { roughness: 1 }),
    trim: std('Railing_Paint', c.trim, { roughness: 0.5 }),
    lifeboat: std('Lifeboat_Hull', c.lifeboat, { roughness: 0.5 }),
    lifeboatTop: std('Lifeboat_Canopy', '#fbfbf7', { roughness: 0.5 }),
    metal: std('Metal_Grey', '#9aa3ad', { roughness: 0.45, metalness: 0.6 }),
    darkMetal: std('Metal_Dark', '#3b4048', { roughness: 0.5, metalness: 0.5 }),
    bronze: std('Propeller_Bronze', '#c08a3e', { roughness: 0.35, metalness: 0.85 }),
    crate: std('Crate_Wood', '#ffffff', { map: tex.crate, roughness: 0.85 }),
    barrelA: std('Barrel_Red', '#c8423b', { roughness: 0.5 }),
    barrelB: std('Barrel_Blue', '#2f6db5', { roughness: 0.5 }),
    poolWater: std('Pool_Water', '#3fd0e8', {
      roughness: 0.08,
      metalness: 0.1,
      emissive: '#1fb8ff',
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.9,
    }),
    poolTile: std('Pool_Tile', '#dff4fa', { roughness: 0.3 }),
    slide: std('Slide_Plastic', c.slide, { roughness: 0.28, side: THREE.DoubleSide }),
    cushion: std('Lounger_Cushion', '#3a86c8', { roughness: 0.8 }),
    umbrellaA: std('Umbrella_Red', '#ef476f', { roughness: 0.7 }),
    umbrellaB: std('Umbrella_Yellow', '#ffd166', { roughness: 0.7 }),
    helipad: std('Helipad_Green', '#3e6b4f', { roughness: 0.9 }),
    yellowPaint: std('Paint_Yellow', '#ffcc33', { roughness: 0.6 }),
    buoyOrange: std('Buoy_Orange', '#ff6a1a', { roughness: 0.55 }),
    buoyWhite: std('Paint_White', '#f8f8f8', { roughness: 0.55 }),
    rope: std('Rope_Dark', '#2a2a2a', { roughness: 0.9 }),
    bulb: std('Bulb_Light', '#fff3c4', { emissive: '#ffd36b', emissiveIntensity: 0.3 }),
    navRed: std('NavLight_Red', '#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.8 }),
    navGreen: std('NavLight_Green', '#2aff6a', { emissive: '#2aff6a', emissiveIntensity: 0.8 }),
    navWhite: std('NavLight_White', '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 }),
    flags,
    nameDecal: decal('Decal_ShipName', tex.name),
    sternDecal: decal('Decal_SternName', tex.stern),
    logoDecal: decal('Decal_FunnelLogo', tex.logo),
  };
}

export type ShipMaterials = ReturnType<typeof createMaterials>;

export function applyScheme(m: ShipMaterials, c: ColorScheme) {
  m.hull.color.set(c.hull);
  m.white.color.set(c.superstructure);
  m.funnel.color.set(c.funnel);
  m.stripe.color.set(c.stripe);
  m.deck.color.set(c.deck);
  m.lifeboat.color.set(c.lifeboat);
  m.trim.color.set(c.trim);
  m.slide.color.set(c.slide);
  m.bottom.color.set(c.bottom);
}
