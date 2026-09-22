// Ranked-Test ohne Discord: zwei Gaeste werden direkt in der lokalen Datenbank zu
// "Discord-Konten" gemacht. Nur gegen die lokale Dev-Datenbank benutzen!
// Aufruf aus dem Projekt-Root: node Claude/scripts/e2e-ranked.mjs [serverUrl] [pfadZurDatenbank]

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';

const SERVER = process.argv[2] || 'http://localhost:3130';
const answers = new Map();
for (const f of fs.readdirSync('packs')) {
  const pack = JSON.parse(fs.readFileSync(path.join('packs', f), 'utf8'));
  for (const s of pack.sections) for (const q of s.questions) answers.set(q.q, q.a);
}
const db = new DatabaseSync(process.argv[3] || 'server/data/opal.db');
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

async function player(name, discordId) {
  const res = await fetch(`${SERVER}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const me = await fetch(`${SERVER}/api/me`, { headers: { cookie } }).then((r) => r.json());
  db.prepare('UPDATE users SET is_guest = 0, discord_id = ? WHERE id = ?').run(discordId, me.user.id);
  // Server-Adresse darf einen Pfad haben (https://imkirit.dev/opal), Socket.IO haengt dann darunter
  const url = new URL(SERVER);
  const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', extraHeaders: { cookie }, transports: ['websocket'] });
  await new Promise((r) => socket.once('connect', r));
  return { socket, id: me.user.id, name };
}

const a = await player('Ranked Anna', `test-${Date.now()}-a`);
const b = await player('Ranked Ben', `test-${Date.now()}-b`);
for (const p of [a, b]) {
  p.socket.on('match:question', (q) => {
    const ans = answers.get(q.text);
    const payload = q.mode === 'typed' ? { index: q.index, text: p === a ? ans : 'weiss nicht' } : { index: q.index, choice: p === a ? q.options.indexOf(ans) : (q.options.indexOf(ans) + 1) % 3 };
    setTimeout(() => p.socket.emit('match:answer', payload), p === a ? 300 : 600);
  });
  // Weiter-Knopf nach jeder Aufloesung
  p.socket.on('match:reveal', (r) => setTimeout(() => p.socket.emit('match:continue', { index: r.index }), 150));
}
const end = new Promise((r) => a.socket.once('match:end', r));
const ack1 = await new Promise((r) => a.socket.emit('queue:join', { kind: 'ranked' }, r));
const ack2 = await new Promise((r) => b.socket.emit('queue:join', { kind: 'ranked' }, r));
check(ack1.ok && ack2.ok, 'Beide im Ranked-Queue');
const result = await end;
check(result.kind === 'ranked' && result.questionsPlayed === 9, `Ranked mit 9 Fragen (${result.questionsPlayed})`);
const ra = result.ratingChanges[a.id];
const rb = result.ratingChanges[b.id];
check(ra && rb && ra.delta > 0 && rb.delta < 0, `Elo: Sieger +${ra?.delta}, Verlierer ${rb?.delta}`);
check(ra.delta === 20 && rb.delta === -20, 'Neue Spieler, gleiche Wertung: genau +20 / -20 (K=40)');
const board = await fetch(`${SERVER}/api/leaderboard`).then((r) => r.json());
check(board.entries.some((e) => e.id === a.id && e.rating === 1020), 'Sieger steht mit 1020 in der Rangliste');
a.socket.close();
b.socket.close();
console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failures ? 1 : 0);
