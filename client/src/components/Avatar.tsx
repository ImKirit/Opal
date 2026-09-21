import { Bot } from 'lucide-react';
import { useState } from 'react';

interface AvatarProps {
  name: string;
  src?: string | null;
  isBot?: boolean;
  size?: number;
  dim?: boolean;
}

function hueFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, src, isBot, size = 40, dim }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, '--av-h': hueFor(name) } as React.CSSProperties;

  return (
    <span className={`avatar${dim ? ' is-dim' : ''}${isBot ? ' avatar--bot' : ''}`} style={style} aria-hidden="true">
      {isBot ? (
        <Bot size={size * 0.52} strokeWidth={1.8} />
      ) : src && !broken ? (
        <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar__initial" style={{ fontSize: size * 0.42 }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}
