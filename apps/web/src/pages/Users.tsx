import { useEffect, useState } from 'react';
import { KeyRound, Monitor, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { api, type SessionView, type UserView } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Field, Input } from '../components/ui/input.js';
import { Select } from '../components/ui/select.js';
import { Switch } from '../components/ui/toggle.js';
import { Modal } from '../components/ui/modal.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { HintTip, Tooltip } from '../components/ui/tooltip.js';
import { useT } from '../lib/i18n/index.js';

export function UsersPage() {
  const t = useT();
  const [users, setUsers] = useState<UserView[]>([]);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);

  const usersPg = usePagination(users, 10);
  const sessionsPg = usePagination(sessions, 10);

  async function load() {
    setError(null);
    try {
      const [{ users }, { sessions }] = await Promise.all([
        api.listUsers(),
        api.listSessionsAll(true),
      ]);
      setUsers(users);
      setSessions(sessions);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function removeUser(u: UserView) {
    if (!confirm(t('users.confirmDelete', { email: u.email }))) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  async function revokeSession(s: SessionView) {
    try {
      await api.revokeSession(s.id);
      await load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('users.eyebrow')}
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus size={15} /> {t('users.new')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-err/25 bg-err/10 px-4 py-3 text-sm text-err">{error}</div>
      )}

      {/* USUÁRIOS */}
      <Card className="p-5">
        <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
          {t('users.usersTitle')} · <span className="font-mono text-fg">{users.length}</span>
          <HintTip content={t('users.usersHint')} />
        </h3>

        {users.length === 0 ? (
          <EmptyState icon={<UserPlus size={26} />} title={t('users.emptyUsers')}>
            {t('users.emptyUsersBody')}
          </EmptyState>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.6fr_120px] border-b border-border bg-surface-3/50 px-4 py-2.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                <span>{t('users.col.user')}</span>
                <span>{t('common.role')}</span>
                <span>{t('users.col.keys')}</span>
                <span>{t('common.status')}</span>
                <span />
              </div>
              {usersPg.pageItems.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.6fr_120px] items-center border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-surface-2/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name || u.email}</p>
                    {u.name && <p className="truncate text-xs text-fg-subtle">{u.email}</p>}
                  </div>
                  <span>
                    <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>
                      {u.role === 'admin' ? t('users.role.admin') : t('users.role.viewer')}
                    </Badge>
                  </span>
                  <span className="font-mono text-xs text-fg-muted">{u.keysCount}</span>
                  <span>
                    {u.disabled ? (
                      <Badge tone="err" dot>
                        {t('users.state.disabled')}
                      </Badge>
                    ) : (
                      <Badge tone="ok" dot>
                        {t('users.state.active')}
                      </Badge>
                    )}
                  </span>
                  <span className="flex justify-end gap-0.5">
                    <Tooltip content={t('users.tip.edit')}>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)}>
                        <Pencil size={15} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('users.tip.delete')}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-err hover:text-err"
                        onClick={() => void removeUser(u)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </Tooltip>
                  </span>
                </div>
              ))}
            </div>

            {/* mobile */}
            <div className="flex flex-col gap-3 md:hidden">
              {usersPg.pageItems.map((u) => (
                <div key={u.id} className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.name || u.email}</p>
                      <p className="truncate text-xs text-fg-subtle">{u.email}</p>
                    </div>
                    <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>
                      {u.role === 'admin' ? t('users.role.admin') : t('users.role.viewer')}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-fg-muted">
                    <span>
                      {t('users.keysCount', { n: u.keysCount })} ·{' '}
                      {u.disabled ? (
                        <span className="text-err">{t('users.state.disabled')}</span>
                      ) : (
                        <span className="text-ok">{t('users.state.active')}</span>
                      )}
                    </span>
                    <span className="flex gap-0.5">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-err hover:text-err"
                        onClick={() => void removeUser(u)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Pagination {...usersPg} label={t('users.paginationUsers')} />
          </>
        )}
      </Card>

      {/* SESSÕES */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
            {t('users.sessionsTitle')} · <span className="font-mono text-fg">{sessions.length}</span>
            <HintTip content={t('users.sessionsHint')} />
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await api.revokeOtherSessions();
              await load();
            }}
          >
            {t('users.revokeOthers')}
          </Button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState icon={<Monitor size={26} />}>{t('users.noSessions')}</EmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {sessionsPg.pageItems.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5"
                >
                  <Monitor size={16} className="shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm">
                      {s.userName || s.userEmail}
                      {s.current && (
                        <Badge tone="primary" dot>
                          {t('users.thisSession')}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-2xs text-fg-subtle">
                      {shortUA(s.userAgent, t)} · {s.ip ?? t('users.ipUnknown')} · {t('users.seen')}{' '}
                      {new Date(s.lastSeenAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {!s.current && (
                    <Tooltip content={t('users.tip.revoke')}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-err hover:text-err"
                        onClick={() => void revokeSession(s)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
            <Pagination {...sessionsPg} label={t('users.paginationSessions')} />
          </>
        )}
      </Card>

      {creating && (
        <UserModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {editing && (
        <UserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </main>
  );
}

/** Modal de criar/editar usuário. */
function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user?: UserView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const editingMode = !!user;
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>(user?.role ?? 'viewer');
  const [disabled, setDisabled] = useState(user?.disabled ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      if (editingMode) {
        await api.updateUser(user!.id, {
          name: name || null,
          role,
          disabled,
          ...(password ? { password } : {}),
        });
      } else {
        await api.createUser({ email, name: name || undefined, password, role });
      }
      onSaved();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editingMode ? t('users.modal.editTitle') : t('users.modal.newTitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {err && (
          <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">{err}</div>
        )}
        <Field label={t('users.modal.email')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={editingMode}
            placeholder="pessoa@empresa.com"
          />
        </Field>
        <Field label={t('users.modal.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('users.modal.namePlaceholder')} />
        </Field>
        <Field
          label={editingMode ? t('users.modal.newPassword') : t('common.password')}
          hint={t('users.modal.passwordHint')}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editingMode ? '••••••' : t('users.modal.passwordPlaceholder')}
          />
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1">
              {t('common.role')}
              <HintTip content={t('users.modal.roleHint')} />
            </span>
          }
        >
          <Select
            value={role}
            onChange={(v) => setRole(v as 'admin' | 'viewer')}
            options={[
              { value: 'viewer', label: t('users.modal.roleViewer') },
              { value: 'admin', label: t('users.modal.roleAdmin') },
            ]}
          />
        </Field>
        {editingMode && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-3/40 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm">
              <KeyRound size={14} className="text-fg-subtle" /> {t('users.modal.accountActive')}
              <HintTip content={t('users.modal.accountActiveHint')} />
            </span>
            <Switch checked={!disabled} onChange={() => setDisabled((d) => !d)} />
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={save}
            loading={saving}
            disabled={!email.trim() || (!editingMode && password.length < 6)}
          >
            {!saving && <Plus size={15} />}
            {editingMode ? t('common.save') : t('users.modal.submitCreate')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Resume o user-agent para algo curto e legível. */
function shortUA(ua: string | null, t: (key: string) => string): string {
  if (!ua) return t('users.ua.unknown');
  if (/iPhone|Android|Mobile/i.test(ua)) return t('users.ua.phone');
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return t('users.ua.browser');
}
