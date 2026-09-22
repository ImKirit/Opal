// Ranked-Modi. Jeder Modus hat pro Person einen eigenen Rang (Tabelle "ratings") und eine
// eigene Rangliste. Einen neuen Ranked-Modus anlegen = hier einen Eintrag ergaenzen, Queue,
// Rang, Rangliste und Auswahl in der Oberflaeche ergeben sich daraus.
// Unranked, Lobbys, Freundes-Duelle und Training haben keinen Rang.

export const LADDERS = {
  standard: {
    id: 'standard',
    name: 'Standard',
    desc: 'Aus drei Antworten wählen',
    settings: { answerMode: 'choice', optionCount: 3, difficulty: 'gemischt', questionCount: 9 },
  },
  tippen: {
    id: 'tippen',
    name: 'Tippen',
    desc: 'Antwort selbst eintippen',
    settings: { answerMode: 'typed', optionCount: 3, difficulty: 'gemischt', questionCount: 9 },
  },
};

export const LADDER_IDS = Object.keys(LADDERS);
export const DEFAULT_LADDER = 'standard';
export const isLadder = (id) => typeof id === 'string' && Object.hasOwn(LADDERS, id);

/** Fuer den Client: welche Ranked-Modi es gibt */
export const ladderMeta = () => LADDER_IDS.map((id) => ({ id, name: LADDERS[id].name, desc: LADDERS[id].desc }));
