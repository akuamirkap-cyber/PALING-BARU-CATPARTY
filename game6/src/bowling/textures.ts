import * as THREE from 'three';
import { HALL, LANE_COUNT, laneZ } from './dims';
import type { FrameView } from './scoring';

const FONT = (sz: number, w = 700) => `${w} ${sz}px Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') as CanvasRenderingContext2D };
}
function tex(c: HTMLCanvasElement, name: string, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.name = name;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function fit(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, w = 700) {
  let s = size;
  ctx.font = FONT(s, w);
  while (ctx.measureText(text).width > maxW && s > 8) {
    s -= 2;
    ctx.font = FONT(s, w);
  }
  return s;
}

/** Kayu lintasan: 39 papan maple (u = panjang, v = lebar). */
export function createWoodTexture() {
  const W = 1024;
  const H = 312;
  const { c, ctx } = canvas(W, H);
  const r = rng(5);
  const bh = H / 39;
  for (let b = 0; b < 39; b++) {
    const y = b * bh;
    const base = 222 + Math.floor(r() * 26);
    ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.8)},${Math.floor(base * 0.56)})`;
    ctx.fillRect(0, y, W, bh + 1);
    for (let g = 0; g < 7; g++) {
      ctx.strokeStyle = `rgba(${120 + r() * 40},${70 + r() * 30},30,${0.08 + r() * 0.1})`;
      ctx.lineWidth = 0.6 + r();
      const gy = y + r() * bh;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= W; x += 64) ctx.lineTo(x, gy + Math.sin(x * 0.01 + b) * 0.8 * r());
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(90,50,20,0.35)';
    ctx.fillRect(0, y, W, 1);
  }
  const t = tex(c, 'LaneWood', true);
  return t;
}

/** Karpet kosmik retro (glow saat cosmic bowling). */
export function createCarpetTexture() {
  const S = 512;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#1a1033';
  ctx.fillRect(0, 0, S, S);
  const r = rng(21);
  const cols = ['#ff4fd8', '#29e7ff', '#ffe14d', '#6dff7a', '#ff8a3d', '#b07cff'];
  const pick = () => cols[Math.floor(r() * cols.length)];
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.fillRect(r() * S, r() * S, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * S;
    const y = r() * S;
    const k = r();
    ctx.strokeStyle = pick();
    ctx.fillStyle = pick();
    ctx.lineWidth = 5;
    if (k < 0.25) {
      ctx.beginPath();
      ctx.arc(x, y, 10 + r() * 16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (k < 0.45) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 1; j < 6; j++) ctx.lineTo(x + j * 12, y + (j % 2 ? -10 : 10));
      ctx.stroke();
    } else if (k < 0.62) {
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x + 13, y + 10);
      ctx.lineTo(x - 13, y + 10);
      ctx.closePath();
      ctx.stroke();
    } else if (k < 0.8) {
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = j % 2 ? 6 : 14;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 20, y);
      ctx.bezierCurveTo(x - 8, y - 18, x + 8, y + 18, x + 20, y);
      ctx.stroke();
    }
  }
  const t = tex(c, 'CosmicCarpet', true);
  return t;
}

/** Mural masking unit (di atas pin) + nomor lintasan 1–6. */
export function createMaskingTexture() {
  const W = 2048;
  const H = 360;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'MaskingMural');
  const draw = (name: string) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120a3a');
    g.addColorStop(1, '#3b1670');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = rng(9);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      const s = r() < 0.9 ? 2 : 4;
      ctx.fillRect(r() * W, r() * H, s, s);
    }
    // planet bercincin & komet
    const planet = (x: number, y: number, rad: number, col: string, ring: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(x, y, rad * 1.8, rad * 0.45, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    };
    planet(140, 110, 46, '#ff8a3d', '#ffe14d');
    planet(1900, 250, 60, '#29e7ff', '#ff4fd8');
    planet(1010, 70, 26, '#6dff7a', '#b07cff');
    // pin & bola terbang
    const pinIcon = (x: number, y: number, s: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.fillStyle = '#fbfaf6';
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.bezierCurveTo(14, -40, 12, -18, 7, -12);
      ctx.bezierCurveTo(22, 2, 20, 30, 10, 40);
      ctx.lineTo(-10, 40);
      ctx.bezierCurveTo(-20, 30, -22, 2, -7, -12);
      ctx.bezierCurveTo(-12, -18, -14, -40, 0, -40);
      ctx.fill();
      ctx.fillStyle = '#d0202a';
      ctx.fillRect(-7, -16, 14, 3);
      ctx.fillRect(-7, -10, 14, 3);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-4, -28, 2.6, 0, Math.PI * 2);
      ctx.arc(4, -28, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    pinIcon(330, 270, 1.3, -0.4);
    pinIcon(700, 90, 1.0, 0.6);
    pinIcon(1360, 260, 1.2, -0.8);
    pinIcon(1700, 80, 1.0, 0.3);
    // nama arena
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // nomor lintasan (u = (z − z0) / lebar)
    const z0 = -5.4;
    const span = 10.8;
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = ((laneZ(i) - z0) / span) * W;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(x, H - 92, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = i % 2 ? '#29e7ff' : '#ff4fd8';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = FONT(86);
      ctx.fillText(String(i + 1), x, H - 86);
    }
    ctx.fillStyle = '#ffe14d';
    fit(ctx, name.toUpperCase(), 64, 700);
    ctx.fillText(`★ ${name.toUpperCase()} ★`, W / 2, 62);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

/** Tulisan neon (transparan, putih — warna dari emissive material). */
export function createNeonTexture(w = 1024, h = 256) {
  const { c, ctx } = canvas(w, h);
  const t = tex(c, 'NeonSign');
  const draw = (text: string, sub?: string) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const main = text.toUpperCase();
    const size = fit(ctx, main, sub ? h * 0.5 : h * 0.66, w * 0.92);
    const y = sub ? h * 0.4 : h * 0.52;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 26;
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(main, w / 2, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(main, w / 2, y);
    if (sub) {
      fit(ctx, sub, h * 0.22, w * 0.8, 600);
      ctx.fillText(sub, w / 2, h * 0.82);
    }
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

/** Mural dinding depan (logo + beast bowling). */
export function createWallMural() {
  const W = 1024;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'WallMural');
  const draw = (name: string) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ff4fd8');
    g.addColorStop(0.5, '#7b2ff7');
    g.addColorStop(1, '#29e7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(W / 2, H * 1.25, 120 + i * 70, Math.PI, Math.PI * 2);
      ctx.lineWidth = 18;
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
    }
    // beast melempar bola
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(220, 330, 95, 125, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1f2430';
    ctx.stroke();
    ctx.fillStyle = '#1f2430';
    ctx.beginPath();
    ctx.ellipse(200, 290, 12, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(250, 286, 12, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(228, 330, 26, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#2d1b69';
    ctx.beginPath();
    ctx.arc(360, 420, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(345, 400, 7, 0, Math.PI * 2);
    ctx.arc(368, 396, 7, 0, Math.PI * 2);
    ctx.arc(358, 422, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1f2430';
    const nm = name.toUpperCase();
    fit(ctx, nm, 120, 560);
    ctx.strokeText(nm, 680, 210);
    ctx.fillText(nm, 680, 210);
    ctx.font = FONT(44, 600);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText('EST. BEEF CITY · 6 LANES', 680, 320);
    ctx.font = FONT(36, 600);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🎳 STRIKE • SPARE • WOBBLE 🎳', 680, 390);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

export interface MonitorLane {
  num: number;
  name: string;
  frames: FrameView[];
  total: number;
  active: boolean;
}

/** Layar skor di atas lintasan (2 lintasan per layar) + banner STRIKE. */
export function createMonitor(name: string) {
  const W = 1024;
  const H = 576;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, name);
  const draw = (a: MonitorLane, b: MonitorLane, banner: { text: string; color: string } | null, time: number) => {
    ctx.fillStyle = '#0a0f2a';
    ctx.fillRect(0, 0, W, H);
    const row = (L: MonitorLane, y0: number) => {
      ctx.fillStyle = L.active ? '#1b2a6b' : '#141a3d';
      ctx.fillRect(12, y0, W - 24, 260);
      ctx.fillStyle = L.num % 2 ? '#ff4fd8' : '#29e7ff';
      ctx.fillRect(12, y0, 120, 260);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = FONT(96);
      ctx.fillText(String(L.num), 72, y0 + 120);
      ctx.font = FONT(26, 600);
      ctx.fillText('LANE', 72, y0 + 200);
      ctx.textAlign = 'left';
      ctx.font = FONT(40);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(L.name.toUpperCase(), 150, y0 + 40);
      const fw = 72;
      const x0 = 150;
      for (let f = 0; f < 10; f++) {
        const x = x0 + f * fw;
        const w = f === 9 ? fw + 20 : fw;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y0 + 74, w, 160);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = FONT(20, 600);
        ctx.textAlign = 'center';
        ctx.fillText(String(f + 1), x + w / 2, y0 + 92);
        const fr = L.frames[f];
        if (!fr) continue;
        const boxes = fr.marks.length;
        fr.marks.forEach((m, k) => {
          const bw = w / boxes;
          ctx.fillStyle = m === 'X' ? '#ff4fd8' : m === '/' ? '#29e7ff' : '#ffffff';
          ctx.font = FONT(34);
          ctx.fillText(m, x + bw * k + bw / 2, y0 + 136);
        });
        if (fr.total !== null) {
          ctx.fillStyle = '#ffffff';
          ctx.font = FONT(34);
          ctx.fillText(String(fr.total), x + w / 2, y0 + 200);
        }
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe14d';
      ctx.font = FONT(30, 600);
      ctx.fillText('TOTAL', W - 70, y0 + 92);
      ctx.font = FONT(64);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(L.total), W - 70, y0 + 170);
    };
    row(a, 18);
    row(b, 298);
    if (banner) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      ctx.fillStyle = `rgba(0,0,0,0.55)`;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.06);
      ctx.scale(1 + pulse * 0.06, 1 + pulse * 0.06);
      ctx.fillStyle = banner.color;
      ctx.fillRect(-W * 0.45, -120, W * 0.9, 240);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fit(ctx, banner.text, 170, W * 0.82);
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#1f2430';
      ctx.strokeText(banner.text, 0, 8);
      ctx.fillText(banner.text, 0, 8);
      ctx.restore();
    }
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

export function createBallTexture(base: string, swirl: string, seed: number) {
  const W = 512;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.35)' : swirl;
    ctx.globalAlpha = 0.25 + r() * 0.45;
    ctx.lineWidth = 3 + r() * 14;
    const y = r() * H;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 160, W * 0.6, y + (r() - 0.5) * 160, W + 20, y + (r() - 0.5) * 60);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // lubang jari: jempol + 2 jari
  const hole = (x: number, y: number, rx: number, ry: number) => {
    const g = ctx.createRadialGradient(x, y, 1, x, y, rx);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.75, '#141414');
    g.addColorStop(1, 'rgba(60,60,60,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  hole(128, 150, 13, 16);
  hole(116, 104, 10, 12);
  hole(140, 104, 10, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = FONT(18);
  ctx.textAlign = 'center';
  ctx.fillText('JB', 384, 130);
  return tex(c, `BallSwirl_${seed}`, true);
}

export function createScreenTexture(kind: 'console' | 'arcade' | 'menu', label: string) {
  const W = kind === 'menu' ? 512 : 256;
  const H = kind === 'menu' ? 256 : 192;
  const { c, ctx } = canvas(W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'menu') {
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffe14d';
    ctx.font = FONT(44);
    ctx.fillText('SNACK BAR', W / 2, 38);
    const items = [
      ['🍔 Jelly Burger', '25K'],
      ['🍟 Kentang Goyang', '15K'],
      ['🥤 Wobbly Cola', '10K'],
      ['🍦 Es Krim Strike', '12K'],
    ];
    ctx.font = FONT(28, 600);
    items.forEach(([n, p], i) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(n, 40, 92 + i * 40);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#29e7ff';
      ctx.fillText(p, W - 40, 92 + i * 40);
    });
  } else if (kind === 'arcade') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const px = 12;
    const face = ['..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', 'XX....XX', '.XXXXXX.'];
    face.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === 'X') {
          ctx.fillStyle = label;
          ctx.fillRect(80 + x * px, 30 + y * px, px - 1, px - 1);
        }
      }),
    );
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(22);
    ctx.fillText('INSERT COIN', W / 2, 150);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2a6b');
    g.addColorStop(1, '#0a0f2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffe14d';
    ctx.font = FONT(30);
    ctx.fillText(label, W / 2, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(20, 600);
    ctx.fillText('SIAP BERMAIN 🎳', W / 2, 120);
  }
  return tex(c, `Screen_${kind}_${label}`);
}

export const HALL_W = HALL.z1 - HALL.z0;
