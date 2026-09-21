// Prueft getippte Antworten grosszuegig: Gross/Klein, Umlaute, Akzente, Satzzeichen,
// fuehrende Artikel und kleine Tippfehler werden verziehen. Zahlen muessen exakt stimmen.

const LEADING_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'the', 'a', 'an', 'mit', 'in', 'im', 'auf', 'zu', 'nach', 'bei', 'von', 'vom', 'aus',
]);

export function normalize(input) {
  let s = String(input ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // ae/oe/ue als Umlaut-Ersatz: auf beiden Seiten gleich behandelt, daher unschaedlich
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/&/g, ' und ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const words = s.split(' ');
  while (words.length > 1 && LEADING_WORDS.has(words[0])) words.shift();
  s = words.join(' ');
  return s;
}

const isNumeric = (s) => /^[\d\s.,/]+$/.test(s);
const digitsOnly = (s) => s.replace(/[^\d]/g, '');

export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tolerance(length) {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 12) return 2;
  return 3;
}

export function isCorrectTyped(input, candidates) {
  const raw = String(input ?? '').trim();
  if (!raw) return false;

  if (isNumeric(raw)) {
    const given = digitsOnly(raw);
    return candidates.some((c) => isNumeric(String(c)) && digitsOnly(String(c)) === given);
  }

  const given = normalize(raw);
  if (!given) return false;
  const givenTight = given.replace(/ /g, '');

  for (const candidate of candidates) {
    const target = normalize(candidate);
    if (!target) continue;
    if (given === target) return true;
    const targetTight = target.replace(/ /g, '');
    if (givenTight === targetTight) return true;
    const tol = tolerance(targetTight.length);
    if (tol > 0 && levenshtein(givenTight, targetTight, tol) <= tol) return true;
  }
  return false;
}
