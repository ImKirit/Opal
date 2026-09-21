import { ArrowRight, Check, LogIn, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { LogoMark } from '../components/Logo';
import { Glass } from '../glass/Glass';
import { api } from '../lib/api';
import { loginAsGuest, useSession } from '../lib/store';

const SAMPLES = [
  {
    q: 'Wie heißt die Angst vor langen Wörtern?',
    options: ['Glossophobie', 'Hippopotomonstrosesquippedaliophobie', 'Onomatophobie'],
    correct: 1,
    fact: 'Ironischerweise ist das Wort selbst einer der längsten Phobie-Namen überhaupt.',
    pack: 'Allgemein · Wörter & Sprache',
  },
  {
    q: 'Welches Tier hinterlässt würfelförmigen Kot?',
    options: ['Wombat', 'Koala', 'Faultier'],
    correct: 0,
    fact: 'Vermutlich, damit die Würfel als Reviermarkierung nicht wegrollen.',
    pack: 'Allgemein · Tiere',
  },
  {
    q: 'Welche Stadt in Südfrankreich gilt als Welthauptstadt des Parfüms?',
    options: ['Nizza', 'Cannes', 'Grasse'],
    correct: 2,
    fact: 'Rund um Grasse werden bis heute Jasmin und Rosen für Parfüm angebaut.',
    pack: 'Parfüm & Mode · Parfüm',
  },
];

const LOGIN_MESSAGES: Record<string, string> = {
  'discord-off': 'Der Discord-Login ist auf diesem Server noch nicht eingerichtet.',
  abgebrochen: 'Der Discord-Login wurde abgebrochen.',
  fehler: 'Der Discord-Login hat nicht geklappt. Versuch es noch einmal.',
};

function DemoQuestion() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const sample = SAMPLES[i];

  return (
    <Glass className="demo" radius={32} bezel={28} tone="panel" blur={2}>
      <div className="demo__meta">
        <span className="eyebrow">Beispielfrage</span>
        <span className="demo__pack">{sample.pack}</span>
      </div>
      <motion.h2 key={sample.q} className="demo__q" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {sample.q}
      </motion.h2>
      <div className="demo__options">
        {sample.options.map((opt, idx) => {
          const state =
            picked == null ? '' : idx === sample.correct ? ' is-correct' : idx === picked ? ' is-wrong' : ' is-dim';
          return (
            <Glass
              key={opt}
              as="button"
              type="button"
              interactive
              radius={18}
              bezel={14}
              tone="panel"
              className={`answer${state}`}
              disabled={picked != null}
              onClick={() => setPicked(idx)}
            >
              <span className="answer__key">{idx + 1}</span>
              <span className="answer__text">{opt}</span>
              {picked != null && idx === sample.correct && <Check size={18} className="answer__mark" />}
              {picked === idx && idx !== sample.correct && <X size={18} className="answer__mark" />}
            </Glass>
          );
        })}
      </div>
      <div className="demo__foot">
        {picked == null ? (
          <p className="muted">Im Duell zählt nur, wer zuerst richtig liegt.</p>
        ) : (
          <>
            <p className="demo__fact">{sample.fact}</p>
            <Button
              size="sm"
              iconRight={<ArrowRight size={16} />}
              onClick={() => {
                setPicked(null);
                setI((i + 1) % SAMPLES.length);
              }}
            >
              Nächste Frage
            </Button>
          </>
        )}
      </div>
    </Glass>
  );
}

export function Landing() {
  const config = useSession((s) => s.config);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginParam = new URLSearchParams(window.location.search).get('login');
  const loginMessage = loginParam ? LOGIN_MESSAGES[loginParam] : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginAsGuest(name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing">
      <section className="landing__intro">
        <div className="landing__brand">
          <LogoMark size={44} />
          <span>Opal</span>
        </div>
        <h1 className="landing__title">
          Wer zuerst richtig liegt, holt den Punkt.
        </h1>
        <p className="landing__lead">
          Fun-Fact-Duelle in Echtzeit: Ranked, gegen Freunde oder allein im Training. Du stellst dir die Fragen aus Paketen
          zusammen, von Allgemeinwissen über Anime bis Parfüm.
        </p>

        <Glass className="login" radius={28} tone="deep" blur={3}>
          {config?.discordEnabled ? (
            <Button variant="primary" size="lg" block icon={<LogIn size={18} />} onClick={() => (window.location.href = api.discordUrl())}>
              Mit Discord anmelden
            </Button>
          ) : (
            <p className="login__note">Der Discord-Login kommt, sobald der Server eingerichtet ist. Bis dahin kannst du als Gast spielen.</p>
          )}
          {config?.allowGuests && (
            <form className="login__guest" onSubmit={submit}>
              <label htmlFor="guest-name" className="field-label">
                {config.discordEnabled ? 'Oder als Gast' : 'Als Gast spielen'}
              </label>
              <div className="field-row">
                <Glass as="div" className="field" radius={16} tone="deep" blur={1}>
                  <input
                    id="guest-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dein Name"
                    maxLength={20}
                    autoComplete="nickname"
                  />
                </Glass>
                <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
                  Los
                </Button>
              </div>
              <p className="login__hint">Gäste spielen alles außer Ranked.</p>
            </form>
          )}
          {(error || loginMessage) && <p className="form-error">{error ?? loginMessage}</p>}
        </Glass>
      </section>

      <section className="landing__demo" aria-label="Beispielfrage zum Ausprobieren">
        <DemoQuestion />
      </section>
    </main>
  );
}
