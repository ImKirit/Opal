import { useSession } from './store';
import type { LadderInfo, Rank, User } from './types';

// Ranked-Modi (Standard, Tippen, spaeter mehr) kommen vom Server (/api/config), damit ein
// neuer Modus nur dort eingetragen werden muss.

export const FRESH_RANK: Rank = { rating: 1000, peak: 1000, games: 0, wins: 0 };

export function rankIn(user: Pick<User, 'ranks'> | null | undefined, ladder: string): Rank {
  return user?.ranks?.[ladder] ?? FRESH_RANK;
}

const EMPTY: LadderInfo[] = [];

export function useLadders(): LadderInfo[] {
  return useSession((s) => s.config?.ladders ?? EMPTY);
}

export function ladderName(ladders: LadderInfo[], id: string | null | undefined): string {
  if (!id) return '';
  return ladders.find((l) => l.id === id)?.name ?? id;
}
