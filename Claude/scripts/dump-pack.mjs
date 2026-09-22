// Gibt ein Fragenpaket kompakt aus: Bereich#Nummer | Frage | Antwort | falsche Antworten.
// Hilfe beim Schreiben und Gegenlesen von Fragen.
// Aufruf aus dem Projekt-Root: node Claude/scripts/dump-pack.mjs <paket-id> [bereich]

import fs from 'node:fs';
import path from 'node:path';

const [id, only] = process.argv.slice(2);
const pack = JSON.parse(fs.readFileSync(path.join('packs', `${id}.json`), 'utf8'));
for (const section of pack.sections) {
  if (only && section.id !== only) continue;
  section.questions.forEach((q, i) => {
    console.log(`${section.id}#${i} | ${q.q} | ${q.a} | ${q.w.join('; ')}`);
  });
}
