// audio.js — 100% WebAudio-synthesised sound. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  /** Must be called from a user gesture (start button). Safe to call repeatedly. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine hum: sawtooth + lowpass, pitch follows speed (setEngineSpeed).
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain?.setTargetAtTime?.(m ? 0 : 1, this.ctx.currentTime, 0.05);
    // Fallback for contexts without a master gain node: duck the engine gain.
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : this.engineGain.gain.value;
  }

  /** speed 0..1 (0 = idle, 1 = top speed). driving=false silences the engine. */
  setEngineSpeed(speed, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed * 170, t, 0.08);
    const vol = this.muted ? 0 : (driving ? 0.03 + speed * 0.05 : 0);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
  }

  blip(freq = 880, dur = 0.09, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  pickupBlip() { this.blip(660, 0.08); setTimeout(() => this.blip(990, 0.12), 70); }
  click() { this.blip(520, 0.05, 'square', 0.06); }
  crash() { this.blip(90, 0.25, 'sawtooth', 0.18); }

  /** Two-tone siren placeholder for Builder 2's police (call startSiren/stopSiren). */
  startSiren() {
    if (!this.ctx || this.sirenOn) return;
    this.sirenOn = true;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = this.muted ? 0 : 0.04;
    this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
    this.sirenOsc.start();
    const wail = () => {
      if (!this.sirenOn || !this.sirenOsc) return;
      const t = this.ctx.currentTime;
      this.sirenOsc.frequency.setValueAtTime(700, t);
      this.sirenOsc.frequency.linearRampToValueAtTime(1100, t + 0.5);
      this.sirenOsc.frequency.linearRampToValueAtTime(700, t + 1.0);
      this.sirenTimer = setTimeout(wail, 1000);
    };
    wail();
  }

  stopSiren() {
    this.sirenOn = false;
    clearTimeout(this.sirenTimer);
    if (this.sirenOsc) { try { this.sirenOsc.stop(); } catch { /* already stopped */ } this.sirenOsc = null; }
  }
}
