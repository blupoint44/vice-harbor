// Vice Harbor — procedural sound effects, all synthesized with WebAudio.
// No audio files exist in this game: every blip, bang and wail below is an
// oscillator, a filtered noise burst or a gain envelope created in code.
// The context is created lazily on the first user gesture (browser policy).

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sirenNodes = null;
    this.engineNodes = null;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
    } catch (err) {
      this.ctx = null;
    }
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone(freqA, freqB, duration, type, volume, when = 0) {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  noise(duration, volume, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const t0 = this.now();
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.16, 0.55, 2600, 'lowpass');
    this.tone(160, 40, 0.12, 'square', 0.25);
  }

  dryFire() {
    this.tone(1200, 700, 0.04, 'square', 0.08);
  }

  hitThud() {
    this.noise(0.1, 0.3, 500);
    this.tone(90, 45, 0.1, 'sine', 0.3);
  }

  carDoor() {
    this.noise(0.07, 0.25, 900);
    this.tone(220, 120, 0.08, 'triangle', 0.15, 0.09);
  }

  pickupChime() {
    this.tone(880, 880, 0.1, 'sine', 0.22);
    this.tone(1318, 1318, 0.16, 'sine', 0.22, 0.09);
  }

  cashRegister() {
    this.tone(1568, 1568, 0.09, 'square', 0.12);
    this.tone(2093, 2093, 0.2, 'square', 0.12, 0.08);
    this.noise(0.05, 0.1, 4000, 'highpass');
  }

  missionSting(success) {
    if (success) {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => this.tone(f, f, 0.22, 'triangle', 0.2, i * 0.11));
    } else {
      const notes = [392, 330, 262];
      notes.forEach((f, i) => this.tone(f, f * 0.94, 0.26, 'triangle', 0.2, i * 0.14));
    }
  }

  bustedBuzz() {
    this.tone(196, 98, 0.7, 'sawtooth', 0.22);
    this.tone(147, 73, 0.7, 'sawtooth', 0.18, 0.05);
  }

  hurt() {
    this.tone(300, 90, 0.18, 'sawtooth', 0.2);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 820;
      lfo.type = 'sine';
      lfo.frequency.value = 0.55;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!on && this.sirenNodes) {
      const nodes = this.sirenNodes;
      this.sirenNodes = null;
      try {
        nodes.gain.gain.linearRampToValueAtTime(0.0001, this.now() + 0.25);
        nodes.osc.stop(this.now() + 0.3);
        nodes.lfo.stop(this.now() + 0.3);
      } catch (err) { /* already stopped */ }
    }
  }

  setEngine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      osc.frequency.value = 55;
      osc2.frequency.value = 28;
      gain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc2.start();
      this.engineNodes = { osc, osc2, gain, filter };
    }
    if (this.engineNodes) {
      const r = Math.min(1, Math.abs(speedRatio || 0));
      const t = this.now();
      this.engineNodes.osc.frequency.setTargetAtTime(55 + r * 130, t, 0.08);
      this.engineNodes.osc2.frequency.setTargetAtTime(28 + r * 65, t, 0.08);
      this.engineNodes.filter.frequency.setTargetAtTime(420 + r * 900, t, 0.1);
    }
    if (!on && this.engineNodes) {
      const nodes = this.engineNodes;
      this.engineNodes = null;
      try {
        nodes.gain.gain.linearRampToValueAtTime(0.0001, this.now() + 0.2);
        nodes.osc.stop(this.now() + 0.25);
        nodes.osc2.stop(this.now() + 0.25);
      } catch (err) { /* already stopped */ }
    }
  }
}
