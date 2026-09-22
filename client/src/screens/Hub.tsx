import { ArrowRight, Bot, Dumbbell, Heart, Lock, Swords, Users, Zap } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { PackIcon } from '../components/PackIcon';
import { selectionSummary } from '../components/PackPicker';
import { Segmented } from '../components/Segmented';
import { TierBadge, TierLadder } from '../components/TierBadge';
import { Glass } from '../glass/Glass';
import { percent, seconds } from '../lib/format';
import { usePrefs, type TrainingMode } from '../lib/prefs';
import { navigate } from '../lib/route';
import { actions, useSession } from '../lib/store';
import type { AnswerMode, BotDifficulty, Difficulty, OptionCount, User } from '../lib/types';

export const DIFFICULTY_EXPLAIN: Record<Difficulty, string> = {
  gemischt: 'Fragen aller Stufen, bunt gemischt.',
  leicht: 'Vor allem leichte Fragen.',
  mittel: 'Vor allem mittelschwere Fragen.',
  schwer: 'Alle schweren Fragen zuerst, danach mittelschwere.',
};
import { useSticky } from '../lib/useSticky';

function ModeCard({
  title,
  icon,
  children,
  className = '',
  accent,
  tour,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: boolean;
  /** Ziel fuer den Rundgang */
  tour?: string;
}) {
  return (
    <Glass className={`mode ${className}`} radius={30} bezel={24} tone={accent ? 'panel' : 'deep'} blur={2} hero data-tour={tour}>
      <header className="mode__head">
        <span className="mode__icon">{icon}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </Glass>
  );
}

export function Hub() {
  const user = useSticky(useSession((s) => s.user));
  if (!user) return null;
  return <HubView user={user} />;
}

function HubView({ user }: { user: User }) {
  const stats = useSession((s) => s.stats);
  const packs = useSession((s) => s.packs);
  const discordEnabled = useSession((s) => s.config?.discordEnabled);
  const prefs = usePrefs();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const sections = prefs.sections ?? [];
  const summary = selectionSummary(packs, sections);
  const tooFew = summary.questions < 5;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length >= 4) void act('join', () => actions.joinLobby(code.trim()));
  };

  return (
    <main className="page hub">
      <section className="hub__hello">
        <div>
          <p className="eyebrow">Spielen</p>
          <h1>Hallo {user.name}.</h1>
        </div>
        {stats && stats.duels + stats.trainingPlayed > 0 && (
          <dl className="hub__stats">
            {stats.duels > 0 ? (
              <div>
                <dt>Duelle gewonnen</dt>
                <dd className="num">
                  {stats.wins}
                  <span className="muted"> / {stats.duels}</span>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Trainings</dt>
                <dd className="num">{stats.trainingPlayed}</dd>
              </div>
            )}
            <div>
              <dt>Trefferquote</dt>
              <dd className="num">{percent(stats.accuracy)}</dd>
            </div>
            <div>
              <dt>Ø Antwortzeit</dt>
              <dd className="num">{seconds(stats.avgMs, 1)}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="hub__grid">
        <ModeCard title="Ranked" icon={<Swords size={20} />} className="mode--ranked" accent tour="ranked">
          <p className="mode__desc">
            1 gegen 1 um Punkte. Alle spielen dieselben Fragen aus dem Thema Allgemein, Auswahl und Tippen gemischt, neun Fragen.
          </p>
          <div className="mode__rank">
            {user.guest ? (
              <span className="mode__lock">
                <Lock size={15} /> Ranked braucht einen Discord-Login.
              </span>
            ) : (
              <TierBadge rating={user.rating} games={user.rankedGames} />
            )}
          </div>
          <TierLadder rating={user.rating} active={!user.guest && user.rankedGames >= 5} />
          <Button
            variant="primary"
            size="lg"
            block
            disabled={user.guest}
            loading={busy === 'ranked'}
            iconRight={<ArrowRight size={18} />}
            onClick={() => act('ranked', () => actions.joinQueue('ranked'))}
            title={user.guest && !discordEnabled ? 'Discord-Login ist noch nicht eingerichtet' : undefined}
          >
            Ranked suchen
          </Button>
        </ModeCard>

        <ModeCard title="Unranked" icon={<Zap size={20} />} tour="unranked">
          <p className="mode__desc">1 gegen 1 mit deinen Themen. Gespielt wird, was ihr beide ausgewählt habt.</p>
          <Button
            block
            disabled={tooFew}
            loading={busy === 'unranked'}
            iconRight={<ArrowRight size={17} />}
            onClick={() => act('unranked', () => actions.joinQueue('unranked'))}
          >
            Unranked suchen
          </Button>
        </ModeCard>

        <ModeCard title="Private Lobby" icon={<Users size={20} />} tour="lobby">
          <p className="mode__desc">Bis zu acht Leute per Code, Bots erlaubt. Als Host stellst du alles ein: Themen, Modus, Schwierigkeit, Zeit.</p>
          <div className="mode__row">
            <Button loading={busy === 'create'} onClick={() => act('create', actions.createLobby)}>
              Lobby erstellen
            </Button>
            <form className="code-join" onSubmit={join}>
              <Glass className="field field--code" radius={15} tone="deep" blur={1}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="CODE"
                  maxLength={5}
                  aria-label="Lobby-Code"
                  className="mono"
                />
              </Glass>
              <Button type="submit" disabled={code.length < 5} loading={busy === 'join'}>
                Beitreten
              </Button>
            </form>
          </div>
        </ModeCard>

        <ModeCard title="Training" icon={<Dumbbell size={20} />} tour="training">
          <Segmented<TrainingMode>
            label="Trainingsart"
            size="sm"
            block
            value={prefs.trainingMode}
            onChange={(v) => prefs.set({ trainingMode: v })}
            options={[
              { value: 'classic', label: 'Klassisch' },
              { value: 'survival', label: 'Überleben', icon: <Heart size={14} /> },
              { value: 'bot', label: 'Gegen Bot', icon: <Bot size={14} /> },
            ]}
          />
          <div className="mode__sub">
            {prefs.trainingMode === 'classic' && (
              <Segmented<string>
                label="Anzahl Fragen"
                size="sm"
                value={String(prefs.soloCount)}
                onChange={(v) => prefs.set({ soloCount: Number(v) })}
                options={['10', '20', '30'].map((n) => ({ value: n, label: `${n} Fragen` }))}
              />
            )}
            {prefs.trainingMode === 'survival' && (
              <p className="mode__desc">Drei Leben. Jede falsche, verpasste oder übersprungene Frage kostet eins.</p>
            )}
            {prefs.trainingMode === 'bot' && (
              <Segmented<BotDifficulty>
                label="Stärke des Bots"
                size="sm"
                value={prefs.bot}
                onChange={(v) => prefs.set({ bot: v })}
                options={[
                  { value: 'leicht', label: 'Leicht' },
                  { value: 'mittel', label: 'Mittel' },
                  { value: 'schwer', label: 'Schwer' },
                ]}
              />
            )}
          </div>
          <Button block disabled={tooFew} loading={busy === 'solo'} iconRight={<ArrowRight size={17} />} onClick={() => act('solo', actions.startTraining)}>
            Training starten
          </Button>
        </ModeCard>

        <Glass className="setup" radius={30} bezel={24} tone="deep" blur={2} data-tour="setup">
          <h2 className="setup__title">Deine Runde</h2>
          <p className="setup__hint">Gilt für Unranked, Training und neue Lobbys.</p>
          <div className="setup__block">
            <span className="field-label">Antworten</span>
            <Segmented<AnswerMode>
              label="Antwortmodus"
              block
              value={prefs.answerMode}
              onChange={(v) => prefs.set({ answerMode: v })}
              options={[
                { value: 'choice', label: 'Auswahl' },
                { value: 'typed', label: 'Tippen' },
                { value: 'mixed', label: 'Gemischt' },
              ]}
            />
            <p className="setup__explain">
              {prefs.answerMode === 'choice' && `${prefs.optionCount === 4 ? 'Vier' : 'Drei'} Antworten zur Wahl, ein Versuch pro Frage.`}
              {prefs.answerMode === 'typed' &&
                'Du tippst die Antwort selbst, kleine Tippfehler zählen trotzdem. Jeder falsche Versuch kostet 3 Sekunden. Die Fragen sind hier leichter.'}
              {prefs.answerMode === 'mixed' && 'Mal Auswahl, mal Tippen. Getippt wird nur bei leichten Fragen.'}
            </p>
            {prefs.answerMode !== 'typed' && (
              <div className="setup__row">
                <span className="field-label">Antwortmöglichkeiten</span>
                <Segmented<string>
                  label="Antwortmöglichkeiten"
                  size="sm"
                  value={String(prefs.optionCount)}
                  onChange={(v) => prefs.set({ optionCount: Number(v) as OptionCount })}
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
              value={prefs.difficulty}
              onChange={(v) => prefs.set({ difficulty: v })}
              options={[
                { value: 'gemischt', label: 'Gemischt' },
                { value: 'leicht', label: 'Leicht' },
                { value: 'mittel', label: 'Mittel' },
                { value: 'schwer', label: 'Schwer' },
              ]}
            />
            <p className="setup__explain">{DIFFICULTY_EXPLAIN[prefs.difficulty]}</p>
          </div>
          <div className="setup__block">
            <div className="setup__row">
              <span className="field-label">Themen</span>
              <span className="muted num">{summary.questions} Fragen</span>
            </div>
            {summary.parts.length ? (
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
            ) : (
              <p className="setup__empty">Noch kein Thema gewählt. Ohne Fragen kein Spiel.</p>
            )}
            <Button size="sm" block onClick={() => navigate('themen')}>
              Themen wählen
            </Button>
          </div>
        </Glass>
      </div>
    </main>
  );
}
