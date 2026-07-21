import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/** Cabeçalho de página — eyebrow discreto + título + subtítulo + ação. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <span className="text-2xs font-medium uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-fg">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Estado vazio — ícone opcional + mensagem, borda tracejada. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      {icon && <div className="text-fg-subtle">{icon}</div>}
      {title && <p className="text-sm font-medium text-fg">{title}</p>}
      {children && <p className="max-w-sm text-sm text-fg-muted">{children}</p>}
    </div>
  );
}

/** Skeleton de carregamento (shimmer). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded bg-surface-3',
        'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/[0.04] after:to-transparent after:content-[""] after:[animation:shimmer_1.5s_infinite]',
        className,
      )}
    />
  );
}
