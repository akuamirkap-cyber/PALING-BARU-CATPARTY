export type EnvKey = 'day' | 'sunset' | 'night' | 'storm';

export interface EnvDef {
  label: string;
  icon: string;
  skyTop: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** pengali tinggi gelombang */
  waveAmp: number;
  rock: number;
  windowGlow: number;
  cloud: string;
  smoke: string;
  /* ---- air laguna ---- */
  waterShallow: string;
  waterDeep: string;
  /** koefisien serapan cahaya per meter (R, G, B) */
  absorb: [number, number, number];
  /** 1 = jernih, makin besar makin keruh */
  clarity: number;
  waterLight: number;
  foam: number;
  glint: number;
  caustic: number;
}

export const ENVIRONMENTS: Record<EnvKey, EnvDef> = {
  day: {
    label: 'Siang Tropis',
    icon: '☀️',
    skyTop: '#2b7bd0',
    fog: '#c3e8f6',
    fogNear: 90,
    fogFar: 420,
    sunColor: '#fff4e0',
    sunIntensity: 2.8,
    sunPos: [38, 58, 26],
    hemiSky: '#d9f3ff',
    hemiGround: '#6f7f7a',
    hemiIntensity: 1.15,
    waveAmp: 1,
    rock: 1,
    windowGlow: 0,
    cloud: '#ffffff',
    smoke: '#ededed',
    waterShallow: '#3ddbd0',
    waterDeep: '#0a4f9c',
    absorb: [0.4, 0.072, 0.048],
    clarity: 1,
    waterLight: 1,
    foam: 0.22,
    glint: 1,
    caustic: 1.7,
  },
  sunset: {
    label: 'Senja',
    icon: '🌅',
    skyTop: '#4e4f97',
    fog: '#f5b17c',
    fogNear: 70,
    fogFar: 360,
    sunColor: '#ffb070',
    sunIntensity: 2.5,
    sunPos: [-55, 15, 30],
    hemiSky: '#ffd3a8',
    hemiGround: '#4a3b4f',
    hemiIntensity: 0.95,
    waveAmp: 0.9,
    rock: 0.8,
    windowGlow: 0.7,
    cloud: '#ffc6a0',
    smoke: '#d9c3b8',
    waterShallow: '#3aa9b6',
    waterDeep: '#183c75',
    absorb: [0.42, 0.08, 0.055],
    clarity: 1.1,
    waterLight: 0.62,
    foam: 0.22,
    glint: 1.4,
    caustic: 0.9,
  },
  night: {
    label: 'Malam',
    icon: '🌙',
    skyTop: '#040817',
    fog: '#16233f',
    fogNear: 50,
    fogFar: 290,
    sunColor: '#a8bcff',
    sunIntensity: 0.75,
    sunPos: [-30, 48, -24],
    hemiSky: '#33477a',
    hemiGround: '#0b0f1a',
    hemiIntensity: 0.6,
    waveAmp: 0.8,
    rock: 0.7,
    windowGlow: 1.8,
    cloud: '#3c4a6e',
    smoke: '#7c869c',
    waterShallow: '#0f5a74',
    waterDeep: '#031733',
    absorb: [0.42, 0.08, 0.055],
    clarity: 1.15,
    waterLight: 0.17,
    foam: 0.2,
    glint: 0.9,
    caustic: 0.35,
  },
  storm: {
    label: 'Badai',
    icon: '⛈️',
    skyTop: '#36414b',
    fog: '#6c7a84',
    fogNear: 18,
    fogFar: 170,
    sunColor: '#c9d4dc',
    sunIntensity: 0.95,
    sunPos: [20, 42, -30],
    hemiSky: '#a7b4bd',
    hemiGround: '#2c3338',
    hemiIntensity: 0.85,
    waveAmp: 2.8,
    rock: 3,
    windowGlow: 0.55,
    cloud: '#59646e',
    smoke: '#50565b',
    waterShallow: '#336f6c',
    waterDeep: '#14313b',
    absorb: [0.45, 0.1, 0.08],
    clarity: 3.2,
    waterLight: 0.42,
    foam: 1,
    glint: 0.25,
    caustic: 0.12,
  },
};

export interface CameraPreset {
  key: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}
