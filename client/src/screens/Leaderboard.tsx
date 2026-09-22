import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Segmented } from '../components/Segmented';
import { TierBadge } from '../components/TierBadge';
import { AddFriendButton, UserName } from '../components/UserName';
import { Glass } from '../glass/Glass';
import { api } from '../lib/api';
import { duration, seconds } from '../lib/format';
import { navigate, useRoute } from '../lib/route';
import { useSession } from '../lib/store';
import type { BoardEntry, BoardInfo, BoardResponse } from '../lib/types';

const EMPTY: BoardInfo[] = [];

/** Hauptwert einer Zeile, je nach Liste */
function mainValue(board: BoardInfo, e: BoardEntry) {
  if (board.format === 'duration') return duration(e.value);
  if (board.format === 'ms') return seconds(e.value, 2);
  return String(e.value);
}

/** Kleine Zusatzzeile rechts */
function subValue(board: BoardInfo, e: BoardEntry) {
  const n = e.games ?? 0;
  if (board.ladder) return `${e.wins ?? 0} ${e.wins === 1 ? 'Sieg' : 'Siege'} · ${n} ${n === 1 ? 'Spiel' : 'Spiele'}`;
  if (board.id === 'siege') return `von ${n} ${n === 1 ? 'Duell' : 'Duellen'}`;
  if (board.id === 'tempo') return `${n} richtige`;
  if (board.id === 'ueberleben') return `${n} ${n === 1 ? 'Versuch' : 'Versuche'}`;
  return `${n} ${n === 1 ? 'Spiel' : 'Spiele'}`;
}

const EMPTY_TEXT: Record<string, string> = {
  siege: 'Noch hat niemand ein Duell gegen einen Menschen gewonnen.',
  spielzeit: 'Noch keine Spiele gespeichert.',
  tempo: 'Noch hat niemand genug richtige Antworten im Training für diese Liste.',
  ueberleben: 'Noch hat niemand Überleben gespielt.',
};

function Row({ board, entry, isMe }: { board: BoardInfo; entry: BoardEntry; isMe: boolean }) {
  const open = () => navigate('profil', entry.id);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Profil von ${entry.name}`}
      className={`board__row${board.ladder ? '' : ' board__row--stat'}${isMe ? ' is-me' : ''}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          open();
        }
      }}
    >
      <span className={`board__rank num${entry.rank <= 3 ? ` board__rank--${entry.rank}` : ''}`}>{entry.rank}</span>
      <Avatar name={entry.name} src={entry.avatar} size={36} />
      <UserName className="board__name" name={entry.name} owner={entry.owner} handle={entry.handle} />
      {board.ladder && <TierBadge rating={entry.value} games={entry.games ?? 0} compact />}
      <span className="board__rating num">{mainValue(board, entry)}</span>
      <span className="board__games muted num">{subValue(board, entry)}</span>
      <span className="board__add">{!isMe && <AddFriendButton userId={entry.id} name={entry.name} />}</span>
    </div>
  );
}

export function Leaderboard() {
  const me = useSession((s) => s.user);
  const boards = useSession((s) => s.config?.boards ?? EMPTY);
  const route = useRoute();
  const board = boards.find((b) => b.id === route.param) ?? boards[0];
  const [data, setData] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!board) return;
    let alive = true;
    setData(null);
    setError(null);
    api
      .leaderboard(board.id)
      .then((r) => alive && setData(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [board]);

  if (!board) return null;
  const entries = data?.board === board.id ? data.entries : null;
  const mine = data?.board === board.id ? data.me : null;
  const outside = mine && !entries?.some((e) => e.id === mine.id);

  return (
    <main className="page board">
      <header className="page-head">
        <div>
          <p className="eyebrow">Rangliste</p>
          <h1>{board.ladder ? `Ranked ${board.name}` : board.name}</h1>
          <p className="page-head__lead">{board.desc}</p>
        </div>
      </header>

      <div className="board__tabs">
        <Segmented<string>
          label="Rangliste wählen"
          size="sm"
          value={board.id}
          onChange={(v) => navigate('rangliste', v)}
          options={boards.map((b) => ({ value: b.id, label: b.name }))}
        />
      </div>

      <Glass className="board__list" radius={28} tone="deep" blur={2} prism={false}>
        {error && <p className="empty">{error}</p>}
        {!error && entries === null && <p className="empty">Lädt …</p>}
        {entries?.length === 0 && (
          <p className="empty">
            {board.ladder
              ? `Noch hat niemand Ranked ${board.name} gespielt. Das erste Spiel bringt dich direkt auf Platz 1.`
              : (EMPTY_TEXT[board.id] ?? 'Noch leer.')}
          </p>
        )}
        {entries && entries.length > 0 && (
          <ol className="board__rows">
            {entries.map((e) => (
              <li key={e.id}>
                <Row board={board} entry={e} isMe={e.id === me?.id} />
              </li>
            ))}
            {outside && mine && (
              <li className="board__mine">
                <Row board={board} entry={mine} isMe />
              </li>
            )}
          </ol>
        )}
      </Glass>

      {me && entries && !mine && (
        <p className="board__note">
          {me.guest
            ? 'Gäste stehen in keiner Rangliste. Verbinde dein Konto mit Discord (Einstellungen), dann zählen deine Spiele mit, auch die bisherigen.'
            : board.ladder
              ? `Du stehst hier, sobald du dein erstes Spiel in Ranked ${board.name} gemacht hast.`
              : board.id === 'tempo'
                ? 'Du stehst hier, sobald du im Training 30 Fragen richtig beantwortet hast.'
                : 'Du stehst hier noch nicht drin.'}
        </p>
      )}
    </main>
  );
}
