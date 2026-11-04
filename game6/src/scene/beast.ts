import * as THREE from 'three';

export type HatKind = 'none' | 'captain' | 'party' | 'sailor';

export interface BeastRig {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  dispose: () => void;
}

let shared: {
  torso: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  eyeMat: THREE.MeshStandardMaterial;
} | null = null;

function getShared() {
  if (!shared) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.25 });
    eyeMat.name = 'Beast_Eyes';
    shared = {
      torso: new THREE.CapsuleGeometry(0.34, 0.42, 8, 18),
      eye: new THREE.SphereGeometry(0.055, 12, 8),
      arm: new THREE.CapsuleGeometry(0.1, 0.3, 6, 10),
      leg: new THREE.CapsuleGeometry(0.12, 0.12, 6, 10),
      eyeMat,
    };
  }
  return shared;
}

export const BEAST_COLORS = [
  '#ff6b6b',
  '#4dabf7',
  '#ffd43b',
  '#69db7c',
  '#f783ac',
  '#b197fc',
  '#ffa94d',
  '#63e6be',
  '#f8f9fa',
  '#ff8787',
  '#74c0fc',
];

export function randomBeastColor() {
  return BEAST_COLORS[Math.floor(Math.random() * BEAST_COLORS.length)];
}

/** Membuat karakter "beast" jelly (tinggi ±1.35 m). Menghadap +Z. */
export function createBeast(color: string, hat: HatKind = 'none'): BeastRig {
  const S = getShared();
  const owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  const skin = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
  });
  skin.name = 'Beast_Skin';
  owned.push(skin);

  const root = new THREE.Group();
  root.name = 'GangBeast';
  const body = new THREE.Group();
  body.name = 'Body';
  body.position.y = 0.3;
  root.add(body);

  const torso = new THREE.Mesh(S.torso, skin);
  torso.name = 'Beast_Torso';
  torso.position.y = 0.52;
  body.add(torso);

  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(S.eye, S.eyeMat);
    e.name = 'Beast_Eye';
    e.position.set(s * 0.11, 0.84, 0.3);
    e.scale.set(0.85, 1.35, 0.6);
    body.add(e);
  }

  const mkArm = (s: number) => {
    const pivot = new THREE.Group();
    pivot.name = s > 0 ? 'Arm_R' : 'Arm_L';
    pivot.position.set(s * 0.37, 0.62, 0);
    const m = new THREE.Mesh(S.arm, skin);
    m.name = 'Beast_Arm';
    m.position.y = -0.24;
    pivot.add(m);
    pivot.rotation.z = s * 0.28;
    body.add(pivot);
    return pivot;
  };
  const mkLeg = (s: number) => {
    const pivot = new THREE.Group();
    pivot.name = s > 0 ? 'Leg_R' : 'Leg_L';
    pivot.position.set(s * 0.15, 0.34, 0);
    const m = new THREE.Mesh(S.leg, skin);
    m.name = 'Beast_Leg';
    m.position.y = -0.16;
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const std = (c: string, name: string) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
    m.name = name;
    owned.push(m);
    return m;
  };
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name: string) => {
    owned.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.name = name;
    body.add(m);
    return m;
  };

  if (hat === 'captain') {
    const white = std('#fbfbf8', 'Hat_White');
    const black = std('#1b1d26', 'Hat_Black');
    const gold = std('#f2c14e', 'Hat_Gold');
    addMesh(new THREE.CylinderGeometry(0.27, 0.22, 0.16, 22), white, 0, 1.12, 0, 'Hat_Crown');
    addMesh(new THREE.CylinderGeometry(0.225, 0.225, 0.06, 22), black, 0, 1.04, 0, 'Hat_Band');
    const visor = addMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 18, 1, false, -Math.PI / 2, Math.PI), black, 0, 1.0, 0.1, 'Hat_Visor');
    visor.rotation.x = 0.15;
    addMesh(new THREE.SphereGeometry(0.045, 10, 8), gold, 0, 1.1, 0.25, 'Hat_Badge');
  } else if (hat === 'party') {
    const pink = std('#ff5d8f', 'Hat_Party');
    const yellow = std('#ffd43b', 'Hat_Pompom');
    const cone = addMesh(new THREE.ConeGeometry(0.15, 0.38, 14), pink, 0.04, 1.22, 0, 'Hat_Cone');
    cone.rotation.z = -0.18;
    addMesh(new THREE.SphereGeometry(0.06, 10, 8), yellow, 0.075, 1.42, 0, 'Hat_Pompom');
  } else if (hat === 'sailor') {
    const white = std('#ffffff', 'Hat_Sailor');
    const navy = std('#23395b', 'Hat_Ribbon');
    addMesh(new THREE.CylinderGeometry(0.26, 0.21, 0.12, 20), white, 0, 1.08, 0, 'Hat_Sailor');
    addMesh(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 20), navy, 0, 1.03, 0, 'Hat_Ribbon');
  }

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });

  return {
    root,
    body,
    armL,
    armR,
    legL,
    legR,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

export type BeastMode = 'idle' | 'dance' | 'punch' | 'wave' | 'walk' | 'swim' | 'slide' | 'fall';

/** Animasi prosedural ala jelly — goyang, tinju, joget, renang. */
export function animateBeast(rig: BeastRig, mode: BeastMode, t: number) {
  const { body, armL, armR, legL, legR } = rig;
  let sq = Math.sin(t * 3.2) * 0.035;
  body.rotation.set(0, 0, 0);
  body.position.y = 0.3;
  armL.rotation.set(0, 0, -0.28);
  armR.rotation.set(0, 0, 0.28);
  legL.rotation.set(0, 0, 0);
  legR.rotation.set(0, 0, 0);
  switch (mode) {
    case 'idle': {
      body.rotation.z = Math.sin(t * 1.3) * 0.06;
      armL.rotation.x = Math.sin(t * 2) * 0.2;
      armR.rotation.x = -Math.sin(t * 2) * 0.2;
      break;
    }
    case 'dance': {
      const b = Math.abs(Math.sin(t * 4));
      body.position.y = 0.3 + b * 0.18;
      sq = (b - 0.5) * 0.1;
      body.rotation.z = Math.sin(t * 4) * 0.18;
      armL.rotation.z = -2.5 - Math.sin(t * 8) * 0.35;
      armR.rotation.z = 2.5 + Math.sin(t * 8 + 1) * 0.35;
      legL.rotation.x = Math.sin(t * 8) * 0.3;
      legR.rotation.x = -Math.sin(t * 8) * 0.3;
      break;
    }
    case 'punch': {
      const p1 = Math.max(0, Math.sin(t * 6));
      const p2 = Math.max(0, Math.sin(t * 6 + Math.PI));
      armR.rotation.x = -1.55 * p1;
      armL.rotation.x = -1.55 * p2;
      armR.rotation.z = 0.15;
      armL.rotation.z = -0.15;
      body.rotation.x = 0.12 + (p1 + p2) * 0.08;
      body.rotation.y = (p1 - p2) * 0.35;
      sq = Math.sin(t * 12) * 0.03;
      legL.rotation.x = Math.sin(t * 3) * 0.15;
      legR.rotation.x = -Math.sin(t * 3) * 0.15;
      break;
    }
    case 'wave': {
      armR.rotation.z = 2.6 + Math.sin(t * 7) * 0.4;
      body.rotation.z = Math.sin(t * 1.5) * 0.05;
      break;
    }
    case 'walk': {
      const w = Math.sin(t * 7);
      legL.rotation.x = w * 0.6;
      legR.rotation.x = -w * 0.6;
      armL.rotation.x = -w * 0.5;
      armR.rotation.x = w * 0.5;
      body.position.y = 0.3 + Math.abs(Math.cos(t * 7)) * 0.06;
      body.rotation.z = w * 0.06;
      break;
    }
    case 'swim': {
      armL.rotation.z = -1.5 - Math.sin(t * 5) * 0.6;
      armR.rotation.z = 1.5 + Math.sin(t * 5 + Math.PI) * 0.6;
      body.rotation.z = Math.sin(t * 2) * 0.08;
      break;
    }
    case 'slide': {
      armL.rotation.z = -2.7 + Math.sin(t * 9) * 0.2;
      armR.rotation.z = 2.7 - Math.sin(t * 9) * 0.2;
      body.rotation.x = -0.35;
      legL.rotation.x = -0.9;
      legR.rotation.x = -0.9;
      break;
    }
    case 'fall': {
      armL.rotation.z = -2.0 - Math.sin(t * 14) * 0.8;
      armR.rotation.z = 2.0 + Math.cos(t * 13) * 0.8;
      legL.rotation.x = Math.sin(t * 12) * 0.7;
      legR.rotation.x = -Math.sin(t * 12) * 0.7;
      sq = Math.sin(t * 10) * 0.06;
      break;
    }
  }
  body.scale.set(1 + sq, 1 - sq * 1.6, 1 + sq);
}
