import { Check, Minus } from 'lucide-react';
import { Glass } from '../glass/Glass';
import { useSession } from '../lib/store';
import type { Pack } from '../lib/types';
import { PackIcon } from './PackIcon';

interface PackPickerProps {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}

export function selectionSummary(packs: Pack[], keys: string[]) {
  const set = new Set(keys);
  let questions = 0;
  const parts: { pack: Pack; active: number }[] = [];
  for (const pack of packs) {
    const active = pack.sections.filter((s) => set.has(s.key));
    questions += active.reduce((n, s) => n + s.count, 0);
    if (active.length) parts.push({ pack, active: active.length });
  }
  return { questions, parts };
}

/** Themenpakete: ein Klick waehlt genau diese Bereiche, feinjustiert wird darunter im PackPicker. */
export function BundleBar({ value, onChange, disabled }: PackPickerProps) {
  const bundles = useSession((s) => s.bundles);
  const packs = useSession((s) => s.packs);
  if (!bundles.length) return null;
  const selected = new Set(value);
  const counts = new Map(packs.flatMap((p) => p.sections.map((s) => [s.key, s.count] as const)));

  return (
    <div className="bundles">
      {bundles.map((bundle) => {
        const on = bundle.sections.length === selected.size && bundle.sections.every((k) => selected.has(k));
        const questions = bundle.sections.reduce((n, k) => n + (counts.get(k) ?? 0), 0);
        return (
          <Glass
            key={bundle.id}
            as="button"
            type="button"
            interactive
            className={`bundle${on ? ' is-on' : ''}`}
            radius={18}
            tone={on ? 'panel' : 'deep'}
            blur={2}
            prism={false}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(bundle.sections)}
            style={{ '--pk-h': bundle.hue } as React.CSSProperties}
          >
            <PackIcon icon={bundle.icon} hue={bundle.hue} size={38} />
            <span className="bundle__text">
              <span className="bundle__name">{bundle.name}</span>
              <span className="bundle__desc">{bundle.desc}</span>
              <span className="bundle__meta num">{questions} Fragen</span>
            </span>
            {on && (
              <span className="check check--all" aria-hidden="true">
                <Check size={15} strokeWidth={3} />
              </span>
            )}
          </Glass>
        );
      })}
    </div>
  );
}

/** Paketauswahl: ganze Pakete an/aus, darunter einzelne Bereiche. */
export function PackPicker({ value, onChange, disabled }: PackPickerProps) {
  const packs = useSession((s) => s.packs);
  const selected = new Set(value);

  const setPack = (pack: Pack, on: boolean) => {
    const next = new Set(selected);
    for (const s of pack.sections) (on ? next.add(s.key) : next.delete(s.key));
    onChange([...next]);
  };

  const toggleSection = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div className="picker">
      {packs.map((pack) => {
        const active = pack.sections.filter((s) => selected.has(s.key)).length;
        const state = active === 0 ? 'none' : active === pack.sections.length ? 'all' : 'some';
        const total = pack.sections.reduce((n, s) => n + s.count, 0);
        return (
          <Glass
            key={pack.id}
            className={`pack pack--${state}`}
            radius={22}
            tone={state === 'none' ? 'deep' : 'panel'}
            blur={2}
            prism={false}
            style={{ '--pk-h': pack.hue } as React.CSSProperties}
          >
            <button
              type="button"
              className="pack__head"
              disabled={disabled}
              aria-pressed={state === 'all'}
              onClick={() => setPack(pack, state !== 'all')}
            >
              <PackIcon icon={pack.icon} hue={pack.hue} size={44} />
              <span className="pack__title">
                <span className="pack__name">{pack.name}</span>
                <span className="pack__meta num">
                  {total} Fragen
                  {pack.sections.length > 1 && ` · ${active} von ${pack.sections.length} Bereichen`}
                </span>
              </span>
              <span className={`check check--${state}`} aria-hidden="true">
                {state === 'all' && <Check size={15} strokeWidth={3} />}
                {state === 'some' && <Minus size={15} strokeWidth={3} />}
              </span>
            </button>
            <p className="pack__desc">{pack.desc}</p>
            {pack.sections.length > 1 && (
              <div className="pack__sections">
                {pack.sections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={disabled}
                    className={`chip${selected.has(s.key) ? ' is-on' : ''}`}
                    aria-pressed={selected.has(s.key)}
                    onClick={() => toggleSection(s.key)}
                  >
                    {s.name}
                    <span className="chip__count num">{s.count}</span>
                  </button>
                ))}
              </div>
            )}
          </Glass>
        );
      })}
    </div>
  );
}
