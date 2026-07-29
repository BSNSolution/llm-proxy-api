import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type CreateKeyResult, type ProxyKeyView } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Field, Input } from '../components/ui/input.js';
import { Select } from '../components/ui/select.js';
import { Switch } from '../components/ui/toggle.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { HintTip, Tooltip } from '../components/ui/tooltip.js';
import { CLI_KINDS } from '@llm-proxy/shared-types';
import { CliIcon, CLI_LABELS } from '../components/cli-card.js';
import { useT } from '../lib/i18n/index.js';

type ProxyInfo = { openaiBaseUrl: string; anthropicBaseUrl: string };
type Usage = { totalRequests: number; totalTokens: number };

export function ProxyPage() {
  const t = useT();
  const [keys, setKeys] = useState<ProxyKeyView[]>([]);
  const [info, setInfo] = useState<ProxyInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [name, setName] = useState('');
  const [cliKind, setCliKind] = useState('claude');
  const [created, setCreated] = useState<CreateKeyResult | null>(null);
  const [rotated, setRotated] = useState<{ name: string; rawKey: string } | null>(null);
  const [editing, setEditing] = useState<ProxyKeyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** CLIs presentes na máquina + ativas no proxy (só essas geram key útil) */
  const [presentKinds, setPresentKinds] = useState<Set<string>>(new Set());
  const [enabledKinds, setEnabledKinds] = useState<Set<string>>(new Set());
  // CLIs que têm um provider HTTP equivalente configurado (modo híbrido: dá p/
  // criar key mesmo sem a CLI local — o proxy despacha via API key).
  const [httpKinds, setHttpKinds] = useState<Set<string>>(new Set());

  const pg = usePagination(keys, 8);

  // Opções de CLI: lista as 13, mas desabilita as não instaladas / não ativas no proxy.
  const cliOptions = useMemo(
    () =>
      [...CLI_KINDS].map((kind) => {
        const present = presentKinds.has(kind);
        const enabled = enabledKinds.has(kind);
        const http = httpKinds.has(kind);
        // Usável se a CLI está instalada+ativa OU há um provider HTTP configurado.
        const usable = (present && enabled) || http;
        return {
          value: kind,
          label: CLI_LABELS[kind] ?? kind,
          icon: <CliIcon kind={kind} size={15} />,
          disabled: !usable,
          hint: usable
            ? http && !present
              ? t('proxy.viaHttp')
              : undefined
            : !present
              ? t('proxy.naoInstalada')
              : t('proxy.inativaNoProxy'),
        };
      }),
    [presentKinds, enabledKinds, httpKinds, t],
  );
  const noUsableCli = cliOptions.every((o) => o.disabled);

  async function reload() {
    try {
      const { keys } = await api.listKeys();
      setKeys(keys);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadCliState() {
    const [{ detected }, { configs }, http] = await Promise.all([
      api.detectCached().catch(() => ({ detected: [] })),
      api.listConfig().catch(() => ({ configs: [] })),
      api.listHttpProviders().catch(() => ({ providers: [] })),
    ]);
    setPresentKinds(new Set(detected.filter((c) => c.present).map((c) => c.kind)));
    setEnabledKinds(new Set(configs.filter((c) => c.enabled).map((c) => c.kind)));
    // provider HTTP configurado → habilita a CLI espelhada.
    const HTTP_TO_CLI: Record<string, string> = { anthropic: 'claude', openai: 'codex', gemini: 'gemini' };
    setHttpKinds(
      new Set(
        http.providers
          .filter((p) => p.keySet && p.enabled)
          .map((p) => HTTP_TO_CLI[p.provider])
          .filter((k): k is string => !!k),
      ),
    );
  }

  useEffect(() => {
    void reload();
    void loadCliState();
    api.proxyInfo().then(setInfo).catch(() => {});
    api.usage().then(setUsage).catch(() => {});
  }, []);

  // seleção default: a primeira CLI utilizável (evita começar numa desabilitada)
  useEffect(() => {
    const firstUsable = cliOptions.find((o) => !o.disabled)?.value;
    if (firstUsable && cliOptions.find((o) => o.value === cliKind)?.disabled) {
      setCliKind(firstUsable);
    }
  }, [cliOptions, cliKind]);

  async function rotate(k: ProxyKeyView) {
    const res = await api.rotateKey(k.id);
    setRotated({ name: k.name, rawKey: res.rawKey });
    await reload();
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const res = await api.createKey({ name: name || t('proxy.minhaKey'), cliKind });
      setCreated(res);
      setName('');
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  const activeKeys = keys.filter((k) => k.enabled && !k.revokedAt).length;

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('proxy.eyebrow')}
        title={t('proxy.titulo')}
        subtitle={t('proxy.subtitulo')}
      />

      {/* KPIs */}
      {usage && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={t('proxy.kpiRequests')} value={usage.totalRequests.toLocaleString('pt-BR')} />
          <Kpi label={t('proxy.kpiTokens')} value={usage.totalTokens.toLocaleString('pt-BR')} />
          <Kpi label={t('proxy.kpiKeysAtivas')} value={activeKeys} />
        </div>
      )}

      {/* Base URLs */}
      {info && (
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
            {t('proxy.comoConfigurar')}
            <HintTip content={t('proxy.comoConfigurarTip')} />
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <UrlRow label={t('proxy.baseUrlOpenai')} url={info.openaiBaseUrl} />
            <UrlRow label={t('proxy.baseUrlAnthropic')} url={info.anthropicBaseUrl} />
          </div>
        </Card>
      )}

      {/* Criar key */}
      <Card className="p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <Field label={t('proxy.nomeDaKey')} className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('proxy.minhaKey')} />
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1">
                CLI
                <HintTip content={t('proxy.cliTip')} />
              </span>
            }
            className="sm:w-52"
          >
            <Select value={cliKind} onChange={setCliKind} options={cliOptions} />
          </Field>
          <Button onClick={create} loading={creating} disabled={noUsableCli}>
            {!creating && <Plus size={16} />}
            {t('proxy.gerarKey')}
          </Button>
        </div>
        {noUsableCli && (
          <p className="mt-3 text-xs text-warn">
            {t('proxy.nenhumaCliPronta')}
          </p>
        )}
      </Card>

      {error && (
        <div className="rounded-md border border-err/25 bg-err/10 px-4 py-3 text-sm text-err">
          {error}
        </div>
      )}

      {created && (
        <Card className="border-primary/40 p-5 shadow-glow">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <KeyRound size={16} />
            <h3 className="text-sm font-semibold">{t('proxy.keyCriada')}</h3>
          </div>
          <UrlRow label={t('proxy.apiKey')} url={created.rawKey} />
        </Card>
      )}

      {/* Tabela / cards de keys */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-fg-muted">{t('proxy.suasApiKeys')}</h3>
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound size={28} />} title={t('proxy.nenhumaKeyAinda')}>
            {t('proxy.gereAPrimeira')}
          </EmptyState>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_0.9fr_168px] border-b border-border bg-surface-3/50 px-4 py-2.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                <span>{t('common.name')}</span>
                <span>CLI</span>
                <span>{t('common.model')}</span>
                <span className="flex items-center gap-1">
                  {t('proxy.rate')} <HintTip content={t('proxy.rateTip')} />
                </span>
                <span className="flex items-center gap-1">
                  {t('proxy.usoHoje')} <HintTip content={t('proxy.usoHojeTip')} />
                </span>
                <span>{t('common.status')}</span>
                <span />
              </div>
              {pg.pageItems.map((k) => (
                <div
                  key={k.id}
                  className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_0.9fr_168px] items-center border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-surface-2/50"
                >
                  <span className="truncate font-medium">{k.name}</span>
                  <span className="flex items-center gap-2 text-fg-muted">
                    <CliIcon kind={k.cliKind} size={15} />
                    <span className="truncate">{CLI_LABELS[k.cliKind] ?? k.cliKind}</span>
                  </span>
                  <span className="truncate font-mono text-xs text-fg-muted">
                    {k.defaultModel ?? '—'}
                  </span>
                  <span className="font-mono text-xs text-fg-muted">{k.rateLimitPerMin}/min</span>
                  <span className="font-mono text-xs text-fg-muted">
                    {k.usedTokensToday}
                    {k.dailyTokenQuota ? ` / ${k.dailyTokenQuota}` : ''}
                  </span>
                  <span>
                    <StatusBadge k={k} />
                  </span>
                  <RowActions k={k} onEdit={() => setEditing(k)} onRotate={() => rotate(k)} onReload={reload} />
                </div>
              ))}
            </div>

            {/* Mobile: cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {pg.pageItems.map((k) => (
                <div key={k.id} className="rounded-lg border border-border bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-3">
                        <CliIcon kind={k.cliKind} size={17} />
                      </span>
                      <div>
                        <p className="font-medium">{k.name}</p>
                        <p className="font-mono text-xs text-fg-subtle">
                          {k.defaultModel ?? CLI_LABELS[k.cliKind]}
                        </p>
                      </div>
                    </div>
                    <StatusBadge k={k} />
                  </div>
                  {k.dailyTokenQuota != null && (
                    <QuotaBar used={k.usedTokensToday} total={k.dailyTokenQuota} resetIn={k.secondsUntilDailyReset} />
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-fg-muted">
                    <span className="font-mono">
                      {k.rateLimitPerMin}/min · {k.usedTokensToday.toLocaleString('pt-BR')} {t('proxy.tkHoje')}
                      {k.tokenSaver && <span className="ml-1.5 text-primary/80">· saver</span>}
                      {k.terseness !== 'off' && <span className="ml-1 text-primary/80">· {k.terseness}</span>}
                    </span>
                    <RowActions
                      k={k}
                      onEdit={() => setEditing(k)}
                      onRotate={() => rotate(k)}
                      onReload={reload}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Pagination {...pg} label={t('proxy.keys')} />
          </>
        )}
      </Card>

      {rotated && (
        <Modal onClose={() => setRotated(null)} title={t('proxy.novaKeyPara', { name: rotated.name })}>
          <p className="mb-3 text-sm text-ok">{t('proxy.copieAgora')}</p>
          <UrlRow label="" url={rotated.rawKey} />
        </Modal>
      )}

      {editing && (
        <EditKeyModal
          keyView={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </main>
  );
}

function StatusBadge({ k }: { k: ProxyKeyView }) {
  const t = useT();
  return (
    <Badge dot tone={k.revokedAt ? 'err' : k.enabled ? 'ok' : 'neutral'}>
      {k.revokedAt ? t('proxy.revogada') : k.enabled ? t('proxy.ativa') : t('proxy.off')}
    </Badge>
  );
}

/** Barra de quota diária + countdown ao vivo até o reset (meia-noite). */
function QuotaBar({ used, total, resetIn }: { used: number; total: number; resetIn: number }) {
  const t = useT();
  const [remaining, setRemaining] = useState(resetIn);
  useEffect(() => {
    setRemaining(resetIn);
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [resetIn]);

  const pct = Math.min(100, Math.round((used / total) * 100));
  const tone = pct >= 90 ? 'bg-err' : pct >= 70 ? 'bg-warn' : 'bg-primary';
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-fg-muted">
        <span>
          {used.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')} {t('proxy.tokens')}
        </span>
        <span className="font-mono text-fg-subtle">
          {t('proxy.resetEm', { h, m: String(m).padStart(2, '0') })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RowActions({
  k,
  onEdit,
  onRotate,
  onReload,
}: {
  k: ProxyKeyView;
  onEdit: () => void;
  onRotate: () => void;
  onReload: () => void;
}) {
  const t = useT();
  return (
    <span className="flex justify-end gap-0.5">
      <Tooltip content={t('proxy.editarTip')}>
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <Pencil size={15} />
        </Button>
      </Tooltip>
      <Tooltip content={t('proxy.rotacionarTip')}>
        <Button variant="ghost" size="icon-sm" onClick={onRotate}>
          <RefreshCw size={15} />
        </Button>
      </Tooltip>
      {!k.revokedAt && (
        <Tooltip content={t('proxy.revogarTip')}>
          <Button variant="ghost" size="icon-sm" onClick={() => api.revokeKey(k.id).then(onReload)}>
            <Ban size={15} />
          </Button>
        </Tooltip>
      )}
      <Tooltip content={t('proxy.excluirTip')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-err hover:text-err"
          onClick={() => api.deleteKey(k.id).then(onReload)}
        >
          <Trash2 size={15} />
        </Button>
      </Tooltip>
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-4">
      <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-1 font-mono text-[24px] font-semibold tracking-tight text-fg">{value}</p>
    </div>
  );
}

function UrlRow({ label, url }: { label: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="mb-1.5 text-[13px] font-medium text-fg-muted">{label}</p>}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
        <code className="flex-1 truncate font-mono text-[13px] text-fg">{url}</code>
        <button
          className="shrink-0 text-fg-subtle transition-colors hover:text-primary"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={t('common.copy')}
        >
          {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-fade-in-up w-full max-w-md rounded-xl border border-border-strong bg-surface-2 p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function EditKeyModal({
  keyView,
  onClose,
  onSaved,
}: {
  keyView: ProxyKeyView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(keyView.name);
  const [rate, setRate] = useState(String(keyView.rateLimitPerMin));
  const [quota, setQuota] = useState(keyView.dailyTokenQuota ? String(keyView.dailyTokenQuota) : '');
  const [models, setModels] = useState(keyView.allowedModels.join(', '));
  const [cors, setCors] = useState('');
  const [tokenSaver, setTokenSaver] = useState(keyView.tokenSaver);
  const [terseness, setTerseness] = useState(keyView.terseness || 'off');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateKey(keyView.id, {
        name,
        rateLimitPerMin: Number(rate) || 20,
        dailyTokenQuota: quota ? Number(quota) : null,
        allowedModels: models.split(',').map((s) => s.trim()).filter(Boolean),
        tokenSaver,
        terseness,
        ...(cors.trim()
          ? { corsOrigins: cors.split(',').map((s) => s.trim()).filter(Boolean) }
          : {}),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('proxy.editarTitulo', { name: keyView.name })} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label={t('common.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('proxy.rateReqMin')}>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label={t('proxy.quotaDiaria')}>
            <Input value={quota} onChange={(e) => setQuota(e.target.value)} />
          </Field>
        </div>
        <Field label={t('proxy.modelosPermitidos')}>
          <Input value={models} onChange={(e) => setModels(e.target.value)} />
        </Field>
        <Field label={t('proxy.corsOrigins')}>
          <Input
            value={cors}
            onChange={(e) => setCors(e.target.value)}
            placeholder="https://meuapp.com, *"
          />
        </Field>

        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm">
              <HintTip content={t('proxy.tokenSaverTip')} />
              {t('proxy.tokenSaver')}
            </div>
            <Switch checked={tokenSaver} onChange={setTokenSaver} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm">
              <HintTip content={t('proxy.respostasEnxutasTip')} />
              {t('proxy.respostasEnxutas')}
            </div>
            <Select
              size="sm"
              className="w-40"
              value={terseness}
              onChange={setTerseness}
              options={[
                { value: 'off', label: t('proxy.tersenessOff') },
                { value: 'caveman', label: t('proxy.tersenessCaveman') },
                { value: 'ponytail', label: t('proxy.tersenessPonytail') },
              ]}
            />
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
