import { cn } from '../../lib/cn.js';

/** Cartão de métrica (KPI): rótulo pequeno em caixa alta + valor grande monoespaçado. */
export function Kpi({
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
