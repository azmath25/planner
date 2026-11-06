import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { mountLegacyDayframe } from '../legacy/legacy';
import { getDemoStorageStatus } from '../domain/storage';

interface BoundaryProps { children: ReactNode }
interface BoundaryState { broken: boolean }

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { broken: false };
  static getDerivedStateFromError(): BoundaryState { return { broken: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dayframe preview failed to render', error, info.componentStack);
  }
  render() {
    if (this.state.broken) {
      return <main className="fallback" role="alert">
        <h1>Dayframe could not open</h1>
        <p>Your browser preview data has not been deleted. Reload this page to try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>;
    }
    return this.props.children;
  }
}

/**
 * React owns the application lifetime and keyboard interaction.
 * The existing working M1.2 view is mounted through a compatibility boundary,
 * rather than being rewritten prematurely in the design-only M1.3 milestone.
 */
function DayframePreview() {
  useEffect(() => {
    const disposeLegacy = mountLegacyDayframe();
    const onQuickCapture = (event: KeyboardEvent) => {
      const node = event.target;
      if (node instanceof HTMLElement && node.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const add = document.querySelector<HTMLButtonElement>('[data-action="modal-task"]');
        add?.click();
      }
    };
    window.addEventListener('keydown', onQuickCapture);
    const storage = getDemoStorageStatus();
    document.documentElement.dataset.demoStorage = storage;
    return () => {
      window.removeEventListener('keydown', onQuickCapture);
      disposeLegacy();
    };
  }, []);

  return <div id="app" data-react-host="dayframe" />;
}

export function App() {
  return <ErrorBoundary><DayframePreview /></ErrorBoundary>;
}
