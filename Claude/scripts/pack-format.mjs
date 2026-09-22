// Schreibt ein Fragenpaket im Stil der Dateien in packs/: Kopf mit zwei Leerzeichen Einzug,
// jede Frage auf genau einer Zeile. So bleiben Diffs lesbar.

const inline = (value) =>
  Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : JSON.stringify(value);

export function formatQuestion(q) {
  return `{ ${Object.entries(q)
    .map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`)
    .join(', ')} }`;
}

export function formatPack(pack) {
  const lines = ['{'];
  const head = Object.entries(pack).filter(([k]) => k !== 'sections');
  for (const [k, v] of head) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  lines.push('  "sections": [');
  pack.sections.forEach((section, si) => {
    lines.push('    {');
    for (const [k, v] of Object.entries(section).filter(([key]) => key !== 'questions')) {
      lines.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    }
    lines.push('      "questions": [');
    section.questions.forEach((q, qi) => {
      lines.push(`        ${formatQuestion(q)}${qi < section.questions.length - 1 ? ',' : ''}`);
    });
    lines.push('      ]');
    lines.push(`    }${si < pack.sections.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
