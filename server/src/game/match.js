import { randomUUID } from 'node:crypto';
import { buildRound, pickQuestions } from '../packs.js';
import { isCorrectTyped } from './answer.js';
import { planBotAnswer } from './bot.js';
import { isOwner } from '../roles.js';
import { recentExclusions, rememberQuestions, saveMatch } from './persist.js';
import { durationFor } from './settings.js';

export const TIMING = {
  startDelayMs: 3500,
  /** Nur bei continueMode "auto": so lange steht die Aufloesung, bevor es weitergeht */
  revealMs: 3400,
  factExtraMs: 2200,
  typedCooldownMs: 600,
  /** Jeder falsche Tippversuch kostet so viel von der eigenen Zeit */
  typedPenaltyMs: 3000,
  /** Weiter-Knopf im Mehrspieler: hat die erste Person gedrueckt, warten die anderen noch so lange */
  continueGraceMs: 10000,
  /** Weiter-Knopf im Mehrspieler: spaetestens dann geht es weiter, auch wenn niemand drueckt */
  continueMaxMs: 30000,
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
 * Bei Auswahlfragen hat jeder genau einen Versuch, beim Tippen beliebig viele, jeder falsche
 * kostet aber 3 Sekunden der eigenen Zeit. Ueberspringen ist jederzeit moeglich. Nach der
 * Aufloesung geht es erst weiter, wenn alle auf Weiter gedrueckt haben (oder die Wartezeit um ist).
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
      difficulty: settings.difficulty,
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

  /** Menschen, auf die das Spiel gerade warten muss (da und verbunden) */
  waitingHumans() {
    return this.players.filter((p) => !p.isBot && !p.left && p.connected);
  }

  publicPlayers() {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar ?? null,
      isBot: Boolean(p.isBot),
      guest: Boolean(p.guest),
      owner: !p.isBot && isOwner(p.id),
      handle: p.handle ?? null,
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
      difficulty: this.settings.difficulty ?? 'gemischt',
      optionCount: this.settings.optionCount ?? 3,
      timeLimit: this.settings.timeLimit ?? 'normal',
      continueMode: this.settings.continueMode ?? 'button',
      ladder: this.kind === 'ranked' ? (this.settings.ladder ?? null) : null,
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

    const round = buildRound(question, this.settings.answerMode, this.settings.optionCount ?? 3);
    const duration = durationFor(this.settings, round.mode);
    const now = Date.now();
    this.current = {
      index: this.index,
      question,
      ...round,
      askedAt: now,
      deadline: now + duration,
      duration,
      resolved: false,
      /** Wer in dieser Runde nichts mehr tun kann: Auswahl getroffen, uebersprungen, Zeit weg */
      locked: new Set(),
      skipped: new Set(),
      tried: new Set(),
      lastGuess: new Map(),
      /** Eigene Frist pro Person, falsche Tippversuche ziehen davon ab */
      deadlines: new Map(this.players.map((p) => [p.id, now + duration])),
      botPlans: new Map(),
      fastForward: false,
      ready: new Set(),
      readyDeadline: null,
      reveal: null,
    };
    this.asked.push(question.id);
    this.state = 'question';

    this.emit('match:question', this.questionPayload());
    this.later(() => this.resolve(null), duration);

    const idx = this.index;
    for (const p of this.activePlayers()) {
      if (!p.isBot) continue;
      const plan = planBotAnswer(p, question, round.mode);
      if (plan.delay >= duration) continue;
      this.current.botPlans.set(p.id, plan);
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

  /** Ist nach der aktuellen Frage Schluss? Mit commit=false nur nachsehen, ohne Sudden Death anzulegen. */
  shouldFinish(commit = true) {
    if (this.survival) {
      const s = this.stats.get(this.players[0].id);
      return s.lives <= 0 || this.index + 1 >= this.pool.length;
    }
    if (this.index + 1 < this.planned) return false;
    // Alle geplanten Fragen gespielt: bei Gleichstand an der Spitze gibt es Sudden Death
    if (this.solo || this.activePlayers().length < 2) return true;
    const top = this.leaders();
    if (top.length > 1 && this.suddenDeath < MAX_SUDDEN_DEATH && this.index + 1 < this.pool.length) {
      if (commit) {
        this.suddenDeath += 1;
        this.planned += 1;
      }
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

    const now = Date.now();
    const ms = now - c.askedAt;
    // Kleiner Puffer fuer die Laufzeit im Netz, danach zaehlt die eigene Frist
    if (now > (c.deadlines.get(playerId) ?? c.deadline) + 250) return;

    if (c.mode === 'choice') {
      const choice = Number(payload.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= c.options.length) return;
      c.locked.add(playerId);
      c.tried.add(playerId);
      if (choice === c.correctIndex) return this.resolve(playerId, ms, choice);
      this.emitToUser(playerId, 'match:feedback', { index: c.index, correct: false, choice });
      this.emit('match:attempt', { index: c.index, playerId, correct: false });
      this.checkAllDone();
      return;
    }

    // Tippen
    const text = String(payload.text ?? '').slice(0, 80).trim();
    if (!text) return;
    const last = c.lastGuess.get(playerId) ?? 0;
    if (now - last < TIMING.typedCooldownMs) return;
    c.lastGuess.set(playerId, now);
    c.tried.add(playerId);
    if (isCorrectTyped(text, [c.question.a, ...c.question.alt])) return this.resolve(playerId, ms, null, text);

    // Falsch: 3 Sekunden weniger. Ist die eigene Zeit damit um, ist man fuer diese Frage raus.
    const deadline = Math.min(c.deadline, (c.deadlines.get(playerId) ?? c.deadline) - TIMING.typedPenaltyMs);
    c.deadlines.set(playerId, deadline);
    const remainingMs = Math.max(0, deadline - now);
    this.emitToUser(playerId, 'match:feedback', {
      index: c.index,
      correct: false,
      text,
      penaltyMs: TIMING.typedPenaltyMs,
      remainingMs,
      timedOut: remainingMs === 0,
    });
    this.emit('match:attempt', { index: c.index, playerId, correct: false });
    if (remainingMs === 0) {
      c.locked.add(playerId);
      this.checkAllDone();
    } else {
      const idx = c.index;
      this.later(() => this.timeOut(playerId, idx), remainingMs);
    }
  }

  /** Eigene Frist abgelaufen (nach Tipp-Strafen frueher als bei den anderen). */
  timeOut(playerId, index) {
    const c = this.current;
    if (!c || c.resolved || c.index !== index || c.locked.has(playerId)) return;
    if (Date.now() < (c.deadlines.get(playerId) ?? c.deadline) - 20) return; // veralteter Zeitgeber
    c.locked.add(playerId);
    this.emitToUser(playerId, 'match:feedback', { index, correct: false, timedOut: true, remainingMs: 0 });
    this.checkAllDone();
  }

  /** Frage auslassen. Zaehlt nicht als falsch, im Ueberleben kostet es aber ein Leben. */
  skip(playerId, payload) {
    const c = this.current;
    const p = this.player(playerId);
    if (!c || !p || p.left || this.state !== 'question' || c.resolved) return;
    if (payload?.index !== c.index || c.locked.has(playerId)) return;
    c.locked.add(playerId);
    c.skipped.add(playerId);
    this.emitToUser(playerId, 'match:feedback', { index: c.index, correct: false, skipped: true });
    this.emit('match:attempt', { index: c.index, playerId, correct: false, skipped: true });
    this.checkAllDone();
  }

  /**
   * Kann kein Mensch mehr antworten, wird nicht bis zum Ende der Zeit gewartet: Bots geben
   * ihre geplante Antwort sofort ab (in der geplanten Reihenfolge), sonst loest die Frage auf.
   */
  checkAllDone() {
    const c = this.current;
    if (!c || c.resolved || c.fastForward) return;
    const open = this.activePlayers().filter((p) => !p.isBot && !c.locked.has(p.id));
    if (open.length) return;
    c.fastForward = true;
    const bots = this.activePlayers()
      .filter((p) => p.isBot && !c.locked.has(p.id) && c.botPlans.has(p.id))
      .sort((a, b) => c.botPlans.get(a.id).delay - c.botPlans.get(b.id).delay);
    for (const bot of bots) {
      if (c.resolved) break;
      this.botAnswer(bot, c.index, c.botPlans.get(bot.id).correct);
    }
    c.fastForward = false;
    if (!c.resolved) this.resolve(null);
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
    // Beim Weiter-Knopf zaehlen Bots und Abwesende sofort als bereit
    for (const p of this.players) if (p.isBot || p.left || !p.connected) c.ready.add(p.id);

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

    const auto = this.settings.continueMode === 'auto';
    const nextInMs = auto ? TIMING.revealMs + (c.question.fact ? TIMING.factExtraMs : 0) : null;
    c.reveal = {
      index: c.index,
      winnerId,
      ms,
      choice,
      text,
      answer: c.question.a,
      correctIndex: c.correctIndex,
      fact: c.question.fact,
      skipped: [...c.skipped],
      scores: this.scoreboard(),
      last: this.shouldFinish(false),
      continueMode: auto ? 'auto' : 'button',
      nextInMs,
    };
    this.emit('match:reveal', { ...c.reveal, ...this.readyState() });

    if (auto) {
      this.later(() => this.advance(c.index), nextInMs);
      return;
    }
    // Mehrere Menschen: spaetestens nach continueMaxMs geht es weiter, damit niemand ewig wartet
    if (this.waitingHumans().length > 1) this.later(() => this.advance(c.index), TIMING.continueMaxMs);
    this.checkReady();
  }

  // ---------- Weiter-Knopf ----------

  readyState() {
    const c = this.current;
    return {
      ready: c ? [...c.ready] : [],
      autoInMs: c?.readyDeadline ? Math.max(0, c.readyDeadline - Date.now()) : null,
    };
  }

  /** Jemand hat nach der Aufloesung auf Weiter gedrueckt. */
  continue(playerId, payload) {
    const c = this.current;
    if (!c || this.state !== 'reveal' || payload?.index !== c.index || c.ready.has(playerId)) return;
    if (this.settings.continueMode === 'auto' || !this.player(playerId)) return;
    c.ready.add(playerId);
    // Die erste Person ist bereit: die anderen haben noch continueGraceMs
    if (!c.readyDeadline && this.waitingHumans().some((p) => !c.ready.has(p.id))) {
      c.readyDeadline = Date.now() + TIMING.continueGraceMs;
      const idx = c.index;
      this.later(() => this.advance(idx), TIMING.continueGraceMs);
    }
    this.emit('match:ready', { index: c.index, ...this.readyState() });
    this.checkReady();
  }

  checkReady() {
    const c = this.current;
    if (!c || this.state !== 'reveal' || this.settings.continueMode === 'auto' || c.advancing) return;
    const waiting = this.waitingHumans();
    // Niemand da (zum Beispiel Neuladen im Training): nicht ohne die Person weitermachen
    if (waiting.length && waiting.every((p) => c.ready.has(p.id))) {
      c.advancing = true;
      const idx = c.index;
      // Kurz stehen lassen, damit der gedrueckte Knopf noch zu sehen ist
      this.later(() => this.advance(idx), 250);
    }
  }

  advance(index) {
    if (this.state !== 'reveal' || this.current?.index !== index) return;
    this.clearTimers();
    this.nextQuestion();
  }

  // ---------- Verbindung ----------

  syncPayload(userId) {
    const payload = { ...this.publicInfo(), state: this.state, scores: this.scoreboard(), question: null, reveal: null };
    const c = this.current;
    if (c && this.state !== 'ended') {
      payload.question = {
        ...this.questionPayload(),
        remainingMs: Math.max(0, (c.deadlines.get(userId) ?? c.deadline) - Date.now()),
        resolved: c.resolved,
        locked: c.locked.has(userId),
        skipped: c.skipped.has(userId),
      };
      if (this.state === 'reveal' && c.reveal) payload.reveal = { ...c.reveal, ...this.readyState() };
    }
    return payload;
  }

  handleDisconnect(userId) {
    const p = this.player(userId);
    if (!p || p.left || this.state === 'ended') return;
    p.connected = false;
    this.emit('match:presence', { playerId: userId, connected: false });
    this.checkReady();
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
    // Wer waehrend der Aufloesung zurueckkommt, drueckt selbst auf Weiter
    if (this.state === 'reveal' && this.current && !this.current.advancing) this.current.ready.delete(userId);
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
    // Haengt die Runde oder der Weiter-Knopf nur an dieser Person, nicht weiter warten
    if (this.state === 'question') this.checkAllDone();
    else this.checkReady();
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
        owner: !p.isBot && isOwner(p.id),
        handle: p.handle ?? null,
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
      ladder: this.kind === 'ranked' ? (this.settings.ladder ?? null) : null,
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
