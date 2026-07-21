import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Field, Input } from '../components/ui/input.js';
import { Logo } from '../components/logo.js';

/**
 * Primeiro acesso (first-run): cria a conta de administrador.
 * Aparece uma única vez, quando ainda não há nenhum usuário no banco.
 */
export function SetupAdminPage({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('A senha precisa de ao menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas não coincidem.');
    setLoading(true);
    try {
      await api.setupAdmin({ email, name: name || undefined, password });
      onDone();
    } catch (err) {
      setError(String((err as Error).message ?? 'Não foi possível criar a conta.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="animate-fade-in-up w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-xl border border-border bg-surface-2/60 p-6 shadow-lg backdrop-blur-sm sm:p-7">
          <p className="text-2xs font-medium uppercase tracking-[0.16em] text-primary">Primeiro acesso</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Crie sua conta de administrador</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Esta é a conta que gerencia o app. Você poderá criar outros usuários depois.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label="E-mail">
              <Input
                icon={<Mail size={15} />}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="voce@empresa.com"
              />
            </Field>
            <Field label="Nome (opcional)">
              <Input
                icon={<User size={15} />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </Field>
            <Field label="Senha" hint="Mínimo 6 caracteres.">
              <Input
                icon={<Lock size={15} />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="crie uma senha"
              />
            </Field>
            <Field label="Confirmar senha">
              <Input
                icon={<Lock size={15} />}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="repita a senha"
              />
            </Field>
            {error && (
              <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              {!loading && <ArrowRight size={16} />}
              Criar conta e entrar
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          Roda na sua máquina · self-hosted · offline-first
        </p>
      </div>
    </div>
  );
}
