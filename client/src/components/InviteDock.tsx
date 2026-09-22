import { Swords } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Glass } from '../glass/Glass';
import { actions, useGame, type LiveInvite } from '../lib/store';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { UserName } from './UserName';

const MotionGlass = motion.create(Glass);

function useSecondsLeft(expiresAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function IncomingCard({ invite }: { invite: LiveInvite }) {
  const left = useSecondsLeft(invite.expiresAt);
  const [busy, setBusy] = useState(false);
  // Einmal festlegen: eine neue Dauer bei jedem Neuzeichnen liesse den Balken springen
  const [barMs] = useState(() => Math.max(0, invite.expiresAt - Date.now()));
  return (
    <MotionGlass
      layout
      hero
      className="invite"
      radius={24}
      bezel={20}
      tone="deep"
      blur={3}
      role="alertdialog"
      aria-label={`Match-Anfrage von ${invite.from.name}`}
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <div className="invite__head">
        <Avatar name={invite.from.name} src={invite.from.avatar} size={40} />
        <div>
          <p className="invite__title">
            <UserName name={invite.from.name} owner={invite.from.owner} handle={invite.from.handle} /> fordert dich heraus
          </p>
          <p className="invite__sub">
            {invite.intoLobby ? 'Einladung in die Lobby' : '1 gegen 1, startet sofort'} · noch {left} s
          </p>
        </div>
      </div>
      <div className="invite__bar" style={{ animationDuration: `${barMs}ms` }} />
      <div className="invite__actions">
        <Button
          size="sm"
          variant="primary"
          icon={<Swords size={15} />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await actions.respondInvite(invite.id, true);
            setBusy(false);
          }}
        >
          Annehmen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void actions.respondInvite(invite.id, false)}>
          Ablehnen
        </Button>
      </div>
    </MotionGlass>
  );
}

function OutgoingCard({ invite }: { invite: LiveInvite }) {
  const left = useSecondsLeft(invite.expiresAt);
  const [barMs] = useState(() => Math.max(0, invite.expiresAt - Date.now()));
  return (
    <MotionGlass
      layout
      className="invite invite--out"
      radius={24}
      bezel={20}
      tone="deep"
      blur={3}
      role="status"
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <div className="invite__head">
        <Avatar name={invite.to.name} src={invite.to.avatar} size={40} />
        <div>
          <p className="invite__title">Warte auf {invite.to.name}</p>
          <p className="invite__sub">Anfrage läuft noch {left} s</p>
        </div>
      </div>
      <div className="invite__bar" style={{ animationDuration: `${barMs}ms` }} />
      <div className="invite__actions">
        <Button size="sm" variant="ghost" onClick={() => actions.cancelInvite()}>
          Zurückziehen
        </Button>
      </div>
    </MotionGlass>
  );
}

/** Match-Anfragen von und an Freunde, oben rechts ueber allem ausser dem Duell. */
export function InviteDock() {
  const invites = useGame((s) => s.invites);
  const outgoing = useGame((s) => s.outgoingInvite);
  const inMatch = useGame((s) => Boolean(s.match));
  // Mitten im Duell nicht stoeren: die Anfrage wartet, laeuft aber weiter ab
  const visible = inMatch ? [] : invites;
  return (
    <div className="invites" aria-live="polite">
      <AnimatePresence initial={false}>
        {visible.map((inv) => (
          <IncomingCard key={inv.id} invite={inv} />
        ))}
        {outgoing && !inMatch && <OutgoingCard key={`out-${outgoing.id}`} invite={outgoing} />}
      </AnimatePresence>
    </div>
  );
}
