// Hilfsfigur fuer Screenshots und Tests mit zwei Leuten: meldet sich als Gast an, schickt
// einer Person eine Freundschaftsanfrage, wartet auf die Annahme, fordert sie dann zu einem
// Duell heraus und spielt es langsam mit (antwortet nach ein paar Sekunden falsch).
//
// Aufruf: node Claude/scripts/friend-helper.mjs <zielName> [serverUrl] [eigenerName]

import { io } from 'socket.io-client';

const [target = 'Kirit', SERVER = 'http://localhost:3130', ME = 'Mila'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[helper]', ...a);

// Optional spaeter loslegen (zum Beispiel erst, wenn die andere Person auf der Freunde-Seite ist)
await sleep(Number(process.env.HELPER_START_DELAY ?? 0));

const res = await fetch(`${SERVER}/auth/guest`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: ME }),
});
const cookie = res.headers.get('set-cookie').split(';')[0];
const api = (path, init = {}) =>
  fetch(`${SERVER}${path}`, { ...init, headers: { cookie, 'Content-Type': 'application/json', ...(init.headers ?? {}) } }).then((r) => r.json());

const url = new URL(SERVER);
const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', extraHeaders: { cookie }, transports: ['websocket'] });
await new Promise((r) => socket.once('connect', r));

// Ziel suchen (exakter Name, zuletzt gesehen zuerst)
let person = null;
for (let i = 0; i < 30 && !person; i++) {
  const { users } = await api(`/api/friends/search?q=${encodeURIComponent(target)}`);
  person = users.find((u) => u.name === target) ?? null;
  if (!person) await sleep(1000);
}
if (!person) {
  log('Ziel nicht gefunden');
  process.exit(1);
}
log('Anfrage an', person.name, person.tag, await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId: person.id }) }));

// Auf Annahme warten
for (let i = 0; i < 90; i++) {
  const list = await api('/api/friends');
  if (list.friends.some((f) => f.id === person.id)) break;
  await sleep(1000);
}
log('befreundet, warte kurz und fordere heraus');
await sleep(Number(process.env.HELPER_INVITE_DELAY ?? 2500));

socket.on('match:question', (q) => {
  setTimeout(() => {
    if (q.options) socket.emit('match:answer', { index: q.index, choice: (q.options.length - 1) });
    else socket.emit('match:answer', { index: q.index, text: 'keine Ahnung' });
  }, 6000);
});
// Weiter erst spaet druecken, damit man das Warten auf die andere Person sieht
socket.on('match:reveal', (r) => setTimeout(() => socket.emit('match:continue', { index: r.index }), 7000));
socket.on('invite:closed', (c) => log('Anfrage geschlossen:', c.reason));
socket.on('match:start', () => log('Duell startet'));

const ack = await new Promise((r) => socket.emit('invite:send', { userId: person.id, settings: { answerMode: 'choice', optionCount: 3 } }, r));
log('Herausforderung', ack.ok ? 'gesendet' : ack.error);

await sleep(Number(process.env.HELPER_MS ?? 60000));
socket.close();
process.exit(0);
