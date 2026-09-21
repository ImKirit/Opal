import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/ui.css';
import './styles/screens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// In der Desktop-App (desktop/preload.cjs) Platz fuer die Fensterleiste lassen
if ((window as Window & { opalDesktop?: unknown }).opalDesktop) document.documentElement.classList.add('is-desktop');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
