export interface FrameView {
  marks: string[];
  total: number | null;
}

export interface GameState {
  frames: FrameView[];
  total: number;
  /** frame aktif 0–9 */
  frame: number;
  /** lemparan ke- dalam frame (0–2) */
  ball: number;
  done: boolean;
  /** rak pin baru (10 pin) untuk lemparan berikutnya */
  rackFresh: boolean;
  standingBefore: number;
  strikeStreak: number;
}

const sym = (n: number) => (n === 0 ? '-' : String(n));

/** Skor bowling resmi 10 frame (strike = 10 + 2 lemparan berikutnya, spare = 10 + 1). */
export class BowlingGame {
  rolls: number[] = [];

  reset() {
    this.rolls = [];
  }

  add(pins: number) {
    this.rolls.push(Math.max(0, Math.min(10, Math.round(pins))));
  }

  state(): GameState {
    const r = this.rolls;
    const frames: FrameView[] = [];
    let i = 0;
    let running = 0;
    let pending = false;
    let cur = -1;
    let ball = 0;
    let rackFresh = true;
    let standingBefore = 10;
    let done = false;
    const setCur = (f: number, b: number, fresh: boolean, standing: number) => {
      if (cur >= 0) return;
      cur = f;
      ball = b;
      rackFresh = fresh;
      standingBefore = standing;
    };
    const addTotal = (v: number | null) => {
      if (pending || v === null) {
        pending = true;
        return null;
      }
      running += v;
      return running;
    };

    for (let f = 0; f < 9; f++) {
      if (i >= r.length) {
        setCur(f, 0, true, 10);
        frames.push({ marks: ['', ''], total: null });
        pending = true;
        continue;
      }
      if (r[i] === 10) {
        const v = i + 2 < r.length ? 10 + r[i + 1] + r[i + 2] : null;
        frames.push({ marks: ['', 'X'], total: addTotal(v) });
        i += 1;
      } else if (i + 1 >= r.length) {
        setCur(f, 1, false, 10 - r[i]);
        frames.push({ marks: [sym(r[i]), ''], total: null });
        pending = true;
        i += 1;
      } else {
        const a = r[i];
        const b = r[i + 1];
        const spare = a + b === 10;
        const v = spare ? (i + 2 < r.length ? 10 + r[i + 2] : null) : a + b;
        frames.push({ marks: [sym(a), spare ? '/' : sym(b)], total: addTotal(v) });
        i += 2;
      }
    }

    // Frame 10
    const a = r[i];
    const b = r[i + 1];
    const c = r[i + 2];
    const m = ['', '', ''];
    let total10: number | null = null;
    if (a === undefined) setCur(9, 0, true, 10);
    else {
      m[0] = a === 10 ? 'X' : sym(a);
      if (b === undefined) setCur(9, 1, a === 10, a === 10 ? 10 : 10 - a);
      else {
        m[1] = a === 10 ? (b === 10 ? 'X' : sym(b)) : a + b === 10 ? '/' : sym(b);
        const third = a === 10 || a + b === 10;
        if (!third) {
          total10 = addTotal(a + b);
          done = true;
        } else if (c === undefined) {
          if (a === 10 && b < 10) setCur(9, 2, false, 10 - b);
          else setCur(9, 2, true, 10);
        } else {
          m[2] = a === 10 && b < 10 ? (b + c === 10 ? '/' : sym(c)) : c === 10 ? 'X' : sym(c);
          total10 = addTotal(a + b + c);
          done = true;
        }
      }
    }
    frames.push({ marks: m, total: total10 });
    if (cur < 0) {
      cur = 9;
      ball = 0;
    }
    let streak = 0;
    for (let k = r.length - 1; k >= 0 && r[k] === 10; k--) streak++;
    const lastTotal = [...frames].reverse().find((f) => f.total !== null)?.total ?? 0;
    return { frames, total: lastTotal, frame: cur, ball, done, rackFresh, standingBefore, strikeStreak: streak };
  }
}

/** Cek "split": pin 1 roboh & pin yang tersisa tidak saling bersebelahan. */
export function isSplit(standing: boolean[], spots: [number, number][]) {
  if (standing[0]) return false;
  const idx = standing.map((s, k) => (s ? k : -1)).filter((k) => k >= 0);
  if (idx.length < 2) return false;
  const adj = (p: number, q: number) => Math.hypot(spots[p][0] - spots[q][0], spots[p][1] - spots[q][1]) < 0.32;
  const seen = new Set([idx[0]]);
  const stack = [idx[0]];
  while (stack.length) {
    const p = stack.pop() as number;
    for (const q of idx) if (!seen.has(q) && adj(p, q)) {
      seen.add(q);
      stack.push(q);
    }
  }
  return seen.size < idx.length;
}
