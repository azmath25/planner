import { useState, type FormEvent } from 'react';
import { authClient } from '../auth/client';

type Mode = 'sign-in' | 'sign-up';

export function AuthScreen({onPreview}:{onPreview:()=>void}) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage('');
    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const result = mode === 'sign-in'
        ? await authClient.signIn.email(credentials)
        : await authClient.signUp.email({ ...credentials, name: name.trim() });
      if (result.error) {
        setMessage(result.error.message || 'Could not authenticate. Check your details and try again.');
      } else {
        // An HTTP 200 on sign-in does not mean the browser retained a session.
        // Managed Neon Auth is cross-site on GitHub Pages; some Safari/ITP
        // configurations reject that cookie even after credentials are accepted.
        const session = await authClient.getSession();
        if (session.data?.user) {
          setPassword('');
          // Also restores the React useSession() state if its initial value was cached.
          window.location.reload();
          return;
        }
        setPassword('');
        if (mode === 'sign-up') setMode('sign-in');
        setMessage(mode === 'sign-up'
          ? 'Your account was created, but this browser did not keep the login session. Try signing in. Safari can block cross-site login cookies.'
          : 'Your credentials were accepted, but this browser could not restore the login session. Safari may be blocking Neon Auth’s cross-site cookies. Try a browser that permits the authentication cookie; a same-site proxy is needed for reliable Safari support.');
      }
    } catch {
      setMessage('Could not reach the authentication service. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-card" aria-label="Dayframe account">
      <div className="auth-symbol" aria-hidden="true">◈</div>
      <p className="auth-kicker">DAYFRAME</p>
      <h1>{mode === 'sign-in' ? 'Welcome back' : 'Make room for what matters'}</h1>
      <p className="auth-subtitle">{mode === 'sign-in' ? 'Sign in to your personal planning space.' : 'Create your Dayframe account.'}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'sign-up' && <label>Your name<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
        <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input required type="password" minLength={8} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="auth-switch" type="button" disabled={busy} onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>
        {mode === 'sign-in' ? 'New here? Create an account' : 'Already registered? Sign in'}
      </button>
      <button className="auth-switch" type="button" onClick={onPreview}>
        Open local demo without signing in
      </button>
      <p className="auth-note">The local demo is stored on this device and never accesses another account. To sync workspaces and tasks, a working Neon Auth session is required. Safari may block its cross-site cookie.</p>
    </section>
  </main>;
}
