import { db } from './db.js';
import { getUser } from './users.js';

// Freundschaften: eine Zeile pro Paar. Wer anfragt, steht in user_id. Solange die andere
// Person nicht angenommen hat, ist der Status "pending", danach "accepted".

const MAX_FRIENDS = 200;
const SEARCH_LIMIT = 20;

const rowBetween = db.prepare('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?');
const acceptedList = db.prepare(`
  SELECT u.* FROM friendships f
  JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
  WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
  ORDER BY u.name COLLATE NOCASE
`);
const incomingList = db.prepare(`
  SELECT u.* FROM friendships f JOIN users u ON u.id = f.user_id
  WHERE f.friend_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
`);
const outgoingList = db.prepare(`
  SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id
  WHERE f.user_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC
`);
const countOf = db.prepare('SELECT COUNT(*) AS n FROM friendships WHERE user_id = ? OR friend_id = ?');
const insert = db.prepare("INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)");
const accept = db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ? AND status = 'pending'");
const removePair = db.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)');
const search = db.prepare(`
  SELECT * FROM users
  WHERE id != ? AND name LIKE ? ESCAPE '\\'
  ORDER BY (lower(name) = lower(?)) DESC, is_guest ASC, last_seen DESC
  LIMIT ?
`);

/** Kurzes Kennzeichen aus der ID, damit man gleichnamige Leute auseinanderhalten kann */
export const tagOf = (id) => id.replace(/-/g, '').slice(0, 4).toUpperCase();

export function friendCard(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    guest: Boolean(row.is_guest),
    rating: row.rating,
    rankedGames: row.ranked_games,
    tag: tagOf(row.id),
  };
}

/** Beziehung aus Sicht von `me` zu `other`: none, friend, outgoing, incoming */
export function relation(me, other) {
  const mine = rowBetween.get(me, other);
  const theirs = rowBetween.get(other, me);
  if (mine?.status === 'accepted' || theirs?.status === 'accepted') return 'friend';
  if (mine) return 'outgoing';
  if (theirs) return 'incoming';
  return 'none';
}

export function friendIds(userId) {
  return acceptedList.all(userId, userId, userId).map((r) => r.id);
}

export function listFriends(userId) {
  return {
    friends: acceptedList.all(userId, userId, userId),
    incoming: incomingList.all(userId),
    outgoing: outgoingList.all(userId),
  };
}

/**
 * Anfrage schicken. Liegt schon eine Anfrage der anderen Person vor, gilt das als Annehmen.
 * @returns {{ ok: true, status: 'pending' | 'accepted' } | { ok: false, error: string }}
 */
export function requestFriend(fromId, toId) {
  if (fromId === toId) return { ok: false, error: 'Mit dir selbst bist du schon befreundet.' };
  const target = getUser(toId);
  if (!target) return { ok: false, error: 'Diese Person gibt es nicht.' };
  const rel = relation(fromId, toId);
  if (rel === 'friend') return { ok: false, error: `Du bist schon mit ${target.name} befreundet.` };
  if (rel === 'outgoing') return { ok: true, status: 'pending' };
  if (rel === 'incoming') {
    accept.run(toId, fromId);
    return { ok: true, status: 'accepted' };
  }
  if (countOf.get(fromId, fromId).n >= MAX_FRIENDS) {
    return { ok: false, error: `Mehr als ${MAX_FRIENDS} Freunde und offene Anfragen gehen nicht.` };
  }
  insert.run(fromId, toId, Date.now());
  return { ok: true, status: 'pending' };
}

/** Anfrage von `fromId` annehmen. */
export function acceptFriend(meId, fromId) {
  return accept.run(fromId, meId).changes > 0;
}

/** Entfernt Freundschaft oder offene Anfrage, egal in welche Richtung (Ablehnen, Zurueckziehen, Entfreunden). */
export function removeFriendship(a, b) {
  return removePair.run(a, b, b, a).changes > 0;
}

export function searchUsers(meId, query) {
  const term = String(query ?? '').normalize('NFC').trim().slice(0, 20);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return search.all(meId, like, term, SEARCH_LIMIT);
}
