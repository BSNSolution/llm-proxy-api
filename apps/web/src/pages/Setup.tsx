import { useEffect, useState } from 'react';
import { Check, Copy, Cpu, Download, KeyRound, ListChecks, LogIn, RefreshCw } from 'lucide-react';
import type { DetectedCli } from '@llm-proxy/shared-types';
import { api, type CreateKeyResult } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { PageHeader } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { HintTip } from '../components/ui/tooltip.js';
import { CliCard, CliIcon, CLI_LABELS } from '../components/cli-card.js';
import { InstallLoginWizard } from '../components/install-login-wizard.js';
import { useT } from '../lib/i18n/index.js';
import { cn } from '../lib/cn.js';

type Step = 1 | 2 | 3;

export function SetupPage() {
  const t = useT();
  const [step, setStep] = useState<Step>(1);
  const [clis, setClis] = useState<DetectedCli[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<CreateKeyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** CLI cujo wizard de instalação+login está aberto (null = fechado) */
  const [wizardCli, setWizardCli] = useState<{ kind: string; installed: boolean } | null>(null);
  /** login por CLI (kind → logada) */
  const [loginStatus, setLoginStatus] = useState<Record<string, boolean>>({});
  /** CLIs ativas no proxy (kind → enabled) */
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});

  async function refreshStatus() {
    const [ls, cfg] = await Promise.all([
      api.loginStatus().catch(() => ({ status: {} })),
      api.listConfig().catch(() => ({ configs: [] })),
    ]);
    setLoginStatus(ls.status);
    setEnabledMap(Object.fromEntries(cfg.configs.map((c) => [c.kind, c.enabled])));
  }

  async function detect() {
    setLoading(true);
    setError(null);
    try {
      const { detected } = await api.detect();
      setClis(detected);
      setSelected(new Set(detected.filter((c) => c.present).map((c) => c.kind)));
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api
      .detectCached()
      .then(({ detected }) => {
        setClis(detected);
        setSelected(new Set(detected.filter((c) => c.present).map((c) => c.kind)));
      })
      .catch(() => {});
    void refreshStatus();
  }, []);

  function toggle(kind: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  async function saveConfigs() {
    setError(null);
    try {
      for (const c of clis) {
        await api.upsertConfig({
          kind: c.kind,
          enabled: selected.has(c.kind),
          defaultModel: c.defaultModel ?? null,
          allowedModels: c.models,
        });
      }
      setStep(3);
    } catch (e) {
      setError(String(e));
    }
  }

  async function createFirstKey(kind: string) {
    setError(null);
    try {
      const d = clis.find((c) => c.kind === kind);
      const res = await api.createKey({
        name: t('setup.keyName', { cli: CLI_LABELS[kind] ?? kind }),
        cliKind: kind,
        defaultModel: d?.defaultModel ?? undefined,
        allowedModels: d?.models ?? [],
      });
      setCreated(res);
    } catch (e) {
      setError(String(e));
    }
  }

  const present = clis.filter((c) => c.present);
  const absent = clis.filter((c) => !c.present);
  const presentPg = usePagination(present, 6);
  const absentPg = usePagination(absent, 9);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('setup.eyebrow')}
        title={t('setup.titulo')}
        subtitle={t('setup.subtitulo')}
      />

      <Stepper step={step} />

      {error && (
        <div className="rounded-md border border-err/25 bg-err/10 px-4 py-3 text-sm text-err">
          {error}
        </div>
      )}

      {/* PASSO 1 */}
      {step === 1 && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <span className="font-mono font-medium text-fg">{present.length}</span> {t('common.of')}{' '}
              <span className="font-mono">{clis.length || 6}</span> {t('setup.clisInstaladas')}
              <HintTip content={t('setup.detectTip')} />
            </p>
            <Button variant="secondary" size="sm" onClick={detect} loading={loading}>
              {!loading && <RefreshCw size={15} />}
              {t('setup.detectar')}
            </Button>
          </div>

          {present.length > 0 && (
            <div className="mb-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {presentPg.pageItems.map((c) => (
                  <InstalledCliCard
                    key={c.kind}
                    cli={c}
                    loggedIn={loginStatus[c.kind] ?? false}
                    enabled={enabledMap[c.kind] ?? false}
                    onLogin={() => setWizardCli({ kind: c.kind, installed: true })}
                  />
                ))}
              </div>
              {presentPg.totalPages > 1 && <Pagination {...presentPg} label={t('setup.clis')} />}
            </div>
          )}

          {absent.length > 0 && (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-subtle">
                {t('setup.naoInstaladas')}
                <HintTip content={t('setup.naoInstaladasTip')} />
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {absentPg.pageItems.map((c) => (
                  <div
                    key={c.kind}
                    className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 p-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-subtle">
                      <CliIcon kind={c.kind} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{CLI_LABELS[c.kind] ?? c.kind}</p>
                      <p className="text-2xs text-fg-subtle">{t('setup.naoInstalada')}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setWizardCli({ kind: c.kind, installed: false })}
                    >
                      <Download size={14} /> {t('setup.instalar')}
                    </Button>
                  </div>
                ))}
              </div>
              {absentPg.totalPages > 1 && <Pagination {...absentPg} label={t('setup.clis')} />}
            </>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={() => setStep(2)} disabled={present.length === 0}>
              {t('setup.proximo')}
            </Button>
          </div>
        </Card>
      )}

      {/* PASSO 2 */}
      {step === 2 && (
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-1.5 text-sm text-fg-muted">
            {t('setup.cliquePara')}
            <HintTip content={t('setup.cliqueParaTip')} />
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {present.map((c) => (
              <CliCard
                key={c.kind}
                cli={c}
                active={selected.has(c.kind)}
                onToggle={() => toggle(c.kind)}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              {t('setup.voltar')}
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-fg-muted">
                <span className="font-mono text-fg">{selected.size}</span>{' '}
                {selected.size === 1 ? t('setup.selecionada') : t('setup.selecionadas')}
              </span>
              <Button onClick={saveConfigs} disabled={selected.size === 0}>
                {t('setup.salvarContinuar')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* PASSO 3 */}
      {step === 3 && (
        <Card className="p-5">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">
            {t('setup.prontoGere')}
            <HintTip content={t('setup.prontoGereTip')} />
          </h3>
          {!created ? (
            <>
              <p className="mb-4 mt-1 text-sm text-fg-muted">{t('setup.escolhaCli')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...selected].map((kind) => {
                  const c = clis.find((x) => x.kind === kind);
                  return (
                    <button
                      key={kind}
                      onClick={() => createFirstKey(kind)}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-3"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-3">
                        <CliIcon kind={kind} size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{CLI_LABELS[kind] ?? kind}</p>
                        <p className="truncate font-mono text-xs text-fg-subtle">
                          {c?.defaultModel ?? 'default'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">
                <Check size={15} /> {t('setup.keyCriada')}
              </div>
              <p className="text-sm text-fg-muted">
                {t('setup.prontoAgora1')}{' '}
                <span className="font-medium text-fg">{t('setup.baseUrl')}</span>{' '}
                {t('setup.prontoAgora2')}{' '}
                <span className="font-medium text-fg">{t('setup.apiKey')}</span>{' '}
                {t('setup.prontoAgora3')}{' '}
                <span className="font-mono text-xs">curl</span> {t('setup.prontoAgora4')}
              </p>
              <CopyBlock label={t('setup.apiKeyLabel')} value={created.rawKey} />
              <CopyBlock
                label={t('setup.baseUrlLabel')}
                value={created.preview.openaiBaseUrl}
              />
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
                  {t('setup.exemploTeste')}
                  <HintTip content={t('setup.exemploTesteTip')} />
                </p>
                <pre className="overflow-x-auto rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-xs text-fg-muted">
                  {created.preview.curlExample}
                </pre>
              </div>
            </div>
          )}
        </Card>
      )}

      {wizardCli && (
        <InstallLoginWizard
          kind={wizardCli.kind}
          alreadyInstalled={wizardCli.installed}
          onClose={() => setWizardCli(null)}
          onFinished={() => void detect()}
        />
      )}
    </main>
  );
}

/** Card de uma CLI JÁ INSTALADA: estado claro (instalada/logada/ativa) + login se preciso. */
function InstalledCliCard({
  cli,
  loggedIn,
  enabled,
  onLogin,
}: {
  cli: DetectedCli;
  loggedIn: boolean;
  enabled: boolean;
  onLogin: () => void;
}) {
  const t = useT();
  const caps = cli.capabilities;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-bg">
          <CliIcon kind={cli.kind} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{CLI_LABELS[cli.kind] ?? cli.kind}</p>
          <p className="font-mono text-xs text-fg-subtle">v{cli.version ?? '—'}</p>
        </div>
      </div>

      {/* estado — sempre claro pro usuário */}
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="ok" dot>
          {t('setup.instalada')}
        </Badge>
        {loggedIn ? (
          <Badge tone="ok" dot>
            {t('setup.logada')}
          </Badge>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Badge tone="warn" dot>
              {t('setup.loginNaoVerificado')}
            </Badge>
            <HintTip content={t('setup.loginNaoVerificadoTip')} />
          </span>
        )}
        {enabled && (
          <Badge tone="primary" dot>
            {t('setup.ativaNoProxy')}
          </Badge>
        )}
      </div>

      {/* capacidades */}
      <div className="flex flex-wrap gap-1.5">
        {caps.stream && <MiniTag>stream</MiniTag>}
        {caps.thinking && <MiniTag>thinking</MiniTag>}
        {caps.imagesOut && <MiniTag className="text-primary">{t('setup.geraImagem')}</MiniTag>}
        {caps.realTokens && <MiniTag className="text-ok">{t('setup.tokensReais')}</MiniTag>}
      </div>

      {/* ação de login só quando NÃO logada (login não é destrutivo, mas evita ruído) */}
      {!loggedIn && (
        <Button variant="secondary" size="sm" onClick={onLogin} className="mt-1 w-full">
          <LogIn size={14} /> {t('setup.fazerLogin')}
        </Button>
      )}
    </div>
  );
}

function MiniTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'rounded bg-surface-3 px-1.5 py-0.5 text-2xs font-medium text-fg-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-fg-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
        <code className="flex-1 truncate font-mono text-[13px] text-fg">{value}</code>
        <button
          className="shrink-0 text-fg-subtle transition-colors hover:text-primary"
          onClick={() => {
            void navigator.clipboard.writeText(value);
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

function Stepper({ step }: { step: Step }) {
  const t = useT();
  const items = [
    { n: 1 as Step, label: t('setup.stepDetectar'), icon: Cpu },
    { n: 2 as Step, label: t('setup.stepSelecionar'), icon: ListChecks },
    { n: 3 as Step, label: t('setup.stepGerarKey'), icon: KeyRound },
  ];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {items.map((it, i) => {
        const Icon = it.icon;
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary/50 bg-primary/10 text-fg'
                  : done
                    ? 'border-ok/30 text-ok'
                    : 'border-border text-fg-subtle',
              )}
            >
              {done ? <Check size={14} /> : <Icon size={14} />}
              {it.label}
            </div>
            {i < items.length - 1 && <span className="h-px w-5 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
