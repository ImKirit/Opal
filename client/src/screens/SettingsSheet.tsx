import { LogIn } from 'lucide-react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Segmented } from '../components/Segmented';
import { Toggle } from '../components/Toggle';
import { glassRefractionSupported } from '../glass/Glass';
import { api } from '../lib/api';
import { THEMES, usePrefs, type GlassLevel } from '../lib/prefs';
import { navigate } from '../lib/route';
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
        <Segmented<GlassLevel>
          label="Glasstufe"
          block
          value={glassRefractionSupported ? prefs.glass : 'off'}
          onChange={(v) => prefs.set({ glass: v })}
          options={[
            { value: 'light', label: 'Leicht', disabled: !glassRefractionSupported },
            { value: 'strong', label: 'Stark', disabled: !glassRefractionSupported },
            { value: 'off', label: 'Aus' },
          ]}
        />
        <p className="settings__hint">
          {!glassRefractionSupported
            ? 'Dein Browser kann keine echte Lichtbrechung. In Chrome, Edge oder der Desktop-App siehst du das volle Glas.'
            : prefs.glass === 'strong'
              ? 'Stark: echtes Liquid Glass auf jeder Fläche, mit Farbsaum am Rand. Sieht am besten aus, braucht aber einen kräftigen Rechner.'
              : prefs.glass === 'off'
                ? 'Aus: mattes Glas ohne Lichtbrechung. Am flüssigsten.'
                : 'Leicht (Standard): Lichtbrechung auf Fragen, Antworten und Fenstern, der Rest bleibt mattes Glas. Flüssig auch auf schwächeren Rechnern.'}
        </p>
      </section>

      <section className="settings__block">
        <h3>Hilfe</h3>
        <div className="settings__row">
          <Button
            size="sm"
            onClick={() => {
              prefs.set({ tourDone: false });
              actions.openSettings(false);
              navigate('spielen');
            }}
          >
            Rundgang ansehen
          </Button>
        </div>
        <p className="settings__hint">Zeigt noch einmal mit Pfeilen, wo Ranked, Training, Themen, Freunde und die Rangliste sind.</p>
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
