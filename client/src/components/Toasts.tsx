import { AnimatePresence, motion } from 'motion/react';
import { Glass } from '../glass/Glass';
import { useGame } from '../lib/store';

const MotionGlass = motion.create(Glass);

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <MotionGlass
            key={t.id}
            layout
            className={`toast toast--${t.tone}`}
            radius={16}
            tone="deep"
            blur={3}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {t.text}
          </MotionGlass>
        ))}
      </AnimatePresence>
    </div>
  );
}
