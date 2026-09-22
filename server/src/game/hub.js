import { randomUUID } from 'node:crypto';
import { userFromCookieHeader } from '../auth.js';
import { friendIds, relation } from '../friends.js';
import { countQuestions, rankedSections } from '../packs.js';
import { rankOf } from '../ratings.js';
import { isOwner } from '../roles.js';
import { getUser, touchUser } from '../users.js';
import { createBot, isBotDifficulty } from './bot.js';
import { LOBBY_MAX, LobbyRegistry } from './lobbies.js';
import { Match } from './match.js';
import { Matchmaker } from './matchmaker.js';
import { DEFAULT_LADDER, isLadder, LADDERS } from './ladders.js';
import { DEFAULT_SETTINGS, readSettings, SOLO_MODES } from './settings.js';

// Ranked ist fuer alle gleich: fester Pool (Allgemein), feste Regeln je Modus (ladders.js)
const rankedSettings = (ladder) => ({ ...DEFAULT_SETTINGS, ...LADDERS[ladder].settings, sections: rankedSections(), ladder });
const UNRANKED_COUNT = 10;
/** Was man vor Training und Unranked selbst waehlen darf */
const PLAYER_FIELDS = ['sections', 'answerMode', 'questionCount', 'difficulty', 'optionCount'];
/** Was der Lobby-Host einstellen darf */
const LOBBY_FIELDS = [...PLAYER_FIELDS, 'timeLimit', 'continueMode', 'locked'];
const LOBBY_DISCONNECT_MS = 30000;
const MIN_POOL = 5;
/** So lange gilt eine Match-Anfrage an Freunde */
const INVITE_MS = 30000;
const MAX_OUTGOING_INVITES = 3;

const fail = (ack, error) => typeof ack === 'function' && ack({ ok: false, error });
const done = (ack, data = {}) => typeof ack === 'function' && ack({ ok: true, ...data });

/** Spieler fuer ein Match. Bei Ranked traegt er die Punkte seines Modus mit (Anzeige im Duell). */
function playerFromUser(row, ladder = null) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? null,
    guest: Boolean(row.is_guest),
    rating: ladder ? rankOf(row.id, ladder).rating : null,
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
    getRating: (userId, ladder) => rankOf(userId, ladder).rating,
    onMatch: ({ kind, ladder, users, sections, answerMode, difficulty, optionCount }) => {
      const ranked = kind === 'ranked';
      const players = users.map((u) => playerFromUser(getUser(u.id) ?? u, ranked ? ladder : null));
      const settings = ranked
        ? rankedSettings(ladder)
        : { ...DEFAULT_SETTINGS, sections, answerMode, difficulty, optionCount, questionCount: UNRANKED_COUNT };
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

  /** Startet das Spiel einer Lobby. Liefert eine Fehlermeldung oder null. */
  function startLobbyMatch(l) {
    if (l.size < 2) return 'Es braucht mindestens zwei Teilnehmer. Lade jemanden ein oder nimm einen Bot dazu.';
    if (countQuestions(l.settings.sections) < MIN_POOL) return 'Zu wenige Fragen in der Auswahl.';
    const players = [
      ...[...l.members.values()].filter((m) => socketsOf(m.id) > 0).map((m) => playerFromUser(getUser(m.id) ?? m.user)),
      ...l.bots.map((b) => ({ ...b })),
    ];
    if (players.length < 2) return 'Es sind zu wenige Teilnehmer online.';
    const match = startMatch({ kind: 'private', players, settings: { ...l.settings }, lobby: l });
    if (!match) return 'Zu wenige Fragen in der Auswahl.';
    l.match = match;
    broadcastLobby(l);
    return null;
  }

  // ---------- Online-Status und Freunde ----------

  /** Was Freunde ueber jemanden sehen: offline, online, queue, lobby oder playing */
  function presence(userId) {
    if (socketsOf(userId) === 0) return 'offline';
    if (activeMatch(userId)) return 'playing';
    if (matchmaker.has(userId)) return 'queue';
    if (lobbyOf.has(userId)) return 'lobby';
    return 'online';
  }

  function notifyFriends(userId) {
    for (const id of friendIds(userId)) emitToUser(id, 'friends:changed', { reason: 'presence' });
  }

  // ---------- Match-Anfragen an Freunde ----------

  const invites = new Map(); // inviteId -> Einladung

  function publicInvite(inv) {
    const from = getUser(inv.fromId);
    const to = getUser(inv.toId);
    return {
      id: inv.id,
      from: { id: inv.fromId, name: from?.name ?? '?', avatar: from?.avatar ?? null, owner: isOwner(inv.fromId) },
      to: { id: inv.toId, name: to?.name ?? '?', avatar: to?.avatar ?? null, owner: isOwner(inv.toId) },
      intoLobby: inv.intoLobby,
      expiresInMs: Math.max(0, inv.expiresAt - Date.now()),
    };
  }

  function closeInvite(inv, reason, byName = null) {
    if (invites.get(inv.id) !== inv) return;
    invites.delete(inv.id);
    clearTimeout(inv.timer);
    const payload = { id: inv.id, reason, by: byName };
    emitToUser(inv.fromId, 'invite:closed', payload);
    emitToUser(inv.toId, 'invite:closed', payload);
  }

  function closeInvitesOf(userId, reason) {
    for (const inv of [...invites.values()]) {
      if (inv.fromId === userId || inv.toId === userId) closeInvite(inv, reason);
    }
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
    if (socketsOf(userId) === 1) notifyFriends(userId);
    // Offene Anfragen an diese Person nach einem Neuladen wieder zeigen
    for (const inv of invites.values()) if (inv.toId === userId) socket.emit('invite:received', publicInvite(inv));

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
      const ladder = kind === 'ranked' ? (isLadder(payload?.ladder) ? payload.ladder : DEFAULT_LADDER) : null;

      const wanted = ladder ? rankedSettings(ladder) : readSettings(payload, { sections: [] }, PLAYER_FIELDS);
      if (kind === 'unranked' && countQuestions(wanted.sections) < MIN_POOL) {
        return fail(ack, `Wähle Themen mit mindestens ${MIN_POOL} Fragen aus.`);
      }
      clearActivity(userId);
      matchmaker.join(user, {
        kind,
        ladder,
        sections: wanted.sections,
        answerMode: wanted.answerMode,
        difficulty: wanted.difficulty,
        optionCount: wanted.optionCount,
      });
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
        settings: {
          ...DEFAULT_SETTINGS,
          sections: [...entry.sections],
          answerMode: entry.answerMode,
          difficulty: entry.difficulty,
          optionCount: entry.optionCount,
          questionCount: UNRANKED_COUNT,
        },
      });
      if (!match) return fail(ack, 'Zu wenige Fragen in deiner Auswahl.');
      done(ack);
    });

    // ----- Training -----
    socket.on('solo:start', (payload, ack) => {
      const user = me();
      if (!user) return fail(ack, 'Nicht angemeldet.');
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      const picked = readSettings(payload, { sections: [] }, PLAYER_FIELDS);
      if (countQuestions(picked.sections) < MIN_POOL) return fail(ack, `Wähle Themen mit mindestens ${MIN_POOL} Fragen aus.`);
      const soloMode = SOLO_MODES.has(payload?.soloMode) ? payload.soloMode : 'classic';
      const bot = isBotDifficulty(payload?.bot) ? payload.bot : null;

      clearActivity(userId);
      const settings = { ...picked, soloMode: bot ? 'classic' : soloMode };
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
      const settings = readSettings(payload, { sections: defaultSections(), locked: false }, LOBBY_FIELDS);
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
      if (target.settings.locked) return fail(ack, 'Diese Lobby ist abgeschlossen. Der Host muss sie erst öffnen.');
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
      l.settings = readSettings(payload, l.settings, LOBBY_FIELDS);
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
      const error = startLobbyMatch(l);
      if (error) return fail(ack, error);
      done(ack);
    });

    // ----- Match-Anfragen an Freunde -----
    socket.on('invite:send', (payload, ack) => {
      const user = me();
      const target = getUser(String(payload?.userId ?? ''));
      if (!user || !target) return fail(ack, 'Diese Person gibt es nicht.');
      if (relation(userId, target.id) !== 'friend') return fail(ack, 'Herausfordern kannst du nur Freunde.');
      if (socketsOf(target.id) === 0) return fail(ack, `${target.name} ist gerade nicht online.`);
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');
      if (activeMatch(target.id)) return fail(ack, `${target.name} spielt gerade.`);
      const existing = [...invites.values()].find((i) => i.fromId === userId && i.toId === target.id);
      if (existing) return done(ack, { invite: publicInvite(existing) });
      if ([...invites.values()].filter((i) => i.fromId === userId).length >= MAX_OUTGOING_INVITES) {
        return fail(ack, 'Du hast schon genug offene Anfragen. Warte kurz auf eine Antwort.');
      }
      const inv = {
        id: randomUUID(),
        fromId: userId,
        toId: target.id,
        // Sitzt man schon in einer Lobby, holt die Anfrage die Person dort hinein
        intoLobby: lobbyOf.has(userId),
        settings: readSettings(payload?.settings, { sections: defaultSections(), locked: false }, PLAYER_FIELDS),
        expiresAt: Date.now() + INVITE_MS,
        timer: null,
      };
      inv.timer = setTimeout(() => closeInvite(inv, 'expired'), INVITE_MS);
      invites.set(inv.id, inv);
      emitToUser(target.id, 'invite:received', publicInvite(inv));
      done(ack, { invite: publicInvite(inv) });
    });

    socket.on('invite:cancel', (payload, ack) => {
      const inv = invites.get(payload?.id);
      if (inv && inv.fromId === userId) closeInvite(inv, 'cancelled', me()?.name);
      done(ack);
    });

    socket.on('invite:respond', (payload, ack) => {
      const inv = invites.get(payload?.id);
      if (!inv || inv.toId !== userId) return fail(ack, 'Diese Anfrage ist abgelaufen.');
      const user = me();
      const inviter = getUser(inv.fromId);
      if (!payload?.accept) {
        closeInvite(inv, 'declined', user?.name);
        return done(ack);
      }
      if (!user || !inviter || socketsOf(inviter.id) === 0) {
        closeInvite(inv, 'expired');
        return fail(ack, `${inviter?.name ?? 'Die Person'} ist nicht mehr online.`);
      }
      if (activeMatch(inviter.id)) {
        closeInvite(inv, 'busy');
        return fail(ack, `${inviter.name} spielt inzwischen schon.`);
      }
      if (activeMatch(userId)) return fail(ack, 'Du bist gerade in einem Spiel.');

      const existing = lobbyOf.get(inviter.id);
      if (existing) {
        if (existing.match) return fail(ack, 'In der Lobby läuft gerade ein Spiel. Versuch es gleich nochmal.');
        if (existing.size >= LOBBY_MAX) return fail(ack, 'Die Lobby ist voll.');
        closeInvite(inv, 'accepted', user.name);
        clearActivity(userId);
        existing.addMember(user);
        enterLobby(user, existing);
        return done(ack, { code: existing.code });
      }

      // Keine Lobby: neue Lobby des Einladenden, beide rein, Spiel startet sofort.
      // Nach dem Spiel bleiben beide in der Lobby und koennen direkt nochmal.
      closeInvite(inv, 'accepted', user.name);
      clearActivity(inviter.id);
      clearActivity(userId);
      const lobby = lobbies.create(inviter, inv.settings);
      enterLobby(inviter, lobby);
      lobby.addMember(user);
      enterLobby(user, lobby);
      const error = startLobbyMatch(lobby);
      if (error) emitToUser(inviter.id, 'lobby:notice', { text: error });
      done(ack, { code: lobby.code });
    });

    // ----- Im Spiel -----
    socket.on('match:answer', (payload) => {
      activeMatch(userId)?.submit(userId, payload);
    });

    socket.on('match:skip', (payload) => {
      activeMatch(userId)?.skip(userId, payload);
    });

    socket.on('match:continue', (payload) => {
      activeMatch(userId)?.continue(userId, payload);
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
      notifyFriends(userId);
      closeInvitesOf(userId, 'offline');
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
    presence,
    notify: emitToUser,
    stats: () => ({
      matches: matches.size,
      lobbies: lobbies.lobbies.size,
      queued: matchmaker.entries.size,
      online: io.engine.clientsCount,
    }),
  };
}
