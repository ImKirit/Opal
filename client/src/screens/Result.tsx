import { Home, RotateCcw, Users } from 'lucide-react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { TierBadge } from '../components/TierBadge';
import { Glass } from '../glass/Glass';
import { KIND_LABEL, percent, seconds, signed } from '../lib/format';
import { navigate } from '../lib/route';
import { actions, useGame, useSession } from '../lib/store';
import { PLACEMENT_GAMES, tierFor } from '../lib/tiers';
import { useSticky } from '../lib/useSticky';

const MotionGlass = motion.create(Glass);

function RatingCounter({ from, to }: { from: number; to: number }) {
  const value = useMotionValue(from);
  const rounded = useTransform(value, (v) => Math.round(v));
  useEffect(() => {
    const controls = animate(value, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.4 });
    return () => controls.stop();
  }, [to, value]);
  return <motion.span className="num">{rounded}</motion.span>;
}

export function Result() {
  const result = useSticky(useGame((s) => s.result));
  const lobby = useGame((s) => s.lobby);
  const replay = useGame((s) => s.replay);
  const me = useSticky(useSession((s) => s.user));
  if (!result || !me) return null;

  const mine = result.summary.find((s) => s.id === me.id);
  const solo = result.kind === 'solo';
  const rating = result.ratingChanges[me.id];

  let title: string;
  let tone: 'win' | 'loss' | 'draw' | 'solo';
  if (solo) {
    title = result.info?.soloMode === 'survival' ? `${mine?.score ?? 0} Fragen überlebt` : `${mine?.score ?? 0} von ${result.questionsPlayed} richtig`;
    tone = 'solo';
  } else if (result.reason === 'abandoned') {
    title = 'Spiel abgebrochen';
    tone = 'draw';
  } else if (result.winnerId === me.id) {
    title = result.reason === 'forfeit' ? 'Sieg, der Gegner ist raus' : 'Sieg';
    tone = 'win';
  } else if (result.winnerId == null) {
    title = 'Unentschieden';
    tone = 'draw';
  } else {
    title = result.reason === 'forfeit' && !result.summary.find((s) => s.id === me.id && s.placement === 1) ? 'Aufgegeben' : 'Niederlage';
    tone = 'loss';
  }

  const ordered = [...result.summary].sort((a, b) => a.placement - b.placement);
  const accuracy = mine && mine.correct + mine.wrong > 0 ? mine.correct / (mine.correct + mine.wrong) : null;
  const leave = () => {
    actions.dismissResult();
    navigate('spielen');
  };

  return (
    <main className="page result">
      <MotionGlass
        hero
        className={`result__card result__card--${tone}`}
        radius={36}
        bezel={30}
        tone="panel"
        blur={2}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <p className="eyebrow">{KIND_LABEL[result.kind]}</p>
        <h1 className="result__title">{title}</h1>

        {rating && (
          <div className="result__rating">
            <TierBadge rating={rating.after} games={rating.games} />
            <span className={`result__delta ${rating.delta >= 0 ? 'up' : 'down'}`}>{signed(rating.delta)}</span>
            <span className="result__points">
              <RatingCounter from={rating.before} to={rating.after} /> Punkte
            </span>
            {rating.games === PLACEMENT_GAMES && <span className="muted">Einstufung abgeschlossen: {tierFor(rating.after).name}</span>}
          </div>
        )}

        {mine && (
          <dl className="result__stats">
            <div>
              <dt>Richtig</dt>
              <dd className="num">{mine.correct}</dd>
            </div>
            <div>
              <dt>Treffer</dt>
              <dd className="num">{percent(accuracy)}</dd>
            </div>
            <div>
              <dt>Ø Zeit</dt>
              <dd className="num">{seconds(mine.avgMs)}</dd>
            </div>
            <div>
              <dt>Beste Serie</dt>
              <dd className="num">{mine.bestStreak}</dd>
            </div>
          </dl>
        )}

        {!solo && (
          <ol className="result__table">
            {ordered.map((p) => (
              <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
                <span className="result__place num">{p.placement}.</span>
                <Avatar name={p.name} isBot={p.isBot} size={32} />
                <span className="result__name">{p.name}</span>
                <span className="result__score num">{p.score}</span>
                <span className="muted num">{seconds(p.avgMs)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="result__actions">
          {lobby ? (
            <Button variant="primary" size="lg" icon={<Users size={18} />} onClick={() => actions.dismissResult()}>
              Zurück zur Lobby
            </Button>
          ) : (
            replay && (
              <Button variant="primary" size="lg" icon={<RotateCcw size={18} />} onClick={() => void actions.replay()}>
                {replay.type === 'solo' ? 'Nochmal' : 'Nächstes Spiel suchen'}
              </Button>
            )
          )}
          <Button size="lg" icon={<Home size={18} />} onClick={leave}>
            Zum Menü
          </Button>
        </div>
      </MotionGlass>
    </main>
  );
}
