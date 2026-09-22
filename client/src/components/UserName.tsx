import { Check, Clock, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
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

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789_.';
const MORPH_MS = 340;

/**
 * Laesst einen Text sich in einen anderen "verwandeln": die Zeichen wuerfeln kurz durch und
 * rasten von links nach rechts im Ziel ein. Startet immer vom gerade sichtbaren Stand, so dass
 * schnelles Rein- und Rausfahren mit der Maus sauber zurueckverwandelt.
 */
function useMorph(target: string) {
  const [text, setText] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    const from = shown.current;
    if (from === target) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      shown.current = target;
      setText(target);
      return;
    }
    const len = Math.max(from.length, target.length);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / MORPH_MS);
      let out = '';
      for (let i = 0; i < len; i++) {
        // Jede Stelle rastet zu einem eigenen Zeitpunkt ein, vorher wuerfelt sie kurz
        const settle = 0.25 + (0.75 * (i + 1)) / len;
        if (p >= settle) out += target[i] ?? '';
        else if (p >= settle - 0.4) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        else out += from[i] ?? '';
      }
      shown.current = out;
      setText(out);
      if (p < 1) frame = requestAnimationFrame(tick);
      else {
        shown.current = target;
        setText(target);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return text;
}

async function copyHandle(handle: string) {
  try {
    await navigator.clipboard.writeText(handle);
    toast(`Discord-Name „${handle}“ kopiert.`, 'good');
  } catch {
    toast(`Discord-Name: ${handle}`);
  }
}

/**
 * Name wie ueberall auf der Seite: Discord-Anzeigename bzw. Gastname, dazu ggf. Owner. Bei
 * Discord-Konten verwandelt sich der Name beim Drueberfahren in den Discord-Benutzernamen,
 * ein Klick kopiert ihn (Owner 2026-09-22).
 */
export function UserName({
  name,
  owner,
  handle,
  className = '',
}: {
  name: string;
  owner?: boolean;
  handle?: string | null;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  const text = useMorph(hover && handle ? `@${handle}` : name);

  if (!handle) {
    return (
      <span className={`uname ${className}`}>
        <span className="uname__text">{name}</span>
        {owner && <OwnerBadge />}
      </span>
    );
  }

  const copy = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void copyHandle(handle);
  };

  return (
    <span className={`uname uname--discord${hover ? ' is-handle' : ''} ${className}`}>
      <span
        className="uname__text"
        role="button"
        tabIndex={0}
        title={`Discord: ${handle} (klicken zum Kopieren)`}
        aria-label={`${name}, Discord-Name ${handle}, klicken zum Kopieren`}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') copy(e);
        }}
      >
        {text}
      </span>
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
