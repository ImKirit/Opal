import { useId } from 'react';
import { PLACEMENT_GAMES, TIERS, tierFor, type Tier } from '../lib/tiers';

export function Gem({ tier, size = 28 }: { tier: Tier; size?: number }) {
  const id = useId();
  const prism = tier.id === 'prisma';
  return (
    <svg className="gem" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          {prism ? (
            <>
              <stop offset="0" stopColor="#ffd9f2" />
              <stop offset="0.35" stopColor="#bfe3ff" />
              <stop offset="0.7" stopColor="#c7ffe0" />
              <stop offset="1" stopColor="#9b6cff" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={tier.light} />
              <stop offset="1" stopColor={tier.dark} />
            </>
          )}
        </linearGradient>
      </defs>
      {/* Facettierter Edelstein: Krone oben, Pavillon unten */}
      <path d="M9 4h14l6 8-13 17L3 12z" fill={`url(#g${id})`} />
      <path d="M3 12h26M9 4l3 8 4-8 4 8 3-8M12 12l4 17 4-17" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M9 4h14l6 8-13 17L3 12z" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

interface TierBadgeProps {
  rating: number;
  games: number;
  compact?: boolean;
}

export function TierBadge({ rating, games, compact }: TierBadgeProps) {
  const tier = tierFor(rating);
  const placing = games < PLACEMENT_GAMES;
  return (
    <span className={`tier${compact ? ' tier--compact' : ''}`} title={placing ? 'Einstufung läuft' : `${tier.name}, ${rating} Punkte`}>
      <Gem tier={tier} size={compact ? 20 : 30} />
      <span className="tier__text">
        <span className="tier__name">{placing ? 'Einstufung' : tier.name}</span>
        {!compact && (
          <span className="tier__rating num">{placing ? `${games} von ${PLACEMENT_GAMES} Spielen` : `${rating} Punkte`}</span>
        )}
      </span>
    </span>
  );
}

/** Alle Stufen nebeneinander, die aktuelle hervorgehoben. */
export function TierLadder({ rating, active = true }: { rating: number; active?: boolean }) {
  const current = tierFor(rating);
  return (
    <ol className={`ladder${active ? '' : ' is-locked'}`} aria-label="Rangstufen">
      {TIERS.map((t) => (
        <li key={t.id} className={active && t.id === current.id ? 'is-current' : ''}>
          <Gem tier={t} size={active && t.id === current.id ? 30 : 22} />
          <span className="ladder__name">{t.name}</span>
          <span className="ladder__min num">{t.min}</span>
        </li>
      ))}
    </ol>
  );
}
