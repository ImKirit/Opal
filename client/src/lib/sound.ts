import { usePrefs } from './prefs';

// Kleine synthetische Klaenge, keine Audiodateien noetig.

let ctx: AudioContext | null = null;

function audio() {
  if (!usePrefs.getState().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, length: number, type: OscillatorType = 'sine', gain = 0.08) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export const sound = {
  correct() {
    tone(784, 0, 0.16, 'triangle');
    tone(1175, 0.08, 0.26, 'triangle');
  },
  wrong() {
    tone(220, 0, 0.22, 'sawtooth', 0.04);
    tone(196, 0.07, 0.25, 'sawtooth', 0.035);
  },
  lost() {
    tone(392, 0, 0.18, 'triangle', 0.06);
    tone(330, 0.1, 0.26, 'triangle', 0.05);
  },
  tick() {
    tone(1320, 0, 0.05, 'square', 0.02);
  },
  found() {
    tone(523, 0, 0.12, 'triangle');
    tone(659, 0.09, 0.12, 'triangle');
    tone(784, 0.18, 0.22, 'triangle');
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.07));
  },
  click() {
    tone(900, 0, 0.03, 'sine', 0.03);
  },
};
