import { useId } from 'react';

/**
 * Ein geschliffener Opal: Grundton aus der Akzentfarbe (folgt dem Farbthema), darin das
 * typische Farbenspiel in Rosa, Mint und Violett, oben links ein Glanzlicht.
 */
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = useId();
  const stone = 'rotate(-18 20 20.5)';
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#f3f9ff" />
          <stop offset="0.45" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-deep)" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <ellipse cx="20" cy="20.5" rx="16" ry="13" transform={stone} />
        </clipPath>
        <filter id={`${id}f`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.7" />
        </filter>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="40" height="40" fill={`url(#${id}b)`} />
        <g filter={`url(#${id}f)`} opacity="0.85">
          <ellipse cx="27" cy="25" rx="6.5" ry="3.6" fill="#ff9fd8" transform="rotate(-30 27 25)" />
          <ellipse cx="13.5" cy="26" rx="5.5" ry="3.2" fill="#8ef2d2" />
          <ellipse cx="26" cy="13" rx="4.8" ry="2.6" fill="#b7a2ff" />
        </g>
        <ellipse cx="14" cy="13.5" rx="5.2" ry="2.5" fill="#fff" opacity="0.78" transform="rotate(-24 14 13.5)" />
      </g>
      <ellipse cx="20" cy="20.5" rx="16" ry="13" transform={stone} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo__word">Opal</span>
    </span>
  );
}
