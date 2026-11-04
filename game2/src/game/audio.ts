let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur);
}

let lastHit = 0;
export const sfx = {
  hit(strength = 1) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastHit < 0.03) return;
    lastHit = now;
    tone("sine", 220 + Math.random() * 60, 60, 0.18, 0.5 * strength);
    noise(0.08, 0.35 * strength, 1800);
  },
  bigHit() {
    tone("sine", 160, 40, 0.3, 0.7);
    tone("square", 400, 90, 0.12, 0.12);
    noise(0.15, 0.5, 2500);
  },
  pan() {
    // Bright enamel "pang" that rings above the usual soft body-impact thump.
    tone("sine", 980, 440, 0.24, 0.26);
    tone("triangle", 1480, 730, 0.19, 0.16, 0.012);
    tone("sine", 520, 180, 0.18, 0.28);
    noise(0.085, 0.18, 5200);
  },
  jump() {
    tone("sine", 280, 620, 0.14, 0.18);
  },
  whoosh() {
    noise(0.12, 0.12, 900);
  },
  grab() {
    tone("triangle", 500, 300, 0.06, 0.15);
  },
  ko() {
    tone("square", 900, 200, 0.5, 0.08);
    tone("sine", 1200, 1600, 0.1, 0.1, 0.05);
    tone("sine", 1200, 1600, 0.1, 0.1, 0.2);
  },
  fall() {
    tone("sine", 1200, 150, 1.0, 0.15);
  },
  countdown(final = false) {
    tone("square", final ? 880 : 440, final ? 880 : 440, final ? 0.4 : 0.15, 0.1);
  },
  ui(kind: "tap" | "open" | "pick" = "tap") {
    if (!ctx) return;
    const base = kind === "open" ? 520 : kind === "pick" ? 760 : 420;
    tone("triangle", base, base * (kind === "tap" ? 1.25 : 1.6), 0.09, 0.12);
    noise(0.04, 0.05, 2600);
  },
  boom() {
    if (!ctx) return;
    tone("sine", 120, 35, 0.55, 0.9);
    tone("square", 70, 30, 0.4, 0.28);
    tone("triangle", 380, 60, 0.25, 0.22);
    noise(0.5, 0.85, 2600);
    noise(0.18, 0.4, 7000);
  },
  fuse() {
    tone("square", 1200, 1300, 0.05, 0.05);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.25, 0.15, i * 0.12));
  },
};
