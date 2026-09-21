import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GlassQuality } from '../glass/registry';
import type { AnswerMode, BotDifficulty } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  bgHue: number;
  accentHue: number;
  chroma: number;
}

// Farbthemen: je ein Farbton fuer den Hintergrund und einer fuer die Akzente.
// Alle Farben leiten sich per OKLCH daraus ab (siehe styles/tokens.css).
export const THEMES: ThemePreset[] = [
  { id: 'tiefsee', name: 'Tiefsee', bgHue: 250, accentHue: 232, chroma: 1 },
  { id: 'mitternacht', name: 'Mitternacht', bgHue: 275, accentHue: 262, chroma: 1 },
  { id: 'lagune', name: 'Lagune', bgHue: 215, accentHue: 190, chroma: 1 },
  { id: 'amethyst', name: 'Amethyst', bgHue: 300, accentHue: 310, chroma: 1 },
  { id: 'rose', name: 'Rosé', bgHue: 350, accentHue: 358, chroma: 0.9 },
  { id: 'glut', name: 'Glut', bgHue: 40, accentHue: 65, chroma: 0.85 },
  { id: 'graphit', name: 'Graphit', bgHue: 250, accentHue: 235, chroma: 0.18 },
];

export type TrainingMode = 'classic' | 'survival' | 'bot';

export interface PrefsState {
  themeId: string;
  bgHue: number;
  accentHue: number;
  chroma: number;
  glass: GlassQuality;
  sound: boolean;
  ambient: boolean;
  /** null = noch nie gewaehlt, dann gilt das Allgemein-Paket */
  sections: string[] | null;
  answerMode: AnswerMode;
  trainingMode: TrainingMode;
  soloCount: number;
  bot: BotDifficulty;
  set: (patch: Partial<Omit<PrefsState, 'set'>>) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      themeId: 'tiefsee',
      bgHue: THEMES[0].bgHue,
      accentHue: THEMES[0].accentHue,
      chroma: THEMES[0].chroma,
      glass: 'full',
      sound: true,
      ambient: false,
      sections: null,
      answerMode: 'choice',
      trainingMode: 'classic',
      soloCount: 10,
      bot: 'mittel',
      set: (patch) => set(patch),
    }),
    {
      name: 'opal.prefs',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          localStorage.setItem('opal.probe', '1');
          localStorage.removeItem('opal.probe');
          return localStorage;
        } catch {
          // Privater Modus oder gesperrter Speicher: Einstellungen gelten nur fuer diese Sitzung
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
    },
  ),
);
