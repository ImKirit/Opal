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

const DIFFICULTY_TARGET = { leicht: 1, mittel: 2, schwer: 3 };

/**
 * Wie schlecht eine Frage zur gewuenschten Schwierigkeit passt (0 = passt genau).
 * Beim Tippen rutscht alles eine Stufe leichter: Selbst schreiben ist schwerer als Auswaehlen.
 */
export function difficultyPenalty(d, difficulty = 'gemischt', typed = false) {
  const target = DIFFICULTY_TARGET[difficulty];
  if (!target) return typed && d >= 3 ? 2 : 0;
  return Math.abs(d - (typed ? Math.max(1, target - 1) : target));
}

/**
 * Zieht Fragen aus den gewaehlten Bereichen. Bereiche werden reihum gemischt, damit ein
 * grosses Paket ein kleines nicht verdraengt. Danach zaehlt in dieser Reihenfolge: Frage
 * laesst sich im gewuenschten Modus spielen, Schwierigkeit passt, Frage wurde nicht
 * kuerzlich gesehen. Fehlt etwas, wird mit der naechstbesten Frage aufgefuellt.
 */
export function pickQuestions(sections, count, { answerMode = 'choice', difficulty = 'gemischt', exclude = new Set() } = {}) {
  const buckets = sections
    .map((key) => shuffle([...(sectionIndex.get(key) ?? [])]))
    .filter((b) => b.length);
  const wantTyped = answerMode === 'typed';

  const ordered = [];
  // Reihum aus den Bereichen ziehen, zufaellige Bereichsreihenfolge je Runde
  while (buckets.some((b) => b.length)) {
    for (const bucket of shuffle(buckets.filter((b) => b.length))) ordered.push(bucket.pop());
  }

  const score = (q) =>
    (wantTyped && !q.typed ? 20 : 0) + difficultyPenalty(q.d, difficulty, wantTyped) * 3 + (exclude.has(q.id) ? 2 : 0);
  // Stabil sortieren, die Zufallsreihenfolge innerhalb gleicher Stufe bleibt
  const ranked = ordered.map((q, i) => ({ q, i, s: score(q) })).sort((a, b) => a.s - b.s || a.i - b.i);
  return ranked.slice(0, count).map((r) => r.q);
}

/**
 * Baut aus einer Frage die konkrete Runde: Modus, Optionen, Index der richtigen Option.
 * Die richtige Antwort landet durch das Mischen gleichverteilt auf jedem Platz.
 * Im gemischten Modus wird nur bei leichten Fragen getippt.
 */
export function buildRound(question, answerMode, optionCount = 3) {
  let mode = 'choice';
  if (answerMode === 'typed' && question.typed) mode = 'typed';
  if (answerMode === 'mixed' && question.typed && question.d <= 1 && Math.random() < 0.5) mode = 'typed';

  if (mode === 'typed') return { mode, options: null, correctIndex: -1 };

  const wrongCount = Math.max(2, Math.min(optionCount - 1, question.w.length));
  const wrong = shuffle([...question.w]).slice(0, wrongCount);
  const options = shuffle([question.a, ...wrong]);
  return { mode, options, correctIndex: options.indexOf(question.a) };
}
