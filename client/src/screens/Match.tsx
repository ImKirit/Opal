import { ArrowRight, Check, CornerDownLeft, Flag, Heart, SkipForward, X } from 'lucide-react';
import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Glass } from '../glass/Glass';
import { ANSWER_MODE_LABEL, KIND_LABEL, seconds } from '../lib/format';
import { sound } from '../lib/sound';
import { actions, useGame, useSession, type MatchView } from '../lib/store';
import { useSticky } from '../lib/useSticky';
import type { MatchPlayer } from '../lib/types';

const MotionGlass = motion.create(Glass);

// ---------------------------------------------------------------------------

function useNow(active: boolean, every = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [active, every]);
  return now;
}

function PlayerSide({ player, score, match, align, isMe }: { player: MatchPlayer; score: number; match: MatchView; align: 'left' | 'right'; isMe: boolean }) {
  const now = useNow(true, 400);
  const missed = match.phase === 'question' && match.attempts[player.id] != null;
  const typing = match.phase === 'question' && now - (match.typing[player.id] ?? 0) < 1500;
  const scored = match.phase === 'reveal' && match.reveal?.winnerId === player.id;
  return (
    <div className={`side side--${align}${isMe ? ' is-me' : ''}${scored ? ' is-scored' : ''}${player.left ? ' is-gone' : ''}`}>
      <Avatar name={player.name} src={player.avatar} isBot={player.isBot} size={52} dim={!player.connected} />
      <div className="side__info">
        <span className="side__name">
          {player.name}
          {isMe && <span className="muted"> (du)</span>}
        </span>
        <span className="side__status">
          {player.left
            ? 'hat verlassen'
            : !player.connected
              ? 'Verbindung weg'
              : missed
                ? 'daneben'
                : typing
                  ? 'tippt …'
                  : player.rating != null
                    ? `${player.rating} Punkte`
                    : ' '}
        </span>
      </div>
      <motion.span key={score} className="side__score num" initial={{ scale: 1.5, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>
        {score}
      </motion.span>
    </div>
  );
}

function Progress({ match, meId }: { match: MatchView; meId: string }) {
  const total = match.info.total;
  const current = match.question?.index ?? -1;
  if (!total) return null;
  const count = Math.max(total, current + 1);
  return (
    <ol className="dots" aria-label="Fortschritt">
      {Array.from({ length: count }, (_, i) => {
        const winner = match.history[i];
        const state =
          winner === undefined ? (i === current ? 'now' : 'open') : winner === meId ? 'mine' : winner ? 'theirs' : 'none';
        return <li key={i} className={`dot dot--${state}`} />;
      })}
    </ol>
  );
}

function Scoreboard({ match, meId }: { match: MatchView; meId: string }) {
  const { info, scores } = match;
  const q = match.question;
  const label = q
    ? q.suddenDeath
      ? 'Entscheidungsfrage'
      : info.total
        ? `Frage ${q.number} von ${Math.max(info.total, q.number)}`
        : `Frage ${q.number}`
    : KIND_LABEL[info.kind];

  if (info.kind === 'solo') {
    const mine = scores[meId];
    return (
      <div className="scoreboard scoreboard--solo">
        <div className="scoreboard__center">
          <span className="scoreboard__label">{label}</span>
          <Progress match={match} meId={meId} />
        </div>
        <div className="solo-stats">
          {mine?.lives != null && (
            <span className="lives" aria-label={`${mine.lives} Leben übrig`}>
              {[0, 1, 2].map((i) => (
                <Heart key={i} size={18} className={i < (mine.lives ?? 0) ? 'is-full' : ''} />
              ))}
            </span>
          )}
          <span className="solo-stats__item num">
            <strong>{mine?.score ?? 0}</strong> richtig
          </span>
          <span className="solo-stats__item num">
            Serie <strong>{mine?.streak ?? 0}</strong>
          </span>
        </div>
      </div>
    );
  }

  if (info.players.length === 2) {
    const me = info.players.find((p) => p.id === meId) ?? info.players[0];
    const other = info.players.find((p) => p.id !== me.id)!;
    return (
      <div className="scoreboard scoreboard--duel">
        <PlayerSide player={me} score={scores[me.id]?.score ?? 0} match={match} align="left" isMe />
        <div className="scoreboard__center">
          <span className="scoreboard__label">{label}</span>
          <Progress match={match} meId={meId} />
        </div>
        <PlayerSide player={other} score={scores[other.id]?.score ?? 0} match={match} align="right" isMe={false} />
      </div>
    );
  }

  const ranked = [...info.players].sort((a, b) => (scores[b.id]?.score ?? 0) - (scores[a.id]?.score ?? 0));
  return (
    <div className="scoreboard scoreboard--group">
      <span className="scoreboard__label">{label}</span>
      <ol className="group">
        {ranked.map((p) => (
          <li key={p.id} className={`${p.id === meId ? 'is-me' : ''}${match.reveal?.winnerId === p.id ? ' is-scored' : ''}${p.left ? ' is-gone' : ''}`}>
            <Avatar name={p.name} src={p.avatar} isBot={p.isBot} size={30} dim={!p.connected} />
            <span className="group__name">{p.name}</span>
            <span className="group__score num">{scores[p.id]?.score ?? 0}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Timer({ match }: { match: MatchView }) {
  const q = match.question!;
  const running = match.phase === 'question';
  const now = useNow(running, 200);
  const left = Math.max(0, q.deadline - now);
  const secs = Math.ceil(left / 1000);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (running && secs <= 3 && secs > 0 && lastTick.current !== secs) {
      lastTick.current = secs;
      sound.tick();
    }
  }, [secs, running]);

  const from = Math.min(1, q.remainingMs / q.duration);
  const penalties = match.feedback.index === q.index ? match.feedback.penalties : 0;
  const stopped = !running || match.feedback.locked;
  return (
    <div className={`timer${secs <= 3 && !stopped ? ' is-urgent' : ''}`}>
      <div className="timer__track">
        {/* Neuer Schluessel bei jeder Strafe: die Animation startet dann mit der neuen Restzeit */}
        <div
          key={`${q.index}-${q.remainingMs}`}
          className={`timer__fill${stopped ? ' is-paused' : ''}`}
          style={{ '--from': from, animationDuration: `${Math.max(1, q.remainingMs)}ms` } as React.CSSProperties}
        />
      </div>
      <span className="timer__num num" aria-label={`${secs} Sekunden`}>
        {running ? secs : ''}
        <AnimatePresence>
          {penalties > 0 && (
            <motion.span
              key={penalties}
              className="timer__penalty"
              initial={{ opacity: 0, y: 0, scale: 0.8 }}
              animate={{ opacity: [0, 1, 1, 0], y: -26, scale: 1 }}
              transition={{ duration: 1.1, times: [0, 0.15, 0.7, 1] }}
            >
              -3 s
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}

function ChoiceAnswers({ match }: { match: MatchView }) {
  const q = match.question!;
  const { feedback, reveal } = match;
  const locked = feedback.locked || match.phase !== 'question';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (q.options?.length ?? 0)) actions.answerChoice(q.index, n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, q.index, q.options?.length]);

  return (
    <div className={`answers answers--n${q.options!.length}`}>
      {q.options!.map((opt, i) => {
        let state = '';
        if (reveal && reveal.index === q.index) {
          if (i === reveal.correctIndex) state = ' is-correct';
          else if (feedback.wrongChoice === i) state = ' is-wrong';
          else state = ' is-dim';
        } else if (feedback.wrongChoice === i) state = ' is-wrong';
        else if (locked) state = ' is-dim';
        return (
          <MotionGlass
            key={`${q.index}-${i}`}
            hero
            as="button"
            type="button"
            interactive
            radius={22}
            bezel={18}
            tone="panel"
            className={`answer answer--big${state}`}
            disabled={locked}
            onClick={() => actions.answerChoice(q.index, i)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 380, damping: 28 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="answer__key">{i + 1}</span>
            <span className="answer__text">{opt}</span>
            {state === ' is-correct' && <Check size={20} className="answer__mark" />}
            {state === ' is-wrong' && <X size={20} className="answer__mark" />}
          </MotionGlass>
        );
      })}
    </div>
  );
}

function TypedAnswer({ match }: { match: MatchView }) {
  const q = match.question!;
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const lastSent = useRef('');
  const [shaker, animate] = useAnimate();
  const open = match.phase === 'question' && !match.feedback.locked;

  useEffect(() => {
    setText('');
    input.current?.focus();
  }, [q.index]);

  // Falscher Versuch: wackeln und leeren, aber nur wenn noch der abgeschickte Text drinsteht.
  // Das Feld bleibt dasselbe Element, der Fokus geht also nicht verloren.
  useEffect(() => {
    if (!match.feedback.shake) return;
    setText((current) => (current.trim() === lastSent.current ? '' : current));
    void animate(shaker.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.36 });
    input.current?.focus();
  }, [match.feedback.shake, animate, shaker]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !open) return;
    lastSent.current = text.trim();
    actions.answerText(q.index, text.trim());
  };

  return (
    <form className="typed" onSubmit={submit}>
      <div ref={shaker}>
        <Glass className="typed__field" radius={24} bezel={20} tone="deep" blur={1} hero>
          <input
            ref={input}
            value={text}
            disabled={!open}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 700) {
                lastTyping.current = Date.now();
                actions.typing(q.index);
              }
            }}
            placeholder={
              open ? 'Antwort eintippen' : match.feedback.timedOut ? 'Deine Zeit ist um' : match.feedback.skipped ? 'Übersprungen' : ''
            }
            maxLength={80}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Deine Antwort"
          />
          <button type="submit" className="typed__send" disabled={!open || !text.trim()} aria-label="Antwort abschicken">
            <CornerDownLeft size={20} />
          </button>
        </Glass>
      </div>
      {match.feedback.wrongTexts.length > 0 && (
        <ul className="typed__misses" aria-label="Falsche Versuche, jeder kostet 3 Sekunden">
          {match.feedback.wrongTexts.slice(-5).map((t, i) => (
            <li key={`${t}-${i}`}>{t}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

function SkipButton({ match }: { match: MatchView }) {
  const q = match.question!;
  const solo = match.info.kind === 'solo';
  if (match.phase !== 'question') return <div className="round__actions" aria-hidden="true" />;
  const waiting = match.feedback.locked && !solo;
  return (
    <div className="round__actions">
      {waiting ? (
        <span className="round__wait">
          {match.feedback.skipped ? 'Übersprungen.' : match.feedback.timedOut ? 'Deine Zeit ist um.' : 'Eingeloggt.'} Die anderen sind noch dran.
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={<SkipForward size={15} />}
          disabled={match.feedback.locked}
          onClick={() => actions.skip(q.index)}
        >
          Weiß ich nicht, überspringen
        </Button>
      )}
    </div>
  );
}

/**
 * Aufloesung wie bei Duolingo: Leiste unten in Gruen (Punkt fuer mich) oder Rot, mit der
 * richtigen Antwort, dem Fakt und einem grossen Weiter-Knopf (Enter oder Leertaste).
 */
function ContinuePanel({ match, meId }: { match: MatchView; meId: string }) {
  const r = match.reveal!;
  const q = match.question;
  const solo = match.info.kind === 'solo';
  const winner = match.info.players.find((p) => p.id === r.winnerId);
  const good = r.winnerId === meId;
  const auto = r.continueMode === 'auto';
  const imReady = r.ready.includes(meId);
  const humans = match.info.players.filter((p) => !p.isBot && !p.left);
  const waitingFor = humans.filter((p) => !r.ready.includes(p.id));
  const now = useNow(Boolean(r.autoAt) || auto, 250);
  const autoLeft = r.autoAt ? Math.max(0, Math.ceil((r.autoAt - now) / 1000)) : null;

  let headline: string;
  if (good) headline = solo ? 'Richtig!' : 'Punkt für dich!';
  else if (winner) headline = `${winner.name} war schneller`;
  else if (match.feedback.skipped) headline = 'Übersprungen';
  else if (match.feedback.locked || match.feedback.wrongTexts.length) headline = 'Leider falsch';
  else headline = solo ? 'Die Zeit ist um' : 'Niemand hatte es';

  const sub = good
    ? r.ms != null
      ? `in ${seconds(r.ms)}`
      : null
    : winner && r.ms != null
      ? `in ${seconds(r.ms)}`
      : null;

  const go = () => {
    if (!imReady) actions.continueMatch(r.index);
  };

  // Enter und Leertaste druecken Weiter, aber erst kurz nach dem Erscheinen: sonst rutscht man
  // mit dem Enter vom Abschicken der Tipp-Antwort direkt durch.
  useEffect(() => {
    if (auto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      if (Date.now() - r.shownAt < 450) return;
      e.preventDefault();
      if (!r.ready.includes(meId)) actions.continueMatch(r.index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auto, r.index, r.ready, r.shownAt, meId]);

  const label = r.last ? 'Zum Ergebnis' : 'Weiter';

  return (
    <MotionGlass
      hero
      className={`next next--${good ? 'good' : 'bad'}`}
      radius={28}
      bezel={24}
      tone="deep"
      blur={3}
      role="status"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <span className="next__icon" aria-hidden="true">
        {good ? <Check size={28} strokeWidth={3} /> : <X size={28} strokeWidth={3} />}
      </span>
      <div className="next__body">
        <p className="next__headline">
          {headline}
          {sub && <span className="next__time num"> {sub}</span>}
        </p>
        {(q?.mode === 'typed' || !good) && (
          <p className="next__answer">
            Richtig ist: <strong>{r.answer}</strong>
          </p>
        )}
        {r.fact && <p className="next__fact">{r.fact}</p>}
      </div>
      <div className="next__action">
        {auto ? (
          <div className="next__auto" aria-label="Es geht gleich automatisch weiter">
            <span>Gleich geht es weiter</span>
            <div className="next__bar" style={{ animationDuration: `${r.nextInMs ?? 3000}ms` }} />
          </div>
        ) : (
          <>
            <button type="button" className="next__btn" onClick={go} disabled={imReady} autoFocus>
              {imReady ? (waitingFor.length ? 'Warte …' : label) : label}
              {!imReady && <ArrowRight size={20} strokeWidth={2.6} />}
            </button>
            <span className="next__hint">
              {imReady && waitingFor.length
                ? `Warte auf ${waitingFor.length === 1 ? waitingFor[0].name : `${waitingFor.length} Leute`}${autoLeft != null ? `, noch ${autoLeft} s` : ''}`
                : !imReady && autoLeft != null
                  ? `Die anderen sind bereit, noch ${autoLeft} s`
                  : 'Enter oder Leertaste'}
            </span>
          </>
        )}
      </div>
    </MotionGlass>
  );
}

function Countdown({ match, meId }: { match: MatchView; meId: string }) {
  const now = useNow(true, 100);
  const left = Math.max(0, match.startsAt - now);
  const n = Math.ceil(left / 1000);
  const others = match.info.players.filter((p) => p.id !== meId);
  return (
    <div className="countdown">
      <p className="eyebrow">
        {KIND_LABEL[match.info.kind]} · {ANSWER_MODE_LABEL[match.info.answerMode]}
      </p>
      <h2 className="countdown__vs">
        {others.length === 0 ? 'Training' : others.length === 1 ? `Gegen ${others[0].name}` : `${others.length + 1} Leute in der Runde`}
      </h2>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={n}
          className="countdown__num num"
          initial={{ scale: 1.6, opacity: 0, filter: 'blur(8px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          {n > 0 ? n : 'Los'}
        </motion.span>
      </AnimatePresence>
      <p className="muted">{match.info.kind === 'solo' ? 'Jede richtige Antwort zählt.' : 'Wer zuerst richtig antwortet, holt den Punkt.'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Match() {
  const match = useSticky(useGame((s) => s.match));
  const meId = useSession((s) => s.user?.id ?? '');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const q = match?.question ?? null;

  useEffect(() => {
    if (!confirmLeave) return;
    const t = window.setTimeout(() => setConfirmLeave(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmLeave]);

  if (!match) return null;
  const training = match.info.kind === 'solo' || match.info.kind === 'bot';

  return (
    <main className="match" style={q ? ({ '--q-h': q.hue } as React.CSSProperties) : undefined}>
      <Glass className="match__top" radius={28} bezel={22} tone="panel" blur={3} hero>
        <Scoreboard match={match} meId={meId} />
      </Glass>

      <div className="match__stage">
        {match.phase === 'countdown' || !q ? (
          <Countdown match={match} meId={meId} />
        ) : (
          <div className="round" key={q.index}>
            <MotionGlass
              hero
              className="qcard"
              radius={34}
              bezel={30}
              tone="panel"
              blur={2}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            >
              <div className="qcard__meta">
                <span className="qcard__pack">
                  <span className="qcard__swatch" />
                  {q.pack} · {q.section}
                </span>
                <span className="qcard__mode">{q.mode === 'typed' ? 'Tippen' : 'Auswahl'}</span>
              </div>
              <h1 className="qcard__text">{q.text}</h1>
              <Timer match={match} />
            </MotionGlass>

            {q.mode === 'choice' ? <ChoiceAnswers match={match} /> : <TypedAnswer match={match} />}
            <SkipButton match={match} />
          </div>
        )}
      </div>

      <AnimatePresence>
        {match.phase === 'reveal' && match.reveal && q && match.reveal.index === q.index && (
          <ContinuePanel key={match.reveal.index} match={match} meId={meId} />
        )}
      </AnimatePresence>

      <footer className="match__foot">
        <Button
          size="sm"
          variant="ghost"
          icon={<Flag size={15} />}
          onClick={() => {
            if (!confirmLeave) return setConfirmLeave(true);
            void actions.leaveMatch();
          }}
        >
          {confirmLeave ? (training ? 'Wirklich beenden?' : 'Wirklich aufgeben? Zählt als Niederlage') : training ? 'Training beenden' : 'Aufgeben'}
        </Button>
      </footer>
    </main>
  );
}
