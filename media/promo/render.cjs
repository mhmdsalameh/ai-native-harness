'use strict';
// Renders index.html frame by frame through the Chrome DevTools protocol and encodes with ffmpeg.
//   node render.cjs                       -> out/harness-builder.mp4 (muxes out/score.wav if present)
//   node render.cjs --stills 3,14,35      -> out/stills/t-3.png ... (review frames, no encode)
//   node render.cjs --chrome <path> --out <file.mp4>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const TL = require('./timeline.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CHROME = opt('--chrome', process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const OUT = path.resolve(opt('--out', path.join(__dirname, 'out', 'harness-builder.mp4')));
const STILLS = opt('--stills', null);
const WAV = path.join(__dirname, 'out', 'score.wav');

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for Chrome');
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP connect failed')); });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(`${m.error.message} ${m.error.data || ''}`)); else res(m.result);
    } else listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const once = (method) => new Promise((res) => {
    const f = (m) => { if (m.method === method) { listeners.delete(f); res(m.params); } };
    listeners.add(f);
  });
  return { send, once, close: () => ws.close() };
}

async function evaluate(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-film-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1920,1080', '--force-color-profile=srgb',
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let ff;
  try {
    const port = await waitFor(() => {
      try { return fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { return null; }
    });
    const page = await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return list.find((p) => p.type === 'page');
    });
    const c = await cdp(page.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const loaded = c.once('Page.loadEventFired');
    await c.send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'index.html')).href });
    await loaded;
    const duration = await evaluate(c, 'window.ready');
    const fontsOk = await evaluate(c, "document.fonts.check('800 120px Archivo') && document.fonts.check('30px \"JetBrains Mono\"')");
    if (!fontsOk) throw new Error('web fonts did not load (Archivo / JetBrains Mono); check network access to fonts.googleapis.com');

    const shot = async (t) => {
      await evaluate(c, `window.renderFrame(${t})`);
      const { data } = await c.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      return Buffer.from(data, 'base64');
    };

    if (STILLS) {
      const dir = path.join(path.dirname(OUT), 'stills');
      fs.mkdirSync(dir, { recursive: true });
      for (const s of STILLS.split(',').map(Number)) {
        const f = path.join(dir, `t-${s}.png`);
        fs.writeFileSync(f, await shot(s));
        console.log(f);
      }
      c.close();
      return;
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const audio = fs.existsSync(WAV) ? ['-i', WAV] : [];
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'png', '-i', '-',
      ...audio, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-r', String(TL.fps), ...(audio.length ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=14', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
      '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
    const frames = Math.round(duration * TL.fps);
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      const png = await shot(f / TL.fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      if (f % 150 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await ffDone;
    c.close();
    console.log(`wrote ${OUT}${audio.length ? ' (with score)' : ' (no score.wav found, silent)'}`);
  } finally {
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome may still hold files on Windows */ }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
