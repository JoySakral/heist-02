// WebAudio synth sounds for The Marigold Job: every effect is an oscillator
// or a burst of filtered noise, so the game ships no audio files at all.
let ctx = null;

function ac() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type, vol, delay, slideTo) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (delay || 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur, vol, cutoff) {
  const c = ac();
  if (!c) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff || 900;
  const gain = c.createGain();
  gain.gain.value = vol || 0.15;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}

export const sfx = {
  unlockAudio() {
    ac();
  },
  click() {
    tone(660, 0.06, 'square', 0.06);
  },
  step() {
    tone(140, 0.05, 'triangle', 0.03);
  },
  gem() {
    tone(1180, 0.12, 'sine', 0.09);
    tone(1760, 0.16, 'sine', 0.07, 0.07);
  },
  loot() {
    tone(523, 0.14, 'triangle', 0.12);
    tone(659, 0.14, 'triangle', 0.12, 0.1);
    tone(784, 0.22, 'triangle', 0.12, 0.2);
  },
  smoke() {
    noiseBurst(0.5, 0.16, 700);
  },
  emp() {
    tone(1400, 0.28, 'sawtooth', 0.07, 0, 180);
    noiseBurst(0.2, 0.1, 3200);
  },
  door() {
    tone(320, 0.08, 'square', 0.07);
    tone(480, 0.1, 'square', 0.07, 0.09);
  },
  lockTick() {
    tone(220, 0.04, 'square', 0.04);
  },
  spotted() {
    tone(880, 0.16, 'square', 0.08, 0, 620);
    tone(880, 0.16, 'square', 0.08, 0.18, 620);
  },
  busted() {
    tone(220, 0.5, 'sawtooth', 0.12, 0, 90);
    tone(110, 0.7, 'sawtooth', 0.1, 0.15, 55);
  },
  clear() {
    tone(523, 0.16, 'triangle', 0.11);
    tone(659, 0.16, 'triangle', 0.11, 0.12);
    tone(784, 0.16, 'triangle', 0.11, 0.24);
    tone(1046, 0.3, 'triangle', 0.11, 0.36);
  },
  win() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((n, i) => tone(n, 0.22, 'triangle', 0.11, i * 0.13));
  },
  denied() {
    tone(180, 0.12, 'square', 0.07);
  },
};
