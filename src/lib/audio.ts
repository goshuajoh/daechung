/** Tiny synthesized sound kit — no audio files, everything is built from oscillators & noise. */

const KEY = 'daechung:muted';

class Sfx {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(KEY) === '1';
    } catch { /* storage blocked */ }
  }

  /** Must be called from a user gesture at least once. */
  ensure(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get now() {
    return this.ensure().currentTime;
  }

  /** Delay between scheduling a sound and it leaving the speakers (best effort). */
  get latency() {
    const c = this.ensure();
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(KEY, m ? '1' : '0');
    } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; at?: number; attack?: number } = {}) {
    const c = this.ensure();
    const t = o.at ?? c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const v = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur: number, o: { freq?: number; to?: number; q?: number; vol?: number; at?: number; type?: BiquadFilterType } = {}) {
    const c = this.ensure();
    const t = o.at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ——— the kit ——— */
  pop() {
    this.tone(520, 0.09, { to: 1100, type: 'sine', vol: 0.25 });
  }
  click() {
    this.tone(1400, 0.04, { to: 900, type: 'triangle', vol: 0.12 });
  }
  /** Woodblock-ish metronome tick. */
  tick(accent = false, at?: number) {
    this.tone(accent ? 1250 : 950, 0.07, { to: accent ? 700 : 560, type: 'sine', vol: accent ? 0.5 : 0.38, at });
    this.noise(0.025, { freq: 3200, q: 2, vol: 0.12, at });
  }
  tap() {
    this.tone(330, 0.08, { to: 180, type: 'sine', vol: 0.35 });
  }
  blip(i: number) {
    this.tone(440 * Math.pow(2, Math.min(i, 36) / 24), 0.05, { type: 'triangle', vol: 0.1 });
  }
  ding() {
    const t = this.now;
    this.tone(880, 0.35, { type: 'triangle', vol: 0.22, at: t });
    this.tone(1320, 0.45, { type: 'sine', vol: 0.16, at: t + 0.08 });
  }
  fanfare() {
    const t = this.now;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.2, at: t + i * 0.09 }));
  }
  boop() {
    this.tone(300, 0.25, { to: 170, type: 'triangle', vol: 0.22 });
  }
  chop() {
    this.noise(0.12, { freq: 900, q: 0.8, vol: 0.5, type: 'lowpass' });
    this.tone(160, 0.12, { to: 70, vol: 0.4 });
  }
  whoosh(dur = 0.4) {
    this.noise(dur, { freq: 400, to: 2400, q: 1.5, vol: 0.18 });
  }
  thud() {
    this.tone(140, 0.18, { to: 60, vol: 0.45 });
    this.noise(0.08, { freq: 500, vol: 0.2, type: 'lowpass' });
  }
  shh() {
    this.noise(0.35, { freq: 2400, to: 800, q: 0.7, vol: 0.12 });
  }
}

export const sfx = new Sfx();
