/** Suara lomba ski sintetis (WebAudio) — tanpa file audio. */
export class SkiAudio {
  ctx: AudioContext | null = null;
  enabled = true;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private wind!: { g: GainNode; f: BiquadFilterNode };
  private carve!: { g: GainNode; f: BiquadFilterNode };
  private crowd!: { g: GainNode; f: BiquadFilterNode };

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return this.ctx;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w;
      d[i] = w * 0.6 + b * 3;
    }
    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start(0, Math.random());
      return { g, f };
    };
    this.wind = loop('bandpass', 500, 0.6);
    this.carve = loop('highpass', 2500, 0.7);
    this.crowd = loop('bandpass', 900, 0.9);
    return ctx;
  }

  /** Matikan semua suara loop (dipanggil saat meninggalkan arena). */
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of [this.wind, this.carve, this.crowd]) v.g.gain.setTargetAtTime(0, t, 0.05);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  private live() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  /** Dipanggil tiap frame: kecepatan (m/s), slip (m/s), di udara?, tingkat keramaian 0..1. */
  update(speed: number, slip: number, air: boolean, crowd: number, active: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled && active;
    this.wind.g.gain.setTargetAtTime(on ? Math.min(0.5, speed * speed * 0.0006 + 0.02) : 0, t, 0.15);
    this.wind.f.frequency.setTargetAtTime(300 + speed * 35, t, 0.2);
    this.carve.g.gain.setTargetAtTime(on && !air ? Math.min(0.45, slip * 0.05 + speed * 0.006) : 0, t, 0.06);
    this.carve.f.frequency.setTargetAtTime(1800 + slip * 220, t, 0.1);
    this.crowd.g.gain.setTargetAtTime(this.enabled ? 0.02 + crowd * 0.32 : 0, t, 0.3);
  }

  private burst(t: number, freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', end?: number) {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  beep(go: boolean) {
    if (!this.live()) return;
    const t = (this.ctx as AudioContext).currentTime;
    if (go) {
      this.tone(t, 880, 0.6, 0.35, 'square');
      // terompet udara
      this.tone(t, 233, 1.1, 0.22, 'sawtooth');
      this.tone(t, 294, 1.1, 0.16, 'sawtooth');
      this.cheer(1, 2);
    } else this.tone(t, 440, 0.25, 0.3, 'square');
  }

  cowbell(n = 3) {
    if (!this.live()) return;
    const t0 = (this.ctx as AudioContext).currentTime;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * 0.16 + Math.random() * 0.05;
      this.tone(t, 540, 0.35, 0.12, 'square');
      this.tone(t, 800, 0.3, 0.1, 'square');
    }
  }

  cheer(amount: number, dur = 1.6) {
    if (!this.live()) return;
    const t0 = (this.ctx as AudioContext).currentTime;
    const n = Math.floor(amount * 40 * dur);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * dur;
      this.burst(t, 700 + Math.random() * 1400, 3 + Math.random() * 3, 0.12 + Math.random() * 0.2, 0.05 + Math.random() * 0.06);
      if (Math.random() < 0.12) this.tone(t, 300 + Math.random() * 300, 0.25, 0.04, 'sawtooth', 500 + Math.random() * 400);
    }
    if (amount > 0.5) this.cowbell(2 + Math.floor(amount * 3));
  }

  gate(ok: boolean) {
    if (!this.live()) return;
    const t = (this.ctx as AudioContext).currentTime;
    if (ok) {
      this.tone(t, 1320, 0.18, 0.12, 'triangle');
      this.tone(t + 0.06, 1760, 0.22, 0.1, 'triangle');
    } else {
      this.tone(t, 220, 0.35, 0.2, 'sawtooth', 150);
    }
  }

  whoosh() {
    if (!this.live()) return;
    const t = (this.ctx as AudioContext).currentTime;
    this.burst(t, 900, 0.8, 0.5, 0.25);
  }

  land(power: number) {
    if (!this.live()) return;
    const t = (this.ctx as AudioContext).currentTime;
    this.tone(t, 70, 0.25, Math.min(0.6, 0.2 + power * 0.25));
    this.burst(t, 600, 0.6, 0.3, Math.min(0.5, 0.15 + power * 0.2), 'lowpass');
  }

  thud(power: number) {
    if (!this.live()) return;
    const t = (this.ctx as AudioContext).currentTime;
    this.tone(t, 90, 0.3, Math.min(0.7, 0.25 + power * 0.04), 'sine', 50);
    this.burst(t, 400, 0.7, 0.4, Math.min(0.6, 0.2 + power * 0.03), 'lowpass');
    this.tone(t + 0.05, 600, 0.25, 0.06, 'triangle', 300);
  }

  fanfare(win: boolean) {
    if (!this.live()) return;
    const t0 = (this.ctx as AudioContext).currentTime + 0.05;
    const C = 523.25;
    const notes: [number, number, number][] = win
      ? [
          [C, 0, 0.18],
          [C * 1.25, 0.16, 0.18],
          [C * 1.5, 0.32, 0.18],
          [C * 2, 0.5, 0.6],
          [C * 1.5, 0.5, 0.6],
        ]
      : [
          [C, 0, 0.2],
          [C * 1.25, 0.18, 0.3],
          [C * 1.5, 0.4, 0.5],
        ];
    for (const [f, s, d] of notes) this.tone(t0 + s, f, d, 0.13, 'square');
    this.cheer(1, 2.6);
  }
}
