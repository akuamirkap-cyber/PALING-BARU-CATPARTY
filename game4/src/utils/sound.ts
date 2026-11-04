// Mesin suara Bounce Paws: SFX + musik loop, 100% Web Audio synth.
// Tanpa file audio eksternal. Hormat pada autoplay policy browser.

type OscType = OscillatorType;

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextNote = 0;
  muted = false;
  private sfxLevel = 0.8;
  private musicLevel = 0.6;

  constructor() {
    try {
      this.muted = localStorage.getItem('bp-muted') === '1';
    } catch {
      /* storage tidak tersedia */
    }
  }

  ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxLevel;
        this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicLevel;
        this.musicBus.connect(this.master);
        this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bp-muted', m ? '1' : '0');
    } catch {
      /* abaikan */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
    }
    if (m) this.stopMusic();
    else this.startMusic();
  }

  setSfxVol(v: number) {
    this.sfxLevel = Math.min(1, Math.max(0, v));
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(this.sfxLevel, this.ctx.currentTime, 0.02);
  }

  setMusicVol(v: number) {
    this.musicLevel = Math.min(1, Math.max(0, v));
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(this.musicLevel, this.ctx.currentTime, 0.02);
  }

  private tone(o: { f: number; f2?: number; t?: number; d?: number; type?: OscType; v?: number; music?: boolean }) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus || !this.musicBus) return;
    const { f, f2, d = 0.15, type = 'sine', v = 0.2, music = false } = o;
    const t = o.t ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f), t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g);
    g.connect(music ? this.musicBus : this.sfxBus);
    osc.start(t);
    osc.stop(t + d + 0.05);
  }

  private noise(o: { t?: number; d?: number; v?: number; hp?: number; lp?: number; lp2?: number }) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    const { d = 0.2, v = 0.15, hp, lp, lp2 } = o;
    const t = o.t ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    let node: AudioNode = src;
    if (hp) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      node.connect(f);
      node = f;
    }
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lp, t);
      if (lp2) f.frequency.exponentialRampToValueAtTime(lp2, t + d);
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    node.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + d + 0.05);
  }

  /* ---------- SFX ---------- */
  hover() {
    this.tone({ f: 1250, d: 0.045, type: 'sine', v: 0.035 });
  }
  click() {
    this.tone({ f: 620, f2: 880, d: 0.09, type: 'square', v: 0.09 });
  }
  open() {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    this.tone({ f: 320, f2: 920, d: 0.2, type: 'triangle', v: 0.13, t });
    this.tone({ f: 640, d: 0.12, type: 'sine', v: 0.06, t: t + 0.05 });
  }
  close() {
    this.tone({ f: 740, f2: 260, d: 0.18, type: 'triangle', v: 0.11 });
  }
  pop() {
    this.tone({ f: 540, f2: 780, d: 0.08, type: 'sine', v: 0.12 });
  }
  select(i = 0) {
    const f = 500 + (i % 8) * 70;
    this.tone({ f, f2: f + 130, d: 0.1, type: 'sine', v: 0.13 });
    this.tone({ f: f * 2, d: 0.07, type: 'sine', v: 0.045 });
  }
  coin() {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    this.tone({ f: 988, d: 0.08, type: 'square', v: 0.08, t });
    this.tone({ f: 1319, d: 0.24, type: 'square', v: 0.08, t: t + 0.08 });
  }
  deny() {
    this.tone({ f: 170, f2: 120, d: 0.22, type: 'sawtooth', v: 0.1 });
  }
  ready() {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    [523, 659, 784].forEach((f, i) => this.tone({ f, d: 0.18, type: 'triangle', v: 0.13, t: t + i * 0.07 }));
  }
  tick() {
    this.tone({ f: 880, d: 0.06, type: 'square', v: 0.09 });
  }
  go() {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    this.tone({ f: 880, d: 0.35, type: 'square', v: 0.11, t });
    this.tone({ f: 1108, d: 0.4, type: 'triangle', v: 0.1, t: t + 0.02 });
  }
  whoosh() {
    this.noise({ d: 0.45, v: 0.14, lp: 400, lp2: 4200 });
  }
  success() {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, d: 0.2, type: 'triangle', v: 0.12, t: t + i * 0.09 }));
  }
  fanfare(win: boolean) {
    const ctx = this.ensure();
    const t = ctx ? ctx.currentTime : 0;
    if (win) {
      [523, 523, 523, 659, 784, 1047, 1319].forEach((f, i) =>
        this.tone({ f, d: i === 6 ? 0.6 : 0.16, type: 'triangle', v: 0.13, t: t + i * 0.12 }),
      );
      this.noise({ t: t + 0.7, d: 0.5, v: 0.05, hp: 5000 });
    } else {
      [392, 370, 349, 330].forEach((f, i) => this.tone({ f, d: 0.26, type: 'triangle', v: 0.11, t: t + i * 0.16 }));
    }
  }

  /* ---------- MUSIK: loop ceria 32 step ---------- */
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.musicTimer || this.muted) return;
    this.step = 0;
    this.nextNote = ctx.currentTime + 0.08;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }
  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const SPB = 60 / 122 / 2;
    while (this.nextNote < ctx.currentTime + 0.3) {
      this.playStep(this.step % 32, this.nextNote, SPB);
      this.nextNote += SPB;
      this.step++;
    }
  }

  private playStep(s: number, t: number, spb: number) {
    const LEAD = [
      76, 0, 79, 0, 81, 0, 79, 0,
      77, 0, 81, 0, 84, 0, 81, 77,
      79, 0, 83, 0, 86, 0, 83, 79,
      84, 0, 81, 79, 76, 0, 74, 0,
    ];
    const ROOTS = [36, 41, 43, 41];
    const m = LEAD[s];
    if (m > 0) this.tone({ f: midi(m), d: spb * 0.9, type: 'triangle', v: 0.085, t, music: true });
    if (s % 2 === 0) {
      this.tone({ f: midi(ROOTS[Math.floor(s / 8)]), d: spb * 1.8, type: 'sine', v: 0.14, t, music: true });
    }
    if (s % 4 === 0) this.tone({ f: 130, f2: 42, d: 0.12, type: 'sine', v: 0.2, t, music: true });
    if (s % 2 === 1) {
      const ctx = this.ctx;
      if (ctx && this.noiseBuf && this.musicBus) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.022, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        src.connect(f);
        f.connect(g);
        g.connect(this.musicBus);
        src.start(t);
        src.stop(t + 0.08);
      }
    }
  }
}

export const sound = new SoundEngine();
