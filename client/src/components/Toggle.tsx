import { motion } from 'motion/react';
import { Glass } from '../glass/Glass';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}

const MotionKnob = motion.create(Glass);

export function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle__track${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <MotionKnob
          layout
          className="toggle__knob"
          radius={12}
          bezel={8}
          magnify={1.15}
          blur={0}
          prism={false}
          tone="clear"
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
        />
      </button>
    </label>
  );
}
