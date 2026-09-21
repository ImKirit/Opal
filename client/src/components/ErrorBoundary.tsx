import { Component, type ReactNode } from 'react';
import { Button } from './Button';

interface State {
  error: Error | null;
}

/** Faengt Renderfehler ab, damit nie eine leere Seite stehen bleibt. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[opal] Anzeigefehler:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page center-note">
        <h1>Hier ist etwas schiefgelaufen.</h1>
        <p className="muted">{this.state.error.message}</p>
        <Button onClick={() => window.location.reload()}>Seite neu laden</Button>
      </main>
    );
  }
}
