import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Glass } from '../glass/Glass';
import { usePrefs } from '../lib/prefs';
import { useRoute } from '../lib/route';
import { useGame, useSession } from '../lib/store';
import { Button } from './Button';

// Rundgang fuer neue Leute: ein Lichtkegel auf die wichtigen Stellen der Startseite, daneben
// eine kleine Glaskarte mit Text und ein geschwungener Pfeil dorthin. Laeuft einmal von selbst,
// danach ueber die Einstellungen ("Rundgang ansehen").

interface Step {
  /** CSS-Selektor des Ziels, ohne Ziel steht die Karte in der Mitte */
  target?: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    title: 'Willkommen bei Opal',
    text: 'Kurzer Rundgang durch die wichtigsten Stellen. Mit den Pfeiltasten geht es vor und zurück, Esc bricht ab.',
  },
  {
    target: '[data-tour="ranked"]',
    title: 'Ranked',
    text: '1 gegen 1 um Punkte, in zwei Modi mit je eigenem Rang: Standard (Auswahl) und Tippen. Nach fünf Spielen steht dein Rang, von Sand bis Prisma. Braucht einen Discord-Login.',
  },
  {
    target: '[data-tour="unranked"]',
    title: 'Unranked',
    text: 'Locker 1 gegen 1 mit deinen eigenen Themen. Keine Punkte, kein Druck.',
  },
  {
    target: '[data-tour="lobby"]',
    title: 'Private Lobby',
    text: 'Spielt zu zweit oder zu acht per Code. Als Host stellst du Schwierigkeit, Zeit, Antworten und mehr ein.',
  },
  {
    target: '[data-tour="training"]',
    title: 'Training',
    text: 'Allein üben: klassisch, Überleben mit drei Leben oder gegen einen Bot in drei Stärken.',
  },
  {
    target: '[data-tour="setup"]',
    title: 'Deine Runde',
    text: 'Antwortmodus, Zahl der Antworten, Schwierigkeit und Themen. Gilt für Unranked, Training und neue Lobbys.',
  },
  {
    target: '.topbar__nav [data-value="themen"]',
    title: 'Themen',
    text: 'Hier wählst du, worüber gefragt wird: Allgemeinwissen, Anime, Games, Filme und mehr. Auch einzelne Bereiche.',
  },
  {
    target: '.topbar__nav [data-value="freunde"]',
    title: 'Freunde',
    text: 'Such Leute über ihren Namen, ihren Discord-Namen oder ihr Kürzel und fordere Freunde direkt zu einem Duell heraus. Das zählt nicht für den Rang.',
  },
  {
    target: '.topbar__nav [data-value="rangliste"]',
    title: 'Rangliste',
    text: 'Ranglisten für Ranked Standard und Tippen, dazu Siege, Spielzeit, Tempo und Überleben. Ein Klick auf einen Namen öffnet das Profil.',
  },
  {
    target: '[data-tour="settings"]',
    title: 'Einstellungen',
    text: 'Farben, Glas und Töne. Ruckelt etwas, stell das Glas auf Aus. Hast du einen starken Rechner, probier Stark.',
  },
];

const GAP = 64; // Abstand zwischen Ziel und Karte, Platz fuer den Pfeil
const EDGE = 16;
const PAD = 8; // Luft um das Ziel im Lichtkegel

type Box = { x: number; y: number; w: number; h: number };
type Layout = {
  spot: Box | null;
  card: { x: number; y: number };
  arrow: string | null;
  side: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'inside';
};

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/** Karte neben das Ziel legen (unten, oben, rechts, links, je nach Platz) und den Pfeil dazu berechnen. */
function computeLayout(target: Element | null, cw: number, ch: number): Layout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), vw - cw - EDGE);
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), vh - ch - EDGE);
  if (!target) return { spot: null, card: { x: (vw - cw) / 2, y: (vh - ch) / 2 }, arrow: null, side: 'center' };

  const s = rectOf(target);
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  // Karte leicht zur Bildschirmmitte versetzt, damit der Pfeil schoen geschwungen ist
  const drift = cx < vw / 2 ? 48 : -48;

  let side: Layout['side'];
  let card: { x: number; y: number };
  if (vh - (s.y + s.h) >= ch + GAP + EDGE) {
    side = 'bottom';
    card = { x: clampX(cx - cw / 2 + drift), y: s.y + s.h + GAP };
  } else if (s.y >= ch + GAP + EDGE) {
    side = 'top';
    card = { x: clampX(cx - cw / 2 + drift), y: s.y - GAP - ch };
  } else if (vw - (s.x + s.w) >= cw + GAP + EDGE) {
    side = 'right';
    card = { x: s.x + s.w + GAP, y: clampY(cy - ch / 2) };
  } else if (s.x >= cw + GAP + EDGE) {
    side = 'left';
    card = { x: s.x - GAP - cw, y: clampY(cy - ch / 2) };
  } else {
    // Ziel groesser als der freie Platz (hohe Karte am Handy): Karte unten ueber das Ziel, ohne Pfeil
    return { spot: s, card: { x: (vw - cw) / 2, y: clampY(vh - ch - 96) }, arrow: null, side: 'inside' };
  }

  // Pfeil: vom Kartenrand zum Ziel, als Bogen (beide Stuetzpunkte zur selben Seite versetzt)
  const bend = cx < vw / 2 ? 44 : -44;
  let from: [number, number];
  let to: [number, number];
  if (side === 'bottom' || side === 'top') {
    const fx = Math.min(Math.max(cx, card.x + 36), card.x + cw - 36);
    from = side === 'bottom' ? [fx, card.y - 8] : [fx, card.y + ch + 8];
    to = side === 'bottom' ? [cx, s.y + s.h + 8] : [cx, s.y - 8];
    const dy = (to[1] - from[1]) * 0.3;
    return {
      spot: s,
      card,
      side,
      arrow: `M ${from[0]} ${from[1]} C ${from[0] + bend} ${from[1] + dy}, ${to[0] + bend} ${to[1] - dy}, ${to[0]} ${to[1]}`,
    };
  }
  const fy = Math.min(Math.max(cy, card.y + 30), card.y + ch - 30);
  from = side === 'right' ? [card.x - 8, fy] : [card.x + cw + 8, fy];
  to = side === 'right' ? [s.x + s.w + 8, cy] : [s.x - 8, cy];
  const dx = (to[0] - from[0]) * 0.3;
  const vbend = cy < vh / 2 ? 20 : -20;
  return {
    spot: s,
    card,
    side,
    arrow: `M ${from[0]} ${from[1]} C ${from[0] + dx} ${from[1] + vbend}, ${to[0] - dx} ${to[1] + vbend}, ${to[0]} ${to[1]}`,
  };
}

export function Tour() {
  const user = useSession((s) => s.user);
  const tourDone = usePrefs((s) => s.tourDone);
  const setPrefs = usePrefs((s) => s.set);
  const route = useRoute();
  const busy = useGame((s) => Boolean(s.match || s.lobby || s.result || s.queue || s.settingsOpen));
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const active = Boolean(user) && !tourDone && route.name === 'spielen' && !busy;

  // Kurz warten, bis die Startseite eingeblendet ist
  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    const t = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(t);
  }, [active]);

  const finish = useCallback(() => {
    setPrefs({ tourDone: true });
    setIndex(0);
    setLayout(null);
  }, [setPrefs]);

  const step = STEPS[index];

  // Position berechnen, Ziel dabei in den sichtbaren Bereich holen
  const measure = useCallback(() => {
    if (!step) return;
    const target = step.target ? document.querySelector(step.target) : null;
    const card = cardRef.current;
    const cw = card?.offsetWidth ?? 340;
    const ch = card?.offsetHeight ?? 180;
    setLayout(computeLayout(target, cw, ch));
  }, [step]);

  useLayoutEffect(() => {
    if (!active || !ready || !step) return;
    const target = step.target ? document.querySelector(step.target) : null;
    if (step.target && !target) {
      // Ziel gibt es gerade nicht (zum Beispiel sehr schmales Fenster): Schritt ueberspringen
      if (index < STEPS.length - 1) setIndex(index + 1);
      else finish();
      return;
    }
    if (target && !target.closest('.topbar')) {
      const r = target.getBoundingClientRect();
      const need = (cardRef.current?.offsetHeight ?? 200) + GAP + EDGE + PAD;
      const needSide = (cardRef.current?.offsetWidth ?? 340) + GAP + EDGE + PAD;
      const vh = window.innerHeight;
      const sideRoom = window.innerWidth - r.right >= needSide || r.left >= needSide;
      if (vh - r.bottom < need && r.top < need && !sideRoom) {
        // Weder darueber noch darunter Platz: Ziel knapp unter die Kopfzeile schieben, dann passt die Karte darunter
        window.scrollBy({ top: r.top - 96, behavior: 'smooth' });
      } else if (r.top < 80 || r.bottom > vh - 80) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    measure();
    const t1 = window.setTimeout(measure, 420);
    const t2 = window.setTimeout(measure, 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active, ready, index, step, measure, finish]);

  useEffect(() => {
    if (!active || !ready) return;
    let frame = 0;
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const ro = new ResizeObserver(onChange);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      ro.disconnect();
    };
  }, [active, ready, measure]);

  const next = useCallback(() => (index < STEPS.length - 1 ? setIndex(index + 1) : finish()), [index, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, ready, next, back, finish]);

  const show = active && ready && Boolean(step);
  const last = index === STEPS.length - 1;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="tour"
          role="dialog"
          aria-modal="true"
          aria-label="Rundgang"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div
            className={`tour__spot${layout?.spot ? '' : ' is-empty'}`}
            style={
              layout?.spot
                ? { left: layout.spot.x, top: layout.spot.y, width: layout.spot.w, height: layout.spot.h }
                : { left: '50%', top: '50%', width: 0, height: 0 }
            }
          />
          <svg className="tour__arrow" aria-hidden="true">
            <defs>
              <marker id="tour-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {layout?.arrow && <path key={index} d={layout.arrow} pathLength={1} markerEnd="url(#tour-head)" />}
          </svg>
          <div
            ref={cardRef}
            className="tour__card-wrap"
            style={{ left: layout?.card.x ?? -9999, top: layout?.card.y ?? -9999, visibility: layout ? 'visible' : 'hidden' }}
          >
            <Glass className="tour__card" radius={24} bezel={20} tone="sheet" blur={4} hero>
              <p className="eyebrow num">
                {index + 1} / {STEPS.length}
              </p>
              <h2 className="tour__title">{step.title}</h2>
              <p className="tour__text">{step.text}</p>
              <div className="tour__actions">
                <Button size="sm" variant="ghost" onClick={finish}>
                  {index === 0 ? 'Überspringen' : 'Beenden'}
                </Button>
                <span className="tour__spacer" />
                {index > 0 && (
                  <Button size="sm" icon={<ArrowLeft size={15} />} onClick={back} aria-label="Zurück" />
                )}
                <Button size="sm" variant="primary" iconRight={last ? undefined : <ArrowRight size={15} />} onClick={next} autoFocus>
                  {index === 0 ? 'Los' : last ? 'Fertig' : 'Weiter'}
                </Button>
              </div>
            </Glass>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
