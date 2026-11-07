# Promo film

A 58-second, 1920x1080, 30 fps film of the harness-builder plugin. Everything is code: the picture is
`index.html` driven by time, the score is synthesized, and ffmpeg encodes both.

| File | Role |
|---|---|
| `timeline.js` | Scene times, letterbox, sound cues, repo name. Change timing here only. |
| `index.html` | The stage. `window.renderFrame(t)` draws the frame for second `t`. |
| `audio.cjs` | Writes `out/score.wav` from the timeline cues. |
| `render.cjs` | Drives headless Chrome over the DevTools protocol and pipes frames to ffmpeg. |

Requires Node 22+, Chrome, ffmpeg on PATH, and network access to Google Fonts.

```
node audio.cjs                          # out/score.wav
node render.cjs                         # out/harness-builder.mp4 (about 3.5 minutes)
node render.cjs --stills 13.2,35.6      # review frames in out/stills/
```

The eval numbers on screen are the self-proof run of 2026-11-07 (`--runs 1`, $1.25). Update the
`ROWS` table in `index.html` when a newer run replaces it.
