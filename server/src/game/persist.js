import { db, transaction } from '../db.js';
import { rankOf, recordRanked } from '../ratings.js';
import { isOwner } from '../roles.js';
import { LADDERS, LADDER_IDS, isLadder } from './ladders.js';
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

const insertMatch = db.prepare(`
  INSERT INTO matches (id, kind, variant, answer_mode, sections, question_count, started_at, ended_at, winner_id, end_reason, ladder)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlayer = db.prepare(`
  INSERT INTO match_players (match_id, user_id, name, is_bot, score, correct, wrong, avg_ms, best_streak, placement, rating_before, rating_after)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Speichert ein beendetes Spiel und gibt bei Ranked die Elo-Aenderungen zurueck. Ranked zaehlt
 * nur fuer den Rang seines Modus (match.settings.ladder), alle anderen Arten haben keinen Rang.
 */
export function saveMatch(match, { reason, winnerId, summary }) {
  return transaction(() => {
    const ratingChanges = {};
    const humans = match.players.filter((p) => !p.isBot);
    const ladder = match.kind === 'ranked' && isLadder(match.settings.ladder) ? match.settings.ladder : null;

    if (ladder && humans.length === 2) {
      const [a, b] = humans;
      const ra = rankOf(a.id, ladder);
      const rb = rankOf(b.id, ladder);
      const scoreA = winnerId === a.id ? 1 : winnerId === b.id ? 0 : 0.5;
      const da = eloChange(ra.rating, rb.rating, scoreA, ra.games);
      const dbb = eloChange(rb.rating, ra.rating, 1 - scoreA, rb.games);
      const afterA = Math.max(0, ra.rating + da);
      const afterB = Math.max(0, rb.rating + dbb);
      recordRanked(a.id, ladder, afterA, winnerId === a.id);
      recordRanked(b.id, ladder, afterB, winnerId === b.id);
      ratingChanges[a.id] = { ladder, before: ra.rating, after: afterA, delta: afterA - ra.rating, games: ra.games + 1 };
      ratingChanges[b.id] = { ladder, before: rb.rating, after: afterB, delta: afterB - rb.rating, games: rb.games + 1 };
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
      ladder,
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
  const time = db.prepare(`SELECT SUM(${PLAY_MS}) AS ms FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ?`).get(userId);

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
    playMs: time.ms ?? 0,
  };
}

export function recentMatches(userId, limit = 15) {
  const rows = db
    .prepare(
      `SELECT m.id, m.kind, m.variant, m.answer_mode, m.ladder, m.ended_at, m.winner_id, m.end_reason,
              mp.score, mp.placement, mp.rating_before, mp.rating_after
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ?
        ORDER BY m.ended_at DESC LIMIT ?`,
    )
    .all(userId, limit);
  // Aktueller Name statt dem beim Spiel gespeicherten (Discord-Konten heissen inzwischen wie ihr Benutzername)
  const others = db.prepare(
    `SELECT mp.user_id, coalesce(u.name, mp.name) AS name, u.discord_username AS handle, mp.is_bot, mp.score
       FROM match_players mp LEFT JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id = ? AND mp.user_id != ? ORDER BY mp.score DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    variant: r.variant,
    answerMode: r.answer_mode,
    ladder: r.ladder ?? null,
    endedAt: r.ended_at,
    result: r.kind === 'solo' ? 'solo' : r.winner_id === userId ? 'win' : r.winner_id == null ? 'draw' : 'loss',
    reason: r.end_reason,
    score: r.score,
    placement: r.placement,
    ratingDelta: r.rating_before != null ? r.rating_after - r.rating_before : null,
    opponents: others.all(r.id, userId).map((o) => ({
      id: o.user_id,
      name: o.name,
      isBot: Boolean(o.is_bot),
      owner: !o.is_bot && isOwner(o.user_id),
      handle: o.handle ?? null,
      score: o.score,
    })),
  }));
}

// ---------- Ranglisten ----------

/**
 * Spielzeit eines Spiels, gedeckelt auf eine Minute pro Frage: wer vor dem Weiter-Knopf
 * einschlaeft, soll nicht an die Spitze der Spielzeit-Liste rutschen.
 */
const PLAY_MS = 'MIN(m.ended_at - m.started_at, m.question_count * 60000)';

/** Duelle gegen mindestens einen weiteren Menschen (Ranked, Unranked, Lobbys, Freunde) */
const VS_HUMANS = `m.kind IN ${DUEL_KINDS} AND (SELECT COUNT(*) FROM match_players h WHERE h.match_id = m.id AND h.is_bot = 0) >= 2`;

/** Ab so vielen richtigen Antworten im Training zaehlt man in der Tempo-Liste */
export const TEMPO_MIN_CORRECT = 30;

const STAT_BOARDS = {
  siege: {
    name: 'Siege',
    format: 'count',
    desc: 'Gewonnene Duelle gegen Menschen: Ranked, Unranked, Lobbys und Freunde. Bots zählen nicht.',
    sql: `SELECT u.id, u.name, u.avatar, u.discord_username AS handle,
                 SUM(CASE WHEN m.winner_id = u.id THEN 1 ELSE 0 END) AS value, COUNT(*) AS games
            FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
           WHERE u.is_guest = 0 AND ${VS_HUMANS}
           GROUP BY u.id HAVING value > 0
           ORDER BY value DESC, games ASC`,
  },
  spielzeit: {
    name: 'Spielzeit',
    format: 'duration',
    desc: 'Zeit in allen Spielen zusammen, Training eingeschlossen.',
    sql: `SELECT u.id, u.name, u.avatar, u.discord_username AS handle, SUM(${PLAY_MS}) AS value, COUNT(*) AS games
            FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
           WHERE u.is_guest = 0
           GROUP BY u.id HAVING value > 0
           ORDER BY value DESC`,
  },
  tempo: {
    name: 'Tempo',
    format: 'ms',
    desc: `Durchschnittliche Zeit für richtige Antworten im Training, ab ${TEMPO_MIN_CORRECT} richtigen. Kleiner ist besser.`,
    sql: `SELECT u.id, u.name, u.avatar, u.discord_username AS handle,
                 CAST(ROUND(SUM(mp.avg_ms * mp.correct) * 1.0 / SUM(mp.correct)) AS INTEGER) AS value,
                 SUM(mp.correct) AS games
            FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
           WHERE u.is_guest = 0 AND m.kind = 'solo' AND mp.avg_ms IS NOT NULL AND mp.correct > 0
           GROUP BY u.id HAVING SUM(mp.correct) >= ${TEMPO_MIN_CORRECT}
           ORDER BY value ASC`,
  },
  ueberleben: {
    name: 'Überleben',
    format: 'count',
    desc: 'Die meisten richtigen Antworten in einem Überleben-Training, bevor die drei Leben weg sind.',
    sql: `SELECT u.id, u.name, u.avatar, u.discord_username AS handle, MAX(mp.score) AS value, COUNT(*) AS games, MIN(m.ended_at) AS first
            FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
           WHERE u.is_guest = 0 AND m.kind = 'solo' AND m.variant = 'survival'
           GROUP BY u.id HAVING value > 0
           ORDER BY value DESC, first ASC`,
  },
};

const ladderSql = `SELECT u.id, u.name, u.avatar, u.discord_username AS handle, r.rating AS value, r.games AS games, r.wins AS wins, r.peak_rating AS peak
                     FROM ratings r JOIN users u ON u.id = r.user_id
                    WHERE r.ladder = ? AND r.games > 0 AND u.is_guest = 0
                    ORDER BY r.rating DESC, r.games DESC`;

/** Alle Ranglisten fuer den Client: zuerst die Ranked-Modi, dann die Statistiken */
export function boardList() {
  return [
    ...LADDER_IDS.map((id) => ({
      id,
      name: LADDERS[id].name,
      format: 'rating',
      ladder: true,
      desc: `Ranked ${LADDERS[id].name}: ${LADDERS[id].desc}. Sortiert nach Punkten.`,
    })),
    ...Object.entries(STAT_BOARDS).map(([id, b]) => ({ id, name: b.name, format: b.format, ladder: false, desc: b.desc })),
  ];
}

export const isBoard = (id) => isLadder(id) || Object.hasOwn(STAT_BOARDS, id);

const MAX_ROWS = 5000;
const prepared = new Map();
function rowsOf(board) {
  const sql = isLadder(board) ? ladderSql : STAT_BOARDS[board].sql;
  if (!prepared.has(board)) prepared.set(board, db.prepare(`${sql} LIMIT ${MAX_ROWS}`));
  return isLadder(board) ? prepared.get(board).all(board) : prepared.get(board).all();
}

/**
 * Eine Rangliste: die ersten `limit` Eintraege und, falls angegeben, der eigene Platz
 * (auch wenn man weiter hinten steht). Gaeste stehen in keiner Liste.
 */
export function leaderboard(board, { limit = 100, userId = null } = {}) {
  const rows = rowsOf(board).map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    owner: isOwner(r.id),
    handle: r.handle ?? null,
    value: r.value,
    games: r.games ?? null,
    wins: r.wins ?? null,
    peak: r.peak ?? null,
  }));
  return { entries: rows.slice(0, limit), me: userId ? (rows.find((r) => r.id === userId) ?? null) : null };
}
