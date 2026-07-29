import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { api } from '../lib/api.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { PageHeader, EmptyState, Skeleton } from '../components/ui/page-header.js';
import { Pagination, usePagination } from '../components/ui/pagination.js';
import { HintTip } from '../components/ui/tooltip.js';
import { useT } from '../lib/i18n/index.js';

type Usage = Awaited<ReturnType<typeof api.usage>>;

export function UsagePage() {
  const t = useT();
  const [usage, setUsage] = useState<Usage | null>(null);
  const pg = usePagination(usage?.recent ?? [], 10);

  useEffect(() => {
    api.usage().then(setUsage).catch(() => {});
  }, []);

  if (!usage) {
    return (
      <main className="flex flex-col gap-6">
        <PageHeader eyebrow={t('usage.eyebrow')} title={t('usage.title')} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-52" />
      </main>
    );
  }

  const maxDay = Math.max(1, ...usage.byDay.map((d) => d.requests));
  const models = Object.entries(usage.byModel).sort((a, b) => b[1].tokens - a[1].tokens);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('usage.eyebrow')}
        title={t('usage.title')}
        subtitle={t('usage.subtitle')}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('usage.kpiRequests')} value={usage.totalRequests.toLocaleString('pt-BR')} />
        <Kpi label={t('usage.kpiTokens')} value={usage.totalTokens.toLocaleString('pt-BR')} />
        <Kpi label={t('usage.kpiLatency')} value={`${usage.avgLatencyMs} ms`} />
        <Kpi label={t('usage.kpiErrors')} value={usage.errors} tone={usage.errors > 0 ? 'err' : undefined} />
      </div>

      {/* gráfico por dia */}
      <Card className="p-5">
        <h3 className="mb-5 text-sm font-semibold text-fg-muted">{t('usage.requestsPerDay')}</h3>
        <div className="flex h-44 items-stretch gap-2">
          {usage.byDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-full w-full items-end">
                <div
                  className="group w-full rounded-t bg-primary/60 transition-all duration-200 hover:bg-primary"
                  style={{
                    height: `${Math.max(d.requests > 0 ? 6 : 0, (d.requests / maxDay) * 100)}%`,
                  }}
                  title={t('usage.barTooltip', { requests: d.requests, tokens: d.tokens })}
                />
              </div>
              <span className="text-2xs text-fg-subtle">{d.day.slice(5)}</span>
              <span className="font-mono text-xs font-medium">{d.requests}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* por modelo */}
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-fg-muted">{t('usage.byModel')}</h3>
          {models.length === 0 ? (
            <EmptyState>{t('usage.noUsageYet')}</EmptyState>
          ) : (
            <div className="flex flex-col gap-2.5">
              {models.map(([model, v]) => (
                <div key={model} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{model}</span>
                  <span className="font-mono text-xs text-fg-muted">
                    {t('usage.modelRow', { requests: v.requests, tokens: v.tokens.toLocaleString('pt-BR') })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* recentes */}
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
            {t('usage.recentRequests')}
            <HintTip content={t('usage.recentHint')} />
          </h3>
          {usage.recent.length === 0 ? (
            <EmptyState icon={<Activity size={26} />}>{t('usage.noRequests')}</EmptyState>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.7fr_0.5fr] border-b border-border bg-surface-3/50 px-3 py-2 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                  <span>{t('usage.colWhen')}</span>
                  <span>{t('usage.colKey')}</span>
                  <span>{t('usage.colModel')}</span>
                  <span>{t('usage.colTokens')}</span>
                  <span>{t('usage.colStatus')}</span>
                </div>
                {pg.pageItems.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1.1fr_1fr_0.8fr_0.7fr_0.5fr] items-center border-b border-border px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2/50"
                  >
                    <span className="font-mono text-xs text-fg-muted">
                      {new Date(r.ts).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="truncate">{r.keyName}</span>
                    <span className="font-mono text-xs text-fg-muted">{r.model}</span>
                    <span className="font-mono text-xs text-fg-muted">
                      {r.tokens}
                      {r.estimated && <span className="text-2xs">~</span>}
                    </span>
                    <span>
                      <Badge tone={r.status >= 400 ? 'err' : 'ok'}>{r.status}</Badge>
                    </span>
                  </div>
                ))}
              </div>
              <Pagination {...pg} label={t('usage.paginationLabel')} />
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'err';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-4">
      <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-[24px] font-semibold tracking-tight',
          tone === 'err' ? 'text-err' : 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  );
}
