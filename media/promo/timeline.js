// Single source of timing for the picture (index.html) and the score (audio.cjs). Seconds.
const TL = {
  fps: 30,
  duration: 58,
  letterbox: { height: 138, open: [12.3, 13.5], close: [51, 52.2] },
  scenes: {
    s1: [0, 6], s2: [6, 12], s3: [12.3, 18], s4: [18, 24], s5: [24, 31],
    s6: [31, 41], s7: [41, 46], s8: [46, 51], s9: [51, 58],
  },
  hits: [{ t: 12.3, gain: 1 }, { t: 35.0, gain: 0.6 }, { t: 54.2, gain: 0.85 }],
  riser: [10.2, 12.0],
  silence: [12.0, 12.3],
  ticks: [
    { from: 0.5, to: 11.9, every: 0.5 },
    { from: 18, to: 33, every: 0.5 },
    { from: 33, to: 34.9, every: 0.25 },
  ],
  repo: 'github.com/mhmdsalameh/ai-native-harness',
  marketplace: 'mhmdsalameh/ai-native-harness',
};
if (typeof module !== 'undefined') module.exports = TL; else window.TL = TL;
