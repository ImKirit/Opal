import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUNDLES, bundleMeta } from '../src/bundles.js';
import { buildRound, difficultyPenalty, loadPacks, pickQuestions } from '../src/packs.js';

const question = {
  q: 'Test?',
  a: 'Richtig',
  w: ['Falsch A', 'Falsch B', 'Falsch C', 'Falsch D', 'Falsch E'],
  alt: [],
  d: 1,
  typed: true,
};

function positions(optionCount, rounds = 30000) {
  const counts = new Array(optionCount).fill(0);
  for (let i = 0; i < rounds; i++) {
    const round = buildRound(question, 'choice', optionCount);
    assert.equal(round.options.length, optionCount);
    assert.equal(round.options[round.correctIndex], 'Richtig');
    counts[round.correctIndex] += 1;
  }
  return counts;
}

test('richtige Antwort landet bei 3 Optionen gleich oft auf jedem Platz', () => {
  const rounds = 30000;
  for (const n of positions(3, rounds)) {
    // Erwartet 10000 je Platz, 4 Prozent Spielraum ist bei 30000 Runden weit ueber 5 Sigma
    assert.ok(Math.abs(n - rounds / 3) < rounds * 0.04, `Platz ${n} weicht zu stark ab`);
  }
});

test('richtige Antwort landet bei 4 Optionen gleich oft auf jedem Platz', () => {
  const rounds = 30000;
  for (const n of positions(4, rounds)) {
    assert.ok(Math.abs(n - rounds / 4) < rounds * 0.04, `Platz ${n} weicht zu stark ab`);
  }
});

test('richtige Antwort landet bei 6 Optionen gleich oft auf jedem Platz', () => {
  const rounds = 36000;
  for (const n of positions(6, rounds)) {
    assert.ok(Math.abs(n - rounds / 6) < rounds * 0.03, `Platz ${n} weicht zu stark ab`);
  }
});

test('alle Fragen haben fuenf falsche Antworten, 5 und 6 Optionen gehen ueberall', () => {
  for (const pack of loadPacks()) {
    for (const section of pack.sections) {
      for (const q of pickQuestions([section.key], 500)) {
        assert.equal(q.w.length, 5, `${q.id} hat ${q.w.length} falsche Antworten`);
        assert.equal(buildRound(q, 'choice', 6).options.length, 6);
      }
    }
  }
});

test('Optionen sind immer verschieden und enthalten nur bekannte Antworten', () => {
  for (let i = 0; i < 500; i++) {
    const { options } = buildRound(question, 'choice', 6);
    assert.equal(new Set(options).size, options.length);
    for (const o of options) assert.ok([question.a, ...question.w].includes(o));
  }
});

test('gemischter Modus tippt nur bei leichten Fragen', () => {
  const hard = { ...question, d: 2 };
  for (let i = 0; i < 300; i++) assert.equal(buildRound(hard, 'mixed').mode, 'choice');
  const modes = new Set(Array.from({ length: 300 }, () => buildRound(question, 'mixed').mode));
  assert.deepEqual([...modes].sort(), ['choice', 'typed']);
});

test('Schwierigkeit: Strafpunkte passen zur Stufe, Tippen rutscht eine Stufe leichter', () => {
  assert.equal(difficultyPenalty(1, 'leicht'), 0);
  assert.equal(difficultyPenalty(3, 'leicht'), 2);
  assert.equal(difficultyPenalty(3, 'schwer'), 0);
  assert.equal(difficultyPenalty(2, 'gemischt'), 0);
  // Tippen: "mittel" bevorzugt leichte Fragen, "gemischt" meidet schwere
  assert.equal(difficultyPenalty(1, 'mittel', true), 0);
  assert.ok(difficultyPenalty(3, 'gemischt', true) > 0);
});

test('pickQuestions bevorzugt die gewaehlte Schwierigkeit', () => {
  loadPacks();
  const sections = ['allgemein/wissen', 'allgemein/tiere', 'allgemein/geschichte'];
  const easy = pickQuestions(sections, 10, { difficulty: 'leicht' });
  assert.equal(easy.length, 10);
  assert.ok(easy.every((q) => q.d === 1), 'leicht sollte nur leichte Fragen liefern');
  const hard = pickQuestions(sections, 5, { difficulty: 'schwer' });
  const avg = hard.reduce((sum, q) => sum + q.d, 0) / hard.length;
  assert.ok(avg >= 2, `schwer sollte im Schnitt mindestens mittel sein, war ${avg}`);
});

test('Themenpakete zeigen nur auf Themen und Bereiche, die es gibt', () => {
  const packs = loadPacks();
  const keys = new Set(packs.flatMap((p) => p.sections.map((s) => s.key)));
  const ids = new Set(packs.map((p) => p.id));
  for (const bundle of BUNDLES) {
    for (const item of bundle.items) {
      assert.ok(item.includes('/') ? keys.has(item) : ids.has(item), `${bundle.id}: ${item} gibt es nicht`);
    }
  }
  for (const bundle of bundleMeta()) {
    const count = bundle.sections.reduce((n, key) => n + pickQuestions([key], 1000).length, 0);
    assert.ok(count >= 40, `${bundle.id} hat nur ${count} Fragen`);
  }
});
