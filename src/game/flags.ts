/**
 * Country flags for name tags — drawn with canvas primitives so they render
 * the same everywhere (emoji flags degrade to bare letters on some platforms).
 * Stylised, small-size-first: they only ever appear ~30 px wide.
 */

export interface CountryDef {
  code: string;
  name: string;
}

/** Indonesia + the request list + famous big countries. */
export const COUNTRIES: CountryDef[] = [
  { code: "id", name: "Indonesia" },
  { code: "gb", name: "Inggris" },
  { code: "br", name: "Brasil" },
  { code: "ps", name: "Palestina" },
  { code: "ru", name: "Rusia" },
  { code: "kr", name: "Korea Selatan" },
  { code: "cn", name: "China" },
  { code: "us", name: "Amerika" },
  { code: "jp", name: "Jepang" },
  { code: "in", name: "India" },
  { code: "de", name: "Jerman" },
  { code: "fr", name: "Prancis" },
  { code: "it", name: "Italia" },
  { code: "es", name: "Spanyol" },
  { code: "sa", name: "Arab Saudi" },
  { code: "tr", name: "Turki" },
  { code: "ar", name: "Argentina" },
];

const CODES = new Set(COUNTRIES.map((c) => c.code));

export const isFlagCode = (code: string) => CODES.has(code);

export function flagName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** Real emoji flag (for HTML surfaces); falls back to a globe on odd platforms. */
export function flagEmoji(code: string): string {
  if (!CODES.has(code)) return "🌍";
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** n shuffled codes; unique while the pool lasts, then cycles. */
export function pickFlags(n: number, seedSkip = 0): string[] {
  const pool = COUNTRIES.map((c) => c.code);
  for (let i = pool.length - 1 > 0 ? pool.length - 1 : 0; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pool[(i + seedSkip) % pool.length]);
  return out;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Draw one stylised flag with its top-left corner at (x, y). */
export function drawFlag(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, w: number, h: number) {
  const band3 = (top: string, mid: string, bottom: string) => {
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, h / 3);
    ctx.fillStyle = mid;
    ctx.fillRect(x, y + h / 3, w, h / 3);
    ctx.fillStyle = bottom;
    ctx.fillRect(x, y + (2 * h) / 3, w, h / 3);
  };
  const band3v = (left: string, mid: string, right: string) => {
    ctx.fillStyle = left;
    ctx.fillRect(x, y, w / 3, h);
    ctx.fillStyle = mid;
    ctx.fillRect(x + w / 3, y, w / 3, h);
    ctx.fillStyle = right;
    ctx.fillRect(x + (2 * w) / 3, y, w / 3, h);
  };
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (code) {
    case "id": // merah putih
      ctx.fillStyle = "#e11b22";
      ctx.fillRect(x, y, w, h / 2);
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x, y + h / 2, w, h / 2);
      break;
    case "gb": { // Union Jack (simplified)
      ctx.fillStyle = "#012169";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#f5f5f5";
      ctx.lineWidth = h * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.strokeStyle = "#c8102e";
      ctx.lineWidth = h * 0.09;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x + w * 0.36, y, w * 0.28, h);
      ctx.fillRect(x, y + h * 0.32, w, h * 0.36);
      ctx.fillStyle = "#c8102e";
      ctx.fillRect(x + w * 0.41, y, w * 0.18, h);
      ctx.fillRect(x, y + h * 0.38, w, h * 0.24);
      break;
    }
    case "br": { // green, yellow rhombus, blue globe
      ctx.fillStyle = "#009b3a";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fedf00";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.08);
      ctx.lineTo(x + w * 0.9, y + h * 0.5);
      ctx.lineTo(x + w * 0.5, y + h * 0.92);
      ctx.lineTo(x + w * 0.1, y + h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#002776";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f5f5f5";
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy + h * 0.32, h * 0.42, -Math.PI * 0.78, -Math.PI * 0.22);
      ctx.stroke();
      break;
    }
    case "ps": { // black / white / green + red triangle
      band3("#111111", "#f5f5f5", "#007a3d");
      ctx.fillStyle = "#ce1126";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.42, y + h * 0.5);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "ru":
      band3("#f5f5f5", "#0039a6", "#d52b1e");
      break;
    case "kr": { // taegukgi (simplified)
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#cd2e3a";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.28, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#0047a0";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.28, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#111111";
      for (const [dx, dy, rot] of [[-1, -1, -0.62], [1, -1, 0.62], [-1, 1, 0.62], [1, 1, -0.62]] as const) {
        ctx.save();
        ctx.translate(cx + dx * w * 0.3, cy + dy * h * 0.3);
        ctx.rotate(rot);
        for (let b = -1; b <= 1; b++) ctx.fillRect(-w * 0.09, b * h * 0.045 - h * 0.012, w * 0.18, h * 0.024);
        ctx.restore();
      }
      break;
    }
    case "cn": { // big star + four small ones
      ctx.fillStyle = "#de2910";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffde00";
      star(ctx, x + w * 0.24, y + h * 0.36, h * 0.2);
      for (const [sx, sy] of [[0.46, 0.14], [0.54, 0.32], [0.54, 0.54], [0.46, 0.72]] as const) {
        star(ctx, x + w * sx, y + h * sy, h * 0.066);
      }
      break;
    }
    case "us": { // stripes + canton
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#b22234";
      for (let i = 0; i < 13; i += 2) ctx.fillRect(x, y + (i * h) / 13, w, h / 13);
      ctx.fillStyle = "#3c3b6e";
      ctx.fillRect(x, y, w * 0.44, h * (7 / 13));
      ctx.fillStyle = "#f5f5f5";
      for (let r = 0; r < 3; r++) {
        for (let c2 = 0; c2 < 4; c2++) {
          ctx.beginPath();
          ctx.arc(x + w * (0.06 + c2 * 0.1), y + h * (0.1 + r * 0.14), h * 0.024, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "jp":
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#bc002d";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "in": { // tiranga
      band3("#ff9933", "#f5f5f5", "#138808");
      ctx.strokeStyle = "#000080";
      ctx.lineWidth = Math.max(1, h * 0.045);
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#000080";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.03, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "de":
      band3("#141414", "#dd0000", "#ffce00");
      break;
    case "fr":
      band3v("#0055a4", "#f5f5f5", "#ef4135");
      break;
    case "it":
      band3v("#009246", "#f5f5f5", "#ce2b37");
      break;
    case "es": // red / wide yellow / red
      ctx.fillStyle = "#aa151b";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#f1bf00";
      ctx.fillRect(x, y + h * 0.25, w, h * 0.5);
      break;
    case "sa": { // green with a sword line
      ctx.fillStyle = "#006c35";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x + w * 0.18, y + h * 0.6, w * 0.64, h * 0.05);
      ctx.fillRect(x + w * 0.24, y + h * 0.3, w * 0.52, h * 0.13);
      break;
    }
    case "tr": { // crescent + star
      ctx.fillStyle = "#e30a17";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#f5f5f5";
      ctx.beginPath();
      ctx.arc(x + w * 0.4, cy, h * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e30a17";
      ctx.beginPath();
      ctx.arc(x + w * 0.47, cy, h * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5f5f5";
      star(ctx, x + w * 0.66, cy, h * 0.13);
      break;
    }
    case "ar": { // sun of may
      band3("#74acdf", "#f5f5f5", "#74acdf");
      ctx.fillStyle = "#f6b40e";
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: // unknown code: neutral dark panel
      ctx.fillStyle = "#3b3b47";
      ctx.fillRect(x, y, w, h);
      break;
  }
}
