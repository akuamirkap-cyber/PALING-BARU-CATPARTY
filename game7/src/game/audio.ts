// SFX sintetis sederhana (tanpa file audio)
class GameAudio {
  ctx: AudioContext | null = null;
  muted = false;
  private noiseBuf: AudioBuffer | null = null;

  resume() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private blip(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, type: BiquadFilterType = 'lowpass', delay = 0) {
    if (!this.ctx || this.muted) return;
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.ctx.destination);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  splash(big = 1) {
    this.noise(0.35 * big, 0.22, 1800);
    this.blip(300, 0.15, 'sine', 0.08, -150);
  }
  cast() {
    this.noise(0.28, 0.12, 2500, 'bandpass');
    this.blip(500, 0.25, 'sine', 0.05, -300);
  }
  bite() {
    this.blip(880, 0.1, 'square', 0.12);
    this.blip(1320, 0.18, 'square', 0.12, 0, 0.1);
  }
  hook() {
    this.blip(500, 0.12, 'triangle', 0.2, 500);
  }
  reelTick(p = 0.5) {
    this.blip(300 + p * 300, 0.04, 'square', 0.04);
  }
  catchFish(value = 20) {
    const base = 440 + Math.min(value, 120) * 2;
    [0, 4, 7, 12].forEach((s, i) => this.blip(base * Math.pow(2, s / 12), 0.18, 'triangle', 0.16, 0, i * 0.07));
  }
  lose() {
    this.blip(400, 0.4, 'sawtooth', 0.1, -280);
  }
  punch() {
    this.noise(0.12, 0.3, 700);
    this.blip(160, 0.14, 'square', 0.18, -90);
  }
  bump() {
    this.blip(120, 0.1, 'sine', 0.2, -50);
  }
  jump() {
    this.blip(300, 0.15, 'sine', 0.08, 300);
  }
  tick() {
    this.blip(800, 0.07, 'square', 0.08);
  }
  go() {
    this.blip(1000, 0.4, 'square', 0.12);
  }
  fanfare() {
    [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.blip(523 * Math.pow(2, s / 12), 0.22, 'triangle', 0.16, 0, i * 0.12));
  }
  horn() {
    this.blip(220, 0.7, 'sawtooth', 0.12);
    this.blip(277, 0.7, 'sawtooth', 0.1);
  }
  // ---- go-kart ----
  private eng: { o1: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode } | null = null;
  engineOn() {
    if (!this.ctx || this.eng) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.ctx.destination);
    o1.start();
    o2.start();
    this.eng = { o1, o2, g, f };
  }
  engineSet(n: number, boost: boolean) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    const fr = 55 + n * 120 + (boost ? 35 : 0);
    this.eng.o1.frequency.setTargetAtTime(fr, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.05);
    this.eng.f.frequency.setTargetAtTime(380 + n * 900, t, 0.05);
    this.eng.g.gain.setTargetAtTime(this.muted ? 0 : 0.035 + n * 0.03, t, 0.08);
  }
  engineOff() {
    if (!this.eng) return;
    const e = this.eng;
    this.eng = null;
    try {
      e.g.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05);
      e.o1.stop(this.ctx!.currentTime + 0.3);
      e.o2.stop(this.ctx!.currentTime + 0.3);
    } catch {
      /* noop */
    }
  }
  itemGet() {
    [0, 7, 12, 19].forEach((s, i) => this.blip(660 * Math.pow(2, s / 12), 0.12, 'square', 0.09, 0, i * 0.05));
  }
  boost() {
    this.noise(0.5, 0.2, 2200, 'bandpass');
    this.blip(200, 0.45, 'sawtooth', 0.12, 700);
  }
  spin() {
    this.blip(700, 0.7, 'triangle', 0.16, -520);
    this.noise(0.25, 0.15, 900);
  }
  drift() {
    this.noise(0.12, 0.06, 3000, 'highpass');
  }
  miniTurbo(level = 1) {
    this.blip(500 + level * 250, 0.12, 'square', 0.08, 300);
  }
  lap() {
    [0, 5, 9, 12].forEach((s, i) => this.blip(587 * Math.pow(2, s / 12), 0.16, 'triangle', 0.15, 0, i * 0.08));
  }
  bananaDrop() {
    this.blip(260, 0.14, 'sine', 0.12, -120);
  }
  shellShot() {
    this.noise(0.25, 0.14, 2600, 'bandpass');
    this.blip(900, 0.3, 'sawtooth', 0.07, -600);
  }
  explode() {
    this.noise(0.5, 0.3, 700);
    this.blip(120, 0.4, 'sawtooth', 0.15, -80);
  }
  // ---- duck hunt / sniper ----
  snipe(vol = 1) {
    if (!this.ctx || this.muted) return;
    this.noise(0.5, 0.34 * vol, 1500);
    this.noise(0.09, 0.3 * vol, 4200, 'highpass');
    this.blip(110, 0.32, 'sine', 0.3 * vol, -75);
    this.noise(0.6, 0.12 * vol, 650, 'lowpass', 0.16);
    this.blip(70, 0.4, 'sine', 0.08 * vol, -30, 0.14);
  }
  bolt() {
    this.blip(1500, 0.03, 'square', 0.06);
    this.blip(780, 0.04, 'square', 0.07, 0, 0.1);
    this.noise(0.05, 0.1, 3000, 'highpass', 0.1);
    this.blip(1100, 0.03, 'square', 0.06, 0, 0.2);
  }
  reloadStart() {
    this.noise(0.06, 0.12, 2200, 'bandpass');
    this.blip(600, 0.05, 'square', 0.06, 0, 0.35);
    this.blip(500, 0.05, 'square', 0.06, 0, 0.65);
  }
  emptyClick() {
    this.blip(1200, 0.025, 'square', 0.07);
  }
  scopeIn() {
    this.blip(300, 0.16, 'sine', 0.06, 700);
    this.noise(0.08, 0.05, 3500, 'highpass');
  }
  quack(pitch = 1, vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(560 * pitch, t + k * 0.16);
      o.frequency.exponentialRampToValueAtTime(330 * pitch, t + k * 0.16 + 0.12);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1300;
      f.Q.value = 3.5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + k * 0.16);
      g.gain.linearRampToValueAtTime(vol, t + k * 0.16 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.16 + 0.13);
      o.connect(f).connect(g).connect(c.destination);
      o.start(t + k * 0.16);
      o.stop(t + k * 0.16 + 0.16);
    }
  }
  duckHit(vol = 1) {
    this.noise(0.14, 0.2 * vol, 900);
    this.blip(200, 0.12, 'triangle', 0.14 * vol, -120);
    this.noise(0.18, 0.08 * vol, 3500, 'highpass', 0.04);
  }
  headshot() {
    this.blip(1760, 0.16, 'sine', 0.14);
    this.blip(2349, 0.22, 'sine', 0.12, 0, 0.07);
  }
  goldGet() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.blip(784 * Math.pow(2, s / 12), 0.14, 'triangle', 0.14, 0, i * 0.06));
  }
  goldAppear() {
    [12, 16, 19].forEach((s, i) => this.blip(660 * Math.pow(2, s / 12), 0.2, 'sine', 0.07, 0, i * 0.1));
  }
  boom() {
    this.noise(0.6, 0.34, 600);
    this.blip(90, 0.5, 'sawtooth', 0.2, -60);
  }
  dive() {
    this.noise(0.22, 0.12, 1200, 'bandpass');
    this.blip(260, 0.2, 'sine', 0.06, 300);
  }
  streak(level = 1) {
    this.blip(660 + level * 160, 0.1, 'square', 0.07, 200);
  }
  dogLaugh() {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 9; i++) this.blip(560 + (i % 2) * 110, 0.09, 'sawtooth', 0.075, -90, i * 0.11);
    this.blip(420, 0.3, 'sawtooth', 0.07, -140, 1.0);
  }
  bark() {
    this.noise(0.12, 0.12, 900, 'bandpass');
    this.blip(300, 0.12, 'sawtooth', 0.1, -120);
  }
  // ---- bom atap ----
  bombWhistle(vol = 1) {
    this.blip(1700, 0.85, 'sine', 0.05 * vol, -1250);
  }
  bombThud(vol = 1) {
    this.noise(0.1, 0.2 * vol, 520);
    this.blip(95, 0.14, 'sine', 0.22 * vol, -45);
  }
  fuseBeep(f = 1, vol = 1) {
    this.blip(780 + f * 620, 0.045, 'square', 0.045 * vol);
  }
  bigBoom(vol = 1) {
    this.noise(0.95, 0.46 * vol, 420);
    this.noise(0.25, 0.32 * vol, 3600, 'highpass');
    this.blip(72, 0.75, 'sawtooth', 0.3 * vol, -48);
    this.blip(46, 0.95, 'sine', 0.38 * vol, -20, 0.03);
  }
  grab() {
    this.blip(480, 0.09, 'triangle', 0.11, 320);
    this.blip(760, 0.07, 'triangle', 0.08, 0, 0.07);
  }
  toss() {
    this.noise(0.2, 0.11, 1800, 'bandpass');
    this.blip(330, 0.22, 'sine', 0.08, 380);
  }
  scream() {
    this.blip(950, 1.3, 'sawtooth', 0.07, -700);
    this.blip(1250, 1.1, 'triangle', 0.04, -900, 0.05);
  }
  waveUp() {
    [0, 4, 7, 12].forEach((s, i) => this.blip(392 * Math.pow(2, s / 12), 0.16, 'square', 0.08, 0, i * 0.09));
  }
  // ---- pesawat ----
  windRush(vol = 1) {
    this.noise(1.7, 0.2 * vol, 700, 'bandpass');
    this.noise(1.2, 0.1 * vol, 1800, 'bandpass', 0.2);
    this.blip(220, 1.3, 'sine', 0.05 * vol, 160);
  }
  alarm() {
    [0, 0.17].forEach((d) => this.blip(880, 0.1, 'square', 0.06, 0, d));
  }
  birdCry(vol = 1) {
    this.blip(1300, 0.18, 'sawtooth', 0.06 * vol, -420);
    this.blip(1550, 0.2, 'sawtooth', 0.05 * vol, -520, 0.2);
  }
  rumble() {
    this.noise(0.7, 0.3, 260, 'lowpass');
    this.blip(60, 0.55, 'sawtooth', 0.14, -18);
  }
  creak() {
    this.blip(310, 0.5, 'sawtooth', 0.04, -150);
  }
  // ---- bola salju ----
  snowBuild(p = 0.5) {
    this.noise(0.12, 0.1, 2200 + p * 1800, 'bandpass');
    this.blip(180 + p * 160, 0.05, 'triangle', 0.03);
  }
  snowRelease() {
    this.noise(0.35, 0.16, 1500, 'bandpass');
    this.blip(260, 0.3, 'sine', 0.07, 280);
  }
  snowRoll(v = 0.5, big = 0.5) {
    this.noise(0.13, 0.05 + v * 0.09, 380 + v * 700 - big * 120, 'lowpass');
  }
  snowHit(big = 1) {
    this.noise(0.22, 0.2 * big, 700, 'lowpass');
    this.blip(130, 0.16, 'sine', 0.16 * big, -60);
    this.noise(0.1, 0.1 * big, 3400, 'highpass', 0.03);
  }
  snowPop() {
    this.noise(0.18, 0.15, 1400, 'bandpass');
    this.blip(520, 0.09, 'triangle', 0.1, 260);
  }
  snowStrike(level = 1) {
    [0, 4, 7, 12, 16].slice(0, 3 + Math.min(2, level)).forEach((x, i) => this.blip(660 * Math.pow(2, x / 12), 0.14, 'triangle', 0.14, 0, i * 0.06));
  }
  snowBonk() {
    this.blip(220, 0.12, 'square', 0.1, -110);
    this.noise(0.08, 0.1, 900);
  }
  snowGold() {
    [0, 5, 9, 12, 17, 21].forEach((x, i) => this.blip(740 * Math.pow(2, x / 12), 0.15, 'sine', 0.12, 0, i * 0.05));
  }
  // ---- kuil batu ----
  rockRumble() {
    this.noise(1.3, 0.22, 170, 'lowpass');
    this.blip(52, 1.2, 'sawtooth', 0.1, -14);
  }
  rockRoll(v = 0.5) {
    this.noise(0.14, 0.05 + v * 0.17, 150 + v * 260, 'lowpass');
  }
  rockCrash(v = 1) {
    this.noise(0.95, 0.42 * v, 520, 'lowpass');
    this.noise(0.25, 0.28 * v, 3200, 'highpass');
    this.blip(64, 0.7, 'sawtooth', 0.28 * v, -40);
  }
  rockHit() {
    this.noise(0.25, 0.28, 450, 'lowpass');
    this.blip(110, 0.25, 'sine', 0.26, -70);
    this.blip(520, 0.07, 'square', 0.06, -300, 0.02);
  }
  idolGet() {
    [0, 4, 7, 12, 16, 19].forEach((x, i) => this.blip(660 * Math.pow(2, x / 12), 0.16, 'triangle', 0.14, 0, i * 0.07));
  }
  // ---- hiu & pantai ----
  sharkWarn() {
    this.blip(98, 0.28, 'sine', 0.16);
    this.blip(104, 0.34, 'sine', 0.16, 0, 0.3);
  }
  sharkLunge() {
    this.noise(0.4, 0.2, 1100, 'bandpass');
    this.blip(180, 0.35, 'sawtooth', 0.07, 520);
  }
  sharkChomp() {
    this.noise(0.12, 0.34, 1800, 'bandpass');
    this.blip(140, 0.18, 'square', 0.2, -90);
    this.blip(70, 0.25, 'sine', 0.26, -30, 0.02);
    this.noise(0.12, 0.18, 4000, 'highpass', 0.1);
  }
  boing() {
    this.blip(260, 0.55, 'sine', 0.2, 640);
    this.blip(420, 0.35, 'triangle', 0.12, 520, 0.1);
  }
  wheee() {
    this.blip(500, 0.9, 'triangle', 0.1, -280);
    this.blip(760, 0.7, 'sine', 0.06, -360, 0.05);
  }
  rankUp(level = 1) {
    [0, 5, 9, 12, 17, 21].slice(0, 3 + Math.min(3, level)).forEach((x, i) => this.blip(660 * Math.pow(2, x / 12), 0.15, 'triangle', 0.14, 0, i * 0.065));
  }
}

export const sfx = new GameAudio();
