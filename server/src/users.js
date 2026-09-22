import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { ranksOf } from './ratings.js';
import { isOwner, refreshOwners } from './roles.js';

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
    owner: isOwner(row.id),
    /** Discord-Benutzername (nur Discord-Konten, sonst null) */
    handle: row.discord_username ?? null,
    /** Rang pro Ranked-Modus, siehe game/ladders.js */
    ranks: ranksOf(row.id),
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
// Discord-Konten zeigen ihren Discord-Anzeigenamen (`name`), der Benutzername (`discord_username`)
// erscheint beim Drueberfahren und laesst sich kopieren, damit man sich auf Discord findet
// (Owner 2026-09-22, zweite Fassung).
export function upsertDiscordUser(input, guestToUpgrade) {
  const user = saveDiscordUser(input, guestToUpgrade);
  refreshOwners();
  return user;
}

function saveDiscordUser({ discordId, name, username = null, avatar }, guestToUpgrade) {
  const now = Date.now();
  const existing = byDiscord.get(discordId);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, discord_username = ?, avatar = ?, last_seen = ? WHERE id = ?').run(
      name,
      username,
      avatar,
      now,
      existing.id,
    );
    return getUser(existing.id);
  }
  if (guestToUpgrade && guestToUpgrade.is_guest) {
    db.prepare(
      'UPDATE users SET discord_id = ?, name = ?, discord_username = ?, avatar = ?, is_guest = 0, last_seen = ? WHERE id = ?',
    ).run(discordId, name, username, avatar, now, guestToUpgrade.id);
    return getUser(guestToUpgrade.id);
  }
  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, discord_id, name, discord_username, avatar, is_guest, created_at, last_seen) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
  ).run(id, discordId, name, username, avatar, now, now);
  return getUser(id);
}

/** Gibt es schon ein Discord-Konto mit diesem Namen? Gaeste duerfen ihn dann nicht nehmen. */
export function nameTakenByDiscord(name) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM users WHERE is_guest = 0 AND (lower(name) = lower(?) OR lower(discord_username) = lower(?)) LIMIT 1')
      .get(name, name),
  );
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
