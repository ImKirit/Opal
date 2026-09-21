import { randomUUID } from 'node:crypto';
import { db } from './db.js';

const byId = db.prepare('SELECT * FROM users WHERE id = ?');
const byDiscord = db.prepare('SELECT * FROM users WHERE discord_id = ?');

export function getUser(id) {
  return byId.get(id) ?? null;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    guest: Boolean(row.is_guest),
    rating: row.rating,
    peakRating: row.peak_rating,
    rankedGames: row.ranked_games,
  };
}

export function createGuest(name) {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, name, is_guest, created_at, last_seen) VALUES (?, ?, 1, ?, ?)',
  ).run(id, name, now, now);
  return getUser(id);
}

// Discord-Login: bestehenden Discord-Nutzer aktualisieren, sonst einen Gast-Account
// uebernehmen (Statistiken bleiben erhalten) oder einen neuen Nutzer anlegen.
export function upsertDiscordUser({ discordId, name, avatar }, guestToUpgrade) {
  const now = Date.now();
  const existing = byDiscord.get(discordId);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, avatar = ?, last_seen = ? WHERE id = ?').run(
      name,
      avatar,
      now,
      existing.id,
    );
    return getUser(existing.id);
  }
  if (guestToUpgrade && guestToUpgrade.is_guest) {
    db.prepare(
      'UPDATE users SET discord_id = ?, name = ?, avatar = ?, is_guest = 0, last_seen = ? WHERE id = ?',
    ).run(discordId, name, avatar, now, guestToUpgrade.id);
    return getUser(guestToUpgrade.id);
  }
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, discord_id, name, avatar, is_guest, created_at, last_seen) VALUES (?, ?, ?, ?, 0, ?, ?)',
  ).run(id, discordId, name, avatar, now, now);
  return getUser(id);
}

export function touchUser(id) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), id);
}

export function validateName(raw) {
  const name = String(raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 20) return { error: 'Der Name muss 2 bis 20 Zeichen lang sein.' };
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(name)) return { error: 'Erlaubt sind Buchstaben, Zahlen, Leerzeichen, Punkt, Minus und Unterstrich.' };
  return { name };
}
