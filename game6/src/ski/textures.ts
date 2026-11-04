import * as THREE from 'three';

const FONT = (sz: number, w = 700) => `${w} ${sz}px Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') as CanvasRenderingContext2D };
}
function tex(c: HTMLCanvasElement, name: string, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
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

/** Salju groomed bergaris "corduroy" (u = sepanjang lintasan, v = melintang). */
export function createCorduroyTexture() {
  const W = 256;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let y = 0; y < H; y += 4) {
    const v = 236 + Math.floor(r() * 12);
    ctx.fillStyle = `rgb(${v - 6},${v - 2},${v + 6 > 255 ? 255 : v + 6})`;
    ctx.fillRect(0, y, W, 2);
  }
  for (let k = 0; k < 700; k++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(170,190,220,0.18)' : 'rgba(255,255,255,0.9)';
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  }
  // jejak ski tipis
  ctx.strokeStyle = 'rgba(150,175,215,0.22)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const y0 = r() * H;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(W * 0.3, y0 + (r() - 0.5) * 120, W * 0.7, y0 + (r() - 0.5) * 120, W, y0 + (r() - 0.5) * 40);
    ctx.stroke();
  }
  return tex(c, 'SnowCorduroy', true);
}

/** Salju alami lembut (untuk medan). */
export function createSnowTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  const r = rng(11);
  for (let k = 0; k < 90; k++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 10 + r() * 40;
    const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
    g.addColorStop(0, `rgba(200,215,240,${0.12 + r() * 0.12})`);
    g.addColorStop(1, 'rgba(200,215,240,0)');
    ctx.fillStyle = g;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
    }
  }
  for (let k = 0; k < 500; k++) {
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(r() * S, r() * S, 1, 1);
  }
  return tex(c, 'SnowSoft', true);
}

/** Jaring pengaman oranye (alpha). */
export function createNetTexture() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = -S; i <= S * 2; i += 32) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.moveTo(i, S);
    ctx.lineTo(i + S, 0);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, 10);
  return tex(c, 'SafetyNet', true, false);
}

/** Atlas spanduk sponsor (4 baris). */
export function createSponsorTexture() {
  const W = 1024;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const ads: [string, string, string, string][] = [
    ['#e63946', '#ffffff', 'WOBBLY COLA', '❄'],
    ['#1d4ed8', '#ffe14d', 'JELLY PEAK RESORT', '⛷'],
    ['#ffd23f', '#1f2430', 'BEEF CITY SKI CLUB', '🏔'],
    ['#10b981', '#ffffff', 'COKELAT PANAS', '☕'],
  ];
  ads.forEach(([bg, fg, text, ico], i) => {
    const y = (i * H) / 4;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, W, H / 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let x = -40; x < W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, y + H / 4);
      ctx.lineTo(x + 40, y);
      ctx.lineTo(x + 60, y);
      ctx.lineTo(x + 20, y + H / 4);
      ctx.fill();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fit(ctx, `${ico} ${text} ${ico}`, 84, W * 0.9);
    ctx.fillText(`${ico} ${text} ${ico}`, W / 2, y + H / 8 + 4);
  });
  return tex(c, 'SponsorBanners');
}

/** Spanduk besar START / FINISH. */
export function createBannerTexture(text: string, bg: string, fg: string) {
  const W = 1024;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, `Banner_${text}`);
  const draw = (sub: string) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, bg);
    g.addColorStop(0.5, shade(bg, 30));
    g.addColorStop(1, bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // pola kotak-kotak di tepi
    for (let x = 0; x < W; x += 32) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = ((x / 32 + k) % 2 === 0) ? '#ffffff' : '#1f2430';
        ctx.fillRect(x, k * 16, 32, 16);
        ctx.fillRect(x, H - 32 + k * 16, 32, 16);
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    fit(ctx, text, 130, W * 0.8);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1f2430';
    ctx.strokeText(text, W / 2, H / 2 - 12);
    ctx.fillStyle = fg;
    ctx.fillText(text, W / 2, H / 2 - 12);
    fit(ctx, sub, 34, W * 0.7, 600);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, W / 2, H / 2 + 62);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt / 255);
  return `#${c.getHexString()}`;
}

/** Nomor dada (bib) pembalap. */
export function createBibTexture(num: number, color: string) {
  const W = 128;
  const H = 112;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT(16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JELLY PEAK', W / 2, 12);
  ctx.fillStyle = '#1f2430';
  ctx.font = FONT(72);
  ctx.fillText(String(num), W / 2, 70);
  return tex(c, `Bib_${num}`);
}

export interface BoardRow {
  name: string;
  color: string;
  time: string;
  status: string;
}

/** Papan waktu di garis finish. */
export function createTimingBoard() {
  const W = 1024;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const t = tex(c, 'TimingBoard');
  const draw = (title: string, clock: string, rows: BoardRow[]) => {
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, W, 96);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    fit(ctx, `⛷ ${title.toUpperCase()}`, 52, 600);
    ctx.fillText(`⛷ ${title.toUpperCase()}`, 28, 50);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7CFC9A';
    ctx.font = FONT(64);
    ctx.fillText(clock, W - 28, 52);
    rows.forEach((r, i) => {
      const y = 130 + i * 92;
      ctx.fillStyle = i % 2 ? '#141a3d' : '#1b2350';
      ctx.fillRect(16, y, W - 32, 80);
      ctx.fillStyle = ['#ffd23f', '#d9dde3', '#e0954a', '#7b8794'][i] ?? '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = FONT(54);
      ctx.fillText(String(i + 1), 64, y + 42);
      ctx.fillStyle = r.color;
      ctx.fillRect(108, y + 14, 14, 52);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = FONT(48);
      ctx.fillText(r.name, 140, y + 42);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(r.time, W - 220, y + 42);
      ctx.fillStyle = '#9fb3ff';
      ctx.font = FONT(30, 600);
      ctx.fillText(r.status, W - 32, y + 44);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    t.needsUpdate = true;
  };
  return { texture: t, draw };
}

let flake: THREE.Texture | null = null;
/** Titik salju bulat lembut untuk partikel (Points). */
export function getFlakeTexture() {
  if (flake) return flake;
  const { c, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  flake = tex(c, 'SnowFlake');
  return flake;
}
