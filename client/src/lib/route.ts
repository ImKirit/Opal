import { useSyncExternalStore } from 'react';

// Hash-Routing (#/themen): funktioniert auf jedem Server-Pfad und spaeter auch in Electron.

export type RouteName = 'spielen' | 'themen' | 'freunde' | 'rangliste' | 'profil';

export interface Route {
  name: RouteName;
  param: string | null;
}

const NAMES: RouteName[] = ['spielen', 'themen', 'freunde', 'rangliste', 'profil'];
/** Alte Adressen, die weiter funktionieren sollen ("Pakete" heisst jetzt "Themen") */
const ALIASES: Record<string, RouteName> = { pakete: 'themen' };

function parse(hash: string): Route {
  const [raw, second] = hash.replace(/^#\/?/, '').split('/');
  const first = ALIASES[raw] ?? raw;
  const name = (NAMES as string[]).includes(first) ? (first as RouteName) : 'spielen';
  return { name, param: second ? decodeURIComponent(second) : null };
}

let current = parse(window.location.hash);
const listeners = new Set<() => void>();

window.addEventListener('hashchange', () => {
  current = parse(window.location.hash);
  for (const l of listeners) l();
});

export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export function navigate(name: RouteName, param?: string | null) {
  window.location.hash = param ? `/${name}/${encodeURIComponent(param)}` : `/${name}`;
}
