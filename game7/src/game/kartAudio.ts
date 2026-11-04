import { sfx } from './audio';

export interface AudioRacer {
  isPlayer: boolean;
  vf: number;
  gas: number;
  boost: boolean;
  slip: number;
  drifting: boolean;
  off: boolean;
  dist: number;
  pan: number;
  closing: number;
  spin: boolean;
  air: boolean;
}

interface Voice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  o3: OscillatorNode;
  lfo: OscillatorNode;
  filt: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
  rpm: number;
  gear: number;
  shiftT: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ROOTS = [110, 87.31, 130.81, 98];
const GEAR_LO = [0, 11, 22];
const GEAR_HI = [11, 22, 38];

function distCurve(k: number) {
  const n = 256;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return c;
}

class KartAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private voices: Voice[] = [];
  private noise!: AudioBuffer;
  private stoppers: (() => void)[] = [];
  private screech!: { g: GainNode; f: BiquadFilterNode };
  private wind!: { g: GainNode; f: BiquadFilterNode };
  private rumble!: { g: GainNode; f: BiquadFilterNode };
  private fire!: { g: GainNode; f: BiquadFilterNode };
  private whine!: { o: OscillatorNode; g: GainNode };
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private tempo = 138;
  private prevGas = 0;
  private t = 0;
  running = false;

  start(n = 4) {
    sfx.resume();
    const ctx = sfx.ctx;
    if (!ctx || this.running) return;
    this.ctx = ctx;
    this.running = true;
    this.stoppers = [];
    this.master = ctx.createGain();
    this.master.gain.value = sfx.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.7;
    this.musicGain.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.voices = [];
    for (let i = 0; i < n; i++) this.voices.push(this.makeVoice());

    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master);
      s.start();
      this.stoppers.push(() => s.stop());
      return { g, f };
    };
    this.screech = loop('bandpass', 1900, 7);
    this.wind = loop('bandpass', 600, 0.6);
    this.rumble = loop('lowpass', 420, 1);
    this.fire = loop('bandpass', 1500, 0.8);
    const wo = ctx.createOscillator();
    wo.type = 'sawtooth';
    wo.frequency.value = 500;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 900;
    wf.Q.value = 4;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wo.connect(wf).connect(wg).connect(this.master);
    wo.start();
    this.stoppers.push(() => wo.stop());
    this.whine = { o: wo, g: wg };

    // musik
    this.tempo = 138;
    this.step = 0;
    this.nextT = ctx.currentTime + 0.15;
    this.timer = window.setInterval(this.sched, 30);
  }

  stop() {
    if (!this.running || !this.ctx) return;
    this.running = false;
    window.clearInterval(this.timer);
    const ctx = this.ctx;
    const m = this.master;
    m.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    const vs = this.voices;
    const st = this.stoppers;
    this.voices = [];
    this.stoppers = [];
    window.setTimeout(() => {
      for (const v of vs) {
        try {
          v.o1.stop();
          v.o2.stop();
          v.o3.stop();
          v.lfo.stop();
        } catch {
          /* noop */
        }
      }
      for (const s of st) {
        try {
          s();
        } catch {
          /* noop */
        }
      }
      m.disconnect();
    }, 300);
  }

  private makeVoice(): Voice {
    const c = this.ctx!;
    const mk = (type: OscillatorType) => {
      const o = c.createOscillator();
      o.type = type;
      return o;
    };
    const o1 = mk('sawtooth');
    const o2 = mk('square');
    const o3 = mk('sawtooth');
    const lfo = mk('sine');
    const g1 = c.createGain();
    const g2 = c.createGain();
    const g3 = c.createGain();
    g1.gain.value = 0.5;
    g2.gain.value = 0.3;
    g3.gain.value = 0.2;
    const mix = c.createGain();
    const sh = c.createWaveShaper();
    sh.curve = distCurve(14);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 2.5;
    filt.frequency.value = 800;
    const am = c.createGain();
    am.gain.value = 0.8;
    const lg = c.createGain();
    lg.gain.value = 0.2;
    lfo.connect(lg).connect(am.gain);
    const gain = c.createGain();
    gain.gain.value = 0;
    o1.connect(g1).connect(mix);
    o2.connect(g2).connect(mix);
    o3.connect(g3).connect(mix);
    mix.connect(sh).connect(filt).connect(am).connect(gain);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) gain.connect(pan).connect(this.master);
    else gain.connect(this.master);
    for (const o of [o1, o2, o3, lfo]) o.start();
    return { o1, o2, o3, lfo, filt, gain, pan, rpm: 0.25, gear: 0, shiftT: 0 };
  }

  update(list: AudioRacer[], dt: number, phase: string, lastLap: boolean) {
    if (!this.running || !this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.t += dt;
    const muted = sfx.muted;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.05);
    this.musicGain.gain.setTargetAtTime(phase === 'results' ? 0.35 : 0.7, t, 0.3);
    this.tempo = lastLap ? 156 : 138;

    list.forEach((r, i) => {
      const v = this.voices[i];
      if (!v) return;
      const spd = Math.abs(r.vf);
      const gear = spd < GEAR_HI[0] ? 0 : spd < GEAR_HI[1] ? 1 : 2;
      const frac = clamp((spd - GEAR_LO[gear]) / (GEAR_HI[gear] - GEAR_LO[gear]), 0, 1);
      let target = 0.36 + 0.64 * frac;
      if (r.gas > 0 && spd < 5) target = Math.max(target, 0.4 + 0.4 * r.gas);
      if (r.gas === 0) target = 0.2 + target * 0.5;
      if (r.air) target += 0.25;
      if (r.spin) target *= 0.6;
      target = clamp(target, 0.15, 1.1);
      if (gear > v.gear) {
        v.shiftT = 0.13;
        if (r.isPlayer) this.burst(0.03, 0.05, 3500, 'highpass');
      }
      v.gear = gear;
      if (v.shiftT > 0) v.shiftT -= dt;
      v.rpm += (target - v.rpm) * (1 - Math.exp(-dt * (target > v.rpm ? 8 : 4.5)));

      const boost = r.boost ? 1.07 : 1;
      let dop = 1;
      if (!r.isPlayer) dop = 343 / (343 - clamp(r.closing * 6, -120, 120));
      const f = (75 + 235 * v.rpm) * boost * dop;
      v.o1.frequency.setTargetAtTime(f, t, 0.025);
      v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.025);
      v.o3.frequency.setTargetAtTime(f * 2.01, t, 0.025);
      v.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.05);

      const att = r.isPlayer ? 1 : Math.pow(1 / (1 + r.dist / 9), 1.6);
      const load = r.gas > 0 ? 1 : 0.35;
      let vol = (0.035 + 0.075 * load * (0.5 + 0.5 * v.rpm)) * (r.boost ? 1.25 : 1) * (r.isPlayer ? 1 : 0.85) * att;
      if (v.shiftT > 0) vol *= 0.35;
      if (phase === 'results') vol *= 0.5;
      v.gain.gain.setTargetAtTime(vol, t, 0.04);
      const cutoff = (450 + v.rpm * 1900 + (r.gas > 0 ? 700 : 0)) * (0.45 + 0.55 * att);
      v.filt.frequency.setTargetAtTime(cutoff, t, 0.04);
      if (v.pan) v.pan.pan.setTargetAtTime(r.isPlayer ? 0 : clamp(r.pan, -1, 1) * 0.9, t, 0.05);

      if (r.isPlayer) {
        // backfire saat gas dilepas di kecepatan tinggi
        if (this.prevGas > 0.5 && r.gas === 0 && spd > 26) {
          this.burst(0.09, 0.14, 900, 'lowpass');
          this.burst(0.05, 0.1, 2500, 'bandpass', 0.07);
          this.tone(130, 0.12, 'square', 0.07, -70);
        }
        this.prevGas = r.gas;

        const sl = r.drifting ? Math.max(0.4, r.slip * 2) : r.slip > 0.1 ? r.slip * 1.5 : 0;
        const sv = spd > 6 ? clamp(sl, 0, 1) * 0.14 : 0;
        this.screech.g.gain.setTargetAtTime(sv, t, 0.05);
        this.screech.f.frequency.setTargetAtTime(1500 + sl * 900 + Math.sin(this.t * 37) * 160 + Math.sin(this.t * 11) * 120, t, 0.03);
        const s01 = clamp(spd / 34, 0, 1.5);
        this.wind.g.gain.setTargetAtTime(0.008 + s01 * s01 * 0.03 + (r.boost ? 0.012 : 0), t, 0.1);
        this.wind.f.frequency.setTargetAtTime(400 + spd * 28, t, 0.1);
        this.rumble.g.gain.setTargetAtTime(r.off && spd > 3 ? clamp(spd / 20, 0, 1) * 0.1 : 0, t, 0.06);
        this.fire.g.gain.setTargetAtTime(r.boost ? 0.05 : 0, t, 0.05);
        this.fire.f.frequency.setTargetAtTime(1200 + Math.sin(this.t * 25) * 300, t, 0.03);
        this.whine.g.gain.setTargetAtTime(r.boost ? 0.03 : 0, t, 0.06);
        this.whine.o.frequency.setTargetAtTime(380 + spd * 9, t, 0.05);
      }
    });
  }

  // ---------- util ----------
  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType, delay = 0, at?: number) {
    if (!this.ctx || sfx.muted) return;
    const c = this.ctx;
    const t = (at ?? c.currentTime) + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, at?: number, dest?: AudioNode) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = at ?? c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // ---------- musik ----------
  private sched = () => {
    if (!this.ctx || !this.running) return;
    while (this.nextT < this.ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextT);
      this.nextT += 60 / this.tempo / 4;
      this.step = (this.step + 1) % 64;
    }
  };

  private playStep(s: number, t: number) {
    const bar = Math.floor(s / 16) % 4;
    const k = s % 16;
    const root = ROOTS[bar];
    const mg = this.musicGain;
    if (k % 4 === 0) this.tone(150, 0.16, 'sine', 0.32, -110, t, mg);
    if (k === 4 || k === 12) {
      this.burst(0.12, 0.1, 1800, 'bandpass', 0, t);
      this.tone(210, 0.08, 'triangle', 0.08, -90, t, mg);
    }
    if (k % 2 === 0) this.burst(0.035, k % 4 === 2 ? 0.05 : 0.025, 7000, 'highpass', 0, t);
    const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
    if (bassPat[k]) this.tone(root * (k === 6 || k === 13 ? 2 : 1), 0.2, 'sawtooth', 0.075, 0, t, mg);
    if (k % 2 === 0) {
      const minor = bar === 0;
      const mult = [1, minor ? 1.189 : 1.26, 1.498, 2];
      const pat = [0, 1, 2, 3, 2, 1, 2, 1];
      this.tone(root * 4 * mult[pat[(k / 2) | 0]], 0.13, 'square', 0.022, 0, t, mg);
    }
    // melodi pendek tiap bar ke-3 & 4
    if (bar >= 2 && (k === 0 || k === 6 || k === 10)) {
      const mel = bar === 2 ? [783.99, 659.25, 783.99] : [587.33, 698.46, 587.33];
      this.tone(mel[k === 0 ? 0 : k === 6 ? 1 : 2], 0.22, 'triangle', 0.05, 0, t, mg);
    }
  }
}

export const kartAudio = new KartAudio();
