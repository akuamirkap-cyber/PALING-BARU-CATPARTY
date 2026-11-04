import * as THREE from 'three';
import { LANE_COUNT } from './dims';

export type BowlingColorKey = 'lane' | 'carpet' | 'walls' | 'seats' | 'capping' | 'neonA' | 'neonB';
export type BowlingScheme = Record<BowlingColorKey, string>;

export const BOWLING_COLOR_LABELS: Record<BowlingColorKey, string> = {
  lane: 'Kayu Lintasan',
  carpet: 'Karpet',
  walls: 'Dinding',
  seats: 'Sofa Pemain',
  capping: 'Capping & Ball Return',
  neonA: 'Neon Utama',
  neonB: 'Neon Kedua',
};

export const BOWLING_PRESETS: { id: string; name: string; colors: BowlingScheme }[] = [
  {
    id: 'kosmik',
    name: 'Retro Kosmik',
    colors: { lane: '#ffffff', carpet: '#ffffff', walls: '#2b2357', seats: '#ff4f9a', capping: '#262b48', neonA: '#ff3fd2', neonB: '#2de2ff' },
  },
  {
    id: 'jelly',
    name: 'Jelly Pop',
    colors: { lane: '#fff3e0', carpet: '#ffd1f0', walls: '#ff9e5e', seats: '#3fc1c9', capping: '#ff6b6b', neonA: '#ffd23f', neonB: '#ff5d8f' },
  },
  {
    id: 'klasik',
    name: 'Klasik 70-an',
    colors: { lane: '#ffe2bd', carpet: '#d9a66b', walls: '#7a3b1e', seats: '#e8a33d', capping: '#3d2a1e', neonA: '#ff7b2e', neonB: '#ffd23f' },
  },
  {
    id: 'neon',
    name: 'Neon Malam',
    colors: { lane: '#e9f0ff', carpet: '#9fb4ff', walls: '#0d1030', seats: '#7b2ff7', capping: '#14183a', neonA: '#00f5d4', neonB: '#f15bb5' },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: { lane: '#fff8f0', carpet: '#fff0fa', walls: '#bde0fe', seats: '#ffafcc', capping: '#a2d2ff', neonA: '#cdb4db', neonB: '#ffc8dd' },
  },
];

export interface BowlingTex {
  wood: THREE.Texture;
  carpet: THREE.Texture;
  masking: THREE.Texture;
  neon: THREE.Texture;
  mural: THREE.Texture;
  monitors: THREE.Texture[];
  console: THREE.Texture;
  menu: THREE.Texture;
  arcade: THREE.Texture[];
  snack: THREE.Texture;
}

export interface LaneMirrorUniforms {
  tMirror: { value: THREE.Texture | null };
  uMirrorMatrix: { value: THREE.Matrix4 };
  uMirrorOn: { value: number };
  uMirrorStrength: { value: number };
}

export function createBowlingMaterials(c: BowlingScheme, t: BowlingTex) {
  const std = (name: string, color: THREE.ColorRepresentation, p: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...p });
    m.name = name;
    return m;
  };
  const glow = (name: string, color: string, intensity: number, p: THREE.MeshStandardMaterialParameters = {}) =>
    std(name, '#000000', { emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...p });

  // Lantai kayu mengkilap + refleksi planar realtime (bayangan pin terlihat di lintasan)
  const laneMirror: LaneMirrorUniforms = {
    tMirror: { value: null },
    uMirrorMatrix: { value: new THREE.Matrix4() },
    uMirrorOn: { value: 0 },
    uMirrorStrength: { value: 1 },
  };
  const laneWood = std('Lane_Wood', c.lane, { map: t.wood, roughness: 0.2, envMapIntensity: 0.6 });
  laneWood.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, laneMirror);
    shader.vertexShader =
      'uniform mat4 uMirrorMatrix;\nvarying vec4 vMirrorCoord;\nvarying vec3 vLaneWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 lwp = modelMatrix * vec4(transformed, 1.0);
        vLaneWorld = lwp.xyz;
        vMirrorCoord = uMirrorMatrix * lwp;`,
      );
    shader.fragmentShader =
      'uniform sampler2D tMirror;\nuniform float uMirrorOn;\nuniform float uMirrorStrength;\nvarying vec4 vMirrorCoord;\nvarying vec3 vLaneWorld;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `if (uMirrorOn > 0.5) {
          vec2 muv = vMirrorCoord.xy / vMirrorCoord.w;
          vec3 Vd = normalize(cameraPosition - vLaneWorld);
          float fres = 0.05 + 0.95 * pow(1.0 - clamp(Vd.y, 0.0, 1.0), 4.0);
          vec3 refl = texture2D(tMirror, muv, 1.2).rgb;
          outgoingLight += min(refl, vec3(1.6)) * mix(0.07, 0.5, fres) * uMirrorStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  laneWood.customProgramCacheKey = () => 'lane-mirror-v1';

  const laneLeds = Array.from({ length: LANE_COUNT }, (_, i) => glow(`Lane_LED_${i + 1}`, i % 2 ? c.neonB : c.neonA, 1.6));

  return {
    laneMirror,
    laneWood,
    markings: std('Lane_Arrows', '#6a2215', { roughness: 0.3, emissive: '#ff3fd2', emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    dots: std('Lane_Dots', '#2b1a10', { roughness: 0.3, emissive: '#2de2ff', emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    foul: std('Foul_Line', '#141414', { roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    gutter: std('Gutter', '#1c1f2b', { roughness: 0.25, metalness: 0.5, side: THREE.DoubleSide }),
    capping: std('Capping', c.capping, { roughness: 0.35, metalness: 0.2 }),
    laneLeds,
    kickback: std('Kickback', '#22263a', { roughness: 0.4 }),
    pit: std('Pit', '#08080c', { roughness: 1 }),
    curtain: std('Pit_Curtain', '#0d0d12', { roughness: 1 }),
    masking: std('Masking_Art', '#ffffff', { map: t.masking, emissive: '#ffffff', emissiveMap: t.masking, emissiveIntensity: 0.35, roughness: 0.5 }),
    soffit: std('Soffit', '#120f24', { roughness: 0.9 }),
    neonSign: std('Neon_Sign', '#ffffff', { map: t.neon, transparent: true, emissive: c.neonA, emissiveMap: t.neon, emissiveIntensity: 2.6, depthWrite: false }),
    neonA: glow('Neon_A', c.neonA, 2.2),
    neonB: glow('Neon_B', c.neonB, 2.2),
    pinLight: glow('Pin_Light', '#fff6dc', 0.8),
    machine: std('Pinsetter', '#2a2d35', { roughness: 0.5, metalness: 0.6 }),
    carpet: std('Carpet', c.carpet, { map: t.carpet, emissive: '#ffffff', emissiveMap: t.carpet, emissiveIntensity: 0.06, roughness: 0.95 }),
    floorDark: std('Floor_Service', '#1a1a22', { roughness: 0.9 }),
    concourse: std('Concourse_Floor', '#2c3e50', { roughness: 0.35, metalness: 0.1 }),
    walls: std('Wall_Paint', c.walls, { roughness: 0.85 }),
    wainscot: std('Wall_Lower', '#151229', { roughness: 0.6 }),
    mural: std('Wall_Mural', '#ffffff', { map: t.mural, roughness: 0.7, emissive: '#ffffff', emissiveMap: t.mural, emissiveIntensity: 0.12 }),
    ceiling: std('Ceiling', '#16142a', { roughness: 0.95, side: THREE.FrontSide }),
    ceilingLight: glow('Ceiling_Light', '#fff4e0', 1.8),
    blacklight: glow('Blacklight', '#8b3dff', 0.2),
    seat: std('Settee_Cushion', c.seats, { roughness: 0.55 }),
    chrome: std('Chrome', '#d9dde3', { roughness: 0.15, metalness: 1 }),
    tableTop: std('Table_Top', '#f4f1ea', { roughness: 0.3 }),
    console: std('Console_Body', '#23263a', { roughness: 0.4, metalness: 0.3 }),
    consoleScreen: std('Console_Screen', '#ffffff', { map: t.console, emissive: '#ffffff', emissiveMap: t.console, emissiveIntensity: 0.9 }),
    monitorFrame: std('Monitor_Frame', '#15171d', { roughness: 0.4, metalness: 0.4 }),
    monitorScreens: t.monitors.map((m, i) => std(`Monitor_Screen_${i + 1}`, '#ffffff', { map: m, emissive: '#ffffff', emissiveMap: m, emissiveIntensity: 1.0, roughness: 0.3 })),
    ballReturn: std('Ball_Return', c.capping, { roughness: 0.3, metalness: 0.25 }),
    rackBalls: std('Rack_Balls', '#ffffff', { vertexColors: true, roughness: 0.12, metalness: 0.1 }),
    counter: std('Counter', '#ff5d8f', { roughness: 0.5 }),
    counterTop: std('Counter_Top', '#f4f1ea', { roughness: 0.25 }),
    menu: std('Menu_Board', '#ffffff', { map: t.menu, emissive: '#ffffff', emissiveMap: t.menu, emissiveIntensity: 0.8 }),
    snackSign: std('Snack_Sign', '#ffffff', { map: t.snack, transparent: true, emissive: c.neonB, emissiveMap: t.snack, emissiveIntensity: 2.4, depthWrite: false }),
    arcadeBody: std('Arcade_Cabinet', '#3a2a7a', { roughness: 0.4 }),
    arcadeScreens: t.arcade.map((a, i) => std(`Arcade_Screen_${i + 1}`, '#ffffff', { map: a, emissive: '#ffffff', emissiveMap: a, emissiveIntensity: 1.2 })),
    glass: std('Glass', '#bfe8ff', { transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }),
    plush: std('Plush', '#ffffff', { vertexColors: true, roughness: 0.9 }),
    pillar: std('Pillar', '#1d1a33', { roughness: 0.6 }),
    disco: std('Disco_Mirror', '#e9edf5', { roughness: 0.05, metalness: 1, flatShading: true }),
    wood: std('Wood_Bench', '#b07a46', { roughness: 0.7 }),
  };
}

export type BowlingMaterials = ReturnType<typeof createBowlingMaterials>;

export function applyBowlingScheme(m: BowlingMaterials, c: BowlingScheme) {
  m.laneWood.color.set(c.lane);
  m.carpet.color.set(c.carpet);
  m.walls.color.set(c.walls);
  m.seat.color.set(c.seats);
  m.capping.color.set(c.capping);
  m.ballReturn.color.set(c.capping);
  m.neonA.emissive.set(c.neonA);
  m.neonB.emissive.set(c.neonB);
  m.neonSign.emissive.set(c.neonA);
  m.snackSign.emissive.set(c.neonB);
  m.laneLeds.forEach((l, i) => l.emissive.set(i % 2 ? c.neonB : c.neonA));
}
