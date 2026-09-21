// Ende-zu-Ende-Test fuer Duelle gegen einen laufenden Server (Standard: http://localhost:3130).
// Zwei Gaeste spielen gegeneinander, die Antworten holt sich das Skript aus den Paketen.
//
// Aufruf aus dem Projekt-Root: node Claude/scripts/e2e-duel.mjs [serverUrl]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const SERVER = process.argv[2] || 'http://localhost:3130';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const answers = new Map();
for (const f of fs.readdirSync(path.join(root, 'packs'))) {
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'packs', f), 'utf8'));
  for (const s of pack.sections) for (const q of s.questions) answers.set(q.q, q.a);
}
const general = JSON.parse(fs.readFileSync(path.join(root, 'packs', 'allgemein.json'), 'utf8')).sections.map((s) => `allgemein/${s.id}`);

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function guest(name) {
  const res = await fetch(`${SERVER}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  // Server-Adresse darf einen Pfad haben (https://imkirit.dev/opal), Socket.IO haengt dann darunter
  const url = new URL(SERVER);
  const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', extraHeaders: { cookie }, transports: ['websocket'] });
  await new Promise((r, j) => {
    socket.once('connect', r);
    socket.once('connect_error', j);
  });
  const me = await fetch(`${SERVER}/api/me`, { headers: { cookie } }).then((r) => r.json());
  return { socket, cookie, id: me.user.id, name };
}

const emit = (p, event, payload = {}) => new Promise((r) => p.socket.emit(event, payload, r));
const once = (p, event, ms = 15000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${p.name}: ${event} kam nicht`)), ms);
    p.socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });

// ---------------------------------------------------------------------------
console.log('\n1) Unranked, Tippen: A antwortet immer zuerst richtig, B kurz danach');
{
  const a = await guest('Anna Test');
  const b = await guest('Ben Test');
  const reveals = [];
  let questions = 0;
  for (const p of [a, b]) {
    p.socket.on('match:question', (q) => {
      if (p === a) questions += 1;
      const ans = answers.get(q.text);
      if (q.mode === 'typed') {
        const delay = p === a ? 250 : 700;
        // B tippt zuerst einmal falsch, danach richtig
        if (p === b) setTimeout(() => p.socket.emit('match:answer', { index: q.index, text: 'ganz falsch' }), 150);
        setTimeout(() => p.socket.emit('match:answer', { index: q.index, text: ans.toLowerCase() }), delay);
      } else {
        // Auswahlfrage (bei zu wenig Tipp-Fragen): A waehlt richtig
        const idx = q.options.indexOf(ans);
        setTimeout(() => p.socket.emit('match:answer', { index: q.index, choice: p === a ? idx : (idx + 1) % 3 }), p === a ? 250 : 700);
      }
    });
    p.socket.on('match:reveal', (r) => p === a && reveals.push(r));
  }
  const endA = once(a, 'match:end', 200000);
  const startA = once(a, 'match:start');
  await emit(a, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'typed' });
  await emit(b, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'typed' });
  const start = await startA;
  check(start.kind === 'unranked' && start.players.length === 2, 'Match gefunden, zwei Spieler');
  const end = await endA;
  check(questions === 10, `10 Fragen gestellt (${questions})`);
  check(reveals.every((r) => r.winnerId === a.id), 'Jede Frage ging an den Schnelleren (A)');
  check(end.winnerId === a.id && end.reason === 'complete', 'A gewinnt regulär');
  const sa = end.summary.find((s) => s.id === a.id);
  const sb = end.summary.find((s) => s.id === b.id);
  check(sa.score === 10 && sb.score === 0, `Punkte 10:0 (${sa.score}:${sb.score})`);
  check(sb.wrong >= 1, `B hat falsche Versuche (${sb.wrong})`);
  check(sa.avgMs > 150 && sa.avgMs < 2000, `Reaktionszeit plausibel (${sa.avgMs} ms)`);
  const hist = await fetch(`${SERVER}/api/users/${a.id}`).then((r) => r.json());
  check(hist.stats.wins === 1 && hist.matches.length === 1, 'Spiel in Statistik gespeichert');
  a.socket.close();
  b.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n2) Aufgeben: A verlässt nach der ersten Frage');
{
  const a = await guest('Anna Zwei');
  const b = await guest('Ben Zwei');
  const endB = once(b, 'match:end', 30000);
  const endA = once(a, 'match:end', 30000);
  a.socket.once('match:question', async () => {
    await sleep(300);
    await emit(a, 'match:leave');
  });
  await emit(a, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'choice' });
  await emit(b, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'choice' });
  const end = await endB;
  check(end.reason === 'forfeit' && end.winnerId === b.id, 'B gewinnt durch Aufgabe');
  const left = await endA.catch(() => null);
  check(left && left.winnerId === b.id, 'Auch die aufgebende Person bekommt das Spielende');
  a.socket.close();
  b.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n3) Private Lobby mit Bot, Rückkehr in die Lobby');
{
  const a = await guest('Host Test');
  const b = await guest('Gast Test');
  const created = await emit(a, 'lobby:create', { sections: general, answerMode: 'choice' });
  check(created.ok && /^[A-Z0-9]{5}$/.test(created.code), `Lobby erstellt (${created.code})`);
  const joined = await emit(b, 'lobby:join', { code: created.code.toLowerCase() });
  check(joined.ok, 'Beitritt per Code (Kleinschreibung egal)');
  const notHost = await emit(b, 'lobby:settings', { questionCount: 20 });
  check(!notHost.ok, 'Nicht-Host darf Regeln nicht ändern');
  await emit(a, 'lobby:settings', { questionCount: 5 });
  const bot = await emit(a, 'lobby:bot:add', { difficulty: 'schwer' });
  check(bot.ok, 'Bot hinzugefügt');
  const state = await new Promise((r) => a.socket.once('lobby:state', r) && emit(a, 'lobby:settings', {}));
  check(state.members.length === 2 && state.bots.length === 1 && state.settings.questionCount === 5, 'Lobby: 2 Menschen, 1 Bot, 5 Fragen');

  for (const p of [a, b]) {
    p.socket.on('match:question', (q) => {
      const idx = q.options ? q.options.indexOf(answers.get(q.text)) : 0;
      // A schnell richtig, B langsam falsch
      setTimeout(() => p.socket.emit('match:answer', { index: q.index, choice: p === a ? idx : (idx + 1) % 3 }), p === a ? 400 : 1200);
    });
  }
  const endA = once(a, 'match:end', 120000);
  const back = new Promise((resolve) => {
    const handler = (s) => {
      if (!s.playing) {
        a.socket.off('lobby:state', handler);
        resolve(s);
      }
    };
    a.socket.on('lobby:state', (s) => s.playing && a.socket.on('lobby:state', handler));
  });
  const started = await emit(a, 'lobby:start');
  check(started.ok, 'Host startet');
  const end = await endA;
  check(end.kind === 'private' && end.summary.length === 3, 'Spiel mit drei Teilnehmern beendet');
  check(end.summary.find((s) => s.id === a.id).placement === 1, 'Schneller Host belegt Platz 1');
  const after = await back;
  check(!after.playing && after.members.length === 2, 'Lobby wieder offen, beide noch drin');
  a.socket.close();
  b.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n4) Ranked ist für Gäste gesperrt, Training startet');
{
  const a = await guest('Solo Test');
  const ranked = await emit(a, 'queue:join', { kind: 'ranked' });
  check(!ranked.ok && /Discord/.test(ranked.error), 'Ranked für Gast abgelehnt');
  const empty = await emit(a, 'solo:start', { sections: [], answerMode: 'choice' });
  check(!empty.ok, 'Training ohne Pakete abgelehnt');
  const solo = await emit(a, 'solo:start', { sections: general, answerMode: 'mixed', soloMode: 'survival' });
  check(solo.ok, 'Überleben-Training gestartet');
  const end = await once(a, 'match:end', 200000);
  check(end.kind === 'solo' && end.summary[0].score === 0, 'Ohne Antworten nach drei Leben vorbei');
  a.socket.close();
}

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failures ? 1 : 0);
