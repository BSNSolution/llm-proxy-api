import { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { DetectedCli } from '@llm-proxy/shared-types';
import { api, type CliConfigView } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Select, toOptions } from '../components/ui/select.js';
import { Switch, Checkbox } from '../components/ui/toggle.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { HintTip } from '../components/ui/tooltip.js';
import { CliIcon, CLI_LABELS } from '../components/cli-card.js';
import { useT } from '../lib/i18n/index.js';
import { cn } from '../lib/cn.js';

export function ConfigPage() {
  const t = useT();
  const [clis, setClis] = useState<DetectedCli[]>([]);
  const [configs, setConfigs] = useState<Record<string, CliConfigView>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  async function load() {
    const [{ detected }, { configs }] = await Promise.all([api.detectCached(), api.listConfig()]);
    setClis(detected);
    const map: Record<string, CliConfigView> = {};
    for (const c of configs) map[c.kind] = c;
    setConfigs(map);
  }
  useEffect(() => {
    void load();
  }, []);

  async function redetect() {
    setDetecting(true);
    try {
      const { detected } = await api.detect();
      setClis(detected);
    } finally {
      setDetecting(false);
    }
  }

  async function save(kind: string, patch: Partial<CliConfigView>) {
    const cfg = configs[kind];
    const cli = clis.find((c) => c.kind === kind);
    const { config } = await api.upsertConfig({
      kind,
      enabled: patch.enabled ?? cfg?.enabled ?? false,
      defaultModel: patch.defaultModel ?? cfg?.defaultModel ?? cli?.defaultModel ?? null,
      allowedModels: patch.allowedModels ?? cfg?.allowedModels ?? cli?.models ?? [],
      thinkingDefault: patch.thinkingDefault ?? cfg?.thinkingDefault ?? false,
    });
    setConfigs((c) => ({ ...c, [kind]: config }));
    setSaved(kind);
    setTimeout(() => setSaved(null), 1600);
  }

  const present = clis.filter((c) => c.present);
  const absent = clis.filter((c) => !c.present);
  const presentPg = usePagination(present, 8);
  const absentPg = usePagination(absent, 9);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('config.eyebrow')}
        title={t('config.titulo')}
        subtitle={t('config.subtitulo')}
        action={
          <Button variant="secondary" size="sm" onClick={redetect} loading={detecting}>
            {!detecting && <RefreshCw size={15} />}
            {t('config.detectar')}
          </Button>
        }
      />

      {clis.length === 0 ? (
        <Card className="p-5">
          <EmptyState title={t('config.vazio.titulo')}>{t('config.vazio.desc')}</EmptyState>
        </Card>
      ) : (
        <>
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
              {t('config.instaladas')} · <span className="font-mono text-fg">{present.length}</span>
              <HintTip content={t('config.instaladas.hint')} />
            </h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {presentPg.pageItems.map((c) => (
                <ConfigCard
                  key={c.kind}
                  cli={c}
                  config={configs[c.kind]}
                  saved={saved === c.kind}
                  onToggle={() => save(c.kind, { enabled: !(configs[c.kind]?.enabled ?? false) })}
                  onModel={(m) => save(c.kind, { defaultModel: m })}
                  onThinking={(v) => save(c.kind, { thinkingDefault: v })}
                />
              ))}
            </div>
            {presentPg.totalPages > 1 && <Pagination {...presentPg} label="CLIs" />}
          </section>

          {absent.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                {t('config.naoInstaladas')} · <span className="font-mono text-fg">{absent.length}</span>
                <HintTip content={t('config.naoInstaladas.hint')} />
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {absentPg.pageItems.map((c) => (
                  <div
                    key={c.kind}
                    className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3 opacity-60"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-3 text-fg-subtle">
                      <CliIcon kind={c.kind} size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{CLI_LABELS[c.kind] ?? c.kind}</p>
                      <p className="text-xs text-fg-subtle">{t('config.naoInstalada')}</p>
                    </div>
                  </div>
                ))}
              </div>
              {absentPg.totalPages > 1 && <Pagination {...absentPg} label="CLIs" />}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function ConfigCard({
  cli,
  config,
  saved,
  onToggle,
  onModel,
  onThinking,
}: {
  cli: DetectedCli;
  config?: CliConfigView;
  saved: boolean;
  onToggle: () => void;
  onModel: (m: string) => void;
  onThinking: (v: boolean) => void;
}) {
  const t = useT();
  const enabled = config?.enabled ?? false;
  const model = config?.defaultModel ?? cli.defaultModel ?? '';

  return (
    <Card className={cn('p-4 transition-colors', enabled && 'border-primary/40')}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border',
            enabled ? 'bg-bg text-fg' : 'bg-surface-3 text-fg-subtle',
          )}
        >
          <CliIcon kind={cli.kind} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{CLI_LABELS[cli.kind] ?? cli.kind}</p>
          <p className="font-mono text-xs text-fg-subtle">v{cli.version ?? '—'}</p>
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
            {t('config.modeloPadrao')}
            <HintTip content={t('config.modeloPadrao.hint', { count: cli.models.length })} />
          </p>
          <Select
            size="sm"
            value={model}
            options={toOptions(cli.models)}
            onChange={onModel}
            disabled={!enabled}
          />
        </div>

        {cli.capabilities.thinking && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              checked={config?.thinkingDefault ?? false}
              onChange={onThinking}
              disabled={!enabled}
              label={t('config.thinking')}
            />
            <HintTip content={t('config.thinking.hint')} />
          </div>
        )}

        {saved && (
          <p className="flex items-center gap-1 text-xs text-ok">
            <Check size={12} /> {t('config.salvo')}
          </p>
        )}
      </div>
    </Card>
  );
}
