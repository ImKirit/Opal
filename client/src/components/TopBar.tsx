import { BarChart3, Layers, Settings, Swords, User, Users, WifiOff } from 'lucide-react';
import { Glass } from '../glass/Glass';
import { useFriends } from '../lib/friends';
import { navigate, useRoute, type RouteName } from '../lib/route';
import { actions, useGame, useSession } from '../lib/store';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { Segmented } from './Segmented';

export function TopBar({ showNav = true }: { showNav?: boolean }) {
  const route = useRoute();
  const user = useSession((s) => s.user);
  const connected = useGame((s) => s.connected);
  const requests = useFriends((s) => s.incoming.length);

  return (
    <header className="topbar">
      <Glass className="topbar__bar" radius={24} bezel={16} tone="panel" blur={3} hero>
        <button type="button" className="topbar__brand" onClick={() => navigate('spielen')} aria-label="Zur Startseite">
          <Logo size={28} />
        </button>
        <div className="topbar__end">
          {!connected && user && (
            <span className="topbar__offline" title="Verbindung zum Server wird wiederhergestellt">
              <WifiOff size={16} /> <span>Verbinde neu</span>
            </span>
          )}
          <button type="button" className="icon-btn" onClick={() => actions.openSettings()} aria-label="Einstellungen" data-tour="settings">
            <Settings size={19} />
          </button>
          {user && (
            <button type="button" className="topbar__me" onClick={() => navigate('profil')} aria-label="Dein Profil">
              <Avatar name={user.name} src={user.avatar} size={34} />
            </button>
          )}
        </div>
      </Glass>
      {showNav && (
        <nav className="topbar__nav" aria-label="Hauptnavigation">
          <Segmented<RouteName>
            label="Bereich wählen"
            value={route.name}
            onChange={(v) => navigate(v)}
            options={[
              { value: 'spielen', label: 'Spielen', icon: <Swords size={16} /> },
              { value: 'themen', label: 'Themen', icon: <Layers size={16} /> },
              {
                value: 'freunde',
                label: (
                  <>
                    Freunde
                    {requests > 0 && (
                      <span className="nav-badge num" aria-label={`${requests} neue Anfragen`}>
                        {requests}
                      </span>
                    )}
                  </>
                ),
                icon: <Users size={16} />,
              },
              { value: 'rangliste', label: 'Rangliste', icon: <BarChart3 size={16} /> },
              { value: 'profil', label: 'Profil', icon: <User size={16} /> },
            ]}
          />
        </nav>
      )}
    </header>
  );
}
