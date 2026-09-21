import { useEffect } from 'react';
import { usePrefs } from './prefs';

/** Schreibt die Farbwahl als CSS-Variablen an <html>. */
export function useThemeVariables() {
  const bgHue = usePrefs((s) => s.bgHue);
  const accentHue = usePrefs((s) => s.accentHue);
  const chroma = usePrefs((s) => s.chroma);
  const ambient = usePrefs((s) => s.ambient);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-h', String(bgHue));
    root.style.setProperty('--accent-h', String(accentHue));
    root.style.setProperty('--chroma', String(chroma));
    root.dataset.ambient = ambient ? 'on' : 'off';
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg-0').trim() || '#08111f');
  }, [bgHue, accentHue, chroma, ambient]);
}
