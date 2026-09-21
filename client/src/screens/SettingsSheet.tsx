import { LogIn } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Segmented } from '../components/Segmented';
import { Toggle } from '../components/Toggle';
import { glassRefractionSupported } from '../glass/Glass';
import type { GlassQuality } from '../glass/registry';
import { api } from '../lib/api';
import { THEMES, usePrefs } from '../lib/prefs';
import { actions, logout, useGame, useSession } from '../lib/store';

export function SettingsSheet() {
  const open = useGame((s) => s.settingsOpen);
  const user = useSession((s) => s.user);
  const discordEnabled = useSession((s) => s.config?.discordEnabled);
  const prefs = usePrefs();

  return (
    <Modal open={open} onClose={() => actions.openSettings(false)} title="Einstellungen" width={600}>
      <section className="settings__block">
        <h3>Farben</h3>
        <div className="swatches" role="radiogroup" aria-label="Farbthema">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={prefs.themeId === t.id}
              className={`swatch${prefs.themeId === t.id ? ' is-active' : ''}`}
              style={{ '--sw-bg': t.bgHue, '--sw-ac': t.accentHue, '--sw-c': t.chroma } as React.CSSProperties}
              onClick={() => prefs.set({ themeId: t.id, bgHue: t.bgHue, accentHue: t.accentHue, chroma: t.chroma })}
            >
              <span className="swatch__dot" />
              {t.name}
            </button>
          ))}
        </div>
        <div className="sliders">
          <label className="slider">
            <span>Hintergrund</span>
            <input
              type="range"
              min={0}
              max={359}
              value={prefs.bgHue}
              className="slider__hue"
              onChange={(e) => prefs.set({ themeId: 'eigen', bgHue: Number(e.target.value), chroma: Math.max(prefs.chroma, 0.6) })}
            />
          </label>
          <label className="slider">
            <span>Akzent</span>
            <input
              type="range"
              min={0}
              max={359}
              value={prefs.accentHue}
              className="slider__hue"
              onChange={(e) => prefs.set({ themeId: 'eigen', accentHue: Number(e.target.value), chroma: Math.max(prefs.chroma, 0.6) })}
            />
          </label>
          <label className="slider">
            <span>Sättigung</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(prefs.chroma * 100)}
              onChange={(e) => prefs.set({ themeId: 'eigen', chroma: Number(e.target.value) / 100 })}
            />
          </label>
        </div>
      </section>

      <section className="settings__block">
        <h3>Glas</h3>
        <Segmented<GlassQuality>
          label="Glasqualität"
          block
          value={glassRefractionSupported ? prefs.glass : 'flat'}
          onChange={(v) => prefs.set({ glass: v })}
          options={[
            { value: 'full', label: 'Prisma', disabled: !glassRefractionSupported },
            { value: 'lite', label: 'Lichtbrechung', disabled: !glassRefractionSupported },
            { value: 'flat', label: 'Schlicht' },
          ]}
        />
        <p className="settings__hint">
          {glassRefractionSupported
            ? 'Prisma bricht das Licht am Rand zusätzlich in Farben auf. Auf schwachen Rechnern ist Schlicht am flüssigsten.'
            : 'Dein Browser kann keine echte Lichtbrechung. In Chrome, Edge oder der Desktop-App siehst du das volle Glas.'}
        </p>
      </section>

      <section className="settings__block">
        <h3>Ton und Bewegung</h3>
        <Toggle checked={prefs.sound} onChange={(v) => prefs.set({ sound: v })} label="Töne" hint="Kurze Klänge bei richtig, falsch und Sieg." />
        <Toggle
          checked={prefs.ambient}
          onChange={(v) => prefs.set({ ambient: v })}
          label="Lebendiger Hintergrund"
          hint="Die Lichter treiben langsam. Kostet etwas Leistung."
        />
      </section>

      {user && (
        <section className="settings__block">
          <h3>Konto</h3>
          <p className="settings__hint">
            Angemeldet als <strong>{user.name}</strong> ({user.guest ? 'Gast' : 'Discord'}).
          </p>
          <div className="settings__row">
            {user.guest && discordEnabled && (
              <Button variant="primary" icon={<LogIn size={16} />} onClick={() => (window.location.href = api.discordUrl())}>
                Mit Discord verbinden
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                actions.openSettings(false);
                void logout();
              }}
            >
              Abmelden
            </Button>
          </div>
          {user.guest && discordEnabled && (
            <p className="settings__hint">Deine Statistiken als Gast wandern beim Verbinden mit in dein Discord-Konto.</p>
          )}
        </section>
      )}
    </Modal>
  );
}
