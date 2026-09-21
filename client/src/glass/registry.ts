import { glassMap } from './displacement';

// Verwaltet die SVG-Filter aller Glasflaechen. Flaechen mit gleicher Groesse und Form
// teilen sich einen Filter (zum Beispiel die drei Antwortknoepfe im Duell).

export type GlassQuality = 'full' | 'lite' | 'flat';

export interface FilterSpec {
  w: number;
  h: number;
  radius: number;
  bezel: number;
  magnify: number;
  refraction: number;
  blur: number;
  quality: GlassQuality;
}

export interface FilterDef {
  id: string;
  key: string;
  w: number;
  h: number;
  url: string;
  scale: number;
  blur: number;
  dispersion: boolean;
  saturate: number;
}

type Entry = FilterDef & { refs: number; dropTimer: number | null };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: FilterDef[] = [];
let counter = 0;
let scheduled = false;

function publish() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    snapshot = [...entries.values()].map(({ refs: _r, dropTimer: _d, ...def }) => def);
    for (const l of listeners) l();
  });
}

export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const getSnapshot = () => snapshot;

export function specKey(s: FilterSpec) {
  return [s.w, s.h, s.radius, s.bezel, s.magnify, s.refraction, s.blur, s.quality].join('|');
}

/** Holt (oder baut) den Filter fuer eine Flaeche und gibt seine ID zurueck. */
export function acquire(spec: FilterSpec): string | null {
  if (spec.quality === 'flat' || spec.w < 4 || spec.h < 4) return null;
  const key = specKey(spec);
  const existing = entries.get(key);
  if (existing) {
    existing.refs += 1;
    if (existing.dropTimer) {
      clearTimeout(existing.dropTimer);
      existing.dropTimer = null;
    }
    return existing.id;
  }
  const map = glassMap({ w: spec.w, h: spec.h, radius: spec.radius, bezel: spec.bezel, magnify: spec.magnify });
  if (!map.url) return null;
  counter += 1;
  const entry: Entry = {
    id: `lg${counter}`,
    key,
    w: spec.w,
    h: spec.h,
    url: map.url,
    // feDisplacementMap verschiebt um scale * (Wert - 0.5), daher das Doppelte der Pixel
    scale: +(map.maxShift * 2 * spec.refraction).toFixed(2),
    blur: spec.blur,
    dispersion: spec.quality === 'full',
    saturate: 1.45,
    refs: 1,
    dropTimer: null,
  };
  entries.set(key, entry);
  publish();
  return entry.id;
}

export function release(spec: FilterSpec) {
  const key = specKey(spec);
  const entry = entries.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  // Kurz aufheben: beim Wechseln zwischen Screens wird derselbe Filter oft gleich wieder gebraucht
  entry.dropTimer = window.setTimeout(() => {
    if (entry.refs <= 0) {
      entries.delete(key);
      publish();
    }
  }, 4000);
}
