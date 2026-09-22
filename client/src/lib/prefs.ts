import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AnswerMode, BotDifficulty, Difficulty, OptionCount } from './types';

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

/**
 * Glasstufe. Leicht: echte Lichtbrechung nur auf den wichtigen Flaechen (Kopfzeile, Fragekarte,
 * Antworten, Fenster), der Rest ist mattes Glas. Stark: Lichtbrechung plus Farbsaum ueberall.
 */
export type GlassLevel = 'light' | 'strong' | 'off';

export interface PrefsState {
  themeId: string;
  bgHue: number;
  accentHue: number;
  chroma: number;
  glass: GlassLevel;
  sound: boolean;
  ambient: boolean;
  /** null = noch nie gewaehlt, dann gilt das Allgemein-Paket */
  sections: string[] | null;
  answerMode: AnswerMode;
  difficulty: Difficulty;
  optionCount: OptionCount;
  trainingMode: TrainingMode;
  soloCount: number;
  bot: BotDifficulty;
  /** Rundgang schon gesehen (oder uebersprungen) */
  tourDone: boolean;
  set: (patch: Partial<Omit<PrefsState, 'set'>>) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      themeId: 'tiefsee',
      bgHue: THEMES[0].bgHue,
      accentHue: THEMES[0].accentHue,
      chroma: THEMES[0].chroma,
      glass: 'light',
      sound: true,
      ambient: false,
      sections: null,
      answerMode: 'choice',
      difficulty: 'gemischt',
      optionCount: 3,
      trainingMode: 'classic',
      soloCount: 10,
      bot: 'mittel',
      tourDone: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'opal.prefs',
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        // Version 1 kannte full, lite und flat. Alle starten mit der neuen leichten Stufe,
        // wer vorher Schlicht hatte, behaelt Aus.
        if (version < 2) state.glass = state.glass === 'flat' ? 'off' : 'light';
        return state as unknown as PrefsState;
      },
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
