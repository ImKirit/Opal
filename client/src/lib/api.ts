import type { AppConfig, LeaderboardEntry, Pack, Profile, Stats, User } from './types';

// Leer = gleicher Server wie die Seite. Fuer eine spaetere Desktop-Version mit
// eingebautem Client kann hier per VITE_SERVER_URL ein fester Server stehen.
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

// Pfad-Praefix aus dem Build (vite --base), live "/opal", lokal leer
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, '');
const ROOT = `${SERVER_URL}${BASE_PATH}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ROOT}${path}`, {
    credentials: SERVER_URL ? 'include' : 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Der Server antwortet nicht (${res.status}).`);
  return data as T;
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  me: () => request<{ user: User | null; stats?: Stats }>('/api/me'),
  packs: () => request<{ packs: Pack[] }>('/api/packs'),
  leaderboard: () => request<{ entries: LeaderboardEntry[] }>('/api/leaderboard'),
  profile: (id: string) => request<Profile>(`/api/users/${encodeURIComponent(id)}`),
  guest: (name: string) => request<{ ok: true }>('/auth/guest', { method: 'POST', body: JSON.stringify({ name }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  discordUrl: () => `${ROOT}/auth/discord`,
};
