import { Button } from '../components/Button';
import { BundleBar, PackPicker, selectionSummary } from '../components/PackPicker';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/store';

export function Packs() {
  const packs = useSession((s) => s.packs);
  const sections = usePrefs((s) => s.sections) ?? [];
  const set = usePrefs((s) => s.set);
  const summary = selectionSummary(packs, sections);
  const allKeys = packs.flatMap((p) => p.sections.map((s) => s.key));
  const generalKeys = packs.find((p) => p.id === 'allgemein')?.sections.map((s) => s.key) ?? [];

  return (
    <main className="page packs">
      <header className="page-head">
        <div>
          <p className="eyebrow">Themen</p>
          <h1>Was soll gefragt werden?</h1>
          <p className="page-head__lead">
            Nimm ein fertiges Themenpaket, schalte ganze Themen an oder nur die Bereiche, die du wirklich kennst. Im Unranked
            spielst du die Schnittmenge mit deinem Gegner.
          </p>
        </div>
        <div className="packs__summary">
          <span className="packs__count num">{summary.questions}</span>
          <span className="muted">Fragen aktiv</span>
          <div className="packs__quick">
            <Button size="sm" onClick={() => set({ sections: generalKeys })}>
              Nur Allgemein
            </Button>
            <Button size="sm" onClick={() => set({ sections: allKeys })}>
              Alles
            </Button>
            <Button size="sm" variant="ghost" onClick={() => set({ sections: [] })}>
              Keins
            </Button>
          </div>
        </div>
      </header>
      <h2 className="packs__heading">Themenpakete</h2>
      <BundleBar value={sections} onChange={(keys) => set({ sections: keys })} />
      <h2 className="packs__heading">Einzelne Themen</h2>
      <PackPicker value={sections} onChange={(keys) => set({ sections: keys })} />
    </main>
  );
}
