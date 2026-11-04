/* Procedural audio engine: SFX + per-screen music, no assets needed. */
type Track = "menu" | "lobby" | "game" | null;

let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, noiseBuf: AudioBuffer;
let muted = localStorage.getItem("muted") === "1";
let musicVol = 0.5;
const listeners = new Set<(m: boolean) => void>();

function init() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = musicVol; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  const c = init();
  if (c.state === "suspended") c.resume();
  if (pendingTrack !== undefined) { const t = pendingTrack; pendingTrack = undefined; playMusic(t); }
}
if (typeof window !== "undefined") {
  const u = () => unlock();
  window.addEventListener("pointerdown", u, { once: false });
  window.addEventListener("keydown", u, { once: false });
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m; localStorage.setItem("muted", m ? "1" : "0");
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  listeners.forEach((f) => f(m));
}
export function onMute(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/* ---------- primitives ---------- */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number; bus?: AudioNode; lp?: number; detune?: number } = {}) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = opts.type ?? "sine"; o.frequency.setValueAtTime(freq, t);
  if (opts.detune) o.detune.value = opts.detune;
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
  const v = opts.vol ?? 0.3, a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = o;
  if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opts.lp; o.connect(f); node = f; }
  node.connect(g).connect(opts.bus ?? sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, opts: { vol?: number; at?: number; type?: BiquadFilterType; freq?: number; to?: number; q?: number; bus?: AudioNode; attack?: number } = {}) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = opts.type ?? "bandpass"; f.frequency.setValueAtTime(opts.freq ?? 1000, t); f.Q.value = opts.q ?? 1;
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = ctx.createGain(), v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(opts.bus ?? sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/* ---------- SFX ---------- */
let lastHover = 0;
export const sfx = {
  hover() { const n = performance.now(); if (n - lastHover < 45) return; lastHover = n; tone(1400, 0.05, { type: "triangle", vol: 0.06 }); },
  click() { tone(520, 0.09, { type: "sine", vol: 0.28, slide: 900 }); tone(1040, 0.06, { type: "triangle", vol: 0.08, at: 0.01 }); },
  back() { tone(700, 0.12, { type: "sine", vol: 0.25, slide: 320 }); },
  select() { tone(N(76), 0.09, { type: "triangle", vol: 0.16 }); tone(N(83), 0.12, { type: "triangle", vol: 0.14, at: 0.05 }); },
  equip() { [N(79), N(84), N(88)].forEach((f, i) => tone(f, 0.16, { type: "triangle", vol: 0.14, at: i * 0.04 })); noise(0.15, { type: "highpass", freq: 6000, vol: 0.05, at: 0.06 }); },
  unequip() { tone(N(72), 0.1, { type: "triangle", vol: 0.14 }); tone(N(67), 0.14, { type: "triangle", vol: 0.12, at: 0.05 }); },
  pop() { tone(300, 0.12, { type: "sine", vol: 0.3, slide: 1200 }); },
  whoosh() { noise(0.55, { type: "bandpass", freq: 300, to: 3500, q: 0.8, vol: 0.35, attack: 0.18 }); },
  whooshOut() { noise(0.55, { type: "bandpass", freq: 3500, to: 250, q: 0.8, vol: 0.32, attack: 0.05 }); },
  ready() { [N(72), N(76), N(79), N(84)].forEach((f, i) => tone(f, 0.22, { type: "square", vol: 0.07, at: i * 0.06, lp: 3000 })); },
  unready() { tone(N(72), 0.12, { type: "square", vol: 0.06, lp: 2000 }); tone(N(65), 0.18, { type: "square", vol: 0.06, at: 0.08, lp: 2000 }); },
  tick() { tone(1800, 0.03, { type: "square", vol: 0.04, lp: 4000 }); },
  tickUrgent() { tone(1200, 0.08, { type: "square", vol: 0.08, lp: 3000 }); tone(1200, 0.06, { type: "square", vol: 0.05, at: 0.12, lp: 3000 }); },
  count() { tone(N(72), 0.25, { type: "square", vol: 0.12, lp: 2500 }); tone(N(60), 0.25, { type: "triangle", vol: 0.2 }); },
  go() { [N(72), N(76), N(79), N(84)].forEach((f) => tone(f, 0.6, { type: "square", vol: 0.07, lp: 3500 })); tone(N(48), 0.6, { type: "triangle", vol: 0.3 }); noise(0.5, { type: "highpass", freq: 5000, vol: 0.12 }); },
  dash() { noise(0.22, { type: "bandpass", freq: 800, to: 2500, q: 1.2, vol: 0.25 }); tone(220, 0.15, { type: "sine", vol: 0.15, slide: 440 }); },
  hit(power = 1) { tone(160, 0.18, { type: "sine", vol: 0.45 * power, slide: 50 }); noise(0.12, { type: "lowpass", freq: 2500, vol: 0.3 * power }); tone(N(84), 0.08, { type: "square", vol: 0.05 * power, lp: 4000, at: 0.01 }); },
  bump() { tone(200, 0.1, { type: "sine", vol: 0.18, slide: 90 }); },
  splash() { noise(0.9, { type: "lowpass", freq: 3000, to: 300, vol: 0.5, attack: 0.01 }); noise(0.4, { type: "bandpass", freq: 1500, vol: 0.2, at: 0.05 }); tone(500, 0.3, { type: "sine", vol: 0.12, slide: 120 }); },
  fall() { tone(900, 0.5, { type: "triangle", vol: 0.12, slide: 200 }); },
  wave() { noise(2.4, { type: "lowpass", freq: 300, to: 1200, vol: 0.4, attack: 0.9 }); tone(N(45), 1.2, { type: "sawtooth", vol: 0.05, lp: 600 }); tone(N(52), 1.2, { type: "sawtooth", vol: 0.05, lp: 600, at: 0.3 }); },
  win() { [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone(N(n), i === 6 ? 0.9 : 0.18, { type: "square", vol: 0.08, at: i * 0.11, lp: 3500 })); tone(N(48), 1.4, { type: "triangle", vol: 0.25, at: 0.66 }); },
  lose() { [67, 66, 65, 64].forEach((n, i) => tone(N(n), i === 3 ? 0.8 : 0.25, { type: "triangle", vol: 0.18, at: i * 0.28, slide: i === 3 ? N(58) : undefined })); },
  honk() { tone(380, 0.18, { type: "sawtooth", vol: 0.08, lp: 1400, slide: 330 }); },
  thud() { tone(110, 0.2, { type: "sine", vol: 0.4, slide: 45 }); noise(0.1, { type: "lowpass", freq: 600, vol: 0.2 }); },
  coin() { tone(N(88), 0.08, { type: "square", vol: 0.06, lp: 5000 }); tone(N(95), 0.2, { type: "square", vol: 0.06, at: 0.07, lp: 5000 }); },
};

/* ---------- MUSIC ---------- */
type Song = {
  bpm: number; swing?: number;
  chords: number[][]; // midi notes, 1 chord per bar
  bass: (bar: number, step: number, chord: number[]) => number | null;
  lead?: (bar: number, step: number, chord: number[]) => number | null;
  drums: { kick: number[]; snare: number[]; hat: number[] };
  pluck?: number[]; leadType?: OscillatorType; padVol?: number;
};

const SONGS: Record<Exclude<Track, null>, Song> = {
  menu: {
    bpm: 112,
    chords: [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]],
    bass: (_b, s, c) => (s % 4 === 0 ? c[0] - 24 : s % 4 === 2 ? c[0] - 12 : null),
    lead: (b, s, c) => { const m = [0, null, 2, null, 1, null, 2, 0, null, 1, null, 2, null, 1, 0, null]; const i = m[s]; return i == null || (b % 2 && s > 10) ? null : c[i] + 12; },
    drums: { kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    pluck: [2, 6, 10, 14], leadType: "triangle",
  },
  lobby: {
    bpm: 96, swing: 0.12,
    chords: [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71], [57, 60, 64, 67]],
    bass: (_b, s, c) => ([0, 3, 6, 10].includes(s) ? c[0] - 24 + (s === 10 ? 7 : 0) : null),
    lead: (b, s, c) => (b % 2 === 1 && [0, 3, 6].includes(s) ? c[[3, 2, 1][[0, 3, 6].indexOf(s)]] + 12 : null),
    drums: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    pluck: [2, 5, 8, 11, 14], leadType: "sine", padVol: 0.035,
  },
  game: {
    bpm: 138,
    chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
    bass: (_b, s, c) => (s % 2 === 0 ? c[0] - 24 + (s % 8 === 6 ? 12 : 0) : null),
    lead: (b, s, c) => { const p = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2]; return b % 4 === 3 && s > 7 ? null : s % 2 === 0 ? c[p[s]] + 12 : null; },
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14, 15] },
    pluck: [0, 3, 6, 8, 11, 14], leadType: "square",
  },
};

let current: Track = null;
let pendingTrack: Track | undefined;
let timer: number | null = null;
let songGain: GainNode | null = null;

export function playMusic(track: Track) {
  if (!ctx || ctx.state !== "running") { pendingTrack = track; return; }
  if (track === current && songGain) return;
  // fade out old
  if (songGain) { const g = songGain; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); setTimeout(() => g.disconnect(), 1500); }
  if (timer) { clearInterval(timer); timer = null; }
  current = track; songGain = null;
  if (!track) return;
  const song = SONGS[track];
  const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(1, ctx.currentTime + 0.1, 0.4); g.connect(musicBus);
  songGain = g;
  const stepDur = 60 / song.bpm / 4;
  let step = 0, next = ctx.currentTime + 0.1;
  const sched = () => {
    if (!ctx || songGain !== g) return;
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % song.chords.length, s = step % 16, chord = song.chords[bar];
      const swing = s % 2 === 1 ? (song.swing ?? 0) * stepDur : 0;
      const at = next + swing - ctx.currentTime;
      const b = song.bass(bar, s, chord);
      if (b != null) tone(N(b), stepDur * 1.8, { type: "triangle", vol: 0.32, at, bus: g, lp: 900 });
      if (song.pluck?.includes(s)) chord.forEach((n) => tone(N(n), stepDur * 1.5, { type: "square", vol: 0.025, at, bus: g, lp: 1800 }));
      if (s === 0 && song.padVol) chord.forEach((n) => tone(N(n), stepDur * 16, { type: "sine", vol: song.padVol!, at, bus: g, attack: 0.3 }));
      const l = song.lead?.(bar, s, chord);
      if (l != null) tone(N(l), stepDur * 1.6, { type: song.leadType ?? "triangle", vol: song.leadType === "square" ? 0.035 : 0.09, at, bus: g, lp: 3000 });
      if (song.drums.kick.includes(s)) tone(130, 0.18, { type: "sine", vol: 0.5, slide: 40, at, bus: g });
      if (song.drums.snare.includes(s)) { noise(0.15, { type: "bandpass", freq: 1800, q: 0.7, vol: 0.18, at, bus: g }); tone(220, 0.08, { type: "triangle", vol: 0.1, at, bus: g, slide: 140 }); }
      if (song.drums.hat.includes(s)) noise(0.04, { type: "highpass", freq: 8000, vol: s % 4 === 2 ? 0.07 : 0.035, at, bus: g });
      next += stepDur; step++;
    }
  };
  sched();
  timer = window.setInterval(sched, 60);
}

export function duckMusic(on: boolean) {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(on ? musicVol * 0.35 : musicVol, ctx.currentTime, 0.15);
}
