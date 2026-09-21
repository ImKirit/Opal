import { useRef } from 'react';

/**
 * Haelt den letzten Wert fest, der nicht null war. Screens werden beim Wechsel noch kurz
 * ausgeblendet, obwohl ihre Daten (Spiel, Lobby, Ergebnis) im Store schon weg sind.
 */
export function useSticky<T>(value: T | null): T | null {
  const last = useRef<T | null>(value);
  if (value != null) last.current = value;
  return last.current;
}
