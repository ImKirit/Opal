// Ranked-Test ohne Discord: zwei Gaeste werden direkt in der Datenbank zu "Discord-Konten"
// gemacht. Nur gegen eine lokale Datenbank benutzen, am besten gegen eine Wegwerf-Instanz!
// Aufruf aus dem Projekt-Root: node Claude/scripts/e2e-ranked.mjs [serverUrl] [pfadZurDatenbank]
//
// Prueft beide Ranked-Modi (Standard und Tippen) mit getrennten Raengen, getrennte
// Warteschlangen und die Ranglisten.

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p, url) => fetch(`${SERVER}${url}`, { headers: { cookie: p.cookie } }).then((r) => r.json());

async function player(name, discordId) {
  const res = await fetch(`${SERVER}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const me = await fetch(`${SERVER}/api/me`, { headers: { cookie } }).then((r) => r.json());
  db.prepare('UPDATE users SET is_guest = 0, discord_id = ? WHERE id = ?').run(discordId, me.user.id);
  // Server-Adresse darf einen Pfad haben (https://imkirit.dev/opal), Socket.IO haengt dann darunter
  const url = new URL(SERVER);
  const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', extraHeaders: { cookie }, transports: ['websocket'] });
  await new Promise((r) => socket.once('connect', r));
  return { socket, cookie, id: me.user.id, name };
}

const stamp = Date.now();
// Eindeutige Namen: Namen von Discord-Konten sind fuer Gaeste gesperrt, ein zweiter Lauf
// mit denselben Namen wuerde sonst am Gast-Login scheitern
const suffix = String(stamp).slice(-4);
const a = await player(`Ranked Anna ${suffix}`, `test-${stamp}-a`);
const b = await player(`Ranked Ben ${suffix}`, `test-${stamp}-b`);
const modes = { a: [], b: [] };
for (const p of [a, b]) {
  p.socket.on('match:question', (q) => {
    (p === a ? modes.a : modes.b).push(q.mode);
    const ans = answers.get(q.text);
    const payload =
      q.mode === 'typed'
        ? { index: q.index, text: p === a ? ans : 'weiss nicht' }
        : { index: q.index, choice: p === a ? q.options.indexOf(ans) : (q.options.indexOf(ans) + 1) % q.options.length };
    setTimeout(() => p.socket.emit('match:answer', payload), p === a ? 300 : 600);
  });
  // Weiter-Knopf nach jeder Aufloesung
  p.socket.on('match:reveal', (r) => setTimeout(() => p.socket.emit('match:continue', { index: r.index }), 150));
}

async function rankedMatch(ladder) {
  modes.a.length = 0;
  const start = new Promise((r) => a.socket.once('match:start', r));
  const end = new Promise((r) => a.socket.once('match:end', r));
  const ack1 = await new Promise((r) => a.socket.emit('queue:join', { kind: 'ranked', ladder }, r));
  const ack2 = await new Promise((r) => b.socket.emit('queue:join', { kind: 'ranked', ladder }, r));
  check(ack1.ok && ack2.ok, `${ladder}: beide im Ranked-Queue`);
  const info = await start;
  check(info.kind === 'ranked' && info.ladder === ladder, `${ladder}: Match weiß seinen Modus (${info.ladder})`);
  return end;
}

console.log('\n1) Ranked Standard');
{
  const result = await rankedMatch('standard');
  check(modes.a.length === 9 && modes.a.every((m) => m === 'choice'), `Standard: 9 Auswahlfragen (${modes.a.join(',')})`);
  const ra = result.ratingChanges[a.id];
  const rb = result.ratingChanges[b.id];
  check(result.ladder === 'standard' && ra?.ladder === 'standard', 'Ergebnis gehört zum Rang Standard');
  check(ra?.delta === 20 && rb?.delta === -20, `Neue Spieler, gleiche Wertung: +20 / -20 (${ra?.delta} / ${rb?.delta})`);
}

console.log('\n2) Ranked Tippen, eigener Rang');
{
  const result = await rankedMatch('tippen');
  check(modes.a.length === 9 && modes.a.every((m) => m === 'typed'), `Tippen: 9 Tippfragen (${modes.a.join(',')})`);
  const ra = result.ratingChanges[a.id];
  check(ra?.ladder === 'tippen' && ra.before === 1000 && ra.after === 1020, `Tippen startet bei 1000, unabhängig von Standard (${ra?.before} -> ${ra?.after})`);
  const me = await get(a, '/api/me');
  check(me.user.ranks.standard.rating === 1020 && me.user.ranks.tippen.rating === 1020, 'Profil zeigt beide Ränge');
  check(me.user.ranks.standard.games === 1 && me.user.ranks.standard.wins === 1, 'Spiele und Siege pro Rang gezählt');
}

console.log('\n3) Warteschlangen der Modi sind getrennt');
{
  const found = [];
  const onStart = () => found.push(1);
  a.socket.on('match:start', onStart);
  await new Promise((r) => a.socket.emit('queue:join', { kind: 'ranked', ladder: 'standard' }, r));
  await new Promise((r) => b.socket.emit('queue:join', { kind: 'ranked', ladder: 'tippen' }, r));
  await sleep(4500);
  check(found.length === 0, 'Standard und Tippen werden nicht gegeneinander gepaart');
  await new Promise((r) => a.socket.emit('queue:leave', {}, r));
  await new Promise((r) => b.socket.emit('queue:leave', {}, r));
  a.socket.off('match:start', onStart);
}

console.log('\n4) Ranglisten');
{
  const config = await get(a, '/api/config');
  const ids = config.boards.map((x) => x.id);
  check(['standard', 'tippen', 'siege', 'spielzeit', 'tempo', 'ueberleben'].every((id) => ids.includes(id)), `Alle Ranglisten da (${ids.join(', ')})`);
  check(config.ladders.map((l) => l.id).join() === 'standard,tippen', 'Zwei Ranked-Modi');
  const std = await get(a, '/api/leaderboard?board=standard');
  check(std.entries.some((e) => e.id === a.id && e.value === 1020) && std.me?.id === a.id, 'Standard-Rangliste mit eigenem Platz');
  const siege = await get(a, '/api/leaderboard?board=siege');
  const annaWins = siege.entries.find((e) => e.id === a.id);
  check(annaWins?.value >= 2, `Siege-Liste zählt Ranked-Siege (${annaWins?.value})`);
  const zeit = await get(b, '/api/leaderboard?board=spielzeit');
  check(zeit.me && zeit.me.value > 5000, `Spielzeit wird gezählt (${zeit.me?.value} ms)`);
  const bad = await get(a, '/api/leaderboard?board=quatsch');
  check(bad.board === 'standard', 'Unbekannte Liste fällt auf Standard zurück');
}

console.log('\n5) Freunde finden: Vorschläge ab dem ersten Buchstaben, Discord-Name, Kürzel');
{
  // Discord-Benutzername setzt sonst der Login, hier direkt in der Datenbank
  const handle = `ben_${stamp}`;
  db.prepare('UPDATE users SET discord_username = ? WHERE id = ?').run(handle, b.id);
  const exact = await get(a, `/api/friends/search?q=${encodeURIComponent('@' + handle.toUpperCase())}`);
  check(exact.users[0]?.id === b.id, 'Genauer Discord-Name findet die Person zuerst (mit @, Groß/Klein egal)');
  const partial = await get(a, `/api/friends/search?q=${encodeURIComponent(handle.slice(0, 5))}`);
  check(partial.users.some((u) => u.id === b.id), 'Der Anfang des Discord-Namens reicht (Vorschläge beim Tippen)');
  const one = await get(a, '/api/friends/search?q=r');
  check(
    one.users.length > 0 && one.users.every((u) => u.name.toLowerCase().startsWith('r')),
    `Ein Buchstabe liefert Namen, die so anfangen (${one.users.length})`,
  );
  const byName = await get(a, `/api/friends/search?q=${encodeURIComponent('ranked ben')}`);
  const tag = byName.users.find((u) => u.id === b.id)?.tag;
  check(Boolean(tag), 'Suche per Name findet die Person');
  const byTag = await get(a, `/api/friends/search?q=${encodeURIComponent('#' + tag)}`);
  check(byTag.users.some((u) => u.id === b.id), `Kürzel allein findet die Person (#${tag})`);
  const nameTag = await get(a, `/api/friends/search?q=${encodeURIComponent('Ben#' + tag.toLowerCase())}`);
  check(nameTag.users.some((u) => u.id === b.id), 'Name#Kürzel findet die Person');
  const wrongTag = await get(a, `/api/friends/search?q=${encodeURIComponent('Anna#' + tag)}`);
  check(!wrongTag.users.some((u) => u.id === b.id), 'Name#Kürzel mit falschem Namen findet sie nicht');
}

console.log('\n6) Gäste dürfen sich keinen Namen eines Discord-Kontos geben');
{
  const taken = await fetch(`${SERVER}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: a.name.toUpperCase() }),
  });
  const body = await taken.json();
  check(taken.status === 409 && /Discord/.test(body.error), 'Name eines Discord-Kontos ist für Gäste gesperrt (Groß/Klein egal)');
  const free = await fetch(`${SERVER}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Frei ${String(stamp).slice(-5)}` }),
  });
  check(free.ok, 'Freier Name geht weiter');
}

a.socket.close();
b.socket.close();
console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failures ? 1 : 0);
