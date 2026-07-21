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

export function UsersPage() {
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
    if (!confirm(`Excluir o usuário ${u.email}? Isso apaga as keys e o chat dele.`)) return;
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
        eyebrow="Administração"
        title="Usuários & Sessões"
        subtitle="Crie contas com papéis, controle o acesso e gerencie as sessões ativas."
        action={
          <Button onClick={() => setCreating(true)}>
            <UserPlus size={15} /> Novo usuário
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-err/25 bg-err/10 px-4 py-3 text-sm text-err">{error}</div>
      )}

      {/* USUÁRIOS */}
      <Card className="p-5">
        <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
          Usuários · <span className="font-mono text-fg">{users.length}</span>
          <HintTip content="Cada usuário tem suas próprias API keys e chats, isolados. Admin gerencia tudo; viewer só usa o que é dele." />
        </h3>

        {users.length === 0 ? (
          <EmptyState icon={<UserPlus size={26} />} title="Nenhum usuário">
            Crie o primeiro usuário para dar acesso a outra pessoa.
          </EmptyState>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.6fr_120px] border-b border-border bg-surface-3/50 px-4 py-2.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                <span>Usuário</span>
                <span>Papel</span>
                <span>Keys</span>
                <span>Estado</span>
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
                    <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>{u.role}</Badge>
                  </span>
                  <span className="font-mono text-xs text-fg-muted">{u.keysCount}</span>
                  <span>
                    {u.disabled ? (
                      <Badge tone="err" dot>
                        desativado
                      </Badge>
                    ) : (
                      <Badge tone="ok" dot>
                        ativo
                      </Badge>
                    )}
                  </span>
                  <span className="flex justify-end gap-0.5">
                    <Tooltip content="Editar papel, nome, senha e estado.">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)}>
                        <Pencil size={15} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Excluir usuário (e tudo dele).">
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
                    <Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>{u.role}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-fg-muted">
                    <span>
                      {u.keysCount} keys ·{' '}
                      {u.disabled ? (
                        <span className="text-err">desativado</span>
                      ) : (
                        <span className="text-ok">ativo</span>
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
            <Pagination {...usersPg} label="usuários" />
          </>
        )}
      </Card>

      {/* SESSÕES */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
            Sessões ativas · <span className="font-mono text-fg">{sessions.length}</span>
            <HintTip content="Cada login cria uma sessão. Revogue para forçar o logout de um dispositivo." />
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await api.revokeOtherSessions();
              await load();
            }}
          >
            Encerrar minhas outras sessões
          </Button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState icon={<Monitor size={26} />}>Nenhuma sessão ativa.</EmptyState>
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
                          esta sessão
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-2xs text-fg-subtle">
                      {shortUA(s.userAgent)} · {s.ip ?? 'ip —'} · visto{' '}
                      {new Date(s.lastSeenAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {!s.current && (
                    <Tooltip content="Revogar (desloga este dispositivo).">
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
            <Pagination {...sessionsPg} label="sessões" />
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
    <Modal title={editingMode ? 'Editar usuário' : 'Novo usuário'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {err && (
          <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">{err}</div>
        )}
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={editingMode}
            placeholder="pessoa@empresa.com"
          />
        </Field>
        <Field label="Nome (opcional)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome de exibição" />
        </Field>
        <Field
          label={editingMode ? 'Nova senha (deixe em branco para manter)' : 'Senha'}
          hint="Mínimo 6 caracteres."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editingMode ? '••••••' : 'defina uma senha'}
          />
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1">
              Papel
              <HintTip content="Admin gerencia usuários, sessões e tudo. Viewer só usa as próprias keys e o próprio chat." />
            </span>
          }
        >
          <Select
            value={role}
            onChange={(v) => setRole(v as 'admin' | 'viewer')}
            options={[
              { value: 'viewer', label: 'Viewer (uso próprio)' },
              { value: 'admin', label: 'Admin (gerencia tudo)' },
            ]}
          />
        </Field>
        {editingMode && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-3/40 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-sm">
              <KeyRound size={14} className="text-fg-subtle" /> Conta ativa
              <HintTip content="Ao desativar, o usuário não consegue mais logar e todas as sessões dele são encerradas." />
            </span>
            <Switch checked={!disabled} onChange={() => setDisabled((d) => !d)} />
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            loading={saving}
            disabled={!email.trim() || (!editingMode && password.length < 6)}
          >
            {!saving && <Plus size={15} />}
            {editingMode ? 'Salvar' : 'Criar usuário'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Resume o user-agent para algo curto e legível. */
function shortUA(ua: string | null): string {
  if (!ua) return 'dispositivo —';
  if (/iPhone|Android|Mobile/i.test(ua)) return 'Celular';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Navegador';
}
