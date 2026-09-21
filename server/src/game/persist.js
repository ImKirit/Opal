import { db, transaction } from '../db.js';
import { eloChange } from './rating.js';

// ---------- Kuerzlich gesehene Fragen (nur im Speicher) ----------

const RECENT_LIMIT = 250;
const recent = new Map();

export function recentExclusions(userIds) {
  const out = new Set();
  for (const id of userIds) for (const q of recent.get(id) ?? []) out.add(q);
  return out;
}

export function rememberQuestions(userIds, questionIds) {
  for (const id of userIds) {
    const list = [...(recent.get(id) ?? []), ...questionIds];
    recent.set(id, list.slice(-RECENT_LIMIT));
  }
}

// ---------- Spiele speichern ----------

const getRating = db.prepare('SELECT rating, ranked_games FROM users WHERE id = ?');
const setRating = db.prepare(
  'UPDATE users SET rating = ?, ranked_games = ranked_games + 1, peak_rating = MAX(peak_rating, ?) WHERE id = ?',
);
const insertMatch = db.prepare(`
  INSERT INTO matches (id, kind, variant, answer_mode, sections, question_count, started_at, ended_at, winner_id, end_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlayer = db.prepare(`
  INSERT INTO match_players (match_id, user_id, name, is_bot, score, correct, wrong, avg_ms, best_streak, placement, rating_before, rating_after)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/** Speichert ein beendetes Spiel und gibt bei Ranked die Elo-Aenderungen zurueck. */
export function saveMatch(match, { reason, winnerId, summary }) {
  return transaction(() => {
    const ratingChanges = {};
    const humans = match.players.filter((p) => !p.isBot);

    if (match.kind === 'ranked' && humans.length === 2) {
      const [a, b] = humans;
      const ra = getRating.get(a.id);
      const rb = getRating.get(b.id);
      const scoreA = winnerId === a.id ? 1 : winnerId === b.id ? 0 : 0.5;
      const da = eloChange(ra.rating, rb.rating, scoreA, ra.ranked_games);
      const dbb = eloChange(rb.rating, ra.rating, 1 - scoreA, rb.ranked_games);
      const afterA = Math.max(0, ra.rating + da);
      const afterB = Math.max(0, rb.rating + dbb);
      setRating.run(afterA, afterA, a.id);
      setRating.run(afterB, afterB, b.id);
      ratingChanges[a.id] = { before: ra.rating, after: afterA, delta: afterA - ra.rating, games: ra.ranked_games + 1 };
      ratingChanges[b.id] = { before: rb.rating, after: afterB, delta: afterB - rb.rating, games: rb.ranked_games + 1 };
    }

    insertMatch.run(
      match.id,
      match.kind,
      match.variant,
      match.settings.answerMode,
      JSON.stringify(match.settings.sections),
      match.index + 1,
      match.startedAt,
      Date.now(),
      winnerId,
      reason,
    );
    for (const s of summary) {
      const rc = ratingChanges[s.id];
      insertPlayer.run(
        match.id,
        s.id,
        s.name,
        s.isBot ? 1 : 0,
        s.score,
        s.correct,
        s.wrong,
        s.avgMs,
        s.bestStreak,
        s.placement,
        rc ? rc.before : null,
        rc ? rc.after : null,
      );
    }
    return ratingChanges;
  });
}

// ---------- Auswertungen fuer Profil und Rangliste ----------

const DUEL_KINDS = "('ranked','unranked','private')";

export function userStats(userId) {
  const duel = db
    .prepare(
      `SELECT COUNT(*) AS played,
              SUM(CASE WHEN m.winner_id = mp.user_id THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN m.winner_id IS NULL THEN 1 ELSE 0 END) AS draws
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ? AND m.kind IN ${DUEL_KINDS}`,
    )
    .get(userId);
  const ranked = db
    .prepare(
      `SELECT COUNT(*) AS played,
              SUM(CASE WHEN m.winner_id = mp.user_id THEN 1 ELSE 0 END) AS wins
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ? AND m.kind = 'ranked'`,
    )
    .get(userId);
  const answers = db
    .prepare(
      `SELECT SUM(correct) AS correct, SUM(wrong) AS wrong, AVG(avg_ms) AS avg_ms, MAX(best_streak) AS best_streak
         FROM match_players WHERE user_id = ?`,
    )
    .get(userId);
  const survival = db
    .prepare(
      `SELECT MAX(mp.score) AS best FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ? AND m.kind = 'solo' AND m.variant = 'survival'`,
    )
    .get(userId);
  const training = db
    .prepare(
      `SELECT COUNT(*) AS played FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ? AND m.kind IN ('solo','bot')`,
    )
    .get(userId);

  const correct = answers.correct ?? 0;
  const wrong = answers.wrong ?? 0;
  return {
    duels: duel.played ?? 0,
    wins: duel.wins ?? 0,
    draws: duel.draws ?? 0,
    losses: Math.max(0, (duel.played ?? 0) - (duel.wins ?? 0) - (duel.draws ?? 0)),
    rankedPlayed: ranked.played ?? 0,
    rankedWins: ranked.wins ?? 0,
    trainingPlayed: training.played ?? 0,
    correct,
    wrong,
    accuracy: correct + wrong > 0 ? correct / (correct + wrong) : null,
    avgMs: answers.avg_ms != null ? Math.round(answers.avg_ms) : null,
    bestStreak: answers.best_streak ?? 0,
    survivalBest: survival.best ?? 0,
  };
}

export function recentMatches(userId, limit = 15) {
  const rows = db
    .prepare(
      `SELECT m.id, m.kind, m.variant, m.answer_mode, m.ended_at, m.winner_id, m.end_reason,
              mp.score, mp.placement, mp.rating_before, mp.rating_after
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ?
        ORDER BY m.ended_at DESC LIMIT ?`,
    )
    .all(userId, limit);
  const others = db.prepare(
    'SELECT user_id, name, is_bot, score FROM match_players WHERE match_id = ? AND user_id != ? ORDER BY score DESC',
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    variant: r.variant,
    answerMode: r.answer_mode,
    endedAt: r.ended_at,
    result: r.kind === 'solo' ? 'solo' : r.winner_id === userId ? 'win' : r.winner_id == null ? 'draw' : 'loss',
    reason: r.end_reason,
    score: r.score,
    placement: r.placement,
    ratingDelta: r.rating_before != null ? r.rating_after - r.rating_before : null,
    opponents: others.all(r.id, userId).map((o) => ({ id: o.user_id, name: o.name, isBot: Boolean(o.is_bot), score: o.score })),
  }));
}

export function leaderboard(limit = 100) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.rating, u.peak_rating, u.ranked_games,
              (SELECT COUNT(*) FROM matches m WHERE m.kind = 'ranked' AND m.winner_id = u.id) AS wins
         FROM users u
        WHERE u.ranked_games > 0 AND u.is_guest = 0
        ORDER BY u.rating DESC, u.ranked_games DESC
        LIMIT ?`,
    )
    .all(limit)
    .map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      rating: r.rating,
      peakRating: r.peak_rating,
      rankedGames: r.ranked_games,
      wins: r.wins,
    }));
}
