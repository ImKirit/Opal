// Screenshots von Opal ohne sichtbares Browserfenster.
// Startet Chrome headless, steuert ihn per DevTools-Protokoll und speichert PNGs.
//
// Aufruf: node Claude/scripts/shots.mjs <schritte.json> <ausgabeordner>
// Schritte: [{ "goto": "http://localhost:5174" }, { "eval": "js" }, { "wait": 1500 },
//            { "size": [1440, 900, false] }, { "shot": "name", "clip": [x, y, w, h, zoom] }]
// "size": Breite, Hoehe, mobil (true = Touch und Handy-Useragent). { "transparent": true } fuer PNGs ohne Hintergrund.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [stepsFile, outDir] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9340 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-shots-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* Chrome startet noch */
    }
    await sleep(200);
  }
  throw new Error('Chrome antwortet nicht');
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    console.log('[console.error]', msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('[exception]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
await send('Runtime.enable');

for (const step of steps) {
  if (step.goto) {
    await send('Page.navigate', { url: step.goto });
    await sleep(step.settle ?? 1800);
  } else if (step.eval) {
    const res = await send('Runtime.evaluate', { expression: step.eval, awaitPromise: true, returnByValue: true });
    const value = res.result?.result?.value;
    const err = res.result?.exceptionDetails;
    if (err) console.log('[eval-fehler]', err.exception?.description ?? err.text);
    else if (value !== undefined) console.log('[eval]', typeof value === 'string' ? value : JSON.stringify(value));
  } else if (step.transparent) {
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  } else if (step.wait) {
    await sleep(step.wait);
  } else if (step.size) {
    const [width, height, mobile] = step.size;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: Boolean(mobile) });
    await send('Emulation.setTouchEmulationEnabled', { enabled: Boolean(mobile) });
    await sleep(400);
  } else if (step.shot) {
    const clip = step.clip ? { x: step.clip[0], y: step.clip[1], width: step.clip[2], height: step.clip[3], scale: step.clip[4] ?? 3 } : undefined;
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
    const file = path.join(outDir, `${step.shot}.png`);
    fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'));
    console.log('[shot]', file);
  }
}

ws.close();
chrome.kill();
await sleep(300);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  /* Chrome haelt manchmal noch Dateien, egal */
}
