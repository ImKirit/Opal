// Rangstufen im Ranked. Glas entsteht aus Sand, daher die Reihenfolge.

export interface Tier {
  id: string;
  name: string;
  min: number;
  /** Farben fuer den Edelstein im Abzeichen */
  light: string;
  dark: string;
}

export const TIERS: Tier[] = [
  { id: 'sand', name: 'Sand', min: 0, light: '#f1dfb8', dark: '#a8875a' },
  { id: 'quarz', name: 'Quarz', min: 900, light: '#ffe3ef', dark: '#c88aa6' },
  { id: 'kristall', name: 'Kristall', min: 1100, light: '#dffbff', dark: '#6cc6d6' },
  { id: 'saphir', name: 'Saphir', min: 1300, light: '#b9d4ff', dark: '#2f5fd0' },
  { id: 'diamant', name: 'Diamant', min: 1500, light: '#ffffff', dark: '#9fb8d8' },
  { id: 'prisma', name: 'Prisma', min: 1700, light: '#fff6c9', dark: '#9b6cff' },
];

export const PLACEMENT_GAMES = 5;

export function tierFor(rating: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) if (rating >= t.min) tier = t;
  return tier;
}

export function nextTier(rating: number): Tier | null {
  return TIERS.find((t) => t.min > rating) ?? null;
}
