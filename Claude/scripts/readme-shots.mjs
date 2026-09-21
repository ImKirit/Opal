// Erzeugt alle README-Bilder in docs/ neu. Braucht laufenden Server und Client.
// Aufruf aus dem Projekt-Root: node Claude/scripts/readme-shots.mjs [http://localhost:5174]
// Achtung: legt Spiele in der lokalen Datenbank an (Gast "Kirit", Trainings gegen Bots).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5174';
const root = process.cwd();
const out = path.join(root, 'docs');

// Antworten aus den Paketen, damit das Skript im Duell gezielt richtig antworten kann
const answers = {};
for (const f of fs.readdirSync(path.join(root, 'packs'))) {
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'packs', f), 'utf8'));
  for (const s of pack.sections) for (const q of s.questions) answers[q.q] = q.a;
}

const helpers = `
  window.__A = ${JSON.stringify(answers)};
  window.__btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
  window.__set = (inp, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__solve = () => {
    const t = document.querySelector('.qcard__text')?.textContent; const a = window.__A[t]; if (!a) return 'keine Frage';
    const b = [...document.querySelectorAll('.answer--big')].find((x) => x.querySelector('.answer__text')?.textContent === a);
    if (b && !b.disabled) { b.click(); return 'klick'; }
    const inp = document.querySelector('.typed__field input');
    if (inp && !inp.disabled) { window.__set(inp, a); inp.closest('form').requestSubmit(); return 'tipp'; }
    return 'gesperrt';
  };
  window.__auto = (on) => { clearInterval(window.__t); if (!on) return 'aus'; let last = ''; window.__t = setInterval(() => {
    const t = document.querySelector('.qcard__text')?.textContent; if (t && t !== last && !document.querySelector('.reveal')) { last = t; setTimeout(window.__solve, 900 + Math.random() * 5200); } }, 250); return 'an'; };
  'helfer da';
`;

const steps = [
  { size: [1440, 900, false] },
  { goto: BASE, settle: 2500 },
  { eval: helpers },
  { eval: "__set(document.querySelector('#guest-name'), 'Kirit'); 'name'" },
  { wait: 400 },
  { shot: 'tour-1-start' },
  { eval: "__btn('Los').click(); 'login'" },
  { wait: 2500 },
  { eval: "location.hash = '#/pakete'; 'pakete'" },
  { wait: 1400 },
  { eval: "document.querySelectorAll('.pack__head')[1].click(); 'anime'" },
  { wait: 800 },
  { shot: 'tour-2-pakete' },
  { eval: "location.hash = '#/spielen'; 'spielen'" },
  { size: [1440, 1060, false] },
  { wait: 1200 },
  { eval: "__btn('Gegen Bot').click(); 'bot'" },
  { wait: 700 },
  { shot: 'tour-3-spielen' },
  { size: [1440, 900, false] },
  { eval: "__btn('Training starten').click(); 'start'" },
  { wait: 5200 },
  { shot: 'main-duell' },
  { eval: '__solve()' },
  { wait: 1300 },
  { shot: 'tour-4-aufloesung' },
  { eval: '__auto(true)' },
  { wait: 105000 },
  { eval: "__auto(false); document.querySelector('.result') ? 'ergebnis' : 'noch im spiel'" },
  { wait: 2000 },
  { shot: 'main-ergebnis' },
  { eval: "__btn('Zum Menü').click(); 'menue'" },
  { wait: 1200 },
  { eval: "__btn('Klassisch').click(); setTimeout(() => __btn('Tippen').click(), 300); 'tippen'" },
  { wait: 900 },
  { eval: "__btn('Training starten').click(); 'start'" },
  { wait: 5200 },
  { eval: "(() => { const inp = document.querySelector('.typed__field input'); if (!inp) return 'keine Tippfrage'; __set(inp, 'Keine Ahnung'); inp.closest('form').requestSubmit(); setTimeout(() => { const a = __A[document.querySelector('.qcard__text').textContent]; __set(inp, a.slice(0, Math.ceil(a.length * 0.6))); }, 900); return 'getippt'; })()" },
  { wait: 1500 },
  { shot: 'main-tippen' },
  { eval: "__btn('Training beenden').click(); setTimeout(() => __btn('Wirklich').click(), 300); 'ende'" },
  { wait: 2500 },
  { eval: "__btn('Zum Menü')?.click(); 'menue'" },
  { wait: 1200 },
  { eval: "__btn('Lobby erstellen').click(); 'lobby'" },
  { wait: 1500 },
  { eval: "__btn('Leicht').click(); setTimeout(() => __btn('Bot dazu').click(), 300); setTimeout(() => __btn('Schwer').click(), 900); setTimeout(() => __btn('Bot dazu').click(), 1300); 'bots'" },
  { wait: 2200 },
  { shot: 'main-lobby' },
  { eval: "__btn('Lobby verlassen').click(); 'weg'" },
  { wait: 1200 },
  { eval: "document.querySelector('[aria-label=\"Einstellungen\"]').click(); setTimeout(() => __btn('Rosé').click(), 600); 'rose'" },
  { wait: 1500 },
  { shot: 'main-einstellungen' },
  { eval: "document.querySelector('[aria-label=\"Schließen\"]').click(); 'zu'" },
  { wait: 1800 },
  { shot: 'main-thema-rose' },
  { eval: "document.querySelector('[aria-label=\"Einstellungen\"]').click(); setTimeout(() => __btn('Tiefsee').click(), 600); setTimeout(() => document.querySelector('[aria-label=\"Schließen\"]').click(), 1200); 'zurueck'" },
  { wait: 2200 },
  { size: [390, 844, true] },
  { eval: "location.hash = '#/spielen'; location.reload(); 'mobil'" },
  { wait: 3000 },
  { eval: helpers },
  { eval: "__btn('Klassisch').click(); setTimeout(() => __btn('Auswahl').click(), 300); setTimeout(() => __btn('Training starten').click(), 800); 'start'" },
  { wait: 6000 },
  { shot: 'main-handy' },
  { eval: "__btn('Training beenden').click(); setTimeout(() => __btn('Wirklich').click(), 300); 'ende'" },
  { wait: 1500 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-readme-'));
const stepsFile = path.join(tmp, 'steps.json');
fs.writeFileSync(stepsFile, JSON.stringify(steps));
execFileSync(process.execPath, [path.join(root, 'Claude/scripts/shots.mjs'), stepsFile, out], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
