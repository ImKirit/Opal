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

export function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const ANSWER_MODE_LABEL = { choice: 'Auswahl', typed: 'Tippen', mixed: 'Gemischt' } as const;

export const KIND_LABEL = {
  solo: 'Training',
  bot: 'Gegen Bot',
  unranked: 'Unranked',
  ranked: 'Ranked',
  private: 'Private Lobby',
} as const;
