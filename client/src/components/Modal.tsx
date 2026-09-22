import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Glass } from '../glass/Glass';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}

const MotionGlass = motion.create(Glass);

export function Modal({ open, onClose, title, width = 560, children }: ModalProps) {
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <MotionGlass
            ref={panel}
            hero
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="modal__panel"
            tone="sheet"
            radius={28}
            blur={9}
            style={{ width: `min(${width}px, 100%)` }}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <header className="modal__head">
              <h2>{title}</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
                <X size={18} />
              </button>
            </header>
            <div className="modal__body">{children}</div>
          </MotionGlass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
