import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { TierBadge } from '../components/TierBadge';
import { Glass } from '../glass/Glass';
import { api } from '../lib/api';
import { navigate } from '../lib/route';
import { useSession } from '../lib/store';
import type { LeaderboardEntry } from '../lib/types';

export function Leaderboard() {
  const me = useSession((s) => s.user);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .leaderboard()
      .then((r) => setEntries(r.entries))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="page board">
      <header className="page-head">
        <div>
          <p className="eyebrow">Rangliste</p>
          <h1>Die Besten im Ranked</h1>
          <p className="page-head__lead">Sortiert nach Punkten. Wer noch in der Einstufung ist, steht trotzdem schon drin.</p>
        </div>
      </header>

      <Glass className="board__list" radius={28} tone="deep" blur={2} prism={false}>
        {error && <p className="empty">{error}</p>}
        {!error && entries === null && <p className="empty">Lädt …</p>}
        {entries?.length === 0 && (
          <p className="empty">Noch hat niemand Ranked gespielt. Das erste Spiel bringt dich direkt auf Platz 1.</p>
        )}
        {entries && entries.length > 0 && (
          <ol className="board__rows">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" className={`board__row${e.id === me?.id ? ' is-me' : ''}`} onClick={() => navigate('profil', e.id)}>
                  <span className={`board__rank num${e.rank <= 3 ? ` board__rank--${e.rank}` : ''}`}>{e.rank}</span>
                  <Avatar name={e.name} src={e.avatar} size={36} />
                  <span className="board__name">{e.name}</span>
                  <TierBadge rating={e.rating} games={e.rankedGames} compact />
                  <span className="board__rating num">{e.rating}</span>
                  <span className="board__games muted num">
                    {e.wins} {e.wins === 1 ? 'Sieg' : 'Siege'} · {e.rankedGames} Spiele
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Glass>
    </main>
  );
}
