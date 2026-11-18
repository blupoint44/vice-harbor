// Vice Harbor — every sound is synthesised with WebAudio; there are no audio files.
// The context only starts after a real user gesture (browser autoplay rules), and the
// shot scenes stay silent because a screenshot has no gesture to give.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master); engineOsc.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      return true;
    } catch (e) { return false; }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }

  window.VH = window.VH || {};
  window.VH.audio = {
    unlock: ensure,
    click() { blip(660, 0.07, 'square', 0.12); },
    cash() { blip(880, 0.1, 'square', 0.16); setTimeout(() => blip(1320, 0.16, 'square', 0.16), 70); },
    fail() { blip(220, 0.35, 'sawtooth', 0.2, 110); },
    shot() { noiseBurst(0.14, 0.4, 1400); blip(180, 0.08, 'square', 0.2, 60); },
    hurt() { blip(140, 0.18, 'sawtooth', 0.22, 80); },
    door() { noiseBurst(0.08, 0.18, 500); },
    setEngine(on, speedRatio) {
      if (!ctx || !engineGain) return;
      const target = on ? 0.05 + Math.abs(speedRatio || 0) * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      if (engineOsc) engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedRatio || 0) * 130, ctx.currentTime, 0.08);
    },
    setSiren(on, dt) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.1);
      if (on && sirenOsc) {
        sirenTimer += dt || 0.016;
        sirenOsc.frequency.value = (Math.sin(sirenTimer * 5.2) > 0) ? 960 : 640;
      }
    },
  };
})();
