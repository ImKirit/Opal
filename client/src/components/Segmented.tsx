import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { Glass } from '../glass/Glass';
import { sound } from '../lib/sound';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  block?: boolean;
  className?: string;
}

const MotionLens = motion.create(Glass);

/**
 * Umschalter mit gleitender Glaslinse. Die Linse liegt ueber der aktiven Option, zeigt deren
 * Beschriftung leicht vergroessert und gleitet beim Wechsel mit Federung hinueber.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  block,
  className = '',
}: SegmentedProps<T>) {
  const id = useId();
  const height = size === 'sm' ? 34 : 42;

  return (
    <Glass
      radius={height / 2 + 4}
      bezel={10}
      tone="deep"
      blur={2}
      className={`seg seg--${size}${block ? ' seg--block' : ''} ${className}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            disabled={o.disabled}
            className={`seg__opt${active ? ' is-active' : ''}`}
            data-value={o.value}
            style={{ height }}
            onClick={() => {
              if (active) return;
              sound.click();
              onChange(o.value);
            }}
          >
            <span className="seg__label">
              {o.icon}
              <span>{o.label}</span>
            </span>
            {active && (
              // Die Linse traegt ihre eigene, leicht vergroesserte Beschriftung. Echte Lupen-Brechung
              // ueber verschachteltem Glas zeigt in Chrome Original und Abbild doppelt.
              <MotionLens
                layoutId={`lens${id}`}
                className="seg__lens"
                radius={height / 2}
                bezel={9}
                blur={0}
                prism={false}
                hero
                tone="clear"
                transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.9 }}
                aria-hidden="true"
              >
                <motion.span layout className="seg__lens-label">
                  {o.icon}
                  <span>{o.label}</span>
                </motion.span>
              </MotionLens>
            )}
          </button>
        );
      })}
    </Glass>
  );
}
