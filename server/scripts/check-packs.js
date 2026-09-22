// Prueft alle Fragenpakete in packs/ auf Formfehler.
// Aufruf aus dem Projekt-Root: npm run check:packs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs');
const errors = [];
const warnings = [];
const seenPacks = new Set();
let total = 0;

const FORBIDDEN = /[\u2013\u2014]/; // Gedankenstriche sind im ganzen Projekt tabu
const WRONG_COUNT = 5;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (err) {
    errors.push(`${file}: kein gültiges JSON (${err.message})`);
    continue;
  }
  const where = (s, i) => `${pack.id}/${s}#${i + 1}`;
  for (const key of ['id', 'name', 'desc', 'icon', 'hue', 'sections']) {
    if (pack[key] === undefined) errors.push(`${file}: Feld "${key}" fehlt`);
  }
  if (seenPacks.has(pack.id)) errors.push(`${file}: Paket-ID "${pack.id}" doppelt`);
  seenPacks.add(pack.id);
  if (FORBIDDEN.test(JSON.stringify(pack))) errors.push(`${file}: enthält einen Gedankenstrich`);

  const sectionIds = new Set();
  for (const section of pack.sections ?? []) {
    if (sectionIds.has(section.id)) errors.push(`${pack.id}: Bereich "${section.id}" doppelt`);
    sectionIds.add(section.id);
    if (section.questions.length < 5) warnings.push(`${pack.id}/${section.id}: nur ${section.questions.length} Fragen`);
    const texts = new Set();
    section.questions.forEach((q, i) => {
      total += 1;
      const at = where(section.id, i);
      if (!q.q || !q.a) errors.push(`${at}: q oder a fehlt`);
      // Fuenf falsche Antworten, damit bis zu sechs Antwortmoeglichkeiten gehen
      if (!Array.isArray(q.w) || q.w.length !== WRONG_COUNT) errors.push(`${at}: genau ${WRONG_COUNT} falsche Antworten nötig (hat ${q.w?.length ?? 0})`);
      if (q.w?.some((w) => w.trim().toLowerCase() === q.a.trim().toLowerCase())) errors.push(`${at}: richtige Antwort steht auch bei den falschen`);
      if (new Set(q.w).size !== q.w?.length) errors.push(`${at}: doppelte falsche Antwort`);
      if (q.d !== undefined && ![1, 2, 3].includes(q.d)) errors.push(`${at}: d muss 1, 2 oder 3 sein`);
      if (texts.has(q.q)) errors.push(`${at}: Frage doppelt im Bereich`);
      texts.add(q.q);
      if (q.typed !== false && q.a.length > 40) warnings.push(`${at}: Antwort sehr lang, wird beim Tippen ausgelassen`);
    });
  }
}

for (const w of warnings) console.log(`Hinweis: ${w}`);
for (const e of errors) console.log(`FEHLER:  ${e}`);
console.log(`\n${seenPacks.size} Pakete, ${total} Fragen, ${errors.length} Fehler, ${warnings.length} Hinweise`);
process.exit(errors.length ? 1 : 0);
