import { db } from './db.js';
import { LADDER_IDS } from './game/ladders.js';
import { START_RATING } from './game/rating.js';

// Raenge pro Person und Ranked-Modus. Wer einen Modus noch nie gespielt hat, hat dort noch
// keine Zeile und steht mit dem Startwert da.

const getRow = db.prepare('SELECT rating, peak_rating, games, wins FROM ratings WHERE user_id = ? AND ladder = ?');
const allRows = db.prepare('SELECT ladder, rating, peak_rating, games, wins FROM ratings WHERE user_id = ?');
const upsert = db.prepare(`
  INSERT INTO ratings (user_id, ladder, rating, peak_rating, games, wins, updated_at)
  VALUES (?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT (user_id, ladder) DO UPDATE SET
    rating = excluded.rating,
    peak_rating = MAX(ratings.peak_rating, excluded.rating),
    games = ratings.games + 1,
    wins = ratings.wins + excluded.wins,
    updated_at = excluded.updated_at
`);

const fresh = () => ({ rating: START_RATING, peak: START_RATING, games: 0, wins: 0 });
const toRank = (row) => (row ? { rating: row.rating, peak: row.peak_rating, games: row.games, wins: row.wins } : fresh());

export function rankOf(userId, ladder) {
  return toRank(getRow.get(userId, ladder));
}

/** Alle Raenge einer Person, auch fuer Modi ohne Spiel (dann Startwert) */
export function ranksOf(userId) {
  const out = {};
  for (const id of LADDER_IDS) out[id] = fresh();
  for (const row of allRows.all(userId)) if (out[row.ladder]) out[row.ladder] = toRank(row);
  return out;
}

/** Ergebnis eines Ranked-Spiels eintragen (innerhalb der Speicher-Transaktion aufrufen). */
export function recordRanked(userId, ladder, ratingAfter, won) {
  upsert.run(userId, ladder, ratingAfter, ratingAfter, won ? 1 : 0, Date.now());
}
