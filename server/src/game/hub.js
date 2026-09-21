import { userFromCookieHeader } from '../auth.js';
import { countQuestions, rankedSections, sanitizeSections } from '../packs.js';
import { getUser, touchUser } from '../users.js';
import { createBot, isBotDifficulty } from './bot.js';
import { LOBBY_MAX, LobbyRegistry } from './lobbies.js';
import { Match } from './match.js';
import { Matchmaker } from './matchmaker.js';

const ANSWER_MODES = new Set(['choice', 'typed', 'mixed']);
const QUESTION_COUNTS = new Set([5, 10, 15, 20, 30]);
const SOLO_MODES = new Set(['classic', 'survival']);
const RANKED_SETTINGS = { answerMode: 'mixed', questionCount: 9 };
const UNRANKED_COUNT = 10;
const LOBBY_DISCONNECT_MS = 30000;
const MIN_POOL = 5;

const fail = (ack, error) => typeof ack === 'function' && ack({ ok: false, error });
const done = (ack, data = {}) => typeof ack === 'function' && ack({ ok: true, ...data });

function playerFromUser(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? null,
    guest: Boolean(row.is_guest),
    rating: row.rating,
    isBot: false,
  };
}

/**
 * Verbindet Socket.IO mit Matchmaking, Lobbys und laufenden Spielen.
 * Jeder Nutzer macht immer genau eine Sache: warten, in einer Lobby sitzen oder spielen.
 */
export function attachHub(io) {
  const matches = new Map(); // matchId -> Match
  const matchOf = new Map(); // userId -> Match
  const lobbyOf = new Map(); // userId -> Lobby
  const lobbies = new LobbyRegistry();
  const lobbyLeaveTimers = new Map();

  const emitToUser = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);
  const socketsOf = (userId) => io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;

  // Liefert das laufende Spiel eines Nutzers und raeumt dabei veraltete Eintraege weg
  const activeMatch = (userId) => {
    const m = matchOf.get(userId);
    if (!m) return null;
    const p = m.player(userId);
    if (!p || p.left || m.state === 'ended') {
      matchOf.delete(userId);
      return null;
    }
    return m;
  };

  function startMatch({ kind, players, settings, variant = null, lobby = null }) {
    const match = new Match(io, {
      kind,
      players,
      settings,
      variant,
      onEnd: (m) => {
        matches.delete(m.id);
        for (const p of m.players) if (matchOf.get(p.id) === m) matchOf.delete(p.id);
        if (lobby && lobbies.get(lobby.code) === lobby) {
          lobby.match = null;
          broadcastLobby(lobby);
        }
      },
    });
    if (match.planned < 1) return null;
    matches.set(match.id, match);
    for (const p of players) if (!p.isBot) matchOf.set(p.id, match);
    match.start();
    return match;
  }

  const matchmaker = new Matchmaker({
    emitToUser,
    getRating: (userId) => getUser(userId)?.rating ?? 1000,
    onMatch: ({ kind, users, sections, answerMode }) => {
      const players = users.map((u) => playerFromUser(getUser(u.id) ?? u));
      const settings =
        kind === 'ranked'
          ? { sections, ...RANKED_SETTINGS }
          : { sections, answerMode, questionCount: UNRANKED_COUNT };
      for (const u of users) emitToUser(u.id, 'queue:found', { kind });
      startMatch({ kind, players, settings });
    },
  });

  // ---------- Lobbys ----------

  function broadcastLobby(lobby) {
    io.to(`lobby:${lobby.code}`).emit('lobby:state', lobby.publicState());
  }

  function leaveLobby(userId, reason = 'left') {
    const lobby = lobbyOf.get(userId);
    if (!lobby) return;
    clearTimeout(lobbyLeaveTimers.get(userId));
    lobbyLeaveTimers.delete(userId);
    lobbyOf.delete(userId);
    lobby.removeMember(userId);
    io.in(`user:${userId}`).socketsLeave(`lobby:${lobby.code}`);
    emitToUser(userId, 'lobby:closed', { reason });
    if (lobby.members.size === 0) {
      lobbies.delete(lobby.code);
      return;
    }
    broadcastLobby(lobby);
  }

  function enterLobby(user, lobby) {
    lobbyOf.set(user.id, lobby);
    io.in(`user:${user.id}`).socketsJoin(`lobby:${lobby.code}`);
    broadcastLobby(lobby);
  }

  function defaultSections() {
    return rankedSections();
  }

  function readSettings(input, base) {
    const out = { ...base };
    if (input && 'sections' in input) {
      const sections = sanitizeSections(input.sections);
      if (sections.length) out.sections = sections;
    }
    if (input && ANSWER_MODES.has(input.answerMode)) out.answerMode = input.answerMode;
    if (input && QUESTION_COUNTS.has(Number(input.questionCount))) out.questionCount = Number(input.questionCount);
    return out;
  }

  // Vor einer neuen Aktivitaet alles Alte sauber beenden
  function clearActivity(userId, { keepLobby = false } = {}) {
    matchmaker.leave(userId);
    if (!keepLobby) leaveLobby(userId);
  }

  // ---------- Verbindungen ----------

  io.use((socket, next) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    touchUser(user.id);
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const me = () => getUser(userId);
    socket.join(`user:${userId}`);

    // Wiedereinstieg nach Reload oder Verbindungsabbruch
    clearTimeout(lobbyLeaveTimers.get(userId));
    lobbyLeaveTimers.delete(userId);
    const lobby = lobbyOf.get(userId);
    if (lobby) {
      socket.join(`lobby:${lobby.code}`);
      const member = lobby.members.get(userId);
      if (member) member.connected = true;
      broadcastLobby(lobby);
    }
    activeMatch(userId)?.handleReconnect(userId);
    if (matchmaker.has(userId)) matchmaker.emitStatus(matchmaker.entries.get(userId));

    // ----- Queue -----
    socket.on('queue:join', (payload, ack) => {
      const user = me();
      if (!user) return fail(ack, 'Nicht angemeldet.');
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      const kind = payload?.kind === 'ranked' ? 'ranked' : 'unranked';
      if (kind === 'ranked' && user.is_guest) return fail(ack, 'Ranked braucht einen Discord-Login.');

      let sections;
      let answerMode;
      if (kind === 'ranked') {
        sections = rankedSections();
        answerMode = RANKED_SETTINGS.answerMode;
      } else {
        sections = sanitizeSections(payload?.sections);
        answerMode = ANSWER_MODES.has(payload?.answerMode) ? payload.answerMode : 'choice';
        if (countQuestions(sections) < MIN_POOL) return fail(ack, `Wähle Pakete mit mindestens ${MIN_POOL} Fragen aus.`);
      }
      clearActivity(userId);
      matchmaker.join(user, { kind, sections, answerMode });
      done(ack);
    });

    socket.on('queue:leave', (_payload, ack) => {
      matchmaker.leave(userId);
      done(ack);
    });

    // Unranked-Wartezeit abkuerzen: direkt gegen einen Bot
    socket.on('queue:bot', (payload, ack) => {
      const entry = matchmaker.entries.get(userId);
      if (!entry || entry.kind !== 'unranked') return fail(ack, 'Du wartest gerade nicht auf ein Unranked-Spiel.');
      matchmaker.leave(userId);
      const difficulty = isBotDifficulty(payload?.difficulty) ? payload.difficulty : 'mittel';
      const match = startMatch({
        kind: 'bot',
        variant: difficulty,
        players: [playerFromUser(me()), createBot(difficulty)],
        settings: { sections: [...entry.sections], answerMode: entry.answerMode, questionCount: UNRANKED_COUNT },
      });
      if (!match) return fail(ack, 'Zu wenige Fragen in deiner Auswahl.');
      done(ack);
    });

    // ----- Training -----
    socket.on('solo:start', (payload, ack) => {
      const user = me();
      if (!user) return fail(ack, 'Nicht angemeldet.');
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      const sections = sanitizeSections(payload?.sections);
      if (countQuestions(sections) < MIN_POOL) return fail(ack, `Wähle Pakete mit mindestens ${MIN_POOL} Fragen aus.`);
      const answerMode = ANSWER_MODES.has(payload?.answerMode) ? payload.answerMode : 'choice';
      const soloMode = SOLO_MODES.has(payload?.soloMode) ? payload.soloMode : 'classic';
      const questionCount = QUESTION_COUNTS.has(Number(payload?.questionCount)) ? Number(payload.questionCount) : 10;
      const bot = isBotDifficulty(payload?.bot) ? payload.bot : null;

      clearActivity(userId);
      const settings = { sections, answerMode, questionCount, soloMode: bot ? 'classic' : soloMode };
      const match = bot
        ? startMatch({ kind: 'bot', variant: bot, players: [playerFromUser(user), createBot(bot)], settings })
        : startMatch({ kind: 'solo', variant: soloMode, players: [playerFromUser(user)], settings });
      if (!match) return fail(ack, 'Zu wenige Fragen in deiner Auswahl.');
      done(ack, { matchId: match.id });
    });

    // ----- Private Lobbys -----
    socket.on('lobby:create', (payload, ack) => {
      const user = me();
      if (!user) return fail(ack, 'Nicht angemeldet.');
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      clearActivity(userId);
      const settings = readSettings(payload, { sections: defaultSections(), answerMode: 'choice', questionCount: 10 });
      const created = lobbies.create(user, settings);
      enterLobby(user, created);
      done(ack, { code: created.code });
    });

    socket.on('lobby:join', (payload, ack) => {
      const user = me();
      if (!user) return fail(ack, 'Nicht angemeldet.');
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      const target = lobbies.get(payload?.code);
      if (!target) return fail(ack, 'Diese Lobby gibt es nicht (mehr).');
      if (lobbyOf.get(userId) === target) return done(ack, { code: target.code });
      if (target.match) return fail(ack, 'In dieser Lobby läuft gerade ein Spiel.');
      if (target.size >= LOBBY_MAX) return fail(ack, 'Die Lobby ist voll.');
      clearActivity(userId);
      target.addMember(user);
      enterLobby(user, target);
      done(ack, { code: target.code });
    });

    socket.on('lobby:leave', (_payload, ack) => {
      leaveLobby(userId);
      done(ack);
    });

    const hostLobby = (ack) => {
      const l = lobbyOf.get(userId);
      if (!l) return fail(ack, 'Du bist in keiner Lobby.');
      if (l.hostId !== userId) return fail(ack, 'Nur der Host kann das ändern.');
      if (l.match) return fail(ack, 'Während eines Spiels geht das nicht.');
      return l;
    };

    socket.on('lobby:settings', (payload, ack) => {
      const l = hostLobby(ack);
      if (!l) return;
      l.settings = readSettings(payload, l.settings);
      broadcastLobby(l);
      done(ack);
    });

    socket.on('lobby:bot:add', (payload, ack) => {
      const l = hostLobby(ack);
      if (!l) return;
      if (!l.addBot(payload?.difficulty)) return fail(ack, 'Kein Platz mehr für einen Bot.');
      broadcastLobby(l);
      done(ack);
    });

    socket.on('lobby:bot:remove', (payload, ack) => {
      const l = hostLobby(ack);
      if (!l) return;
      l.removeBot(payload?.id);
      broadcastLobby(l);
      done(ack);
    });

    socket.on('lobby:kick', (payload, ack) => {
      const l = hostLobby(ack);
      if (!l) return;
      if (payload?.userId === userId) return fail(ack, 'Du kannst dich nicht selbst entfernen.');
      if (!l.members.has(payload?.userId)) return fail(ack, 'Diese Person ist nicht in der Lobby.');
      leaveLobby(payload.userId, 'kicked');
      done(ack);
    });

    socket.on('lobby:start', (_payload, ack) => {
      const l = hostLobby(ack);
      if (!l) return;
      if (l.size < 2) return fail(ack, 'Es braucht mindestens zwei Teilnehmer. Lade jemanden ein oder nimm einen Bot dazu.');
      if (countQuestions(l.settings.sections) < MIN_POOL) return fail(ack, 'Zu wenige Fragen in der Auswahl.');
      const players = [
        ...[...l.members.values()].filter((m) => socketsOf(m.id) > 0).map((m) => playerFromUser(getUser(m.id) ?? m.user)),
        ...l.bots.map((b) => ({ ...b })),
      ];
      if (players.length < 2) return fail(ack, 'Es sind zu wenige Teilnehmer online.');
      const match = startMatch({ kind: 'private', players, settings: { ...l.settings }, lobby: l });
      if (!match) return fail(ack, 'Zu wenige Fragen in der Auswahl.');
      l.match = match;
      broadcastLobby(l);
      done(ack);
    });

    // ----- Im Spiel -----
    socket.on('match:answer', (payload) => {
      activeMatch(userId)?.submit(userId, payload);
    });

    socket.on('match:typing', (payload) => {
      activeMatch(userId)?.typing(userId, payload?.index);
    });

    socket.on('match:leave', (_payload, ack) => {
      const m = matchOf.get(userId);
      if (m) {
        matchOf.delete(userId);
        m.leave(userId);
      }
      done(ack);
    });

    socket.on('match:sync', (_payload, ack) => {
      const m = activeMatch(userId);
      done(ack, { match: m ? m.syncPayload(userId) : null });
    });

    socket.on('disconnect', () => {
      if (socketsOf(userId) > 0) return; // noch ein anderer Tab offen
      matchmaker.leave(userId);
      activeMatch(userId)?.handleDisconnect(userId);
      const l = lobbyOf.get(userId);
      if (l) {
        const member = l.members.get(userId);
        if (member) member.connected = false;
        broadcastLobby(l);
        lobbyLeaveTimers.set(
          userId,
          setTimeout(() => {
            if (socketsOf(userId) === 0) leaveLobby(userId, 'timeout');
          }, LOBBY_DISCONNECT_MS),
        );
      }
    });
  });

  return {
    stats: () => ({
      matches: matches.size,
      lobbies: lobbies.lobbies.size,
      queued: matchmaker.entries.size,
      online: io.engine.clientsCount,
    }),
  };
}
