import { randomUUID } from 'node:crypto';
import { buildRound, pickQuestions } from '../packs.js';
import { isCorrectTyped } from './answer.js';
import { planBotAnswer } from './bot.js';
import { recentExclusions, rememberQuestions, saveMatch } from './persist.js';

export const TIMING = {
  choiceMs: 15000,
  typedMs: 25000,
  startDelayMs: 3500,
  revealMs: 3400,
  factExtraMs: 2200,
  typedCooldownMs: 600,
  reconnectGraceMs: 20000,
};

const MAX_SUDDEN_DEATH = 3;
const SURVIVAL_LIVES = 3;

/**
 * Ein laufendes Spiel. Deckt alle Arten ab:
 *  solo      eine Person, jede richtige Antwort zaehlt (klassisch oder Ueberleben)
 *  bot       1v1 gegen einen Bot aus dem Training
 *  unranked  1v1 aus dem Queue
 *  ranked    1v1 aus dem Queue mit Elo
 *  private   Lobby mit 2 bis 8 Teilnehmern, Bots erlaubt
 *
 * Grundregel fuer alles ausser Solo: Wer zuerst richtig antwortet, holt den Punkt.
 * Bei Auswahlfragen hat jeder genau einen Versuch, beim Tippen beliebig viele.
 */
export class Match {
  constructor(io, { kind, players, settings, variant = null, onEnd }) {
    this.id = randomUUID();
    this.io = io;
    this.kind = kind;
    this.variant = variant;
    this.room = `match:${this.id}`;
    this.settings = settings;
    this.onEnd = onEnd;
    this.solo = kind === 'solo';
    this.survival = this.solo && settings.soloMode === 'survival';

    this.players = players.map((p) => ({ ...p, connected: true, left: false }));
    this.stats = new Map(
      this.players.map((p) => [
        p.id,
        { score: 0, correct: 0, wrong: 0, times: [], streak: 0, bestStreak: 0, lives: SURVIVAL_LIVES },
      ]),
    );

    const humans = this.players.filter((p) => !p.isBot).map((p) => p.id);
    const want = this.survival ? 1000 : settings.questionCount + MAX_SUDDEN_DEATH;
    this.pool = pickQuestions(settings.sections, want, {
      answerMode: settings.answerMode,
      exclude: recentExclusions(humans),
    });
    this.planned = this.survival ? this.pool.length : Math.min(settings.questionCount, this.pool.length);

    this.index = -1;
    this.current = null;
    this.state = 'waiting';
    this.startedAt = Date.now();
    this.timers = new Set();
    this.graceTimers = new Map();
    this.suddenDeath = 0;
    this.asked = [];
  }

  // ---------- Hilfen ----------

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  activePlayers() {
    return this.players.filter((p) => !p.left);
  }

  publicPlayers() {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? null,
      isBot: Boolean(p.isBot),
      guest: Boolean(p.guest),
      rating: this.kind === 'ranked' ? p.rating : null,
      connected: p.connected,
      left: p.left,
    }));
  }

  scoreboard() {
    const out = {};
    for (const [id, s] of this.stats) {
      out[id] = { score: s.score, correct: s.correct, wrong: s.wrong, streak: s.streak, lives: this.survival ? s.lives : null };
    }
    return out;
  }

  publicInfo() {
    return {
      id: this.id,
      kind: this.kind,
      variant: this.variant,
      answerMode: this.settings.answerMode,
      soloMode: this.solo ? this.settings.soloMode : null,
      total: this.survival ? null : this.planned,
      players: this.publicPlayers(),
    };
  }

  emit(event, payload) {
    this.io.to(this.room).emit(event, payload);
  }

  emitToUser(userId, event, payload) {
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  // ---------- Ablauf ----------

  start() {
    for (const p of this.players) {
      if (!p.isBot) this.io.in(`user:${p.id}`).socketsJoin(this.room);
    }
    this.state = 'countdown';
    this.emit('match:start', { ...this.publicInfo(), startsInMs: TIMING.startDelayMs, scores: this.scoreboard() });
    this.later(() => this.nextQuestion(), TIMING.startDelayMs);
  }

  nextQuestion() {
    if (this.state === 'ended') return;
    if (this.shouldFinish()) return this.finish('complete');

    this.index += 1;
    const question = this.pool[this.index];
    if (!question) return this.finish('complete');

    const round = buildRound(question, this.settings.answerMode);
    const duration = round.mode === 'typed' ? TIMING.typedMs : TIMING.choiceMs;
    const now = Date.now();
    this.current = {
      index: this.index,
      question,
      ...round,
      askedAt: now,
      deadline: now + duration,
      duration,
      resolved: false,
      locked: new Set(),
      tried: new Set(),
      lastGuess: new Map(),
    };
    this.asked.push(question.id);
    this.state = 'question';

    this.emit('match:question', this.questionPayload());
    this.later(() => this.resolve(null), duration);

    for (const p of this.activePlayers()) {
      if (!p.isBot) continue;
      const plan = planBotAnswer(p, question, round.mode);
      if (plan.delay >= duration) continue;
      const idx = this.index;
      this.later(() => this.botAnswer(p, idx, plan.correct), plan.delay);
    }
  }

  questionPayload() {
    const c = this.current;
    return {
      index: c.index,
      number: c.index + 1,
      total: this.survival ? null : this.planned,
      suddenDeath: this.suddenDeath > 0,
      text: c.question.q,
      mode: c.mode,
      options: c.options,
      pack: c.question.packName,
      section: c.question.sectionName,
      hue: c.question.hue,
      difficulty: c.question.d,
      duration: c.duration,
      remainingMs: Math.max(0, c.deadline - Date.now()),
      scores: this.scoreboard(),
    };
  }

  shouldFinish() {
    if (this.survival) {
      const s = this.stats.get(this.players[0].id);
      return s.lives <= 0 || this.index + 1 >= this.pool.length;
    }
    if (this.index + 1 < this.planned) return false;
    // Alle geplanten Fragen gespielt: bei Gleichstand an der Spitze gibt es Sudden Death
    if (this.solo || this.activePlayers().length < 2) return true;
    const top = this.leaders();
    if (top.length > 1 && this.suddenDeath < MAX_SUDDEN_DEATH && this.index + 1 < this.pool.length) {
      this.suddenDeath += 1;
      this.planned += 1;
      return false;
    }
    return true;
  }

  leaders() {
    const active = this.activePlayers();
    const best = Math.max(...active.map((p) => this.stats.get(p.id).score));
    return active.filter((p) => this.stats.get(p.id).score === best);
  }

  // ---------- Antworten ----------

  botAnswer(bot, index, correct) {
    const c = this.current;
    if (!c || c.resolved || c.index !== index) return;
    if (c.mode === 'choice') {
      const wrongIdx = c.options.map((_, i) => i).filter((i) => i !== c.correctIndex);
      const choice = correct ? c.correctIndex : wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
      this.submit(bot.id, { index, choice });
    } else {
      const text = correct ? c.question.a : c.question.w[Math.floor(Math.random() * c.question.w.length)];
      this.submit(bot.id, { index, text });
    }
  }

  submit(playerId, payload) {
    const c = this.current;
    const p = this.player(playerId);
    if (!c || !p || p.left || this.state !== 'question' || c.resolved) return;
    if (payload?.index !== c.index) return;
    if (c.locked.has(playerId)) return;

    const ms = Date.now() - c.askedAt;

    if (c.mode === 'choice') {
      const choice = Number(payload.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= c.options.length) return;
      c.locked.add(playerId);
      c.tried.add(playerId);
      if (choice === c.correctIndex) return this.resolve(playerId, ms, choice);
      this.emitToUser(playerId, 'match:feedback', { index: c.index, correct: false, choice });
      this.emit('match:attempt', { index: c.index, playerId, correct: false });
      if (this.solo || this.activePlayers().every((ap) => c.locked.has(ap.id))) this.resolve(null);
      return;
    }

    // Tippen
    const text = String(payload.text ?? '').slice(0, 80).trim();
    if (!text) return;
    const last = c.lastGuess.get(playerId) ?? 0;
    if (Date.now() - last < TIMING.typedCooldownMs) return;
    c.lastGuess.set(playerId, Date.now());
    c.tried.add(playerId);
    if (isCorrectTyped(text, [c.question.a, ...c.question.alt])) return this.resolve(playerId, ms, null, text);
    this.emitToUser(playerId, 'match:feedback', { index: c.index, correct: false, text });
    this.emit('match:attempt', { index: c.index, playerId, correct: false });
  }

  typing(playerId, index) {
    const c = this.current;
    if (!c || c.resolved || c.index !== index || c.mode !== 'typed') return;
    this.io.to(this.room).except(`user:${playerId}`).emit('match:typing', { index, playerId });
  }

  resolve(winnerId, ms = null, choice = null, text = null) {
    const c = this.current;
    if (!c || c.resolved) return;
    c.resolved = true;
    this.clearTimers();
    this.state = 'reveal';

    for (const p of this.activePlayers()) {
      const s = this.stats.get(p.id);
      if (p.id === winnerId) {
        s.score += 1;
        s.correct += 1;
        s.times.push(ms);
        s.streak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
      } else {
        if (c.tried.has(p.id)) s.wrong += 1;
        s.streak = 0;
        if (this.survival) s.lives -= 1;
      }
    }

    const hasFact = Boolean(c.question.fact);
    this.emit('match:reveal', {
      index: c.index,
      winnerId,
      ms,
      choice,
      text,
      answer: c.question.a,
      correctIndex: c.correctIndex,
      fact: c.question.fact,
      scores: this.scoreboard(),
      nextInMs: TIMING.revealMs + (hasFact ? TIMING.factExtraMs : 0),
    });

    this.later(() => this.nextQuestion(), TIMING.revealMs + (hasFact ? TIMING.factExtraMs : 0));
  }

  // ---------- Verbindung ----------

  syncPayload(userId) {
    const payload = { ...this.publicInfo(), state: this.state, scores: this.scoreboard(), question: null };
    if (this.current && this.state !== 'ended') {
      payload.question = {
        ...this.questionPayload(),
        resolved: this.current.resolved,
        locked: this.current.locked.has(userId),
      };
    }
    return payload;
  }

  handleDisconnect(userId) {
    const p = this.player(userId);
    if (!p || p.left || this.state === 'ended') return;
    p.connected = false;
    this.emit('match:presence', { playerId: userId, connected: false });
    if (this.solo) {
      this.graceTimers.set(userId, setTimeout(() => this.finish('abandoned'), TIMING.reconnectGraceMs));
      return;
    }
    this.graceTimers.set(
      userId,
      setTimeout(() => this.leave(userId), TIMING.reconnectGraceMs),
    );
  }

  handleReconnect(userId) {
    const p = this.player(userId);
    if (!p || p.left || this.state === 'ended') return false;
    clearTimeout(this.graceTimers.get(userId));
    this.graceTimers.delete(userId);
    p.connected = true;
    this.io.in(`user:${userId}`).socketsJoin(this.room);
    this.emitToUser(userId, 'match:sync', this.syncPayload(userId));
    this.emit('match:presence', { playerId: userId, connected: true });
    return true;
  }

  /** Aufgeben oder endgueltig weg. */
  leave(userId) {
    const p = this.player(userId);
    if (!p || p.left || this.state === 'ended') return;
    clearTimeout(this.graceTimers.get(userId));
    this.graceTimers.delete(userId);
    p.left = true;
    p.connected = false;
    this.emit('match:presence', { playerId: userId, connected: false, left: true });

    // Endet das Spiel dadurch, bekommt auch die gehende Person noch match:end (finish nimmt
    // danach alle aus dem Raum). Vorher austragen hiesse: sie haengt im Duell-Screen fest.
    if (this.solo) return this.finish('abandoned');
    const humansLeft = this.activePlayers().filter((ap) => !ap.isBot);
    if (humansLeft.length === 0) return this.finish('abandoned');
    if (this.activePlayers().length < 2) return this.finish('forfeit');

    // Mehrspieler-Lobby laeuft ohne sie weiter
    this.emitToUser(userId, 'match:left', { id: this.id });
    this.io.in(`user:${userId}`).socketsLeave(this.room);
    // Haengt die Runde nur an dieser Person, aufloesen
    const c = this.current;
    if (c && !c.resolved && c.mode === 'choice' && this.activePlayers().every((ap) => c.locked.has(ap.id))) {
      this.resolve(null);
    }
  }

  // ---------- Ende ----------

  finish(reason) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.clearTimers();
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();

    const active = this.activePlayers();
    const order = [...this.players].sort((a, b) => {
      if (a.left !== b.left) return a.left ? 1 : -1;
      return this.stats.get(b.id).score - this.stats.get(a.id).score;
    });

    let winnerId = null;
    if (!this.solo && reason !== 'abandoned') {
      if (reason === 'forfeit' && active.length === 1) winnerId = active[0].id;
      else {
        const top = this.leaders();
        if (top.length === 1) winnerId = top[0].id;
      }
    }

    // Plaetze mit geteilten Rängen bei Punktgleichheit
    const placements = {};
    let place = 0;
    let lastScore = null;
    order.forEach((p, i) => {
      const s = this.stats.get(p.id).score;
      if (p.left) placements[p.id] = order.length;
      else {
        if (s !== lastScore) place = i + 1;
        placements[p.id] = place;
        lastScore = s;
      }
    });

    const summary = this.players.map((p) => {
      const s = this.stats.get(p.id);
      const avgMs = s.times.length ? Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length) : null;
      return {
        id: p.id,
        name: p.name,
        isBot: Boolean(p.isBot),
        score: s.score,
        correct: s.correct,
        wrong: s.wrong,
        avgMs,
        bestStreak: s.bestStreak,
        placement: placements[p.id],
      };
    });

    let ratingChanges = {};
    if (reason !== 'abandoned') {
      try {
        ratingChanges = saveMatch(this, { reason, winnerId, summary });
      } catch (err) {
        console.error('[match] Speichern fehlgeschlagen:', err);
      }
      rememberQuestions(
        this.players.filter((p) => !p.isBot).map((p) => p.id),
        this.asked,
      );
    }

    this.emit('match:end', {
      id: this.id,
      kind: this.kind,
      reason,
      winnerId,
      questionsPlayed: this.index + 1,
      summary,
      ratingChanges,
    });

    for (const p of this.players) {
      if (!p.isBot) this.io.in(`user:${p.id}`).socketsLeave(this.room);
    }
    this.onEnd?.(this);
  }
}
