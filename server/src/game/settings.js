import { sanitizeSections } from '../packs.js';

// Alle Rundeneinstellungen an einer Stelle: was erlaubt ist, was Standard ist und wie
// Eingaben vom Client geprueft werden. Lobby, Training und Unranked nutzen dieselbe Pruefung.

export const ANSWER_MODES = new Set(['choice', 'typed', 'mixed']);
export const QUESTION_COUNTS = new Set([5, 10, 15, 20, 30]);
export const SOLO_MODES = new Set(['classic', 'survival']);
/** gemischt = keine Vorliebe, sonst werden Fragen der Stufe bevorzugt (leicht 1, mittel 2, schwer 3) */
export const DIFFICULTIES = new Set(['gemischt', 'leicht', 'mittel', 'schwer']);
/** Jede Frage hat genau drei falsche Antworten, mehr als vier Optionen gehen daher nicht */
export const OPTION_COUNTS = new Set([3, 4]);
export const TIME_LIMITS = {
  kurz: { choice: 10000, typed: 18000 },
  normal: { choice: 15000, typed: 25000 },
  lang: { choice: 22000, typed: 35000 },
};
/** button = Weiter-Knopf nach jeder Frage, auto = es geht nach ein paar Sekunden von selbst weiter */
export const CONTINUE_MODES = new Set(['button', 'auto']);

export const DEFAULT_SETTINGS = {
  answerMode: 'choice',
  questionCount: 10,
  difficulty: 'gemischt',
  optionCount: 3,
  timeLimit: 'normal',
  continueMode: 'button',
};

/**
 * Uebernimmt gueltige Felder aus einer Client-Eingabe, alles andere bleibt wie in `base`.
 * `allow` begrenzt, welche Felder ueberhaupt geaendert werden duerfen.
 */
export function readSettings(input, base, allow = null) {
  const out = { ...DEFAULT_SETTINGS, ...base };
  if (!input || typeof input !== 'object') return out;
  const may = (key) => key in input && (!allow || allow.includes(key));

  if (may('sections')) {
    const sections = sanitizeSections(input.sections);
    if (sections.length) out.sections = sections;
  }
  if (may('answerMode') && ANSWER_MODES.has(input.answerMode)) out.answerMode = input.answerMode;
  if (may('questionCount') && QUESTION_COUNTS.has(Number(input.questionCount))) out.questionCount = Number(input.questionCount);
  if (may('difficulty') && DIFFICULTIES.has(input.difficulty)) out.difficulty = input.difficulty;
  if (may('optionCount') && OPTION_COUNTS.has(Number(input.optionCount))) out.optionCount = Number(input.optionCount);
  if (may('timeLimit') && Object.hasOwn(TIME_LIMITS, input.timeLimit)) out.timeLimit = input.timeLimit;
  if (may('continueMode') && CONTINUE_MODES.has(input.continueMode)) out.continueMode = input.continueMode;
  if (may('locked')) out.locked = Boolean(input.locked);
  return out;
}

export function durationFor(settings, mode) {
  const limits = TIME_LIMITS[settings.timeLimit] ?? TIME_LIMITS.normal;
  return mode === 'typed' ? limits.typed : limits.choice;
}
