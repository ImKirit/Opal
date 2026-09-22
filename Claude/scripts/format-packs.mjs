// Formatiert alle Pakete in packs/ im ueblichen Stil (eine Frage pro Zeile).
// Aufruf aus dem Projekt-Root: node Claude/scripts/format-packs.mjs

import fs from 'node:fs';
import path from 'node:path';
import { formatPack } from './pack-format.mjs';

for (const file of fs.readdirSync('packs').filter((f) => f.endsWith('.json'))) {
  const full = path.join('packs', file);
  const raw = fs.readFileSync(full, 'utf8');
  const out = formatPack(JSON.parse(raw));
  if (out !== raw) {
    fs.writeFileSync(full, out);
    console.log(`formatiert: ${file}`);
  }
}
