import { useEffect, useState } from 'react';
import { Layers, Plus, Trash2, Server, Check, KeyRound, GripVertical, ArrowDown } from 'lucide-react';
import { api, type ComboView, type HttpProviderView } from '../lib/api.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Select } from '../components/ui/select.js';
import { Modal } from '../components/ui/modal.js';
import { PageHeader, EmptyState } from '../components/ui/page-header.js';
import { HintTip } from '../components/ui/tooltip.js';
import { CliIcon, CLI_LABELS } from '../components/cli-card.js';

const HTTP_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', hint: 'Espelha a CLI Claude via API key — usado em container/VPS ou como fallback.' },
  { id: 'openai', label: 'OpenAI (Codex/GPT)', hint: 'Espelha a CLI Codex via API key.' },
  { id: 'gemini', label: 'Google Gemini', hint: 'Espelha a CLI Gemini via API key.' },
];

interface DraftItem {
  source: 'cli' | 'http';
  cliKind?: string;
  provider?: string;
  model: string;
}

export function CombosPage() {
  const [combos, setCombos] = useState<ComboView[]>([]);
  const [providers, setProviders] = useState<HttpProviderView[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [showCombo, setShowCombo] = useState(false);
  const [keyModal, setKeyModal] = useState<string | null>(null);

  async function load() {
    const [{ combos }, { providers }, { available }] = await Promise.all([
      api.listCombos(),
      api.listHttpProviders(),
      api.capabilities(false),
    ]);
    setCombos(combos);
    setProviders(providers);
    setAvailable(available);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Fontes & Combos"
        subtitle="Configure fontes HTTP (para rodar em servidor/Docker ou como fallback) e monte combos com fallback automático entre LLMs."
        action={
          <Button onClick={() => setShowCombo(true)}>
            <Plus size={16} /> Novo combo
          </Button>
        }
      />

      {/* ── Fontes HTTP ── */}
      <section className="mb-8">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          <Server size={13} /> Fontes HTTP (deploy em servidor / fallback)
          <HintTip content="Onde não há CLI instalada (container/VPS/Cloudflare), o proxy usa estas API keys. A key é cifrada e nunca exibida." />
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {HTTP_PROVIDERS.map((p) => {
            const cfg = providers.find((x) => x.provider === p.id);
            return (
              <div key={p.id} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                  {p.label}
                  <HintTip content={p.hint} />
                </div>
                {cfg?.keySet ? (
                  <div className="mb-2.5 flex items-center gap-1.5 text-xs text-ok">
                    <Check size={13} /> Key configurada
                  </div>
                ) : (
                  <div className="mb-2.5 text-xs text-fg-subtle">Sem key</div>
                )}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setKeyModal(p.id)}>
                    <KeyRound size={13} /> {cfg?.keySet ? 'Trocar' : 'Configurar'}
                  </Button>
                  {cfg?.keySet && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.deleteHttpProvider(p.id);
                        void load();
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Combos ── */}
      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          <Layers size={13} /> Combos (fallback multi-tier)
          <HintTip content="Uma lista ordenada de LLMs. Se a 1ª falhar (quota/erro), cai para a próxima — sem parar. Use model: combo:slug." />
        </h3>
        {combos.length === 0 ? (
          <EmptyState icon={<Layers size={22} />} title="Nenhum combo ainda">
            Crie um combo para ter fallback automático: subscription → alternativa → emergência.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {combos.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted">combo:{c.slug}</code>
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {c.items.map((it, i) => (
                        <div key={it.id} className="flex items-center gap-2 text-sm text-fg-muted">
                          <span className="w-5 text-right text-xs text-fg-subtle">{i + 1}.</span>
                          {it.source === 'cli' && it.cliKind ? (
                            <>
                              <CliIcon kind={it.cliKind} size={14} />
                              {CLI_LABELS[it.cliKind] ?? it.cliKind}
                            </>
                          ) : (
                            <>
                              <Server size={14} /> {it.provider} (HTTP)
                            </>
                          )}
                          {it.model && <span className="text-xs text-fg-subtle">· {it.model}</span>}
                          {i < c.items.length - 1 && <ArrowDown size={11} className="text-fg-subtle" />}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api.deleteCombo(c.id);
                      void load();
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {keyModal && (
        <HttpKeyModal
          provider={keyModal}
          label={HTTP_PROVIDERS.find((p) => p.id === keyModal)?.label ?? keyModal}
          onClose={() => setKeyModal(null)}
          onSaved={() => {
            setKeyModal(null);
            void load();
          }}
        />
      )}
      {showCombo && (
        <ComboModal
          available={available}
          providers={providers.filter((p) => p.keySet).map((p) => p.provider)}
          onClose={() => setShowCombo(false)}
          onSaved={() => {
            setShowCombo(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function HttpKeyModal({
  provider,
  label,
  onClose,
  onSaved,
}: {
  provider: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={`Configurar ${label}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          A API key é cifrada (AES-256-GCM) e nunca mais exibida. Usada em servidor sem CLI ou como fallback nos combos.
        </p>
        <label className="text-xs font-medium text-fg-muted">API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-… / AI…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-primary/50 focus:outline-none"
        />
        <label className="text-xs font-medium text-fg-muted">Base URL (opcional)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="deixe vazio para o endpoint oficial"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-primary/50 focus:outline-none"
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={saving}
            disabled={apiKey.length < 8}
            onClick={async () => {
              setSaving(true);
              try {
                await api.upsertHttpProvider({ provider, apiKey, baseUrl: baseUrl || null });
                onSaved();
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ComboModal({
  available,
  providers,
  onClose,
  onSaved,
}: {
  available: string[];
  providers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ source: 'cli', cliKind: available[0], model: '' }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sourceOptions = [
    ...available.map((c) => ({ value: `cli:${c}`, label: CLI_LABELS[c] ?? c })),
    ...providers.map((p) => ({ value: `http:${p}`, label: `${p} (HTTP)` })),
  ];

  function setItem(i: number, patch: Partial<DraftItem>) {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  return (
    <Modal title="Novo combo" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-fg-muted">Nome</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
              }}
              placeholder="Meu stack"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-fg-muted">Slug (usado como combo:slug)</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="meu-stack"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-primary/50 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <GripVertical size={13} /> Ordem de fallback (1º tenta primeiro)
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-4 text-right text-xs text-fg-subtle">{i + 1}.</span>
                <Select
                  className="flex-1"
                  value={it.source === 'cli' ? `cli:${it.cliKind}` : `http:${it.provider}`}
                  onChange={(v) => {
                    const [src, id] = v.split(':');
                    setItem(i, src === 'cli' ? { source: 'cli', cliKind: id, provider: undefined } : { source: 'http', provider: id, cliKind: undefined });
                  }}
                  options={sourceOptions}
                />
                <input
                  value={it.model}
                  onChange={(e) => setItem(i, { model: e.target.value })}
                  placeholder="modelo"
                  className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-fg focus:border-primary/50 focus:outline-none"
                />
                {items.length > 1 && (
                  <Button size="icon-sm" variant="ghost" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            onClick={() => setItems((a) => [...a, { source: 'cli', cliKind: available[0], model: '' }])}
          >
            <Plus size={13} /> Adicionar LLM
          </Button>
        </div>

        {err && <div className="rounded-md border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">{err}</div>}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={saving}
            disabled={!name || !slug}
            onClick={async () => {
              setSaving(true);
              setErr(null);
              try {
                await api.createCombo({
                  slug,
                  name,
                  items: items.map((it) => ({
                    source: it.source,
                    cliKind: it.source === 'cli' ? it.cliKind : undefined,
                    provider: it.source === 'http' ? it.provider : undefined,
                    model: it.model || null,
                  })),
                });
                onSaved();
              } catch (e) {
                setErr(String((e as Error).message ?? 'Falha ao criar.'));
              } finally {
                setSaving(false);
              }
            }}
          >
            Criar combo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
