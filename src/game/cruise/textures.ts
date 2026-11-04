import * as THREE from 'three';

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  return { c, ctx };
}

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function finish<T extends THREE.Texture>(tex: T, name: string, repeat = false): T {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.name = name;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Papan dek kayu (grayscale hangat, diwarnai lewat material.color). 1 tile = 4 m, 16 papan. */
export function createDeckTexture() {
  const S = 512;
  const { c, ctx } = makeCanvas(S, S);
  const r = rng(11);
  const planks = 16;
  const ph = S / planks;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    const nJ = 2 + Math.floor(r() * 2);
    const joints = Array.from({ length: nJ }, () => Math.floor(r() * S)).sort((a, b) => a - b);
    for (let k = 0; k < nJ; k++) {
      const a = joints[k];
      const b = k + 1 < nJ ? joints[k + 1] : joints[0] + S;
      const v = 206 + Math.floor(r() * 49);
      ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.96)},${Math.floor(v * 0.91)})`;
      ctx.fillRect(a, y0, b - a, ph);
      if (b > S) ctx.fillRect(a - S, y0, b - a, ph);
    }
    ctx.strokeStyle = 'rgba(90,60,30,0.09)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const gy = y0 + 3 + r() * (ph - 6);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(S * 0.3, gy + (r() - 0.5) * 4, S * 0.6, gy + (r() - 0.5) * 4, S, gy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(55,32,14,0.6)';
    for (const j of joints) ctx.fillRect(j - 1, y0, 2, ph);
    ctx.fillStyle = 'rgba(40,24,10,0.75)';
    ctx.fillRect(0, y0 + ph - 2, S, 2);
  }
  return finish(new THREE.CanvasTexture(c), 'DeckPlanks', true);
}

/** Peti kayu klasik dengan bingkai & palang diagonal. */
export function createCrateTexture() {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    ctx.fillStyle = i % 2 ? '#b98149' : '#c48d53';
    ctx.fillRect(0, (i * S) / boards, S, S / boards);
    ctx.fillStyle = 'rgba(70,40,15,0.5)';
    ctx.fillRect(0, (i * S) / boards, S, 3);
  }
  ctx.strokeStyle = '#7a4a22';
  ctx.lineWidth = 30;
  ctx.strokeRect(15, 15, S - 30, S - 30);
  ctx.lineCap = 'square';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(34, S - 34);
  ctx.lineTo(S - 34, 34);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  ctx.strokeRect(30, 30, S - 60, S - 60);
  ctx.fillStyle = '#3b2a1a';
  for (const [x, y] of [
    [15, 15],
    [S - 15, 15],
    [15, S - 15],
    [S - 15, S - 15],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(new THREE.CanvasTexture(c), 'CrateWood');
}

export interface TextLine {
  text: string;
  size: number;
}

/** Tekstur teks transparan yang bisa digambar ulang (nama kapal). */
export function createTextTexture(w: number, h: number, name: string) {
  const { c, ctx } = makeCanvas(w, h);
  const texture = finish(new THREE.CanvasTexture(c), name);
  const draw = (lines: TextLine[], fill = '#ffffff', stroke = 'rgba(10,20,40,0.5)') => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const total = lines.reduce((s, l) => s + l.size * 1.12, 0);
    let y = (h - total) / 2;
    for (const l of lines) {
      let size = l.size;
      const font = (sz: number) => `700 ${sz}px Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`;
      ctx.font = font(size);
      while (ctx.measureText(l.text).width > w * 0.92 && size > 12) {
        size -= 4;
        ctx.font = font(size);
      }
      const cy = y + (l.size * 1.12) / 2;
      ctx.lineWidth = Math.max(4, size * 0.14);
      ctx.strokeStyle = stroke;
      ctx.strokeText(l.text, w / 2, cy);
      ctx.fillStyle = fill;
      ctx.fillText(l.text, w / 2, cy);
      y += l.size * 1.12;
    }
    texture.needsUpdate = true;
  };
  return { texture, draw };
}

/** Logo cerobong: karakter jelly lucu dalam lingkaran. */
export function createLogoTexture() {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fillStyle = '#1d2b53';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128, 128, 106, 0, Math.PI * 2);
  ctx.fillStyle = '#fff6e0';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1d2b53';
  // lengan
  roundRect(ctx, 60, 70, 30, 62, 15);
  ctx.fillStyle = '#ff7a3d';
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, 166, 112, 30, 58, 15);
  ctx.fill();
  ctx.stroke();
  // badan
  roundRect(ctx, 84, 48, 88, 156, 44);
  ctx.fillStyle = '#ff7a3d';
  ctx.fill();
  ctx.stroke();
  // mata
  ctx.fillStyle = '#1d2b53';
  for (const ex of [112, 144]) {
    ctx.beginPath();
    ctx.ellipse(ex, 100, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // mulut
  ctx.beginPath();
  ctx.lineWidth = 5;
  ctx.arc(128, 122, 14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return finish(new THREE.CanvasTexture(c), 'FunnelLogo');
}
