import { useSyncExternalStore } from 'react';

// Hash-Routing (#/pakete): funktioniert auf jedem Server-Pfad und spaeter auch in Electron.

export type RouteName = 'spielen' | 'pakete' | 'rangliste' | 'profil';

export interface Route {
  name: RouteName;
  param: string | null;
}

const NAMES: RouteName[] = ['spielen', 'pakete', 'rangliste', 'profil'];

function parse(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/');
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
