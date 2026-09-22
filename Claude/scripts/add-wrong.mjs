// Haengt zusaetzliche falsche Antworten an die Fragen eines Pakets an.
// Eingabe: JSON { "bereich#nummer": ["falsch 4", "falsch 5"], ... } (Nummern wie in dump-pack.mjs).
// Bricht ab, wenn eine Frage fehlt, eine Antwort doppelt waere oder der richtigen gleicht.
// Aufruf aus dem Projekt-Root: node Claude/scripts/add-wrong.mjs <paket-id> <zusaetze.json>

import fs from 'node:fs';
import path from 'node:path';
import { formatPack } from './pack-format.mjs';

const [id, file] = process.argv.slice(2);
const packFile = path.join('packs', `${id}.json`);
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const extra = JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = (s) => s.trim().toLowerCase();
const problems = [];
let added = 0;

for (const section of pack.sections) {
  section.questions.forEach((q, i) => {
    const key = `${section.id}#${i}`;
    const more = extra[key];
    if (!more) {
      if (q.w.length < 5) problems.push(`${key}: keine Zusaetze, hat erst ${q.w.length}`);
      return;
    }
    const all = [...q.w, ...more];
    if (new Set(all.map(norm)).size !== all.length) problems.push(`${key}: doppelte falsche Antwort`);
    if (all.some((w) => norm(w) === norm(q.a) || (q.alt ?? []).some((a) => norm(a) === norm(w)))) {
      problems.push(`${key}: falsche Antwort gleicht der richtigen`);
    }
    q.w = all;
    added += more.length;
    delete extra[key];
  });
}
for (const key of Object.keys(extra)) problems.push(`${key}: Frage gibt es nicht`);

if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
fs.writeFileSync(packFile, formatPack(pack));
console.log(`${id}: ${added} falsche Antworten ergaenzt`);
