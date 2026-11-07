'use strict';
// Synthesizes the score from timeline.js into out/score.wav (48 kHz, 16-bit stereo). Node built-ins only.
const fs = require('node:fs');
const path = require('node:path');
const TL = require('./timeline.js');

const SR = 48000;
const N = Math.round(TL.duration * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
let seed = 3;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// Drone: E1 with fifth and octave, slow swell; lifts after the title, presses in before the result.
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const [s0, s1] = TL.silence;
  const gate = t >= s0 && t < s1 ? 0 : t >= s1 ? seg(t, s1, s1 + 0.05) : 1;
  const env = seg(t, 0, 4) * (1 - seg(t, TL.duration - 2, TL.duration)) * gate;
  const reveal = TL.hits[1].t;
  const press = 1 + 0.35 * seg(t, reveal - 4, reveal - 0.1) * (1 - seg(t, reveal, reveal + 1));
  const lfo = 0.75 + 0.25 * Math.sin(TAU * 0.11 * t);
  const lift = seg(t, s1, s1 + 3.7) * 0.02 * Math.sin(TAU * 123.47 * t + 0.7);
  for (const [ch, off] of [[L, 0], [R, 0.35]]) {
    ch[i] += env * press * (lfo * (0.10 * Math.sin(TAU * 41.2 * t + off) + 0.05 * Math.sin(TAU * 61.74 * t + 0.3 + off)
      + 0.045 * Math.sin(TAU * 82.41 * t + 1 + off)) + 0.016 * Math.sin(TAU * 164.81 * t + 2 + off) * (0.5 + 0.5 * Math.sin(TAU * 0.07 * t)) + lift);
  }
}

// Watch tick: a differentiated noise click plus a short high ping, alternating sides.
let k = 0;
for (const { from, to, every } of TL.ticks) {
  for (let t0 = from; t0 < to - 1e-9; t0 += every, k++) {
    const i0 = Math.round(t0 * SR);
    let prev = 0;
    for (let j = 0; j < 0.03 * SR && i0 + j < N; j++) {
      const dt = j / SR;
      const n = noise();
      const s = (n - prev) * 0.32 * Math.exp(-dt / 0.0025) + 0.07 * Math.sin(TAU * 3200 * dt) * Math.exp(-dt / 0.01);
      prev = n;
      L[i0 + j] += s * (k % 2 ? 1 : 0.6);
      R[i0 + j] += s * (k % 2 ? 0.6 : 1);
    }
  }
}

// Riser into the title: filtered noise that opens up, plus a rising sine. Cuts dead at the end.
{
  const [a, b] = TL.riser;
  let lp = 0, ph = 0;
  for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) {
    const p = seg(i / SR, a, b);
    lp += (0.02 + 0.3 * p * p) * (noise() - lp);
    ph += TAU * 110 * Math.pow(2, 2 * p) / SR;
    const s = 0.24 * p * p * lp + 0.08 * p * p * Math.sin(ph);
    L[i] += s; R[i] += s;
  }
}

// Hit: falling sub, a darkening brass-like stack on A1, a noise transient, then saturation.
for (const { t: t0, gain } of TL.hits) {
  const len = Math.round(6 * SR);
  const mono = new Float32Array(len);
  let ph = 0, lp = 0;
  for (let j = 0; j < len; j++) {
    const dt = j / SR;
    ph += TAU * (38 + 32 * Math.exp(-dt / 0.12)) / SR;
    let brass = 0;
    for (let n = 1; n <= 7; n++) brass += Math.sin(TAU * 55 * n * (1 + 0.003 * n) * dt) / n;
    lp += (0.05 + 0.25 * Math.exp(-dt / 0.5)) * (brass - lp);
    const s = 0.55 * Math.sin(ph) * Math.exp(-dt / 1.8)
      + 0.2 * lp * Math.exp(-dt / 2.4) * (1 - Math.exp(-dt / 0.02))
      + 0.4 * noise() * Math.exp(-dt / 0.04);
    mono[j] = gain * Math.tanh(1.5 * s) / Math.tanh(1.5);
  }
  const i0 = Math.round(t0 * SR), d = Math.round(0.008 * SR);
  for (let j = 0; j < len; j++) {
    if (i0 + j < N) L[i0 + j] += mono[j];
    if (i0 + j + d < N) R[i0 + j + d] += mono[j];
  }
}

// Master: soft clip, normalize to -1 dBFS, write PCM.
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i]); R[i] = Math.tanh(R[i]); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.891 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(L[i] * g, -1, 1) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(clamp(R[i] * g, -1, 1) * 32767), 46 + i * 4);
}
const out = path.join(__dirname, 'out', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out}  ${TL.duration}s  peak gain ${g.toFixed(3)}`);
