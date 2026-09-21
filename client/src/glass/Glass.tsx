import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { usePrefs } from '../lib/prefs';
import { acquire, release, type FilterSpec, type GlassQuality } from './registry';

export type GlassTone = 'clear' | 'panel' | 'deep' | 'sheet' | 'accent';

type GlassProps = {
  as?: ElementType;
  radius?: number;
  bezel?: number;
  refraction?: number;
  blur?: number;
  magnify?: number;
  tone?: GlassTone;
  /** Lichtreflex folgt dem Zeiger (fuer klickbare Flaechen) */
  interactive?: boolean;
  /** Prisma-Farbaufspaltung am Rand. Fuer lange Listen aus, das spart Rechenzeit. */
  prism?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, 'style' | 'className' | 'children'> &
  Record<string, unknown>;

// Nur Chromium (Chrome, Edge, Electron, Opera) kann SVG-Filter als backdrop-filter.
// Alle anderen bekommen automatisch die schlichte Variante.
const refractionSupported = (() => {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.some((b) => /Chromium/i.test(b.brand))) return true;
  return /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent);
})();

export const glassRefractionSupported = refractionSupported;

function roundSize(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

export function Glass({
  as: Tag = 'div',
  radius = 24,
  bezel,
  refraction = 1,
  blur = 1.5,
  magnify = 1,
  tone = 'panel',
  interactive = false,
  prism = true,
  className = '',
  style,
  children,
  ref: externalRef,
  onPointerMove,
  ...rest
}: GlassProps) {
  const innerRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const prefQuality = usePrefs((s) => s.glass);
  const quality: GlassQuality = !refractionSupported ? 'flat' : prefQuality === 'full' && !prism ? 'lite' : prefQuality;
  const [filterId, setFilterId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = (w: number, h: number) =>
      setSize((prev) => {
        const next = { w: roundSize(w), h: roundSize(h) };
        return prev && prev.w === next.w && prev.h === next.h ? prev : next;
      });
    const rect = el.getBoundingClientRect();
    measure(el.offsetWidth || rect.width, el.offsetHeight || rect.height);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].borderBoxSize?.[0];
      if (box) measure(box.inlineSize, box.blockSize);
      else measure(el.offsetWidth, el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!size) return;
    const spec: FilterSpec = {
      w: size.w,
      h: size.h,
      radius,
      bezel: bezel ?? Math.min(radius, 26),
      magnify,
      refraction,
      blur,
      quality,
    };
    const id = acquire(spec);
    setFilterId(id);
    return () => release(spec);
  }, [size, radius, bezel, magnify, refraction, blur, quality]);

  // Stabil halten: eine neue Ref-Funktion pro Render wuerde motion das Element bei jedem
  // Render ab- und wieder anhaengen lassen, laufende Animationen brechen dann ab.
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      innerRef.current = el;
      if (typeof externalRef === 'function') externalRef(el);
      else if (externalRef && typeof externalRef === 'object') (externalRef as { current: HTMLElement | null }).current = el;
    },
    [externalRef],
  );

  const handleMove = (e: PointerEvent<HTMLElement>) => {
    if (interactive) {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    }
    (onPointerMove as ((e: PointerEvent<HTMLElement>) => void) | undefined)?.(e);
  };

  // Ohne Filter: normale Unschaerfe. Linsen (blur 0) bleiben dann klar, sonst verschwimmt die Schrift darunter.
  const backdrop = filterId ? `url(#${filterId})` : blur > 0 ? `blur(${Math.max(6, blur * 6)}px) saturate(1.6)` : 'none';

  return (
    <Tag
      ref={setRef}
      className={`glass glass--${tone}${interactive ? ' glass--interactive' : ''}${filterId ? ' glass--refract' : ''} ${className}`}
      style={{ '--r': `${radius}px`, backdropFilter: backdrop, WebkitBackdropFilter: backdrop, ...style } as CSSProperties}
      onPointerMove={interactive || onPointerMove ? handleMove : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
