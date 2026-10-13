import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { applyAppearance, readStoredAppearance } from '@/lib/appearance';

export function AuthGate({ children }) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  React.useEffect(() => { api.get('/api/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  React.useEffect(() => {
    if (!user) return undefined;
    let active = true;
    (async () => {
      try {
        let settings = await api.get('/api/settings');
        if (!active) return;
        if (settings?._initialized === false) {
          settings = await api.put('/api/settings', readStoredAppearance());
          if (!active) return;
        }
        applyAppearance(settings);
      } catch { /* keep locally stored appearance */ }
    })();
    return () => { active = false; };
  }, [user?.id]);
  if (loading) return <div className="grid min-h-dvh place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/></div>;
  if (!user) return <Login onLogin={setUser} error={error} setError={setError}/>;
  return children(user, () => setUser(null));
}

function Login({ onLogin, error, setError }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const login = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/api/auth/login', { username, password }); onLogin(r.user); }
    catch (e) { setError(e.status === 401 ? 'Неверный логин или пароль' : 'Не удалось войти'); }
    finally { setBusy(false); }
  };
  const demo = async () => { setBusy(true); setError(''); try { const r = await api.post('/api/auth/demo', {}); onLogin(r.user); } catch { setError('Не удалось открыть демо'); } finally { setBusy(false); } };
  return <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
    <form onSubmit={login} className="w-full max-w-[340px]">
      <h1 className="mb-7 text-center text-[22px] font-semibold tracking-[-0.02em] text-foreground">Вход</h1>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Логин</Label>
          <Input id="username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)}/>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}/>
        </div>
        {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Войти</Button>
      </div>
      <button
        type="button"
        onClick={demo}
        disabled={busy}
        className="mx-auto mt-5 block text-[13px] font-normal text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-45"
      >
        Открыть демо-пространство
      </button>
    </form>
  </div>;
}
