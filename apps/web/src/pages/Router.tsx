import { useEffect, useMemo, useState } from 'react';
import * as Icons from 'lucide-react';
import { Workflow, Sparkles, Check, Wand2, AlertCircle } from 'lucide-react';
import { api, type CapabilityMatrix, type RouterView, type ComboView, type FunctionMeta } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Select } from '../components/ui/select.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { HintTip } from '../components/ui/tooltip.js';
import { CliIcon, CLI_LABELS } from '../components/cli-card.js';
import { cn } from '../lib/cn.js';

// Destino de uma regra: uma CLI específica, um combo, ou "não definido".
interface RuleDraft {
  target: string; // "" | "cli:<kind>" | "combo:<id>"
  model: string;
}

const GROUP_LABELS: Record<string, string> = {
  gerar: 'Gerar',
  analisar: 'Analisar',
  especial: 'Especiais',
};

/** Ícone lucide dinâmico pelo nome vindo da matriz (fallback: Sparkles). */
function FnIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Cmp = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Sparkles;
  return <Cmp size={size} />;
}

export function RouterPage() {
  const [matrix, setMatrix] = useState<CapabilityMatrix | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [combos, setCombos] = useState<ComboView[]>([]);
  const [router, setRouter] = useState<RouterView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probe, setProbe] = useState('');
  const [probeResult, setProbeResult] = useState<string | null>(null);

  async function load() {
    const [{ matrix, available }, { combos }, { routers }] = await Promise.all([
      api.capabilities(true),
      api.listCombos(),
      api.listRouters(),
    ]);
    setMatrix(matrix);
    setAvailable(available);
    setCombos(combos);
    const def = routers.find((r) => r.isDefault) ?? routers[0] ?? null;
    setRouter(def);
    // hidrata drafts a partir das regras existentes
    const d: Record<string, RuleDraft> = {};
    for (const rule of def?.rules ?? []) {
      d[rule.capability] = {
        target: rule.comboId ? `combo:${rule.comboId}` : rule.cliKind ? `cli:${rule.cliKind}` : '',
        model: rule.model ?? '',
      };
    }
    setDrafts(d);
  }
  useEffect(() => {
    void load();
  }, []);

  // Funções agrupadas.
  const grouped = useMemo(() => {
    const g: Record<string, FunctionMeta[]> = { gerar: [], analisar: [], especial: [] };
    for (const f of matrix?.functions ?? []) g[f.group]?.push(f);
    return g;
  }, [matrix]);

  /** CLIs (disponíveis) que suportam a função — a essência da tela inteligente. */
  function clisFor(capability: string): string[] {
    if (!matrix) return [];
    return available.filter((cli) => (matrix.byCli[cli] ?? []).includes(capability));
  }

  function setDraft(cap: string, patch: Partial<RuleDraft>) {
    setDrafts((d) => ({ ...d, [cap]: { target: '', model: '', ...d[cap], ...patch } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const rules = Object.entries(drafts)
        .filter(([, d]) => d.target)
        .map(([capability, d]) => {
          if (d.target.startsWith('combo:')) {
            return { capability, comboId: d.target.slice(6), model: d.model || null };
          }
          const cliKind = d.target.slice(4);
          return { capability, source: 'cli' as const, cliKind, model: d.model || null };
        });

      if (router) {
        const { router: updated } = await api.updateRouter(router.id, { rules, isDefault: true });
        setRouter(updated);
      } else {
        const { router: created } = await api.createRouter({
          slug: 'principal',
          name: 'Workflow Principal',
          isDefault: true,
          rules,
        });
        setRouter(created);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function runProbe() {
    if (!probe.trim()) return;
    const { capability } = await api.detectCapability(probe);
    setProbeResult(capability);
  }

  const definedCount = Object.values(drafts).filter((d) => d.target).length;

  if (!matrix) return <div className="p-6 text-sm text-fg-muted">Carregando…</div>;

  const noClis = available.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Router / Workflow"
        subtitle="Defina qual LLM usa para cada função. Você chama o proxy com uma única key (model: router) e por baixo ele despacha para a especialista certa."
        action={
          <Button onClick={() => void save()} loading={saving} disabled={noClis}>
            {saved ? <Check size={16} /> : <Workflow size={16} />}
            {saved ? 'Salvo' : 'Salvar workflow'}
          </Button>
        }
      />

      {noClis ? (
        <EmptyState icon={<AlertCircle size={22} />} title="Nenhuma LLM disponível ainda">
          Ative ao menos uma CLI em Configurações (ou configure um provider HTTP) para montar o workflow.
        </EmptyState>
      ) : (
        <>
          {/* Como usar */}
          <Card className="mb-5 border-primary/25 bg-primary/[0.04]">
            <div className="flex items-start gap-3">
              <Wand2 size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm text-fg-muted">
                <p className="mb-1 font-medium text-fg">Como funciona</p>
                Cada bloco abaixo só oferece as LLMs que <strong>realmente sabem</strong> fazer aquela função. Use{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">model: "router"</code> e o proxy detecta a
                função do pedido automaticamente — ou force com{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">model: "cap:analisar-imagem"</code>.
                <span className="ml-1 text-fg-subtle">
                  {definedCount} de {matrix.functions.length} funções configuradas.
                </span>
              </div>
            </div>
          </Card>

          {/* Grupos de funções */}
          {(['gerar', 'analisar', 'especial'] as const).map((group) => (
            <section key={group} className="mb-6">
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {GROUP_LABELS[group]}
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {grouped[group]?.map((fn) => {
                  const clis = clisFor(fn.slug);
                  const draft = drafts[fn.slug] ?? { target: '', model: '' };
                  const unsupported = clis.length === 0;
                  const comboOpts = combos
                    .filter((c) => c.enabled)
                    .map((c) => ({ value: `combo:${c.id}`, label: `⛓ Combo: ${c.name}` }));
                  const cliOpts = clis.map((cli) => ({ value: `cli:${cli}`, label: CLI_LABELS[cli] ?? cli }));
                  const options = [{ value: '', label: unsupported ? 'Nenhuma LLM suporta' : '— não definir —' }, ...cliOpts, ...comboOpts];

                  // modelos disponíveis da CLI escolhida (allowlist da matriz não traz models;
                  // deixamos o campo livre — a CLI valida). Mostra só se escolheu uma CLI.
                  const chosenCli = draft.target.startsWith('cli:') ? draft.target.slice(4) : null;

                  return (
                    <div
                      key={fn.slug}
                      className={cn(
                        'rounded-xl border border-border bg-surface-2/40 p-3.5 transition-colors',
                        draft.target && 'border-primary/30 bg-primary/[0.03]',
                        unsupported && 'opacity-55',
                      )}
                    >
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-muted">
                          <FnIcon name={fn.icon} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            {fn.label}
                            <HintTip content={fn.hint} />
                          </div>
                          {chosenCli && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                              <CliIcon kind={chosenCli} size={12} /> {CLI_LABELS[chosenCli] ?? chosenCli}
                            </div>
                          )}
                        </div>
                      </div>

                      <Select
                        value={draft.target}
                        onChange={(v) => setDraft(fn.slug, { target: v })}
                        options={options}
                        disabled={unsupported}
                      />
                      {chosenCli && (
                        <input
                          value={draft.model}
                          onChange={(e) => setDraft(fn.slug, { model: e.target.value })}
                          placeholder="modelo (opcional, ex.: opus / sonnet / default)"
                          className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary/50 focus:outline-none"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Teste o detector */}
          <Card className="mt-6">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles size={15} className="text-primary" />
              Testar detecção
              <HintTip content="Digite um pedido de exemplo e veja qual função o proxy detectaria automaticamente." />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={probe}
                onChange={(e) => setProbe(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runProbe()}
                placeholder='Ex.: "gere uma imagem de um gato" ou "analise este código"'
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-primary/50 focus:outline-none"
              />
              <Button variant="secondary" onClick={() => void runProbe()}>
                Detectar
              </Button>
            </div>
            {probeResult !== null && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-fg-muted">Função detectada:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 font-medium text-primary">
                  <FnIcon name={matrix.functions.find((f) => f.slug === probeResult)?.icon ?? 'Sparkles'} size={13} />
                  {matrix.functions.find((f) => f.slug === probeResult)?.label ?? probeResult}
                </span>
                {drafts[probeResult]?.target ? (
                  <span className="text-xs text-fg-subtle">→ roteado nesta config</span>
                ) : (
                  <span className="text-xs text-warn">→ sem regra (cai no padrão da key)</span>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
