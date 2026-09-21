import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Glass } from '../glass/Glass';

type Variant = 'primary' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const RADIUS: Record<Size, number> = { sm: 12, md: 15, lg: 19 };

export function Button({
  variant = 'glass',
  size = 'md',
  icon,
  iconRight,
  block,
  loading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = `btn btn--${variant} btn--${size}${block ? ' btn--block' : ''}${loading ? ' is-loading' : ''} ${className}`;
  const content = (
    <>
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      {children != null && <span className="btn__label">{children}</span>}
      {iconRight}
    </>
  );

  if (variant === 'ghost') {
    return (
      <button type={type} className={classes} disabled={disabled || loading} {...rest}>
        {content}
      </button>
    );
  }

  return (
    <Glass
      as="button"
      type={type}
      interactive
      radius={RADIUS[size]}
      bezel={size === 'lg' ? 14 : 10}
      blur={variant === 'primary' ? 0.5 : 1}
      tone={variant === 'primary' ? 'accent' : 'panel'}
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {content}
    </Glass>
  );
}
