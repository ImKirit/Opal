/** Fluessige Tropfen, die ineinanderlaufen: Wartezeichen fuer die Gegnersuche. */
export function Goo({ size = 120 }: { size?: number }) {
  return (
    <svg className="goo" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <filter id="goo-f">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
          <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
        <linearGradient id="goo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-deep)" />
        </linearGradient>
      </defs>
      <g filter="url(#goo-f)" fill="url(#goo-g)">
        <circle className="goo__core" cx="60" cy="60" r="18" />
        <circle className="goo__orb goo__orb--1" cx="60" cy="60" r="11" />
        <circle className="goo__orb goo__orb--2" cx="60" cy="60" r="9" />
        <circle className="goo__orb goo__orb--3" cx="60" cy="60" r="7" />
      </g>
    </svg>
  );
}
