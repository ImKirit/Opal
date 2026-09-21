// Bots fuer Training, private Lobbys und die Wartezeit im Unranked-Queue.
// Sie "wissen" die Antwort mit einer Wahrscheinlichkeit, die von Stufe und
// Fragenschwierigkeit abhaengt, und antworten nach einer menschlich wirkenden Pause.

export const BOT_PROFILES = {
  leicht: { name: 'Kiesel', accuracy: 0.5, choice: [5200, 10500], typed: [8000, 17000] },
  mittel: { name: 'Prisma', accuracy: 0.68, choice: [3400, 7600], typed: [6000, 12500] },
  schwer: { name: 'Obsidian', accuracy: 0.86, choice: [1900, 4600], typed: [3600, 8000] },
};

export const isBotDifficulty = (d) => Object.hasOwn(BOT_PROFILES, d);

let counter = 0;
export function createBot(difficulty) {
  const profile = BOT_PROFILES[difficulty] ?? BOT_PROFILES.mittel;
  counter += 1;
  return {
    id: `bot:${difficulty}:${counter}`,
    name: `${profile.name} (Bot)`,
    avatar: null,
    isBot: true,
    guest: false,
    difficulty,
  };
}

const between = ([min, max]) => min + Math.random() * (max - min);

/**
 * Plant die Antwort eines Bots fuer die aktuelle Runde.
 * @returns {{ delay: number, correct: boolean }}
 */
export function planBotAnswer(bot, question, mode) {
  const profile = BOT_PROFILES[bot.difficulty] ?? BOT_PROFILES.mittel;
  const accuracy = Math.min(0.97, Math.max(0.2, profile.accuracy - (question.d - 2) * 0.1));
  return {
    delay: between(mode === 'typed' ? profile.typed : profile.choice),
    correct: Math.random() < accuracy,
  };
}
