import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const TYPED_MAX_LENGTH = 40;

/** Alle Pakete als Metadaten (ohne Antworten) fuer den Client. */
let packMeta = [];
/** "paket/bereich" -> Fragen mit Labels */
const sectionIndex = new Map();

export function loadPacks(dir = config.packsDir) {
  packMeta = [];
  sectionIndex.clear();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const meta = {
      id: pack.id,
      name: pack.name,
      desc: pack.desc,
      icon: pack.icon,
      hue: pack.hue,
      sections: [],
    };
    for (const section of pack.sections) {
      const key = `${pack.id}/${section.id}`;
      const questions = section.questions.map((q, i) => ({
        id: `${key}/${i}`,
        key,
        packName: pack.name,
        sectionName: section.name,
        hue: pack.hue,
        q: q.q,
        a: q.a,
        w: q.w,
        alt: q.alt ?? [],
        fact: q.fact ?? null,
        d: q.d ?? 2,
        typed: q.typed !== false && q.a.length <= TYPED_MAX_LENGTH,
      }));
      sectionIndex.set(key, questions);
      meta.sections.push({
        id: section.id,
        key,
        name: section.name,
        count: questions.length,
        typedCount: questions.filter((q) => q.typed).length,
      });
    }
    packMeta.push(meta);
  }
  // "Allgemein" immer zuerst, der Rest alphabetisch
  packMeta.sort((a, b) => (a.id === 'allgemein' ? -1 : b.id === 'allgemein' ? 1 : a.name.localeCompare(b.name, 'de')));
  return packMeta;
}

export const getPackMeta = () => packMeta;

export function sanitizeSections(input) {
  if (!Array.isArray(input)) return [];
  const out = new Set();
  for (const key of input.slice(0, 300)) {
    if (typeof key === 'string' && sectionIndex.has(key)) out.add(key);
  }
  return [...out];
}

export function rankedSections() {
  const configured = sanitizeSections(config.rankedSections);
  if (configured.length) return configured;
  return [...sectionIndex.keys()].filter((k) => k.startsWith('allgemein/'));
}

export function countQuestions(sections) {
  return sections.reduce((n, key) => n + (sectionIndex.get(key)?.length ?? 0), 0);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Zieht Fragen aus den gewaehlten Bereichen. Bereiche werden reihum gemischt, damit ein
 * grosses Paket ein kleines nicht verdraengt. Kuerzlich gesehene Fragen kommen nur, wenn
 * sonst zu wenig uebrig ist.
 */
export function pickQuestions(sections, count, { answerMode = 'choice', exclude = new Set() } = {}) {
  const buckets = sections
    .map((key) => shuffle([...(sectionIndex.get(key) ?? [])]))
    .filter((b) => b.length);
  const wantTyped = answerMode === 'typed';

  const ordered = [];
  // Reihum aus den Bereichen ziehen, zufaellige Bereichsreihenfolge je Runde
  while (buckets.some((b) => b.length)) {
    for (const bucket of shuffle(buckets.filter((b) => b.length))) ordered.push(bucket.pop());
  }

  const score = (q) => (exclude.has(q.id) ? 2 : 0) + (wantTyped && !q.typed ? 1 : 0);
  // Stabil nach "Frische" sortieren, die Zufallsreihenfolge innerhalb gleicher Stufe bleibt
  const ranked = ordered.map((q, i) => ({ q, i, s: score(q) })).sort((a, b) => a.s - b.s || a.i - b.i);
  return ranked.slice(0, count).map((r) => r.q);
}

/** Baut aus einer Frage die konkrete Runde: Modus, Optionen, Index der richtigen Option. */
export function buildRound(question, answerMode) {
  let mode = 'choice';
  if (answerMode === 'typed' && question.typed) mode = 'typed';
  if (answerMode === 'mixed' && question.typed && Math.random() < 0.5) mode = 'typed';

  if (mode === 'typed') return { mode, options: null, correctIndex: -1 };

  const wrong = shuffle([...question.w]).slice(0, 2);
  const options = shuffle([question.a, ...wrong]);
  return { mode, options, correctIndex: options.indexOf(question.a) };
}
