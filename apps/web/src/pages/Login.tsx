import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Field, Input } from '../components/ui/input.js';
import { Logo } from '../components/logo.js';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(email, password);
      onLogin();
    } catch (err) {
      setError(String((err as Error).message ?? 'Credenciais inválidas.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="animate-fade-in-up w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-xl border border-border bg-surface-2/60 p-6 shadow-lg backdrop-blur-sm sm:p-7">
          <h1 className="text-lg font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-fg-muted">Acesse o painel do seu Proxy API.</p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label="Email">
              <Input
                icon={<Mail size={15} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="voce@empresa.com"
              />
            </Field>
            <Field label="Senha">
              <Input
                icon={<Lock size={15} />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>
            {error && (
              <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              {!loading && <ArrowRight size={16} />}
              Entrar
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          Roda na sua máquina · single-machine · offline-first
        </p>
      </div>
    </div>
  );
}
