// Warteschlangen fuer Ranked und Unranked (jeweils 1v1).
//
// Ranked: fester Fragenpool, Gegner nach Elo. Das erlaubte Elo-Fenster waechst mit der
// Wartezeit, damit bei wenig Betrieb trotzdem Spiele zustande kommen.
// Unranked: eigene Paketauswahl. Gespielt wird die Schnittmenge beider Auswahlen.
// Nach 20 Sekunden Wartezeit wird der Antwortmodus egal (dann "gemischt").

const TICK_MS = 2000;
const RELAX_MODE_AFTER_MS = 20000;

export class Matchmaker {
  constructor({ onMatch, emitToUser, getRating }) {
    this.entries = new Map();
    this.onMatch = onMatch;
    this.emitToUser = emitToUser;
    this.getRating = getRating;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
  }

  has(userId) {
    return this.entries.has(userId);
  }

  join(user, { kind, sections, answerMode }) {
    const entry = {
      user,
      kind,
      sections: new Set(sections),
      answerMode,
      joinedAt: Date.now(),
    };
    this.entries.set(user.id, entry);
    if (!this.tryMatch(entry)) this.emitStatus(entry);
  }

  leave(userId) {
    const entry = this.entries.get(userId);
    if (!entry) return false;
    this.entries.delete(userId);
    this.emitToUser(userId, 'queue:left', { kind: entry.kind });
    return true;
  }

  window(entry, now) {
    const waited = (now - entry.joinedAt) / 1000;
    return Math.min(1000, 150 + waited * 30);
  }

  tryMatch(entry) {
    const now = Date.now();
    let best = null;
    let bestScore = Infinity;

    for (const other of this.entries.values()) {
      if (other === entry || other.kind !== entry.kind) continue;

      if (entry.kind === 'ranked') {
        const diff = Math.abs(this.getRating(entry.user.id) - this.getRating(other.user.id));
        if (diff > this.window(entry, now) || diff > this.window(other, now)) continue;
        if (diff < bestScore) {
          best = other;
          bestScore = diff;
        }
        continue;
      }

      // Unranked
      const shared = [...entry.sections].filter((s) => other.sections.has(s));
      if (!shared.length) continue;
      const relaxed = now - entry.joinedAt > RELAX_MODE_AFTER_MS && now - other.joinedAt > RELAX_MODE_AFTER_MS;
      if (entry.answerMode !== other.answerMode && !relaxed) continue;
      // Wer am laengsten wartet, kommt zuerst dran
      if (other.joinedAt < bestScore) {
        best = other;
        bestScore = other.joinedAt;
      }
    }

    if (!best) return false;
    this.entries.delete(entry.user.id);
    this.entries.delete(best.user.id);

    const shared = [...entry.sections].filter((s) => best.sections.has(s));
    const answerMode = entry.answerMode === best.answerMode ? entry.answerMode : 'mixed';
    this.onMatch({
      kind: entry.kind,
      users: [best.user, entry.user],
      sections: entry.kind === 'ranked' ? [...entry.sections] : shared,
      answerMode,
    });
    return true;
  }

  tick() {
    const ordered = [...this.entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    for (const entry of ordered) {
      if (this.entries.get(entry.user.id) !== entry) continue;
      this.tryMatch(entry);
    }
    for (const entry of this.entries.values()) this.emitStatus(entry);
  }

  emitStatus(entry) {
    let waiting = 0;
    for (const e of this.entries.values()) if (e.kind === entry.kind) waiting += 1;
    this.emitToUser(entry.user.id, 'queue:status', {
      kind: entry.kind,
      since: entry.joinedAt,
      waiting,
      answerMode: entry.answerMode,
    });
  }
}
