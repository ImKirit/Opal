import { Bot } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Goo } from '../components/Goo';
import { Glass } from '../glass/Glass';
import { ANSWER_MODE_LABEL, clock } from '../lib/format';
import { ladderName, useLadders } from '../lib/ladders';
import { actions, useGame } from '../lib/store';

const MotionGlass = motion.create(Glass);

export function QueueOverlay() {
  const queue = useGame((s) => s.queue);
  const found = useGame((s) => s.found);
  const ladders = useLadders();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!queue) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [queue]);

  const waited = queue ? Math.max(0, now - queue.since) : 0;

  return (
    <AnimatePresence>
      {queue && (
        <motion.div className="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <MotionGlass
            hero
            className="queue__card"
            radius={34}
            bezel={28}
            tone="deep"
            blur={3}
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <Goo size={132} />
            <p className="eyebrow">
              {queue.kind === 'ranked'
                ? `Ranked ${ladderName(ladders, queue.ladder)}`.trim()
                : `Unranked · ${ANSWER_MODE_LABEL[queue.answerMode]}`}
            </p>
            <h2>{found ? 'Gegner gefunden' : 'Suche Gegner'}</h2>
            <p className="queue__time num">{clock(waited)}</p>
            <p className="muted">
              {queue.waiting > 1 ? `${queue.waiting} Leute warten gerade` : 'Außer dir wartet gerade niemand.'}
            </p>
            <div className="queue__actions">
              {queue.kind === 'unranked' && waited > 8000 && !found && (
                <Button icon={<Bot size={16} />} onClick={() => void actions.queueBot()}>
                  Stattdessen gegen einen Bot
                </Button>
              )}
              <Button variant="ghost" onClick={() => void actions.leaveQueue()} disabled={found}>
                Abbrechen
              </Button>
            </div>
          </MotionGlass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
