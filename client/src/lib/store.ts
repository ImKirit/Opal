import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { api, BASE_PATH, SERVER_URL } from './api';
import { usePrefs } from './prefs';
import { sound } from './sound';
import type {
  Ack,
  AppConfig,
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
}

export const useSession = create<SessionState>(() => ({
  status: 'loading',
  error: null,
  config: null,
  user: null,
  stats: null,
  packs: [],
}));

export async function bootstrap() {
  try {
    const [config, me, packs] = await Promise.all([api.config(), api.me(), api.packs()]);
    useSession.setState({ status: 'ready', error: null, config, user: me.user, stats: me.stats ?? null, packs: packs.packs });
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
}

// ---------------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------------

export interface Feedback {
  index: number;
  locked: boolean;
  wrongChoice: number | null;
  wrongTexts: string[];
  shake: number;
}

export interface MatchView {
  info: MatchInfo;
  phase: 'countdown' | 'question' | 'reveal';
  startsAt: number;
  scores: Scores;
  question: (QuestionPayload & { deadline: number }) | null;
  reveal: RevealPayload | null;
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
};

export const useGame = create<GameState>(() => ({ ...initialGame }));

const emptyFeedback = (index: number): Feedback => ({ index, locked: false, wrongChoice: null, wrongTexts: [], shake: 0 });

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

function applySync(payload: MatchInfo & { state: string; scores: Scores; question: QuestionPayload | null }) {
  const { state, scores, question, ...info } = payload;
  useGame.setState({
    queue: null,
    found: false,
    result: null,
    match: {
      info,
      phase: state === 'countdown' ? 'countdown' : question?.resolved ? 'reveal' : 'question',
      startsAt: Date.now() + 1500,
      scores,
      question: question ? { ...question, deadline: Date.now() + question.remainingMs } : null,
      reveal: null,
      feedback: { ...emptyFeedback(question?.index ?? -1), locked: Boolean(question?.locked) },
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
    s.emit('match:sync', {}, (ack: Ack & { match?: Parameters<typeof applySync>[0] | null }) => {
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

  s.on('match:feedback', (f: { index: number; choice?: number; text?: string }) => {
    sound.wrong();
    patchMatch((m) => {
      if (m.feedback.index !== f.index) return {};
      if (f.choice != null) return { feedback: { ...m.feedback, locked: true, wrongChoice: f.choice } };
      return { feedback: { ...m.feedback, wrongTexts: [...m.feedback.wrongTexts, f.text ?? ''], shake: m.feedback.shake + 1 } };
    });
  });

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
    patchMatch((m) => ({ phase: 'reveal', reveal: r, scores: r.scores, history: { ...m.history, [r.index]: r.winnerId } }));
  });

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
    const { sections, answerMode } = usePrefs.getState();
    const payload = { kind, sections: sections ?? [], answerMode };
    useGame.setState({ replay: { type: 'queue', payload } });
    return run('queue:join', payload);
  },
  leaveQueue: () => run('queue:leave'),
  queueBot: () => run('queue:bot', { difficulty: usePrefs.getState().bot }),

  startTraining() {
    const { sections, answerMode, trainingMode, soloCount, bot } = usePrefs.getState();
    const payload = {
      sections: sections ?? [],
      answerMode,
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
    const { sections, answerMode } = usePrefs.getState();
    return run('lobby:create', { sections: sections ?? [], answerMode });
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
  leaveMatch: () => run('match:leave'),
  dismissResult: () => useGame.setState({ result: null }),
  openSettings: (open = true) => useGame.setState({ settingsOpen: open }),
};
