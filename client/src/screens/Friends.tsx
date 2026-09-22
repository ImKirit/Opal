import { Check, Search, Swords, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Glass } from '../glass/Glass';
import { api } from '../lib/api';
import { loadFriends, useFriends } from '../lib/friends';
import { navigate } from '../lib/route';
import { actions, toast, useGame } from '../lib/store';
import type { FriendCard, Presence } from '../lib/types';

const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'online',
  queue: 'sucht gerade ein Spiel',
  lobby: 'sitzt in einer Lobby',
  playing: 'spielt gerade',
  offline: 'offline',
};

/** Herausfordern geht, solange jemand online ist und nicht mitten im Spiel steckt */
const canChallenge = (p?: Presence) => p === 'online' || p === 'queue' || p === 'lobby';

function Who({ person, presence }: { person: FriendCard; presence?: Presence }) {
  return (
    <button type="button" className="friend__who" onClick={() => navigate('profil', person.id)}>
      <span className={`friend__avatar${presence ? ` is-${presence}` : ''}`}>
        <Avatar name={person.name} src={person.avatar} size={38} dim={presence === 'offline'} />
      </span>
      <span className="friend__text">
        <span className="friend__name">
          {person.name}
          <span className="friend__tag mono">#{person.tag}</span>
          {person.guest && <span className="friend__guest">Gast</span>}
        </span>
        {presence && <span className={`friend__status is-${presence}`}>{PRESENCE_LABEL[presence]}</span>}
      </span>
    </button>
  );
}

/** Kleine Hilfe fuer Knoepfe, die eine Anfrage an den Server schicken */
function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done, 'good');
      await loadFriends();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function SearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const seq = useRef(0);
  const list = useFriends();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    const id = ++seq.current;
    const t = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((r) => id === seq.current && (setResults(r.users), setError(null)))
        .catch((e: Error) => id === seq.current && setError(e.message));
    }, 280);
    return () => window.clearTimeout(t);
  }, [query]);

  // Beziehung frisch aus der Freundesliste, damit Knoepfe nach einer Aktion sofort stimmen
  const relationOf = (u: FriendCard) => {
    if (list.friends.some((f) => f.id === u.id)) return 'friend';
    if (list.outgoing.some((f) => f.id === u.id)) return 'outgoing';
    if (list.incoming.some((f) => f.id === u.id)) return 'incoming';
    return list.loaded ? 'none' : (u.relation ?? 'none');
  };

  return (
    <Glass className="friends__card" radius={28} bezel={22} tone="deep" blur={2} prism={false} data-tour="friends-search">
      <h2>Leute finden</h2>
      <Glass className="field friends__search" radius={16} tone="deep" blur={1}>
        <Search size={17} className="muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name eingeben"
          maxLength={20}
          aria-label="Nach Namen suchen"
          autoComplete="off"
          spellCheck={false}
        />
      </Glass>
      {query.trim().length < 2 && <p className="friends__hint">Mindestens zwei Buchstaben. Das Kürzel mit # hilft, wenn mehrere gleich heißen.</p>}
      {error && <p className="empty">{error}</p>}
      {results?.length === 0 && <p className="empty">Niemand mit diesem Namen gefunden.</p>}
      {results && results.length > 0 && (
        <ul className="friends__list">
          {results.map((u) => {
            const rel = relationOf(u);
            return (
              <li key={u.id} className="friend">
                <Who person={u} />
                {rel === 'friend' && (
                  <span className="friend__done">
                    <Check size={15} /> Befreundet
                  </span>
                )}
                {rel === 'outgoing' && <span className="friend__done">Anfrage gesendet</span>}
                {rel === 'incoming' && (
                  <Button size="sm" variant="primary" loading={busy === u.id} onClick={() => run(u.id, () => api.friendAccept(u.id), `Du bist jetzt mit ${u.name} befreundet.`)}>
                    Annehmen
                  </Button>
                )}
                {rel === 'none' && (
                  <Button size="sm" icon={<UserPlus size={15} />} loading={busy === u.id} onClick={() => run(u.id, () => api.friendRequest(u.id))}>
                    Hinzufügen
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

function FriendRow({ friend }: { friend: FriendCard }) {
  const [confirm, setConfirm] = useState(false);
  const { busy, run } = useBusy();
  const outgoing = useGame((s) => s.outgoingInvite);
  const inMatch = useGame((s) => Boolean(s.match));
  const waiting = outgoing?.to.id === friend.id;

  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirm]);

  return (
    <li className="friend">
      <Who person={friend} presence={friend.presence} />
      <div className="friend__actions">
        <Button
          size="sm"
          variant="primary"
          icon={<Swords size={15} />}
          disabled={!canChallenge(friend.presence) || inMatch || Boolean(outgoing)}
          loading={busy === 'invite'}
          title={canChallenge(friend.presence) ? undefined : `${friend.name} ist ${PRESENCE_LABEL[friend.presence ?? 'offline']}`}
          onClick={() => run('invite', () => actions.invite(friend.id))}
        >
          {waiting ? 'Angefragt' : 'Herausfordern'}
        </Button>
        <button
          type="button"
          className={`icon-btn${confirm ? ' is-danger' : ''}`}
          aria-label={confirm ? `Wirklich ${friend.name} entfernen?` : `${friend.name} entfernen`}
          title={confirm ? 'Nochmal klicken zum Entfernen' : 'Entfernen'}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            void run('remove', () => api.friendRemove(friend.id));
          }}
        >
          <UserMinus size={16} />
        </button>
      </div>
    </li>
  );
}

export function Friends() {
  const list = useFriends();
  const { busy, run } = useBusy();

  // Offen: alle 20 Sekunden den Status auffrischen (spielt, online, offline)
  useEffect(() => {
    void loadFriends();
    const t = window.setInterval(() => void loadFriends(), 20000);
    return () => window.clearInterval(t);
  }, []);

  const online = list.friends.filter((f) => f.presence !== 'offline');
  const offline = list.friends.filter((f) => f.presence === 'offline');

  return (
    <main className="page friends">
      <header className="page-head">
        <div>
          <p className="eyebrow">Freunde</p>
          <h1>Zusammen spielen</h1>
          <p className="page-head__lead">
            Such Leute über ihren Namen und fordere Freunde direkt zu einem Duell heraus. Es gilt deine Runde aus dem Spielen-Tab:
            Themen, Antwortmodus und Schwierigkeit.
          </p>
        </div>
      </header>

      <div className="friends__grid">
        <SearchCard />

        <Glass className="friends__card" radius={28} bezel={22} tone="deep" blur={2} prism={false}>
          {list.incoming.length > 0 && (
            <section className="friends__section">
              <h2>
                Anfragen <span className="count num">{list.incoming.length}</span>
              </h2>
              <ul className="friends__list">
                {list.incoming.map((u) => (
                  <li key={u.id} className="friend">
                    <Who person={u} />
                    <div className="friend__actions">
                      <Button size="sm" variant="primary" icon={<Check size={15} />} loading={busy === `a${u.id}`} onClick={() => run(`a${u.id}`, () => api.friendAccept(u.id), `Du bist jetzt mit ${u.name} befreundet.`)}>
                        Annehmen
                      </Button>
                      <button type="button" className="icon-btn" aria-label={`Anfrage von ${u.name} ablehnen`} onClick={() => void run(`d${u.id}`, () => api.friendRemove(u.id))}>
                        <X size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="friends__section">
            <h2>
              Deine Freunde <span className="count num">{list.friends.length}</span>
            </h2>
            {!list.loaded && <p className="empty">Lädt …</p>}
            {list.loaded && list.friends.length === 0 && (
              <p className="empty">Noch niemand. Such links nach einem Namen und schick eine Anfrage.</p>
            )}
            {list.friends.length > 0 && (
              <ul className="friends__list">
                {[...online, ...offline].map((f) => (
                  <FriendRow key={f.id} friend={f} />
                ))}
              </ul>
            )}
          </section>

          {list.outgoing.length > 0 && (
            <section className="friends__section">
              <h2>Gesendet</h2>
              <ul className="friends__list">
                {list.outgoing.map((u) => (
                  <li key={u.id} className="friend">
                    <Who person={u} />
                    <Button size="sm" variant="ghost" loading={busy === `c${u.id}`} onClick={() => run(`c${u.id}`, () => api.friendRemove(u.id))}>
                      Zurückziehen
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Glass>
      </div>
    </main>
  );
}
