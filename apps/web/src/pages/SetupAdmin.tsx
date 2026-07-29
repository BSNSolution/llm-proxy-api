import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Field, Input } from '../components/ui/input.js';
import { Logo } from '../components/logo.js';
import { useT } from '../lib/i18n/index.js';

/**
 * Primeiro acesso (first-run): cria a conta de administrador.
 * Aparece uma única vez, quando ainda não há nenhum usuário no banco.
 */
export function SetupAdminPage({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError(t('setupAdmin.passwordTooShort'));
    if (password !== confirm) return setError(t('setupAdmin.passwordMismatch'));
    setLoading(true);
    try {
      await api.setupAdmin({ email, name: name || undefined, password });
      onDone();
    } catch (err) {
      setError(String((err as Error).message ?? t('setupAdmin.createError')));
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
          <p className="text-2xs font-medium uppercase tracking-[0.16em] text-primary">{t('setupAdmin.eyebrow')}</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">{t('setupAdmin.heading')}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {t('setupAdmin.description')}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label={t('common.email')}>
              <Input
                icon={<Mail size={15} />}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder={t('setupAdmin.emailPlaceholder')}
              />
            </Field>
            <Field label={t('setupAdmin.nameOptional')}>
              <Input
                icon={<User size={15} />}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('setupAdmin.namePlaceholder')}
              />
            </Field>
            <Field label={t('common.password')} hint={t('setupAdmin.passwordHint')}>
              <Input
                icon={<Lock size={15} />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('setupAdmin.passwordPlaceholder')}
              />
            </Field>
            <Field label={t('setupAdmin.confirmPassword')}>
              <Input
                icon={<Lock size={15} />}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder={t('setupAdmin.confirmPlaceholder')}
              />
            </Field>
            {error && (
              <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              {!loading && <ArrowRight size={16} />}
              {t('setupAdmin.submit')}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          {t('setupAdmin.footer')}
        </p>
      </div>
    </div>
  );
}
