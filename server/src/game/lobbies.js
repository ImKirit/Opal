import { randomInt } from 'node:crypto';
import { isOwner } from '../roles.js';
import { createBot, isBotDifficulty } from './bot.js';

// Private Lobbys: bis zu 8 Teilnehmer (Menschen plus Bots), beitreten per 5-stelligem Code.
// Nach einem Spiel bleibt die Lobby offen, so dass man direkt noch eine Runde starten kann.

export const LOBBY_MAX = 8;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Lobby {
  constructor(code, host, settings) {
    this.code = code;
    this.hostId = host.id;
    this.members = new Map();
    this.bots = [];
    this.settings = settings;
    this.match = null;
    this.addMember(host);
  }

  get size() {
    return this.members.size + this.bots.length;
  }

  addMember(user) {
    this.members.set(user.id, {
      id: user.id,
      name: user.name,
      avatar: user.avatar ?? null,
      guest: Boolean(user.is_guest),
      connected: true,
      user,
    });
  }

  removeMember(userId) {
    this.members.delete(userId);
    if (this.hostId === userId) {
      const next = this.members.keys().next();
      this.hostId = next.done ? null : next.value;
    }
  }

  addBot(difficulty) {
    if (!isBotDifficulty(difficulty) || this.size >= LOBBY_MAX) return false;
    this.bots.push(createBot(difficulty));
    return true;
  }

  removeBot(botId) {
    this.bots = this.bots.filter((b) => b.id !== botId);
  }

  publicState() {
    return {
      code: this.code,
      hostId: this.hostId,
      max: LOBBY_MAX,
      playing: Boolean(this.match),
      locked: Boolean(this.settings.locked),
      settings: this.settings,
      members: [...this.members.values()].map(({ user, ...rest }) => ({ ...rest, owner: isOwner(rest.id) })),
      bots: this.bots.map((b) => ({ id: b.id, name: b.name, difficulty: b.difficulty })),
    };
  }
}

export class LobbyRegistry {
  constructor() {
    this.lobbies = new Map();
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.lobbies.has(code)) return code;
    }
  }

  create(host, settings) {
    const lobby = new Lobby(this.newCode(), host, settings);
    this.lobbies.set(lobby.code, lobby);
    return lobby;
  }

  get(code) {
    return this.lobbies.get(String(code ?? '').trim().toUpperCase()) ?? null;
  }

  delete(code) {
    this.lobbies.delete(code);
  }
}
