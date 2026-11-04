import * as THREE from 'three';
import type { MatchState } from '../assets/common';

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

function fitText(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number) {
  let s = size;
  ctx.font = FONT(s);
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = FONT(s);
  }
  return s;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Rumput dengan pola potong kotak-kotak (abu terang, diwarnai via material). */
export function createGrassTexture() {
  const W = 1024;
  const H = 702;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const bx = 18;
  for (let i = 0; i < bx; i++) {
    if (i % 2) {
      ctx.fillStyle = 'rgba(40,60,30,0.11)';
      ctx.fillRect((i * W) / bx, 0, W / bx + 1, H);
    }
  }
  const bz = 10;
  for (let j = 0; j < bz; j++) {
    if (j % 2) {
      ctx.fillStyle = 'rgba(40,60,30,0.05)';
      ctx.fillRect(0, (j * H) / bz, W, H / bz + 1);
    }
  }
  const r = rng(99);
  for (let k = 0; k < 9000; k++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,240,0.10)' : 'rgba(20,40,10,0.08)';
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, 'PitchGrass');
}

/** Paving promenade (4×4 ubin per tile). */
export function createPavingTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#9b958a';
  ctx.fillRect(0, 0, S, S);
  const r = rng(7);
  const n = 4;
  const g = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 214 + Math.floor(r() * 30);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      ctx.fillRect(x * g + 2, y * g + 2, g - 4, g - 4);
    }
  }
  return tex(c, 'Paving', true);
}

/** Jaring gawang (transparan, untuk alphaTest). */
export function createNetTexture() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(S, S);
  ctx.moveTo(S, 0);
  ctx.lineTo(0, S);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, S, S);
  return tex(c, 'GoalNet', true);
}

/** Strip iklan LED (4 sponsor fiktif). */
export function createAdTexture() {
  const W = 2048;
  const H = 128;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'AdBoards', true);
  const ads: [string, string, string][] = [
    ['#e63946', '#ffffff', 'WOBBLY COLA'],
    ['#ffd166', '#5a2d0c', 'JELLY BURGER'],
    ['#118ab2', '#ffffff', 'BEEF CITY FC'],
    ['#06d6a0', '#073b4c', 'ES KELAPA MUDA'],
  ];
  const draw = () => {
    const seg = W / ads.length;
    ads.forEach(([bg, fg, text], i) => {
      ctx.fillStyle = bg;
      ctx.fillRect(i * seg, 0, seg, H);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(i * seg, 0, seg, 10);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, text, 78, seg * 0.82);
      ctx.fillText(text, i * seg + seg / 2, H / 2 + 4);
      ctx.beginPath();
      ctx.arc(i * seg + 14, H / 2, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    t.needsUpdate = true;
  };
  draw();
  return { texture: t, draw };
}

/** Teks fasia atap (putih transparan). */
export function createFasciaTexture() {
  const W = 2048;
  const H = 128;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'RoofFascia');
  const draw = (name: string) => {
    ctx.clearRect(0, 0, W, H);
    const text = `★ ${name.toUpperCase()} ★ BEEF CITY ★ ${name.toUpperCase()} ★`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, text, 96, W * 0.96);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(20,24,40,0.45)';
    ctx.strokeText(text, W / 2, H / 2 + 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, H / 2 + 4);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

/** Lambang klub bundar. */
export function createCrestTexture() {
  const S = 512;
  const { c, ctx } = canvas(S, S);
  const t = tex(c, 'StadiumCrest');
  const draw = (name: string, main: string, accent: string) => {
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(256, 256, 246, 0, Math.PI * 2);
    ctx.fillStyle = '#1d2b53';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(256, 256, 222, 0, Math.PI * 2);
    ctx.fillStyle = main;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(256, 256, 150, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e7';
    ctx.fill();
    // bola
    ctx.beginPath();
    ctx.arc(256, 250, 92, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1d2b53';
    ctx.stroke();
    ctx.fillStyle = '#1d2b53';
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      const x = 256 + Math.cos(a) * 34;
      const y = 250 + Math.sin(a) * 34;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // mata beast di bola
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(232, 300, 9, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(280, 300, 9, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = name.toUpperCase().split(/\s+/).slice(0, 2);
    fitText(ctx, words[0] ?? 'JELLY', 64, 300);
    ctx.save();
    ctx.translate(256, 256);
    // teks melengkung sederhana di atas & bawah
    ctx.fillText(words[0] ?? 'JELLY', 0, -185);
    fitText(ctx, words[1] ?? 'ARENA', 56, 260);
    ctx.fillText(words[1] ?? 'ARENA', 0, 188);
    ctx.restore();
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

export function createAwningTexture() {
  const { c, ctx } = canvas(128, 32);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ef476f';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  return tex(c, 'KioskAwning', true);
}

/** Atlas papan nama 3 kios (dibagi vertikal). */
export function createKioskSignTexture() {
  const W = 512;
  const H = 384;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'KioskSigns');
  const signs: [string, string, string][] = [
    ['#ffd166', '#5a2d0c', '🍔 JELLY BURGER'],
    ['#06d6a0', '#073b4c', '🥥 ES KELAPA'],
    ['#ef476f', '#ffffff', '🥤 WOBBLY COLA'],
  ];
  const draw = () => {
    signs.forEach(([bg, fg, text], i) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, i * 128, W, 128);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, text, 60, W * 0.9);
      ctx.fillText(text, W / 2, i * 128 + 68);
    });
    t.needsUpdate = true;
  };
  draw();
  return { texture: t, draw };
}

/** Layar raksasa dinamis: skor, jam, "GOOOL!". */
export function createJumbotron() {
  const W = 1024;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'Jumbotron');
  let title = 'JELLY ARENA';
  const draw = (m: MatchState, time: number) => {
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, W, H);
    // bar skor
    ctx.fillStyle = '#1b2a5c';
    ctx.fillRect(0, 0, W, 120);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(28, 30, 60, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(54);
    ctx.fillText('JELLY FC', 104, 62);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4dabf7';
    ctx.fillRect(W - 88, 30, 60, 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BEEF UTD', W - 104, 62);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = FONT(76);
    ctx.fillText(`${m.home} - ${m.away}`, W / 2, 64);
    if (m.flash > 0) {
      const on = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ffd23f' : '#ff5d8f';
      ctx.font = FONT(170);
      ctx.fillText('GOOOL!', W / 2, 290);
      ctx.font = FONT(44);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🎉 ⚽ 🎉', W / 2, 420);
    } else {
      // wajah beast piksel
      const bob = Math.sin(time * 3) * 8;
      ctx.fillStyle = '#ff7a3d';
      ctx.beginPath();
      ctx.ellipse(250, 300 + bob, 95, 120, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2b53';
      ctx.beginPath();
      ctx.ellipse(220, 270 + bob, 13, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(280, 270 + bob, 13, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1d2b53';
      ctx.beginPath();
      ctx.arc(250, 315 + bob, 30, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.font = FONT(64);
      ctx.fillText('AYO JELLY!', 400, 260);
      ctx.font = FONT(40, 500);
      ctx.fillStyle = '#9fb3ff';
      ctx.fillText(title, 404, 330);
    }
    // jam
    const mm = Math.floor(m.clock / 60) % 100;
    const ss = Math.floor(m.clock % 60);
    ctx.fillStyle = '#000000';
    ctx.fillRect(W / 2 - 110, H - 78, 220, 60);
    ctx.fillStyle = '#7CFC9A';
    ctx.textAlign = 'center';
    ctx.font = FONT(46);
    ctx.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, W / 2, H - 46);
    // garis scan
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    t.needsUpdate = true;
  };
  const setTitle = (s: string) => {
    title = s.toUpperCase();
  };
  return { texture: t, draw, setTitle };
}
