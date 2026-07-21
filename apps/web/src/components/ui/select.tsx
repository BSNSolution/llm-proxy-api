import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** desabilita a opção (não selecionável); `hint` explica o motivo */
  disabled?: boolean;
  hint?: string;
}

/**
 * Select customizado (não o nativo): dropdown estilizado, navegável por teclado,
 * fecha ao clicar fora. O menu é renderizado num PORTAL (document.body) com
 * posição fixa — evita ficar atrás de headers/cards que criam stacking context.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  disabled,
  className,
  size = 'md',
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const updateRect = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    if (open) updateRect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      updateRect();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm';

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded border border-border bg-surface-2 px-3 text-left transition-all duration-150 ease-smooth outline-none hover:border-border-strong focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50',
          h,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon}
          <span className={cn('truncate', !current && 'text-fg-subtle')}>
            {current?.label ?? placeholder}
          </span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-fg-subtle" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            className="animate-fade-in-up fixed z-[100] max-h-64 overflow-auto rounded-lg border border-border-strong bg-surface-2 p-1 shadow-lg"
            style={{
              top: rect.bottom + 6,
              left: rect.left,
              width: rect.width,
            }}
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  title={o.disabled ? o.hint : undefined}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-sm transition-colors',
                    o.disabled
                      ? 'cursor-not-allowed text-fg-subtle opacity-50'
                      : active
                        ? 'bg-primary/12 text-fg'
                        : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                    {o.disabled && o.hint && (
                      <span className="text-2xs text-fg-subtle">· {o.hint}</span>
                    )}
                  </span>
                  {active && <Check size={14} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Helper: monta options a partir de uma lista de strings. */
export function toOptions(values: string[]): SelectOption[] {
  return values.map((v) => ({ value: v, label: v }));
}
