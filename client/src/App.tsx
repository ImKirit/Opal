import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Background } from './components/Background';
import { Button } from './components/Button';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { GlassDefs } from './glass/GlassDefs';
import { useRoute } from './lib/route';
import { bootstrap, useGame, useSession } from './lib/store';
import { useThemeVariables } from './lib/theme';
import { Hub } from './screens/Hub';
import { Landing } from './screens/Landing';
import { Leaderboard } from './screens/Leaderboard';
import { Lobby } from './screens/Lobby';
import { Match } from './screens/Match';
import { Packs } from './screens/Packs';
import { Profile } from './screens/Profile';
import { QueueOverlay } from './screens/QueueOverlay';
import { Result } from './screens/Result';
import { SettingsSheet } from './screens/SettingsSheet';

function useScreen() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const match = useGame((s) => s.match);
  const result = useGame((s) => s.result);
  const lobby = useGame((s) => s.lobby);
  const route = useRoute();

  if (status !== 'ready') return status === 'error' ? 'error' : 'loading';
  if (!user) return 'landing';
  if (match) return 'match';
  if (result) return 'result';
  if (lobby) return 'lobby';
  return route.name;
}

export function App() {
  useThemeVariables();
  const screen = useScreen();
  const error = useSession((s) => s.error);
  const route = useRoute();

  useEffect(() => {
    void bootstrap();
  }, []);

  // Nach dem Discord-Login steht ?login=... in der Adresse, das braucht man danach nicht mehr
  useEffect(() => {
    if (screen !== 'landing' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, [screen]);

  let content: React.ReactNode;
  switch (screen) {
    case 'loading':
      content = <div className="splash" aria-label="Lädt" />;
      break;
    case 'error':
      content = (
        <main className="page center-note">
          <h1>Der Server ist gerade nicht erreichbar.</h1>
          <p className="muted">{error}</p>
          <Button onClick={() => void bootstrap()}>Erneut versuchen</Button>
        </main>
      );
      break;
    case 'landing':
      content = <Landing />;
      break;
    case 'match':
      content = <Match />;
      break;
    case 'result':
      content = <Result />;
      break;
    case 'lobby':
      content = <Lobby />;
      break;
    case 'pakete':
      content = <Packs />;
      break;
    case 'rangliste':
      content = <Leaderboard />;
      break;
    case 'profil':
      content = <Profile />;
      break;
    default:
      content = <Hub />;
  }

  const withChrome = !['landing', 'match', 'loading', 'error'].includes(screen);
  const showNav = withChrome && screen !== 'lobby' && screen !== 'result';
  const key = screen === 'profil' ? `profil-${route.param ?? ''}` : screen;

  return (
    <>
      <GlassDefs />
      <Background scene={screen} />
      <div className="app">
        {withChrome && <TopBar showNav={showNav} />}
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            className="screen"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <ErrorBoundary>{content}</ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
      <QueueOverlay />
      <SettingsSheet />
      <Toasts />
    </>
  );
}
