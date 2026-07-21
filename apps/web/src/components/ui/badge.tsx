import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-3 text-fg-muted',
        ok: 'border-ok/25 bg-ok/10 text-ok',
        warn: 'border-warn/25 bg-warn/10 text-warn',
        err: 'border-err/25 bg-err/10 text-err',
        primary: 'border-primary/30 bg-primary/12 text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  children,
  tone,
  dot,
  className,
}: { children: ReactNode; dot?: boolean; className?: string } & VariantProps<
  typeof badgeVariants
>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
