// Elo fuer 1v1-Ranked. Neue Spieler bewegen sich in den ersten zehn Spielen schneller,
// damit sie zuegig an ihrem echten Niveau ankommen.

export const START_RATING = 1000;

export function eloChange(rating, opponentRating, score, gamesPlayed) {
  const k = gamesPlayed < 10 ? 40 : 24;
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  return Math.round(k * (score - expected));
}
