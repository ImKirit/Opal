export function seconds(ms: number | null | undefined, digits = 2) {
  if (ms == null) return '-';
  return `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
}

export function percent(value: number | null | undefined) {
  if (value == null) return '-';
  return `${Math.round(value * 100)} %`;
}

export function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export function ago(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/** Spielzeit lesbar: "3 Std. 12 Min.", "12 Min.", "45 s" */
export function duration(ms: number | null | undefined) {
  if (!ms || ms < 0) return '0 Min.';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min} Min.`;
  return min ? `${h} Std. ${min} Min.` : `${h} Std.`;
}

export function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const ANSWER_MODE_LABEL = { choice: 'Auswahl', typed: 'Tippen', mixed: 'Gemischt' } as const;

export const DIFFICULTY_LABEL = { gemischt: 'Gemischt', leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' } as const;

/** Muss zu TIME_LIMITS in server/src/game/settings.js passen */
export const TIME_LIMIT_LABEL = {
  kurz: 'Kurz (10 s, Tippen 18 s)',
  normal: 'Normal (15 s, Tippen 25 s)',
  lang: 'Lang (22 s, Tippen 35 s)',
} as const;

export const CONTINUE_MODE_LABEL = { button: 'Weiter-Knopf', auto: 'Automatisch' } as const;

export const KIND_LABEL = {
  solo: 'Training',
  bot: 'Gegen Bot',
  unranked: 'Unranked',
  ranked: 'Ranked',
  private: 'Private Lobby',
} as const;
