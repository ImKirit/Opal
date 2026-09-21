import { Check, Copy, Crown, Keyboard, ListChecks, LogOut, Play, Plus, Shuffle, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PackIcon } from '../components/PackIcon';
import { PackPicker, selectionSummary } from '../components/PackPicker';
import { Segmented } from '../components/Segmented';
import { Glass } from '../glass/Glass';
import { ANSWER_MODE_LABEL } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { actions, toast, useGame, useSession } from '../lib/store';
import type { AnswerMode, BotDifficulty, LobbyState } from '../lib/types';
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
          <p className="muted">Schick diesen Code an deine Leute. Sie geben ihn unter Spielen bei „Private Lobby“ ein.</p>
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
          <div className="setup__block">
            <span className="field-label">Antworten</span>
            {isHost ? (
              <Segmented<AnswerMode>
                label="Antwortmodus"
                block
                value={lobby.settings.answerMode}
                onChange={(v) => void actions.lobbySettings({ answerMode: v })}
                options={[
                  { value: 'choice', label: 'Auswahl', icon: <ListChecks size={15} /> },
                  { value: 'typed', label: 'Tippen', icon: <Keyboard size={15} /> },
                  { value: 'mixed', label: 'Gemischt', icon: <Shuffle size={15} /> },
                ]}
              />
            ) : (
              <p>{ANSWER_MODE_LABEL[lobby.settings.answerMode]}</p>
            )}
          </div>
          <div className="setup__block">
            <span className="field-label">Fragen pro Spiel</span>
            {isHost ? (
              <Segmented<string>
                label="Fragen pro Spiel"
                value={String(lobby.settings.questionCount)}
                onChange={(v) => void actions.lobbySettings({ questionCount: Number(v) })}
                options={['5', '10', '15', '20'].map((n) => ({ value: n, label: n }))}
              />
            ) : (
              <p className="num">{lobby.settings.questionCount}</p>
            )}
          </div>
          <div className="setup__block">
            <div className="setup__row">
              <span className="field-label">Pakete</span>
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
                  Pakete wählen
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

      <Modal open={picking} onClose={() => setPicking(false)} title="Pakete für die Lobby" width={980}>
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
