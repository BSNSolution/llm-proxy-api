import { Icon } from '@iconify/react';
import { Check, Plus } from 'lucide-react';
import type { DetectedCli } from '@llm-proxy/shared-types';
import { cn } from '../lib/cn.js';
import { Badge } from './ui/badge.js';

export const CLI_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  cursor: 'Cursor CLI',
  opencode: 'OpenCode',
  antigravity: 'Antigravity CLI',
  copilot: 'GitHub Copilot CLI',
  aider: 'Aider',
  qwen: 'Qwen Code',
  amp: 'Amp',
  goose: 'Goose',
  grok: 'Grok CLI',
  continue: 'Continue CLI',
};

/** Ícone Iconify por CLI (mesma fonte do registry do cli-engine). */
export const CLI_ICONS: Record<string, string> = {
  claude: 'ri:anthropic-fill',
  codex: 'ri:openai-fill',
  gemini: 'ri:gemini-fill',
  cursor: 'simple-icons:cursor',
  opencode: 'simple-icons:opencode',
  antigravity: 'bxl:google-antigravity',
  copilot: 'simple-icons:githubcopilot',
  aider: 'ri:robot-2-fill',
  qwen: 'simple-icons:qwen',
  amp: 'simple-icons:sourcegraph',
  goose: 'ri:terminal-box-fill',
  grok: 'ri:twitter-x-fill',
  continue: 'ri:code-box-fill',
};

const CLI_TINT: Record<string, string> = {
  claude: 'text-[#D97757]',
  codex: 'text-fg',
  gemini: 'text-[#4285F4]',
  cursor: 'text-fg',
  opencode: 'text-[#F59E0B]',
  antigravity: 'text-[#34A853]',
  copilot: 'text-fg',
  aider: 'text-[#14B8A6]',
  qwen: 'text-[#615CED]',
  amp: 'text-[#FF5543]',
  goose: 'text-[#F59E0B]',
  grok: 'text-fg',
  continue: 'text-[#8B5CF6]',
};

export function CliIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  return <Icon icon={CLI_ICONS[kind] ?? 'lucide:terminal'} width={size} height={size} />;
}

/**
 * Card de CLI clicável: o card inteiro liga/desliga a CLI.
 * Ícone da marca, nome, versão, capacidades, estado ativo/desativado.
 */
export function CliCard({
  cli,
  active,
  onToggle,
  disabled,
}: {
  cli: DetectedCli;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const unavailable = disabled ?? !cli.present;

  return (
    <button
      type="button"
      onClick={unavailable ? undefined : onToggle}
      disabled={unavailable}
      aria-pressed={active}
      title={
        unavailable
          ? `${CLI_LABELS[cli.kind] ?? cli.kind} não está instalada`
          : active
            ? 'Ativa — clique para desativar'
            : 'Clique para expor no Proxy API'
      }
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-all duration-150 ease-smooth',
        unavailable && 'cursor-not-allowed border-border bg-surface/40 opacity-45',
        !unavailable && active
          ? 'border-primary/60 bg-primary/[0.06] shadow-glow'
          : !unavailable && 'border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3',
      )}
    >
      {!unavailable && (
        <span
          className={cn(
            'absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full transition-all duration-150',
            active
              ? 'bg-primary text-primary-fg'
              : 'border border-border-strong text-fg-subtle group-hover:border-fg-subtle',
          )}
        >
          {active ? <Check size={12} strokeWidth={3} /> : <Plus size={11} />}
        </span>
      )}

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border transition-colors',
            active ? 'bg-bg' : 'bg-surface-3',
            active ? CLI_TINT[cli.kind] ?? 'text-fg' : 'text-fg-subtle',
          )}
        >
          <CliIcon kind={cli.kind} size={20} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{CLI_LABELS[cli.kind] ?? cli.kind}</p>
          <p className="font-mono text-xs text-fg-subtle">
            {cli.present ? `v${cli.version ?? '—'}` : 'não instalada'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {cli.present ? (
          <>
            {cli.capabilities.stream && <Cap>stream</Cap>}
            {cli.capabilities.thinking && <Cap>thinking</Cap>}
            {cli.capabilities.imagesOut && <Cap tone="primary">gera imagem</Cap>}
            {cli.capabilities.realTokens && <Cap tone="ok">tokens reais</Cap>}
          </>
        ) : (
          <Badge tone="neutral">ausente</Badge>
        )}
      </div>
    </button>
  );
}

function Cap({ children, tone }: { children: React.ReactNode; tone?: 'ok' | 'primary' }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-2xs font-medium',
        tone === 'ok'
          ? 'bg-ok/10 text-ok'
          : tone === 'primary'
            ? 'bg-primary/12 text-primary'
            : 'bg-surface-3 text-fg-muted',
      )}
    >
      {children}
    </span>
  );
}
