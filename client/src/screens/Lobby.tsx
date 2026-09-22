import { Check, Copy, Crown, Keyboard, ListChecks, Lock, LogOut, Play, Plus, Shuffle, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PackIcon } from '../components/PackIcon';
import { PackPicker, selectionSummary } from '../components/PackPicker';
import { Segmented } from '../components/Segmented';
import { Toggle } from '../components/Toggle';
import { Glass } from '../glass/Glass';
import { ANSWER_MODE_LABEL, CONTINUE_MODE_LABEL, DIFFICULTY_LABEL, TIME_LIMIT_LABEL } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { actions, toast, useGame, useSession } from '../lib/store';
import type { AnswerMode, BotDifficulty, ContinueMode, Difficulty, LobbyState, TimeLimit } from '../lib/types';
import { DIFFICULTY_EXPLAIN } from './Hub';
import { useSticky } from '../lib/useSticky';

export function Lobby() {
  const lobby = useSticky(useGame((s) => s.lobby));
  const me = useSticky(useSession((s) => s.user));
  if (!lobby || !me) return null;
  return <LobbyView lobby={lobby} meId={me.id} />;
}

function LobbyView({ lobby, meId }: { lobby: LobbyState; meId: string }) {
  const me = { id: meId };
  const packs = useSession((s) => s.packs);
  const mySections = usePrefs((s) => s.sections) ?? [];
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<string[]>(lobby.settings.sections);
  const [botLevel, setBotLevel] = useState<BotDifficulty>('mittel');
  const [starting, setStarting] = useState(false);

  const isHost = lobby.hostId === me.id;
  const summary = selectionSummary(packs, lobby.settings.sections);
  const full = lobby.members.length + lobby.bots.length >= lobby.max;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast(`Code: ${lobby.code}`);
    }
  };

  return (
    <main className="page lobby">
      <header className="lobby__head">
        <div>
          <p className="eyebrow">Private Lobby</p>
          <div className="lobby__code">
            <span className="mono">{lobby.code}</span>
            <button type="button" className="icon-btn" onClick={copy} aria-label="Code kopieren">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <p className="muted">
            {lobby.locked
              ? 'Die Lobby ist abgeschlossen, mit dem Code kommt gerade niemand rein.'
              : 'Schick diesen Code an deine Leute. Sie geben ihn unter Spielen bei „Private Lobby“ ein.'}
          </p>
        </div>
        <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => void actions.leaveLobby()}>
          Lobby verlassen
        </Button>
      </header>

      <div className="lobby__grid">
        <Glass className="lobby__players" radius={30} bezel={24} tone="deep" blur={2}>
          <div className="lobby__title">
            <h2>Teilnehmer</h2>
            <span className="muted num">
              {lobby.members.length + lobby.bots.length} von {lobby.max}
            </span>
          </div>
          <ul>
            {lobby.members.map((m) => (
              <li key={m.id} className={m.connected ? '' : 'is-away'}>
                <Avatar name={m.name} src={m.avatar} size={40} dim={!m.connected} />
                <span className="lobby__name">
                  {m.name}
                  {m.id === me.id && <span className="muted"> (du)</span>}
                </span>
                {m.id === lobby.hostId && (
                  <span className="lobby__host" title="Host">
                    <Crown size={15} /> Host
                  </span>
                )}
                {!m.connected && <span className="muted">getrennt</span>}
                {isHost && m.id !== me.id && (
                  <button type="button" className="icon-btn" onClick={() => void actions.kick(m.id)} aria-label={`${m.name} entfernen`}>
                    <UserMinus size={16} />
                  </button>
                )}
              </li>
            ))}
            {lobby.bots.map((b) => (
              <li key={b.id}>
                <Avatar name={b.name} isBot size={40} />
                <span className="lobby__name">{b.name}</span>
                <span className="muted">{b.difficulty}</span>
                {isHost && (
                  <button type="button" className="icon-btn" onClick={() => void actions.removeBot(b.id)} aria-label={`${b.name} entfernen`}>
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isHost && (
            <div className="lobby__bots">
              <Segmented<BotDifficulty>
                label="Stärke des Bots"
                size="sm"
                value={botLevel}
                onChange={setBotLevel}
                options={[
                  { value: 'leicht', label: 'Leicht' },
                  { value: 'mittel', label: 'Mittel' },
                  { value: 'schwer', label: 'Schwer' },
                ]}
              />
              <Button size="sm" icon={<Plus size={15} />} disabled={full} onClick={() => void actions.addBot(botLevel)}>
                Bot dazu
              </Button>
            </div>
          )}
        </Glass>

        <Glass className="lobby__settings" radius={30} bezel={24} tone="deep" blur={2}>
          <h2>Regeln</h2>
          {isHost ? <HostSettings lobby={lobby} /> : <RulesSummary lobby={lobby} />}
          <div className="setup__block">
            <div className="setup__row">
              <span className="field-label">Themen</span>
              <span className="muted num">{summary.questions} Fragen</span>
            </div>
            <ul className="setup__packs">
              {summary.parts.map(({ pack, active }) => (
                <li key={pack.id}>
                  <PackIcon icon={pack.icon} hue={pack.hue} size={28} />
                  <span>{pack.name}</span>
                  {pack.sections.length > 1 && (
                    <span className="muted num">
                      {active}/{pack.sections.length}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {isHost && (
              <div className="settings__row">
                <Button
                  size="sm"
                  onClick={() => {
                    setDraft(lobby.settings.sections);
                    setPicking(true);
                  }}
                >
                  Themen wählen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void actions.lobbySettings({ sections: mySections })}>
                  Meine Auswahl übernehmen
                </Button>
              </div>
            )}
          </div>

          {isHost ? (
            <Button
              variant="primary"
              size="lg"
              block
              icon={<Play size={18} />}
              loading={starting}
              disabled={lobby.playing}
              onClick={async () => {
                setStarting(true);
                await actions.startLobby();
                setStarting(false);
              }}
            >
              Spiel starten
            </Button>
          ) : (
            <p className="lobby__wait">Der Host startet das Spiel, sobald alle da sind.</p>
          )}
        </Glass>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} title="Themen für die Lobby" width={980}>
        <PackPicker value={draft} onChange={setDraft} />
        <div className="modal__actions">
          <span className="muted num">{selectionSummary(packs, draft).questions} Fragen</span>
          <Button
            variant="primary"
            disabled={selectionSummary(packs, draft).questions < 5}
            onClick={async () => {
              const ack = await actions.lobbySettings({ sections: draft });
              if (ack.ok) setPicking(false);
            }}
          >
            Übernehmen
          </Button>
        </div>
      </Modal>
    </main>
  );
}

/** Alle Einstellungen, die der Host fuer die Runde festlegt. Aenderungen sehen alle sofort. */
function HostSettings({ lobby }: { lobby: LobbyState }) {
  const st = lobby.settings;
  const set = (patch: Record<string, unknown>) => void actions.lobbySettings(patch);
  return (
    <>
      <div className="setup__block">
        <span className="field-label">Antworten</span>
        <Segmented<AnswerMode>
          label="Antwortmodus"
          block
          value={st.answerMode}
          onChange={(v) => set({ answerMode: v })}
          options={[
            { value: 'choice', label: 'Auswahl', icon: <ListChecks size={15} /> },
            { value: 'typed', label: 'Tippen', icon: <Keyboard size={15} /> },
            { value: 'mixed', label: 'Gemischt', icon: <Shuffle size={15} /> },
          ]}
        />
        {st.answerMode !== 'typed' && (
          <div className="setup__row">
            <span className="setup__explain">Antwortmöglichkeiten</span>
            <Segmented<string>
              label="Antwortmöglichkeiten"
              size="sm"
              value={String(st.optionCount)}
              onChange={(v) => set({ optionCount: Number(v) })}
              options={[
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
            />
          </div>
        )}
      </div>
      <div className="setup__block">
        <span className="field-label">Schwierigkeit</span>
        <Segmented<Difficulty>
          label="Schwierigkeit"
          size="sm"
          block
          value={st.difficulty}
          onChange={(v) => set({ difficulty: v })}
          options={(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
        />
        <p className="setup__explain">{DIFFICULTY_EXPLAIN[st.difficulty]}</p>
      </div>
      <div className="setup__block">
        <span className="field-label">Fragen pro Spiel</span>
        <Segmented<string>
          label="Fragen pro Spiel"
          size="sm"
          block
          value={String(st.questionCount)}
          onChange={(v) => set({ questionCount: Number(v) })}
          options={['5', '10', '15', '20', '30'].map((n) => ({ value: n, label: n }))}
        />
      </div>
      <div className="setup__block">
        <span className="field-label">Zeit pro Frage</span>
        <Segmented<TimeLimit>
          label="Zeit pro Frage"
          size="sm"
          block
          value={st.timeLimit}
          onChange={(v) => set({ timeLimit: v })}
          options={[
            { value: 'kurz', label: 'Kurz' },
            { value: 'normal', label: 'Normal' },
            { value: 'lang', label: 'Lang' },
          ]}
        />
        <p className="setup__explain">{TIME_LIMIT_LABEL[st.timeLimit]}</p>
      </div>
      <div className="setup__block">
        <span className="field-label">Nach jeder Frage</span>
        <Segmented<ContinueMode>
          label="Nach jeder Frage"
          size="sm"
          block
          value={st.continueMode}
          onChange={(v) => set({ continueMode: v })}
          options={[
            { value: 'button', label: 'Weiter-Knopf' },
            { value: 'auto', label: 'Automatisch' },
          ]}
        />
        <p className="setup__explain">
          {st.continueMode === 'button'
            ? 'Alle drücken auf Weiter. Wer zuerst drückt, gibt den anderen noch 10 Sekunden.'
            : 'Die Auflösung steht ein paar Sekunden, dann kommt die nächste Frage von selbst.'}
        </p>
      </div>
      <Toggle
        checked={st.locked}
        onChange={(v) => set({ locked: v })}
        label="Lobby abschließen"
        hint="Niemand Neues kommt mehr rein, auch nicht mit dem Code."
      />
    </>
  );
}

/** Was Mitspieler ohne Host-Rechte sehen: die Regeln zum Nachlesen. */
function RulesSummary({ lobby }: { lobby: LobbyState }) {
  const st = lobby.settings;
  const rows: [string, string][] = [
    [
      'Antworten',
      st.answerMode === 'typed' ? ANSWER_MODE_LABEL.typed : `${ANSWER_MODE_LABEL[st.answerMode]}, ${st.optionCount} Optionen`,
    ],
    ['Schwierigkeit', DIFFICULTY_LABEL[st.difficulty]],
    ['Fragen', String(st.questionCount)],
    ['Zeit pro Frage', TIME_LIMIT_LABEL[st.timeLimit]],
    ['Nach jeder Frage', CONTINUE_MODE_LABEL[st.continueMode]],
  ];
  return (
    <dl className="rules">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      {st.locked && (
        <div>
          <dt>
            <Lock size={13} /> Lobby
          </dt>
          <dd>abgeschlossen</dd>
        </div>
      )}
    </dl>
  );
}
