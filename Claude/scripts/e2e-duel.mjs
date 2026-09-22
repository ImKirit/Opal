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
/** Nach jeder Aufloesung auf Weiter druecken (optional mit Verzoegerung oder gar nicht) */
const autoContinue = (p, delay = () => 150) =>
  p.socket.on('match:reveal', (r) => {
    const ms = delay(r);
    if (ms != null) setTimeout(() => p.socket.emit('match:continue', { index: r.index }), ms);
  });

// ---------------------------------------------------------------------------
console.log('\n1) Unranked, Tippen: A antwortet immer zuerst richtig, B kurz danach');
{
  const a = await guest('Anna Test');
  const b = await guest('Ben Test');
  const reveals = [];
  const penalties = [];
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
        setTimeout(
          () => p.socket.emit('match:answer', { index: q.index, choice: p === a ? idx : (idx + 1) % q.options.length }),
          p === a ? 250 : 700,
        );
      }
    });
    p.socket.on('match:reveal', (r) => p === a && reveals.push(r));
    autoContinue(p, () => (p === a ? 100 : 300));
  }
  b.socket.on('match:feedback', (f) => f.penaltyMs && penalties.push(f));
  const endA = once(a, 'match:end', 200000);
  const startA = once(a, 'match:start');
  await emit(a, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'typed' });
  await emit(b, 'queue:join', { kind: 'unranked', sections: general, answerMode: 'typed' });
  const start = await startA;
  check(start.kind === 'unranked' && start.players.length === 2, 'Match gefunden, zwei Spieler');
  check(start.continueMode === 'button', 'Unranked nutzt den Weiter-Knopf');
  const end = await endA;
  check(questions === 10, `10 Fragen gestellt (${questions})`);
  check(reveals.every((r) => r.winnerId === a.id), 'Jede Frage ging an den Schnelleren (A)');
  check(reveals.every((r) => r.continueMode === 'button' && r.nextInMs == null), 'Aufloesung wartet auf Weiter statt Countdown');
  check(reveals.at(-1)?.last === true && reveals.slice(0, -1).every((r) => !r.last), 'Nur die letzte Aufloesung ist als letzte markiert');
  check(
    penalties.length > 0 && penalties.every((f) => f.penaltyMs === 3000 && f.remainingMs > 20000 && f.remainingMs < 22000),
    `Falscher Tippversuch kostet 3 Sekunden (Rest ${penalties[0]?.remainingMs} ms)`,
  );
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
console.log('\n3) Private Lobby mit Bot und allen Host-Einstellungen, Rückkehr in die Lobby');
{
  const a = await guest('Host Test');
  const b = await guest('Gast Test');
  const c = await guest('Spät Test');
  const created = await emit(a, 'lobby:create', { sections: general, answerMode: 'choice' });
  check(created.ok && /^[A-Z0-9]{5}$/.test(created.code), `Lobby erstellt (${created.code})`);
  const joined = await emit(b, 'lobby:join', { code: created.code.toLowerCase() });
  check(joined.ok, 'Beitritt per Code (Kleinschreibung egal)');
  const notHost = await emit(b, 'lobby:settings', { questionCount: 20 });
  check(!notHost.ok, 'Nicht-Host darf Regeln nicht ändern');
  await emit(a, 'lobby:settings', { locked: true });
  const blocked = await emit(c, 'lobby:join', { code: created.code });
  check(!blocked.ok && /abgeschlossen/.test(blocked.error), 'Abgeschlossene Lobby lässt niemanden rein');
  await emit(a, 'lobby:settings', {
    questionCount: 5,
    optionCount: 4,
    difficulty: 'leicht',
    timeLimit: 'kurz',
    continueMode: 'button',
    locked: false,
    answerMode: 'bogus',
  });
  const bot = await emit(a, 'lobby:bot:add', { difficulty: 'schwer' });
  check(bot.ok, 'Bot hinzugefügt');
  const state = await new Promise((r) => a.socket.once('lobby:state', r) && emit(a, 'lobby:settings', {}));
  check(state.members.length === 2 && state.bots.length === 1 && state.settings.questionCount === 5, 'Lobby: 2 Menschen, 1 Bot, 5 Fragen');
  check(
    state.settings.optionCount === 4 &&
      state.settings.difficulty === 'leicht' &&
      state.settings.timeLimit === 'kurz' &&
      state.settings.answerMode === 'choice' &&
      !state.locked,
    'Host-Einstellungen übernommen, ungültiger Wert ignoriert',
  );

  const asked = [];
  let firstReveal = 0;
  let secondQuestion = 0;
  let readyEvent = null;
  for (const p of [a, b]) {
    p.socket.on('match:question', (q) => {
      if (p === a) {
        asked.push(q);
        if (q.index === 1) secondQuestion = Date.now();
      }
      const idx = q.options ? q.options.indexOf(answers.get(q.text)) : 0;
      // A schnell richtig, B langsam falsch
      setTimeout(
        () => p.socket.emit('match:answer', { index: q.index, choice: p === a ? idx : (idx + 1) % q.options.length }),
        p === a ? 400 : 1200,
      );
    });
  }
  a.socket.on('match:reveal', (r) => r.index === 0 && (firstReveal = Date.now()));
  a.socket.on('match:ready', (r) => r.index === 0 && !readyEvent && (readyEvent = r));
  // Bei Frage 1 drueckt nur A, B laesst die Wartezeit (10 s) ablaufen
  autoContinue(a, () => 100);
  autoContinue(b, (r) => (r.index === 0 ? null : 250));
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
  check(asked.every((q) => q.mode === 'typed' || q.options.length === 4), 'Vier Antwortmöglichkeiten pro Frage');
  check(asked.every((q) => q.duration === 10000), `Zeit "kurz" = 10 s (${asked[0]?.duration})`);
  check(asked.every((q) => q.difficulty === 1), 'Schwierigkeit "leicht" liefert leichte Fragen');
  check(readyEvent && readyEvent.autoInMs > 9000 && readyEvent.ready.includes(a.id), 'Erstes Weiter startet 10 Sekunden Wartezeit');
  const waited = secondQuestion - firstReveal;
  check(waited > 9500 && waited < 12500, `Ohne zweites Weiter geht es nach rund 10 s weiter (${waited} ms)`);
  check(end.kind === 'private' && end.summary.length === 3, 'Spiel mit drei Teilnehmern beendet');
  check(end.summary.find((s) => s.id === a.id).placement === 1, 'Schneller Host belegt Platz 1');
  const after = await back;
  check(!after.playing && after.members.length === 2, 'Lobby wieder offen, beide noch drin');
  for (const p of [a, b, c]) p.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n4) Ranked ist für Gäste gesperrt, Überleben endet nach drei übersprungenen Fragen');
{
  const a = await guest('Solo Test');
  const ranked = await emit(a, 'queue:join', { kind: 'ranked' });
  check(!ranked.ok && /Discord/.test(ranked.error), 'Ranked für Gast abgelehnt');
  const empty = await emit(a, 'solo:start', { sections: [], answerMode: 'choice' });
  check(!empty.ok, 'Training ohne Themen abgelehnt');
  a.socket.on('match:question', (q) => setTimeout(() => a.socket.emit('match:skip', { index: q.index }), 200));
  let revealState = null;
  a.socket.once('match:reveal', async (r) => {
    // Neuladen waehrend der Aufloesung: der Stand kommt mit, es geht nicht ohne Weiter weiter
    const ack = await emit(a, 'match:sync');
    revealState = { state: ack.match?.state, index: ack.match?.reveal?.index, expected: r.index };
  });
  autoContinue(a, () => 600);
  const t0 = Date.now();
  const solo = await emit(a, 'solo:start', { sections: general, answerMode: 'mixed', soloMode: 'survival' });
  check(solo.ok, 'Überleben-Training gestartet');
  const end = await once(a, 'match:end', 60000);
  check(end.kind === 'solo' && end.summary[0].score === 0 && end.questionsPlayed === 3, `Drei Mal überspringen kostet alle Leben (${end.questionsPlayed} Fragen)`);
  check(Date.now() - t0 < 15000, `Überspringen wartet nicht auf die Zeit (${Date.now() - t0} ms)`);
  check(revealState?.state === 'reveal' && revealState.index === revealState.expected, 'Sync während der Auflösung liefert die Auflösung mit');
  a.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n5) Training gegen Bot: Überspringen lässt den Bot sofort antworten, Tipp-Strafe läuft ab');
{
  const a = await guest('Bot Test');
  let skippedAt = 0;
  let revealLag = null;
  a.socket.once('match:question', (q) => {
    setTimeout(() => {
      skippedAt = Date.now();
      a.socket.emit('match:skip', { index: q.index });
    }, 150);
  });
  a.socket.once('match:reveal', () => (revealLag = Date.now() - skippedAt));
  const started = await emit(a, 'solo:start', { sections: general, answerMode: 'choice', bot: 'leicht', questionCount: 5 });
  check(started.ok, 'Bot-Training gestartet');
  await once(a, 'match:reveal', 30000).catch(() => null);
  check(revealLag != null && revealLag < 1000, `Nach dem Überspringen kommt die Auflösung sofort (${revealLag} ms)`);
  await emit(a, 'match:leave');
  await sleep(300);

  // Solo-Tippen: so lange falsch tippen, bis die eigene Zeit weg ist
  let attempts = 0;
  let timedOut = null;
  const onFeedback = (f) => {
    if (f.timedOut) timedOut = f;
  };
  a.socket.on('match:feedback', onFeedback);
  const firstQ = once(a, 'match:question', 10000);
  await emit(a, 'solo:start', { sections: general, answerMode: 'typed', questionCount: 5 });
  const q = await firstQ;
  const reveal = once(a, 'match:reveal', 30000);
  while (!timedOut && attempts < 12) {
    attempts += 1;
    a.socket.emit('match:answer', { index: q.index, text: `falsch ${attempts}` });
    await sleep(650);
  }
  const r = await reveal.catch(() => null);
  check(timedOut && attempts >= 6 && attempts <= 9, `Nach ${attempts} falschen Versuchen ist die Zeit um`);
  check(r && r.winnerId === null, 'Frage löst danach sofort auf');
  a.socket.off('match:feedback', onFeedback);
  await emit(a, 'match:leave');
  a.socket.close();
}

// ---------------------------------------------------------------------------
console.log('\n6) Freunde: suchen, Anfrage, annehmen, herausfordern, Duell startet');
{
  const a = await guest('Freundin Test');
  const b = await guest('Kumpel Test');
  const api = (p, path, init = {}) =>
    fetch(`${SERVER}${path}`, { ...init, headers: { cookie: p.cookie, 'Content-Type': 'application/json' } }).then(async (r) => ({
      status: r.status,
      ...(await r.json()),
    }));
  const found = await api(a, `/api/friends/search?q=${encodeURIComponent('kumpel te')}`);
  const hit = found.users.find((u) => u.id === b.id);
  check(hit && hit.relation === 'none' && /^[0-9A-F]{4}$/.test(hit.tag), 'Suche findet per Namensteil, mit Kürzel');
  const early = await emit(a, 'invite:send', { userId: b.id });
  check(!early.ok && /Freunde/.test(early.error), 'Herausfordern geht nur unter Freunden');
  const changed = once(b, 'friends:changed');
  const req = await api(a, '/api/friends/request', { method: 'POST', body: JSON.stringify({ userId: b.id }) });
  check(req.ok && req.status === 'pending', 'Anfrage gesendet');
  check((await changed).reason === 'request', 'Empfänger wird sofort benachrichtigt');
  const listB = await api(b, '/api/friends');
  check(listB.incoming.some((u) => u.id === a.id), 'Anfrage steht bei B unter Anfragen');
  const acc = await api(b, '/api/friends/accept', { method: 'POST', body: JSON.stringify({ userId: a.id }) });
  check(acc.ok, 'B nimmt an');
  const listA = await api(a, '/api/friends');
  const friend = listA.friends.find((f) => f.id === b.id);
  check(friend && friend.presence === 'online', `B ist Freund und online (${friend?.presence})`);

  const received = once(b, 'invite:received');
  const sent = await emit(a, 'invite:send', { userId: b.id, settings: { sections: general, answerMode: 'choice', optionCount: 4 } });
  check(sent.ok && sent.invite.to.id === b.id && sent.invite.expiresInMs > 25000, 'Herausforderung verschickt, 30 s gültig');
  const inv = await received;
  check(inv.from.id === a.id && !inv.intoLobby, 'B bekommt die Herausforderung');
  const startA = once(a, 'match:start');
  const startB = once(b, 'match:start');
  const closedA = once(a, 'invite:closed');
  const answer = await emit(b, 'invite:respond', { id: inv.id, accept: true });
  check(answer.ok, 'B nimmt die Herausforderung an');
  check((await closedA).reason === 'accepted', 'A erfährt von der Annahme');
  const [ma, mb] = await Promise.all([startA, startB]);
  check(ma.id === mb.id && ma.kind === 'private' && ma.players.length === 2 && ma.optionCount === 4, 'Duell startet sofort mit den Regeln von A');
  const busy = await api(a, '/api/friends');
  check(busy.friends.find((f) => f.id === b.id)?.presence === 'playing', 'Im Spiel steht B als "spielt gerade"');
  const endB = once(b, 'match:end', 20000);
  await emit(a, 'match:leave');
  check((await endB).winnerId === b.id, 'Aufgeben im Freundes-Duell funktioniert');
  await emit(a, 'lobby:leave');
  await emit(b, 'lobby:leave');

  const rm = await api(a, `/api/friends/${b.id}`, { method: 'DELETE' });
  const after = await api(b, '/api/friends');
  check(rm.ok && after.friends.length === 0, 'Entfernen löst die Freundschaft auf beiden Seiten');
  a.socket.close();
  b.socket.close();
}

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failures ? 1 : 0);
