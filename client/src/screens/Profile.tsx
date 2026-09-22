import { Check, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { TierBadge } from '../components/TierBadge';
import { Glass } from '../glass/Glass';
import { api } from '../lib/api';
import { loadFriends, useFriends } from '../lib/friends';
import { ago, KIND_LABEL, percent, seconds, signed } from '../lib/format';
import { useRoute } from '../lib/route';
import { logout, toast, useSession } from '../lib/store';
import type { Profile as ProfileData } from '../lib/types';

const RESULT_LABEL = { win: 'Sieg', loss: 'Niederlage', draw: 'Unentschieden', solo: 'Training' } as const;

/** Freundschaft von fremden Profilen aus: hinzufuegen, annehmen oder Stand anzeigen */
function FriendButton({ userId, name }: { userId: string; name: string }) {
  const list = useFriends();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done, 'good');
      await loadFriends();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!list.loaded) return null;
  if (list.friends.some((f) => f.id === userId)) {
    return (
      <span className="friend__done">
        <Check size={15} /> Befreundet
      </span>
    );
  }
  if (list.outgoing.some((f) => f.id === userId)) return <span className="friend__done">Anfrage gesendet</span>;
  if (list.incoming.some((f) => f.id === userId)) {
    return (
      <Button size="sm" variant="primary" loading={busy} onClick={() => act(() => api.friendAccept(userId), `Du bist jetzt mit ${name} befreundet.`)}>
        Anfrage annehmen
      </Button>
    );
  }
  return (
    <Button size="sm" icon={<UserPlus size={15} />} loading={busy} onClick={() => act(() => api.friendRequest(userId))}>
      Als Freund hinzufügen
    </Button>
  );
}

export function Profile() {
  const route = useRoute();
  const me = useSession((s) => s.user);
  const myStats = useSession((s) => s.stats);
  const id = route.param ?? me?.id ?? '';
  const isMe = id === me?.id;
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .profile(id)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Eigenes Profil nach jedem Spiel neu laden (myStats aendert sich dann)
  }, [id, isMe ? myStats : null]);

  if (error) {
    return (
      <main className="page">
        <p className="empty">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <p className="empty">Lädt …</p>
      </main>
    );
  }

  const { user, stats, matches } = data;
  const tiles: [string, string][] = [
    ['Duelle', String(stats.duels)],
    ['Siege', String(stats.wins)],
    ['Trefferquote', percent(stats.accuracy)],
    ['Ø Antwortzeit', seconds(stats.avgMs, 2)],
    ['Beste Serie', String(stats.bestStreak)],
    ['Überleben-Rekord', String(stats.survivalBest)],
  ];

  return (
    <main className="page profile">
      <Glass className="profile__head" radius={32} bezel={26} tone="panel" blur={2}>
        <Avatar name={user.name} src={user.avatar} size={84} />
        <div className="profile__who">
          <p className="eyebrow">{user.guest ? 'Gast' : 'Discord'}</p>
          <h1>{user.name}</h1>
          {!user.guest && <p className="muted num">Bestwert {user.peakRating} Punkte</p>}
        </div>
        {!user.guest && <TierBadge rating={user.rating} games={user.rankedGames} />}
        {isMe ? (
          <Button size="sm" variant="ghost" onClick={() => void logout()}>
            Abmelden
          </Button>
        ) : (
          me && <FriendButton userId={user.id} name={user.name} />
        )}
      </Glass>

      <div className="profile__tiles">
        {tiles.map(([label, value]) => (
          <Glass key={label} className="tile" radius={22} tone="deep" blur={2} prism={false}>
            <span className="tile__value num">{value}</span>
            <span className="tile__label">{label}</span>
          </Glass>
        ))}
      </div>

      <Glass className="history" radius={28} tone="deep" blur={2} prism={false}>
        <h2>Letzte Spiele</h2>
        {matches.length === 0 && <p className="empty">Noch keine Spiele. Das erste Training dauert zwei Minuten.</p>}
        <ul>
          {matches.map((m) => (
            <li key={m.id} className={`history__row history__row--${m.result}`}>
              <span className="history__result">{RESULT_LABEL[m.result]}</span>
              <span className="history__kind">{KIND_LABEL[m.kind]}</span>
              <span className="history__vs">
                {m.opponents.length
                  ? `gegen ${m.opponents
                      .slice(0, 3)
                      .map((o) => o.name)
                      .join(', ')}${m.opponents.length > 3 ? ` und ${m.opponents.length - 3} weitere` : ''}`
                  : `${m.score} richtig`}
              </span>
              <span className="history__score num">
                {m.opponents.length ? `${m.score} : ${m.opponents[0].score}` : ''}
                {m.ratingDelta != null && <span className={m.ratingDelta >= 0 ? 'up' : 'down'}> {signed(m.ratingDelta)}</span>}
              </span>
              <span className="history__when muted">{ago(m.endedAt)}</span>
            </li>
          ))}
        </ul>
      </Glass>
    </main>
  );
}
