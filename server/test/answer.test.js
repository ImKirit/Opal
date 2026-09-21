import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCorrectTyped, normalize } from '../src/game/answer.js';

test('Umlaute, Akzente und Gross/Klein spielen keine Rolle', () => {
  assert.equal(isCorrectTyped('muenchen', ['München']), true);
  assert.equal(isCorrectTyped('MUNCHEN', ['München']), true);
  assert.equal(isCorrectTyped('brasilia', ['Brasília']), true);
  assert.equal(isCorrectTyped('Strasse', ['Straße']), true);
});

test('fuehrende Artikel und Praepositionen werden ignoriert', () => {
  assert.equal(isCorrectTyped('rote', ['Die rote']), true);
  assert.equal(isCorrectTyped('ananas', ['In einer Ananas']), true);
  assert.equal(normalize('Das Abendmahl'), 'abendmahl');
});

test('kleine Tippfehler bei langen Woertern sind ok, bei kurzen nicht', () => {
  assert.equal(isCorrectTyped('Arachnofobie', ['Arachnophobie']), true);
  assert.equal(isCorrectTyped('Canbera', ['Canberra']), true);
  assert.equal(isCorrectTyped('Yan', ['Yen']), false);
  assert.equal(isCorrectTyped('Duo', ['Duo']), true);
});

test('Leerzeichen innerhalb von Namen sind egal', () => {
  assert.equal(isCorrectTyped('davinci', ['da Vinci']), true);
  assert.equal(isCorrectTyped('Thousandsunny', ['Thousand Sunny']), true);
});

test('Zahlen muessen exakt stimmen', () => {
  assert.equal(isCorrectTyped('1440', ['1440']), true);
  assert.equal(isCorrectTyped('1400', ['1440']), false);
  assert.equal(isCorrectTyped('9,58', ['9,58 Sekunden', '9,58', '9.58']), true);
  assert.equal(isCorrectTyped('3.10.', ['3. Oktober', '3.10.']), true);
});

test('falsche Antworten bleiben falsch', () => {
  assert.equal(isCorrectTyped('Sydney', ['Canberra']), false);
  assert.equal(isCorrectTyped('Michelangelo', ['Leonardo da Vinci', 'da Vinci', 'Leonardo']), false);
  assert.equal(isCorrectTyped('', ['Canberra']), false);
});
