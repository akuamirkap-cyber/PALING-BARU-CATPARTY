import * as THREE from 'three';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Normal map riak air yang bisa di-tile sempurna (jumlah gelombang sinus berfrekuensi bulat).
 * RGB = normal, A = tinggi (dipakai sebagai noise buih).
 */
export function createWaterNormalMap(size = 256, seed = 7): THREE.DataTexture {
  const rnd = mulberry32(seed);
  const waves: { fx: number; fy: number; a: number; p: number }[] = [];
  while (waves.length < 44) {
    const fx = Math.round((rnd() * 2 - 1) * 10);
    const fy = Math.round((rnd() * 2 - 1) * 10);
    if (fx === 0 && fy === 0) continue;
    const f = Math.hypot(fx, fy);
    waves.push({ fx, fy, a: 1 / Math.pow(f, 1.35), p: rnd() * Math.PI * 2 });
  }
  const n = size * size;
  const data = new Uint8Array(n * 4);
  const heights = new Float32Array(n);
  let hmin = Infinity;
  let hmax = -Infinity;
  const TAU = Math.PI * 2;
  const s = 0.03;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let h = 0;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const ph = TAU * (w.fx * u + w.fy * v) + w.p;
        const c = Math.cos(ph);
        h += w.a * Math.sin(ph);
        dx += w.a * TAU * w.fx * c;
        dy += w.a * TAU * w.fy * c;
      }
      let nx = -dx * s;
      let ny = -dy * s;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = y * size + x;
      data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      heights[i] = h;
      if (h < hmin) hmin = h;
      if (h > hmax) hmax = h;
    }
  }
  for (let i = 0; i < n; i++) data[i * 4 + 3] = Math.round(((heights[i] - hmin) / (hmax - hmin)) * 255);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'WaterNormals';
  tex.needsUpdate = true;
  return tex;
}

/** Pola kaustik (versi JS dari shader "tileable water caustic"). */
function causticValue(u: number, v: number, time: number) {
  const TAU = 6.28318530718;
  const px = ((((u * TAU) % TAU) + TAU) % TAU) - 250;
  const py = ((((v * TAU) % TAU) + TAU) % TAU) - 250;
  let ix = px;
  let iy = py;
  let c = 1;
  const inten = 0.005;
  for (let k = 0; k < 5; k++) {
    const t = time * (1 - 3.5 / (k + 1));
    const nix = px + Math.cos(t - ix) + Math.sin(t + iy);
    const niy = py + Math.sin(t - iy) + Math.cos(t + ix);
    ix = nix;
    iy = niy;
    c += 1 / Math.hypot(px / (Math.sin(ix + t) / inten), py / (Math.cos(iy + t) / inten));
  }
  c /= 5;
  c = 1.17 - Math.pow(c, 1.4);
  return Math.min(1, Math.pow(Math.abs(c), 8));
}

/** Tekstur kaustik untuk lantai kolam (cahaya bergelombang). */
export function createCausticsTexture(size = 256, base: [number, number, number] = [205, 238, 246]) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = causticValue(x / size, y / size, 7.3) * 0.85 + causticValue(x / size + 0.37, y / size + 0.21, 3.1) * 0.35;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, base[0] + k * 60);
      img.data[i + 1] = Math.min(255, base[1] + k * 30);
      img.data[i + 2] = Math.min(255, base[2] + k * 20);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = 'PoolCaustics';
  return tex;
}

/** GLSL: fungsi kaustik animasi (dipakai dasar laut & karang). */
export const CAUSTIC_GLSL = /* glsl */ `
float causticPattern(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
`;
