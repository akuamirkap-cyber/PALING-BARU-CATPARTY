/** Suara bowling sintetis (WebAudio) — tanpa file audio. */
export type HitKind = 'ballPin' | 'pinPin' | 'pinDeck' | 'pit' | 'land' | 'cushion' | 'gutter' | 'kick';

interface RollVoice {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  lfo: OscillatorNode;
}

export class BowlingAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: GainNode;
  private noise!: AudioBuffer;
  private rolls = new Map<number, RollVoice>();
  private budget = 0;
  private budgetT = 0;
  enabled = true;

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
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(comp);
    // gema ruangan (impuls noise meluruh)
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.32;
    this.verb.connect(conv);
    conv.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /** Matikan semua gemuruh bola (dipanggil saat meninggalkan arena). */
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rolls.forEach((r) => r.gain.gain.setTargetAtTime(0, t, 0.05));
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  private out(pan: number) {
    const ctx = this.ctx as AudioContext;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    p.connect(this.verb);
    return p;
  }

  private burst(dest: AudioNode, t: number, freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') {
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
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', endFreq?: number) {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Benturan: kekuatan 0..1, pan −1..1, jarak (m). */
  hit(kind: HitKind, strength: number, pan: number, dist: number) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.budgetT > 0.1) {
      this.budgetT = now;
      this.budget = 0;
    }
    if (this.budget > 14) return;
    this.budget++;
    const s = Math.min(1, strength);
    const att = 1 / (1 + dist * 0.09);
    const v = s * att;
    if (v < 0.01) return;
    const d = this.out(pan);
    const t = now + 0.002;
    const rr = 0.85 + Math.random() * 0.3;
    switch (kind) {
      case 'ballPin':
        this.burst(d, t, 1400 * rr, 0.9, 0.16, 0.9 * v);
        this.burst(d, t, 3200 * rr, 1.5, 0.06, 0.6 * v);
        this.tone(d, t, 120, 0.18, 0.7 * v);
        this.tone(d, t, 820 * rr, 0.12, 0.3 * v, 'triangle');
        break;
      case 'pinPin':
        this.burst(d, t, 2600 * rr, 1.6, 0.05 + 0.03 * s, 0.75 * v);
        this.tone(d, t, 1150 * rr, 0.09, 0.32 * v, 'triangle');
        this.tone(d, t, 2700 * rr, 0.05, 0.12 * v);
        break;
      case 'pinDeck':
      case 'kick':
        this.burst(d, t, 650 * rr, 1.2, 0.07, 0.55 * v);
        this.tone(d, t, 330 * rr, 0.08, 0.3 * v);
        break;
      case 'pit':
        this.burst(d, t, 320, 0.8, 0.14, 0.5 * v, 'lowpass');
        this.tone(d, t, 85, 0.16, 0.4 * v);
        break;
      case 'land':
        this.tone(d, t, 70, 0.22, 0.8 * v);
        this.burst(d, t, 380, 0.7, 0.08, 0.4 * v, 'lowpass');
        break;
      case 'cushion':
        this.burst(d, t, 200, 0.7, 0.25, 0.6 * v, 'lowpass');
        this.tone(d, t, 60, 0.25, 0.5 * v);
        break;
      case 'gutter':
        this.burst(d, t, 1600 * rr, 2, 0.04, 0.3 * v);
        break;
    }
  }

  /** Gemuruh bola menggelinding (loop per lintasan). */
  roll(lane: number, speed: number, onLane: boolean, pan: number, dist: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    let r = this.rolls.get(lane);
    if (!r) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const p = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.25;
      lfo.connect(lfoGain).connect(gain.gain);
      src.connect(filter).connect(gain).connect(p);
      p.connect(this.master);
      p.connect(this.verb);
      src.start();
      lfo.start();
      r = { src, filter, gain, pan: p, lfo };
      this.rolls.set(lane, r);
    }
    const t = ctx.currentTime;
    const target = onLane && this.enabled ? Math.min(0.55, speed * 0.075) / (1 + dist * 0.08) : 0;
    r.gain.gain.setTargetAtTime(target, t, 0.06);
    r.filter.frequency.setTargetAtTime(110 + speed * 75, t, 0.1);
    r.lfo.frequency.setTargetAtTime(2 + speed * 2.4, t, 0.1);
    r.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }

  private seq(notes: [number, number, number][], type: OscillatorType, vol: number) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const d = this.out(0);
    const t0 = this.ctx.currentTime + 0.02;
    for (const [f, start, dur] of notes) this.tone(d, t0 + start, f, dur, vol, type);
  }

  applause(amount: number, dur = 1.8) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const d = this.out(0);
    const t0 = this.ctx.currentTime;
    const n = Math.floor(amount * 70 * dur);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * dur * (0.4 + 0.6 * Math.random());
      this.burst(d, t, 1300 + Math.random() * 1500, 1.4, 0.03 + Math.random() * 0.03, 0.12 + Math.random() * 0.1);
    }
  }

  jingle(kind: 'strike' | 'spare' | 'gutter' | 'turkey' | 'end') {
    const C = 523.25;
    const E = 659.25;
    const G = 783.99;
    if (kind === 'strike' || kind === 'turkey') {
      const n: [number, number, number][] = [
        [C, 0, 0.1],
        [E, 0.08, 0.1],
        [G, 0.16, 0.1],
        [C * 2, 0.24, 0.4],
        [E * 2, 0.24, 0.4],
      ];
      if (kind === 'turkey') n.push([G * 2, 0.5, 0.5], [C * 4, 0.62, 0.6]);
      this.seq(n, 'square', 0.12);
      this.applause(1, 2.2);
    } else if (kind === 'spare') {
      this.seq(
        [
          [E, 0, 0.12],
          [C * 2, 0.1, 0.35],
        ],
        'triangle',
        0.2,
      );
      this.applause(0.55, 1.4);
    } else if (kind === 'gutter') {
      this.seq(
        [
          [392, 0, 0.32],
          [370, 0.34, 0.32],
          [349, 0.68, 0.32],
          [330, 1.02, 0.7],
        ],
        'sawtooth',
        0.08,
      );
    } else {
      this.seq(
        [
          [C, 0, 0.2],
          [E, 0.18, 0.2],
          [G, 0.36, 0.2],
          [C * 2, 0.54, 0.7],
          [G, 0.54, 0.7],
        ],
        'square',
        0.11,
      );
      this.applause(1, 2.6);
    }
  }
}
