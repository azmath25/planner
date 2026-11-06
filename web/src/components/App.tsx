import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { mountLegacyDayframe } from '../legacy/legacy';
import { authClient } from '../auth/client';
import { loadGeneralWorkspace, type GeneralWorkspace } from '../auth/api';
import { AuthScreen } from './AuthScreen';
import { getDemoStorageStatus } from '../domain/storage';

interface BoundaryProps { children: ReactNode }
interface BoundaryState { broken: boolean }
class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { broken: false };
  static getDerivedStateFromError(): BoundaryState { return { broken: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Dayframe failed to render', error, info.componentStack); }
  render() {
    if (this.state.broken) return <main className="fallback" role="alert">
      <h1>Dayframe could not open</h1>
      <p>Your browser preview data has not been deleted. Reload to try again.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </main>;
    return this.props.children;
  }
}

function DayframePreview({ userId }: { userId: string }) {
  useEffect(() => {
    // Browser-only demo data is namespaced by authenticated user, never shared between accounts.
    const disposeLegacy = mountLegacyDayframe(`dayframe.user-preview.${encodeURIComponent(userId)}`);
    const onQuickCapture = (event: KeyboardEvent) => {
      const node = event.target;
      if (node instanceof HTMLElement && node.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-action="modal-task"]')?.click();
      }
    };
    window.addEventListener('keydown', onQuickCapture);
    document.documentElement.dataset.demoStorage = getDemoStorageStatus();
    return () => { window.removeEventListener('keydown', onQuickCapture); disposeLegacy(); };
  }, [userId]);
  return <div id="app" data-react-host="dayframe" />;
}

function SignedIn({userId,displayName}:{userId:string;displayName:string}) {
  const [general,setGeneral] = useState<GeneralWorkspace | null>(null);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  const [signingOut,setSigningOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setGeneral(null); setError('');
    loadGeneralWorkspace(controller.signal).then(setGeneral).catch(e => {
      if(!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load General workspace');
    });
    return () => controller.abort();
  },[userId,retry]);

  async function signOut() {
    setSigningOut(true);
    try { await authClient.signOut(); }
    finally { setSigningOut(false); }
  }

  return <div className="authed-app">
    <div className="account-topbar" aria-label="Account and workspace status">
      <span className="account-identity">◈ <strong>{displayName}</strong> · <span>{general ? 'General ready' : 'Connecting…'}</span></span>
      <span className="account-local-notice">Preview tasks and time are stored on this device only</span>
      <button type="button" className="account-signout" disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
    </div>
    {!general ? <main className="auth-page auth-wait" aria-live="polite">
      <section className="auth-card"><h1>{error ? 'Workspace unavailable' : 'Preparing General workspace'}</h1>
        <p>{error || 'Verifying your account and loading your personal space…'}</p>
        {error && <button className="auth-submit" type="button" onClick={() => setRetry(n => n + 1)}>Retry</button>}
      </section>
    </main> : <DayframePreview userId={userId} />}
  </div>;
}

export function App() {
  const session = authClient.useSession();
  return <ErrorBoundary>
    {session.isPending ? <main className="auth-page" aria-live="polite"><div className="auth-card"><h1>Opening Dayframe…</h1><p>Restoring your session securely.</p></div></main>
      : !session.data?.user ? <AuthScreen />
      : <SignedIn key={session.data.user.id} userId={session.data.user.id} displayName={session.data.user.name || session.data.user.email || 'Account'} />}
  </ErrorBoundary>;
}
