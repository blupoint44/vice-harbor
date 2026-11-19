// audio.js — every sound in Vice Harbor is synthesized with WebAudio.
// No audio files ship with the game; a tiny synth builds engine hum, sirens,
// gunshots, impacts and UI stings from oscillators and filtered noise.
// Sound starts on the first user gesture (browser autoplay rules).

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

  // Create the context lazily; safe to call on every gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startSiren();
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  // Engine pitch follows speed; volume is zero on foot.
  setEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
  }

  startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // Sirens are audible only while police are close and active.
  setSiren(level) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.035, this.ctx.currentTime, 0.25);
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  noiseBurst(dur, vol, freq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq || 900;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.2;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  shoot() {
    this.noiseBurst(0.12, 0.28, 1400);
    this.blip(160, 0.1, 'square', 0.1, 60);
  }

  hit() {
    this.blip(220, 0.08, 'square', 0.08, 110);
  }

  crash() {
    this.noiseBurst(0.25, 0.3, 300);
  }

  door() {
    this.blip(90, 0.09, 'sine', 0.15, 60);
  }

  pickup() {
    this.blip(660, 0.09, 'square', 0.1);
    setTimeout(() => this.blip(990, 0.12, 'square', 0.1), 70);
  }

  cashSting() {
    this.blip(523, 0.1, 'triangle', 0.12);
    setTimeout(() => this.blip(659, 0.1, 'triangle', 0.12), 90);
    setTimeout(() => this.blip(784, 0.16, 'triangle', 0.12), 180);
  }

  failSting() {
    this.blip(330, 0.16, 'triangle', 0.12, 262);
    setTimeout(() => this.blip(262, 0.24, 'triangle', 0.12, 196), 150);
  }

  starUp() {
    this.blip(440, 0.08, 'square', 0.09, 587);
  }
}
