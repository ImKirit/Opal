import { Check, Clock, UserCheck, UserPlus } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { api } from '../lib/api';
import { loadFriends, useFriends } from '../lib/friends';
import { toast, useSession } from '../lib/store';

/** Dunkelrotes Kennzeichen fuer den Macher von Opal (per Discord-ID auf dem Server festgelegt) */
export function OwnerBadge() {
  return (
    <span className="owner-badge" title="Hat Opal gebaut">
      Owner
    </span>
  );
}

/** Name wie ueberall auf der Seite: Discord-Benutzername bzw. Gastname, dazu ggf. Owner */
export function UserName({ name, owner, className = '' }: { name: string; owner?: boolean; className?: string }) {
  return (
    <span className={`uname ${className}`}>
      <span className="uname__text">{name}</span>
      {owner && <OwnerBadge />}
    </span>
  );
}

/**
 * Kleiner Knopf zum Hinzufuegen als Freund (Rangliste, Ergebnis). Zeigt den Stand der
 * Freundschaft und erscheint nicht bei einem selbst.
 */
export function AddFriendButton({ userId, name }: { userId: string; name: string }) {
  const meId = useSession((s) => s.user?.id);
  const list = useFriends();
  const [busy, setBusy] = useState(false);
  if (!meId || meId === userId || !list.loaded || userId.startsWith('bot:')) return null;

  const rel = list.friends.some((f) => f.id === userId)
    ? 'friend'
    : list.outgoing.some((f) => f.id === userId)
      ? 'outgoing'
      : list.incoming.some((f) => f.id === userId)
        ? 'incoming'
        : 'none';

  const act = async (e: MouseEvent) => {
    e.stopPropagation();
    if (busy || rel === 'friend' || rel === 'outgoing') return;
    setBusy(true);
    try {
      if (rel === 'incoming') {
        await api.friendAccept(userId);
        toast(`Du bist jetzt mit ${name} befreundet.`, 'good');
      } else {
        const res = await api.friendRequest(userId);
        toast(res.status === 'accepted' ? `Du bist jetzt mit ${name} befreundet.` : `Anfrage an ${name} geschickt.`, 'good');
      }
      await loadFriends();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const label =
    rel === 'friend'
      ? `Mit ${name} befreundet`
      : rel === 'outgoing'
        ? `Anfrage an ${name} gesendet`
        : rel === 'incoming'
          ? `Anfrage von ${name} annehmen`
          : `${name} als Freund hinzufügen`;
  const Icon = rel === 'friend' ? Check : rel === 'outgoing' ? Clock : rel === 'incoming' ? UserCheck : UserPlus;

  return (
    <button
      type="button"
      className={`icon-btn add-friend add-friend--${rel}`}
      onClick={act}
      disabled={busy || rel === 'friend' || rel === 'outgoing'}
      aria-label={label}
      title={label}
    >
      <Icon size={16} />
    </button>
  );
}
