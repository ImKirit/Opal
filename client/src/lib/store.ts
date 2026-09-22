import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { api, BASE_PATH, SERVER_URL } from './api';
import { loadFriends, refreshFriendsSoon, resetFriends } from './friends';
import { usePrefs } from './prefs';
import { sound } from './sound';
import type {
  Ack,
  AppConfig,
  Bundle,
  Invite,
  LobbyState,
  MatchEnd,
  MatchInfo,
  MatchPlayer,
  Pack,
  QuestionPayload,
  QueueStatus,
  RevealPayload,
  Scores,
  Stats,
  User,
} from './types';

// ---------------------------------------------------------------------------
// Sitzung: Konfiguration, eingeloggter Nutzer, Pakete
// ---------------------------------------------------------------------------

interface SessionState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  config: AppConfig | null;
  user: User | null;
  stats: Stats | null;
  packs: Pack[];
  bundles: Bundle[];
}

export const useSession = create<SessionState>(() => ({
  status: 'loading',
  error: null,
  config: null,
  user: null,
  stats: null,
  packs: [],
  bundles: [],
}));

export async function bootstrap() {
  try {
    const [config, me, packs] = await Promise.all([api.config(), api.me(), api.packs()]);
    useSession.setState({ status: 'ready', error: null, config, user: me.user, stats: me.stats ?? null, packs: packs.packs, bundles: packs.bundles ?? [] });
    normalizeSelection(packs.packs);
    if (me.user) connectSocket();
  } catch (err) {
    useSession.setState({ status: 'error', error: (err as Error).message });
  }
}

/** Auswahl bereinigen: unbekannte Bereiche raus, beim ersten Start das Allgemein-Paket. */
function normalizeSelection(packs: Pack[]) {
  const all = new Set(packs.flatMap((p) => p.sections.map((s) => s.key)));
  const { sections, set } = usePrefs.getState();
  if (!sections) {
    set({ sections: packs.find((p) => p.id === 'allgemein')?.sections.map((s) => s.key) ?? [] });
    return;
  }
  const cleaned = sections.filter((k) => all.has(k));
  if (cleaned.length !== sections.length) set({ sections: cleaned });
}

export async function refreshMe() {
  try {
    const me = await api.me();
    useSession.setState({ user: me.user, stats: me.stats ?? null });
  } catch {
    /* naechster Versuch beim naechsten Spielende */
  }
}

export async function loginAsGuest(name: string) {
  await api.guest(name);
  const me = await api.me();
  useSession.setState({ user: me.user, stats: me.stats ?? null });
  connectSocket();
}

export async function logout() {
  await api.logout().catch(() => undefined);
  socket?.disconnect();
  socket = null;
  useSession.setState({ user: null, stats: null });
  useGame.setState({ ...initialGame });
  resetFriends();
}

// ---------------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------------

export interface Feedback {
  index: number;
  /** Fuer diese Frage kann ich nichts mehr tun */
  locked: boolean;
  wrongChoice: number | null;
  wrongTexts: string[];
  shake: number;
  skipped: boolean;
  /** Eigene Zeit durch Tipp-Strafen aufgebraucht */
  timedOut: boolean;
  /** Zaehlt die Tipp-Strafen, fuer die "-3 s"-Anzeige */
  penalties: number;
}

export type RevealView = RevealPayload & {
  /** Zeitpunkt, zu dem es automatisch weitergeht (Wartezeit nach dem ersten Weiter) */
  autoAt: number | null;
  /** Zeitpunkt, ab dem Tasten den Weiter-Knopf ausloesen (gegen versehentliches Durchklicken) */
  shownAt: number;
};

export interface MatchView {
  info: MatchInfo;
  phase: 'countdown' | 'question' | 'reveal';
  startsAt: number;
  scores: Scores;
  question: (QuestionPayload & { deadline: number }) | null;
  reveal: RevealView | null;
  feedback: Feedback;
  attempts: Record<string, number>;
  typing: Record<string, number>;
  /** Fragenindex -> Gewinner-ID, null wenn niemand */
  history: Record<number, string | null>;
}

export interface ResultView extends MatchEnd {
  info: MatchInfo | null;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'good';
}

export type LiveInvite = Invite & { expiresAt: number };

type Replay =
  | { type: 'solo'; payload: Record<string, unknown> }
  | { type: 'queue'; payload: Record<string, unknown> }
  | null;

interface GameState {
  connected: boolean;
  queue: QueueStatus | null;
  found: boolean;
  lobby: LobbyState | null;
  match: MatchView | null;
  result: ResultView | null;
  replay: Replay;
  toasts: Toast[];
  settingsOpen: boolean;
  /** Match-Anfragen von Freunden an mich */
  invites: LiveInvite[];
  /** Meine laufende Anfrage an jemanden */
  outgoingInvite: LiveInvite | null;
}

const initialGame: GameState = {
  connected: false,
  queue: null,
  found: false,
  lobby: null,
  match: null,
  result: null,
  replay: null,
  toasts: [],
  settingsOpen: false,
  invites: [],
  outgoingInvite: null,
};

export const useGame = create<GameState>(() => ({ ...initialGame }));

const emptyFeedback = (index: number): Feedback => ({
  index,
  locked: false,
  wrongChoice: null,
  wrongTexts: [],
  shake: 0,
  skipped: false,
  timedOut: false,
  penalties: 0,
});

const toRevealView = (r: RevealPayload): RevealView => ({
  ...r,
  autoAt: r.autoInMs != null ? Date.now() + r.autoInMs : null,
  shownAt: Date.now(),
});

let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info') {
  toastId += 1;
  const id = toastId;
  useGame.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  window.setTimeout(() => useGame.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4800);
}

const myId = () => useSession.getState().user?.id;

function patchMatch(fn: (m: MatchView) => Partial<MatchView>) {
  useGame.setState((s) => (s.match ? { match: { ...s.match, ...fn(s.match) } } : {}));
}

type SyncPayload = MatchInfo & { state: string; scores: Scores; question: QuestionPayload | null; reveal: RevealPayload | null };

function applySync(payload: SyncPayload) {
  const { state, scores, question, reveal, ...info } = payload;
  const phase = state === 'countdown' ? 'countdown' : question?.resolved && reveal ? 'reveal' : 'question';
  useGame.setState({
    queue: null,
    found: false,
    result: null,
    match: {
      info,
      phase,
      startsAt: Date.now() + 1500,
      scores,
      question: question ? { ...question, deadline: Date.now() + question.remainingMs } : null,
      reveal: phase === 'reveal' && reveal ? toRevealView(reveal) : null,
      feedback: {
        ...emptyFeedback(question?.index ?? -1),
        locked: Boolean(question?.locked),
        skipped: Boolean(question?.skipped),
      },
      attempts: {},
      typing: {},
      history: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

let socket: Socket | null = null;

export function connectSocket() {
  if (socket) return socket;
  const s = io(SERVER_URL || undefined, {
    path: `${BASE_PATH}/socket.io`,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  socket = s;

  s.on('connect', () => {
    useGame.setState({ connected: true });
    void loadFriends();
    s.emit('match:sync', {}, (ack: Ack & { match?: SyncPayload | null }) => {
      if (ack?.match) applySync(ack.match);
      else if (useGame.getState().match) useGame.setState({ match: null });
    });
  });
  s.on('disconnect', () => useGame.setState({ connected: false }));
  s.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      s.disconnect();
      socket = null;
      useSession.setState({ user: null, stats: null });
    }
  });

  s.on('queue:status', (q: QueueStatus) => useGame.setState({ queue: q }));
  s.on('queue:left', () => useGame.setState({ queue: null, found: false }));
  s.on('queue:found', () => {
    useGame.setState({ found: true });
    sound.found();
  });

  s.on('lobby:state', (lobby: LobbyState) => useGame.setState({ lobby }));
  s.on('lobby:closed', ({ reason }: { reason: string }) => {
    useGame.setState({ lobby: null });
    if (reason === 'kicked') toast('Du wurdest aus der Lobby entfernt.', 'error');
    if (reason === 'timeout') toast('Du warst zu lange weg und hast die Lobby verlassen.');
  });

  s.on('match:start', (m: MatchInfo & { startsInMs: number; scores: Scores }) => {
    const { startsInMs, scores, ...info } = m;
    useGame.setState({
      queue: null,
      found: false,
      result: null,
      match: {
        info,
        phase: 'countdown',
        startsAt: Date.now() + startsInMs,
        scores,
        question: null,
        reveal: null,
        feedback: emptyFeedback(-1),
        attempts: {},
        typing: {},
        history: {},
      },
    });
  });

  s.on('match:question', (q: QuestionPayload) =>
    patchMatch(() => ({
      phase: 'question',
      question: { ...q, deadline: Date.now() + q.remainingMs },
      reveal: null,
      scores: q.scores,
      feedback: emptyFeedback(q.index),
      attempts: {},
      typing: {},
    })),
  );

  s.on(
    'match:feedback',
    (f: { index: number; choice?: number; text?: string; skipped?: boolean; timedOut?: boolean; penaltyMs?: number; remainingMs?: number }) => {
      if (f.skipped) sound.click();
      else sound.wrong();
      patchMatch((m) => {
        if (m.feedback.index !== f.index) return {};
        if (f.skipped) return { feedback: { ...m.feedback, locked: true, skipped: true } };
        if (f.choice != null) return { feedback: { ...m.feedback, locked: true, wrongChoice: f.choice } };
        const feedback = {
          ...m.feedback,
          wrongTexts: f.text ? [...m.feedback.wrongTexts, f.text] : m.feedback.wrongTexts,
          shake: f.text ? m.feedback.shake + 1 : m.feedback.shake,
          penalties: m.feedback.penalties + (f.penaltyMs ? 1 : 0),
          timedOut: m.feedback.timedOut || Boolean(f.timedOut),
          locked: m.feedback.locked || Boolean(f.timedOut),
        };
        // Tipp-Strafe: eigene Restzeit kommt vom Server, der Balken springt entsprechend
        const question =
          m.question && f.remainingMs != null
            ? { ...m.question, remainingMs: f.remainingMs, deadline: Date.now() + f.remainingMs }
            : m.question;
        return { feedback, question };
      });
    },
  );

  s.on('match:attempt', ({ playerId }: { playerId: string }) =>
    patchMatch((m) => ({ attempts: { ...m.attempts, [playerId]: Date.now() } })),
  );

  s.on('match:typing', ({ playerId }: { playerId: string }) =>
    patchMatch((m) => ({ typing: { ...m.typing, [playerId]: Date.now() } })),
  );

  s.on('match:reveal', (r: RevealPayload) => {
    const me = myId();
    if (r.winnerId && r.winnerId === me) sound.correct();
    else if (r.winnerId) sound.lost();
    patchMatch((m) => ({ phase: 'reveal', reveal: toRevealView(r), scores: r.scores, history: { ...m.history, [r.index]: r.winnerId } }));
  });

  s.on('match:ready', ({ index, ready, autoInMs }: { index: number; ready: string[]; autoInMs: number | null }) =>
    patchMatch((m) =>
      m.reveal && m.reveal.index === index
        ? { reveal: { ...m.reveal, ready, autoInMs, autoAt: autoInMs != null ? Date.now() + autoInMs : null } }
        : {},
    ),
  );

  s.on('match:presence', ({ playerId, connected, left }: { playerId: string; connected: boolean; left?: boolean }) =>
    patchMatch((m) => ({
      info: {
        ...m.info,
        players: m.info.players.map((p: MatchPlayer) => (p.id === playerId ? { ...p, connected, left: Boolean(left) || p.left } : p)),
      },
    })),
  );

  s.on('match:left', () => {
    useGame.setState({ match: null });
    toast('Du hast das Spiel verlassen.');
  });

  s.on('match:end', (e: MatchEnd) => {
    const info = useGame.getState().match?.info ?? null;
    // Abgebrochenes Training braucht keinen Ergebnis-Screen, zurueck ins Menue
    if (e.reason === 'abandoned') {
      useGame.setState({ match: null, result: null });
      return;
    }
    useGame.setState({ match: null, result: { ...e, info } });
    const me = myId();
    if (e.kind !== 'solo' && e.winnerId === me) sound.win();
    void refreshMe();
  });

  s.on('match:sync', applySync);

  // ----- Freunde und Match-Anfragen -----
  s.on('friends:changed', ({ reason, from }: { reason: string; from?: string }) => {
    refreshFriendsSoon();
    if (reason === 'request' && from) toast(`${from} möchte mit dir befreundet sein.`);
    if (reason === 'accepted' && from) toast(`${from} ist jetzt mit dir befreundet.`, 'good');
  });

  s.on('invite:received', (inv: Invite) => {
    const live = { ...inv, expiresAt: Date.now() + inv.expiresInMs };
    const had = useGame.getState().invites.some((i) => i.id === inv.id);
    useGame.setState((st) => ({ invites: [...st.invites.filter((i) => i.id !== inv.id), live] }));
    if (!had) sound.found();
  });

  s.on('invite:closed', ({ id, reason, by }: { id: string; reason: string; by: string | null }) => {
    const { outgoingInvite } = useGame.getState();
    const mine = outgoingInvite?.id === id;
    useGame.setState((st) => ({
      invites: st.invites.filter((i) => i.id !== id),
      outgoingInvite: mine ? null : st.outgoingInvite,
    }));
    if (!mine) return;
    const name = by ?? outgoingInvite.to.name;
    if (reason === 'declined') toast(`${name} hat abgelehnt.`);
    else if (reason === 'expired') toast(`${outgoingInvite.to.name} hat nicht rechtzeitig geantwortet.`);
    else if (reason === 'offline') toast(`${outgoingInvite.to.name} ist offline gegangen.`);
    else if (reason === 'busy') toast(`${outgoingInvite.to.name} spielt gerade schon.`);
  });

  s.on('lobby:notice', ({ text }: { text: string }) => toast(text, 'error'));
  return s;
}

function send(event: string, payload: Record<string, unknown> = {}): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: 'Keine Verbindung zum Server. Einen Moment, es wird neu verbunden.' });
    socket.timeout(8000).emit(event, payload, (err: Error | null, ack: Ack) => {
      resolve(err ? { ok: false, error: 'Der Server antwortet gerade nicht.' } : ack);
    });
  });
}

async function run(event: string, payload?: Record<string, unknown>) {
  const ack = await send(event, payload);
  if (!ack.ok && ack.error) toast(ack.error, 'error');
  return ack;
}

// ---------------------------------------------------------------------------
// Aktionen fuer die Oberflaeche
// ---------------------------------------------------------------------------

export const actions = {
  joinQueue(kind: 'ranked' | 'unranked') {
    const { sections, answerMode, difficulty, optionCount, rankedLadder } = usePrefs.getState();
    const payload =
      kind === 'ranked'
        ? { kind, ladder: rankedLadder }
        : { kind, sections: sections ?? [], answerMode, difficulty, optionCount };
    useGame.setState({ replay: { type: 'queue', payload } });
    return run('queue:join', payload);
  },
  leaveQueue: () => run('queue:leave'),
  queueBot: () => run('queue:bot', { difficulty: usePrefs.getState().bot }),

  startTraining() {
    const { sections, answerMode, trainingMode, soloCount, bot, difficulty, optionCount } = usePrefs.getState();
    const payload = {
      sections: sections ?? [],
      answerMode,
      difficulty,
      optionCount,
      soloMode: trainingMode === 'survival' ? 'survival' : 'classic',
      questionCount: soloCount,
      bot: trainingMode === 'bot' ? bot : null,
    };
    useGame.setState({ replay: { type: 'solo', payload } });
    return run('solo:start', payload);
  },

  async replay() {
    const r = useGame.getState().replay;
    useGame.setState({ result: null });
    if (!r) return;
    if (r.type === 'solo') await run('solo:start', r.payload);
    else await run('queue:join', r.payload);
  },

  createLobby() {
    const { sections, answerMode, difficulty, optionCount } = usePrefs.getState();
    return run('lobby:create', { sections: sections ?? [], answerMode, difficulty, optionCount });
  },
  joinLobby: (code: string) => run('lobby:join', { code }),
  leaveLobby: () => run('lobby:leave'),
  lobbySettings: (patch: Record<string, unknown>) => run('lobby:settings', patch),
  addBot: (difficulty: string) => run('lobby:bot:add', { difficulty }),
  removeBot: (id: string) => run('lobby:bot:remove', { id }),
  kick: (userId: string) => run('lobby:kick', { userId }),
  startLobby: () => run('lobby:start'),

  answerChoice(index: number, choice: number) {
    socket?.emit('match:answer', { index, choice });
  },
  answerText(index: number, text: string) {
    socket?.emit('match:answer', { index, text });
  },
  typing(index: number) {
    socket?.emit('match:typing', { index });
  },
  skip(index: number) {
    socket?.emit('match:skip', { index });
  },
  /** Weiter-Knopf nach der Aufloesung. Sofort lokal als bereit markieren, der Server bestaetigt. */
  continueMatch(index: number) {
    const me = myId();
    patchMatch((m) =>
      m.reveal && m.reveal.index === index && me && !m.reveal.ready.includes(me)
        ? { reveal: { ...m.reveal, ready: [...m.reveal.ready, me] } }
        : {},
    );
    socket?.emit('match:continue', { index });
  },
  leaveMatch: () => run('match:leave'),

  /** Freund zu einem Duell herausfordern. Meine aktuelle Runde (Themen, Modus, ...) gilt dafür. */
  async invite(userId: string) {
    const { sections, answerMode, difficulty, optionCount } = usePrefs.getState();
    const ack = await run('invite:send', { userId, settings: { sections: sections ?? [], answerMode, difficulty, optionCount } });
    const inv = ack.invite as Invite | undefined;
    if (ack.ok && inv) useGame.setState({ outgoingInvite: { ...inv, expiresAt: Date.now() + inv.expiresInMs } });
    return ack;
  },
  cancelInvite() {
    const inv = useGame.getState().outgoingInvite;
    useGame.setState({ outgoingInvite: null });
    if (inv) void run('invite:cancel', { id: inv.id });
  },
  async respondInvite(id: string, accept: boolean) {
    useGame.setState((st) => ({ invites: st.invites.filter((i) => i.id !== id) }));
    return run('invite:respond', { id, accept });
  },
  dismissResult: () => useGame.setState({ result: null }),
  openSettings: (open = true) => useGame.setState({ settingsOpen: open }),
};
